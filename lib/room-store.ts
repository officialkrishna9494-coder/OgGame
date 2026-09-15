"use client";

// ─── Cozy Hall · room store (Firestore live, localStorage fallback) ─────────
// When Firebase is configured: subscribe to `rooms/cozy-hall` so admin edits
// appear on every friend's wall in real time; localStorage stays as cache.
// Without Firebase: pure localStorage, exactly like before.
//
// Conflict rule is last-writer-wins on `updatedAt`: a snapshot older than our
// latest local write is ignored, so a stale cloud doc can never wipe fresh
// edits on reload. (Clock skew across devices is accepted at friends-scale.)

import { useCallback, useEffect, useRef, useState } from "react";
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

export function stampRoom(room: RoomConfig): RoomConfig {
  return { ...room, updatedAt: Date.now() };
}

// Pre-stamp migration: rooms customized before stamps existed get stamped
// now, so the first cloud snapshot after this update can't wipe them.
function isCustomized(r: RoomConfig): boolean {
  return (
    r.name !== DEFAULT_ROOM.name ||
    r.frames.length !== DEFAULT_ROOM.frames.length ||
    r.tv.length !== DEFAULT_ROOM.tv.length ||
    r.posters.length !== DEFAULT_ROOM.posters.length ||
    r.frames.some((f, i) => f.title !== DEFAULT_ROOM.frames[i]?.title || !!f.imageUrl) ||
    r.tv.some((v, i) => v.id !== DEFAULT_ROOM.tv[i]?.id)
  );
}

export function useRoom() {
  // Initializer also performs the one-time pre-stamp migration, so rooms
  // customized before stamps existed survive the first cloud snapshot.
  const [room, setRoom] = useState<RoomConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_ROOM;
    const local = loadRoom();
    if (!local.updatedAt && isCustomized(local)) {
      const migrated = stampRoom(local);
      saveRoom(migrated);
      return migrated;
    }
    return local;
  });
  const [sync, setSync] = useState<SyncStatus>(() => (dbConfigured() ? "syncing" : "local"));
  // highest updatedAt we've written or adopted — snapshots below this lose
  const stampRef = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    stampRef.current = Math.max(stampRef.current, loadRoom().updatedAt ?? 0);
    // reconcile on mount: push local up only when the cloud is missing/older
    if (dbConfigured()) {
      import("./db").then((m) =>
        m
          .loadRoomCloud()
          .then((existing) => {
            if (!alive) return;
            const mine = loadRoom();
            if (!existing || (existing.updatedAt ?? 0) < (mine.updatedAt ?? 0)) {
              m.saveRoomCloud(mine).catch(() => {});
            }
          })
          .catch(() => {})
      );
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const incoming = { ...DEFAULT_ROOM, ...JSON.parse(e.newValue) } as RoomConfig;
          if ((incoming.updatedAt ?? 0) >= stampRef.current) {
            stampRef.current = incoming.updatedAt ?? 0;
            setRoom(incoming);
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
    };
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
          if ((cloud.updatedAt ?? 0) < stampRef.current) return; // stale — keep local
          stampRef.current = cloud.updatedAt ?? 0;
          const merged = { ...DEFAULT_ROOM, ...cloud };
          setRoom(merged);
          saveRoom(merged);
        })
      )
      .then((unsub) => {
        off = unsub;
        if (alive) setSync("live");
      })
      .catch(() => alive && setSync("local"));
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const updateRoom = useCallback((next: RoomConfig) => {
    const stamped = next.updatedAt ? next : stampRoom(next);
    stampRef.current = Math.max(stampRef.current, stamped.updatedAt ?? 0);
    setRoom(stamped);
    saveRoom(stamped);
    if (dbConfigured()) {
      import("./db").then((m) => m.saveRoomCloud(stamped).catch(() => {}));
    }
  }, []);

  return { room, updateRoom, sync };
}
