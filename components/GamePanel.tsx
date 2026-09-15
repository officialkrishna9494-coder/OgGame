"use client";

// ─── Cozy Hall · Star Scramble panel ────────────────────────────────────────
// Tiny on purpose: a 60-second dash to walk over glowing stars. Anyone can
// start; the server scores; everyone hears the pops.

import { useEffect, useState } from "react";
import type { GameState } from "../lib/hall-types";
import { GAME_DURATION_MS } from "../lib/hall-types";

interface Props {
  game: GameState;
  compact?: boolean;
  onStart: () => void;
  onClose: () => void;
}

// Ticking countdown kept in state (never Date.now() during render).
function useRemaining(active: boolean, endsAt: number): number {
  const [remaining, setRemaining] = useState(GAME_DURATION_MS / 1000);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(t);
  }, [active, endsAt]);
  return remaining;
}

export default function GamePanel({ game, compact, onStart, onClose }: Props) {
  const remaining = useRemaining(game.status === "playing", game.endsAt);
  const leaders = Object.values(game.scores).sort((a, b) => b.points - a.points).slice(0, 5);

  return (
    <div
      className={`pointer-events-auto absolute z-20 overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "bottom-2 left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,380px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-[#ffb703] to-[#ff8fab] px-4 py-2.5 text-white">
        <p className="text-[13px] font-bold">
          ⭐ star scramble{" "}
          {game.status === "playing" ? `· ${remaining}s` : game.status === "ended" ? "· results" : ""}
        </p>
        <button onClick={onClose} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/30">
          hide
        </button>
      </div>

      <div className="px-4 py-3">
        {game.status === "idle" && (
          <>
            <p className="text-[13px] leading-relaxed text-[#4a3f55]">
              Golden stars rain onto the rug for <b>60 seconds</b>. Walk over them to grab them — most stars wins. 🏆
            </p>
            <button
              onClick={onStart}
              className="mt-3 w-full rounded-2xl bg-[#3d3347] py-3 text-sm font-bold text-white shadow-lg transition-transform hover:bg-[#2e2735] active:scale-[0.98]"
            >
              start the scramble ⭐
            </button>
          </>
        )}

        {game.status === "playing" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-black tabular-nums text-[#3d3347]">{remaining}s</p>
              <p className="text-[12px] font-bold text-[#8a7f98]">{game.stars.length} stars out</p>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ffb703] to-[#ff8fab] transition-all"
                style={{ width: `${(remaining / (GAME_DURATION_MS / 1000)) * 100}%` }}
              />
            </div>
            <Leaderboard leaders={leaders} />
          </>
        )}

        {game.status === "ended" && (
          <>
            <p className="text-center text-[15px] font-extrabold text-[#3d3347]">
              {game.winner ? `🏆 ${game.winner} takes it!` : "no stars this time 🌙"}
            </p>
            <Leaderboard leaders={leaders} />
            <button
              onClick={onStart}
              className="mt-3 w-full rounded-2xl bg-[#3d3347] py-2.5 text-sm font-bold text-white transition-transform hover:bg-[#2e2735] active:scale-[0.98]"
            >
              run it back ↻
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Leaderboard({ leaders }: { leaders: Array<{ name: string; points: number }> }) {
  if (!leaders.length) return <p className="mt-2 text-[12px] font-medium text-[#a99cbb]">no scores yet — go touch a star ✨</p>;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {leaders.map((s, i) => (
        <div
          key={`${s.name}-${i}`}
          className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] ${i === 0 ? "bg-[#fff3d6] font-extrabold text-[#7a5b00]" : "bg-black/[0.03] font-semibold text-[#4a3f55]"}`}
        >
          <span className="w-5 text-center">{["🥇", "🥈", "🥉", "4.", "5."][i]}</span>
          <span className="flex-1 truncate">{s.name}</span>
          <span className="tabular-nums">{s.points} ⭐</span>
        </div>
      ))}
    </div>
  );
}
