"use client";

// ─── Cozy Hall · turbo meter ────────────────────────────────────────────────
// Shows the car's boost tank while you are driving: 5 s of boost that banks
// back in 10 s. Hold SPACE — or hold the meter itself, which is how touch
// players boost without a keyboard.
//
// The 3D loop writes the tank into the shared `turboState` singleton; this
// reads it in its own rAF and writes styles directly, so a 60 fps drain never
// re-renders React (same handoff the in-world prompt uses).

import { useEffect, useRef } from "react";
import { turboState } from "../lib/turbo-state";
import { Icon } from "./icons";

export default function TurboGauge() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown: boolean | null = null;
    let active: boolean | null = null;
    let empty: boolean | null = null;
    // touch drivers use the CarPad hub (its TURBO button carries the tank),
    // so the floating pill parks itself on coarse pointers
    const coarse = window.matchMedia("(pointer: coarse)");
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrapRef.current;
      const pill = pillRef.current;
      const fill = fillRef.current;
      if (!el || !pill || !fill) return;

      const show = turboState.driving && !coarse.matches;
      if (show !== shown) {
        shown = show;
        el.style.visibility = show ? "visible" : "hidden";
        el.style.opacity = show ? "1" : "0";
        el.style.transform = show ? "translate(-50%, 0)" : "translate(-50%, -8px)";
      }
      if (!show) return;

      const level = Math.max(0, Math.min(1, turboState.level));
      fill.style.transform = `scaleX(${level.toFixed(3)})`;

      // lit while boosting — glow the pill so the state reads at a glance
      if (turboState.active !== active) {
        active = turboState.active;
        pill.style.borderColor = active ? "rgba(255,159,67,0.75)" : "rgba(255,255,255,0.12)";
        pill.style.boxShadow = active
          ? "0 0 26px -4px rgba(255,122,24,0.9)"
          : "0 10px 28px -12px rgba(20,12,26,0.9)";
      }

      const isEmpty = level < 0.02 && !turboState.active;
      if (isEmpty !== empty) {
        empty = isEmpty;
        if (hintRef.current) hintRef.current.textContent = isEmpty ? "refilling" : "space";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hold to boost. A window-level release catches the pointer leaving the pill
  // mid-press (and a lost window focus), so the boost can never stick on.
  useEffect(() => {
    const release = () => {
      turboState.held = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      turboState.held = false;
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      // Bottom-right while driving: clear of the top bar + toasts, clear of
      // the desktop dock (centered) and the mobile ACT cluster above it, and
      // out of the joystick's lower-left zone. Slide-in lives in `transform`
      // (set by the rAF loop) rather than Tailwind's translate property, which
      // would stack with the JS transform in v4 and shove the pill off-screen.
      className="pointer-events-none absolute bottom-[calc(var(--safe-b)+1rem)] right-[calc(var(--safe-r)+1rem)] z-20"
      style={{ visibility: "hidden", opacity: 0, transform: "translate(0, 8px)" }}
    >
      <div
        ref={pillRef}
        role="button"
        aria-label="hold to boost"
        onPointerDown={(e) => {
          e.preventDefault();
          turboState.held = true;
        }}
        onPointerUp={() => {
          turboState.held = false;
        }}
        onPointerLeave={() => {
          turboState.held = false;
        }}
        onPointerCancel={() => {
          turboState.held = false;
        }}
        className="pointer-events-auto flex touch-none select-none items-center gap-2 rounded-full border bg-[#241f2b]/85 px-2.5 py-1.5 backdrop-blur transition-colors"
        style={{ borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 10px 28px -12px rgba(20,12,26,0.9)" }}
      >
        <Icon name="bonk" size={13} className="shrink-0 text-[#ff9f43]" />
        <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/75">turbo</span>
        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/15 sm:w-20">
          <span
            ref={fillRef}
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-[#ff7a18] via-[#ffb020] to-[#ffe08a]"
            style={{ transform: "scaleX(1)" }}
          />
        </span>
        <span
          ref={hintRef}
          className="min-w-[46px] text-[9px] font-bold uppercase tracking-[0.12em] text-white/45"
        >
          space
        </span>
      </div>
    </div>
  );
}
