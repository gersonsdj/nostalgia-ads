// Shared contract for the "Nostalgia — Papa-Léguas" 15s vertical ad (canal DESENHOS, fase 1).
// Visuals (visuals*.js) and audio (audio.js) BOTH read every cue from here, so
// picture and sound stay in sync by construction. Change a time here, never inline.
//
// Music grid: 120 BPM starting at t=1.0 -> every cue below sits on a multiple of
// 0.125s (a 16th note), so hits land on the beat. The key presses are the one
// exception: they are snapped to the nearest video frame (see KEY_STEPS).

export const W = 1080;          // output width  (px)
export const H = 1920;          // output height (px) — 9:16
export const PX = 4;            // one "art pixel" = 4x4 output pixels
export const LW = W / PX;       // 270 — logical pixel-art width
export const LH = H / PX;       // 480 — logical pixel-art height
export const FPS = 30;
export const DURATION = 15.0;   // seconds, exact
export const FRAMES = Math.round(DURATION * FPS); // 450

export const BPM = 120;
export const BEAT = 60 / BPM;   // 0.5s
export const MUSIC_START = 1.0;

// The quiz answer as registered in the app (10 letters, accented É). It appears ONLY as
// the answer: typed into the slots, and on the answer ribbon of the reward card.
export const ANSWER = 'PAPALÉGUAS';

// Virtual remote keyboard: 8 columns like the app's grid. The app keyboard includes
// accented letters, so the last row carries Á É Ã Ç before backspace and OK.
export const KEYBOARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÃÇ';
export const KEY_COLS = 8;

// ---- Scene windows [t0, t1) --------------------------------------------------
export const SCENES = [
  { id: 1, name: 'hook',     t0: 0.0,  t1: 3.0 },
  { id: 2, name: 'mechanic', t0: 3.0,  t1: 8.0 },
  { id: 3, name: 'reward',   t0: 8.0,  t1: 12.0 },
  { id: 4, name: 'cta',      t0: 12.0, t1: 15.0 },
];

// ---- Key presses -----------------------------------------------------------------
// 10 taps in the same window as the first ad (3.75 -> 6.75 s), on the 16th grid in a
// 3-3-2 (tresillo) rhythm: steps [0,3,6 | 8,11,14 | 16,19,22 | 24] sixteenths. Each grid
// time is then rounded to the NEAREST frame (ties go to the earlier frame, the renderer's
// keyFrame() rule), so the key-down frame and the blip share one exact instant (error vs
// the beat grid <= 16.7 ms).
const S16 = BEAT / 4;
const TYPE_START = 3.75;
export const KEY_STEPS = [0, 3, 6, 8, 11, 14, 16, 19, 22, 24];
export const KEY_GRID = KEY_STEPS.map((s) => TYPE_START + s * S16);       // unrounded, for QA
const nearestFrame = (t) => Math.ceil(t * FPS - 0.5 - 1e-6) / FPS;
const KEY_TIMES = KEY_GRID.map(nearestFrame);
// -> frames 112 124 135 142 154 165 172 184 195 202
// -> 3.733 4.133 4.500 4.733 5.133 5.500 5.733 6.133 6.500 6.733 s

// ---- Cues (seconds) -----------------------------------------------------------
export const CUES = {
  // Scene 1 — hook: black + static, the phone lights up in the app, then the sound gag
  staticStart: 0.0,     // black screen + analog TV static (sound), faint visual snow
  powerOn: 1.0,         // CRT power-on: phone screen lights up (line expands 1.0–1.125)
  appReady: 1.125,      // Nostalgia app UI fully visible: sound-quiz card, desert road at sunset
  beep1: 1.25,          // "bip-" — high two-note horn, note 1 (THE memory trigger, part 1)
  beep2: 1.375,         // "-bip!" — note 2
  dashStart: 1.5,       // a dust cloud streaks across the road at full speed ("zuuum") + speed lines
  dashEnd: 1.75,        // the cloud is gone; its dust trail hangs and settles
  fallStart: 1.75,      // cartoon fall: long descending whistle, something drops into the canyon
  fallEnd: 2.3125,      // whistle stops: a beat of silence before the payoff (the gag's pause)
  puff: 2.5,            // tiny, distant "puf" of dust at the bottom of the canyon (+ small shake)
  puffEnd: 3.0,

  // Scene 2 — mechanic (hand holds phone, virtual remote, typing)
  pushIn: 3.0,          // camera pushes in to close-up of hand + phone (3.0–3.375)
  remoteReady: 3.375,   // virtual remote on screen, keys blinking idle
  typeStart: KEY_TIMES[0],
  keyTimes: KEY_TIMES,  // P A P A L É G U A S
  enter: 7.25,          // OK/ENTER pressed
  checking: 7.25,       // brief suspense 7.25–8.0 (slots flash)

  // Scene 3 — reward
  correct: 8.0,         // screen floods green, "CORRETO!" pops, confetti bursts
  pointsStart: 8.5,     // "+100 PONTOS" counter rolls 0 -> 100
  pointsEnd: 9.5,
  characterIn: 9.0,     // "character" card pops in (ORIGINAL placeholder art, licensed-art slot)
  // idle celebration until 12.0

  // Scene 4 — CTA
  ctaTransition: 12.0,  // fast transition (12.0–12.25) to the Nostalgia logo
  logoLand: 12.5,       // logo lands / shine
  ctaText: 13.0,        // "Aceita o desafio dos Anos 90/2000?"
  stores: 13.5,         // "Baixe o Nostalgia Grátis" + Play Store / App Store
  musicEndChord: 14.0,  // final chord; audio tail decays to silence by 15.0
  end: 15.0,
};

// ---- On-screen copy (PT-BR) -----------------------------------------------------
// The captions never give the answer away.
export const CAPTIONS = [
  { t0: 1.25, t1: 2.95,  text: 'Reconhece esse bip-bip?' },
  { t0: 3.5,  t1: 7.2,   text: 'Digite no controle virtual...' }, // ends before OK: the 7.25–8.0 suspense stays clean
  { t0: 8.5,  t1: 11.9,  text: '...e destrave suas memórias de infância!' },
];

export const COPY = {
  appName: 'NOSTALGIA',
  quizPrompt: 'QUAL É O DESENHO?',
  channel: 'CH19',       // the app's TV-channel metaphor: Desenhos = CH19
  channelName: 'DESENHOS',
  level: 'FASE 1',
  correct: 'CORRETO!',
  points: '+100 PONTOS',
  pointsValue: 100,
  pointsLabel: 'PONTOS',
  ctaQuestion: 'Aceita o desafio dos Anos 90/2000?',
  ctaDownload: 'Baixe o Nostalgia Grátis',
  ctaStores: ['Play Store', 'App Store'],
  // Fine print on the end card: the title is a quiz answer, not an endorsement.
  disclaimer: 'Marcas citadas pertencem aos seus respectivos donos.',
};

// ---- Safe zones (output px) -------------------------------------------------------
// TikTok / Reels / Shorts overlay their UI on the bottom ~22%, the right ~12% and the
// top ~8%. Anything the viewer must READ stays inside this rectangle.
export const SAFE = { x0: 72, y0: 160, x1: 940, y1: 1480 };

// Recommended palette (Sweetie 16, free to use) + a few extras. Vibrant 16-bit look.
export const PALETTE = {
  ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57',
  yellow: '#ffcd75', lime: '#a7f070', green: '#38b764', teal: '#257179',
  navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7',
  white: '#f4f4f4', silver: '#94b0c2', slate: '#566c86', charcoal: '#333c57',
  black: '#000000', skin: '#f2b38a', skinShade: '#c9825d', gold: '#ffd84a',
};

// Title identity: cartoon desert at sunset (scene 1 + colour accents elsewhere). A starting
// point for the art directions, not a cage: turquoise sky -> terracotta horizon, mesas,
// cacti, a two-lane road, pale dust.
export const DESERT = {
  skyHi: '#1f9e9a', sky: '#3fc9c0', skyLo: '#9be3cf', glow: '#ffd89a',
  sun: '#ffcd75', sunset: '#ef7d57', terracotta: '#c8553d', rust: '#9c3b2b',
  mesa: '#b4502f', mesaSh: '#7a2f22', mesaDk: '#4a1c1c',
  sand: '#f2c28c', sandSh: '#d9955f', sandDk: '#a8683f',
  road: '#4b3a4a', roadSh: '#33283a', roadLine: '#ffe45c',
  cactus: '#38b764', cactusSh: '#1f7a4a', cactusDk: '#0e4a33',
  dust: '#f7e3c4', dustSh: '#d8b48a', dustDk: '#a88460',
};

export function sceneAt(t) {
  for (const s of SCENES) if (t >= s.t0 && t < s.t1) return s;
  return SCENES[SCENES.length - 1];
}
