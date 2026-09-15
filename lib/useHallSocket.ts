"use client";

// ─── Cozy Hall · realtime hook (Socket.io with cozy bot fallback) ───────────
// Production split: Firestore = persistent room data. Socket = ephemeral
// presence / movement / emotes / TV sync. If no socket server is reachable
// (e.g. Vercel serverless preview), we spawn 3 cute bots so the hall still
// feels alive and physics can be tried solo.

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { BallState, PlayerState, TvState } from "./hall-types";

export interface HallSnapshot {
  connected: boolean;
  simulated: boolean;
  players: Record<string, PlayerState>;
  ball: BallState;
  tv: TvState;
  toasts: string[];
}

interface JoinInfo {
  name: string;
  color: string;
}

const BOT_NAMES: Array<{ name: string; color: string }> = [
  { name: "Mochi", color: "#9bf6ff" },
  { name: "Pudding", color: "#ffd6a5" },
  { name: "Boba", color: "#bdb2ff" },
];

function botPlayer(i: number, t: number): PlayerState {
  const base = BOT_NAMES[i % BOT_NAMES.length];
  const a = t / 2600 + i * 2.1;
  return {
    id: `bot-${i}`,
    name: base.name,
    color: base.color,
    x: Math.sin(a) * 8,
    z: Math.cos(a * 0.8) * 5 + 1,
    facing: Math.atan2(Math.cos(a), -Math.sin(a * 0.8)),
    moving: true,
    sitting: false,
    jumping: false,
  };
}

export function useHallSocket(me: JoinInfo | null) {
  const [snapshot, setSnapshot] = useState<HallSnapshot>({
    connected: false,
    simulated: true,
    players: {},
    ball: { x: 3.5, z: 1.0, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null },
    tv: { playlist: [], index: 0, playing: false, updatedAt: 0 },
    toasts: [],
  });

  const socketRef = useRef<Socket | null>(null);
  const localRef = useRef<PlayerState | null>(null);
  const remoteRef = useRef<Record<string, PlayerState>>({});
  const ballRef = useRef<BallState>({ x: 3.5, z: 1.0, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null });
  const tvRef = useRef<TvState>({ playlist: [], index: 0, playing: false, updatedAt: 0 });

  const pushToast = useCallback((text: string) => {
    setSnapshot((s) => ({ ...s, toasts: [...s.toasts.slice(-2), text] }));
    window.setTimeout(() => {
      setSnapshot((s) => ({ ...s, toasts: s.toasts.slice(1) }));
    }, 3200);
  }, []);

  // ── connect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!me) return;
    let dead = false;
    let botTimer: ReturnType<typeof setInterval> | null = null;

    const socket = io({
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
      setSnapshot((s) => ({ ...s, connected: true, simulated: false }));
      socket.emit("hall:join", { name: me?.name ?? "Friend", color: me?.color ?? "#ffb3c7" });
    });
    socket.on("connect_error", failToBots);
    socket.on("hall:state", (state: { players: Record<string, PlayerState>; ball: BallState; tv: TvState }) => {
      // The server echoes our own player back under our socket.id — drop it so
      // we render exactly ONE self avatar (the local "me" prediction).
      const mine = socket.id;
      const others = { ...state.players };
      if (mine) delete others[mine];
      remoteRef.current = others;
      const ball = state.ball?.holderId === mine ? { ...state.ball, holderId: "me" } : state.ball;
      ballRef.current = ball;
      tvRef.current = state.tv;
      setSnapshot((s) => ({
        ...s,
        players: { ...others, ...(localRef.current ? { [localRef.current.id]: localRef.current } : {}) },
        ball,
        tv: state.tv,
      }));
    });
    socket.on("hall:toast", (text: string) => pushToast(text));

    return () => {
      dead = true;
      window.clearTimeout(timer);
      if (botTimer) clearInterval(botTimer);
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.name, me?.color]);

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

  const sendAction = useCallback(
    (kind: "poke" | "highfive" | "sit" | "wave", targetId?: string | null) => {
      if (!localRef.current) return;
      if (kind === "sit") {
        const p = { ...localRef.current, sitting: !localRef.current.sitting };
        localRef.current = p;
        emit("hall:sit", { sitting: p.sitting });
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
        pushToast(`you poked ${target?.name ?? "a friend"} 👉`);
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

  const tvControl = useCallback(
    (patch: Partial<TvState>) => {
      tvRef.current = { ...tvRef.current, ...patch, updatedAt: Date.now() };
      emit("hall:tv", patch);
      setSnapshot((s) => ({ ...s, tv: { ...tvRef.current } }));
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
    sendAction,
    tossBall,
    setBall,
    tvControl,
    pushToast,
  };
}

export type HallSocket = ReturnType<typeof useHallSocket>;
