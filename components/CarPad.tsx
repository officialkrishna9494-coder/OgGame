// ─── Cozy Hall · mobile car hub (driving only) ───────────────────────────────
// Console racing thumbs, built from the shared touch primitives:
//
//   LEFT thumb ........ straight ▲▼ pedals + round TURBO (ring meter, hold to
//                      boost — TURBO alone also drives forward like a held ▲)
//   RIGHT thumb ....... steer ◀ ▶ below the hop-out ACT
//   TOP-RIGHT ......... ⋯ menu (all other actions — lives in Hud, untouched)
//
// Buttons write the drivePad / turboState singletons with per-button pointer
// capture, so two thumbs never clobber each other and a slide-off always
// releases. `useReleaseOnHide` clears every flag when the tab backgrounds.
// Desktop never renders this — keyboard stays the only input there.

"use client";

import { useCallback, useMemo } from "react";
import { drivePad, resetDrivePad, type DrivePadKey } from "../lib/drive-pad";
import type { InteractAction } from "../lib/interaction";
import type { Interaction } from "../lib/useInteraction";
import { turboState } from "../lib/turbo-state";
import { holdHandlers, useReleaseOnHide } from "../lib/touch-input";
import { Icon } from "./icons";
import TouchButton from "./touch/TouchButton";
import ActButton from "./touch/ActButton";
import TurboButton from "./touch/TurboButton";

function usePadHold(key: DrivePadKey) {
  return useMemo(
    () =>
      holdHandlers((held) => {
        // singleton handoff (same as joy-state/turbo-state): the 3D loop
        // reads drivePad every frame, React never re-renders on it.
        // eslint-disable-next-line react-hooks/immutability
        drivePad[key] = held;
      }),
    [key]
  );
}

export default function CarPad({ action, interaction }: { action: InteractAction | null; interaction: Interaction }) {
  const releaseAll = useCallback(() => {
    resetDrivePad();
    turboState.held = false;
  }, []);
  useReleaseOnHide(releaseAll);

  const leftHold = usePadHold("left");
  const rightHold = usePadHold("right");
  const upHold = usePadHold("up");
  const downHold = usePadHold("down");

  return (
    <>
      {/* ── left thumb: straight ▲▼ pedals + round TURBO ──
          ▲ over ▼ in one straight column (muscle memory never hunts); the
          round TURBO sits beside the column, centred, so it reads as one
          pedal cluster. TURBO alone also drives forward (like a held ▲). */}
      <div className="pointer-events-none absolute bottom-[calc(var(--safe-b)+4.5rem)] left-[calc(var(--safe-l)+1.25rem)] z-20 flex flex-row items-center gap-2.5">
        <div className="flex flex-col items-center gap-2.5">
          <TouchButton hold={upHold} size="sm" aria-label="drive forward" title="drive forward">
            <Icon name="caretUp" size={24} />
          </TouchButton>
          <TouchButton hold={downHold} size="sm" aria-label="reverse" title="reverse">
            <Icon name="caretDown" size={24} />
          </TouchButton>
        </div>
        <TurboButton />
      </div>

      {/* ── right thumb: hop-out ACT above steer ◀ ▶ ── */}
      <div className="pointer-events-none absolute bottom-[calc(var(--safe-b)+4.5rem)] right-[calc(var(--safe-r)+1.25rem)] z-20 flex flex-col items-center gap-2.5">
        <ActButton action={action} interaction={interaction} />
        <div className="flex gap-2.5">
          <TouchButton hold={leftHold} size="md" aria-label="steer left" title="steer left">
            <Icon name="caretLeft" size={26} />
          </TouchButton>
          <TouchButton hold={rightHold} size="md" aria-label="steer right" title="steer right">
            <Icon name="caretRight" size={26} />
          </TouchButton>
        </div>
      </div>
    </>
  );
}
