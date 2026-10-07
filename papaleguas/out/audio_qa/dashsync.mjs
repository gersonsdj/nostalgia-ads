// Picture-side sync probe for the dash pass-by: where is the dust cloud on each rendered frame?
// Reads the PNGs that snap.html wrote (default dir out/aqa_frames, frames 44-54 of visuals_a.js)
// and finds the live cloud by its ink rim colour (#6b4a3a, used only by dustCloud(); the hanging
// dust bank uses #b58b66). Prints per frame: bbox of the rim, its mean x, and the pan position
// (x - 540) / 540, then the interpolated time the cloud's centre crosses the frame centre.
//   node out/audio_qa/dashsync.mjs [dir]      (also writes out/audio_qa/dashsync.json, read by sync.mjs)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || join(HERE, '..', 'aqa_frames');
function decodePng(buf) {
  let o = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`unsupported PNG (bit depth ${bd}, colour type ${ct})`);
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const RIM = [0x6b, 0x4a, 0x3a];
const rows = [];
for (const f of readdirSync(DIR).filter((x) => /^t\d+\.\d+\.png$/.test(x)).sort()) {
  const { w, h, bpp, px } = decodePng(readFileSync(join(DIR, f)));
  let n = 0, sx = 0, x0 = w, x1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * bpp;
    if (px[i] === RIM[0] && px[i + 1] === RIM[1] && px[i + 2] === RIM[2]) { n++; sx += x; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  }
  const t = Number(f.slice(1, -4)), fr = Math.round(t * 30);
  rows.push({ f, t, frame: fr, n, mean: n ? sx / n : NaN, x0, x1, mid: n ? (x0 + x1) / 2 : NaN });
}
console.log('frame  t(s)    rim px   bbox x          bbox mid  mean x   pan(mean)');
for (const r of rows) {
  const fr = r.frame / 30;
  console.log(`${String(r.frame).padStart(5)}  ${fr.toFixed(4)}  ${String(r.n).padStart(6)}   ${r.n ? `${r.x0}-${r.x1}`.padEnd(14) : '-'.padEnd(14)}  ${r.n ? r.mid.toFixed(0).padStart(6) : '     -'}  ${r.n ? r.mean.toFixed(0).padStart(6) : '     -'}   ${r.n ? ((r.mean - 540) / 540).toFixed(2) : ''}`);
}
// crossing: first pair of consecutive frames whose mean x straddles 540
const ok = rows.filter((r) => r.n > 50), cross = {};
for (let i = 1; i < ok.length; i++) {
  const a = ok[i - 1], b = ok[i];
  for (const key of ['mean', 'mid']) {
    if (a[key] < 540 && b[key] >= 540) {
      const ta = a.frame / 30, tb = b.frame / 30, u = (540 - a[key]) / (b[key] - a[key]);
      // a frame is SHOWN for 1/30 s: interpolating between display midpoints gives the displayed crossing
      cross[key] = { between: [a.frame, b.frame], continuous: ta + u * (tb - ta), displayed: ta + 1 / 60 + u * (tb - ta) };
      console.log(`cloud ${key} x crosses the frame centre (540) between frame ${a.frame} and ${b.frame}: t = ${cross[key].continuous.toFixed(4)} s (frame-start times); displayed (frame-midpoint times) ${cross[key].displayed.toFixed(4)} s`);
    }
  }
}
writeFileSync(join(HERE, 'dashsync.json'), JSON.stringify({ dir: DIR, rows: rows.map((r) => ({ frame: r.frame, n: r.n, mean: r.mean, x0: r.x0, x1: r.x1, pan: r.n ? (r.mean - 540) / 540 : null })), cross }, null, 1));
