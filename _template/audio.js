// Nostalgia ad — the complete 15 s soundtrack, synthesized in code.
//
// Everything here is ORIGINAL: chip-style pulse/triangle/noise voices playing an
// original progression and motif, plus hand-built SFX (TV static, CRT power-on,
// bomb whistle/plunk, lit-fuse sizzle, explosion, key blips, jingles, whoosh...).
// No samples, no downloads, no existing melodies.
//
// Every hit is placed from timeline.js (CUES / BEAT / MUSIC_START), so picture and
// sound share one clock. Rendering is deterministic: an OfflineAudioContext graph fed
// only by seeded-PRNG noise, then a JS mastering pass (loudness to ~-14 LUFS, look-ahead
// limiter, true-peak normalisation to -1.5 dBTP, hard silence in the tail).

import { DURATION, BEAT, MUSIC_START, CUES } from './timeline.js';

export const SAMPLE_RATE = 48000;

const S16 = BEAT / 4;               // 16th note (0.125 s at 120 BPM)
const S32 = BEAT / 8;               // 32nd note
const TARGET_LUFS = -14;
const TRUE_PEAK_DB = -1.5;          // final true-peak ceiling (dBTP): headroom for platform AAC/Opus re-encodes
const LIMIT_DB = -1.5;              // sample-peak ceiling of the limiter (headroom for inter-sample peaks)
const FINAL_RING = 0.75;            // how long the final chord rings before true silence
const SILENCE_AT = CUES.musicEndChord + FINAL_RING + 0.03;
const SEED = 0x90210;
const BLAST_TAIL = 0.4;            // explosion has decayed by blastEnd + this

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
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
function diatonic(midi, steps) {           // move by scale steps inside C major
  const idx = MAJOR.indexOf(((midi % 12) + 12) % 12);
  if (idx < 0) return midi - 3;
  let d = idx + steps;
  const o = Math.floor(d / 7);
  d -= o * 7;
  return 12 * (Math.floor(midi / 12) + o) + MAJOR[d];
}

// Harmony: roots in octave 2/3 so the triangle bass is supportive, not sub.
const CHORD = {
  C: { root: nm('C3'), iv: [0, 4, 7] },
  G: { root: nm('G2'), iv: [0, 4, 7] },
  Am: { root: nm('A2'), iv: [0, 3, 7] },
  F: { root: nm('F2'), iv: [0, 4, 7] },
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
// lit fuse: bright fizz with fast random level flicker + spark pops, rising intensity
function makeSizzle(sr, dur, rnd) {
  const n = Math.ceil(dur * sr), a = new Float32Array(n);
  const sm = 1 - Math.exp(-1 / (0.0007 * sr));
  let lvl = 0.6, lvlT = 0.6, cnt = 0, spark = 0, dec = 0, sgn = 1;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (--cnt <= 0) {
      cnt = Math.round(sr * (0.002 + 0.006 * rnd()));
      lvlT = 0.25 + 0.75 * Math.pow(rnd(), 0.7);
    }
    lvl += (lvlT - lvl) * sm;
    if (rnd() < (14 + 34 * u) / sr) {
      spark = 0.3 + 0.5 * rnd();
      dec = Math.exp(-1 / ((0.0005 + 0.0025 * rnd()) * sr));
      sgn = rnd() < 0.5 ? -1 : 1;
    }
    const inten = 0.7 + 0.3 * u;
    a[i] = inten * (0.42 * (rnd() * 2 - 1) * lvl + spark * (0.45 * sgn + 0.55 * (rnd() * 2 - 1)));
    spark *= dec;
  }
  return normalize(a);
}
// explosion body: white + brown noise
function makeBlast(sr, dur, rnd) {
  const n = Math.ceil(dur * sr), a = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b = (b + 0.02 * w) * 0.998;
    a[i] = 0.7 * w + 1.2 * b;
  }
  return normalize(a);
}
// bit-crushed crunch: sample-and-hold (falling rate) + 3-bit quantised noise/square
function makeCrunch(sr, dur, rnd) {
  const n = Math.ceil(dur * sr), a = new Float32Array(n);
  let ph = 0, hold = 0, held = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / dur;
    const f = 170 * Math.pow(55 / 170, Math.min(1, u * 1.5));
    ph += f / sr;
    const sq = (ph % 1) < 0.5 ? 1 : -1;
    hold += (6000 * Math.pow(1200 / 6000, u)) / sr;
    if (hold >= 1) {
      hold -= Math.floor(hold);
      held = Math.round(Math.tanh(2.2 * (0.75 * (rnd() * 2 - 1) + 0.6 * sq)) * 4) / 4;
    }
    a[i] = held * (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / 0.11);
  }
  return a;
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
    this.waves = { sq12: pulseWave(ctx, 0.125), sq25: pulseWave(ctx, 0.25), sq50: pulseWave(ctx, 0.5) };
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
  tone(dest, o) {
    const c = this.ctx;
    const { t, f, f1 = 0, wave = 'sq25', pan = 0, lp = 0, vib = 0, vibDelay = 0.1, vibRate = 6 } = o;
    const glide = o.glide ?? o.dur;
    const osc = c.createOscillator();
    if (this.waves[wave]) osc.setPeriodicWave(this.waves[wave]); else osc.type = wave;
    osc.frequency.setValueAtTime(f, t);
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
    if (lp) { const fl = this.biquad('lowpass', lp, 0.7); osc.connect(fl); node = fl; }
    node.connect(g);
    this.route(g, dest, pan);
    osc.start(t); osc.stop(end);
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
    if (this.leadDucks.length) this.leadSum.gain.setValueCurveAtTime(this.duckCurve(this.leadDucks), 0, DURATION);
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
    this.music.build(this.musicGain);
    this.sfx.build(this.sfxGain);
  }
}

// ---------------------------------------------------------------- drum kit (noise channel style)
function kick(m, t, v = 1) {
  m.tone(m.music, { t, f: 180, f1: 52, glide: 0.09, wave: 'sine', gain: 0.38 * v, a: 0.001, decay: 0.07, sus: 0, dur: 0.12, rel: 0.03 });
  m.tone(m.music, { t, f: 130, f1: 70, glide: 0.03, wave: 'sq50', gain: 0.2 * v, a: 0.001, decay: 0.016, sus: 0, dur: 0.03, rel: 0.01, lp: 1400 });
  m.noise(m.music, { t, gain: 0.18 * v, a: 0.0005, decay: 0.003, dur: 0.005, rel: 0.003, filters: [{ type: 'lowpass', f: 4000 }] });
}
function snare(m, t, v = 1) {
  m.noise(m.music, { buf: m.lfsrC, t, gain: 0.34 * v, a: 0.001, decay: 0.055, dur: 0.1, rel: 0.03, filters: [{ type: 'bandpass', f: 1900, Q: 0.7 }] });
  m.tone(m.music, { t, f: 240, f1: 170, glide: 0.05, wave: 'triangle', gain: 0.26 * v, a: 0.001, decay: 0.035, sus: 0, dur: 0.06, rel: 0.02 });
}
function hat(m, t, v = 1, open = false) {
  m.noise(m.music, { buf: m.lfsr, t, gain: 0.13 * v, a: 0.0005, decay: open ? 0.07 : 0.014, dur: open ? 0.12 : 0.03, rel: 0.02, pan: 0.12, filters: [{ type: 'highpass', f: 7000 }] });
}
function crash(m, t, v = 1, tau = 0.45) {
  m.noise(m.music, { t, gain: 0.2 * v, a: 0.001, decay: tau, dur: tau * 5, rel: 0.1, filters: [{ type: 'highpass', f: 4200 }, { type: 'peaking', f: 7500, Q: 0.8, gain: 4 }] });
  m.noise(m.music, { buf: m.lfsr, t, gain: 0.07 * v, a: 0.001, decay: tau * 0.6, dur: tau * 3, rel: 0.1, filters: [{ type: 'bandpass', f: 5200, Q: 2 }] });
}
function bass(m, t, midi, dur, v = 1) {
  m.tone(m.music, { t, f: mtof(midi), wave: 'triangle', gain: 0.2 * v, a: 0.003, decay: 0.2, sus: 0.7, dur, rel: 0.025 });
  m.tone(m.music, { t, f: mtof(midi + 12), wave: 'sq25', gain: 0.085 * v, a: 0.003, decay: 0.08, sus: 0.5, dur, rel: 0.02, lp: 2200 });
}
function sparkle(m, t0, span, count, gain = 0.1) {
  const notes = [];
  for (let o = 7; o <= 8; o++) for (const p of PENTA) notes.push(12 * (o + 1) + p);   // C7..A8 pentatonic
  for (let i = 0; i < count; i++) {
    const t = t0 + (i + m.rnd() * 0.8) * (span / count);
    const n = notes[Math.floor(m.rnd() * 7)];
    m.tone(m.sfx, { t, f: mtof(n), wave: i % 2 ? 'sine' : 'triangle', gain: gain * (0.6 + 0.4 * m.rnd()), a: 0.001, decay: 0.03, sus: 0, dur: 0.04, rel: 0.02, pan: (i % 2 ? 0.3 : -0.3) });
  }
}

// ---------------------------------------------------------------- music sections
const LEAD_GROOVE = [   // original 2-bar motif, 2-1-2-1-2 bounce per chord (C G Am F | C)
  [0, 'G4', 2], [2, 'C5', 1], [3, 'E5', 2], [5, 'D5', 1], [6, 'C5', 2],
  [8, 'D5', 2], [10, 'B4', 1], [11, 'G4', 2], [13, 'B4', 1], [14, 'D5', 2],
  [16, 'E5', 2], [18, 'C5', 1], [19, 'A4', 2], [21, 'C5', 1], [22, 'E5', 2],
  [24, 'F5', 1], [25, 'E5', 1], [26, 'D5', 1], [27, 'C5', 1], [28, 'A4', 2], [30, 'G4', 1], [31, 'B4', 1],
  [32, 'C5', 2],
];
const LEAD_CELEBRATE = [ // brighter variation an octave up (C Am F G), rests under the fanfare
  [4, 'G5', 1], [5, 'A5', 1], [6, 'B5', 2],
  [8, 'C6', 2], [10, 'A5', 1], [11, 'E5', 2], [13, 'A5', 1], [14, 'C6', 2],
  [16, 'C6', 1], [17, 'A5', 1], [18, 'F5', 2], [20, 'A5', 1], [21, 'C6', 1], [22, 'D6', 2],
  [24, 'D6', 2], [26, 'B5', 1], [27, 'G5', 2], [29, 'B5', 1], [30, 'D6', 2],
];
const LEAD_CTA = [       // F -> G, resolving into the final C chord
  [0, 'A5', 2], [2, 'C6', 2],
  [4, 'B5', 2], [6, 'D6', 2], [8, 'G5', 1], [9, 'A5', 1], [10, 'B5', 2], [12, 'D6', 1], [13, 'B5', 1], [14, 'G5', 2],
];

function groove(m, { t0, t1, chords, lead = [], leadWave = 'sq25', leadGain = 0.17, harmony = false,
  arpLo = nm('C4'), arpHi = nm('E5'), arpPattern = [0, 1, 2, 3], arpGain = 0.065, dense = false, slam = true, softSnare = [] }) {
  const steps = Math.round((t1 - t0) / S16);
  let chordStart = 0, prev = null;
  for (let s = 0; s < steps; s++) {
    const t = t0 + s * S16;
    const ch = chordAt(chords, t);
    if (ch !== prev) { chordStart = s; prev = ch; }
    const k = s - chordStart;
    const G = Math.round((t - MUSIC_START) / S16), pos = ((G % 16) + 16) % 16;
    const root = CHORD[ch.name].root;
    if (s % 2 === 0) bass(m, t, root + (pos % 4 === 0 ? 0 : 12), S16 * 1.7);
    if (pos === 0 || pos === 8 || pos === 10) kick(m, t, pos === 10 ? 0.7 : 1);
    // a snare under a key blip masks it on a phone speaker (same 0.5-3 kHz band): play it soft there
    if (pos === 4 || pos === 12) snare(m, t, softSnare.some((x) => Math.abs(x - t) < 1e-6) ? 0.4 : 1);
    if (pos === 14) hat(m, t, 0.9, true);
    else if (pos % 2 === 0) hat(m, t, pos % 4 === 2 ? 1 : 0.6);
    else if (dense) hat(m, t, 0.35);
    const notes = chordNotes(ch.name, arpLo, arpHi);
    const n = notes[arpPattern[k % arpPattern.length] % notes.length];
    m.tone(m.music, { t, f: mtof(n), wave: 'sq12', gain: arpGain * (k % 4 === 0 ? 1 : 0.75), a: 0.002, decay: 0.05, sus: 0.3, dur: S16 * 0.8, rel: 0.02, pan: -0.22 });
  }
  if (slam) { crash(m, t0, 1); kick(m, t0, 1.1); }
  for (const [step, name, len] of lead) {
    const t = t0 + step * S16;
    if (t >= t1 - 1e-6) continue;
    const midi = nm(name), dur = len * S16 * 0.9;
    m.tone(m.lead, { t, f: mtof(midi), wave: leadWave, gain: leadGain, a: 0.004, decay: 0.16, sus: 0.65, dur, rel: 0.03, vib: len >= 2 ? 14 : 0, vibDelay: 0.09, vibRate: 6.5, lp: 7000 });
    if (harmony) {
      m.tone(m.music, { t, f: mtof(diatonic(midi, -2)), wave: 'sq25', gain: leadGain * 0.45, a: 0.004, decay: 0.16, sus: 0.6, dur, rel: 0.03, pan: 0.2, lp: 5000 });
    }
  }
}

function intro(m, t0, t1) {                  // sparse: bass pickup + hats under the power-on
  const steps = Math.round((t1 - t0) / S16), root = CHORD.C.root;
  for (let s = 0; s < steps; s++) {
    const t = t0 + s * S16;
    if (s % 2 === 0) bass(m, t, root + (s % 4 === 0 ? 0 : 12), S16 * 1.5, 0.8);
    else hat(m, t, 0.6);
  }
  kick(m, t0, 0.6);
}

// ENTER -> CORRETO: dominant pedal, snare roll, rising arp, noise swell, then a 32nd of air before the hit
function riser(m, t0, tHit) {
  const t1 = tHit - S32;
  const mid = t0 + Math.round((t1 - t0) / 2 / S16) * S16;
  const span = t1 - t0;
  for (let t = t0; t < t1 - 1e-6; t += (t < mid - 1e-6 ? S16 : S32)) snare(m, t, 0.3 + 0.7 * (t - t0) / span);
  for (let t = t0; t < t1 - 1e-6; t += 2 * S16) bass(m, t, CHORD.G.root + (Math.round((t - t0) / (2 * S16)) % 2 ? 12 : 0), S16 * 1.7);
  const notes = chordNotes('G', nm('G3'), nm('D7'));
  const count = Math.round(span / S32);
  for (let i = 0; i < count; i++) {
    const t = t0 + i * S32;
    m.tone(m.music, { t, f: mtof(notes[Math.min(i, notes.length - 1)]), wave: 'sq12', gain: 0.04 + 0.07 * i / count, a: 0.002, decay: 0.04, sus: 0.4, dur: S32 * 0.9, rel: 0.015, pan: -0.2 });
  }
  m.noise(m.music, {
    t: t0, filters: [{ type: 'bandpass', Q: 2, pts: [[t0, 500], [t1, 6000]] }],
    custom: (p) => { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(0.13, t1 - 0.01); p.linearRampToValueAtTime(0, t1); return t1 + 0.01; },
  });
}

function fanfare(m, t) {                     // music stinger on CORRETO
  crash(m, t, 1.1);
  kick(m, t, 1.1);
  for (const n of ['C5', 'E5', 'G5']) m.tone(m.music, { t, f: mtof(nm(n)), wave: 'sq50', gain: 0.06, a: 0.003, decay: 0.2, sus: 0.6, dur: 3 * S16, rel: 0.05 });
  m.tone(m.music, { t, f: mtof(nm('C6')), wave: 'sq25', gain: 0.05, a: 0.003, decay: 0.2, sus: 0.6, dur: 3 * S16, rel: 0.05 });
}

function finalChord(m, t) {
  kick(m, t, 1.1);
  crash(m, t, 0.9, FINAL_RING / 4);
  const ring = { a: 0.003, decay: FINAL_RING / 5, sus: 0, dur: FINAL_RING, rel: 0.02 };
  m.tone(m.music, { t, f: mtof(CHORD.C.root), wave: 'triangle', gain: 0.26, ...ring });
  m.tone(m.music, { t, f: mtof(CHORD.C.root + 12), wave: 'sq25', gain: 0.085, lp: 2200, ...ring });
  for (const n of ['C5', 'E5', 'G5']) m.tone(m.music, { t, f: mtof(nm(n)), wave: 'sq25', gain: 0.055, ...ring });
  m.tone(m.lead, { t, f: mtof(nm('C6')), wave: 'sq12', gain: 0.14, vib: 18, vibDelay: 0.08, ...ring });
  sparkle(m, t + S32, FINAL_RING * 0.55, 6, 0.06);   // the visuals draw a sparkle ring on this chord
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
    custom: (p) => gate(p, 1.15),
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

function appChime(m, t) {
  for (const [i, n] of ['C6', 'G6'].entries()) {
    const ti = t + i * S32, dur = i ? 0.2 : S32 * 0.9;
    m.tone(m.sfx, { t: ti, f: mtof(nm(n)), wave: 'sq12', gain: 0.14, a: 0.002, decay: 0.08, sus: 0.3, dur, rel: 0.05 });
    m.tone(m.sfx, { t: ti, f: mtof(nm(n)), wave: 'triangle', gain: 0.14, a: 0.002, decay: 0.12, sus: 0.3, dur, rel: 0.05, vib: i ? 12 : 0, vibDelay: 0.05 });
  }
}

function bombWhistle(m, t0, t1) {
  const d = t1 - t0;
  m.tone(m.sfx, { t: t0, f: 2200, f1: 650, glide: d, wave: 'triangle', gain: 0.17, a: 0.02, decay: 1, sus: 1, dur: d - 0.01, rel: 0.004, vib: 30, vibDelay: 0.02, vibRate: 13 });
  m.tone(m.sfx, { t: t0, f: 2200, f1: 650, glide: d, wave: 'sine', gain: 0.08, a: 0.02, decay: 1, sus: 1, dur: d - 0.01, rel: 0.004 });
}

function plunk(m, t) {
  m.tone(m.sfx, { t, f: 240, f1: 90, glide: 0.07, wave: 'triangle', gain: 0.5, a: 0.001, decay: 0.05, sus: 0, dur: 0.09, rel: 0.02 });
  m.tone(m.sfx, { t, f: 190, f1: 80, glide: 0.06, wave: 'sq50', gain: 0.2, a: 0.001, decay: 0.04, sus: 0, dur: 0.07, rel: 0.02, lp: 1400 });
  m.noise(m.sfx, { t, gain: 0.4, a: 0.0005, decay: 0.012, dur: 0.02, rel: 0.01, filters: [{ type: 'bandpass', f: 900, Q: 1.5 }] });
}

// the fuse burns out a 64th before the blast: that breath of silence is what makes the boom hit
// tAccent: the visuals snap-zoom on bombLand and bombLand+BEAT; the second one gets a low
// "heartbeat" thump (sub-300 Hz, so it adds weight without competing with the fizz on a phone)
// and a short flare of the SAME sizzle texture — the fuse stays the star.
function fuse(m, t0, tBoom, tAccent) {
  const t1 = tBoom - S32 / 2, d = t1 - t0;
  const buf = m.buffer(makeSizzle(m.sr, d + 0.05, m.rnd));
  const gate = (lo, hi) => (p) => {
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(lo, t0 + 0.008);
    p.linearRampToValueAtTime(hi, t1 - 0.006);
    p.linearRampToValueAtTime(0, t1);
    return t1 + 0.01;
  };
  m.noise(m.sfx, {       // bright fizz, the star
    buf, t: t0, offset: 0, custom: gate(0.6, 0.85),
    filters: [{ type: 'highpass', f: 2000 }, { type: 'peaking', Q: 1, gain: 6, pts: [[t0, 3800], [t1, 5200]] }, { type: 'lowpass', f: 10000 }],
  });
  m.noise(m.sfx, {       // crackle body for small speakers
    buf, t: t0, offset: 0, custom: gate(0.28, 0.38),
    filters: [{ type: 'bandpass', f: 1300, Q: 0.9 }],
  });
  if (tAccent > t0 && tAccent < t1) {
    m.tone(m.sfx, { t: tAccent, f: 110, f1: 52, glide: 0.1, wave: 'sine', gain: 0.2, a: 0.002, decay: 0.07, sus: 0, dur: 0.13, rel: 0.03 });
    m.noise(m.sfx, { buf, t: tAccent, offset: tAccent - t0, gain: 0.28, a: 0.001, decay: 0.035, dur: 0.06, rel: 0.02, filters: [{ type: 'highpass', f: 3000 }] });
  }
}

function explosion(m, t, tEnd) {
  const buf = m.buffer(makeBlast(m.sr, tEnd - t + 0.1, m.rnd));
  const tau = (tEnd - t) / 3.2;
  m.noise(m.sfx, {
    buf, t, offset: 0,
    filters: [{ type: 'lowpass', Q: 0.9, pts: [[t, 9000], [t + 0.15, 2600], [tEnd, 350]] }],
    custom: (p) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(2.3, t + 0.004); p.setTargetAtTime(0, t + 0.004, tau); p.setTargetAtTime(0, tEnd - 0.03, 0.006); return tEnd + 0.05; },   // 2nd target: close the tail before stop (no truncation)
  });
  m.noise(m.sfx, { t, gain: 0.9, a: 0.0005, decay: 0.004, dur: 0.006, rel: 0.004 });        // transient crack
  m.tone(m.sfx, { t, f: 150, f1: 40, glide: 0.5, wave: 'sq50', gain: 0.5, a: 0.002, decay: 0.18, sus: 0, dur: 0.6, rel: 0.05, lp: 1400 });
  m.tone(m.sfx, { t, f: 95, f1: 28, glide: 0.7, wave: 'triangle', gain: 0.35, a: 0.002, decay: 0.22, sus: 0, dur: 0.8, rel: 0.05 });
  // distorted mid thud: harmonics a phone speaker can reproduce
  const o = m.ctx.createOscillator();
  o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  const ws = m.ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(4 * (i / 511.5 - 1));
  ws.curve = curve;
  const g = m.ctx.createGain();
  const end = m.env(g.gain, t, { gain: 0.7, a: 0.002, decay: 0.12, sus: 0, dur: 0.4, rel: 0.03 });
  o.connect(ws); ws.connect(g); m.sfx.add(g); o.start(t); o.stop(end);
  // bit-crushed crunch
  const cb = m.buffer(makeCrunch(m.sr, 0.6, m.rnd));
  const cs = m.ctx.createBufferSource(); cs.buffer = cb;
  const hp = m.biquad('highpass', 250, 0.7);
  const cg = m.ctx.createGain(); cg.gain.value = 1.0;
  cs.connect(hp); hp.connect(cg); m.sfx.add(cg); cs.start(t);
}

const KEY_NOTES = CUES.keyTimes.map((_, i) => nm('C5') + 12 * Math.floor(i / PENTA.length) + PENTA[i % PENTA.length]);

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
  const notes = [nm('C6'), nm('G6')];
  notes.forEach((n, i) => {
    const ti = t + i * S32, dur = i ? 0.12 : S32 * 0.9;
    m.tone(m.sfx, { t: ti, f: mtof(n), wave: 'sq25', gain: 0.2, a: 0.001, decay: 0.06, sus: 0.4, dur, rel: 0.03 });
    m.tone(m.sfx, { t: ti, f: mtof(n - 12), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.06, sus: 0.3, dur, rel: 0.03 });
  });
  click(m, t, 0.28);
  m.duck(t, -6, 0.15);
}
function correctJingle(m, t, tNext) {        // tNext: the jingle rings out before the points counter starts
  const arp = [nm('C6'), nm('E6'), nm('G6'), nm('C7')];
  arp.forEach((n, i) => {
    const last = i === arp.length - 1, ti = t + i * S32, dur = last ? Math.max(S32, tNext - ti - S16) : S32 * 0.9;
    m.tone(m.sfx, { t: ti, f: mtof(n), wave: 'sq25', gain: 0.2, a: 0.002, decay: 0.12, sus: 0.5, dur, rel: 0.05, vib: last ? 20 : 0, vibDelay: 0.06, vibRate: 7 });
    m.tone(m.sfx, { t: ti, f: mtof(n - 12), wave: 'triangle', gain: 0.16, a: 0.002, decay: 0.12, sus: 0.5, dur, rel: 0.05 });
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
  m.duckLead(t0, -4, t1 - t0, 0.01, 0.1);            // the 12.5 % lead sits right in the ticks' 1-2 kHz band
  // "ding" when the counter lands
  m.tone(m.sfx, { t: t1, f: mtof(nm('C7')), wave: 'sine', gain: 0.24, a: 0.001, decay: 0.25, sus: 0, dur: 0.6, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('C6')), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.2, sus: 0, dur: 0.5, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('G7')), wave: 'sine', gain: 0.06, a: 0.001, decay: 0.1, sus: 0, dur: 0.2, rel: 0.05 });
  m.tone(m.sfx, { t: t1, f: mtof(nm('C7')), wave: 'sq12', gain: 0.06, a: 0.001, decay: 0.04, sus: 0, dur: 0.06, rel: 0.02 });
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
  m.tone(m.sfx, { t: tPeak, f: mtof(CHORD.F.root), wave: 'triangle', gain: 0.18, a: 0.08, decay: 1, sus: 1, dur: tLand - tPeak - 0.02, rel: 0.01 });
}
function logoDing(m, t) {
  m.tone(m.sfx, { t, f: mtof(nm('A6')), wave: 'sine', gain: 0.3, a: 0.001, decay: 0.3, sus: 0, dur: 0.8, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('C7')), wave: 'sine', gain: 0.1, a: 0.001, decay: 0.2, sus: 0, dur: 0.5, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('F5')), wave: 'triangle', gain: 0.14, a: 0.001, decay: 0.25, sus: 0, dur: 0.6, rel: 0.05 });
  m.tone(m.sfx, { t, f: mtof(nm('A6')), wave: 'sq12', gain: 0.07, a: 0.001, decay: 0.06, sus: 0, dur: 0.1, rel: 0.02 });
  click(m, t, 0.25);
  sparkle(m, t + S32, 0.5, 8, 0.09);
  m.duck(t, -5, 0.1, 0.004, 0.2);
  m.duckLead(t, -8, 0.12);
}
function storesPop(m, t) {
  m.tone(m.sfx, { t, f: 480, f1: 1000, glide: 0.04, wave: 'sine', gain: 0.4, a: 0.001, decay: 0.04, sus: 0, dur: 0.06, rel: 0.02 });
  m.tone(m.sfx, { t, f: mtof(nm('D6')), wave: 'triangle', gain: 0.16, a: 0.001, decay: 0.05, sus: 0, dur: 0.08, rel: 0.02 });
  click(m, t, 0.2);
  m.duck(t, -7, 0.07);
  m.duckLead(t, -9);
}

// ---------------------------------------------------------------- the score
function score(m) {
  const C = CUES;
  // Scene 1 — hook
  tvStatic(m, C.staticStart, C.powerOn);
  crtPowerOn(m, C.powerOn);
  appChime(m, C.appReady);
  intro(m, MUSIC_START, C.bombLand);
  bombWhistle(m, C.bombDrop, C.bombLand);
  plunk(m, C.bombLand);
  fuse(m, C.fuseStart, C.explode, C.bombLand + BEAT);                 // music is OUT here: the sizzle is the star
  explosion(m, C.explode, C.blastEnd + BLAST_TAIL);
  // Scene 2 — mechanic: the groove slams in, typing on top
  groove(m, { t0: C.blastEnd, t1: C.enter, chords: prog(C.blastEnd, ['C', 'G', 'Am', 'F', 'C']), lead: LEAD_GROOVE, softSnare: C.keyTimes });
  C.keyTimes.forEach((t, i) => keyBlip(m, t, KEY_NOTES[i]));
  enterBlip(m, C.enter);
  riser(m, C.enter, C.correct);
  // Scene 3 — reward: fanfare + brighter variation
  fanfare(m, C.correct);
  groove(m, {
    t0: C.correct, t1: C.ctaTransition, chords: prog(C.correct, ['C', 'Am', 'F', 'G']), lead: LEAD_CELEBRATE,
    leadWave: 'sq12', leadGain: 0.2, harmony: true, arpLo: nm('C5'), arpHi: nm('E6'),
    arpPattern: [0, 1, 2, 3, 4, 3, 2, 1], arpGain: 0.065, dense: true, slam: false, softSnare: [C.pointsStart, C.pointsEnd],
  });
  correctJingle(m, C.correct, C.pointsStart);
  pointTicks(m, C.pointsStart, C.pointsEnd);
  characterPop(m, C.characterIn);
  // Scene 4 — CTA: whoosh on the cut, reverse swell into the logo sting, closing phrase, final chord
  whoosh(m, C.ctaTransition, C.logoLand);
  logoDing(m, C.logoLand);
  groove(m, { t0: C.logoLand, t1: C.musicEndChord, chords: [{ t: C.logoLand, name: 'F' }, { t: C.ctaText, name: 'G' }], lead: LEAD_CTA, leadWave: 'sq12', leadGain: 0.2, arpLo: nm('C5'), arpHi: nm('D6') });
  storesPop(m, C.stores);
  finalChord(m, C.musicEndChord);
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
// 4x windowed-sinc oversampled peak (true-peak estimate)
function truePeak(chs) {
  const T = 8, P = 4, taps = [];
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
  let out = null;
  for (let it = 0; it < 4; it++) {
    out = orig.map((x) => x.map((v) => v * gain));
    limiter(out, sr, ceil);
    const l = lufs(out, sr);
    if (Math.abs(l - TARGET_LUFS) < 0.05) break;
    gain *= Math.pow(10, (TARGET_LUFS - l) / 20);
  }
  // true-peak normalisation: the loudest inter-sample peak lands exactly on TRUE_PEAK_DB
  const tp = truePeak(out);
  const k = Math.pow(10, TRUE_PEAK_DB / 20) / tp;
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
export async function renderAudio({ sampleRate = SAMPLE_RATE, raw = false, solo = null } = {}) {
  const length = Math.round(DURATION * sampleRate);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate });
  const m = new Mix(ctx, SEED);
  score(m);
  m.finalize();
  if (solo === 'music') m.sfxGain.disconnect();
  else if (solo === 'sfx') m.musicGain.disconnect();
  const buf = await ctx.startRendering();
  return raw ? buf : master(buf);
}
