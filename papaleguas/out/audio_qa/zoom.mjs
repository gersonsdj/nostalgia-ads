// Zoomed log-frequency spectrogram of a time range of the rendered WAV (no deps), cue ticks on top,
// 0.1 s grid below, 300/1k/3k/6k Hz guide lines. Usage:
//   node out/audio_qa/zoom.mjs <t0> <t1> [out.png] [wav] [channel: mono|L|R]
// -> out/audio_qa/zoom_<t0>_<t1>.png (default wav: out/audio/audio.wav)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { CUES } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
const T0 = Number(process.argv[2] ?? 0.9), T1 = Number(process.argv[3] ?? 3.1);
const outPath = process.argv[4] || join(HERE, `zoom_${T0}_${T1}.png`);
const wavPath = process.argv[5] || join(ROOT, 'out', 'audio', 'audio.wav');
const CH = process.argv[6] || 'mono';

const b = readFileSync(wavPath);
let off = 12, fmt = null, data = null;
while (off < b.length) {
  const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
  if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12) };
  if (id === 'data') data = { o: off + 8, sz };
  off += 8 + sz + (sz & 1);
}
const { ch, sr } = fmt, n = data.sz / 2 / ch;
const x = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const l = b.readInt16LE(data.o + i * ch * 2) / 32768, r = b.readInt16LE(data.o + (i * ch + (ch > 1 ? 1 : 0)) * 2) / 32768;
  x[i] = CH === 'L' ? l : CH === 'R' ? r : (l + r) / 2;
}
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, c = a + len / 2; const tr = re[c] * cr - im[c] * ci, ti = re[c] * ci + im[c] * cr; re[c] = re[a] - tr; im[c] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
function png(w, h, rgb) {
  const crcT = new Int32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, d) => { const t = Buffer.concat([Buffer.from(type), d]); const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); t.copy(o, 4); o.writeUInt32BE(crc(t), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const Wd = 1400, Hs = 520, TOP = 14, Hd = Hs + TOP + 10, N = 2048, fLo = 80, fHi = 16000;
const img = Buffer.alloc(Wd * Hd * 3);
const put = (px, py, c) => { if (px < 0 || py < 0 || px >= Wd || py >= Hd) return; const o = (py * Wd + px) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
const stops = [[0, [0, 0, 0]], [0.25, [20, 10, 90]], [0.5, [160, 20, 130]], [0.72, [240, 110, 30]], [0.9, [255, 220, 60]], [1, [255, 255, 255]]];
const cmap = (v) => { v = Math.max(0, Math.min(1, v)); for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [c, cc] = stops[i]; const u = (v - a) / (c - a); return ca.map((q, j) => Math.round(q + (cc[j] - q) * u)); } return [255, 255, 255]; };
const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
for (let px = 0; px < Wd; px++) {
  const t = T0 + (px + 0.5) / Wd * (T1 - T0), s = Math.round(t * sr) - N / 2;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = s + i; re[i] = (j >= 0 && j < n ? x[j] : 0) * win[i]; }
  fft(re, im);
  for (let py = 0; py < Hs; py++) {
    const hz = fLo * Math.pow(fHi / fLo, 1 - (py + 0.5) / Hs), k = Math.min(N / 2 - 1, Math.round(hz * N / sr));
    const mag = Math.hypot(re[k], im[k]) / (N / 4);
    put(px, TOP + py, cmap((20 * Math.log10(mag + 1e-10) + 100) / 80));
  }
}
const X = (t) => Math.round((t - T0) / (T1 - T0) * Wd);
for (const [k, v] of Object.entries(CUES)) for (const t of (Array.isArray(v) ? v : [v])) if (t >= T0 && t <= T1) for (let py = 0; py < TOP - 2; py++) put(X(t), py, k === 'keyTimes' ? [80, 255, 120] : [255, 255, 255]);
for (let t = Math.ceil(T0 * 10) / 10; t <= T1; t += 0.1) for (let py = Hs + TOP; py < Hd; py++) put(X(t), py, Math.abs(t - Math.round(t)) < 1e-6 ? [255, 255, 255] : [140, 140, 140]);
for (const hz of [300, 1000, 3000, 6000]) { const py = TOP + Math.round(Hs * (1 - Math.log(hz / fLo) / Math.log(fHi / fLo))); for (let px = 0; px < Wd; px += 5) put(px, py, [90, 200, 90]); }
writeFileSync(outPath, png(Wd, Hd, img));
console.log(`wrote ${outPath} (${T0}-${T1} s, ${CH})`);
