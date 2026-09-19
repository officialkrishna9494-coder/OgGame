"use client";

// ─── Cozy Hall · HUD — one environment, everything within reach ─────────────
// Desktop: single rounded action dock along the bottom, with the contextual
// action first (press E) and a keyboard legend underneath. (Untouched.)
// Mobile landscape, console layout:
//   LEFT thumb .... floating joystick (on foot) · steer ◀ ▶ + TURBO (in car)
//   RIGHT thumb ... ACT circle (upper, contextual) above JUMP = SPACE (lower,
//                   on foot) · ACT above pedals ▲ ▼ (in car)
//   TOP-RIGHT ..... ⋯ tile menu (every other action: react, poke, tv, …)
// Both: an in-world prompt floats over whatever you can use right now.
// Icons come from components/icons — emoji appear only as emotes.

import { useEffect, useRef, useState } from "react";
import { EMOTES } from "../lib/hall-types";
import type { ContextState, PlayerState } from "../lib/hall-types";
import { markNudgeSeen, nudgeSeen, useFullscreen } from "../lib/fullscreen";
import { resolveAction, type ActionKey, type InteractAction } from "../lib/interaction";
import type { Toast } from "../lib/useHallSocket";
import { useInteraction, type Interaction } from "../lib/useInteraction";
import type { VoiceStatus } from "../lib/useVoice";
import { FullscreenNudge, FullscreenToggle } from "./FullscreenControls";
import { Icon, isIconName, type IconName } from "./icons";
import InteractPrompt, { KeyCap } from "./InteractPrompt";
import Joystick from "./Joystick";
import CarPad from "./CarPad";
import TurboGauge from "./TurboGauge";
import ActButton from "./touch/ActButton";
import JumpButton from "./touch/JumpButton";

interface Props {
  roomName: string;
  players: Record<string, PlayerState>;
  toasts: Toast[];
  sitting: boolean;
  nearName: string | null;
  tvOpen: boolean;
  tvTitle: string;
  simulated: boolean;
  photoUrl?: string;
  mobile?: boolean;
  context?: ContextState;
  gameStatus?: string;
  rpsStatus?: string;
  rpsSeat?: "a" | "b" | null;
  dodgeStatus?: string;
  unreadCount?: number;
  chatOpen?: boolean;
  voiceStatus?: VoiceStatus;
  voiceOpen?: boolean;
  voiceCount?: number;
  onSignOut?: () => void;
  onOpenProfile: () => void;
  onEmote: (e: string) => void;
  onPoke: () => void;
  onHighfive: () => void;
  onSit: () => void;
  onSofaSit: () => void;
  onToss: () => void;
  onDriveCart: () => void;
  onParkCart: () => void;
  onToggleTv: () => void;
  /** star scramble starts from the rug (ACT / E) — it has no menu button */
  onStartGame: () => void;
  /** dodgeball starts from the court's pad (ACT / E) — no menu button either */
  onStartDodge: () => void;
  onToggleVoice: () => void;
  onToggleRps: () => void;
  onRpsAct: () => void;
  onToggleChat: () => void;
  onToggleView: () => void;
  onSos: () => void;
  onOpenAddLink: () => void;
}

type HudProps = Props & {
  others: Array<[string, PlayerState]>;
  count: number;
  action: InteractAction | null;
  interaction: Interaction;
};

export default function Hud(p: Props) {
  const [emoteOpen, setEmoteOpen] = useState(false);
  const others = Object.entries(p.players).filter(([id]) => id !== "me");
  const count = Object.keys(p.players).length;

  // the one contextual action — same resolver the 3D prompt uses
  const action = resolveAction(p.context, {
    sitting: p.sitting,
    driving: !!p.players["me"]?.cartId,
    gameStatus: p.gameStatus,
    rpsStatus: p.rpsStatus,
    rpsSeat: p.rpsSeat,
    dodgeStatus: p.dodgeStatus,
  });
  const run = (key: ActionKey) => {
    if (key === "sos") p.onSos();
    else if (key === "toss") p.onToss();
    else if (key === "drive") p.onDriveCart();
    else if (key === "park") p.onParkCart();
    else if (key === "addLink") p.onOpenAddLink();
    else if (key === "duel") p.onRpsAct();
    else if (key === "starGame") p.onStartGame();
    else if (key === "dodge") p.onStartDodge();
    else p.onSofaSit(); // sit / stand
  };
  const interaction = useInteraction(action, run);

  if (p.mobile) return <MobileHud {...p} others={others} count={count} action={action} interaction={interaction} />;

  const btn =
    "flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-white/85 px-3.5 text-[13px] font-bold text-[#4a3f55] shadow-[0_6px_20px_-8px_rgba(90,70,110,0.4)] ring-1 ring-black/[0.06] backdrop-blur transition-all hover:bg-white active:scale-95 disabled:opacity-35 disabled:saturate-50";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
      <InteractPrompt action={action} interaction={interaction} showKey />
      <TurboGauge />

      {/* ── top bar ── */}
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/80 py-2 pl-3 pr-4 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-white">
              <Icon name="home" size={17} />
            </span>
          )}
          <div className="leading-tight">
            <p className="text-[13px] font-extrabold text-[#3d3347]">{p.roomName}</p>
            <p className="flex items-center gap-1 text-[11px] font-medium text-[#8a7f98]">
              {count} inside ·{" "}
              {p.simulated ? (
                <>
                  demo bots <Icon name="bot" size={12} />
                </>
              ) : (
                "live"
              )}
            </p>
          </div>
          {p.onSignOut && (
            <button
              onClick={p.onSignOut}
              title="sign out"
              aria-label="sign out"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-[#4a3f55] transition-colors hover:bg-black/10"
            >
              <Icon name="signOut" size={14} />
            </button>
          )}
          <button
            onClick={p.onOpenProfile}
            title="edit profile — name, look, clothing color"
            aria-label="edit profile"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-[#4a3f55] transition-colors hover:bg-black/10"
          >
            <Icon name="user" size={14} />
          </button>
        </div>

        <div className="pointer-events-auto flex max-w-[46vw] flex-wrap items-center justify-end gap-1.5 rounded-2xl bg-white/70 px-2.5 py-2 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {others.slice(0, 8).map(([id, pl]) => (
            <span key={id} title={pl.name} className="flex h-7 items-center gap-1 rounded-full bg-white py-0.5 pl-1 pr-2 text-[11px] font-bold text-[#4a3f55] ring-1 ring-black/[0.06]">
              <span className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
              {pl.name.slice(0, 8)}
            </span>
          ))}
          {others.length === 0 && (
            <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-[#8a7f98]">
              <Icon name="user" size={12} /> just you… for now
            </span>
          )}
        </div>
      </div>

      {/* ── toasts ── */}
      <div className="flex flex-col items-center gap-1.5">
        {p.toasts.map((t) => (
          <ToastPill key={t.id} toast={t} />
        ))}
        {p.nearName && (
          <div className="flex items-center gap-1.5 rounded-full bg-[#ff8fab]/95 px-4 py-1.5 text-[12px] font-bold text-white shadow-lg">
            <Icon name="wave" size={14} /> {p.nearName} is close — poke or high-five!
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
                aria-label={`send ${e}`}
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
          {action && (
            <button
              key={action.key}
              {...interaction.bind}
              onContextMenu={(e) => e.preventDefault()}
              className={`${btn} animate-pop-in select-none !bg-[#3d3347] !pr-2 !text-white`}
              style={{ boxShadow: `0 8px 24px -8px ${action.glow}` }}
              title={`${action.prompt} · E`}
            >
              <span key={interaction.pulse} className={`flex items-center gap-1.5 ${interaction.pulse ? "animate-act-press" : ""}`}>
                <Icon name={action.icon} size={17} />
                {action.label}
                <span className="ml-1">
                  <KeyCap holding={interaction.holding} glow={action.glow} />
                </span>
              </span>
            </button>
          )}
          <button className={`${btn} ${emoteOpen ? "!bg-[#3d3347] !text-white" : ""}`} onClick={() => setEmoteOpen((v) => !v)} title="send an emote">
            <Icon name="react" size={17} /> react
          </button>
          <button className={btn} onClick={p.onPoke} disabled={!p.nearName} title={p.nearName ? `poke ${p.nearName}` : "walk close to a friend"}>
            <Icon name="poke" size={17} /> poke
          </button>
          <button className={btn} onClick={p.onHighfive} disabled={!p.nearName} title={p.nearName ? `high-five ${p.nearName}` : "walk close to a friend"}>
            <Icon name="highFive" size={17} /> five
          </button>
          <button className={`${btn} ${p.sitting ? "!bg-[#3d3347] !text-white" : ""}`} onClick={p.onSit} title="sit right here">
            <Icon name="sit" size={17} /> {p.sitting ? "stand" : "sit"}
          </button>
          <button className={btn} onClick={p.onToggleRps} title="rock-paper-scissors arena">
            <IconWithDot name="rps" dot={p.rpsStatus === "picking" || p.rpsStatus === "revealing"} /> rps
          </button>
          <button className={`${btn} ${p.voiceOpen ? "!bg-[#8ce8c0] !text-[#234034]" : ""}`} onClick={p.onToggleVoice} title="voice channel">
            <IconWithDot name="voice" dot={p.voiceStatus === "live"} />
            {p.voiceStatus === "live" ? `voice${p.voiceCount ? ` · ${p.voiceCount}` : ""}` : "voice"}
          </button>
          <button className={`${btn} ${p.tvOpen ? "!bg-[#ff8fab] !text-white" : ""}`} onClick={p.onToggleTv} title="shared TV">
            <Icon name="tv" size={17} /> {p.tvOpen ? "hide" : "tv"}
          </button>
          <button className={`${btn} ${p.chatOpen ? "!bg-[#3d3347] !text-white" : ""}`} onClick={p.onToggleChat} title="hall chat">
            <span className="relative flex">
              <Icon name="chat" size={17} />
              {p.unreadCount ? (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b3b] px-1 text-[9px] font-black text-white ring-2 ring-white">
                  {p.unreadCount > 9 ? "9+" : p.unreadCount}
                </span>
              ) : null}
            </span>
            chat
          </button>
        </div>
        <div className="flex max-w-[92vw] items-center gap-2 text-[11px] font-medium text-[#3d3347]/55">
          {p.tvTitle && (
            <>
              <span className="flex min-w-0 items-center gap-1">
                <Icon name="tv" size={13} />
                <span className="truncate">on the tv · {p.tvTitle}</span>
              </span>
              <span className="h-3 w-px shrink-0 bg-[#3d3347]/20" />
            </>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            <LegendKey>W A S D</LegendKey> move
            <LegendKey>Space</LegendKey> hop
            <LegendKey>E</LegendKey> interact
            <LegendKey>V</LegendKey> view
          </span>
        </div>
      </div>
    </div>
  );
}

function LegendKey({ children }: { children: string }) {
  return (
    <kbd className="rounded-md bg-white/70 px-1.5 py-px font-sans text-[10px] font-bold text-[#3d3347]/80 shadow-[inset_0_-1px_0_rgba(61,51,71,0.18)] ring-1 ring-black/[0.06]">
      {children}
    </kbd>
  );
}

function IconWithDot({ name, dot, size = 17 }: { name: IconName; dot?: boolean; size?: number }) {
  return (
    <span className="relative flex">
      <Icon name={name} size={size} />
      {dot && <span className="absolute -right-1 -top-1 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />}
    </span>
  );
}

function ToastPill({ toast, compact }: { toast: Toast; compact?: boolean }) {
  return (
    <div
      className={`flex max-w-full items-center gap-1.5 rounded-full bg-[#3d3347]/90 font-semibold text-white shadow-lg backdrop-blur ${
        compact ? "px-3 py-1 text-[11px]" : "animate-[floatUp_0.3s_ease-out] px-4 py-1.5 text-[12px]"
      }`}
    >
      {isIconName(toast.icon) && <Icon name={toast.icon} size={compact ? 13 : 14} className="text-[#ffd166]" />}
      <span className="truncate">{toast.text}</span>
    </div>
  );
}

// ─── mobile landscape HUD ───────────────────────────────────────────────────
interface Tile {
  key: string;
  icon: IconName;
  label: string;
  run: () => void;
  on?: boolean;
  disabled?: boolean;
  dot?: boolean;
  badge?: string;
  keepOpen?: boolean; // poke / high-five / react stay open for quick repeats
}

function MobileHud(p: HudProps) {
  const ctx = p.context;
  const { action, interaction } = p;
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"grid" | "emoji">("grid");
  const clusterRef = useRef<HTMLDivElement>(null);
  const fs = useFullscreen();
  const [nudgeOpen, setNudgeOpen] = useState(() => !nudgeSeen());

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
    { key: "react", icon: "react", label: "react", run: () => setView("emoji"), keepOpen: true },
    { key: "poke", icon: "poke", label: "poke", run: p.onPoke, disabled: !p.nearName, keepOpen: true },
    { key: "five", icon: "highFive", label: "high-5", run: p.onHighfive, disabled: !p.nearName, keepOpen: true },
    { key: "tv", icon: "tv", label: p.tvOpen ? "hide tv" : "tv", run: p.onToggleTv, on: p.tvOpen },
    { key: "sit", icon: "sit", label: p.sitting ? "stand" : "sit", run: p.onSit, on: p.sitting },
    { key: "rps", icon: "rps", label: "rps", run: p.onToggleRps, dot: p.rpsStatus === "picking" || p.rpsStatus === "revealing" },
    {
      key: "voice",
      icon: "voice",
      label: "voice",
      run: p.onToggleVoice,
      on: p.voiceOpen,
      dot: p.voiceStatus === "live" && !p.voiceCount,
      badge: p.voiceStatus === "live" && p.voiceCount ? String(p.voiceCount) : undefined,
    },
    {
      key: "chat",
      icon: "chat",
      label: "chat",
      run: p.onToggleChat,
      on: p.chatOpen,
      badge: p.unreadCount ? (p.unreadCount > 9 ? "9+" : String(p.unreadCount)) : undefined,
    },
    { key: "profile", icon: "user", label: "profile", run: p.onOpenProfile },
    { key: "view", icon: "view", label: "view", run: p.onToggleView },
  ];
  // one glanceable signal on the closed ⋯ button
  const menuAlert = !!p.unreadCount || p.rpsStatus === "picking" || p.rpsStatus === "revealing";
  // driving swaps the whole thumb layout for the CarPad hub below
  const driving = !!p.players["me"]?.cartId;

  const label = "text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#a08fb5]";

  return (
    // lifted above the bottom panels only while the menu is open, so the
    // menu never tucks behind an open chat / tv panel
    <div className={`pointer-events-none absolute inset-0 ${menuOpen ? "z-30" : "z-20"}`}>
      {/* in-world prompt sits under the joystick zone, so a thumb landing
          on the stick can never trigger it by accident */}
      <InteractPrompt action={action} interaction={interaction} showKey={false} />
      <TurboGauge />

      {/* ── compact top bar (notch-safe) ── */}
      <div className="absolute left-[calc(var(--safe-l)+0.5rem)] right-[calc(var(--safe-r)+0.5rem)] top-[calc(var(--safe-t)+0.5rem)] flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-white/80 py-1.5 pl-2.5 pr-3 shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="h-6 w-6 rounded-lg object-cover" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff8fab] to-[#bdb2ff] text-white">
              <Icon name="home" size={14} />
            </span>
          )}
          <p className="truncate text-[12px] font-extrabold text-[#3d3347]">
            {p.roomName} <span className="font-semibold text-[#8a7f98]">· {p.count}</span>
          </p>
          {p.onSignOut && (
            <button
              onClick={p.onSignOut}
              title="sign out"
              aria-label="sign out"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[#4a3f55]"
            >
              <Icon name="signOut" size={12} />
            </button>
          )}
          {/* profile customizer (name / look / color) — same entry as desktop */}
          <button
            onClick={p.onOpenProfile}
            title="edit profile — name, look, clothing color"
            aria-label="edit profile"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[#4a3f55]"
          >
            <Icon name="user" size={12} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="pointer-events-auto flex h-8 items-center gap-1 rounded-2xl bg-white/70 px-2 text-[#8a7f98] shadow-lg ring-1 ring-black/[0.05] backdrop-blur">
            {p.others.slice(0, 5).map(([id, pl]) => (
              <span key={id} title={pl.name} className="block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: pl.color }} />
            ))}
            {p.others.length === 0 && (
              <span className="flex items-center gap-1 px-0.5 text-[10px] font-semibold">
                <Icon name="user" size={11} /> just you
              </span>
            )}
            {p.simulated && <Icon name="bot" size={13} label="demo bots" className="ml-0.5" />}
          </div>
          {(fs.active || fs.offer) && <FullscreenToggle active={fs.active} onClick={onFullscreenToggle} />}
        </div>
      </div>

      {/* ── options menu, top-right: the tile grid lives up here so the right
          thumb column stays muscle-clean (jump / act in person, pedals in
          the car). Opens downward; `invisible` is never hit-testable. ── */}
      <div
        ref={clusterRef}
        className="pointer-events-none absolute right-[calc(var(--safe-r)+0.5rem)] top-[calc(var(--safe-t)+3.25rem)] flex flex-col items-end gap-2"
      >
        <button
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          title="actions & social"
          aria-label={menuOpen ? "close menu" : "open menu"}
          aria-expanded={menuOpen}
          className={`pointer-events-auto relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full shadow-lg ring-1 ring-black/[0.07] backdrop-blur transition-all active:scale-90 ${menuOpen ? "bg-[#3d3347] text-white" : "bg-white/90 text-[#4a3f55]"}`}
        >
          <span className={`flex transition-transform duration-200 ${menuOpen ? "rotate-90" : ""}`}>
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
          </span>
          {!menuOpen && menuAlert && (
            <span className="absolute right-0.5 top-0.5 block h-3 w-3 rounded-full bg-[#ff3b3b] ring-2 ring-white" />
          )}
        </button>
        <div
          role="menu"
          className={`w-[15.5rem] origin-top-right rounded-[20px] bg-white/95 shadow-2xl ring-1 ring-black/[0.08] backdrop-blur transition-all duration-200 ${menuOpen ? "pointer-events-auto visible translate-y-0 scale-100 opacity-100" : "pointer-events-none invisible -translate-y-2 scale-95 opacity-0"}`}
        >
          {/* block (not flex) scroller: children overflow and scroll instead of squashing */}
          <div className="max-h-[calc(100dvh-var(--safe-t)-var(--safe-b)-9rem)] min-h-0 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
            {view === "grid" ? (
              <>
                <p className={`flex items-center gap-1 truncate px-1 pb-1.5 ${label}`}>
                  {p.nearName ? (
                    <>
                      <Icon name="wave" size={11} /> near {p.nearName.slice(0, 12)}
                    </>
                  ) : (
                    "walk up to a friend to poke"
                  )}
                </p>
                <div className="grid grid-cols-4 gap-1">
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
                      <Icon name={t.icon} size={20} />
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
                    className="flex h-7 touch-manipulation items-center gap-0.5 rounded-full bg-[#3d3347]/[0.06] pl-1.5 pr-2.5 text-[11px] font-bold text-[#4a3f55] active:scale-95"
                  >
                    <Icon name="back" size={13} /> back
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

      {/* ── fullscreen nudge + toasts ── */}
      <div className="absolute left-1/2 top-[calc(var(--safe-t)+3rem)] flex w-max max-w-[min(86vw,420px)] -translate-x-1/2 flex-col items-center gap-1">
        {nudgeOpen && fs.offer && !menuOpen && (
          <FullscreenNudge offer={fs.offer} onGo={goFullscreen} onDismiss={dismissNudge} />
        )}
        {p.toasts.slice(-1).map((t) => (
          <ToastPill key={t.id} toast={t} compact />
        ))}
        {showBallHint && (
          <div className="animate-pop-in flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#4a3f55] shadow ring-1 ring-black/[0.06]">
            <Icon name="toss" size={13} /> step onto the ball to grab it
          </div>
        )}
      </div>

      {/* ── joystick, left thumb zone (hidden in the car: the hub steers) ── */}
      {!driving && <Joystick />}

      {/* ── on-foot right column: ACT (upper, contextual) above JUMP (lower,
          the mobile SPACE) — same ActButton the car hub uses, so the thumb
          never re-learns it. In the car the column swaps for CarPad. ── */}
      {driving ? (
        <CarPad action={action} interaction={interaction} />
      ) : (
        <div className="absolute bottom-[calc(var(--safe-b)+4.5rem)] right-[calc(var(--safe-r)+2.25rem)] flex w-[76px] flex-col items-center gap-3">
          <ActButton action={action} interaction={interaction} />
          <JumpButton />
        </div>
      )}
    </div>
  );
}
