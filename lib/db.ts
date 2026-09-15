// ─── Cozy Hall · database layer (Firestore with local fallback) ─────────────
// Firestore holds the persistent room: config, frames, posters, TV playlist,
// user profiles. Socket.io keeps carrying the ephemeral stuff.
// Every function degrades gracefully — without Firebase env vars the hall is
// 100% local and nothing throws.

import type { ChatMsg, RoomConfig } from "./hall-types";
import { firebaseConfigured } from "./auth";

export const ROOM_DOC = "cozy-hall";
export const CHAT_KEEP = 100;
export const CHAT_PAGE = 50;

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

// ─── chat: rooms/cozy-hall/messages (Firestore rules must allow — see README)
export async function watchMessages(cb: (msgs: ChatMsg[]) => void): Promise<() => void> {
  const [{ collection, query, orderBy, limit, onSnapshot }, db] = await Promise.all([
    import("firebase/firestore"),
    getDb(),
  ]);
  const q = query(
    collection(db, "rooms", ROOM_DOC, "messages"),
    orderBy("createdAt", "desc"),
    limit(CHAT_PAGE)
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => {
          const data = d.data() as { name?: string; color?: string; text?: string; createdAt?: { toMillis?: () => number } };
          return {
            id: d.id,
            name: String(data.name ?? "Friend").slice(0, 14),
            color: String(data.color ?? "#bdb2ff"),
            text: String(data.text ?? "").slice(0, 140),
            at: data.createdAt?.toMillis?.() ?? Date.now(),
          } as ChatMsg;
        })
        .reverse();
      cb(msgs);
    },
    () => cb([])
  );
}

export async function sendMessage(m: { name: string; color: string; text: string }): Promise<void> {
  const [{ collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, deleteDoc }, db] =
    await Promise.all([import("firebase/firestore"), getDb()]);
  const col = collection(db, "rooms", ROOM_DOC, "messages");
  await addDoc(col, {
    name: m.name.slice(0, 14),
    color: m.color,
    text: m.text.slice(0, 140),
    createdAt: serverTimestamp(),
  });
  // light trim so history can't grow unbounded
  try {
    const snap = await getDocs(query(col, orderBy("createdAt", "desc"), limit(CHAT_KEEP + 1)));
    if (snap.size > CHAT_KEEP) {
      await Promise.all(snap.docs.slice(CHAT_KEEP).map((d) => deleteDoc(d.ref)));
    }
  } catch {
    /* trim is best-effort */
  }
}
