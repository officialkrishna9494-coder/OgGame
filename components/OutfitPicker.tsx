"use client";

import { OUTFITS, OUTFIT_COLORS, HAIRSTYLES, resolveHairstyle, type HairstyleId, type OutfitId } from "../lib/hall-types";
import AvatarPreview from "./AvatarPreview";

const COLOR_NAMES = ["Midnight", "Plum", "Burgundy", "Forest", "Cognac", "Ink", "Blush", "Rose", "Lavender", "Lagoon", "Ivory", "Marigold"];

interface Props {
  outfit: OutfitId;
  color: string;
  hairstyle: HairstyleId;
  onHairstyle: (style: HairstyleId) => void;
  onOutfit: (o: OutfitId) => void;
  onColor: (c: string) => void;
}

export default function OutfitPicker({ outfit, color, hairstyle, onHairstyle, onOutfit, onColor }: Props) {
  const selectedHair = resolveHairstyle(outfit, hairstyle);
  const selectedColor = OUTFIT_COLORS.findIndex(c => c.toLowerCase() === color.toLowerCase());
  return (
    <div className="sm:grid sm:grid-cols-[1fr_1.08fr] sm:items-start sm:gap-4">
      <AvatarPreview outfit={outfit} color={color} hairstyle={selectedHair} />
      <div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0" role="group" aria-label="Character style">
        {OUTFITS.map(o => (
          <button key={o.id} type="button" onClick={() => onOutfit(o.id)} aria-pressed={outfit === o.id}
            className={`relative rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c739d] ${outfit === o.id ? "border-[#84708f] bg-[#f0ebf4]" : "border-[#e8e0dc] bg-white/70 hover:bg-[#f8f4ef]"}`}>
            <span className="block text-[12px] font-bold text-[#46394e]">{o.label}</span>
            <span className="block text-[10px] text-[#8c7e92]">{o.hint}</span>
            {outfit === o.id && <span aria-hidden="true" className="absolute right-2.5 top-2.5 text-xs text-[#786084]">✓</span>}
          </button>
        ))}
      </div>
      <p className="mb-2 mt-4 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c7e92]">Hairstyle</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Hairstyle">
        {HAIRSTYLES[outfit].map(style => (
          <button key={style.id} type="button" onClick={() => onHairstyle(style.id)} aria-pressed={selectedHair === style.id}
            className={`min-h-10 rounded-lg border px-1 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c739d] ${selectedHair === style.id ? "border-[#84708f] bg-[#f0ebf4] text-[#46394e]" : "border-[#e8e0dc] bg-white/70 text-[#8c7e92] hover:bg-[#f8f4ef]"}`}>
            {style.label}
          </button>
        ))}
      </div>
      <div className="mb-2 mt-4 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c7e92]">Outfit color</p>
        <span className="text-[11px] text-[#75657e]">{selectedColor >= 0 ? COLOR_NAMES[selectedColor] : "Custom"}</span>
      </div>
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Outfit color">
        {OUTFIT_COLORS.map((c, i) => (
          <button key={c} type="button" onClick={() => onColor(c)} aria-label={COLOR_NAMES[i]} aria-pressed={selectedColor === i} title={COLOR_NAMES[i]}
            className="flex h-10 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-[#8c739d]">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110 ${selectedColor === i ? "ring-2 ring-[#756080] ring-offset-[3px] ring-offset-[#fffdfb]" : ""}`} style={{ background: c }}>
              {selectedColor === i && <span aria-hidden="true" className="text-xs font-bold" style={{ color: i >= 6 && i !== 7 ? "#3d3347" : "#fffaf2" }}>✓</span>}
            </span>
          </button>
        ))}
      </div>
      <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-[#e8e0dc] bg-white/70 px-3 py-2 text-[11px] text-[#88788f]">
        <span>Or pick your own color</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase">{color}</span>
          <input type="color" value={color} onInput={e => onColor(e.currentTarget.value)} onChange={e => onColor(e.target.value)} aria-label="Custom outfit color" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" />
        </span>
      </label>
      </div>
    </div>
  );
}
