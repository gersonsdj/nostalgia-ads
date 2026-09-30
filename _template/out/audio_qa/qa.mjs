// Independent QA of audio.js renders produced by out/audio_qa/stems.html.
// Usage: node out/audio_qa/qa.mjs  -> prints report, writes out/audio_qa/qa_report.txt + qa.json
// Inputs (float32 interleaved stereo, 48 kHz): mastered_a/b.f32, raw_full/music/sfx.f32
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { CUES, BEAT, DURATION } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
const SR = 48000;
const out = [];
const log = (s = '') => { out.push(s); };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));

function load(name) {
  const b = readFileSync(join(HERE, name + '.f32'));
  const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const n = a.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = a[2 * i]; R[i] = a[2 * i + 1]; }
  return { raw: b, L, R, n };
}
const MA = load('mastered_a'), MB = load('mastered_b');
const RF = load('raw_full'), RM = load('raw_music'), RS = load('raw_sfx');
const n = MA.n;

// ---------------------------------------------------------------- biquads (RBJ)
function bq(type, f, Q = Math.SQRT1_2) {
  const w0 = 2 * Math.PI * f / SR, al = Math.sin(w0) / (2 * Q), cw = Math.cos(w0);
  let b, a;
  if (type === 'hp') { b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]; }
  else { b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]; }
  return { b: b.map((v) => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] };
}
function filt(x, { b, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const chain = (x, fs) => fs.reduce((s, f) => filt(s, f), x);
const monoOf = (s) => { const m = new Float64Array(s.n); for (let i = 0; i < s.n; i++) m[i] = (s.L[i] + s.R[i]) / 2; return m; };
const rms = (x, t0, t1) => { const a = Math.max(0, Math.round(t0 * SR)), c = Math.min(x.length, Math.round(t1 * SR)); let e = 0; for (let i = a; i < c; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, c - a)); };

// ---------------------------------------------------------------- 1. determinism + stem sanity
let diff = 0; for (let i = 0; i < MA.raw.length; i++) if (MA.raw[i] !== MB.raw[i]) { diff++; }
log(`DETERMINISM: mastered_a vs mastered_b differing bytes = ${diff} (${diff ? 'FAIL' : 'bit-identical'})`);
let sumErr = 0;
for (let i = 0; i < n; i++) sumErr = Math.max(sumErr, Math.abs(RF.L[i] - RM.L[i] - RS.L[i]), Math.abs(RF.R[i] - RM.R[i] - RS.R[i]));
log(`STEMS: max |full - (music + sfx)| = ${sumErr.toExponential(2)} (linear graph => stems are valid)`);

// ---------------------------------------------------------------- 2. sample hygiene
{
  let nonFinite = 0, denorm = 0, over = 0, sumL = 0, sumR = 0;
  for (const c of [MA.L, MA.R]) for (let i = 0; i < n; i++) {
    const v = c[i];
    if (!Number.isFinite(v)) nonFinite++;
    else if (v !== 0 && Math.abs(v) < 1.1754944e-38) denorm++;
    if (Math.abs(v) > 1) over++;
  }
  for (let i = 0; i < n; i++) { sumL += MA.L[i]; sumR += MA.R[i]; }
  log(`HYGIENE: nonFinite ${nonFinite} | denormals ${denorm} | |x|>1 ${over} | DC L ${(sumL / n).toExponential(2)} R ${(sumR / n).toExponential(2)}`);
  const secDC = [];
  for (let s = 0; s < DURATION; s++) { let a = 0; const i0 = s * SR; for (let i = i0; i < i0 + SR; i++) a += (MA.L[i] + MA.R[i]) / 2; secDC.push((a / SR).toExponential(1)); }
  log(`  DC per second (mono mean): ${secDC.join(' ')}`);
  let rawDen = 0; for (const c of [RF.L, RF.R]) for (let i = 0; i < n; i++) { const v = c[i]; if (v !== 0 && Math.abs(v) < 1.1754944e-38) rawDen++; }
  log(`  raw render denormals: ${rawDen}`);
}

// ---------------------------------------------------------------- 3. clicks / discontinuities
// residual = 4th-order HP at 12 kHz; flag 1 ms blocks whose residual peak is >= 18 dB over
// the residual RMS of the surrounding ±25 ms (excluding ±3 ms) AND whose |step| (1st diff) is
// >= 3x the local 1st-diff RMS. Events within 6 ms of a scheduled onset (16th grid / cue) are
// "onset" (designed transients); anything else is "SUSPECT".
const cueTimes = [];
for (const [k, v] of Object.entries(CUES)) { if (k === 'keyInterval') continue; if (Array.isArray(v)) cueTimes.push(...v); else cueTimes.push(v); }
const S32 = BEAT / 8;
const nearGrid = (t) => Math.abs(t / S32 - Math.round(t / S32)) * S32 < 0.006;
function clicks(L, R, label) {
  const events = [];
  for (const [cn, c] of [['L', L], ['R', R]]) {
    const r = chain(c, [bq('hp', 12000), bq('hp', 12000)]);
    const d1 = new Float64Array(c.length); for (let i = 1; i < c.length; i++) d1[i] = c[i] - c[i - 1];
    const B = 48, nb = Math.floor(c.length / B), pk = new Float64Array(nb), en = new Float64Array(nb), dpk = new Float64Array(nb), den = new Float64Array(nb);
    for (let k = 0; k < nb; k++) { let p = 0, e = 0, dp = 0, de = 0; for (let i = k * B; i < (k + 1) * B; i++) { p = Math.max(p, Math.abs(r[i])); e += r[i] * r[i]; dp = Math.max(dp, Math.abs(d1[i])); de += d1[i] * d1[i]; } pk[k] = p; en[k] = e; dpk[k] = dp; den[k] = de; }
    for (let k = 25; k < nb - 25; k++) {
      let e = 0, de = 0, cnt = 0;
      for (let j = k - 25; j <= k + 25; j++) if (Math.abs(j - k) > 3) { e += en[j]; de += den[j]; cnt++; }
      const lr = Math.sqrt(e / (cnt * B)), ldr = Math.sqrt(de / (cnt * B));
      if (pk[k] < 10 ** (-60 / 20)) continue;
      const ratio = db(pk[k] / Math.max(lr, 1e-9));
      if (ratio >= 18 && dpk[k] >= 3 * Math.max(ldr, 1e-9)) events.push({ t: (k * B) / SR, ch: cn, ratioDb: ratio, peakDb: db(pk[k]) });
    }
  }
  events.sort((a, b) => a.t - b.t);
  const merged = [];
  for (const e of events) { const l = merged[merged.length - 1]; if (l && e.t - l.t < 0.004) { if (e.ratioDb > l.ratioDb) Object.assign(l, e); } else merged.push({ ...e }); }
  for (const e of merged) e.kind = (nearGrid(e.t) || cueTimes.some((c) => Math.abs(c - e.t) < 0.006)) ? 'onset' : 'SUSPECT';
  const sus = merged.filter((e) => e.kind === 'SUSPECT');
  log(`CLICKS [${label}]: ${merged.length} transient events, ${sus.length} off-grid SUSPECT`);
  for (const e of sus) log(`   SUSPECT t=${e.t.toFixed(4)} ch ${e.ch} HF residual ${e.peakDb.toFixed(1)} dBFS, +${e.ratioDb.toFixed(1)} dB over local`);
  return merged;
}
const clkMaster = clicks(MA.L, MA.R, 'mastered full mix');
const clkMusic = clicks(RM.L, RM.R, 'raw music stem');
const clkSfx = clicks(RS.L, RS.R, 'raw sfx stem');

// targeted spots
const mono = monoOf(MA);
function stepAround(t, w = 0.01) {
  const a = Math.round((t - w) * SR), c = Math.round((t + w) * SR); let mx = 0, at = 0, e = 0;
  for (let i = a + 1; i < c; i++) { const d = Math.abs(mono[i] - mono[i - 1]); e += d * d; if (d > mx) { mx = d; at = i; } }
  return { maxStep: mx, at: at / SR, rmsStep: Math.sqrt(e / (c - a)) };
}
log('\nTARGETED:');
const sfxMono = monoOf(RS), musMono = monoOf(RM);
{
  const s = stepAround(CUES.powerOn, 0.008);
  log(`  static stop @powerOn ${CUES.powerOn}: max 1st-diff ${db(s.maxStep).toFixed(1)} dB at ${s.at.toFixed(4)} | sfx stem rms 0.990-0.996 ${db(rms(sfxMono, 0.990, 0.996)).toFixed(1)} vs 1.000-1.004 ${db(rms(sfxMono, 1.0, 1.004)).toFixed(1)} dBFS(raw)`);
  const g0 = CUES.explode - S32 / 2;
  log(`  fuse burn-out gap ${g0.toFixed(4)}-${CUES.explode}: full-mix rms ${db(rms(mono, g0 + 0.002, CUES.explode - 0.001)).toFixed(1)} dBFS vs fuse 2.30-2.45 ${db(rms(mono, 2.3, 2.45)).toFixed(1)} dBFS; music stem in gap ${db(rms(musMono, g0, CUES.explode)).toFixed(1)}`);
  const hfM = chain(mono, [bq('hp', 8000), bq('hp', 8000)]);
  log(`  gap edge HF (>8k) rms: 2.455-2.462 ${db(rms(hfM, 2.455, 2.462)).toFixed(1)} | 2.462-2.469 ${db(rms(hfM, 2.462, 2.469)).toFixed(1)} | 2.469-2.476 ${db(rms(hfM, 2.469, 2.476)).toFixed(1)} | 2.48-2.499 ${db(rms(hfM, 2.48, 2.499)).toFixed(1)} dBFS`);
  let lastNZ = 0; for (let i = n - 1; i >= 0; i--) if (MA.L[i] !== 0 || MA.R[i] !== 0) { lastNZ = i; break; }
  log(`  last non-zero sample at ${(lastNZ / SR).toFixed(4)} s; rms 14.70-14.75 ${db(rms(mono, 14.70, 14.75)).toFixed(1)} dBFS, 14.75-14.78 ${db(rms(mono, 14.75, 14.78)).toFixed(1)} dBFS`);
  const s2 = stepAround(lastNZ / SR, 0.01);
  log(`  final fade: max 1st-diff near end ${db(s2.maxStep).toFixed(1)} dB`);
}

// ---------------------------------------------------------------- 4. loudness + true peak (mastered)
function kw(x) {
  const sh = (() => { const A = 10 ** (4 / 40), w0 = 2 * Math.PI * 1500 / SR, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0), s = 2 * Math.sqrt(A) * al; const b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)], a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]; return { b: b.map((v) => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] }; })();
  return filt(filt(x, sh), bq('hp', 38, 0.5));
}
const K = [kw(MA.L), kw(MA.R)];
const blk = 0.4 * SR, hop = 0.1 * SR, z = [];
for (let s = 0; s + blk <= n; s += hop) { let sum = 0; for (const c of K) { let e = 0; for (let i = s; i < s + blk; i++) e += c[i] * c[i]; sum += e / blk; } z.push(sum); }
const LU = (e) => -0.691 + 10 * Math.log10(e);
const za = z.filter((e) => LU(e) > -70), rg = LU(za.reduce((p, e) => p + e, 0) / za.length) - 10, zg = za.filter((e) => LU(e) > rg);
const integ = LU(zg.reduce((p, e) => p + e, 0) / zg.length);
let tp = 0, sp = 0;
for (const c of [MA.L, MA.R]) for (let i = 8; i < n - 8; i++) {
  sp = Math.max(sp, Math.abs(c[i]));
  for (let p = 1; p < 4; p++) { const fr = p / 4; let y = 0; for (let k = -7; k <= 8; k++) { const x = k - fr, w = 0.5 + 0.5 * Math.cos(Math.PI * x / 8); y += c[i + k] * Math.sin(Math.PI * x) / (Math.PI * x) * w; } tp = Math.max(tp, Math.abs(y)); }
}
log(`\nLOUDNESS: integrated ${integ.toFixed(2)} LUFS | sample peak ${db(sp).toFixed(2)} dBFS | true peak ${db(tp).toFixed(2)} dBTP`);

// ---------------------------------------------------------------- 5. phone speaker translation
// phone = mono sum, HP 300 Hz (4th order) + LP 8 kHz (4th order). Stems are raw (pre-master) but the
// master is one gain + limiter, so music-vs-sfx margins carry over.
const PH = [bq('hp', 300), bq('hp', 300), bq('lp', 8000), bq('lp', 8000)];
const pS = chain(sfxMono, PH), pM = chain(musMono, PH), pF = chain(monoOf(RF), PH);
function peakWin(x, t0, t1, w = 0.03) { let best = 0, bt = t0; for (let t = t0; t + w <= t1 + 1e-9; t += 0.005) { const r = rms(x, t, t + w); if (r > best) { best = r; bt = t; } } return { r: best, t: bt }; }
// fraction of the SFX's phone-band energy sitting in STFT bins where the SFX beats the music
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b2 = a + len / 2; const tr = re[b2] * cr - im[b2] * ci, ti = re[b2] * ci + im[b2] * cr; re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
function dominance(t0, t1) {
  const N = 1024, H = 256, win = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let dom = 0, tot = 0;
  for (let s = Math.round(t0 * SR); s + N <= Math.round(t1 * SR) + N / 2 && s + N <= n; s += H) {
    const a = [pS, pM].map((x) => { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i]; fft(re, im); return { re, im }; });
    for (let k = Math.round(300 * N / SR); k < Math.round(8000 * N / SR); k++) {
      const es = a[0].re[k] ** 2 + a[0].im[k] ** 2, em = a[1].re[k] ** 2 + a[1].im[k] ** 2;
      tot += es; if (es > 2 * em) dom += es;            // SFX at least 3 dB over music in that bin
    }
  }
  return tot ? dom / tot : 0;
}
const EV = [
  ['TV static', CUES.staticStart + 0.05, CUES.powerOn - 0.01],
  ['CRT power-on', CUES.powerOn, CUES.powerOn + 0.12],
  ['app chime', CUES.appReady, CUES.appReady + 0.25],
  ['bomb whistle', CUES.bombDrop, CUES.bombLand - 0.01],
  ['plunk', CUES.bombLand, CUES.bombLand + 0.08],
  ['FUSE sizzle', CUES.fuseStart + 0.01, CUES.explode - 0.035],
  ['fuse 2nd half', (CUES.fuseStart + CUES.explode) / 2, CUES.explode - 0.035],
  ['explosion', CUES.explode, CUES.blastEnd],
  ...CUES.keyTimes.map((t, i) => [`key ${i + 1} ${'BOMBERMAN'[i]}`, t, t + 0.09]),
  ['OK/enter', CUES.enter, CUES.enter + 0.2],
  ['CORRETO jingle', CUES.correct, CUES.pointsStart - 0.02],
  ['point ticks', CUES.pointsStart, CUES.pointsEnd],
  ['character pop', CUES.characterIn, CUES.characterIn + 0.1],
  ['points ding', CUES.pointsEnd, CUES.pointsEnd + 0.35],
  ['whoosh', CUES.ctaTransition - 0.25, CUES.logoLand],
  ['logo ding', CUES.logoLand, CUES.logoLand + 0.4],
  ['stores pop', CUES.stores, CUES.stores + 0.08],
];
log('\nPHONE SPEAKER (mono, HP300 x2 + LP8k x2): SFX vs music');
log('  event              window          winRMS margin | peak30ms sfx vs music(same 30ms) | bins sfx>=+3dB | sfx share of full');
const phoneRows = [];
for (const [name, t0, t1] of EV) {
  const s = rms(pS, t0, t1), m = rms(pM, t0, t1);
  const pk = peakWin(pS, t0, t1), mAt = rms(pM, pk.t, pk.t + 0.03);
  const dom = dominance(t0, t1);
  const share = rms(pS, t0, t1) / Math.max(rms(pF, t0, t1), 1e-12);
  const row = { name, t0, t1, marginDb: db(s) - db(m), peakMarginDb: db(pk.r) - db(mAt), sfxDb: db(s), musicDb: db(m), dominance: dom, shareDb: db(share) };
  phoneRows.push(row);
  const mg = (v) => (v > 60 ? '  >60' : v.toFixed(1).padStart(5));
  log(`  ${name.padEnd(18)} ${t0.toFixed(3)}-${t1.toFixed(3)}   ${mg(row.marginDb)} dB    | ${mg(row.peakMarginDb)} dB                          | ${(100 * dom).toFixed(0).padStart(3)}%           | ${row.shareDb.toFixed(1)} dB`);
}
// Fuse vs the loudest non-fuse component of the full mix during 1.5-2.5 (plunk tail, explosion pre-roll, hat...)
{
  const f0 = CUES.fuseStart + 0.1, f1 = CUES.explode - 0.035;
  log(`  fuse window phone-band: full ${db(rms(pF, f0, f1)).toFixed(1)} dB | sfx ${db(rms(pS, f0, f1)).toFixed(1)} | music ${db(rms(pM, f0, f1)).toFixed(1)} (raw dBFS)`);
  const tA = CUES.bombLand + BEAT, fullMono = monoOf(RF), lo = chain(fullMono, [bq('lp', 250), bq('lp', 250)]);
  log(`  fuse @bombLand+BEAT (${tA}): phone-band 60ms before ${db(rms(pF, tA - 0.06, tA)).toFixed(1)} | 60ms after ${db(rms(pF, tA, tA + 0.06)).toFixed(1)} dB; <250 Hz before ${db(rms(lo, tA - 0.06, tA)).toFixed(1)} | after ${db(rms(lo, tA, tA + 0.12)).toFixed(1)} dB (full-band raw)`);
  const hi = chain(fullMono, [bq('hp', 2000), bq('hp', 2000)]), mid = chain(fullMono, [bq('hp', 300), bq('hp', 300), bq('lp', 2000), bq('lp', 2000)]);
  log(`  fuse ${f0.toFixed(2)}-${f1.toFixed(2)} full-band split: >2k ${db(rms(hi, f0, f1)).toFixed(1)} | 300-2k ${db(rms(mid, f0, f1)).toFixed(1)} | <250 ${db(rms(lo, f0, f1)).toFixed(1)} dBFS`);
  const tk = [];
  const nT = Math.round((CUES.pointsEnd - CUES.pointsStart) / (BEAT / 8));
  for (let i = 0; i < nT; i++) { const t = CUES.pointsStart + i * BEAT / 8; tk.push(db(rms(pS, t, t + 0.03)) - db(rms(pM, t, t + 0.03))); }
  log(`  point ticks per tick: ${tk.map((v) => v.toFixed(0)).join(" ")}`);
  log(`  point ticks, per tick 30 ms margin: min ${Math.min(...tk).toFixed(1)} / median ${[...tk].sort((a, b) => a - b)[tk.length >> 1].toFixed(1)} / max ${Math.max(...tk).toFixed(1)} dB`);
  const kk = CUES.keyTimes.map((t) => db(rms(pS, t, t + 0.05)) - db(rms(pM, t, t + 0.05)));
  log(`  key blips, first 50 ms margin: ${kk.map((v) => v.toFixed(1)).join(' ')} dB`);
}

// ---------------------------------------------------------------- 6. dump
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'qa_report.txt'), txt);
writeFileSync(join(HERE, 'qa.json'), JSON.stringify({ determinismDiffBytes: diff, stemSumErr: sumErr, integratedLufs: integ, truePeakDb: db(tp), samplePeakDb: db(sp), phoneRows, clicks: { master: clkMaster, music: clkMusic, sfx: clkSfx } }, null, 1));
