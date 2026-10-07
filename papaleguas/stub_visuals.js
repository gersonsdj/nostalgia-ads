// Test-pattern visuals for the player/exporter (NOT the ad). Pure function of t.
// Shows: t, frame number, scene id/name, a moving sweep, the PX grid, SAFE rect,
// and a flash + label for ~0.2 s after every cue time from timeline.js.
import { W, H, PX, FPS, DURATION, SCENES, CUES, ANSWER, SAFE, CAPTIONS, sceneAt } from './timeline.js';

const SCENE_BG = ['#29366f', '#5d275d', '#257179', '#b13e53'];

function cueList() {
  const list = [];
  for (const [k, v] of Object.entries(CUES)) {
    if (k === 'keyInterval') continue; // a duration, not a time
    if (Array.isArray(v)) v.forEach((tt, i) => list.push({ name: `key ${ANSWER[i] || i}`, t: tt }));
    else if (typeof v === 'number') list.push({ name: k, t: v });
  }
  return list.sort((a, b) => a.t - b.t);
}
const CUE_LIST = cueList();

export async function initVisuals() { /* nothing to load */ }

export function drawFrame(ctx, t) {
  const s = sceneAt(t);
  const frame = Math.floor(t * FPS + 1e-6);
  ctx.fillStyle = SCENE_BG[(s.id - 1) % SCENE_BG.length];
  ctx.fillRect(0, 0, W, H);

  // PX grid (every 10 logical pixels)
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 0; x < W; x += PX * 10) ctx.fillRect(x, 0, 2, H);
  for (let y = 0; y < H; y += PX * 10) ctx.fillRect(0, y, W, 2);

  // moving sweep (proves motion / timestamps)
  const sx = (t / DURATION) * W;
  ctx.fillStyle = '#ffcd75';
  ctx.fillRect(Math.round(sx) - 8, 0, 16, H);

  // SAFE rect
  ctx.strokeStyle = '#a7f070'; ctx.lineWidth = 6;
  ctx.strokeRect(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0);

  // cue flashes
  let active = null;
  for (const c of CUE_LIST) if (t >= c.t && t < c.t + 0.2) active = c;
  if (active) {
    const a = 1 - (t - active.t) / 0.2;
    ctx.fillStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = '#f4f4f4';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 150px monospace';
  ctx.fillText(t.toFixed(2) + 's', W / 2, 520);
  ctx.font = 'bold 80px monospace';
  ctx.fillText(`quadro ${String(frame).padStart(3, '0')}`, W / 2, 700);
  ctx.fillText(`cena ${s.id} · ${s.name}`, W / 2, 820);
  if (active) {
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(SAFE.x0, 930, SAFE.x1 - SAFE.x0, 130);
    ctx.fillStyle = '#ffd84a';
    ctx.fillText('CUE ' + active.name, W / 2, 995);
  }
  const cap = CAPTIONS.find(c => t >= c.t0 && t < c.t1);
  if (cap) {
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#f4f4f4';
    ctx.fillText(cap.text, W / 2, 1300);
  }
  // typed letters so far
  const typed = CUES.keyTimes.filter(k => t >= k).length;
  ctx.font = 'bold 90px monospace';
  ctx.fillStyle = '#73eff7';
  ctx.fillText(ANSWER.slice(0, typed).padEnd(ANSWER.length, '_'), W / 2, 1150);
}
