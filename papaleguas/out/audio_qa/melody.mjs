// Originality net for the melodic material audio.js schedules (lead lines, key-tap notes, the bip-bip).
// Compares every line, transposition-invariant, against:
//   - the FIRST ad's lead lines (../_template/audio.js, exact: this ad must have its own motifs),
//   - openings of well-known game themes,
//   - the cartoon / western references this ad must never quote (Looney Tunes / Merrie Melodies,
//     the 1966 Road Runner show theme, Raymond Scott's "Powerhouse", Rossini's William Tell gallop,
//     Morricone westerns, plus two public-domain western tunes cartoons lean on).
// Reference lines are written FROM MEMORY and are APPROXIMATE (several are marked low-confidence):
// this is a "does this ring a bell" net, not proof. Final judgement is a human listening.
//
// Tests per (line, reference):
//   exact  = longest run of identical intervals (rhythm ignored)          -> FAIL at >= 6 notes, WARN at 5
//   fuzzy  = longest run of same-direction intervals within +-1 semitone   -> WARN at >= 7 notes
//   contour= longest run of identical up/down/repeat steps (Parsons code)  -> WARN at >= 10 notes
//   vs the first ad also: exact interval+rhythm run                        -> FAIL at >= 5 notes
// Usage: node out/audio_qa/melody.mjs   (writes out/audio_qa/melody_report.txt + melody.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const src = readFileSync(join(ROOT, 'audio.js'), 'utf8');
const tplPath = join(ROOT, '..', '_template', 'audio.js');
const tpl = existsSync(tplPath) ? readFileSync(tplPath, 'utf8') : '';
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const nm = (s) => { const r = /^([A-G])([#b]?)(-?\d)$/.exec(s); return 12 * (Number(r[3]) + 1) + PC[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0); };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
function arr(text, id) {
  const m = new RegExp(`const ${id} = \\[[^\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n\\];`).exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/\[(\d+), '([A-G][#b]?-?\d)', (\d+)(?:, [-\d.]+)*\]/g)].map((x) => ({ step: +x[1], note: x[2], len: +x[3], midi: nm(x[2]) }));
}
const IDS = ['LEAD_GROOVE', 'LEAD_CELEBRATE', 'LEAD_CTA'];   // (+ KEY_TAPS, BIP_BIP, BASS_GROOVE from audio.js MELODY_QA)
const { MELODY_QA } = await import(pathToFileURL(join(ROOT, 'audio.js')).href);
const lines = {};
for (const id of IDS) lines[id] = arr(src, id);
if (MELODY_QA) {
  lines.KEY_TAPS = MELODY_QA.KEY_NOTES.map((midi) => ({ midi, note: name(midi), len: 1 }));
  lines.BIP_BIP = MELODY_QA.BIP_NOTES.map((midi) => ({ midi, note: name(midi), len: 1 }));
  if (MELODY_QA.BASS_GROOVE) lines.BASS_GROOVE = MELODY_QA.BASS_GROOVE.map((midi) => ({ midi, note: name(midi), len: 1 }));
}
// the whole groove -> celebration -> CTA as one stream too (catches quotes that straddle sections)
lines.ALL_LEADS = IDS.flatMap((id) => lines[id] || []);

const firstAd = {};
for (const id of IDS) { const a = arr(tpl, id); if (a) firstAd[`first ad ${id}`] = a; }

const GAME = {
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
const CARTOON_WESTERN = {
  'Merrily We Roll Along (trad., the Merrie Melodies theme adapts it)': 'E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4',
  'Merrily We Roll Along, swing pickup variant (approx.)': 'G4 E4 D4 C4 D4 E4 E4 E4 G4 D4 D4 D4 E4 G4 G4',
  'The Merry-Go-Round Broke Down v1 (approx., low confidence)': 'G4 A4 G4 E4 C4 E4 G4 A4 G4 E4 D4 C4',
  'The Merry-Go-Round Broke Down v2 (approx., low confidence)': 'C5 A4 G4 E4 G4 A4 C5 D5 C5 A4 G4 E4',
  'Road Runner 1966 TV theme (approx., low confidence)': 'C5 C5 A4 C5 C5 A4 C5 D5 C5 A4 G4 E4 G4 A4 C5',
  'Powerhouse A, neighbour-note line (approx.)': 'G4 F#4 G4 A4 G4 F#4 G4 B4 G4 F#4 G4 C5',
  'Powerhouse B, assembly-line ostinato (approx.)': 'C3 E3 D3 F3 E3 G3 F3 A3 G3 B3 A3 C4',
  'William Tell Overture finale (Rossini)': 'G4 G4 G4 G4 G4 G4 G4 C5 D5 E5 G4 G4 G4 G4 G4 G4 G4 C5 E5 D5 B4 G4',
  'William Tell finale, 2nd phrase (approx.)': 'C5 C5 C5 C5 C5 C5 C5 F5 G5 A5 G5 E5 C5',
  'The Good, the Bad and the Ugly (Morricone)': 'A4 D5 A4 D5 A4 F4 G4 D4',
  'For a Few Dollars More, whistle (approx., low confidence)': 'E5 A5 E5 A5 B5 C6 B5 A5',
  'Oh! Susanna (western PD tune)': 'C4 D4 E4 G4 G4 A4 G4 E4 C4 D4 E4 E4 D4 C4 D4',
  'Camptown Races (western PD tune)': 'G4 G4 E4 G4 A4 G4 E4 E4 D4 E4 D4 G4 G4 E4 G4 A4 G4 E4 D4 E4 D4 C4',
  // added by the independent audio QA: castanets + gallop sit near the Mexican folk tunes Warner cartoons quote
  'La Cucaracha (Mexican folk, quoted in Warner cartoons)': 'G4 G4 G4 C5 E5 G4 G4 G4 C5 E5 C5 C5 B4 B4 A4 A4 G4',
};
const toMidi = (s) => s.split(' ').map(nm);
const REF = {};
for (const [k, v] of Object.entries(firstAd)) REF[k] = { midi: v.map((x) => x.midi), lens: v.map((x) => x.len), group: 'first ad' };
for (const [k, v] of Object.entries(GAME)) REF[k] = { midi: toMidi(v), group: 'game' };
for (const [k, v] of Object.entries(CARTOON_WESTERN)) REF[k] = { midi: toMidi(v), group: 'cartoon/western' };

const iv = (ms) => ms.slice(1).map((m, i) => m - ms[i]);
// longest common run of two token arrays under an equality predicate (-> run length in intervals)
function lcsRun(a, b, eq) {
  let best = 0, at = -1, prev = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Int32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) if (eq(a[i - 1], b[j - 1])) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) { best = cur[j]; at = i - cur[j]; } }
    prev = cur;
  }
  return { len: best, at };
}
const exactEq = (x, y) => x === y;
const fuzzyEq = (x, y) => Math.sign(x) === Math.sign(y) && Math.abs(x - y) <= 1;
const parsons = (a) => a.map((d) => Math.sign(d));

const out = [];
out.push('MELODIC MATERIAL (this ad):');
for (const [k, v] of Object.entries(lines)) {
  if (k === 'ALL_LEADS' || !v) continue;
  const ms = v.map((x) => x.midi);
  out.push(`  ${k.padEnd(15)} ${v.map((x) => x.note + (x.len > 1 ? '/' + x.len : '')).join(' ')}   [range ${name(Math.min(...ms))}-${name(Math.max(...ms))}]`);
}
out.push('\nLONGEST SHARED RUNS (notes; transposition-invariant). Thresholds: exact >= 6 FAIL, 5 WARN | fuzzy(+-1 st) >= 7 WARN | contour >= 10 WARN if fuzzy >= 6 on the same ref, else INFO | vs first ad with rhythm >= 5 FAIL');
let fails = 0, warns = 0, infos = 0;
const rows = [];
for (const [k, v] of Object.entries(lines)) {
  if (!v || v.length < 3) continue;
  const I = iv(v.map((x) => x.midi));
  let worst = null;
  for (const [rn, r] of Object.entries(REF)) {
    const R = iv(r.midi);
    const ex = lcsRun(I, R, exactEq), fz = lcsRun(I, R, fuzzyEq), ct = lcsRun(parsons(I), parsons(R), exactEq);
    let rh = { len: 0 };
    if (r.lens && k !== 'KEY_TAPS') {
      const tokA = I.map((d, i) => `${d}:${v[i].len}`), tokB = R.map((d, i) => `${d}:${r.lens[i]}`);
      rh = lcsRun(tokA, tokB, exactEq);
    }
    const row = { line: k, ref: rn, group: r.group, exact: ex.len + 1, fuzzy: fz.len + 1, contour: ct.len + 1, rhythm: rh.len ? rh.len + 1 : 0, exactAt: ex.at, fuzzyAt: fz.at, contourAt: ct.at };
    // contour alone ignores interval sizes (any arpeggio riff "matches" an arpeggio exercise), so a long
    // contour run is a WARN only when the same reference also shares a fuzzy run of >= 6 notes; else INFO
    let flag = '';
    if (row.exact >= 6 || row.rhythm >= 5) { flag = 'FAIL'; fails++; }
    else if (row.exact >= 5 || row.fuzzy >= 7 || (row.contour >= 10 && row.fuzzy >= 6)) { flag = 'WARN'; warns++; }
    else if (row.contour >= 10) { flag = 'INFO'; infos++; }
    row.flag = flag;
    rows.push(row);
    if (flag) {
      const seg = (at, len) => v.slice(at, at + len).map((x) => x.note).join(' ');
      out.push(`  ${flag} ${k} ~ ${rn}: exact ${row.exact} [${seg(ex.at, row.exact)}] | fuzzy ${row.fuzzy} [${seg(fz.at, row.fuzzy)}] | contour ${row.contour} [${seg(ct.at, row.contour)}]${row.rhythm ? ' | with rhythm ' + row.rhythm : ''}`);
    }
    if (!worst || row.exact > worst.exact || (row.exact === worst.exact && row.fuzzy > worst.fuzzy)) worst = row;
  }
  out.push(`  ${k.padEnd(15)} closest: ${worst.ref} (exact ${worst.exact}, fuzzy ${worst.fuzzy}, contour ${worst.contour})`);
}
out.push('\nPer group, the maximum over all lines (notes):');
for (const g of ['first ad', 'game', 'cartoon/western']) {
  const gr = rows.filter((r) => r.group === g);
  const mx = (f) => Math.max(...gr.map((r) => r[f]));
  out.push(`  ${g.padEnd(16)} exact ${mx('exact')} | fuzzy ${mx('fuzzy')} | contour ${mx('contour')}${g === 'first ad' ? ' | with rhythm ' + mx('rhythm') : ''}`);
}
// the bip-bip must not be a same-pitch pair (the cartoon's call is two ~equal notes, voiced)
const bip = lines.BIP_BIP ? iv(lines.BIP_BIP.map((x) => x.midi))[0] : null;
out.push(`\nbip-bip interval: ${bip === null ? 'n/a' : (bip > 0 ? '+' : '') + bip + ' semitones'} (${bip && Math.abs(bip) >= 3 ? 'clearly two different pitches' : 'CHECK: too close to a same-pitch call'})`);
out.push(`\nVERDICT: ${fails ? `FAIL (${fails})` : 'PASS'}${warns ? `, ${warns} WARN to review by ear` : ', no warnings'}${infos ? ` (${infos} contour-only INFO: shape without intervals)` : ''}`);
const txt = out.join('\n');
console.log(txt);
writeFileSync(join(HERE, 'melody_report.txt'), txt);
writeFileSync(join(HERE, 'melody.json'), JSON.stringify({ fails, warns, infos, rows }, null, 1));
