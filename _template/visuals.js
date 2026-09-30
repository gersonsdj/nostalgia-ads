// visuals_b.js — "BOLD GRAPHIC / UI-FIRST" direction for the Nostalgia 15 s ad.
//
// Everything (art AND type) is drawn on a 270x480 low-res canvas — one art pixel = 4x4
// output pixels — and blown up with nearest-neighbour at the very end, so no element can
// ever sit on a half pixel. Type comes from Google pixel fonts (Press Start 2P for
// headings, Jersey 10 for sentences with accents): each glyph is rasterised once at 10x,
// sampled at its design-pixel centres and cached as a bitmap, then styled (bands, outline,
// extrusion) like a sprite. drawFrame(ctx, t) is a pure function of t.
import { W, H, LW, LH, FPS, BEAT, MUSIC_START, CUES, CAPTIONS, COPY, SAFE, PALETTE, ANSWER } from './timeline.js';

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
const CONFETTI = ['#ff4f9a', '#ffd84a', '#73eff7', '#ffffff', '#ef7d57', '#a7f070', '#7b2fbe', '#41a6f6'];

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
let flameImg, FL32;  // explosion buffer (arena-sized)
let gcv, gctx;       // glyph rasteriser
let charImg = null, logoImg = null;
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
const AR = { x: 51, y: 112, cell: 24, n: 7 };
const HC = AR.cell / 2;
const BOMB_CELL = { cx: 3, cy: 3 };
// Scene 2 phone (close-up)
const PH2 = { x: 26, y: 24, w: 218, h: 520, r: 20 };
const SC2 = { x: 36, y: 42, w: 198, h: 500 };
const SLOT = { x: 41, y: 84, w: 20, h: 22, gap: 1 };
const CAP2_Y = 139;   // scene-2 caption lives in its own band between the slots and the remote
const RM = { x: 46, y: 172, w: 178, h: 138 };
const KEY = { x0: 56, y0: 218, w: 20, h: 15, gx: 3, gy: 3, cols: 7 };
const OK_INDEX = 27, BS_INDEX = 26;
// Scene 3
const CARD = { x: CX - 55, y: 112, w: 108, h: 108 };
// Scene 4
const CXE = 126;    // end-card axis = SAFE centre (506 output px)
let LAND_DY = 120;  // the lockup lands this much lower (SAFE centre), then slides up (set in init)

function keyRect(k) {
  const col = k % KEY.cols, row = Math.floor(k / KEY.cols);
  return { x: KEY.x0 + col * (KEY.w + KEY.gx), y: KEY.y0 + row * (KEY.h + KEY.gy), w: KEY.w, h: KEY.h };
}
function keyIndexOf(ch) { return ch.charCodeAt(0) - 65; }
function slotRect(i) { return { x: SLOT.x + i * (SLOT.w + SLOT.gap), y: SLOT.y, w: SLOT.w, h: SLOT.h }; }

// ---------------------------------------------------------------------------------------
// Prebuilt sprites
const S = {};
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
// The bomb stays a DARK bomb while it heats up: the heat shows as a red rim + a hot
// highlight flash on each throb, never as a red body (it read as a tomato).
const BOMB_R = 9;
// cel = [dither amplitude, dark|mid threshold, mid|light threshold]: ~13 % dark, ~66 % mid
// (#343a5e), ~21 % light in the top-left. The hot variant differs ONLY by rim + specular.
const BOMB_CEL = [0.25, 0.5, 2.65];
const BOMB_RAMPS = [
  { out: X.bodyInk, d: '#1c1e33', m: '#343a5e', l: '#6a74b0', s: '#ffffff', cel: BOMB_CEL },
  { out: '#5a0a18', d: '#1c1e33', m: '#343a5e', l: '#6a74b0', s: '#ffffff', rim: '#9e1f33', cel: BOMB_CEL },
  { out: '#ff3b3b', d: '#1c1e33', m: '#343a5e', l: '#6a74b0', s: '#fff3b0', rim: '#ff8a3a', cel: BOMB_CEL },
];

function buildArena() {
  const n = AR.n, cs = AR.cell, c = mk(n * cs, n * cs), x = ctxOf(c);
  const isWall = (i, j) => i === 0 || j === 0 || i === n - 1 || j === n - 1 || (i % 2 === 0 && j % 2 === 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const px = i * cs, py = j * cs;
    R(x, px, py, cs, cs, (i + j) & 1 ? '#3fae58' : '#48bb61');
    for (let k = 0; k < 5; k++) {
      const hx = Math.floor(hash3(i, j, k) * (cs - 3)) + 1, hy = Math.floor(hash3(j, i, k + 9) * (cs - 3)) + 1;
      R(x, px + hx, py + hy, 1, 1, '#7bdc86');
      R(x, px + hx, py + hy + 1, 1, 1, '#2f8f47');
    }
  }
  // cast shadows
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!isWall(i, j)) continue;
    if (j + 1 < n && !isWall(i, j + 1)) R(x, i * cs, (j + 1) * cs, cs, 3, '#2a8a45');
    if (i + 1 < n && !isWall(i + 1, j)) R(x, (i + 1) * cs, j * cs + 3, 2, cs, '#2f9a4c');
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (isWall(i, j)) stoneBlock(x, i * cs, j * cs, i === 0 || j === 0 || i === n - 1 || j === n - 1);
  // soft decorative bricks that survive
  for (const [i, j] of [[1, 1], [5, 5], [5, 2], [1, 4]]) brickBlock(x, i * cs, j * cs);
  return c;
}
function stoneBlock(x, px, py, outer) {
  const c = AR.cell, f = c - 7;
  const top = outer ? '#8d7bd0' : '#a9b6cc', lt = outer ? '#c9bdf5' : '#eef3fa', side = outer ? '#4b3a8e' : '#56627f', dk = outer ? '#2b1f5a' : '#343c57';
  R(x, px, py, c, c, X.ink);
  R(x, px + 1, py + 1, c - 2, f, top);
  R(x, px + 1, py + 1, c - 2, 1, lt); R(x, px + 1, py + 1, 1, f, lt);
  R(x, px + 1, py + 1 + f, c - 2, 5, side);
  R(x, px + 1, py + c - 2, c - 2, 1, dk);
  if (!outer) { R(x, px + 4, py + 4, 3, 2, lt); R(x, px + 12, py + 9, 3, 1, dk); R(x, px + 5, py + 16, 2, 1, dk); }
  else { R(x, px + (c >> 1), py + 1, 1, f, dk); R(x, px + 1, py + (f >> 1) + 1, c - 2, 1, dk); }
}
function brickBlock(x, px, py) {
  const c = AR.cell, f = c - 7, m = '#b13e53';
  R(x, px, py, c, c, X.ink);
  R(x, px + 1, py + 1, c - 2, f, '#ef7d57');
  R(x, px + 1, py + 1, c - 2, 1, '#ffcd75');
  // three courses of bricks, staggered joints (parametric in the cell size)
  const r1 = 1 + ri(f / 3), r2 = 1 + ri((2 * f) / 3);
  R(x, px + 1, py + r1, c - 2, 1, m); R(x, px + 1, py + r2, c - 2, 1, m);
  const a = ri(c * 0.32), b = ri(c * 0.66), q = ri(c * 0.15), hlf = ri(c * 0.5), z = ri(c * 0.83);
  R(x, px + a, py + 1, 1, r1 - 1, m); R(x, px + b, py + 1, 1, r1 - 1, m);
  R(x, px + q, py + r1 + 1, 1, r2 - r1 - 1, m); R(x, px + hlf, py + r1 + 1, 1, r2 - r1 - 1, m); R(x, px + z, py + r1 + 1, 1, r2 - r1 - 1, m);
  R(x, px + a, py + r2 + 1, 1, f - r2, m); R(x, px + b, py + r2 + 1, 1, f - r2, m);
  // lit top edge of each course
  R(x, px + 1, py + r1 + 1, c - 2, 1, '#ff9f73'); R(x, px + 1, py + r2 + 1, c - 2, 1, '#ff9f73');
  R(x, px + 1, py + 1 + f, c - 2, 5, '#a33a3a'); R(x, px + 1, py + c - 2, c - 2, 1, '#5d1f2e');
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
function buildScreenBG(w, h) { return ditherV(w, h, ['#2e2870', '#221d57', '#161240']); }

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

function buildAppIcon() {
  const sz = 46, c = mk(sz + 2, sz + 5), x = ctxOf(c);
  rrect(x, 0, 3, sz + 2, sz + 2, 12, '#2a0f3f');
  rrect(x, 0, 0, sz + 2, sz + 2, 12, X.ink);
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

function buildHero() { // ORIGINAL placeholder: a heroic bomb with a bandana (not any existing character)
  const c = mk(80, 80), x = ctxOf(c);
  const cx = 38, cy = 46, r = 24;
  // bandana tails (behind)
  const tail = (pts, col) => pts.forEach(([a, b, w, h]) => R(x, a, b, w, h, col));
  tail([[58, 22, 10, 5], [66, 18, 7, 5], [71, 14, 5, 5]], X.ink);
  tail([[59, 23, 9, 3], [67, 19, 5, 3], [72, 15, 3, 3]], X.red);
  tail([[58, 29, 11, 5], [67, 31, 7, 5]], X.ink);
  tail([[59, 30, 9, 3], [68, 32, 5, 3]], X.redDk);
  const ball = ballSprite(r, { out: X.bodyInk, d: '#1c1e38', m: '#353d6e', l: '#6874c0', s: '#ffffff' });
  x.drawImage(ball, cx - r - 1, cy - r - 1);
  // bandana band, clipped to the ball
  for (let j = cy - 16; j <= cy - 9; j++) {
    const dy = j + 0.5 - (cy + 0.5);
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    const col = j === cy - 16 ? X.redLt : j >= cy - 10 ? X.redDk : X.red;
    R(x, cx - hw, j, 2 * hw + 1, 1, col);
  }
  R(x, cx - 23, cy - 17, 46, 1, X.ink);
  // knot
  disc(x, cx + 20, cy - 13, 3, X.ink); disc(x, cx + 20, cy - 13, 2, X.red);
  // star on bandana
  sparkle(x, cx - 2, cy - 13, 2, '#ffffff', X.gold);
  // eyes (determined)
  for (const ex of [cx - 9, cx + 5]) {
    rrect(x, ex - 1, cy - 8, 9, 12, 3, X.ink);
    rrect(x, ex, cy - 7, 7, 10, 3, '#ffffff');
    R(x, ex + 3, cy - 4, 3, 5, X.ink);
    R(x, ex + 4, cy - 4, 1, 1, '#ffffff');
  }
  // brows cut by the bandana: angled
  R(x, cx - 10, cy - 9, 6, 2, X.ink); R(x, cx - 5, cy - 8, 3, 1, X.ink);
  R(x, cx + 7, cy - 9, 6, 2, X.ink); R(x, cx + 4, cy - 8, 3, 1, X.ink);
  // grin
  R(x, cx - 6, cy + 7, 14, 1, X.ink); R(x, cx - 7, cy + 6, 1, 1, X.ink); R(x, cx + 8, cy + 6, 1, 1, X.ink);
  R(x, cx - 5, cy + 8, 12, 3, X.ink); R(x, cx - 4, cy + 8, 10, 2, '#ffffff'); R(x, cx - 3, cy + 10, 8, 1, '#ff7b9a');
  // cheeks
  R(x, cx - 14, cy + 4, 3, 1, '#ff7b9a'); R(x, cx + 13, cy + 4, 3, 1, '#ff7b9a');
  // cap + fuse
  R(x, cx + 11, cy - 25, 8, 6, X.ink); R(x, cx + 12, cy - 24, 6, 4, '#94b0c2'); R(x, cx + 12, cy - 24, 6, 1, '#f4f4f4');
  const fuse = [[18, -26], [19, -27], [20, -28], [20, -29], [21, -30], [22, -31], [23, -31], [24, -32]];
  fuse.forEach(([a, b]) => { R(x, cx + a - 1, cy + b, 3, 2, X.ink); });
  fuse.forEach(([a, b], i) => R(x, cx + a, cy + b, 1, 1, i % 2 ? '#e0b080' : '#c9825d'));
  return c;
}
const HERO_TIP = { x: 38 + 24, y: 46 - 32 };

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
  const bg = mk(iw, ih), bx = ctxOf(bg);
  const img = bx.createImageData(iw, ih), d = new Uint32Array(img.data.buffer);
  const cA = [u32('#6fd0ff'), u32('#41a6f6'), u32('#3b5dc9'), u32('#29366f')];
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    const dx = (i - iw / 2) / (iw / 2), dy = (j - ih * 0.45) / (ih / 2);
    const v = Math.sqrt(dx * dx + dy * dy) * 2.2 + (bay(i, j) - 0.5) * 0.9;
    let col = cA[clamp(Math.floor(v), 0, 3)];
    if (j > ih * 0.8) col = ((Math.floor(i / 8) + Math.floor((j - Math.floor(ih * 0.8)) / 4)) & 1) ? u32('#4b1d8a') : u32('#7b2fbe');
    d[j * iw + i] = col;
  }
  bx.putImageData(img, 0, 0);
  // rays behind hero
  x.drawImage(bg, ix, iy);
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
    // floor shadow
    for (let k = -18; k <= 18; k++) R(x, ix + iw / 2 + k - 1, iy + ih - 18 + (Math.abs(k) > 14 ? 1 : 0), 1, Math.abs(k) > 14 ? 1 : 3, '#2a0f5a');
    x.drawImage(S.hero, ix + Math.floor(iw / 2) - 38, iy + ih - 18 - 72 + 2);
  }
  return c;
}

// The card's label is the player's ANSWER, set in the same blue slot tiles as scene 2
// (not a character nameplate): the placeholder art is never presented AS the brand.
function buildAnswerTiles(text) {
  const n = text.length, tw = 11, th = 13, gap = 1;
  const w = n * (tw + gap) - gap + 4, h = th + 5, c = mk(w, h + 2), x = ctxOf(c);
  rrect(x, 0, 2, w, h, 4, '#07331c');
  rrect(x, 0, 0, w, h, 4, X.ink);
  for (let i = 0; i < n; i++) {
    const tx = 2 + i * (tw + gap), ty = 2;
    rrect(x, tx, ty, tw, th, 2, '#29366f');
    rrect(x, tx, ty, tw, th - 1, 2, '#3b5dc9');
    R(x, tx + 2, ty, tw - 4, 1, '#6f8cff');
    drawText(x, text[i], 'ps', { s: 1, fill: '#ffffff', ext: { d: 1, c: X.ink, dx: 0 } }, tx + tw / 2 + 1, ty + 2, 'c');
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
  const ang = new Float32Array(LW * LH), dist = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    ang[y * LW + x] = Math.atan2(dy, dx);
    dist[y * LW + x] = Math.sqrt(dx * dx + dy * dy);
  }
  t = { ang, dist };
  RAYT.set(k, t);
  return t;
}
function bgRays(cx, cy, n, rot, colA, colB, glow, fade) {
  // glow: [{r, col}] sorted by radius (inner colors), fade: {r0, r1, cols:[...]} outer darkening
  const { ang, dist } = rayTable(cx, cy);
  const A = colA.map ? colA : [colA], uA = u32(colA), uB = u32(colB);
  void A;
  const uG = glow ? glow.map((g) => ({ r: g.r, c: u32(g.col) })) : [];
  const uF = fade ? fade.cols.map(u32) : [];
  const k = n / (2 * Math.PI);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = y * LW + x, b = bay(x, y);
    const d = dist[i];
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
    BG32[i] = col;
  }
}
function putBG() { L.putImageData(bgImg, 0, 0); }

// Scene 2 background: diagonal poster stripes over a dithered gradient
let S2ROWS = null;
function buildS2Rows() {
  const top = ['#ff5aa8', '#e2359a', '#a52aa8', '#6a24a0', '#3b1a78', '#22104f'];
  const topB = ['#ff74b8', '#f04aa6', '#b83ab4', '#7a32ae', '#482488', '#2b165e'];
  const mkRow = (cols) => {
    const u = cols.map(u32), n = u.length - 1, rows = [];
    for (let y = 0; y < LH; y++) {
      const f = (y / (LH - 1)) * n, i0 = Math.min(n - 1, Math.floor(f)), fr = f - i0;
      const r4 = [];
      for (let x = 0; x < 4; x++) r4.push(fr > bay(x, y) ? u[i0 + 1] : u[i0]);
      rows.push(r4);
    }
    return rows;
  };
  S2ROWS = [mkRow(top), mkRow(topB)];
}
function bgScene2(t) {
  const off = frameOf(t) >> 1; // one lo px every other frame: a steady 15 px/s, no limp
  for (let y = 0; y < LH; y++) {
    const ra = S2ROWS[0][y], rb = S2ROWS[1][y];
    for (let x = 0; x < LW; x++) {
      const s = (Math.floor((x + y + off) / 20) & 1);
      BG32[y * LW + x] = (s ? rb : ra)[x & 3];
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
  if (t >= CUES.explode && t < CUES.blastEnd + 0.05) {
    const wf = 0.5 * (1 - inQuad(prog(t, CUES.explode + 0.12, CUES.blastEnd + 0.05)));
    const cx = AR.x + BOMB_CELL.cx * AR.cell + HC, cy = AR.y + BOMB_CELL.cy * AR.cell + HC;
    const { ang, dist } = rayTable(cx, cy);
    const uA = u32('#ff8a1f'), uB = u32('#ffcd3a'), uC = u32('#d9281f');
    const rot = (t - CUES.explode) * 0.8, k = 14 / (2 * Math.PI);
    const reach = 60 + 500 * outCubic(prog(t, CUES.explode, CUES.explode + 0.25));
    for (let i = 0; i < LW * LH; i++) {
      const x = i % LW, y = (i / LW) | 0;
      const d = dist[i];
      if (d > reach) continue;
      const edge = d > reach - 8 && reach < 420;
      if (edge) { BG32[i] = uC; continue; }
      const fr = ((ang[i] + rot) * k + 1000) % 1;
      if (fr < wf) BG32[i] = d < 120 + (bay(x, y) - 0.5) * 16 ? uB : uA;
      void x; void y;
    }
  }
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

// Hot blinks on the frame grid, locked to the music: onsets on the 16th/32nd grid after the
// landing (1.75, 2.0, 2.1875, 2.3125, 2.375, 2.4375 s -> gaps of 7, 6, 4, 2, 2 frames), each
// held BLINK_HOLD frames, so the last frames before the blast are solid hot and the white
// flash is the payoff (no isolated one-frame pops).
const BLINK_HOLD = 2;
const BLINK_AT = [2, 4, 5.5, 6.5, 7, 7.5].map((n) => CUES.bombLand + n * (BEAT / 4));
const FUSE_BURN = 0.45; // share of the fuse burnt by the blast: a long lit fuse stays visible
function fuseState(t) {
  const tau = clamp(t - CUES.bombLand, 0, CUES.explode - CUES.bombLand);
  const dur = CUES.explode - CUES.bombLand;
  let beat = 0;
  if (t >= CUES.bombLand && t < CUES.explode) {
    for (const b of BLINK_AT) { const s = sinceCue(t, b); if (s >= 0 && s < BLINK_HOLD) beat = 1; }
  }
  const heat = tau / dur;
  return { tau, beat, heat, burn: FUSE_BURN * tau / dur };
}

let FUSE_TIP = [135, 180]; // last drawn fuse tip (lo coords), used by the zoom overlay
// A long curved rope fuse: a cubic S-curve sampled into 8-connected 1-px steps, drawn as a
// 2-px rope (light top-left edge, twist shade every third step) inside a 1-px ink outline.
const FUSE_PATH = (() => {
  const P0 = [0, 0], P1 = [0, -7], P2 = [9, -6], P3 = [8, -15];
  const pts = [];
  for (let k = 0; k <= 400; k++) {
    const u = k / 400, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
    const p = [ri(a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0]), ri(a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1])];
    const q = pts[pts.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
  }
  return pts;
})();
const ROPE = { lt: '#f0c890', base: '#c9825d', sh: '#8a5a3a' };
function drawBomb(ctx, cx, by, sx, sy, variant, fuseN, t, sparks) {
  const sp = S.bomb[variant];
  const w = Math.max(3, ri(sp.width * sx)), h = Math.max(3, ri(sp.height * sy));
  const x0 = ri(cx - w / 2), y0 = by - h;
  ctx.drawImage(sp, x0, y0, w, h);
  // cap
  const capx = ri(cx + w * 0.12), capy = y0 - 1;
  const ox = capx + 1, oy = capy - 3;
  let tip = [ox + 1, oy];
  for (let i = 0; i < fuseN; i++) { const [a, b] = FUSE_PATH[i]; R(ctx, ox + a - 1, oy + b - 1, 4, 4, X.ink); }
  R(ctx, capx - 1, capy - 2, 6, 4, X.ink); R(ctx, capx, capy - 1, 4, 2, '#94b0c2'); R(ctx, capx, capy - 1, 4, 1, '#f4f4f4');
  for (let i = 0; i < fuseN; i++) {
    const [a, b] = FUSE_PATH[i];
    const px = ox + a, py = oy + b;
    const lit = sparks && i >= fuseN - 2;           // the burning end glows
    R(ctx, px, py, 2, 2, lit ? X.fO : ROPE.base);
    R(ctx, px, py, 1, 1, lit ? X.fY : ROPE.lt);
    if (!lit && i % 3 === 0) R(ctx, px + 1, py + 1, 1, 1, ROPE.sh);
    tip = [px + 1, py];
  }
  if (sparks) {
    const f = frameOf(t);
    // spark: a dithered fY/fO glow disc under a 2-frame star (5 / 7-px arms, white core)
    ditherDisc(ctx, tip[0], tip[1], 6, X.fY, X.fO, 0.62);
    const s = (f & 1) ? 5 : 7;
    R(ctx, tip[0] - s, tip[1], 2 * s + 1, 1, X.fY); R(ctx, tip[0], tip[1] - s, 1, 2 * s + 1, X.fY);
    for (let d = 1; d <= (s >> 1); d++) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) R(ctx, tip[0] + a * d, tip[1] + b * d, 1, 1, d === 1 ? '#ffffff' : X.fO);
    R(ctx, tip[0] - 3, tip[1], 7, 1, '#ffffff'); R(ctx, tip[0], tip[1] - 3, 1, 7, '#ffffff');
    R(ctx, tip[0] - 1, tip[1] - 1, 3, 3, '#ffffff');
    // 2x2 embers thrown off the spark
    const base = Math.floor((t - CUES.fuseStart) * 60);
    for (let j = 0; j < 14; j++) {
      const id = base - j;
      if (id < 0) continue;
      const ts = CUES.fuseStart + id / 60, age = t - ts;
      if (age < 0 || age > 0.22) continue;
      const rng = mulberry32(id * 7919 + 17);
      const ang = rng() * Math.PI * 2, sp2 = 40 + rng() * 70;
      const px = tip[0] + Math.cos(ang) * sp2 * age, py = tip[1] + Math.sin(ang) * sp2 * age + 90 * age * age;
      const col = age < 0.07 ? '#ffffff' : age < 0.14 ? X.fY : X.fO;
      R(ctx, ri(px), ri(py), 2, 2, col);
    }
  }
  return tip;
}

function flameAt(t) {
  const e = CUES.explode;
  const grow = outCubic(prog(t, e, e + 0.1));
  const recede = prog(t, e + 0.3, CUES.blastEnd);
  let k = t < e + 0.05 ? lerp(0.7, 1.2, prog(t, e, e + 0.05)) : lerp(1.2, 1, prog(t, e + 0.05, e + 0.12));
  k *= 1 - inQuad(recede);
  return { reach: HC + 2 * AR.cell * grow, k, recede };
}
function drawFlame(ctx, t) {
  const { reach, k, recede } = flameAt(t);
  if (k <= 0.05) return;
  const f = frameOf(t);
  const n = AR.cell * AR.n;
  const cx = BOMB_CELL.cx * AR.cell + HC, cy = BOMB_CELL.cy * AR.cell + HC;
  FL32.fill(0);
  const uW = u32(X.fW), uY = u32(X.fY), uO = u32(X.fO), uR = u32(X.fR);
  const hw0 = 8.5 * (AR.cell / 20) * k, sc = 1 + recede * 0.9;
  const y0 = Math.max(0, Math.floor(cy - reach - 2)), y1 = Math.min(n, Math.ceil(cy + reach + 2));
  for (let y = y0; y < y1; y++) for (let x = Math.max(0, Math.floor(cx - reach - 2)); x < Math.min(n, Math.ceil(cx + reach + 2)); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    let s = 9;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax <= reach) {
      const e = reach - ax, tp = e >= 7 ? 1 : 0.35 + 0.65 * (e / 7);
      const wob = (Math.floor(hash3(Math.floor(ax / 3), dx < 0 ? 1 : 2, f) * 3) - 1) * 0.8;
      s = Math.min(s, ay / Math.max(0.5, hw0 * tp + wob * k));
    }
    if (ay <= reach) {
      const e = reach - ay, tp = e >= 8 ? 1 : 0.35 + 0.65 * (e / 8);
      const wob = (Math.floor(hash3(Math.floor(ay / 3), dy < 0 ? 3 : 4, f) * 3) - 1) * 0.8;
      s = Math.min(s, ax / Math.max(0.5, hw0 * tp + wob * k));
    }
    s = Math.min(s, Math.sqrt(dx * dx + dy * dy) / (hw0 * 1.45));
    s *= sc;
    if (s > 1) continue;
    FL32[y * n + x] = s < 0.32 ? uW : s < 0.58 ? uY : s < 0.82 ? uO : uR;
  }
  TX.clearRect(0, 0, n, n);
  TX.putImageData(flameImg, 0, 0);
  ctx.drawImage(tmp, 0, 0, n, n, AR.x, AR.y, n, n);
}
const DESTROY = [[BOMB_CELL.cx - 2, BOMB_CELL.cy], [BOMB_CELL.cx + 2, BOMB_CELL.cy], [BOMB_CELL.cx, BOMB_CELL.cy - 2], [BOMB_CELL.cx, BOMB_CELL.cy + 2]];

function drawApp1(ctx, t) {
  const f = frameOf(t);
  ctx.drawImage(S.scr1, SC1.x, SC1.y);
  drawAppBar(ctx, SC1.x, SC1.y, SC1.w);
  // prompt
  drawText(ctx, COPY.quizPrompt, 'ps', { s: 1, fill: [X.cream, X.gold], ext: { d: 1, c: X.ink } }, CX, SC1.y + 24, 'c');
  // listening wave (pulses with the fuse)
  const fs = fuseState(t);
  const fusing = t >= CUES.bombLand && t < CUES.explode;
  drawWave(ctx, CX, SC1.y + 44, 17, t, fusing ? 3 + fs.heat * 4 : 3, fusing ? fs.beat : 0);
  // arena
  ctx.save();
  ctx.beginPath(); ctx.rect(AR.x, AR.y, AR.cell * AR.n, AR.cell * AR.n); ctx.clip();
  ctx.drawImage(S.arena, AR.x, AR.y);
  const e = CUES.explode;
  // destroyable bricks
  DESTROY.forEach(([i, j], bi) => {
    const px = AR.x + i * AR.cell, py = AR.y + j * AR.cell;
    const hitT = e + 0.06;
    if (t < hitT) { if (j + 2 < AR.n) R(ctx, px, py + AR.cell, AR.cell, 3, '#2a8a45'); ctx.drawImage(S.brick, px, py); }
    else if (t < hitT + 0.2) {
      // burning brick: flashes then crumbles
      const fl = ((f + bi) & 1) ? '#ffffff' : '#ffcd75';
      const shrink = Math.floor(prog(t, hitT, hitT + 0.2) * 6);
      R(ctx, px + shrink, py + shrink * 2, AR.cell - shrink * 2, AR.cell - shrink * 2, X.ink);
      R(ctx, px + 1 + shrink, py + 1 + shrink * 2, AR.cell - 2 - shrink * 2, AR.cell - 5 - shrink * 2, fl);
    }
  });
  const cellX = AR.x + BOMB_CELL.cx * AR.cell + HC, floorY = AR.y + BOMB_CELL.cy * AR.cell + AR.cell - 1;
  let falling = null;
  if (t >= CUES.bombDrop && t < e) {
    // drop + squash & stretch
    let by = floorY, sx = 1, sy = 1;
    if (t < CUES.bombLand) {
      const p = prog(t, CUES.bombDrop, CUES.bombLand);
      // starts inside the arena (visible from its first frame), drawn after the clip below
      by = ri(lerp(AR.y + 26, floorY, inQuad(p)));
      sx = 0.82; sy = 1.25;
      // shadow grows
      const sw = ri(4 + 12 * p);
      R(ctx, cellX - (sw >> 1), floorY - 2, sw, 3, '#2a8a45');
    } else {
      const dt = t - CUES.bombLand;
      const sq = Math.exp(-dt * 9) * Math.cos(dt * 38);
      sx = 1 + 0.35 * sq; sy = 1 - 0.3 * sq;
      R(ctx, cellX - 9, floorY - 2, 18, 3, '#2a8a45');
      // throb: bigger + redder on each beat
      const fs2 = fuseState(t);
      const th = fs2.beat * (0.08 + 0.12 * fs2.heat);
      sx += th; sy += th;
    }
    let variant = 0;
    if (t >= CUES.bombLand) variant = fs.beat ? 2 : fs.heat > 0.45 ? 1 : 0;
    const fuseN = t < CUES.bombLand ? FUSE_PATH.length : Math.max(1, Math.ceil(FUSE_PATH.length * (1 - fs.burn)));
    // landing dust: flat dashes on the floor line, spawned OUTSIDE the squashed body and
    // drawn BEHIND it, sliding outward (never round pale blobs under the sphere)
    if (t >= CUES.bombLand && t < CUES.bombLand + 0.3) {
      const p = prog(t, CUES.bombLand, CUES.bombLand + 0.3), q = outCubic(p);
      const half = Math.ceil(Math.max(3, ri(S.bomb[0].width * sx)) / 2);
      const DASH = [[7, 2, 3, 10, 0], [4, 1, 6, 14, 2], [3, 1, 11, 9, 1]]; // len, h, gap, travel, rise
      for (const s of [-1, 1]) DASH.forEach(([len0, hh, gap, trav, rise], k) => {
        const len = Math.max(1, ri(len0 * (1 - 0.75 * p) + (s > 0 ? k & 1 : 0)));
        const xin = cellX + s * (half + gap + ri(q * trav));
        const x = s < 0 ? xin - len : xin, y = floorY - 1 - hh - ri(rise * q);
        R(ctx, x, y, len, hh, p < 0.5 ? '#e8f7d8' : '#c4e8b8');
        if (hh > 1) R(ctx, x, y + hh - 1, len, 1, '#a8d8a0');
      });
    }
    if (t < CUES.bombLand) falling = { by, sx, sy, variant, fuseN };
    else FUSE_TIP = drawBomb(ctx, cellX, by, sx, sy, variant, fuseN, t, true);
  }
  // explosion
  if (t >= e) {
    drawFlame(ctx, t);
    // smoke puffs
    if (t > e + 0.3) {
      const cells = [[0, 0]];
      for (let s = 1; s <= 2; s++) cells.push([s, 0], [-s, 0], [0, s], [0, -s]);
      cells.forEach(([a, b], j) => {
        const st = e + 0.3 + (Math.abs(a) + Math.abs(b)) * 0.03;
        const p = prog(t, st, st + 0.5);
        if (p <= 0 || p >= 1) return;
        const rng = mulberry32(j * 31 + 5);
        const px = cellX + a * AR.cell + (rng() - 0.5) * 6, py = floorY - 9 + b * AR.cell - p * 10;
        smokePuff(ctx, px, py, ri((5 + 5 * p) * (p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1)));
      });
    }
  }
  ctx.restore();
  // the falling bomb is clipped to the phone screen, not the arena, so all of its frames show
  if (falling) {
    ctx.save();
    ctx.beginPath(); ctx.rect(SC1.x, SC1.y, SC1.w, SC1.h); ctx.clip();
    FUSE_TIP = drawBomb(ctx, cellX, falling.by, falling.sx, falling.sy, falling.variant, falling.fuseN, t, false);
    ctx.restore();
  }
  // bottom UI: round timer + lives (kept high enough that the caption box never clips it)
  const aw = AR.cell * AR.n, ty = AR.y + aw + 4;
  const left = 1 - 0.4 * prog(t, CUES.appReady, 3.0);
  R(ctx, AR.x - 1, ty - 1, aw + 2, 8, X.ink);
  R(ctx, AR.x, ty, aw, 6, '#141233');
  R(ctx, AR.x, ty, ri(aw * left), 6, left > 0.7 ? '#a7f070' : X.gold);
  R(ctx, AR.x, ty, ri(aw * left), 1, '#ffffff');
  for (let k = 0; k < 3; k++) ctx.drawImage(S.heart, AR.x + k * 11, ty + 10);
  ctx.drawImage(S.coins[Math.floor(t * 10) % 6], AR.x + aw - 14, ty + 7);
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
// "Sound on" hint over the static: a pixel speaker whose waves pulse out one by one.
// Drawn natively at ~3x the old glyph (about 66 x 52 lo = 264 x 208 output px), centred in
// SAFE, so it survives the 216-px feed thumbnail; the screen itself stays black.
function drawSpeakerHint(ctx, f) {
  const cxS = ri((SAFE_L.x0 + SAFE_L.x1) / 2), cyS = ri((SAFE_L.y0 + SAFE_L.y1) / 2);
  const ox = cxS - 30, cy = cyS;                    // ox = left of the magnet box
  const body = '#c9cce0', lt = '#f4f4f4', dk = '#6a6f8c';
  R(ctx, ox - 5, cy - 31, 70, 63, "#000000");       // clear plate over the snow
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

// Explosion debris flying OUT of the phone (drawn unclipped, above the phone)
function drawDebris(ctx, t) {
  const e = CUES.explode + 0.06;
  if (t < e || t > e + 0.9) return;
  const age = t - e;
  const cols = ['#ef7d57', '#ffcd75', '#b13e53', '#a33a3a'];
  DESTROY.forEach(([i, j], bi) => {
    const ox = AR.x + i * AR.cell + HC, oy = AR.y + j * AR.cell + HC;
    const dirx = Math.sign(i - BOMB_CELL.cx), diry = Math.sign(j - BOMB_CELL.cy);
    for (let k = 0; k < 7; k++) {
      const rng = mulberry32(bi * 101 + k * 7 + 3);
      const sp = 90 + rng() * 150;
      const ang = Math.atan2(diry, dirx) + (rng() - 0.5) * 1.6;
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - 90 - rng() * 60;
      const x = ox + vx * age, y = oy + vy * age + 380 * age * age;
      const sz = 2 + Math.floor(rng() * 3);
      R(ctx, ri(x) - 1, ri(y) - 1, sz + 2, sz + 2, X.ink);
      R(ctx, ri(x), ri(y), sz, sz, cols[k % 4]);
    }
  });
}

function drawScene1(t) {
  const f = frameOf(t);
  bgScene1(t, f);
  putBG();
  if (t < CUES.powerOn) { drawSpeakerHint(L, f); return; }
  // integer screen shake after the explosion
  let sx = 0, sy = 0;
  const e = CUES.explode;
  if (t >= e && t < e + 0.3) {
    const a = 4 * (1 - prog(t, e, e + 0.3));
    sx = ri((hash3(f, 1, 77) * 2 - 1) * a); sy = ri((hash3(f, 2, 77) * 2 - 1) * a);
  }
  L.save();
  L.translate(sx, sy);
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
    L.globalAlpha = 0.85 * (1 - p);
    R(L, SC1.x, SC1.y, SC1.w, SC1.h, '#ffffff');
    L.globalAlpha = 1;
    L.restore();
    const lw = ri(SC1.w * Math.min(1, p * 4));
    // CRT bloom: a dithered cyan halo that grows with the line
    ditherGlow(L, CX, cy, 24 + 120 * p, 5 + 60 * inQuad(p), 0.95 - 0.35 * p, '#dff6ff', '#73eff7');
    R(L, CX - lw / 2, cy - hh - 1, lw, 2, '#ffffff');
    R(L, CX - lw / 2, cy + hh - 1, lw, 2, '#ffffff');
    R(L, CX - lw / 2 - 4, cy - 1, lw + 8, 2, '#dff6ff');
  } else {
    drawApp1(L, t);
    // scanline sheen right after power-on
    if (t < CUES.appReady + 0.2) {
      const p = prog(t, CUES.appReady, CUES.appReady + 0.2);
      L.globalAlpha = 0.4 * (1 - p);
      R(L, SC1.x, SC1.y, SC1.w, SC1.h, '#ffffff');
      L.globalAlpha = 1;
    }
    // afterglow spilling off the freshly lit screen onto the bezel and the room
    if (t < AFTERGLOW_END) {
      const q = prog(t, CUES.appReady, AFTERGLOW_END);
      ditherGlow(L, CX, SC1.y + SC1.h / 2, SC1.w / 2 + 34, SC1.h / 2 + 34, 0.75 * (1 - q), '#9fd8ff', '#3b5dc9', SC1);
    }
  }
  L.restore();
  drawDebris(L, t);
  // flash of the power-on on the whole frame
  if (t < CUES.powerOn + 0.2) {
    L.globalAlpha = 0.14 * (1 - prog(t, CUES.powerOn, CUES.powerOn + 0.2));
    R(L, 0, 0, LW, LH, '#cfe8ff');
    L.globalAlpha = 1;
  }
  // beat-synced integer snap zoom onto the lit fuse (the memory trigger), released by the blast
  if (t >= CUES.bombLand && t < e) {
    const bcx = AR.x + BOMB_CELL.cx * AR.cell + HC, bcy = AR.y + BOMB_CELL.cy * AR.cell + HC;
    const k = t < CUES.bombLand + BEAT ? 2 : 3;
    // 2x: the zoomed prompt band is repainted and the prompt + wave come back as an
    // UNZOOMED HUD inside SAFE; 3x is all bomb
    const dcy = k === 2 ? 262 : 232;
    const zg = zoomLo(k, bcx, bcy, CX, dcy);
    if (k === 2) drawZoomHUD(t, k, bcx, bcy, dcy);
    const tip = [(FUSE_TIP[0] + 0.5 - bcx) * k + CX, (FUSE_TIP[1] + 0.5 - bcy) * k + dcy];
    drawSoundArcs(L, tip[0], tip[1], t, k, zg.gx, zg.gy);
    // one-frame punch on each snap: a local impact burst round the bomb (no full-frame
    // flash, so the hook stays well under 3 general flashes per second)
    const fz = sinceCue(t, k === 2 ? CUES.bombLand : CUES.bombLand + BEAT);
    if (fz === 0) impactBurst(L, CX, dcy - 2, k);
  }
  // explosion flash: ONE cream impact frame (the phone and cross blast show through ~20 %)
  // -> saturated hot-orange duotone -> sunburst. Never two near-white frames in a row.
  const ef = firstFrame(e);
  if (f === ef) { L.globalAlpha = 0.8; R(L, 0, 0, LW, LH, '#fff1c1'); L.globalAlpha = 1; }
  else if (f === ef + 1) hotTint();
}
const AFTERGLOW_END = 1.4;

// 2x snap zoom: cover the zoomed prompt/wave band with the (zoomed) app background and
// redraw the prompt + listening wave at native scale, below the platform top bar (lo y>=42)
// and inside the SAFE width, centred on the SAFE axis.
// Repaint everything above the zoomed arena with the zoomed app background (no zoomed copy).
function coverPromptBand(k, bcx, bcy, dcy) {
  const bandH = ri((AR.y - bcy) * k + dcy);
  if (bandH <= 0) return;
  const sx0 = Math.floor(bcx - CX / k), sy0 = Math.floor(bcy - dcy / k);
  const ddx = ri((sx0 - bcx) * k + CX), ddy = ri((sy0 - bcy) * k + dcy);
  const sw = Math.ceil(LW / k) + 2, sh = Math.ceil(bandH / k) + 2;
  L.save();
  L.beginPath(); L.rect(0, 0, LW, bandH); L.clip();
  L.drawImage(S.scr1, sx0 - SC1.x, sy0 - SC1.y, sw, sh, ddx, ddy, sw * k, sh * k);
  L.restore();
}
function drawZoomHUD(t, k, bcx, bcy, dcy) {
  coverPromptBand(k, bcx, bcy, dcy);
  drawText(L, COPY.quizPrompt, 'ps', { s: 2, track: -1, fill: [X.cream, X.gold], ext: { d: 2, c: X.ink } }, CXE, ZOOM_PROMPT_Y, 'c');
  const fs = fuseState(t);
  drawWave(L, CXE, ZOOM_PROMPT_Y + 32, 17, t, (3 + fs.heat * 4) * 0.7, fs.beat * 0.75);
}
const ZOOM_PROMPT_Y = 48; // lo px: the acute of the É sits at 42 (168 output px), below SAFE.y0
// Local one-frame impact burst: short radial dashes round the UPPER half of the bomb only
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
// ")))" sound arcs radiating from the fuse tip, one wave per throb
// Drawn on the ZOOMED pixel grid (k x k blocks at offset gx/gy) as solid strokes, so they
// share the bomb's pixel size; they fade by dropping the outermost arc, never by skipping
// pixels. Arcs sit above the tip (upper sweep only) so they never cover the rope.
function drawSoundArcs(ctx, x, y, t, k, gx = 0, gy = 0) {
  const fs = fuseState(t);
  const ph = ((t - CUES.fuseStart) * 4) % 1;
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
// Hot-orange duotone of the current frame (the second explosion frame): saturated, never grey.
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
  const ly = r.y + dn + 3;
  if (k < 26) {
    drawText(ctx, String.fromCharCode(65 + k), 'ps', { s: 1, fill: lab }, r.x + r.w / 2 + 1, ly, 'c');
  } else if (k === BS_INDEX) {
    // backspace arrow
    R(ctx, r.x + 5, ly + 3, 8, 1, lab); R(ctx, r.x + 5, ly + 2, 1, 3, lab); R(ctx, r.x + 4, ly + 3, 1, 1, lab); R(ctx, r.x + 6, ly + 1, 1, 5, lab);
  } else {
    drawText(ctx, 'OK', 'ps', { s: 1, fill: lab, track: -1 }, r.x + r.w / 2 + 1, ly, 'c');
  }
}

function typingEvents() {
  const ev = CUES.keyTimes.map((kt, i) => ({ t: kt, k: keyIndexOf(ANSWER[i]), i }));
  ev.push({ t: CUES.enter, k: OK_INDEX, i: -1 });
  return ev;
}
const EVENTS = typingEvents();
// The thumb pad lands on the key's lower half, so the apex of the tip rests on its centre
// and the top of the pressed key (and its letter) stays visible above the finger.
function contactPoint(k) { const r = keyRect(k); return [r.x + r.w / 2 + 3, r.y + r.h / 2 + 6]; }
const HOVER = [186, 306];          // resting pad position (scene-2 coords, before oy)
const PRESS_HOLD = 0.1;
const EXIT_DUR = 0.35;             // the hand leaves the frame after OK, before the reveal

// Pad position + lift (0 = touching, 1 = hovering) + exit progress.
function thumbState(t) {
  const first = EVENTS[0];
  const t0 = first.t - 0.3;
  if (t < t0) return { x: HOVER[0], y: HOVER[1] + ri(Math.sin(t * 6) * 1.5), h: 1, out: 0 };
  let prev = { t: t0, pos: HOVER };
  for (let j = 0; j < EVENTS.length; j++) {
    const ev = EVENTS[j], pos = contactPoint(ev.k);
    // the pad touches down on the frame BEFORE the key's first frame, for every key
    const kf = keyFrame(ev.t);
    const pressA = (kf - 1) / FPS - 1e-6, pressB = kf / FPS + PRESS_HOLD + 1e-6;
    if (t < pressA) {
      const u = prog(t, prev.t, pressA), e = inOutCubic(u);
      return { x: lerp(prev.pos[0], pos[0], e), y: lerp(prev.pos[1], pos[1], e) - Math.sin(u * Math.PI) * 5, h: Math.sin(Math.PI * Math.min(1, u * 1.08)), out: 0 };
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
function paintLimbs(layers, shadow) {
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
        let v = nd * 1.05 + (bay(x, y) - 0.5) * (ly.dith ?? 0.34);
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
        if (px < sb.x0 || px > sb.x1 || py < sb.y0 || py > sb.y1 || bay(x, y) >= shadow.a) continue;
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
  const Px = st.x, Py = st.y + oy;
  // the whole hand yaws a little as the thumb reaches left
  const th = ((43 - (clamp(Px, 66, 204) - 66) * (11 / 138)) * Math.PI) / 180;
  const u = [Math.sin(th), Math.cos(th)];             // from the tip toward the wrist
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
  paintLimbs([
    { segs: [seg(slA, slB, 33, 38)], pal: { out: X.ink, lt: X.pinkLt, base: X.pink, sh: X.pinkDk, dk: '#8a1068' } },
    { segs: palm, pal: SKIN, fall },
    { segs: [seg(cuffA, cuffB, 31, 32)], pal: { out: X.ink, lt: '#e0ffff', base: '#73eff7', sh: '#2a9fb0', dk: '#1d6f80' } },
    {
      segs: thumb, pal: SKIN, fall,
      nail: { seg: 0, s0: -0.24, s1: 0.4, w: 0.58 },
      creases: [{ seg: 1, at: 2, w: 0.5, c: 'sh' }, { seg: 1, at: 4, w: 0.42, c: 'dk' }, { seg: 2, at: 2, w: 0.45, c: 'sh' }],
    },
  ], { segs: thumb.slice(0, 3), dx: 2 + ri(5 * h), dy: 3 + ri(7 * h), a: 0.55 + 0.2 * (1 - h) });
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
  ], { segs: curled.map((c) => c.segs[0]), dx: 2, dy: 3, a: 0.45 });
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
  ]);
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
    }], { segs: [seg(tip, knuckle, fg.r, fg.r)], dx: 2, dy: 3, a: 0.5 });
  }
}

const SLOT_LAND = 0.25;   // a typed letter lands in its slot this long after the key press
const FLIGHT_T0 = 0.09;   // key-preview bubble until here, then the letter flies (5 frames)
const CHECK_RAMP = 15;    // frames of accelerating light before the whole row strobes
// key-preview balloon: head top sits on the outline of the key TWO rows up (row pitch 18)
const BUB = { up: 2 * (KEY.h + KEY.gy) + 1, headH: 24, textY: 5 };
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
  return ri(SLOT_DROP * outCubic(prog(t, CUES.checking, CUES.checking + 0.15)));
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
      // a light runs along the answer, faster and faster (frame-driven, capped at 1.5 slots
      // per frame so it never aliases), then the whole row strobes
      const fr = f - firstFrame(CUES.checking + 0.05);
      const n = ANSWER.length;
      const pos = 0.33 * fr + (1.5 - 0.33) * fr * fr / (2 * CHECK_RAMP);
      const strobe = fr >= CHECK_RAMP;
      lit = fr >= 0 && !strobe && (Math.floor(pos) % n) === i;
      const trail = fr >= 0 && !strobe && (Math.floor(pos) % n) === (i + 1) % n && pos >= 1;
      border = '#566c86'; bg = '#3b5dc9'; hop = 0;
      if (lit) { border = '#ffffff'; bg = X.gold; hop = -2; }
      else if (trail) { border = X.gold; bg = '#4b6be0'; hop = -1; }
      if (strobe) { const on = (f & 1) === 0; border = on ? '#ffffff' : X.gold; bg = on ? '#5d7bff' : '#3b5dc9'; hop = on ? -1 : 0; }
      if (t < CUES.checking + 0.05) border = X.ink;
    }
    const y = r.y + oy + shift;
    rrect(ctx, r.x - 1, y - 1, r.w + 2, r.h + 2, 3, X.ink);
    rrect(ctx, r.x, y, r.w, r.h, 2, border);
    rrect(ctx, r.x + 1, y + 1, r.w - 2, r.h - 2, 2, bg);
    if (filled) {
      // on a light tile (landing flash, gold checking light) the glyph turns ink so the
      // letter never vanishes; the extrusion is one DESIGN pixel (2 lo px at s=2)
      drawText(ctx, ANSWER[i], 'ps', flash || lit ? { s: 2, fill: X.ink } : { s: 2, fill: ['#ffffff', '#ffffff', X.cream], ext: { d: 2, c: X.ink, dx: 0 } }, r.x + r.w / 2, y + 4 + hop, 'c');
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
  // the idle chase stops while the thumb is on its way in, so the first press (B) is the only
  // lit key on its frame
  const chaseOn = t >= CUES.remoteReady && f < keyFrame(EVENTS[0].t) - CHASE_CLEAR_F;
  const chaseStep = f - firstFrame(CUES.remoteReady); // one step per frame, no repeats
  const keyDown = new Map();
  for (const ev of EVENTS) {
    const fe = sinceKey(t, ev.t);
    if (fe >= 0 && fe < 4) keyDown.set(ev.k, { down: true, glow: fe < 2 ? 1 : 0.5 });
    else if (fe >= 4 && fe < 9) keyDown.set(ev.k, { down: false, glow: 0.3 });
  }
  { const fo = sinceKey(t, CUES.enter); if (fo >= 0 && t < CUES.correct) keyDown.set(OK_INDEX, { down: fo < 4, glow: ((f >> 1) & 1) ? 1 : 0.4 }); }
  L.save(); L.translate(0, oy);
  for (let k = 0; k < 28; k++) {
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
      const p = dt / 0.16, rad = 5 + p * 12;
      for (let a = 0; a < 8; a++) {
        const an = a * Math.PI / 4 + 0.2;
        const x = kx + Math.cos(an) * rad, y = ky + Math.sin(an) * rad;
        R(L, ri(x) - 1, ri(y) - 1, 3, 3, X.ink);
        R(L, ri(x), ri(y), 1 + (p < 0.5 ? 1 : 0), 1 + (p < 0.5 ? 1 : 0), a % 2 ? '#ffffff' : X.gold);
      }
    }
    if (ev.i < 0) continue;
    const ch = ANSWER[ev.i];
    if (dt < FLIGHT_T0) {
      // key-preview balloon (like a phone keyboard): a head that covers the keys two rows up
      // COMPLETELY and a stem that hides the letter of the key right above, so no fragment of
      // another key (or the power button) peeks out round it. 1-px ink outline + drop shadow.
      const hx = ri(kx - 11), hy = r.y - BUB.up + oy, sx = ri(kx - 8), sy = hy + BUB.headH - 4;
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
      drawText(L, ch, 'ps', { s: 2, fill: X.ink }, kx + 1, hy + BUB.textY, 'c');
    } else if (dt < SLOT_LAND) {
      const p = inOutCubic((dt - FLIGHT_T0) / (SLOT_LAND - FLIGHT_T0));
      const s = slotRect(ev.i);
      const x0 = kx, y0 = r.y - BUB.up + BUB.textY + oy, x1 = s.x + s.w / 2, y1 = s.y + 4 + oy;
      const x = lerp(x0, x1, p), y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * 18;
      // while the letter crosses the caption box it drops to 60 %, so a paused frame never
      // reads as a letter typed INTO the caption
      const cap = CAPTIONS[1];
      const overCap = t >= cap.t0 && t < cap.t1 && inRects([captionRect(1)], ri(x) - 8, ri(y) - 2, 18, 20);
      OVERLAYS.push(() => {
        if (overCap) L.globalAlpha = 0.6;
        // trail
        for (let q = 1; q <= 3; q++) {
          const pp = Math.max(0, p - q * 0.12);
          const tx = lerp(x0, x1, pp), ty = lerp(y0, y1, pp) - Math.sin(pp * Math.PI) * 18;
          R(L, ri(tx), ri(ty) + 6, 2, 2, q === 1 ? '#ffffff' : X.gold);
        }
        drawText(L, ch, 'ps', { s: 2, fill: X.gold, out: X.ink }, x + 1, y, 'c');
        L.globalAlpha = 1;
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
    spotDim({ x: r0.x - 4, y: r0.y + oy + slotShift(t) - 4, w: r1.x + r1.w - r0.x + 8, h: r0.h + 8 }, prog(t, CUES.checking, CUES.checking + 0.15));
  }
}
// Dim everything outside rect r by ~40% (two-level ordered dither), 2-px soft edge.
function spotDim(r, s) {
  if (s <= 0) return;
  const img = L.getImageData(0, 0, LW, LH), d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const ex = Math.max(r.x - x, x - (r.x + r.w - 1), 0), ey = Math.max(r.y - y, y - (r.y + r.h - 1), 0);
    const e = Math.max(ex, ey);
    if (e === 0) continue;
    const b = bay(x, y);
    const edge = e <= 2 ? 0.5 : 1;
    if (b >= s * edge * 1.02) continue;
    const k = b < 0.5 ? 0.5 : 0.7;
    const i = y * LW + x, c = d[i];
    d[i] = u32rgb(((c & 255) * k) | 0, (((c >>> 8) & 255) * k) | 0, (((c >>> 16) & 255) * Math.min(1, k * 1.15)) | 0);
  }
  L.putImageData(img, 0, 0);
}

function drawScene2(t) {
  if (t < CUES.pushIn + 0.1) {
    // push-in, part 1: stepped integer zoom (2x, 3x, 4x) into the blast centre, radial
    // speed lines only over the arena (never across the prompt), then a cut
    drawScene1(t);
    const step = clamp(sinceCue(t, CUES.pushIn), 0, 2), k = 2 + step;
    const bcx = AR.x + BOMB_CELL.cx * AR.cell + HC, bcy = AR.y + BOMB_CELL.cy * AR.cell + HC;
    const g = zoomLo(k, bcx, bcy, CX, LH / 2);
    coverPromptBand(k, bcx, bcy, LH / 2); // no half-cut zoomed prompt in the top UI band
    const aw = AR.cell * AR.n;
    const ay0 = (AR.y - bcy) * k + LH / 2, ay1 = (AR.y + aw - bcy) * k + LH / 2;
    // speed lines on the ZOOMED pixel grid (k x k blocks), so no mixels
    speedLines(t, CX, LH / 2, 0.8 + 0.2 * step, (x, y) => y > ay0 + 2 && y < ay1 - 2, k, g.gx, g.gy);
    return;
  }
  // part 2: the hand + phone rise into the close-up with an overshoot
  const p = prog(t, CUES.pushIn + 0.1, CUES.remoteReady);
  const oy = ri((1 - outBack(p, 1.4)) * 170);
  // speed lines stay OUTSIDE the phone so the prompt and slots read on the first frame, and
  // are painted BEFORE the hands so they never cross the fingers
  drawScene2Core(t, oy, p < 1 ? () => speedLines(t, CX, LH / 2, 1 - p, (x, y) => x < PH2.x - 2 || x > PH2.x + PH2.w + 3 || y < PH2.y + oy - 2) : null);
}
function speedLines(t, cx, cy, strength = 1, mask = null, g = 1, gx = 0, gy = 0) {
  const f = frameOf(t);
  const snap = (v, o) => (g === 1 ? ri(v) : o + Math.floor((v - o) / g) * g);
  for (let k = 0; k < 28; k++) {
    const rng = mulberry32(k * 131 + f * 7);
    const an = (k / 28) * Math.PI * 2 + rng() * 0.2;
    const r0 = 110 + rng() * 60, len = (40 + rng() * 80) * strength;
    const ca = Math.cos(an), sa = Math.sin(an);
    for (let s = 0; s < len; s += 1) {
      const x = snap(cx + ca * (r0 + s), gx), y = snap(cy + sa * (r0 + s), gy);
      if (x < -g || y < -g || x >= LW || y >= LH) break;
      if (mask && !mask(x, y)) continue;
      R(L, x, y, (s < len * 0.3 ? 2 : 1) * g, g, '#ffffff');
    }
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
  const a = t - CUES.correct, end = CUES.characterIn - CUES.correct;
  if (a < 0.03 || a >= end) return;
  const r = a < 0.07 ? 46 : a < 0.1 ? 40 : 36;
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
  const f = frameOf(t);
  const a = ba + 0.05;                                       // already open on the beat frame
  const half = CARD.w / 2 - 4;
  for (let k = 0; k < 96; k++) {
    const rng = mulberry32(k * 4409 + 23);
    // two fans thrown sideways from the card's rim (so it reads on the beat frame: r0 is the
    // distance to the card's edge along the throw), 15 deg down to 70 deg up; each side's
    // reach (sp / drag) stops short of its SAFE column edge; gravity then rains it down
    const side = k & 1 ? 1 : -1, elev = (-15 + rng() * 85) * Math.PI / 180;
    const ang = side > 0 ? -elev : Math.PI + elev;
    const sp = (side > 0 ? 120 : 150) + rng() * (side > 0 ? 95 : 125);
    const r0 = Math.min(half / Math.max(1e-3, Math.abs(Math.cos(ang))), half / Math.max(1e-3, Math.abs(Math.sin(ang)))) + rng() * 4;
    const drag = 5.0, tt = (1 - Math.exp(-drag * a)) / drag;
    const x = CX + Math.cos(ang) * (r0 + sp * tt) + Math.sin(a * 3 + k) * 3 * Math.min(1, a * 2);
    const y = CARD.y + CARD.h / 2 + Math.sin(ang) * (r0 + sp * tt) + 70 * a * a;
    const W0 = 3 + (k & 1), H0 = 4 + Math.floor(rng() * 2);
    const xi = ri(x), yi = ri(y);
    if (xi < SAFE_L.x0 || xi + W0 > SAFE_L.x1 || yi < SAFE_L.y0 || yi > LH || inRects(excl, xi, yi, W0, H0)) continue;
    confettiPiece(ctx, xi, yi, W0, H0, BURST_CI[(k * 7 + 3) % BURST_CI.length], ((f + k) >> 1) & 1);
  }
}

function drawScene3(t) {
  const f = frameOf(t);
  const age = t - CUES.correct;
  bgRays(CX, 164, 22, age * 0.35, X.g2, X.g3,
    [{ r: 30, col: '#a8ffc6' }, { r: 52, col: X.g1 }], { r0: 215, r1: 330, cols: [X.g4, X.g5] });
  putBG();
  // impact lines
  if (age < 0.25) {
    const p = age / 0.25;
    for (let k = 0; k < 20; k++) {
      const an = k / 20 * Math.PI * 2 + 0.1;
      for (let s = 0; s < 30; s++) {
        const rr = 40 + p * 140 + s;
        const x = ri(CX + Math.cos(an) * rr), y = ri(60 + Math.sin(an) * rr);
        if (x >= 0 && y >= 0 && x < LW && y < LH) R(L, x, y, 1, 1, '#ffffff');
      }
    }
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
    const pa = t - CUES.pointsStart;
    const ticks = Math.round((CUES.pointsEnd - CUES.pointsStart) / (BEAT / 8));
    const n = Math.round(COPY.pointsValue * Math.min(1, (Math.floor(pa / (BEAT / 8) + 1e-6) + 1) / ticks));
    const done = t >= CUES.pointsEnd && t < CUES.pointsEnd + 0.1;
    const fill = done ? '#ffffff' : [X.cream, X.gold, X.amber];
    const numFull = '+' + COPY.pointsValue;
    const wNum = textWidth(numFull, 'ps', 2), wLab = textWidth(COPY.pointsLabel, 'ps', 2);
    const coinW = 14, padL = 5, padR = 7;
    const wAll = padL + coinW + 5 + wNum + PTS_GAP + wLab + padR;
    const x0 = ri(CX - wAll / 2);
    const y = 84 + (pa < 1 / 30 ? -2 : 0);
    panel(L, x0, y - 5, wAll, 24, 11, { fill: pa < 1 / 30 ? '#1f8a47' : '#0e5a33', out: X.ink, ext: 2, extC: '#07331c' });
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
    const ca = t - CUES.characterIn;
    const fc = sinceCue(t, CUES.characterIn);
    // flip without squashing the pixel art: a hand-made edge-on card, a white silhouette
    // frame, then the card itself
    const p = fc >= 2 ? 1 : 0;
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
    if (p >= 1) {
      // idle: spark on the placeholder fuse, blink
      if (!charImg) {
        const ix = CARD.x + 7 + Math.floor((CARD.w - 12) / 2) - 38, iy = CARD.y + 7 + (CARD.h - 12) - 18 - 72 + 2 + bob;
        sparkle(L, ix + HERO_TIP.x, iy + HERO_TIP.y, (f & 1) ? 2 : 3, '#ffffff', X.fY);
        if (Math.floor(ca * 10) % 23 === 0) {
          // blink: eyelids
          const ecx = ix + 38, ecy = iy + 46;
          R(L, ecx - 9, ecy - 7, 7, 9, '#353d6e'); R(L, ecx + 5, ecy - 7, 7, 9, '#353d6e');
          R(L, ecx - 9, ecy + 1, 7, 1, X.ink); R(L, ecx + 5, ecy + 1, 7, 1, X.ink);
        }
      }
    }
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
function drawScene4(t) {
  const age = t - CUES.ctaTransition;
  const E = S.endL;
  const dyL = endLockupDY(t);
  const rayY = E.wmY + 10 + dyL;
  bgRays(CXE, rayY, 18, -age * 0.25, '#ff4f9a', '#e0368a',
    [{ r: 40, col: '#ffd0e6' }, { r: 70, col: '#ff8cc0' }], { r0: 190, r1: 330, cols: ['#b8237e', '#7b2fbe', '#4b1d8a'] });
  putBG();
  // twinkling stars in the lower sky
  for (let k = 0; k < 26; k++) {
    const rng = mulberry32(k * 419 + 3);
    const x = ri(rng() * LW), y = ri(250 + rng() * 220);
    const ph = (age * (1 + rng()) + rng()) % 1;
    const s = ph < 0.15 ? 2 : ph < 0.5 ? 1 : 0;
    if (s) sparkle(L, x, y, s, '#ffffff', '#ffcde6'); else R(L, x, y, 1, 1, '#ffcde6');
  }
  // poster hills: the fine print sits on the dark one
  for (let x = 0; x < LW; x++) {
    const h1 = E.hill + ri(Math.sin(x * 0.045 + 1) * 5 + Math.sin(x * 0.11) * 2);
    R(L, x, h1, 1, LH - h1, '#4b1d8a');
    R(L, x, h1, 1, 1, '#b86ae0');
    const h2 = E.hill + 22 + ri(Math.sin(x * 0.06 + 3) * 3);
    R(L, x, h2, 1, LH - h2, '#2a0f5a');
    R(L, x, h2, 1, 1, '#7b2fbe');
  }
  // coins drifting up the side margins (never over the pills, and in lanes outside the fine
  // print's box, which spans the SAFE width)
  for (let k = 0; k < 10; k++) {
    const rng = mulberry32(k * 211 + 99);
    const x0 = rng() < 0.5 ? rng() * 3 : SAFE_L.x1 + 1 + rng() * (LW - SAFE_L.x1 - 15);
    const y = ((330 + rng() * 150 - age * (14 + rng() * 10)) % 480 + 480) % 480;
    L.drawImage(S.coins[(Math.floor(t * 10) + k) % 6], ri(x0), ri(y));
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
    // the lines pop on the chord (line 1 on the first frame after the cue) and RIDE the
    // lockup's slide, so the logo-to-question gap never changes while it moves
    S.ctaLines.forEach((ln, i) => {
      const p = prog(t, CUES.ctaText + i * 0.05, CUES.ctaText + 0.2 + i * 0.05);
      if (p < 0.05) return;
      const dy = ri((1 - outBack(p, 2.4)) * 12);
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
    panel(L, px, py, pw2, ph2, 12, { fill: press || pulse ? X.cream : X.gold, sh: X.amber, shH: 5, out: X.ink, ext: 3 - press, extC: '#7a1f3d', hi: '#ffffff' });
    if (sc > 0.85) {
      const ly0 = py + 7 + ri((ph2 - E.pillH) / 2);
      // 'Baixe o Nostalgia' / 'Grátis': the last word of the copy gets its own line and the
      // loudest treatment on the card (white, ink outline, maroon extrusion)
      S.dlLines.forEach((ln, i) => {
        const free = i === S.dlLines.length - 1 && S.dlLines.length > 1;
        drawText(L, ln, 'j15', free ? { s: E.freeS, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 2, c: '#7a1f3d', dx: 0 } } : { s: 1, fill: X.ink }, CXE - 6, ly0 + i * 21, 'c');
      });
      // ">>" chevrons: this is a button
      const cx0 = px + pw2 - 20, cy0 = py + ri(ph2 / 2) - 3;
      for (const o of [0, 5]) for (let j = 0; j < 4; j++) { R(L, cx0 + o + j, cy0 - 3 + j, 2, 1, X.ink); R(L, cx0 + o + j, cy0 + 4 - j, 2, 1, X.ink); }
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
    const rr = 3 + outCubic(rp) * 15, seen = new Set();
    for (let a = 0; a < 96; a++) {
      const an = (a / 96) * Math.PI * 2, px = ri(tipX + Math.cos(an) * rr * 1.35), py = ri(tipY + 1 + Math.sin(an) * rr * 0.8);
      const key = px * 1000 + py;
      if (seen.has(key)) continue;
      seen.add(key);
      R(L, px, py + 1, 1, 1, '#7a1f3d');
      R(L, px, py, 1, 1, c);
    }
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
  ], { segs: finger, dx: 2, dy: 3, a: 0.5 });
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
// scene 1 under the arena, scene 2 between the answer slots and the remote (both hands
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
  L.globalAlpha = 0.86;
  rrect(L, x, y, w2, h2, 5, '#140a2a');
  L.globalAlpha = 1;
  R(L, x + 5, y - 1, w2 - 10, 1, X.ink); R(L, x + 5, y + h2, w2 - 10, 1, X.ink);
  const acc = [X.gold, '#73eff7', X.g1][idx % 3];
  R(L, x + 3, y + 5, 2, Math.max(0, h2 - 10), acc);
  if (df === 0) { R(L, x + 5, y, w2 - 10, 1, acc); R(L, x + 5, y + h2 - 1, w2 - 10, 1, acc); }
  if (pout > 0.5) return;
  const top = ri(cy - bh / 2) + 8 - grow;
  lines.forEach((ln, i) => {
    drawText(L, ln, 'j15', { s: 1, track, fill: ['#ffffff', '#ffffff', X.cream], out: X.ink, ext: { d: 1, c: X.ink, dx: 0 } }, cx + 2, top + i * lineH, 'c');
  });
}

// ---------------------------------------------------------------------------------------
// Public API
export async function initVisuals() {
  if (ready) return;
  lo = mk(LW, LH); L = ctxOf(lo);
  tmp = mk(LW + 80, LH + 80); TX = ctxOf(tmp);
  bgImg = L.createImageData(LW, LH); BG32 = new Uint32Array(bgImg.data.buffer);
  const n = AR.cell * AR.n;
  flameImg = TX.createImageData(n, n); FL32 = new Uint32Array(flameImg.data.buffer);
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
  [charImg, logoImg] = await Promise.all([tryImg('./assets/character.png'), tryImg('./assets/logo.png')]);

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
  S.bomb = BOMB_RAMPS.map((r) => ballSprite(BOMB_R, r));
  S.arena = buildArena();
  S.brick = (() => { const c = mk(AR.cell, AR.cell); brickBlock(ctxOf(c), 0, 0); return c; })();
  S.phone1 = buildPhone(PH1.w, PH1.h, PH1.r);
  S.phone2 = buildPhone(PH2.w, PH2.h, PH2.r);
  S.scr1 = buildScreenBG(SC1.w, SC1.h);
  S.scr2 = buildScreenBG(SC2.w, LH - SC2.y + 10);
  S.tv1 = buildTV(1);
  S.remote = buildRemote();
  S.hero = buildHero();
  S.card = buildCard();
  S.ribbon = buildAnswerTiles(ANSWER);
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
    E.hill = E.discY + 30;
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
  for (let k = 0; k < 26; k++) textSprite(String.fromCharCode(65 + k), 'ps', { s: 1, fill: '#ffffff' });
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
    const p = 0.3 + 0.7 * prog(t, CUES.ctaTransition, CUES.ctaTransition + 0.25);
    const cell = 24;
    mixScenes(() => drawScene3(t), () => drawScene4(t), (x, y) => {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      const ccx = gx * cell + cell / 2, ccy = gy * cell + cell / 2;
      const delay = ((gx + gy * 0.6) / (LW / cell + (LH / cell) * 0.6)) * 0.35;
      const r = clamp((p - delay) / 0.42, 0, 1) * cell * 1.05;
      const d = Math.abs(x + 0.5 - ccx) + Math.abs(y + 0.5 - ccy);
      return d < r - 2 ? 1 : d < r ? 2 : 0;
    }, X.gold);
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
  ctx.restore();
}
