import {loadEnv} from './env.mjs';
export const env=loadEnv();
export const BASE='https://track.delhivery.com';
export async function dl(path,{method='GET',body=null,headers={}}={}){
  const r=await fetch(BASE+path,{method,
    headers:{'Authorization':`Token ${env.DELHIVERY_API_TOKEN}`,'Accept':'application/json',...headers},
    body});
  const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;}
  return {status:r.status,ok:r.ok,body:j};
}
