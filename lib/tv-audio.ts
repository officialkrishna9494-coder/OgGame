// ─── Cozy Hall · the room's sound on THIS viewer ────────────────────────────
// The picture is on the wall TV (TvScreenOverlay) and can also be opened in
// the TV shelf (TvPanel). Exactly ONE of those two players may be audible at a
// time — two players playing the same video would echo — so they coordinate:
//
//   · the WALL speaks whenever this viewer has joined       (TvScreenOverlay)
//   · the SHELF speaks while its own player is open         (TvPanel)
//
// Joining is remembered, and browsers only allow unmuted playback after a real
// interaction, so the choice is re-applied at the first tap or keypress rather
// than fighting the autoplay policy at load.

const STORAGE_KEY = "og.tv.audio";

let gesture = false;

/** has this viewer interacted at least once (unmuted playback needs it)? */
export function tvGestureSeen(): boolean {
  return gesture;
}

export function markTvGesture(): void {
  gesture = true;
}

/** the remembered choice — false on the server and for first-time visitors */
export function readTvAudio(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false; // private mode / storage disabled: just don't remember it
  }
}

export function writeTvAudio(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "on");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to remember — the session still works */
  }
}
