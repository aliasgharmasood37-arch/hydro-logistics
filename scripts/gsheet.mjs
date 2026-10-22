// Google Sheets REST access for Hydro Customs.
// There is no Google credential in .env - the Sheets OAuth credential lives only inside
// n8n (EhZhTcHMDecQUIz0). n8n has no "run workflow" endpoint, so each call clones a
// throwaway workflow behind a temporary webhook, fires it, and always deletes it again.
// See CLAUDE.md 6 and BOT-SPEC.md 3.
import {loadEnv} from './env.mjs';
const env=loadEnv();
// The n8n settings are read LAZILY, and a missing one is an error only when a sheet is
// actually touched. They used to be read at import time, where `N8N_BASE_URL.replace(...)` on
// an undefined value threw a TypeError before any code ran - so on an .env without the n8n
// keys (the logistics desk has shipping keys only, see logistics/CLAUDE.md) `xb-book.mjs`
// could not even START, although booking a parcel needs no sheet at all. Every caller of
// gapi() already handles a failure: xb-book prints the Ledger row to add by hand.
const H={'X-N8N-API-KEY':env.N8N_API_KEY,'Content-Type':'application/json','Accept':'application/json'};
const cfg=()=>{
  if(!env.N8N_BASE_URL||!env.N8N_API_KEY)
    throw new Error('no Google Sheets access from this copy: N8N_BASE_URL / N8N_API_KEY are not '
      +'in the .env, and the Sheets credential lives inside n8n. Nothing else is affected - '
      +'booking, quoting, cancelling and tracking do not use a sheet. Whatever row this was '
      +'going to write has to be added by hand; ask Ali for n8n access if you need the sheets.');
  const B=env.N8N_BASE_URL.replace(/\/$/,'');
  return {B,HOST:B.replace(/\/api\/v1$/,'')};
};
const CRED={googleSheetsOAuth2Api:{id:'EhZhTcHMDecQUIz0',name:'Google Sheets account'}};

export async function gapi(method,url,body=null){
  const {B,HOST}=cfg();
  const path='tmp-gs-'+Math.random().toString(36).slice(2,10);
  const params={method,url,authentication:'predefinedCredentialType',
    nodeCredentialType:'googleSheetsOAuth2Api',options:{}};
  if(body!==null){params.sendBody=true;params.specifyBody='json';
    params.jsonBody=typeof body==='string'?body:JSON.stringify(body);}
  let wfId=null;
  try{
    const wf={name:'TEMP RUNNER · gsheet (delete me)',
      nodes:[
       {id:'hook',name:'Hook',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],
        webhookId:path,parameters:{httpMethod:'GET',path,responseMode:'lastNode',options:{}}},
       {id:'req',name:'Call',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[240,0],
        parameters:params,credentials:CRED}],
      connections:{Hook:{main:[[{node:'Call',type:'main',index:0}]]}},settings:{}};
    const j=await (await fetch(`${B}/workflows`,{method:'POST',headers:H,body:JSON.stringify(wf)})).json();
    if(!j.id) throw new Error('n8n create failed: '+JSON.stringify(j).slice(0,300));
    wfId=j.id;
    await fetch(`${B}/workflows/${wfId}/activate`,{method:'POST',headers:H});
    const resp=await fetch(`${HOST}/webhook/${path}`);
    const txt=await resp.text();
    let out=null; try{out=JSON.parse(txt);}catch{}
    if(resp.ok && out) return out;
    // pull the real error out of the execution record
    const ex=await (await fetch(`${B}/executions?workflowId=${wfId}&limit=1`,{headers:H})).json();
    const e=(ex.data||[])[0]; let detail=txt.slice(0,300);
    if(e){
      const full=await (await fetch(`${B}/executions/${e.id}?includeData=true`,{headers:H})).json();
      const rd=full.data&&full.data.resultData;
      const d=rd&&(rd.error&&(rd.error.description||rd.error.message));
      if(d) detail=String(d).slice(0,500);
    }
    throw new Error(`sheets ${method} failed (${resp.status}): ${detail}`);
  } finally {
    if(wfId){
      await fetch(`${B}/workflows/${wfId}/deactivate`,{method:'POST',headers:H});
      await fetch(`${B}/workflows/${wfId}`,{method:'DELETE',headers:H});
    }
  }
}
export const SHEET_ID='1Qa-Y9j1RZAmv7_lHScy5GZdRGpW-XH3XTwFsGWeCpmk';
export const TAB='Awaiting Dimensions';
export const values=range=>gapi('GET',
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
export const batchUpdate=reqs=>gapi('POST',
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,{requests:reqs});

// Ready Checklist — standing, never re-issued. `Ready` is a running balance the reconcile
// decrements by units actually shipped; every other column is recomputed from Shopify.
export const READY_SHEET_ID='1p9KtY_6atV9OSMIcp0eUi0TjPpwh1vea4pRpPl0-msg';
export const READY_TAB='Ready Checklist';
