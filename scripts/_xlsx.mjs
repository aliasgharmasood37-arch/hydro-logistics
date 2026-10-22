// Zero-dependency XLSX read/write (repo rule: plain Node, no deps).
// An .xlsx is a ZIP of XML parts, so we parse the ZIP ourselves. When we write we copy every
// part we did not touch straight through — the template's styles, dropdowns, hidden lookup
// sheets and instruction tabs survive untouched, which a from-scratch writer would destroy.
import zlib from 'zlib';

const TBL=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
export function crc32(buf){let c=-1;for(let i=0;i<buf.length;i++)c=TBL[(c^buf[i])&0xFF]^(c>>>8);return (c^-1)>>>0;}

export function readZip(buf){
  let eo=-1;
  for(let i=buf.length-22;i>=0&&i>buf.length-22-65536;i--) if(buf.readUInt32LE(i)===0x06054b50){eo=i;break;}
  if(eo<0) throw new Error('not a zip / EOCD not found');
  const n=buf.readUInt16LE(eo+10); let p=buf.readUInt32LE(eo+16);
  const out=new Map();
  for(let i=0;i<n;i++){
    if(buf.readUInt32LE(p)!==0x02014b50) throw new Error('bad central directory at '+p);
    const method=buf.readUInt16LE(p+10), csize=buf.readUInt32LE(p+20);
    const fnLen=buf.readUInt16LE(p+28), exLen=buf.readUInt16LE(p+30), cmLen=buf.readUInt16LE(p+32);
    const lho=buf.readUInt32LE(p+42);
    const name=buf.toString('utf8',p+46,p+46+fnLen);
    const lfn=buf.readUInt16LE(lho+26), lex=buf.readUInt16LE(lho+28), ds=lho+30+lfn+lex;
    const raw=buf.subarray(ds,ds+csize);
    out.set(name, method===0?Buffer.from(raw):zlib.inflateRawSync(raw));
    p+=46+fnLen+exLen+cmLen;
  }
  return out;
}

export function writeZip(entries){
  const DT=24576, DD=((2026-1980)<<9)|(9<<5)|28;   // a valid DOS timestamp; zero is not
  const locals=[], central=[]; let off=0;
  for(const [name,dataRaw] of entries){
    const data=Buffer.isBuffer(dataRaw)?dataRaw:Buffer.from(dataRaw,'utf8');
    const nb=Buffer.from(name,'utf8'), body=zlib.deflateRawSync(data,{level:9}), crc=crc32(data);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0x0800,6);
    lh.writeUInt16LE(8,8); lh.writeUInt16LE(DT,10); lh.writeUInt16LE(DD,12);
    lh.writeUInt32LE(crc,14); lh.writeUInt32LE(body.length,18); lh.writeUInt32LE(data.length,22);
    lh.writeUInt16LE(nb.length,26); lh.writeUInt16LE(0,28);
    locals.push(lh,nb,body);
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6); cd.writeUInt16LE(0x0800,8);
    cd.writeUInt16LE(8,10); cd.writeUInt16LE(DT,12); cd.writeUInt16LE(DD,14);
    cd.writeUInt32LE(crc,16); cd.writeUInt32LE(body.length,20); cd.writeUInt32LE(data.length,24);
    cd.writeUInt16LE(nb.length,28); cd.writeUInt16LE(0,30); cd.writeUInt16LE(0,32);
    cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36); cd.writeUInt32LE(0,38); cd.writeUInt32LE(off,42);
    central.push(cd,nb);
    off+=lh.length+nb.length+body.length;
  }
  const cdBuf=Buffer.concat(central);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(entries.length,8); eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(cdBuf.length,12); eocd.writeUInt32LE(off,16);
  return Buffer.concat([...locals,cdBuf,eocd]);
}

// ---------- XML ----------
export const unesc=s=>String(s)
  .replace(/&#x([0-9a-fA-F]+);/g,(_,h)=>String.fromCodePoint(parseInt(h,16)))
  .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(+d))
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
  .replace(/&amp;/g,'&');
// Control characters other than tab/LF/CR are illegal in XML 1.0 and make Excel call the file corrupt.
export const esc=s=>String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export const colNum=a=>{let n=0;for(const c of a)n=n*26+(c.charCodeAt(0)-64);return n-1;};
export const colName=i=>{let s='';i++;while(i>0){const r=(i-1)%26;s=String.fromCharCode(65+r)+s;i=(i-r-1)/26;}return s;};

export function sharedStrings(zip){
  const b=zip.get('xl/sharedStrings.xml'); if(!b) return [];
  const xml=b.toString('utf8'); const out=[];
  for(const m of xml.matchAll(/<si[^>]*\/>|<si[^>]*>([\s\S]*?)<\/si>/g)){
    let s=''; for(const t of (m[1]||'').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s+=unesc(t[1]);
    out.push(s);
  }
  return out;
}

// Map sheet name -> part path, via workbook.xml + its rels.
export function sheets(zip){
  const wb=zip.get('xl/workbook.xml').toString('utf8');
  const rels=zip.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const rel={}; for(const m of rels.matchAll(/<Relationship\b([^>]*)\/>/g)){
    const id=(m[1].match(/Id="([^"]+)"/)||[])[1], tg=(m[1].match(/Target="([^"]+)"/)||[])[1];
    if(id&&tg) rel[id]=tg.startsWith('/')?tg.slice(1):('xl/'+tg.replace(/^\.\//,''));
  }
  const out=[];
  for(const m of wb.matchAll(/<sheet\b([^>]*)\/>/g)){
    const a=m[1];
    out.push({name:unesc((a.match(/name="([^"]*)"/)||[])[1]||''),
              sheetId:(a.match(/sheetId="([^"]*)"/)||[])[1],
              state:(a.match(/state="([^"]*)"/)||[])[1]||'visible',
              path:rel[(a.match(/r:id="([^"]+)"/)||[])[1]]});
  }
  return out;
}

export function sheetRows(xml,ss){
  const rows=[];
  for(const rm of xml.matchAll(/<row\b([^>]*)(?:\/>|>([\s\S]*?)<\/row>)/g)){
    const r=+((rm[1].match(/\br="(\d+)"/)||[])[1]||0)-1; if(r<0) continue;
    const cells=[];
    for(const cm of (rm[2]||'').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const attrs=cm[1], inner=cm[2]||'';
      const ref=(attrs.match(/\br="([A-Z]+)\d+"/)||[])[1];
      const t=(attrs.match(/\bt="([^"]+)"/)||[])[1];
      let v='';
      if(t==='inlineStr'){ for(const tm of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) v+=unesc(tm[1]); }
      else { const vm=inner.match(/<v>([\s\S]*?)<\/v>/); if(vm){ v=unesc(vm[1]); if(t==='s') v=ss[+v]??''; } }
      if(ref) cells[colNum(ref)]=v; else cells.push(v);
    }
    rows[r]=cells;
  }
  for(let i=0;i<rows.length;i++) if(!rows[i]) rows[i]=[];
  return rows;
}

// Build <row> XML for `rows`, pushing every string into the shared-string table `strings`
// (an array that this mutates, plus an index Map). Shared strings rather than inline ones:
// it is the form Excel itself emits, so the least adventurous uploader on the far side can
// still read it. Numbers stay numeric so the marketplace parses the price as a price.
export function sheetRowsXml(rows,{startRow=1,strings,index}={}){
  const sid=s=>{ if(index.has(s)) return index.get(s); const i=strings.length; strings.push(s); index.set(s,i); return i; };
  const out=[];
  rows.forEach((cells,i)=>{
    const r=startRow+i;
    out.push(`<row r="${r}">`);
    cells.forEach((v,c)=>{
      if(v===null||v===undefined||v==='') return;
      const ref=colName(c)+r;
      if(typeof v==='number'&&Number.isFinite(v)) out.push(`<c r="${ref}"><v>${v}</v></c>`);
      else out.push(`<c r="${ref}" t="s"><v>${sid(String(v))}</v></c>`);
    });
    out.push('</row>');
  });
  return out.join('');
}

export function buildSharedStrings(strings){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">`
    +strings.map(s=>`<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')
    +'</sst>';
}

// Replace a worksheet's <sheetData> in place, keeping every other element of that sheet part
// (column widths, data validations, merges, autofilter) exactly as the template had them.
export function replaceSheetData(xml,newData){
  if(/<sheetData\s*\/>/.test(xml)) return xml.replace(/<sheetData\s*\/>/,newData);
  if(/<sheetData[^>]*>[\s\S]*?<\/sheetData>/.test(xml)) return xml.replace(/<sheetData[^>]*>[\s\S]*?<\/sheetData>/,newData);
  throw new Error('no <sheetData> in sheet part');
}
