import { readFileSync } from 'node:fs';
const rd = (f) => { const b = readFileSync(f); const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34); let o = 12; while (b.toString('latin1', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4); const d = b.subarray(o + 8, o + 8 + b.readUInt32LE(o + 4)); const n = d.length / (bits / 4); const m = new Float64Array(n); for (let i = 0; i < n; i++) m[i] = fmt === 3 ? (d.readFloatLE(i * 8) + d.readFloatLE(i * 8 + 4)) / 2 : (d.readInt16LE(i * 4) + d.readInt16LE(i * 4 + 2)) / 65536; return m; };
const D = rd('final_qa/decoded_audio.wav'), W = rd('final_qa/decoded_raw_webcodecs.wav'), M = rd('audio_qa/audio.wav');
let mx = 0; for (let i = 0; i < D.length; i++) mx = Math.max(mx, Math.abs(D[i] - W[i]));
console.log('max |decodeAudioData - raw WebCodecs| =', mx);
const db = x => (20 * Math.log10(Math.max(x, 1e-12))).toFixed(1);
const r = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / (b - a)); };
console.log('ms   master  decoded  ratio(dB)');
for (let ms = 0; ms < 30; ms += 1) { const a = ms * 48, b = a + 48; console.log(String(ms).padStart(2), db(r(M, a, b)).padStart(7), db(r(D, a, b)).padStart(7), (20 * Math.log10(r(D, a, b) / r(M, a, b) + 1e-12)).toFixed(1).padStart(7)); }
