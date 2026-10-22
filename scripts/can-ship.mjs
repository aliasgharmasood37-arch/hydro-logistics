// Which ONLINE-STORE orders can actually ship right now, given what the worker has made.
//
//   node scripts/can-ship.mjs parts-to-ready-2026-10-12.xlsx
//
// Read-only. It books nothing, cancels nothing and writes nothing - it answers "what can I
// dispatch today" and says what each remaining order is waiting on.
//
// Reads the `Ready` column the worker typed into the Parts to Ready workbook, then allocates
// that stock to orders OLDEST FIRST, the same rule the Ready Checklist has always used. An
// order only ships if EVERY one of its unfulfilled line items is covered - a half-filled
// parcel is not a parcel.
//
// Amazon orders are excluded on purpose: this is the online store, and Amazon orders ship
// through Amazon Easy Ship, never on a courier we book.
import fs from 'fs';
import {token, mk} from './lib.mjs';
import {readZip, sharedStrings, sheets, sheetRows} from './_xlsx.mjs';

const XLSX = process.argv[2];
if (!XLSX) { console.error('usage: node scripts/can-ship.mjs <parts-to-ready.xlsx>'); process.exit(1); }

// ---- 1. what is made ---------------------------------------------------------------------
// Only rows AFTER the first real table header count. The workbook carries a worked EXAMPLE
// row above the first section, and counting it as stock would ship a parcel that has no part.
const zip = readZip(fs.readFileSync(XLSX));
const sh = sheets(zip);
const rows = sheetRows(zip.get(sh[0].path).toString('utf8'), sharedStrings(zip));
const ready = new Map();                      // key -> units made
let started = false, exampleSkipped = 0;
for (const r of rows) {
  const a = String(r[0] ?? '').trim(), b = String(r[1] ?? '').trim(), d = String(r[3] ?? '').trim();
  if (a === 'Part' && b === 'SKU') { started = true; continue; }
  if (!started) { if (d && /^\d+$/.test(d)) exampleSkipped++; continue; }
  if (!d || !/^\d+$/.test(d)) continue;
  // Anywhere in the label, not just the end: the grand total row reads
  // "TOTAL - everything to make", and counting it doubled the stock on 2026-10-12.
  if (/\btotal\b/i.test(a)) continue;
  const n = Number(d); if (n <= 0) continue;
  const key = (b && b !== '—') ? b : 'CUSTOM::' + a;
  ready.set(key, (ready.get(key) || 0) + n);
}
const madeUnits = [...ready.values()].reduce((s, n) => s + n, 0);
console.log(`made: ${madeUnits} units across ${ready.size} parts`
  + (exampleSkipped ? ` (ignored ${exampleSkipped} example row)` : ''));

// ---- 2. the open online-store orders -----------------------------------------------------
const g = mk(await token());
const F = `id name createdAt sourceName cancelledAt displayFinancialStatus tags note
 totalOutstandingSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}}
 shippingAddress{name city province zip}
 lineItems(first:50){nodes{title unfulfilledQuantity
   variant{id sku title product{id title
     L:metafield(namespace:"custom",key:"pkg_length_cm"){value}
     W:metafield(namespace:"custom",key:"pkg_width_cm"){value}
     H:metafield(namespace:"custom",key:"pkg_height_cm"){value}}}}}`;
const all = []; let cur = null;
for (let p = 0; p < 40; p++) {
  const d = await g('query($c:String){orders(first:50,after:$c,query:"status:open AND -fulfillment_status:fulfilled"){pageInfo{hasNextPage endCursor} nodes{' + F + '}}}', { c: cur });
  all.push(...d.orders.nodes);
  if (!d.orders.pageInfo.hasNextPage) break;
  cur = d.orders.pageInfo.endCursor;
}
const orders = all.filter(o => !o.cancelledAt && o.sourceName !== 'amazon'
  && /^(PAID|PARTIALLY_PAID)$/.test(o.displayFinancialStatus))
  .map(o => {
    const items = o.lineItems.nodes.filter(l => Number(l.unfulfilledQuantity) > 0).map(l => {
      const v = l.variant, pr = v && v.product;
      return {
        key: v ? (v.sku || v.id) : 'CUSTOM::' + l.title.trim(),
        title: (v ? v.product.title : l.title.trim()) + (v && v.title && v.title !== 'Default Title' ? ' / ' + v.title : ''),
        sku: v ? (v.sku || '') : '', qty: Number(l.unfulfilledQuantity),
        dims: pr && pr.L && pr.W && pr.H ? [pr.L.value, pr.W.value, pr.H.value] : null,
      };
    });
    return {
      n: o.name, num: o.name.replace(/[^0-9]/g, ''), d: o.createdAt.slice(0, 10),
      age: Math.round((Date.now() - new Date(o.createdAt)) / 864e5),
      fin: o.displayFinancialStatus === 'PAID' ? 'prepaid' : 'part-paid',
      cod: Number(o.totalOutstandingSet.shopMoney.amount),
      total: Number(o.currentTotalPriceSet.shopMoney.amount),
      bad: (o.tags || []).some(t => /bad address/i.test(t)),
      tags: o.tags || [], addr: o.shippingAddress || {}, items,
      units: items.reduce((s, i) => s + i.qty, 0),
    };
  })
  .filter(o => o.items.length)
  .sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : Number(a.num) - Number(b.num));   // OLDEST FIRST
console.log(`online-store orders open, prepaid or part-paid: ${orders.length}`);

// ---- 3. allocate, oldest first -----------------------------------------------------------
const left = new Map(ready);
const can = [], cannot = [];
for (const o of orders) {
  const short = o.items.filter(i => (left.get(i.key) || 0) < i.qty)
    .map(i => ({ ...i, have: left.get(i.key) || 0 }));
  if (short.length) { cannot.push({ ...o, short }); continue; }
  o.items.forEach(i => left.set(i.key, left.get(i.key) - i.qty));
  can.push(o);
}

// ---- 4. report ---------------------------------------------------------------------------
const money = n => '₹' + n.toLocaleString('en-IN');
const payline = o => o.fin === 'prepaid' ? 'PREPAID, collect nothing'
  : `COD ${money(o.cod)} to collect (part-paid)`;
const dimline = i => i.dims ? `${i.dims.join(' x ')} cm` : 'NO DIMS ON RECORD';

const singles = can.filter(o => o.units === 1);
const packs = can.filter(o => o.units > 1);
const blocked = can.filter(o => o.bad);

const W = s => console.log(s);
W('\n\n########  CAN SHIP NOW  ########');
W(`${can.length} orders · ${can.reduce((s, o) => s + o.units, 0)} units`
  + (blocked.length ? `  — but ${blocked.length} of them carry a Bad Address tag, see below` : ''));

W(`\n----  SINGLE PACK  (one part, one box) — ${singles.length} orders  ----`);
singles.forEach(o => {
  const i = o.items[0];
  W(`\n${o.n}  ${o.d} (${o.age}d)  ${o.addr.city || '?'} ${o.addr.zip || ''}${o.bad ? '   [BAD ADDRESS]' : ''}`);
  W(`   1 x ${i.title}`);
  W(`   box ${dimline(i)}   ·   ${payline(o)}`);
});

W(`\n\n----  MULTI PACK  (more than one piece — ONE box, needs a carton size) — ${packs.length} orders  ----`);
packs.forEach(o => {
  W(`\n${o.n}  ${o.d} (${o.age}d)  ${o.addr.city || '?'} ${o.addr.zip || ''}  — ${o.units} pieces${o.bad ? '   [BAD ADDRESS]' : ''}`);
  o.items.forEach(i => W(`   ${i.qty} x ${i.title}    (single-part box ${dimline(i)})`));
  W(`   ${payline(o)}   ·   CARTON SIZE NEEDED: ____ x ____ x ____ cm`);
});

W(`\n\n########  CANNOT SHIP YET  ########  ${cannot.length} orders`);
cannot.forEach(o => {
  W(`\n${o.n}  ${o.d} (${o.age}d)  ${o.units} units  ${payline(o)}${o.bad ? '  [BAD ADDRESS]' : ''}`);
  o.short.forEach(i => W(`   short ${i.qty - i.have} of ${i.qty} — ${i.title}  [${i.sku || 'custom'}]`));
});

// One part away: the cheapest unlocks. Sorted by what the order is worth, because the point
// of this list is to decide what to dip next.
const oneAway = cannot.filter(o => o.short.reduce((s, i) => s + (i.qty - i.have), 0) === 1)
  .sort((a, b) => b.total - a.total);
if (oneAway.length) {
  W(`\n\n########  ONE PART AWAY  ########  ${oneAway.length} orders, `
    + `${money(oneAway.reduce((s, o) => s + o.total, 0))} of order value`);
  oneAway.forEach(o => W(`   ${o.n.padEnd(6)} ${String(o.d)}  ${money(o.total).padStart(9)}  `
    + `${o.fin.padEnd(9)} needs 1 x ${o.short[0].sku || o.short[0].title}${o.bad ? '   [BAD ADDRESS]' : ''}`));
  // Which single part unlocks the most.
  const by = new Map();
  oneAway.forEach(o => {
    const k = o.short[0].sku || o.short[0].title;
    const e = by.get(k) || { n: 0, v: 0, ords: [] };
    e.n++; e.v += o.total; e.ords.push(o.n); by.set(k, e);
  });
  W(`\n   make these next, best first:`);
  [...by.entries()].sort((a, b) => b[1].v - a[1].v).forEach(([k, e]) =>
    W(`   ${String(e.n)} x ${k.padEnd(28)} unlocks ${e.ords.join(' ')}  = ${money(e.v)}`));
}

const spare = [...left.entries()].filter(([, n]) => n > 0);
if (spare.length) {
  // Not truly spare: some of this is the rest of an order that is blocked on one other part.
  W(`\n\n########  STOCK NOT ALLOCATED  ########  (some of it is the rest of a blocked order)`);
  spare.forEach(([k, n]) => {
    const waiting = cannot.filter(o => o.items.some(i => i.key === k)).map(o => o.n);
    W(`   ${n} x ${k.padEnd(28)}${waiting.length ? '  held for ' + waiting.join(' ') : '  genuinely spare'}`);
  });
}
W(`\n\nnothing was booked. This is a report.`);
