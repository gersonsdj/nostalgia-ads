// Test audio for the player/exporter (NOT the ad): a short beep at every cue time
// from timeline.js (key presses higher, scene cues lower) over a quiet 120 BPM tick.
import { DURATION, CUES, BEAT, MUSIC_START } from './timeline.js';

export async function renderAudio({ sampleRate = 48000 } = {}) {
  const len = Math.round(DURATION * sampleRate);
  const oc = new OfflineAudioContext(2, len, sampleRate);
  const beep = (t, freq, dur, gain, pan = 0) => {
    const o = oc.createOscillator();
    const g = oc.createGain();
    const p = oc.createStereoPanner();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g).connect(p).connect(oc.destination);
    o.start(t); o.stop(t + dur + 0.01);
  };
  for (let t = MUSIC_START; t < DURATION - 0.01; t += BEAT) beep(t, 220, 0.03, 0.05);
  for (const [k, v] of Object.entries(CUES)) {
    if (k === 'keyInterval') continue;
    if (Array.isArray(v)) v.forEach((tt, i) => beep(tt, 880 + i * 55, 0.08, 0.25, i % 2 ? 0.4 : -0.4));
    else if (typeof v === 'number' && v < DURATION) beep(v, 440, 0.12, 0.3);
  }
  return oc.startRendering();
}
