// ─── Cozy Hall · default room (data-driven, admin-editable) ─────────────────
// When Firebase is configured, this seeds Firestore `rooms/cozy-hall`.
// Media files live in Cloudinary; only metadata + URLs live here.
//
// Hall footprint is 32 × 25 (x × z). Back wall at z ≈ -12.5, right wall at
// x ≈ +16. Camera end (open dollhouse side) faces +z.

import type { RoomConfig } from "./hall-types";

export const DEFAULT_ROOM: RoomConfig = {
  name: "Cozy Hall",
  tagline: "a soft place for 5–10 friends",
  accent: "#ff8fab",
  maxPlayers: 10,
  frames: [
    {
      id: "frame-1",
      title: "Rooftop night",
      caption: "first movie night",
      hue: 318,
      position: [-10, 4.6, -12.32],
      size: [2.3, 1.55],
    },
    {
      id: "frame-2",
      title: "Beach day",
      caption: "summer '25",
      hue: 195,
      position: [-6, 4.65, -12.32],
      size: [1.9, 1.9],
    },
    {
      id: "frame-3",
      title: "Cabin trip",
      caption: "snow + cocoa",
      hue: 30,
      position: [-2, 4.6, -12.32],
      size: [2.3, 1.55],
    },
    {
      id: "frame-4",
      title: "Arcade win",
      caption: "high score!",
      hue: 265,
      position: [2, 4.65, -12.32],
      size: [1.9, 1.9],
    },
  ],
  posters: [
    {
      id: "poster-1",
      title: "BE KIND",
      subtitle: "house rule nº 1",
      hue: 350,
      position: [15.92, 4.4, -3.5],
      size: [2.0, 2.6],
    },
    {
      id: "poster-2",
      title: "STAY COZY",
      subtitle: "house rule nº 2",
      hue: 210,
      position: [15.92, 4.4, -0.4],
      size: [2.0, 2.6],
    },
  ],
  tv: [
    { id: "jfKfPfyJRdk", title: "lofi hip hop radio · beats to relax/study to" },
    { id: "5qap5aO4i9A", title: "lofi girl · slow mornings" },
    { id: "DWcJFNfaw9c", title: "synthwave night drive" },
  ],
};

export interface SofaSeat {
  x: number;
  z: number;
  y: number;
  facing: number;
}

// Perched ON the front edge of the cushions (not buried inside the sofa).
// Sofa lives at z=7.0, well clear of the game rug (center z=2.2).
export const SOFA_SEATS: SofaSeat[] = [
  { x: -2.2, z: 6.5, y: 0.55, facing: Math.PI },
  { x: -1.1, z: 6.5, y: 0.55, facing: Math.PI },
  { x: 0, z: 6.5, y: 0.55, facing: Math.PI },
  { x: 1.1, z: 6.5, y: 0.55, facing: Math.PI },
  { x: 2.2, z: 6.5, y: 0.55, facing: Math.PI },
];

// Static colliders in hall space (x,z half-extents). Keeps physics in one place
// so client prediction + server relay agree.
export const COLLIDERS = [
  { x: 0, z: 7.0, hx: 3.0, hz: 0.8 }, // sofa
  { x: 0, z: 3.0, hx: 1.5, hz: 0.8 }, // coffee table
  { x: 0, z: -10.8, hx: 3.4, hz: 0.7 }, // tv stand
  { x: 8.5, z: -11.9, hx: 1.8, hz: 0.6 }, // bookshelf
  { x: -12.5, z: 3.5, hx: 0.9, hz: 0.9 }, // plant
  { x: 11.5, z: -9.5, hx: 0.9, hz: 0.9 }, // plant
  { x: -11, z: -9, hx: 0.9, hz: 0.9 }, // plant
  { x: 11.5, z: 3.5, hx: 0.6, hz: 0.6 }, // lamp
  { x: -13.8, z: 0.5, hx: 0.6, hz: 0.6 }, // lamp
  { x: -4.2, z: 1.2, hx: 0.8, hz: 0.8 }, // floor cushion
  { x: 4.2, z: 1.6, hx: 0.8, hz: 0.8 }, // floor cushion
  { x: -10, z: -6.5, hx: 1.3, hz: 1.0 }, // RPS table
  { x: -12.9, z: -6.5, hx: 1.3, hz: 0.35 }, // RPS scoreboard
  { x: 5.0, z: -10.0, hx: 0.5, hz: 0.5 }, // emergency button pedestal
];

export const HALL_BOUNDS = { x: 14.6, zMin: -11.4, zMax: 11.2 };

// ─── ball physics solids ─────────────────────────────────────────────────────
// The ball flies, so it needs real 3D volumes: boxes and upright cylinders
// with a height range (y0 → y1), measured from the meshes HallScene builds.
// Keep in sync when furniture moves — lib/ball-physics.ts collides against
// exactly this list, on every client, so every screen agrees.
export type Solid =
  | { shape: "box"; x: number; z: number; hx: number; hz: number; y0: number; y1: number }
  | { shape: "cyl"; x: number; z: number; r: number; y0: number; y1: number };

export const SOLIDS: Solid[] = [
  // sofa (group at z = 7): seat + cushions, backrest, rounded arms
  { shape: "box", x: 0, z: 7.0, hx: 3.06, hz: 0.72, y0: 0, y1: 1.28 },
  { shape: "box", x: 0, z: 7.62, hx: 3.06, hz: 0.2, y0: 0, y1: 1.7 },
  { shape: "cyl", x: -2.7, z: 7.0, r: 0.36, y0: 0, y1: 1.66 },
  { shape: "cyl", x: 2.7, z: 7.0, r: 0.36, y0: 0, y1: 1.66 },
  // coffee table — too low to roll under, so solid to the top
  { shape: "cyl", x: 0, z: 3.0, r: 1.4, y0: 0, y1: 0.61 },
  // TV stand + the TV itself hanging above it
  { shape: "box", x: 0, z: -10.8, hx: 3.2, hz: 0.45, y0: 0, y1: 0.6 },
  { shape: "box", x: 0, z: -11.2, hx: 2.6, hz: 0.1, y0: 1.65, y1: 4.55 },
  // bookshelf
  { shape: "box", x: 8.5, z: -11.9, hx: 1.7, hz: 0.35, y0: 0, y1: 3.6 },
  // potted plants (pot + foliage)
  { shape: "cyl", x: -12.5, z: 3.5, r: 0.62, y0: 0, y1: 1.75 },
  { shape: "cyl", x: 11.5, z: -9.5, r: 0.62, y0: 0, y1: 1.75 },
  { shape: "cyl", x: -11, z: -9, r: 0.62, y0: 0, y1: 1.75 },
  // floor lamps: thin pole + shade overhead
  { shape: "cyl", x: 11.5, z: 3.5, r: 0.09, y0: 0, y1: 2.4 },
  { shape: "cyl", x: 11.5, z: 3.5, r: 0.7, y0: 2.17, y1: 2.93 },
  { shape: "cyl", x: -13.8, z: 0.5, r: 0.09, y0: 0, y1: 2.4 },
  { shape: "cyl", x: -13.8, z: 0.5, r: 0.7, y0: 2.17, y1: 2.93 },
  // squishy floor cushions
  { shape: "cyl", x: -4.2, z: 1.2, r: 0.72, y0: 0, y1: 0.6 },
  { shape: "cyl", x: 4.2, z: 1.6, r: 0.72, y0: 0, y1: 0.6 },
  // RPS arena: felt table, two stools, scoreboard post + board
  { shape: "cyl", x: -10, z: -6.5, r: 1.15, y0: 0, y1: 0.86 },
  { shape: "cyl", x: -11.3, z: -5.2, r: 0.42, y0: 0, y1: 0.61 },
  { shape: "cyl", x: -8.7, z: -7.8, r: 0.42, y0: 0, y1: 0.61 },
  { shape: "box", x: -12.9, z: -6.5, hx: 0.14, hz: 0.14, y0: 0, y1: 1.35 },
  { shape: "box", x: -12.9, z: -6.5, hx: 1.25, hz: 0.08, y0: 1.35, y1: 3.05 },
  // emergency button pedestal + dome
  { shape: "cyl", x: 5.0, z: -10.0, r: 0.52, y0: 0, y1: 1.45 },
];

// Where the ball can travel (open camera side included) and where it rests
// when the hall first wakes up — clear of every solid above.
export const BALL_BOUNDS = { xMin: -14.4, xMax: 14.4, zMin: -11.2, zMax: 11 };
export const BALL_SPAWN = { x: 2.8, z: 0.2 };

// Where admin-added frames land by default (on the big back wall).
export const NEXT_FRAME_SLOT = { x: -10, y: 4.6, z: -12.32, dx: 4 };
