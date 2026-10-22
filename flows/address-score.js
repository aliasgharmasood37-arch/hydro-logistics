// Address quality scoring — the one judgement, with no dependencies.
//
// This file is an ES module, the body of Flow X's Code node, AND a block injected into the AWB
// bot's Command Router so the booking gate scores an address exactly the way the call sheet
// does. It therefore imports NOTHING: everything it needs is defined below. Injectors strip
// only the trailing `export` line.
//
// WHY A SCORE AND NOT A RULE. The owner's `Bad Address` tag says "somebody looked at this and
// did not like it". It does not say how bad, and 45 tagged orders are not all the same problem:
// #1894 reads "Md. Ashraf, Ward no.33, Sadpura, Near Bari Masjid, Muzaffarpur" - a rider can
// find that - while #2000 reads "Madhubani" in the city Madhubani, which is a district, not an
// address. One of those is safe to ship and the other is Rs 250 plus freight waiting to happen.
// So the tag decides whether to LOOK and the score decides whether to SHIP.
//
// IT IS ALSO THE ONLY "FIXED" SIGNAL THERE IS. The `Bad Address` tag cannot be removed from an
// order: an app on the store (COD King) re-applies it in under ten seconds, measured on #2163
// with no address edit to provoke it. So nothing may infer "this is sorted out" from the tag
// being gone. An address is sorted out when it SCORES complete.

// ---------------------------------------------------------------------------
// Vocabulary. Indian addresses navigate by locality, landmark and post office far more than by
// house number, so a street keyword or a landmark counts for as much as a number does.
// ---------------------------------------------------------------------------
// Something a rider can follow to a street or a named place.
const PLACE_WORDS = ('road|rd|street|st|marg|lane|ln|gali|galli|cross|nagar|nager|colony|colon|sector|' +
  'block|ward|chowk|chauk|bazar|bazaar|market|merket|puram|pura|puri|vihar|enclave|society|soc|' +
  'apartment|appartment|apt|building|bldg|floor|flr|wing|tower|villa|house|hno|plot|flat|door|quarter|qtr|' +
  'po|ps|dist|district|tehsil|tahsil|taluka|taluk|mandal|village|vill|gram|panchayat|' +
  'pada|wada|wadi|basti|mohalla|muhalla|tola|toli|chak|para|palli|pally|patti|' +
  'bagh|baug|ganj|sarai|kothi|haveli|bhawan|bhavan|niwas|nivas|sadan|complex|plaza|arcade|chawl|' +
  'camp|cantt|extension|extn|phase|stage|layout|scheme|township|park|estate|circle|square|junction|' +
  'gate|stand|chowki|mandir|masjid|church|school|college|hospital|bank|office').split('|');
// A landmark is the single most useful line in a thin Indian address - it is what the rider rings
// about. "near Bari Masjid" is worth more than a house number nobody painted on the wall.
const LANDMARK_RE = /\b(near|nr|opposite|oppsite|opp|behind|beside|next\s+to|in\s+front|front\s+of|back\s*side|above|below|adjacent|beside)\b/i;
// A number that could be a house, plot, flat, ward or door number. The letter-prefixed form is
// not optional: "D1208", "B40", "A-12" are how half the flats in this data are written, and
// reading them as text instead of a door number marks a perfectly deliverable address unsafe.
const DOORNUM_RE = /\b(h\.?\s*no|ho\.?\s*no|house\s*no|plot\s*no|flat\s*no|door\s*no|d\.?\s*no|shop\s*no|qtr|quarter|ward\s*no|room\s*no|w\.?\s*no)\b|(^|[\s,])([a-z]{1,2}[-\s]?\d{1,4}[a-z]?|\d{1,4}\s*[-\/]\s*[a-z0-9]{1,4}|\d{1,4})\s*[-\/]?\s*[a-z]?([\s,]|$)/i;
// A named business, institution or works IS the delivery point in most of India - the rider
// asks for "AYM Syntex" or "Hotel Sree Aryaas", not for a house number nobody painted on a
// wall. Credited like a landmark, but only alongside a real name (see the >=2 token guard).
const ESTABLISHMENT = ('hotel|lodge|dhaba|restaurant|fastfood|cafe|bakery|medical|medicals|clinic|' +
  'hospital|pharmacy|works|industries|industry|factory|mill|syntex|textiles|showroom|garage|' +
  'workshop|service|agency|agencies|traders|trading|enterprises|enterprise|motors|automobiles|' +
  'auto|petrol|pump|filling|stores|store|emporium|mart|supermarket|hardware|electricals|' +
  'electronics|furniture|studio|salon|gym|compound|mission|ashram|trust|institute|academy|' +
  'university|press|printers|mobiles|telecom|cyber|xerox|tailors|sweets|dairy|poultry').split('|');
// Cells that carry no information at all. Seen verbatim in the live data: address1 "no",
// address1 "Shop" with address2 "Shop".
const JUNK = ('no|na|n/a|none|nil|null|nothing|-|--|.|..|...|same|same as above|address|adress|' +
  'home|house|shop|store|office|here|xx|xxx|test|abc|asdf|ok|yes|india|bharat|.').split('|');
// Words that say nothing on their own once the locality name is taken away.
const GENERIC = ('bazar|bazaar|merket|market|road|rd|street|st|lane|ln|town|city|village|vill|gram|' +
  'po|ps|dist|district|main|near|nr|opp|opposite|chowk|stand|bus|railway|station|' +
  'india|bharat|state|pin|pincode|at|and|the|of|no|number').split('|');

const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => norm(s).replace(/\s+/g, '');
const words = s => norm(s).split(' ').filter(Boolean);

// ---------------------------------------------------------------------------
// scoreAddress - the whole judgement, in one place, with its reasons.
//
// Returns { score, band, verdict, reasons[], missing[], informative }
//   band 'really-bad'  do not ship: there is nothing here to deliver to
//        'thin'        one call would fix it; shipping is a gamble
//        'ok'          a rider can find this
// The reasons are written for the sheet, not for a log - the worker reads them and makes the
// call, so they say what is missing rather than which rule fired.
// ---------------------------------------------------------------------------
function scoreAddress(a) {
  a = a || {};
  const a1 = String(a.address1 == null ? '' : a.address1).trim();
  const a2 = String(a.address2 == null ? '' : a.address2).trim();
  const city = String(a.city == null ? '' : a.city).trim();
  const zip = String(a.zip == null ? '' : a.zip).trim();
  const reasons = [], missing = [];
  let score = 0;

  // address2 that just repeats address1 is the commonest shape in this data ("Jhiriya" /
  // "Jhiriya", "Gol Pada" / "Gol pada", "Shop" / "Shop"). It must not count as a second line.
  const dupe2 = !!a2 && (squash(a2) === squash(a1) || (squash(a1).length > 3 && squash(a1).indexOf(squash(a2)) >= 0));
  const informative = dupe2 ? a1 : [a1, a2].filter(Boolean).join(', ');
  const iw = words(informative);
  const sq = squash(informative);

  // ---- disqualifiers ----
  if (!a1) { reasons.push('address line 1 is empty'); score -= 4; }
  else if (JUNK.indexOf(norm(a1)) >= 0) { reasons.push('address line 1 is "' + a1 + '" - not an address'); score -= 4; }

  // The locality name alone. "Madhubani" in city Madhubani; "Gangtok" in city Gangtok.
  const cityW = words(city);
  const leftover = iw.filter(w => cityW.indexOf(w) < 0 && GENERIC.indexOf(w) < 0 && !/^\d{6}$/.test(w));
  if (a1 && !leftover.length) {
    reasons.push('says nothing beyond the city name' + (city ? ' (' + city + ')' : ''));
    score -= 3;
  } else if (a1 && leftover.length === 1 && sq.length < 22) {
    reasons.push('one locality name and nothing else');
    score -= 1;
  }
  if (dupe2 && a2) { reasons.push('address line 2 repeats line 1'); score -= 1; }

  // ---- credits ----
  const hasDoor = DOORNUM_RE.test(informative);
  const hasPlace = iw.some(w => PLACE_WORDS.indexOf(w) >= 0);
  const hasLandmark = LANDMARK_RE.test(informative);
  // A named establishment only counts when there is a name attached to it: "Shop" is junk,
  // "Shidivinayk Medical" is a door a rider can stand at.
  const hasNamed = iw.some(w => ESTABLISHMENT.indexOf(w) >= 0) && leftover.length >= 2;
  const parts = informative.split(/[,;]+/).map(s => s.trim()).filter(Boolean).length;
  if (hasDoor) score += 2; else missing.push('house / plot no');
  if (hasPlace) score += 2; else missing.push('street / road / locality');
  if (hasLandmark || hasNamed) score += 2; else missing.push('landmark');
  if (parts >= 3) score += 1;
  if (sq.length >= 36) score += 1;
  if (sq.length >= 22) score += 1;
  else if (a1) { reasons.push('only ' + sq.length + ' characters of actual address'); }

  // Nothing to navigate by at all: no number, no named street, no landmark, no named place.
  if (!hasDoor && !hasPlace && !hasLandmark && !hasNamed) {
    reasons.push('no house number, no street and no landmark - nothing to navigate by');
    score -= 2;
  }
  if (!/^\d{6}$/.test(zip)) { reasons.push('pincode is not 6 digits'); missing.push('pincode'); score -= 2; }

  const band = score <= 0 ? 'really-bad' : score <= 2 ? 'thin' : 'ok';
  const verdict = band === 'really-bad' ? 'Really bad - do not ship'
                : band === 'thin' ? 'Thin - one call first'
                : 'Looks complete';
  // de-duplicate, keep order
  const seen = {}, rs = [];
  for (const r of reasons) { if (!seen[r]) { seen[r] = 1; rs.push(r); } }
  const seenM = {}, ms = [];
  for (const m of missing) { if (!seenM[m]) { seenM[m] = 1; ms.push(m); } }
  return { score, band, verdict, reasons: rs, missing: band === 'ok' ? [] : ms, informative };
}

// ---------------------------------------------------------------------------
// parseCorrection - turn what the worker typed into a MailingAddressInput, or refuse.
//
// The worker types one free-text cell after a phone call. They are not filling a form, so this
// does the least destructive thing possible: the typed text becomes the address lines verbatim
// and only the pincode is lifted out of it, because Delhivery and XpressBees take `pin` as its
// own field. City and state are KEPT from the existing order unless the pincode changed - the
// customer has not moved, they are spelling out where they already live.
// ---------------------------------------------------------------------------
function parseCorrection(typed, old, newPinCell) {
  const t = String(typed == null ? '' : typed).trim().replace(/\s+/g, ' ');
  old = old || {};
  if (!t) return { ok: false, why: 'nothing typed' };
  if (t.length < 12) return { ok: false, why: 'too short to be an address (' + t.length + ' chars)' };

  // pincode: the New PIN cell wins, then a 6-digit token in the text, then the order's own.
  const pinCell = String(newPinCell == null ? '' : newPinCell).replace(/\D/g, '');
  const inText = (t.match(/\b\d{6}\b/g) || []);
  const zip = /^\d{6}$/.test(pinCell) ? pinCell
            : inText.length ? inText[inText.length - 1]
            : String(old.zip || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(zip)) return { ok: false, why: 'no valid 6-digit pincode - put it in the New PIN column' };

  // Did they actually change anything? A re-typed copy of the same address fixes nothing and
  // must not clear the row.
  const oldSq = squash([old.address1, old.address2].filter(Boolean).join(' '));
  if (squash(t) === oldSq) return { ok: false, why: 'same as the address already on the order' };

  // Split only when it is long enough to need two lines, at the comma nearest the middle, so
  // neither line overflows. Both couriers cap these fields at 200 characters.
  let address1 = t, address2 = '';
  if (t.length > 100) {
    const mid = Math.floor(t.length / 2);
    let best = -1;
    for (let i = 0; i < t.length; i++) if (t[i] === ',' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    if (best > 20 && best < t.length - 10) { address1 = t.slice(0, best).trim(); address2 = t.slice(best + 1).trim(); }
  }
  if (address1.length > 200) { address2 = (address1.slice(200) + ' ' + address2).trim().slice(0, 200); address1 = address1.slice(0, 200).trim(); }
  if (address2.length > 200) address2 = address2.slice(0, 200).trim();

  const pinChanged = zip !== String(old.zip || '').replace(/\D/g, '');
  const addr = { address1, address2, city: old.city || '', province: old.province || '', zip,
                 country: 'India', countryCode: 'IN' };
  const sc = scoreAddress(addr);
  if (sc.band !== 'ok') return { ok: false, why: 'still not a complete address - ' + (sc.reasons[0] || sc.verdict), score: sc, addr, pinChanged };
  return { ok: true, addr, score: sc, pinChanged };
}
export { scoreAddress, parseCorrection, PLACE_WORDS, ESTABLISHMENT, LANDMARK_RE, DOORNUM_RE, JUNK, GENERIC, norm, squash, words };
