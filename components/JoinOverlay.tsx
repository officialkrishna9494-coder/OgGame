"use client";

// ─── Cozy Hall · join form — nickname + tailored look ────────────────────────
// Pick a display name, a look (gentleman / lady) and the clothing color.
// Saved to the local profile so the next visit walks in wearing the same.

import { useState } from "react";
import { OUTFIT_DEFAULT_COLOR, resolveHairstyle, type HairstyleId, type OutfitId } from "../lib/hall-types";
import { loadStoredProfile } from "../lib/auth";
import { Icon } from "./icons";
import OutfitPicker from "./OutfitPicker";

interface Props {
  roomName: string;
  tagline: string;
  onJoin: (name: string, color: string, outfit: OutfitId, hairstyle: HairstyleId) => void;
}

export default function JoinOverlay({ roomName, tagline, onJoin }: Props) {
  const [stored] = useState(loadStoredProfile);
  const [name, setName] = useState(stored.name ?? "");
  const [outfit, setOutfit] = useState<OutfitId>(stored.outfit ?? "suit");
  const [hairstyle, setHairstyle] = useState<HairstyleId>(resolveHairstyle(stored.outfit ?? "suit", stored.hairstyle));
  const [color, setColor] = useState(stored.color ?? OUTFIT_DEFAULT_COLOR[stored.outfit ?? "suit"]);

  const join = () => {
    const clean = name.trim().slice(0, 14);
    if (clean) onJoin(clean, color, outfit, resolveHairstyle(outfit, hairstyle));
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#f6efe6]/60 p-4 backdrop-blur-[6px]">
      <div className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-[560px] overflow-y-auto rounded-[28px] border border-white/70 bg-white/85 p-5 sm:p-6 text-center shadow-[0_24px_70px_-20px_rgba(120,90,140,0.35)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a08fb5]">private hall · 5–10 friends</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#3d3347]">{roomName}</h1>
        <p className="mt-1 text-sm text-[#8a7f98]">{tagline}</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
          placeholder="pick a nickname…"
          maxLength={14}
          autoFocus
          className="mt-3 w-full rounded-2xl border border-[#e8dcc8] bg-[#fffaf2] px-4 py-3 text-center text-[15px] font-semibold text-[#3d3347] outline-none placeholder:font-normal placeholder:text-[#b9abcb] focus:border-[#ff8fab] focus:ring-4 focus:ring-[#ff8fab]/15"
        />

        <div className="mt-4">
          <OutfitPicker outfit={outfit} color={color} hairstyle={hairstyle} onHairstyle={setHairstyle} onOutfit={setOutfit} onColor={setColor} />
        </div>

        <button
          disabled={!name.trim()}
          onClick={join}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3d3347] py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#2e2735] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
        >
          step inside <Icon name="arrowRight" size={17} />
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-[#a99cbb]">
          WASD / arrows to wander · space to hop · E to interact
          <br />
          hop in a kart with E, then the same keys drive it · space for turbo
          <br />
          on mobile: joystick to move, hop to jump, ACT to interact
        </p>
      </div>
    </div>
  );
}
