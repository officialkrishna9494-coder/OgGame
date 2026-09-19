"use client";

// ─── Cozy Hall · auth gate — one proper flow, toggled by env ─────────────────
// dev + quickplay   → walk straight in, zero clicks (fastest testing)
// dev + no quickplay→ nickname form
// firebase          → Google Sign-in (falls back to nickname if env missing)

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import JoinOverlay from "./JoinOverlay";
import {
  AUTH_MODE,
  DEV_QUICKPLAY,
  firebaseConfigured,
  makeQuickplayIdentity,
  storeProfile,
  type Identity,
} from "../lib/auth";

interface Props {
  roomName: string;
  tagline: string;
  children: (me: Identity) => ReactNode;
}

type GateMode = "quick" | "nickname" | "google" | "missing";

function initialMode(): GateMode {
  if (AUTH_MODE === "firebase") return firebaseConfigured() ? "google" : "missing";
  return DEV_QUICKPLAY ? "quick" : "nickname";
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#f6efe6]/60 p-4 backdrop-blur-[6px]">
      <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white/85 p-7 text-center shadow-[0_24px_70px_-20px_rgba(120,90,140,0.35)]">
        {children}
      </div>
    </div>
  );
}

export default function AuthGate({ roomName, tagline, children }: Props) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [mode, setMode] = useState<GateMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // dev quickplay: generate identity right after mount, no login friction.
  // NOTE: no "already ran" guard here — React StrictMode mounts, unmounts,
  // and remounts effects in dev, so a guard would cancel the only timeout
  // that was ever going to fire and strand us on the splash forever.
  useEffect(() => {
    if (mode !== "quick") return;
    const t = window.setTimeout(() => setIdentity(makeQuickplayIdentity()), 60);
    return () => window.clearTimeout(t);
  }, [mode]);

  // firebase: restore session
  useEffect(() => {
    if (mode !== "google") return;
    let alive = true;
    let off: (() => void) | undefined;
    import("../lib/firebase-auth")
      .then((m) => m.watchAuth((id) => alive && setIdentity(id)))
      .then((unsub) => {
        off = unsub;
      })
      .catch(() => alive && setError("couldn't reach Google sign-in — check your connection"));
    return () => {
      alive = false;
      off?.();
    };
  }, [mode]);

  if (identity) return <>{children(identity)}</>;

  if (mode === "quick") {
    return (
      <main
        className="relative flex h-dvh w-full cursor-pointer items-center justify-center overflow-hidden bg-[#f6efe6]"
        onClick={() => setIdentity((id) => id ?? makeQuickplayIdentity())}
      >
        <div className="animate-pulse text-center">
          <div className="flex justify-center text-[#3d3347]">
            <Icon name="home" size={40} />
          </div>
          <p className="mt-2 text-sm font-bold text-[#8a7f98]">waking up {roomName}…</p>
          <p className="mt-1 text-[11px] font-medium text-[#a99cbb]">tap anywhere if this takes a moment</p>
        </div>
      </main>
    );
  }

  if (mode === "nickname") {
    return (
      <JoinOverlay
        roomName={roomName}
        tagline={tagline}
        onJoin={(name, color, outfit, hairstyle) => {
          storeProfile({ name, color, outfit, hairstyle });
          setIdentity({ name, color, outfit, hairstyle });
        }}
      />
    );
  }

  if (mode === "missing") {
    return (
      <Card>
        <div className="flex justify-center text-[#3d3347]">
          <Icon name="wrench" size={32} />
        </div>
        <h1 className="mt-2 text-xl font-extrabold text-[#3d3347]">sign-in not configured</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[#8a7f98]">
          <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12px]">NEXT_PUBLIC_AUTH_MODE=firebase</code> is
          set, but the Firebase env vars are missing.
        </p>
        <button
          onClick={() => setMode("nickname")}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#3d3347] py-3 text-sm font-bold text-white hover:bg-[#2e2735]"
        >
          continue with a nickname <Icon name="arrowRight" size={15} />
        </button>
      </Card>
    );
  }

  // google
  const login = () => {
    setBusy(true);
    setError(null);
    import("../lib/firebase-auth")
      .then((m) => m.signInWithGoogle())
      .then((id) => setIdentity(id))
      .catch(() => {
        setError("sign-in was cancelled or blocked");
        setBusy(false);
      });
  };

  return (
    <Card>
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a08fb5]">private hall · 5–10 friends</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#3d3347]">{roomName}</h1>
      <p className="mt-1 text-sm text-[#8a7f98]">{tagline}</p>
      <button
        onClick={login}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-black/10 bg-white py-3.5 text-[15px] font-bold text-[#3d3347] shadow-sm transition-all hover:bg-[#f6f2ea] active:scale-[0.98] disabled:opacity-50"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC05] text-[11px] font-black text-white">
          G
        </span>
        {busy ? "opening Google…" : "continue with Google"}
      </button>
      {error && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#b03939]">
          <Icon name="warning" size={14} /> {error}
        </p>
      )}
      <button onClick={() => setMode("nickname")} className="mt-4 text-[12px] font-semibold text-[#a08fb5] hover:text-[#3d3347]">
        use a nickname instead
      </button>
    </Card>
  );
}
