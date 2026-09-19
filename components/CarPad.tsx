"use client";

// ─── Cozy Hall · mobile car hub (driving only) ───────────────────────────────
// Industry-standard racing thumbs: LEFT thumb steers (◀ ▶) and holds TURBO,
// RIGHT thumb works the pedals (▲ ▼). The contextual ACT button (hop out
// while driving) rides above the pedals; the ⋯ menu lives top-right.
// Buttons write the drivePad / turboState singletons with per-button pointer
// capture, so two thumbs never clobber each other and a slide-off always
// releases. Desktop never renders this — keyboard stays the only input there.

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { drivePad, resetDrivePad, type DrivePadKey } from "../lib/drive-pad";
import type { InteractAction } from "../lib/interaction";
import type { Interaction } from "../lib/useInteraction";
import { turboState } from "../lib/turbo-state";
import { Icon } from "./icons";
import { HoldRing } from "./InteractPrompt";

function padHold(key: DrivePadKey) {
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone — window blur still resets below */
      }
      drivePad[key] = true;
    },
    onPointerUp: () => {
      drivePad[key] = false;
    },
    onPointerCancel: () => {
      drivePad[key] = false;
    },
    onLostPointerCapture: () => {
      drivePad[key] = false;
    },
    onContextMenu: (e: ReactMouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}

const turboHold = {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    turboState.held = true;
  },
  onPointerUp: () => {
    turboState.held = false;
  },
  onPointerCancel: () => {
    turboState.held = false;
  },
  onLostPointerCapture: () => {
    turboState.held = false;
  },
  onContextMenu: (e: ReactMouseEvent<HTMLButtonElement>) => e.preventDefault(),
};

const roundBtn =
  "pointer-events-auto flex touch-none select-none items-center justify-center rounded-full bg-white/90 text-[#4a3f55] shadow-lg ring-1 ring-black/[0.07] backdrop-blur transition-transform active:scale-90";

export default function CarPad({ action, interaction }: { action: InteractAction | null; interaction: Interaction }) {
  const tankRef = useRef<HTMLSpanElement>(null);
  const turboRef = useRef<HTMLButtonElement>(null);

  // backgrounding mid-press must never stick a pedal or the boost on
  useEffect(() => {
    const release = () => {
      resetDrivePad();
      turboState.held = false;
    };
    window.addEventListener("blur", release);
    return () => {
      release();
      window.removeEventListener("blur", release);
    };
  }, []);

  // turbo tank meter on the TURBO button — direct DOM writes, no re-renders
  useEffect(() => {
    let raf = 0;
    let active: boolean | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const fill = tankRef.current;
      const btn = turboRef.current;
      if (!fill || !btn) return;
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, turboState.level)).toFixed(3)})`;
      if (turboState.active !== active) {
        active = turboState.active;
        btn.style.borderColor = active ? "rgba(255,159,67,0.8)" : "rgba(0,0,0,0.07)";
        btn.style.boxShadow = active
          ? "0 0 26px -4px rgba(255,122,24,0.9)"
          : "0 10px 28px -8px rgba(60,40,90,0.5)";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/* ── left thumb: steer + turbo ── */}
      <div className="pointer-events-none absolute bottom-[calc(var(--safe-b)+4.5rem)] left-[calc(var(--safe-l)+1.25rem)] z-20 flex flex-col items-center gap-2.5">
        <div className="flex gap-2.5">
          <button aria-label="steer left" {...padHold("left")} className={`${roundBtn} h-16 w-16`}>
            <Icon name="caretLeft" size={26} />
          </button>
          <button aria-label="steer right" {...padHold("right")} className={`${roundBtn} h-16 w-16`}>
            <Icon name="caretRight" size={26} />
          </button>
        </div>
        <button
          ref={turboRef}
          aria-label="hold for turbo boost"
          {...turboHold}
          className="pointer-events-auto flex w-full touch-none select-none flex-col items-center gap-1 rounded-2xl border bg-white/90 px-3 py-2 text-[#4a3f55] shadow-lg backdrop-blur transition-transform active:scale-95"
          style={{ borderColor: "rgba(0,0,0,0.07)", boxShadow: "0 10px 28px -8px rgba(60,40,90,0.5)" }}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em]">
            <Icon name="bonk" size={14} className="text-[#ff9f43]" /> turbo
          </span>
          <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <span
              ref={tankRef}
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-[#ff7a18] via-[#ffb020] to-[#ffe08a]"
              style={{ transform: "scaleX(1)" }}
            />
          </span>
        </button>
      </div>

      {/* ── right thumb: hop-out ACT above the pedals ── */}
      <div className="pointer-events-none absolute bottom-[calc(var(--safe-b)+4.5rem)] right-[calc(var(--safe-r)+2.25rem)] z-20 flex w-[76px] flex-col items-center gap-3">
        <div className="relative h-[76px] w-[76px]">
          {action ? (
            <button
              key={action.key}
              {...interaction.bind}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={action.prompt}
              style={{ boxShadow: `0 10px 28px -8px ${action.glow}`, borderColor: action.glow }}
              className="animate-pop-in pointer-events-auto relative flex h-full w-full touch-manipulation select-none items-center justify-center rounded-full border-2 bg-white/95 text-[#3d3347] backdrop-blur transition-transform [-webkit-touch-callout:none] active:scale-90"
            >
              <span key={interaction.pulse} className={`flex flex-col items-center ${interaction.pulse ? "animate-act-press" : ""}`}>
                <Icon name={action.icon} size={26} />
                <span className="mt-1 text-[9px] font-black uppercase tracking-[0.16em]">act</span>
                <span className="max-w-[62px] truncate text-[8px] font-bold uppercase tracking-wide text-[#8a7f98]">
                  {action.hold && interaction.holding ? "hold…" : action.label}
                </span>
              </span>
              {interaction.holding && <HoldRing glow={action.glow} width={6} />}
            </button>
          ) : (
            <span className="absolute inset-2 rounded-full border-2 border-dashed border-white/45" />
          )}
        </div>
        <button aria-label="drive forward" {...padHold("up")} className={`${roundBtn} h-14 w-14`}>
          <Icon name="caretUp" size={24} />
        </button>
        <button aria-label="reverse" {...padHold("down")} className={`${roundBtn} h-14 w-14`}>
          <Icon name="caretDown" size={24} />
        </button>
      </div>
    </>
  );
}
