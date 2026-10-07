// Nostalgia ad (canal DESENHOS, fase 1) — the complete 15 s soundtrack, synthesized in code.
//
// Everything here is ORIGINAL: chip-style pulse/triangle/noise voices playing an original
// progression and original motifs in A major (with mixolydian / blue-note "twang"), plus
// hand-built SFX: TV static, CRT power-on, the app chime, a GENERIC two-note toy-horn
// "bip-bip" (pulse voices, rising fourth: no voice, no formant, no tongue click), a Doppler
// pass-by, a slide-whistle fall, a distant dust puff, key blips, jingles, whoosh...
// No samples, no downloads, no existing melodies, no imitation of any cartoon voice or theme.
//
// Every hit is placed from timeline.js (CUES / BEAT / MUSIC_START), so picture and
// sound share one clock. Rendering is deterministic: an OfflineAudioContext graph fed
// only by seeded-PRNG noise, then a JS mastering pass (loudness to ~-14 LUFS, look-ahead
// limiter, true-peak normalisation to -1.8 dBTP, hard silence in the tail).

import { DURATION, BEAT, MUSIC_START, CUES } from './timeline.js';

export const SAMPLE_RATE = 48000;

const S16 = BEAT / 4;               // 16th note (0.125 s at 120 BPM)
const S32 = BEAT / 8;               // 32nd note
const HALF_FRAME = 1 / 60;          // key times are rounded to the nearest 30 fps frame
const TARGET_LUFS = -14;
// final true-peak ceiling (dBTP). The delivery spec is <= -1.5 dBTP on ANY BS.1770-4 meter: aim at -1.8 so
// the master and the decoded AAC keep >= 0.2 dB of margin (at -1.5 the file read -1.44 on a 48-tap meter)
const TRUE_PEAK_DB = -1.8;
const LIMIT_DB = -2.3;              // sample-peak ceiling of the limiter (inter-sample peaks land ~0.5 dB higher, near TRUE_PEAK_DB)
const FINAL_RING = 0.75;            // how long the final chord rings before true silence
const SILENCE_AT = CUES.musicEndChord + FINAL_RING + 0.03;
const SEED = 0x19b1b;
const PUFF_CLEAR = 2.9;             // the puff (and its canyon echoes) has died away by here: the groove slams at 3.0

// ---------------------------------------------------------------- utilities
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function nm(s) {
  const r = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  return 12 * (Number(r[3]) + 1) + PC[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
}
const TONIC = PC.A;                        // this ad's key: A major (the first ad was in C)
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
function diatonic(midi, steps) {           // move by scale steps inside A major
  const rel = midi - TONIC;
  const idx = MAJOR.indexOf(((rel % 12) + 12) % 12);
  if (idx < 0) return midi - 3;            // blue notes (C, G): a minor third below
  let d = idx + steps;
  const o = Math.floor(d / 7);
  d -= o * 7;
  return TONIC + 12 * (Math.floor(rel / 12) + o) + MAJOR[d];
}

// Harmony: roots in octave 2/3 so the triangle bass is supportive, not sub.
const CHORD = {
  A: { root: nm('A2'), iv: [0, 4, 7] },
  'F#m': { root: nm('F#2'), iv: [0, 3, 7] },
  D: { root: nm('D3'), iv: [0, 4, 7] },
  E: { root: nm('E3'), iv: [0, 4, 7] },
};
function chordNotes(name, lo, hi) {
  const ch = CHORD[name], out = [];
  for (let n = lo; n <= hi; n++) if (ch.iv.includes((((n - ch.root) % 12) + 12) % 12)) out.push(n);
  return out;
}
// chords change every 2 beats from the section start
const prog = (t0, names) => names.map((name, i) => ({ t: t0 + i * 2 * BEAT, name }));
function chordAt(chords, t) {
  let c = chords[0];
  for (const x of chords) if (x.t <= t + 1e-6) c = x;
  return c;
}

// Pulse wave with duty d as a PeriodicWave (NES/SNES-style 12.5 / 25 / 50 %).
function pulseWave(ctx, duty, n = 64) {
  const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
    im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}
// The bip-bip's chip-horn wave: a fixed additive spectrum (sine partials, all in phase), bright but tamed:
// 2nd harmonic -8 dB, 3rd -11 dB, then a steep roll-off. A plain 25 % pulse has its 2nd harmonic at -3 dB,
// which at E6/A6 lands on 2.6-3.5 kHz (ear + phone-speaker resonance) and made the horn piercing.
const HORN_PARTIALS = [1, 0.4, 0.28, 0.14, 0.1, 0.063, 0.045, 0.03];
function hornWave(ctx) {
  const n = HORN_PARTIALS.length, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
  HORN_PARTIALS.forEach((a, k) => { im[k + 1] = a; });
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// ---------------------------------------------------------------- noise tables (seeded)
function whiteNoise(n, rnd) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rnd() * 2 - 1;
  return a;
}
// 15-bit LFSR, the classic console noise channel; `hold` = samples per clock
function lfsrNoise(n, hold, seed) {
  const a = new Float32Array(n);
  let r = (seed & 0x7fff) || 1, v = 1;
  for (let i = 0; i < n; i++) {
    if (i % hold === 0) {
      const b = (r ^ (r >> 1)) & 1;
      r = (r >> 1) | (b << 14);
      v = (r & 1) ? 1 : -1;
    }
    a[i] = v;
  }
  return a;
}
function normalize(a, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
  return a;
}
// analog TV snow: hiss with flutter + crackle pops
function makeStatic(sr, dur, rnd) {
  const n = Math.ceil(dur * sr), a = new Float32Array(n);
  const flutStep = Math.round(sr / 28), sm = 1 - Math.exp(-1 / (0.004 * sr));
  let flut = 0.7, flutT = 0.7, pop = 0, popDec = 0, sgn = 1;
  for (let i = 0; i < n; i++) {
    if (i % flutStep === 0) flutT = 0.45 + 0.55 * rnd();
    flut += (flutT - flut) * sm;
    if (rnd() < 26 / sr) {
      pop = 0.5 + 1.2 * rnd();
      popDec = Math.exp(-1 / ((0.0004 + 0.002 * rnd()) * sr));
      sgn = rnd() < 0.5 ? -1 : 1;
    }
    a[i] = 0.5 * (rnd() * 2 - 1) * flut + pop * (0.55 * sgn + 0.45 * (rnd() * 2 - 1));
    pop *= popDec;
  }
  return normalize(a);
}
// desert wind: white noise under a slow, smoothed random gust envelope (whisper level only)
function makeWind(sr, dur, rnd) {
  const n = Math.ceil(dur * sr), a = new Float32Array(n);
  const step = Math.round(sr / 7), sm = 1 - Math.exp(-1 / (0.06 * sr));
  let g = 0.6, gT = 0.6;
  for (let i = 0; i < n; i++) {
    if (i % step === 0) gT = 0.35 + 0.65 * rnd();
    g += (gT - g) * sm;
    a[i] = (rnd() * 2 - 1) * g;
  }
  return normalize(a);
}

// ---------------------------------------------------------------- the mixer / voice helpers
// Chrome sums a node's inputs in an unspecified (pointer-hash) order, so a node with 3+
// inputs can differ in the last float bit from render to render. Float addition of TWO
// operands is commutative, so every summing point here gets at most two inputs: voices are
// collected and joined by a balanced binary tree of GainNodes -> bit-identical renders.
class Bus {
  constructor(ctx) { this.ctx = ctx; this.leaves = []; }
  add(node) { this.leaves.push(node); }
  build(target) {
    let level = this.leaves;
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 >= level.length) { next.push(level[i]); continue; }
        const g = this.ctx.createGain();
        level[i].connect(g); level[i + 1].connect(g);
        next.push(g);
      }
      level = next;
    }
    if (level.length) level[0].connect(target);
  }
}

class Mix {
  constructor(ctx, seed) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.rnd = mulberry32(seed);
    this.waves = { sq12: pulseWave(ctx, 0.125), sq25: pulseWave(ctx, 0.25), sq50: pulseWave(ctx, 0.5), horn: hornWave(ctx) };
    this.ducks = [];
    this.leadDucks = [];

    // master: sub cut (phones can't play it anyway), a touch of low-shelf cut and presence
    this.master = ctx.createGain();
    let node = this.master;
    for (const f of [this.biquad('highpass', 45, 0.7), this.biquad('highpass', 45, 0.7),
      this.biquad('lowshelf', 140, 0.7, -2.5), this.biquad('peaking', 2800, 0.8, 2)]) {
      node.connect(f); node = f;
    }
    node.connect(ctx.destination);

    // Voices go into Bus collectors, summed later by a binary tree (see Bus): the master
    // gain gets exactly two inputs, music and sfx.
    this.musicGain = ctx.createGain();  // ducked by applyDuck()
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.music = new Bus(ctx);
    this.sfx = new Bus(ctx);
    this.lead = new Bus(ctx);
    // the celebration's harmony line (a third under the lead): no echo, but it follows the lead's ducks
    this.harm = new Bus(ctx);
    this.harmSum = ctx.createGain();
    this.music.add(this.harmSum);

    // lead echo (3/16 delay, mono-safe: a rhythmic repeat, not a comb)
    this.leadSum = ctx.createGain();
    this.music.add(this.leadSum);
    const dl = ctx.createDelay(1.0);
    dl.delayTime.value = 3 * S16;
    const fb = ctx.createGain(); fb.gain.value = 0.24;
    const lp = this.biquad('lowpass', 3200, 0.7);
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.2;
    this.leadSum.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
    lp.connect(wet); wet.connect(pan); this.music.add(pan);

    this.white = this.buffer(whiteNoise(3 * this.sr, this.rnd));
    this.lfsr = this.buffer(lfsrNoise(this.sr, 1, seed ^ 0x1234));
    this.lfsrC = this.buffer(lfsrNoise(this.sr, 3, seed ^ 0x4321));
  }
  buffer(arr) {
    const b = this.ctx.createBuffer(1, arr.length, this.sr);
    b.copyToChannel(arr, 0);
    return b;
  }
  biquad(type, f, Q = 0.707, gainDb = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gainDb;
    return b;
  }
  route(node, dest, pan = 0) {
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p); dest.add(p);
    } else dest.add(node);
  }
  // attack -> decay to sustain -> release (exponential), returns the stop time
  env(p, t, { gain, a = 0.002, decay = 0.1, sus = 0, dur = 0.1, rel = 0.02 }) {
    const ta = t + a;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(gain, ta);
    p.setTargetAtTime(gain * sus, ta, decay);
    const tr = Math.max(t + dur, ta + 1e-3);
    p.setTargetAtTime(0, tr, rel);
    return tr + rel * 9;
  }
  sweep(param, t, pts) {                     // pts: [[time, value], ...] exponential
    param.setValueAtTime(pts[0][1], pts[0][0]);
    for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(pts[i][1], pts[i][0]);
  }
  // o.bend: start that many semitones flat and slide up to pitch in o.bendTime (the "twang");
  // o.detune: static cents offset (chorus between two voices); o.lpEnv: [from Hz, to Hz, tau] pluck filter
  tone(dest, o) {
    const c = this.ctx;
    const { t, f, f1 = 0, wave = 'sq25', pan = 0, lp = 0, vib = 0, vibDelay = 0.1, vibRate = 6,
      bend = 0, bendTime = 0.05, detune = 0, lpEnv = null } = o;
    const glide = o.glide ?? o.dur;
    const osc = c.createOscillator();
    if (this.waves[wave]) osc.setPeriodicWave(this.waves[wave]); else osc.type = wave;
    if (detune) osc.detune.value = detune;
    if (bend) {
      osc.frequency.setValueAtTime(f * Math.pow(2, -bend / 12), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + bendTime);
    } else osc.frequency.setValueAtTime(f, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const g = c.createGain();
    const end = this.env(g.gain, t, o);
    if (vib > 0) {
      const l = c.createOscillator(); l.frequency.value = vibRate;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + vibDelay);
      lg.gain.linearRampToValueAtTime(f * (Math.pow(2, vib / 1200) - 1), t + vibDelay + 0.08);
      l.connect(lg); lg.connect(osc.frequency);
      l.start(t); l.stop(end);
    }
    let node = osc;
    if (lp || lpEnv) {
      const fl = this.biquad('lowpass', lp || lpEnv[0], 0.7);
      if (lpEnv) { fl.frequency.setValueAtTime(lpEnv[0], t); fl.frequency.setTargetAtTime(lpEnv[1], t, lpEnv[2]); }
      osc.connect(fl); node = fl;
    }
    node.connect(g);
    this.route(g, dest, pan);
    osc.start(t); osc.stop(end);
    return g;
  }
  // a sampled automation curve fn(u), u in [0,1] over [t0, t0+dur] (1 point per ms by default)
  curve(fn, dur, perSec = 1000) {
    const n = Math.max(2, Math.round(dur * perSec) + 1), a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn(i / (n - 1));
    return a;
  }
  // several voices -> one StereoPanner whose position follows panFn(u) over [t0, t0+dur].
  // The voices are summed by their own binary tree first, so the panner has ONE input.
  movingPan(voices, dest, t0, dur, panFn) {
    const p = this.ctx.createStereoPanner();
    const cur = this.curve(panFn, dur, 500);
    p.pan.setValueAtTime(cur[0], 0);
    p.pan.setValueCurveAtTime(cur, t0, dur);
    const b = new Bus(this.ctx);
    for (const v of voices) b.add(v);
    b.build(p);
    dest.add(p);
  }
  // several voices -> one GainNode (binary tree, so every summing point still has <= 2 inputs)
  group(voices, dest) {
    const g = this.ctx.createGain();
    const b = new Bus(this.ctx);
    for (const v of voices) b.add(v);
    b.build(g);
    dest.add(g);
    return g;
  }
  noise(dest, o) {
    const c = this.ctx;
    const { buf = this.white, t, filters = [], pan = 0, rate = 1 } = o;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
    let node = src;
    for (const fd of filters) {
      const f = this.biquad(fd.type, fd.f || 1000, fd.Q ?? 0.707, fd.gain ?? 0);
      if (fd.pts) this.sweep(f.frequency, t, fd.pts);
      node.connect(f); node = f;
    }
    const g = c.createGain();
    const end = o.custom ? o.custom(g.gain) : this.env(g.gain, t, o);
    node.connect(g);
    this.route(g, dest, pan);
    const off = o.offset ?? this.rnd() * Math.max(0, buf.duration - 0.2);
    src.start(t, off); src.stop(end);
    return g;
  }
  // sidechain-style dip of the music bus
  duck(t, db, hold = 0.06, att = 0.006, rel = 0.16) { this.ducks.push({ t, db, hold, att, rel }); }
  // extra dip of the LEAD only: it sits in the same register/timbre as the key blips and
  // pops, so on a phone speaker a lead note starting with a key masks it (QA: key 1 = C5 on C5)
  duckLead(t, db, hold = 0.07, att = 0.006, rel = 0.12) { this.leadDucks.push({ t, db, hold, att, rel }); }
  applyDuck() {
    this.musicGain.gain.setValueCurveAtTime(this.duckCurve(this.ducks), 0, DURATION);
    if (this.leadDucks.length) {
      this.leadSum.gain.setValueCurveAtTime(this.duckCurve(this.leadDucks), 0, DURATION);
      this.harmSum.gain.setValueCurveAtTime(this.duckCurve(this.leadDucks), 0, DURATION);
    }
  }
  duckCurve(list) {
    const rate = 1000, n = Math.round(DURATION * rate) + 1, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let g = 1;
      for (const d of list) {
        let s = 0;
        if (t >= d.t - d.att && t < d.t) s = (t - (d.t - d.att)) / d.att;
        else if (t >= d.t && t <= d.t + d.hold) s = 1;
        else if (t > d.t + d.hold && t < d.t + d.hold + d.rel) s = 1 - (t - d.t - d.hold) / d.rel;
        g *= 1 - (1 - Math.pow(10, d.db / 20)) * s;
      }
      curve[i] = g;
    }
    return curve;
  }
  finalize() {
    this.applyDuck();
    this.lead.build(this.leadSum);
    this.harm.build(this.harmSum);
    this.music.build(this.musicGain);
    this.sfx.build(this.sfxGain);
  }
}

// ---------------------------------------------------------------- drum kit (noise channel style)
// (the sub sine is what trips the limiter on every downbeat, and a phone cannot play it: keep it lean)
function kick(m, t, v = 1) {
  m.tone(m.music, { t, f: 180, f1: 52, glide: 0.09, wave: 'sine', gain: 0.32 * v, a: 0.001, decay: 0.07, sus: 0, dur: 0.12, rel: 0.03 });
  m.tone(m.music, { t, f: 130, f1: 70, glide: 0.03, wave: 'sq50', gain: 0.2 * v, a: 0.001, decay: 0.016, sus: 0, dur: 0.03, rel: 0.01, lp: 1400 });
  m.noise(m.music, { t, gain: 0.18 * v, a: 0.0005, decay: 0.003, dur: 0.005, rel: 0.003, filters: [{ type: 'lowpass', f: 4000 }] });
}
function snare(m, t, v = 1, dest = m.music) {
  m.noise(dest, { buf: m.lfsrC, t, gain: 0.34 * v, a: 0.001, decay: 0.055, dur: 0.1, rel: 0.03, filters: [{ type: 'bandpass', f: 1900, Q: 0.7 }] });
  m.tone(dest, { t, f: 240, f1: 170, glide: 0.05, wave: 'triangle', gain: 0.26 * v, a: 0.001, decay: 0.035, sus: 0, dur: 0.06, rel: 0.02 });
}
function hat(m, t, v = 1, open = false) {
  m.noise(m.music, { buf: m.lfsr, t, gain: 0.13 * v, a: 0.0005, decay: open ? 0.07 : 0.014, dur: open ? 0.12 : 0.03, rel: 0.02, pan: 0.12, filters: [{ type: 'highpass', f: 7000 }] });
}
// tau 0.3: a shorter ring keeps the >8 kHz wash from sustaining (harsh on phones, and costly for AAC re-encodes)
function crash(m, t, v = 1, tau = 0.3) {
  m.noise(m.music, { t, gain: 0.2 * v, a: 0.001, decay: tau, dur: tau * 5, rel: 0.1, filters: [{ type: 'highpass', f: 4200 }, { type: 'peaking', f: 7500, Q: 0.8, gain: 4 }] });
  m.noise(m.music, { buf: m.lfsr, t, gain: 0.07 * v, a: 0.001, decay: tau * 0.6, dur: tau * 3, rel: 0.1, filters: [{ type: 'bandpass', f: 5200, Q: 2 }] });
}
// staccato bass: triangle body + a 25 % pulse an octave up (that is what a phone speaker plays)
function bass(m, t, midi, dur, v = 1, dest = m.music) {
  m.tone(dest, { t, f: mtof(midi), wave: 'triangle', gain: 0.22 * v, a: 0.002, decay: 0.09, sus: 0.55, dur, rel: 0.018 });
  m.tone(dest, { t, f: mtof(midi + 12), wave: 'sq25', gain: 0.07 * v, a: 0.002, decay: 0.05, sus: 0.35, dur, rel: 0.015, lp: 1800 });
}
// castanet: a dry, very short wooden "tak" (a resonant noise band + a tiny falling knock)
function castanet(m, t, v = 1, pan = -0.3) {
  m.noise(m.music, { buf: m.lfsr, t, gain: 0.5 * v, a: 0.0004, decay: 0.005, dur: 0.008, rel: 0.004, pan,
    filters: [{ type: 'bandpass', f: 3100, Q: 3.5 }, { type: 'highpass', f: 1500 }] });
  m.tone(m.music, { t, f: 2150, f1: 1650, glide: 0.015, wave: 'sine', gain: 0.07 * v, a: 0.0004, decay: 0.006, sus: 0, dur: 0.01, rel: 0.004, pan });
}
// the "chick" of a boom-chick: a short, thin chord on an off-beat
function stab(m, t, name, v = 1) {
  for (const n of chordNotes(name, nm('E4'), nm('C#5'))) {
    m.tone(m.music, { t, f: mtof(n), wave: 'sq12', gain: 0.04 * v, a: 0.002, decay: 0.03, sus: 0.3, dur: 0.05, rel: 0.02, pan: 0.25, lp: 4000 });
  }
}
function sparkle(m, t0, span, count, gain = 0.1) {
  const notes = [];
  for (let o = 6; o <= 8; o++) for (const p of PENTA) notes.push(12 * (o + 1) + TONIC + p);   // A6.. A-major pentatonic
  for (let i = 0; i < count; i++) {
    const t = t0 + (i + m.rnd() * 0.8) * (span / count);
    const n = notes[Math.floor(m.rnd() * 7)];
    m.tone(m.sfx, { t, f: mtof(n), wave: i % 2 ? 'sine' : 'triangle', gain: gain * (0.6 + 0.4 * m.rnd()), a: 0.003, decay: 0.03, sus: 0, dur: 0.04, rel: 0.02, pan: (i % 2 ? 0.3 : -0.3) });
  }
}

// ---------------------------------------------------------------- music sections
// Lead lines: [step (16ths from the section start), note, length in 16ths, bend in semitones (optional)].
// All ORIGINAL, written for this ad; out/audio_qa/melody.mjs checks them against the first ad's
// lines, well-known game themes and the cartoon / western references (transposition-invariant).
//
// Groove riff (A | F#m | D | E | A): a low "baritone twang" line (A3-D5) so the key taps own the
// E5-E6 register. Each major-chord cell slides into the root from a semitone below, then hammers the
// blue minor third onto the major third (A~ C C# E G); the F#m cell answers; it ends on a C -> C# twang.
// Its onsets sit on steps {0,2,3,5,7} of every 8, the taps on {1,4,6}: melody and typing interlock.
const LEAD_GROOVE = [
  [0, 'A3', 2, 1], [2, 'C4', 1], [3, 'C#4', 2], [5, 'E4', 2], [7, 'G4', 1],
  [8, 'F#4', 2, 1], [10, 'A4', 1], [11, 'C#5', 2], [13, 'A4', 2], [15, 'E4', 1],
  [16, 'D4', 2, 1], [18, 'F4', 1], [19, 'F#4', 2], [21, 'A4', 2], [23, 'C5', 1],
  [24, 'E4', 2, 1], [26, 'G4', 1], [27, 'G#4', 2], [29, 'B4', 2], [31, 'D5', 1],
  [32, 'C#5', 2, 1],
];
// Celebration (A | D | F#m | E): the riff's long-short-long cell up high with blues-rock licks (the C over
// D is a blue note), harmonised a third below; rests under the CORRETO jingle.
const LEAD_CELEBRATE = [
  [5, 'E5', 2], [7, 'G5', 1],
  [8, 'A5', 2, 2], [10, 'A5', 1], [11, 'D6', 2], [13, 'C6', 2], [15, 'A5', 1],
  [16, 'C#6', 2, 1], [18, 'C#6', 1], [19, 'E6', 2], [21, 'C#6', 2], [23, 'A5', 1],
  [24, 'B5', 2, 2], [26, 'B5', 1], [27, 'D6', 2], [29, 'E6', 2, 2], [31, 'D6', 1],
];
// Closing phrase (D | E): rests on the logo ding (step 0) and the stores pop (step 8), recalls the
// celebration's last lick and leans on D6 so the final A chord's C#6 resolves it.
const LEAD_CTA = [
  [1, 'A5', 1], [2, 'D6', 2, 2],
  [4, 'B5', 2], [6, 'B5', 1], [7, 'D6', 1], [9, 'E6', 2, 2], [11, 'D6', 1],
];

// Galloping bass (long-short-short on every beat: root, octave, fifth), kick on 1 and 3, backbeat
// snare, 8th hats, castanets on the last 16th of every beat, boom-chick stabs on the "&" of 1 and 3.
// softAt: key-tap times. They are frame-rounded (up to half a frame off the grid), so anything within
// half a frame of a tap counts as "under" it and plays soft (same 0.5-3 kHz band on a phone).
// softSpans: [t0, t1] windows (the points counter) where the stabs, castanets, snare and bass step back too.
// slam: crash + kick on t0 (true = full, a number = crash level).
function groove(m, { t0, t1, chords, lead = [], leadWave = 'sq25', leadGain = 0.17, harmony = false, twang = true,
  dense = false, slam = true, softAt = [], softSpans = [], stabs = true }) {
  const steps = Math.round((t1 - t0) / S16);
  const under = (t) => softAt.some((x) => Math.abs(x - t) <= HALF_FRAME + 1e-6)
    || softSpans.some(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
  for (let s = 0; s < steps; s++) {
    const t = t0 + s * S16;
    const ch = chordAt(chords, t);
    const G = Math.round((t - MUSIC_START) / S16), pos = ((G % 16) + 16) % 16, beat = pos % 4;
    const root = CHORD[ch.name].root, soft = under(t);
    if (beat === 0) bass(m, t, root, S16 * 1.5, soft ? 0.6 : 1);
    else if (beat === 2) bass(m, t, root + 12, S16 * 0.6, soft ? 0.5 : 0.8);
    else if (beat === 3) bass(m, t, root + 7, S16 * 0.6, 0.85);
    if ((pos === 0 || pos === 8) && !(slam && s === 0)) kick(m, t, 1);   // the slam brings its own kick
    if (pos === 4 || pos === 12) snare(m, t, soft ? 0.4 : 1);
    if (pos === 14) hat(m, t, 0.8, true);
    else if (pos % 2 === 0) hat(m, t, pos % 4 === 2 ? 0.9 : 0.55);
    else if (dense) hat(m, t, 0.3);
    if (beat === 3) castanet(m, t, (pos === 15 ? 1 : 0.75) * (soft ? 0.45 : 1), pos % 8 === 3 ? -0.3 : 0.3);
    if (dense && pos === 15) castanet(m, t - S32, 0.55 * (under(t - S32) ? 0.45 : 1), 0.3);   // "tr-rak" into the next bar
    if (stabs && (pos === 2 || pos === 10)) stab(m, t, ch.name, soft ? 0.4 : 1);
  }
  if (slam) { crash(m, t0, slam === true ? 1 : slam); kick(m, t0, 1.1); }
  // a full slam also hits the chord and a snare crack: kick + crash alone are sub + air, which a
  // phone speaker barely plays, so without them the groove's entrance (3.0) vanished on a phone
  if (slam === true) {
    snare(m, t0, 0.9);
    for (const n of chordNotes(chords[0].name, nm('E4'), nm('E5'))) {
      m.tone(m.music, { t: t0, f: mtof(n), wave: 'sq25', gain: 0.085, a: 0.002, decay: 0.08, sus: 0.3, dur: 0.14, rel: 0.04, lp: 5000, pan: -0.1 });
    }
  }
  for (const [step, name, len, bend = 0] of lead) {
    const t = t0 + step * S16;
    if (t >= t1 - 1e-6) continue;
    const midi = nm(name), dur = len * S16 * 0.88;
    const shape = { a: 0.003, decay: twang ? 0.09 : 0.16, sus: twang ? 0.5 : 0.65, dur, rel: 0.03, bend, bendTime: 0.055,
      vib: len >= 3 ? 16 : 0, vibDelay: 0.12, vibRate: 6.5 };
    m.tone(m.lead, { t, f: mtof(midi), wave: leadWave, gain: leadGain, lpEnv: twang ? [6500, 2200, 0.09] : null, lp: twang ? 0 : 7000, ...shape });
    if (harmony) {
      m.tone(m.harm, { t, f: mtof(diatonic(midi, -2)), wave: 'sq25', gain: leadGain * 0.42, pan: 0.2, lp: 5000, ...shape });
    }
  }
}

// Scene 1 music: one soft downbeat under the power-on, then OUT: the bip-bip, the dash, the fall and
// the gag's pause play alone.
function intro(m, t) {
  kick(m, t, 0.5);
  bass(m, t, CHORD.A.root, S16 * 1.6, 0.8);
}

// ENTER -> CORRETO: dominant (E) pedal, snare roll, rising arp, noise swell, then a 32nd of air before the hit.
// Everything runs through one gate that closes over the last 12 ms before tHit - S32, so the 32nd before
// CORRETO is true silence (the tails of the last roll hits no longer smear it): build, breath, hit.
function riser(m, t0, tHit) {
  const t1 = tHit - S32;
  const mid = t0 + Math.round((t1 - t0) / 2 / S16) * S16;
  const span = t1 - t0, bus = new Bus(m.ctx);
  for (let t = t0; t < t1 - 1e-6; t += (t < mid - 1e-6 ? S16 : S32)) snare(m, t, 0.3 + 0.52 * (t - t0) / span, bus);
  // the E pedal releases by itself 60 ms before the gate: cutting an 82 Hz wave mid-cycle rang the master high-pass
  for (let t = t0; t < t1 - 1e-6; t += 2 * S16) bass(m, t, nm('E2') + (Math.round((t - t0) / (2 * S16)) % 2 ? 12 : 0), Math.min(S16 * 1.7, t1 - t - 0.06), 1, bus);
  const notes = chordNotes('E', nm('E3'), nm('B6'));
  const count = Math.round(span / S32);
  for (let i = 0; i < count; i++) {
    const t = t0 + i * S32;
    m.tone(bus, { t, f: mtof(notes[Math.min(i, notes.length - 1)]), wave: 'sq12', gain: 0.04 + 0.05 * i / count, a: 0.002, decay: 0.04, sus: 0.4, dur: S32 * 0.9, rel: 0.015, pan: -0.2 });
  }
  m.noise(bus, {
    t: t0, filters: [{ type: 'bandpass', Q: 2, pts: [[t0, 500], [t1, 6000]] }],
    custom: (p) => { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(0.1, t1 - 0.01); p.linearRampToValueAtTime(0, t1); return t1 + 0.01; },
  });
  const gate = m.ctx.createGain(), GATE = 0.012;                 // raised-cosine close, 12 ms, ending on t1
  gate.gain.setValueCurveAtTime(m.curve((u) => 0.5 + 0.5 * Math.cos(Math.PI * u), GATE), t1 - GATE, GATE);
  bus.build(gate);
  m.music.add(gate);
}

function fanfare(m, t) {                     // music stinger on CORRETO (A major): the hit must top the riser on a phone too
  crash(m, t, 1.1);
  kick(m, t, 1.1);
  for (const n of ['A4', 'C#5', 'E5']) m.tone(m.music, { t, f: mtof(nm(n)), wave: 'sq50', gain: 0.08, a: 0.003, decay: 0.2, sus: 0.6, dur: 3 * S16, rel: 0.05 });
  m.tone(m.music, { t, f: mtof(nm('A5')), wave: 'sq25', gain: 0.07, a: 0.003, decay: 0.2, sus: 0.6, dur: 3 * S16, rel: 0.05 });
}

function finalChord(m, t) {                  // A major; the lead's last D6 resolves to C#6 with a small twang
  kick(m, t, 0.8);                           // lean sub: the limiter then leaves the chord itself alone
  crash(m, t, 0.9, FINAL_RING / 4);
  const ring = { a: 0.003, decay: FINAL_RING / 5, sus: 0, dur: FINAL_RING, rel: 0.02 };
  m.tone(m.music, { t, f: mtof(CHORD.A.root), wave: 'triangle', gain: 0.21, ...ring });
  m.tone(m.music, { t, f: mtof(CHORD.A.root + 12), wave: 'sq25', gain: 0.085, lp: 2200, ...ring });
  // the triad and the top note carry the chord on a phone speaker (the A2 / A3 root is below its band)
  for (const n of ['A4', 'C#5', 'E5']) m.tone(m.music, { t, f: mtof(nm(n)), wave: 'sq25', gain: 0.12, ...ring });
  m.tone(m.lead, { t, f: mtof(nm('C#6')), wave: 'sq12', gain: 0.2, vib: 18, vibDelay: 0.08, bend: 1, bendTime: 0.06, ...ring });
  sparkle(m, t + S32, FINAL_RING * 0.55, 6, 0.06);   // the visuals may draw a sparkle ring on this chord
}

// ---------------------------------------------------------------- SFX
function tvStatic(m, t0, t1) {
  const src = m.buffer(makeStatic(m.sr, t1 - t0 + 0.05, m.rnd));
  const gate = (p, level) => {
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(level, t0 + 0.015);
    p.setValueAtTime(level, t1 - 0.004);
    p.linearRampToValueAtTime(0, t1);             // hard stop at power-on
    return t1 + 0.01;
  };
  m.noise(m.sfx, {
    buf: src, t: t0, offset: 0,
    filters: [{ type: 'highpass', f: 280 }, { type: 'lowpass', f: 6500 }, { type: 'peaking', f: 1800, Q: 0.8, gain: 3 }],
    custom: (p) => gate(p, 0.92),
  });
  for (const [f, lv] of [[60, 0.012], [120, 0.008], [180, 0.01]]) {   // faint mains hum
    const o = m.ctx.createOscillator(); o.frequency.value = f;
    const g = m.ctx.createGain(); gate(g.gain, lv);
    o.connect(g); m.sfx.add(g); o.start(t0); o.stop(t1 + 0.01);
  }
}

function crtPowerOn(m, t) {
  m.tone(m.sfx, { t, f: 150, f1: 42, glide: 0.16, wave: 'triangle', gain: 0.55, a: 0.001, decay: 0.07, sus: 0, dur: 0.18, rel: 0.03 });
  m.noise(m.sfx, { t, gain: 0.35, a: 0.0005, decay: 0.003, dur: 0.005, rel: 0.003, filters: [{ type: 'highpass', f: 1500 }] });
  m.noise(m.sfx, { t, gain: 0.3, a: 0.001, decay: 0.05, dur: 0.08, rel: 0.02, filters: [{ type: 'lowpass', f: 900 }] });
  m.tone(m.sfx, { t, f: 380, f1: 3200, glide: 0.11, wave: 'sq25', gain: 0.1, a: 0.004, decay: 0.05, sus: 0.3, dur: 0.1, rel: 0.02, lp: 6000 });
}

// the app's two-note chime: soft and round (triangle + a faint sine octave, A5 -> E6) and SHORT, so it
// has died away before the bip-bip (a different, buzzy pulse timbre) takes over
function appChime(m, t) {
  for (const [i, n] of ['A5', 'E6'].entries()) {
    const ti = t + i * S32, dur = i ? 0.03 : S32 * 0.8;
    m.tone(m.sfx, { t: ti, f: mtof(nm(n)), wave: 'triangle', gain: 0.21, a: 0.002, decay: 0.035, sus: 0.3, dur, rel: 0.01 });
    m.tone(m.sfx, { t: ti, f: 2 * mtof(nm(n)), wave: 'sine', gain: 0.05, a: 0.002, decay: 0.02, sus: 0, dur, rel: 0.01 });
  }
}

// THE memory trigger: a generic two-note toy-horn "bip-bip!" (rising fourth, E6 -> A6): ONE chip-horn
// voice (hornWave: a fixed synthetic spectrum) at a steady pitch from the first sample (no scoop: a pitch glide into the note is a voice
// gesture; no detuned twin: at 1.3-1.8 kHz it would beat audibly inside a 95 ms note), a flat crisp
// body and a fast release, plus a triangle an octave down for body. No voice, no formant, no noise or
// tongue click: obviously a chip horn. Fundamentals 1.3-1.8 kHz + the 2nd/3rd harmonics sit right in a
// phone speaker's band; the wave's tamed 2nd/3rd harmonics and a gentle 4.5 kHz low-pass keep it bright
// but not piercing (no 2-5 kHz spike, no 5-12 kHz fizz).
function hornBip(m, t, midi, dur, v = 1) {
  const f = mtof(midi);
  const body = { t, a: 0.002, decay: 0.06, sus: 0.82, dur, rel: 0.009 };
  m.tone(m.sfx, { ...body, f, wave: 'horn', gain: 0.35 * v, lp: 4500 });
  m.tone(m.sfx, { ...body, f: f / 2, wave: 'triangle', gain: 0.1 * v });
  m.duck(t, -12, dur, 0.004, 0.05);
}

// "zuuum": the dust cloud streaks past LEFT -> RIGHT. Band-passed noise + a buzzy pulse tone, both
// Doppler-shifted (about +4 semitones approaching, -4 receding, the drop right at the pass), level
// peaking at the pass (1/distance), panned like the cloud; a small gust of dust where it vanishes.
// Picture sync (visuals_a.js, measured on its frames by out/audio_qa/dashsync.mjs): the cloud enters at
// the left edge on the dashStart frame and moves 200 output px per frame (6000 px/s); its centre crosses
// the frame centre between frames 47 and 48 (continuous 1.581 s). A 30 fps frame is held for 1/30 s, so the
// pan that matches each frame's picture over its display time crosses the centre half a frame later:
// DASH_PASS = 1.5975 - dashStart. The pan moves at the cloud's screen speed (6000 / 540 = 11.1 per s).
const DASH_PASS = 0.0975, DASH_PAN_SPEED = 11.1, DASH_TAIL = 0.04;
function dash(m, t0, t1) {
  const c = m.ctx, dur = t1 - t0 + DASH_TAIL;              // the tail is gone by dashEnd + 40 ms: the whistle owns the fall
  const tPass = t0 + DASH_PASS, w = 0.05;
  const x = (u) => (t0 + u * dur - tPass) / w;                            // distance from the viewer, in pass widths
  const dop = (u) => Math.pow(2, (-4 / 12) * Math.tanh(0.9 * x(u)));
  const level = (u) => {
    const t = u * dur, att = Math.min(1, t / 0.008), rem = Math.min(1, (dur - t) / (DASH_TAIL + 0.02));
    return att * (0.5 - 0.5 * Math.cos(Math.PI * rem)) / Math.sqrt(1 + x(u) * x(u));
  };
  const voices = [];
  for (const [fc, Q, g] of [[1700, 1.3, 1.07], [5200, 1.0, 0.42]]) {     // body band + thin "air" band
    const src = c.createBufferSource(); src.buffer = m.white; src.loop = true;
    const bp = m.biquad('bandpass', fc, Q);
    bp.frequency.setValueCurveAtTime(m.curve((u) => fc * dop(u), dur), t0, dur);
    const vca = c.createGain(); vca.gain.setValueAtTime(0, 0);
    vca.gain.setValueCurveAtTime(m.curve((u) => g * level(u), dur), t0, dur);
    src.connect(bp); bp.connect(vca); voices.push(vca);
    src.start(t0, m.rnd() * 2); src.stop(t0 + dur + 0.01);
  }
  const osc = c.createOscillator(); osc.setPeriodicWave(m.waves.sq25);     // the "zzz" in zuuum
  osc.frequency.setValueCurveAtTime(m.curve((u) => 560 * dop(u), dur), t0, dur);
  const lp = m.biquad('lowpass', 2600, 0.7);
  const vca = c.createGain(); vca.gain.setValueAtTime(0, 0);
  vca.gain.setValueCurveAtTime(m.curve((u) => 0.19 * level(u), dur), t0, dur);
  osc.connect(lp); lp.connect(vca); voices.push(vca);
  osc.start(t0); osc.stop(t0 + dur + 0.01);
  m.movingPan(voices, m.sfx, t0, dur, (u) => Math.max(-0.95, Math.min(0.95, DASH_PAN_SPEED * (t0 + u * dur - tPass))));
  // the gust of dust it leaves behind, on the right
  m.noise(m.sfx, { t: t1, gain: 0.35, a: 0.004, decay: 0.05, dur: 0.08, rel: 0.03, pan: 0.55,
    filters: [{ type: 'bandpass', f: 800, Q: 0.8 }, { type: 'lowpass', f: 2500 }] });
  m.tone(m.sfx, { t: t1, f: 130, f1: 70, glide: 0.05, wave: 'sine', gain: 0.18, a: 0.002, decay: 0.03, sus: 0, dur: 0.05, rel: 0.02, pan: 0.4 });
}

// The cartoon fall: a long descending slide whistle (sine + a little triangle, slight vibrato, a breath
// of air), receding: -9 dB and darker by the end, as if falling away. Hard 6 ms stop exactly at t1.
function slideWhistle(m, t0, t1) {
  const c = m.ctx, dur = t1 - t0, fHi = 2500, fLo = 400;
  const frC = m.curve((u) => fHi * Math.pow(fLo / fHi, Math.pow(u, 1.15)), dur);
  const lvl = (u) => {
    const t = u * dur, att = Math.min(1, t / 0.008), rem = Math.min(1, (dur - t) / 0.006);
    return att * (0.5 - 0.5 * Math.cos(Math.PI * rem)) * Math.pow(10, -9 * Math.pow(u, 1.3) / 20);
  };
  const vib = c.createOscillator(); vib.frequency.value = 6.5;
  const vg = c.createGain();                                             // vibrato depth in cents
  vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(22, t0 + 0.12);
  vib.connect(vg);
  const voices = [];
  for (const [type, g, dark] of [['sine', 0.135, false], ['triangle', 0.055, true]]) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueCurveAtTime(frC, t0, dur);
    vg.connect(o.detune);
    let node = o;
    if (dark) {
      const f = m.biquad('lowpass', 7000, 0.7);
      f.frequency.setValueCurveAtTime(m.curve((u) => 7000 * Math.pow(1700 / 7000, u), dur), t0, dur);
      o.connect(f); node = f;
    }
    const vca = c.createGain(); vca.gain.setValueAtTime(0, 0);
    vca.gain.setValueCurveAtTime(m.curve((u) => g * lvl(u), dur), t0, dur);
    node.connect(vca); voices.push(vca);
    o.start(t0); o.stop(t1 + 0.01);
  }
  const src = c.createBufferSource(); src.buffer = m.white; src.loop = true;   // breath, tracking the pitch
  const bp = m.biquad('bandpass', fHi, 6);
  bp.frequency.setValueCurveAtTime(frC, t0, dur);
  const bv = c.createGain(); bv.gain.setValueAtTime(0, 0);
  bv.gain.setValueCurveAtTime(m.curve((u) => 0.1 * lvl(u) * (1 - 0.6 * u), dur), t0, dur);
  src.connect(bp); bp.connect(bv); voices.push(bv);
  src.start(t0, m.rnd() * 2); src.stop(t1 + 0.01);
  vib.start(t0); vib.stop(t1 + 0.01);
  m.group(voices, m.sfx);
}

// a whisper of desert wind: under the end of the fall, alone in the gag's pause, gone by PUFF_CLEAR
function windWhisper(m, t0, t1, level) {
  const buf = m.buffer(makeWind(m.sr, t1 - t0 + 0.05, m.rnd));
  m.noise(m.sfx, {
    buf, t: t0, offset: 0, pan: -0.15,
    filters: [{ type: 'bandpass', f: 750, Q: 0.7, pts: [[t0, 750], [t1, 1300]] }, { type: 'lowpass', f: 3500 }],
    custom: (p) => { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(level, t0 + 0.15); p.setValueAtTime(level, t1 - 0.15); p.linearRampToValueAtTime(0, t1); return t1 + 0.01; },
  });
}

// The payoff: a tiny, DISTANT, muffled "puf" of dust at the bottom of the canyon (comic understatement):
// a soft low thump + a low-passed noise burst, two later, quieter, darker canyon echoes and a faint
// settling hiss, all gone by PUFF_CLEAR so the groove can slam in at 3.0.
function puff(m, t) {
  const hit = (tt, v, lp) => {
    m.tone(m.sfx, { t: tt, f: 170, f1: 70, glide: 0.07, wave: 'triangle', gain: 0.4 * v, a: 0.004, decay: 0.04, sus: 0, dur: 0.07, rel: 0.02 });
    m.tone(m.sfx, { t: tt, f: 170, f1: 80, glide: 0.06, wave: 'sq50', gain: 0.1 * v, a: 0.004, decay: 0.03, sus: 0, dur: 0.05, rel: 0.02, lp });
    m.noise(m.sfx, { t: tt, gain: 0.9 * v, a: 0.007, decay: 0.04, sus: 0, dur: 0.07, rel: 0.02,
      filters: [{ type: 'lowpass', f: lp, Q: 0.5 }, { type: 'lowpass', f: lp * 1.3, Q: 0.5 }, { type: 'highpass', f: 160 }] });
  };
  hit(t, 0.63, 1000);
  hit(t + 0.12, 0.19, 650);
  hit(t + 0.23, 0.07, 480);
  const a = t + 0.015;
  m.noise(m.sfx, { t: a, pan: 0.12, filters: [{ type: 'highpass', f: 2600 }, { type: 'lowpass', f: 7000 }],
    custom: (p) => { p.setValueAtTime(0, a); p.linearRampToValueAtTime(0.025, a + 0.06); p.setTargetAtTime(0, a + 0.06, 0.07); p.setTargetAtTime(0, PUFF_CLEAR - 0.06, 0.01); return PUFF_CLEAR; } });
}

// 10 taps in 3-3-2 groups inside E5-E6: the group heads climb E5 B5 C#6 E6 and each group answers
// below them (E5 F#5 A5 | B5 F#5 A5 | C#6 G#5 B5 | E6). Shaped so no 5-note run matches a known tune
// (out/audio_qa/melody.mjs).
// Groups 2 and 3 are one shape a step apart (B5 F#5 A5 -> C#6 G#5 B5), every tap a chord tone or colour
// (A | F#m | D | E); G#5 (not A5) on tap 8 also keeps the last four taps off the SMB 1-up jingle's shape.
const KEY_SEQ = ['E5', 'F#5', 'A5', 'B5', 'F#5', 'A5', 'C#6', 'G#5', 'B5', 'E6'].map(nm);
const KEY_NOTES = CUES.keyTimes.map((_, i) => KEY_SEQ[i % KEY_SEQ.length]);
const BIP_NOTES = [nm('E6'), nm('A6')];             // the bip-bip: a rising fourth
// the typing groove's gallop bass as a note line (mirrors groove(): root on the beat, octave on the "&",
// fifth on the last 16th), for the originality check only
function gallopBassLine(t0, t1, chords) {
  const out = [];
  for (let s = 0; s < Math.round((t1 - t0) / S16); s++) {
    const t = t0 + s * S16, G = Math.round((t - MUSIC_START) / S16), beat = (((G % 16) + 16) % 16) % 4, root = CHORD[chordAt(chords, t).name].root;
    if (beat === 0) out.push(root); else if (beat === 2) out.push(root + 12); else if (beat === 3) out.push(root + 7);
  }
  return out;
}
// melodic material the QA scripts check (out/audio_qa/melody.mjs); MIDI note numbers
export const MELODY_QA = { KEY_NOTES, BIP_NOTES, BASS_GROOVE: gallopBassLine(CUES.puffEnd, CUES.enter, prog(CUES.puffEnd, ['A', 'F#m', 'D', 'E', 'A'])) };

function click(m, t, gain = 0.22) {
  m.noise(m.sfx, { t, gain, a: 0.0003, decay: 0.002, dur: 0.003, rel: 0.002, filters: [{ type: 'highpass', f: 4000 }] });
}
function keyBlip(m, t, midi) {
  const f = mtof(midi);
  m.tone(m.sfx, { t, f, wave: 'sq12', gain: 0.34, a: 0.001, decay: 0.05, sus: 0.35, dur: 0.07, rel: 0.02 });
  m.tone(m.sfx, { t, f: f / 2, wave: 'triangle', gain: 0.2, a: 0.001, decay: 0.04, sus: 0.2, dur: 0.05, rel: 0.02 });
  m.tone(m.sfx, { t, f: f * 2, wave: 'sq50', gain: 0.05, a: 0.0005, decay: 0.008, sus: 0, dur: 0.012, rel: 0.005 });
  click(m, t, 0.3);
  m.duck(t, -6, 0.05);
  m.duckLead(t, -9);
}
function enterBlip(m, t) {
  const notes = [nm('A5'), nm('E6')];
  notes.forEach((n, i) => {
    const ti = t + i * S32, dur = i ? 0.12 : S32 * 0.9;
    m.tone(m.sfx, { t: ti, f: mtof(n), wave: 'sq25', gain: 0.2, a: 0.001, decay: 0.06, sus: 0.4, dur, rel: 0.03 });
    m.tone(m.sfx, { t: ti, f: mtof(n - 12), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.06, sus: 0.3, dur, rel: 0.03 });
  });
  click(m, t, 0.28);
  m.duck(t, -6, 0.15);
}
function correctJingle(m, t, tNext) {        // tNext: the jingle rings out before the points counter starts
  const arp = [nm('A5'), nm('C#6'), nm('E6'), nm('A6')];
  arp.forEach((n, i) => {
    const last = i === arp.length - 1, ti = t + i * S32, dur = last ? Math.max(S32, tNext - ti - S16) : S32 * 0.9;
    m.tone(m.sfx, { t: ti, f: mtof(n), wave: 'sq25', gain: 0.24, a: 0.002, decay: 0.12, sus: 0.5, dur, rel: 0.05, vib: last ? 20 : 0, vibDelay: 0.06, vibRate: 7 });
    m.tone(m.sfx, { t: ti, f: mtof(n - 12), wave: 'triangle', gain: 0.19, a: 0.002, decay: 0.12, sus: 0.5, dur, rel: 0.05 });
  });
  sparkle(m, t + 2 * S32, tNext - t - 3 * S32, 8, 0.1);
  m.duck(t, -7, 0.45, 0.004, 0.3);
}
function pointTicks(m, t0, t1) {
  const count = Math.round((t1 - t0) / S32);
  for (let i = 0; i < count; i++) {
    const t = t0 + i * S32, f = 1100 * Math.pow(2, i / count);
    m.tone(m.sfx, { t, f, wave: 'sq12', gain: 0.3, a: 0.001, decay: 0.018, sus: 0.2, dur: 0.025, rel: 0.01 });
    m.tone(m.sfx, { t, f: f * 1.5, wave: 'triangle', gain: 0.09, a: 0.001, decay: 0.012, sus: 0, dur: 0.015, rel: 0.01 });
  }
  m.duck(t0, -5, t1 - t0, 0.01, 0.1);
  m.duckLead(t0, -7, t1 - t0, 0.01, 0.1);            // the 12.5 % lead sits right in the ticks' 1-2 kHz band
  // "ding" when the counter lands
  m.tone(m.sfx, { t: t1, f: mtof(nm('A6')), wave: 'sine', gain: 0.24, a: 0.001, decay: 0.25, sus: 0, dur: 0.6, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('A5')), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.2, sus: 0, dur: 0.5, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('E7')), wave: 'sine', gain: 0.06, a: 0.001, decay: 0.1, sus: 0, dur: 0.2, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('A6')), wave: 'sq12', gain: 0.06, a: 0.001, decay: 0.04, sus: 0, dur: 0.06, rel: 0.02 });
  m.duck(t1, -5, 0.12, 0.004, 0.25);
}
function characterPop(m, t) {
  m.tone(m.sfx, { t, f: 350, f1: 1400, glide: 0.05, wave: 'sine', gain: 0.32, a: 0.001, decay: 0.04, sus: 0, dur: 0.07, rel: 0.02 });
  m.tone(m.sfx, { t, f: 350, f1: 1400, glide: 0.05, wave: 'sq25', gain: 0.07, a: 0.001, decay: 0.03, sus: 0, dur: 0.05, rel: 0.02, lp: 4000 });
  click(m, t, 0.25);
  sparkle(m, t + S32, 0.4, 7, 0.09);
  m.duck(t, -4, 0.08);
}
function whoosh(m, t, tLand) {
  const t0 = t - 2 * S16, tPeak = t;
  m.noise(m.sfx, {
    t: t0,
    filters: [{ type: 'bandpass', Q: 1.3, pts: [[t0, 350], [tPeak, 4500], [tLand, 900]] }, { type: 'highpass', f: 200 }],
    custom: (p) => { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(0.8, tPeak); p.setTargetAtTime(0, tPeak, (tLand - tPeak) / 3); p.setTargetAtTime(0, tLand + 0.12, 0.008); return tLand + 0.2; },
  });
  m.tone(m.sfx, { t: t0, f: 220, f1: 1700, glide: tPeak - t0, wave: 'sq12', gain: 0.06, a: 0.15, decay: 1, sus: 1, dur: tPeak - t0, rel: 0.05, lp: 3000 });
  // snap on the cut itself, so the transition frame has a transient
  m.noise(m.sfx, { t, gain: 0.35, a: 0.0005, decay: 0.02, dur: 0.03, rel: 0.01, filters: [{ type: 'bandpass', f: 3000, Q: 0.9 }] });
  // reverse-cymbal swell sucking into the logo landing
  m.noise(m.sfx, {
    t: tPeak, filters: [{ type: 'highpass', f: 2500 }, { type: 'bandpass', Q: 0.8, pts: [[tPeak, 3000], [tLand, 8000]] }],
    custom: (p) => { p.setValueAtTime(0, tPeak); p.linearRampToValueAtTime(0.02, tPeak + 0.05); p.exponentialRampToValueAtTime(0.25, tLand - S32 / 4); p.linearRampToValueAtTime(0, tLand - S32 / 4 + 0.004); return tLand + 0.01; },
  });
  m.tone(m.sfx, { t: tPeak, f: mtof(CHORD.D.root), wave: 'triangle', gain: 0.18, a: 0.08, decay: 1, sus: 1, dur: tLand - tPeak - 0.02, rel: 0.01 });
}
function logoDing(m, t) {
  m.tone(m.sfx, { t, f: mtof(nm('A6')), wave: 'sine', gain: 0.3, a: 0.001, decay: 0.3, sus: 0, dur: 0.8, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('D7')), wave: 'sine', gain: 0.1, a: 0.001, decay: 0.2, sus: 0, dur: 0.5, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('D5')), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.25, sus: 0, dur: 0.6, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('A6')), wave: 'sq12', gain: 0.07, a: 0.001, decay: 0.06, sus: 0, dur: 0.1, rel: 0.02 });
  click(m, t, 0.25);
  sparkle(m, t + S32, 0.5, 8, 0.09);
  m.duck(t, -7, 0.1, 0.004, 0.2);
  m.duckLead(t, -8, 0.12);
}
function storesPop(m, t) {
  m.tone(m.sfx, { t, f: 480, f1: 1000, glide: 0.04, wave: 'sine', gain: 0.4, a: 0.001, decay: 0.04, sus: 0, dur: 0.06, rel: 0.02 });
  m.tone(m.sfx, { t, f: mtof(nm('B5')), wave: 'triangle', gain: 0.16, a: 0.001, decay: 0.05, sus: 0, dur: 0.08, rel: 0.02 });
  click(m, t, 0.2);
  m.duck(t, -7, 0.07);
  m.duckLead(t, -9);
}

// ---------------------------------------------------------------- the score
// Event ids, in score order. QA only: renderAudio({ only: [...ids] }) renders just those events
// (out/audio_qa/events.html + sync.mjs measure each one's exact onset / end / pan against its cue).
export const EVENT_IDS = ['static', 'crt', 'chime', 'intro', 'bip1', 'bip2', 'dash', 'whistle', 'wind', 'puff',
  'groove', ...CUES.keyTimes.map((_, i) => `key${i + 1}`), 'enter', 'riser', 'fanfare', 'celebrate', 'correct', 'ticks',
  'character', 'whoosh', 'logo', 'ctaGroove', 'stores', 'final'];

function score(m) {
  const C = CUES, on = (id) => !m.only || m.only.has(id);
  // Scene 1 — hook: static, power-on, the app chime, then the sound gag with the music OUT
  if (on('static')) tvStatic(m, C.staticStart, C.powerOn);
  if (on('crt')) crtPowerOn(m, C.powerOn);
  if (on('chime')) appChime(m, C.appReady);
  if (on('intro')) intro(m, MUSIC_START);
  if (on('bip1')) hornBip(m, C.beep1, BIP_NOTES[0], 0.075);             // "bip-"
  if (on('bip2')) hornBip(m, C.beep2, BIP_NOTES[1], 0.095, 1.05);       // "-bip!"
  if (on('dash')) dash(m, C.dashStart, C.dashEnd);                      // zuuum, left -> right
  if (on('whistle')) slideWhistle(m, C.fallStart, C.fallEnd);           // the fall; hard stop on fallEnd
  if (on('wind')) windWhisper(m, C.fallStart + 0.3, PUFF_CLEAR, 0.03);  // the pause: only a whisper of wind
  if (on('puff')) puff(m, C.puff);                                      // ...puf. (far below)
  // Scene 2 — mechanic: the groove slams in, typing on top
  if (on('groove')) groove(m, { t0: C.puffEnd, t1: C.enter, chords: prog(C.puffEnd, ['A', 'F#m', 'D', 'E', 'A']), lead: LEAD_GROOVE, softAt: C.keyTimes });
  C.keyTimes.forEach((t, i) => { if (on(`key${i + 1}`)) keyBlip(m, t, KEY_NOTES[i]); });
  if (on('enter')) enterBlip(m, C.enter);
  if (on('riser')) riser(m, C.enter, C.correct);
  // Scene 3 — reward: fanfare + the bright celebration line
  if (on('fanfare')) fanfare(m, C.correct);
  if (on('celebrate')) groove(m, {
    t0: C.correct, t1: C.ctaTransition, chords: prog(C.correct, ['A', 'D', 'F#m', 'E']), lead: LEAD_CELEBRATE,
    leadWave: 'sq12', leadGain: 0.2, harmony: true, twang: false, dense: true, slam: false, softSpans: [[C.pointsStart, C.pointsEnd]],
  });
  if (on('correct')) correctJingle(m, C.correct, C.pointsStart);
  if (on('ticks')) pointTicks(m, C.pointsStart, C.pointsEnd);
  if (on('character')) characterPop(m, C.characterIn);
  // Scene 4 — CTA: whoosh on the cut, reverse swell into the logo sting, closing phrase, final chord
  if (on('whoosh')) whoosh(m, C.ctaTransition, C.logoLand);
  if (on('logo')) logoDing(m, C.logoLand);
  if (on('ctaGroove')) groove(m, { t0: C.logoLand, t1: C.musicEndChord, chords: [{ t: C.logoLand, name: 'D' }, { t: C.ctaText, name: 'E' }], lead: LEAD_CTA, leadWave: 'sq12', leadGain: 0.2, twang: false, slam: 0.45, softAt: [C.logoLand, C.stores] });
  if (on('stores')) storesPop(m, C.stores);
  if (on('final')) finalChord(m, C.musicEndChord);
}

// ---------------------------------------------------------------- mastering (JS, on the rendered samples)
function biquadCoefs(type, fc, Q, G, sr) {       // BS.1770 K-weighting stages (pyloudnorm form)
  const A = Math.pow(10, G / 40), w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Q), cw = Math.cos(w0);
  let b, a;
  if (type === 'shelf') {
    const s = 2 * Math.sqrt(A) * al;
    b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)];
    a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s];
  } else {
    b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    a = [1 + al, -2 * cw, 1 - al];
  }
  return { b: b.map((v) => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] };
}
function filt(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function lufs(chs, sr) {
  const shelf = biquadCoefs('shelf', 1500, 1 / Math.SQRT2, 4, sr), hp = biquadCoefs('hp', 38, 0.5, 0, sr);
  const k = chs.map((x) => filt(filt(x, shelf), hp));
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
  for (let s = 0; s + blk <= k[0].length; s += hop) {
    let sum = 0;
    for (const c of k) { let e = 0; for (let i = s; i < s + blk; i++) e += c[i] * c[i]; sum += e / blk; }
    z.push(sum);
  }
  const L = (e) => -0.691 + 10 * Math.log10(e);
  const abs = z.filter((e) => L(e) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((p, e) => p + e, 0) / abs.length) - 10;
  const g = abs.filter((e) => L(e) > rel);
  return L(g.reduce((p, e) => p + e, 0) / g.length);
}
// look-ahead brickwall with smooth gain: attack = look-ahead window, exponential release
function limiter(chs, sr, ceil, la = 0.003, rel = 0.08) {
  const n = chs[0].length, W = Math.max(1, Math.round(la * sr));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of chs) p = Math.max(p, Math.abs(c[i]));
    req[i] = p > ceil ? ceil / p : 1;
  }
  const h = new Float32Array(n), dq = new Int32Array(n + 1);
  let head = 0, tail = 0;
  for (let j = 0; j < n + W; j++) {              // h[i] = min(req[i .. i+W])
    if (j < n) { while (tail > head && req[dq[tail - 1]] >= req[j]) tail--; dq[tail++] = j; }
    const i = j - W;
    if (i >= 0) { while (dq[head] < i) head++; h[i] = req[dq[head]]; }
  }
  const coef = 1 - Math.exp(-1 / (rel * sr));
  let sum = W + 1, e = 1;                        // running mean over h[i-W .. i] (h<0 == 1)
  for (let i = 0; i < n; i++) {
    sum += h[i] - (i - W - 1 >= 0 ? h[i - W - 1] : 1);
    const s = Math.min(1, sum / (W + 1));
    e = s <= e ? s : e + (s - e) * coef;
    for (const c of chs) c[i] *= e;
  }
}
// 4x windowed-sinc oversampled peak (true-peak estimate). 48 taps per phase, like the BS.1770-4 annex
// filter and out/final_qa/av_qa.mjs: the old 16-tap kernel read ~0.08 dB low on the final chord.
function truePeak(chs) {
  const T = 24, P = 4, taps = [];
  for (let p = 1; p < P; p++) {
    const fr = p / P, row = [];
    for (let k = -T + 1; k <= T; k++) {
      const x = k - fr, w = 0.5 + 0.5 * Math.cos(Math.PI * x / T);
      row.push((x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w);
    }
    taps.push(row);
  }
  let peak = 0;
  for (const c of chs) {
    let sp = 0;
    for (let i = 0; i < c.length; i++) sp = Math.max(sp, Math.abs(c[i]));
    peak = Math.max(peak, sp);
    const thr = sp * 0.5;
    for (let i = T; i < c.length - T; i++) {
      if (Math.abs(c[i]) < thr && Math.abs(c[i + 1]) < thr) continue;
      for (const row of taps) {
        let y = 0;
        for (let k = 0; k < row.length; k++) y += row[k] * c[i - T + 1 + k];
        peak = Math.max(peak, Math.abs(y));
      }
    }
  }
  return peak;
}
function master(buf) {
  const sr = buf.sampleRate, n = buf.length;
  const orig = [0, 1].map((c) => Float32Array.from(buf.getChannelData(c)));
  const ceil = Math.pow(10, LIMIT_DB / 20);
  let gain = Math.pow(10, (TARGET_LUFS - lufs(orig, sr)) / 20);
  let out = null, k = 1;
  // drive -> limiter -> true-peak normalisation (the loudest inter-sample peak lands exactly on
  // TRUE_PEAK_DB); the loudness is measured AFTER that last gain, so the loop converges on the target
  for (let it = 0; it < 6; it++) {
    out = orig.map((x) => x.map((v) => v * gain));
    limiter(out, sr, ceil);
    k = Math.pow(10, TRUE_PEAK_DB / 20) / truePeak(out);
    const l = lufs(out, sr) + 20 * Math.log10(k);
    if (Math.abs(l - TARGET_LUFS) < 0.05) break;
    gain *= Math.pow(10, (TARGET_LUFS - l) / 20);
  }
  const zero = Math.round(SILENCE_AT * sr), fade = Math.round(0.03 * sr);
  for (const c of out) {
    for (let i = 0; i < n; i++) {
      let v = c[i] * k;
      if (i >= zero) v = 0;
      else if (i >= zero - fade) v *= (zero - i) / fade;
      c[i] = Math.max(-1, Math.min(1, v));
    }
  }
  out.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}

// ---------------------------------------------------------------- entry point
// `solo` ('music' | 'sfx') is a QA-only stem render: the other bus is disconnected
// before rendering (use with raw:true so both stems share one gain structure).
// `only` (QA only, with raw:true): an EVENT_IDS id or a list of them; every other event is skipped
// (the seeded noise offsets of later events then differ from the full mix; timing does not).
export async function renderAudio({ sampleRate = SAMPLE_RATE, raw = false, solo = null, only = null } = {}) {
  const length = Math.round(DURATION * sampleRate);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate });
  const m = new Mix(ctx, SEED);
  m.only = only ? new Set([].concat(only)) : null;
  score(m);
  m.finalize();
  if (solo === 'music') m.sfxGain.disconnect();
  else if (solo === 'sfx') m.musicGain.disconnect();
  const buf = await ctx.startRendering();
  return raw ? buf : master(buf);
}
