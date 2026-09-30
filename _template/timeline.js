// Shared contract for the "Nostalgia — Bomberman" 15s vertical ad.
// Visuals (visuals*.js) and audio (audio.js) BOTH read every cue from here, so
// picture and sound stay in sync by construction. Change a time here, never inline.
//
// Music grid: 120 BPM starting at t=1.0 -> every cue below sits on a multiple of
// 0.125s (a 16th note), so hits land on the beat.

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

export const ANSWER = 'BOMBERMAN';

// ---- Scene windows [t0, t1) --------------------------------------------------
export const SCENES = [
  { id: 1, name: 'hook',     t0: 0.0,  t1: 3.0 },
  { id: 2, name: 'mechanic', t0: 3.0,  t1: 8.0 },
  { id: 3, name: 'reward',   t0: 8.0,  t1: 12.0 },
  { id: 4, name: 'cta',      t0: 12.0, t1: 15.0 },
];

// ---- Cues (seconds) -----------------------------------------------------------
const TYPE_START = 3.75;
const KEY_INTERVAL = 0.375;

export const CUES = {
  // Scene 1 — hook
  staticStart: 0.0,     // black screen + analog TV static (sound), faint visual snow
  powerOn: 1.0,         // CRT power-on: phone screen lights up (line expands 1.0–1.125)
  appReady: 1.125,      // Nostalgia app UI fully visible (sound-quiz card)
  bombDrop: 1.25,       // pixel bomb starts falling onto the in-app grid
  bombLand: 1.5,        // bomb lands ("plunk") — fuse is lit from here
  fuseStart: 1.5,       // fuse sizzle — THE memory trigger sound
  explode: 2.5,         // explosion: flash + cross-shaped blast + screen shake
  blastEnd: 3.0,

  // Scene 2 — mechanic (hand holds phone, virtual remote, typing)
  pushIn: 3.0,          // camera pushes in to close-up of hand + phone (3.0–3.375)
  remoteReady: 3.375,   // virtual remote on screen, keys blinking idle
  typeStart: TYPE_START,
  keyInterval: KEY_INTERVAL,
  keyTimes: Array.from({ length: 9 }, (_, i) => TYPE_START + i * KEY_INTERVAL), // B O M B E R M A N
  enter: 7.25,          // OK/ENTER pressed
  checking: 7.25,       // brief suspense 7.25–8.0 (slots flash)

  // Scene 3 — reward
  correct: 8.0,         // screen floods green, "CORRETO!" pops, confetti bursts
  pointsStart: 8.5,     // "+100 PONTOS" counter rolls 0 -> 100
  pointsEnd: 9.5,
  characterIn: 9.0,     // classic character icon card pops in
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
// Overlay/legenda from the brief, split across the scenes it narrates.
export const CAPTIONS = [
  { t0: 1.25, t1: 2.95,  text: 'Reconhece o som do pavio aceso?' },
  { t0: 3.5,  t1: 7.2,   text: 'Digite no controle virtual...' }, // ends before OK: the 7.25–8.0 suspense stays clean
  { t0: 8.5,  t1: 11.9,  text: '...e destrave suas memórias de infância!' },
];

export const COPY = {
  appName: 'NOSTALGIA',
  quizPrompt: 'QUAL É O JOGO?',
  correct: 'CORRETO!',
  points: '+100 PONTOS',
  pointsValue: 100,
  pointsLabel: 'PONTOS',
  ctaQuestion: 'Aceita o desafio dos Anos 90/2000?',
  ctaDownload: 'Baixe o Nostalgia Grátis',
  ctaStores: ['Play Store', 'App Store'],
  // Fine print on the end card: the game name is a quiz answer, not an endorsement.
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

export function sceneAt(t) {
  for (const s of SCENES) if (t >= s.t0 && t < s.t1) return s;
  return SCENES[SCENES.length - 1];
}
