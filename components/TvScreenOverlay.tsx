// ─── Cozy Hall · live TV on the 3D screen ─────────────────────────────────────
// The hall's TV plays the room's real YouTube video, not just a status card:
// a muted iframe pinned exactly over the 3D screen (cross-origin pixels can
// never enter WebGL, so an overlay like this is how wall TVs show real
// video). Sound + controls stay in the TV panel — this is the silent picture
// on the wall, always in sync with the room.
//
// The SCENE moves this box, not the component: the render loop projects the
// screen's corners and paints the matrix in the tick it draws the frame, so
// the picture sits on the set with zero frames of slip. This side only owns
// playback and reports whether it has a frame to show.
//
// It also sits UNDER the canvas, not over it: the scene punches a depth-tested
// hole through the canvas exactly where the screen is the front-most surface,
// so whatever stands in front of the TV (a lamp, a scoreboard, the wall of the
// next room) occludes the picture pixel for pixel instead of being painted over.
//
// Professional guarantees: never captures clicks (pointer-events-none),
// hides the moment the screen faces away / has no video / the API is
// blocked (the canvas status card underneath is the fallback), never emits
// to the room (read-only — no echo guards needed), keeps itself on the room
// clock (periodic catch-up + first-gesture unlock + resync on tab return),
// so a viewer who joins late or got a blocked autoplay never stays frozen.

"use client";

import { useEffect, useRef } from "react";
import type { TvState } from "../lib/hall-types";
import { loadYouTubeApi } from "../lib/youtube";
import { TV_OVERLAY_H, TV_OVERLAY_W, tvScreenAnchor } from "../lib/tv-screen";

const DRIFT_TOLERANCE = 2.5;
/** catch-up beat — also the retry clock for a blocked autoplay */
const RESYNC_MS = 4_000;

interface Props {
  tv: TvState;
  fallbackPlaylist: Array<{ id: string; title: string }>;
}

export default function TvScreenOverlay({ tv, fallbackPlaylist }: Props) {
  const playlist = tv.playlist.length ? tv.playlist : fallbackPlaylist;
  const cur = playlist[tv.index % Math.max(1, playlist.length)];
  const videoId = cur?.id ?? "";

  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const loadedRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const tvRef = useRef(tv);
  const videoRef = useRef(videoId);
  const fallbackRef = useRef(fallbackPlaylist);

  useEffect(() => {
    tvRef.current = tv;
    videoRef.current = videoId;
    fallbackRef.current = fallbackPlaylist;
    // only a loaded player with a real video may be put on the wall
    tvScreenAnchor.ready = readyRef.current && !!videoId;
  });

  // follow the room: swap video, then play / pause / seek to the room clock
  const syncPlayer = () => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
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
      player.mute();
      const fresh = id !== loadedRef.current;
      if (state.playing) {
        // load straight to the room's frame — no jump from 0 to the seek
        if (fresh) {
          loadedRef.current = id;
          player.loadVideoById(id, target);
        } else {
          player.playVideo();
        }
      } else if (fresh) {
        // A paused room cues, it doesn't load-and-pause: loadVideoById starts
        // playing, so pausing it in the same tick leaves a never-started,
        // black player stuck on the wall. Cueing paints the real frame there.
        loadedRef.current = id;
        player.cueVideoById(id, target);
      } else {
        player.pauseVideo();
      }
      const local = player.getCurrentTime() ?? 0;
      if (Math.abs(local - target) > DRIFT_TOLERANCE) player.seekTo(target, true);
    } catch {
      /* player mid-swap — next sync retries */
    }
  };

  // one muted player for the life of the overlay
  useEffect(() => {
    let player: YT.Player | null = null;
    let dead = false;
    loadYouTubeApi()
      .then((YT) => {
        if (dead || !mountRef.current) return;
        player = new YT.Player(mountRef.current, {
          width: String(TV_OVERLAY_W),
          height: String(TV_OVERLAY_H),
          playerVars: { rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1 },
          events: {
            onReady: (e) => {
              try {
                e.target.mute();
              } catch {
                /* unmuted overlay would double the panel's audio — retry below */
              }
              readyRef.current = true;
              tvScreenAnchor.ready = !!videoRef.current;
              syncPlayer();
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        /* ad-blocker / offline: stay hidden, canvas status card shows */
      });
    return () => {
      dead = true;
      readyRef.current = false;
      tvScreenAnchor.ready = false;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      if (playerRef.current === player) playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    tvScreenAnchor.ready = readyRef.current && !!videoId;
    syncPlayer();
  }, [videoId, tv.index, tv.playing, tv.positionSec, tv.updatedAt, fallbackPlaylist]);

  // stay on the room clock without waiting for a room event:
  //  · backgrounding pauses the iframe — resync the moment we come back
  //  · a blocked autoplay / mid-video buffer heals on the next catch-up
  //  · the first tap or keypress unlocks playback on stubborn browsers
  //    (autoplay policies gate audio, and some gate muted video too)
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) syncPlayer();
    };
    const unlock = () => {
      syncPlayer();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    const beat = window.setInterval(() => {
      if (!document.hidden) syncPlayer();
    }, RESYNC_MS);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // hand the box to the scene, which pins it every frame (no rAF here — a
  // loop of our own would paint the previous camera over the current frame)
  useEffect(() => {
    tvScreenAnchor.el = wrapRef.current;
    return () => {
      tvScreenAnchor.el = null;
      tvScreenAnchor.ready = false;
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-0 touch-none select-none"
      style={{ width: TV_OVERLAY_W, height: TV_OVERLAY_H, transformOrigin: "0 0", display: "none" }}
    >
      <div ref={mountRef} className="h-full w-full overflow-hidden bg-black [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0" />
    </div>
  );
}
