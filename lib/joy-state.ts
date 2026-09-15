// ─── Cozy Hall · shared joystick vector ─────────────────────────────────────
// Mutable singleton (not React state): written by the Joystick UI / canvas
// touch fallback at pointer-event rate, read by the Three.js physics loop
// every frame. No re-renders, no prop drilling, no judder.
//
// `owner` says who is steering, so the on-screen stick and the canvas drag
// fallback never fight: a stray canvas tap can't zero a stick that's held.

export type JoyOwner = "stick" | "canvas" | null;

export const joyState = {
  x: 0,
  y: 0,
  active: false,
  owner: null as JoyOwner,
};

export function resetJoy() {
  joyState.x = 0;
  joyState.y = 0;
  joyState.active = false;
  joyState.owner = null;
}
