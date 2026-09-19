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

import { AVATAR_COLORS, isOutfit, resolveHairstyle, type HairstyleId, OUTFIT_DEFAULT_COLOR, type OutfitId } from "./hall-types";

export interface Identity {
  uid?: string;
  name: string;
  color: string;
  outfit: OutfitId;
  hairstyle: HairstyleId;
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
// A saved profile (name / outfit / clothing color from the profile editor or
// the join form) wins over the random quickplay look, so refreshes keep you.
const PROFILE_KEY = "og-profile";

export interface StoredProfile {
  name?: string;
  color?: string;
  outfit?: OutfitId;
  hairstyle?: HairstyleId;
}

export function loadStoredProfile(): StoredProfile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as StoredProfile;
    const color = typeof p.color === "string" && /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : undefined;
    return {
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 14) : undefined,
      color,
      outfit: isOutfit(p.outfit) ? p.outfit : undefined,
      hairstyle: resolveHairstyle(p.outfit === "dress" ? "dress" : "suit", p.hairstyle),
    };
  } catch {
    return {};
  }
}

export function storeProfile(p: StoredProfile): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* private mode — look just won't persist */
  }
}

export function makeQuickplayIdentity(): Identity {
  let name: string | null = null;
  if (typeof window !== "undefined") {
    try {
      name = new URLSearchParams(window.location.search).get("name")?.slice(0, 14) ?? null;
    } catch {
      name = null;
    }
  }
  const stored = loadStoredProfile();
  const n = Math.floor(Math.random() * 1_000_000);
  const outfit: OutfitId = stored.outfit ?? (n % 2 === 0 ? "suit" : "dress");
  return {
    name: name?.trim() || stored.name || `${QUICK_NAMES[n % QUICK_NAMES.length]}-${String(n % 1000).padStart(2, "0")}`,
    color: stored.color || OUTFIT_DEFAULT_COLOR[outfit],
    outfit,
    hairstyle: resolveHairstyle(outfit, stored.hairstyle),
  };
}

// Deterministic color from any string (Firebase display names, etc).
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
