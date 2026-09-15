"use client";

// ─── Cozy Hall · dodgeball panel ────────────────────────────────────────────
// A live scoreboard that opens by itself for a round: the countdown (who's on
// the court), the match (timer, your line, standings, hit feed) and the final
// results (winner, awards, full ranking). Scoring: +1 per hit landed, −1 per
// time you're hit; ties share a rank.

import { useEffect, useState } from "react";
import { inCourt } from "../lib/hall-layout";
import type { DodgeRank, DodgeState, PlayerState } from "../lib/hall-types";
import { DODGE_RESULTS_MS, DODGE_ROUND_MS, rankDodge } from "../lib/hall-types";
import { Icon } from "./icons";

interface Props {
  dodge: DodgeState;
  serverOffset: number;
  mySocketId: string;
  players: Record<string, PlayerState>;
  compact?: boolean;
  onClose: () => void;
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// ticking server clock kept in state (never read the clock during render)
function useServerNow(active: boolean, offset: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now() + offset);
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [active, offset]);
  return now;
}

export default function DodgePanel({ dodge, serverOffset, mySocketId, players, compact, onClose }: Props) {
  const now = useServerNow(dodge.status !== "idle", serverOffset);
  const [expanded, setExpanded] = useState(false);
  const rows: DodgeRank[] = dodge.status === "ended" && dodge.ranking.length ? dodge.ranking : rankDodge(dodge.roster);
  const me = rows.find((r) => r.id === mySocketId);

  // phones: a slim pill in the top bar while the court is busy, so the panel
  // never covers the game you're playing; tap it for the full standings
  if (compact && dodge.status !== "ended" && !expanded) {
    return <Pill dodge={dodge} now={now} rows={rows} me={me} players={players} mySocketId={mySocketId} onExpand={() => setExpanded(true)} />;
  }
  const close = compact && dodge.status !== "ended" ? () => setExpanded(false) : onClose;

  const title =
    dodge.status === "countdown" ? "dodgeball · get ready" : dodge.status === "playing" ? "dodgeball · live" : "dodgeball · results";

  return (
    <div
      className={`pointer-events-auto absolute z-20 flex max-h-[78dvh] flex-col overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "left-1/2 top-[calc(var(--safe-t)+3rem)] max-h-[calc(100dvh-var(--safe-t)-var(--safe-b)-4rem)] w-[min(80vw,340px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,400px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-[#3a86ff] to-[#4cc9f0] px-4 py-2.5 text-white">
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <Icon name={dodge.status === "ended" ? "trophy" : "dodge"} size={16} /> {title}
        </p>
        <button onClick={close} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/30">
          {compact && dodge.status !== "ended" ? "less" : "hide"}
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 py-3">
        {dodge.status === "countdown" && <Countdown dodge={dodge} now={now} players={players} mySocketId={mySocketId} compact={compact} />}
        {dodge.status === "playing" && <Live dodge={dodge} now={now} rows={rows} me={me} compact={compact} />}
        {dodge.status === "ended" && <Results dodge={dodge} now={now} rows={rows} me={me} />}
      </div>
    </div>
  );
}

function Pill({
  dodge,
  now,
  rows,
  me,
  players,
  mySocketId,
  onExpand,
}: {
  dodge: DodgeState;
  now: number;
  rows: DodgeRank[];
  me?: DodgeRank;
  players: Record<string, PlayerState>;
  mySocketId: string;
  onExpand: () => void;
}) {
  const counting = dodge.status === "countdown";
  const left = now ? Math.max(0, Math.ceil(((counting ? dodge.startsAt : dodge.endsAt) - now) / 1000)) : 0;
  const onCourt = Object.entries(players).filter(([, p]) => inCourt(p.x, p.z, 0.2));
  const meIn = onCourt.some(([id]) => id === "me" || id === mySocketId);
  const leader = rows[0];
  return (
    <button
      onClick={onExpand}
      aria-label="show dodgeball standings"
      className="pointer-events-auto absolute left-1/2 top-[calc(var(--safe-t)+0.5rem)] z-20 flex h-8 max-w-[min(44vw,300px)] -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-[#1f2447]/90 pl-2 pr-1.5 text-[11px] font-bold text-white shadow-lg ring-1 ring-white/10 backdrop-blur active:scale-95"
    >
      <Icon name={counting ? "dodge" : "timer"} size={14} className="text-[#4cc9f0]" />
      <span className="tabular-nums">{counting ? `in ${left}` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
      <span className="h-3 w-px bg-white/20" />
      {counting ? (
        <span className={`flex min-w-0 items-center gap-1 truncate ${meIn ? "text-[#8ce8c0]" : "text-[#ffadad]"}`}>
          <Icon name={meIn ? "check" : "users"} size={12} />
          {meIn ? `you're in · ${onCourt.length}` : `get on court · ${onCourt.length}`}
        </span>
      ) : me ? (
        <span className="flex min-w-0 items-center gap-1 truncate">
          #{me.rank} <span className={me.score > 0 ? "text-[#8ce8c0]" : me.score < 0 ? "text-[#ffadad]" : ""}>{fmt(me.score)}</span>
          {leader && leader.id !== me.id && <span className="truncate text-white/60">· {leader.name.slice(0, 8)} {fmt(leader.score)}</span>}
        </span>
      ) : (
        <span className="truncate text-white/70">{leader ? `${leader.name.slice(0, 8)} ${fmt(leader.score)}` : "watching"}</span>
      )}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Icon name="caretDown" size={11} />
      </span>
    </button>
  );
}

function Countdown({ dodge, now, players, mySocketId, compact }: { dodge: DodgeState; now: number; players: Record<string, PlayerState>; mySocketId: string; compact?: boolean }) {
  const left = now ? Math.max(0, Math.ceil((dodge.startsAt - now) / 1000)) : 0;
  const onCourt = Object.entries(players).filter(([, p]) => inCourt(p.x, p.z, 0.2));
  const meIn = onCourt.some(([id]) => id === "me" || id === mySocketId);
  return (
    <>
      <div className="flex items-center gap-3">
        <p className="w-16 text-center text-5xl font-black tabular-nums text-[#3a86ff]">{left}</p>
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-[#3d3347]">{dodge.startedBy} started a round</p>
          <p className={`mt-0.5 flex items-center gap-1 text-[12px] font-bold ${meIn ? "text-[#2d9d6a]" : "text-[#c2437b]"}`}>
            <Icon name={meIn ? "check" : "info"} size={13} />
            {meIn ? "you're on the court — you're in!" : "step inside the court lines to play"}
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a08fb5]">
        <Icon name="users" size={12} /> on the court · {onCourt.length}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {onCourt.length === 0 && <span className="text-[12px] font-medium text-[#a99cbb]">nobody yet…</span>}
        {onCourt.map(([id, p]) => (
          <span key={id} className="flex h-6 items-center gap-1 rounded-full bg-black/[0.04] pl-1 pr-2 text-[11px] font-bold text-[#4a3f55]">
            <span className="block h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: p.color }} />
            {p.name.slice(0, 10)}
          </span>
        ))}
      </div>
      <ul className={`mt-3 grid gap-1.5 text-[12px] text-[#4a3f55] ${compact ? "" : "grid-cols-2"}`}>
        <Rule icon="dodge" text="one ball per player" />
        <Rule icon="target" text={`land a hit: +1`} tone="good" />
        <Rule icon="bonk" text="get hit: −1" tone="bad" />
        <Rule icon="timer" text={`${DODGE_ROUND_MS / 1000}s round`} />
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-[#a99cbb]">
        walk over a ball to grab it, {compact ? "tap ACT" : "press E"} to throw. Only throws that haven&apos;t touched the floor count.
      </p>
    </>
  );
}

function Rule({ icon, text, tone }: { icon: "dodge" | "target" | "bonk" | "timer"; text: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-[#2d9d6a]" : tone === "bad" ? "text-[#c2437b]" : "text-[#3a86ff]";
  return (
    <li className="flex items-center gap-1.5 rounded-xl bg-black/[0.03] px-2 py-1.5 font-semibold">
      <Icon name={icon} size={14} className={color} /> {text}
    </li>
  );
}

function Live({ dodge, now, rows, me, compact }: { dodge: DodgeState; now: number; rows: DodgeRank[]; me?: DodgeRank; compact?: boolean }) {
  const left = now ? Math.max(0, Math.ceil((dodge.endsAt - now) / 1000)) : DODGE_ROUND_MS / 1000;
  const pct = Math.max(0, Math.min(100, (left / (DODGE_ROUND_MS / 1000)) * 100));
  const feed = [...dodge.feed].reverse().slice(0, compact ? 2 : 3);
  return (
    <>
      <div className="flex items-center justify-between">
        <p className={`flex items-center gap-1.5 text-2xl font-black tabular-nums ${left <= 10 ? "text-[#c2437b]" : "text-[#3d3347]"}`}>
          <Icon name="timer" size={22} /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </p>
        {me ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[#e8f4ff] px-2.5 py-1 text-[12px] font-extrabold text-[#1d4ed8]">
            <span className="flex items-center gap-0.5 text-[#2d9d6a]">
              <Icon name="target" size={13} />
              {me.hits}
            </span>
            <span className="flex items-center gap-0.5 text-[#c2437b]">
              <Icon name="bonk" size={13} />
              {me.taken}
            </span>
            <span className="tabular-nums">{fmt(me.score)}</span>
          </div>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-bold text-[#8a7f98]">
            <Icon name="popcorn" size={13} /> spectating
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#3a86ff] to-[#4cc9f0] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <Standings rows={rows} meId={me?.id} />
      {feed.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {feed.map((h) => (
            <p key={h.id} className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-[#8a7f98]">
              <Icon name="bonk" size={12} className="text-[#ffb703]" />
              <b className="text-[#3d3347]">{h.byName}</b> hit <b className="text-[#3d3347]">{h.victimName}</b>
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function Results({ dodge, now, rows, me }: { dodge: DodgeState; now: number; rows: DodgeRank[]; me?: DodgeRank }) {
  const winners = rows.filter((r) => r.rank === 1);
  // "hardest to hit" is judged among players who stayed to the end — unless
  // fewer than two did, then everyone who played counts
  const stayed = rows.filter((r) => !r.left);
  const pool = stayed.length >= 2 ? stayed : rows;
  const topThrower = [...rows].sort((a, b) => b.hits - a.hits)[0];
  const hardest = rows.length >= 2 ? [...pool].sort((a, b) => a.taken - b.taken || b.hits - a.hits)[0] : undefined;
  const closesIn = now ? Math.max(0, Math.ceil((dodge.endedAt + DODGE_RESULTS_MS - now) / 1000)) : 0;
  return (
    <>
      <div className="flex flex-col items-center text-center">
        <Icon name="crown" size={36} className="text-[#e0a100]" />
        <p className="mt-1 text-[17px] font-extrabold text-[#3d3347]">
          {winners.length > 1 ? `${winners.map((w) => w.name).join(" & ")} tie!` : winners[0] ? `${winners[0].name} wins!` : "round over"}
        </p>
        {winners[0] && (
          <p className="text-[12px] font-bold text-[#8a7f98]">
            {fmt(winners[0].score)} · {winners[0].hits} hits · hit {winners[0].taken}×
          </p>
        )}
        {me && (
          <p className="mt-1 rounded-full bg-[#e8f4ff] px-3 py-0.5 text-[12px] font-extrabold text-[#1d4ed8]">
            you placed #{me.rank} of {rows.length} · {fmt(me.score)}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {topThrower && topThrower.hits > 0 && <Award icon="target" title="top thrower" name={topThrower.name} detail={`${topThrower.hits} hits`} />}
        {hardest && <Award icon="shield" title="hardest to hit" name={hardest.name} detail={`hit ${hardest.taken}×`} />}
      </div>
      <Standings rows={rows} meId={me?.id} />
      <p className="mt-2 text-center text-[11px] font-medium text-[#a99cbb]">court opens again in {closesIn}s</p>
    </>
  );
}

function Award({ icon, title, name, detail }: { icon: "target" | "shield"; title: string; name: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-[#fff3d6] px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7a5b00]">
        <Icon name={icon} size={12} /> {title}
      </p>
      <p className="truncate text-[13px] font-extrabold text-[#3d3347]">{name}</p>
      <p className="text-[11px] font-semibold text-[#8a7f98]">{detail}</p>
    </div>
  );
}

function Standings({ rows, meId }: { rows: DodgeRank[]; meId?: string }) {
  if (!rows.length) return null;
  return (
    <table className="mt-2 w-full border-separate border-spacing-y-1 text-[12px]">
      <thead>
        <tr className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#a08fb5]">
          <th className="w-6 text-left">#</th>
          <th className="text-left">player</th>
          <th className="w-10 text-right" title="hits landed">hits</th>
          <th className="w-12 text-right" title="times hit">hit by</th>
          <th className="w-12 text-right">score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.id === meId ? "bg-[#e8f4ff] font-extrabold" : r.rank === 1 ? "bg-[#fff3d6] font-bold" : "bg-black/[0.03] font-semibold"}>
            <td className="rounded-l-lg py-1.5 pl-2 text-[#8a7f98]">{r.rank === 1 ? <Icon name="crown" size={13} className="text-[#e0a100]" /> : r.rank}</td>
            <td className={`max-w-0 truncate py-1.5 ${r.left ? "text-[#a99cbb] line-through" : "text-[#3d3347]"}`}>
              <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-black/10" style={{ background: r.color }} />
              {r.name}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[#2d9d6a]">{r.hits}</td>
            <td className="py-1.5 text-right tabular-nums text-[#c2437b]">{r.taken}</td>
            <td className={`rounded-r-lg py-1.5 pr-2 text-right tabular-nums ${r.score > 0 ? "text-[#2d9d6a]" : r.score < 0 ? "text-[#c2437b]" : "text-[#3d3347]"}`}>{fmt(r.score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

