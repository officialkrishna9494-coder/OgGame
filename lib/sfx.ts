"use client";

// ─── Cozy Hall · tiny synth sfx (no assets, just WebAudio) ──────────────────
// Soft pops for star pickups, a little arpeggio when someone wins.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at);
  o.stop(a.currentTime + at + dur + 0.05);
}

export function popSfx() {
  blip(660, 0, 0.12, 0.08);
  blip(990, 0.05, 0.14, 0.06);
}

export function winSfx() {
  [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.11, 0.28, 0.09, "triangle"));
}

export function startSfx() {
  [392, 523, 659].forEach((f, i) => blip(f, i * 0.09, 0.2, 0.08, "triangle"));
}

export function bumpSfx() {
  // bumper-car thud — low + soft, scaled by impact at the call site
  blip(120, 0, 0.16, 0.12, "triangle");
  blip(82, 0.02, 0.2, 0.1, "sine");
}

// ── ball: throw whoosh, body bonk, ground bounce ──────────────────────────
export function throwSfx() {
  // quick upward sweep — reads as an arm throw, not a UI blip
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(280, t);
  o.frequency.exponentialRampToValueAtTime(720, t + 0.12);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.2);
}

export function bonkSfx() {
  // a throw meeting a body — mid thud + low knock
  blip(220, 0, 0.12, 0.12, "square");
  blip(140, 0.03, 0.16, 0.1, "triangle");
}

let lastBounceAt = 0;
export function bounceSfx(hard = 1) {
  // ground bounce — self-throttled (physics ticks every frame) and scaled
  // by impact at the call site; silence carries when hard <= 0
  if (hard <= 0) return;
  const now = performance.now();
  if (now - lastBounceAt < 130) return;
  lastBounceAt = now;
  blip(150, 0, 0.07, 0.045 * Math.min(1.5, hard));
}

// ── kart engine + turbo: one reusable loop, pitch follows speed ───────────
// engineUpdate runs every frame while driving (cheap param tweens, zero
// allocation); engineStop idles the gain when on foot. Nodes are created on
// the first driven frame — never before a real user gesture, so autoplay
// policies stay happy and silent tabs cost nothing.
let engOsc: OscillatorNode | null = null;
let engFilter: BiquadFilterNode | null = null;
let engGain: GainNode | null = null;
let turboGain: GainNode | null = null;
let engOn = false;

function engineNodes(): boolean {
  const a = ac();
  if (!a) return false;
  if (!engOsc) {
    engOsc = a.createOscillator();
    engOsc.type = "sawtooth";
    engOsc.frequency.value = 55;
    engFilter = a.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 500;
    engGain = a.createGain();
    engGain.gain.value = 0;
    engOsc.connect(engFilter).connect(engGain).connect(a.destination);
    engOsc.start();
    // turbo air: looped noise through a bandpass, silent until boosting
    const len = a.sampleRate;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    turboGain = a.createGain();
    turboGain.gain.value = 0;
    src.connect(bp).connect(turboGain).connect(a.destination);
    src.start();
  }
  return true;
}

export function engineUpdate(speed: number, boost: number) {
  if (!engineNodes() || !engOsc || !engFilter || !engGain || !turboGain || !ctx) return;
  const t = ctx.currentTime;
  const sp = Math.min(1, Math.abs(speed) / 12);
  const b = Math.max(0, Math.min(1, boost));
  engOsc.frequency.setTargetAtTime(55 + sp * 110 + b * 40, t, 0.06);
  engFilter.frequency.setTargetAtTime(400 + sp * 900 + b * 600, t, 0.08);
  engGain.gain.setTargetAtTime(0.028 + sp * 0.03, t, 0.09);
  turboGain.gain.setTargetAtTime(b * 0.05, t, 0.12);
  engOn = true;
}

export function engineStop() {
  if (!engOn || !ctx || !engGain || !turboGain) return;
  const t = ctx.currentTime;
  engGain.gain.setTargetAtTime(0, t, 0.1);
  turboGain.gain.setTargetAtTime(0, t, 0.1);
  engOn = false;
}

export function sosSfx() {
  // two-tone alarm ×3
  for (let i = 0; i < 3; i++) {
    blip(660, i * 0.32, 0.15, 0.1, "square");
    blip(495, i * 0.32 + 0.16, 0.15, 0.1, "square");
  }
}
