// ─── Cozy Hall · TurboButton (car hub, round boost with ring meter) ──────────
// Round left-thumb boost: hold it (or hold SPACE on desktop) to spend the 5 s
// tank the 3D loop drains via `turboState`. TURBO also drives the car forward
// on mobile (same as holding ▲) via the dedicated `drivePad.turbo` flag —
// the sim ORs it into the throttle, so a held TURBO alone launches the car
// and releasing ▲ mid-boost never kills the launch. The tank ring is written
// straight to the DOM in its own rAF — a 60 fps drain never re-renders
// React, same handoff as the floating desktop gauge (which parks itself on
// coarse pointers because this button carries the tank there).

"use client";

import { useEffect, useMemo, useRef } from "react";
import { drivePad } from "../../lib/drive-pad";
import { turboState } from "../../lib/turbo-state";
import { holdHandlers } from "../../lib/touch-input";
import { Icon } from "../icons";

// Ring geometry (r=28 in a 72×72 viewBox, 4px glow padding around a 64px btn).
const RING_R = 28;
const RING_C = 2 * Math.PI * RING_R;

export default function TurboButton() {
  const ringRef = useRef<SVGCircleElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const hold = useMemo(
    () =>
      holdHandlers((held) => {
        // singleton handoff: the 3D loop ORs `held` with SPACE for the boost
        // every frame, and ORs `drivePad.turbo` into the throttle so TURBO
        // alone drives forward like a held ▲ (no clobber either way).
        // eslint-disable-next-line react-hooks/immutability
        turboState.held = held;
        // eslint-disable-next-line react-hooks/immutability
        drivePad.turbo = held;
      }),
    []
  );

  useEffect(() => {
    let raf = 0;
    let active: boolean | null = null;
    let lastLevel = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ring = ringRef.current;
      const btn = btnRef.current;
      if (!ring || !btn) return;
      const level = Math.max(0, Math.min(1, turboState.level));
      // DOM writes only — no React state at 60 fps.
      if (Math.abs(level - lastLevel) > 0.001) {
        lastLevel = level;
        ring.style.strokeDashoffset = `${(RING_C * (1 - level)).toFixed(1)}`;
        ring.style.opacity = level < 0.02 && !turboState.active ? "0.25" : "1";
      }
      if (turboState.active !== active) {
        active = turboState.active;
        btn.style.borderColor = active ? "rgba(255,159,67,0.85)" : "rgba(0,0,0,0.07)";
        btn.style.boxShadow = active
          ? "0 0 26px -4px rgba(255,122,24,0.9)"
          : "0 10px 28px -8px rgba(60,40,90,0.5)";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <button
      ref={btnRef}
      aria-label="hold for turbo boost"
      title="hold for turbo boost"
      {...hold}
      className="pointer-events-auto relative flex h-16 w-16 touch-none select-none items-center justify-center rounded-full border bg-white/90 text-[#4a3f55] shadow-lg backdrop-blur transition-transform active:scale-90"
      style={{ borderColor: "rgba(0,0,0,0.07)", boxShadow: "0 10px 28px -8px rgba(60,40,90,0.5)" }}
    >
      {/* tank ring — progress drains clockwise from the top */}
      <svg className="pointer-events-none absolute -inset-[5px] -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={RING_R} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="5" />
        <circle
          ref={ringRef}
          cx="36"
          cy="36"
          r={RING_R}
          fill="none"
          stroke="#ff9f43"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_C.toFixed(1)}
          strokeDashoffset="0"
        />
      </svg>
      <span className="flex flex-col items-center leading-none">
        <Icon name="bonk" size={22} className="text-[#ff9f43]" />
        <span className="mt-1 text-[8px] font-black uppercase tracking-[0.16em]">turbo</span>
      </span>
    </button>
  );
}
