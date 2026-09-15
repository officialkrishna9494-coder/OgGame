"use client";

// ─── Cozy Hall · floating joystick (mobile landscape, right side) ──────────
// Minimal frosted stick. Writes to the shared joy vector at pointer rate;
// the 3D loop reads it every frame — the knob is the only thing that
// re-renders, so the game thread never stutters.

import { useRef, useState } from "react";
import { joyState, resetJoy } from "../lib/joy-state";

const RADIUS = 38;

export default function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const steer = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    joyState.x = dx / RADIUS;
    joyState.y = dy / RADIUS;
    joyState.active = true;
  };

  const release = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    setActive(false);
    resetJoy();
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        steer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) steer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pid.current) release();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pid.current) release();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto absolute bottom-5 right-5 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full bg-white/20 shadow-[0_10px_30px_-10px_rgba(60,40,90,0.5)] ring-1 ring-white/60 backdrop-blur-md transition-transform ${active ? "scale-105" : ""}`}
    >
      {/* direction ticks */}
      <span className="absolute top-1.5 text-[9px] font-black text-white/70">▲</span>
      <div
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        className={`flex h-13 w-13 items-center justify-center rounded-full bg-white/95 text-lg shadow-xl transition-shadow ${active ? "shadow-2xl" : ""}`}
      >
        🕹️
      </div>
    </div>
  );
}
