// ─── Cozy Hall · default room (data-driven, admin-editable) ─────────────────
// When Firebase is configured, this seeds Firestore `rooms/cozy-hall`.
// Media files live in Cloudinary; only metadata + URLs live here.
//
// Physical layout (walls, furniture, zones) comes from lib/hall-layout.ts;
// the collision lists below are GENERATED from its PROPS so the player,
// the ball and the 3D scene can never disagree about where things are.

import type { RoomConfig } from "./hall-types";
import { BALL_SPAWN as LAYOUT_BALL_SPAWN, HALL, LOUNGE, PROPS, RACE, WALL_ART } from "./hall-layout";

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
      position: [-10.5, 4.6, WALL_ART.backZ],
      size: [2.3, 1.55],
    },
    {
      id: "frame-2",
      title: "Beach day",
      caption: "summer '25",
      hue: 195,
      position: [-6.5, 4.65, WALL_ART.backZ],
      size: [1.9, 1.9],
    },
    {
      id: "frame-3",
      title: "Cabin trip",
      caption: "snow + cocoa",
      hue: 30,
      position: [6.5, 4.6, WALL_ART.backZ],
      size: [2.3, 1.55],
    },
    {
      id: "frame-4",
      title: "Arcade win",
      caption: "high score!",
      hue: 265,
      position: [10.5, 4.65, WALL_ART.backZ],
      size: [1.9, 1.9],
    },
  ],
  posters: [
    {
      id: "poster-1",
      title: "BE KIND",
      subtitle: "house rule nº 1",
      hue: 350,
      position: [WALL_ART.rightX, 4.4, 3.4],
      size: [2.0, 2.6],
    },
    {
      id: "poster-2",
      title: "STAY COZY",
      subtitle: "house rule nº 2",
      hue: 210,
      position: [WALL_ART.rightX, 4.4, 7.4],
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

// Perched ON the front edge of the cushions (not buried inside the sofa),
// facing the TV on the back wall.
export const SOFA_SEATS: SofaSeat[] = [-2.2, -1.1, 0, 1.1, 2.2].map((dx) => ({
  x: LOUNGE.sofa.x + dx,
  z: LOUNGE.sofa.z - 0.5,
  y: 0.55,
  facing: Math.PI,
}));

// Static player colliders in hall space (x, z half-extents + top height y1),
// generated from the layout props. Round props become their bounding square.
// `y1` lets the player physics vault low furniture: anything at or below the
// feet (+ a knee allowance) never blocks, and jumps can land on top of it.
export const COLLIDERS = PROPS.filter((p) => !p.ballOnly).map((p) =>
  p.shape === "box"
    ? { x: p.x, z: p.z, hx: p.hx, hz: p.hz, y1: p.y1 }
    : { x: p.x, z: p.z, hx: p.r, hz: p.r, y1: p.y1 }
);

export const HALL_BOUNDS = { x: HALL.xMax - 0.4, zMin: HALL.zMin + 0.6, zMax: HALL.zMax - 0.8 };

// ─── ball physics solids ─────────────────────────────────────────────────────
// The ball flies, so it needs real 3D volumes: boxes and upright cylinders
// with a height range (y0 → y1). Generated from the same layout props.
export type Solid =
  | { shape: "box"; x: number; z: number; hx: number; hz: number; y0: number; y1: number }
  | { shape: "cyl"; x: number; z: number; r: number; y0: number; y1: number };

export const SOLIDS: Solid[] = PROPS.map((p): Solid =>
  p.shape === "box"
    ? { shape: "box", x: p.x, z: p.z, hx: p.hx, hz: p.hz, y0: p.y0 ?? 0, y1: p.y1 }
    : { shape: "cyl", x: p.x, z: p.z, r: p.r, y0: p.y0 ?? 0, y1: p.y1 }
);

// Where the ball can travel (open camera side included) and where it rests
// when the hall first wakes up — clear of every solid above. Spans both rooms
// so throws through the big door keep flying (dodgeball stays court-side via
// its own referee clamps).
export const BALL_BOUNDS = { xMin: RACE.xMin + 0.6, xMax: HALL.xMax - 0.6, zMin: HALL.zMin + 0.8, zMax: HALL.zMax - 1 };
export const BALL_SPAWN = LAYOUT_BALL_SPAWN;

// Where admin-added frames land by default (the right half of the back wall).
export const NEXT_FRAME_SLOT = { x: 5, y: 4.6, z: WALL_ART.backZ, dx: 3 };
