// Cancel one XpressBees shipment, end to end. DRY RUN unless --go.
//
//   node scripts/xb-cancel.mjs 143449611295456        dry run
//   node scripts/xb-cancel.mjs 2215 --go              by order id
//
// Procedure is XPRESSBEES-API.md A6, and all three steps matter — a cancel that stops after the
// courier leaves Shopify claiming the parcel shipped and the Ledger claiming it is live:
//   1. POST /shipments2/cancel {awb}  -> {"status":true,"message":"Shipment Cancelled"},
//      the freight goes back to the wallet. AFTER PICKUP THIS FAILS with `Unable to cancel` —
//      then it is a dashboard "Request RTO" decision for the owner, not something to force here.
//   2. Shopify fulfillmentCancel, so the order goes back to UNFULFILLED and can be rebooked.
//   3. Ledger column S (`terminal`) -> `cancelled`, plus the status columns, so the status flows
//      never treat a dead waybill as in-transit.
// It reads the cancel back from tracking before touching Shopify, and never reports a step it
// did not confirm.
//
// REBOOKING AFTERWARDS needs a NEW ref: `node scripts/xb-book.mjs <order> --ref <order>-R`.
// Bookings send `unique_order_number: "yes"`, and a cancelled order number most likely stays
// taken (XPRESSBEES-API.md A6 — unverified), so reusing the bare id risks a duplicate refusal.
import { xb, trackUrl } from './xb.mjs';
import { token, mk } from './lib.mjs';
import { gapi } from './gsheet.mjs';

const ARG = process.argv.slice(2);
const GO = ARG.includes('--go');
const target = ARG.find(a => !a.startsWith('--'));
if (!target) { console.log('Give an AWB or an order id:  node scripts/xb-cancel.mjs 2215 [--go]'); process.exit(1); }
const LEDGER = '1y_c5qxfqSHQ-3pqOn09c8vSbZeF7T-otz2T1QjwMaNY';
const isAwb = /^\d{12,}$/.test(target);
const g = mk(await token());

// ---- 1. find the order and the live fulfilment carrying this AWB --------------
const q = isAwb
  ? `{orders(first:50,sortKey:CREATED_AT,reverse:true,query:"created_at:>=${new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)}"){nodes{id name displayFulfillmentStatus fulfillments(first:10){id status trackingInfo{number company}}}}}`
  : `{orders(first:5,query:"name:${String(target).replace(/^#/, '')}"){nodes{id name displayFulfillmentStatus fulfillments(first:10){id status trackingInfo{number company}}}}}`;
const nodes = (await g(q)).orders.nodes;
const live = f => f.status !== 'CANCELLED';
let order = null, ful = null, AWB = isAwb ? target : null;
for (const o of nodes) {
  for (const f of (o.fulfillments || []).filter(live)) {
    for (const t of (f.trackingInfo || [])) {
      if (!/xpressbees/i.test(t.company || '')) continue;
      if (isAwb ? t.number === target : true) { order = o; ful = f; AWB = t.number; }
    }
  }
  if (order) break;
}
if (!AWB) { console.log(`No live XpressBees fulfilment found for ${target}.`); process.exit(1); }
if (!order) console.log(`WARNING: no Shopify fulfilment found for ${AWB} — will cancel on the courier only.`);

// ---- 2. what does the courier say now? ---------------------------------------
const t0 = await xb(`/shipments2/track/${AWB}`);
const st = t0.body?.data?.status || '?';
const scans = (t0.body?.data?.history || []).length;
console.log(`AWB ${AWB}${order ? '  order ' + order.name : ''}`);
console.log(`  courier status: ${st}  (${scans} scan(s))`);
console.log(`  shopify: ${order ? order.displayFulfillmentStatus + ' · fulfilment ' + ful.id.split('/').pop() : '-'}`);
if (/picked|transit|out for delivery|delivered/i.test(st)) {
  console.log(`\nSTOP — this parcel has moved (${st}). A cancel fails after pickup; this is a` +
              `\n  dashboard "Request RTO" decision for the owner (XPRESSBEES-API.md A6).`);
  process.exit(1);
}
if (!GO) { console.log('\nDRY RUN — nothing cancelled. Re-run with --go.'); process.exit(0); }

// ---- 3. cancel on the courier, then read it back -----------------------------
const c = await xb('/shipments2/cancel', { method: 'POST', body: { awb: AWB } });
console.log(`\ncancel: http ${c.http} ${JSON.stringify(c.body).slice(0, 160)}`);
if (c.body?.status !== true) { console.log('COURIER CANCEL FAILED — nothing else touched. Shopify and the Ledger are unchanged.'); process.exit(1); }
const t1 = await xb(`/shipments2/track/${AWB}`);
console.log(`read-back: status now "${t1.body?.data?.status || '?'}"  ${trackUrl(AWB)}`);

// ---- 4. Shopify ---------------------------------------------------------------
if (ful) {
  const r = await g(`mutation($id:ID!){fulfillmentCancel(id:$id){fulfillment{id status} userErrors{field message}}}`, { id: ful.id });
  const ue = r.fulfillmentCancel.userErrors || [];
  if (ue.length) console.log(`SHOPIFY CANCEL FAILED — cancel the fulfilment by hand: ${JSON.stringify(ue)}`);
  else {
    const v = (await g(`{orders(first:5,query:"name:${order.name.replace(/^#/, '')}"){nodes{name displayFulfillmentStatus}}}`)).orders.nodes.find(x => x.name === order.name);
    console.log(`shopify: fulfilment ${r.fulfillmentCancel.fulfillment?.status} · order now ${v?.displayFulfillmentStatus}`);
  }
}

// ---- 5. Ledger: terminal -> cancelled ----------------------------------------
try {
  const lv = await gapi('GET', `https://sheets.googleapis.com/v4/spreadsheets/${LEDGER}/values/${encodeURIComponent('Ledger!A1:X2000')}`);
  const rows = lv.values || [];
  const i = rows.findIndex((r, n) => n > 0 && String(r[2] || '').trim() === AWB);
  if (i < 0) console.log('ledger: no row for this AWB — nothing updated');
  else {
    const now = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 23);
    await gapi('POST', `https://sheets.googleapis.com/v4/spreadsheets/${LEDGER}/values:batchUpdate`,
      { valueInputOption: 'RAW', data: [
        { range: `Ledger!K${i + 1}:N${i + 1}`, values: [['XB cancelled', '', 'XB-CAN', now]] },
        { range: `Ledger!S${i + 1}`, values: [['cancelled']] } ] });
    console.log(`ledger: row ${i + 1} terminal=cancelled`);
  }
} catch (e) { console.log('LEDGER UPDATE FAILED — set terminal=cancelled by hand: ' + e.message.slice(0, 120)); }

console.log(`\n${order ? order.name : AWB} cancelled. To rebook:  node scripts/xb-book.mjs ${order ? order.name.replace(/^#/, '') : '<order>'} --ref ${order ? order.name.replace(/^#/, '') : '<order>'}-R  (dry run, then --go)`);
