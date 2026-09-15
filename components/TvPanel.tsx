"use client";

// ─── Cozy Hall · shared TV shelf ────────────────────────────────────────────
// One environment: the TV is a small corner shelf, never a separate page.
// Everyone's play / pause / skip syncs over Socket.io (`hall:tv`).

import type { TvState } from "../lib/hall-types";

interface Props {
  tv: TvState;
  fallbackPlaylist: Array<{ id: string; title: string }>;
  onControl: (patch: Partial<TvState>) => void;
  onClose: () => void;
}

export default function TvPanel({ tv, fallbackPlaylist, onControl, onClose }: Props) {
  const playlist = tv.playlist.length ? tv.playlist : fallbackPlaylist;
  const cur = playlist[tv.index % Math.max(1, playlist.length)];

  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 z-20 w-[min(94vw,430px)] -translate-x-1/2 overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="flex items-center justify-between bg-[#3d3347] px-4 py-2.5 text-white">
        <p className="text-[13px] font-bold">📺 shared tv {tv.playing ? "· playing" : "· paused"}</p>
        <button onClick={onClose} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/25">
          hide
        </button>
      </div>
      {cur && (
        <div className="aspect-video w-full bg-black">
          <iframe
            key={`${cur.id}-${tv.index}`}
            src={`https://www.youtube.com/embed/${cur.id}?rel=0`}
            title={cur.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => onControl({ playing: !tv.playing })}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff8fab] text-white shadow transition-transform hover:scale-105 active:scale-95"
          title={tv.playing ? "pause for everyone" : "play for everyone"}
        >
          {tv.playing ? "❚❚" : "▶"}
        </button>
        <button
          onClick={() => onControl({ index: (tv.index + playlist.length - 1) % playlist.length })}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe8f7] text-[#4a3f55] transition-transform hover:scale-105 active:scale-95"
          title="previous"
        >
          ⏮
        </button>
        <button
          onClick={() => onControl({ index: (tv.index + 1) % playlist.length })}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe8f7] text-[#4a3f55] transition-transform hover:scale-105 active:scale-95"
          title="next for everyone"
        >
          ⏭
        </button>
        <p className="ml-1 min-w-0 flex-1 truncate text-[12px] font-semibold text-[#4a3f55]">{cur?.title}</p>
      </div>
      <div className="max-h-28 overflow-y-auto border-t border-black/[0.06] px-3 py-2">
        {playlist.map((v, i) => (
          <button
            key={`${v.id}-${i}`}
            onClick={() => onControl({ index: i, playing: true })}
            className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors hover:bg-[#f6efe6] ${i === tv.index % playlist.length ? "bg-[#ffe9f0] font-bold text-[#c2437b]" : "text-[#4a3f55]"}`}
          >
            <span className="w-4 shrink-0 text-center">{i === tv.index % playlist.length ? "▶" : `${i + 1}`}</span>
            <span className="truncate">{v.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
