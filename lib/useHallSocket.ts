"use client";

// ─── Cozy Hall · realtime hook (Socket.io with cozy bot fallback) ───────────
// Production split: Firestore = persistent room data. Socket = ephemeral
// presence / movement / emotes / TV sync. If no socket server is reachable
// (e.g. Vercel serverless preview), we spawn 3 cute bots so the hall still
// feels alive and physics can be tried solo.

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BALL_SPAWN } from "./room-defaults";
import { CART_SPAWNS } from "./hall-layout";
import { CHAT_MAX_LEN, IDLE_DODGE, IDLE_GAME, IDLE_RPS, isOutfit, resolveHairstyle, type CartState, type HairstyleId, type BallState, type DodgeState, type GameState, type OutfitId, type PlayerState, type RpsChoice, type RpsState, type SosState, type TvState } from "./hall-types";

export interface HallSnapshot {
  connected: boolean;
  simulated: boolean;
  mySocketId: string;
  players: Record<string, PlayerState>;
  ball: BallState;
  tv: TvState;
  game: GameState;
  rps: RpsState;
  sos: SosState | null;
  dodge: DodgeState;
  carts: CartState[];
  /** add to Date.now() to read the server's clock (round timers, live throws) */
  serverOffset: number;
  toasts: Toast[];
}

/** A HUD notification. `icon` is an icon name from components/icons. */
export interface Toast {
  id: number;
  text: string;
  icon?: string;
}

let toastSeq = 0;

// Toasts arrive as { text, icon }. A plain string is an older server build —
// strip its emoji so the HUD stays consistent with the icon set.
function toToast(payload: unknown): { text: string; icon?: string } | null {
  if (typeof payload === "string") {
    const text = payload.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
    return text ? { text } : null;
  }
  if (payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string") {
    const { text, icon } = payload as { text: string; icon?: unknown };
    return { text, icon: typeof icon === "string" ? icon : undefined };
  }
  return null;
}

interface JoinInfo {
  name: string;
  color: string;
  outfit: OutfitId;
  hairstyle: HairstyleId;
}

export interface ProfilePatch {
  name: string;
  color: string;
  outfit: OutfitId;
  hairstyle: HairstyleId;
}

const BOT_NAMES: Array<{ name: string; color: string; outfit: OutfitId }> = [
  { name: "Mochi", color: "#9bf6ff", outfit: "dress" },
  { name: "Pudding", color: "#ffd6a5", outfit: "suit" },
  { name: "Boba", color: "#bdb2ff", outfit: "dress" },
];
function botPlayer(i: number, t: number): PlayerState {
  const base = BOT_NAMES[i % BOT_NAMES.length];
  const a = t / 2600 + i * 2.1;
  return {
    id: `bot-${i}`,
    name: base.name,
    color: base.color,
    outfit: base.outfit,
    hairstyle: resolveHairstyle(base.outfit, undefined),
    x: Math.sin(a) * 8,
    z: Math.cos(a * 0.8) * 5 + 1,
    facing: Math.atan2(Math.cos(a), -Math.sin(a * 0.8)),
    moving: true,
    sitting: false,
    jumping: false,
  };
}

/** parked carts for offline / bot mode (no drivers, no motion) */
function idleCarts(): CartState[] {
  return CART_SPAWNS.map((s) => ({ id: s.id, x: s.x, z: s.z, facing: s.facing, speed: 0, driverId: null, color: s.color, boost: 0, y: 0 }));
}

export function useHallSocket(me: JoinInfo | null) {
  const [snapshot, setSnapshot] = useState<HallSnapshot>({
    connected: false,
    simulated: true,
    mySocketId: "",
    players: {},
    ball: { x: BALL_SPAWN.x, z: BALL_SPAWN.z, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null },
    tv: { playlist: [], index: 0, playing: false, positionSec: 0, updatedAt: 0 },
    game: IDLE_GAME,
    rps: IDLE_RPS,
    sos: null,
    dodge: IDLE_DODGE,
    carts: idleCarts(),
    serverOffset: 0,
    toasts: [],
  });
  const offsetRef = useRef<number | null>(null);

  const identityRef = useRef(me);
  useEffect(() => { identityRef.current = me; }, [me]);
  const socketRef = useRef<Socket | null>(null);
  const localRef = useRef<PlayerState | null>(null);
  const remoteRef = useRef<Record<string, PlayerState>>({});
  const ballRef = useRef<BallState>({ x: BALL_SPAWN.x, z: BALL_SPAWN.z, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null });
  const tvRef = useRef<TvState>({ playlist: [], index: 0, playing: false, positionSec: 0, updatedAt: 0 });

  const pushToast = useCallback((text: string, icon?: string) => {
    const id = ++toastSeq;
    setSnapshot((s) => ({ ...s, toasts: [...s.toasts.slice(-2), { id, text, icon }] }));
    window.setTimeout(() => {
      setSnapshot((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  }, []);

  // ── connect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!me) return;
    let dead = false;
    let botTimer: ReturnType<typeof setInterval> | null = null;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
      path: "/socket.io",
      reconnectionAttempts: 2,
      timeout: 2500,
    });
    socketRef.current = socket;

    const failToBots = () => {
      if (dead) return;
      setSnapshot((s) => ({ ...s, connected: false, simulated: true }));
      // gentle wandering bots so Milestone 1 reads instantly, even solo
      botTimer = setInterval(() => {
        if (dead) return;
        const t = Date.now();
        const bots: Record<string, PlayerState> = {};
        for (let i = 0; i < 3; i++) bots[`bot-${i}`] = botPlayer(i, t);
        setSnapshot((s) => ({
          ...s,
          players: { ...bots, ...(localRef.current ? { [localRef.current.id]: localRef.current } : {}) },
          ball: { ...ballRef.current },
          tv: { ...tvRef.current },
          carts: idleCarts(),
        }));
      }, 100);
    };

    const timer = window.setTimeout(() => {
      if (!socket.connected) {
        socket.close();
        failToBots();
      }
    }, 2800);

    socket.on("connect", () => {
      window.clearTimeout(timer);
      if (dead) return;
      setSnapshot((s) => ({ ...s, connected: true, simulated: false, mySocketId: socket.id ?? "" }));
      const identity = identityRef.current;
      socket.emit("hall:join", {
        name: identity?.name ?? "Friend",
        color: identity?.color ?? "#ffb3c7",
        outfit: identity && isOutfit(identity.outfit) ? identity.outfit : "suit",
        hairstyle: resolveHairstyle(identity?.outfit ?? "suit", identity?.hairstyle),
      });
    });
    socket.on("connect_error", failToBots);
    socket.on("hall:state", (state: { players: Record<string, PlayerState>; ball: BallState; tv: TvState; game?: GameState; rps?: RpsState; sos?: SosState | null; dodge?: DodgeState; carts?: CartState[]; now?: number }) => {
      // server clock offset, smoothed so one slow packet can't jolt timers
      if (typeof state.now === "number") {
        const sample = state.now - Date.now();
        offsetRef.current = offsetRef.current === null ? sample : offsetRef.current * 0.85 + sample * 0.15;
      }
      // The server echoes our own player back under our socket.id — drop it so
      // we render exactly ONE self avatar (the local "me" prediction).
      const mine = socket.id;
      const others = { ...state.players };
      if (mine) delete others[mine];
      remoteRef.current = others;
      const ball = state.ball?.holderId === mine ? { ...state.ball, holderId: "me" } : state.ball;
      ballRef.current = ball;
      tvRef.current = state.tv;
      const game = state.game ?? IDLE_GAME;
      const rps = state.rps ?? IDLE_RPS;
      const sos = state.sos ?? null;
      const dodge = state.dodge ?? IDLE_DODGE;
      const carts = Array.isArray(state.carts) ? state.carts : idleCarts();
      const serverOffset = offsetRef.current ?? 0;
      setSnapshot((s) => ({
        ...s,
        players: { ...others, ...(localRef.current ? { [localRef.current.id]: localRef.current } : {}) },
        ball,
        tv: state.tv,
        game,
        rps,
        sos,
        dodge,
        carts,
        serverOffset,
      }));
    });
    socket.on("hall:toast", (payload: unknown) => {
      const t = toToast(payload);
      if (t) pushToast(t.text, t.icon);
    });

    return () => {
      dead = true;
      window.clearTimeout(timer);
      if (botTimer) clearInterval(botTimer);
      socket.close();
      socketRef.current = null;
    };
    // Connect once per identity session. Profile edits (name / outfit /
    // clothing color) travel over `hall:profile` via updateProfile — they must
    // NOT reconnect, or the avatar would respawn across the hall every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me !== null]);

  // ── emitters (also applied locally for instant feel) ─────────────────────
  const emit = useCallback(
    (ev: string, payload?: unknown) => socketRef.current?.emit(ev, payload),
    []
  );

  const publishLocal = useCallback((p: PlayerState | null) => {
    localRef.current = p;
    if (p) {
      setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
    }
  }, []);

  const sendMove = useCallback(
    (p: PlayerState) => {
      localRef.current = p;
      emit("hall:move", p);
      // in simulated mode the interval loop already merges local; in live
      // mode do an optimistic merge so own movement never stutters
      setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
    },
    [emit]
  );

  const sendEmote = useCallback(
    (emoji: string) => {
      if (!localRef.current) return;
      const p = { ...localRef.current, emote: emoji, emoteAt: Date.now() };
      localRef.current = p;
      emit("hall:emote", { emote: emoji });
      setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
    },
    [emit]
  );

  // live profile edit (name / outfit / clothing color): instant locally,
  // relayed to the server's meta so every screen re-tints without rejoining
  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      const clean = {
        name: patch.name.trim().slice(0, 14) || "Friend",
        color: patch.color,
        outfit: patch.outfit,
        hairstyle: resolveHairstyle(patch.outfit, patch.hairstyle),
      };
      if (localRef.current) {
        const next = { ...localRef.current, ...clean };
        localRef.current = next;
        setSnapshot((s) => ({ ...s, players: { ...s.players, [next.id]: next } }));
      }
      emit("hall:profile", clean);
    },
    [emit]
  );

  // ── hall carts: hop in / out / drive ─────────────────────────────────────
  // Enter + exit apply instantly locally (the 3D loop picks cartId up next
  // frame) and the server confirms on the next snapshot.
  const enterCart = useCallback(
    (cartId: string) => {
      if (localRef.current) {
        const next = { ...localRef.current, cartId, sitting: false, seat: null, seatMode: null };
        localRef.current = next;
        setSnapshot((s) => ({ ...s, players: { ...s.players, [next.id]: next } }));
      }
      emit("cart:enter", { cartId });
    },
    [emit]
  );

  const exitCart = useCallback(() => {
    if (localRef.current) {
      const next = { ...localRef.current, cartId: null };
      localRef.current = next;
      setSnapshot((s) => ({ ...s, players: { ...s.players, [next.id]: next } }));
    }
    emit("cart:exit", {});
  }, [emit]);

  const driveCart = useCallback(
    (c: { id: string; x: number; z: number; facing: number; speed: number; boost?: number; steer?: number; y?: number }) => {
      emit("cart:drive", c);
    },
    [emit]
  );

  const sendAction = useCallback(
    (kind: "poke" | "highfive" | "sit" | "wave", targetId?: string | null, opts?: { seatMode?: "sofa" | null }) => {
      if (!localRef.current) return;
      if (kind === "sit") {
        const sitting = !localRef.current.sitting;
        const p = {
          ...localRef.current,
          sitting,
          seatMode: (sitting ? (opts?.seatMode ?? null) : null) as "sofa" | null,
          seat: null,
        };
        localRef.current = p;
        emit("hall:sit", { sitting: p.sitting, seatMode: p.seatMode });
        setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
        return;
      }
      const p = {
        ...localRef.current,
        action: kind as "poke" | "highfive",
        actionAt: Date.now(),
        actionTarget: targetId ?? null,
      };
      localRef.current = p;
      emit(kind === "poke" ? "hall:poke" : "hall:highfive", { targetId: targetId ?? null });
      if (kind === "poke" && targetId) {
        const target = remoteRef.current[targetId] ?? snapshot.players[targetId];
        pushToast(`you poked ${target?.name ?? "a friend"}`, "poke");
      }
      setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
      window.setTimeout(() => {
        if (localRef.current && localRef.current.actionAt === p.actionAt) {
          const cleared = { ...localRef.current, action: null, actionTarget: null };
          localRef.current = cleared;
          setSnapshot((s) => ({ ...s, players: { ...s.players, [cleared.id]: cleared } }));
        }
      }, 1400);
    },
    [emit, pushToast, snapshot.players]
  );

  const tossBall = useCallback(() => {
    emit("hall:ball:toss", {});
    // optimistic: throw from local player forward
    const me = localRef.current;
    if (me) {
      ballRef.current = {
        ...ballRef.current,
        holderId: null,
        x: me.x,
        z: me.z,
        y: 1.1,
        vx: Math.sin(me.facing) * 5 + (Math.random() - 0.5),
        vy: 4.4,
        vz: Math.cos(me.facing) * 5,
      };
      setSnapshot((s) => ({ ...s, ball: { ...ballRef.current } }));
    }
  }, [emit]);

  const setBall = useCallback(
    (b: BallState) => {
      ballRef.current = b;
      emit("hall:ball", b);
    },
    [emit]
  );

  // `seekTo` is converted to positionSec server-side; heartbeats are bare positionSec.
  const tvControl = useCallback(
    (patch: Partial<TvState> & { seekTo?: number }) => {
      const { seekTo: _seek, ...rest } = patch;
      void _seek;
      tvRef.current = { ...tvRef.current, ...rest, updatedAt: Date.now() };
      emit("hall:tv", patch);
      setSnapshot((s) => ({ ...s, tv: { ...tvRef.current } }));
    },
    [emit]
  );

  const startGame = useCallback(() => {
    emit("game:start", {});
  }, [emit]);

  const sendHit = useCallback(() => {
    emit("hall:hit", {});
  }, [emit]);

  const lastChatAt = useRef(0);

  // instant overhead bubble (history itself persists via Firestore)
  const sendChat = useCallback(
    (text: string) => {
      const now = Date.now();
      if (now - lastChatAt.current < 1200 || !localRef.current) return;
      const clean = text.trim().slice(0, CHAT_MAX_LEN);
      if (!clean) return;
      lastChatAt.current = now;
      const p = { ...localRef.current, chat: clean, chatAt: now };
      localRef.current = p;
      emit("hall:chat", { text: clean });
      setSnapshot((s) => ({ ...s, players: { ...s.players, [p.id]: p } }));
    },
    [emit]
  );

  const raiseSos = useCallback(() => {
    emit("sos:raise", {});
  }, [emit]);

  const challengeRps = useCallback(() => {
    emit("rps:challenge", {});
  }, [emit]);

  const pickRps = useCallback(
    (choice: RpsChoice) => {
      emit("rps:pick", { choice });
    },
    [emit]
  );

  const leaveRps = useCallback(() => {
    emit("rps:leave", {});
  }, [emit]);

  // ── dodgeball ──
  const startDodge = useCallback(() => emit("dodge:start", {}), [emit]);
  const pickupDodge = useCallback((ballId: string) => emit("dodge:pickup", { ballId }), [emit]);
  const throwDodge = useCallback(
    (ballId: string, b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }) =>
      emit("dodge:throw", { ballId, ...b }),
    [emit]
  );
  const spendDodge = useCallback((ballId: string, rev: number) => emit("dodge:spend", { ballId, rev }), [emit]);
  const hitDodge = useCallback(
    (ballId: string, b: { x: number; y: number; z: number; vx: number; vz: number }) => emit("dodge:hit", { ballId, ...b }),
    [emit]
  );

  const collectStar = useCallback(
    (starId: string) => {
      emit("game:collect", { starId });
    },
    [emit]
  );

  return {
    snapshot,
    connected: snapshot.connected,
    simulated: snapshot.simulated,
    publishLocal,
    sendMove,
    sendEmote,
    updateProfile,
    enterCart,
    exitCart,
    driveCart,
    sendAction,
    tossBall,
    setBall,
    tvControl,
    startGame,
    sendHit,
    sendChat,
    raiseSos,
    challengeRps,
    pickRps,
    leaveRps,
    collectStar,
    startDodge,
    pickupDodge,
    throwDodge,
    spendDodge,
    hitDodge,
    pushToast,
  };
}

export type HallSocket = ReturnType<typeof useHallSocket>;
