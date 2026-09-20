// ─── Cozy Hall · day / night ambiance ─────────────────────────────────────────
// Singleton shared by the 3D loop (reads the flag every frame and glides the
// sun, sky and practicals toward it), the N key, and the HUD moon buttons
// (both cycle it). Same shape as view-state: no React state involved, the
// loop damps the lighting so toggling cross-fades instead of snapping.
export const nightState = {
  night: false,
};

type NightListener = (night: boolean) => void;
const listeners = new Set<NightListener>();

/** flip day ↔ night party lights; returns the new flag */
export function toggleNight(): boolean {
  nightState.night = !nightState.night;
  listeners.forEach((cb) => cb(nightState.night));
  return nightState.night;
}

/** react to every switch (N key and moon buttons share this one path) */
export function onNightChange(cb: NightListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
