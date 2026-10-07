// Event-by-event sync of audio.js against timeline.js, from SOLO renders (out/audio_qa/events.html).
//   node out/tools/headless.mjs "http://localhost:5181/out/audio_qa/events.html?m=audio.js&dir=audio_qa_ev"
//   node out/audio_qa/sync.mjs [dir=audio_qa_ev]      -> prints + writes out/audio_qa/sync_report.txt, sync.json
// Per event: first audible sample (-60 dB re its own peak), attack point (1 ms envelope reaches -20 dB re
// peak), peak time, last audible sample, all against the cue it must hit. The video shows an off-frame cue
// on the NEXT frame (visuals: firstFrame = ceil(cue*30)), except the accents that snap to the NEAREST frame
// (visuals: keyFrame, ties to the earlier frame): the bips, the whip (fallStart), the 2x snap/hold
// (fallEnd), the keys, OK (enter) and the point ticks. The table prints the frame that shows each cue.
// Dash: pan-centre crossing (L = R), level peak and Doppler steepest-drop time, to compare with the
// dust cloud's centre crossing measured on the rendered frames (out/audio_qa/dashsync.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DIR = join(ROOT, 'out', process.argv[2] || 'audio_qa_ev');
const { CUES } = await import(pathToFileURL(join(ROOT, 'timeline.js')).href);
const meta = JSON.parse(readFileSync(join(DIR, 'events.json'), 'utf8'));
const SR = meta.sampleRate;
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const out = [];
const log = (s = '') => out.push(s);
function load(id) {
  const e = meta.events[id];
  if (!e || !e.n) return null;
  const b = readFileSync(join(DIR, `ev_${id}.f32`));
  const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4), n = a.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = a[2 * i]; R[i] = a[2 * i + 1]; }
  return { L, R, n, s0: e.s0, t: (i) => (e.s0 + i) / SR, i: (t) => Math.round(t * SR) - e.s0 };
}
const NEAREST = new Set(['bip1', 'bip2', 'whistle', 'enter', 'ticks', ...CUES.keyTimes.map((_, i) => `key${i + 1}`)]);
const frameT = (cue, id) => (NEAREST.has(id) ? Math.ceil(cue * 30 - 0.5 - 1e-6) : Math.ceil(cue * 30 - 1e-6)) / 30;
const C = CUES;
const EXPECT = {
  static: [C.staticStart, 'ends by powerOn', C.powerOn], crt: [C.powerOn], chime: [C.appReady], intro: [C.powerOn],
  bip1: [C.beep1], bip2: [C.beep2], dash: [C.dashStart], whistle: [C.fallStart, 'hard stop at fallEnd', C.fallEnd],
  wind: [C.fallStart + 0.3, 'gone before the slam', C.puffEnd], puff: [C.puff, 'gone before the slam', C.puffEnd], groove: [C.puffEnd],
  ...Object.fromEntries(C.keyTimes.map((t, i) => [`key${i + 1}`, [t]])),
  enter: [C.enter], riser: [C.enter, 'silent for the 32nd before CORRETO', C.correct - 0.0625], fanfare: [C.correct], celebrate: [C.correct], correct: [C.correct],
  ticks: [C.pointsStart], character: [C.characterIn], whoosh: [C.ctaTransition - 0.25, 'peak on ctaTransition', C.ctaTransition, 'peak'],
  logo: [C.logoLand], ctaGroove: [C.logoLand], stores: [C.stores], final: [C.musicEndChord],
};
const res = {};
log('EVENT ONSETS / ENDS (solo renders). ms columns are relative to the cue; "frame" = the video frame that shows the cue.');
log('  event       cue      frame    first(-60) attack(-20) peak10ms@  last(-60/-80) lastSample   end check  (last = last sample above -60 dB re the event peak and above -80 dBFS)');
for (const [id, [cue, endLabel, endT, mode]] of Object.entries(EXPECT)) {
  const s = load(id);
  if (!s) { log(`  ${id.padEnd(10)} (no audio)`); continue; }
  const pk = meta.events[id].peak;
  const env = new Float32Array(s.n);
  for (let i = 0; i < s.n; i++) env[i] = Math.max(Math.abs(s.L[i]), Math.abs(s.R[i]));
  let first = -1, att = -1, last = -1, lastNZ = -1, pkI = 0;
  for (let i = 0; i < s.n; i++) {
    if (env[i] > pk * 1e-3) { if (first < 0) first = i; if (env[i] > 1e-4) last = i; }
    if (att < 0 && env[i] >= pk * 0.1) att = i;
    if (env[i] > 0) lastNZ = i;
    if (env[i] > env[pkI]) pkI = i;
  }
  // "peak" = loudest 10 ms RMS window (more meaningful than the single loudest sample)
  let best = 0, bestT = 0;
  const W = Math.round(0.01 * SR), step = Math.round(0.001 * SR);
  for (let i = 0; i + W < s.n; i += step) { let e = 0; for (let k = i; k < i + W; k += 2) e += s.L[k] * s.L[k] + s.R[k] * s.R[k]; if (e > best) { best = e; bestT = s.t(i + W / 2); } }
  const ms = (t) => ((t - cue) * 1000).toFixed(1).padStart(7);
  const r = { cue, frame: frameT(cue, id),first: s.t(first), attack: s.t(att), peak10ms: bestT, last: s.t(last), lastSample: s.t(lastNZ), peakDbRaw: db(pk) };
  let endMsg = '';
  if (mode === 'peak') { r.endT = endT; r.endOk = Math.abs(r.peak10ms - endT) <= 0.012; endMsg = `${endLabel} ${endT}: 10 ms peak ${((r.peak10ms - endT) * 1000).toFixed(1)} ms ${r.endOk ? 'OK' : 'OFF'}`; }
  else if (endT !== undefined) {
    // a stop is clean when the event has dropped >= 30 dB (re its 10 ms body just before the stop) within
    // 2 ms of it; what is left after that is the master EQ's 45 Hz high-pass ringing, decaying ~9 dB / 5 ms
    const pkIn = (a, b) => { let p = 0; for (let i = Math.max(0, s.i(a)); i < Math.min(s.n, s.i(b)); i++) p = Math.max(p, env[i]); return p; };
    const body = pkIn(endT - 0.012, endT - 0.002), after = pkIn(endT + 0.002, endT + 0.012);
    r.endT = endT; r.dropDb = db(after) - db(body); r.afterDbfs = db(after);
    r.endOk = r.last <= endT + 0.0005 || r.dropDb <= -30;
    endMsg = `${endLabel} ${endT}: last(-60) ${((r.last - endT) * 1000).toFixed(1)} ms; 2-12 ms after: ${r.afterDbfs.toFixed(0)} dBFS = ${r.dropDb.toFixed(0)} dB re the body before ${r.endOk ? 'OK' : 'NOT CLEAN'}`;
  }
  res[id] = r;
  log(`  ${id.padEnd(10)} ${cue.toFixed(4)}  ${r.frame.toFixed(4)}  ${ms(r.first)}  ${ms(r.attack)}  ${r.peak10ms.toFixed(4)}  ${r.last.toFixed(4)}   ${r.lastSample.toFixed(4)}   ${endMsg}`);
}
// the key blips must start on the exact video frame of the press
const kOff = C.keyTimes.map((t, i) => (res[`key${i + 1}`].first - t) * 1000);
log(`\nKEY BLIPS: first sample minus key time (ms): ${kOff.map((v) => v.toFixed(2)).join(' ')} | key time minus nearest frame: ${C.keyTimes.map((t) => ((t - Math.round(t * 30) / 30) * 1000).toFixed(2)).join(' ')} ms`);

// ---------------------------------------------------------------- dash: pan, level, Doppler
{
  const s = load('dash'), t0 = C.dashStart, t1 = C.dashEnd + 0.12;
  const W = Math.round(0.006 * SR), hop = Math.round(0.002 * SR);
  const bal = [];
  for (let i = s.i(t0); i + W <= s.i(t1); i += hop) {
    let l = 0, r = 0; for (let k = i; k < i + W; k++) { l += s.L[k] ** 2; r += s.R[k] ** 2; }
    bal.push({ t: s.t(i + W / 2), lr: 10 * Math.log10((l + 1e-20) / (r + 1e-20)), lvl: 10 * Math.log10((l + r) / (2 * W) + 1e-20) });
  }
  let cross = null;
  for (let k = 1; k < bal.length; k++) if (bal[k - 1].lr > 0 && bal[k].lr <= 0) { const a = bal[k - 1], b = bal[k]; cross = a.t + (a.lr / (a.lr - b.lr)) * (b.t - a.t); break; }
  const lvlPk = bal.reduce((p, x) => (x.lvl > p.lvl ? x : p));
  // equal-power pan position from the L/R ratio: pan = (4/pi) atan(R/L) - 1
  const panAt = (t) => { const x = bal.reduce((p, q) => (Math.abs(q.t - t) < Math.abs(p.t - t) ? q : p)); const g = Math.pow(10, -x.lr / 20); return (4 / Math.PI) * Math.atan(g) - 1; };
  // pitch of the buzzy tone: strongest partial 300-950 Hz, 2048-pt Hann, 2.5 ms hop, parabolic interpolation
  const N = 2048, win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } };
  const pitch = [];
  for (let c = s.i(t0 + 0.02); c + N / 2 < s.i(C.dashEnd - 0.01); c += Math.round(0.0025 * SR)) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k < N; k++) { const j = c - N / 2 + k; re[k] = j >= 0 ? (s.L[j] + s.R[j]) * 0.5 * win[k] : 0; }
    fft(re, im);
    const mag = (k) => Math.hypot(re[k], im[k]);
    let bk = 0, bm = 0; for (let k = Math.round(300 * N / SR); k <= Math.round(950 * N / SR); k++) { const v = mag(k); if (v > bm) { bm = v; bk = k; } }
    const a = Math.log(mag(bk - 1) + 1e-12), b = Math.log(bm + 1e-12), g = Math.log(mag(bk + 1) + 1e-12), d = 0.5 * (a - g) / (a - 2 * b + g);
    pitch.push({ t: s.t(c), hz: (bk + d) * SR / N });
  }
  let drop = null;
  for (let k = 2; k < pitch.length - 2; k++) {
    const sl = (Math.log2(pitch[k + 2].hz) - Math.log2(pitch[k - 2].hz)) * 12 / (pitch[k + 2].t - pitch[k - 2].t);
    if (!drop || sl < drop.sl) drop = { t: pitch[k].t, sl };
  }
  const hzAt = (t) => pitch.reduce((p, q) => (Math.abs(q.t - t) < Math.abs(p.t - t) ? q : p)).hz;
  const lvlAt = (t) => bal.reduce((p, q) => (Math.abs(q.t - t) < Math.abs(p.t - t) ? q : p)).lvl;
  res.dashDetail = { panCross: cross, levelPeak: lvlPk.t, dopplerSteepest: drop && drop.t, dopplerSlope: drop && drop.sl, hzStart: hzAt(t0 + 0.03), hzEnd: hzAt(C.dashEnd), tailDb: lvlAt(C.dashEnd + 0.03) - lvlPk.lvl };
  log(`\nDASH (solo): pan centre (L = R) at ${cross ? cross.toFixed(4) : 'n/a'} s | level peak at ${lvlPk.t.toFixed(4)} s | Doppler steepest drop at ${drop.t.toFixed(4)} s (${drop.sl.toFixed(0)} st/s)`);
  log(`  pitch ${hzAt(t0 + 0.03).toFixed(0)} Hz at ${(t0 + 0.03).toFixed(2)} -> ${hzAt(cross || 1.6).toFixed(0)} at the pass -> ${hzAt(C.dashEnd).toFixed(0)} at ${C.dashEnd}`);
  const vf = [45, 46, 47, 48, 49, 50, 51].map((f) => f / 30);
  log(`  pan position at each frame onset (equal-power estimate, -1 = hard left): ${vf.map((t) => `${(t * 30).toFixed(0)}:${panAt(t + 1 / 60).toFixed(2)}`).join(' ')}   (sampled mid-frame)`);
  log(`  level re peak at dashEnd + 30 ms: ${res.dashDetail.tailDb.toFixed(1)} dB`);
  const vis = join(HERE, 'dashsync.json');
  if (existsSync(vis)) {
    const v = JSON.parse(readFileSync(vis, 'utf8')), vc = v.cross.mean;
    log(`  PICTURE (dashsync.json): cloud centre crosses the frame centre between frames ${vc.between.join('/')}: ${vc.continuous.toFixed(4)} s on frame-start times, ${vc.displayed.toFixed(4)} s displayed`);
    log(`  audio pan centre minus displayed crossing: ${((cross - vc.displayed) * 1000).toFixed(1)} ms | Doppler steepest drop minus displayed crossing: ${((drop.t - vc.displayed) * 1000).toFixed(1)} ms`);
    log('  per frame, picture pan (cloud rim mean x) vs audio pan mid-frame: ' + v.rows.filter((r) => r.n > 50).map((r) => `${r.frame}: ${r.pan.toFixed(2)}/${panAt(r.frame / 30 + 1 / 60).toFixed(2)}`).join('  ') + '  (frames 45 and 51 are clipped by the frame edge)');
    res.dashDetail.picture = vc;
  }
}
// ---------------------------------------------------------------- whistle hard stop: the last 10 ms, 1 ms steps
{
  const s = load('whistle'), e = C.fallEnd, rows = [];
  for (let t = e - 0.01; t < e + 0.003; t += 0.001) { let p = 0; for (let i = s.i(t); i < s.i(t + 0.001); i++) p = Math.max(p, Math.abs(s.L[i]), Math.abs(s.R[i])); rows.push(`${((t - e) * 1000).toFixed(0)}:${db(p).toFixed(0)}`); }
  log(`\nWHISTLE STOP (peak dBFS per ms, ms re fallEnd ${e}): ${rows.join(' ')}`);
  const fs = frameT(e, 'whistle');
  log(`  the 2x snap/hold shows on frame ${Math.round(fs * 30)} (${fs.toFixed(4)} s): picture minus stop ${((fs - e) * 1000).toFixed(1)} ms`);
}
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'sync_report.txt'), txt);
writeFileSync(join(HERE, 'sync.json'), JSON.stringify(res, null, 1));
