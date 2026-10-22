// Book one Shopify order on XpressBees: node scripts/xb-book.mjs <order> [L B H] [flags]
// DRY RUN unless --go. --go hits production: wallet debit, Shopify fulfilment + customer email, Ledger row.
// Flags: --in (box given in inches) · --g <grams> (dead weight) · --air · --tier <id> · --ref <order_number>
//        --unverified (owner said ship an untagged COD order) · --force (skip the soft stops, says which)
//        --bad-address-ok (the final say on a Bad Address order whose address is incomplete:
//                          the owner, or Zahra for her own bookings - warn and ask first)
// Procedure and reasons: XPRESSBEES-API.md Part A.
import fs from 'fs';
import {token,mk} from './lib.mjs';
import {dl} from './dl.mjs';
import {gapi} from './gsheet.mjs';
import {xb,trackUrl,SURFACE_IDS,AIR_ID,PICKUP} from './xb.mjs';
// The bad-address gate scores the address the same way the Bad Address call sheet and the AWB
// bot do. The tag alone never blocks: 4 of the 45 tagged orders have complete addresses, and
// the tag cannot be cleared - an app on the store re-applies it within seconds of removal.
import {scoreAddress} from '../flows/address-score.js';

const argv=process.argv.slice(2), VAL=['--g','--tier','--ref'];
const flag=f=>argv.includes(f), opt=f=>{const i=argv.indexOf(f);return i>=0?argv[i+1]:undefined;};
const pos=argv.filter((a,i)=>!a.startsWith('--')&&!VAL.includes(argv[i-1]));
const [ID,...dims]=pos;
if(!ID||![0,3].includes(dims.length)){
  console.log('usage: xb-book.mjs <order> [L B H] [--in] [--g grams] [--air] [--tier id] [--ref X] [--unverified] [--force] [--go]');process.exit(1);}
const GO=flag('--go'), FORCE=flag('--force');
const stop=m=>{console.log('STOP — '+m);process.exit(1);};
const soft=m=>{if(!FORCE) stop(m+'  (--force overrides after checking)');console.log('FORCED past: '+m);};
const LEDGER='1y_c5qxfqSHQ-3pqOn09c8vSbZeF7T-otz2T1QjwMaNY';
const VERIFIED_TAGS=['✅ COD-Verified','COD Verified by Call'], norm=t=>String(t).toLowerCase().replace(/[^a-z0-9]/g,'');
const amt=m=>Number(m?.shopMoney?.amount||0), rs=n=>'₹'+Number(n).toLocaleString('en-IN');
const bare=ID.replace(/^#/,'');

// 1. The order, from Shopify
const g=mk(await token());
const o=(await g(`{orders(first:5,query:"name:${bare}"){nodes{id name sourceName tags cancelledAt phone displayFulfillmentStatus
  totalOutstandingSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}} currentSubtotalPriceSet{shopMoney{amount}}
  customer{phone} shippingAddress{name firstName lastName company address1 address2 city province zip phone}
  fulfillments(first:10){status trackingInfo{number company}}
  fulfillmentOrders(first:10){nodes{id status lineItems(first:50){nodes{remainingQuantity lineItem{title sku
    originalUnitPriceSet{shopMoney{amount}} discountAllocations{allocatedAmountSet{shopMoney{amount}}}
    variant{inventoryItem{measurement{weight{value unit}}}
      product{L:metafield(namespace:"custom",key:"pkg_length_cm"){value} W:metafield(namespace:"custom",key:"pkg_width_cm"){value} H:metafield(namespace:"custom",key:"pkg_height_cm"){value}}}}}}}}}}}`))
  .orders.nodes.find(x=>x.name===bare||x.name==='#'+bare);
if(!o) stop(`order ${bare} not found in Shopify`);
if(o.cancelledAt) stop('order is CANCELLED');
if(/amazon/i.test(o.sourceName||'')) stop('Amazon order — it ships through Amazon Easy Ship, never on our courier');
const tracked=o.fulfillments.filter(f=>f.status!=='CANCELLED'&&f.trackingInfo?.length);
if(tracked.length) stop('already has an AWB — '+tracked.flatMap(f=>f.trackingInfo.map(t=>`${t.company} ${t.number}`)).join(', '));
const open=o.fulfillmentOrders.nodes.filter(f=>f.status==='OPEN');
if(open.length!==1) stop(`${open.length} OPEN fulfillment orders (${o.displayFulfillmentStatus}) — look at it by hand`);
const fo=open[0];

// 2. Money — CLAUDE.md rule 2: current* fields and the outstanding balance, never displayFinancialStatus
const total=amt(o.currentTotalPriceSet), cod=Math.max(0,amt(o.totalOutstandingSet)), prepaid=cod===0;
const offline=o.sourceName==='offline'||/off\d*$/i.test(o.name);
const tokenPaid=total-cod>0.5;   // the ₹49/₹99 COD confirmation token was paid
const verified=prepaid||tokenPaid||offline||o.tags.some(t=>VERIFIED_TAGS.map(norm).includes(norm(t)));
if(!verified&&!flag('--unverified')) stop(`COD order is not tagged ${VERIFIED_TAGS.join(' / ')} — confirm with the owner, then pass --unverified`);
const toG=w=>!w?0:({GRAMS:1,KILOGRAMS:1000,OUNCES:28.3495,POUNDS:453.592}[w.unit]||0)*w.value;
const items=fo.lineItems.nodes.filter(n=>n.remainingQuantity>0).map(n=>{const li=n.lineItem;
  return {title:li.title,sku:li.sku||'',qty:n.remainingQuantity,p:li.variant?.product,g:toG(li.variant?.inventoryItem?.measurement?.weight)*n.remainingQuantity,
    price:amt(li.originalUnitPriceSet)*n.remainingQuantity-li.discountAllocations.reduce((s,d)=>s+amt(d.allocatedAmountSet),0)};});
if(!items.length) stop('OPEN fulfillment order has nothing left to ship');
const lineSum=items.reduce((s,i)=>s+i.price,0), sub=amt(o.currentSubtotalPriceSet);
if(Math.abs(lineSum-sub)>0.5) soft(`line prices sum to ${rs(lineSum.toFixed(2))} but currentSubtotal is ${rs(sub)}`);

// 3. Box — owner's numbers, else product metafields, else the catalogue. Never rounded or padded.
const units=items.reduce((s,i)=>s+i.qty,0);
const csv=f=>fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split(','));
let box, boxSrc, catW=0;
if(dims.length===3){
  box=dims.map(Number).map(x=>flag('--in')?+(x*2.54).toFixed(2):x);
  boxSrc=flag('--in')?`Owner box ${dims.join('x')} in (x2.54)`:'Owner box';
}else{
  if(units>1) stop(`multipack (${items.length} lines, ${units} units) — needs the carton size: Multipack sheet FINAL BOX row, or ask the owner`);
  const p=items[0].p;
  if(p?.L?.value&&p?.W?.value&&p?.H?.value){box=[+p.L.value,+p.W.value,+p.H.value];boxSrc='Box from metafields';}
  else{
    const c=csv('delhivery-product-catalogue.csv').find(r=>r[0]===items[0].sku&&items[0].sku);
    const b=c&&csv('delhivery-box-master.csv').find(r=>r[0]===c[c.length-1]);
    if(!b) stop('no box on file for this product — need the box size from the owner');
    box=[+b[2],+b[3],+b[4]]; boxSrc=`Box ${b[0]} from the catalogue`; catW=+c[c.length-2]||0;
  }
}
if(box.some(x=>!(x>0))) stop('bad box '+box.join('x'));
if(box.some(x=>!Number.isInteger(x))){   // XpressBees refuses decimals ("must contain an integer") — nearest cm, said out loud
  const r=box.map(Math.round); boxSrc+=`; ${box.join('x')} sent as ${r.join('x')}, XpressBees takes whole cm only`; box=r;}
const deadG=opt('--g')?Number(opt('--g')):(items.reduce((s,i)=>s+i.g,0)||catW);
if(!(deadG>0)) stop('no dead weight on the products — pass --g <grams>');
const volG=box[0]*box[1]*box[2]/5, chargeG=Math.max(deadG,volG);
const declG=Math.round(Math.max(deadG,volG*0.8));   // owner rule: declare 80% of volumetric, never below the real weight

// 4. Consignee
const a=o.shippingAddress; if(!a) stop('no shipping address');
const name=(a.name||`${a.firstName||''} ${a.lastName||''}`).trim();
const phone=[a.phone,o.phone,o.customer?.phone].map(p=>String(p||'').replace(/\D/g,'').slice(-10)).find(p=>/^[6-9]\d{9}$/.test(p));
const pin=String(a.zip||'').replace(/\s/g,'');
if(!phone) stop('no valid 10-digit mobile number on the order');
if(!/^\d{6}$/.test(pin)) stop('pincode is not 6 digits: '+a.zip);
if(!a.address1) stop('address line 1 is empty');
for(const [k,v,max] of [['name',name,200],['address',a.address1,200],['address_2',a.address2||'',200],['city',a.city||'',40],['state',a.province||'',40]])
  if(!v&&k!=='address_2'||v.length>max) stop(`consignee ${k} is empty or over ${max} chars: "${v}"`);

// 4a. Bad-address gate. An RTO costs about ₹250 plus the outbound freight, and a parcel sent to
// "Madhubani, Madhubani 847222" is not a delivery attempt, it is a round trip. Owner, 2026-10-13.
if(o.tags.some(t=>/bad\s*address/i.test(t))){
  const sc=scoreAddress({address1:a.address1,address2:a.address2,city:a.city,province:a.province,zip:pin});
  if(sc.band!=='ok'){
    console.log(`\nBAD ADDRESS — ${sc.verdict}`);
    console.log(`  address: ${[a.address1,a.address2].filter(Boolean).join(', ')} | ${a.city} ${pin}`);
    console.log(`  missing: ${sc.missing.join(', ')||'-'}`);
    console.log(`  why:     ${sc.reasons.join('; ')}`);
    console.log(`  phone:   ${phone}`);
    if(!flag('--bad-address-ok')) stop('not advisable to ship this right now.\n'+
      '  A failed delivery here costs ~₹250 plus the outbound freight, and the customer still\n'+
      '  has no parcel. Call and take the real address — put it on the Bad Address tab of the\n'+
      '  RTO call sheet and it goes onto the order by itself at 2pm and 10pm (playbooks/NDR.md\n'+
      '  §7c). To ship it anyway, say so explicitly: --bad-address-ok.');
    console.log('  --bad-address-ok given — booking anyway, on a human\'s explicit say-so.');
  }
}

// 5. Not already on Delhivery (Shopify was checked above). XpressBees has no order search —
//    unique_order_number:"yes" is its only guard.
const refs=[bare,'#'+bare,bare+'-R'];
const dd=(await dl(`/api/v1/packages/json/?ref_ids=${refs.map(encodeURIComponent).join(',')}`)).body;
const onDl=(dd?.ShipmentData||[]).map(s=>s.Shipment);
if(onDl.length) soft('already on Delhivery — '+onDl.map(s=>`${s.AWB} ref ${s.ReferenceNo} ${s.Status?.Status}`).join(', '));

// 6. Quote, and take the cheapest allowed tier
const qb={origin:'400010',destination:pin,payment_type:prepaid?'prepaid':'cod',order_amount:String(total),
  weight:String(declG),length:String(box[0]),breadth:String(box[1]),height:String(box[2])};
const qr=await xb('/courier/serviceability',{method:'POST',body:qb});
const rows=(Array.isArray(qr.body?.data)?qr.body.data:[]).sort((x,y)=>x.total_charges-y.total_charges);
const allow=opt('--tier')?[String(opt('--tier'))]:[...SURFACE_IDS,...(flag('--air')?[AIR_ID]:[])];
const pick=rows.find(r=>allow.includes(String(r.id)));
const ref=opt('--ref')||bare;

console.log(`${o.name} · ${name} · ${phone} · ${a.city} ${pin}${offline?' · custom/offline order':''}`);
items.forEach(i=>console.log(`  ${i.title} x${i.qty}  ${rs(i.price.toFixed(2))}`));
console.log(`  box ${box.join('x')} cm (${boxSrc}) · dead ${Math.round(deadG)} g · volumetric ${Math.round(volG)} g · chargeable ${Math.round(chargeG)} g (${volG>deadG?'volumetric':'dead'} dominates) · declare ${declG} g`);
console.log(`  ${prepaid?'PREPAID, collect ₹0':`COD, collect ${rs(cod)}`} · order total ${rs(total)}${verified?'':' · NOT COD-verified (--unverified given)'}`);
rows.forEach(r=>console.log(`  ${r===pick?'->':'  '} [${String(r.id).padEnd(5)}] ${String(r.name).padEnd(30)} ${rs(r.total_charges)}  (freight ${r.freight_charges} + cod ${r.cod_charges}, chargeable ${r.chargeable_weight} g)`));
if(!pick) stop(`XpressBees cannot serve ${pin} ${qb.payment_type} with the allowed services (${JSON.stringify(qr.body).slice(0,160)}) — book on Delhivery instead: playbooks/AWB.md`);
// The cheapest tier is only right if it bills the whole parcel. A tier billing under the chargeable
// weight means the box never reached the quote, and the hub would re-bill it later.
if(pick.chargeable_weight<chargeG) stop(`[${pick.id}] ${pick.name} would bill ${pick.chargeable_weight} g but the parcel is ${Math.round(chargeG)} g chargeable — do not book`);
console.log(`  picked [${pick.id}] ${pick.name}: bills ${pick.chargeable_weight} g for a ${Math.round(chargeG)} g-chargeable parcel, cheapest surface tier`);
if(ref.length>20) stop('order_number over 20 chars: '+ref);

const payload={order_number:ref,unique_order_number:'yes',payment_type:prepaid?'prepaid':'cod',
  order_amount:total,collectable_amount:String(prepaid?0:cod),
  package_weight:declG,package_length:box[0],package_breadth:box[1],package_height:box[2],request_auto_pickup:'yes',
  consignee:{name,company_name:a.company||'',address:a.address1,address_2:a.address2||'',city:a.city,state:a.province,pincode:pin,phone},
  pickup:PICKUP,
  order_items:items.map(i=>({name:i.title,qty:String(i.qty),price:String(+(i.price/i.qty).toFixed(2)),sku:i.sku})),
  courier_id:String(pick.id)};
if(!GO){console.log('\nDRY RUN — nothing booked. Payload that --go would send:\n'+JSON.stringify(payload,null,1));process.exit(0);}

// 7. Book, then read it back — never report an AWB that was not read back
const br=await xb('/shipments2',{method:'POST',body:payload});
const d=br.body?.data;
if(br.body?.status!==true||!d?.awb_number){console.log('XpressBees refused: '+JSON.stringify(br.body).slice(0,400));
  stop(`not booked, nothing fulfilled. If this was a timeout, look for ${ref} in the panel's Orders page before retrying`);}
const AWB=String(d.awb_number);
console.log(`\nBOOKED ${AWB} · ${d.courier_name} (id ${d.courier_id}) · ${d.status} · ${d.payment_type} · sort ${d.fwd_destination_code||d.additional_info||'-'}`);
const tr=await xb(`/shipments2/track/${AWB}`), t=tr.body?.data;
console.log('read-back: '+(tr.body?.status===true?`${t.order_number} · ${t.status} · ${t.history?.[0]?.status_code||'-'} ${t.history?.[0]?.message||''}`:JSON.stringify(tr.body).slice(0,200)));

// 8. Label — the URL only ever comes back here
fs.mkdirSync('labels',{recursive:true});
const lf=`labels/xb-${new Date().toISOString().slice(0,10)}-${ref.replace(/[^\w-]/g,'')}-${AWB}.pdf`;
try{const lr=await fetch(d.label);if(!lr.ok)throw new Error('HTTP '+lr.status);fs.writeFileSync(lf,Buffer.from(await lr.arrayBuffer()));console.log('label: '+lf);}
catch(e){console.log(`LABEL DOWNLOAD FAILED (${e.message}) — URL: ${d.label}`);}

// 9. Shopify fulfilment with tracking (emails the customer)
const fr=await g(`mutation($f:FulfillmentInput!){fulfillmentCreate(fulfillment:$f){fulfillment{id status} userErrors{field message}}}`,
  {f:{lineItemsByFulfillmentOrder:[{fulfillmentOrderId:fo.id}],notifyCustomer:true,trackingInfo:{number:AWB,company:'Xpressbees',url:trackUrl(AWB)}}});
const ful=fr.fulfillmentCreate.fulfillment;
if(fr.fulfillmentCreate.userErrors.length||!ful) console.log('SHOPIFY FULFILMENT FAILED — the AWB exists, fulfil by hand: '+JSON.stringify(fr.fulfillmentCreate.userErrors));
const v=(await g(`{orders(first:5,query:"name:${bare}"){nodes{name displayFulfillmentStatus fulfillments(first:10){status trackingInfo{number company}}}}}`)).orders.nodes.find(x=>x.name===o.name);
console.log(`Shopify: ${v?.displayFulfillmentStatus} · ${(v?.fulfillments||[]).filter(f=>f.status!=='CANCELLED').flatMap(f=>f.trackingInfo.map(x=>x.company+' '+x.number)).join(', ')}`);

// 10. Ledger row. XpressBees codes are prefixed XB- so the Delhivery flows never mistake them for theirs.
const now=new Date(Date.now()+5.5*3600e3).toISOString().slice(0,23);
const row=[bare,o.name,AWB,now,prepaid?'Prepaid':'COD',String(cod),box.join('x'),String(declG),(chargeG/1000).toFixed(2),ful?.id?.split('/').pop()||'',
  `XB ${t?.status||d.status}`,'',`XB-${t?.history?.[0]?.status_code||'PP'}`,now,'0','','','0','',name,phone,a.city,pin,
  `XpressBees · ${d.courier_name} (id ${d.courier_id}) · quote ${rs(pick.total_charges)} · cod_amount=totalOutstandingSet ${cod}, total_amount=currentTotalPriceSet ${total}. ${boxSrc} ${box.join('x')}. Declared 80% of volumetric. Label ${d.label||'-'}`];
try{const res=await gapi('POST',`https://sheets.googleapis.com/v4/spreadsheets/${LEDGER}/values/${encodeURIComponent('Ledger!A1:X1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{values:[row]});
  console.log('ledger: '+res.updates?.updatedRange);}
catch(e){console.log('LEDGER WRITE FAILED — add this row by hand: '+JSON.stringify(row)+'\n  '+e.message);}
console.log(`\n${o.name} -> XpressBees ${AWB} · ${trackUrl(AWB)}`);
if(offline) console.log('NEXT: custom order — write it into the Custom And Offline Orders sheet with this AWB now (playbooks/AWB.md §6).');
