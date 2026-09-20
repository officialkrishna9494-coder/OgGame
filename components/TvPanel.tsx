"use client";

// ─── Cozy Hall · shared TV shelf (watch-party sync) ─────────────────────────
// One environment: the TV is a small corner shelf, never a separate page.
// Sync model: shared { video, playing, positionSec @ updatedAt }. Everyone
// computes target = position + elapsed-while-playing and seeks only when
// drift exceeds ~2.5s — smooth, no rebuffer fights. Anyone can drive; the
// server keeps an 800ms cooldown so competing presses don't war.
//
// The shelf is controls first: play / pause, previous / next and the shelf list
// drive the room without any iframe of its own, and a small button opens the
// full YouTube player here — native controls, so scrub, fast-forward and
// fullscreen are yours, with any seek relayed back to the room. Sound follows
// the screen you are watching: the wall TV speaks by default, this player takes
// over while it is open (never both — see lib/tv-audio.ts).
//
// The player exists ONLY while it is open. Closing the shelf's screen destroys
// it, so a closed panel is nothing but controls: no hidden embed streaming, no
// stray audio, nothing that can cover the buttons.
//
// Two rules keep it from wedging the tab (both learned the hard way):
//  · The widget API REPLACES the element it is given with its iframe, so the
//    host node is created here, inside a wrapper React only ever renders empty.
//    Rebuilding on a React-rendered node leaves a stale ref pointing at a node
//    no longer in the document — every rebuild then spawns an off-document
//    player, and the browser floods YouTube with embed requests.
//  · The player is created once per open and NEVER rebuilt on a video change:
//    videos are swapped with loadVideoById / cueVideoById. Rebuilding per video
//    is what turned one "next" press into an endless embed-request storm.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TvState } from "../lib/hall-types";
import { loadYouTubeApi } from "../lib/youtube";
import { Icon } from "./icons";

interface Props {
  tv: TvState;
  fallbackPlaylist: Array<{ id: string; title: string }>;
  compact?: boolean;
  /** the shelf's own player is open — it then owns the room's sound */
  playerOpen: boolean;
  onTogglePlayer: () => void;
  /** this viewer hears the room */
  audio: boolean;
  onToggleAudio: () => void;
  onControl: (patch: Partial<TvState> & { seekTo?: number }) => void;
  onClose: () => void;
}

const DRIFT_TOLERANCE = 2.5;
const HEARTBEAT_MS = 15_000;
/** while the shelf's screen is open it re-reads the room on this beat —
 *  nothing else corrects a player that started on its own or stalled */
const RESYNC_MS = 4_000;
/** a player younger than this cannot have finished a video — it is still
 *  loading, so an ENDED from it must never walk the shelf forward */
const LOAD_GRACE_MS = 3_000;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function TvPanel({
  tv,
  fallbackPlaylist,
  compact,
  playerOpen,
  onTogglePlayer,
  audio,
  onToggleAudio,
  onControl,
  onClose,
}: Props) {
  const playlist = tv.playlist.length ? tv.playlist : fallbackPlaylist;
  const cur = playlist[tv.index % Math.max(1, playlist.length)];
  const videoId = cur?.id ?? "";

  /** React's node. Deliberately always empty: the embed lives in a child we
   *  create ourselves, so the widget API never consumes a node React renders. */
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  /** the video the player currently holds (null = nothing loaded yet) */
  const loadedRef = useRef<string | null>(null);
  const curIdRef = useRef(videoId);
  const loadAtRef = useRef(0);
  const ctlRef = useRef(onControl);
  const tvRef = useRef(tv);
  const audioRef = useRef(audio);
  const playerOpenRef = useRef(playerOpen);
  const fallbackRef = useRef(fallbackPlaylist);
  // window that separates "I did this" from "the room did this" (echo guard)
  const applyingUntil = useRef(0);
  const lastLocalEmit = useRef(0);
  const lastT = useRef(0);
  const lastBeat = useRef(0);
  const [prog, setProg] = useState({ t: 0, d: 0 });
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    ctlRef.current = onControl;
    tvRef.current = tv;
    audioRef.current = audio;
    playerOpenRef.current = playerOpen;
    fallbackRef.current = fallbackPlaylist;
    curIdRef.current = videoId;
  });

  // bring the open player onto the room: swap video if needed, then play /
  // pause / seek / sound. One function, so every caller leaves it consistent.
  const syncToRoom = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || !playerOpenRef.current) return;
    const state = tvRef.current;
    const list = state.playlist.length ? state.playlist : fallbackRef.current;
    const item = list[state.index % Math.max(1, list.length)];
    const id = item?.id ?? "";
    if (!id) return;
    const target = Math.max(
      0,
      (state.positionSec ?? 0) + (state.playing ? (Date.now() - state.updatedAt) / 1000 : 0)
    );
    try {
      // this viewer's own sound choice only — the wall goes silent while this
      // screen is open, so the room never hears the same video twice
      if (audioRef.current) player.unMute();
      else player.mute();
    } catch {
      /* player mid-swap — the next sync retries */
    }
    try {
      if (id !== loadedRef.current) {
        // a fresh video: load straight to the room's frame. A paused room is
        // CUED, never load-and-pause — loadVideoById starts playing by itself,
        // so pausing it in the same tick leaves a never-started black player.
        loadedRef.current = id;
        loadAtRef.current = Date.now();
        applyingUntil.current = Date.now() + 1600;
        lastT.current = target;
        lastLocalEmit.current = Date.now();
        lastBeat.current = Date.now();
        if (state.playing) player.loadVideoById(id, target);
        else player.cueVideoById(id, target);
        return;
      }
      if (state.playing) player.playVideo();
      else player.pauseVideo();
      const local = player.getCurrentTime() ?? 0;
      if (Math.abs(local - target) > DRIFT_TOLERANCE) {
        applyingUntil.current = Date.now() + 1200;
        lastT.current = target;
        player.seekTo(target, true);
      }
    } catch {
      /* player mid-swap — the next sync retries */
    }
  }, []);

  // Open → build the player; close → destroy it. One embed per open, and it is
  // never rebuilt while it lives (video changes go through syncToRoom).
  useEffect(() => {
    if (!playerOpen) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let dead = false;
    let player: YT.Player | null = null;
    // our own host node: the API swaps this out for its iframe, and React never
    // touches it (it only ever rendered the empty wrapper above)
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0";
    wrap.appendChild(host);
    loadYouTubeApi()
      .then((YT) => {
        if (dead) return;
        player = new YT.Player(host, {
          width: "100%",
          height: "100%",
          // YouTube's own controls on purpose: scrubbing, fast-forward and
          // fullscreen are the ones people expect, and the poll below relays
          // any seek back to the room so everyone stays together
          playerVars: { rel: 0, controls: 1, fs: 1, playsinline: 1 },
          events: {
            onReady: () => {
              // size the frame ourselves (the class copy is not ours to trust)
              // and only ever patch a MISSING allowfullscreen: rewriting `allow`
              // changes the permissions policy, which restarts the embed
              const frame = player?.getIframe();
              if (frame) {
                frame.style.position = "absolute";
                frame.style.inset = "0";
                frame.style.width = "100%";
                frame.style.height = "100%";
                frame.style.border = "0";
                frame.style.display = "block";
                if (!frame.hasAttribute("allowfullscreen")) {
                  frame.setAttribute("allowfullscreen", "");
                }
              }
              readyRef.current = true;
              syncToRoom();
            },
            onStateChange: (e) => {
              const p = player;
              if (!p || !playerOpenRef.current) return;
              if (e.data === YT.PlayerState.ENDED) {
                const now = Date.now();
                // only a loaded, actually-played video may advance the shelf —
                // a player that never started (still loading, blocked autoplay)
                // must not walk the playlist
                if (loadedRef.current !== curIdRef.current) return;
                if (now - loadAtRef.current < LOAD_GRACE_MS) return;
                if (now < applyingUntil.current) return;
                let dur = 0;
                try {
                  dur = p.getDuration() ?? 0;
                } catch {
                  return;
                }
                if (!(dur > 1)) return;
                const s = tvRef.current;
                const len = Math.max(1, (s.playlist.length ? s.playlist : fallbackPlaylist).length);
                lastLocalEmit.current = now;
                lastBeat.current = now;
                ctlRef.current({ index: (s.index + 1) % len, playing: true, positionSec: 0 });
                return;
              }
              if (Date.now() < applyingUntil.current) return;
              let t = 0;
              try {
                t = p.getCurrentTime();
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
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => setApiFailed(true));
    return () => {
      dead = true;
      readyRef.current = false;
      loadedRef.current = null;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      host.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerOpen]);

  // room → player (the whole watch-party contract in one call)
  useEffect(() => {
    syncToRoom();
  }, [playerOpen, videoId, tv.index, tv.playing, tv.positionSec, tv.updatedAt, audio, syncToRoom]);

  // while open, re-read the room on a slow beat: a player that started on its
  // own (transient autoplay) or stalled mid-buffer would otherwise drift,
  // out of sync and audible, until the room happened to change again
  useEffect(() => {
    if (!playerOpen) return;
    const id = window.setInterval(() => {
      if (!document.hidden) syncToRoom();
    }, RESYNC_MS);
    return () => window.clearInterval(id);
  }, [playerOpen, syncToRoom]);

  // poll: user-seek detection + heartbeat anchor + progress readout.
  // Closed, the shelf relays NOTHING (no seek, no heartbeat) and the readout
  // simply follows the room's clock — a control surface, not a player.
  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !playerOpenRef.current) {
        const s = tvRef.current;
        setProg({
          t: Math.max(0, (s.positionSec ?? 0) + (s.playing ? (Date.now() - s.updatedAt) / 1000 : 0)),
          d: 0,
        });
        return;
      }
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
      if (player && readyRef.current) {
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
      className={`pointer-events-auto absolute z-20 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_70px_-24px_rgba(30,25,40,0.35)] ring-1 ring-black/10 ${
        compact
          ? "bottom-[calc(var(--safe-b)+0.5rem)] left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,430px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.08] px-4 py-2.5">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4a3f55]">
          <Icon name="tv" size={15} className="text-[#a08fb5]" /> shared tv
          <span
            className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em] ${
              tv.playing ? "border-[#7cc9a1] text-[#2a9e6e]" : "border-black/15 text-[#8a7f98]"
            }`}
          >
            {tv.playing ? "playing" : "paused"}
          </span>
        </p>
        <button
          onClick={onClose}
          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a7f98] transition-colors hover:bg-black/[0.05] hover:text-[#4a3f55]"
        >
          hide
        </button>
      </div>
      {/* The player exists only while the screen is open, and its height is
          capped against the viewport so the controls below can never be pushed
          off-screen. YouTube letterboxes inside the box, so nothing distorts. */}
      {playerOpen && (
        <div className="relative h-[min(44dvh,240px)] w-full shrink-0 overflow-hidden bg-black">
          {/* React renders this wrapper empty and never touches it again: the
              embed is built into a child node we own (see the effect above) */}
          <div ref={wrapRef} className="absolute inset-0" />
        </div>
      )}
      {apiFailed && (
        <p className="flex items-center gap-1.5 bg-[#ffe4e4] px-3 py-1.5 text-[11px] font-semibold text-[#b03939]">
          <Icon name="warning" size={13} /> YouTube didn&apos;t load (ad-blocker?). Whitelist youtube.com and reopen.
        </p>
      )}
      {/* controls stay outside the scrolling area, so they are always reachable */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button
          onClick={togglePlay}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3d3347] text-white transition-colors hover:bg-[#2e2735] active:scale-95"
          title={tv.playing ? "pause for everyone" : "play for everyone"}
          aria-label={tv.playing ? "pause for everyone" : "play for everyone"}
        >
          <Icon name={tv.playing ? "pause" : "play"} size={17} />
        </button>
        <button
          onClick={() => changeVideo((tv.index + playlist.length - 1) % playlist.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-[#4a3f55] transition-colors hover:bg-black/[0.04] active:scale-95"
          title="previous"
          aria-label="previous video"
        >
          <Icon name="previous" size={16} />
        </button>
        <button
          onClick={() => changeVideo((tv.index + 1) % playlist.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-[#4a3f55] transition-colors hover:bg-black/[0.04] active:scale-95"
          title="next for everyone"
          aria-label="next video for everyone"
        >
          <Icon name="next" size={16} />
        </button>
        <p className="ml-1 min-w-0 flex-1 truncate text-[12px] font-semibold text-[#4a3f55]">{cur?.title}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-1.5">
        <button
          onClick={onToggleAudio}
          aria-pressed={audio}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
            audio
              ? "border-[#3d3347] bg-[#3d3347] text-white hover:bg-[#2e2735]"
              : "border-black/10 bg-white text-[#4a3f55] hover:bg-black/[0.04]"
          }`}
          title={audio ? "stop hearing the room's TV" : "hear what the hall's TV is playing"}
        >
          <Icon name="sound" size={14} />
          {audio ? "leave audio" : "join audio"}
        </button>
        <button
          onClick={onTogglePlayer}
          aria-expanded={playerOpen}
          disabled={!videoId}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
            playerOpen
              ? "border-[#3d3347] bg-[#3d3347] text-white hover:bg-[#2e2735]"
              : "border-black/10 bg-white text-[#4a3f55] hover:bg-black/[0.04]"
          }`}
          title={
            playerOpen
              ? "close this screen — the wall keeps playing for everyone"
              : "open the video here for seek, fast-forward and fullscreen"
          }
        >
          <Icon name={playerOpen ? "caretUp" : "video"} size={14} />
          {playerOpen ? "close player" : "open player"}
        </button>
      </div>
      <p className="shrink-0 px-4 pb-1 pt-1 text-[10px] font-medium leading-tight text-[#a99cbb]">
        {playerOpen
          ? "you're watching this screen — seeks sync for the whole room"
          : "the picture plays on the hall's TV · open the player for seek & fullscreen"}
      </p>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2.5 pt-1">
        <span className="relative flex h-2 w-2">
          <span className={`absolute h-full w-full rounded-full ${tv.playing ? "animate-ping bg-green-400" : "bg-black/15"}`} />
          <span className={`h-2 w-2 rounded-full ${tv.playing ? "bg-green-500" : "bg-black/20"}`} />
        </span>
        <p className="text-[11px] font-bold tabular-nums text-[#8a7f98]">
          {fmt(prog.t)}{prog.d > 0 ? ` / ${fmt(prog.d)}` : ""} · synced
        </p>
      </div>
      {!compact && (
        <div className="max-h-28 min-h-0 flex-1 overflow-y-auto border-t border-black/[0.08] px-3 py-2">
          {playlist.map((v, i) => (
            <button
              key={`${v.id}-${i}`}
              onClick={() => changeVideo(i)}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors hover:bg-black/[0.04] ${
                i === tv.index % playlist.length ? "bg-black/[0.05] font-bold text-[#3d3347]" : "text-[#4a3f55]"
              }`}
            >
              <span className="flex w-4 shrink-0 justify-center">
                {i === tv.index % playlist.length ? <Icon name="play" size={12} label="now playing" /> : `${i + 1}`}
              </span>
              <span className="truncate">{v.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
