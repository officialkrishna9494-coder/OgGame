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
    { id: "jfKfPfyJRdk", title: "lofi hip hop radio 📚 beats to relax/study to" },
    { id: "5qap5aO4i9A", title: "lofi girl · slow mornings ☕" },
    { id: "DWcJFNfaw9c", title: "synthwave night drive 🌃" },
  ],
};

export const SOFA_SEATS: Array<{ x: number; z: number; facing: number }> = [
  { x: -2.2, z: 5.55, facing: Math.PI },
  { x: -1.1, z: 5.6, facing: Math.PI },
  { x: 0, z: 5.62, facing: Math.PI },
  { x: 1.1, z: 5.6, facing: Math.PI },
  { x: 2.2, z: 5.55, facing: Math.PI },
];

// Static colliders in hall space (x,z half-extents). Keeps physics in one place
// so client prediction + server relay agree.
export const COLLIDERS = [
  { x: 0, z: 5.5, hx: 3.0, hz: 0.8 }, // sofa
  { x: 0, z: 3.0, hx: 1.5, hz: 0.8 }, // coffee table
  { x: 0, z: -10.8, hx: 3.4, hz: 0.7 }, // tv stand
  { x: 8.5, z: -11.9, hx: 1.8, hz: 0.6 }, // bookshelf
  { x: -12.5, z: 3.5, hx: 0.9, hz: 0.9 }, // plant
  { x: 11.5, z: -9.5, hx: 0.9, hz: 0.9 }, // plant
  { x: -11, z: -9, hx: 0.9, hz: 0.9 }, // plant
  { x: 11.5, z: 3.5, hx: 0.6, hz: 0.6 }, // lamp
  { x: -12, z: -6, hx: 0.6, hz: 0.6 }, // lamp
  { x: -4.2, z: 1.2, hx: 0.8, hz: 0.8 }, // floor cushion
  { x: 4.2, z: 1.6, hx: 0.8, hz: 0.8 }, // floor cushion
  { x: 7.5, z: 4.5, hx: 0.8, hz: 0.8 }, // floor cushion
];

export const HALL_BOUNDS = { x: 14.6, zMin: -11.4, zMax: 11.2 };

// Where admin-added frames land by default (on the big back wall).
export const NEXT_FRAME_SLOT = { x: -10, y: 4.6, z: -12.32, dx: 4 };
