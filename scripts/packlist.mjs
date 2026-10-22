import fs from 'fs';
import {token,mk} from './lib.mjs';
const g=mk(await token());
const IDS=['1565','1578','1607','1684','1715','1723','1753','1759','1773','1775'];
const Q=`query($q:String!){orders(first:30,query:$q){nodes{name
 shippingAddress{city province}
 lineItems(first:30){nodes{quantity title}}}}}`;
const got={};
for(let i=0;i<IDS.length;i+=15){
  const d=await g(Q,{q:IDS.slice(i,i+15).map(x=>`name:${x}`).join(' OR ')});
  d.orders.nodes.forEach(o=>got[o.name.replace(/[^0-9]/g,'')]=o);
}
const out=[];
out.push('*PACKING LIST — multi-product orders*');
out.push('Pack each order in ONE box.');
out.push('Write the box size (L x B x H in cm) next to each order.');
out.push('');
IDS.forEach(id=>{
  const o=got[id]; if(!o) return;
  const items=o.lineItems.nodes.reduce((s,l)=>s+l.quantity,0);
  out.push(`*#${id}* — ${o.shippingAddress?.city||''} (${items} items)`);
  o.lineItems.nodes.forEach(l=>out.push(`  ${l.quantity} x ${l.title}`));
  out.push('  BOX SIZE: ____ x ____ x ____ cm');
  out.push('');
});
out.push(`Total: ${IDS.length} orders`);
const txt=out.join('\n');
fs.writeFileSync('d:/Documents/primo dropship flow/packing-list-multiproduct.txt',txt,'utf8');
console.log(txt);
