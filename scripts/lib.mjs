import {loadEnv} from './env.mjs';
export const env=loadEnv();
export const VER='2026-07';
export async function token(){const r=await fetch(`https://${env.HYDRO_SHOPIFY_DOMAIN}/admin/oauth/access_token`,
 {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.HYDRO_SHOPIFY_CLIENT_ID,
 client_secret:env.HYDRO_SHOPIFY_CLIENT_SECRET,grant_type:'client_credentials'})});return (await r.json()).access_token;}
export function mk(tok){return async(q,v={})=>{for(let a=0;a<6;a++){
 const r=await fetch(`https://${env.HYDRO_SHOPIFY_DOMAIN}/admin/api/${VER}/graphql.json`,{method:'POST',
  headers:{'X-Shopify-Access-Token':tok,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});
 const j=await r.json();
 if(j.errors&&JSON.stringify(j.errors).includes('THROTTLED')){await new Promise(s=>setTimeout(s,2000*(a+1)));continue;}
 if(j.errors)throw new Error(JSON.stringify(j.errors));
 return j.data;} throw new Error('throttled out');};}
