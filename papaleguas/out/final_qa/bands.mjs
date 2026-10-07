import { readFileSync } from 'node:fs';
const rd = (f) => { const b = readFileSync(f); const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34); let o = 12; while (b.toString('latin1', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4); const d = b.subarray(o + 8, o + 8 + b.readUInt32LE(o + 4)); const n = 720000; const m = new Float64Array(n); for (let i = 0; i < n; i++) m[i] = fmt === 3 ? (d.readFloatLE(i * 8) + d.readFloatLE(i * 8 + 4)) / 2 : (d.readInt16LE(i * 4) + d.readInt16LE(i * 4 + 2)) / 65536; return m; };
const D = rd('final_qa/decoded_audio.wav'), M = rd('audio_qa/audio.wav');
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
const N = 4096, edges = [0, 250, 1000, 4000, 8000, 12000, 14000, 16000, 18000, 20000, 24000];
const eM = new Float64Array(edges.length - 1), eD = new Float64Array(edges.length - 1), eR = new Float64Array(edges.length - 1);
for (let s = 0; s + N <= 720000; s += N) {
  const w = i => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const spec = x => { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * w(i); fft(re, im); return [re, im]; };
  const [mr, mi] = spec(M), [dr, di] = spec(D);
  for (let k = 1; k < N / 2; k++) { const f = k * 48000 / N; const b = edges.findIndex((e, j) => f >= e && f < edges[j + 1]); eM[b] += mr[k] ** 2 + mi[k] ** 2; eD[b] += dr[k] ** 2 + di[k] ** 2; eR[b] += (dr[k] - mr[k]) ** 2 + (di[k] - mi[k]) ** 2; }
}
const db = x => 10 * Math.log10(x + 1e-30);
const tot = eM.reduce((a, b) => a + b);
console.log('band Hz          master(dB rel total)  decoded/master dB   band SNR dB');
for (let b = 0; b < eM.length; b++) console.log(`${edges[b]}-${edges[b + 1]}`.padEnd(14), db(eM[b] / tot).toFixed(1).padStart(8), (db(eD[b]) - db(eM[b])).toFixed(1).padStart(12), (db(eM[b]) - db(eR[b])).toFixed(1).padStart(12));
let mx = 0, at = 0; for (let i = 0; i < 720000; i++) { const r = Math.abs(D[i] - M[i]); if (r > mx) { mx = r; at = i; } }
console.log('mono residual peak', (20 * Math.log10(mx)).toFixed(1), 'dBFS at', (at / 48000).toFixed(3), 's');
