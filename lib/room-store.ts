"use client";

// ─── Cozy Hall · room store (Firestore live, localStorage fallback) ─────────
// When Firebase is configured: subscribe to `rooms/cozy-hall` so admin edits
// appear on every friend's wall in real time; localStorage stays as cache.
// Without Firebase: pure localStorage, exactly like before.

import { useCallback, useEffect, useState } from "react";
import type { RoomConfig } from "./hall-types";
import { DEFAULT_ROOM } from "./room-defaults";
import { dbConfigured } from "./db";

const KEY = "cozy-hall-room-v1";

export type SyncStatus = "local" | "syncing" | "live";

export function loadRoom(): RoomConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ROOM;
    const parsed = JSON.parse(raw) as RoomConfig;
    if (!parsed.frames || !parsed.tv) return DEFAULT_ROOM;
    return { ...DEFAULT_ROOM, ...parsed };
  } catch {
    return DEFAULT_ROOM;
  }
}

export function saveRoom(room: RoomConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(room));
  } catch {
    /* private mode */
  }
}

export function useRoom() {
  const [room, setRoom] = useState<RoomConfig>(() =>
    typeof window === "undefined" ? DEFAULT_ROOM : loadRoom()
  );
  const [sync, setSync] = useState<SyncStatus>(() => (dbConfigured() ? "syncing" : "local"));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          setRoom({ ...DEFAULT_ROOM, ...JSON.parse(e.newValue) });
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Firestore live subscription (no-op without config)
  useEffect(() => {
    if (!dbConfigured()) return;
    let off: (() => void) | undefined;
    let alive = true;
    import("./db")
      .then((m) =>
        m.watchRoomCloud((cloud) => {
          if (!alive || !cloud) return;
          const merged = { ...DEFAULT_ROOM, ...cloud };
          setRoom(merged);
          saveRoom(merged);
        })
      )
      .then((unsub) => {
        off = unsub;
        if (alive) {
          setSync("live");
          // seed the cloud doc on first run so friends see the same room
          import("./db").then((m) =>
            m.loadRoomCloud().then((existing) => {
              if (alive && !existing) m.saveRoomCloud(loadRoom()).catch(() => {});
            }).catch(() => {})
          );
        }
      })
      .catch(() => alive && setSync("local"));
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const updateRoom = useCallback((next: RoomConfig) => {
    setRoom(next);
    saveRoom(next);
    if (dbConfigured()) {
      import("./db").then((m) => m.saveRoomCloud(next).catch(() => {}));
    }
  }, []);

  return { room, updateRoom, sync };
}
