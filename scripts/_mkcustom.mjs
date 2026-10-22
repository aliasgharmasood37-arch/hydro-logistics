// Create one custom / offline Shopify order. DRY RUN unless --go.
//
//   node scripts/_mkcustom.mjs --id 8362off3 --title "r15 v4 single side battery panel" \
//        --price 2000 --phone +917719488362 --paid --from 8362off2
//
// Follows playbooks/AWB.md §6 and the manual-order-creation rules, which exist because each of
// these was a real mistake:
//   - CUSTOM LINE ITEM ONLY: title + priceSet + quantity, no variantId, no SKU. Never create a
//     Shopify product — custom prices differ from website prices and it pollutes the catalogue.
//   - `--from <order>` copies the shipping address verbatim off an earlier order for the same
//     customer, LANDMARK INCLUDED. Half these addresses have no house number and the landmark is
//     what the rider navigates by.
//   - customer.toUpsert with a phone alone is REFUSED ("requires at least one of id, email"), so
//     a returning customer is looked up by phone and attached with toAssociate{id}. A new one
//     needs customerCreate first.
//   - A single-name customer goes in lastName; an address with lastName:'' is dropped SILENTLY
//     and the order comes back with shippingAddress:null and no userError. So the address is
//     ALWAYS read back after creating.
//   - `--paid` adds one SALE/SUCCESS manual transaction for the full amount -> outstanding 0 ->
//     prepaid. With no transaction at all, displayFinancialStatus comes back null (not PENDING),
//     which the bots read as COD — the safe direction, but not what a prepaid parcel wants.
//     `--advance N` instead books N as received, leaving the rest outstanding (PARTIALLY_PAID).
//   - A custom line item's weight lives on the line, not a variant, so any booker reading
//     variant.inventoryItem.measurement sees 0 g. Pass the box to the booker explicitly.
//
// IT DOES NOT BOOK. After this: `node scripts/_book1.mjs <id> L B H`, then the Custom And
// Offline Orders sheet in the same turn (§6).
import { token, mk } from './lib.mjs';

const A = process.argv.slice(2);
const val = (f, d = null) => { const i = A.indexOf(f); return i >= 0 ? A[i + 1] : d; };
const GO = A.includes('--go');
const ID = val('--id'), TITLE = val('--title'), PRICE = val('--price');
const PHONE = val('--phone'), FROM = val('--from'), QTY = val('--qty', '1');
const PAID = A.includes('--paid'), ADVANCE = val('--advance');
// A brand-new customer has no earlier order to copy an address from, so the address can also be
// given outright. --last is required and carries a single-name customer ("Don") on its own:
// orderCreate DROPS an address with an empty lastName silently, with no userError.
const FIRST = val('--first', ''), LAST = val('--last', '');
const ADDR1 = val('--addr1'), ADDR2 = val('--addr2', ''), CITY = val('--city');
const PROV = val('--province'), ZIP = val('--zip');
if (!ID || !TITLE || !PRICE || !PHONE) {
  console.log('usage: _mkcustom.mjs --id 8362off3 --title "name" --price 2000 --phone +91XXXXXXXXXX\n' +
    '         [--from <order> | --last Surname --addr1 "..." [--addr2 "..."] --city X --province Y --zip 383120]\n' +
    '         [--first Name] [--paid|--advance N] [--qty 1] [--go]');
  process.exit(1);
}
if (!FROM && !(LAST && ADDR1 && CITY && PROV && ZIP)) {
  console.log('Give either --from <order> to copy an address, or --last/--addr1/--city/--province/--zip to supply one.');
  process.exit(1);
}
const g = mk(await token());
const money = a => ({ shopMoney: { amount: Number(a).toFixed(2), currencyCode: 'INR' } });

// ---- 1. the off-id must be free (a failed create may already have made it) ----
const taken = (await g(`{orders(first:5,query:"name:${ID}"){nodes{name createdAt}}}`)).orders.nodes
  .find(x => x.name.replace(/^#/, '') === ID);
if (taken) { console.log(`STOP — ${ID} already exists in Shopify (created ${taken.createdAt}). Increment the suffix, or this is a retry of a create that actually succeeded.`); process.exit(1); }

// ---- 2. the customer: look up by phone, attach by id --------------------------
// The phone query matches the ADDRESS phone too, so it finds returning customers whose own
// `phone` field is null. A new one is created outright — the app has write_customers since
// 2026-09-28, so a customer with no email works; toUpsert with a phone alone would be refused.
const cust = (await g(`{customers(first:5,query:"phone:${PHONE}"){nodes{id firstName lastName phone numberOfOrders}}}`)).customers.nodes;
let c = cust[0];
if (c) console.log(`customer: ${c.firstName || ''} ${c.lastName || ''} (${c.numberOfOrders} orders) ${c.id}`);
else if (!GO) console.log(`customer: none for ${PHONE} — would customerCreate "${FIRST} ${LAST}".trim()`);
else {
  const cr = await g(`mutation($i:CustomerInput!){customerCreate(input:$i){customer{id firstName lastName} userErrors{field message}}}`,
    { i: { firstName: FIRST || undefined, lastName: LAST || FIRST, phone: PHONE } });
  const ce = cr.customerCreate.userErrors || [];
  if (ce.length || !cr.customerCreate.customer) { console.log('customerCreate FAILED: ' + JSON.stringify(ce)); process.exit(1); }
  c = cr.customerCreate.customer;
  console.log(`customer CREATED: ${c.firstName || ''} ${c.lastName || ''} ${c.id}`);
}

// ---- 3. the address, verbatim off the earlier order ---------------------------
let addr = null;
if (FROM) {
  const src = (await g(`{orders(first:5,query:"name:${FROM}"){nodes{name shippingAddress{firstName lastName company address1 address2 city province zip country phone}}}}`))
    .orders.nodes.find(x => x.name.replace(/^#/, '') === FROM);
  if (!src?.shippingAddress) { console.log(`STOP — no shipping address on ${FROM} to copy.`); process.exit(1); }
  const s = src.shippingAddress;
  addr = { firstName: s.firstName || '', lastName: s.lastName || '', company: s.company || '',
           address1: s.address1 || '', address2: s.address2 || '', city: s.city || '',
           province: s.province || '', zip: s.zip || '', country: s.country || 'India', phone: s.phone || PHONE };
  if (!addr.lastName) { console.log('STOP — the source address has an empty lastName; orderCreate drops such an address SILENTLY. Put the whole name in lastName.'); process.exit(1); }
} else {
  addr = { firstName: FIRST, lastName: LAST, company: '', address1: ADDR1, address2: ADDR2,
           city: CITY, province: PROV, zip: ZIP, country: 'India', phone: PHONE };
}
if (!addr) { console.log('STOP — no address. Never create a custom order without one.'); process.exit(1); }
if (!addr.lastName) { console.log('STOP — empty lastName; orderCreate drops the address SILENTLY and returns no userError.'); process.exit(1); }

// ---- 4. build it --------------------------------------------------------------
const order = {
  name: ID, sourceName: 'offline',
  lineItems: [{ title: TITLE, quantity: Number(QTY), priceSet: money(PRICE) }],
  // On a dry run for a brand-new customer there is no id yet — the create happens under --go.
  ...(c ? { customer: { toAssociate: { id: c.id } } } : {}),
  shippingAddress: addr,
};
const recv = PAID ? Number(PRICE) : ADVANCE ? Number(ADVANCE) : 0;
if (recv > 0) order.transactions = [{ kind: 'SALE', status: 'SUCCESS', gateway: 'manual', amountSet: money(recv) }];

console.log(`\n${ID}  "${TITLE}" x${QTY} @ ₹${Number(PRICE).toFixed(2)}`);
console.log(`  address: ${[addr.address1, addr.address2].filter(Boolean).join(' | ')} · ${addr.city} ${addr.province} ${addr.zip} · ${addr.phone}`);
console.log(`  received ₹${recv.toFixed(2)} -> outstanding ₹${(Number(PRICE) - recv).toFixed(2)}  (${recv >= Number(PRICE) ? 'prepaid' : recv > 0 ? 'partially paid' : 'nothing received — will ship COD'})`);
if (!GO) { console.log('\nDRY RUN — no order created. Re-run with --go.\n' + JSON.stringify(order, null, 1)); process.exit(0); }

// ---- 5. create, then read the address back ------------------------------------
const r = await g(`mutation($o:OrderCreateOrderInput!){orderCreate(order:$o){
  order{id name sourceName displayFinancialStatus displayFulfillmentStatus
    currentTotalPriceSet{shopMoney{amount}} totalOutstandingSet{shopMoney{amount}} totalReceivedSet{shopMoney{amount}}
    customer{id firstName lastName}
    shippingAddress{address1 address2 city province zip phone}
    lineItems(first:5){nodes{title quantity sku variant{id} originalUnitPriceSet{shopMoney{amount}}}}}
  userErrors{field message}}}`, { o: order });
const ue = r.orderCreate.userErrors || [];
if (ue.length) { console.log('orderCreate FAILED: ' + JSON.stringify(ue)); process.exit(1); }
const o = r.orderCreate.order;
console.log(`\nCREATED ${o.name}  ${o.id}`);
console.log(`  source=${o.sourceName}  ${o.displayFinancialStatus}/${o.displayFulfillmentStatus}`);
console.log(`  total ₹${o.currentTotalPriceSet.shopMoney.amount} · received ₹${o.totalReceivedSet.shopMoney.amount} · outstanding ₹${o.totalOutstandingSet.shopMoney.amount}`);
console.log(`  customer: ${o.customer ? o.customer.firstName + ' ' + o.customer.lastName + ' ' + o.customer.id : 'NO CUSTOMER — fix this'}`);
const sa = o.shippingAddress;
console.log(`  address read-back: ${sa ? [sa.address1, sa.address2].filter(Boolean).join(' | ') + ' · ' + sa.city + ' ' + sa.zip : 'NULL — the address was dropped, fix before booking'}`);
for (const li of o.lineItems.nodes)
  console.log(`  line: ${li.quantity} x "${li.title}" @ ₹${li.originalUnitPriceSet.shopMoney.amount}  variant=${li.variant?.id || 'none (custom line item)'} sku=${li.sku || 'none'}`);
console.log(`\nNEXT: node scripts/_book1.mjs ${ID} <L> <B> <H>   then the Custom And Offline Orders sheet (§6)`);
