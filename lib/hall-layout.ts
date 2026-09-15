// ─── Cozy Hall · floor plan (the single source of truth) ────────────────────
// Every position in the hall lives here: the 3D scene builds from it, player
// colliders + ball solids are generated from its `PROPS`, context zones and
// in-world prompts anchor to it, and the server spawns from it. Move a piece
// of furniture here and everything that depends on it follows.
//
//            back wall (z = -18)
//   ┌───────────────────────────────────────────────────────┐
//   │ CAFÉ            TV · SOS      bookshelf               │
//   │ counter/stools   rug + table                 FIREPLACE │ right
//   │ bistro tables    SOFA                        NOOK      │ wall
//   │ RPS ARENA                                    (x = 23)  │
//   │            start pad ●                                 │
//   │ GARDEN      ┌─── DODGEBALL COURT ───┐  bleachers       │
//   │ bench       └───────────────────────┘                  │
//   └──────────────────────── camera side (open) ───────────┘
//
// x grows to the right, z grows toward the camera. 46 × 36 floor (2× area).

export const HALL = { xMin: -23, xMax: 23, zMin: -18, zMax: 18, wallHeight: 9 };
export const BACK_WALL_Z = HALL.zMin; // inner face
export const RIGHT_WALL_X = HALL.xMax; // inner face

// ── TV lounge (back centre) ──
export const TV = { x: 0, standZ: -17.25, bodyZ: -17.75, screenY: 2.75 };
export const LOUNGE = {
  rug: { x: 0, z: -11.0, r: 5.0 },
  table: { x: 0, z: -11.0 },
  sofa: { x: 0, z: -6.0 },
  cushions: [
    { x: -4.4, z: -10.2, color: "#ffc6ff" },
    { x: 4.4, z: -9.8, color: "#9bf6ff" },
  ],
  lamps: [
    { x: -5.4, z: -5.8 },
    { x: 5.4, z: -5.8 },
  ],
};
export const SOS_SPOT = { x: 6.8, z: -16.4 };
export const BOOKSHELF = { x: 12.5, z: -17.55 };

// ── café corner (back left) ──
export const CAFE = {
  counter: { x: -17.5, z: -16.9, hx: 4.0, hz: 0.6 },
  stools: [-20.4, -18.5, -16.5, -14.6].map((x) => ({ x, z: -15.3 })), // ball-width clear of the counter
  tables: [
    { x: -19.2, z: -12.2 },
    { x: -14.6, z: -11.6 },
  ],
  espresso: { x: -19.8, z: -17.05 },
  chalkboard: { x: -17.5, y: 3.4 },
  window: { x: -17.5, y: 6.8 },
};

// ── fireplace reading nook (right wall) ──
export const NOOK = {
  fire: { z: -8 },
  rug: { x: 19.2, z: -8, rx: 3.3, rz: 2.6 },
  beanBags: [
    { x: 19.0, z: -10.8, color: "#bdb2ff" },
    { x: 19.3, z: -5.1, color: "#ffadad" },
  ],
  rocker: { x: 17.2, z: -8 },
  basket: { x: 17.0, z: -9.6 },
  shelves: [{ z: -11.6 }, { z: -4.4 }],
  cat: { x: 20.5, z: -7.1 },
  lamp: { x: 16.8, z: -12.2 },
  window: { x: 17.5, y: 6.8 },
};

// ── rock · paper · scissors arena (left middle) ──
export const RPS_SPOT = {
  table: { x: -16, z: -2.5 },
  stools: [
    { x: -17.3, z: -1.2, color: "#ff8fab" },
    { x: -14.7, z: -3.8, color: "#9bf6ff" },
  ],
  board: { x: -19.1, z: -2.5 },
};

// ── dodgeball court (front centre) ──
export const COURT = {
  xMin: -8,
  xMax: 8,
  zMin: 4,
  zMax: 14,
  // walk-in gaps in the long bumpers, centred on these x values
  gaps: [-4, 4],
  gapHalf: 1.2,
  bumperH: 0.45,
  bumperT: 0.3,
  pad: { x: 0, z: 2.3, r: 0.95 },
  board: { x: -11.4, z: 9 },
  rack: { x: -9.6, z: 12.9 },
  bleachers: { x: 11.2, z: 9, len: 8 },
};

// ── garden corner (front left) + greenery everywhere ──
export const GARDEN = { bench: { x: -16.5, z: 13.6 } };
export const PLANTS = [
  { x: -10.6, z: -17.0, s: 1.0 },
  { x: 16.6, z: -17.0, s: 1.05 },
  { x: 21.9, z: -15.6, s: 1.1 },
  { x: 21.9, z: -0.6, s: 1.0 },
  { x: -21.9, z: -8.4, s: 1.15 },
  { x: -21.9, z: 4.6, s: 1.0 },
  { x: -20.8, z: 15.6, s: 1.25 },
  { x: -13.2, z: 15.8, s: 0.9 },
  { x: 15.4, z: 16.0, s: 1.0 },
  { x: 21.6, z: 12.4, s: 1.2 },
];
export const FLOOR_LAMPS = [...LOUNGE.lamps, NOOK.lamp, { x: -19.6, z: 10.6 }, { x: 19.6, z: 6.2 }];

// ── spawns ──
export const SPAWN = { xSpread: 6, zMin: -3.6, zMax: -0.8 };
export const BALL_SPAWN = { x: 3.4, z: -2.2 };

// ── wall art (admin-editable frames/posters hang on these planes) ──
export const WALL_ART = {
  backZ: BACK_WALL_Z + 0.07,
  rightX: RIGHT_WALL_X - 0.08,
  // the old 32 × 25 hall, for re-hanging frames saved before the expansion
  legacyBackZ: -12.32,
  legacyRightX: 15.92,
};

// ─── collision props ─────────────────────────────────────────────────────────
// One list feeds BOTH the player colliders (XZ footprints) and the ball's 3D
// solids. `ballOnly` pieces (the TV panel, a lamp shade, a mantel) float
// above head height, so they stop balls but never people.
export type Prop =
  | { shape: "box"; x: number; z: number; hx: number; hz: number; y0?: number; y1: number; ballOnly?: boolean }
  | { shape: "cyl"; x: number; z: number; r: number; y0?: number; y1: number; ballOnly?: boolean };

const lampProps = (x: number, z: number): Prop[] => [
  { shape: "cyl", x, z, r: 0.09, y1: 2.4 },
  { shape: "cyl", x, z, r: 0.7, y0: 2.17, y1: 2.93, ballOnly: true },
];

/** Bumper segments around the court (walk-in gaps on the long sides). */
export function courtBumpers(): Array<Extract<Prop, { shape: "box" }>> {
  const { xMin, xMax, zMin, zMax, gaps, gapHalf, bumperH, bumperT } = COURT;
  const t = bumperT / 2;
  const out: Array<Extract<Prop, { shape: "box" }>> = [];
  // long sides (back + front) with walk-in gaps
  for (const z of [zMin, zMax]) {
    const cuts = [xMin - t, ...gaps.flatMap((g) => [g - gapHalf, g + gapHalf]), xMax + t];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i];
      const b = cuts[i + 1];
      out.push({ shape: "box", x: (a + b) / 2, z, hx: (b - a) / 2, hz: t, y1: bumperH });
    }
  }
  // short sides, solid — they butt into the long sides (which own the
  // corners), so no two bumpers overlap with a shared top
  for (const x of [xMin, xMax]) {
    out.push({ shape: "box", x, z: (zMin + zMax) / 2, hx: t, hz: (zMax - zMin) / 2 - t, y1: bumperH });
  }
  return out;
}

export const PROPS: Prop[] = [
  // lounge: sofa (seat, backrest, arms), coffee table, cushions, TV, SOS, shelf
  { shape: "box", x: LOUNGE.sofa.x, z: LOUNGE.sofa.z, hx: 3.06, hz: 0.72, y1: 1.28 },
  { shape: "box", x: LOUNGE.sofa.x, z: LOUNGE.sofa.z + 0.62, hx: 3.06, hz: 0.2, y1: 1.7 },
  { shape: "cyl", x: LOUNGE.sofa.x - 2.7, z: LOUNGE.sofa.z, r: 0.36, y1: 1.66, ballOnly: true },
  { shape: "cyl", x: LOUNGE.sofa.x + 2.7, z: LOUNGE.sofa.z, r: 0.36, y1: 1.66, ballOnly: true },
  { shape: "cyl", x: LOUNGE.table.x, z: LOUNGE.table.z, r: 1.4, y1: 0.61 },
  ...LOUNGE.cushions.map((c): Prop => ({ shape: "cyl", x: c.x, z: c.z, r: 0.72, y1: 0.6 })),
  { shape: "box", x: TV.x, z: TV.standZ, hx: 3.2, hz: 0.45, y1: 0.6 },
  { shape: "box", x: TV.x, z: TV.bodyZ, hx: 2.6, hz: 0.1, y0: 1.3, y1: 4.2, ballOnly: true },
  { shape: "cyl", x: SOS_SPOT.x, z: SOS_SPOT.z, r: 0.52, y1: 1.45 },
  { shape: "box", x: BOOKSHELF.x, z: BOOKSHELF.z, hx: 1.7, hz: 0.35, y1: 3.6 },

  // café
  { shape: "box", x: CAFE.counter.x, z: CAFE.counter.z, hx: CAFE.counter.hx, hz: CAFE.counter.hz, y1: 1.12 },
  { shape: "box", x: CAFE.espresso.x, z: CAFE.espresso.z, hx: 0.38, hz: 0.3, y0: 1.12, y1: 1.78, ballOnly: true },
  ...CAFE.stools.map((s): Prop => ({ shape: "cyl", x: s.x, z: s.z, r: 0.32, y1: 0.8 })),
  ...CAFE.tables.flatMap((t): Prop[] => [
    { shape: "cyl", x: t.x, z: t.z, r: 0.62, y1: 0.82 },
    { shape: "box", x: t.x - 1.0, z: t.z, hx: 0.3, hz: 0.3, y1: 1.05 },
    { shape: "box", x: t.x + 1.0, z: t.z, hx: 0.3, hz: 0.3, y1: 1.05 },
  ]),

  // fireplace nook
  { shape: "box", x: RIGHT_WALL_X - 0.35, z: NOOK.fire.z, hx: 0.35, hz: 1.8, y1: HALL.wallHeight },
  { shape: "box", x: RIGHT_WALL_X - 1.05, z: NOOK.fire.z, hx: 0.45, hz: 2.1, y1: 0.24 },
  { shape: "box", x: RIGHT_WALL_X - 0.95, z: NOOK.fire.z, hx: 0.3, hz: 1.45, y0: 1.86, y1: 2.02, ballOnly: true },
  ...NOOK.shelves.map((s): Prop => ({ shape: "box", x: RIGHT_WALL_X - 0.35, z: s.z, hx: 0.35, hz: 0.95, y1: 3.3 })),
  ...NOOK.beanBags.map((b): Prop => ({ shape: "cyl", x: b.x, z: b.z, r: 0.82, y1: 0.8 })),
  { shape: "box", x: NOOK.rocker.x, z: NOOK.rocker.z, hx: 0.5, hz: 0.55, y1: 1.2 },
  { shape: "cyl", x: NOOK.basket.x, z: NOOK.basket.z, r: 0.3, y1: 0.42 },
  { shape: "cyl", x: NOOK.cat.x, z: NOOK.cat.z, r: 0.42, y1: 0.4 },

  // RPS arena
  { shape: "cyl", x: RPS_SPOT.table.x, z: RPS_SPOT.table.z, r: 1.15, y1: 0.86 },
  ...RPS_SPOT.stools.map((s): Prop => ({ shape: "cyl", x: s.x, z: s.z, r: 0.42, y1: 0.61 })),
  { shape: "box", x: RPS_SPOT.board.x, z: RPS_SPOT.board.z, hx: 0.14, hz: 0.14, y1: 1.35 },
  { shape: "box", x: RPS_SPOT.board.x, z: RPS_SPOT.board.z, hx: 1.25, hz: 0.08, y0: 1.35, y1: 3.05, ballOnly: true },

  // dodgeball court: bumpers, scoreboard, bleachers
  ...courtBumpers(),
  { shape: "box", x: COURT.board.x, z: COURT.board.z, hx: 0.14, hz: 0.14, y1: 1.5 },
  { shape: "box", x: COURT.board.x, z: COURT.board.z, hx: 1.6, hz: 0.08, y0: 1.5, y1: 3.4, ballOnly: true },
  { shape: "box", x: COURT.rack.x, z: COURT.rack.z, hx: 0.3, hz: 0.65, y1: 1.0 },
  { shape: "box", x: COURT.bleachers.x - 0.6, z: COURT.bleachers.z, hx: 0.6, hz: COURT.bleachers.len / 2, y1: 0.48 },
  { shape: "box", x: COURT.bleachers.x + 0.6, z: COURT.bleachers.z, hx: 0.6, hz: COURT.bleachers.len / 2, y1: 0.96 },

  // garden bench, plants, lamps
  { shape: "box", x: GARDEN.bench.x, z: GARDEN.bench.z, hx: 1.25, hz: 0.38, y1: 0.95 },
  ...PLANTS.map((p): Prop => ({ shape: "cyl", x: p.x, z: p.z, r: 0.62 * p.s, y1: 1.75 * p.s })),
  ...FLOOR_LAMPS.flatMap((l) => lampProps(l.x, l.z)),
];

// ─── contextual zones (ACT / E) — enter radius, exit radius (hysteresis) ────
export const ZONES = {
  // zones never overlap (scratchpad layout test), so an E press is unambiguous
  tv: { x: TV.x, z: TV.standZ + 0.9, enter: 2.0, exit: 2.4 },
  game: { x: LOUNGE.table.x, z: LOUNGE.table.z, enter: 2.5, exit: 2.9 },
  sofa: { x: LOUNGE.sofa.x, z: LOUNGE.sofa.z, hxEnter: 3.8, hzEnter: 1.6, hxExit: 4.3, hzExit: 2.0 },
  rps: { x: RPS_SPOT.table.x, z: RPS_SPOT.table.z, enter: 2.8, exit: 3.4 },
  sos: { x: SOS_SPOT.x, z: SOS_SPOT.z, enter: 2.4, exit: 3.0 },
  dodgePad: { x: COURT.pad.x, z: COURT.pad.z, enter: 1.5, exit: 2.0 },
};

export function inCourt(x: number, z: number, margin = 0): boolean {
  return x > COURT.xMin + margin && x < COURT.xMax - margin && z > COURT.zMin + margin && z < COURT.zMax - margin;
}
