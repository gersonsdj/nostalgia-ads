// Analysis of out/audio/audio.wav (no deps). Usage: node out/audio/analyze.mjs [wav]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { CUES, DURATION } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
const wavPath = process.argv[2] || join(HERE, 'audio.wav');

// ---------- WAV
const b = readFileSync(wavPath);
let off = 12, fmt = null, data = null;
while (off < b.length) {
  const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
  if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
  if (id === 'data') data = { o: off + 8, sz };
  off += 8 + sz + (sz & 1);
}
const { ch, sr } = fmt, n = data.sz / 2 / ch;
const chs = Array.from({ length: ch }, () => new Float32Array(n));
let clip = 0;
for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
  const v = b.readInt16LE(data.o + (i * ch + c) * 2);
  if (v >= 32767 || v <= -32767) clip++;
  chs[c][i] = v / 32768;
}
const L = chs[0], R = chs[ch > 1 ? 1 : 0];
const db = (x) => 20 * Math.log10(Math.max(x, 1e-10));
let peak = 0;
for (const c of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));

// ---------- loudness (BS.1770 K-weighting, gated)
function coefs(type, fc, Q, G) {
  const A = 10 ** (G / 40), w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Q), cw = Math.cos(w0);
  let bb, a;
  if (type === 'shelf') {
    const s = 2 * Math.sqrt(A) * al;
    bb = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)];
    a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s];
  } else { bb = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]; }
  return { b: bb.map((v) => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] };
}
function filt(x, { b: bb, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = bb[0] * x[i] + bb[1] * x1 + bb[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const K = chs.map((x) => filt(filt(x, coefs('shelf', 1500, 1 / Math.SQRT2, 4)), coefs('hp', 38, 0.5, 0)));
const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
for (let s = 0; s + blk <= n; s += hop) { let sum = 0; for (const c of K) { let e = 0; for (let i = s; i < s + blk; i++) e += c[i] * c[i]; sum += e / blk; } z.push(sum); }
const LU = (e) => -0.691 + 10 * Math.log10(e);
const za = z.filter((e) => LU(e) > -70), relG = LU(za.reduce((p, e) => p + e, 0) / za.length) - 10;
const zg = za.filter((e) => LU(e) > relG);
const integrated = LU(zg.reduce((p, e) => p + e, 0) / zg.length);
const momentaryMax = Math.max(...z.map(LU));

// ---------- true peak (4x windowed sinc)
let tp = 0;
{
  const T = 8;
  for (const c of chs) for (let i = T; i < n - T; i++) {
    tp = Math.max(tp, Math.abs(c[i]));
    for (let p = 1; p < 4; p++) {
      const fr = p / 4; let y = 0;
      for (let k = -T + 1; k <= T; k++) { const x = k - fr, w = 0.5 + 0.5 * Math.cos(Math.PI * x / T); y += c[i + k] * Math.sin(Math.PI * x) / (Math.PI * x) * w; }
      tp = Math.max(tp, Math.abs(y));
    }
  }
}

// ---------- RMS table per 0.125 s
const W8 = Math.round(0.125 * sr), rmsRows = [];
for (let s = 0; s + W8 <= n; s += W8) {
  let e = 0; for (let i = s; i < s + W8; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2;
  rmsRows.push({ t: s / sr, db: db(Math.sqrt(e / W8)) });
}

// ---------- FFT
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, bb = a + len / 2; const tr = re[bb] * cr - im[bb] * ci, ti = re[bb] * ci + im[bb] * cr; re[bb] = re[a] - tr; im[bb] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
const mono = new Float32Array(n); for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
function stft(N, H) {
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const frames = [];
  for (let s = 0; s + N <= n; s += H) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    const mag = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]) / (N / 4);
    frames.push({ t: (s + N / 2) / sr, mag });
  }
  return frames;
}

// ---------- onsets: spectral flux 300 Hz – 8 kHz, 5 ms hop
const ON = stft(1024, 240), k0 = Math.round(300 * 1024 / sr), k1 = Math.round(8000 * 1024 / sr);
const flux = ON.map((f, i) => { if (!i) return 0; let s = 0; for (let k = k0; k < k1; k++) { const d = Math.log10(f.mag[k] + 1e-5) - Math.log10(ON[i - 1].mag[k] + 1e-5); if (d > 0) s += d; } return s; });
const sorted = [...flux].sort((a, c) => a - c), med = sorted[Math.floor(sorted.length / 2)] || 1e-9;
const eAt = (t0, t1) => { const a = Math.max(0, Math.round(t0 * sr)), c = Math.min(n, Math.round(t1 * sr)); let e = 0; for (let i = a; i < c; i++) e += mono[i] * mono[i]; return db(Math.sqrt(e / Math.max(1, c - a))); };
const hf = filt(filt(mono, coefs('hp', 1500, 0.707, 0)), coefs('hp', 1500, 0.707, 0));
const hAt = (t0, t1) => { const a = Math.max(0, Math.round(t0 * sr)), c = Math.min(n, Math.round(t1 * sr)); let e = 0; for (let i = a; i < c; i++) e += hf[i] * hf[i]; return db(Math.sqrt(e / Math.max(1, c - a))); };
const cueList = [];
for (const [k, v] of Object.entries(CUES)) {
  if (k === 'keyInterval') continue;
  if (Array.isArray(v)) v.forEach((t, i) => cueList.push([`${k}[${i}]`, t])); else cueList.push([k, v]);
}
cueList.sort((a, c) => a[1] - c[1]);
const onsetRows = cueList.map(([name, t]) => {
  let best = 0, bt = 0;
  ON.forEach((f, i) => { if (Math.abs(f.t - t) <= 0.03 && flux[i] > best) { best = flux[i]; bt = f.t - t; } });
  return { name, t, fluxX: best / med, dtMs: Math.round(bt * 1000), jumpDb: eAt(t, t + 0.03) - eAt(t - 0.04, t - 0.005), hfJumpDb: hAt(t, t + 0.03) - hAt(t - 0.04, t - 0.005) };
});

// ---------- mono compatibility
let eS = 0, eM = 0, eD = 0, xLR = 0, eL = 0, eR = 0;
for (let i = 0; i < n; i++) { eS += (L[i] * L[i] + R[i] * R[i]) / 2; eM += mono[i] * mono[i]; const d = (L[i] - R[i]) / 2; eD += d * d; xLR += L[i] * R[i]; eL += L[i] * L[i]; eR += R[i] * R[i]; }
const corr = xLR / Math.sqrt(eL * eR);

// ---------- tail
const tail = (t0, t1) => { let m = 0; for (let i = Math.round(t0 * sr); i < Math.min(n, Math.round(t1 * sr)); i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); return m; };

// ---------- band energy per scene part (phone band share)
const SP = stft(2048, 480);
function bandShare(t0, t1) {
  let tot = 0, phone = 0, sub = 0;
  for (const f of SP) { if (f.t < t0 || f.t >= t1) continue; f.mag.forEach((m, k) => { const hz = k * sr / 2048, e = m * m; tot += e; if (hz >= 300 && hz <= 6000) phone += e; if (hz < 120) sub += e; }); }
  return { phonePct: Math.round(100 * phone / tot), subPct: Math.round(100 * sub / tot) };
}

// ---------- spectrogram PNG
function png(w, h, rgb) {
  const crcT = new Int32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, d) => { const t = Buffer.concat([Buffer.from(type), d]); const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); t.copy(o, 4); o.writeUInt32BE(crc(t), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
{
  const PX_PER_S = 100, Wd = Math.round(DURATION * PX_PER_S), Hs = 400, TOP = 14, Hd = Hs + TOP + 8;
  const img = Buffer.alloc(Wd * Hd * 3);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= Wd || y >= Hd) return; const o = (y * Wd + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const stops = [[0, [0, 0, 0]], [0.25, [20, 10, 90]], [0.5, [160, 20, 130]], [0.72, [240, 110, 30]], [0.9, [255, 220, 60]], [1, [255, 255, 255]]];
  const cmap = (v) => { v = Math.max(0, Math.min(1, v)); for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [c, cc] = stops[i]; const u = (v - a) / (c - a); return ca.map((x, j) => Math.round(x + (cc[j] - x) * u)); } return [255, 255, 255]; };
  const fLo = 40, fHi = 16000;
  for (let x = 0; x < Wd; x++) {
    const t = (x + 0.5) / PX_PER_S;
    let fi = 0, bd = 1e9; SP.forEach((f, i) => { const d = Math.abs(f.t - t); if (d < bd) { bd = d; fi = i; } });
    const mag = SP[fi].mag;
    for (let y = 0; y < Hs; y++) {
      const hz = fLo * Math.pow(fHi / fLo, 1 - (y + 0.5) / Hs), k = Math.min(mag.length - 1, Math.round(hz * 2048 / sr));
      put(x, TOP + y, cmap((db(mag[k]) + 100) / 75));
    }
  }
  for (const [name, t] of cueList) { const x = Math.round(t * PX_PER_S); const c = name.startsWith('keyTimes') ? [80, 255, 120] : [255, 255, 255]; for (let y = 0; y < TOP - 2; y++) put(x, y, c); }
  for (let s = 0; s <= DURATION; s++) for (let y = Hs + TOP; y < Hd; y++) put(s * PX_PER_S, y, [200, 200, 200]);
  for (const hz of [100, 300, 1000, 3000, 6000, 10000]) { const y = TOP + Math.round(Hs * (1 - Math.log(hz / fLo) / Math.log(fHi / fLo))); for (let x = 0; x < Wd; x += 6) put(x, y, [90, 90, 90]); }
  writeFileSync(join(HERE, 'spectrogram.png'), png(Wd, Hd, img));
}

// ---------- report
const out = [];
out.push(`file ${wavPath}`);
out.push(`duration ${(n / sr).toFixed(4)} s (expected ${DURATION}) samples=${n} channels=${ch} sr=${sr}`);
out.push(`sample peak ${db(peak).toFixed(2)} dBFS | true peak ${db(tp).toFixed(2)} dBTP | clipped samples ${clip}`);
out.push(`integrated loudness ${integrated.toFixed(2)} LUFS | max momentary(400ms) ${momentaryMax.toFixed(2)} LUFS`);
out.push(`mono: sum-vs-stereo energy ${(10 * Math.log10(eM / eS)).toFixed(2)} dB | side/stereo ${(10 * Math.log10(eD / eS)).toFixed(1)} dB | L/R corr ${corr.toFixed(3)}`);
out.push(`tail max |x|: 14.8-14.9 ${tail(14.8, 14.9).toExponential(2)} | 14.9-15.0 ${tail(14.9, 15.0).toExponential(2)}`);
for (const [a, c] of [[0, 1], [1.5, 2.5], [2.5, 3], [3, 7.25], [7.25, 8], [8, 12], [12, 14], [14, 15]]) { const s = bandShare(a, c); out.push(`band ${a}-${c}s: 300Hz-6kHz ${s.phonePct}%  <120Hz ${s.subPct}%  rms ${eAt(a, c).toFixed(1)} dBFS`); }
out.push('\nRMS per 0.125 s (dBFS):');
for (let i = 0; i < rmsRows.length; i += 4) out.push(rmsRows.slice(i, i + 4).map((r) => `${r.t.toFixed(3).padStart(6)} ${r.db.toFixed(1).padStart(6)} ${'#'.repeat(Math.max(0, Math.round((r.db + 50) / 2))).padEnd(22)}`).join(' '));
out.push('\nCue onsets (spectral flux 300-8k within ±30 ms, x median; energy jump dB):');
for (const r of onsetRows) out.push(`${r.name.padEnd(14)} ${r.t.toFixed(3).padStart(6)}  flux x${r.fluxX.toFixed(1).padStart(6)} @${String(r.dtMs).padStart(4)}ms  jump ${r.jumpDb.toFixed(1).padStart(6)} dB  >1.5k jump ${r.hfJumpDb.toFixed(1).padStart(6)} dB`);
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'report.txt'), txt);
writeFileSync(join(HERE, 'analysis.json'), JSON.stringify({ duration: n / sr, ch, sr, peakDb: db(peak), truePeakDb: db(tp), clip, integrated, monoDb: 10 * Math.log10(eM / eS), corr, tail: tail(14.9, 15), onsetRows, rmsRows }, null, 1));
