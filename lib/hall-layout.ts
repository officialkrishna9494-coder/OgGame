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
  // no flanking floor lamps — the sofa ends stay open
  lamps: [],
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
export const FLOOR_LAMPS = [...LOUNGE.lamps, NOOK.lamp, { x: -14, z: 12 }, { x: 19.6, z: 6.2 }];

// ── spawns ──
export const SPAWN = { xSpread: 6, zMin: -3.6, zMax: -0.8 };
export const BALL_SPAWN = { x: 3.4, z: -2.2 };

// ── hall carts: two parked front-right (clear of the court + nook), one in
// the raceway's east paddock facing the circuit ──
// Hall spots verified clear of every static collider (4.5 m / 3.8 m
// clearance, 3.3 m apart); the raceway spot sits 8 m off the ribbon, clear
// of ramps, props and the doorway lane. Everything simulates + relays from
// this list (server carts, offline idles, hop-in zones), so no code counts
// karts — add rows freely.
export const CART_SPAWNS = [
  { id: "cart-1", x: 14.5, z: 1.0, facing: -Math.PI / 2, color: "#ff8fab" },
  { id: "cart-2", x: 17.0, z: 3.2, facing: -Math.PI / 2, color: "#4cc9f0" },
  { id: "cart-3", x: -27, z: -10, facing: -Math.PI / 2, color: "#ffd166" },
];

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

  // raceway annex (big room west, x −101…−23): tire stacks, cones,
  // floodlight poles and the bridge deck rails only — a clean professional
  // paddock. Ramps + bridge deck live in RAMPS / BRIDGES (heightfield),
  // never here — see below. Every prop below is placed clear of the
  // TRACK_POINTS centerline AND of every wedge footprint (a stack poking
  // through a slope reads as junk on the road — see tests/raceway.test.mts).
  ...[[-56, -1], [-58, 5], [-58, -2], [-48, 2]].map(
    ([x, z]): Prop => ({ shape: "cyl", x, z, r: 0.55, y1: 0.95 })
  ),
  ...[[-36, 17.4], [-58, 17.5], [-78, 8], [-95, -10], [-52, -17], [-31, -13]].map(
    ([x, z]): Prop => ({ shape: "cyl", x, z, r: 0.25, y1: 0.55 })
  ),
  ...[[-96, 12], [-96, -12], [-28, 15.5], [-28, -15.5]].map(
    ([x, z]): Prop => ({ shape: "cyl", x, z, r: 0.2, y1: 5.2 })
  ),
  // bridge deck rails (waist-high walls along both deck edges — they keep
  // drivers and walkers on the top road, and read as open air underneath)
  ...[0.4, 3.6].map(
    (z): Prop => ({ shape: "box", x: -56, z, hx: 10, hz: 0.15, y0: 2.2, y1: 2.75 })
  ),
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

// ─── raceway annex (big room west, through the big door) ────────────────────
// 78 × 36 due west of the hall (x −101…−23, same z span) — room for a twisty
// multi-turn circuit, not just an oval. The shared wall (x = -23) opens at
// the big door gap on the front (camera) half; everywhere else it blocks
// players, carts and balls alike.
// Ramps are NOT colliders — karts and feet ride the heightfield instead, so
// anything can launch off them. The track is a clean two-lane ribbon with
// racing props only (tires, cones, floodlights) — no stands, no arch gates.
export const RACE = { xMin: -101, xMax: -23, zMin: -18, zMax: 18 };

/** big opening in the shared wall, front (camera) half (room faces x = -23) */
export const DOOR_GAP = { z0: 7, z1: 13, h: 4.2 };

export interface RampDef {
  /** low-edge origin; ascent runs (dx, dz) for `length` up to `height` */
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  width: number;
  height: number;
}

export const RAMPS: RampDef[] = [
  // south S, launches west-southwest down the home weave
  { x: -47, z: 12.1, dx: -0.958, dz: -0.287, length: 4.5, width: 3.2, height: 1.25 },
  // north S, launches east-northeast toward the final turns
  { x: -56, z: -9.4, dx: 0.923, dz: 0.385, length: 4.5, width: 3.2, height: 1.25 },
  // west entry, launches south-southwest into the hairpin
  { x: -89.7, z: 9.8, dx: -0.6, dz: -0.8, length: 4.5, width: 3.2, height: 1.25 },
  // east return, launches south-southeast past the big door
  { x: -35.6, z: -5.6, dx: 0.707, dz: 0.707, length: 4.5, width: 3.2, height: 1.25 },
  // bridge west approach: centre layby climbs east onto the deck
  { x: -74, z: 2, dx: 1, dz: 0, length: 8, width: 3.2, height: 2.2 },
  // bridge east approach: deck drops east back to the centre layby
  { x: -38, z: 2, dx: -1, dz: 0, length: 8, width: 3.2, height: 2.2 },
];

export interface BridgeDef {
  /** deck centre; the span runs (dx, dz) for `length`, `width` across */
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  width: number;
  /** deck top surface — tall enough to drive under, reached via RAMPS above */
  height: number;
}

/**
 * Shortcut bridge over the little centre of the infield (horizontal, by the
 * OG SPELL paint): karts climb an approach ramp, cross the deck, and drop
 * back down — while everyone else drives straight underneath it ("through").
 * The deck sits in the free pocket clear of every ribbon, so it never crowds
 * another road. It is deliberately NOT a collider and NOT masonry: its top
 * is rideable surface, its underside is open air (pillar aside, in PROPS).
 */
export const BRIDGES: BridgeDef[] = [
  { x: -56, z: 2, dx: 1, dz: 0, length: 20, width: 3.5, height: 2.2 },
];

/** deck top surface under (x, z) — 0 outside every deck */
export function bridgeTopAt(x: number, z: number): number {
  let top = 0;
  for (const b of BRIDGES) {
    const rx = x - b.x;
    const rz = z - b.z;
    const s = rx * b.dx + rz * b.dz;
    const lat = Math.abs(rx * -b.dz + rz * b.dx);
    if (Math.abs(s) <= b.length / 2 && lat <= b.width / 2 && b.height > top) top = b.height;
  }
  return top;
}

/** professional two-lane ribbon */
export const TRACK_WIDTH = 7;
export const TRACK_LANE = TRACK_WIDTH / 2;

/**
 * S-weave circuit centerline in TRAVEL order (closed loop): an S-weave down
 * the south side → far-west hairpin → double-S through the north → eastern
 * return past the big door. Every ramp sits mid-segment with the segment's
 * exact direction, so launches fire straight down the racing line.
 */
export const TRACK_POINTS: Array<[number, number]> = [
  [-34, 10],
  [-44, 13],
  [-54, 10],
  [-64, 13],
  [-76, 14],
  [-88, 12],
  [-94, 4],
  [-90, -5],
  [-80, -9],
  [-70, -5],
  [-60, -11],
  [-48, -6],
  [-38, -8],
  [-30, 0],
];

/** track paint plane: 74 × 32 boards centred on the room, 2 m wood apron */
export const TRACK_PLANE = { x0: -99, x1: -25, z0: -16, z1: 16 };
export const TRACK = {
  cx: (TRACK_PLANE.x0 + TRACK_PLANE.x1) / 2,
  cz: (TRACK_PLANE.z0 + TRACK_PLANE.z1) / 2,
  width: TRACK_WIDTH,
  laneW: TRACK_LANE,
};

/**
 * Sample the closed centerline with Catmull-Rom (uniform, centripetal-safe
 * for our gentle corners). One source for the paint texture, the lap-gate
 * sanity checks and the prop-clearance tests — move the track here, not in
 * the scene builders.
 */
export function sampleTrackCenterline(samplesPerSpan = 16): Array<{ x: number; z: number }> {
  const pts = TRACK_POINTS;
  const n = pts.length;
  const out: Array<{ x: number; z: number }> = [];
  const get = (i: number): [number, number] => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < samplesPerSpan; k++) {
      const t = k / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      // standard Catmull-Rom (0.5 blend), per axis
      const x =
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z =
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push({ x, z });
    }
  }
  return out;
}

/** lap gates in travel order — first doubles as start/finish */
export const TRACK_GATES = [
  { x: -39, z: 11.5 },
  { x: -59, z: 11.5 },
  { x: -91, z: 8 },
  { x: -85, z: -7 },
  { x: -65, z: -8 },
  { x: -43, z: -7 },
  { x: -32, z: 5 },
];

/** highest ramp surface under (x, z) — 0 on open floor */
export function rampGroundAt(x: number, z: number): number {
  let g = 0;
  for (const r of RAMPS) {
    const rx = x - r.x;
    const rz = z - r.z;
    const s = rx * r.dx + rz * r.dz;
    const lat = Math.abs(rx * -r.dz + rz * r.dx);
    if (s >= 0 && s <= r.length && lat <= r.width / 2) {
      const h = r.height * (s / r.length);
      if (h > g) g = h;
    }
  }
  return g;
}

/**
 * Shove a circle (body radius r, feet at y) out of ramp masonry it is BELOW.
 * On top of a ramp (or landing on one) there is no hit — the heightfield
 * carries it. Returns the corrected position + whether it bumped.
 */
export function resolveRamp(
  x: number,
  z: number,
  y: number,
  r: number
): { x: number; z: number; hit: boolean } {
  for (const rmp of RAMPS) {
    const rx = x - rmp.x;
    const rz = z - rmp.z;
    const s = rx * rmp.dx + rz * rmp.dz;
    const ls = rx * -rmp.dz + rz * rmp.dx;
    const half = rmp.width / 2 + r;
    // the shove zone ends AT the lip: past it you are airborne over open
    // ground (or stepping onto a bridge deck), and a sideways shove there
    // reads as falling off for no reason. The +0.01 is float slack for the
    // lip point itself, not an extension. The low edge keeps its approach
    // margin so fast entries never tunnel the face.
    if (s > -r && s < rmp.length + 0.01 && Math.abs(ls) < half) {
      const h = rmp.height * Math.max(0, Math.min(1, s / rmp.length));
      if (y + 0.3 >= h) continue; // riding or landing — no wall here
      // below the surface: exit via the back or the nearer side (never the lip)
      const backD = s + r + 0.05;
      const sideD = half - Math.abs(ls) + 0.05;
      if (backD <= sideD) {
        const ns = -r - 0.05;
        return { x: rmp.x + rmp.dx * ns + -rmp.dz * ls, z: rmp.z + rmp.dz * ns + rmp.dx * ls, hit: true };
      }
      const nls = (ls >= 0 ? 1 : -1) * (half + 0.05);
      return { x: rmp.x + rmp.dx * s + -rmp.dz * nls, z: rmp.z + rmp.dz * s + rmp.dx * nls, hit: true };
    }
  }
  return { x, z, hit: false };
}

/** both rooms + the doorway band count as floor (walls handled by callers) */
export function walkableXZ(x: number, z: number, r: number): boolean {
  if (x >= HALL.xMin + r && x <= HALL.xMax - r && z >= HALL.zMin + r && z <= HALL.zMax - r) return true;
  if (x >= RACE.xMin + r && x <= RACE.xMax - r && z >= RACE.zMin + r && z <= RACE.zMax - r) return true;
  return x > RACE.xMax - 0.8 - r && x < HALL.xMin + 0.8 + r && z > DOOR_GAP.z0 + r && z < DOOR_GAP.z1 - r;
}

/** clamp a circle into the two rooms, slipping through the door gap */
export function clampToRooms(x: number, z: number, r: number): { x: number; z: number } {
  const zMin = HALL.zMin + 0.6;
  const zMax = HALL.zMax - 0.8;
  z = Math.max(zMin, Math.min(zMax, z));
  const face = HALL.xMin + r; // room-1 side of the shared face
  const back = RACE.xMax - 0.4 - r; // room-2 side of the masonry
  // masonry mid-plane (independent of r) — bodies stop at the surface they
  // came from, like the ball does, and never teleport across to the room
  // they never entered
  const mid = RACE.xMax - 0.2;
  const doorway = z > DOOR_GAP.z0 + r && z < DOOR_GAP.z1 - r;
  if (x >= face) {
    x = Math.min(HALL.xMax - 0.4, x); // room 1 (or leaning on its side)
  } else if (x > back) {
    // inside the masonry band: the doorway lets you through, otherwise stop
    // at the nearer surface (hall side pushes east, race side pushes west)
    if (!doorway) x = x > mid ? face : back;
  } else {
    x = Math.max(RACE.xMin + 0.4, x); // room 2, already past the wall
  }
  return { x, z };
}
