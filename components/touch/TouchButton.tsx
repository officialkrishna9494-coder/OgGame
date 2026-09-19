// ─── Cozy Hall · TouchButton (mobile game-control primitive) ─────────────────
// The one press-and-hold button every thumb cluster is built from: steering
// arrows, pedals, turbo and jump all share pointer-capture, haptic tick,
// stuck-input safety and the pressed scale — so the feel is identical
// everywhere and a new control is one import, not new gesture code.
//
// • `pressed` visuals are CSS-only (`active:`) — no React state per frame.
// • `hold` binding comes from `lib/touch-input` (capture + release paths).
// • Sizes meet the 44 px minimum touch target; round + pill tones included.
// • Desktop never renders this (mobile HUD only).

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { HoldBinding } from "../../lib/touch-input";

type Tone = "light" | "dark";
type Shape = "round" | "pill";

const SIZES: Record<string, string> = {
  sm: "h-14 w-14",
  md: "h-16 w-16",
  lg: "h-[76px] w-[76px]",
};

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onContextMenu"
> {
  hold: HoldBinding;
  size?: keyof typeof SIZES | string;
  tone?: Tone;
  shape?: Shape;
  children: ReactNode;
}

export default function TouchButton({ hold, size = "md", tone = "light", shape = "round", children, className = "", type = "button", ...rest }: Props) {
  const sizeCls = SIZES[size as string] ?? (size as string);
  const shapeCls = shape === "pill" ? "rounded-2xl" : "rounded-full";
  const toneCls =
    tone === "dark"
      ? "bg-[#3d3347]/90 text-white ring-white/15"
      : "bg-white/90 text-[#4a3f55] ring-black/[0.07]";
  return (
    <button
      type={type}
      {...hold}
      {...rest}
      className={`pointer-events-auto flex touch-none select-none items-center justify-center ${shapeCls} shadow-lg ring-1 backdrop-blur transition-transform duration-100 active:scale-90 ${sizeCls} ${toneCls} ${className}`}
    >
      {children}
    </button>
  );
}
