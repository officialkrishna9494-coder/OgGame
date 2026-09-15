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
  // sitting detail: seat = sofa seat index (perched on the sofa),
  // seatMode "sofa" = gliding to a seat, null = sitting in place.
  seat?: number | null;
  seatMode?: "sofa" | null;
  jumping: boolean;
  emote?: string;
  emoteAt?: number;
  action?: "poke" | "highfive" | "wave" | null;
  actionAt?: number;
  actionTarget?: string | null;
  // dodgeball bonk: victim flashes red + does a stunt while fresh
  hitAt?: number;
  // chat bubble: shown over the head for ~5s, even with chat closed
  chat?: string;
  chatAt?: number;
}

export interface BallState {
  x: number;
  z: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  holderId: string | null;
  // dodgeball: who threw it last (socket id, or "me" pre-relay) + when
  throwerId?: string | null;
  thrownAt?: number;
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
  // watch-party sync: position (sec) at the moment of `updatedAt`.
  // Viewers compute target = positionSec + (now - updatedAt)/1000 while playing.
  positionSec: number;
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
  // last-writer-wins stamp (ms). Snapshots older than our latest local
  // write are ignored so a stale cloud doc can never wipe fresh edits.
  updatedAt?: number;
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
  nearRps: boolean;
  nearEmergency: boolean;
}

export const IDLE_CONTEXT: ContextState = {
  nearSofa: false,
  nearBall: false,
  holdingBall: false,
  nearTv: false,
  nearGame: false,
  nearRps: false,
  nearEmergency: false,
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

// ─── Rock-Paper-Scissors arena (mini-game nº 2) ─────────────────────────────
// Server referees a best-of-5 (first to 3) between two seated players.
// Everyone else spectates the scoreboard + toasts.
export type RpsChoice = "rock" | "paper" | "scissors";

export const RPS_CHOICES: RpsChoice[] = ["rock", "paper", "scissors"];

export function rpsBeats(a: RpsChoice, b: RpsChoice): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "scissors" && b === "paper") ||
    (a === "paper" && b === "rock")
  );
}

export interface RpsState {
  status: "idle" | "waiting" | "picking" | "revealing" | "ended";
  seats: { a: string | null; b: string | null }; // socket ids
  names: { a: string; b: string };
  scores: { a: number; b: number };
  round: number;
  picks: { a: RpsChoice | null; b: RpsChoice | null };
  deadline: number;
  revealUntil: number;
  lastReveal: {
    round: number;
    a: RpsChoice;
    b: RpsChoice;
    result: "a" | "b" | "draw";
    at: number;
    timeout: boolean;
  } | null;
  winner: string | null;
  endedAt: number;
}

export const IDLE_RPS: RpsState = {
  status: "idle",
  seats: { a: null, b: null },
  names: { a: "", b: "" },
  scores: { a: 0, b: 0 },
  round: 1,
  picks: { a: null, b: null },
  deadline: 0,
  revealUntil: 0,
  lastReveal: null,
  winner: null,
  endedAt: 0,
};

export const RPS_WIN_SCORE = 3;
export const RPS_ROUND_MS = 20_000;
export const RPS_REVEAL_MS = 3_500;

// RPS table spot — back-left, by the window end
export const RPS_TABLE = { x: -10, z: -6.5 };

// ─── Emergency signal ───────────────────────────────────────────────────────
// One red button by the TV. Raising it flashes every screen red + pops a
// dialog naming the raiser. Global 10s cooldown, auto-clears after ~3.5s.
export interface SosState {
  by: string;
  name: string;
  at: number;
}

// ─── Persistent chat ────────────────────────────────────────────────────────
export interface ChatMsg {
  id: string;
  name: string;
  color: string;
  text: string;
  at: number;
}

export const CHAT_BUBBLE_MS = 5_000;
export const CHAT_MAX_LEN = 140;
