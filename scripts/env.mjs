import fs from 'fs';
const Q='"';
// The .env sits in the project root, one level up from scripts/. Resolved off this file's own
// location so a copy of the project works wherever it is checked out - the old hardcoded
// d:/Documents path meant every script failed on anyone else's machine. The absolute path is
// kept as a fallback for anything that still runs from the original folder.
const ROOT_ENV=new URL('../.env',import.meta.url);
const pick=()=>{
  for(const c of [ROOT_ENV,'d:/Documents/primo dropship flow/.env'])
    { try{ if(fs.existsSync(c)) return c; }catch{} }
  return ROOT_ENV;                                  // readFileSync below raises the real error
};
export function loadEnv(p){
  const src=p||pick();
  const out={};
  for(const line of fs.readFileSync(src,'utf8').split(/\r?\n/)){
    const i=line.indexOf('=');
    if(i<1) continue;
    const k=line.slice(0,i);
    if(!/^[A-Za-z0-9_]+$/.test(k)) continue;
    let v=line.slice(i+1).trim();
    if(v.length>1 && v[0]===Q && v[v.length-1]===Q) v=v.slice(1,-1);
    out[k]=v;
  }
  return out;
}
