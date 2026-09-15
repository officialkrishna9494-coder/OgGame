"use client";

// ─── Cozy Hall · emergency alarm overlay ────────────────────────────────────
// Red blinking wash + center dialog naming the raiser. Auto-dismisses after
// 3s; the dismiss button lets anyone clear it sooner.

import { useEffect, useState } from "react";
import { Icon } from "./icons";

interface Props {
  name: string;
  onClose: () => void;
}

export default function SosAlert({ name, onClose }: Props) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setGone(true), 3000);
    return () => window.clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className="animate-sos-flash absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="animate-pop-in pointer-events-auto w-full max-w-xs rounded-[24px] border-2 border-[#ff3b3b] bg-white/95 p-5 text-center shadow-[0_0_60px_-10px_rgba(255,59,59,0.7)]">
          <div className="flex animate-pulse justify-center text-[#e02424]">
            <Icon name="sos" size={44} />
          </div>
          <h2 className="mt-1 text-lg font-black tracking-tight text-[#b01212]">EMERGENCY SIGNAL</h2>
          <p className="mt-1 text-[13px] font-semibold text-[#4a3f55]">
            <b>{name}</b> needs everyone, right now!
          </p>
          <button
            onClick={onClose}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#b01212] py-2.5 text-[13px] font-bold text-white transition-transform hover:bg-[#8f0e0e] active:scale-[0.98]"
          >
            <Icon name="check" size={15} /> got it, stand down
          </button>
        </div>
      </div>
    </div>
  );
}
