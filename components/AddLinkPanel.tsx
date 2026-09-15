"use client";

// ─── Cozy Hall · add-to-shelf popup ─────────────────────────────────────────
// Anyone standing near the TV can paste ONE YouTube link. Title resolves via
// oEmbed (no API key); falls back to a friendly placeholder.

import { useState } from "react";
import { extractYouTubeId, fetchVideoTitle } from "../lib/youtube";
import { Icon } from "./icons";

interface Props {
  onAdd: (videoId: string, title: string) => void;
  onClose: () => void;
}

export default function AddLinkPanel({ onAdd, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id = extractYouTubeId(url);
    if (!id) {
      setError("that doesn't look like a YouTube link — try a watch / shorts / youtu.be link");
      return;
    }
    setBusy(true);
    setError(null);
    const title = (await fetchVideoTitle(id)) ?? "shared video";
    setBusy(false);
    onAdd(id, title);
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#3d3347]/30 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="animate-pop-in w-full max-w-xs rounded-[24px] border border-white/70 bg-white/95 p-5 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ffe9f0] text-[#c2437b]">
          <Icon name="addLink" size={24} />
        </div>
        <h2 className="mt-1 text-lg font-extrabold text-[#3d3347]">add to the shelf</h2>
        <p className="mt-0.5 text-[12px] text-[#8a7f98]">one link per add — it plays for everyone</p>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="paste a YouTube link…"
          autoFocus
          inputMode="url"
          className="mt-3 w-full rounded-2xl border border-[#e8dcc8] bg-[#fffaf2] px-4 py-2.5 text-[13px] font-medium text-[#3d3347] outline-none placeholder:text-[#b9abcb] focus:border-[#ff8fab] focus:ring-4 focus:ring-[#ff8fab]/15"
        />
        {error && (
          <p className="mt-2 flex items-start justify-center gap-1.5 text-[12px] font-semibold text-[#b03939]">
            <Icon name="search" size={14} className="mt-px" /> {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl bg-black/[0.06] py-2.5 text-[13px] font-bold text-[#4a3f55] transition-transform hover:bg-black/10 active:scale-[0.98]"
          >
            cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !url.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#3d3347] py-2.5 text-[13px] font-bold text-white shadow-lg transition-transform hover:bg-[#2e2735] active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? (
              "adding…"
            ) : (
              <>
                <Icon name="check" size={15} /> add
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
