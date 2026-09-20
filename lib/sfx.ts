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

export function sosSfx() {
  // two-tone alarm ×3
  for (let i = 0; i < 3; i++) {
    blip(660, i * 0.32, 0.15, 0.1, "square");
    blip(495, i * 0.32 + 0.16, 0.15, 0.1, "square");
  }
}
