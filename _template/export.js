// MP4 exporter for the Nostalgia ad (WebCodecs + mp4-muxer, no build step).
//
//   const { bytes, ms, videoFrames } = await exportMp4({ drawFrame, audioBuffer, onProgress });
//
// - Video: H.264 High @ L4.1 (avc1.640029), W x H, FPS, 30 Mbps VBR target, keyframe every
//   2*FPS frames (the encoder still adds its own scene-cut IDRs). The target is a ceiling,
//   not the result: this encoder hits its QP floor on flat pixel art and lands at ~9 Mbps
//   (~17 MB). Measured in out/final_qa/encode_report*.json against the old 12 Mbps / 1 s
//   GOP: TV-snow frames 27 -> 53 dB, slot-checking frames 30.5 -> 36 dB, mean 35.3 -> 37.3.
//   Exactly FRAMES frames; frame i is drawn at t = i / FPS on a DEDICATED canvas
//   (never the on-screen preview), cleared to opaque black before every frame.
// - Audio: AAC-LC (mp4a.40.2), 48 kHz stereo, 192 kbps, fed as f32-planar chunks of 1024
//   frames. The buffer is conformed to exactly DURATION seconds of 48 kHz stereo
//   (resampled / up-mixed / trimmed / zero-padded as needed). audioBuffer may be null ->
//   video-only file.
import { W, H, FPS, FRAMES, DURATION } from './timeline.js';

const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs';

// first supported wins; L4.1 declared honestly (30 Mbps is above L4.0's 25 Mbps High cap)
export const VIDEO_CODECS = ['avc1.640029', 'avc1.640028', 'avc1.4D0029', 'avc1.4D0028', 'avc1.42E028'];
export const VIDEO_BITRATE = 30_000_000;
export const KEYFRAME_EVERY = 2 * FPS;       // 1 keyframe every 2 s (+ encoder scene cuts)
export const AUDIO_CODEC = 'mp4a.40.2';
export const AUDIO_RATE = 48000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_BITRATE = 192_000;
export const AUDIO_CHUNK = 1024;
const MAX_QUEUE = 8;

// Yield to the event loop without setTimeout (setTimeout is throttled to ~1 Hz in
// hidden tabs; a MessageChannel hop is not).
const yieldNow = () => new Promise(res => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); res(); };
  ch.port2.postMessage(0);
});

function waitDequeue(enc) {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (done) return; done = true; enc.removeEventListener?.('dequeue', fin); clearTimeout(tm); res(); };
    enc.addEventListener?.('dequeue', fin);
    const tm = setTimeout(fin, 50); // safety net if 'dequeue' is not dispatched
  });
}

async function pickVideoConfig() {
  const base = {
    width: W, height: H, bitrate: VIDEO_BITRATE, bitrateMode: 'variable', framerate: FPS,
    latencyMode: 'quality', avc: { format: 'avc' },
  };
  const tried = [];
  for (const codec of VIDEO_CODECS) {
    for (const hardwareAcceleration of ['no-preference', 'prefer-software']) {
      const cfg = { ...base, codec, hardwareAcceleration };
      try {
        const s = await VideoEncoder.isConfigSupported(cfg);
        if (s.supported) return cfg;
      } catch (e) { /* try the next one */ }
      tried.push(`${codec}/${hardwareAcceleration}`);
    }
  }
  throw new Error('Nenhuma configuração H.264 suportada neste navegador: ' + tried.join(', '));
}

/** Conform any AudioBuffer to DURATION s of 48 kHz stereo planar Float32Arrays. */
async function conformAudio(buf) {
  const n = Math.round(DURATION * AUDIO_RATE);
  let src = buf;
  if (buf.sampleRate !== AUDIO_RATE || buf.numberOfChannels !== AUDIO_CHANNELS) {
    const len = Math.max(1, Math.round(buf.duration * AUDIO_RATE));
    const oc = new OfflineAudioContext(AUDIO_CHANNELS, len, AUDIO_RATE);
    const node = oc.createBufferSource();
    node.buffer = buf;
    node.connect(oc.destination); // mono is up-mixed to both channels by the graph
    node.start(0);
    src = await oc.startRendering();
  }
  const out = [];
  for (let c = 0; c < AUDIO_CHANNELS; c++) {
    const ch = new Float32Array(n);
    const data = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    ch.set(data.length > n ? data.subarray(0, n) : data);
    out.push(ch);
  }
  return out;
}

function clearCanvas(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
}

export async function exportMp4({ drawFrame, audioBuffer = null, onProgress = () => {} } = {}) {
  if (typeof drawFrame !== 'function') throw new Error('exportMp4: drawFrame ausente');
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs (VideoEncoder) indisponível neste navegador');
  const t0 = performance.now();
  const progress = (p, stage) => { try { onProgress(Math.max(0, Math.min(1, p)), stage); } catch (e) { /* UI errors never break the export */ } };
  progress(0, 'preparando');

  const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
  const videoConfig = await pickVideoConfig();
  const withAudio = !!audioBuffer;
  if (withAudio && typeof AudioEncoder === 'undefined') throw new Error('WebCodecs (AudioEncoder) indisponível neste navegador');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: withAudio ? { codec: 'aac', numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_RATE } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const fail = where => e => { failure = failure || new Error(`${where}: ${e && e.message || e}`); };

  let videoChunks = 0;
  const venc = new VideoEncoder({
    output: (chunk, meta) => { videoChunks++; muxer.addVideoChunk(chunk, meta); },
    error: fail('VideoEncoder'),
  });
  venc.configure(videoConfig);

  let aenc = null;
  if (withAudio) {
    aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: fail('AudioEncoder'),
    });
    aenc.configure({ codec: AUDIO_CODEC, sampleRate: AUDIO_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE });
  }

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const frameDur = Math.round(1e6 / FPS);

  try {
    // ---- audio (cheap, done up front; 5% of the bar) ----
    if (withAudio) {
      progress(0.01, 'áudio');
      const planes = await conformAudio(audioBuffer);
      const n = planes[0].length;
      for (let off = 0; off < n; off += AUDIO_CHUNK) {
        if (failure) throw failure;
        const len = Math.min(AUDIO_CHUNK, n - off);
        const data = new Float32Array(len * AUDIO_CHANNELS);
        for (let c = 0; c < AUDIO_CHANNELS; c++) data.set(planes[c].subarray(off, off + len), c * len);
        const ad = new AudioData({
          format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: len,
          numberOfChannels: AUDIO_CHANNELS, timestamp: Math.round(off * 1e6 / AUDIO_RATE), data,
        });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      progress(0.05, 'áudio');
    }

    // ---- video ----
    for (let i = 0; i < FRAMES; i++) {
      if (failure) throw failure;
      clearCanvas(ctx);
      ctx.save();
      const r = drawFrame(ctx, i / FPS);
      if (r && typeof r.then === 'function') await r;
      ctx.restore();
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: frameDur, alpha: 'discard' });
      venc.encode(frame, { keyFrame: i % KEYFRAME_EVERY === 0 });
      frame.close();
      while (venc.encodeQueueSize > MAX_QUEUE) await waitDequeue(venc);
      if (i % 3 === 0) await yieldNow();
      progress(0.05 + 0.9 * (i + 1) / FRAMES, `quadro ${i + 1}/${FRAMES}`);
    }
    progress(0.96, 'finalizando');
    await venc.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    try { if (venc.state !== 'closed') venc.close(); } catch (e) { /* already closed */ }
    try { if (aenc && aenc.state !== 'closed') aenc.close(); } catch (e) { /* already closed */ }
  }

  const bytes = new Uint8Array(muxer.target.buffer);
  const ms = Math.round(performance.now() - t0);
  progress(1, 'pronto');
  return { bytes, ms, videoFrames: FRAMES, videoChunks, codec: videoConfig.codec, withAudio };
}
