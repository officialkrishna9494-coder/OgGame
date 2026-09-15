"use client";

// ─── Cozy Hall · HUD — one environment, everything within reach ─────────────
// Desktop: single rounded action dock along the bottom (unchanged).
// Mobile landscape, console layout: floating joystick in the left thumb
// zone; on the right, the one contextual ACT button with a "⋯" button
// above it that opens a compact, scrollable tile menu (emojis tucked
// behind its 😊 tile). Pinch the hall to zoom; fullscreen lives top-right.

import { useEffect, useRef, useState } from "react";
import { EMOTES } from "../lib/hall-types";
import type { ContextState, PlayerState } from "../lib/hall-types";
import { markNudgeSeen, nudgeSeen, useFullscreen } from "../lib/fullscreen";
import type { VoiceStatus } from "../lib/useVoice";
import { FullscreenNudge, FullscreenToggle } from "./FullscreenControls";
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
  unreadCount?: number;
  chatOpen?: boolean;
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
  onToggleChat: () => void;
  onSos: () => void;
  onOpenAddLink: () => void;
}

// ─── the one universal ACT button ───────────────────────────────────────────
// Same priority everywhere: SOS alarm → toss (holding) → add link (near TV)
// → duel (at the RPS table) → play (on the rug, star game idle) → sofa
// sit/stand. Everything else lives in menus.
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
    onSos: () => void;
    onToss: () => void;
    onOpenAddLink: () => void;
    onRpsAct: () => void;
    onToggleGame: () => void;
    onSofaSit: () => void;
  }
): PrimaryAction | null {
  if (!ctx) return null;
  if (ctx.nearEmergency)
    return { key: "sos", icon: "🚨", label: "sos", glow: "#ff3b3b", run: h.onSos };
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
  const others = Object.entries(p.players).filter(([id]) => id !== "me");
  const count = Object.keys(p.players).length;

  if (p.mobile) return <MobileHud {...p} others={others} count={count} />;

  const btn =
    "flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-white/85 px-3.5 text-[13px] font-bold text-[#4a3f55] shadow-[0_6px_20px_-8px_rgba(90,70,110,0.4)] ring-1 ring-black/[0.06] backdrop-blur transition-all hover:bg-white active:scale-95 disabled:opacity-35 disabled:saturation-50";

  const primary = primaryAction(
    p.context,
    { sitting: p.sitting, gameStatus: p.gameStatus },
    { onSos: p.onSos, onToss: p.onToss, onOpenAddLink: p.onOpenAddLink, onRpsAct: p.onRpsAct, onToggleGame: p.onToggleGame, onSofaSit: p.onSofaSit }
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
          <button
            className={`${btn} ${p.chatOpen ? "!bg-[#3d3347] !text-white" : ""}`}
            onClick={p.onToggleChat}
            title="hall chat"
          >
            <span className="relative text-base">
              💬
              {p.unreadCount ? (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b3b] px-1 text-[9px] font-black text-white ring-2 ring-white">
                  {p.unreadCount > 9 ? "9+" : p.unreadCount}
                </span>
              ) : null}
            </span>{" "}
            chat
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
interface Tile {
  key: string;
  icon: string;
  label: string;
  run: () => void;
  on?: boolean;
  disabled?: boolean;
  dot?: boolean;
  badge?: string;
  keepOpen?: boolean; // poke / high-five / react stay open for quick repeats
}

function MobileHud(p: Props & { others: Array<[string, PlayerState]>; count: number }) {
  const ctx = p.context;
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"grid" | "emoji">("grid");
  const clusterRef = useRef<HTMLDivElement>(null);
  const fs = useFullscreen();
  const [nudgeOpen, setNudgeOpen] = useState(() => !nudgeSeen());

  // the one universal ACT button — same priority as desktop
  const primary = primaryAction(
    ctx,
    { sitting: p.sitting, gameStatus: p.gameStatus },
    { onSos: p.onSos, onToss: p.onToss, onOpenAddLink: p.onOpenAddLink, onRpsAct: p.onRpsAct, onToggleGame: p.onToggleGame, onSofaSit: p.onSofaSit }
  );

  const showBallHint = ctx && !ctx.holdingBall && ctx.nearBall;

  const closeMenu = () => {
    setMenuOpen(false);
    setView("grid");
  };

  // tap anywhere outside the ACT / ⋯ cluster (hall, joystick, a panel) or
  // press Esc to close. Capture phase: the tap still reaches its target.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (clusterRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      setView("grid");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setView("grid");
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ── fullscreen ──
  const dismissNudge = () => {
    markNudgeSeen();
    setNudgeOpen(false);
  };
  const goFullscreen = () => {
    void fs.enter(); // first: needs the tap's user activation
    dismissNudge();
  };
  const onFullscreenToggle = () => {
    if (fs.active) void fs.exit();
    else if (fs.offer === "fullscreen") goFullscreen();
    else if (fs.offer === "homescreen") setNudgeOpen((v) => !v); // iPhone: show how
  };

  const tiles: Tile[] = [
    { key: "react", icon: "😊", label: "react", run: () => setView("emoji"), keepOpen: true },
    { key: "poke", icon: "👉", label: "poke", run: p.onPoke, disabled: !p.nearName, keepOpen: true },
    { key: "five", icon: "🙌", label: "high-5", run: p.onHighfive, disabled: !p.nearName, keepOpen: true },
    { key: "tv", icon: "📺", label: p.tvOpen ? "hide tv" : "tv", run: p.onToggleTv, on: p.tvOpen },
    { key: "sit", icon: "💺", label: p.sitting ? "stand" : "sit", run: p.onSit, on: p.sitting },
    { key: "game", icon: "⭐", label: p.gameStatus === "playing" ? "playing!" : "game", run: p.onToggleGame, on: p.gameOpen },
    { key: "rps", icon: "✊", label: "rps", run: p.onToggleRps, dot: p.rpsStatus === "picking" || p.rpsStatus === "revealing" },
    {
      key: "voice",
      icon: "🎙️",
      label: "voice",
      run: p.onToggleVoice,
      on: p.voiceOpen,
      dot: p.voiceStatus === "live" && !p.voiceCount,
      badge: p.voiceStatus === "live" && p.voiceCount ? String(p.voiceCount) : undefined,
    },
    {
      key: "chat",
      icon: "💬",
      label: "chat",
      run: p.onToggleChat,
      on: p.chatOpen,
      badge: p.unreadCount ? (p.unreadCount > 9 ? "9+" : String(p.unreadCount)) : undefined,
    },
  ];
  // one glanceable signal on the closed ⋯ button
  const menuAlert = !!p.unreadCount || p.rpsStatus === "picking" || p.rpsStatus === "revealing";

  const label = "text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#a08fb5]";

  return (
    // lifted above the bottom panels only while the menu is open, so the
    // menu never tucks behind an open chat / tv panel
    <div className={`pointer-events-none absolute inset-0 ${menuOpen ? "z-30" : "z-20"}`}>
      {/* ── compact top bar (notch-safe) ── */}
      <div className="absolute left-[calc(var(--safe-l)+0.5rem)] right-[calc(var(--safe-r)+0.5rem)] top-[calc(var(--safe-t)+0.5rem)] flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-white/80 py-1.5 pl-2.5 pr-3 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-6 w-6 rounded-lg object-cover" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-xs">🏠</span>
          )}
          <p className="truncate text-[12px] font-extrabold text-[#3d3347]">
            {p.roomName} <span className="font-semibold text-[#8a7f98]">· {p.count}</span>
          </p>
          {p.onSignOut && (
            <button onClick={p.onSignOut} title="sign out" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[11px]">
              ⏻
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="pointer-events-auto flex h-8 items-center gap-1 rounded-2xl bg-white/70 px-2 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
            {p.others.slice(0, 5).map(([id, pl]) => (
              <span key={id} title={pl.name} className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
            ))}
            {p.others.length === 0 && <span className="px-0.5 text-[10px] font-semibold text-[#8a7f98]">just you</span>}
            {p.simulated && <span className="pl-0.5 text-[10px]">🤖</span>}
          </div>
          {(fs.active || fs.offer) && <FullscreenToggle active={fs.active} onClick={onFullscreenToggle} />}
        </div>
      </div>

      {/* ── fullscreen nudge + toasts ── */}
      <div className="absolute left-1/2 top-[calc(var(--safe-t)+3rem)] flex w-max max-w-[min(86vw,420px)] -translate-x-1/2 flex-col items-center gap-1">
        {nudgeOpen && fs.offer && !menuOpen && (
          <FullscreenNudge offer={fs.offer} onGo={goFullscreen} onDismiss={dismissNudge} />
        )}
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

      {/* ── joystick, left thumb zone ── */}
      <Joystick />

      {/* ── right cluster: ⋯ menu above the universal ACT button ──
          ACT's slot is always reserved, so ⋯ never jumps when ACT pops in. */}
      <div
        ref={clusterRef}
        className="absolute bottom-[calc(var(--safe-b)+3.5rem)] right-[calc(var(--safe-r)+2.25rem)] flex w-[76px] flex-col items-center gap-3"
      >
        <button
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          title="actions & social"
          aria-label={menuOpen ? "close menu" : "open menu"}
          aria-expanded={menuOpen}
          className={`pointer-events-auto relative flex h-12 w-12 touch-manipulation items-center justify-center rounded-full text-lg font-black shadow-lg ring-1 ring-black/[0.07] backdrop-blur transition-all active:scale-90 ${menuOpen ? "bg-[#3d3347] text-white" : "bg-white/90 text-[#4a3f55]"}`}
        >
          <span className={`transition-transform duration-200 ${menuOpen ? "rotate-90" : ""}`}>{menuOpen ? "✕" : "⋯"}</span>
          {!menuOpen && menuAlert && (
            <span className="absolute right-0.5 top-0.5 block h-3 w-3 rounded-full bg-[#ff3b3b] ring-2 ring-white" />
          )}
        </button>

        <div className="relative h-[76px] w-[76px]">
          {primary ? (
            <button
              key={primary.key}
              onClick={primary.run}
              style={{ boxShadow: `0 10px 28px -8px ${primary.glow}`, borderColor: primary.glow }}
              className="animate-pop-in pointer-events-auto flex h-full w-full touch-manipulation flex-col items-center justify-center rounded-full border-2 bg-white/95 backdrop-blur transition-transform active:scale-90"
            >
              <span className="text-2xl leading-none">{primary.icon}</span>
              <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-[#3d3347]">act</span>
              <span className="-mt-0.5 max-w-[64px] truncate text-[8px] font-bold uppercase tracking-wide text-[#8a7f98]">{primary.label}</span>
            </button>
          ) : (
            // resting ghost: marks where contextual actions will appear
            <span className="absolute inset-2 rounded-full border-2 border-dashed border-white/45" />
          )}
        </div>

        {/* menu popover — opens left of the cluster, bottom-aligned, and
            scrolls when the screen is short (browser bars, small phones).
            `invisible` when closed: visibility:hidden is never hit-testable. */}
        <div
          role="menu"
          className={`absolute bottom-0 right-[calc(100%+0.75rem)] flex max-h-[calc(100dvh-var(--safe-t)-var(--safe-b)-7.5rem)] w-[13.25rem] origin-bottom-right flex-col rounded-[20px] bg-white/95 shadow-2xl ring-1 ring-black/[0.08] backdrop-blur transition-all duration-200 ${menuOpen ? "pointer-events-auto visible translate-x-0 scale-100 opacity-100" : "pointer-events-none invisible translate-x-2 scale-95 opacity-0"}`}
        >
          {/* block (not flex) scroller: children overflow and scroll instead of squashing */}
          <div className="min-h-0 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
            {view === "grid" ? (
              <>
                <p className={`truncate px-1 pb-1.5 ${label}`}>
                  {p.nearName ? `✋ near ${p.nearName.slice(0, 12)}` : "walk up to a friend to poke"}
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {tiles.map((t) => (
                    <button
                      key={t.key}
                      role="menuitem"
                      disabled={t.disabled}
                      onClick={() => {
                        t.run();
                        if (!t.keepOpen) closeMenu();
                      }}
                      className={`relative flex h-[52px] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-bold leading-none transition-all active:scale-90 disabled:opacity-35 ${t.on ? "bg-[#3d3347] text-white" : "bg-[#3d3347]/[0.05] text-[#4a3f55]"}`}
                    >
                      <span className="text-[19px] leading-none">{t.icon}</span>
                      <span className="max-w-full truncate px-0.5">{t.label}</span>
                      {t.badge ? (
                        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b3b] px-1 text-[9px] font-black text-white ring-2 ring-white">
                          {t.badge}
                        </span>
                      ) : t.dot ? (
                        <span className="absolute right-1.5 top-1.5 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between pb-1.5">
                  <button
                    onClick={() => setView("grid")}
                    className="flex h-7 touch-manipulation items-center gap-1 rounded-full bg-[#3d3347]/[0.06] pl-2 pr-2.5 text-[11px] font-bold text-[#4a3f55] active:scale-95"
                  >
                    ‹ back
                  </button>
                  <p className={`pr-1 ${label}`}>react</p>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {EMOTES.map((e) => (
                    <button
                      key={e}
                      role="menuitem"
                      aria-label={`send ${e}`}
                      onClick={() => {
                        p.onEmote(e);
                        closeMenu();
                      }}
                      className="flex h-11 touch-manipulation items-center justify-center rounded-xl bg-[#3d3347]/[0.04] text-[22px] transition-transform active:scale-90"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
