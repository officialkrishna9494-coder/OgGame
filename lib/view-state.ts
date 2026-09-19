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

export function cycleViewMode(): void {
  viewState.mode = ((viewState.mode + 1) % 3) as ViewMode;
}

/** true in first-person (head-cam): own avatar hides, zoom parks, FOV widens */
export function isFirstPerson(): boolean {
  return viewState.mode === 1;
}
