// ─── Cozy Hall · camera view (triple view, V key cycles) ─────────────────────
// 0 = follow — the classic dollhouse glide (default)
// 1 = first-person — ride the character's head
// 2 = chase — close behind the back, nearer than max zoom-in ever reaches
//
// Singleton shared by the 3D loop (read every frame), the V key and the HUD
// view button (both cycle it). No React state involved — the loop damps the
// camera between the three framings, so switching glides instead of snapping.
export type ViewMode = 0 | 1 | 2;

export const viewState = {
  mode: 0 as ViewMode,
};

type ViewListener = (mode: ViewMode) => void;
const listeners = new Set<ViewListener>();

/** cycle follow → first-person → chase → follow …; returns the new mode */
export function cycleViewMode(): ViewMode {
  viewState.mode = ((viewState.mode + 1) % 3) as ViewMode;
  listeners.forEach((cb) => cb(viewState.mode));
  return viewState.mode;
}

/** react to every switch (V key and view tile share this one path) */
export function onViewChange(cb: ViewListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** true in first-person (head-cam): own avatar hides, zoom parks, FOV widens */
export function isFirstPerson(): boolean {
  return viewState.mode === 1;
}
