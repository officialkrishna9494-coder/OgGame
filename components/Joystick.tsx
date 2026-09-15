"use client";

// ─── Cozy Hall · floating joystick (mobile landscape, left thumb zone) ─────
// Console-style dynamic stick: touch anywhere in the lower-left zone and the
// stick spawns under your thumb; let go and it glides back to its resting
// spot — well clear of the corner, the notch and the home indicator.
// Positions are written straight to the DOM (no re-render per move); the
// shared joy vector is read by the 3D loop every frame.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { joyState, resetJoy } from "../lib/joy-state";

const BASE = 116; // ring diameter (px)
const KNOB = 54; // knob diameter (px)
const RADIUS = 42; // max knob travel (px)
const DEAD = 0.12; // ignore thumb wobble near the centre (fraction of RADIUS)

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

export default function Joystick() {
  const zoneRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const release = useCallback(() => {
    pid.current = null;
    // clearing inline styles hands control back to the CSS transitions,
    // so ring and knob glide home instead of snapping
    for (const el of [baseRef.current, knobRef.current]) {
      if (!el) continue;
      el.style.transition = "";
      el.style.transform = "";
    }
    setActive(false);
    if (joyState.owner === "stick") resetJoy();
  }, []);

  const steer = (clientX: number, clientY: number) => {
    const dx = clientX - origin.current.x;
    const dy = clientY - origin.current.y;
    const d = Math.hypot(dx, dy);
    const k = d > RADIUS ? RADIUS / d : 1;
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`;

    const mag = Math.min(1, d / RADIUS);
    // ramp 0 → 1 from the dead-zone edge, so slow walking stays precise
    const out = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD);
    joyState.x = d > 0 ? (dx / d) * out : 0;
    joyState.y = d > 0 ? (dy / d) * out : 0;
    joyState.active = true;
    joyState.owner = "stick";
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const zone = zoneRef.current;
    const rest = restRef.current;
    const base = baseRef.current;
    const knob = knobRef.current;
    if (pid.current !== null || !zone || !rest || !base || !knob) return;
    pid.current = e.pointerId;
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }

    // spawn under the thumb, but keep the whole ring inside the zone
    const z = zone.getBoundingClientRect();
    const r = rest.getBoundingClientRect();
    const pad = BASE / 2 + 6;
    const cx = clamp(e.clientX, z.left + pad, z.right - pad);
    const cy = clamp(e.clientY, z.top + pad, z.bottom - pad);
    origin.current = { x: cx, y: cy };

    base.style.transition = "none";
    base.style.transform = `translate(${cx - (r.left + r.width / 2)}px, ${cy - (r.top + r.height / 2)}px)`;
    knob.style.transition = "none";
    setActive(true);
    steer(e.clientX, e.clientY);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === pid.current) release();
  };

  // a backgrounded tab / app switch may never deliver pointerup — stop walking
  useEffect(() => {
    const stop = () => {
      if (pid.current !== null) release();
    };
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      if (joyState.owner === "stick") resetJoy();
    };
  }, [release]);

  return (
    <div
      ref={zoneRef}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) steer(e.clientX, e.clientY);
      }}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="movement joystick"
      className="pointer-events-auto absolute bottom-0 left-0 h-[72%] w-[min(46vw,440px)] touch-none select-none [-webkit-touch-callout:none]"
    >
      {/* resting spot — generous margin from the left edge and the bottom */}
      <div
        ref={restRef}
        className="absolute bottom-[calc(var(--safe-b)+2.25rem)] left-[calc(var(--safe-l)+2.75rem)]"
        style={{ width: BASE, height: BASE }}
      >
        <div
          ref={baseRef}
          className={`absolute inset-0 rounded-full bg-white/20 shadow-[0_10px_30px_-10px_rgba(60,40,90,0.5)] ring-1 ring-white/60 backdrop-blur-sm transition-[transform,opacity,scale] duration-200 ease-out ${active ? "scale-105 opacity-100" : "opacity-70"}`}
        >
          {/* inner guide ring + direction ticks */}
          <span className="absolute inset-[18px] rounded-full ring-1 ring-white/35" />
          <span className="absolute left-1/2 top-1 -ml-[4px] text-[8px] leading-none text-white/75">▲</span>
          <span className="absolute bottom-1 left-1/2 -ml-[4px] text-[8px] leading-none text-white/75">▼</span>
          <span className="absolute left-1.5 top-1/2 -mt-[5px] text-[8px] leading-none text-white/75">◀</span>
          <span className="absolute right-1.5 top-1/2 -mt-[5px] text-[8px] leading-none text-white/75">▶</span>

          <div
            ref={knobRef}
            className="absolute left-1/2 top-1/2 flex items-center justify-center rounded-full bg-white/95 shadow-xl ring-1 ring-black/[0.06] transition-transform duration-150 ease-out"
            style={{ width: KNOB, height: KNOB, marginLeft: -KNOB / 2, marginTop: -KNOB / 2 }}
          >
            <span className="block h-4 w-4 rounded-full bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
}
