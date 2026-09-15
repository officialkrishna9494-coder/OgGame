// ─── Cozy Hall · auth mode ────────────────────────────────────────────────────
// Env-toggled identity flow:
//
//   NEXT_PUBLIC_AUTH_MODE=dev       → nickname / quickplay (default)
//   NEXT_PUBLIC_AUTH_MODE=firebase  → Google Sign-in via Firebase Authentication
//   NEXT_PUBLIC_DEV_QUICKPLAY=false → dev mode shows the nickname form instead
//                                     of walking straight in (default: true)
//
// Dev quickplay exists so you can test movement + interactions with zero
// friction. Flip to `firebase` when deploying for real friends.

import { AVATAR_COLORS } from "./hall-types";

export interface Identity {
  uid?: string;
  name: string;
  color: string;
  photoUrl?: string;
  signOut?: () => void;
}

export const AUTH_MODE: "dev" | "firebase" =
  process.env.NEXT_PUBLIC_AUTH_MODE === "firebase" ? "firebase" : "dev";

export const DEV_QUICKPLAY: boolean =
  process.env.NEXT_PUBLIC_DEV_QUICKPLAY !== "false";

export function firebaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

const QUICK_NAMES = [
  "Mochi",
  "Pudding",
  "Boba",
  "Waffles",
  "Pickle",
  "Noodle",
  "Pepper",
  "Maple",
  "Sushi",
  "Taro",
];

// One identity per tab load (module singleton). `?name=` overrides the nickname.
export function makeQuickplayIdentity(): Identity {
  let name: string | null = null;
  if (typeof window !== "undefined") {
    try {
      name = new URLSearchParams(window.location.search).get("name")?.slice(0, 14) ?? null;
    } catch {
      name = null;
    }
  }
  const n = Math.floor(Math.random() * 1_000_000);
  return {
    name: name?.trim() || `${QUICK_NAMES[n % QUICK_NAMES.length]}-${String(n % 1000).padStart(2, "0")}`,
    color: AVATAR_COLORS[n % AVATAR_COLORS.length],
  };
}

// Deterministic color from any string (Firebase display names, etc).
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
