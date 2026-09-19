// ─── Cozy Hall · driving pad (mobile car hub input) ──────────────────────────
// Mutable singleton (not React state), same handoff as joy-state/turbo-state:
// the touch buttons in CarPad write these flags, the 3D loop merges them with
// the keyboard vector every frame. Plain booleans (not a single axis) so two
// thumbs can hold opposite buttons without clobbering each other, and the
// desktop keyboard path stays byte-identical when every flag is false.
export const drivePad = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export type DrivePadKey = keyof typeof drivePad;

export function resetDrivePad(): void {
  drivePad.up = false;
  drivePad.down = false;
  drivePad.left = false;
  drivePad.right = false;
}
