// ─── Cozy Hall · touch input helpers (mobile HUD primitives) ─────────────────
// Industry-standard building blocks for every on-screen game control:
//
// • `pressHaptic` — a tiny vibration on press (Android / supported phones),
//   silent no-op anywhere else. Never throws, never blocks the gesture.
// • `holdHandlers` — pointer-capture hold binding for a boolean flag. One
//   thumb per button: press sets, release clears, slide-off clears, and a
//   lost capture always clears so a hold can never stick on.
// • `useReleaseOnHide` — clears held flags when the tab/app backgrounds or
//   the window blurs. A backgrounded tab may never deliver pointerup.
// • `PREVENT_CONTEXT` — shared onContextMenu handler (long-press menu off).
//
// All mobile clusters (car hub, on-foot ACT + JUMP, joystick-adjacent pads)
// build on these, so multi-touch, stuck-input and haptic behaviour stay
// identical everywhere. Desktop never imports this module.

"use client";

import { useEffect } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** Fire a short haptic tick. Safe on desktop / iOS (no-op when unavailable). */
export function pressHaptic(pattern: number | number[] = 8): void {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const vibrate = nav && typeof (nav as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate === "function"
      ? (nav as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate.bind(nav)
      : null;
    vibrate?.(pattern);
  } catch {
    /* haptics are best-effort */
  }
}

/** Shared long-press / callout suppression for every touch button. */
export function preventTouchCallout(e: ReactMouseEvent<HTMLElement>): void {
  e.preventDefault();
}

export interface HoldBinding {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * Bind a press-and-hold boolean flag (drivePad direction, turbo, …).
 *
 * - `set(true)` on press (with pointer capture, so a slide-off still
 *   releases on this button), `set(false)` on every release path.
 * - `onTap` fires for momentary buttons (jump) on press, not on click —
 *   click arrives ~100 ms later on touch and would feel laggy.
 * - `haptic` defaults on: one tick per press, none on release.
 */
export function holdHandlers(
  set: (held: boolean) => void,
  opts?: { onTap?: () => void; haptic?: boolean }
): HoldBinding {
  const haptic = opts?.haptic ?? true;
  return {
    onPointerDown: (e) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone — blur/visibility reset below still clears */
      }
      if (haptic) pressHaptic();
      set(true);
      opts?.onTap?.();
    },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onLostPointerCapture: () => set(false),
    onContextMenu: (e) => e.preventDefault(),
  };
}

/**
 * Clear held touch flags when the page hides or the window blurs.
 * Mount once per thumb cluster (CarPad, on-foot column, …).
 */
export function useReleaseOnHide(release: () => void): void {
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointercancel", release);
    return () => {
      release();
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointercancel", release);
    };
  }, [release]);
}
