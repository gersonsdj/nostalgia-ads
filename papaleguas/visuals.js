// visuals_a.js — Nostalgia 15 s ad, "Papa-Léguas" (channel CH19 DESENHOS, phase 1).
// DIRECTION A — "cinematic cartoon desert". The shared base (the first ad's bold UI-first
// look: hand, remote, slots, suspense, CORRETO!, confetti, end card) with the title's desert
// as a WORLD the camera travels through in scene 1: the app's scene window shows a two-lane
// road at sunset, the bip-bip snaps the camera out of the phone into the full-frame desert,
// a round dust cloud streaks across the road, a whip-tilt drops onto a canyon rim looking
// straight down, a boulder falls away, the camera snaps in 2x on the landing point and holds
// through the silence, a tiny puff answers far below, and the push-in dives into its wisp.
// Desert accents carry on: sunset-poster stripes (scene 2), a desert-sky reward card with an
// original road-sign placeholder and turquoise/terracotta confetti (scene 3), mesas (scene 4).
//
// Everything (art AND type) is drawn on a 270x480 low-res canvas — one art pixel = 4x4
// output pixels — and blown up with nearest-neighbour at the very end, so no element can
// ever sit on a half pixel. Type comes from Google pixel fonts (Press Start 2P for
// headings, Jersey 10/15 for sentences with accents): each glyph is rasterised once at 10x,
// sampled at its design-pixel centres and cached as a bitmap, then styled (bands, outline,
// extrusion) like a sprite. Press Start's accented capitals (Á É Ã Ç ...) are composed from
// the base capital + a 2-px accent, so every box that shows a letter reserves room for it.
// drawFrame(ctx, t) is a pure function of t (seeded PRNG / hashes only).
//
// IP: nothing here may resemble the cartoon's characters, logos or props. The title's name
// appears ONLY as the quiz answer (slots + answer ribbon); assets/character.png is the slot
// for licensed art on the reward card (drawn instead of the placeholder when present).
import { W, H, LW, LH, FPS, BEAT, MUSIC_START, CUES, CAPTIONS, COPY, SAFE, PALETTE, ANSWER, KEYBOARD, KEY_COLS, DESERT } from './timeline.js';

// ---------------------------------------------------------------------------------------
// Palette
const P = PALETTE;
const X = {
  pink: '#ff4f9a', pinkDk: '#c2188f', pinkLt: '#ff9cc8', purple: '#7b2fbe', violet: '#4b1d8a',
  deep: '#1b0d33', night: '#0b0717', cream: '#fff3b0', gold: '#ffd84a', amber: '#ffb13b',
  goldDk: '#b86b12', g1: '#7cf0a0', g2: '#46d876', g3: '#2fb35f', g4: '#1f8a47', g5: '#0e5a33',
  fW: '#ffffff', fY: '#ffe45c', fO: '#ff8a1f', fR: '#d9281f',
  ink: '#1a1c2c', bodyInk: '#0a0a12', remote: '#262b44', remoteLt: '#3f4770', remoteDk: '#12152a',
  skin: P.skin, skinSh: P.skinShade, skinLt: '#ffd6b8', skinOut: '#5e2f1f', nail: '#ffe6da', nailLt: '#ffffff',
  phone: '#2b1b4a', phoneLt: '#5a3d8f', phoneDk: '#150a28', screenBk: '#07040f',
  red: '#e43b44', redDk: '#9e1f33', redLt: '#ff7b7b',
};
// brand pink / gold / cyan / white + the title's desert: sunset orange, terracotta, turquoise
const CONFETTI = ['#ff4f9a', '#ffd84a', '#73eff7', '#ffffff', '#ef7d57', '#a7f070', '#c8553d', '#1fb8ae'];

// ---------------------------------------------------------------------------------------
// Small math helpers (all deterministic)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const outCubic = (k) => 1 - (1 - k) ** 3;
const inQuad = (k) => k * k;
const inOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const outBack = (k, s = 1.9) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
const ri = Math.round;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function u32(h) { const [r, g, b] = hexRGB(h); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function u32rgb(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }

// ---------------------------------------------------------------------------------------
// Canvases
let lo, L;           // main low-res frame
let tmp, TX;         // scratch (putImageData staging)
let bgImg, BG32;     // background pixel buffer
let gcv, gctx;       // glyph rasteriser
let charImg = null, logoImg = null;
// Official Nostalgia app icon (assets/app_icon.png, square, full bleed). When present it
// replaces the drawn TV icon: a low-res copy keeps the layout/animation working in the
// 270x480 frame, and the exact artwork is painted at OUTPUT resolution after the 4x blit
// (HIRES), so the brand mark is shown unaltered, not pixelated.
let iconImg = null, iconHi = null;
const HIRES = [];    // [{ c, x, y, w, h, r }] in lo px, painted on the output ctx by drawFrame
let ready = false;
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctxOf(c) { const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return x; }

// ---------------------------------------------------------------------------------------
// Primitive drawing (low-res, integer)
function R(ctx, x, y, w, h, c) { if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(ri(x), ri(y), ri(w), ri(h)); }
function rrect(ctx, x, y, w, h, r, c) {
  x = ri(x); y = ri(y); w = ri(w); h = ri(h);
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  r = Math.min(r, w >> 1, h >> 1);
  if (r <= 0) { ctx.fillRect(x, y, w, h); return; }
  for (let i = 0; i < r; i++) {
    const dy = r - i - 0.5;
    const ins = r - Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(x + ins, y + i, w - 2 * ins, 1);
    ctx.fillRect(x + ins, y + h - 1 - i, w - 2 * ins, 1);
  }
  ctx.fillRect(x, y + r, w, h - 2 * r);
}
// Rounded panel: outline, optional drop extrusion, body with bottom shade and top light.
function panel(ctx, x, y, w, h, r, o) {
  if (o.ext) rrect(ctx, x - 1, y - 1 + o.ext, w + 2, h + 2, r + 1, o.extC || X.ink);
  if (o.out) rrect(ctx, x - 1, y - 1, w + 2, h + 2, r + 1, o.out);
  if (o.sh) { rrect(ctx, x, y, w, h, r, o.sh); rrect(ctx, x, y, w, h - (o.shH || 2), r, o.fill); }
  else rrect(ctx, x, y, w, h, r, o.fill);
  if (o.hi) R(ctx, x + Math.max(2, r), y + 1, w - 2 * Math.max(2, r), 1, o.hi);
}
function disc(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  cx = ri(cx); cy = ri(cy);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt((r + 0.5) ** 2 - dy * dy));
    ctx.fillRect(cx - hw, cy + dy, 2 * hw + 1, 1);
  }
}
// Dithered disc (fade by ordered dithering, not alpha)
function ditherDisc(ctx, cx, cy, r, c, c2, a) {
  cx = ri(cx); cy = ri(cy);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt((r + 0.5) ** 2 - dy * dy));
    for (let dx = -hw; dx <= hw; dx++) {
      const x = cx + dx, y = cy + dy;
      if (bay(x, y) >= a) continue;
      ctx.fillStyle = (dx + dy > r * 0.3) ? c2 : c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
function sparkle(ctx, x, y, s, c1, c2) { // 4-point star, s = arm length
  x = ri(x); y = ri(y);
  if (s <= 0) return;
  R(ctx, x - s, y, 2 * s + 1, 1, c2); R(ctx, x, y - s, 1, 2 * s + 1, c2);
  if (s >= 2) { R(ctx, x - 1, y, 3, 1, c1); R(ctx, x, y - 1, 1, 3, c1); }
  else R(ctx, x, y, 1, 1, c1);
}
// Sprite from string rows
function spr(rows, map) {
  const c = mk(rows[0].length, rows.length), x = ctxOf(c);
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const col = map[row[i]]; if (col) R(x, i, j, 1, 1, col); } });
  return c;
}
// Vertical dithered gradient canvas
function ditherV(w, h, cols) {
  const c = mk(w, h), x = ctxOf(c), img = x.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const u = cols.map(u32), n = cols.length - 1;
  for (let j = 0; j < h; j++) {
    const f = (j / Math.max(1, h - 1)) * n;
    const i0 = Math.min(n - 1, Math.floor(f)), fr = f - i0;
    for (let i = 0; i < w; i++) d[j * w + i] = fr > bay(i, j) ? u[i0 + 1] : u[i0];
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Shaded capsules (skin, sleeves). caps: [{ax,ay,bx,by,r}], pal: {out, base, sh, lt}, nail optional.
function shadedCapsules(ctx, caps, pal, nail) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of caps) {
    x0 = Math.min(x0, c.ax - c.r, c.bx - c.r); y0 = Math.min(y0, c.ay - c.r, c.by - c.r);
    x1 = Math.max(x1, c.ax + c.r, c.bx + c.r); y1 = Math.max(y1, c.ay + c.r, c.by + c.r);
  }
  x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
  x0 = Math.max(x0, -40); y0 = Math.max(y0, -40); x1 = Math.min(x1, LW + 40); y1 = Math.min(y1, LH + 40);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img = TX.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const cOut = u32(pal.out), cBase = u32(pal.base), cSh = u32(pal.sh), cLt = u32(pal.lt);
  const cN = nail ? u32(X.nail) : 0, cNl = nail ? u32(X.nailLt) : 0, cNs = nail ? u32('#e9a88c') : 0;
  for (let j = 0; j < h; j++) {
    const py = y0 + j + 0.5;
    for (let i = 0; i < w; i++) {
      const px = x0 + i + 0.5;
      let best = 1e9, nx = 0, ny = 0, br = 1;
      for (const c of caps) {
        const vx = c.bx - c.ax, vy = c.by - c.ay, ll = vx * vx + vy * vy;
        let k = ll > 0 ? ((px - c.ax) * vx + (py - c.ay) * vy) / ll : 0;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        const qx = px - (c.ax + vx * k), qy = py - (c.ay + vy * k);
        const dd = Math.sqrt(qx * qx + qy * qy);
        const m = dd - c.r;
        if (m < best) { best = m; nx = qx / c.r; ny = qy / c.r; br = c.r; }
      }
      if (best > 1.1) continue;
      const idx = j * w + i;
      if (best > 0) { d[idx] = cOut; continue; }
      const l = -(nx * 0.55 + ny * 0.8) + (bay(x0 + i, y0 + j) - 0.5) * 0.3;
      let col = l < -0.42 ? cSh : l > 0.5 && best < -1.5 ? cLt : cBase;
      if (nail) {
        const ex = px - nail.cx, ey = py - nail.cy;
        const a = (ex * nail.ux + ey * nail.uy) / nail.a, b = (-ex * nail.uy + ey * nail.ux) / nail.b;
        const q = a * a + b * b;
        if (q <= 1) col = q > 0.62 ? cNs : (a < -0.2 && b < 0.2) ? cNl : cN;
      }
      d[idx] = col;
      void br;
    }
  }
  tmpPut(ctx, img, x0, y0);
}
function tmpPut(ctx, img, x, y) {
  TX.clearRect(0, 0, img.width, img.height);
  TX.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, img.width, img.height, x, y, img.width, img.height);
}

// ---------------------------------------------------------------------------------------
// Pixel type: glyph atlases sampled from Google Fonts
const FONT = {
  ps: { family: 'Press Start 2P', P: 8, glyphs: new Map(), cap: null },
  // Jersey 10's design pixel is 3/56 em (measured: stems, counters and advances all land on
  // multiples of size*3/56), so 1 design pixel = 1 css px at 56/3 px.
  jr: { family: 'Jersey 10', P: 56 / 3, glyphs: new Map(), cap: null },
  // Jersey 15 sits on an exact 1/27 em grid: at 27 px one design pixel = one art pixel,
  // cap height 15 art px = 60 output px (captions, CTA copy).
  j15: { family: 'Jersey 15', P: 27, glyphs: new Map(), cap: null },
};
const GK = 10; // raster oversampling
// Press Start 2P squeezes accented CAPITALS into the 8x8 cell (they read as lowercase at
// our sizes), so those are composed: base capital + a 2-px accent above the cap line.
const ACCENTS = {
  acute: [[4, -3], [5, -3], [3, -2], [4, -2]], grave: [[2, -3], [3, -3], [3, -2], [4, -2]],
  circ: [[3, -3], [4, -3], [2, -2], [5, -2]], tilde: [[1, -2], [2, -3], [3, -3], [4, -2], [5, -2], [6, -3]],
};
const COMPOSE = {
  'Á': ['A', 'acute'], 'É': ['E', 'acute'], 'Í': ['I', 'acute'], 'Ó': ['O', 'acute'], 'Ú': ['U', 'acute'],
  'À': ['A', 'grave'], 'Â': ['A', 'circ'], 'Ê': ['E', 'circ'], 'Ô': ['O', 'circ'], 'Ã': ['A', 'tilde'], 'Õ': ['O', 'tilde'],
};
function glyph(fk, ch) {
  const font = FONT[fk];
  let g = font.glyphs.get(ch);
  if (g) return g;
  if (fk === 'ps' && (COMPOSE[ch] || ch === 'Ç')) {
    const base = glyph(fk, ch === 'Ç' ? 'C' : COMPOSE[ch][0]);
    let top = 1e9;
    for (let k = 1; k < base.px.length; k += 2) top = Math.min(top, base.px[k]);
    const px = base.px.slice();
    if (ch === 'Ç') px.push(3, 0, 4, 0, 4, 1, 3, 2, 2, 2);
    else for (const [n, m] of ACCENTS[COMPOSE[ch][1]]) px.push(n, top + m);
    g = { adv: base.adv, px };
    font.glyphs.set(ch, g);
    return g;
  }
  const size = font.P * GK, cw = gcv.width, chh = gcv.height;
  gctx.clearRect(0, 0, cw, chh);
  gctx.font = `${size}px "${font.family}"`;
  gctx.fillStyle = '#fff';
  gctx.textBaseline = 'alphabetic';
  const ox = 40, base = Math.ceil(size * 1.3);
  gctx.fillText(ch, ox, base);
  const adv = Math.round(gctx.measureText(ch).width / GK);
  const data = gctx.getImageData(0, 0, cw, chh).data;
  const px = [];
  const mMin = -Math.ceil(font.P * 1.25), mMax = Math.ceil(font.P * 0.5);
  for (let m = mMin; m < mMax; m++) {
    for (let n = -3; n < adv + 4; n++) {
      const sx = ox + n * GK + (GK >> 1), sy = base + m * GK + (GK >> 1);
      if (sx < 0 || sy < 0 || sx >= cw || sy >= chh) continue;
      if (data[(sy * cw + sx) * 4 + 3] > 127) px.push(n, m);
    }
  }
  g = { adv, px };
  font.glyphs.set(ch, g);
  return g;
}
function capOf(fk) {
  const f = FONT[fk];
  if (f.cap) return f.cap;
  const g = glyph(fk, 'H');
  let top = 1e9, bot = -1e9;
  for (let k = 1; k < g.px.length; k += 2) { top = Math.min(top, g.px[k]); bot = Math.max(bot, g.px[k]); }
  f.cap = { top, bot, h: bot - top + 1 };
  return f.cap;
}
// Press Start design rows a capital reaches beyond the cap box: up = a composed accent
// (2 rows + a 1-row gap above the cap line), down = the cedilla (3 rows under the baseline).
// Every box that shows one letter (key, preview bubble, slot, ribbon tile) reserves them.
const glyphUp = (ch) => (COMPOSE[ch] ? 3 : 0);
const glyphDown = (ch) => (ch === 'Ç' ? 3 : 0);
const TCACHE = new Map();
// o: {s: scale, fill: color | [bands], hi, sh, out, ext: {d, c, c2, dx, dy}, track: extra lo px}
function textSprite(str, fk, o) {
  const key = fk + '\u0001' + str + '\u0001' + JSON.stringify(o);
  let sp = TCACHE.get(key);
  if (sp) return sp;
  const s = o.s || 1, track = o.track || 0, cap = capOf(fk);
  const chars = [...str];
  // layout
  let cx = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const pts = [];
  for (let ci = 0; ci < chars.length; ci++) {
    const g = glyph(fk, chars[ci]);
    for (let k = 0; k < g.px.length; k += 2) {
      const x = cx + g.px[k] * s, y = (g.px[k + 1] - cap.top) * s;
      pts.push(x, y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + s - 1);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + s - 1);
    }
    cx += g.adv * s + (ci < chars.length - 1 ? track : 0);
    // Press Start centres '!' in its 8-px cell: pull it in so "CORRETO!" reads as one word
    if (fk === 'ps' && chars[ci + 1] === '!') cx -= 2 * s;
  }
  if (!pts.length) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  const ext = o.ext || null;
  const pad = (o.out ? 1 : 0) + (ext ? ext.d : 0) + 1;
  const w = maxX - minX + 1 + pad * 2, h = maxY - minY + 1 + pad * 2;
  const lab = new Uint8Array(w * h);
  for (let k = 0; k < pts.length; k += 2) {
    const bx = pts[k] - minX + pad, by = pts[k + 1] - minY + pad;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) lab[(by + j) * w + bx + i] = 1;
  }
  if (o.out) {
    // outX: outline the EXTERIOR only (flood-filled from the sprite border), so small
    // counters (o, e, a, R) stay open instead of clogging with outline pixels
    let ext0 = null;
    if (o.outX) {
      ext0 = new Uint8Array(w * h);
      const st = [];
      for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
      while (st.length) {
        const i = st.pop();
        if (ext0[i] || lab[i]) continue;
        ext0[i] = 1;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1);
        if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lab[y * w + x]) continue;
      if (ext0 && !ext0[y * w + x]) continue;
      let hit = false;
      for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) {
        const xx = x + i, yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && lab[yy * w + xx] === 1) { hit = true; break; }
      }
      if (hit) lab[y * w + x] = 2;
    }
  }
  if (ext) {
    const dx = ext.dx ?? 1, dy = ext.dy ?? 1;
    for (let k = 1; k <= ext.d; k++) {
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const v = lab[y * w + x];
        if (v !== 1 && v !== 2) continue;
        const xx = x + dx * k, yy = y + dy * k;
        if (xx < w && yy < h && xx >= 0 && yy >= 0 && lab[yy * w + xx] === 0) lab[yy * w + xx] = k === ext.d ? 4 : 3;
      }
    }
  }
  const c = mk(w, h), cx2 = ctxOf(c), img = cx2.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const bands = (Array.isArray(o.fill) ? o.fill : [o.fill || '#ffffff']).map(u32);
  const uOut = o.out ? u32(o.out) : 0, uE = ext ? u32(ext.c) : 0, uE2 = ext ? u32(ext.c2 || ext.c) : 0;
  const uHi = o.hi ? u32(o.hi) : 0, uSh = o.sh ? u32(o.sh) : 0;
  const capY0 = -minY + pad, capH = cap.h * s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = lab[y * w + x];
    if (!v) continue;
    let col;
    if (v === 1) {
      const rel = (y - capY0) / capH;
      col = bands[clamp(Math.floor(rel * bands.length), 0, bands.length - 1)];
      if (uHi && (y === 0 || lab[(y - 1) * w + x] !== 1)) col = uHi;
      else if (uSh && (y === h - 1 || lab[(y + 1) * w + x] !== 1)) col = uSh;
    } else if (v === 2) col = uOut;
    else if (v === 3) col = uE;
    else col = uE2;
    d[y * w + x] = col;
  }
  cx2.putImageData(img, 0, 0);
  sp = { cv: c, w, h, inkW: maxX - minX + 1, ox: pad - 0, oxInk: minX, capY: capY0, pad, minX };
  TCACHE.set(key, sp);
  return sp;
}
function textWidth(str, fk, s = 1, track = 0) {
  const sp = textSprite(str, fk, { s, track });
  return sp.inkW;
}
// y = top of capitals. align: 'c' | 'l' | 'r' (by ink box)
function drawText(ctx, str, fk, o, x, y, align = 'c') {
  const sp = textSprite(str, fk, o);
  let lx = x;
  if (align === 'c') lx = x - Math.floor(sp.inkW / 2);
  else if (align === 'r') lx = x - sp.inkW;
  ctx.drawImage(sp.cv, ri(lx - sp.pad), ri(y - sp.capY));
  return sp;
}
// Fewest lines that fit maxW, then the most balanced split for that line count.
function wrapN(str, fk, s, maxW) {
  const words = str.split(' ');
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    let best = null, bestW = 1e9, bestC = Infinity;
    const rec = (start, left, acc) => {
      if (left === 1) {
        const ln = words.slice(start).join(' ');
        const lines = acc.concat([ln]);
        const ws = lines.map((l) => textWidth(l, fk, s)), w = Math.max(...ws);
        const cost = w * 1e6 + ws.reduce((q, v) => q + (w - v) * (w - v), 0);
        if (cost < bestC) { bestC = cost; bestW = w; best = lines; }
        return;
      }
      for (let k = start + 1; k <= words.length - left + 1; k++) rec(k, left - 1, acc.concat([words.slice(start, k).join(' ')]));
    };
    rec(0, n, []);
    if (bestW <= maxW) return best;
  }
  return [str];
}
function wrapBalanced(str, fk, s, maxW) {
  if (textWidth(str, fk, s) <= maxW) return [str];
  const words = str.split(' ');
  let best = null, bestW = 1e9;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const wmax = Math.max(textWidth(a, fk, s), textWidth(b, fk, s));
    if (wmax < bestW) { bestW = wmax; best = [a, b]; }
  }
  return best || [str];
}

// ---------------------------------------------------------------------------------------
// Static geometry (low-res coordinates)
const SAFE_L = { x0: SAFE.x0 / 4, y0: SAFE.y0 / 4, x1: SAFE.x1 / 4, y1: SAFE.y1 / 4 };
const CX = 135;
// Scene 1 phone
const PH1 = { x: 33, y: 30, w: 204, h: 346, r: 18 };
const SC1 = { x: 41, y: 48, w: 188, h: 316 };
// Scene 1 app screen, top to bottom: pink app bar (48..65), channel chip, prompt, listening
// wave, the SCENE WINDOW (empty stand-in: the art directors paint the title's scene in it),
// then the quiz HUD (timer + lives), kept above the scene-1 caption box (y >= 304).
const S1 = { chipY: 68, promptY: 85, waveY: 106, hudY: 284 };
const WIN = { x: 49, y: 121, w: 172, h: 158 };  // 2-px frame round it: 47..222 x 119..280
// Scene 2 phone (close-up)
const PH2 = { x: 26, y: 24, w: 218, h: 520, r: 20 };
const SC2 = { x: 36, y: 42, w: 198, h: 500 };
// Answer slots: 10 x (18 + 1) = 189 px, centred on the screen (4 | 3 px margins, the odd
// width cannot split evenly). A composed accent needs 4 more rows over the capitals (1-row
// gap under the border, 2x2-row accent, 2-row gap), so the slots grow by 4 when the answer
// has one (É) and every letter shares the same cap line (ty); a cedilla would need 4 below.
const ANS_UP = [...ANSWER].some((c) => glyphUp(c)) ? 1 : 0;
const ANS_DN = [...ANSWER].some((c) => glyphDown(c)) ? 1 : 0;
const SLOT = {
  x: 135 - ((ANSWER.length * 19 - 1) >> 1), y: 84 - 3 * (ANS_UP + ANS_DN),
  w: 18, h: 22 + 4 * (ANS_UP + ANS_DN), gap: 1, ty: 4 + 4 * ANS_UP,
};
const CAP2_Y = 139;   // scene-2 caption lives in its own band between the slots and the remote
const RM = { x: 46, y: 172, w: 178, h: 138 };
// Remote keyboard: KEY_COLS (8) x 4 rows = A..Z Á É Ã Ç, backspace, OK. 19 x 16 keys on a
// 21 x 18 pitch (the 1-px ink outlines of neighbours touch): 166 px wide, centred in the
// remote body (46..223) with 5 px of body each side; rows 218..287 between the D-pad and
// the brand strip. Odd width = the 7-px capitals centre exactly (6 | 6).
const KEY = { x0: 52, y0: 218, w: 19, h: 16, gx: 2, gy: 2, cols: KEY_COLS };
const BS_INDEX = KEYBOARD.length, OK_INDEX = KEYBOARD.length + 1, KEY_N = KEYBOARD.length + 2;
// Scene 3
const CARD = { x: CX - 55, y: 112, w: 108, h: 108 };
// Scene 4
const CXE = 126;    // end-card axis = SAFE centre (506 output px)
let LAND_DY = 120;  // the lockup lands this much lower (SAFE centre), then slides up (set in init)

function keyRect(k) {
  const col = k % KEY.cols, row = Math.floor(k / KEY.cols);
  return { x: KEY.x0 + col * (KEY.w + KEY.gx), y: KEY.y0 + row * (KEY.h + KEY.gy), w: KEY.w, h: KEY.h };
}
function keyIndexOf(ch) { return KEYBOARD.indexOf(ch); }
function slotRect(i) { return { x: SLOT.x + i * (SLOT.w + SLOT.gap), y: SLOT.y, w: SLOT.w, h: SLOT.h }; }

// ---------------------------------------------------------------------------------------
// Prebuilt sprites
const S = {};
// Generic shaded ball (unused by the stand-in; kept for the directors). ramp: {out, d, m, l,
// s, rim?, cel?: [dither amplitude, dark|mid, mid|light thresholds]}.
function ballSprite(r, ramp) {
  const size = 2 * r + 3, c = mk(size, size), x = ctxOf(c);
  const cc = r + 1.5;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = i + 0.5 - cc, dy = j + 0.5 - cc, dd = Math.sqrt(dx * dx + dy * dy);
    if (dd > r + 1.05) continue;
    if (dd > r) { R(x, i, j, 1, 1, ramp.out); continue; }
    // heat rim: a 1-px glowing ring just inside the outline, the body stays dark
    if (ramp.rim && dd > r - 1.1 && (dx > -r * 0.2 || dy > -r * 0.2)) { R(x, i, j, 1, 1, ramp.rim); continue; }
    const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = -nx * 0.5 - ny * 0.6 + nz * 0.62; // -1..1
    // ramp.cel: a low-amplitude dither so the terminator is a clean curve (at most a 1-px
    // checker band), with the mid tone dominant and the light tone capped to the top-left
    const cel = ramp.cel;
    const v = clamp((l + 0.35) / 1.3, 0, 0.999) * 3 + (bay(i, j) - 0.5) * (cel ? cel[0] : 0.7);
    const col = v < (cel ? cel[1] : 1) ? ramp.d : v < (cel ? cel[2] : 2) ? ramp.m : ramp.l;
    R(x, i, j, 1, 1, col);
  }
  // specular
  const sx = Math.round(cc - r * 0.45), sy = Math.round(cc - r * 0.5);
  R(x, sx, sy, Math.max(1, Math.round(r / 5)), Math.max(1, Math.round(r / 6)), ramp.s);
  if (r >= 10) R(x, sx - 1, sy + 2, 1, 2, ramp.s);
  return c;
}

function buildPhone(w, h, r) {
  const c = mk(w + 4, Math.min(h + 4, LH + 60)), x = ctxOf(c);
  // side buttons
  R(x, w + 1, 70, 3, 22, X.ink); R(x, w + 1, 71, 2, 20, X.phoneLt);
  R(x, w + 1, 100, 3, 14, X.ink); R(x, w + 1, 101, 2, 12, X.phoneLt);
  rrect(x, 0, 0, w + 2, h + 2, r + 1, X.ink);
  rrect(x, 1, 1, w, h, r, X.phoneDk);
  rrect(x, 1, 1, w - 2, h - 2, r, X.phoneLt);
  rrect(x, 3, 3, w - 5, h - 5, r - 2, X.phone);
  return c;
}
// Phone-screen ground: 6 FLAT horizontal bands stepping from #2e2870 down to #161240, with a
// 2-row ordered-dither seam only at each band boundary (like the sky painter). A per-pixel
// Bayer ramp over the whole screen would be a ~70 %-of-frame checkerboard for 5 s.
const SCR_STOPS = ['#2e2870', '#221d57', '#161240'].map(hexRGB);
function buildScreenBG(w, h) {
  const N = 6, cols = [], bounds = [];
  for (let k = 0; k < N; k++) {
    const g = ((k + 0.5) / N) * 2, i0 = Math.min(1, Math.floor(g)), fr = g - i0;
    const [r, gg, b] = SCR_STOPS[i0].map((v, j) => ri(lerp(v, SCR_STOPS[i0 + 1][j], fr)));
    cols.push(u32rgb(r, gg, b));
    if (k) bounds.push(ri((k * h) / N));
  }
  const c = mk(w, h), x = ctxOf(c), img = x.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = bandU(bounds, cols, j, i, 1);
  x.putImageData(img, 0, 0);
  return c;
}

function buildRemote() {
  const c = mk(RM.w + 4, RM.h + 6), x = ctxOf(c);
  const w = RM.w, h = RM.h;
  rrect(x, 0, 2, w + 2, h + 2, 13, '#07060d');
  rrect(x, 0, 0, w + 2, h + 2, 13, X.ink);
  rrect(x, 1, 1, w, h, 12, X.remoteDk);
  rrect(x, 1, 1, w, h - 2, 12, X.remote);
  R(x, 12, 2, w - 22, 1, X.remoteLt);
  // speaker/IR window
  rrect(x, w / 2 - 12 + 1, 4, 24, 4, 2, '#3a0d1a');
  R(x, w / 2 - 9 + 1, 5, 6, 1, '#ff6a7a');
  // power key
  const pxc = 17, pyc = 16;
  disc(x, pxc, pyc + 1, 7, '#07060d'); disc(x, pxc, pyc, 7, X.ink); disc(x, pxc, pyc, 6, X.redDk); disc(x, pxc, pyc - 1, 5, X.red);
  R(x, pxc - 2, pyc - 5, 2, 1, X.redLt);
  // power glyph (ring + bar)
  R(x, pxc - 2, pyc - 2, 1, 4, '#fff'); R(x, pxc + 2, pyc - 2, 1, 4, '#fff'); R(x, pxc - 1, pyc + 2, 3, 1, '#fff'); R(x, pxc, pyc - 4, 1, 4, '#fff');
  // volume keys
  for (const [yy, lab] of [[8, '+'], [21, '-']]) {
    panel(x, w - 26, yy, 18, 9, 3, { fill: '#257179', sh: '#16464c', out: X.ink, hi: '#73eff7' });
    R(x, w - 18, yy + 3, 3, 1, '#fff');
    if (lab === '+') R(x, w - 17, yy + 2, 1, 3, '#fff');
  }
  // D-pad
  const dx = w / 2 + 1, dy = 22;
  R(x, dx - 18, dy - 5, 36, 12, X.ink); R(x, dx - 6, dy - 17, 12, 36, X.ink);
  R(x, dx - 17, dy - 4, 34, 10, '#1a1d30'); R(x, dx - 5, dy - 16, 10, 34, '#1a1d30');
  R(x, dx - 17, dy - 4, 34, 8, '#5a6390'); R(x, dx - 5, dy - 16, 10, 32, '#5a6390');
  R(x, dx - 17, dy - 4, 34, 1, '#8a93c4'); R(x, dx - 5, dy - 16, 10, 1, '#8a93c4');
  // arrows
  R(x, dx - 14, dy, 1, 1, '#fff'); R(x, dx - 13, dy - 1, 1, 3, '#fff');
  R(x, dx + 13, dy, 1, 1, '#fff'); R(x, dx + 12, dy - 1, 1, 3, '#fff');
  R(x, dx, dy - 13, 1, 1, '#fff'); R(x, dx - 1, dy - 12, 3, 1, '#fff');
  R(x, dx, dy + 12, 1, 1, '#fff'); R(x, dx - 1, dy + 11, 3, 1, '#fff');
  disc(x, dx, dy, 5, X.ink); disc(x, dx, dy, 4, '#8a93c4'); disc(x, dx, dy - 1, 3, '#b8bfe6');
  // brand strip
  drawText(x, COPY.appName, 'ps', { s: 1, fill: '#566c86' }, w / 2 + 1, h - 12, 'c');
  return c;
}

function buildTV(scale) { // original little TV glyph used as the app mark
  const rows = [
    '..k.....k...',
    '...k...k....',
    '....k.k.....',
    'kkkkkkkkkkkk',
    'kwwwwwwwwwwk',
    'kwkkkkkkwwwk',
    'kwkcccckwkwk',
    'kwkcsssckwwk',
    'kwkcccckwkwk',
    'kwkkkkkkwwwk',
    'kwwwwwwwwwwk',
    'kkkkkkkkkkkk',
    '.kk......kk.',
  ];
  const s = spr(rows, { k: X.ink, w: '#ffffff', c: '#41a6f6', s: '#73eff7' });
  if (scale === 1) return s;
  const c = mk(s.width * scale, s.height * scale), x = ctxOf(c);
  x.drawImage(s, 0, 0, c.width, c.height);
  return c;
}

// Official icon, pre-scaled once to OUTPUT px (halving steps for a clean downsample) and
// masked with the app-icon rounded corners (r = 11 lo px, inside the 12-px ink outline).
const ICON_ART = 46, ICON_R = 11;
function buildIconHi() {
  const size = ICON_ART * 4;
  let src = iconImg, sw = iconImg.width, sh = iconImg.height;
  while (sw / 2 >= size * 1.5) {
    const h = document.createElement('canvas'); h.width = Math.round(sw / 2); h.height = Math.round(sh / 2);
    const hx = h.getContext('2d'); hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high';
    hx.drawImage(src, 0, 0, h.width, h.height);
    src = h; sw = h.width; sh = h.height;
  }
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.beginPath(); x.roundRect(0, 0, size, size, ICON_R * 4); x.clip();
  x.drawImage(src, 0, 0, size, size);
  return c;
}
function buildAppIcon() {
  const sz = 46, c = mk(sz + 2, sz + 5), x = ctxOf(c);
  rrect(x, 0, 3, sz + 2, sz + 2, 12, '#2a0f3f');
  rrect(x, 0, 0, sz + 2, sz + 2, 12, X.ink);
  if (iconHi) {
    // low-res stand-in of the official icon (seen only where HIRES is not painted)
    x.imageSmoothingEnabled = true;
    x.drawImage(iconHi, 1, 1, sz, sz);
    x.imageSmoothingEnabled = false;
    return c;
  }
  const g = ditherV(sz, sz, ['#ffe066', '#ffb13b', '#ff6a5a', '#ff4f9a']);
  const mask = mk(sz, sz), mx = ctxOf(mask);
  rrect(mx, 0, 0, sz, sz, 11, '#fff');
  mx.globalCompositeOperation = 'source-in'; mx.drawImage(g, 0, 0);
  x.drawImage(mask, 1, 1);
  R(x, 12, 2, sz - 22, 1, '#fff6c8');
  // TV
  const tv = { x: 9, y: 15, w: 30, h: 24 };
  R(x, tv.x + 7, tv.y - 7, 1, 1, X.ink); R(x, tv.x + 8, tv.y - 6, 1, 2, X.ink); R(x, tv.x + 9, tv.y - 4, 1, 3, X.ink);
  R(x, tv.x + 22, tv.y - 7, 1, 1, X.ink); R(x, tv.x + 21, tv.y - 6, 1, 2, X.ink); R(x, tv.x + 20, tv.y - 4, 1, 3, X.ink);
  disc(x, tv.x + 7, tv.y - 8, 1, X.ink);
  disc(x, tv.x + 22, tv.y - 8, 1, X.ink);
  panel(x, tv.x, tv.y, tv.w, tv.h, 4, { fill: '#ffffff', sh: '#c9c3e6', out: X.ink, shH: 3 });
  rrect(x, tv.x + 3, tv.y + 3, 19, 16, 3, X.ink);
  rrect(x, tv.x + 4, tv.y + 4, 17, 14, 2, '#29366f');
  // sound wave in the tube
  const hs = [2, 5, 8, 4, 7, 3];
  hs.forEach((hh, i) => R(x, tv.x + 6 + i * 2 + (i > 2 ? 1 : 0), tv.y + 11 - (hh >> 1), 1, hh, i % 2 ? '#73eff7' : '#a7f070'));
  disc(x, tv.x + 26, tv.y + 7, 1, X.ink); disc(x, tv.x + 26, tv.y + 13, 1, X.ink);
  R(x, tv.x + 4, tv.y + 4, 3, 1, '#5d7bd6');
  return c;
}


// Direction A — the reward card's window is a desert at sunset (always, also behind licensed
// art): turquoise sky in flat bands with 2-row dither seams, a low sun with retro slits, a
// far range, a lit mesa and a butte, sand bands and a two-lane road to the horizon.
const CW_HY = 58;                                   // horizon row inside the 96 x 96 window
const CARD_ROAD = false;                            // the big sign stands on open sand (no road)
function paintCardSky(iw, ih) {
  const c = mk(iw, ih), x = ctxOf(c), img = x.createImageData(iw, ih), d = new Uint32Array(img.data.buffer);
  const hy = CW_HY, vpx = 48;
  const skyB = [16, 30, 41, 50, 55], skyC = ['#1f9e9a', '#3fc9c0', '#9be3cf', '#ffd89a', '#f9a65e', '#ef7d57'].map(u32);
  const gB = [hy + 3, hy + 10, hy + 22], gC = ['#b8664a', '#d9955f', '#e6a872', '#f2c28c'].map(u32);
  const band = (B, C, j, i, seam) => {
    for (let k = 0; k < B.length; k++) {
      if (j < B[k] - seam) return C[k];
      if (j < B[k] + seam) return ((j - (B[k] - seam) + 0.5) / (2 * seam)) > bay(i, j) ? C[k + 1] : C[k];
    }
    return C[B.length];
  };
  const sun = [68, 49, 13], cHi = u32('#fff6d2'), cLo = u32('#ffd35a'), cRim = u32('#ffb13b');
  const cFar = u32('#d9806a'), cFarHi = u32('#f4ac86');
  const mLit = u32(DZ.mesa), mSh = u32(DZ.mesaSh), mMid = u32('#933d27'), mDk = u32(DZ.mesaDk), mSt = u32('#8f3a28'), mRim = u32(DZ.sunset);
  const road = [u32('#9a7e90'), u32('#6e5466'), u32(DZ.road)], cEdge = u32('#f4e2c4'), cLine = u32(DZ.roadLine);
  // mesas: [x0, x1 (flat top), top row, left foot, right foot]
  const MS = [[-6, 18, hy - 22, -10, 27], [80, 88, hy - 27, 76, 93]];
  const farH = (i) => 3 + ri(2 * Math.sin(i * 0.21) + 1.5 * Math.sin(i * 0.53 + 1));
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    let col;
    if (j < hy) {
      col = band(skyB, skyC, j, i, 1);
      const dx = i + 0.5 - sun[0], dy = j + 0.5 - sun[1], dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < sun[2]) {
        const fy = dy / sun[2];
        const gap = (fy > 0.2 && fy < 0.3) || (fy > 0.45 && fy < 0.57) || (fy > 0.7 && fy < 0.85);
        if (!gap) col = dd > sun[2] - 1.2 ? cRim : fy < -0.1 ? cHi : cLo;
      }
      const fh = farH(i);
      if (j >= hy - fh) col = j === hy - fh ? cFarHi : cFar;
      for (const [a, b, top, fl, fr] of MS) {
        let tp = 1e9, face = -1;
        if (i >= a && i <= b) { tp = top; face = 1; }
        else if (i >= fl && i < a) { tp = top + ri((a - i) * (hy - top) / (a - fl + 1)); face = 0; }
        else if (i > b && i <= fr) { tp = top + ri((i - b) * (hy - top) / (fr - b + 1)); face = 2; }
        if (j < tp) continue;
        if (j >= hy - 2) col = mDk;
        else if (j === tp && face === 1) col = mRim;
        else if (face === 1) col = (j - top) % 7 === 4 ? mSt : (i < a + 3 ? mMid : mLit);
        else col = face === 0 ? mMid : mSh;
      }
    } else {
      col = band(gB, gC, j, i, 1);
      const yw = j + 0.5 - hy, hw = 0.8 * yw, ax = Math.abs(i + 0.5 - vpx);
      if (CARD_ROAD && ax < hw) {
        col = yw < 4 ? road[0] : yw < 10 ? road[1] : road[2];
        if (yw > 5 && ax >= hw - 1) col = cEdge;
        else if (yw > 3 && ax < 0.6 + yw * 0.02 && ((120 / yw) % 3) < 1.3) col = cLine;
      }
    }
    d[j * iw + i] = col;
  }
  x.putImageData(img, 0, 0);
  // a few rocks and dry shrubs on the sand (seeded), off the road
  const rng = mulberry32(606);
  for (let k = 0; k < 10; k++) {
    const j = hy + 4 + ri(rng() * (ih - hy - 6)), i = ri(rng() * iw);
    if (Math.abs(i + 0.5 - vpx) < 0.8 * (j - hy) + 3) continue;
    if (rng() < 0.6) { R(x, i, j, 3, 1, '#7a4a30'); R(x, i, j - 1, 2, 1, DZ.sandDk); }
    else { R(x, i, j, 1, 1, '#5c7430'); R(x, i - 1, j - 1, 1, 1, '#8aa04a'); R(x, i + 1, j - 1, 1, 1, '#8aa04a'); }
  }
  return c;
}
// ORIGINAL placeholder art (licensed-art slot: assets/character.png replaces it), one bold
// focal icon that reads at feed-thumbnail size as "desert sign + dust": a BIG 45-degree yellow
// "dust" road sign (~47% of the window) whose pictogram is an OUTLINED cream 3-lobe cloud with
// three speed dashes (no dark fill, no pointed end, nothing inside the outline), a real dust
// cloud at its foot, a saguaro on the right; A's sunset sky, slit sun and mesas behind.
// No character, no bird shape, no brand, no lettering.
function diamondFill(x, cx, cy, a, col) { for (let dy = -a; dy <= a; dy++) { const hw = a - Math.abs(dy); R(x, cx - hw, cy + dy, 2 * hw + 1, 1, col); } }
function cardSign(x, cx, cy, a, base) {
  // post (behind the sign): ink rim, light left edge, shaded right edge; a sand mound at its foot
  R(x, cx - 3, cy + a - 4, 7, base - cy - a + 5, X.ink);
  R(x, cx - 2, cy + a - 4, 5, base - cy - a + 4, '#94b0c2'); R(x, cx - 2, cy + a - 4, 1, base - cy - a + 4, '#f4f4f4'); R(x, cx + 2, cy + a - 4, 1, base - cy - a + 4, '#566c86');
  for (let k = -8; k <= 8; k++) R(x, cx + k, base - (Math.abs(k) < 4 ? 2 : Math.abs(k) < 7 ? 1 : 0), 1, 3, DZ.sandSh);
  // the plate: warm drop shadow, ink rim, lit-top / shaded-bottom yellow face, inner ink border
  diamondFill(x, cx + 2, cy + 3, a + 1, '#7a2f22');
  diamondFill(x, cx, cy, a + 1, X.ink);
  for (let dy = -a; dy <= a; dy++) {
    const hw = a - Math.abs(dy);
    R(x, cx - hw, cy + dy, 2 * hw + 1, 1, dy < -a + 7 ? '#ffe98a' : dy > a - 6 ? '#f0b73a' : '#ffd84a');
    const hi = a - 3 - Math.abs(dy);
    if (hi >= 0) { R(x, cx - hi, cy + dy, 1, 1, X.ink); R(x, cx + hi, cy + dy, 1, 1, X.ink); }
  }
  R(x, cx - 1, cy - a + 5, 2, 2, '#b86b12'); R(x, cx - 1, cy + a - 6, 2, 2, '#b86b12');   // bolts
  // pictogram: an outlined cream cloud ONLY (three round lobes on a flat base, centred on the
  // plate), with no dark motion cue: the speed lives in the white lines behind the real dust
  // pile at the post's foot, outside the sign
  const lobes = [[cx - 6, cy + 2, 4], [cx, cy - 2, 5], [cx + 6, cy + 2, 4]], by = cy + 5;
  x.save(); x.beginPath(); x.rect(cx - 30, cy - 30, 60, by + 2 - (cy - 30)); x.clip();
  for (const [lx, ly, r] of lobes) disc(x, lx, ly, r + 1, X.ink);
  R(x, cx - 10, by + 1, 21, 1, X.ink);
  x.restore();
  x.save(); x.beginPath(); x.rect(cx - 30, cy - 30, 60, by + 1 - (cy - 30)); x.clip();
  for (const [lx, ly, r] of lobes) disc(x, lx, ly, r, DZ.dust);
  R(x, cx - 9, cy + 2, 19, by - cy - 1, DZ.dust);
  x.restore();
}
function drawCardArt(x, ix, iy, iw, ih) {
  x.save(); x.beginPath(); x.rect(ix, iy, iw, ih); x.clip(); x.translate(ix, iy);
  saguaro(x, 84, 89, 30);
  cardSign(x, 40, 35, 22, 88);
  // the dust cloud at the sign's foot, speed lines behind it (left edge, never over the cactus)
  const gy = 89;
  for (const [yy, len, th] of [[74, 9, 2], [79, 6, 1], [84, 10, 2]]) { R(x, 0, yy + 1, len, 1, '#a07a5a'); R(x, 0, yy, len, th, '#ffffff'); }
  billow(x, [[6, 86, 4, true], [13, 82, 6, true], [22, 80, 7, true], [30, 85, 5, false]], { clipY: gy, sheen: [[16, 76, 4]] });
  R(x, 2, gy, 32, 1, DZ.sandDk);
  x.restore();
}

function buildCard() {
  const { w, h } = CARD, c = mk(w + 2, h + 6), x = ctxOf(c);
  rrect(x, 0, 4, w + 2, h + 2, 8, '#0e3d24');
  rrect(x, 0, 0, w + 2, h + 2, 8, X.ink);
  rrect(x, 1, 1, w, h, 7, X.goldDk);
  rrect(x, 1, 1, w, h - 2, 7, X.gold);
  R(x, 8, 2, w - 14, 1, X.cream); R(x, 2, 8, 1, h - 16, X.cream);
  R(x, 7, h - 5, w - 12, 1, '#e39a1c');
  // inner window
  const ix = 7, iy = 7, iw = w - 12, ih = h - 12;
  rrect(x, ix - 1, iy - 1, iw + 2, ih + 2, 4, X.ink);
  // desert sunset window (Direction A), behind the licensed art too
  x.drawImage(paintCardSky(iw, ih), ix, iy);
  rrect(x, ix, iy, 3, 3, 0, X.ink);
  // rivets
  for (const [a, b] of [[4, 4], [w - 3, 4], [4, h - 5], [w - 3, h - 5]]) { R(x, a - 1, b - 1, 3, 3, X.goldDk); R(x, a - 1, b - 1, 2, 2, X.cream); }
  // character (override or placeholder)
  if (charImg) {
    const sw = charImg.width, sh = charImg.height;
    let sc = Math.min(iw / sw, ih / sh);
    if (sc >= 1) sc = Math.floor(sc);
    const dw = Math.max(1, Math.round(sw * sc)), dh = Math.max(1, Math.round(sh * sc));
    x.imageSmoothingEnabled = false;
    x.drawImage(charImg, ix + Math.floor((iw - dw) / 2), iy + Math.floor((ih - dh) / 2), dw, dh);
  } else {
    // TEMPORARY original placeholder (see drawCardArt): the dust-crossing sign + the dust cloud
    drawCardArt(x, ix, iy, iw, ih);
  }
  return c;
}

// The card's label is the player's ANSWER, set in the same blue slot tiles as scene 2
// (not a character nameplate): the placeholder art is never presented AS the brand.
// Tiles are 11 wide; with an accented letter in the answer they grow from 13 to 15 rows so
// the accent sits clear of the tile's top light (row 0), and all letters share one cap line.
function buildAnswerTiles(text) {
  const chars = [...text], n = chars.length, tw = 11, gap = 1;
  const up = Math.max(0, ...chars.map(glyphUp)), dn = Math.max(0, ...chars.map(glyphDown));
  const capY = 2 + up, th = capY + 8 + (up ? 2 : 3) + dn;
  const w = n * (tw + gap) - gap + 4, h = th + 5, c = mk(w, h + 2), x = ctxOf(c);
  rrect(x, 0, 2, w, h, 4, '#07331c');
  rrect(x, 0, 0, w, h, 4, X.ink);
  const opt = { s: 1, fill: '#ffffff', ext: { d: 1, c: X.ink, dx: 0 } };
  for (let i = 0; i < n; i++) {
    const tx = 2 + i * (tw + gap), ty = 2;
    rrect(x, tx, ty, tw, th, 2, '#29366f');
    rrect(x, tx, ty, tw, th - 1, 2, '#3b5dc9');
    R(x, tx + 2, ty, tw - 4, 1, '#6f8cff');
    // centred on the ink box (the old +1 bias pushed 7-px letters onto the right edge)
    const iw = textSprite(chars[i], 'ps', opt).inkW;
    drawText(x, chars[i], 'ps', opt, tx + ((tw - iw) >> 1), ty + capY, 'l');
  }
  return c;
}

function buildDownloadIcon(col = '#ffffff') {
  return spr([
    '...kkk...',
    '...kwk...',
    '...kwk...',
    '.kkkwkkk.',
    '.kwwwwwk.',
    '..kwwwk..',
    'k..kwk..k',
    'kk..k..kk',
    'kwkkkkkwk',
    'kwwwwwwwk',
    'kkkkkkkkk',
  ], { k: X.ink, w: col });
}
function buildPhoneIcon(col) {
  return spr([
    '.kkkkkkk.',
    'kwwwwwwwk',
    'kwwkkkwwk',
    'kwcccccwk',
    'kwcccccwk',
    'kwcccccwk',
    'kwcccccwk',
    'kwcccccwk',
    'kwcccccwk',
    'kwwwwwwwk',
    'kwwwkwwwk',
    'kwwwwwwwk',
    '.kkkkkkk.',
  ], { k: X.ink, w: '#ffffff', c: col });
}
// Store-pill glyphs, sized to the 15-px label caps: generic, deliberately NOT store badges.
function buildStoreDownload() {
  return spr([
    '....kkkk....',
    '....klgk....',
    '....klgk....',
    '....klgk....',
    '.kkkklgkkkk.',
    '.klllllgggk.',
    '..klllgggk..',
    '...klggdk...',
    '....kgdk....',
    'kk...kk...kk',
    'klk......kgk',
    'klkkkkkkkkgk',
    'klllggggggdk',
    'kkkkkkkkkkkk',
  ], { k: '#0b0a14', l: '#d8ffb8', g: '#a7f070', d: '#38b764' });
}
function buildStorePhone() {
  return spr([
    '.kkkkkkkkk.',
    'kwwwwwwwwwk',
    'kwwwkkkwwwk',
    'kwcccccccsk',
    'kwclcccccsk',
    'kwclcccccsk',
    'kwcccccccsk',
    'kwcccccccsk',
    'kwcccccccsk',
    'kwcccccccsk',
    'kwwwwwwwwsk',
    'kwwwwkwwwsk',
    'kssssssssk.',
    '.kkkkkkkk..',
  ], { k: '#0b0a14', w: '#f4f4f4', s: '#94b0c2', c: '#41a6f6', l: '#73eff7' });
}
function buildCoin(phase) { // 12x12 spinning coin frames
  const c = mk(14, 14), x = ctxOf(c);
  const wv = [12, 10, 6, 2, 6, 10][phase];
  const cx = 7, r = 6;
  for (let j = -r; j <= r; j++) {
    const hw = Math.floor(Math.sqrt((r + 0.5) ** 2 - j * j) * (wv / 12));
    R(x, cx - hw - 1, 7 + j, 2 * hw + 3, 1, X.ink);
  }
  R(x, cx - 1, 0, 3, 14, X.ink);
  for (let j = -r + 1; j <= r - 1; j++) {
    const hw = Math.floor(Math.sqrt((r - 0.5) ** 2 - j * j) * (wv / 12));
    R(x, cx - hw, 7 + j, 2 * hw + 1, 1, j > 2 ? '#e39a1c' : X.gold);
  }
  if (wv >= 6) { R(x, cx - 1, 4, 2, 6, '#e39a1c'); R(x, cx - 1, 4, 1, 6, X.cream); }
  R(x, cx - Math.floor(wv / 4), 2, 1, 2, '#ffffff');
  return c;
}

// Floating background icons (scene 2 / 4)
function buildFloaters() {
  const star = spr(['..w..', '..w..', 'wwwww', '.www.', '.w.w.'], { w: '#ffffff' });
  const heart = spr(['.ww.ww.', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...'], { w: '#ffffff' });
  const plus = spr(['..w..', '..w..', 'wwwww', '..w..', '..w..'], { w: '#ffffff' });
  const diamond = spr(['..w..', '.www.', 'wwwww', '.www.', '..w..'], { w: '#ffffff' });
  const note = spr(['..www', '..w.w', '..w.w', 'www.w', 'www..', '.w...'].map((r) => r), { w: '#ffffff' });
  return [star, heart, plus, diamond, note];
}
function tint(src, col) {
  const c = mk(src.width, src.height), x = ctxOf(c);
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; R(x, 0, 0, c.width, c.height, col);
  return c;
}

// ---------------------------------------------------------------------------------------
// Background renderers (write into BG32 then putImageData)
let VIGN, RAYT = new Map();
function rayTable(cx, cy) {
  const k = cx + ',' + cy;
  let t = RAYT.get(k);
  if (t) return t;
  const ang = new Float32Array(LW * LH), dist = new Float32Array(LW * LH), dist2 = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    ang[y * LW + x] = Math.atan2(dy, dx);
    dist[y * LW + x] = Math.sqrt(dx * dx + dy * dy);
    // distance of the pixel's 2x2 cell centre (glow / fade thresholds are taken per cell)
    const ex = (x & ~1) + 1 - cx, ey = (y & ~1) + 1 - cy;
    dist2[y * LW + x] = Math.sqrt(ex * ex + ey * ey);
  }
  t = { ang, dist, dist2 };
  RAYT.set(k, t);
  return t;
}
function bgRays(cx, cy, n, rot, colA, colB, glow, fade, flat) {
  // glow: [{r, col}] sorted by radius (inner colors), fade: {r0, r1, cols:[...]} outer darkening
  // flat: {y0, col} — from row y0 down, one FLAT colour (no Bayer checker under small type),
  // joined to the fade above by a 2-row ordered-dither seam
  const { ang, dist2 } = rayTable(cx, cy);
  const A = colA.map ? colA : [colA], uA = u32(colA), uB = u32(colB);
  void A;
  const uG = glow ? glow.map((g) => ({ r: g.r, c: u32(g.col) })) : [];
  const uF = fade ? fade.cols.map(u32) : [], uFlat = flat ? u32(flat.col) : 0;
  const k = n / (2 * Math.PI);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    // glow and fade thresholds on 2x2-lo cells (8 output px: Bayer and distance both per cell,
    // so a cell never splits into loose pixels): no fine 1-lo checker bands for a feed
    // re-encode to smear; the flat strip's 2-row seam keeps the 1-lo cells
    const i = y * LW + x, b = bay(x >> 1, y >> 1), b1 = bay(x, y);
    const d = dist2[i];
    let col = ((Math.floor((ang[i] + rot) * k + 1000) & 1) ? uA : uB);
    for (let g = 0; g < uG.length; g++) {
      const gr = uG[g].r;
      if (d < gr * (0.75 + 0.5 * b)) { col = uG[g].c; break; }
    }
    if (fade && d > fade.r0) {
      const f = (d - fade.r0) / (fade.r1 - fade.r0) * uF.length + (b - 0.5);
      const fi = Math.floor(f);
      if (fi >= 0) col = uF[Math.min(uF.length - 1, fi)];
    }
    if (flat && y >= flat.y0 - 2 && (y >= flat.y0 || (y - flat.y0 + 2.5) / 4 + 0.25 > b1)) col = uFlat;
    BG32[i] = col;
  }
}
function putBG() { L.putImageData(bgImg, 0, 0); }

// Scene 2 background: diagonal poster stripes over a dithered gradient
let S2ROWS = null;
// Direction A: a desert-sunset poster instead of the base's pink-purple stripes — turquoise
// sky at the top, glow, sunset orange, terracotta, rust and dusk plum at the bottom, in FLAT
// bands with 2-row ordered-dither seams only (compression-friendly), two tints per band for
// the diagonal stripes.
const S2_BANDS = [
  [0, '#1f9e9a', '#2ab3ac'], [44, '#3fc9c0', '#58d6cb'], [92, '#9be3cf', '#b4ecd9'],
  [132, '#ffd89a', '#ffe6b6'], [176, '#f9a65e', '#ffba78'], [226, '#ef7d57', '#f8946c'],
  [282, '#c8553d', '#d86a50'], [346, '#9c3b2b', '#ae4a37'], [410, '#5e2438', '#6e2c44'],
];
function buildS2Rows() {
  const mkRow = (ci) => {
    const u = S2_BANDS.map((b) => u32(b[ci])), rows = [];
    for (let y = 0; y < LH; y++) {
      let k = 0;
      while (k + 1 < S2_BANDS.length && y >= S2_BANDS[k + 1][0]) k++;
      const r4 = [];
      for (let x = 0; x < 4; x++) {
        let c = u[k];
        const nb = k + 1 < S2_BANDS.length ? S2_BANDS[k + 1][0] : 1e9;
        if (y >= nb - 2) c = ((y - (nb - 2) + 0.5) / 4 + 0.25) > bay(x, y) ? u[k + 1] : u[k];
        else if (k > 0 && y < S2_BANDS[k][0] + 2) c = ((y - S2_BANDS[k][0] + 2.5) / 4 + 0.25) > bay(x, y) ? u[k] : u[k - 1];
        r4.push(c);
      }
      rows.push(r4);
    }
    return rows;
  };
  S2ROWS = [mkRow(1), mkRow(2)];
  // poster decor, static over the moving stripes: a big low sun with retro slits in the top-left
  // corner (peeks round the phone) and a row of dusk-plum mesa silhouettes along the bottom
  // (seen while the phone rises in). 0 = no decor.
  S2DECO = new Uint32Array(LW * LH);
  const sunC = [22, 40], sunR = 34, cHi = u32('#fff3c4'), cLo = u32('#ffcd75'), cRim = u32('#ffb13b');
  const mesaTop = (x) => {
    const m = [[-10, 60, 404], [48, 104, 420], [96, 118, 392], [150, 212, 412], [200, 236, 398], [236, 290, 416]];
    let top = 446;
    for (const [a, b, y] of m) {
      const slope = 7;
      if (x >= a - slope && x <= b + slope) top = Math.min(top, x < a ? y + (a - x) * 3 : x > b ? y + (x - b) * 3 : y);
    }
    return top;
  };
  const cM = u32('#3a1530'), cMr = u32('#5a2238'), cMd = u32('#26101f');
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = y * LW + x, dx = x + 0.5 - sunC[0], dy = y + 0.5 - sunC[1], dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < sunR) {
      const fy = dy / sunR;
      const gap = (fy > 0.22 && fy < 0.3) || (fy > 0.44 && fy < 0.54) || (fy > 0.66 && fy < 0.8);
      if (!gap) S2DECO[i] = dd > sunR - 1.5 ? cRim : fy < -0.1 ? cHi : cLo;
    }
    const mt = mesaTop(x);
    if (y >= mt) S2DECO[i] = y === mt ? cMr : y > 452 ? cMd : cM;
  }
}
let S2DECO = null;
function bgScene2(t) {
  const off = frameOf(t) >> 1; // one lo px every other frame: a steady 15 px/s, no limp
  for (let y = 0; y < LH; y++) {
    const ra = S2ROWS[0][y], rb = S2ROWS[1][y];
    for (let x = 0; x < LW; x++) {
      const i = y * LW + x, dc = S2DECO[i];
      if (dc) { BG32[i] = dc; continue; }
      const s = (Math.floor((x + y + off) / 20) & 1);
      BG32[i] = (s ? rb : ra)[x & 3];
    }
  }
}

// ---------------------------------------------------------------------------------------
// Scene 1 — hook
function frameOf(t) { return Math.floor(t * FPS + 1e-6); }
// First frame on which a cue is visible (cues off the 30 fps grid round UP), so
// "frames since cue" is 0 on the first rendered frame of every cue.
function firstFrame(cue) { return Math.ceil(cue * FPS - 1e-6); }
function sinceCue(t, cue) { return frameOf(t) - firstFrame(cue); }
// Key presses (CUES.keyTimes, CUES.enter) fall between frames: they snap to the NEAREST frame
// instead (ties go to the earlier one), so the picture never trails the blip by more than
// ~8 ms and never leads it by more than one half frame (16.7 ms).
function keyFrame(cue) { return Math.ceil(cue * FPS - 0.5 - 1e-6); }
function sinceKey(t, cue) { return frameOf(t) - keyFrame(cue); }
// The two horn bips (beep1 1.25 s, beep2 1.375 s) sit between frames too: their picture snaps
// to the NEAREST frame like the key presses (f37 / f41), never 17-25 ms after the horn.
function sinceBeep(t, cue) { return sinceKey(t, cue); }
function holdBeep(t, cue, n) { const s = sinceBeep(t, cue); return s >= 0 && s < n; }
// The fall's two cues sit between frames as well (fallStart = dashEnd 1.75 = f52.5, fallEnd 2.3125
// = f69.375): the whip and the 2x snap/hold snap to the NEAREST frame too (f52 / f69), so the
// picture leads the whistle's start (and the dust gust) by 16.7 ms and its hard stop by 12.5 ms,
// instead of trailing them by 16.7 / 20.8 ms. The fall keeps its 17 frames.
const FALL_F0 = keyFrame(CUES.fallStart), FALL_F1 = keyFrame(CUES.fallEnd);

function bgScene1(t, f) {
  const black = u32rgb(0, 0, 0);
  if (t < CUES.powerOn) {
    // visible analog snow (~11 % of pixels, new every frame) + a slow rolling bar
    const roll = (f * 7) % (LH + 60) - 30;
    for (let y = 0; y < LH; y++) {
      const band = Math.abs(y - roll) < 18 ? 1.7 : 1;
      for (let x = 0; x < LW; x++) {
        const i = y * LW + x;
        const pr = 0.12 * band * (1 - 0.55 * VIGN[i]);
        const h = hash3(x, y, f * 131 + 7);
        if (h < pr) { const g = 34 + Math.floor(hash3(y, x, f + 999) * (band > 1 ? 120 : 92)); BG32[i] = u32rgb(g, g, g + 6); }
        else BG32[i] = black;
      }
    }
    return;
  }
  BG32.set(S.bg1);
}

function drawAppBar(ctx, x, y, w) {
  R(ctx, x, y, w, 16, X.pink);
  R(ctx, x, y + 15, w, 1, X.pinkDk);
  R(ctx, x, y + 16, w, 1, X.ink);
  ctx.drawImage(S.tv1, x + 5, y + 2);
  drawText(ctx, COPY.appName, 'ps', { s: 1, fill: '#ffffff', ext: { d: 1, c: X.pinkDk, dx: 0 } }, x + w / 2 + 2, y + 5, 'c');
  // three dots menu
  for (let k = 0; k < 3; k++) R(ctx, x + w - 8, y + 4 + k * 3, 2, 2, '#ffffff');
}
function drawWave(ctx, cx, cy, n, t, amp, pulse) {
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const fall = 1 - Math.abs(i - mid) / (mid + 1.5);
    const a = Math.abs(Math.sin(t * 9 + i * 0.9)) * (0.6 + 0.4 * Math.sin(t * 23 + i * 2.1));
    const h = Math.max(1, Math.round(2 + (amp * (0.35 + 0.65 * a) + pulse * 6) * fall));
    const x = ri(cx + (i - mid) * 3) - 1;
    R(ctx, x - 1, cy - h - 1, 4, 2 * h + 3, X.ink);
    R(ctx, x, cy - h, 2, 2 * h + 1, pulse > 0.5 ? X.fY : '#73eff7');
    R(ctx, x, cy - h, 2, 1, '#ffffff');
  }
}

// Scene-1 listening wave, driven by the sound cues (timeline.js): an idle hum, a full yellow
// pulse held 3 frames on each "bip" (beep1, beep2: two separate hits, one dark frame between),
// a swell under the dash, a slow decay under the falling whistle, flat through the pause,
// one small kick on the distant puff.
function waveS1(t) {
  const hold = (cue, n) => { const s = sinceCue(t, cue); return s >= 0 && s < n; };
  let amp = 2.5, pulse = 0;
  if (holdBeep(t, CUES.beep1, 3) || holdBeep(t, CUES.beep2, 3)) pulse = 1;
  if (t >= CUES.dashStart && t < CUES.dashEnd) amp = 5;
  else if (t >= CUES.fallStart && t < CUES.fallEnd) amp = lerp(4, 1, prog(t, CUES.fallStart, CUES.fallEnd));
  else if (t >= CUES.fallEnd && t < CUES.puff) amp = 0.5;
  if (hold(CUES.puff, 3)) { amp = 2; pulse = 0.5; }
  return { amp, pulse };
}
// "CH19 · DESENHOS": the app's TV-channel metaphor, a small dark chip under the app bar
// (gold channel number, pink dot, white channel name; 114 x 11 px with this copy).
function drawChannelChip(ctx, cx, y) {
  const w1 = textWidth(COPY.channel, 'ps'), w2 = textWidth(COPY.channelName, 'ps');
  const pad = 5, sep = 4, w = pad + w1 + sep + 2 + sep + w2 + pad, h = 11;
  const x = ri(cx - w / 2);
  panel(ctx, x, y, w, h, 4, { fill: '#1d1850', out: X.ink, ext: 1, extC: '#0b0717' });
  R(ctx, x + 4, y, w - 8, 1, '#3b3490');
  drawText(ctx, COPY.channel, 'ps', { s: 1, fill: X.gold }, x + pad, y + 2, 'l');
  R(ctx, x + pad + w1 + sep, y + 4, 2, 2, X.pinkLt);
  drawText(ctx, COPY.channelName, 'ps', { s: 1, fill: '#ffffff' }, x + pad + w1 + sep + 2 + sep, y + 2, 'l');
}
// The EMPTY scene window (stand-in): a framed neutral panel where the art directors paint
// the title's scene (desert road, the dash, the fall, the puff). Nothing is drawn in it yet.
function drawSceneWindow(ctx) {
  rrect(ctx, WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4, 4, X.ink);
  rrect(ctx, WIN.x - 1, WIN.y - 1, WIN.w + 2, WIN.h + 2, 3, '#4a3f9a');
  R(ctx, WIN.x + 2, WIN.y - 1, WIN.w - 4, 1, '#7a6fd0');
  ctx.drawImage(S.win, WIN.x, WIN.y);
}
function drawApp1(ctx, t) {
  ctx.drawImage(S.scr1, SC1.x, SC1.y);
  drawAppBar(ctx, SC1.x, SC1.y, SC1.w);
  drawChannelChip(ctx, CX, S1.chipY);
  // prompt (the acute of the É sits 3 rows over the cap line, clear of the chip)
  drawText(ctx, COPY.quizPrompt, 'ps', { s: 1, fill: [X.cream, X.gold], ext: { d: 1, c: X.ink } }, CX, S1.promptY, 'c');
  // listening wave (<= 11 px half-height: 94..118, between the prompt and the window)
  const wv = waveS1(t);
  drawWave(ctx, CX, S1.waveY, 17, t, wv.amp, wv.pulse);
  drawSceneWindow(ctx);
  // bottom UI: round timer + lives (kept high enough that the caption box never clips it)
  const aw = WIN.w, ty = S1.hudY;
  const left = 1 - 0.4 * prog(t, CUES.appReady, 3.0);
  R(ctx, WIN.x - 1, ty - 1, aw + 2, 8, X.ink);
  R(ctx, WIN.x, ty, aw, 6, '#141233');
  R(ctx, WIN.x, ty, ri(aw * left), 6, left > 0.7 ? '#a7f070' : X.gold);
  R(ctx, WIN.x, ty, ri(aw * left), 1, '#ffffff');
  for (let k = 0; k < 3; k++) ctx.drawImage(S.heart, WIN.x + k * 11, ty + 10);
  ctx.drawImage(S.coins[Math.floor(t * 10) % 6], WIN.x + aw - 14, ty + 7);
}
// Clustered 3-tone smoke puff (solid pixels, dark rim on the lower edge): survives the
// integer push-in zoom without turning into a checkerboard mesh.
const PUFF_LOBES = [[-0.6, 0.12, 0.58], [0.6, 0.16, 0.56], [0, 0.2, 0.72], [-0.2, -0.32, 0.7], [0.32, -0.26, 0.6]];
function smokePuff(ctx, x, y, r) {
  if (r < 2) return;
  for (const [a, b, s] of PUFF_LOBES) disc(ctx, x + a * r, y + b * r + 1, Math.max(1, ri(r * s)), '#7a7598');
  for (const [a, b, s] of PUFF_LOBES) disc(ctx, x + a * r, y + b * r, Math.max(1, ri(r * s)), '#b8b4d4');
  for (const [a, b, s] of PUFF_LOBES) if (ri(r * s) >= 3) disc(ctx, x + a * r - 1, y + b * r - 1, ri(r * s) - 2, '#e9e6f5');
}
// row insets of a rounded rect (same rule as rrect)
function rrIns(i, h, r) {
  const dy = i < r ? r - i - 0.5 : i >= h - r ? i - (h - r) + 0.5 : 0;
  return dy > 0 ? r - Math.round(Math.sqrt(r * r - dy * dy)) : 0;
}
function speakerPlate(ctx, x, y, w, h, r, f) {
  const R2 = r + 2;
  for (let j = 0; j < h + 4; j++) for (let i = 0; i < w + 4; i++) {
    const ins2 = rrIns(j, h + 4, R2);
    if (i < ins2 || i >= w + 4 - ins2) continue;                           // outside the ring
    const jj = j - 2, ii = i - 2;
    const inner = jj >= 0 && jj < h && ii >= rrIns(jj, h, r) && ii < w - rrIns(jj, h, r);
    if (inner || hash3(x + ii, y + jj, f * 29 + 3) < 0.5) R(ctx, x + ii, y + jj, 1, 1, '#000000');
  }
}
// "Sound on" hint over the static: a pixel speaker whose waves pulse out one by one.
// Drawn natively at ~3x the old glyph (about 66 x 52 lo = 264 x 208 output px), centred in
// SAFE, so it survives the 216-px feed thumbnail; the screen itself stays black.
const HINT_STATIC = ['#10121c', '#2a2d3e', '#6a6f8c', '#c9cce0'];
function drawSpeakerHint(ctx, f) {
  const cxS = ri((SAFE_L.x0 + SAFE_L.x1) / 2), cyS = ri((SAFE_L.y0 + SAFE_L.y1) / 2);
  // the brand on frame 0 (the autoplay preview): the end card's app icon, 1x sprite (48 lo
  // = 192 output px), centred on the SAFE axis above the speaker, with the static running
  // inside its TV's screen; a black margin keeps its silhouette clean over the snow
  const icon = S.appIcon, gap = 6, groupH = icon.height + gap + 63;
  const ix = cxS - (icon.width >> 1), iy = cyS - (groupH >> 1);
  rrect(ctx, ix - 3, iy - 3, icon.width + 6, icon.height + 5, 14, '#000000');
  if (logoImg) {
    // licensed logo override (as on the end card): integer scale into the icon's box
    let sc = Math.min(icon.width / logoImg.width, icon.height / logoImg.height);
    if (sc >= 1) sc = Math.floor(sc);
    const dw = ri(logoImg.width * sc), dh = ri(logoImg.height * sc);
    ctx.drawImage(logoImg, ri(cxS - dw / 2), ri(iy + (icon.height - dh) / 2), dw, dh);
  } else ctx.drawImage(icon, ix, iy);
  // the official icon is shown as is (no static painted into its screen)
  if (iconHi && !logoImg) HIRES.push({ c: iconHi, x: ix + 1, y: iy + 1, w: ICON_ART, h: ICON_ART, r: ICON_R });
  else if (!logoImg) for (let j = 0; j < 14; j++) for (let i = 0; i < 17; i++) { // the tube: x 13..29, y 19..32
    if ((i === 0 || i === 16) && (j === 0 || j === 13)) continue;  // its rounded corners
    const h = hash3(i + 400, j + 400, f * 131 + 7);
    R(ctx, ix + 13 + i, iy + 19 + j, 1, 1, HINT_STATIC[h < 0.4 ? 0 : h < 0.65 ? 1 : h < 0.85 ? 2 : 3]);
  }
  const ox = cxS - 30, cy = iy + icon.height + gap + 31; // ox = left of the magnet box
  const body = '#c9cce0', lt = '#f4f4f4', dk = '#6a6f8c';
  // clear plate over the snow: rounded like the icon's margin, and the snow thins to half in a
  // 2-lo ring round it so its edge feathers instead of cutting a hard black box
  speakerPlate(ctx, ox - 5, cy - 31, 70, 63, 10, f);
  // magnet box 10 x 16
  R(ctx, ox, cy - 8, 10, 16, body); R(ctx, ox, cy - 8, 10, 2, lt); R(ctx, ox, cy + 6, 10, 2, dk);
  // cone: widens from 16 to 40 px tall over 13 px
  for (let c = 0; c < 13; c++) {
    const hh = 8 + ri(c * 12 / 12);
    R(ctx, ox + 10 + c, cy - hh, 1, 2 * hh, body);
    R(ctx, ox + 10 + c, cy - hh, 1, 2, lt);
    R(ctx, ox + 10 + c, cy + hh - 2, 1, 2, dk);
  }
  R(ctx, ox + 23, cy - 20, 2, 40, lt);              // rim of the cone
  // waves step out one by one (every 5 frames); the newest one is white, and the OUTER arc
  // crackles white on noisy frames like the static under it
  const step = Math.floor(f / 5) % 4;
  const ax = ox + 22;
  [12, 23, 34].forEach((rr, i) => {
    if (i >= step) return;
    const crackle = i === 2 && hash3(f, 5, 31) < 0.45;
    const col = i === step - 1 || crackle ? '#ffffff' : '#8a8fa8';
    for (let a = -0.85; a <= 0.8501; a += 0.4 / rr) {
      const px = ri(ax + Math.cos(a) * rr), py = ri(cy + Math.sin(a) * rr);
      R(ctx, px, py - 1, 3, 3, col);
    }
  });
}

// =======================================================================================
// DIRECTION A — the desert WORLD (scene 1). One parametric painter draws the same world at
// any scale on the native lo-res grid: 0.4x inside the app's scene window, 1x full frame.
// World units = hero-shot lo px, measured from the vanishing point (y < 0 = above the
// horizon). The 2x snap zoom of the phone puts the window's vanishing point exactly on the
// hero's, so the cut on beep2 reads as one continuous camera move (0.4 -> 0.8 -> 1.0).
const DZ = DESERT;
const VP1 = { x: 135, y: 196 };                   // hero shot: vanishing point (lo px)
const WIN_S = 0.4;                                 // the app window shows the world at 0.4x
const WIN_VP = { x: WIN.w >> 1, y: 66 };           // ...its vanishing point (window px)
const ROAD_K = 0.8;                                // road half-width per px below the horizon
// sky: flat bands, 2-row ordered-dither seams only (compression-friendly, no full-screen mesh)
const SKY_A = [[-170, DZ.skyHi], [-128, DZ.sky], [-92, DZ.skyLo], [-62, DZ.glow], [-36, '#f9a65e'], [-14, DZ.sunset], [1e9, DZ.terracotta]];
const GROUND_A = [[3, '#b8664a'], [10, DZ.sandSh], [30, '#e6a872'], [1e9, DZ.sand]];
// near mesas: flat top x0..x1 at `top`, cliffs down to a shoulder (shH) at shL/shR, talus to
// the ground at bL/bR. Painted in this order (the tall butte stands in front).
const MESAS = [
  { x0: -196, x1: -106, top: 84, shL: -206, shR: -98, shH: 32, bL: -236, bR: -72 },
  { x0: -56, x1: -46, top: 46, shL: -60, shR: -42, shH: 18, bL: -74, bR: -30 },
  { x0: 126, x1: 214, top: 58, shL: 118, shR: 222, shH: 22, bL: 100, bR: 252 },
  { x0: 78, x1: 94, top: 104, shL: 72, shR: 100, shH: 38, bL: 58, bR: 116 },
];
const FAR_A = [[-400, 10], [-262, 10], [-256, 22], [-150, 22], [-144, 13], [-40, 13], [-30, 19], [24, 19], [34, 12], [146, 12], [154, 30], [262, 30], [270, 12], [400, 12]];
// road tone by depth: a pale lilac mirage at the horizon, darkening toward the camera
const ROAD_A = [[3.5, '#a08494'], [12, '#7c6072'], [40, '#5e4858'], [1e9, DZ.road]];
// saguaros [x, depth below horizon, height] (world); the first one is the hero foreground
// cactus, painted on its own layer so the dust cloud passes BEHIND it
const CACTI = [[-124, 126, 116], [118, 44, 48], [-70, 12, 15], [42, 5, 8], [-36, 26, 20], [-168, 64, 56], [172, 118, 96]];
const SIGN = { x: 80, dw: 86, post: 34, a: 12 };   // roadside warning sign (world)
const CLOUD_DW = 100;                              // the dust cloud runs on this road line

function bandU(bounds, cols, y, x, seam) {
  for (let k = 0; k < bounds.length; k++) {
    const b = bounds[k];
    if (y < b - seam) return cols[k];
    if (y < b + seam) return ((y - (b - seam) + 0.5) / (2 * seam)) > bay(x, y) ? cols[k + 1] : cols[k];
  }
  return cols[bounds.length];
}
function pwl(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x < pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
}
// height above the horizon + face (0 left cliff, 1 front, 2 right cliff, 3/4 talus)
function mesaH(m, x) {
  if (x < m.bL || x > m.bR) return [0, -1];
  if (x < m.shL) return [m.shH * (x - m.bL) / (m.shL - m.bL), 3];
  if (x < m.x0) return [m.shH + (m.top - m.shH) * (x - m.shL) / (m.x0 - m.shL), 0];
  if (x <= m.x1) return [m.top - (hash3(Math.floor(x / 7), 3, 61) < 0.25 ? 1 : 0), 1];
  if (x <= m.shR) return [m.shH + (m.top - m.shH) * (m.shR - x) / (m.shR - m.x1), 2];
  return [m.shH * (m.bR - x) / (m.bR - m.shR), 4];
}
// Saguaro (original, generic): trunk + two arms, dark outline, lit left edge, shaded right.
function saguaro(x, cx, by, h) {
  cx = ri(cx); by = ri(by); h = ri(h);
  if (h < 5) { R(x, cx, by - h, 1, h, DZ.cactusDk); R(x, cx, by - h, 1, 1, DZ.cactus); return; }
  const tw = Math.max(2, ri(h * 0.15)), aw = Math.max(2, ri(tw * 0.8)), x0 = cx - (tw >> 1);
  const V = [[x0, by - h, tw, h]], Hz = [];
  if (h >= 9) {
    const ly = by - ri(h * 0.44), lx = x0 - Math.max(2, ri(tw * 1.05)), lt = by - ri(h * 0.72);
    Hz.push([lx, ly - aw, x0 - lx + 1, aw]); V.push([lx, lt, aw, ly - lt]);
    const ry = by - ri(h * 0.58), rx = x0 + tw + Math.max(2, ri(tw * 0.9)), rt = by - ri(h * 0.84);
    Hz.push([x0 + tw - 1, ry - aw, rx - x0 - tw + 1, aw]); V.push([rx - aw, rt, aw, ry - rt]);
  }
  const rr = (w) => Math.max(0, (w >> 1));
  for (const [a, b, w, hh] of V) rrect(x, a - 1, b - 1, w + 2, hh + 2, rr(w) + 1, DZ.cactusDk);
  for (const [a, b, w, hh] of Hz) R(x, a, b - 1, w, hh + 2, DZ.cactusDk);
  for (const [a, b, w, hh] of Hz) { R(x, a, b, w, hh, DZ.cactus); R(x, a, b + hh - 1, w, 1, DZ.cactusSh); }
  for (const [a, b, w, hh] of V) {
    rrect(x, a, b, w, hh, rr(w), DZ.cactus);
    const sw = Math.max(1, ri(w * 0.36));
    R(x, a + w - sw, b + rr(w), sw, hh - rr(w), DZ.cactusSh);
    if (w >= 4) R(x, a + 1, b + rr(w), 1, hh - rr(w) - 1, '#7ee08a');
    if (w >= 7) for (let k = a + 3; k < a + w - sw; k += 3) R(x, k, b + rr(w) + 1, 1, hh - rr(w) - 2, '#2e9656');
  }
}
function rockAt(x, cx, cy, r) {
  cx = ri(cx); cy = ri(cy);
  if (r < 1.5) { R(x, cx, cy, 2, 1, '#7a4a30'); return; }
  const w = ri(r * 2.2), h = Math.max(2, ri(r * 1.3));
  rrect(x, cx - (w >> 1) - 1, cy - h, w + 2, h + 1, 2, '#5a3222');
  rrect(x, cx - (w >> 1), cy - h + 1, w, h - 1, 2, DZ.sandDk);
  R(x, cx - (w >> 1) + 1, cy - h + 1, Math.max(1, w - 3), 1, DZ.sandSh);
  R(x, cx - (w >> 1) + 1, cy - 1, w - 1, 1, '#7a4a30');
}
function shrubAt(x, cx, cy, r) {
  cx = ri(cx); cy = ri(cy);
  const n = Math.max(1, ri(r));
  for (let k = -n; k <= n; k++) { const hh = Math.max(1, n - Math.abs(k) + (k & 1)); R(x, cx + k, cy - hh, 1, hh, k < 0 ? '#8aa04a' : '#5c7430'); }
  R(x, cx - n, cy, 2 * n + 1, 1, '#a8683f');
}

// Paint the static world into a w x h canvas: sky bands, big low sun with retro slits, far
// range, near mesas (lit face + strata, shadowed cliff, talus, dark base, rim light), sand,
// the two-lane road in perspective (edge lines, dashed yellow centre), rocks, shrubs, cacti.
// splitFG: the hero cactus goes to its own transparent layer (drawn over the dust cloud).
function paintDesert(w, h, vpx, vpy, s, splitFG) {
  const bg = mk(w, h), bx = ctxOf(bg);
  const img = bx.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const skyB = SKY_A.slice(0, -1).map(([y]) => vpy + y * s), skyC = SKY_A.map(([, c]) => u32(c));
  const gB = GROUND_A.slice(0, -1).map(([y]) => vpy + y * s), gC = GROUND_A.map(([, c]) => u32(c));
  const sunX = vpx + 16 * s, sunY = vpy - 26 * s, sunR = 46 * s;
  const cSunHi = u32('#fff6d2'), cSunLo = u32('#ffd35a'), cSunRim = u32('#ffb13b');
  const cFar = u32('#d9806a'), cFarHi = u32('#f4ac86'), cFarSh = u32('#c2665a');
  const MC = { lit: u32(DZ.mesa), sh: u32(DZ.mesaSh), mid: u32('#933d27'), tal: u32('#8a3524'), dk: u32(DZ.mesaDk), rim: u32(DZ.sunset), st: u32('#8f3a28'), stS: u32('#5e2420') };
  const rB = ROAD_A.slice(0, -1).map(([y]) => vpy + y * s), rC = ROAD_A.map(([, c]) => u32(c));
  const cLine = u32(DZ.roadLine), cEdge = u32('#f4e2c4'), cSho = u32('#c98a5a');
  const px1 = 0.55;                               // half a screen pixel, in screen px
  for (let j = 0; j < h; j++) {
    const yw = (j + 0.5 - vpy) / s, up = -yw;
    for (let i = 0; i < w; i++) {
      const xw = (i + 0.5 - vpx) / s;
      let c;
      if (yw < 0) {
        c = bandU(skyB, skyC, j, i, 2);
        const dx = i + 0.5 - sunX, dy = j + 0.5 - sunY, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < sunR) {
          const fy = dy / sunR;
          const gap = (fy > 0.2 && fy < 0.28) || (fy > 0.4 && fy < 0.51) || (fy > 0.6 && fy < 0.74) || fy > 0.82;
          if (!gap) c = dd > sunR - 1.2 ? cSunRim : (fy < -0.05 + (bay(i, j) - 0.5) * 0.14 ? cSunHi : cSunLo);
        }
        const fh = pwl(FAR_A, xw);
        if (up < fh) c = (up * s > fh * s - 1) ? cFarHi : (Math.abs(up - fh * 0.5) * s < 0.5 ? cFarSh : cFar);
        for (const m of MESAS) {
          const [mh, face] = mesaH(m, xw);
          if (up >= mh) continue;
          const hs = up * s;                       // screen px above the horizon
          if (hs < 2.2) { c = MC.dk; continue; }
          if (mh * s - hs < 1 && face <= 2) { c = face === 0 ? MC.lit : MC.rim; continue; }
          if (face === 1) {
            let st = false;
            for (const q of [0.3, 0.54, 0.76]) if (Math.abs(hs - m.top * q * s) < px1 && hash3(i, 1, 9) > 0.12) st = true;
            c = st ? MC.st : MC.lit;
            if (xw < m.x0 + 5 && xw >= m.x0) c = st ? MC.stS : MC.mid;          // shaded return of the front
          } else if (face === 0) c = MC.sh;
          else if (face === 2) c = MC.mid;
          else c = (hash3(i, j, 13) < 0.06) ? MC.dk : MC.tal;
        }
      } else {
        c = bandU(gB, gC, j, i, 1);
        const hw = ROAD_K * yw * s, ax = Math.abs(i + 0.5 - vpx), ys = yw * s;
        if (ax < hw) {
          c = bandU(rB, rC, j, i, 1);
          if (ys > 5 && ax >= hw - Math.max(1, ys * 0.02)) c = cEdge;
          else if (yw > 4 && ax < Math.max(0.5, ys * 0.014) && ((900 / yw + 1) % 4) < 1.8) c = cLine;
        } else if (ys > 5 && ax < hw + Math.max(1, ys * 0.014)) c = cSho;
      }
      d[j * w + i] = c;
    }
  }
  bx.putImageData(img, 0, 0);
  // ground detail: rocks and shrubs (seeded), never on the road
  const rng = mulberry32(4242);
  for (let k = 0; k < 46; k++) {
    const dw = 3 + Math.pow(rng(), 1.6) * 300, xw = (rng() * 2 - 1) * 320, kind = rng();
    if (Math.abs(xw) < ROAD_K * dw + 8) continue;
    const sx = vpx + xw * s, sy = vpy + dw * s, r = (1 + rng() * 2.2) * (0.25 + dw / 90) * s;
    if (sx < -10 || sx > w + 10 || sy > h + 4) continue;
    if (kind < 0.6) rockAt(bx, sx, sy, r); else shrubAt(bx, sx, sy, r);
  }
  let fg = null;
  if (splitFG) fg = mk(w, h);
  CACTI.forEach(([xw, dw, hh], k) => saguaro(k === 0 && fg ? ctxOf(fg) : bx, vpx + xw * s, vpy + dw * s, hh * s));
  return { bg, fg };
}

// Roadside warning sign (a generic yellow diamond with a "falling rocks" pictogram — the
// setup for the canyon gag). It spins round its post: ang = rotation, 0 = facing us.
const SIGN_PICTO = [
  '......k..',
  '........k',
  'kk...k...',
  'kkk......',
  'kkkk...k.',
  'kkkkk....',
  'kkkkkk...',
  'kkkkkkk..',
  'kkkkkkkkk',
];
function roadSign(ctx, sx, by, a, ang, ph = SIGN.post) {
  const c = Math.cos(ang), ac = Math.abs(c);
  R(ctx, sx - 2, by - ph, 4, ph + 1, X.ink);
  R(ctx, sx - 1, by - ph, 2, ph, '#c9cce0'); R(ctx, sx, by - ph, 1, ph, '#6a6f8c');
  R(ctx, sx - 3, by, 7, 1, '#7a4a30');                                   // footing shadow
  const cy = by - ph - a + 3;
  if (ac < 0.16) {                                                       // edge-on
    R(ctx, sx - 1, cy - a - 1, 3, 2 * a + 3, X.ink); R(ctx, sx, cy - a, 1, 2 * a + 1, '#e8e8f0');
    return;
  }
  const front = c > 0;
  for (let dy = -a - 1; dy <= a + 1; dy++) {
    const hw = Math.max(0, ri((a + 1 - Math.abs(dy)) * ac));
    R(ctx, sx - hw, cy + dy, 2 * hw + 1, 1, X.ink);
  }
  for (let dy = -a + 1; dy <= a - 1; dy++) {
    const hw = Math.max(0, ri((a - Math.abs(dy)) * ac) - 1);
    if (!front) { R(ctx, sx - hw, cy + dy, 2 * hw + 1, 1, dy < 2 ? '#aeb4cc' : '#8a90aa'); continue; }
    R(ctx, sx - hw, cy + dy, 2 * hw + 1, 1, dy < -a + 4 ? '#ffe98a' : '#ffd84a');
    const hi = ri((a - 3 - Math.abs(dy)) * ac);                          // inner border line
    if (Math.abs(dy) <= a - 3) { R(ctx, sx - hi, cy + dy, 1, 1, X.ink); R(ctx, sx + hi, cy + dy, 1, 1, X.ink); }
  }
  if (!front) { R(ctx, sx, cy, 1, 1, X.ink); return; }
  if (ac > 0.55) {
    for (let j = 0; j < SIGN_PICTO.length; j++) for (let i = 0; i < 9; i++) {
      if (SIGN_PICTO[j][i] !== 'k') continue;
      R(ctx, sx + ri((i - 4) * ac), cy - 4 + j, 1, 1, X.ink);
    }
  }
}
// The same sign at 0.4x, painted INTO the half-res world (S.world2x) so it is blown up 2x
// with it on the 8-px grid (no mixel next to the cactus on the beep1 snap): 13-px diamond
// (a = 5), 3-px post, and a 1-2 px slope-and-rock pictogram (no inner border at this size).
const SIGN_MINI = [                                       // rows cy-3..cy+3, cols sx-3..sx+3
  '.......',
  '....k..',
  '.k.....',
  'kkk..k.',
  'kkkk...',
  '.kkkk..',
  '.......',
];
function roadSignMini(ctx, sx, by, a = 5, ph = 14) {
  R(ctx, sx - 1, by - ph, 3, ph + 1, X.ink);
  R(ctx, sx, by - ph, 1, ph, '#c9cce0');
  R(ctx, sx - 2, by, 5, 1, '#7a4a30');                                   // footing shadow
  const cy = by - ph - a + 2;
  for (let dy = -a - 1; dy <= a + 1; dy++) { const hw = a + 1 - Math.abs(dy); R(ctx, sx - hw, cy + dy, 2 * hw + 1, 1, X.ink); }
  for (let dy = -a + 1; dy <= a - 1; dy++) {
    const hw = a - 1 - Math.abs(dy);
    R(ctx, sx - hw, cy + dy, 2 * hw + 1, 1, dy < -a + 3 ? '#ffe98a' : '#ffd84a');
  }
  for (let j = 0; j < SIGN_MINI.length; j++) for (let i = 0; i < 7; i++) {
    if (SIGN_MINI[j][i] === 'k') R(ctx, sx - 3 + i, cy - 3 + j, 1, 1, X.ink);
  }
}
// Billow shading for dust (no round highlight discs, which read as polka dots): a 1-px dark
// rim round the silhouette, a FLAT DESERT.dust body, a DESERT.dustSh band on the lower third
// of every lobe, a 1-2 px lit crescent on the upper-left of the flagged lobes and optional
// short white sheen dashes (speed). lobes: [x, y, r, lit]; painted back (high) to front
// (low), so each lobe's lit top reads against the shaded underside of the one behind it.
// Rasterised per pixel (front-most lobe wins): where a front lobe's upper edge crosses a lobe
// behind it, a 1-px dustSh contour separates the billows (no dark lines inside the cloud).
let BILC = null, BILX = null;
function billow(ctx, lobes, o = {}) {
  const ls = lobes.map(([x, y, r, lit]) => [ri(x), ri(y), Math.max(1, ri(r)), lit]).sort((a, b) => a[1] - b[1]);
  if (!ls.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y, r] of ls) { x0 = Math.min(x0, x - r - 1); y0 = Math.min(y0, y - r - 1); x1 = Math.max(x1, x + r + 1); y1 = Math.max(y1, y + r + 1); }
  if (o.clipY !== undefined) y1 = Math.min(y1, o.clipY - 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return;
  if (!BILC || BILC.width < w || BILC.height < h) { BILC = mk(Math.max(w, 400), Math.max(h, 160)); BILX = ctxOf(BILC); }
  const img = BILX.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const cRim = u32(o.rim || '#6b4a3a'), cBody = u32(o.body || DZ.dust), cSh = u32(o.shade || DZ.dustSh), cLit = u32(o.lit || '#fffaf0');
  const n = ls.length, R2 = ls.map(([, , r]) => (r + 0.5) * (r + 0.5)), RR2 = ls.map(([, , r]) => (r + 1.5) * (r + 1.5));
  for (let j = 0; j < h; j++) {
    const py = y0 + j;
    for (let i = 0; i < w; i++) {
      const px = x0 + i;
      let fr = -1, rim = false;
      for (let k = n - 1; k >= 0; k--) {
        const dx = px - ls[k][0], dy = py - ls[k][1], dd = dx * dx + dy * dy;
        if (dd <= R2[k]) { fr = k; break; }
        if (dd <= RR2[k]) rim = true;
      }
      if (fr < 0) { if (rim) d[j * w + i] = cRim; continue; }
      const [x, y, r, lit] = ls[fr], dx = px - x, dy = py - y, dd = dx * dx + dy * dy;
      let c = cBody;
      // scallop: the terminator rises one row toward each lobe's sides, so the shade edge
      // follows the lobes (a row of smiles), never one straight shelf across the cloud
      if (dy >= Math.max(1, Math.round(r / 3)) - (o.scallop && Math.abs(dx) >= r * 0.6 ? 1 : 0)) c = cSh;
      else if (!o.noSep && dy < 0 && dd > (r - 0.5) * (r - 0.5) && r >= 3) {
        // the front lobe's top edge over a lobe behind it: separation contour
        let behind = false;
        for (let k = 0; k < fr; k++) { const ex = px - ls[k][0], ey = py - ls[k][1]; if (ex * ex + ey * ey <= R2[k]) { behind = true; break; } }
        // sepEdge: keep the contour only near the outer silhouette (short notches in the top
        // valleys), not as full arcs across the body (bubble wrap)
        if (behind && o.sepEdge) {
          const e = o.sepEdge, insideAny = (qx, qy) => { for (let k = 0; k < n; k++) { const ex = qx - ls[k][0], ey = qy - ls[k][1]; if (ex * ex + ey * ey <= R2[k]) return true; } return false; };
          let near = false;
          for (let v = -e; v <= e && !near; v++) for (let u = -e; u <= e; u++) if (u * u + v * v <= e * e && !insideAny(px + u, py + v)) { near = true; break; }
          behind = near;
        }
        if (behind) c = cSh;
      }
      if (c === cBody && lit && r >= 4 && dy <= 0 && dx <= r * 0.3) {
        const sw = r >= 10 ? 2 : 1, ex = dx - sw, ey = dy - sw;
        if (ex * ex + ey * ey > R2[fr]) c = cLit;          // upper-left crescent (1-2 px)
      }
      d[j * w + i] = c;
    }
  }
  BILX.clearRect(0, 0, w, h);
  BILX.putImageData(img, 0, 0);
  ctx.drawImage(BILC, 0, 0, w, h, x0, y0, w, h);
  if (o.sheen) for (const [x, y, sw] of o.sheen) R(ctx, x, y, sw, 1, '#ffffff');
}
// Round, lumpy cartoon dust cloud resting on the road at (cx, gy), billow-shaded; the lobes
// "boil" by one pixel per frame. The LEADING (right) edge is a round lobe: no beak, crest,
// neck or legs; the trailing lobes shrink into the hanging dust bank.
const CLOUD = [[0, -18, 18], [16, -13, 13], [-3, -31, 12], [12, -27, 9], [-17, -14, 12], [-29, -9, 9], [-39, -6, 6], [-47, -4, 4]];
const CLOUD_LIT = [false, false, true, true, true, true, true, false];
const CLOUD_SHEEN = [[-11, -39, 7], [2, -35, 9], [13, -24, 5]];
function cloudLobes(cx, gy, f, k) {
  return CLOUD.map(([dx, dy, r], i) => {
    const h = hash3(f, i, 23);
    return [ri(cx + dx * k), ri(gy + dy * k - (hash3(f, i, 17) < 0.5 ? 0 : 1)), Math.max(2, ri(r * k) + (h < 0.3 ? -1 : h > 0.7 ? 1 : 0)), CLOUD_LIT[i]];
  });
}
// Fraction of the roadside sign's diamond hidden by the dash cloud on dash frame fi (0..1).
function signCover(fi, f) {
  if (fi < 0) return 0;
  const cx = dashX(fi), gy = VP1.y + CLOUD_DW;
  if (cx >= LW + 90) return 0;
  const ls = cloudLobes(cx, gy, f, CLOUD_K), sx = VP1.x + SIGN.x, a = SIGN.a;
  const cy = VP1.y + SIGN.dw - SIGN.post - a + 3, ac = Math.max(0.16, Math.abs(Math.cos(signAngle(fi))));
  let n = 0, hid = 0;
  for (let dy = -a - 1; dy <= a + 1; dy++) {
    const hw = Math.max(0, ri((a + 1 - Math.abs(dy)) * ac)), y = cy + dy;
    for (let x = sx - hw; x <= sx + hw; x++) {
      n++;
      if (y < gy && ls.some(([lx, ly, r]) => (x - lx) ** 2 + (y - ly) ** 2 <= (r + 1.5) ** 2)) hid++;
    }
  }
  return n ? hid / n : 0;
}
function dustCloud(ctx, cx, gy, f, k = 1) {
  const lobes = cloudLobes(cx, gy, f, k);
  const sheen = CLOUD_SHEEN.map(([dx, dy, w]) => [ri(cx + dx * k), ri(gy + dy * k), ri(w * k)]);
  billow(ctx, lobes, { clipY: gy, sheen, sepEdge: 3 });
  R(ctx, ri(cx - 50 * k), gy, ri(70 * k), 1, DZ.roadSh);                // contact shadow
}
// Dash timing: the cloud's centre, frame-quantised (fi = frames since dashStart)
const DASH_X0 = 24, DASH_V = 50, CLOUD_K = 1.35;
const dashX = (fi) => DASH_X0 + DASH_V * fi;
function drawDash(ctx, fi, f) {
  const gy = VP1.y + CLOUD_DW, cx = dashX(fi), K = CLOUD_K;
  // hanging trail: ONE low, lumpy dust bank left on the road behind the cloud (overlapping
  // puffs painted in passes so they merge, flat base on the asphalt), swelling as it is born,
  // then drifting with the wind and thinning out at its old (left) end
  const tp = [];
  for (let j = 0; j < 52; j++) {
    const X0 = -70 + 7 * j + ri(hash3(j, 2, 31) * 4), born = (X0 + 58 - DASH_X0) / DASH_V, a = fi - born;
    if (a < 0) continue;
    const v = 0.65 + hash3(j, 1, 31) * 0.55, big = (j % 5 === 2) ? 1.35 : 1;
    let r = Math.min(11, 3 + a * 2.6) * v * big;
    if (a > 5) r -= (a - 5) * 1.6;
    if (r < 1.5) continue;
    const lift = hash3(j, 3, 31) * 6 * Math.min(1, a / 2.5);
    tp.push([ri(X0 + a * 1.4), ri(gy - r * 0.55 - lift), ri(r)]);
  }
  if (cx < LW + 90) {
    // pebbles kicked up behind the cloud + a few friction sparks, painted BEFORE the dust bank
    // and the cloud so none sits on the dust as a dark dot (they show only above it)
    for (let k = 0; k < 6; k++) {
      const fb = 0.4 + k * 0.85, a = fi - fb;
      if (a < 0 || a > 4) continue;
      const x = dashX(fb) - 30 - a * (5 + k), y = gy - 2 - (a * 7 - a * a * 1.3) * (1 + (k & 1) * 0.5);
      if (k % 3 === 2) { R(ctx, ri(x), ri(y), 2, 1, '#ffe45c'); R(ctx, ri(x) + 2, ri(y), 1, 1, '#ffffff'); }
      else { R(ctx, ri(x), ri(y), 2, 2, '#5a3222'); R(ctx, ri(x), ri(y), 1, 1, DZ.sandSh); }
    }
  }
  const live = cx < LW + 90;
  if (live) {
    // speed lines behind the cloud, every one 2 lo px tall (no long 1-px light hairlines for
    // the feed encoder to ring on): white + cream leads, dust-tinted followers (lower edge
    // contrast), a dark under-edge each
    for (let k = 0; k < 8; k++) {
      const yy = gy - 6 - k * 7;
      const len = 40 + ri(hash3(k, f, 43) * 90) + (k === 2 || k === 5 ? 50 : 0);
      const x1 = cx - 14 - ri(hash3(k, 7, 41) * 12), lead = k % 3 === 1;
      R(ctx, x1 - len, yy + 2, len, 1, '#a07a5a');
      R(ctx, x1 - len, yy, len, 1, lead ? '#ffffff' : '#fff3c4');
      R(ctx, x1 - len, yy + 1, len, 1, lead ? '#fff3c4' : DZ.dust);
    }
    // entry shock on the dash frame: white streaks bursting in from the left edge, BEHIND
    // the cloud (they stop at its middle, never cross its body)
    if (fi === 0) {
      for (let k = 0; k < 6; k++) {
        const yy = gy - 4 - k * 8 + (k & 1) * 2, len = Math.min(cx - 4, 70 + ri(hash3(k, 3, 7) * 60));
        R(ctx, 0, yy + 1, len, 1, '#a07a5a'); R(ctx, 0, yy, len, 2, '#ffffff');
      }
    }
  }
  // the dust bank goes over the speed lines (they emerge from the dust instead of slicing it
  // into 1-px strips), under the cloud
  if (tp.length) billow(ctx, tp.map(([x, y, r]) => [x, y, r, r >= 8]), { clipY: gy + 1, rim: DZ.dustDk, noSep: true });
  if (live) dustCloud(ctx, cx, gy, f, K);
}
// Sign spin: still until the cloud's wind reaches it, then fast, aliasing turns
function signAngle(fi) { return fi < 3 ? 0 : -0.8 + (fi - 3) * 1.9; }
// Scene-1 wave for Direction A: the base's cue-driven wave, FROZEN through the pause
function waveA(t) {
  const hold = (cue, n) => { const s = sinceCue(t, cue); return s >= 0 && s < n; };
  let amp = 2.5, pulse = 0, tw = t;
  if (holdBeep(t, CUES.beep1, 3) || holdBeep(t, CUES.beep2, 3)) pulse = 1;
  // frame-based, on the whip (FALL_F0) and snap (FALL_F1) frames; the decay keeps its per-frame
  // values, counted from the whip frame
  const fq = frameOf(t), tf = t + (firstFrame(CUES.fallStart) - FALL_F0) / FPS;
  if (t >= CUES.dashStart && fq < FALL_F0) amp = 5;
  else if (fq >= FALL_F0 && fq < FALL_F1) amp = lerp(4, 1, prog(tf, CUES.fallStart, CUES.fallEnd));
  else if (fq >= FALL_F1 && t < CUES.puff) { amp = 0.4; tw = CUES.fallEnd; }
  if (hold(CUES.puff, 3)) { amp = 2; pulse = 0.5; }
  // the "bip" hit: frames since the latest beep (0..2), for the white spike of the bars
  const b1 = sinceBeep(t, CUES.beep1), b2 = sinceBeep(t, CUES.beep2);
  const hit = b2 >= 0 && b2 < 3 ? b2 : b1 >= 0 && b1 < 3 ? b1 : -1;
  return { amp, pulse, tw, hit };
}
// Listening wave with the beep spike: on each beep frame every bar jumps to full height in
// white (hit 0), then yellow for two frames (hit 1, 2); otherwise the base wave.
function drawWaveHit(ctx, cx, cy, n, wv) {
  if (wv.hit < 0) { drawWave(ctx, cx, cy, n, wv.tw, wv.amp, wv.pulse); return; }
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const fall = 1 - Math.abs(i - mid) / (mid + 1.5);
    const a = Math.abs(Math.sin(wv.tw * 9 + i * 0.9)) * (0.6 + 0.4 * Math.sin(wv.tw * 23 + i * 2.1));
    const h = Math.max(1, ri([13, 12, 9][wv.hit] * (0.5 + 0.5 * fall) * (0.82 + 0.18 * a)));
    const x = ri(cx + (i - mid) * 3) - 1;
    R(ctx, x - 1, cy - h - 1, 4, 2 * h + 3, X.ink);
    R(ctx, x, cy - h, 2, 2 * h + 1, wv.hit === 0 ? '#ffffff' : X.fY);
    R(ctx, x, cy - h, 2, 1, '#ffffff');
  }
}
// The quiz HUD that rides over the world once the camera leaves the phone (frames 38-89):
// the app's pink bar (TV mark + NOSTALGIA wordmark) on top of a dark plate with the prompt
// and the listening wave, centred on the SAFE axis, inside SAFE (lo y >= 40).
const HUD_A = { y: 40, h: 58, w: 152, bar: 13 };
function drawWorldHUD(t) {
  const wv = waveA(t), x = CXE - (HUD_A.w >> 1), y = HUD_A.y, w = HUD_A.w;
  // OPAQUE plate: over the high-contrast world a translucent one ghosts the road dash, the
  // mesas and the strata through and changes tone with whatever passes under it
  rrect(L, x, y, w, HUD_A.h, 6, '#140a2a');
  R(L, x + 6, y - 1, w - 12, 1, X.ink); R(L, x + 6, y + HUD_A.h, w - 12, 1, X.ink);
  // app bar: pink, exactly HUD_A.bar rows, rounded top corners and SQUARE bottom corners, a
  // dark pink under-edge; 3 plate rows of air under it before the prompt's acute
  rrect(L, x, y, w, HUD_A.bar, 6, X.pink);
  R(L, x, y + HUD_A.bar - 6, w, 6, X.pink);
  R(L, x, y + HUD_A.bar - 1, w, 1, X.pinkDk);
  R(L, x + 6, y, w - 12, 1, X.pinkLt);
  L.drawImage(S.tv1, x + 6, y);
  drawText(L, COPY.appName, 'ps', { s: 1, fill: '#ffffff', ext: { d: 1, c: X.pinkDk, dx: 0 } }, CXE + 3, y + 3, 'c');
  for (let k = 0; k < 3; k++) R(L, x + w - 9, y + 3 + k * 3, 2, 2, '#ffffff');
  drawText(L, COPY.quizPrompt, 'ps', { s: 1, fill: [X.cream, X.gold], ext: { d: 1, c: X.ink } }, CXE, y + 19, 'c');
  drawWaveHit(L, CXE, y + 41, 17, wv);
}
// ---- The two comic "BIP!" bursts (from Direction B): they pop out of the HUD's listening
// wave on beep1 / beep2 (the APP is the source of the sound), drawn natively at 1x over the
// world (also over the 2x snap). The second one (higher note) is pink and a touch bigger.
// Pop: white rim + oversized on the cue frame, +2 px the next, then the outline "boils"
// every 2 frames; both HOLD through the first half of the dash (a muted viewer gets BIP! BIP!
// together for 9 frames, burst 1 alone for 13), go out as white silhouettes on dash+5 (f50)
// and are gone from f51, before the sign whirl and the whip. They stay in the clear sky above
// the dust (bottom <= lo 162, the cloud never rises above lo 232). Tails point up at the wave.
function polyFill(ctx, pts, col) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(-4, Math.floor(y0)); y1 = Math.min(LH + 4, Math.ceil(y1));
  ctx.fillStyle = col;
  const n = pts.length, xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
}
const BIP_Y = HUD_A.y + HUD_A.h;                   // plate bottom (lo): the tails reach it
const BIPS = [
  { cue: CUES.beep1, cx: 72, cy: 132, rx: 44, ry: 23, tail: [106, BIP_Y - 1], outer: '#ffb13b', inner: '#ffe45c', seed: 3,
    text: { s: 2, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 2, c: '#d9281f', c2: '#7a1020' } } },
  { cue: CUES.beep2, cx: 180, cy: 128, rx: 46, ry: 25, tail: [148, BIP_Y - 1], outer: '#c2188f', inner: '#ff4f9a', seed: 8,
    text: { s: 2, fill: ['#fff6d0', X.fY, X.fY], out: X.ink, ext: { d: 2, c: '#5d1030', c2: '#2a0818' } } },
];
const BIP_OUT = firstFrame(CUES.dashStart) + 5;    // f50: white silhouettes; gone from f51
function burstPts(b, grow, phase) {
  const rng = mulberry32(b.seed * 977 + phase * 131), n = 11, pts = [];
  const ta = Math.atan2((b.tail[1] - b.cy) / b.ry, (b.tail[0] - b.cx) / b.rx);
  let best = 0, bd = 9;
  for (let i = 0; i < 2 * n; i += 2) {
    const a = (i / (2 * n)) * Math.PI * 2 + 0.13 * b.seed;
    const d = Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta)));
    if (d < bd) { bd = d; best = i; }
  }
  for (let i = 0; i < 2 * n; i++) {
    const a = (i / (2 * n)) * Math.PI * 2 + 0.13 * b.seed;
    const k = i & 1 ? 0.8 + rng() * 0.05 : 1 + (rng() - 0.5) * 0.16;
    if (i === best) {
      const ux = b.tail[0] - b.cx, uy = b.tail[1] - b.cy, ul = Math.hypot(ux, uy);
      pts.push([b.tail[0] + (ux / ul) * grow * 0.5, b.tail[1] + (uy / ul) * grow * 0.5]);
    } else pts.push([b.cx + Math.cos(a) * (b.rx * k + grow), b.cy + Math.sin(a) * (b.ry * k + grow)]);
  }
  return pts;
}
function drawBips(ctx, t) {
  const f = frameOf(t);
  if (f > BIP_OUT) return;
  const out = f === BIP_OUT;
  for (const b of BIPS) {
    const fb = sinceBeep(t, b.cue);
    if (fb < 0) continue;
    const grow = out ? 1 : fb === 0 ? 4 : fb === 1 ? 2 : 0, phase = fb < 2 ? 0 : fb >> 1;
    const pOut = burstPts(b, grow + 2, phase);
    polyFill(ctx, pOut.map(([x, y]) => [x + 2, y + 3]), '#1a0a14');
    polyFill(ctx, pOut, X.ink);
    if (out) { polyFill(ctx, burstPts(b, grow, phase), '#ffffff'); continue; }
    polyFill(ctx, burstPts(b, grow, phase), fb === 0 ? '#ffffff' : b.outer);
    polyFill(ctx, burstPts(b, grow - 6, phase), b.inner); // pop frame: white rim, the colour stays inside so the word reads
    drawText(ctx, 'BIP!', 'ps', b.text, b.cx + 2, b.cy - 7 - (fb === 0 ? 1 : 0), 'c');
  }
}
// the haze lump on f44: [x, dy from the road line, r] — a low mound just right of the cactus
const HAZE = [[19, -1, 3], [24, -2, 4], [30, -2, 4], [35, -1, 3], [39, -1, 2]];
function drawRoadWorld(t, f) {
  L.drawImage(S.world1.bg, 0, 0);
  const fi = f - firstFrame(CUES.dashStart);
  // the cloud NEVER half-hides the sign (a yellow point poking out of the top of the running
  // dust reads as a crest / plume): mostly covered -> the sign is simply not drawn that frame
  // (only round lobes form the cloud's top); slightly covered -> it stays whole in front
  const cov = signCover(fi, f);
  const sign = () => {
    roadSign(L, VP1.x + SIGN.x, VP1.y + SIGN.dw, SIGN.a, signAngle(fi));
    if (fi >= 5 && fi < 9) {
      // wind whirl round the spinning sign, once the cloud has cleared it
      const sx = VP1.x + SIGN.x, sy = VP1.y + SIGN.dw - SIGN.post - SIGN.a + 3;
      for (let a = 0; a < 26; a++) {
        const an = -2.6 + a * 0.09 + fi * 0.5;
        const x = ri(sx + Math.cos(an) * (SIGN.a + 5)), y = ri(sy + Math.sin(an) * 5 - SIGN.a - 2);
        R(L, x, y, 1, 1, '#ffffff');
      }
    }
  };
  if (cov === 0) sign();
  // dust haze gathering at the left edge on the last frame before the dash: a LOW, flat lump
  // on the asphalt (no diagonal chain), behind the foreground cactus like the cloud on f45
  if (fi === -1) {
    const gy = VP1.y + CLOUD_DW;
    billow(L, HAZE.map(([dx, dy, r]) => [dx, gy + dy, r]), { clipY: gy, noSep: true });
  }
  if (fi >= 0) drawDash(L, fi, f);
  if (cov > 0 && cov < 0.5) sign();
  L.drawImage(S.world1.fg, 0, 0);
}

// ---- The canyon: a STEEP THREE-QUARTER high angle from beyond the lip ----------------------
// The camera hangs out over a box canyon and looks down and back at the cliff where the road
// ends: the lip (with the end of the asphalt) runs across the top of the frame through the
// whole fall, the end wall's strata step down toward a sunlit sandy floor far below, the side
// walls converge on it, and the canyon runs off the BOTTOM of the frame (no stratum ever
// closes into a ring). Projection: nadir (cx, cy); a world point (X, Y) at depth Z (rim = 1)
// lands on x = cx + X / Z, y = cy + Y / Z. Each stratum is the canyon's opening at depth Z (end
// wall at Y = Ye, side walls at X = C(Y) +/- W); painting the openings rim-to-floor leaves every
// stratum as a band that thins with depth.
const CAN = { cx: 135, cy: 279, pad: 4, Ye: -170, RW: 46 };
const CAN_Z = [1, 1.1, 1.21, 1.34, 1.5, 1.7, 1.95, 2.25, 2.65, 3.2, 4.0];
const CAN_W = [96, 95, 94, 93, 92, 91, 90, 90, 89, 89, 88];
const LIP_Y = CAN.cy + CAN.Ye;                       // 109: the lip on the rim (lo px)
// strata: the LEFT wall faces the low sun (lit), the right wall is in shade, the end wall faces
// the camera (between the two); the light dies with depth, the floor is sunlit sand
const CAN_LIT = ['#f2c28c', '#ef9a5c', '#d8683f', '#f0b07a', '#c8553d', '#b04a36', '#963e34', '#823634', '#6e3034', '#5e2a32'];
const CAN_SH = ['#b8704a', '#8f3f2e', '#74302a', '#8a4a3a', '#6a2a28', '#5a2428', '#4c2028', '#421c28', '#3a1a28', '#341828'];
const CAN_END = ['#d88a5a', '#c0643e', '#a44c34', '#c07650', '#96402e', '#86382e', '#76322e', '#682e2e', '#5c2a2e', '#52262e'];
const CAN_LIP = ['#fff0c8', '#ffd89a', '#f09060', '#ffe0b0', '#e3874f', '#c86a4a', '#b05a44', '#9a4a40', '#843e3c', '#743838'];
const CAN_CRV = ['#7a3a2a', '#5a2622', '#48201f', '#552a28', '#3a1a22', '#2e1426', '#2a1224', '#261022', '#221020', '#1e0e1e'];
const CAN_FLOOR = '#cf8a58';
// the lowest band is a warm talus slope (broken rock + light bounced off the sunlit floor)
const CAN_TALUS = { lit: '#c47a4e', end: '#a8603f', sh: '#8a4634', lip: '#dc9868' };
const canC = (Y) => 12 * Math.sin((Y - CAN.Ye) / 95) + 5 * Math.sin((Y - CAN.Ye) / 37);
const canJag = (Y, i, side) => 2.2 * Math.sin(Y / (9 + i) + i * 1.7 + side * 3.1) + (hash3(Math.floor(Y / 6), i * 2 + side, 91) - 0.5) * 3.5;
const endJag = (X, i) => 1.8 * Math.sin(X / (8 + i) + i * 1.3) + (hash3(Math.floor(X / 5), i, 57) - 0.5) * 3;
const FLOOR_Z = CAN_Z[CAN_Z.length - 1];
function canW(Z) {
  if (Z <= CAN_Z[0]) return CAN_W[0];
  for (let i = 1; i < CAN_Z.length; i++) if (Z < CAN_Z[i]) return lerp(CAN_W[i - 1], CAN_W[i], (Z - CAN_Z[i - 1]) / (CAN_Z[i] - CAN_Z[i - 1]));
  return CAN_W[CAN_W.length - 1];
}
// Scrub seen from above: an irregular 3-lobe clump, 2-tone (lit top-left), sand shadow.
function scrubAt(x, cx, cy, s, seed) {
  const rng = mulberry32(seed);
  const lobes = [[0, 0, s], [-s - ri(rng()), 1 + ri(rng()), Math.max(1, s - 1)], [s, ri(rng() * 2) - (s > 1 ? 1 : 0), Math.max(1, s - ri(rng()))]];
  for (const [a, b, r] of lobes) disc(x, cx + a + 1, cy + b + 1, r + 1, '#c47f52');
  for (const [a, b, r] of lobes) disc(x, cx + a, cy + b, r + 1, DZ.cactusDk);
  for (const [a, b, r] of lobes) disc(x, cx + a, cy + b, r, DZ.cactusSh);
  for (const [a, b, r] of lobes) { if (r >= 2) disc(x, cx + a - 1, cy + b - 1, r - 1, DZ.cactus); else R(x, cx + a - 1, cy + b - 1, 1, 1, DZ.cactus); }
}
function buildCanyon() {
  const pad = CAN.pad, w = LW + 2 * pad, h = LH + 2 * pad, c = mk(w, h), x = ctxOf(c);
  const img = x.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const cx = CAN.cx + pad, cy = CAN.cy + pad, N = CAN_Z.length - 1, Ce = canC(CAN.Ye);
  // 1) stratum map: the deepest opening that contains each pixel (-1 = the rim plateau)
  const lvMap = new Int8Array(w * h).fill(-1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    for (let lv = 0; lv <= N; lv++) {
      const Z = CAN_Z[lv], X = (i + 0.5 - cx) * Z, Y = (j + 0.5 - cy) * Z;
      const ej = endJag(X, lv) * (lv === 0 && Math.abs(X - Ce) < CAN.RW + 4 ? 0.2 : 1);  // the road ends on a clean edge
      if (Y < CAN.Ye + ej) break;
      const cc = canC(Y), side = X < cc ? 0 : 1;
      if (Math.abs(X - cc) > CAN_W[lv] + canJag(Y, lv, side)) break;
      lvMap[j * w + i] = lv;
    }
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? -2 : lvMap[j * w + i]);
  const U = (a) => a.map(u32), LIT = U(CAN_LIT), SH = U(CAN_SH), END = U(CAN_END), LIP = U(CAN_LIP), CRV = U(CAN_CRV);
  const cRim = u32('#e6a872'), cRimLt = u32('#f2c28c'), cRoad = u32(DZ.road), cRoadE = u32('#f4e2c4'), cLine = u32(DZ.roadLine);
  const cFloor = u32(CAN_FLOOR), cFloorSh = u32('#b8744a'), cFloorDk = u32('#9a5a3c'), cSand = u32(DZ.sand), cSandSh = u32(DZ.sandSh);
  const cTalL = u32(CAN_TALUS.lit), cTalE = u32(CAN_TALUS.end), cTalS = u32(CAN_TALUS.sh), cTalLip = u32(CAN_TALUS.lip);
  const lx = PUFF_AT[0] + pad, ly = PUFF_AT[1] + pad;
  const base = new Uint32Array(w * h);                 // un-edged band colour (for the creases)
  // 2) colours: faces, ledge lips, crevices, the floor and its sunlit landing patch
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const lv = lvMap[j * w + i], k = j * w + i;
    let col;
    if (lv < 0) {
      const sy = j - pad, rc = cx + Ce, hw = CAN.RW * (1 - (LIP_Y - sy) * 0.0016), ax = Math.abs(i + 0.5 - rc);
      col = cRim;
      if (at(i, j + 1) === 0 || at(i, j + 2) === 0) col = cRimLt;          // sunlit rim edge
      if (sy < LIP_Y + 3 && ax < hw) {
        col = cRoad;
        if (ax >= hw - 1) col = cRoadE;
        else if (ax < 1 && ((LIP_Y + 400 - sy) % 14) >= 6) col = cLine;
      }
    } else if (lv === N) {
      // the floor: sand, shaded along the right wall, rippled far from the landing spot, with
      // an oval sunlit patch (sand, sandSh rim) under the landing point
      // (the floor nearer the camera lies in the rim's shade: 2-row ordered-dither seam)
      const shade = j > ly + 52 || (j > ly + 48 && (j - ly - 48) / 4 > bay(i, j));
      col = shade ? cFloorSh : cFloor;
      if (at(i + 1, j) < N || at(i + 2, j) < N || at(i + 3, j) < N) col = shade ? cFloorDk : cFloorSh;
      const ex = (i + 0.5 - lx) / 21, ey = (j + 0.5 - ly - 1) / 11, e = Math.sqrt(ex * ex + ey * ey);
      if (e < 0.92) col = cSand; else if (e < 1.02) col = cSandSh;
    } else {
      const sy = j + 0.5 - cy;
      let face = (i + 0.5 < cx + canC((j + 0.5 - cy) * CAN_Z[lv]) / CAN_Z[lv]) ? 0 : 2;
      if (sy < 0) { const Zr = CAN.Ye / sy; if (Zr >= 0.98 && Math.abs(i + 0.5 - cx - Ce / Zr) <= canW(Zr) / Zr) face = 1; }
      const thick = 2;                                  // ledge lips: never a 1-px light hairline
      if (lv === N - 1) {
        // talus: warm scree at the foot of every wall, a light ledge on its top edge
        col = face === 1 ? cTalE : face === 0 ? cTalL : cTalS;
        base[k] = col;
        if (face === 1 && (at(i, j - 1) < lv || at(i, j - 2) < lv)) col = cTalLip;                  // ledge on the end wall only
        else if (hash3(i, j, 73) < 0.035 && Math.hypot(i - lx, j - ly) > 28) col = cTalS; // loose stones, never near the puff
        d[k] = col;
        continue;
      }
      if (face === 1) {
        col = END[lv];
        if (at(i, j - 1) < lv || (thick > 1 && at(i, j - 2) < lv)) col = LIP[lv];
      } else if (face === 0) {
        col = LIT[lv];
        if (at(i - 1, j) < lv || (thick > 1 && at(i - 2, j) < lv) || at(i, j - 1) < lv) col = LIP[lv];
      } else {
        col = SH[lv];
        if (at(i + 1, j) < lv || at(i, j - 1) < lv) col = CRV[lv];
      }
      base[k] = face === 1 ? END[lv] : face === 0 ? LIT[lv] : SH[lv];
    }
    d[k] = col;
  }
  // 3) erosion creases: SHORT (3-5 px) strokes one tone DARKER than their band, pointing at the
  // nadir (the "this is deep" cue); never across a ledge, never lighter than the band
  const dk = (c, f) => u32rgb(((c & 255) * f) | 0, (((c >>> 8) & 255) * f) | 0, (((c >>> 16) & 255) * Math.min(1, f * 1.08)) | 0);
  const rg = mulberry32(31337);
  for (let lv = 0; lv < N; lv++) {
    for (let g = 0; g < 40; g++) {
      const i0 = ri(rg() * (w - 1)), j0 = ri(rg() * (h - 1)), len = 3 + ri(rg() * 2);
      if (lvMap[j0 * w + i0] !== lv || d[j0 * w + i0] !== base[j0 * w + i0]) continue;
      const vx = cx - i0, vy = cy - j0, vl = Math.hypot(vx, vy) || 1;
      for (let s = 0; s < len; s++) {
        const pi = ri(i0 + (vx / vl) * s), pj = ri(j0 + (vy / vl) * s);
        if (pi < 0 || pj < 0 || pi >= w || pj >= h) break;
        const q = pj * w + pi;
        if (lvMap[q] !== lv || d[q] !== base[q]) break;
        d[q] = dk(base[q], 0.8);
      }
    }
  }
  x.putImageData(img, 0, 0);
  // 4) rim plateau detail: rocks and scrub clumps, never on the road or in the canyon
  const rng = mulberry32(777);
  for (let k = 0; k < 70; k++) {
    const px = ri(rng() * w), py = ri(rng() * h), r = 1 + rng() * 2, kind = rng();
    let ok = true;
    for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -5; dx <= 5; dx++) { if (at(px + dx, py + dy) !== -1 && at(px + dx, py + dy) !== -2) { ok = false; break; } }
    if (!ok || (py - pad < LIP_Y + 4 && Math.abs(px + 0.5 - cx - Ce) < CAN.RW + 5)) continue;
    if (kind < 0.45) rockAt(x, px, py, r); else scrubAt(x, px, py, r < 2 ? 1 : 2, 500 + k);
  }
  // the floor: a few wind ripples, only well below the landing spot
  for (let k = 0, n = 0; k < 200 && n < 14; k++) {
    const i = ri(rng() * w), j = ri(ly + 24 + rng() * (h - ly - 24));
    if (at(i, j) !== N || at(i + 5, j) !== N || at(i - 1, j) !== N || at(i, j - 1) !== N) continue;
    R(x, i, j, 3, 1, '#b8744a'); R(x, i + 3, j - 1, 2, 1, '#b8744a');
    n++;
  }
  // a few loose pebbles on the upper ledges (well away from the landing spot)
  for (let k = 0; k < 40; k++) {
    const i = ri(rng() * w), j = ri(rng() * h), lv = at(i, j);
    if (lv < 1 || lv > 6 || at(i, j - 1) === lv) continue;
    if (Math.hypot(i - lx, j - ly) < 40) continue;
    R(x, i, j + 1, 1, 1, '#4a2430');
  }
  return c;
}
// Lumpy grey boulder (a generic stone), cached by radius: cool greys dark enough to read on the
// sunlit floor, an ink outline, and a 1-px cream rim light on its upper-left so it also pops
// off the dark lower strata. Radius clamped to >= 3 lo px.
const BOULDER = new Map();
function boulderSprite(r) {
  r = Math.max(3, Math.round(r));
  let c = BOULDER.get(r);
  if (c) return c;
  const size = 2 * r + 5, cc = size / 2;
  c = mk(size, size);
  const x = ctxOf(c), inside = new Uint8Array(size * size), rrA = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = i + 0.5 - cc, dy = j + 0.5 - cc, an = Math.atan2(dy, dx);
    // lumpy outline at every size, wider than tall, a flat base and a flat-ish top (bulges on
    // the upper-left and the right): a stone lying there, never a ball or a bomb
    const rr = r * (1 + 0.1 * Math.sin(3 * an + 2.0) + 0.06 * Math.sin(5 * an + 0.9)) + (r <= 3 ? 0.45 : 0);
    rrA[j * size + i] = rr;
    if (Math.hypot(dx, dy / (r <= 5 ? 0.8 : 0.9)) <= rr && dy < r * 0.55 + 0.5) inside[j * size + i] = 1;
  }
  const isIn = (i, j) => i >= 0 && j >= 0 && i < size && j < size && inside[j * size + i];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = i + 0.5 - cc, dy = j + 0.5 - cc, rr = rrA[j * size + i];
    if (!inside[j * size + i]) { if (isIn(i - 1, j) || isIn(i + 1, j) || isIn(i, j - 1) || isIn(i, j + 1)) R(x, i, j, 1, 1, X.ink); continue; }
    if ((!isIn(i - 1, j) || !isIn(i, j - 1)) && dx + dy < -0.3 * r) { R(x, i, j, 1, 1, '#fff3c4'); continue; }  // rim light
    const nx = dx / rr, ny = dy / rr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = -nx * 0.55 - ny * 0.65 + nz * 0.45 + (bay(i, j) - 0.5) * (r > 5 ? 0.22 : 0);
    // small (far) rocks use a darker ramp so the body reads >= 4:1 on the sunlit sand floor
    const pal = r <= 4 ? ['#9a94b8', '#5a547e', '#3c3658'] : ['#c9c6dc', '#77719a', '#4a4468'];
    R(x, i, j, 1, 1, l > 0.62 ? pal[0] : l > 0.05 ? pal[1] : pal[2]);
  }
  if (r >= 7) { // a crack and a chip
    const k = Math.round(cc);
    for (let s = 0; s < ri(r * 0.6); s++) R(x, k + 1 + (s >> 1), k - 2 + s, 1, 1, '#2e2a48');
    R(x, k - ri(r * 0.4), k + ri(r * 0.3), 2, 1, '#2e2a48');
  }
  BOULDER.set(r, c);
  return c;
}
// The fall: the boulder goes over the lip and drops to the floor, apparent size ~ 1/depth (a
// geometric shrink reads as a steady fall), sliding down the frame toward its landing point.
// Frame-quantised: q = frames since fallStart, frozen from fallEnd (the pause).
const FALL = { Yb: -140, Z0: 0.95, Z1: FLOOR_Z, R: 13 };
const FALL_FE = FALL_F1 - FALL_F0;                    // 17 frames: whip f52 -> snap/hold f69
const PUFF_AT = [CAN.cx + canC(FALL.Yb) / FLOOR_Z, CAN.cy + FALL.Yb / FLOOR_Z];
// The rock stops a little ABOVE the floor (tau 0.85, ~4 canyon lo px of sand between its
// underside and its shadow) and hangs there through the silent hold: the puff on CUES.puff
// swallows it, so f75 is the first contact frame (the visible impact = the SFX).
const TAU_HOLD = 0.85;
function boulderAt(q) {
  const tau = clamp(q / FALL_FE, 0, 1) * TAU_HOLD, Z = FALL.Z0 * Math.pow(FALL.Z1 / FALL.Z0, Math.pow(tau, 1.15));
  return { x: CAN.cx + canC(FALL.Yb) / Z, y: CAN.cy + FALL.Yb / Z, r: Math.max(3, FALL.R / Z), tau };
}
// Loose chips that go over the edge with the boulder: each its own spot past the lip and its
// own delay, falling a little faster, so they sprinkle the first half of the drop.
const DEBRIS = Array.from({ length: 7 }, (_, k) => ({
  dY: -12 + hash3(k, 1, 211) * 36, dX: (hash3(k, 2, 211) - 0.5) * 100,
  d: 0.5 + hash3(k, 3, 211) * 3, v: 1.15 + hash3(k, 4, 211) * 0.5, r: 1.6 + hash3(k, 5, 211) * 1.6,
}));
function drawDebris(q) {
  for (const p of DEBRIS) {
    const tau = (q - p.d) * p.v / FALL_FE;
    if (tau < 0 || tau > 0.8) continue;
    const Z = FALL.Z0 * Math.pow(FALL.Z1 / FALL.Z0, Math.pow(tau, 1.15)), Y = FALL.Yb + p.dY;
    const x = ri(CAN.cx + (canC(Y) + p.dX) / Z), y = ri(CAN.cy + Y / Z), r = p.r / Z;
    // angular chips (a slanted wedge, lit top edge, dark underside): never round (bubbles),
    // never a closed outlined box (a crate)
    if (r >= 1.5) {
      const cw = ri(r * 1.4) + 2, ch = ri(r) + 1;
      for (let row = 0; row < ch; row++) R(L, x + (ch - 1 - row), y + row, cw - (ch - 1 - row), 1, row === 0 ? '#e6a872' : '#9a5a3a');
      R(L, x, y + ch, cw, 1, X.ink);
    } else { R(L, x, y + 1, 2, 1, X.ink); R(L, x, y, 2, 1, '#9a5a3a'); }
  }
}
// The payoff (from Direction B, adapted): a LOW lobed puff sitting on the floor, clearly wider
// than tall, billow-shaded with a 1-px ink rim and a closed base (one continuous shaded row +
// a dustDk contact shadow), 4-6 radiating ticks on its first 2 frames, and the tiny "puf"
// lettering above it (s = 2 for the first 6 frames, then settling to s = 1). Drawn in the 1x
// canyon layer, so the 2x hold and the push-in scale it on their own integer grid. No pebbles,
// no pale bar, no ring: nothing that could read as a face or an iris.
// lobes [dx, dy, r, lit]: two low side lobes, two tall top billows, one big front lobe
const PUFF_L = [[-7.5, -2.5, 3.2, true], [7.5, -3, 3.2, false], [-3.5, -5.5, 3.9, true], [2.6, -6.6, 4.1, true], [0, -2.5, 4.5, false]];
// After-life (pf >= 5): whole-pixel steps instead of a tiny scale factor (which only rounded
// to a new radius twice: freeze, freeze, pop): the two top billows rise 1 lo px every 2
// frames (max 4) and the side lobes spread 1 lo px every 3 frames (max 3), alternating, so the
// settling dust changes every 1-2 frames by exactly 1 canyon px (8 output px at the 2x hold).
function puffLife(pf) {
  const e = Math.max(0, pf - 5);
  return { rise: Math.min(4, (e + 1) >> 1), wide: Math.min(3, Math.floor(e / 3)) };
}
let PUFF_TOP = 0;                                                        // top row of the puff's rim (1x canyon)
function drawPuff(pf, x, y) {
  x = ri(x); y = ri(y);
  const g = pf === 0 ? 0.78 : pf === 1 ? 0.92 : 1;
  const { rise, wide } = puffLife(pf);
  // the side lobes spread AND swell (+0.5 px radius per step) so they stay joined to the
  // front lobe (a spreading cloud, never three separate balls)
  const lobes = PUFF_L.map(([a, b, r, lit], i) => [x + a * g + (i < 2 ? Math.sign(a) * wide : 0), y + b * g - (i === 2 || i === 3 ? rise : 0), Math.max(1, r * g + (i < 2 ? wide * 0.5 : 0)), lit]);
  PUFF_TOP = Math.min(...lobes.map(([, ly, r]) => ri(ly) - Math.max(1, ri(r)) - 1));
  if (pf < 2) {
    // 5 radiating impact rays round the upper half at UNEVEN angles, radii and lengths (white
    // on the hit frame, dust the next): no mirrored pairs (brows / cheek marks over the dome)
    // and none within 20 deg of vertical: clearly a burst, never a face
    const px = [];
    for (const [ao, r0, len] of PUFF_RAYS) {
      const an = Math.PI + ao;
      for (let s = 0; s <= len - 1; s += 0.5) { // half steps: a solid stroke, never loose dots
        const rr = r0 + pf * 3 + s;
        px.push([ri(x + Math.cos(an) * rr * 1.2), ri(y - 3 + Math.sin(an) * rr * 0.85)]);
      }
    }
    for (const [qx, qy] of px) R(L, qx, qy + 1, 1, 1, X.ink);
    for (const [qx, qy] of px) R(L, qx, qy, 1, 1, pf === 0 ? '#ffffff' : DZ.dust);
  }
  // no inner separation contours (they joined into V/Y cracks: a cracked bun, a rock pile) and
  // a scalloped shade terminator (no straight shelf across the lobes)
  billow(L, lobes, { clipY: y, rim: '#3a1f1a', noSep: true, scallop: true });
  const hw = ri(10.5 * g) + (pf >= 2 ? wide : 0);
  R(L, x - hw, y, 2 * hw + 1, 1, DZ.dustDk);                              // contact shadow row
  // s = 2 through the whole 2x hold (riding the billows' rise); from the push-in (f90) the
  // label leaves the zoomed layer and drawScene2 sets it in screen space (drawPufLabel)
  if (pf >= PUF_S2_F) return;
  const hop = pf === 0 ? -2 : pf === 1 ? -1 : 0;
  drawText(L, 'puf', 'ps', PUF_O(2), x + 1, y - 30 + hop - rise, 'c');
}
const PUF_O = (s) => ({ s, fill: ['#ffffff', X.cream], out: X.ink });
// The push-in's 'puf' (f90-f92), drawn on L AFTER the zoom at a screen scale that only grows
// (glyph px 4 on the f89 hold -> 5, 6, 7), centred on the zoomed puff and a fixed 4 lo px above
// its zoomed rim; a second ink ring keeps the outline 2 lo px, as on the 2x hold. Returns its
// box (lo px) so the speed lines can skip it.
const PUF_PUSH_S = [5, 6, 7];
function pufLabelBox(step, k, cx0, cy0, ay) {
  const sp = textSprite('puf', 'ps', PUF_O(PUF_PUSH_S[step]));
  const lx = CAN_ZD[0] + k, bottom = (PUFF_TOP - cy0) * k + ay - 4;
  const y = bottom - 1 - (sp.h - sp.capY);                              // cap top: sprite bottom (+1 ring) = bottom
  return { lx, y, sp, box: { x: lx - Math.floor(sp.inkW / 2) - sp.pad - 1, y: y - sp.capY - 1, w: sp.w + 2, h: sp.h + 2 } };
}
function drawPufLabel(step, lb) {
  const s = PUF_PUSH_S[step];
  const ring = textSprite('puf', 'ps', { s, fill: X.ink, out: X.ink });
  const rx = lb.lx - Math.floor(ring.inkW / 2) - ring.pad, ry = lb.y - ring.capY;
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) L.drawImage(ring.cv, rx + dx, ry + dy);
  drawText(L, 'puf', 'ps', PUF_O(s), lb.lx, lb.y, 'c');
}
// [angle offset from PI (rad), start radius, length] — asymmetric on purpose
const PUFF_RAYS = [[0.22, 14, 4], [0.78, 16, 3], [1.13, 15.5, 4], [2.25, 14, 3], [2.8, 14, 5]];
const PUF_S2_F = firstFrame(CUES.pushIn) - firstFrame(CUES.puff);        // 15
// The whip-tilt (one frame, the cut on fallStart): the road world slides UP and ends at a
// crisp terracotta cliff lip with the boulder teetering on it, the canyon enters from below
// across a clean seam, a few vertical white motion ticks. All at 1x on one pixel grid.
// seam 147: the lip and the teetering boulder (lo ~137) sit at the height the rock has on
// the first fall frame (f53), so it holds its screen height through the whip and only then falls (the lip's jump to
// the canyon's LIP_Y shrinks to ~36 lo); D grows with it, so the same road band shows above
const WHIP = { D: 125, seam: 147 };
const WHIP_TICKS = [[20, 196, 38], [54, 236, 28], [222, 206, 34], [250, 262, 44], [34, 372, 30], [238, 388, 28]];
function drawWhip() {
  const { D, seam } = WHIP;
  L.drawImage(S.canyon, -CAN.pad, seam - LIP_Y - CAN.pad);
  L.save(); L.beginPath(); L.rect(0, 0, LW, seam); L.clip();
  L.drawImage(S.world1.bg, 0, -D);
  // the still-spinning sign rides up with the road world (continuity with the dash frames)
  roadSign(L, VP1.x + SIGN.x, VP1.y + SIGN.dw - D, SIGN.a, signAngle(FALL_F0 - firstFrame(CUES.dashStart)));
  L.drawImage(S.world1.fg, 0, -D);
  L.restore();
  R(L, 0, seam - 1, LW, 1, '#3a1f1a');                                   // the seam: a dark lip shadow
  const sp = boulderSprite(FALL.R);
  L.drawImage(sp, ri(CAN.cx + 6 - sp.width / 2), ri(seam - FALL.R + 3 - sp.height / 2));
  for (const [tx, ty, tl] of WHIP_TICKS) { R(L, tx + 1, ty, 1, tl, '#7a3530'); R(L, tx, ty, 1, tl, '#ffffff'); }
}
// The hold: on fallEnd (the whistle stops) the camera snaps in 2x on the landing point and
// HOLDS there through the silence, the puff and the drift, so the tiny payoff reads; the
// puff's shake moves the zoomed frame (integer lo px), the art stays on its 2-px grid.
const CAN_ZD = [135, 214];                          // where the landing point sits at 2x
const PUSH_Y = 202;                                 // ...and during the push-in (more sunlit floor in view)
// eased from the hold's 214 over the 3 steps; low enough that the s=7 'puf' on the last step
// (its box top at 6x) stays inside SAFE (>= SAFE.y0)
const PUSH_YS = [208, 204, PUSH_Y];
function drawCanyon(t, f, noZoom) {
  const fi = f - FALL_F0, pf = f - firstFrame(CUES.puff);
  let hx = 0, hy = 0;
  if (pf >= 0 && pf < PUFF_SHAKE.length) { const a = PUFF_SHAKE[pf]; hx = (pf & 1 ? -1 : 1) * a; hy = (pf % 3 === 1 ? -1 : 1) * Math.min(1, a); }
  if (fi <= 0) { drawWhip(); return; }
  L.drawImage(S.canyon, -CAN.pad, -CAN.pad);
  const q = Math.min(fi, FALL_FE), fx = PUFF_AT[0], fy = PUFF_AT[1];
  const b = boulderAt(q);
  // the boulder's shadow on the sunlit floor grows as it nears (a flat oval, never a dot)
  if (pf < 0 && b.tau > 0.45) {
    const rs = 1 + 3 * b.tau * b.tau, ry = Math.max(1, ri(rs * 0.5));
    for (let dy = -ry; dy <= ry; dy++) { const hw = ri(rs * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)); R(L, ri(fx) - hw, ri(fy) + dy, 2 * hw + 1, 1, DZ.sandDk); }
  }
  // dotted fall trail (cartoon dashes left behind in the air), 2x2 lo px each; it hangs
  // through the pause and is gone on the puff
  if (pf < 0) for (let k = 1; k <= 7; k++) {
    const qq = q - 2 * k;
    if (qq < 1) break;
    const p = boulderAt(qq);
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 7) continue;           // never touching the rock (no "fuse")
    R(L, ri(p.x), ri(p.y) + 1, 2, 2, '#2a1420');
    R(L, ri(p.x), ri(p.y), 2, 2, '#fff3c4');
  }
  if (pf < 0) {
    drawDebris(q);
    const sp = boulderSprite(b.r);
    L.drawImage(sp, ri(b.x - sp.width / 2), ri(b.y - sp.height / 2));
    if (fi <= 1) for (let k = -2; k <= 2; k++) R(L, ri(b.x + k * 5), ri(b.y - b.r - 10 - Math.abs(k) * 3), 1, 7, '#ffffff');
  } else drawPuff(pf, fx, fy);
  if (!noZoom && f >= FALL_F1) zoomLo(2, ri(fx), ri(fy), CAN_ZD[0] + hx, CAN_ZD[1] + hy);
}

function drawScene1(t, noHud) {
  const f = frameOf(t);
  if (f >= FALL_F0) { drawCanyon(t, f, noHud); if (!noHud) drawWorldHUD(t); return; }
  if (sinceBeep(t, CUES.beep2) >= 0) { drawRoadWorld(t, f); if (!noHud) { drawWorldHUD(t); drawBips(L, t); } return; }
  if (sinceBeep(t, CUES.beep1) >= 0) {
    // beep1: integer 2x snap out of the phone — the window's world (0.4x) blown up 2x on
    // the 8-px grid fills the frame, its vanishing point on the hero's; beep2 then cuts to
    // the same world at native 1x (0.8 -> 1.0: the zoom keeps going, the pixels sharpen).
    // The HUD and the BIP! burst are drawn AFTER the blit, at native 1x.
    // (the roadside sign, the one prop tracked through the dash, is painted into S.world2x at
    // init, so it shares the world's 8-px grid)
    L.drawImage(S.world2x, 0, 0, LW, LH);
    drawWorldHUD(t);
    drawBips(L, t);
    return;
  }
  bgScene1(t, f);
  putBG();
  if (t < CUES.powerOn) { drawSpeakerHint(L, f); return; }
  L.save();
  L.drawImage(S.phone1, PH1.x - 1, PH1.y - 1);
  R(L, SC1.x - 1, SC1.y - 1, SC1.w + 2, SC1.h + 2, X.ink);
  R(L, SC1.x, SC1.y, SC1.w, SC1.h, X.screenBk);
  // speaker + camera
  rrect(L, CX - 14, PH1.y + 7, 28, 4, 2, X.ink); disc(L, CX + 24, PH1.y + 9, 2, X.ink); R(L, CX + 23, PH1.y + 8, 1, 1, '#5d7bd6');
  if (t < CUES.appReady) {
    // CRT power-on: line -> vertical expansion
    const p = prog(t, CUES.powerOn, CUES.appReady);
    const cy = SC1.y + SC1.h / 2;
    const hh = Math.max(1, ri(inQuad(p) * SC1.h / 2));
    L.save();
    L.beginPath(); L.rect(SC1.x, cy - hh, SC1.w, hh * 2); L.clip();
    drawApp1(L, t);
    // the fresh picture burns in from a WARM white, quadratic (nearly clean by the last frame
    // of the expansion): never a washed-out grey/lavender frame
    L.globalAlpha = 0.85 * (1 - p) * (1 - p);
    R(L, SC1.x, SC1.y, SC1.w, SC1.h, '#fff3d8');
    L.globalAlpha = 1;
    L.restore();
    const lw = ri(SC1.w * Math.min(1, p * 4));
    // CRT bloom: a dithered cyan halo that grows with the line and dies as the picture opens
    ditherGlow(L, CX, cy, 24 + 130 * p, 5 + 70 * inQuad(p), 0.95 * Math.pow(1 - p, 1.5), '#dff6ff', '#73eff7');
    R(L, CX - lw / 2, cy - hh - 1, lw, 2, '#ffffff');
    R(L, CX - lw / 2, cy + hh - 1, lw, 2, '#ffffff');
    R(L, CX - lw / 2 - 4, cy - 1, lw + 8, 2, '#dff6ff');
  } else {
    drawApp1(L, t);
    // CRT sheen right after power-on: ONE bright scan band sweeping down the fresh screen
    // (no full-screen veil, so the first app frames keep their colour: no washed grey frame)
    if (t < CUES.appReady + 0.2) {
      const p = prog(t, CUES.appReady, CUES.appReady + 0.2);
      const by = ri(SC1.y + p * SC1.h);
      L.globalAlpha = 0.35 * (1 - p);
      R(L, SC1.x, by - 10, SC1.w, 10, '#ffffff');
      L.globalAlpha = 0.6 * (1 - p);
      R(L, SC1.x, by - 2, SC1.w, 2, '#ffffff');
      L.globalAlpha = 1;
    }
    // warm afterglow spilling off the freshly lit screen onto the bezel and the room
    if (t < AFTERGLOW_END) {
      const q = prog(t, CUES.appReady, AFTERGLOW_END);
      ditherGlow(L, CX, SC1.y + SC1.h / 2, SC1.w / 2 + 34, SC1.h / 2 + 34, 0.75 * (1 - q), '#ffd89a', '#ef7d57', SC1);
    }
  }
  L.restore();
  // flash of the power-on on the whole frame (2 frames, faint): a WARM PLUM lift (the
  // bezel's hue), same luminance as before, never a neutral slate/grey veil
  if (t < CUES.powerOn + 0.067) {
    L.globalAlpha = 0.2 * (1 - prog(t, CUES.powerOn, CUES.powerOn + 0.067));
    R(L, 0, 0, LW, LH, '#e0507a');
    L.globalAlpha = 1;
  }
}
const AFTERGLOW_END = 1.4;
const PUFF_SHAKE = [2, 2, 1, 1, 1]; // lo px amplitude per frame since CUES.puff

// Snap-zoom helpers. coverPromptBand repaints everything above the zoomed scene window with
// the zoomed app background (no half-cut zoomed prompt in the top UI band); drawZoomHUD then
// redraws the prompt + listening wave UNZOOMED, below the platform top bar (lo y >= 42),
// inside the SAFE width and centred on the SAFE axis. The prompt is set at s = 2 only when it
// fits SAFE: 'QUAL É O DESENHO?' (17 chars, ~255 px at s = 2) does not, so it drops to s = 1.
function coverPromptBand(k, bcx, bcy, dcy) {
  const bandH = ri((WIN.y - bcy) * k + dcy);
  if (bandH <= 0) return;
  const sx0 = Math.floor(bcx - CX / k), sy0 = Math.floor(bcy - dcy / k);
  const ddx = ri((sx0 - bcx) * k + CX), ddy = ri((sy0 - bcy) * k + dcy);
  const sw = Math.ceil(LW / k) + 2, sh = Math.ceil(bandH / k) + 2;
  L.save();
  L.beginPath(); L.rect(0, 0, LW, bandH); L.clip();
  L.drawImage(S.scr1, sx0 - SC1.x, sy0 - SC1.y, sw, sh, ddx, ddy, sw * k, sh * k);
  L.restore();
}
function drawZoomHUD(t, k, bcx, bcy, dcy, amp = 3, pulse = 0) {
  coverPromptBand(k, bcx, bcy, dcy);
  const s = textWidth(COPY.quizPrompt, 'ps', 2, -1) <= SAFE_L.x1 - SAFE_L.x0 - 8 ? 2 : 1;
  drawText(L, COPY.quizPrompt, 'ps', { s, track: s > 1 ? -1 : 0, fill: [X.cream, X.gold], ext: { d: s, c: X.ink } }, CXE, ZOOM_PROMPT_Y, 'c');
  drawWave(L, CXE, ZOOM_PROMPT_Y + (s > 1 ? 32 : 24), 17, t, amp * 0.7, pulse * 0.75);
}
const ZOOM_PROMPT_Y = 48; // lo px: the acute of the É sits at 42 (s = 2) / 45 (s = 1), below SAFE.y0
// Local one-frame impact burst: short radial dashes round the UPPER half of a round subject
// (k-px thick) — nothing under the body, where strokes could read as legs.
function impactBurst(ctx, cx, cy, k) {
  const r0 = 15 * k, r1 = 21 * k;
  for (let i = 0; i <= 6; i++) {
    const an = Math.PI + (i / 6) * Math.PI;
    for (let s = r0; s <= r1; s += 1) {
      const x = ri(cx + Math.cos(an) * s), y = ri(cy + Math.sin(an) * s * 0.9);
      R(ctx, x, y + 1, k, k, X.ink);
      R(ctx, x, y, k, k, '#ffffff');
    }
  }
}

// Integer zoom of the current low-res frame: source point (cx,cy) lands on (dcx,dcy).
// Returns the output offset of the zoomed pixel grid (for k-aligned overlays).
function zoomLo(k, cx, cy, dcx, dcy) {
  TX.clearRect(0, 0, LW, LH);
  TX.drawImage(lo, 0, 0);
  const x0 = Math.floor(cx - dcx / k), y0 = Math.floor(cy - dcy / k);
  const dx0 = ri((x0 - cx) * k + dcx), dy0 = ri((y0 - cy) * k + dcy);
  const sw = Math.min(LW - x0, Math.ceil((LW - dx0) / k)), sh = Math.min(LH - y0, Math.ceil((LH - dy0) / k));
  R(L, 0, 0, LW, LH, '#000000');
  L.drawImage(tmp, x0, y0, sw, sh, dx0, dy0, sw * k, sh * k);
  return { gx: ((dx0 % k) + k) % k, gy: ((dy0 % k) + k) % k };
}
// Dithered glow ellipse: density falls off with radius (ordered dither, no alpha).
function ditherGlow(ctx, cx, cy, rx, ry, a, cIn, cOut, excl) {
  if (a <= 0 || rx < 1 || ry < 1) return;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(LW - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(LH - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (excl && x >= excl.x && x < excl.x + excl.w && y >= excl.y && y < excl.y + excl.h) continue;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, e = dx * dx + dy * dy;
    if (e >= 1) continue;
    const dens = a * (1 - Math.sqrt(e));
    const b = bay(x, y);
    if (b >= dens) continue;
    ctx.fillStyle = b < dens * 0.4 ? cIn : cOut;
    ctx.fillRect(x, y, 1, 1);
  }
}
// ")))" sound arcs radiating from a sound source at (x, y), one wave every quarter second
// from t0; beat = 1 turns the inner arc white (a hit). Drawn on the ZOOMED pixel grid
// (k x k blocks at offset gx/gy) as solid strokes, so they share the zoomed art's pixel
// size; they fade by dropping the outermost arc, never by skipping pixels. Arcs sit above
// the source (upper sweep only).
function drawSoundArcs(ctx, x, y, t, k, gx = 0, gy = 0, beat = 0, t0 = CUES.beep1) {
  const fs = { beat };
  const ph = ((((t - t0) * 4) % 1) + 1) % 1;
  const snap = (v, o) => o + Math.floor((v - o) / k) * k;
  const cy = y - 3 * k;
  for (let i = 0; i < 3; i++) {
    if (i + ph > 2.35) continue;                    // the outermost arc drops out
    const rr = (9 + (i + ph) * 4.5) * k;
    const seen = new Map();
    for (const side of [-1, 1]) {
      for (let a = -0.95; a <= 0.35; a += 0.35 / rr) {
        const px = snap(x + side * Math.cos(a) * rr, gx), py = snap(cy + Math.sin(a) * rr, gy);
        const key = px + ',' + py;
        if (seen.has(key)) continue;
        seen.set(key, [px, py]);
        R(ctx, px, py + k, k, k, X.ink);
      }
    }
    const col = fs.beat && i === 0 ? '#ffffff' : X.fY;
    for (const [px, py] of seen.values()) R(ctx, px, py, k, k, col);
  }
}
// Hot-orange duotone of the current frame (e.g. the frame after a white impact flash, per the
// flash rule white -> warm tint -> saturated colour): saturated, never grey.
const HOT = ['#5a0a14', '#b51f1f', '#ff5a1f', '#ff8a1f', '#ffc23a', '#fff3b0'].map(hexRGB);
function hotTint() {
  const img = L.getImageData(0, 0, LW, LH), d = img.data;
  const n = HOT.length - 1;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = (y * LW + x) * 4;
    const lum = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
    // white maps to #ffc23a at most (not cream), so this frame is orange, not a 2nd white-out
    const f = clamp(0.12 + lum * 0.68, 0, 1) * n;
    const i0 = Math.min(n - 1, Math.floor(f));
    const c = HOT[(f - i0) > bay(x, y) ? i0 + 1 : i0];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  L.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------
// Scene 2 — mechanic
function drawKey(ctx, k, state) {
  // state: {down, lit, glow}
  const r = keyRect(k);
  let face = '#5a6390', side = '#2b3052', hi = '#8a93c4', lab = '#ffffff';
  if (k === OK_INDEX) { face = '#38b764'; side = '#1a6b45'; hi = '#a7f070'; }
  if (k === BS_INDEX) { face = '#b13e53'; side = '#6b1f33'; hi = '#ef7d57'; }
  if (state.lit) { face = X.gold; side = '#c9791c'; hi = X.cream; lab = X.ink; }
  if (state.glow) { face = state.glow > 0.6 ? '#ffffff' : X.cream; side = X.amber; hi = '#ffffff'; lab = X.ink; }
  const dn = state.down ? 1 : 0;
  if (state.glow) rrect(ctx, r.x - 2, r.y - 2 + dn, r.w + 4, r.h + 3, 4, 'rgba(255,230,120,0.55)');
  rrect(ctx, r.x - 1, r.y - 1 + dn, r.w + 2, r.h + 2 - dn, 3, X.ink);
  rrect(ctx, r.x, r.y + dn, r.w, r.h - dn, 2, side);
  rrect(ctx, r.x, r.y + dn, r.w, r.h - 2, 2, face);
  R(ctx, r.x + 2, r.y + dn, r.w - 4, 1, hi);
  // label, centred on its ink box. Face rows 0..13 (row 0 = top light): a plain capital
  // sits on rows 4..10 (3 clear rows each side); an accented one drops a row so its accent
  // (rows 2..3) keeps a clear row under the top light; Ç rises a row so the cedilla (rows
  // 10..12) keeps a clear row over the side shade.
  const ch = k < KEYBOARD.length ? KEYBOARD[k] : k === OK_INDEX ? 'OK' : '';
  const ly = r.y + dn + 4 + (glyphUp(ch) ? 1 : 0) - (glyphDown(ch) ? 1 : 0);
  if (k === BS_INDEX) {
    // backspace arrow (9 px: tip + 8-px shaft), centred
    const ax = r.x + ((r.w - 9) >> 1);
    R(ctx, ax + 1, ly + 3, 8, 1, lab); R(ctx, ax + 1, ly + 2, 1, 3, lab); R(ctx, ax, ly + 3, 1, 1, lab); R(ctx, ax + 2, ly + 1, 1, 5, lab);
  } else {
    const o = { s: 1, fill: lab, track: 0 };            // OK at track 0: the O and K never share a stem
    drawText(ctx, ch, 'ps', o, r.x + ((r.w - textSprite(ch, 'ps', o).inkW) >> 1), ly, 'l');
  }
}

function typingEvents() {
  const ev = CUES.keyTimes.map((kt, i) => ({ t: kt, k: keyIndexOf(ANSWER[i]), i }));
  ev.push({ t: CUES.enter, k: OK_INDEX, i: -1 });
  return ev;
}
const EVENTS = typingEvents();
// The pointing finger's axis (unit vector from the tip toward the wrist): the hand yaws a
// little as it reaches left, ~43 deg off vertical at the left column, ~32 deg at the right.
function thumbAxis(px) {
  const th = ((43 - (clamp(px, 66, 204) - 66) * (11 / 138)) * Math.PI) / 180;
  return [Math.sin(th), Math.cos(th)];
}
// The pad lands on the key's lower right, placed so the APEX of the fingertip (the tip
// circle's far point along the axis) rests on the key's centre: the skin apex is 1.5 px past
// the centre along the axis and its 1-px outline covers the centre itself, so the visible
// tip touches the centre while the top of the pressed key and its letter show above it.
const TIP_REACH = 3 + 7.5 + 1.5; // pad -> tip-circle centre (3) + tip radius (7.5) + 1.5 px
function contactPoint(k) {
  const r = keyRect(k), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  let p = [cx + 6, cy + 8];
  for (let i = 0; i < 3; i++) { const u = thumbAxis(p[0]); p = [cx + TIP_REACH * u[0], cy + TIP_REACH * u[1]]; }
  return p;
}
const HOVER = [186, 306];          // resting pad position (scene-2 coords, before oy)
const PRESS_HOLD = 0.1;
const EXIT_DUR = 0.35;             // the hand leaves the frame after OK, before the reveal

// Pad position + lift (0 = touching, 1 = hovering) + exit progress.
// Presses followed by a short hop (the "2" of the 3-3-2 rhythm: next press <= 8 frames later)
// lift on the frame right after the key frame instead of holding PRESS_HOLD, so the hand gets
// 5 travel frames instead of 2 (no one-frame teleport of the whole forearm).
const SHORT_HOP_F = 8;
const shortHop = (j) => j + 1 < EVENTS.length && keyFrame(EVENTS[j + 1].t) - keyFrame(EVENTS[j].t) <= SHORT_HOP_F;
function thumbState(t) {
  const first = EVENTS[0];
  const f0 = keyFrame(first.t) - 9, t0 = f0 / FPS;   // the approach starts 9 frames before P
  t = frameOf(t) / FPS; // frame-quantised: the same pose for any render time inside a frame
  if (frameOf(t) < f0) return { x: HOVER[0], y: HOVER[1] + ri(Math.sin(t * 6) * 1.5), h: 1, out: 0 };
  let prev = { t: t0, pos: HOVER };
  for (let j = 0; j < EVENTS.length; j++) {
    const ev = EVENTS[j], pos = contactPoint(ev.k);
    // the pad touches down on the frame BEFORE the key's first frame, for every key
    const kf = keyFrame(ev.t);
    const pressA = (kf - 1) / FPS - 1e-6, pressB = kf / FPS + (shortHop(j) ? 0 : PRESS_HOLD) + 1e-6;
    if (t < pressA) {
      // long hops (P <-> A cross the whole keyboard) ease in-out SINE: peak speed ~1.57x the
      // mean instead of ~2.2x, so the hand does not strobe across the frame in two jumps
      const u = prog(t, prev.t, pressA), dd = Math.hypot(pos[0] - prev.pos[0], pos[1] - prev.pos[1]);
      const e = dd > 100 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : inOutCubic(u);
      // lift: an arc between two presses; from the hover (already lifted, h = 1) it only
      // descends, so there is no one-frame "touch" when the approach starts
      const hu = Math.min(1, u * 1.08), h = j === 0 ? Math.sin(Math.PI * (0.5 + 0.5 * hu)) : Math.sin(Math.PI * hu);
      return { x: lerp(prev.pos[0], pos[0], e), y: lerp(prev.pos[1], pos[1], e) - Math.sin(u * Math.PI) * 5, h, out: 0 };
    }
    if (t < pressB) return { x: pos[0], y: pos[1], h: 0, out: 0 };
    prev = { t: pressB, pos };
  }
  // after OK: lift and slide down-right out of frame
  const u = prog(t, prev.t, prev.t + EXIT_DUR);
  const e = inQuad(u);
  return { x: prev.pos[0] + 150 * e, y: prev.pos[1] + 250 * e, h: Math.min(1, u * 4), out: u };
}

// ---- limb painter: tapered capsules, 4-tone skin ramp with ordered dither, rim light,
// 1-art-px outline, optional nail + knuckle creases, and a dithered drop shadow.
const SKIN = { out: X.skinOut, lt: '#ffdcc2', base: X.skin, sh: X.skinSh, dk: '#9a5a3e', rim: '#ffc2dc' };
const NAIL = { fill: '#ffe6da', sh: '#f0b9a6', out: '#b87464', hi: '#ffffff' };
const LIGHT = [-0.62, -0.78];
// Segment evaluation without allocation: the scalar results land in SE (hot loop).
const SE = { m: 0, s: 0, s0: 0, qx: 0, qy: 0, r: 0 };
function prepSeg(sg) {
  if (sg._p) return sg;
  sg.vx = sg.bx - sg.ax; sg.vy = sg.by - sg.ay; sg.ll = sg.vx * sg.vx + sg.vy * sg.vy;
  sg.len = Math.sqrt(sg.ll); sg._p = 1;
  return sg;
}
function segM(sg, px, py) {
  const s0 = sg.ll > 0 ? ((px - sg.ax) * sg.vx + (py - sg.ay) * sg.vy) / sg.ll : 0;
  const s = s0 < 0 ? 0 : s0 > 1 ? 1 : s0;
  const qx = px - (sg.ax + sg.vx * s), qy = py - (sg.ay + sg.vy * s);
  const r = sg.r0 + (sg.r1 - sg.r0) * s;
  SE.s = s; SE.s0 = s0; SE.qx = qx; SE.qy = qy; SE.r = r;
  return (SE.m = Math.sqrt(qx * qx + qy * qy) - r);
}
function segsBox(segs, dx, dy) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const sg of segs) {
    const rr = Math.max(sg.r0, sg.r1) + 2;
    x0 = Math.min(x0, sg.ax - rr, sg.bx - rr); x1 = Math.max(x1, sg.ax + rr, sg.bx + rr);
    y0 = Math.min(y0, sg.ay - rr, sg.by - rr); y1 = Math.max(y1, sg.ay + rr, sg.by + rr);
  }
  return { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy };
}
function limbBox(layers, extra) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ly of layers) { const b = segsBox(ly.segs, 0, 0); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(LW, Math.ceil(x1 + (extra ? extra[0] : 0))); y1 = Math.min(LH, Math.ceil(y1 + (extra ? extra[1] : 0)));
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
// layers: [{segs:[{ax,ay,bx,by,r0,r1}], pal, nail?:{seg,s0,s1,w}, creases?:[{seg,at,w,c}], fall?:{x,y,k}}]
// shadow: {segs, dx, dy, a}
// anchor: integer [ax, ay] the ramp / shadow Bayer cells are keyed to, so the dither travels
// with the sprite instead of crawling over it (no shower-door effect when the hand moves)
function paintLimbs(layers, shadow, anchor) {
  const ax = anchor ? anchor[0] | 0 : 0, ay = anchor ? anchor[1] | 0 : 0;
  const bb = limbBox(layers, shadow ? [shadow.dx, shadow.dy] : null);
  if (bb.w <= 0 || bb.h <= 0) return;
  for (const ly of layers) { ly.segs.forEach(prepSeg); ly._bb = segsBox(ly.segs, 0, 0); }
  if (shadow) { shadow.segs.forEach(prepSeg); shadow._bb = segsBox(shadow.segs, shadow.dx, shadow.dy); }
  const img = L.getImageData(bb.x0, bb.y0, bb.w, bb.h), d = new Uint32Array(img.data.buffer);
  const P = layers.map((ly) => ({ out: u32(ly.pal.out), lt: u32(ly.pal.lt), base: u32(ly.pal.base), sh: u32(ly.pal.sh), dk: u32(ly.pal.dk || ly.pal.sh), rim: ly.pal.rim ? u32(ly.pal.rim) : 0 }));
  const N = { fill: u32(NAIL.fill), sh: u32(NAIL.sh), out: u32(NAIL.out), hi: u32(NAIL.hi) };
  for (let j = 0; j < bb.h; j++) {
    const y = bb.y0 + j, py = y + 0.5;
    for (let i = 0; i < bb.w; i++) {
      const x = bb.x0 + i, px = x + 0.5, idx = j * bb.w + i;
      let col = 0;
      for (let li = 0; li < layers.length; li++) {
        const ly = layers[li], lb = ly._bb;
        if (px < lb.x0 || px > lb.x1 || py < lb.y0 || py > lb.y1) continue;
        let bm = 1e9, bi = -1;
        for (let k = 0; k < ly.segs.length; k++) {
          const m = segM(ly.segs[k], px, py);
          if (m < bm) { bm = m; bi = k; }
        }
        if (bm > 1.0) continue;
        const pal = P[li];
        if (bm > 0) { col = pal.out; continue; }
        const sg = ly.segs[bi];
        segM(sg, px, py); // refresh SE for the winning segment
        const nd = (SE.qx * LIGHT[0] + SE.qy * LIGHT[1]) / Math.max(1, SE.r);
        let v = nd * 1.05 + (bay(x - ax, y - ay) - 0.5) * (ly.dith ?? 0.34);
        if (ly.fall) v -= clamp(((px - ly.fall.x) * 0.55 + (py - ly.fall.y) * 0.85) / ly.fall.k, 0, 0.7);
        let c = v > 0.52 ? pal.lt : v > -0.12 ? pal.base : v > -0.62 ? pal.sh : pal.dk;
        if (pal.rim && bm > -1.35 && nd < -0.4) c = pal.rim;
        if (ly.creases) for (const cr of ly.creases) {
          if (cr.seg !== bi) continue;
          const along = SE.s0 * sg.len;
          const cross = Math.abs((SE.qx * sg.vy - SE.qy * sg.vx) / Math.max(1e-6, sg.len));
          if (Math.abs(along - cr.at) < 0.5 && cross < SE.r * cr.w && bm < -1.2) c = cr.c === 'dk' ? pal.dk : pal.sh;
        }
        if (ly.nail && ly.nail.seg === bi) {
          const nl = ly.nail;
          const along = SE.s0;                       // 0 at the tip end, 1 at the joint
          const cr = ((px - sg.ax) * -sg.vy + (py - sg.ay) * sg.vx) / Math.max(1e-6, sg.len); // signed
          const hw = SE.r * nl.w;
          if (along > nl.s0 && along < nl.s1 && Math.abs(cr) < hw) {
            const edge = Math.abs(cr) > hw - 1.05 || along < nl.s0 + 1.05 / sg.len || along > nl.s1 - 1.05 / sg.len;
            const lightSide = cr * (LIGHT[0] * -sg.vy + LIGHT[1] * sg.vx) > 0;
            c = edge ? N.out : lightSide ? N.fill : N.sh;
            if (!edge && lightSide && along < nl.s0 + 3.2 / sg.len && Math.abs(cr) > hw * 0.25 && Math.abs(cr) < hw * 0.25 + 1.2) c = N.hi;
          }
        }
        col = c;
      }
      if (col) { d[idx] = col; continue; }
      if (shadow) {
        const sb = shadow._bb;
        if (px < sb.x0 || px > sb.x1 || py < sb.y0 || py > sb.y1 || bay(x - ax, y - ay) >= shadow.a) continue;
        let m = 1e9;
        for (const sg of shadow.segs) { const mm = segM(sg, px - shadow.dx, py - shadow.dy); if (mm < m) m = mm; }
        if (m < 0) {
          const c0 = d[idx];
          const r = (c0 & 255) * 0.5, g = ((c0 >>> 8) & 255) * 0.42, b = ((c0 >>> 16) & 255) * 0.62;
          d[idx] = u32rgb(r | 0, g | 0, b | 0);
        }
      }
    }
  }
  L.putImageData(img, bb.x0, bb.y0);
}
const rot = (u, a) => [u[0] * Math.cos(a) - u[1] * Math.sin(a), u[0] * Math.sin(a) + u[1] * Math.cos(a)];
const seg = (a, b, r0, r1) => ({ ax: a[0], ay: a[1], bx: b[0], by: b[1], r0, r1 });
const add = (p, u, k) => [p[0] + u[0] * k, p[1] + u[1] * k];

// The typing hand: an anatomical thumb from the lower right (≈32–43° off vertical), nail,
// knuckle creases, thenar/palm mass joined to the cuff and sleeve, hover shadow on the keys.
function drawHand(ctx, t, oy) {
  const st = thumbState(t);
  if (st.out >= 1) return;
  const h = st.h;
  // lifted (hover / travel / exit) poses snap to whole lo px, so frame to frame the hand is an
  // integer translation (its outline does not re-rasterise and shimmer); contact poses (h = 0)
  // keep the exact key contact point
  const snapP = h > 0;
  const Px = snapP ? ri(st.x) : st.x, Py = (snapP ? ri(st.y) : st.y) + oy;
  // the whole hand yaws a little as the thumb reaches left
  const u = thumbAxis(Px);                            // from the tip toward the wrist
  const rt = h > 0.5 ? 1 : 0;                         // a lifted tip is a hair nearer the lens
  const E = add([Px, Py], u, -3);                     // centre of the rounded tip
  const J = add(E, u, 19);                            // IP knuckle
  const u2 = rot(u, -0.12), M = add(J, u2, 22);       // MCP knuckle
  const u3 = rot(u, -0.34), Hn = add(M, u3, 30);      // thenar / base of the thumb
  const Wr = [Hn[0] + 28, Hn[1] + 62];                // wrist
  const palmA = [M[0] + 20, M[1] + 4], palmB = [Wr[0] + 10, Wr[1] - 12];
  const thumb = [seg(E, J, 7.5 + rt, 9), seg(J, M, 9.5, 11), seg(M, Hn, 11.5, 18), seg(Hn, Wr, 20, 26)];
  const palm = [seg(palmA, palmB, 15, 27)];
  const cuffA = add(Wr, [0.42, 0.9], 20), cuffB = add(Wr, [0.42, 0.9], 44);
  const slA = add(Wr, [0.42, 0.9], 44), slB = add(Wr, [0.42, 0.9], 190);
  const fall = { x: Px, y: Py, k: 260 };
  const anc = [ri(Px), ri(Py)];                       // dither keyed to the hand, not the screen
  paintLimbs([
    { segs: [seg(slA, slB, 33, 38)], pal: { out: X.ink, lt: X.pinkLt, base: X.pink, sh: X.pinkDk, dk: '#8a1068' } },
    { segs: palm, pal: SKIN, fall },
    { segs: [seg(cuffA, cuffB, 31, 32)], pal: { out: X.ink, lt: '#e0ffff', base: '#73eff7', sh: '#2a9fb0', dk: '#1d6f80' } },
    {
      segs: thumb, pal: SKIN, fall,
      nail: { seg: 0, s0: -0.24, s1: 0.4, w: 0.58 },
      creases: [{ seg: 1, at: 2, w: 0.5, c: 'sh' }, { seg: 1, at: 4, w: 0.42, c: 'dk' }, { seg: 2, at: 2, w: 0.45, c: 'sh' }],
    },
  ], { segs: thumb.slice(0, 3), dx: 2 + ri(5 * h), dy: 3 + ri(7 * h), a: 0.55 + 0.2 * (1 - h) }, anc);
  // A POINTING hand (index extended, back of the hand toward us): the other three fingers
  // curl under the knuckle row, and the thumb tucks along the near (left) side.
  const pr = [u[1], -u[0]];                            // across the knuckle row, toward the pinky
  const CURL = [[14, 8.5, 11], [24, 8, 10], [33, 6.5, 8]]; // offset from M, radius, forward reach
  const curled = CURL.map(([o, r, reach]) => {
    const K = add(add(M, pr, o), u, 2 + o * 0.22);
    return { segs: [seg(add(K, u, -reach), add(K, u, 3), r - 0.5, r)], pal: SKIN, fall, creases: [{ seg: 0, at: reach - 2, w: 0.55, c: 'sh' }] };
  });
  // tucked thumb: short and fat, pressed against the side of the hand (no nail showing,
  // so it never reads as a second extended finger)
  const T0 = add(add(Hn, pr, -15), u, 2), T1 = add(add(T0, u, -10), pr, 4);
  paintLimbs([
    { segs: [seg(T1, T0, 8, 10)], pal: SKIN, fall, creases: [{ seg: 0, at: 4, w: 0.5, c: 'sh' }] },
    ...curled.reverse(),
  ], { segs: curled.map((c) => c.segs[0]), dx: 2, dy: 3, a: 0.45 }, anc);
}
// The holding hand: a palm at the phone's left edge and four fingertips curling round it,
// fanned from the palm, different lengths, the little finger visibly smaller.
// Staggered lengths (middle longest), widths tapering to the pinky (13/13/12/10 px incl.
// outline), fanned -7..+8 degrees from the knuckle row, a palm heel + thumb web at the left
// edge, and cel shading (flat tones with a 1-2 px dithered transition band only).
const FINGERS = [
  { y: 259, len: 38, ang: -7, r: 6.5 },
  { y: 274, len: 45, ang: -2, r: 6.5 },
  { y: 289, len: 40, ang: 3, r: 6 },
  { y: 303, len: 31, ang: 8, r: 4.8 },
];
const HOLD_PALM_Y = 282;
const CEL_DITHER = 0.08;
function drawFingers(ctx, oy) {
  paintLimbs([
    { segs: [seg([-20, 246 + oy], [-18, 334 + oy], 24, 26)], pal: SKIN, fall: { x: 30, y: 250 + oy, k: -160 }, dith: CEL_DITHER },
    // thumb web: a sliver of the base of the thumb curling over the top of the grip
    { segs: [seg([-6, 236 + oy], [5, 246 + oy], 7, 9)], pal: SKIN, dith: CEL_DITHER, creases: [{ seg: 0, at: 6, w: 0.5, c: 'sh' }] },
  ], null, [0, ri(oy)]);
  for (const fg of FINGERS) {
    const a = (fg.ang * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)];
    const base = [-4, HOLD_PALM_Y + (fg.y - HOLD_PALM_Y) * 0.8 + oy];
    const knuckle = add(base, dir, fg.len - 19);
    const tip = add(base, dir, fg.len - fg.r);
    paintLimbs([{
      segs: [seg(tip, knuckle, fg.r, fg.r + 0.4), seg(knuckle, base, fg.r + 0.8, fg.r + 1.4)],
      pal: { ...SKIN, rim: '#ffc2dc' },
      fall: { x: tip[0], y: tip[1], k: -120 },
      dith: CEL_DITHER,
      nail: { seg: 0, s0: -0.3, s1: 0.28, w: 0.55 },
      creases: [{ seg: 1, at: 2, w: 0.55, c: 'sh' }],
    }], { segs: [seg(tip, knuckle, fg.r, fg.r)], dx: 2, dy: 3, a: 0.5 }, [0, ri(oy)]);
  }
}

const SLOT_LAND = 0.25;   // a typed letter lands in its slot this long after the key press
const FLIGHT_T0 = 0.09;   // key-preview bubble until here, then the letter flies (5 frames)
const CHECK_RAMP = 15;    // frames of accelerating light before the whole row strobes
// key-preview balloon: head top sits on the outline of the key TWO rows up (row pitch 18).
// With an accent (or cedilla) in the answer the head is 4 rows taller (cream rows 0..24,
// top light on row 1) so the s=2 accent clears the light; textY is the plain cap line and
// bubbleTextY() moves marked letters so the whole mark stays inside the cream.
const BUB_X = ANS_UP || ANS_DN ? 1 : 0;
const BUB = { up: 2 * (KEY.h + KEY.gy) + 1, headH: 24 + 4 * BUB_X, textY: 5 + 2 * BUB_X };
const bubbleTextY = (ch) => BUB.textY + (glyphUp(ch) ? 2 : 0) - (glyphDown(ch) ? 3 : 0);
const CHASE_CLEAR_F = 4;  // dark frames between the idle chase and the first press
// Every press is counted in whole frames from the cue's first rendered frame, so key-down,
// glow, ring, IR LED, bubble, flight and landing all share one frame grid.
const LAND_F = Math.ceil(SLOT_LAND * FPS - 1e-6);     // frames from press to landing (8)
const evDt = (t, cue) => sinceKey(t, cue) / FPS;       // frame-quantised time since a press
// During the suspense the answer row steps down (integer lo px) into the optical centre of
// the spotlight, the band the scene-2 caption has just vacated.
const SLOT_DROP = CAP2_Y - (SLOT.y + (SLOT.h >> 1));
function slotShift(t) {
  if (t < CUES.checking) return 0;
  // frame-quantised (the exporter draws at n/30, QA at n/30 + 0.001: the same drop on both)
  return ri(SLOT_DROP * outCubic(prog(frameOf(t) / FPS + 1e-4, CUES.checking, CUES.checking + 0.15)));
}
function drawSlots(ctx, t, oy) {
  const checking = t >= CUES.enter && t < CUES.correct;
  const f = frameOf(t);
  const shift = slotShift(t);
  let nextIdx = 0;
  for (let i = 0; i < ANSWER.length; i++) if (sinceKey(t, CUES.keyTimes[i]) >= LAND_F) nextIdx = i + 1;
  for (let i = 0; i < ANSWER.length; i++) {
    const r = slotRect(i);
    const fl = sinceKey(t, CUES.keyTimes[i]) - LAND_F;   // frames since landing
    const filled = fl >= 0;
    let bg = '#141233', border = '#566c86', hop = 0, lit = false;
    if (filled) { bg = '#3b5dc9'; border = X.ink; }
    const flash = filled && fl < 3;
    if (flash) { bg = '#ffffff'; hop = -2; }
    else if (filled && fl < 6) hop = -1;
    if (!filled && i === nextIdx && t >= CUES.remoteReady && ((f >> 2) & 1)) border = X.gold;
    if (checking) {
      // a light runs ONCE along the answer, faster and faster (frame-driven, capped at 1.5
      // slots per frame so it never aliases), holds on the last letter (no wrap-around second
      // pass re-flashing the first tiles), then the whole row strobes
      const fr = f - firstFrame(CUES.checking + 0.05);
      const n = ANSWER.length;
      const pos = 0.33 * fr + (1.5 - 0.33) * fr * fr / (2 * CHECK_RAMP);
      const head = Math.min(Math.floor(pos), n - 1);
      const strobe = fr >= CHECK_RAMP;
      lit = fr >= 0 && !strobe && head === i;
      const trail = fr >= 0 && !strobe && head === i + 1 && pos >= 1;
      border = '#566c86'; bg = '#3b5dc9'; hop = 0;
      if (lit) { border = '#ffffff'; bg = X.gold; hop = -2; }
      else if (trail) { border = X.gold; bg = '#4b6be0'; hop = -1; }
      // strobe at 7.5 Hz (2 frames off, 2 on, ...) and ONLY the 1-px border toggles (the ramp's
      // slate / white): the fill and the tiles stay put, so the answer row never flickers at
      // 15 Hz as a block, the letters hold still while the viewer reads them, and the ramp
      // hands over to the strobe without a jump (the strobe opens on its dark phase)
      if (strobe) { const on = (((fr - CHECK_RAMP) >> 1) & 1) === 1; border = on ? '#e8e8f0' : '#566c86'; bg = '#3b5dc9'; hop = 0; }
      if (t < CUES.checking + 0.05) border = X.ink;
    }
    // the hop lifts the whole tile (not just the letter inside it), so an accent never
    // rides up into the border: rows are border 0, clear 1, accent 2..5, clear 6..7, cap
    // SLOT.ty (8)..21, extrusion 22..23, clear 24, border 25
    const y = r.y + oy + shift + hop;
    rrect(ctx, r.x - 1, y - 1, r.w + 2, r.h + 2, 3, X.ink);
    rrect(ctx, r.x, y, r.w, r.h, 2, border);
    rrect(ctx, r.x + 1, y + 1, r.w - 2, r.h - 2, 2, bg);
    if (filled) {
      // on a light tile (landing flash, gold checking light) the glyph turns ink so the
      // letter never vanishes; the extrusion is one DESIGN pixel (2 lo px at s=2)
      drawText(ctx, ANSWER[i], 'ps', flash || lit ? { s: 2, fill: X.ink } : { s: 2, fill: ['#ffffff', '#ffffff', X.cream], ext: { d: 2, c: X.ink, dx: 0 } }, r.x + r.w / 2, y + SLOT.ty, 'c');
    } else {
      R(ctx, r.x + 4, y + r.h - 5, r.w - 8, 2, border === X.gold ? X.gold : '#566c86');
    }
  }
}

// Overlays queued by the scene and painted by drawFrame AFTER the caption (flying letters
// must never pass behind the caption box).
const OVERLAYS = [];
function drawScene2Core(t, oy, beforeHands) {
  bgScene2(t);
  putBG();
  const f = frameOf(t);
  // floating background icons
  for (let k = 0; k < 16; k++) {
    const rng = mulberry32(k * 977 + 41);
    const x0 = rng() * LW, sp = 8 + rng() * 14, ph = rng() * 6.28;
    const y = ((rng() * (LH + 40) - t * sp) % (LH + 40) + (LH + 40)) % (LH + 40) - 20;
    const x = x0 + Math.sin(t * 1.3 + ph) * 6;
    const kind = k % S.floaters.length;
    const spr2 = S.floatersT[kind][k % 3];
    L.drawImage(spr2, ri(x), ri(y));
  }
  // phone
  L.drawImage(S.phone2, PH2.x - 1, PH2.y - 1 + oy);
  L.drawImage(S.scr2, SC2.x, SC2.y + oy);
  rrect(L, CX - 16, PH2.y + 8 + oy, 32, 4, 2, X.ink); disc(L, CX + 28, PH2.y + 10 + oy, 2, X.ink);
  drawAppBar(L, SC2.x, SC2.y + oy, SC2.w);
  drawText(L, COPY.quizPrompt, 'ps', { s: 1, fill: [X.cream, X.gold], ext: { d: 1, c: X.ink } }, CX - 12, SC2.y + 24 + oy, 'c');
  // small listening wave next to the prompt
  drawWave(L, CX + 70, SC2.y + 27 + oy, 5, t, 3, 0);
  drawSlots(L, t, oy);
  // remote
  L.drawImage(S.remote, RM.x - 1, RM.y - 1 + oy);
  // the idle chase stops while the thumb is on its way in, so the first press (P) is the only
  // lit key on its frame
  const chaseOn = t >= CUES.remoteReady && f < keyFrame(EVENTS[0].t) - CHASE_CLEAR_F;
  const chaseStep = f - firstFrame(CUES.remoteReady); // one step per frame, no repeats
  const keyDown = new Map();
  for (let j = 0; j < EVENTS.length; j++) {
    const ev = EVENTS[j], fe = sinceKey(t, ev.t);
    // a short-hop press springs back after 2 frames (the finger has already left)
    if (fe >= 0 && fe < 4) keyDown.set(ev.k, { down: fe < (shortHop(j) ? 2 : 4), glow: fe < 2 ? 1 : 0.5 });
    else if (fe >= 4 && fe < 9) keyDown.set(ev.k, { down: false, glow: 0.3 });
  }
  { const fo = sinceKey(t, CUES.enter); if (fo >= 0 && t < CUES.correct) keyDown.set(OK_INDEX, { down: fo < 4, glow: ((f >> 1) & 1) ? 1 : 0.4 }); }
  L.save(); L.translate(0, oy);
  for (let k = 0; k < KEY_N; k++) {
    const col = k % KEY.cols, row = Math.floor(k / KEY.cols);
    let lit = false;
    if (chaseOn) lit = ((col + row * 2 - chaseStep) % 6 + 6) % 6 === 0;
    else if (t < CUES.remoteReady) lit = false;
    const st = keyDown.get(k) || {};
    drawKey(L, k, { lit, down: !!st.down, glow: st.glow || 0 });
  }
  L.restore();
  // IR LED on the remote's top edge blinks with every press
  {
    let ir = 0;
    for (const ev of EVENTS) { const fe = sinceKey(t, ev.t); if (fe >= 0 && fe < 3) ir = Math.max(ir, fe < 1 ? 1 : 0.6); }
    if (ir) {
      const lx = RM.x - 1 + RM.w / 2 - 11, ly = RM.y - 1 + 4 + oy;
      ditherGlow(L, lx + 12, ly + 2, 22, 9, 0.55 * ir, '#ffd0dc', '#ff4f6a');
      rrect(L, lx, ly, 24, 4, 2, '#ff4f6a');
      R(L, lx + 3, ly + 1, 18, 2, ir > 0.8 ? '#ffffff' : '#ffc0cc');
    }
  }
  // key bursts, bubble and flying letters (frame-quantised: all start on the press frame)
  for (const ev of EVENTS) {
    const dt = evDt(t, ev.t);
    if (dt < 0 || dt > 0.3) continue;
    const r = keyRect(ev.k);
    const kx = r.x + r.w / 2, ky = r.y + r.h / 2 + oy;
    if (dt < 0.13) {
      // expanding ring around the key
      const q = dt / 0.13, rr = 9 + q * 9;
      for (let a = 0; a < 40; a++) {
        const an = (a / 40) * Math.PI * 2;
        const x = ri(kx + Math.cos(an) * rr * 1.25), y = ri(ky + Math.sin(an) * rr * 0.9);
        R(L, x, y, 1, 1, q < 0.5 ? '#ffffff' : X.gold);
      }
    }
    if (dt < 0.16) {
      // burst dots start just outside the key (11 px out; they used to start ON the label)
      // so the pressed key's white face and letter stay clean beside the fingertip
      const p = dt / 0.16, rad = 11 + p * 8;
      for (let a = 0; a < 8; a++) {
        const an = a * Math.PI / 4 + 0.2;
        const x = kx + Math.cos(an) * rad, y = ky + Math.sin(an) * rad;
        R(L, ri(x) - 1, ri(y) - 1, 3, 3, X.ink);
        R(L, ri(x), ri(y), 1 + (p < 0.5 ? 1 : 0), 1 + (p < 0.5 ? 1 : 0), a % 2 ? '#ffffff' : X.gold);
      }
    }
    if (ev.i < 0) continue;
    const ch = ANSWER[ev.i];
    // bubble head (22 wide) centred on the key; its letter is centred in the head (hx + 11)
    const hx = ri(kx - 11), hy = r.y - BUB.up + oy, tyB = bubbleTextY(ch);
    if (dt < FLIGHT_T0) {
      // key-preview balloon (like a phone keyboard): a head that covers the keys two rows up
      // COMPLETELY and a stem that hides the letter of the key right above, so no fragment of
      // another key (or the power button) peeks out round it. 1-px ink outline + drop shadow.
      const sx = ri(kx - 8), sy = hy + BUB.headH - 4;
      const sh = r.y + oy - 1 - sy;
      rrect(L, hx, hy + 1, 24, BUB.headH + 1, 6, '#07060d');           // drop shadow
      rrect(L, sx + 1, sy + 1, 17, sh + 1, 3, '#07060d');
      rrect(L, hx - 1, hy - 1, 24, BUB.headH + 2, 6, X.ink);            // ink outline
      rrect(L, sx - 1, sy, 18, sh + 1, 3, X.ink);
      rrect(L, sx, sy, 16, sh, 2, '#e8c98a');
      rrect(L, hx, hy, 22, BUB.headH, 5, '#e8c98a');
      rrect(L, hx, hy, 22, BUB.headH - 3, 5, X.cream);
      R(L, sx + 2, sy, 12, sh - 2, X.cream);
      R(L, hx + 5, hy + 1, 12, 1, '#ffffff');
      drawText(L, ch, 'ps', { s: 2, fill: X.ink }, hx + 11, hy + tyB, 'c');
    } else if (dt < SLOT_LAND) {
      // the letter leaves the bubble from its exact spot and lands on the slot's cap line
      const p = inOutCubic((dt - FLIGHT_T0) / (SLOT_LAND - FLIGHT_T0));
      const s = slotRect(ev.i);
      const x0 = hx + 11, y0 = hy + tyB, x1 = s.x + s.w / 2, y1 = s.y + SLOT.ty + oy;
      const x = lerp(x0, x1, p), y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * 18;
      // while the caption is up, the letter is simply NOT drawn on the frame it crosses the
      // caption box (and no trail dot lands inside it): a paused frame never reads as a letter
      // typed INTO the caption, and no half-alpha gold-on-navy mid-tones. It shows at the
      // bubble, hides for the one crossing frame and reappears near the slot (a zip in motion).
      const cap = CAPTIONS[1], capOn = t >= cap.t0 && t < cap.t1, cr = [captionRect(1)];
      const up2 = 2 * glyphUp(ch);
      const overCap = capOn && inRects(cr, ri(x) - 8, ri(y) - 2 - up2, 18, 20 + up2);
      OVERLAYS.push(() => {
        // trail
        for (let q = 1; q <= 3; q++) {
          const pp = Math.max(0, p - q * 0.12);
          const tx = lerp(x0, x1, pp), ty = lerp(y0, y1, pp) - Math.sin(pp * Math.PI) * 18;
          if (capOn && inRects(cr, ri(tx), ri(ty) + 6, 2, 2)) continue;
          R(L, ri(tx), ri(ty) + 6, 2, 2, q === 1 ? '#ffffff' : X.gold);
        }
        if (!overCap) drawText(L, ch, 'ps', { s: 2, fill: X.gold, out: X.ink }, x, y, 'c');
      });
    }
  }
  // hand
  {
    const sy = RM.y + RM.h + 12 + oy, sx0 = RM.x + 2;
    panel(L, sx0, sy, 150, 18, 8, { fill: '#1d1850', out: X.ink, hi: '#3b3490' });
    disc(L, sx0 + 9, sy + 9, 6, X.pink); disc(L, sx0 + 9, sy + 8, 5, '#ff74b8');
    for (let c = 0; c < 4; c++) R(L, sx0 + 7 + c, sy + 5 + c, 1, 7 - 2 * c, '#ffffff');
    const pp = 0.06 + 0.9 * prog(t, CUES.typeStart - 0.25, CUES.enter);
    const bx0 = sx0 + 22, bw = 118;
    R(L, bx0, sy + 7, bw, 4, X.ink);
    R(L, bx0 + 1, sy + 8, ri((bw - 2) * pp), 2, '#73eff7');
    disc(L, bx0 + 1 + ri((bw - 2) * pp), sy + 9, 3, X.ink); disc(L, bx0 + 1 + ri((bw - 2) * pp), sy + 9, 2, '#ffffff');
  }
  if (beforeHands) beforeHands();
  drawFingers(L, oy);
  drawHand(L, t, oy);
  // checking: a spotlight closes on the answer row, everything else dims (ordered dither)
  if (t >= CUES.checking && t < CUES.correct) {
    const r0 = slotRect(0), r1 = slotRect(ANSWER.length - 1);
    spotDim({ x: r0.x - 4, y: r0.y + oy + slotShift(t) - 4, w: r1.x + r1.w - r0.x + 8, h: r0.h + 8 }, (sinceCue(t, CUES.checking) + 1) / (0.15 * FPS));
  }
}
// Dim everything outside rect r by up to ~45% with ONE flat factor per frame (no per-pixel
// dither: a full-screen checkerboard would boil and turn to mush on a feed re-encode),
// stepped over the 0.15 s ramp; the 2-px soft edge is a flat half-strength band.
function spotDim(r, s) {
  if (s <= 0) return;
  const k = s < 0.34 ? 0.8 : s < 0.67 ? 0.65 : 0.55, ke = (1 + k) / 2;
  const img = L.getImageData(0, 0, LW, LH), d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const ex = Math.max(r.x - x, x - (r.x + r.w - 1), 0), ey = Math.max(r.y - y, y - (r.y + r.h - 1), 0);
    const e = Math.max(ex, ey);
    if (e === 0) continue;
    const kk = e <= 2 ? ke : k;
    const i = y * LW + x, c = d[i];
    d[i] = u32rgb(((c & 255) * kk) | 0, (((c >>> 8) & 255) * kk) | 0, (((c >>> 16) & 255) * Math.min(1, kk * 1.15)) | 0);
  }
  L.putImageData(img, 0, 0);
}

// The phone's rise (push-in part 2), in lo px below its rest: time-warped (p^1.6) so the first
// frames after the cut move less (the dark phone covers the bright poster over 3-4 frames:
// flash hygiene); the upward overshoot is halved (max ~6 lo px) so the app-bar wordmark never
// rises above SAFE.y0. From the overshoot's peak frame it settles over 4 frames with shrinking
// steps (2/3, 1/3, 1/6 of the peak, then rest): no clunk into rest before the remote is ready.
function riseOYraw(t) {
  const oyR = (1 - outBack(Math.pow(prog(t, CUES.pushIn + 0.1, CUES.remoteReady), 1.6), 1.4)) * 170;
  return ri(oyR < 0 ? oyR * 0.5 : oyR);
}
let RISE_PK = null;
function riseOY(t) {
  if (!RISE_PK) {
    RISE_PK = { f: 0, oy: 0 };
    for (let n = firstFrame(CUES.pushIn + 0.1); n <= firstFrame(CUES.remoteReady); n++) {
      const v = riseOYraw(n / FPS + 1e-4);
      if (v < RISE_PK.oy) RISE_PK = { f: n, oy: v };
    }
  }
  const f = frameOf(t), d = f - RISE_PK.f;
  if (RISE_PK.oy >= 0 || d <= 0) return riseOYraw(t);
  return d <= 3 ? ri(RISE_PK.oy * [2 / 3, 1 / 3, 1 / 6][d - 1]) : 0;
}
function drawScene2(t) {
  if (t < CUES.pushIn + 0.1) {
    // push-in, part 1: stepped integer zoom (2x, 3x, 4x) down into the canyon, centred on
    // the settling puff (the world without its HUD), speed lines on the zoomed grid, a cut
    drawScene1(t, true);
    // (continues the 2x hold: 3x, 4x, 6x on the landing point; the screen anchor eases from
    // the hold's (214) to the push-in's (190) over the three steps, so the lobed puff, its
    // "puf" and the sunlit sand grow in place instead of jumping up on the first step)
    const step = clamp(sinceCue(t, CUES.pushIn), 0, 2), k = [3, 4, 6][step];
    const ay = PUSH_YS[step], cx0 = ri(PUFF_AT[0]), cy0 = ri(PUFF_AT[1]);
    const g = zoomLo(k, cx0, cy0, CAN_ZD[0], ay);
    // speed lines on the ZOOMED pixel grid (k x k blocks), so no mixels: straight spokes only;
    // they skip the screen-space "puf" label's box (+1 block), so no spoke breaks a letter up
    const lb = pufLabelBox(step, k, cx0, cy0, ay), b = lb.box;
    const bx0 = b.x - k, by0 = b.y - k, bx1 = b.x + b.w + k, by1 = b.y + b.h + k;
    speedLines(t, CX, ay - 20, 0.8 + 0.2 * step, (x, y) => x + 2 * k <= bx0 || x >= bx1 || y + k <= by0 || y >= by1, k, g.gx, g.gy);
    drawPufLabel(step, lb);
    return;
  }
  // part 2: the hand + phone rise into the close-up with an overshoot
  const p = prog(t, CUES.pushIn + 0.1, CUES.remoteReady);
  const oy = riseOY(t);
  // speed lines stay OUTSIDE the phone so the prompt and slots read on the first frame, and
  // are painted BEFORE the hands so they never cross the fingers
  drawScene2Core(t, oy, p < 1 ? () => speedLines(t, CX, LH / 2, 1 - p, (x, y) => x < PH2.x - 2 || x > PH2.x + PH2.w + 3 || y < PH2.y + oy - 2) : null);
}
// On a coarse zoomed grid (g >= 3) every spoke snaps to a clean slope (0, 1:2, 1:1, 2:1, 90
// deg), so its block steps are uniform (no lightning-bolt jogs), is one block wide, and stops
// where it would touch (8-neighbourhood) a block of another spoke: spokes never merge.
const CLEAN_AN = [0, Math.atan(0.5), Math.PI / 4, Math.atan(2)];
function cleanAngle(an) {
  let best = 0, bd = 9;
  for (let q = 0; q < 4; q++) for (const a0 of CLEAN_AN) {
    const a = q * Math.PI / 2 + a0, d = Math.abs(Math.atan2(Math.sin(an - a), Math.cos(an - a)));
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
// On the 1x grid (the hand+phone rise) every spoke also snaps to a clean slope, steps along its
// major axis (uniform runs), is a short 2-lo white core with a 1-lo cream under-edge (never a
// long 1-px light hairline) and holds for 2 frames (seed f >> 1) instead of re-rolling per frame.
function fineSpeedLines(f, cx, cy, strength, mask) {
  const hf = f >> 1, edge = [], core = [], used = new Set();
  for (let k = 0; k < 28; k++) {
    const rng = mulberry32(k * 131 + hf * 7);
    const an = cleanAngle((k / 28) * Math.PI * 2 + rng() * 0.2);
    const dk = Math.round(an * 8 / Math.PI) & 15;   // one spoke per clean direction (no collinear dashes)
    if (used.has(dk)) continue;
    used.add(dk);
    const r0 = 110 + rng() * 60, len = (18 + rng() * 18) * strength;
    cleanSpoke(cx, cy, an, r0, len, mask, core, edge);
  }
  for (const c of edge) R(L, c[0], c[1], 1, 1, '#fff3c4');
  for (const c of core) R(L, c[0], c[1], 1, 1, '#ffffff');
}
// Cells of one clean-slope spoke (an from cleanAngle) on the 1x grid: steps along its major
// axis (uniform runs), a 2-lo core (thickness in y when |slope| < 1, else in x) and a 1-lo
// under-edge beyond it; pushed into core / edge lists so all edges can be painted first.
function cleanSpoke(cx, cy, an, r0, len, mask, core, edge) {
  const ca = Math.cos(an), sa = Math.sin(an), ax = Math.abs(ca), ay = Math.abs(sa);
  const majX = ax >= ay - 1e-9, m = majX ? ay / ax : ax / ay;
  const sx = ca > 1e-9 ? 1 : ca < -1e-9 ? -1 : 0, sy = sa > 1e-9 ? 1 : sa < -1e-9 ? -1 : 0;
  const shallow = majX && m < 1 - 1e-9;
  const x0 = ri(cx + ca * r0), y0 = ri(cy + sa * r0), n = Math.round(len * Math.max(ax, ay));
  for (let i = 0; i < n; i++) {
    const mi = Math.floor(i * m + 1e-9);
    const x = majX ? x0 + sx * i : x0 + sx * mi, y = majX ? y0 + sy * mi : y0 + sy * i;
    if (x < -3 || y < -3 || x >= LW || y >= LH) break;
    const c0 = [x, y], c1 = shallow ? [x, y + 1] : [x + 1, y], e = shallow ? [x, y + 2] : [x + 2, y];
    for (const c of [c0, c1]) if (!mask || mask(c[0], c[1])) core.push(c);
    if (!mask || mask(e[0], e[1])) edge.push(e);
  }
}
function speedLines(t, cx, cy, strength = 1, mask = null, g = 1, gx = 0, gy = 0) {
  if (g === 1) { fineSpeedLines(frameOf(t), cx, cy, strength, mask); return; }
  const f = frameOf(t), coarse = g >= 3, own = coarse ? new Map() : null, usedC = new Set();
  const snap = (v, o) => (g === 1 ? ri(v) : o + Math.floor((v - o) / g) * g);
  for (let k = 0; k < 28; k++) {
    const rng = mulberry32(k * 131 + f * 7);
    let an = (k / 28) * Math.PI * 2 + rng() * 0.2;
    const r0 = 110 + rng() * 60, len = (40 + rng() * 80) * strength;
    if (coarse) {
      an = cleanAngle(an);
      const dk = Math.round(an * 8 / Math.PI) & 15;  // one spoke per clean direction: no collinear dashes
      if (usedC.has(dk)) continue;
      usedC.add(dk);
    }
    const ca = Math.cos(an), sa = Math.sin(an);
    const mine = [];
    for (let s = 0; s < len; s += 1) {
      const x = snap(cx + ca * (r0 + s), gx), y = snap(cy + sa * (r0 + s), gy);
      if (x < -g || y < -g || x >= LW || y >= LH) break;
      if (coarse) {
        const bx = Math.round((x - gx) / g), by = Math.round((y - gy) / g);
        let hit = false;
        for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) {
          const o = own.get((bx + i) * 4096 + by + j);
          if (o !== undefined && o !== k) { hit = true; break; }
        }
        if (hit) break;
        mine.push(bx * 4096 + by);
      }
      if (mask && !mask(x, y)) continue;
      R(L, x, y, (!coarse && k % 3 === 0 ? 2 : 1) * g, g, '#ffffff');
    }
    if (coarse) for (const c of mine) own.set(c, k);
  }
}

// ---------------------------------------------------------------------------------------
// Scene 3 — reward
// Rectangles confetti must stay out of: the CORRETO! stamp and (while it is up) the caption.
function confettiExcl(t) {
  const out = [stampRect(3)];
  const cap = CAPTIONS[2];
  if (t >= cap.t0 && t < cap.t1) out.push(captionRect(2));
  return out;
}
const inRects = (rs, x, y, w, h) => rs.some((r) => x + w > r.x && x < r.x + r.w && y + h > r.y && y < r.y + r.h);
// Crisp piece: light top edge, dark bottom edge, flips to a sliver every other frame pair.
function confettiPiece(ctx, x, y, W0, H0, ci, flip) {
  const w = flip ? (W0 >= 3 ? 2 : 1) : W0;
  const x0 = x + ((W0 - w) >> 1);
  R(ctx, x0, y, w, H0, CONFETTI[ci]);
  R(ctx, x0, y, w, 1, CONF_HI[ci]);
  R(ctx, x0, y + H0 - 1, w, 1, CONF_SH[ci]);
}
const BURST_N = 120, CANNON_N = 30;
// burst colours that pop on the green flood (no lime): pink, gold, cyan, white, orange, purple, blue
const BURST_CI = [0, 1, 2, 3, 4, 6, 7, 1, 0, 3];
const CONF_BURST_C = [CX, CARD.y + CARD.h / 2 + 1];                   // behind the check badge
const CANNONS = [[SAFE_L.x0 + 2, 360, 1], [LW - 20, 360, -1]];      // bottom corners of SAFE
function drawConfetti(ctx, t) {
  const age = t - CUES.correct;
  const f = frameOf(t);
  const excl = confettiExcl(t);
  // THE confetti moment: a 360-degree burst from behind the badge on the hit (already open on
  // the cue frame), then drag + gravity so it blooms round the badge and falls
  for (let k = 0; k < BURST_N; k++) {
    const rng = mulberry32(k * 7717 + 9);
    const a = age + 0.08;                           // already open on the cue frame
    const ang = (k / BURST_N) * Math.PI * 2 + (rng() - 0.5) * 0.35, sp = 300 + rng() * 320;
    const drag = 3.0, tt = (1 - Math.exp(-drag * a)) / drag;
    const x = CONF_BURST_C[0] + Math.cos(ang) * sp * tt + Math.sin(a * 3 + k) * 3 * Math.min(1, a * 2);
    const y = CONF_BURST_C[1] + Math.sin(ang) * sp * tt * 0.95 + 70 * a * a;
    const W0 = 3 + (k & 1), H0 = 4 + Math.floor(rng() * 2);
    const xi = ri(x), yi = ri(y);
    if (yi > LH + 4 || xi < -4 || xi > LW + 4 || inRects(excl, xi, yi, W0, H0)) continue;
    confettiPiece(ctx, xi, yi, W0, H0, BURST_CI[k % BURST_CI.length], ((f + k) >> 1) & 1);
  }
  // two cannons at the bottom corners of SAFE, aimed at the badge: their arcs cross the centre
  for (const [cx0, cy0, dir] of CANNONS) {
    const aim = Math.atan2(CONF_BURST_C[1] - 20 - cy0, CONF_BURST_C[0] - cx0);
    for (let k = 0; k < CANNON_N; k++) {
      const rng = mulberry32(k * 3571 + (dir > 0 ? 101 : 202));
      const a = age - rng() * 0.08;
      if (a < 0) continue;
      const ang = aim + (rng() - 0.5) * 0.5, sp = 380 + rng() * 260;
      const drag = 1.9, tt = (1 - Math.exp(-drag * a)) / drag;
      const x = cx0 + Math.cos(ang) * sp * tt + Math.sin(a * 3 + k) * 3 * Math.min(1, a * 2);
      const y = cy0 + Math.sin(ang) * sp * tt + 95 * a * a;
      const W0 = 2 + Math.floor(rng() * 3), H0 = 3 + Math.floor(rng() * 3);
      const xi = ri(x), yi = ri(y);
      if (yi > LH + 4 || xi < -4 || xi > LW + 4 || inRects(excl, xi, yi, W0, H0)) continue;
      confettiPiece(ctx, xi, yi, W0, H0, BURST_CI[(k * 3 + (dir > 0 ? 2 : 5)) % BURST_CI.length], ((f + k + 1) >> 1) & 1);
    }
  }
  // second pop from behind the character card
  const ca = t - CUES.characterIn;
  if (ca >= 0) {
    for (let k = 0; k < 80; k++) {
      const rng = mulberry32(k * 5113 + 77);
      const ang = -Math.PI / 2 + (rng() - 0.5) * 3.2, sp = 150 + rng() * 230;
      const drag = 2.4, tt = (1 - Math.exp(-drag * ca)) / drag;
      const x = CX + Math.cos(ang) * sp * tt + Math.sin(ca * 4 + k) * 3 * Math.min(1, ca * 3);
      const y = CARD.y + CARD.h / 2 + Math.sin(ang) * sp * tt + 90 * ca * ca;
      if (y > LH + 4 || x < -4 || x > LW + 4) continue;
      const spin = ca * (6 + rng() * 9) + k;
      const w = 1 + Math.round(2 * Math.abs(Math.cos(spin))), h = 1 + Math.round(2 * Math.abs(Math.sin(spin * 0.7)));
      if (inRects(excl, ri(x), ri(y), w, h)) continue;
      R(ctx, ri(x), ri(y), w, h, CONFETTI[(k + 5) % CONFETTI.length]);
    }
  }
  drawIdleBurst(ctx, t, excl);
}
// big foreground confetti: crisp solid 3x5..4x7 pieces with a light top edge and a dark
// bottom edge, flipping (full width -> 2 px) every two frames. They fall in the outer
// margins only (outside SAFE), so they never touch a text box.
function mixHex(a, b, k) { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => ri(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); }
const CONF_HI = CONFETTI.map((c) => mixHex(c, '#ffffff', 0.55));
const CONF_SH = CONFETTI.map((c) => mixHex(c, '#1a1c2c', 0.35));
function drawConfettiFG(ctx, t) {
  const age = t - CUES.correct;
  if (age < 0.2) return;
  const f = frameOf(t);
  for (let k = 0; k < 12; k++) {
    const rng = mulberry32(k * 8111 + 3);
    const per = 1.4 + rng() * 0.9;
    const a0 = age - 0.2 - k * 0.27;
    if (a0 < 0) continue;
    const a = a0 % per;
    const W0 = 3 + (k & 1), H0 = 5 + (k % 3);
    const left = k % 2 === 1;
    const lane = left ? 1 + rng() * 9 : SAFE_L.x1 + 3 + rng() * (LW - SAFE_L.x1 - 9 - W0);
    const x = ri(lane + Math.sin(a * 2 + k) * 2);
    const y = ri(-10 + a * (LH + 20) / per);
    const w = ((f + k) >> 1) & 1 ? 2 : W0;
    const ci = (k * 3 + 1) % CONFETTI.length;
    const x0 = x + ((W0 - w) >> 1);
    R(ctx, x0, y, w, H0, CONFETTI[ci]);
    R(ctx, x0, y, w, 1, CONF_HI[ci]);
    R(ctx, x0, y + H0 - 1, w, 1, CONF_SH[ci]);
  }
}
function drawConfettiRain(ctx, t) {
  const age = t - CUES.correct;
  // steady rain for the idle celebration
  if (age > 0.4) {
    for (let k = 0; k < 72; k++) {
      const rng = mulberry32(k * 3301 + 5);
      const vy = 40 + rng() * 40, span = LH + 40;
      const y = ((rng() * span + (age - 0.4) * vy) % span) - 20;
      if (age - 0.4 < (y + 20) / vy) { /* only after it could have fallen */ }
      const x = rng() * LW + Math.sin(age * 2 + k) * 5;
      const spin = age * (5 + rng() * 6) + k;
      const w = 1 + Math.round(2 * Math.abs(Math.cos(spin))), h = 2;
      const a = prog(age, 0.4, 1.0);
      if (bay(k, 0) > a) continue;
      R(ctx, ri(x), ri(y), w, h, CONFETTI[(k + 3) % CONFETTI.length]);
    }
  }
  // mid layer: a steady rain of 2x3 / 3x4 pieces that takes over as the bursts thin out
  // (from ~9.3 s) and keeps the celebration full until the wipe at 12.0
  if (age > 1.1) {
    const a = prog(age, 1.1, 1.6), f = frameOf(t);
    for (let k = 0; k < 44; k++) {
      if (bay(k, 3) > a) continue;
      const rng = mulberry32(k * 6007 + 13);
      const vy = 55 + rng() * 45, span = LH + 30;
      const y = ((rng() * span + (age - 1.1) * vy) % span) - 15;
      const x = rng() * LW + Math.sin(age * 2.4 + k) * 4;
      const big = k % 3 === 0;
      const w = ((f + k) >> 1) & 1 ? 1 : big ? 3 : 2, h = big ? 4 : 3;
      R(ctx, ri(x), ri(y), w, h, CONFETTI[(k + 1) % CONFETTI.length]);
    }
  }
}
function drawCheckBadge(ctx, t) {
  // frame counters, not float ages (the export draws at n/30, QA at n/30 + 0.001)
  const fa = sinceCue(t, CUES.correct), a = fa / FPS;
  if (fa < 1 || fa >= firstFrame(CUES.characterIn) - firstFrame(CUES.correct)) return;
  const r = fa < 2 ? 46 : fa < 3 ? 40 : 36;
  const cx = CX, cy = CARD.y + CARD.h / 2 + ri(Math.sin(a * 7) * 2);
  disc(ctx, cx + 2, cy + 4, r + 2, '#07331c');
  disc(ctx, cx, cy, r + 2, X.ink);
  disc(ctx, cx, cy, r, '#ffffff');
  // exit: no downscaling of the pixel art, the badge pops to a white silhouette on the frame
  // before the card arrives
  if (sinceCue(t, CUES.characterIn) === -1) return;
  disc(ctx, cx, cy, r - 5, X.ink);
  disc(ctx, cx, cy, r - 6, X.g3);
  disc(ctx, cx - 1, cy - 2, r - 9, X.g2);
  R(ctx, cx - ri(r * 0.45), cy - ri(r * 0.62), ri(r * 0.3), 2, '#b8ffd0');
  const k = r / 36;
  shadedCapsules(ctx, [
    { ax: cx - 15 * k, ay: cy + 1 * k, bx: cx - 5 * k, by: cy + 11 * k, r: 5 * k },
    { ax: cx - 5 * k, ay: cy + 11 * k, bx: cx + 16 * k, by: cy - 12 * k, r: 5 * k },
  ], { out: X.ink, base: '#ffffff', sh: '#bfe9d2', lt: '#ffffff' });
}
const PTS_GAP = 9; // between the number and the label (a PS2P space would be 16)
// CORRETO! stamp. The scale-4 slam is used ONLY if the whole sprite (outline + extrusion)
// fits the SAFE width, centred on the SAFE axis. With this copy it does not (≈232 lo > 217),
// so the hit is scale 3 with a white halo outside the ink outline: 2 px on the cue frame,
// 1 px on the next, then a springy hop. Readable text never leaves SAFE.
const STAMP_Y = 46;
const stampOpt = (sc) => ({ s: sc, fill: ['#ffffff', '#ffffff', X.cream, X.gold], out: X.ink, ext: { d: 3, c: X.g5, c2: '#07331c' } });
function stampLayout(sc) {
  const sp = textSprite(COPY.correct, 'ps', stampOpt(sc));
  const safeW = SAFE_L.x1 - SAFE_L.x0;
  const cx = sc === 4 ? clamp(CXE, SAFE_L.x0 + Math.ceil(sp.w / 2), SAFE_L.x1 - Math.ceil(sp.w / 2)) : CX + 2;
  return { sp, cx, fits: sp.w <= safeW };
}
function stampRect(sc) {
  const { sp, cx } = stampLayout(sc);
  const x = ri(cx - Math.floor(sp.inkW / 2) - sp.pad), y = STAMP_Y - sp.capY;
  return { x: x - 3, y: y - 10, w: sp.w + 6, h: sp.h + 13 };  // + hop range + halo
}
let STAMP_HALO = null;
function drawCorrectStamp(t) {
  const age = t - CUES.correct;
  const fc = sinceCue(t, CUES.correct);
  const use4 = fc < 2 && stampLayout(4).fits;
  const sc = use4 ? 4 : 3;
  const { sp, cx } = stampLayout(sc);
  const hop = age < 0.1 ? 0 : -ri(Math.abs(Math.sin((age - 0.1) * 14)) * 7 * Math.exp(-(age - 0.1) * 5));
  const beat = (t - 1.0) % 0.5 < 0.06 && age > 0.8 ? -1 : 0;
  const ctY = STAMP_Y - (sc - 3) * 5 + hop + beat;
  const x = ri(cx - Math.floor(sp.inkW / 2) - sp.pad), y = ri(ctY - sp.capY);
  const halo = use4 ? 0 : fc === 0 ? 2 : fc === 1 ? 1 : 0;
  if (halo) {
    if (!STAMP_HALO || STAMP_HALO.src !== sp.cv) STAMP_HALO = { src: sp.cv, cv: tint(sp.cv, '#ffffff') };
    for (let j = -halo; j <= halo; j++) for (let i = -halo; i <= halo; i++) if (i || j) L.drawImage(STAMP_HALO.cv, x + i, y + j);
  }
  L.drawImage(sp.cv, x, y);
}

// ---- idle celebration (pointsEnd .. wipe): life on the beat grid, visual only ----------
// The card hops on every beat, a pixel glint sweeps the +100 pill and the card on alternate
// beats, and a second confetti pop leaves the card on IDLE_BURST. All integer lo px.
const IDLE_T0 = CUES.pointsEnd;                               // 9.5 s, on the beat
const IDLE_BURST = MUSIC_START + 19 * BEAT;                   // 10.5 s: 3rd beat of the bar
const IDLE_HOP = [-2, -3, -3, -2, -1, -1];                    // lo px per frame since a beat
const SHINE_F = 8;                                            // frames a glint takes to cross
const SHINE_PILL = [MUSIC_START + 18 * BEAT, MUSIC_START + 20 * BEAT]; // 10.0, 11.0
const SHINE_CARD = [MUSIC_START + 19 * BEAT, MUSIC_START + 21 * BEAT]; // 10.5, 11.5
function framesSinceBeat(t) {
  const b = Math.floor((t - MUSIC_START) / BEAT + 1e-6);
  return frameOf(t) - firstFrame(MUSIC_START + b * BEAT);
}
function idleHop(t) {
  const fb = framesSinceBeat(t);
  return fb >= 0 && fb < IDLE_HOP.length ? IDLE_HOP[fb] : 0;
}
// progress (0..1) of a glint that started on one of the cues, or -1
function shineAt(t, cues) {
  for (const c of cues) { const fs = sinceCue(t, c); if (fs >= 0 && fs < SHINE_F) return fs / (SHINE_F - 1); }
  return -1;
}
// 45-degree double glint across a rounded rect (same row insets as rrect), clipped per row
function shineRR(ctx, x, y, w, h, r, p) {
  r = Math.min(r, w >> 1, h >> 1);
  const pos = ri(10 + p * (w + h));
  for (let i = 0; i < h; i++) {
    const dy = i < r ? r - i - 0.5 : i >= h - r ? i - (h - r) + 0.5 : 0;
    const ins = dy > 0 ? r - Math.round(Math.sqrt(r * r - dy * dy)) : 0;
    const a = x + ins, b = x + w - ins;
    const bx = x + pos - i;
    for (const [o, bw, al] of [[0, 4, 0.7], [6, 2, 0.45]]) {
      const s0 = Math.max(a, bx + o), s1 = Math.min(b, bx + o + bw);
      if (s1 > s0) { ctx.globalAlpha = al; R(ctx, s0, y + i, s1 - s0, 1, '#ffffff'); }
    }
  }
  ctx.globalAlpha = 1;
}
// second pop: a fountain of crisp pieces from behind the card, kept inside SAFE
function drawIdleBurst(ctx, t, excl) {
  const ba = t - IDLE_BURST;
  if (ba < 0 || t >= CUES.ctaTransition + 0.25) return;
  const f = frameOf(t), fb = f - firstFrame(IDLE_BURST);
  // the card (drawn after the burst, hopping up to 3 px) surely hides a piece inside this rect
  // but outside its rounded corners
  const cardR = { x: ri(CX - (CARD.w + 2) / 2) + 1, y: CARD.y + 1, w: CARD.w, h: CARD.h - 4 };
  const hidden = (x, y, w, h) => x >= cardR.x && x + w <= cardR.x + cardR.w && y >= cardR.y && y + h <= cardR.y + cardR.h &&
    !((x < cardR.x + 8 || x + w > cardR.x + cardR.w - 8) && (y < cardR.y + 8 || y + h > cardR.y + cardR.h - 8));
  const occ = fb < 2 ? new Set() : null;                     // first two frames: one piece per 4x4 cell
  for (let k = 0; k < 96; k++) {
    const rng = mulberry32(k * 4409 + 23);
    // two FANS thrown from behind the card's upper corners, 10 to 75 deg up, each piece on a
    // 0-2 frame random start (so each side opens up instead of popping as a column); each
    // piece's reach D stops short of its SAFE column edge and of the SAFE top; drag 3, then
    // gravity rains it down. Colours mix on both sides (no parity split).
    const side = k & 1 ? 1 : -1;
    const a = ba + 0.05 - Math.floor(rng() * 3) / FPS;       // already open on the beat frame
    const elev = (10 + rng() * 65) * Math.PI / 180, c = Math.cos(elev), s = Math.sin(elev);
    const ox = CX + side * (CARD.w / 2 - 7), oy = CARD.y + 6 + rng() * 6;
    const rx = side > 0 ? SAFE_L.x1 - 6 - ox : ox - SAFE_L.x0 - 6, ry = oy - SAFE_L.y0 - 8;
    const D = Math.min(rx / c, ry / s) * (0.45 + 0.55 * rng());
    const W0 = 3 + (k & 1), H0 = 4 + Math.floor(rng() * 2);
    if (a < 0) continue;
    const drag = 3.0, tr = D * (1 - Math.exp(-drag * a));
    const x = ox + side * c * tr + Math.sin(a * 3 + k) * 3 * Math.min(1, a * 2);
    const y = oy - s * tr + 70 * a * a;
    const xi = ri(x), yi = ri(y);
    if (xi < SAFE_L.x0 || xi + W0 > SAFE_L.x1 || yi < SAFE_L.y0 || yi > LH || inRects(excl, xi, yi, W0, H0)) continue;
    if (occ && !hidden(xi, yi, W0, H0)) {
      const cells = [];
      for (let cy = yi >> 2; cy <= (yi + H0 - 1) >> 2; cy++) for (let cx = xi >> 2; cx <= (xi + W0 - 1) >> 2; cx++) cells.push(cy * 100 + cx);
      if (cells.some((c) => occ.has(c))) continue;
      for (const c of cells) occ.add(c);
    }
    confettiPiece(ctx, xi, yi, W0, H0, BURST_CI[((k >> 1) * 3 + (k & 1) * 5) % BURST_CI.length], ((f + k) >> 1) & 1);
  }
}

function drawScene3(t) {
  const age = t - CUES.correct;
  bgRays(CX, 164, 22, age * 0.35, X.g2, X.g3,
    [{ r: 30, col: '#a8ffc6' }, { r: 52, col: X.g1 }], { r0: 215, r1: 330, cols: [X.g4, X.g5] });
  putBG();
  // impact lines
  // (clean directions, each a 2-lo white core with a mint under-edge: uniform steps,
  // no 1-px hairlines ringing on the green)
  if (age < 0.25) {
    const p = age / 0.25, core = [], edge = [];
    // (not the two horizontals: they would run along the stamp's row like a strike-through)
    for (let q = 0; q < 4; q++) for (const a0 of CLEAN_AN) if (a0 || q & 1) cleanSpoke(CX, 60, q * Math.PI / 2 + a0, 40 + p * 140, 30, null, core, edge);
    for (const c of edge) R(L, c[0], c[1], 1, 1, '#a8ffc6');
    for (const c of core) R(L, c[0], c[1], 1, 1, '#ffffff');
  }
  drawConfetti(L, t);
  drawConfettiRain(L, t);
  drawCheckBadge(L, t);
  drawCorrectStamp(t);
  // card arrival glow: ONE tone, painted BEFORE the points pill so it never specks the counter
  if (t >= CUES.characterIn && t - CUES.characterIn < 0.35) {
    const q = (t - CUES.characterIn) / 0.35;
    ditherDisc(L, CX, CARD.y + CARD.h / 2, ri(40 + q * 50), '#ffffff', '#ffffff', 1 - q);
  }
  // +100 PONTOS counter with spinning coin (value and label straight from COPY); the number
  // steps with the audio's point ticks (one per 32nd note) and lands with the last tick
  if (t >= CUES.pointsStart) {
    const ticks = Math.round((CUES.pointsEnd - CUES.pointsStart) / (BEAT / 8));
    // the ticks are 1.875 frames apart: each step shows on the NEAREST frame to its tick (ties to
    // the earlier one, keyFrame()), so a digit never trails its tick by more than half a frame
    let k = 0;
    while (k < ticks && keyFrame(CUES.pointsStart + k * (BEAT / 8)) <= frameOf(t)) k++;
    const n = Math.round(COPY.pointsValue * Math.min(1, Math.max(1, k) / ticks));
    const done = t >= CUES.pointsEnd && t < CUES.pointsEnd + 0.1;
    const fill = done ? '#ffffff' : [X.cream, X.gold, X.amber];
    const numFull = '+' + COPY.pointsValue;
    const wNum = textWidth(numFull, 'ps', 2), wLab = textWidth(COPY.pointsLabel, 'ps', 2);
    const coinW = 14, padL = 5, padR = 7;
    const wAll = padL + coinW + 5 + wNum + PTS_GAP + wLab + padR;
    const x0 = ri(CX - wAll / 2);
    const punch = sinceCue(t, CUES.pointsStart) === 0;          // one frame, whatever the render time
    const y = 84 + (punch ? -2 : 0);
    panel(L, x0, y - 5, wAll, 24, 11, { fill: punch ? '#1f8a47' : '#0e5a33', out: X.ink, ext: 2, extC: '#07331c' });
    L.drawImage(S.coins[Math.floor(t * 12) % 6], x0 + padL, y);
    const xn = x0 + padL + coinW + 5;
    // the number is right-aligned in its final width so the label never jumps
    drawText(L, '+' + n, 'ps', { s: 2, fill, ext: { d: 1, c: X.ink } }, xn + wNum, y + 1, 'r');
    drawText(L, COPY.pointsLabel, 'ps', { s: 2, fill, ext: { d: 1, c: X.ink } }, xn + wNum + PTS_GAP, y + 1, 'l');
    const shP = shineAt(t, SHINE_PILL);
    if (shP >= 0) shineRR(L, x0, y - 5, wAll, 24, 11, shP);
    if (t >= CUES.pointsEnd && t < CUES.pointsEnd + 0.4) {
      const q = prog(t, CUES.pointsEnd, CUES.pointsEnd + 0.4);
      sparkle(L, x0 + wAll - 8, y - 4 - q * 4, q < 0.5 ? 3 : 2, '#ffffff', X.gold);
      sparkle(L, x0 + 6, y + 14 + q * 3, q < 0.5 ? 2 : 1, '#ffffff', X.gold);
    }
  }
  // character card: flip-in + nameplate
  if (t >= CUES.characterIn) {
    // frame-quantised age (the exporter draws at n/30, QA at n/30 + 0.001: same pose on both)
    const fc = sinceCue(t, CUES.characterIn);
    const ca = fc / FPS + 1e-4;
    // flip without squashing the pixel art: a hand-made edge-on card, a white silhouette
    // frame, then the card itself
    const bob = t >= IDLE_T0 ? idleHop(t) : ca > 0.4 ? ri(Math.sin(ca * 4) * 1.5) : 0;
    const cw = S.card.width;
    const dx = ri(CX - cw / 2), dy = CARD.y + bob;
    if (fc === 0) {
      const ex = ri(CX - 4);
      rrect(L, ex - 1, dy - 1, 10, CARD.h + 4, 3, X.ink);
      R(L, ex, dy, 8, CARD.h + 2, X.goldDk);
      R(L, ex + 1, dy, 5, CARD.h, X.gold);
      R(L, ex + 1, dy + 2, 1, CARD.h - 4, X.cream);
    } else if (fc === 1) {
      rrect(L, dx - 1, dy - 1, CARD.w + 4, CARD.h + 4, 9, X.ink);
      rrect(L, dx, dy, CARD.w + 2, CARD.h + 2, 8, '#ffffff');
    } else {
      L.drawImage(S.card, dx, dy);
      const shC = shineAt(t, SHINE_CARD);
      if (shC >= 0) shineRR(L, dx + 1, dy + 1, CARD.w, CARD.h, 7, shC);
    }
    // (the card art is static: the directors add any idle life to their own art)
    // nameplate ribbon slides up
    const rp = prog(ca, 0.1, 0.28);
    if (rp > 0) {
      const ry = CARD.y + CARD.h + 2 + ri((1 - outBack(rp, 2)) * 18) + bob;
      L.drawImage(S.ribbon, ri(CX - S.ribbon.width / 2), ry);
    }
    // twinkles around the card
    const TW = [[-66, -40], [68, -52], [-72, 20], [70, 30], [-58, 62], [62, -8], [-40, -66], [44, 60]];
    for (let k = 0; k < TW.length; k++) {
      const rng = mulberry32(k * 53 + 11);
      const x = CX + TW[k][0], y = CARD.y + CARD.h / 2 + TW[k][1] - 6;
      const ph = (ca * 2.2 + rng()) % 1;
      const s = ph < 0.2 ? 1 : ph < 0.4 ? 3 : ph < 0.55 ? 2 : 0;
      if (s) sparkle(L, x, y, s, '#ffffff', X.gold);
    }
  }
  drawConfettiFG(L, t);
}

// ---------------------------------------------------------------------------------------
// Scene 4 — CTA / end card
// The brand leads: icon + NOSTALGIA land big at the SAFE centre on CUES.logoLand, then the
// lockup slides up when the question arrives. Hierarchy: wordmark >= question > yellow
// download pill > store pills > fine print. Everything is centred on the SAFE axis (CXE).
function endLockupDY(t) {
  // lockup offset from its final position: lands low (centred), slides up on ctaText
  const p = outCubic(prog(t, CUES.ctaText - 0.02, CUES.ctaText + 0.2));
  return ri(LAND_DY * (1 - p));
}
const END_MESAS = [[6, 50, 17], [112, 126, 23], [178, 236, 12]];   // [x0, x1, height] (lo px)
// end-card coin lanes: [x (lo px, outside SAFE), coins, speed (lo px/s), y offset]
const END_COIN_LANES = [[2, 4, 18, 330], [237, 3, 18, 400], [252, 3, 18, 320]];
function drawScene4(t) {
  const age = t - CUES.ctaTransition;
  const E = S.endL;
  const dyL = endLockupDY(t);
  const rayY = E.wmY + 10 + dyL;
  bgRays(CXE, rayY, 18, -age * 0.25, '#ff4f9a', '#e0368a',
    [{ r: 40, col: '#ffd0e6' }, { r: 70, col: '#ff8cc0' }], { r0: 190, r1: 330, cols: ['#b8237e', '#7b2fbe', '#4b1d8a'] },
    { y0: E.finePrintY - 3, col: '#7b2fbe' });  // flat ground under the fine print (no checker)
  putBG();
  // twinkling stars in the lower sky
  for (let k = 0; k < 26; k++) {
    const rng = mulberry32(k * 419 + 3);
    const x = ri(rng() * LW), y = ri(250 + rng() * 220);
    const ph = (age * (1 + rng()) + rng()) % 1;
    if (y >= E.finePrintY - 6) continue;                       // none on the fine print's strip
    const s = ph < 0.15 ? 2 : ph < 0.5 ? 1 : 0;
    if (s) sparkle(L, x, y, s, '#ffffff', '#ffcde6'); else R(L, x, y, 1, 1, '#ffcde6');
  }
  // poster hills: the fine print sits on the dark one
  // Direction A: the near range is a row of desert mesas (flat tops, cliffs, talus) in the
  // brand's dusk purple, all below the fine print
  const H2 = new Array(LW), LIT = new Array(LW);
  for (let x = 0; x < LW; x++) {
    let h2 = E.hill + 22 + ri(Math.sin(x * 0.06 + 3) * 3), lit = false;
    for (const [a, b, hh] of END_MESAS) {
      const tp = E.hill + 22 - hh;
      const m = x >= a && x <= b ? tp : x < a ? tp + (a - x) * 3 : tp + (x - b) * 3;
      if (m < h2) { h2 = m; lit = x >= a && x <= a + 1; }   // the lit strip stops where the talus starts
    }
    H2[x] = h2; LIT[x] = lit;
  }
  for (let x = 0; x < LW; x++) {
    const h1 = E.hill + ri(Math.sin(x * 0.045 + 1) * 5 + Math.sin(x * 0.11) * 2);
    R(L, x, h1, 1, LH - h1, '#4b1d8a');
    R(L, x, h1, 1, 1, '#b86ae0');
    const h2 = H2[x];
    R(L, x, h2, 1, LH - h2, '#2a0f5a');
    if (LIT[x]) R(L, x, h2 + 1, 1, 9, '#4b1d8a');
    // rim light: runs down the whole step to the lower neighbour column (<= 3 px), so a steep
    // talus gets a continuous diagonal edge instead of a chain of loose dots
    const drop = Math.max(x > 0 ? H2[x - 1] - h2 : 0, x < LW - 1 ? H2[x + 1] - h2 : 0);
    R(L, x, h2, 1, Math.max(1, Math.min(3, drop)), '#7b2fbe');
  }
  // two saguaro silhouettes on the far hill, outside the fine print's box
  for (const [cx, hh] of [[14, 15], [248, 12]]) {
    const by = E.hill + ri(Math.sin(cx * 0.045 + 1) * 5 + Math.sin(cx * 0.11) * 2) + 1;
    R(L, cx - 1, by - hh, 3, hh, '#2a0f5a');
    R(L, cx - 4, by - ri(hh * 0.55), 3, 2, '#2a0f5a'); R(L, cx - 4, by - ri(hh * 0.8), 2, ri(hh * 0.25) + 1, '#2a0f5a');
    R(L, cx + 2, by - ri(hh * 0.45), 3, 2, '#2a0f5a'); R(L, cx + 3, by - ri(hh * 0.7), 2, ri(hh * 0.25) + 1, '#2a0f5a');
    R(L, cx - 1, by - hh, 1, hh, '#4b1d8a');
  }
  // coins drifting up the side margins (never over the pills, and in lanes outside the fine
  // print's box, which spans the SAFE width): a lane plan, one speed per lane and even spacing,
  // so two coins never pass through each other; only the spin phase is per coin
  let kc = 0;
  for (const [lx, n, v, y0] of END_COIN_LANES) for (let i = 0; i < n; i++, kc++) {
    const span = LH + 12, y = (((y0 + i * span / n - age * v) % span) + span) % span - 12;
    L.drawImage(S.coins[(Math.floor(t * 10) + kc * 5) % 6], lx, ri(y));
  }
  // --- logo lockup: falls in, lands at logoLand with squash + bounce, slides up at ctaText
  let gy = 0, sqY = 1;
  if (t < CUES.logoLand) gy = -ri((1 - inQuad(prog(t, CUES.ctaTransition + 0.1, CUES.logoLand))) * 300);
  else {
    const dt = t - CUES.logoLand;
    gy = -ri(Math.abs(Math.sin(dt * 16)) * 12 * Math.exp(-dt * 7));
    sqY = 1 - 0.28 * Math.exp(-dt * 16) * Math.max(0, Math.cos(dt * 16));
  }
  gy += dyL;
  const wm = S.wordmark;
  const wx = ri(CXE - wm.inkW / 2) - wm.pad;
  let wy = E.wmY - wm.capY + gy;
  if (logoImg) {
    const box = { x: SAFE_L.x0 + 4, y: E.iconY, w: SAFE_L.x1 - SAFE_L.x0 - 8, h: E.wmY + 27 - E.iconY };
    const sw = logoImg.width, sh = logoImg.height;
    let sc = Math.min(box.w / sw, box.h / sh);
    if (sc >= 1) sc = Math.floor(sc);
    const dw = ri(sw * sc), dh = ri(sh * sc * sqY);
    L.drawImage(logoImg, ri(box.x + (box.w - dw) / 2), ri(box.y + box.h - dh + gy), dw, dh);
  } else {
    const icon = S.appIcon;
    const ih = ri(icon.height * sqY);
    L.drawImage(icon, ri(CXE - icon.width / 2), E.iconY + gy + (icon.height - ih), icon.width, ih);
    // official icon at output resolution, riding the same fall / squash (not during the
    // diamond wipe, whose mask only exists in the low-res frame)
    if (iconHi && t >= CUES.ctaTransition + 0.25) {
      const k = ih / icon.height;
      HIRES.push({ c: iconHi, x: ri(CXE - icon.width / 2) + 1, y: E.iconY + gy + (icon.height - ih) + k, w: ICON_ART, h: ICON_ART * k, r: ICON_R });
    }
    const wh = ri(wm.cv.height * sqY);
    wy += wm.cv.height - wh;
    L.drawImage(wm.cv, wx, wy, wm.cv.width, wh);
    // shine sweeps: on the landing and on the final chord
    for (const s0 of [CUES.logoLand, CUES.musicEndChord - 0.05]) {
      const p = prog(t, s0, s0 + 0.45);
      if (p <= 0 || p >= 1 || sqY < 0.99) continue;
      const band = ri(-30 + p * (wm.cv.width + 60));
      TX.clearRect(0, 0, wm.cv.width, wm.cv.height);
      TX.globalCompositeOperation = 'source-over';
      for (let y = 0; y < wm.cv.height; y++) {
        const x = band - ri(y * 0.6);
        R(TX, x, y, 6, 1, '#ffffff'); R(TX, x + 8, y, 2, 1, '#ffffff');
      }
      TX.globalCompositeOperation = 'destination-in';
      TX.drawImage(S.wordmarkMask, 0, 0);
      TX.globalCompositeOperation = 'source-over';
      L.drawImage(tmp, 0, 0, wm.cv.width, wm.cv.height, wx, wy, wm.cv.width, wm.cv.height);
    }
  }
  // landing dust puffs at the wordmark's feet
  if (t >= CUES.logoLand && t < CUES.logoLand + 0.35) {
    const p = prog(t, CUES.logoLand, CUES.logoLand + 0.35);
    const fy = E.wmY + 26 + dyL;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      ditherDisc(L, CXE + s * (98 + k * 8 + p * 22), fy - k * 3 - p * 8, 2 + k + ri(p * 2), '#ffffff', '#ffc0dc', 1 - p);
    }
  }
  // final chord: a sparkle ring bursts from the wordmark (~0.6 s)
  const ca = t - CUES.musicEndChord;
  if (ca >= 0 && ca < 0.6) {
    const r = 18 + outCubic(ca / 0.6) * 150, s = ca < 0.25 ? 3 : ca < 0.45 ? 2 : 1;
    for (let i = 0; i < 20; i++) {
      const an = (i / 20) * Math.PI * 2 + 0.16;
      const x = CXE + Math.cos(an) * r * 1.15, y = E.wmY + 11 + Math.sin(an) * r * 0.62;
      if (x < 2 || x > LW - 3) continue;
      sparkle(L, x, y, s, '#ffffff', i % 2 ? X.gold : '#ffcde6');
    }
  }
  // --- question: two lines, pop up line by line
  if (t >= CUES.ctaText) {
    // line 1 cuts in ON the chord's frame (f390) at its place under the wordmark, with no pop
    // of its own; line 2 pops in 0.05 s later. Both RIDE the lockup's slide, so the logo-to-
    // question gap of line 1 never changes while it moves
    S.ctaLines.forEach((ln, i) => {
      const p = prog(t, CUES.ctaText + i * 0.05, CUES.ctaText + 0.2 + i * 0.05);
      if (i > 0 && p < 0.05) return;
      const dy = i === 0 ? 0 : ri((1 - outBack(p, 2.4)) * 12);
      drawText(L, ln, 'j15', { s: 1, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 2, c: X.violet, c2: '#2a0f5a' } }, CXE, E.qY + i * E.qPitch + dy + dyL, 'c');
    });
  }
  // --- download pill (two lines, the loudest button) + store pills + fine print
  if (t >= CUES.stores) {
    const pa = t - CUES.stores;
    // the pop is already at ~96 % with its label on the cue frame (f405, the label rides it
    // from sc > 0.85), overshoots ~8 % and settles by f409: the whole CTA (button + store
    // pills) is readable from CUES.stores to the last frame, 1.5 s
    const p = prog(pa, -0.065, 0.12);
    const sc = p < 1 ? outBack(p, 1.6) : 1;
    // a tap cursor presses the pill on the final chord (squash + cream flash + shine
    // sweep), then the pill keeps a gentle pulse on every later beat
    const pressA = CUES.musicEndChord, pressB = pressA + 0.1;
    const press = t >= pressA && t < pressB ? 1 : 0;
    const beatPh = (t - MUSIC_START) % BEAT;
    const pulse = !press && t >= pressB + 0.1 && beatPh < 0.12 ? 1 : 0;
    const pw = E.pillW + pulse * 4 - press * 6, ph = E.pillH + pulse * 2 - press * 2;
    const pw2 = clamp(ri(pw * sc), 4, SAFE_L.x1 - SAFE_L.x0 - 4), ph2 = Math.max(4, ri(ph * sc));
    const px = ri(CXE - pw2 / 2), py = ri(E.pillY + (E.pillH - ph2) / 2) - pulse + press;
    panel(L, px, py, pw2, ph2, 12, { fill: X.gold, sh: X.amber, shH: 5, out: X.ink, ext: 3 - press, extC: '#7a1f3d', hi: '#ffffff' });
    if (press || pulse) {
      // the flash lives on the rim (a 2-px cream ring inside the outline + the white top
      // light): the face stays gold, so the white/cream 'Grátis' keeps its contrast
      rrect(L, px, py, pw2, ph2 - 5, 12, X.cream);
      rrect(L, px + 2, py + 2, pw2 - 4, ph2 - 9, 10, X.gold);
      R(L, px + 12, py + 1, pw2 - 24, 1, '#ffffff');
    }
    if (sc > 0.85) {
      const ly0 = py + 7 + ri((ph2 - E.pillH) / 2);
      // 'Baixe o Nostalgia' / 'Grátis': the last word of the copy gets its own line and the
      // loudest treatment on the card (white, ink outline, maroon extrusion)
      S.dlLines.forEach((ln, i) => {
        const free = i === S.dlLines.length - 1 && S.dlLines.length > 1;
        drawText(L, ln, 'j15', free ? { s: E.freeS, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 2, c: '#7a1f3d', dx: 0 } } : { s: 1, fill: X.ink }, CXE - 6, ly0 + i * 21, 'c');
      });
      // ">>" chevrons: this is a button. They go once the fingertip arrives (it is the
      // affordance from then on), so no chevron arm pokes out beside the nail as a whisker
      const cx0 = px + pw2 - 20, cy0 = py + ri(ph2 / 2) - 3;
      if (t < pressA - 0.1) for (const o of [0, 5]) for (let j = 0; j < 4; j++) { R(L, cx0 + o + j, cy0 - 3 + j, 2, 1, X.ink); R(L, cx0 + o + j, cy0 + 4 - j, 2, 1, X.ink); }
      // shine: one diagonal sweep across the WHOLE pill right after the press
      const sp = prog(t, pressB, pressB + 0.1);
      if (sp > 0 && sp < 1) {
        L.save(); L.beginPath(); L.rect(px + 2, py + 2, pw2 - 4, ph2 - 6); L.clip();
        const bx = px + ri(sp * (pw2 + ph2));
        for (let y = 2; y < ph2 - 5; y++) { R(L, bx - y, py + y, 5, 1, '#ffffff'); R(L, bx - y + 8, py + y, 2, 1, '#ffffff'); }
        L.restore();
      }
    }
    const cursorAt = [px + pw2 - 16, py + ri(ph2 / 2)];
    COPY.ctaStores.forEach((name, i) => {
      // the store pills arrive WITH the download pill (both on its first frame, staggered
      // by their motion), so the whole CTA is on screen from CUES.stores to the end
      const q = prog(pa, -0.02 + i * 0.01, 0.14 + i * 0.04);
      if (q <= 0) return;
      const w = E.storeW, h = E.storeH;
      const x = ri(CXE - w / 2), y = E.storeY + i * (h + 7) + ri((1 - outBack(q, 2.2)) * 14);
      panel(L, x, y, w, h, 8, { fill: X.ink, sh: '#0b0a14', out: '#ffffff', ext: 2, extC: X.ink, hi: '#3a3f63' });
      const ic = S.storeIcon[i % 2];
      const lw = textWidth(name, 'j15', 1), gx = ri(CXE - (ic.width + 6 + lw) / 2);
      L.drawImage(ic, gx, y + ri((h - ic.height) / 2) - 1);
      drawText(L, name, 'j15', { s: 1, fill: '#ffffff' }, gx + ic.width + 6, y + 5, 'l');
    });
    // fine print: plain small type (no plate, so it never reads as a third button), mid-
    // contrast silver with a thin ink outline, on the dark hill at the bottom of SAFE; the
    // coins keep to lanes outside its box. Appears whole one frame after the stores cue (on
    // the cue frame the App Store pill is still sliding through its line), so the complete
    // CTA, fine print included, holds for ~1.47 s.
    const dq = pa >= 1 / FPS - 1e-6 ? 1 : 0;
    if (dq > 0) {
      const top = E.finePrintY, bandH = S.discLines.length * E.fpPitch + 4;
      TX.clearRect(0, 0, LW, bandH);
      S.discLines.forEach((ln, i) => drawText(TX, ln, 'jr', { s: 1, fill: '#c9cce0', out: X.ink, outX: true }, CXE, 2 + i * E.fpPitch, 'c'));
      if (dq < 1) {
        TX.globalCompositeOperation = 'destination-out';
        for (let y = 0; y < bandH; y++) for (let x = 0; x < LW; x++) if (bay(x, y) >= dq) R(TX, x, y, 1, 1, '#000');
        TX.globalCompositeOperation = 'source-over';
      }
      L.drawImage(tmp, 0, 0, LW, bandH, 0, top - 2, LW, bandH);
    }
    drawTapCursor(t, cursorAt[0], cursorAt[1], pressA, pressB);
  }
}

// Tap gesture: a fingertip glides in, presses the download pill on the final chord (tap
// ripple), then hovers on it with a one-pixel bob per beat so the last frame invites a tap.
function drawTapCursor(t, tipX, tipY, pressA, pressB) {
  const t0 = pressA - 0.32;
  if (t < t0) return;
  const hover = [tipX + 2, tipY - 4], from = [tipX + TAP_U[0] * 130, tipY + TAP_U[1] * 130];
  let x, y;
  if (t < pressA) { const e = outCubic(prog(t, t0, pressA - 0.03)); x = lerp(from[0], hover[0], e); y = lerp(from[1], hover[1], e); }
  else if (t < pressB) { x = tipX; y = tipY + 1; }
  else {
    const e = outCubic(prog(t, pressB, pressB + 0.12));
    x = lerp(tipX, hover[0], e); y = lerp(tipY + 1, hover[1], e) - ((t - MUSIC_START) % BEAT < 0.12 && t > pressB + 0.2 ? 1 : 0);
  }
  // tap ripple: two solid rings expanding from the fingertip on the press
  for (const [d0, c] of [[0, '#ffffff'], [0.07, X.cream]]) {
    const rp = prog(t, pressA + d0, pressA + d0 + 0.24);
    if (rp <= 0 || rp >= 1) continue;
    // two passes (every shadow pixel, then every ring pixel) and enough samples for the
    // ellipse's circumference: a continuous ring with its drop shadow only beneath it
    const rr = 3 + outCubic(rp) * 15, seen = new Set(), pts = [], ns = Math.ceil(2 * Math.PI * rr * 1.35) + 8;
    for (let a = 0; a < ns; a++) {
      const an = (a / ns) * Math.PI * 2, px = ri(tipX + Math.cos(an) * rr * 1.35), py = ri(tipY + 1 + Math.sin(an) * rr * 0.8);
      const key = px * 1000 + py;
      if (seen.has(key)) continue;
      seen.add(key); pts.push(px, py);
    }
    for (let j = 0; j < pts.length; j += 2) if (!seen.has(pts[j] * 1000 + pts[j + 1] + 1)) R(L, pts[j], pts[j + 1] + 1, 1, 1, '#7a1f3d');
    for (let j = 0; j < pts.length; j += 2) R(L, pts[j], pts[j + 1], 1, 1, c);
  }
  drawTapFinger(ri(x), ri(y));
}
// A real fingertip (not a desktop cursor): the pointing hand from scene 2 in miniature, index
// extended, fist + cyan cuff + pink sleeve running off the bottom-right of the frame.
const TAP_U = [0.5, 0.866];                        // from the fingertip toward the wrist
function drawTapFinger(tx, ty) {
  const u = TAP_U, pr = [u[1], -u[0]];
  const E = add([tx, ty], u, 3), J = add(E, u, 9), M = add(J, u, 9);
  const finger = [seg(E, J, 3.6, 4.2), seg(J, M, 4.4, 5.2)];
  const fistA = add(add(M, pr, 7), u, 3), fistB = add(add(M, pr, 5), u, 16);
  const Wr = add(add(M, pr, 4), u, 27);
  const curled = [6, 12].map((o) => { const K = add(add(M, pr, o), u, 1); return seg(add(K, u, -4), add(K, u, 3), 3.8, 4.2); });
  paintLimbs([
    // violet sleeve: the scene-2 pink would vanish into the pink end card
    { segs: [seg(add(Wr, u, 12), add(Wr, u, 220), 13, 14)], pal: { out: X.ink, lt: '#b86ae0', base: X.purple, sh: X.violet, dk: '#2a0f5a' } },
    { segs: [seg(fistA, fistB, 9, 11)], pal: SKIN },
    { segs: [seg(add(Wr, u, 2), add(Wr, u, 12), 12, 12.5)], pal: { out: X.ink, lt: '#e0ffff', base: '#73eff7', sh: '#2a9fb0', dk: '#1d6f80' } },
    { segs: curled, pal: SKIN, creases: [{ seg: 0, at: 5, w: 0.5, c: 'sh' }] },
    { segs: finger, pal: SKIN, nail: { seg: 0, s0: -0.3, s1: 0.45, w: 0.58 }, creases: [{ seg: 1, at: 1, w: 0.5, c: 'sh' }] },
  ], { segs: finger, dx: 2, dy: 3, a: 0.5 }, [tx, ty]);
}

// ---------------------------------------------------------------------------------------
// Transitions (pixel masks, composited per pixel)
let MIXA = null;
function mixScenes(drawA, drawB, maskFn, edgeCol) {
  drawA();
  const a = L.getImageData(0, 0, LW, LH);
  MIXA = new Uint32Array(a.data.buffer);
  drawB();
  const b = L.getImageData(0, 0, LW, LH), b32 = new Uint32Array(b.data.buffer);
  const ue = edgeCol ? u32(edgeCol) : 0;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = y * LW + x, m = maskFn(x, y);
    if (m === 0) b32[i] = MIXA[i];
    else if (m === 2) b32[i] = ue;
  }
  L.putImageData(b, 0, 0);
}

// ---------------------------------------------------------------------------------------
// Captions — big (Jersey 15, 60-px caps), two lines, each in its own clear band:
// scene 1 under the scene window, scene 2 between the answer slots and the remote (both hands
// stay below it), scene 3 under the character card.
const CAP_MAXW = SAFE_L.x1 - SAFE_L.x0 - 18;
const CAP_Y = [333, CAP2_Y, 305];
function split2(str, fk, track) {
  const words = str.split(' ');
  let best = { lines: [str], w: textWidth(str, fk, 1, track) };
  if (words.length < 2) return best;
  best = { lines: null, w: 1e9 };
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const w = Math.max(textWidth(a, fk, 1, track), textWidth(b, fk, 1, track));
    if (w < best.w) best = { lines: [a, b], w };
  }
  return best;
}
function captionBox(idx) {
  const { lines, track } = S.capLines[idx];
  const tw = Math.max(...lines.map((ln) => textWidth(ln, 'j15', 1, track)));
  const bw = tw + 18, bh = 15 + (lines.length - 1) * 21 + 16;
  const cx = clamp(CX, SAFE_L.x0 + Math.ceil(bw / 2), SAFE_L.x1 - Math.ceil(bw / 2));
  const cy = CAP_Y[Math.min(idx, CAP_Y.length - 1)];
  return { lines, track, bw, bh, cx, cy };
}
// Largest box the caption ever occupies (pop frame included), for particle exclusion.
function captionRect(idx) {
  const b = captionBox(idx);
  return { x: ri(b.cx - b.bw / 2) - 4, y: ri(b.cy - b.bh / 2) - 5, w: b.bw + 8, h: b.bh + 10 };
}
function drawCaption(t) {
  const cap = CAPTIONS.find((c) => t >= c.t0 && t < c.t1);
  if (!cap) return;
  const idx = CAPTIONS.indexOf(cap);
  const { lines, track, bw, bh, cx, cy } = captionBox(idx);
  const lineH = 21;
  // pop: the first two frames are 3 / 1 px oversized (text already in), then settle
  const df = sinceCue(t, cap.t0); // counted from the first RENDERED frame of the caption
  const pout = prog(t, cap.t1 - 0.1, cap.t1);
  const grow = df === 0 ? 3 : df === 1 ? 1 : 0;
  let w2 = bw + grow * 2, h2 = bh + grow * 2;
  if (pout > 0) h2 = Math.max(2, ri(bh * (1 - inQuad(pout))));
  const x = ri(cx - w2 / 2), y = ri(cy - h2 / 2);
  // opaque over the scene-1 world (a translucent plate ghosts the road dash through, under the
  // words); the low-contrast scene-2/3 underlays keep the glass look
  L.globalAlpha = t < CUES.pushIn ? 1 : 0.86;
  rrect(L, x, y, w2, h2, 5, '#140a2a');
  L.globalAlpha = 1;
  R(L, x + 5, y - 1, w2 - 10, 1, X.ink); R(L, x + 5, y + h2, w2 - 10, 1, X.ink);
  const acc = [X.gold, '#73eff7', X.g1][idx % 3];
  R(L, x + 3, y + 5, 2, Math.max(0, h2 - 10), acc);
  if (df === 0) { R(L, x + 5, y, w2 - 10, 1, acc); R(L, x + 5, y + h2 - 1, w2 - 10, 1, acc); }
  // exit: the words are cropped WITH the collapsing box (never an empty full-size box)
  if (pout > 0 && h2 < 4) return;
  const top = ri(cy - bh / 2) + 8 - grow;
  if (pout > 0) { L.save(); L.beginPath(); L.rect(x, y + 1, w2, h2 - 2); L.clip(); }
  lines.forEach((ln, i) => {
    drawText(L, ln, 'j15', { s: 1, track, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 1, c: X.ink, dx: 0 } }, cx + 2, top + i * lineH, 'c');
  });
  if (pout > 0) L.restore();
}

// ---------------------------------------------------------------------------------------
// Public API
export async function initVisuals() {
  if (ready) return;
  lo = mk(LW, LH); L = ctxOf(lo);
  tmp = mk(LW + 80, LH + 80); TX = ctxOf(tmp);
  bgImg = L.createImageData(LW, LH); BG32 = new Uint32Array(bgImg.data.buffer);
  gcv = mk(640, 420); gctx = gcv.getContext('2d', { willReadFrequently: true });

  // fonts
  const href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Jersey+10&family=Jersey+15&display=swap';
  if (!document.querySelector(`link[href="${href}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
    await new Promise((res) => { l.onload = res; l.onerror = res; setTimeout(res, 4000); });
  }
  const sample = 'ÁÉÍÓÚÃÕÇáéíóúãõçâêô?!+0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const fam of ['Press Start 2P', 'Jersey 10', 'Jersey 15']) {
    try { await document.fonts.load(`32px "${fam}"`, sample); } catch (e) { /* fall back silently */ }
  }

  // optional licensed art overrides (missing files fail silently)
  const tryImg = async (rel) => {
    try {
      const r = await fetch(new URL(rel, import.meta.url));
      if (!r.ok) return null;
      return await createImageBitmap(await r.blob());
    } catch (e) { return null; }
  };
  [charImg, logoImg, iconImg] = await Promise.all([tryImg('./assets/character.png'), tryImg('./assets/logo.png'), tryImg('./assets/app_icon.png')]);

  // vignette table (scene 1)
  VIGN = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const dx = (x - LW / 2) / (LW / 2), dy = (y - LH / 2) / (LH / 2);
    VIGN[y * LW + x] = clamp(Math.sqrt(dx * dx * 0.9 + dy * dy * 0.7) - 0.25, 0, 1);
  }
  // scene 1 dark glow background
  S.bg1 = new Uint32Array(LW * LH);
  {
    const cols = ['#3a1a6a', '#2a1250', '#1b0d33', '#0f0820', '#070410'].map(u32);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const dx = (x + 0.5 - CX) / 150, dy = (y + 0.5 - 190) / 230;
      const v = Math.sqrt(dx * dx + dy * dy) * 4.2 + (bay(x, y) - 0.5);
      S.bg1[y * LW + x] = cols[clamp(Math.floor(v), 0, cols.length - 1)];
    }
  }
  // the desert world: the app's scene window (0.4x) and the full-frame hero shot (1x, with
  // the foreground cactus on its own layer)
  {
    const g = paintDesert(WIN.w, WIN.h, WIN_VP.x, WIN_VP.y, WIN_S, false).bg;
    const c = mk(WIN.w, WIN.h), x = ctxOf(c);
    rrect(x, 0, 0, WIN.w, WIN.h, 2, '#ffffff');
    x.globalCompositeOperation = 'source-in'; x.drawImage(g, 0, 0);
    S.win = c;
    S.world1 = paintDesert(LW, LH, VP1.x, VP1.y, 1, true);
    S.world2x = paintDesert(LW >> 1, LH >> 1, VP1.x / 2, VP1.y / 2, WIN_S, false).bg;
    // the beep1 snap's roadside sign lives IN the half-res world (on its 8-px grid)
    roadSignMini(ctxOf(S.world2x), ri((VP1.x + SIGN.x * 0.8) / 2), ri((VP1.y + SIGN.dw * 0.8) / 2));
    S.canyon = buildCanyon();
  }
  S.phone1 = buildPhone(PH1.w, PH1.h, PH1.r);
  S.phone2 = buildPhone(PH2.w, PH2.h, PH2.r);
  S.scr1 = buildScreenBG(SC1.w, SC1.h);
  S.scr2 = buildScreenBG(SC2.w, LH - SC2.y + 10);
  S.tv1 = buildTV(1);
  S.remote = buildRemote();
  S.card = buildCard();
  S.ribbon = buildAnswerTiles(ANSWER);
  if (iconImg) iconHi = buildIconHi();
  S.appIcon = buildAppIcon();
  S.dlIcon = buildDownloadIcon();
  // two DISTINCT generic glyphs (no store badge art): a download arrow and a phone
  S.storeIcon = [buildStoreDownload(), buildStorePhone()];
  S.coins = [0, 1, 2, 3, 4, 5].map(buildCoin);
  S.floaters = buildFloaters();
  S.heart = spr(['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'], { k: X.ink, r: X.red, w: '#ffffff' });
  S.floatersT = S.floaters.map((sp) => [tint(sp, '#ffd84a'), tint(sp, '#ffffff'), tint(sp, '#73eff7')]);
  buildS2Rows();
  // wordmark (tight tracking, bevel bands, deep extrusion) + its fill mask for the shine
  const wmOpt = { s: 3, track: -2, fill: [X.cream, X.gold, X.amber, '#ff7b3a', X.pink], hi: '#ffffff', out: X.ink, ext: { d: 5, c: '#5d275d', c2: '#2a0f3f' } };
  S.wordmark = textSprite(COPY.appName, 'ps', wmOpt);
  {
    const m = textSprite(COPY.appName, 'ps', { ...wmOpt, fill: '#ffffff', hi: '#ffffff', out: undefined, ext: undefined, _mask: 1 });
    // align mask to the styled sprite (styled has bigger pad)
    const c = mk(S.wordmark.cv.width, S.wordmark.cv.height), x = ctxOf(c);
    x.drawImage(m.cv, S.wordmark.pad - m.pad, S.wordmark.capY - m.capY);
    S.wordmarkMask = c;
  }
  // end-card layout, top to bottom (lo px), all measured from the real copy
  {
    const sw = SAFE_L.x1 - SAFE_L.x0;
    S.ctaLines = wrapN(COPY.ctaQuestion, 'j15', 1, sw - 8);
    {
      // split at render time, never hardcoded: everything but the last word / the last word
      const words = COPY.ctaDownload.split(' ');
      const head = words.slice(0, -1).join(' '), last = words[words.length - 1];
      S.dlLines = words.length > 1 && textWidth(head, 'j15', 1) <= sw - 44 ? [head, last] : wrapN(COPY.ctaDownload, 'j15', 1, sw - 44);
    }
    S.discLines = wrapN(COPY.disclaimer, 'jr', 1, sw - 6);
    const E = { iconY: 42 };
    E.wmY = E.iconY + S.appIcon.height + 8;
    E.qY = E.wmY + 21 + 5 + 13; E.qPitch = 21;
    E.pillY = E.qY + (S.ctaLines.length - 1) * E.qPitch + 15 + 14;
    // the free line (last word) is set one integer step larger when the copy was split
    E.freeS = S.dlLines.length === 2 && S.dlLines[1] === COPY.ctaDownload.split(' ').pop() ? 2 : 1;
    E.pillH = 7 + (S.dlLines.length - 1) * 21 + 15 * E.freeS + (E.freeS > 1 ? 2 : 0) + 10;
    E.pillW = Math.min(sw - 4, Math.max(...S.dlLines.map((l) => textWidth(l, 'j15', 1))) + 56);
    E.storeY = E.pillY + E.pillH + 13;
    E.storeH = 25;
    E.storeW = Math.max(...COPY.ctaStores.map((n) => textWidth(n, 'j15', 1))) + 13 + 6 + 26;
    E.discY = E.storeY + COPY.ctaStores.length * (E.storeH + 7) + 10;
    E.hill = E.discY + 32;          // the hills' crests stay below the fine print's box
    E.discY -= 7;
    // fine print sits at the bottom of SAFE (last line's baseline area ends at SAFE.y1)
    const jcap = capOf('jr');
    E.fpPitch = jcap.h + 4;
    E.finePrintY = SAFE_L.y1 - 2 - (S.discLines.length - 1) * E.fpPitch - jcap.h;
    S.endL = E;
    // the lockup (icon top .. wordmark extrusion) lands centred on the SAFE rect
    const top = E.iconY, bot = E.wmY + 27;
    LAND_DY = ri((SAFE_L.y0 + SAFE_L.y1) / 2 - (top + bot) / 2);
  }
  // captions: Jersey 15 (cap 15 art px = 60 output px), always two balanced lines; tracking
  // tightens by one art px only when a line would not fit the SAFE width
  S.capLines = CAPTIONS.map((c) => {
    for (const track of [0, -1]) {
      const sp = split2(c.text, 'j15', track);
      if (sp.w <= CAP_MAXW) return { lines: sp.lines, track };
    }
    return { lines: wrapN(c.text, 'j15', 1, CAP_MAXW), track: 0 };
  });
  // warm the glyph caches for everything drawn later
  // (every remote label in both label colours, and the answer letters at s = 2)
  for (const ch of [...KEYBOARD, 'OK']) for (const fill of ['#ffffff', X.ink]) textSprite(ch, 'ps', { s: 1, fill, track: 0 });
  for (const ch of new Set(ANSWER)) {
    textSprite(ch, 'ps', { s: 2, fill: X.ink });
    textSprite(ch, 'ps', { s: 2, fill: X.gold, out: X.ink });
    textSprite(ch, 'ps', { s: 2, fill: ['#ffffff', '#ffffff', X.cream], ext: { d: 2, c: X.ink, dx: 0 } });
  }
  ready = true;
}

export function drawFrame(ctx, t) {
  if (!ready) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  t = clamp(t, 0, 14.9999);
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalAlpha = 1;
  L.globalCompositeOperation = 'source-over';
  L.imageSmoothingEnabled = false;
  OVERLAYS.length = 0;
  HIRES.length = 0;

  if (t < CUES.pushIn) drawScene1(t);
  else if (t < CUES.correct) drawScene2(t);
  else if (t < CUES.correct + 0.16) {
    // green flood: stepped diamond from the phone screen outward. It is already open on the
    // cue frame itself (the fanfare hit), the outgoing half keeps its checking state, and
    // the badge + CORRETO! stamp ride on top so the scale-4 stamp is whole on f240/f241.
    const p = outCubic(prog(t, CUES.correct - 1 / FPS, CUES.correct + 0.16));
    const r = p * 420, ox = CX, oy = 200;
    mixScenes(() => drawScene2(Math.min(t, CUES.correct - 1e-4)), () => drawScene3(t), (x, y) => {
      const d = Math.abs(x - ox) + Math.abs(y - oy) * 0.8;
      return d < r - 5 ? 1 : d < r ? 2 : 0;
    }, '#ffffff');
    drawCheckBadge(L, t);
    drawCorrectStamp(t);
  } else if (t < CUES.ctaTransition) drawScene3(t);
  else if (t < CUES.ctaTransition + 0.25) {
    // diamond-grid wipe sweeping diagonally. It is already ~30 % open on the cue frame (the
    // whoosh's snap), passes 50 % a frame later and is complete by ~f365.
    // Bigger cells and a MID-TONE brand-magenta edge (was gold, cell 24): no fine, full-screen,
    // high-contrast lattice for pattern sensitivity or the feed encoder.
    const p = 0.3 + 0.7 * prog(t, CUES.ctaTransition, CUES.ctaTransition + 0.25);
    const cell = 32;
    mixScenes(() => drawScene3(t), () => drawScene4(t), (x, y) => {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      const ccx = gx * cell + cell / 2, ccy = gy * cell + cell / 2;
      const delay = ((gx + gy * 0.6) / (LW / cell + (LH / cell) * 0.6)) * 0.35;
      const r = clamp((p - delay) / 0.42, 0, 1) * cell * 1.05;
      const d = Math.abs(x + 0.5 - ccx) + Math.abs(y + 0.5 - ccy);
      return d < r - 2 ? 1 : d < r ? 2 : 0;
    }, X.pinkDk);
  } else drawScene4(t);

  drawCaption(t);
  for (const fn of OVERLAYS) fn();
  OVERLAYS.length = 0;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lo, 0, 0, W, H);
  // official artwork at output resolution (see HIRES), rounded like an app icon
  for (const o of HIRES) {
    const k = W / LW, x = Math.round(o.x * k), y = Math.round(o.y * k), w = Math.round(o.w * k), h = Math.round(o.h * k);
    if (w < 1 || h < 1) continue;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(o.r * k, h / 2)); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(o.c, x, y, w, h);
    ctx.restore();
  }
  HIRES.length = 0;
  ctx.restore();
}
