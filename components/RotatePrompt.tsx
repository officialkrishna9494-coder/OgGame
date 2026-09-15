"use client";

// ─── Cozy Hall · rotate prompt ─────────────────────────────────────────────
// Portrait phones get a friendly full-screen nudge. Visibility is pure CSS
// (#rotate-prompt media query in globals.css) so it works before React
// hydrates and never touches desktop.

export default function RotatePrompt() {
  return (
    <div id="rotate-prompt">
      <div className="phone-tilt text-6xl">📱</div>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#3d3347]">rotate your phone</h2>
      <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-[#8a7f98]">
        Cozy Hall plays best in landscape — joystick on the right, actions on the left 🤝
      </p>
      <div className="mt-4 flex items-center gap-3 text-[11px] font-bold text-[#a08fb5]">
        <span className="rounded-full bg-white/80 px-3 py-1.5 shadow ring-1 ring-black/[0.06]">🕹️ right · move</span>
        <span className="rounded-full bg-white/80 px-3 py-1.5 shadow ring-1 ring-black/[0.06]">✨ left · act</span>
      </div>
    </div>
  );
}
