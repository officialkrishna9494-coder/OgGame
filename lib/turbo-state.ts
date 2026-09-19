// ─── Cozy Hall · shared turbo meter ─────────────────────────────────────────
// Mutable singleton (like joy-state / promptAnchor): the Three.js loop writes
// the boost tank every frame; the HUD gauge reads it in its own rAF and writes
// styles directly, so a 60 fps drain never re-renders React.
//
// `held` runs the other way — the on-screen meter doubles as the boost button
// on touch screens, where there is no spacebar.

export const turboState = {
  /** 1 = tank full, 0 = empty (5 s of boost) */
  level: 1,
  /** boosting right now — the flames are lit and the speed is multiplied */
  active: false,
  /** the local player is in a car; the gauge only shows while driving */
  driving: false,
  /** touch / pointer holding the gauge, OR'd with the spacebar in the sim */
  held: false,
};

export function resetTurbo() {
  turboState.level = 1;
  turboState.active = false;
  turboState.driving = false;
  turboState.held = false;
}
