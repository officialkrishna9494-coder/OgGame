"use client";

// ─── Cozy Hall · HUD — one environment, everything within reach ─────────────
// Desktop: single rounded action dock along the bottom (unchanged).
// Mobile landscape: joystick on the right, a minimal rail on the left —
// one contextual button (sit / toss / watch, driven by where you stand)
// plus a "⋯" bubble holding react / poke / high-five / tv.

import { useState } from "react";
import { EMOTES } from "../lib/hall-types";
import type { ContextState, PlayerState } from "../lib/hall-types";
import type { VoiceStatus } from "../lib/useVoice";
import Joystick from "./Joystick";

interface Props {
  roomName: string;
  players: Record<string, PlayerState>;
  toasts: string[];
  sitting: boolean;
  nearName: string | null;
  tvOpen: boolean;
  tvTitle: string;
  simulated: boolean;
  photoUrl?: string;
  mobile?: boolean;
  context?: ContextState;
  gameStatus?: string;
  gameOpen?: boolean;
  rpsStatus?: string;
  voiceStatus?: VoiceStatus;
  voiceOpen?: boolean;
  voiceCount?: number;
  onSignOut?: () => void;
  onEmote: (e: string) => void;
  onPoke: () => void;
  onHighfive: () => void;
  onSit: () => void;
  onSofaSit: () => void;
  onToss: () => void;
  onToggleTv: () => void;
  onToggleGame: () => void;
  onToggleVoice: () => void;
  onToggleRps: () => void;
  onRpsAct: () => void;
  onOpenAddLink: () => void;
}

// ─── the one universal ACT button ───────────────────────────────────────────
// Same priority everywhere: toss (holding) → add link (near TV) → duel
// (at the RPS table) → play (on the rug, star game idle) → sofa sit/stand.
// Everything else lives in menus.
interface PrimaryAction {
  key: string;
  icon: string;
  label: string;
  glow: string;
  run: () => void;
}

function primaryAction(
  ctx: ContextState | undefined,
  flags: { sitting: boolean; gameStatus?: string },
  h: {
    onToss: () => void;
    onOpenAddLink: () => void;
    onRpsAct: () => void;
    onToggleGame: () => void;
    onSofaSit: () => void;
  }
): PrimaryAction | null {
  if (!ctx) return null;
  if (ctx.holdingBall)
    return { key: "toss", icon: "⚽", label: "toss", glow: "#ff6b6b", run: h.onToss };
  if (ctx.nearTv)
    return { key: "addlink", icon: "🔗", label: "add link", glow: "#ff8fab", run: h.onOpenAddLink };
  if (ctx.nearRps)
    return { key: "duel", icon: "✊", label: "duel", glow: "#40916c", run: h.onRpsAct };
  if (ctx.nearGame && flags.gameStatus === "idle")
    return { key: "play", icon: "⭐", label: "play", glow: "#ffb703", run: h.onToggleGame };
  if (ctx.nearSofa)
    return {
      key: flags.sitting ? "stand" : "sit",
      icon: "🛋️",
      label: flags.sitting ? "stand" : "sit",
      glow: "#a0c4ff",
      run: h.onSofaSit,
    };
  return null;
}

export default function Hud(p: Props) {
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const others = Object.entries(p.players).filter(([id]) => id !== "me");
  const count = Object.keys(p.players).length;

  if (p.mobile) return <MobileHud {...p} others={others} count={count} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />;

  const btn =
    "flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-white/85 px-3.5 text-[13px] font-bold text-[#4a3f55] shadow-[0_6px_20px_-8px_rgba(90,70,110,0.4)] ring-1 ring-black/[0.06] backdrop-blur transition-all hover:bg-white active:scale-95 disabled:opacity-35 disabled:saturation-50";

  const primary = primaryAction(
    p.context,
    { sitting: p.sitting, gameStatus: p.gameStatus },
    { onToss: p.onToss, onOpenAddLink: p.onOpenAddLink, onRpsAct: p.onRpsAct, onToggleGame: p.onToggleGame, onSofaSit: p.onSofaSit }
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
      {/* ── top bar ── */}
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/80 py-2 pl-3 pr-4 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-base">🏠</span>
          )}
          <div className="leading-tight">
            <p className="text-[13px] font-extrabold text-[#3d3347]">{p.roomName}</p>
            <p className="text-[11px] font-medium text-[#8a7f98]">
              {count} inside{p.simulated ? " · demo bots 🤖" : " · live"}
            </p>
          </div>
          {p.onSignOut && (
            <button
              onClick={p.onSignOut}
              title="sign out"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-[13px] transition-colors hover:bg-black/10"
            >
              ⏻
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex max-w-[46vw] flex-wrap items-center justify-end gap-1.5 rounded-2xl bg-white/70 px-2.5 py-2 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {others.slice(0, 8).map(([id, pl]) => (
            <span key={id} title={pl.name} className="flex h-7 items-center gap-1 rounded-full bg-white py-0.5 pl-1 pr-2 text-[11px] font-bold text-[#4a3f55] ring-1 ring-black/[0.06]">
              <span className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
              {pl.name.slice(0, 8)}
            </span>
          ))}
          {others.length === 0 && <span className="px-1 text-[11px] font-medium text-[#8a7f98]">just you… for now</span>}
        </div>
      </div>

      {/* ── toasts ── */}
      <div className="flex flex-col items-center gap-1.5">
        {p.toasts.map((t, i) => (
          <div key={`${t}-${i}`} className="animate-[floatUp_0.3s_ease-out] rounded-full bg-[#3d3347]/90 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg backdrop-blur">
            {t}
          </div>
        ))}
        {p.nearName && (
          <div className="rounded-full bg-[#ff8fab]/95 px-4 py-1.5 text-[12px] font-bold text-white shadow-lg">
            {p.nearName} is close — poke or high-five! ✋
          </div>
        )}
      </div>

      {/* ── bottom dock ── */}
      <div className="flex flex-col items-center gap-2 p-3 sm:p-4">
        {emoteOpen && (
          <div className="pointer-events-auto flex gap-1.5 rounded-2xl bg-white/90 p-2 shadow-xl ring-1 ring-black/[0.06] backdrop-blur">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  p.onEmote(e);
                  setEmoteOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-transform hover:scale-125 active:scale-95"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[22px] bg-[#3d3347]/10 p-1.5 backdrop-blur">
          {primary && (
            <button
              key={primary.key}
              className={`${btn} animate-pop-in !bg-[#3d3347] !text-white`}
              style={{ boxShadow: `0 8px 24px -8px ${primary.glow}` }}
              onClick={primary.run}
              title={`act · ${primary.label}`}
            >
              <span className="text-base">{primary.icon}</span> ⚡{primary.label}
            </button>
          )}
          <button className={btn} onClick={() => setEmoteOpen((v) => !v)} title="send emoji">
            <span className="text-base">😊</span> react
          </button>
          <button className={btn} onClick={p.onPoke} disabled={!p.nearName} title={p.nearName ? `poke ${p.nearName}` : "walk close to a friend"}>
            👉 poke
          </button>
          <button className={btn} onClick={p.onHighfive} disabled={!p.nearName} title={p.nearName ? `high-five ${p.nearName}` : "walk close to a friend"}>
            🙌 five
          </button>
          <button
            className={`${btn} ${p.sitting ? "!bg-[#3d3347] !text-white" : ""}`}
            onClick={p.onSit}
            title="sit right here"
          >
            💺 {p.sitting ? "stand" : "sit"}
          </button>
          <button
            className={`${btn} ${p.gameOpen ? "!bg-[#ffb703] !text-white" : ""}`}
            onClick={p.onToggleGame}
            title="star scramble mini-game"
          >
            ⭐ {p.gameStatus === "playing" ? "playing!" : "game"}
          </button>
          <button
            className={btn}
            onClick={p.onToggleRps}
            title="rock-paper-scissors arena"
          >
            <span className="relative text-base">
              ✊
              {(p.rpsStatus === "picking" || p.rpsStatus === "revealing") && (
                <span className="absolute -right-1 -top-1 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
              )}
            </span>{" "}
            rps
          </button>
          <button
            className={`${btn} ${p.voiceOpen ? "!bg-[#8ce8c0] !text-[#234034]" : ""}`}
            onClick={p.onToggleVoice}
            title="voice channel"
          >
            <span className="relative text-base">
              🎙️
              {p.voiceStatus === "live" && (
                <span className="absolute -right-1 -top-1 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
              )}
            </span>{" "}
            {p.voiceStatus === "live" ? `voice${p.voiceCount ? ` · ${p.voiceCount}` : ""}` : "voice"}
          </button>
          <button
            className={`${btn} ${p.tvOpen ? "!bg-[#ff8fab] !text-white" : ""}`}
            onClick={p.onToggleTv}
            title="shared TV"
          >
            📺 {p.tvOpen ? "hide" : "tv"}
          </button>
        </div>
        <p className="max-w-[92vw] truncate text-[11px] font-medium text-[#3d3347]/50">
          {p.tvTitle ? `on the tv · ${p.tvTitle}` : "walk over the ball to pick it up · sit faces the tv"}
        </p>
      </div>
    </div>
  );
}

// ─── mobile landscape HUD ───────────────────────────────────────────────────
function MobileHud(
  p: Props & {
    others: Array<[string, PlayerState]>;
    count: number;
    menuOpen: boolean;
    setMenuOpen: (v: boolean | ((x: boolean) => boolean)) => void;
  }
) {
  const ctx = p.context;
  const { menuOpen, setMenuOpen } = p;

  // the one universal ACT button — same priority as desktop
  const primary = primaryAction(
    ctx,
    { sitting: p.sitting, gameStatus: p.gameStatus },
    { onToss: p.onToss, onOpenAddLink: p.onOpenAddLink, onRpsAct: p.onRpsAct, onToggleGame: p.onToggleGame, onSofaSit: p.onSofaSit }
  );

  const showBallHint = ctx && !ctx.holdingBall && ctx.nearBall;

  const mini =
    "pointer-events-auto flex items-center justify-center gap-1 rounded-2xl bg-white/90 px-3 py-2 text-[12px] font-bold text-[#4a3f55] shadow-lg ring-1 ring-black/[0.07] backdrop-blur transition-all active:scale-95 disabled:opacity-35";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* ── compact top bar ── */}
      <div className="absolute left-2 right-2 top-2 flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/80 py-1.5 pl-2.5 pr-3 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-6 w-6 rounded-lg object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-xs">🏠</span>
          )}
          <p className="text-[12px] font-extrabold text-[#3d3347]">
            {p.roomName} <span className="font-semibold text-[#8a7f98]">· {p.count}</span>
          </p>
          {p.onSignOut && (
            <button onClick={p.onSignOut} title="sign out" className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.05] text-[11px]">
              ⏻
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl bg-white/70 px-2 py-1.5 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.others.slice(0, 5).map(([id, pl]) => (
            <span key={id} title={pl.name} className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
          ))}
          {p.simulated && <span className="pl-0.5 text-[10px]">🤖</span>}
        </div>
      </div>

      {/* ── toasts ── */}
      <div className="absolute left-1/2 top-12 flex w-max max-w-[86vw] -translate-x-1/2 flex-col items-center gap-1">
        {p.toasts.slice(-1).map((t, i) => (
          <div key={`${t}-${i}`} className="max-w-full truncate rounded-full bg-[#3d3347]/90 px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
            {t}
          </div>
        ))}
        {showBallHint && (
          <div className="animate-pop-in rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#4a3f55] shadow ring-1 ring-black/[0.06]">
            step onto the ball to grab it ⚽
          </div>
        )}
      </div>

      {/* ── left rail: the one universal ACT button + ⋯ menu ── */}
      <div className="absolute left-2.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
        {primary && (
          <button
            key={primary.key}
            onClick={primary.run}
            style={{ boxShadow: `0 10px 28px -8px ${primary.glow}`, borderColor: primary.glow }}
            className="animate-pop-in pointer-events-auto flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-2 bg-white/95 backdrop-blur transition-transform active:scale-90"
          >
            <span className="text-2xl leading-none">{primary.icon}</span>
            <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-[#3d3347]">act</span>
            <span className="-mt-0.5 text-[8px] font-bold uppercase tracking-wide text-[#8a7f98]">{primary.label}</span>
          </button>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="react & social"
          className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-lg ring-1 ring-black/[0.07] backdrop-blur transition-all active:scale-90 ${menuOpen ? "rotate-90 bg-[#3d3347] text-white" : "bg-white/90 text-[#4a3f55]"}`}
        >
          {menuOpen ? "✕" : "⋯"}
        </button>

        {/* expanding bubble: react / poke / high-five / tv / game / voice.
            `invisible` (not just opacity-0) when closed — visibility:hidden is
            never hit-testable, so the hidden menu can't swallow taps meant for
            the video underneath. */}
        <div
          className={`absolute left-14 top-1/2 w-44 -translate-y-1/2 rounded-[20px] bg-white/95 p-2.5 shadow-2xl ring-1 ring-black/[0.08] backdrop-blur transition-all duration-200 ${menuOpen ? "visible translate-x-0 scale-100 opacity-100 pointer-events-auto" : "invisible pointer-events-none -translate-x-2 scale-95 opacity-0"}`}
        >
          <p className="px-1 pb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a08fb5]">react</p>
          <div className="grid grid-cols-4 gap-1">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  p.onEmote(e);
                  setMenuOpen(false);
                }}
                className="flex h-9 items-center justify-center rounded-xl text-lg transition-transform hover:scale-125 active:scale-95"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            <button className={mini} onClick={p.onPoke} disabled={!p.nearName}>
              👉 poke{p.nearName ? ` ${p.nearName.slice(0, 8)}` : ""}
            </button>
            <button className={mini} onClick={p.onHighfive} disabled={!p.nearName}>
              🙌 high-five{p.nearName ? ` ${p.nearName.slice(0, 8)}` : ""}
            </button>
            <button className={mini} onClick={() => { p.onToggleTv(); setMenuOpen(false); }}>
              📺 {p.tvOpen ? "hide tv" : "watch tv"}
            </button>
            <button className={mini} onClick={() => { p.onSit(); setMenuOpen(false); }}>
              💺 {p.sitting ? "stand up" : "sit here"}
            </button>
            <button className={mini} onClick={() => { p.onToggleGame(); setMenuOpen(false); }}>
              ⭐ {p.gameStatus === "playing" ? "scramble!" : "star game"}
            </button>
            <button className={mini} onClick={() => { p.onToggleRps(); setMenuOpen(false); }}>
              ✊ {p.rpsStatus === "idle" ? "rps duel" : "rps live!"}
            </button>
            <button className={mini} onClick={() => { p.onToggleVoice(); setMenuOpen(false); }}>
              🎙️ {p.voiceStatus === "live" ? `voice · ${p.voiceCount ?? ""}` : "voice chat"}
            </button>
          </div>
          {!p.nearName && <p className="px-1 pt-1 text-[10px] font-medium text-[#a99cbb]">walk up to a friend to poke ✋</p>}
        </div>
      </div>

      {/* ── joystick, right ── */}
      <Joystick />
    </div>
  );
}
