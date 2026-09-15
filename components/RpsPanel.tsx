"use client";

// ─── Cozy Hall · rock-paper-scissors panel ──────────────────────────────────
// Best of 5, first to 3. Duelists pick in secret; everyone watches the
// scoreboard. Timeouts auto-pick at random so the table never wedges.

import { useEffect, useState } from "react";
import type { RpsChoice, RpsState } from "../lib/hall-types";
import { RPS_CHOICES, RPS_EMOJI, RPS_ROUND_MS } from "../lib/hall-types";

interface Props {
  rps: RpsState;
  mySocketId: string;
  compact?: boolean;
  onChallenge: () => void;
  onPick: (c: RpsChoice) => void;
  onLeave: () => void;
  onClose: () => void;
}

function useCountdown(active: boolean, deadline: number): number {
  const [left, setLeft] = useState(RPS_ROUND_MS / 1000);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => {
      setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(t);
  }, [active, deadline]);
  return left;
}

export default function RpsPanel({ rps, mySocketId, compact, onChallenge, onPick, onLeave, onClose }: Props) {
  const role = rps.seats.a === mySocketId ? "a" : rps.seats.b === mySocketId ? "b" : null;
  const left = useCountdown(rps.status === "picking", rps.deadline);
  const myPick = role ? rps.picks[role] : null;

  const title =
    rps.status === "idle" ? "✊✋✌️ showdown"
    : rps.status === "waiting" ? "waiting for a rival…"
    : rps.status === "ended" ? "🏆 table taken!"
    : `round ${rps.round} · first to 3`;

  return (
    <div
      className={`pointer-events-auto absolute z-20 overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "bottom-2 left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,380px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-[#2d6a4f] to-[#40916c] px-4 py-2.5 text-white">
        <p className="text-[13px] font-bold">{title}</p>
        <button onClick={onClose} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/30">
          hide
        </button>
      </div>

      <div className="px-4 py-3">
        {rps.status === "idle" && (
          <>
            <p className="text-[13px] leading-relaxed text-[#4a3f55]">
              Best of 5 at the felt table — first to <b>3 round wins</b> takes it. Stand by the table and throw down. 🎲
            </p>
            <button
              onClick={onChallenge}
              className="mt-3 w-full rounded-2xl bg-[#3d3347] py-3 text-sm font-bold text-white shadow-lg transition-transform hover:bg-[#2e2735] active:scale-[0.98]"
            >
              challenge the table ✊
            </button>
          </>
        )}

        {rps.status === "waiting" && (
          <>
            <p className="text-center text-[14px] font-extrabold text-[#3d3347]">
              {rps.names.a} wants a duel…
            </p>
            <p className="mt-1 text-center text-[12px] text-[#8a7f98]">
              {role === "a" ? "tell a friend to stand by the table + ACT!" : "stand by the table and hit ACT to accept! ⚡"}
            </p>
            <div className="mt-3 flex gap-2">
              {role === null ? (
                <button
                  onClick={onChallenge}
                  className="flex-1 rounded-2xl bg-[#3d3347] py-2.5 text-sm font-bold text-white active:scale-[0.98]"
                >
                  accept ✊
                </button>
              ) : (
                <button
                  onClick={onLeave}
                  className="flex-1 rounded-2xl bg-black/[0.06] py-2.5 text-sm font-bold text-[#4a3f55] active:scale-[0.98]"
                >
                  cancel
                </button>
              )}
            </div>
          </>
        )}

        {(rps.status === "picking" || rps.status === "revealing") && (
          <>
            <ScoreLine rps={rps} />
            {role ? (
              rps.status === "picking" ? (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {RPS_CHOICES.map((c) => (
                      <button
                        key={c}
                        onClick={() => onPick(c)}
                        className={`flex flex-col items-center rounded-2xl py-2.5 shadow transition-all active:scale-95 ${
                          myPick === c
                            ? "bg-[#3d3347] text-white ring-2 ring-[#ffd166]"
                            : "bg-[#efe8f7] text-[#4a3f55] hover:bg-[#e2d6f2]"
                        }`}
                      >
                        <span className="text-3xl">{RPS_EMOJI[c]}</span>
                        <span className="mt-0.5 text-[11px] font-extrabold uppercase">{c}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-[12px] font-bold tabular-nums text-[#8a7f98]">
                    {myPick ? "locked in — waiting on your rival…" : `${left}s to throw!`}
                  </p>
                </>
              ) : (
                <Reveal rps={rps} role={role} />
              )
            ) : (
              <>
                {rps.status === "revealing" && rps.lastReveal ? (
                  <Reveal rps={rps} role={null} />
                ) : (
                  <p className="mt-2 text-center text-[12px] font-semibold text-[#8a7f98]">
                    {rps.names.a} vs {rps.names.b} — throwing… popcorn? 🍿
                  </p>
                )}
                {rps.status === "picking" && (
                  <p className="mt-1 text-center text-[11px] tabular-nums text-[#a99cbb]">{left}s left this round</p>
                )}
              </>
            )}
            {role && (
              <button
                onClick={onLeave}
                className="mt-2 w-full rounded-xl py-1.5 text-[11px] font-bold text-[#a99cbb] hover:text-[#b03939]"
              >
                forfeit match
              </button>
            )}
          </>
        )}

        {rps.status === "ended" && (
          <>
            <p className="text-center text-4xl">🏆</p>
            <p className="mt-1 text-center text-[16px] font-extrabold text-[#3d3347]">
              {rps.winner} takes it {rps.scores.a}–{rps.scores.b}!
            </p>
            <ScoreLine rps={rps} />
            <button
              onClick={onChallenge}
              className="mt-3 w-full rounded-2xl bg-[#3d3347] py-2.5 text-sm font-bold text-white active:scale-[0.98]"
            >
              run it back ↻
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreLine({ rps }: { rps: RpsState }) {
  return (
    <div className="mt-1 flex items-center justify-center gap-3 rounded-2xl bg-black/[0.04] px-3 py-2">
      <span className="flex-1 truncate text-right text-[13px] font-extrabold text-[#3d3347]">{rps.names.a}</span>
      <span className="text-[15px] font-black tabular-nums text-[#3d3347]">
        {rps.scores.a}–{rps.scores.b}
      </span>
      <span className="flex-1 truncate text-[13px] font-extrabold text-[#3d3347]">{rps.names.b}</span>
    </div>
  );
}

function Reveal({ rps, role }: { rps: RpsState; role: "a" | "b" | null }) {
  const rv = rps.lastReveal;
  if (!rv) return null;
  const verdict =
    rv.result === "draw"
      ? "draw — replay the round!"
      : role === null
        ? `${rv.result === "a" ? rps.names.a : rps.names.b} takes round ${rv.round}!`
        : rv.result === role
          ? `you take round ${rv.round}! 🎉`
          : `${rv.result === "a" ? rps.names.a : rps.names.b} takes round ${rv.round}`;
  return (
    <div className="animate-pop-in mt-2 rounded-2xl bg-[#fff3d6] px-3 py-2.5 text-center">
      <p className="text-4xl">
        {RPS_EMOJI[rv.a]} <span className="text-2xl text-[#a99cbb]">vs</span> {RPS_EMOJI[rv.b]}
      </p>
      <p className="mt-1 text-[13px] font-extrabold text-[#7a5b00]">
        {verdict}
        {rv.timeout && <span className="ml-1 text-[11px] font-semibold">(slowpoke auto-pick 🎲)</span>}
      </p>
    </div>
  );
}
