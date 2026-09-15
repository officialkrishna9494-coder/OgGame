"use client";

import { useState } from "react";
import { AVATAR_COLORS } from "../lib/hall-types";

interface Props {
  roomName: string;
  tagline: string;
  onJoin: (name: string, color: string) => void;
}

export default function JoinOverlay({ roomName, tagline, onJoin }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(() => AVATAR_COLORS[3]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#f6efe6]/60 p-4 backdrop-blur-[6px]">
      <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white/85 p-7 text-center shadow-[0_24px_70px_-20px_rgba(120,90,140,0.35)]">
        {/* mini avatar preview */}
        <div className="mx-auto -mt-16 mb-3 flex h-20 w-20 items-center justify-center">
          <div
            className="relative h-20 w-20 rounded-full shadow-lg transition-colors"
            style={{ background: `radial-gradient(circle at 32% 28%, #ffffffcc, transparent 42%), ${color}` }}
          >
            <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 gap-2.5">
              <span className="block h-2.5 w-2.5 rounded-full bg-[#2b2430]" />
              <span className="block h-2.5 w-2.5 rounded-full bg-[#2b2430]" />
            </div>
            <div className="absolute left-1/2 top-[56%] h-2 w-4 -translate-x-1/2 rounded-b-full border-b-2 border-[#5b4a5e]" />
            <div className="absolute left-[16%] top-[52%] h-2.5 w-3.5 rounded-full bg-[#ff8fab]/60" />
            <div className="absolute right-[16%] top-[52%] h-2.5 w-3.5 rounded-full bg-[#ff8fab]/60" />
          </div>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a08fb5]">private hall · 5–10 friends</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#3d3347]">{roomName}</h1>
        <p className="mt-1 text-sm text-[#8a7f98]">{tagline}</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onJoin(name.trim().slice(0, 14), color);
          }}
          placeholder="pick a nickname…"
          maxLength={14}
          autoFocus
          className="mt-5 w-full rounded-2xl border border-[#e8dcc8] bg-[#fffaf2] px-4 py-3 text-center text-[15px] font-semibold text-[#3d3347] outline-none placeholder:font-normal placeholder:text-[#b9abcb] focus:border-[#ff8fab] focus:ring-4 focus:ring-[#ff8fab]/15"
        />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-[3px] ring-[#3d3347]/70 ring-offset-2 ring-offset-white" : "ring-1 ring-black/10"}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <button
          disabled={!name.trim()}
          onClick={() => onJoin(name.trim().slice(0, 14), color)}
          className="mt-5 w-full rounded-2xl bg-[#3d3347] py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#2e2735] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
        >
          step inside ✨
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-[#a99cbb]">
          WASD / arrows to wander · space to hop
          <br />
          drag on mobile to move
        </p>
      </div>
    </div>
  );
}
