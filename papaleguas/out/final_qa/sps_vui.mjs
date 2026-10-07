// Parse the SPS in avcC and print the VUI colour signalling (range, primaries, transfer, matrix).
import { readFileSync } from 'node:fs';
const b = readFileSync(process.argv[2]);
const i = b.indexOf('avcC') + 4;
const spsLen = b.readUInt16BE(i + 6);
let sps = b.subarray(i + 8, i + 8 + spsLen);
const rb = []; for (let k = 0; k < sps.length; k++) { if (k >= 2 && sps[k] === 3 && sps[k - 1] === 0 && sps[k - 2] === 0) continue; rb.push(sps[k]); }
let pos = 8; const bit = () => (rb[pos >> 3] >> (7 - (pos++ & 7))) & 1;
const u = n => { let v = 0; for (let k = 0; k < n; k++) v = v * 2 + bit(); return v; };
const ue = () => { let z = 0; while (!bit()) z++; return (1 << z) - 1 + u(z); };
const se = () => { const v = ue(); return v & 1 ? (v + 1) / 2 : -v / 2; };
const profile = u(8); u(8); const level = u(8); ue();
if ([100, 110, 122, 244, 44, 83, 86, 118, 128].includes(profile)) { const cf = ue(); if (cf === 3) u(1); ue(); ue(); u(1); if (u(1)) throw new Error('scaling matrix not handled'); }
ue(); const poc = ue(); if (poc === 0) ue(); else if (poc === 1) { u(1); se(); se(); const n = ue(); for (let k = 0; k < n; k++) se(); }
const refs = ue(); u(1); const wm = ue(), hm = ue(); const fmo = u(1); if (!fmo) u(1); u(1);
if (u(1)) { ue(); ue(); ue(); ue(); }
const out = { profile, level, refs, w: (wm + 1) * 16, h: (hm + 1) * 16 };
if (u(1)) {
  if (u(1)) { const idc = u(8); if (idc === 255) { u(16); u(16); } }
  if (u(1)) u(1);
  if (u(1)) { out.videoFormat = u(3); out.fullRange = u(1); if (u(1)) { out.primaries = u(8); out.transfer = u(8); out.matrix = u(8); } else out.colourDescription = 'absent'; }
  else out.videoSignalType = 'absent';
  if (u(1)) { ue(); ue(); }
  if (u(1)) { out.timing = { num: u(32), den: u(32), fixed: u(1) }; }
} else out.vui = 'absent';
console.log(JSON.stringify(out));
