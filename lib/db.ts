// ─── Cozy Hall · database layer (Firestore with local fallback) ─────────────
// Firestore holds the persistent room: config, frames, posters, TV playlist,
// user profiles. Socket.io keeps carrying the ephemeral stuff.
// Every function degrades gracefully — without Firebase env vars the hall is
// 100% local and nothing throws.

import type { RoomConfig } from "./hall-types";
import { firebaseConfigured } from "./auth";

export const ROOM_DOC = "cozy-hall";

export function dbConfigured(): boolean {
  return firebaseConfigured();
}

async function getDb() {
  const [{ getFirestore }, { getFirebaseApp }] = await Promise.all([
    import("firebase/firestore"),
    import("./firebase-auth"),
  ]);
  return getFirestore(await getFirebaseApp());
}

function sanitize(room: RoomConfig): Record<string, unknown> {
  // Firestore rejects `undefined` — round-trip through JSON to strip it.
  return JSON.parse(JSON.stringify(room)) as Record<string, unknown>;
}

export async function loadRoomCloud(): Promise<RoomConfig | null> {
  const [{ doc, getDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const snap = await getDoc(doc(db, "rooms", ROOM_DOC));
  if (!snap.exists()) return null;
  return snap.data() as RoomConfig;
}

export async function saveRoomCloud(room: RoomConfig): Promise<void> {
  const [{ doc, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await setDoc(doc(db, "rooms", ROOM_DOC), sanitize(room), { merge: true });
}

export async function watchRoomCloud(cb: (room: RoomConfig | null) => void): Promise<() => void> {
  const [{ doc, onSnapshot }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  return onSnapshot(
    doc(db, "rooms", ROOM_DOC),
    (snap) => cb(snap.exists() ? (snap.data() as RoomConfig) : null),
    () => cb(null)
  );
}

export async function saveUserProfile(profile: {
  uid: string;
  name: string;
  color: string;
  photoUrl?: string;
}): Promise<void> {
  const [{ doc, setDoc, serverTimestamp }, db] = await Promise.all([
    import("firebase/firestore"),
    getDb(),
  ]);
  await setDoc(
    doc(db, "users", profile.uid),
    {
      displayName: profile.name,
      color: profile.color,
      photoURL: profile.photoUrl ?? null,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
}
