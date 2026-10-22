// Quote XpressBees freight without an order: node scripts/xb-quote.mjs <pin> <L> <B> <H> [grams] [--cod <amount>]
// Box in cm. Read-only. The cheapest surface tier is marked ->.
import {xb,SURFACE_IDS} from './xb.mjs';
const a=process.argv.slice(2), ci=a.indexOf('--cod'), codAmt=ci>=0?a.splice(ci,2)[1]:null;
const [pin,grams]=[a[0],a[4]];
if(!a[3]){console.log('usage: xb-quote.mjs <pin> <L> <B> <H> [grams] [--cod <amount>]');process.exit(1);}
const [L,B,H]=a.slice(1,4).map(x=>Math.round(Number(x)));   // XpressBees takes whole cm only
const volG=L*B*H/5, dead=Number(grams||0), decl=Math.round(Math.max(dead,volG*0.8));
const r=await xb('/courier/serviceability',{method:'POST',body:{origin:'400010',destination:pin,payment_type:codAmt?'cod':'prepaid',
  order_amount:String(codAmt||1000),weight:String(decl),length:String(L),breadth:String(B),height:String(H)}});
const rows=(Array.isArray(r.body?.data)?r.body.data:[]).sort((x,y)=>x.total_charges-y.total_charges);
console.log(`400010 -> ${pin} · ${L}x${B}x${H} cm · dead ${dead||'?'} g · volumetric ${Math.round(volG)} g · ${codAmt?'COD ₹'+codAmt:'prepaid'}`);
if(!rows.length){console.log('NOT SERVICEABLE — '+JSON.stringify(r.body).slice(0,200));process.exit(1);}
const best=rows.find(x=>SURFACE_IDS.includes(String(x.id)));
rows.forEach(x=>console.log(`${x===best?'->':'  '} [${String(x.id).padEnd(5)}] ${String(x.name).padEnd(30)} ₹${x.total_charges}  (freight ${x.freight_charges} + cod ${x.cod_charges}, chargeable ${x.chargeable_weight} g)`));
