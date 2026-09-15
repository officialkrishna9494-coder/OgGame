"use client";

// ─── Cozy Hall · HUD — one environment, everything within reach ─────────────
// Top: room pill + presence dots. Bottom: single rounded action dock.
// No pages, no menus — all social actions live here.

import { useState } from "react";
import { EMOTES } from "../lib/hall-types";
import type { PlayerState } from "../lib/hall-types";

interface Props {
  roomName: string;
  players: Record<string, PlayerState>;
  toasts: string[];
  sitting: boolean;
  nearName: string | null;
  tvOpen: boolean;
  tvTitle: string;
  simulated: boolean;
  photoUrl?: string;
  onSignOut?: () => void;
  onEmote: (e: string) => void;
  onPoke: () => void;
  onHighfive: () => void;
  onSit: () => void;
  onToss: () => void;
  onToggleTv: () => void;
}

export default function Hud(p: Props) {
  const [emoteOpen, setEmoteOpen] = useState(false);
  const others = Object.entries(p.players).filter(([id]) => id !== "me");
  const count = Object.keys(p.players).length;

  const btn =
    "flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-white/85 px-3.5 text-[13px] font-bold text-[#4a3f55] shadow-[0_6px_20px_-8px_rgba(90,70,110,0.4)] ring-1 ring-black/[0.06] backdrop-blur transition-all hover:bg-white active:scale-95 disabled:opacity-35 disabled:saturation-50";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
      {/* ── top bar ── */}
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/80 py-2 pl-3 pr-4 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-base">🏠</span>
          )}
          <div className="leading-tight">
            <p className="text-[13px] font-extrabold text-[#3d3347]">{p.roomName}</p>
            <p className="text-[11px] font-medium text-[#8a7f98]">
              {count} inside{p.simulated ? " · demo bots 🤖" : " · live"}
            </p>
          </div>
          {p.onSignOut && (
            <button
              onClick={p.onSignOut}
              title="sign out"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-[13px] transition-colors hover:bg-black/10"
            >
              ⏻
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex max-w-[46vw] flex-wrap items-center justify-end gap-1.5 rounded-2xl bg-white/70 px-2.5 py-2 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {others.slice(0, 8).map(([id, pl]) => (
            <span key={id} title={pl.name} className="flex h-7 items-center gap-1 rounded-full bg-white py-0.5 pl-1 pr-2 text-[11px] font-bold text-[#4a3f55] ring-1 ring-black/[0.06]">
              <span className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
              {pl.name.slice(0, 8)}
            </span>
          ))}
          {others.length === 0 && <span className="px-1 text-[11px] font-medium text-[#8a7f98]">just you… for now</span>}
        </div>
      </div>

      {/* ── toasts ── */}
      <div className="flex flex-col items-center gap-1.5">
        {p.toasts.map((t, i) => (
          <div key={`${t}-${i}`} className="animate-[floatUp_0.3s_ease-out] rounded-full bg-[#3d3347]/90 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg backdrop-blur">
            {t}
          </div>
        ))}
        {p.nearName && (
          <div className="rounded-full bg-[#ff8fab]/95 px-4 py-1.5 text-[12px] font-bold text-white shadow-lg">
            {p.nearName} is close — poke or high-five! ✋
          </div>
        )}
      </div>

      {/* ── bottom dock ── */}
      <div className="flex flex-col items-center gap-2 p-3 sm:p-4">
        {emoteOpen && (
          <div className="pointer-events-auto flex gap-1.5 rounded-2xl bg-white/90 p-2 shadow-xl ring-1 ring-black/[0.06] backdrop-blur">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  p.onEmote(e);
                  setEmoteOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-transform hover:scale-125 active:scale-95"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[22px] bg-[#3d3347]/10 p-1.5 backdrop-blur">
          <button className={btn} onClick={() => setEmoteOpen((v) => !v)} title="send emoji">
            <span className="text-base">😊</span> react
          </button>
          <button className={btn} onClick={p.onPoke} disabled={!p.nearName} title={p.nearName ? `poke ${p.nearName}` : "walk close to a friend"}>
            👉 poke
          </button>
          <button className={btn} onClick={p.onHighfive} disabled={!p.nearName} title={p.nearName ? `high-five ${p.nearName}` : "walk close to a friend"}>
            🙌 five
          </button>
          <button
            className={`${btn} ${p.sitting ? "!bg-[#3d3347] !text-white" : ""}`}
            onClick={p.onSit}
            title="sit on the sofa"
          >
            🛋️ {p.sitting ? "stand" : "sit"}
          </button>
          <button className={btn} onClick={p.onToss} title="toss the ball">
            ⚽ toss
          </button>
          <button
            className={`${btn} ${p.tvOpen ? "!bg-[#ff8fab] !text-white" : ""}`}
            onClick={p.onToggleTv}
            title="shared TV"
          >
            📺 {p.tvOpen ? "hide" : "tv"}
          </button>
        </div>
        <p className="max-w-[92vw] truncate text-[11px] font-medium text-[#3d3347]/50">
          {p.tvTitle ? `on the tv · ${p.tvTitle}` : "walk over the ball to pick it up · sit faces the tv"}
        </p>
      </div>
    </div>
  );
}
