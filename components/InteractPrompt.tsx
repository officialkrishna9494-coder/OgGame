"use client";

// ─── Cozy Hall · in-world interaction prompt ────────────────────────────────
// Floats over the thing you can use (sofa, TV, duel table, SOS button) and
// tracks it as the camera glides. The scene projects the anchor into
// `promptAnchor` every frame; this reads it in its own rAF and writes the
// transform directly, so React only re-renders when the action changes.
// Press E, click it, or tap it.

import { useEffect, useRef } from "react";
import { HOLD_MS, promptAnchor, type InteractAction } from "../lib/interaction";
import type { Interaction } from "../lib/useInteraction";
import { Icon } from "./icons";

const EDGE = 10; // keep clear of the screen edges
const TOP_CLEAR = 60; // and of the top bar

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? lo : Math.max(lo, Math.min(hi, v)));

/** Keyboard key, light cap on dark UI; fills with the accent while held. */
export function KeyCap({ k = "E", holding = false, glow = "#ff8fab" }: { k?: string; holding?: boolean; glow?: string }) {
  return (
    <kbd className="relative flex h-[22px] min-w-[22px] items-center justify-center overflow-hidden rounded-[7px] bg-white px-1.5 font-sans text-[11px] font-black leading-none text-[#3d3347] shadow-[inset_0_-2px_0_rgba(61,51,71,0.28)]">
      {holding && (
        <span
          className="animate-hold-fill absolute inset-0 opacity-60"
          style={{ background: glow, animationDuration: `${HOLD_MS}ms` }}
        />
      )}
      <span className="relative">{k}</span>
    </kbd>
  );
}

/** Circular hold-to-confirm progress, drawn over a round button. */
export function HoldRing({ glow, width = 7 }: { glow: string; width?: number }) {
  return (
    <svg className="pointer-events-none absolute -inset-[3px] -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r={50 - width / 2}
        fill="none"
        stroke={glow}
        strokeWidth={width}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        className="animate-hold-ring"
        style={{ animationDuration: `${HOLD_MS}ms` }}
      />
    </svg>
  );
}

interface Props {
  action: InteractAction | null;
  interaction: Interaction;
  /** desktop shows the E keycap; touch shows the action icon instead */
  showKey: boolean;
}

export default function InteractPrompt({ action, interaction, showKey }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const key = action?.key ?? null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    if (!key) return;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (promptAnchor.key !== key || !promptAnchor.visible) {
        if (el.style.visibility !== "hidden") {
          el.style.visibility = "hidden";
          el.style.opacity = "0";
        }
        return;
      }
      const host = el.offsetParent as HTMLElement | null;
      const W = host?.clientWidth ?? window.innerWidth;
      const H = host?.clientHeight ?? window.innerHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = clamp(promptAnchor.x - w / 2, EDGE, W - w - EDGE);
      const y = clamp(promptAnchor.y - h, TOP_CLEAR, H - h - EDGE);
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      // the tail keeps pointing at the object even when the pill is clamped
      if (tailRef.current) tailRef.current.style.left = `${clamp(promptAnchor.x - x, 18, w - 18)}px`;
      if (el.style.visibility !== "visible") {
        el.style.visibility = "visible";
        el.style.opacity = "1";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute left-0 top-0 pb-[9px] transition-opacity duration-150 will-change-transform"
      style={{ visibility: "hidden", opacity: 0 }}
    >
      {action && (
        <div className="animate-prompt-bob">
          <button
            key={action.key}
            {...interaction.bind}
            aria-label={`${action.prompt}${showKey ? " (E)" : ""}`}
            className={`animate-pop-in pointer-events-auto relative flex touch-manipulation select-none items-center gap-2 rounded-full bg-[#3d3347] pl-1.5 text-white ${showKey ? "py-1.5 pr-3.5" : "py-1 pr-3"} ring-1 ring-white/10 transition-shadow hover:ring-white/30`}
            onContextMenu={(e) => e.preventDefault()}
            // neutral lift only — no action-tinted glow bleeding onto the scene
            style={{ boxShadow: "0 6px 16px -8px rgba(40,30,55,0.55)" }}
          >
            <span key={interaction.pulse} className={`flex items-center gap-2 ${interaction.pulse ? "animate-act-press" : ""}`}>
              {showKey ? (
                <>
                  <KeyCap holding={interaction.holding} glow={action.glow} />
                  <Icon name={action.icon} size={16} className="text-white/90" />
                </>
              ) : (
                <span className="relative flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: action.glow }}>
                  <Icon name={action.icon} size={13} className="text-white" />
                  {interaction.holding && <HoldRing glow="#ffffff" width={9} />}
                </span>
              )}
              <span className={`whitespace-nowrap font-bold tracking-tight ${showKey ? "text-[12.5px]" : "text-[11.5px]"}`}>{action.prompt}</span>
            </span>
            <span
              ref={tailRef}
              aria-hidden="true"
              className="absolute top-full -ml-[7px] h-0 w-0 border-x-[7px] border-t-[8px] border-x-transparent border-t-[#3d3347]"
              style={{ left: "50%" }}
            />
          </button>
        </div>
      )}
    </div>
  );
}
