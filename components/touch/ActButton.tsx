// ─── Cozy Hall · ActButton (contextual ACT circle, mobile) ───────────────────
// The single contextual action — same resolver the desktop dock and the 3D
// prompt use — as a big right-thumb circle. Shared by the on-foot column
// (above JUMP) and the car hub (above the pedals), so the two can never
// drift apart. Renders a dashed ghost when there is nothing to do, marking
// where the next action will appear (stable muscle memory).

"use client";

import type { InteractAction } from "../../lib/interaction";
import type { Interaction } from "../../lib/useInteraction";
import { Icon } from "../icons";
import { HoldRing } from "../InteractPrompt";

export default function ActButton({ action, interaction }: { action: InteractAction | null; interaction: Interaction }) {
  return (
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
        <span aria-hidden="true" className="absolute inset-2 rounded-full border-2 border-dashed border-white/45" />
      )}
    </div>
  );
}
