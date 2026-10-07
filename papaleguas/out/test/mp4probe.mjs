// MP4 box-tree probe (Node, no deps).
//   node out/test/mp4probe.mjs [file.mp4] [--tree]
// Reports ftyp, moov/mvhd duration, per-trak handler/codec/size/timescale/samples/duration,
// and asserts the ad spec: 450 video samples, ~15.0 s video and audio, 1080x1920.
// Exit code 0 = all assertions pass, 1 = failure.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = resolve(args.find(a => !a.startsWith('--')) || resolve(here, '..', 'Nostalgia_PapaLeguas_9x16_15s.mp4'));
const showTree = args.includes('--tree');
const buf = readFileSync(file);

const EXPECT = { frames: 450, seconds: 15.0, width: 1080, height: 1920, tolVideo: 0.04, tolAudio: 0.1 };
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'mvex']);

function u64(b, o) { return Number(b.readBigUInt64BE(o)); }
function parse(b, start, end, depth = 0, out = []) {
  let o = start;
  while (o + 8 <= end) {
    let size = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    let hdr = 8;
    if (size === 1) { size = u64(b, o + 8); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) throw new Error(`box ${type} at ${o} has bad size ${size}`);
    const box = { type, start: o, size, body: o + hdr, end: o + size, depth, children: [] };
    if (CONTAINERS.has(type)) parse(b, box.body, box.end, depth + 1, box.children);
    else if (type === 'stsd') parse(b, box.body + 8, box.end, depth + 1, box.children); // entries
    out.push(box);
    o += size;
  }
  return out;
}
const find = (boxes, type) => boxes.find(x => x.type === type);
const path = (box, ...types) => types.reduce((b, t) => b && find(b.children, t), box);

const tree = parse(buf, 0, buf.length);
if (showTree) {
  const walk = (bs) => bs.forEach(b => { console.log(`${'  '.repeat(b.depth)}${b.type} ${b.size}`); walk(b.children); });
  walk(tree);
}

const report = { file, bytes: buf.length, topLevel: tree.map(b => b.type) };
const ftyp = find(tree, 'ftyp');
if (ftyp) {
  const brands = [];
  for (let o = ftyp.body + 8; o + 4 <= ftyp.end; o += 4) brands.push(buf.toString('latin1', o, o + 4));
  report.ftyp = { major: buf.toString('latin1', ftyp.body, ftyp.body + 4), minor: buf.readUInt32BE(ftyp.body + 4), compatible: brands };
}
const moov = find(tree, 'moov');
if (!moov) throw new Error('no moov box');
const mdat = find(tree, 'mdat');
report.fastStart = tree.indexOf(moov) < tree.indexOf(mdat);
report.mdatBytes = mdat ? mdat.size : 0;

const mvhd = find(moov.children, 'mvhd');
{
  const v = buf[mvhd.body];
  const ts = v === 1 ? buf.readUInt32BE(mvhd.body + 20) : buf.readUInt32BE(mvhd.body + 12);
  const du = v === 1 ? u64(buf, mvhd.body + 24) : buf.readUInt32BE(mvhd.body + 16);
  report.mvhd = { timescale: ts, duration: du, seconds: +(du / ts).toFixed(4) };
}

report.tracks = moov.children.filter(b => b.type === 'trak').map(trak => {
  const tkhd = find(trak.children, 'tkhd');
  const tv = buf[tkhd.body];
  const whOff = tkhd.end - 8; // width/height are the last two 16.16 fields
  const t = {
    trackId: buf.readUInt32BE(tkhd.body + (tv === 1 ? 20 : 12)),
    tkhdWidth: buf.readUInt32BE(whOff) / 65536, tkhdHeight: buf.readUInt32BE(whOff + 4) / 65536,
  };
  const mdhd = path(trak, 'mdia', 'mdhd');
  const mv = buf[mdhd.body];
  t.timescale = mv === 1 ? buf.readUInt32BE(mdhd.body + 20) : buf.readUInt32BE(mdhd.body + 12);
  const mdur = mv === 1 ? u64(buf, mdhd.body + 24) : buf.readUInt32BE(mdhd.body + 16);
  t.mdhdDuration = mdur;
  t.seconds = +(mdur / t.timescale).toFixed(4);
  const hdlr = path(trak, 'mdia', 'hdlr');
  t.handler = buf.toString('latin1', hdlr.body + 8, hdlr.body + 12);
  const stbl = path(trak, 'mdia', 'minf', 'stbl');
  const stsd = find(stbl.children, 'stsd');
  const entry = stsd.children[0];
  t.codec = entry && entry.type;
  if (entry && (entry.type === 'avc1' || entry.type === 'hvc1' || entry.type === 'avc3')) {
    t.width = buf.readUInt16BE(entry.body + 24); t.height = buf.readUInt16BE(entry.body + 26);
    // avcC profile/level
    for (let o = entry.body + 78; o + 8 <= entry.end;) {
      const s = buf.readUInt32BE(o), ty = buf.toString('latin1', o + 4, o + 8);
      if (ty === 'avcC') {
        const p = buf[o + 9], c = buf[o + 10], l = buf[o + 11];
        t.codecString = `avc1.${[p, c, l].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
      }
      if (s < 8) break; o += s;
    }
  } else if (entry && entry.type === 'mp4a') {
    t.channels = buf.readUInt16BE(entry.body + 16);
    t.sampleRate = buf.readUInt32BE(entry.body + 24) / 65536;
  }
  const stsz = find(stbl.children, 'stsz');
  const fixed = buf.readUInt32BE(stsz.body + 4);
  t.samples = buf.readUInt32BE(stsz.body + 8);
  let total = 0;
  if (fixed) total = fixed * t.samples; else for (let i = 0; i < t.samples; i++) total += buf.readUInt32BE(stsz.body + 12 + i * 4);
  t.sampleBytes = total;
  const stts = find(stbl.children, 'stts');
  let sttsDur = 0; const n = buf.readUInt32BE(stts.body + 4);
  for (let i = 0; i < n; i++) sttsDur += buf.readUInt32BE(stts.body + 8 + i * 8) * buf.readUInt32BE(stts.body + 12 + i * 8);
  t.sttsSeconds = +(sttsDur / t.timescale).toFixed(4);
  const stss = find(stbl.children, 'stss');
  if (stss) t.keyframes = buf.readUInt32BE(stss.body + 4);
  t.bitrateKbps = Math.round(total * 8 / (sttsDur / t.timescale) / 1000);
  const elst = path(trak, 'edts', 'elst');
  if (elst) {
    const ev = buf[elst.body], cnt = buf.readUInt32BE(elst.body + 4);
    t.editList = [];
    for (let i = 0; i < cnt; i++) {
      const o = elst.body + 8 + i * (ev === 1 ? 20 : 12);
      t.editList.push(ev === 1 ? { dur: u64(buf, o), mediaTime: Number(buf.readBigInt64BE(o + 8)) } : { dur: buf.readUInt32BE(o), mediaTime: buf.readInt32BE(o + 4) });
    }
  }
  return t;
});

// ---- assertions -----------------------------------------------------------------
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };
const vid = report.tracks.find(t => t.handler === 'vide');
const aud = report.tracks.find(t => t.handler === 'soun');
check(report.ftyp, 'missing ftyp');
check(vid, 'no video track');
check(aud, 'no audio track');
if (vid) {
  check(vid.codec === 'avc1', `video codec ${vid.codec} != avc1`);
  check(vid.samples === EXPECT.frames, `video samples ${vid.samples} != ${EXPECT.frames}`);
  check(Math.abs(vid.seconds - EXPECT.seconds) <= EXPECT.tolVideo, `video duration ${vid.seconds}s not ~${EXPECT.seconds}s`);
  check(vid.width === EXPECT.width && vid.height === EXPECT.height, `video ${vid.width}x${vid.height} != ${EXPECT.width}x${EXPECT.height}`);
}
if (aud) {
  check(aud.codec === 'mp4a', `audio codec ${aud.codec} != mp4a`);
  check(Math.abs(aud.seconds - EXPECT.seconds) <= EXPECT.tolAudio, `audio duration ${aud.seconds}s not ~${EXPECT.seconds}s`);
  check(aud.channels === 2 && aud.sampleRate === 48000, `audio ${aud.channels}ch ${aud.sampleRate}Hz != 2ch 48000Hz`);
}
check(Math.abs(report.mvhd.seconds - EXPECT.seconds) <= EXPECT.tolAudio, `movie duration ${report.mvhd.seconds}s not ~${EXPECT.seconds}s`);
report.pass = fails.length === 0;
report.failures = fails;
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
