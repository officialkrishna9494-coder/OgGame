"use client";

// ─── Cozy Hall · room store (localStorage now, Firestore-ready) ─────────────
// Swap `loadRoom` / `saveRoom` internals for Firestore `rooms/cozy-hall` when
// Firebase env vars are present. Shape stays identical.

import { useCallback, useEffect, useState } from "react";
import type { RoomConfig } from "./hall-types";
import { DEFAULT_ROOM } from "./room-defaults";

const KEY = "cozy-hall-room-v1";

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

  const updateRoom = useCallback((next: RoomConfig) => {
    setRoom(next);
    saveRoom(next);
  }, []);

  return { room, updateRoom };
}
