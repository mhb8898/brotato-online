// ---------------------------------------------------------------------------
// Procedural audio. Synthesising blips with oscillators keeps the repo free of
// binary assets - nothing to 404 on Pages, nothing to wait on before play.
// The context is created lazily because browsers refuse to start audio before
// a user gesture.
// ---------------------------------------------------------------------------

let ac = null;
let master = null;
export let muted = false;

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.22;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

export function unlock() { ctx(); }
export function setMuted(v) { muted = v; if (master) master.gain.value = v ? 0 : 0.22; }

function blip({ freq = 440, to = null, dur = 0.08, type = 'square', vol = 0.5, delay = 0 }) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.4, freq = 900 }) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export const sfx = {
  pick:    () => blip({ freq: 880, to: 1400, dur: 0.05, type: 'triangle', vol: 0.18 }),
  hurt:    () => { blip({ freq: 220, to: 70, dur: 0.18, type: 'sawtooth', vol: 0.4 }); noise({ dur: 0.12, vol: 0.25, freq: 500 }); },
  level:   () => { [523, 659, 784, 1046].forEach((f, i) => blip({ freq: f, dur: 0.12, type: 'triangle', vol: 0.3, delay: i * 0.07 })); },
  buy:     () => { blip({ freq: 700, to: 1100, dur: 0.07, type: 'square', vol: 0.25 }); blip({ freq: 1100, dur: 0.06, type: 'triangle', vol: 0.2, delay: 0.07 }); },
  deny:    () => blip({ freq: 180, to: 110, dur: 0.14, type: 'square', vol: 0.3 }),
  wave:    () => { [392, 523, 659].forEach((f, i) => blip({ freq: f, dur: 0.16, type: 'sawtooth', vol: 0.28, delay: i * 0.1 })); },
  shop:    () => { [659, 523, 440].forEach((f, i) => blip({ freq: f, dur: 0.14, type: 'triangle', vol: 0.24, delay: i * 0.09 })); },
  boss:    () => { [110, 98, 87].forEach((f, i) => blip({ freq: f, dur: 0.5, type: 'sawtooth', vol: 0.4, delay: i * 0.22 })); },
  down:    () => blip({ freq: 300, to: 60, dur: 0.6, type: 'sawtooth', vol: 0.4 }),
  over:    () => { [330, 262, 196, 131].forEach((f, i) => blip({ freq: f, dur: 0.34, type: 'triangle', vol: 0.34, delay: i * 0.2 })); },
  win:     () => { [523, 659, 784, 1046, 1318].forEach((f, i) => blip({ freq: f, dur: 0.2, type: 'triangle', vol: 0.32, delay: i * 0.12 })); },
  join:    () => { blip({ freq: 523, dur: 0.09, type: 'triangle', vol: 0.24 }); blip({ freq: 784, dur: 0.09, type: 'triangle', vol: 0.24, delay: 0.09 }); },
  leave:   () => { blip({ freq: 523, dur: 0.09, type: 'triangle', vol: 0.24 }); blip({ freq: 330, dur: 0.12, type: 'triangle', vol: 0.24, delay: 0.09 }); },
};
