"use client";

// ─── Cozy Hall · shared TV shelf (watch-party sync) ─────────────────────────
// One environment: the TV is a small corner shelf, never a separate page.
// Sync model: shared { video, playing, positionSec @ updatedAt }. Everyone
// computes target = position + elapsed-while-playing and seeks only when
// drift exceeds ~2.5s — smooth, no rebuffer fights. Anyone can drive; the
// server keeps an 800ms cooldown so competing presses don't war.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TvState } from "../lib/hall-types";

interface Props {
  tv: TvState;
  fallbackPlaylist: Array<{ id: string; title: string }>;
  compact?: boolean;
  onControl: (patch: Partial<TvState> & { seekTo?: number }) => void;
  onClose: () => void;
}

const DRIFT_TOLERANCE = 2.5;
const HEARTBEAT_MS = 15_000;

let apiPromise: Promise<typeof YT> | null = null;
function loadYTApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as unknown as { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function TvPanel({ tv, fallbackPlaylist, compact, onControl, onClose }: Props) {
  const playlist = tv.playlist.length ? tv.playlist : fallbackPlaylist;
  const cur = playlist[tv.index % Math.max(1, playlist.length)];
  const videoId = cur?.id ?? "";

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const ctlRef = useRef(onControl);
  const tvRef = useRef(tv);
  // windows that separate "I did this" from "the room did this" (echo guard)
  const applyingUntil = useRef(0);
  const lastLocalEmit = useRef(0);
  const lastT = useRef(0);
  const lastBeat = useRef(0);
  const [prog, setProg] = useState({ t: 0, d: 0 });
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    ctlRef.current = onControl;
    tvRef.current = tv;
  });

  const applyRemote = useCallback(() => {
    const player = playerRef.current;
    const state = tvRef.current;
    if (!player) return;
    if (Date.now() - lastLocalEmit.current < 1200) return; // our own echo
    let local = 0;
    try {
      local = player.getCurrentTime();
    } catch {
      return;
    }
    try {
      applyingUntil.current = Date.now() + 1200;
      if (state.playing) {
        try {
          player.playVideo();
        } catch {
          /* autoplay blocked until user taps — stays paused, still in sync on play */
        }
      } else {
        player.pauseVideo();
      }
      const target =
        (state.positionSec ?? 0) + (state.playing ? (Date.now() - state.updatedAt) / 1000 : 0);
      if (Math.abs(local - Math.max(0, target)) > DRIFT_TOLERANCE) {
        player.seekTo(Math.max(0, target), true);
      }
    } catch {
      /* player mid-swap — next tick retries */
    }
  }, []);

  // one player per video; recreated on video change
  useEffect(() => {
    if (!videoId || !mountRef.current) return;
    let player: YT.Player | null = null;
    let dead = false;
    loadYTApi()
      .then((YT) => {
        if (dead || !mountRef.current) return;
        player = new YT.Player(mountRef.current, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: { rel: 0 },
          events: {
            onReady: () => applyRemote(),
            onStateChange: (e) => {
              if (Date.now() < applyingUntil.current || !player) return;
              let t = 0;
              try {
                t = player.getCurrentTime();
              } catch {
                return;
              }
              if (e.data === YT.PlayerState.PLAYING) {
                lastLocalEmit.current = Date.now();
                lastT.current = t;
                ctlRef.current({ playing: true, positionSec: t });
              } else if (e.data === YT.PlayerState.PAUSED) {
                lastLocalEmit.current = Date.now();
                lastT.current = t;
                ctlRef.current({ playing: false, positionSec: t });
              } else if (e.data === YT.PlayerState.ENDED) {
                const s = tvRef.current;
                const len = Math.max(1, (s.playlist.length ? s.playlist : fallbackPlaylist).length);
                ctlRef.current({ index: (s.index + 1) % len, playing: true, positionSec: 0 });
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => setApiFailed(true));
    return () => {
      dead = true;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      if (playerRef.current === player) playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // apply room state → player (drift-corrected, echo-guarded)
  useEffect(() => {
    applyRemote();
  }, [tv.index, tv.playing, tv.positionSec, tv.updatedAt, videoId, applyRemote]);

  // poll: user-seek detection + heartbeat anchor + progress readout
  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      let t = 0;
      let d = 0;
      try {
        t = player.getCurrentTime();
        d = player.getDuration() ?? 0;
      } catch {
        return;
      }
      setProg({ t, d });
      if (Date.now() < applyingUntil.current) {
        lastT.current = t;
        return;
      }
      const jumped = Math.abs(t - lastT.current) > DRIFT_TOLERANCE;
      lastT.current = t;
      const now = Date.now();
      if (jumped && now - lastLocalEmit.current > 1500) {
        lastLocalEmit.current = now;
        lastBeat.current = now;
        ctlRef.current({ seekTo: t });
      } else if (tvRef.current.playing && now - lastBeat.current > HEARTBEAT_MS) {
        lastBeat.current = now;
        ctlRef.current({ positionSec: t });
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const togglePlay = () => {
    const player = playerRef.current;
    const state = tvRef.current;
    let playing = !state.playing;
    try {
      if (player) {
        const s = player.getPlayerState();
        if (s === 1) {
          player.pauseVideo();
          playing = false;
        } else {
          player.playVideo();
          playing = true;
        }
      }
    } catch {
      /* fall through to state flip */
    }
    let t = state.positionSec ?? 0;
    try {
      t = player?.getCurrentTime() ?? t;
    } catch {
      /* keep last */
    }
    lastLocalEmit.current = Date.now();
    lastBeat.current = Date.now();
    ctlRef.current({ playing, positionSec: t });
  };

  const changeVideo = (index: number) => {
    ctlRef.current({ index, playing: true, positionSec: 0 });
  };

  return (
    <div
      className={`pointer-events-auto absolute z-20 overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "bottom-[calc(var(--safe-b)+0.5rem)] left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,430px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between bg-[#3d3347] px-4 py-2.5 text-white">
        <p className="text-[13px] font-bold">📺 shared tv {tv.playing ? "· playing" : "· paused"}</p>
        <button onClick={onClose} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/25">
          hide
        </button>
      </div>
      {videoId ? (
        <div ref={mountRef} className="aspect-video w-full bg-black [&>iframe]:h-full [&>iframe]:w-full" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-black p-4 text-center text-[12px] text-white/70">
          no videos yet — add some from room setup 🎬
        </div>
      )}
      {apiFailed && (
        <p className="bg-[#ffe4e4] px-3 py-1.5 text-[11px] font-semibold text-[#b03939]">
          YouTube didn&apos;t load (ad-blocker?). Whitelist youtube.com and reopen 📺
        </p>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={togglePlay}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff8fab] text-white shadow transition-transform hover:scale-105 active:scale-95"
          title={tv.playing ? "pause for everyone" : "play for everyone"}
        >
          {tv.playing ? "❚❚" : "▶"}
        </button>
        <button
          onClick={() => changeVideo((tv.index + playlist.length - 1) % playlist.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe8f7] text-[#4a3f55] transition-transform hover:scale-105 active:scale-95"
          title="previous"
        >
          ⏮
        </button>
        <button
          onClick={() => changeVideo((tv.index + 1) % playlist.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe8f7] text-[#4a3f55] transition-transform hover:scale-105 active:scale-95"
          title="next for everyone"
        >
          ⏭
        </button>
        <p className="ml-1 min-w-0 flex-1 truncate text-[12px] font-semibold text-[#4a3f55]">{cur?.title}</p>
      </div>
      <div className="flex items-center gap-2 px-4 pb-1">
        <span className="relative flex h-2 w-2">
          <span className={`absolute h-full w-full rounded-full ${tv.playing ? "animate-ping bg-green-400" : "bg-black/15"}`} />
          <span className={`h-2 w-2 rounded-full ${tv.playing ? "bg-green-500" : "bg-black/20"}`} />
        </span>
        <p className="text-[11px] font-bold tabular-nums text-[#8a7f98]">
          {fmt(prog.t)}{prog.d > 0 ? ` / ${fmt(prog.d)}` : ""} · synced
        </p>
      </div>
      {!compact && (
        <div className="max-h-28 overflow-y-auto border-t border-black/[0.06] px-3 py-2">
          {playlist.map((v, i) => (
            <button
              key={`${v.id}-${i}`}
              onClick={() => changeVideo(i)}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors hover:bg-[#f6efe6] ${i === tv.index % playlist.length ? "bg-[#ffe9f0] font-bold text-[#c2437b]" : "text-[#4a3f55]"}`}
            >
              <span className="w-4 shrink-0 text-center">{i === tv.index % playlist.length ? "▶" : `${i + 1}`}</span>
              <span className="truncate">{v.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
