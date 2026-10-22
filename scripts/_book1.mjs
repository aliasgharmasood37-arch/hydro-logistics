// Book one Shopify order end to end: node scripts/_book1.mjs <order number> [L B H]
// Box from owner args, else product metafields. Playbook AWB.md §2 step by step. Hits production.
import fs from 'fs';
import {token,mk,env} from './lib.mjs';
import {dl} from './dl.mjs';
import {gapi} from './gsheet.mjs';
// --ref <value> books under a DIFFERENT Delhivery order ref than the Shopify order number.
// Needed to re-book an order whose old waybill died as X-PNP (never handed over, freight
// already refunded): create.json refuses the original ref with "Duplicate order id", and the
// established replacement form is <order>-R. See memory rebooking-a-cancelled-awb.
// --bad-address-ok is, since 2026-10-22, the owner OR Zahra on the logistics desk (warn and
// ask first - logistics/CLAUDE.md section 3). It was the owner's final say on an order carrying the `Bad Address` tag whose
// address does not score complete. Without it this script refuses to book one. The tag alone
// never blocks: 4 of the 45 tagged orders have complete addresses, and the tag cannot be
// cleared - an app on the store re-applies it within seconds. See playbooks/AWB.md §2a.
import {scoreAddress} from '../flows/address-score.js';
const argv=process.argv.slice(2);
const BADOK=argv.includes('--bad-address-ok');
const ri=argv.indexOf('--ref');
const REF_ARG=ri>=0?argv[ri+1]:null;
if(ri>=0) argv.splice(ri,2);
const [ID,...dims]=argv.filter(x=>!x.startsWith('--')); if(!ID){console.log('usage: _book1.mjs <order> [L B H] [--ref <ref>] [--bad-address-ok]');process.exit(1);}
const REF=REF_ARG||ID;
const L='1y_c5qxfqSHQ-3pqOn09c8vSbZeF7T-otz2T1QjwMaNY';
const g=mk(await token());
const o=(await g(`{orders(first:3,query:"name:${ID}"){nodes{id name phone tags sourceName cancelledAt displayFinancialStatus displayFulfillmentStatus totalOutstandingSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}}
  shippingAddress{firstName lastName address1 address2 city province zip phone}
  fulfillmentOrders(first:5){nodes{id status lineItems(first:10){nodes{remainingQuantity lineItem{title variant{inventoryItem{measurement{weight{value unit}}}
    product{L:metafield(namespace:"custom",key:"pkg_length_cm"){value} W:metafield(namespace:"custom",key:"pkg_width_cm"){value} H:metafield(namespace:"custom",key:"pkg_height_cm"){value}}}}}}}}}}}`)).orders.nodes.find(x=>x.name===ID||x.name==='#'+ID);   // a custom off-order is named 8362off3, with no '#' — only web orders carry one
if(!o){console.log('order not found');process.exit(1);}
if(o.cancelledAt){console.log('order is CANCELLED - stop');process.exit(1);}
const a=o.shippingAddress, fo=o.fulfillmentOrders.nodes.find(f=>f.status==='OPEN');
if(!fo){console.log('no OPEN fulfillment order —',o.displayFulfillmentStatus);process.exit(1);}
const items=fo.lineItems.nodes.map(li=>({title:li.lineItem.title,qty:li.remainingQuantity,w:li.lineItem.variant?.inventoryItem?.measurement?.weight,p:li.lineItem.variant?.product}));
const dead=items.reduce((s,i)=>s+(i.w?(i.w.unit==='KILOGRAMS'?i.w.value*1000:i.w.value):0)*i.qty,0);
let BOX, boxSrc;
if(dims.length===3){BOX=dims.map(Number);boxSrc='Owner box';}
else{ if(items.length>1){console.log('MULTIPACK — need a box size from the owner');process.exit(1);}
  const p=items[0].p; if(!p?.L){console.log('no box metafield on product — need a box size from the owner');process.exit(1);}
  BOX=[+p.L.value,+p.W.value,+p.H.value]; boxSrc='Box from metafields'; }
const vol=BOX[0]*BOX[1]*BOX[2]/5000*1000, charge=Math.max(dead,vol), grams=Math.round(Math.max(dead,vol*0.7));
const cod=Number(o.totalOutstandingSet.shopMoney.amount), total=Number(o.currentTotalPriceSet.shopMoney.amount);
const pay=cod>0?'COD':'Prepaid';
const pc=(await dl(`/c/api/pin-codes/json/?filter_codes=${a.zip}`)).body?.delivery_codes?.[0]?.postal_code;
const q=(await dl(`/api/kinko/v1/invoice/charges/.json?md=S&ss=Delivered&o_pin=400010&d_pin=${a.zip}&cgm=${Math.round(charge)}&pt=${cod>0?'COD':'Pre-paid'}&cod=${cod}`)).body?.[0];
console.log(`${o.name} ${a.firstName} ${a.lastName} ${a.city} ${a.zip} | ${items.map(i=>i.title+' x'+i.qty).join('; ')}\n  box ${BOX.join('x')} (${boxSrc}) dead ${dead}g vol ${Math.round(vol)}g -> chargeable ${Math.round(charge)}g (${vol>dead?'volumetric':'dead'}), declare ${grams}g | ${pay} ${cod} total ${total} | pin cod=${pc?.cod} remarks="${pc?.remarks||''}" | surface ${q?.zone} Rs ${q?.total_amount}`);
if(!pc){console.log('PINCODE NOT SERVICEABLE - stop');process.exit(1);}
if(pc.remarks){console.log('EMBARGO - stop');process.exit(1);}
// Bad-address gate. An RTO costs about Rs 250 plus the outbound freight, and a parcel sent to
// "Madhubani, Madhubani 847222" is not a delivery attempt, it is a round trip.
if((o.tags||[]).some(t=>/bad\s*address/i.test(t))){
  const sc=scoreAddress({address1:a.address1,address2:a.address2,city:a.city,province:a.province,zip:a.zip});
  if(sc.band!=='ok'){
    console.log(`\nBAD ADDRESS — ${sc.verdict}`);
    console.log(`  address: ${[a.address1,a.address2].filter(Boolean).join(', ')} | ${a.city} ${a.zip}`);
    console.log(`  missing: ${sc.missing.join(', ')||'-'}`);
    console.log(`  why:     ${sc.reasons.join('; ')}`);
    console.log(`  phone:   ${(a.phone||o.phone||'').replace(/\D/g,'').slice(-10)}`);
    if(!BADOK){console.log('\nNot advisable to ship this right now. A failed delivery here costs ~₹250 plus the outbound\n'+
      'freight, and the customer still has no parcel. Call and take the real address — put it on\n'+
      'the Bad Address tab of the RTO call sheet and it goes onto the order by itself at 2pm and\n'+
      '10pm. To ship it anyway, say so explicitly: --bad-address-ok. STOPPING.');process.exit(1);}
    console.log('  --bad-address-ok given — booking anyway, on a human\'s explicit say-so.');
  }
}
// a prepaid-only pin refuses COD with the same "non serviceable pincode" message — #2006, 743349
if(cod>0&&pc.cod!=='Y'){console.log(`PIN IS PREPAID-ONLY (cod=${pc.cod}) and this is a COD order - stop`);process.exit(1);}
if(pc.srv_wt_th&&vol>pc.srv_wt_th) console.log(`WARNING: volumetric ${Math.round(vol)}g exceeds this pin's ${pc.srv_wt_th}g ceiling`);
// Idempotency is checked on the ref we are about to USE. A dead X-PNP shipment still occupies
// the original ref for ever, so re-booking under -R must not be blocked by it - but the -R ref
// itself must be clean, or we would double-book the replacement.
const chk=await dl(`/api/v1/packages/json/?ref_ids=${REF}`); if(chk.body?.ShipmentData?.length){console.log('ALREADY ON DELHIVERY',JSON.stringify(chk.body.ShipmentData.map(s=>[s.Shipment.AWB,s.Shipment.Status?.Status])));process.exit(1);}
const payload={shipments:[{name:`${a.firstName||''} ${a.lastName||''}`.trim(),add:[a.address1,a.address2].filter(Boolean).join(', '),pin:a.zip,city:a.city,state:a.province,country:'India',
  phone:(a.phone||o.phone||'').replace(/\D/g,'').slice(-10),order:REF,payment_mode:pay,cod_amount:String(cod),total_amount:String(total),
  products_desc:items.map(i=>`${i.title} x${i.qty}`).join('; ').slice(0,150),quantity:String(items.reduce((s,i)=>s+i.qty,0)),weight:String(grams),
  shipment_length:String(BOX[0]),shipment_width:String(BOX[1]),shipment_height:String(BOX[2]),
  seller_gst_tin:'27AATFH6253R1ZC',hsn_code:'87141090',shipping_mode:'Surface',seller_name:'Hydro Customs'}],pickup_location:{name:'Hydro Customs'}};
const j=await (await fetch('https://track.delhivery.com/api/cmu/create.json',{method:'POST',headers:{'Authorization':`Token ${env.DELHIVERY_API_TOKEN}`,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:'format=json&data='+encodeURIComponent(JSON.stringify(payload))})).json();
const pk=j.packages?.[0]; console.log(`Delhivery ${pk?.status} AWB ${pk?.waybill||'-'} remarks=${JSON.stringify(pk?.remarks)}`);
if(pk?.status!=='Success'){console.log('ghost check:',JSON.stringify((await dl(`/api/v1/packages/json/?ref_ids=${REF}`)).body).slice(0,80));process.exit(1);}
const fr=await g(`mutation($f:FulfillmentInput!){fulfillmentCreate(fulfillment:$f){fulfillment{id status} userErrors{field message}}}`,{f:{lineItemsByFulfillmentOrder:[{fulfillmentOrderId:fo.id}],// Never email the buyer of an amazon-sourced order from Shopify: the mirror holds an Amazon
// proxy address and Amazon owns buyer comms. Confirm the shipment in Seller Central instead.
notifyCustomer:o.sourceName!=='amazon',trackingInfo:{number:pk.waybill,company:'Delhivery',url:`https://www.delhivery.com/track/package/${pk.waybill}`}}});
console.log('fulfil',JSON.stringify(fr.fulfillmentCreate)); const ful=fr.fulfillmentCreate.fulfillment?.id?.split('/').pop();
const sh=(await dl(`/api/v1/packages/json/?ref_ids=${REF}`)).body?.ShipmentData?.map(x=>x.Shipment).find(x=>String(x.AWB)===String(pk.waybill)); const st=sh?.Status||{};
console.log(`verify: AWB ${sh?.AWB} ${st.Status}/${st.StatusType} ${st.StatusCode} cod ${sh?.CODAmount} inv ${sh?.InvoiceAmount}`);
const ts=(st.StatusDateTime||sh.PickUpDate).slice(0,23);
const row=[ID,o.name,pk.waybill,ts,pay,String(cod),BOX.join('x'),String(grams),(charge/1000).toFixed(2),ful,st.Status,st.StatusType,st.StatusCode,ts,'0','','','0','',`${a.firstName||''} ${a.lastName||''}`.trim(),(a.phone||o.phone||'').replace(/\D/g,'').slice(-10),a.city,a.zip,
  `cod_amount=totalOutstandingSet ${cod}, total_amount=currentTotalPriceSet ${total}. ${boxSrc} ${BOX.join('x')}. Declared 70% of volumetric. Surface.${REF!==ID?' Booked under ref '+REF+' (original ref held a dead X-PNP waybill).':''}`];
const res=await gapi('POST',`https://sheets.googleapis.com/v4/spreadsheets/${L}/values/${encodeURIComponent('Ledger!A1:X1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{values:[row]});
console.log('ledger:',res.updates?.updatedRange);
const link=(await dl(`/api/p/packing_slip?wbns=${pk.waybill}&pdf=true&pdf_size=4R`)).body?.packages?.[0]?.pdf_download_link;
const d=new Date().toLocaleDateString('en-CA');
if(link){fs.writeFileSync(`labels/label-${d}-${ID}-${pk.waybill}.pdf`,Buffer.from(await (await fetch(link)).arrayBuffer()));console.log(`label: labels/label-${d}-${ID}-${pk.waybill}.pdf`);}
