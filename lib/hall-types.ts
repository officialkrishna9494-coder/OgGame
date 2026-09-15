// ─── Cozy Hall · shared types ────────────────────────────────────────────────
// Firestore persists room config / frames / posters / playlist / accounts.
// Socket.io carries everything temporary: presence, movement, emotes, TV sync.

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  facing: number; // radians, 0 = facing camera (+z)
  moving: boolean;
  sitting: boolean;
  jumping: boolean;
  emote?: string;
  emoteAt?: number;
  action?: "poke" | "highfive" | "wave" | null;
  actionAt?: number;
  actionTarget?: string | null;
}

export interface BallState {
  x: number;
  z: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  holderId: string | null;
}

export interface MemoryFrame {
  id: string;
  title: string;
  caption: string;
  // Cloudinary URL when configured, otherwise gradient placeholder key
  imageUrl?: string;
  hue: number;
  position: [number, number, number]; // wall-space xyz
  size: [number, number]; // w,h
  rotationY?: number;
}

export interface Poster {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  hue: number;
  position: [number, number, number];
  size: [number, number];
}

export interface TvVideo {
  id: string; // youtube id
  title: string;
  addedBy?: string;
}

export interface TvState {
  playlist: TvVideo[];
  index: number;
  playing: boolean;
  updatedAt: number;
}

export interface RoomConfig {
  name: string;
  tagline: string;
  accent: string;
  frames: MemoryFrame[];
  posters: Poster[];
  tv: TvVideo[];
  maxPlayers: number;
}

export type HallEvent =
  | { type: "toast"; text: string }
  | { type: "poke"; from: string; to: string }
  | { type: "highfive"; a: string; b: string | null };

export const AVATAR_COLORS = [  "#ffb3c7",
  "#ffd6a5",
  "#fdffb6",
  "#caffbf",
  "#9bf6ff",
  "#a0c4ff",
  "#bdb2ff",
  "#ffc6ff",
  "#ffadad",
  "#8ce8c0",
];

export const EMOTES = ["❤️", "😂", "🎉", "👋", "😮", "🔥", "⭐", "💤"];

// Proximity-driven contextual actions (mobile rail + game spots).
export interface ContextState {
  nearSofa: boolean;
  nearBall: boolean;
  holdingBall: boolean;
  nearTv: boolean;
  nearGame: boolean;
}

export const IDLE_CONTEXT: ContextState = {
  nearSofa: false,
  nearBall: false,
  holdingBall: false,
  nearTv: false,
  nearGame: false,
};

// ─── Star Scramble (mini-game nº 1 — intentionally tiny) ────────────────────
// Server owns the state; clients just walk over stars to collect them.
export interface StarItem {
  id: string;
  x: number;
  z: number;
}

export interface GameState {
  status: "idle" | "playing" | "ended";
  endsAt: number;
  stars: StarItem[];
  scores: Record<string, { name: string; points: number }>;
  lastCollect?: { by: string; name: string; at: number };
  winner?: string | null;
}

export const IDLE_GAME: GameState = {
  status: "idle",
  endsAt: 0,
  stars: [],
  scores: {},
};

export const GAME_DURATION_MS = 60_000;
export const STAR_COUNT = 12;
