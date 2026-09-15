"use client";

// ─── Cozy Hall · rotate prompt ─────────────────────────────────────────────
// Portrait phones get a friendly full-screen nudge. Visibility is pure CSS
// (#rotate-prompt media query in globals.css) so it works before React
// hydrates and never touches desktop.
// It also offers fullscreen — no browser bars — where the phone allows it
// (and turns the screen sideways on Android); iPhones get the home-screen tip.

import { markNudgeSeen, useFullscreen } from "../lib/fullscreen";
import { Icon, type IconName } from "./icons";

function Chip({ icon, children }: { icon: IconName; children: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 shadow ring-1 ring-black/[0.06]">
      <Icon name={icon} size={14} className="text-[#3d3347]" />
      {children}
    </span>
  );
}

export default function RotatePrompt() {
  const fs = useFullscreen();

  return (
    <div id="rotate-prompt">
      <div className="phone-tilt text-[#3d3347]">
        <Icon name="rotate" size={64} />
      </div>
      <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#3d3347]">rotate your phone</h2>
      <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-[#8a7f98]">
        Cozy Hall plays best in landscape — joystick on the left, actions on the right.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-[#8a7f98]">
        <Chip icon="joystick">left · move</Chip>
        <Chip icon="tap">right · act</Chip>
        <Chip icon="zoom">pinch · zoom</Chip>
      </div>

      {fs.offer === "fullscreen" && (
        <>
          <button
            onClick={() => {
              void fs.enter(); // first: needs the tap's user activation
              markNudgeSeen();
            }}
            className="mt-6 flex items-center gap-2 rounded-2xl bg-[#3d3347] px-6 py-3.5 text-[15px] font-extrabold text-white shadow-[0_12px_30px_-10px_rgba(61,51,71,0.6)] transition-transform active:scale-95"
          >
            <Icon name="fullscreen" size={18} /> play fullscreen
          </button>
          <p className="mt-2 max-w-[260px] text-[11px] font-medium leading-relaxed text-[#a99cbb]">
            hides the browser bars for the full-size hall
          </p>
        </>
      )}

      {fs.offer === "homescreen" && (
        <div className="mt-6 max-w-[280px] rounded-2xl bg-white/85 px-4 py-3 text-left text-[12px] leading-relaxed text-[#4a3f55] shadow ring-1 ring-black/[0.06]">
          <p className="flex items-center gap-1.5 font-extrabold text-[#3d3347]">
            <Icon name="fullscreen" size={14} /> want it fullscreen?
          </p>
          <p className="mt-0.5">
            tap <b>Share</b> <Icon name="share" size={12} className="inline align-[-1px]" />, then <b>Add to Home Screen</b> —
            Cozy Hall opens like an app, with no browser bars.
          </p>
        </div>
      )}
    </div>
  );
}
