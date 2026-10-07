// Independent QA of audio.js renders produced by out/audio_qa/stems.html.
// Usage: node out/audio_qa/qa.mjs  -> prints report, writes out/audio_qa/qa_report.txt + qa.json
// Inputs (float32 interleaved stereo, 48 kHz): mastered_a/b.f32, raw_full/music/sfx.f32
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { CUES, BEAT, DURATION, ANSWER } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
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
  // the gag's pause: whistle stops at fallEnd, silence until the distant puff
  const g0 = CUES.fallEnd + 0.02, g1 = CUES.puff - 0.002;
  log(`  fall->puff pause ${g0.toFixed(4)}-${g1.toFixed(4)}: full-mix rms ${db(rms(mono, g0, g1)).toFixed(1)} dBFS vs whistle ${db(rms(mono, CUES.fallStart + 0.1, CUES.fallEnd - 0.02)).toFixed(1)} dBFS; music stem in pause ${db(rms(musMono, g0, g1)).toFixed(1)} | sfx stem ${db(rms(sfxMono, g0, g1)).toFixed(1)}`);
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
  ['BIP 1', CUES.beep1, CUES.beep1 + 0.1],
  ['BIP 2', CUES.beep2, CUES.beep2 + 0.1],
  ['dash zuuum', CUES.dashStart, CUES.dashEnd],
  ['FALL whistle', CUES.fallStart + 0.01, CUES.fallEnd - 0.01],
  ['whistle 2nd half', (CUES.fallStart + CUES.fallEnd) / 2, CUES.fallEnd - 0.01],
  ['PUF', CUES.puff, CUES.puff + 0.25],
  ...CUES.keyTimes.map((t, i) => [`key ${i + 1} ${ANSWER[i]}`, t, t + 0.09]),
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
// The memory trigger (bip-bip + whistle) vs everything else in the phone band
{
  const f0 = CUES.fallStart + 0.05, f1 = CUES.fallEnd - 0.02;
  log(`  whistle window phone-band: full ${db(rms(pF, f0, f1)).toFixed(1)} dB | sfx ${db(rms(pS, f0, f1)).toFixed(1)} | music ${db(rms(pM, f0, f1)).toFixed(1)} (raw dBFS)`);
  const b0 = CUES.beep1, b1 = CUES.beep2 + 0.1;
  log(`  bip-bip window phone-band: full ${db(rms(pF, b0, b1)).toFixed(1)} dB | sfx ${db(rms(pS, b0, b1)).toFixed(1)} | music ${db(rms(pM, b0, b1)).toFixed(1)} (raw dBFS)`);
  const fullMono = monoOf(RF), lo = chain(fullMono, [bq('lp', 250), bq('lp', 250)]);
  const hi = chain(fullMono, [bq('hp', 2000), bq('hp', 2000)]), mid = chain(fullMono, [bq('hp', 300), bq('hp', 300), bq('lp', 2000), bq('lp', 2000)]);
  log(`  whistle ${f0.toFixed(2)}-${f1.toFixed(2)} full-band split: >2k ${db(rms(hi, f0, f1)).toFixed(1)} | 300-2k ${db(rms(mid, f0, f1)).toFixed(1)} | <250 ${db(rms(lo, f0, f1)).toFixed(1)} dBFS`);
  const tk = [];
  const nT = Math.round((CUES.pointsEnd - CUES.pointsStart) / (BEAT / 8));
  for (let i = 0; i < nT; i++) { const t = CUES.pointsStart + i * BEAT / 8; tk.push(db(rms(pS, t, t + 0.03)) - db(rms(pM, t, t + 0.03))); }
  log(`  point ticks per tick: ${tk.map((v) => v.toFixed(0)).join(" ")}`);
  log(`  point ticks, per tick 30 ms margin: min ${Math.min(...tk).toFixed(1)} / median ${[...tk].sort((a, b) => a - b)[tk.length >> 1].toFixed(1)} / max ${Math.max(...tk).toFixed(1)} dB`);
  const kk = CUES.keyTimes.map((t) => db(rms(pS, t, t + 0.05)) - db(rms(pM, t, t + 0.05)));
  log(`  key blips, first 50 ms margin: ${kk.map((v) => v.toFixed(1)).join(' ')} dB`);
}

// ---------------------------------------------------------------- 5b. scene 1: the memory trigger, event by event
// Mastered full mix, phone band. Every scene-1 event is alone in its window (music is out), so the
// full mix IS the event: this table is the hierarchy a phone listener hears.
log('\nSCENE 1 (mastered mix, phone band; loudest 30 ms of each event):');
const scene1 = {};
{
  const pMA = chain(mono, PH);
  const S1 = [
    ['TV static', 0.05, 0.99], ['CRT power-on', CUES.powerOn, CUES.appReady - 0.005], ['app chime', CUES.appReady, CUES.beep1 - 0.005],
    ['BIP 1', CUES.beep1, CUES.beep2 - 0.01], ['BIP 2', CUES.beep2, CUES.dashStart - 0.005], ['dash zuuum', CUES.dashStart, CUES.dashEnd],
    ['whistle 1st half', CUES.fallStart, (CUES.fallStart + CUES.fallEnd) / 2], ['whistle 2nd half', (CUES.fallStart + CUES.fallEnd) / 2, CUES.fallEnd],
    ['pause (wind)', CUES.fallEnd + 0.02, CUES.puff - 0.002], ['PUF', CUES.puff, CUES.puff + 0.1], ['canyon echoes', CUES.puff + 0.1, CUES.puff + 0.35],
    ['pre-slam 2.90-3.00', 2.9, CUES.puffEnd - 0.001],
  ];
  for (const [name, t0, t1] of S1) {
    const pk = peakWin(pMA, t0, t1, Math.min(0.03, t1 - t0));
    scene1[name] = db(pk.r);
    log(`  ${name.padEnd(20)} ${t0.toFixed(3)}-${t1.toFixed(3)}  peak30 ${db(pk.r).toFixed(1).padStart(6)} dBFS @${pk.t.toFixed(3)} | rms ${db(rms(pMA, t0, t1)).toFixed(1).padStart(6)}`);
  }
  const win = peakWin(pMA, 1.1, 1.5, 0.03);
  const who = win.t >= CUES.beep1 - 0.005 && win.t < CUES.dashStart ? 'the bip-bip' : 'NOT the bip-bip (FAIL)';
  log(`  loudest 30 ms of 1.10-1.50 s starts at ${win.t.toFixed(3)} s -> ${who}`);
  const bip = Math.max(scene1['BIP 1'], scene1['BIP 2']);
  log(`  bip-bip vs: chime ${(bip - scene1['app chime']).toFixed(1)} dB | CRT ${(bip - scene1['CRT power-on']).toFixed(1)} | dash ${(bip - scene1['dash zuuum']).toFixed(1)} | whistle ${(bip - Math.max(scene1['whistle 1st half'], scene1['whistle 2nd half'])).toFixed(1)} | puff ${(bip - scene1.PUF).toFixed(1)} | pause ${(bip - scene1['pause (wind)']).toFixed(1)}`);
  // dash: panned LEFT -> RIGHT (sfx stem, raw)
  const lr = (t0, t1) => db(rms(RS.L, t0, t1)) - db(rms(RS.R, t0, t1));
  const dq = (CUES.dashEnd - CUES.dashStart) / 4;
  log(`  dash pan (L minus R, dB) by quarter: ${[0, 1, 2, 3].map((q) => lr(CUES.dashStart + q * dq, CUES.dashStart + (q + 1) * dq).toFixed(1)).join(' -> ')}  (expect + -> -)`);
  // whistle: pitch + brightness at the start and at the end, level drop (receding)
  const sfxM = sfxMono;
  function peakHz(x, t0, N = 4096) {
    const s = Math.round(t0 * SR), re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    let bk = 0, bm = 0, num = 0, den = 0;
    for (let k = Math.round(150 * N / SR); k < Math.round(12000 * N / SR); k++) {
      const mg = Math.hypot(re[k], im[k]); num += mg * k; den += mg;
      if (mg > bm) { bm = mg; bk = k; }
    }
    return { hz: bk * SR / N, centroid: (num / den) * SR / N };
  }
  const w0 = peakHz(sfxM, CUES.fallStart + 0.04, 2048), w1 = peakHz(sfxM, CUES.fallEnd - 0.05, 2048);
  log(`  whistle pitch ~${w0.hz.toFixed(0)} Hz -> ~${w1.hz.toFixed(0)} Hz | spectral centroid ${w0.centroid.toFixed(0)} -> ${w1.centroid.toFixed(0)} Hz | level first 80 ms ${db(rms(sfxM, CUES.fallStart + 0.03, CUES.fallStart + 0.11)).toFixed(1)} vs last 80 ms ${db(rms(sfxM, CUES.fallEnd - 0.09, CUES.fallEnd - 0.01)).toFixed(1)} dBFS(raw)`);
  // whistle hard stop: HF residual (>12 kHz) around fallEnd vs the whistle body just before
  const hfS = chain(sfxM, [bq('hp', 12000), bq('hp', 12000)]);
  const pk = (x, t0, t1) => { let p = 0; for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) p = Math.max(p, Math.abs(x[i])); return p; };
  const stop = stepAround(CUES.fallEnd, 0.004);
  log(`  whistle stop @${CUES.fallEnd}: HF residual peak ${db(pk(hfS, CUES.fallEnd - 0.004, CUES.fallEnd + 0.004)).toFixed(1)} dBFS vs body ${db(pk(hfS, CUES.fallEnd - 0.06, CUES.fallEnd - 0.01)).toFixed(1)} | mix max 1st-diff ${db(stop.maxStep).toFixed(1)} dB vs rms 1st-diff ${db(stop.rmsStep).toFixed(1)} | mix rms 10 ms after ${db(rms(mono, CUES.fallEnd + 0.001, CUES.fallEnd + 0.011)).toFixed(1)} dBFS`);
  const st = stepAround(CUES.powerOn - 0.002, 0.003);
  log(`  static stop @${CUES.powerOn}: HF residual peak ${db(pk(hfS, CUES.powerOn - 0.004, CUES.powerOn - 0.0002)).toFixed(1)} dBFS vs static body ${db(pk(hfS, 0.9, 0.99)).toFixed(1)} | mix max 1st-diff before the CRT ${db(st.maxStep).toFixed(1)} dB`);
  log(`  puff tail: mix rms 2.85-2.90 ${db(rms(mono, 2.85, 2.9)).toFixed(1)} | 2.90-3.00 ${db(rms(mono, 2.9, 2.999)).toFixed(1)} dBFS`);
}

// ---------------------------------------------------------------- 6. short-term loudness hierarchy (mastered)
// K50 = K-weighted 50 ms level (LUFS-style, stereo); phoneEar50 = mono, phone band (HP300 x2, LP8k x2) plus a
// +6 dB peak at 3 kHz (small-speaker + ear-canal resonance), 50 ms. The bip-bip should top the ad without
// being an outlier; each payoff should top its build-up (CORRETO > riser); the slam at 3.0 and the final
// chord must still read on a phone.
const hier = {};
{
  const peakEq = (f0, Q, G) => { const A = 10 ** (G / 40), w0 = 2 * Math.PI * f0 / SR, al = Math.sin(w0) / (2 * Q), cw = Math.cos(w0), a0 = 1 + al / A; return { b: [(1 + al * A) / a0, -2 * cw / a0, (1 - al * A) / a0], a: [1, -2 * cw / a0, (1 - al / A) / a0] }; };
  const PE = chain(mono, [...PH, peakEq(3000, 1, 6)]);
  const W = Math.round(0.05 * SR), hop = Math.round(0.005 * SR);
  const kL = (i) => { let e = 0; for (const c of K) for (let k = i; k < i + W; k++) e += c[k] * c[k]; return -0.691 + 10 * Math.log10(e / W + 1e-20); };
  const pL = (i) => { let e = 0; for (let k = i; k < i + W; k++) e += PE[k] * PE[k]; return 10 * Math.log10(e / W + 1e-20); };
  const secs = [['TV static', 0.05, 0.95], ['CRT', 1.0, 1.12], ['chime', 1.125, 1.24], ['bip 1', 1.25, 1.37], ['bip 2', 1.375, 1.49], ['dash', 1.5, 1.75], ['whistle', 1.75, 2.31], ['puff', 2.5, 2.6],
    ['slam 3.0', 3.0, 3.1], ['typing 3.1-7.2', 3.1, 7.2], ['riser', 7.3, 7.93], ['CORRETO', 8.0, 8.2], ['celebration', 8.2, 11.95], ['whoosh', 11.9, 12.1], ['logo', 12.5, 12.7], ['CTA 12.7-14', 12.7, 13.95], ['final chord', 14.0, 14.2]];
  log('\nSHORT-TERM LOUDNESS (mastered; 50 ms windows): section  K50 max / p90  |  phoneEar50 max / p90  (dB)');
  for (const [name, t0, t1] of secs) {
    const ks = [], ps = [];
    for (let i = Math.round(t0 * SR); i + W <= Math.round(t1 * SR) + W / 2; i += hop) { ks.push(kL(i)); ps.push(pL(i)); }
    const p90 = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length * 0.9)];
    hier[name] = { k: Math.max(...ks), kp90: p90(ks), p: Math.max(...ps), pp90: p90(ps) };
    log(`  ${name.padEnd(16)} ${hier[name].k.toFixed(1).padStart(6)} / ${hier[name].kp90.toFixed(1).padStart(6)}  | ${hier[name].p.toFixed(1).padStart(6)} / ${hier[name].pp90.toFixed(1).padStart(6)}`);
  }
  const others = Object.entries(hier).filter(([k]) => !k.startsWith('bip'));
  const nextK = others.reduce((p, x) => (x[1].k > p[1].k ? x : p)), nextP = others.reduce((p, x) => (x[1].p > p[1].p ? x : p));
  const bipK = Math.max(hier['bip 1'].k, hier['bip 2'].k), bipP = Math.max(hier['bip 1'].p, hier['bip 2'].p);
  log(`  bip-bip over the next-loudest event: K50 +${(bipK - nextK[1].k).toFixed(1)} dB (${nextK[0]}) | phoneEar +${(bipP - nextP[1].p).toFixed(1)} dB (${nextP[0]})  (want > 0, and < ~4 so it is not an outlier)`);
  log(`  CORRETO over the riser: K50 ${(hier.CORRETO.k - hier.riser.k).toFixed(1)} dB | phoneEar ${(hier.CORRETO.p - hier.riser.p).toFixed(1)} dB (want > 0)`);
  log(`  slam 3.0 phoneEar vs typing p90: ${(hier['slam 3.0'].p - hier['typing 3.1-7.2'].pp90).toFixed(1)} dB | final chord phoneEar vs CTA p90: ${(hier['final chord'].p - hier['CTA 12.7-14'].pp90).toFixed(1)} dB (want >= ~-1)`);
}
// ---------------------------------------------------------------- 7. limiter gain reduction (mastered vs raw, 5 ms)
const grRows = [];
{
  const W = 240, rat = [];
  for (let s = 0; s + W <= n; s += W) { let em = 0, er = 0; for (let i = s; i < s + W; i++) { em += MA.L[i] ** 2 + MA.R[i] ** 2; er += RF.L[i] ** 2 + RF.R[i] ** 2; } rat.push(er > 1e-9 && s / SR < 14.7 ? Math.sqrt(em / er) : NaN); }
  const v = rat.filter(Number.isFinite).sort((a, b) => a - b), g0 = v[v.length >> 1];
  const gr = rat.map((x) => (Number.isFinite(x) ? 20 * Math.log10(x / g0) : 0));
  const worst = gr.map((d, i) => ({ d, t: i * W / SR })).sort((a, b) => a.d - b.d);
  const picked = [];
  for (const w of worst) { if (picked.length >= 6 || w.d > -0.5) break; if (picked.every((p) => Math.abs(p.t - w.t) > 0.15)) picked.push(w); }
  let over1 = 0; for (const d of gr) if (d < -1) over1++;
  log(`\nLIMITER: gain reduction deepest spots ${picked.map((p) => `${p.t.toFixed(3)}s ${p.d.toFixed(1)} dB`).join(' | ')} | time under -1 dB GR: ${(over1 * W / SR * 1000).toFixed(0)} ms`);
  grRows.push(...picked);
}
// ---------------------------------------------------------------- 8. sustained energy above 8 kHz (mastered, mono)
{
  const hf = chain(mono, [bq('hp', 8000), bq('hp', 8000)]);
  const W = Math.round(0.05 * SR), lev = [];
  for (let s = 0; s + W <= n; s += W) { let e = 0, ef = 0; for (let i = s; i < s + W; i++) { e += hf[i] * hf[i]; ef += mono[i] * mono[i]; } lev.push({ t: s / SR, db: 10 * Math.log10(e / W + 1e-20), share: ef > 0 ? e / ef : 0 }); }
  const secs = [['0-1 static', 0, 1], ['1-3 hook', 1, 3], ['3-7.25 typing', 3, 7.25], ['7.25-8 riser', 7.25, 8], ['8-12 reward', 8, 12], ['12-15 CTA', 12, 15]];
  log('\nHF > 8 kHz (mastered mono, 50 ms): section  max level | median level | median share of the energy');
  for (const [name, t0, t1] of secs) {
    const r = lev.filter((x) => x.t >= t0 && x.t < t1 - 0.049), med = (f) => [...r.map(f)].sort((a, b) => a - b)[r.length >> 1];
    log(`  ${name.padEnd(15)} ${Math.max(...r.map((x) => x.db)).toFixed(1).padStart(6)} dBFS | ${med((x) => x.db).toFixed(1).padStart(6)} dBFS | ${(100 * med((x) => x.share)).toFixed(1)}%`);
  }
  let run = 0, best = { len: 0, t: 0 }; for (const x of lev) { if (x.db > -30) { run++; if (run > best.len) best = { len: run, t: x.t - (run - 1) * 0.05 }; } else run = 0; }
  log(`  longest run above -30 dBFS in >8 kHz: ${(best.len * 50)} ms${best.len ? ` from ${best.t.toFixed(2)} s` : ''}`);
}
// ---------------------------------------------------------------- 9. mono compatibility (mastered)
{
  const secs = [['bip-bip', 1.25, 1.49], ['dash', 1.5, 1.75], ['whistle', 1.75, 2.31], ['typing groove', 3.0, 7.25], ['celebration', 8.0, 12.0], ['CTA', 12.0, 14.0], ['final', 14.0, 14.75], ['whole', 0, 15]];
  log('\nMONO: section  L/R correlation | mono sum vs stereo power (0 dB = no loss, -3 dB = uncorrelated, << -3 = cancelling)');
  for (const [name, t0, t1] of secs) {
    let lr = 0, ll = 0, rr = 0, ms = 0;
    for (let i = Math.round(t0 * SR); i < Math.min(n, Math.round(t1 * SR)); i++) { const l = MA.L[i], r = MA.R[i]; lr += l * r; ll += l * l; rr += r * r; ms += ((l + r) / 2) ** 2; }
    log(`  ${name.padEnd(14)} ${(lr / Math.sqrt(ll * rr + 1e-30)).toFixed(3)} | ${(10 * Math.log10(ms / ((ll + rr) / 2) + 1e-20)).toFixed(2)} dB`);
  }
}

// ---------------------------------------------------------------- 10. dump
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'qa_report.txt'), txt);
writeFileSync(join(HERE, 'qa.json'), JSON.stringify({ determinismDiffBytes: diff, stemSumErr: sumErr, integratedLufs: integ, truePeakDb: db(tp), samplePeakDb: db(sp), phoneRows, scene1, loudnessHierarchy: hier, limiter: grRows, clicks: { master: clkMaster, music: clkMusic, sfx: clkSfx } }, null, 1));
