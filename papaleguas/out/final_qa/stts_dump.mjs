// Dump video track timing tables (mdhd timescale, stts, ctts, stss, elst) from an MP4.
import { readFileSync } from 'node:fs';
const b = readFileSync(process.argv[2]);
const C = new Set(['moov','trak','mdia','minf','stbl','edts']);
function walk(s, e, path, cb) { let o = s; while (o + 8 <= e) { let sz = b.readUInt32BE(o); const t = b.toString('latin1', o+4, o+8); let h = 8; if (sz === 1) { sz = Number(b.readBigUInt64BE(o+8)); h = 16; } else if (sz === 0) sz = e - o; cb(t, o+h, o+sz, path); if (C.has(t)) walk(o+h, o+sz, path.concat(t), cb); o += sz; } }
let trak = -1; const tr = [];
walk(0, b.length, [], (t, s, e) => {
  if (t === 'trak') { trak++; tr[trak] = {}; }
  const T = tr[trak];
  if (t === 'hdlr') T.h = b.toString('latin1', s+8, s+12);
  if (t === 'mdhd') { const v = b[s]; T.ts = b.readUInt32BE(s + (v ? 20 : 12)); }
  if (t === 'stts') { const n = b.readUInt32BE(s+4); T.stts = []; for (let i = 0; i < n; i++) T.stts.push([b.readUInt32BE(s+8+i*8), b.readUInt32BE(s+12+i*8)]); }
  if (t === 'ctts') { const n = b.readUInt32BE(s+4); T.ctts = []; for (let i = 0; i < n; i++) T.ctts.push([b.readUInt32BE(s+8+i*8), b.readInt32BE(s+12+i*8)]); }
  if (t === 'stss') { const n = b.readUInt32BE(s+4); T.stss = []; for (let i = 0; i < n; i++) T.stss.push(b.readUInt32BE(s+8+i*4)); }
  if (t === 'elst') { T.elst = b.subarray(s, e).toString('hex'); }
  if (t === 'stsz') { const n = b.readUInt32BE(s+8); T.sizes = []; for (let i = 0; i < n; i++) T.sizes.push(b.readUInt32BE(s+12+i*4)); }
  if (t === 'avcC') T.avcC = b.subarray(s, Math.min(e, s + 8)).toString('hex');
  if (t === 'colr') T.colr = b.subarray(s, e).toString('latin1', 0, 4) + ' ' + b.subarray(s+4, e).toString('hex');
});
for (const T of tr) {
  console.log(T.h, 'timescale', T.ts, 'stts', JSON.stringify(T.stts), 'ctts', T.ctts ? T.ctts.length + ' entries ' + JSON.stringify(T.ctts.slice(0, 6)) : 'none', 'stss', JSON.stringify(T.stss), 'elst', T.elst, 'avcC', T.avcC, 'colr', T.colr);
  if (T.sizes && T.h === 'vide') { const s = T.sizes; console.log('sizes KB min/avg/max', Math.min(...s)/1e3, (s.reduce((a,c)=>a+c,0)/s.length/1e3).toFixed(1), Math.max(...s)/1e3, 'idx max', s.indexOf(Math.max(...s))); }
}
const V = tr.find(T => T.h === 'vide');
if (process.argv[3]) { const [a, z] = process.argv[3].split('-').map(Number); console.log(V.sizes.slice(a, z + 1).map((s, i) => `${a + i}:${(s / 1e3).toFixed(0)}`).join(' ')); }
const per = []; for (let s = 0; s < 15; s++) per.push((V.sizes.slice(s * 30, s * 30 + 30).reduce((p, c) => p + c, 0) * 8 / 1e6).toFixed(1));
console.log('Mbit per second of video:', per.join(' '));
