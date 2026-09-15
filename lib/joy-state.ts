// ─── Cozy Hall · shared joystick vector ─────────────────────────────────────
// Mutable singleton (not React state): written by the Joystick UI / canvas
// touch fallback at pointer-event rate, read by the Three.js physics loop
// every frame. No re-renders, no prop drilling, no judder.

export const joyState = {
  x: 0,
  y: 0,
  active: false,
};

export function resetJoy() {
  joyState.x = 0;
  joyState.y = 0;
  joyState.active = false;
}
