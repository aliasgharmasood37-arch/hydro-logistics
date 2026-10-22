// Remove booked orders from the Multipack Box Sizes sheet (tab "Awaiting Dimensions").
// Run this in the same turn as every multi-product AWB. Dry run first, then --go.
import {values, batchUpdate, TAB, SHEET_ID, gapi} from './gsheet.mjs';

const args=process.argv.slice(2);
const GO=args.includes('--go');
const targets=args.filter(a=>a!=='--go').map(a=>a.startsWith('#')?a:'#'+a);
if(!targets.length){console.error('give at least one order number');process.exit(1);}

// sheetId for the tab
const meta=await gapi('GET',`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`);
const sh=meta.sheets.find(s=>s.properties.title===TAB);
if(!sh) throw new Error('tab not found: '+TAB);
const sheetId=sh.properties.sheetId;

const rows=(await values(`${TAB}!A1:K600`)).values||[];
const blank=r=>!r||r.every(c=>String(c||'').trim()==='');

const blocks=[];
for(const t of targets){
  const start=rows.findIndex(r=>String(r?.[0]||'').trim()===t);
  if(start<0){console.log(`${t}  not on the sheet — skipped`);continue;}
  let end=start;
  for(let i=start;i<rows.length;i++){
    const line=(rows[i]||[]).join(' ');
    if(i>start && String(rows[i]?.[0]||'').trim().startsWith('#')) break;   // next order
    if(/FINAL SHIPPING BOX for /.test(line)){end=i;break;}
    end=i;
  }
  if(blank(rows[end+1])) end=end+1;   // swallow the one separator blank
  blocks.push({t,start,end});
}
blocks.sort((a,b)=>b.start-a.start);   // bottom-up so indices stay valid

for(const b of blocks){
  console.log(`\n${b.t}  rows ${b.start+1}-${b.end+1}`);
  for(let i=b.start;i<=b.end;i++) console.log('   | '+(rows[i]||[]).join(' | '));
}
if(!GO){console.log('\nDRY RUN — nothing deleted. Re-run with --go');process.exit(0);}

const reqs=blocks.map(b=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:b.start,endIndex:b.end+1}}}));
await batchUpdate(reqs);
console.log(`\nDeleted ${blocks.length} block(s).`);
