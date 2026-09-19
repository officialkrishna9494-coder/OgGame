// ─── Cozy Hall · camera view (third-person dollhouse ↔ first-person) ─────────
// Singleton shared by the 3D loop (read every frame), the V key and the HUD
// view button (both flip it). No React state involved — the loop damps the
// camera between the two framings, so toggling glides instead of snapping.
export const viewState = {
  /** true = ride the character's head, false = classic dollhouse follow */
  firstPerson: false,
};

export function toggleFpView(): void {
  viewState.firstPerson = !viewState.firstPerson;
}
