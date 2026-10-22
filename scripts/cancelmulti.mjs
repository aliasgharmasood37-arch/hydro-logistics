import {token,mk} from './lib.mjs';
import {loadEnv} from './env.mjs';
const env=loadEnv();
const g=mk(await token());
const T=[{id:'1715',awb:'55285710005434'},{id:'1775',awb:'55285710005563'}];
for(const t of T){
  // 1. cancel the Delhivery shipment
  const r=await fetch('https://track.delhivery.com/api/p/edit',{method:'POST',
    headers:{'Authorization':`Token ${env.DELHIVERY_API_TOKEN}`,
      'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({waybill:t.awb,cancellation:'true'})});
  const txt=await r.text();
  console.log(`#${t.id}  Delhivery cancel ${t.awb}: ${txt.slice(0,160).replace(/\s+/g,' ')}`);
  let dOk=false; try{dOk=JSON.parse(txt).status===true||JSON.parse(txt).status==='true';}catch{}
  if(!dOk){console.log('   -> Delhivery cancel did not confirm; leaving Shopify fulfillment intact\n');continue;}
  // 2. cancel the Shopify fulfillment
  const d=await g(`{orders(first:1,query:"name:${t.id}"){nodes{name displayFulfillmentStatus
    fulfillments(first:5){id status trackingInfo{number}}}}}`);
  const o=d.orders.nodes[0];
  const f=o.fulfillments.find(x=>x.trackingInfo.some(ti=>ti.number===t.awb)&&x.status!=='CANCELLED');
  if(!f){console.log('   no matching Shopify fulfillment to cancel\n');continue;}
  const c=await g(`mutation($id:ID!){fulfillmentCancel(id:$id){fulfillment{id status} userErrors{field message}}}`,{id:f.id});
  const e=c.fulfillmentCancel.userErrors;
  console.log(`   Shopify fulfillment ${f.id.split('/').pop()}: ${e.length?'ERR '+JSON.stringify(e):'now '+c.fulfillmentCancel.fulfillment.status}`);
  const v=await g(`{orders(first:1,query:"name:${t.id}"){nodes{displayFulfillmentStatus}}}`);
  console.log(`   order is now ${v.orders.nodes[0].displayFulfillmentStatus}\n`);
  await new Promise(s=>setTimeout(s,400));
}
