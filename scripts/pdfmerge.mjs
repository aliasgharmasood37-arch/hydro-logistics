import {readFileSync, writeFileSync} from 'node:fs';

// ---- minimal merger for classic-xref PDFs (no ObjStm / XRef streams) ----
function parse(buf) {
  const s = buf.toString('latin1');
  const sx = s.lastIndexOf('startxref');
  const xrefOff = parseInt(s.slice(sx + 9).trim(), 10);
  const offsets = {};
  // parse xref table(s), following /Prev
  let off = xrefOff;
  const seenX = new Set();
  let trailerRoot = null;
  while (off != null && !seenX.has(off)) {
    seenX.add(off);
    if (s.slice(off, off + 4) !== 'xref') throw new Error('xref not at ' + off);
    let p = off + 4;
    const lines = () => { const m = /^\s*(\d+)\s+(\d+)\s*\n/.exec(s.slice(p, p + 40)); return m; };
    let m;
    while ((m = lines())) {
      const start = +m[1], count = +m[2]; p += m[0].length;
      for (let i = 0; i < count; i++) {
        const e = s.slice(p, p + 20); p += 20;
        const em = /^(\d{10}) (\d{5}) ([nf])/.exec(e);
        if (!em) throw new Error('bad xref entry');
        if (em[3] === 'n' && !(start + i in offsets)) offsets[start + i] = +em[1];
      }
    }
    const tEnd = s.indexOf('startxref', p);
    const trailer = s.slice(s.indexOf('trailer', p), tEnd);
    if (!trailerRoot) { const r = /\/Root\s+(\d+)\s+0\s+R/.exec(trailer); if (r) trailerRoot = +r[1]; }
    const pv = /\/Prev\s+(\d+)/.exec(trailer);
    off = pv ? +pv[1] : null;
  }
  // read each object into {dict, stream}
  const objs = {};
  const readObj = num => {
    if (objs[num]) return objs[num];
    const o = offsets[num]; if (o == null) return null;
    const hm = new RegExp('^\\s*' + num + '\\s+\\d+\\s+obj').exec(s.slice(o, o + 40));
    if (!hm) throw new Error('obj ' + num + ' not at offset ' + o);
    let p = o + hm[0].length;
    const endobj = s.indexOf('endobj', p);
    const streamKw = s.indexOf('stream', p);
    let dict, stream = null;
    if (streamKw !== -1 && streamKw < endobj) {
      dict = s.slice(p, streamKw);
      let lm = /\/Length\s+(\d+)(\s+0\s+R)?/.exec(dict);
      if (!lm) throw new Error('stream without Length in obj ' + num);
      let len = +lm[1];
      if (lm[2]) { const lo = readObj(len); len = parseInt(lo.dict.trim(), 10); }
      let ds = streamKw + 6;
      if (s[ds] === '\r') ds++; if (s[ds] === '\n') ds++;
      stream = buf.subarray(ds, ds + len);
    } else dict = s.slice(p, endobj);
    return (objs[num] = {dict: dict.trim(), stream});
  };
  for (const n of Object.keys(offsets)) readObj(+n);
  return {objs, root: trailerRoot};
}

const files = process.argv.slice(2, -1), outPath = process.argv[process.argv.length - 1];
const out = []; // [{dict, stream}] with final numbering starting at 3
const pageRefs = [];
let next = 3;
for (const f of files) {
  const {objs, root} = parse(readFileSync(f));
  const cat = objs[root];
  const pagesNum = +/\/Pages\s+(\d+)\s+0\s+R/.exec(cat.dict)[1];
  const pagesObj = objs[pagesNum];
  const inherit = {};
  for (const k of ['MediaBox', 'Resources', 'CropBox', 'Rotate']) {
    const m = new RegExp('/' + k + '\\s*(\\[[^\\]]*\\]|<<[\\s\\S]*?>>|\\d+\\s+0\\s+R|\\d+)').exec(pagesObj.dict);
    if (m) inherit[k] = m[1];
  }
  const kids = [...pagesObj.dict.matchAll(/(\d+)\s+0\s+R/g)].map(m => +m[1]).filter(n => /\/Type\s*\/Page\b/.test(objs[n]?.dict || '') && !/\/Type\s*\/Pages\b/.test(objs[n].dict));
  const map = {};
  for (const n of Object.keys(objs).map(Number)) {
    if (n === root || n === pagesNum) continue;
    map[n] = next++;
  }
  const renum = d => d.replace(/(\d+)\s+0\s+R\b/g, (m, n) => (map[+n] != null ? map[+n] + ' 0 R' : m));
  for (const n of Object.keys(map).map(Number)) {
    let dict = renum(objs[n].dict);
    if (kids.includes(n)) {
      dict = dict.replace(/\/Parent\s+\d+\s+0\s+R/, '/Parent 2 0 R');
      if (!/\/Parent/.test(dict)) dict = dict.replace(/>>\s*$/, ' /Parent 2 0 R >>');
      for (const [k, v] of Object.entries(inherit)) if (!new RegExp('/' + k + '\\b').test(dict)) dict = dict.replace(/>>\s*$/, ' /' + k + ' ' + renum(v) + ' >>');
      pageRefs.push(map[n]);
    }
    out[map[n]] = {dict, stream: objs[n].stream};
  }
}
// assemble
const parts = []; let pos = 0; const xref = [];
const push = b => { parts.push(b); pos += b.length; };
push(Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1'));
const objBuf = (n, dict, stream) => {
  const head = Buffer.from(n + ' 0 obj\n' + dict + (stream ? '\nstream\n' : '\n'), 'latin1');
  return stream ? Buffer.concat([head, stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]) : Buffer.concat([head, Buffer.from('endobj\n', 'latin1')]);
};
xref[1] = pos; push(objBuf(1, '<< /Type /Catalog /Pages 2 0 R >>'));
xref[2] = pos; push(objBuf(2, '<< /Type /Pages /Kids [' + pageRefs.map(r => r + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>'));
for (let n = 3; n < next; n++) { xref[n] = pos; push(objBuf(n, out[n].dict, out[n].stream)); }
const xrefPos = pos;
let xs = 'xref\n0 ' + next + '\n0000000000 65535 f \n';
for (let n = 1; n < next; n++) xs += String(xref[n]).padStart(10, '0') + ' 00000 n \n';
xs += 'trailer\n<< /Size ' + next + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
push(Buffer.from(xs, 'latin1'));
const result = Buffer.concat(parts);
writeFileSync(outPath, result);
console.log('wrote ' + outPath + ': ' + pageRefs.length + ' pages, ' + (next - 1) + ' objects, ' + result.length + ' bytes');

// self-check: re-parse the output with the same parser and count pages under the root
const chk = parse(result);
const pg = Object.values(chk.objs).filter(o => /\/Type\s*\/Page\b/.test(o.dict) && !/\/Type\s*\/Pages\b/.test(o.dict)).length;
const kidsCount = +/\/Count\s+(\d+)/.exec(chk.objs[2].dict)[1];
console.log('self-check: re-parsed OK, ' + pg + ' page objects, Pages /Count ' + kidsCount + ', all ' + Object.keys(chk.objs).length + ' xref offsets resolve');
