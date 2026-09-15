"use client";

// ─── Cozy Hall · fullscreen controls (mobile) ───────────────────────────────
// FullscreenToggle — expand / collapse icon for the HUD's top-right corner.
// FullscreenNudge  — small once-per-visit pill: "go fullscreen", or on
//                    iPhone, how to add the hall to the home screen.

import type { FullscreenOffer } from "../lib/fullscreen";
import { Icon } from "./icons";

export function FullscreenToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? "exit fullscreen" : "go fullscreen"}
      aria-label={active ? "exit fullscreen" : "go fullscreen"}
      className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/85 text-[#3d3347] shadow-lg ring-1 ring-black/[0.06] backdrop-blur transition-transform active:scale-90"
    >
      <Icon name={active ? "exitFullscreen" : "fullscreen"} size={17} />
    </button>
  );
}

export function FullscreenNudge({
  offer,
  onGo,
  onDismiss,
}: {
  offer: Exclude<FullscreenOffer, null>;
  onGo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="animate-pop-in pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-[#3d3347]/92 py-1 pl-3 pr-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
      {offer === "fullscreen" ? (
        <>
          <span className="truncate">best played fullscreen</span>
          <button
            onClick={onGo}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#3d3347] active:scale-95"
          >
            <Icon name="fullscreen" size={12} /> go
          </button>
        </>
      ) : (
        <span className="flex min-w-0 items-center gap-1 truncate">
          <Icon name="share" size={13} /> tap <b>Share</b>, then <b>Add to Home Screen</b>
        </span>
      )}
      <button
        onClick={onDismiss}
        aria-label="dismiss"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 active:scale-90"
      >
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}
