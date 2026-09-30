// Final-file audio + A/V QA (Node, no deps).
//   node out/final_qa/av_qa.mjs [decoded.wav] [master.wav]
// decoded = AAC track of the MP4 decoded in the browser (decode.html), master = out/audio_qa/audio.wav.
// Also reads out/audio_qa/raw_sfx.f32 (SFX stem, same timing as the master) for event onsets and
// out/final_qa/frames.json (per-frame luma/diff of the MP4 picture) for the picture side.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { CUES, FPS } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
const SR = 48000;
const args = process.argv.slice(2);
const DEC = resolve(args[0] || join(HERE, 'decoded_audio.wav'));
const MAS = resolve(args[1] || join(ROOT, 'out', 'audio_qa', 'audio.wav'));
const out = []; const log = (s = '') => { out.push(s); console.log(s); };
const db = x => 20 * Math.log10(Math.max(x, 1e-12));
const R = {};

function readWav(file) {
  const b = readFileSync(file); let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString('latin1', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + sz);
    o += 8 + sz + (sz & 1);
  }
  const n = data.length / (fmt.ch * fmt.bits / 8), ch = [];
  for (let c = 0; c < fmt.ch; c++) ch.push(new Float64Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
    const p = (i * fmt.ch + c) * fmt.bits / 8;
    ch[c][i] = fmt.tag === 3 ? data.readFloatLE(p) : data.readInt16LE(p) / 32768;
  }
  return { ...fmt, n, L: ch[0], R: ch[1] || ch[0] };
}
const mono = s => { const m = new Float64Array(s.n); for (let i = 0; i < s.n; i++) m[i] = (s.L[i] + s.R[i]) / 2; return m; };

function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const a = i + k, b2 = a + len / 2, tr = re[b2] * cr - im[b2] * ci, ti = re[b2] * ci + im[b2] * cr;
      re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
// lag k > 0  <=>  y[n+k] ~ x[n]  (decoded is LATE by k samples)
function xcorr(x, y, maxLag) {
  let N = 1; while (N < x.length + y.length) N <<= 1;
  const xr = new Float64Array(N), xi = new Float64Array(N), yr = new Float64Array(N), yi = new Float64Array(N);
  xr.set(x); yr.set(y); fft(xr, xi); fft(yr, yi);
  for (let i = 0; i < N; i++) { const r = yr[i] * xr[i] + yi[i] * xi[i], im = yi[i] * xr[i] - yr[i] * xi[i]; yr[i] = r; yi[i] = im; }
  fft(yr, yi, true);
  let best = -Infinity, bk = 0;
  const at = k => yr[(k + N) % N];
  for (let k = -maxLag; k <= maxLag; k++) if (at(k) > best) { best = at(k); bk = k; }
  const a = at(bk - 1), b = at(bk), c = at(bk + 1), frac = (a - c) / (2 * (a - 2 * b + c)) || 0;
  let ex = 0, ey = 0; for (const v of x) ex += v * v; for (const v of y) ey += v * v;
  return { lag: bk, frac: bk + frac, norm: best / Math.sqrt(ex * ey) };
}
function localLag(x, y, t0, t1, maxLag = 2400) {
  const a = Math.round(t0 * SR), b = Math.round(t1 * SR);
  const xs = x.subarray(a, b), ys = y.subarray(Math.max(0, a - maxLag), Math.min(y.length, b + maxLag));
  // direct search (window small)
  let best = -Infinity, bk = 0; const off = a - Math.max(0, a - maxLag);
  let ex = 0; for (const v of xs) ex += v * v;
  for (let k = -maxLag; k <= maxLag; k++) {
    let s = 0, ey = 0; for (let i = 0; i < xs.length; i++) { const j = i + off + k; if (j < 0 || j >= ys.length) continue; s += xs[i] * ys[j]; ey += ys[j] * ys[j]; }
    const nc = s / Math.sqrt(ex * ey + 1e-30); if (nc > best) { best = nc; bk = k; }
  }
  return { lag: bk, ms: bk / SR * 1000, nc: best };
}

const D = readWav(DEC), M = readWav(MAS);
log(`DECODED  ${DEC}\n  fmt ${D.tag === 3 ? 'float32' : 'pcm' + D.bits} ${D.ch}ch ${D.sr} Hz, ${D.n} frames = ${(D.n / D.sr).toFixed(5)} s`);
log(`MASTER   ${MAS}\n  fmt ${M.tag === 3 ? 'float32' : 'pcm' + M.bits} ${M.ch}ch ${M.sr} Hz, ${M.n} frames = ${(M.n / M.sr).toFixed(5)} s`);
R.decoded = { frames: D.n, seconds: D.n / D.sr }; R.master = { frames: M.n, seconds: M.n / M.sr };
const xm = mono(M), ym = mono(D);

// ---- 1. global offset
const g = xcorr(xm, ym, 4800);
log(`\n1. GLOBAL OFFSET (decoded vs master): ${g.lag} samples = ${(g.lag / SR * 1000).toFixed(3)} ms (sub-sample ${g.frac.toFixed(3)}), normalised corr ${g.norm.toFixed(5)}`);
log(`   sign: positive = decoded audio is LATE vs the master (i.e. vs the picture, since the master is picture-locked)`);
R.offset = { samples: g.lag, ms: g.lag / SR * 1000, sub: g.frac, corr: g.norm };
const L = g.lag;

// ---- 2. residual / SNR after alignment (least-squares gain), per channel
function snr(xc, yc) {
  let xy = 0, xx = 0, n0 = 0;
  const a = Math.max(0, -L), b = Math.min(M.n, D.n - L);
  for (let i = a; i < b; i++) { xy += xc[i] * yc[i + L]; xx += xc[i] * xc[i]; }
  const gain = xy / xx; let es = 0, er = 0, maxr = 0;
  for (let i = a; i < b; i++) { const r = yc[i + L] - gain * xc[i]; es += (gain * xc[i]) ** 2; er += r * r; maxr = Math.max(maxr, Math.abs(r)); n0++; }
  return { gain, gainDb: db(gain), snrDb: 10 * Math.log10(es / er), residRmsDb: db(Math.sqrt(er / n0)), residPeakDb: db(maxr) };
}
const sL = snr(M.L, D.L), sR = snr(M.R, D.R);
log(`\n2. RESIDUAL after alignment: L SNR ${sL.snrDb.toFixed(2)} dB (gain ${sL.gainDb.toFixed(3)} dB, resid rms ${sL.residRmsDb.toFixed(1)} dBFS, peak ${sL.residPeakDb.toFixed(1)} dBFS)`);
log(`                              R SNR ${sR.snrDb.toFixed(2)} dB (gain ${sR.gainDb.toFixed(3)} dB, resid rms ${sR.residRmsDb.toFixed(1)} dBFS, peak ${sR.residPeakDb.toFixed(1)} dBFS)`);
R.snr = { L: sL, R: sR };
// segmental SNR per 1 s
const seg = [];
for (let s = 0; s < 15; s++) {
  let es = 0, er = 0;
  for (let i = s * SR; i < (s + 1) * SR; i++) { const j = i + L; if (j < 0 || j >= D.n) continue; es += xm[i] ** 2; er += (ym[j] - sL.gain * xm[i]) ** 2; }
  seg.push(+(10 * Math.log10(es / (er + 1e-30))).toFixed(1));
}
log(`   segmental SNR per second (mono): ${seg.join(' ')}`);
R.segSnr = seg;

// ---- 3. loudness + true peak of the DECODED file
function bq(type, f, Q = Math.SQRT1_2) {
  const w0 = 2 * Math.PI * f / SR, al = Math.sin(w0) / (2 * Q), cw = Math.cos(w0); let b, a;
  if (type === 'hp') { b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]; } else { b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]; }
  return { b: b.map(v => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] };
}
function filt(x, { b, a }) { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
// BS.1770 K-weighting, exact 48 kHz coefficients
const SHELF = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] };
const RLB = { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] };
function loud(s) {
  const K = [filt(filt(s.L, SHELF), RLB), filt(filt(s.R, SHELF), RLB)];
  const blocks = (len, hop) => { const z = []; for (let st = 0; st + len <= s.n; st += hop) { let sum = 0; for (const c of K) { let e = 0; for (let i = st; i < st + len; i++) e += c[i] * c[i]; sum += e / len; } z.push(sum); } return z; };
  const LU = e => -0.691 + 10 * Math.log10(e);
  const z = blocks(0.4 * SR, 0.1 * SR);
  const za = z.filter(e => LU(e) > -70), rg = LU(za.reduce((p, e) => p + e, 0) / za.length) - 10, zg = za.filter(e => LU(e) > rg);
  const integ = LU(zg.reduce((p, e) => p + e, 0) / zg.length);
  const mom = Math.max(...z.map(LU));
  const st = blocks(3 * SR, 0.1 * SR).map(LU);
  const stG = st.filter(v => v > -70), sorted = [...stG].sort((a, b) => a - b);
  const relG = LU(blocks(3 * SR, 0.1 * SR).filter(e => LU(e) > -70).reduce((p, e, _, arr) => p + e / arr.length, 0)) - 20;
  const lraSet = sorted.filter(v => v > relG);
  const q = p => lraSet[Math.min(lraSet.length - 1, Math.floor(p * (lraSet.length - 1)))];
  return { integrated: integ, momentaryMax: mom, shortTermMax: Math.max(...st), lra: q(0.95) - q(0.10) };
}
// True peak: 4x oversampling, 48-tap-per-phase Kaiser-ish (Hann) windowed sinc, per BS.1770-4 annex spirit
function truePeak(c) {
  const T = 24; let tp = 0, sp = 0, tpAt = 0;
  const taps = []; for (let p = 0; p < 4; p++) { const f = p / 4, w = []; for (let k = -T + 1; k <= T; k++) { const x = k - f; const h = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); w.push(h * (0.5 + 0.5 * Math.cos(Math.PI * x / T))); } taps.push(w); }
  for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]); if (a > sp) sp = a; if (a > tp) { tp = a; tpAt = i; }
    if (i < T || i >= c.length - T) continue;
    for (let p = 1; p < 4; p++) { let y = 0; const w = taps[p]; for (let k = -T + 1, j = 0; k <= T; k++, j++) y += c[i + k] * w[j]; const ay = Math.abs(y); if (ay > tp) { tp = ay; tpAt = i + p / 4; } }
  }
  return { tp, sp, tpAt: tpAt / SR };
}
const ld = loud(D), lm = loud(M);
const tpD = [truePeak(D.L), truePeak(D.R)], tpM = [truePeak(M.L), truePeak(M.R)];
const TPd = Math.max(tpD[0].tp, tpD[1].tp), SPd = Math.max(tpD[0].sp, tpD[1].sp), TPm = Math.max(tpM[0].tp, tpM[1].tp), SPm = Math.max(tpM[0].sp, tpM[1].sp);
const tpAtD = tpD[0].tp >= tpD[1].tp ? tpD[0].tpAt : tpD[1].tpAt;
log(`\n3. LOUDNESS (BS.1770-4)          decoded MP4        master WAV`);
log(`   integrated                   ${ld.integrated.toFixed(2).padStart(8)} LUFS   ${lm.integrated.toFixed(2).padStart(8)} LUFS`);
log(`   momentary max (400 ms)       ${ld.momentaryMax.toFixed(2).padStart(8)} LUFS   ${lm.momentaryMax.toFixed(2).padStart(8)} LUFS`);
log(`   short-term max (3 s)         ${ld.shortTermMax.toFixed(2).padStart(8)} LUFS   ${lm.shortTermMax.toFixed(2).padStart(8)} LUFS`);
log(`   LRA                          ${ld.lra.toFixed(2).padStart(8)} LU     ${lm.lra.toFixed(2).padStart(8)} LU`);
log(`   sample peak                  ${db(SPd).toFixed(2).padStart(8)} dBFS   ${db(SPm).toFixed(2).padStart(8)} dBFS`);
log(`   true peak (4x)               ${db(TPd).toFixed(2).padStart(8)} dBTP   ${db(TPm).toFixed(2).padStart(8)} dBTP   (decoded max at ${tpAtD.toFixed(3)} s)`);
R.loudness = { decoded: { ...ld, samplePeakDb: db(SPd), truePeakDb: db(TPd), truePeakAt: tpAtD }, master: { ...lm, samplePeakDb: db(SPm), truePeakDb: db(TPm) } };
// TP overshoot distribution: how many 10 ms windows exceed -1 / -0.5 dBTP (sample-domain approx)
let over1 = 0, over05 = 0; for (const c of [D.L, D.R]) for (const v of c) { const a = Math.abs(v); if (a > 10 ** (-1 / 20)) over1++; if (a > 10 ** (-0.5 / 20)) over05++; }
log(`   decoded samples above -1 dBFS: ${over1}, above -0.5 dBFS: ${over05}`);

// ---- 4. head / clip / tail / duration
const rmsR = (x, t0, t1) => { const a = Math.max(0, Math.round(t0 * SR)), c = Math.min(x.length, Math.round(t1 * SR)); let e = 0; for (let i = a; i < c; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, c - a)); };
const firstNZ = (x, thr) => { for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) return i; return -1; };
const head = { dec0_5ms: db(rmsR(ym, 0, 0.005)), dec0_50ms: db(rmsR(ym, 0, 0.05)), mas0_50ms: db(rmsR(xm, 0, 0.05)), dec5_50: db(rmsR(ym, 0.005, 0.05)), mas5_50: db(rmsR(xm, 0.005, 0.05)),
  firstDec: firstNZ(ym, 10 ** (-60 / 20)), firstMas: firstNZ(xm, 10 ** (-60 / 20)) };
log(`\n4. HEAD: first sample above -60 dBFS: decoded ${head.firstDec} (${(head.firstDec / SR * 1000).toFixed(2)} ms), master ${head.firstMas} (${(head.firstMas / SR * 1000).toFixed(2)} ms)`);
log(`   RMS 0-5 ms decoded ${head.dec0_5ms.toFixed(1)} dBFS | 0-50 ms decoded ${head.dec0_50ms.toFixed(1)} vs master ${head.mas0_50ms.toFixed(1)} dBFS | 5-50 ms decoded ${head.dec5_50.toFixed(1)} vs master ${head.mas5_50.toFixed(1)}`);
// head fidelity: SNR over first 50 ms (aligned)
{ let es = 0, er = 0; for (let i = 0; i < 0.05 * SR; i++) { const j = i + L; if (j < 0 || j >= D.n) continue; es += xm[i] ** 2; er += (ym[j] - sL.gain * xm[i]) ** 2; } head.snr50 = 10 * Math.log10(es / (er + 1e-30)); }
{ let es = 0, er = 0; for (let i = 0; i < 0.005 * SR; i++) { const j = i + L; if (j < 0 || j >= D.n) continue; es += xm[i] ** 2; er += (ym[j] - sL.gain * xm[i]) ** 2; } head.snr5 = 10 * Math.log10(es / (er + 1e-30)); }
log(`   aligned SNR over first 50 ms: ${head.snr50.toFixed(1)} dB, first 5 ms: ${head.snr5.toFixed(1)} dB`);
R.head = head;
let clip = 0, over1f = 0, maxAbs = 0; for (const c of [D.L, D.R]) for (const v of c) { const a = Math.abs(v); if (a >= 0.999) clip++; if (a > 1) over1f++; maxAbs = Math.max(maxAbs, a); }
log(`   CLIP: samples |x| >= 0.999: ${clip}, > 1.0: ${over1f}, max |x| ${maxAbs.toFixed(5)} (${db(maxAbs).toFixed(2)} dBFS)`);
R.clip = { atFS: clip, overFS: over1f, maxAbs };
const tail = { last100_dec: db(rmsR(ym, 14.9, 15.0)), last100_mas: db(rmsR(xm, 14.9, 15.0)), pad_dec: db(rmsR(ym, 15.0, D.n / SR)), peakPast149: 0 };
for (let i = Math.round(14.9 * SR); i < D.n; i++) tail.peakPast149 = Math.max(tail.peakPast149, Math.abs(D.L[i]), Math.abs(D.R[i]));
let lastNZ = -1; for (let i = D.n - 1; i >= 0; i--) if (Math.abs(ym[i]) > 10 ** (-60 / 20)) { lastNZ = i; break; }
log(`   TAIL: RMS 14.9-15.0 s decoded ${tail.last100_dec.toFixed(1)} vs master ${tail.last100_mas.toFixed(1)} dBFS | padding 15.000-${(D.n / SR).toFixed(4)} s RMS ${tail.pad_dec.toFixed(1)} dBFS | peak after 14.9 s ${db(tail.peakPast149).toFixed(1)} dBFS | last sample > -60 dBFS at ${(lastNZ / SR).toFixed(4)} s`);
R.tail = { ...tail, lastAboveMinus60: lastNZ / SR };
log(`   DURATION: decoded ${(D.n / SR).toFixed(5)} s (${D.n} = ${D.n / 1024} AAC frames x 1024); master ${(M.n / SR).toFixed(5)} s; video 15.000 s (450 frames)`);

// ---- 5. A/V sync at the cue events
const sfxPath = join(ROOT, 'out', 'audio_qa', 'raw_sfx.f32');
let sfx = null;
if (existsSync(sfxPath)) { const b = readFileSync(sfxPath); const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4); sfx = new Float64Array(a.length / 2); for (let i = 0; i < sfx.length; i++) sfx[i] = (a[2 * i] + a[2 * i + 1]) / 2; }
const frames = existsSync(join(HERE, 'frames.json')) ? JSON.parse(readFileSync(join(HERE, 'frames.json'), 'utf8')) : [];
const hp = x => filt(filt(x, bq('hp', 1500)), bq('hp', 1500));
const sfxH = sfx && hp(sfx), ymH = hp(ym);
// onset: first 1 ms frame in [cue-40ms, cue+80ms] whose energy > 25% of the max 1 ms energy in [cue, cue+60 ms],
// relative to a pre-level; reported in ms vs the cue.
function onset(x, cue, shift = 0) {
  const fr = 48, e = t => { const a = Math.round(t * SR) + shift; let s = 0; for (let i = a; i < a + fr; i++) s += (x[i] || 0) ** 2; return s / fr; };
  let mx = 0; for (let t = cue; t < cue + 0.06; t += 0.001) mx = Math.max(mx, e(t));
  let pre = 0, pn = 0; for (let t = cue - 0.06; t < cue - 0.02; t += 0.001) { pre += e(t); pn++; } pre /= pn;
  const thr = pre + 0.25 * (mx - pre);
  for (let t = cue - 0.04; t < cue + 0.08; t += 0.0005) if (e(t) > thr) return { ms: (t - cue) * 1000, riseDb: 10 * Math.log10(mx / (pre + 1e-20)) };
  return { ms: NaN, riseDb: 10 * Math.log10(mx / (pre + 1e-20)) };
}
const events = [
  ['static start (t=0)', CUES.staticStart],
  ['bomb land', CUES.bombLand],
  ['EXPLOSION', CUES.explode],
  ...CUES.keyTimes.map((t, i) => [`key ${i + 1} '${'BOMBERMAN'[i]}'`, t]),
  ['OK / enter', CUES.enter],
  ['CORRETO', CUES.correct],
  ['logo land', CUES.logoLand],
];
const byFrame = new Map(frames.map(f => [f.i, f]));
function picFrame(cue) {
  // largest frame-to-frame change within [ceil(cue*FPS)-2, ceil(cue*FPS)+2]
  const f0 = Math.ceil(cue * FPS - 1e-6); let best = null;
  for (let i = f0 - 2; i <= f0 + 2; i++) { const f = byFrame.get(i); if (f && f.diff != null && (!best || f.diff > best.diff)) best = f; }
  return { expected: f0, detected: best ? best.i : null, diff: best ? best.diff : null };
}
log(`\n5. A/V SYNC (positive = audio LATE vs picture; negative = audio LEADS)`);
log(`   event               cue s    pic frame(exp/det)  pic t     local lag   master onset  file onset   file audio - picture`);
R.sync = [];
for (const [name, cue] of events) {
  const ll = cue < 0.05 ? localLag(xm, ym, 0, 0.25) : localLag(xm, ym, cue - 0.05, cue + 0.25);
  const mo = sfxH && cue > 0.05 ? onset(sfxH, cue) : { ms: 0 };
  const fo = cue > 0.05 ? onset(ymH, cue) : { ms: head.firstDec / SR * 1000 };
  const pf = picFrame(cue), picT = pf.expected / FPS;
  // the file's audio event time = master event time (cue + master onset) + local lag
  const audT = cue + mo.ms / 1000 + ll.lag / SR;
  const avMs = (audT - picT) * 1000;
  R.sync.push({ name, cue, picExpected: pf.expected, picDetected: pf.detected, picDiff: pf.diff, localLagMs: ll.ms, localNc: ll.nc, masterOnsetMs: mo.ms, fileOnsetMs: fo.ms, avMs });
  log(`   ${name.padEnd(18)} ${cue.toFixed(3).padStart(6)}  ${String(pf.expected).padStart(4)}/${String(pf.detected ?? '-').padEnd(4)} d=${String(pf.diff ?? '-').padEnd(6)} ${picT.toFixed(4)}  ${ll.ms.toFixed(2).padStart(6)} ms  ${mo.ms.toFixed(1).padStart(6)} ms    ${fo.ms.toFixed(1).padStart(6)} ms   ${avMs.toFixed(1).padStart(7)} ms`);
}
const avs = R.sync.filter(s => s.cue > 0.05).map(s => s.avMs);
log(`   audio-picture range: ${Math.min(...avs).toFixed(1)} .. ${Math.max(...avs).toFixed(1)} ms (tolerance: |x| <= 20 invisible; < -45 audio-leading = must-fix)`);

// ---- 6. delivery: platform normalisation
const toM14 = -14 - ld.integrated;
log(`\n6. DELIVERY: integrated ${ld.integrated.toFixed(2)} LUFS -> a -14 LUFS platform applies ${toM14 >= 0 ? '+' : ''}${toM14.toFixed(2)} dB.`);
log(`   after that gain the true peak would be ${(db(TPd) + toM14).toFixed(2)} dBTP ${toM14 > 0 && db(TPd) + toM14 > -1 ? '(> -1: platforms that only turn UP with headroom would limit/refuse the boost)' : '(no limiting needed)'}`);
R.delivery = { gainTo14: toM14, tpAfter: db(TPd) + toM14 };

writeFileSync(join(HERE, 'av_qa_report.txt'), out.join('\n') + '\n');
writeFileSync(join(HERE, 'av_qa.json'), JSON.stringify(R, null, 2));
