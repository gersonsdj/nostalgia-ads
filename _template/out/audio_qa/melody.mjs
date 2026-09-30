// Lists the lead/bass notes audio.js schedules and compares the lead lines (transposition-
// invariant interval n-grams + rhythm-free contour) with openings of well-known game themes.
// Reference lines are from memory, approximate, and only used as a "does this ring a bell" net.
// Usage: node out/audio_qa/melody.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', '..', 'audio.js'), 'utf8');
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const nm = (s) => { const r = /^([A-G])([#b]?)(-?\d)$/.exec(s); return 12 * (Number(r[3]) + 1) + PC[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0); };
function arr(name) {
  const m = new RegExp(`const ${name} = \\[[^\\n]*\\n([\\s\\S]*?)\\n\\];`).exec(src);
  return [...m[1].matchAll(/\[(\d+), '([A-G][#b]?-?\d)', (\d+)\]/g)].map((x) => ({ step: +x[1], note: x[2], len: +x[3], midi: nm(x[2]) }));
}
const lines = { LEAD_GROOVE: arr('LEAD_GROOVE'), LEAD_CELEBRATE: arr('LEAD_CELEBRATE'), LEAD_CTA: arr('LEAD_CTA') };
const out = [];
for (const [k, v] of Object.entries(lines)) out.push(`${k}: ${v.map((x) => `${x.note}/${x.len}`).join(' ')}`);

const REF = {
  'Super Mario Bros overworld': 'E5 E5 E5 C5 E5 G5 G4 C5 G4 E4 A4 B4 Bb4 A4 G4 E5 G5 A5 F5 G5 E5 C5 D5 B4',
  'SMB underground': 'C4 C5 A3 A4 Bb3 Bb4 C4 C5 A3 A4 Bb3 Bb4',
  'SMB starman': 'C5 C5 C5 D5 C5 C5 C5 D5 C5 D5 C5 D5 C5',
  'SMB 1-up': 'E6 G6 E7 C7 D7 G7',
  'Tetris / Korobeiniki A': 'E5 B4 C5 D5 C5 B4 A4 A4 C5 E5 D5 C5 B4 C5 D5 E5 C5 A4 A4 D5 F5 A5 G5 F5 E5 C5 E5 D5 C5 B4 B4 C5 D5 E5 C5 A4 A4',
  'Zelda overworld': 'A4 E4 A4 A4 B4 C#5 D5 E5 E5 F5 G5 A5 A5 A5 G5 F5 G5 F5 E5 E5',
  'Zelda secret': 'G5 F#5 D#5 A4 G#4 E5 G#5 C6',
  'Pac-Man intro': 'B4 B5 F#5 D#5 B5 F#5 D#5 C5 C6 G5 E5 C6 G5 E5 B4 B5 F#5 D#5 B5 F#5 D#5 D#5 E5 F5 F5 F#5 G5 G5 G#5 A5 B5',
  'Final Fantasy victory': 'C5 C5 C5 C5 Ab4 Bb4 C5 Bb4 C5',
  'Final Fantasy prelude': 'C4 D4 E4 G4 C5 D5 E5 G5 C6 D6 E6 G6 A3 B3 C4 E4 A4 B4 C5 E5',
  'Sonic GHZ (approx.)': 'C5 A4 C5 B4 C5 B4 G4 A4 E4 C5 A4 C5 B4 C5 B4 G4',
  'Mega Man 2 Wily (approx.)': 'E5 F#5 G5 A5 G5 F#5 E5 D5 B4 D5 E5',
};
const iv = (ms) => ms.slice(1).map((m, i) => m - ms[i]);
const grams = (a, k) => { const s = new Set(); for (let i = 0; i + k <= a.length; i++) s.add(a.slice(i, i + k).join(',')); return s; };
out.push('\nInterval n-gram overlap (transposition invariant, rhythm ignored). k=5 means 6 notes in a row with identical intervals.');
let worst = 0;
for (const [k, v] of Object.entries(lines)) {
  const I = iv(v.map((x) => x.midi));
  for (const [rn, rs] of Object.entries(REF)) {
    const R = iv(rs.split(' ').map(nm));
    for (const g of [4, 5, 6]) {
      const a = grams(I, g), b = grams(R, g), hit = [...a].filter((x) => b.has(x));
      if (hit.length) { out.push(`  ${k} ~ ${rn}: ${hit.length} shared ${g}-gram(s) [${hit.join(' | ')}]`); worst = Math.max(worst, g); }
    }
  }
}
out.push(`  longest shared run: ${worst ? worst + 1 + ' notes' : 'none >= 5 notes'}`);
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'melody_report.txt'), txt);
