// XpressBees shipping-panel API client. Auth is the panel email+password -> JWT valid 3 h,
// minted once per run. See XPRESSBEES-API.md.
import {loadEnv} from './env.mjs';
export const env=loadEnv();
export const BASE='https://shipment.xpressbees.com/api';
let tok=null;
export async function xbToken(){
  if(tok) return tok;
  const r=await fetch(BASE+'/users/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:env.XPRESSBEES_EMAIL,password:env.XPRESSBEES_PASSWORD}),signal:AbortSignal.timeout(60000)});
  const j=await r.json().catch(()=>({}));
  if(j.status!==true||typeof j.data!=='string') throw new Error('xpressbees login failed: '+JSON.stringify(j).slice(0,200));
  return tok=j.data;
}
// HTTP codes lie here (404 for a validation error or an empty NDR list) — callers read body.status.
export async function xb(path,{method='GET',body=null}={}){
  const r=await fetch(BASE+path,{method,signal:AbortSignal.timeout(60000),
    headers:{'Authorization':`Bearer ${await xbToken()}`,'Content-Type':'application/json','Accept':'application/json'},
    body:body===null?undefined:JSON.stringify(body)});
  const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;}
  return {http:r.status,body:j};
}
export const trackUrl=awb=>`https://www.xpressbees.com/shipment/tracking?awbNo=${awb}`;
// Forward services we pick between: Surface 0.5 kg, 1, 2, 5, 10 kg tiers. Air (6), Same Day (12938),
// Next Day (12939) only when the owner asks; 8 is Express Reverse.
export const SURFACE_IDS=['1','12298','2','3','4'];
export const AIR_ID='6';
export const PICKUP={warehouse_name:'Hydro Customs',name:'Hydro Customs',
  address:'Galla no.18, Khajoor Compound, Opp Nagina Hotel',address_2:'2nd lane, Quay St, Darukhana',
  city:'Mumbai',state:'Maharashtra',pincode:'400010',phone:'8850231886',gst_number:'27AATFH6253R1ZC'};
