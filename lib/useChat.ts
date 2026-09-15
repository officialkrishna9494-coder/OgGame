"use client";

// ─── Cozy Hall · persistent chat hook ───────────────────────────────────────
// History lives in Firestore (rooms/cozy-hall/messages) with a live
// subscription — every friend sees every message, across restarts.
// Instant overhead bubbles travel separately over sockets (see sendChat).

import { useCallback, useEffect, useState } from "react";
import type { ChatMsg } from "./hall-types";
import { dbConfigured } from "./db";

export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!dbConfigured()) return;
    let off: (() => void) | undefined;
    let alive = true;
    import("./db")
      .then((m) => m.watchMessages((msgs) => alive && setMessages(msgs)))
      .then((unsub) => {
        off = unsub;
        if (alive) setLive(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  // throws (with .code) when offline / unsigned / rule-blocked — panel shows it
  const send = useCallback(async (m: { name: string; color: string; text: string }) => {
    const db = await import("./db");
    await db.sendMessage(m);
  }, []);

  return { messages, send, live, cloud: dbConfigured() };
}

export type Chat = ReturnType<typeof useChat>;
