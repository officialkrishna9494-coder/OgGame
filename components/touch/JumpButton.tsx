// ─── Cozy Hall · JumpButton (mobile SPACE, on-foot only) ─────────────────────
// The round button under ACT on the right thumb column IS the desktop
// spacebar: same `hallJump` handoff the 3D loop reads, fired on press (not
// on click) so the hop feels instant while the left thumb still steers.
// Momentary (no held flag to stick), with pointer capture + haptic shared
// with every other touch button. Never rendered while driving — the car hub
// owns the right column there.

"use client";

import { useMemo } from "react";
import { hallJump } from "../HallScene";
import { Icon } from "../icons";
import { holdHandlers } from "../../lib/touch-input";
import TouchButton from "./TouchButton";

export default function JumpButton() {
  const hold = useMemo(
    () =>
      holdHandlers(() => {}, {
        onTap: () => hallJump.fn?.(),
        haptic: true,
      }),
    []
  );
  return (
    <TouchButton
      hold={hold}
      size="sm"
      aria-label="jump"
      title="jump (space)"
    >
      <span className="flex flex-col items-center leading-none">
        <Icon name="caretUp" size={24} />
        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7f98]">jump</span>
      </span>
    </TouchButton>
  );
}
