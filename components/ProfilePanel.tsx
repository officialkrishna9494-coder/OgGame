"use client";

// ─── Cozy Hall · profile editor — name, look and clothing color ──────────────
// Opens from the HUD ("you" button). Saving applies instantly on every
// screen: the server relays the new identity live, no rejoin, no respawn.

import { useState } from "react";
import { resolveHairstyle, type HairstyleId, type OutfitId } from "../lib/hall-types";
import { Icon } from "./icons";
import OutfitPicker from "./OutfitPicker";

export interface ProfileValue {
  name: string;
  color: string;
  outfit: OutfitId;
  hairstyle: HairstyleId;
}

interface Props {
  initial: ProfileValue;
  onSave: (p: ProfileValue) => void;
  onClose: () => void;
}

export default function ProfilePanel({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial.name);
  const [outfit, setOutfit] = useState<OutfitId>(initial.outfit);
  const [hairstyle, setHairstyle] = useState<HairstyleId>(resolveHairstyle(initial.outfit, initial.hairstyle));
  const [color, setColor] = useState(initial.color);

  const save = () => {
    const clean = name.trim().slice(0, 14);
    if (clean) onSave({ name: clean, color, outfit, hairstyle: resolveHairstyle(outfit, hairstyle) });
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#2b2430]/35 p-4 backdrop-blur-[3px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="edit profile"
    >
      <div
        className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-[560px] overflow-y-auto rounded-[20px] border border-black/10 bg-white p-5 sm:p-6 text-center shadow-[0_24px_70px_-24px_rgba(30,25,40,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a08fb5]">your look</p>
          <button
            onClick={onClose}
            aria-label="close profile"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-[#4a3f55] transition-colors hover:bg-black/10"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onClose();
          }}
          placeholder="display name…"
          maxLength={14}
          autoFocus
          className="mt-3 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-center text-[15px] font-semibold text-[#3d3347] outline-none transition-colors placeholder:font-normal placeholder:text-[#b9abcb] focus:border-[#4a3f55] focus:ring-2 focus:ring-black/[0.06]"
        />
        <p className="mt-1.5 text-[11px] text-[#a99cbb]">friends see this name floating over you</p>

        <div className="mt-4">
          <OutfitPicker outfit={outfit} color={color} hairstyle={hairstyle} onHairstyle={setHairstyle} onOutfit={setOutfit} onColor={setColor} />
        </div>

        <button
          disabled={!name.trim()}
          onClick={save}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3d3347] py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-[#2e2735] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon name="check" size={17} /> wear it
        </button>
      </div>
    </div>
  );
}
