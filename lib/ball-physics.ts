// ─── Cozy Hall · ball physics (shared by every client) ──────────────────────
// The ball is a sphere that collides with the hall's real furniture volumes
// (SOLIDS in lib/room-defaults), so it can never pass into or rest inside an
// object — however it got there:
//
// • Sub-stepped: a fast throw moves at most half a ball-radius per step, so
//   it can't tunnel through thin things (the scoreboard, a lamp pole).
// • Sphere-vs-solid contacts push the ball out along the contact normal and
//   bounce it; a ball whose centre ends up INSIDE a solid (stale network
//   state, a spawn) leaves through the shallowest face that stays in bounds.
// • Anything that lands on a furniture top rolls off toward the room, and a
//   ball that comes to rest in a gap no player can walk into (say, between a
//   table and a plant) rolls back out along a path around the furniture —
//   the ball can never get stuck out of reach, whatever the layout.
// • Carried balls sit at a hand point that shortens its reach instead of
//   poking into the sofa you're standing against.
// Pure functions over plain numbers: no allocation in the frame loop.

import { BALL_BOUNDS, COLLIDERS, HALL_BOUNDS, SOLIDS, type Solid } from "./room-defaults";

export const BALL_RADIUS = 0.28;
/** how close (centre to centre) you must be to scoop up a resting ball —
 *  enough to reach one resting against any piece of furniture */
export const PICKUP_RADIUS = 0.85;

const GRAVITY = 16;
const FLOOR_BOUNCE = 0.55;
const PROP_BOUNCE = 0.5;
const WALL_BOUNCE = 0.7;
const IMPACT_KEEP = 0.8; // horizontal speed kept on each real bounce
const SETTLE_SPEED = 0.8; // slower impacts than this just come to rest
const ROLL_FRICTION = 13; // per-second decay rolling on the floor (≈ 0.8 per frame at 60 Hz)
const AIR_DRAG = 0.6;
const ROLL_OFF = 3.2; // u/s² nudging a ball off any furniture top
const MAX_SPEED = 24;
const MAX_SUBSTEPS = 8;
const HAND_REACH = 0.55;
const HAND_HEIGHT = 0.85;

export interface BallBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Contact {
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

const scratch: Contact = { nx: 0, ny: 0, nz: 0, depth: 0 };
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const inBoundsXZ = (x: number, z: number) =>
  x >= BALL_BOUNDS.xMin && x <= BALL_BOUNDS.xMax && z >= BALL_BOUNDS.zMin && z <= BALL_BOUNDS.zMax;

/** Sphere (x, y, z, BALL_RADIUS) against one solid. Fills `out`, returns overlap. */
function contact(x: number, y: number, z: number, s: Solid, out: Contact): boolean {
  const R = BALL_RADIUS;
  if (y + R <= s.y0 || y - R >= s.y1) return false;
  // cheap reject before any square roots (this runs thousands of times a frame)
  const ext = (s.shape === "box" ? Math.max(s.hx, s.hz) : s.r) + R;
  if (x - s.x >= ext || s.x - x >= ext || z - s.z >= ext || s.z - z >= ext) return false;

  // closest point on the solid to the ball centre
  let cx: number;
  let cz: number;
  if (s.shape === "box") {
    cx = clamp(x, s.x - s.hx, s.x + s.hx);
    cz = clamp(z, s.z - s.hz, s.z + s.hz);
  } else {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > s.r) {
      cx = s.x + (dx / d) * s.r;
      cz = s.z + (dz / d) * s.r;
    } else {
      cx = x;
      cz = z;
    }
  }
  const cy = clamp(y, s.y0, s.y1);
  const vx = x - cx;
  const vy = y - cy;
  const vz = z - cz;
  const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

  if (dist > 1e-6) {
    if (dist >= R) return false;
    out.nx = vx / dist;
    out.ny = vy / dist;
    out.nz = vz / dist;
    out.depth = R - dist;
    return true;
  }

  // centre is inside the solid: leave through the shallowest face whose exit
  // stays inside the hall (never out the back wall, never under the floor)
  let best = s.y1 - y; // up is always valid
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
  const consider = (d: number, nx: number, ny: number, nz: number) => {
    if (d >= best) return;
    if (ny === 0 && !inBoundsXZ(x + nx * (d + R), z + nz * (d + R))) return;
    best = d;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;
  };
  if (s.y0 > 0) consider(y - s.y0, 0, -1, 0);
  if (s.shape === "box") {
    consider(s.x + s.hx - x, 1, 0, 0);
    consider(x - (s.x - s.hx), -1, 0, 0);
    consider(s.z + s.hz - z, 0, 0, 1);
    consider(z - (s.z - s.hz), 0, 0, -1);
  } else {
    let dx = x - s.x;
    let dz = z - s.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) {
      // dead centre: head toward the middle of the room
      dx = -s.x;
      dz = -s.z;
      d = Math.hypot(dx, dz) || 1;
      consider(s.r, dx / d, 0, dz / d);
    } else {
      consider(s.r - d, dx / d, 0, dz / d);
    }
  }
  out.depth = best + R;
  return true;
}

function keepInBounds(b: BallBody) {
  if (b.x < BALL_BOUNDS.xMin) {
    b.x = BALL_BOUNDS.xMin;
    if (b.vx < 0) b.vx *= -WALL_BOUNCE;
  } else if (b.x > BALL_BOUNDS.xMax) {
    b.x = BALL_BOUNDS.xMax;
    if (b.vx > 0) b.vx *= -WALL_BOUNCE;
  }
  if (b.z < BALL_BOUNDS.zMin) {
    b.z = BALL_BOUNDS.zMin;
    if (b.vz < 0) b.vz *= -WALL_BOUNCE;
  } else if (b.z > BALL_BOUNDS.zMax) {
    b.z = BALL_BOUNDS.zMax;
    if (b.vz > 0) b.vz *= -WALL_BOUNCE;
  }
}

/** Advance a free (un-held) ball by dt seconds. */
export function stepBall(b: BallBody, dt: number): void {
  // sanitize: bad network data must never launch the ball through the map
  if (!Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz)) {
    b.vx = b.vy = b.vz = 0;
    if (!Number.isFinite(b.x + b.y + b.z)) {
      b.x = 0;
      b.y = BALL_RADIUS;
      b.z = 0;
    }
  }
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  if (speed > MAX_SPEED) {
    const k = MAX_SPEED / speed;
    b.vx *= k;
    b.vy *= k;
    b.vz *= k;
  }

  const steps = clamp(Math.ceil((Math.min(speed, MAX_SPEED) * dt) / (BALL_RADIUS * 0.5)), 1, MAX_SUBSTEPS);
  const h = dt / steps;
  let top: Solid | null = null;
  let onFloor = false;

  for (let i = 0; i < steps; i++) {
    b.vy -= GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;

    if (b.y < BALL_RADIUS) {
      b.y = BALL_RADIUS;
      if (b.vy < -SETTLE_SPEED / FLOOR_BOUNCE) {
        b.vy *= -FLOOR_BOUNCE;
        b.vx *= IMPACT_KEEP;
        b.vz *= IMPACT_KEEP;
      } else if (b.vy < 0) {
        b.vy = 0;
      }
      onFloor = true;
    }
    keepInBounds(b);

    for (const s of SOLIDS) {
      if (!contact(b.x, b.y, b.z, s, scratch)) continue;
      const { nx, ny, nz, depth } = scratch;
      b.x += nx * depth;
      b.y += ny * depth;
      b.z += nz * depth;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (ny > 0.7) {
        // a furniture top behaves like the floor
        top = s;
        if (vn < -SETTLE_SPEED / PROP_BOUNCE) {
          b.vx -= (1 + PROP_BOUNCE) * vn * nx;
          b.vy -= (1 + PROP_BOUNCE) * vn * ny;
          b.vz -= (1 + PROP_BOUNCE) * vn * nz;
          b.vx *= IMPACT_KEEP;
          b.vz *= IMPACT_KEEP;
        } else if (vn < 0) {
          b.vx -= vn * nx;
          b.vy -= vn * ny;
          b.vz -= vn * nz;
        }
      } else if (vn < 0) {
        b.vx -= (1 + PROP_BOUNCE) * vn * nx;
        b.vy -= (1 + PROP_BOUNCE) * vn * ny;
        b.vz -= (1 + PROP_BOUNCE) * vn * nz;
      }
    }
    keepInBounds(b);
  }

  const drag = Math.exp(-AIR_DRAG * dt);
  b.vx *= drag;
  b.vz *= drag;

  if (top) {
    // roll off toward the middle of the room — never stranded on furniture
    const dx = -b.x;
    const dz = -b.z;
    const d = Math.hypot(dx, dz) || 1;
    b.vx += (dx / d) * ROLL_OFF * dt;
    b.vz += (dz / d) * ROLL_OFF * dt;
  } else if (onFloor && b.vy === 0) {
    const field = reachField();
    const cell = field.cellAt(b.x, b.z);
    if (cell >= 0 && !field.reach[cell] && (field.flowX[cell] || field.flowZ[cell])) {
      // rolling where no player can reach: ease out along the escape path
      b.vx += field.flowX[cell] * RESCUE_ACCEL * dt;
      b.vz += field.flowZ[cell] * RESCUE_ACCEL * dt;
      const s = Math.hypot(b.vx, b.vz);
      if (s > RESCUE_SPEED) {
        b.vx *= RESCUE_SPEED / s;
        b.vz *= RESCUE_SPEED / s;
      }
    } else {
      const f = Math.exp(-ROLL_FRICTION * dt);
      b.vx *= f;
      b.vz *= f;
    }
  }
}

// ─── never out of reach ──────────────────────────────────────────────────────
// A floor grid (10 cm) built once, lazily: `reach` marks spots a player can
// get within PICKUP_RADIUS of (using the same COLLIDERS that block players),
// and `flow` points every other spot the ball can occupy toward the nearest
// reachable one — a breadth-first path that goes around the furniture.
const CELL = 0.1;
const RESCUE_SPEED = 1.2;
const RESCUE_ACCEL = 4;
const PLAYER_RADIUS = 0.38;

interface ReachField {
  reach: Uint8Array;
  flowX: Float32Array;
  flowZ: Float32Array;
  cellAt: (x: number, z: number) => number;
}

let field: ReachField | null = null;

function playerCanStand(x: number, z: number): boolean {
  if (Math.abs(x) > HALL_BOUNDS.x || z < HALL_BOUNDS.zMin || z > HALL_BOUNDS.zMax) return false;
  for (const c of COLLIDERS) {
    const cx = clamp(x, c.x - c.hx, c.x + c.hx);
    const cz = clamp(z, c.z - c.hz, c.z + c.hz);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return false;
  }
  return true;
}

export function reachField(): ReachField {
  if (field) return field;
  const W = Math.round((BALL_BOUNDS.xMax - BALL_BOUNDS.xMin) / CELL) + 1;
  const H = Math.round((BALL_BOUNDS.zMax - BALL_BOUNDS.zMin) / CELL) + 1;
  const n = W * H;
  const reach = new Uint8Array(n);
  const ballOk = new Uint8Array(n);
  const flowX = new Float32Array(n);
  const flowZ = new Float32Array(n);

  // where the ball can rest, and where a player can stand
  const stand = new Uint8Array(n);
  for (let gz = 0; gz < H; gz++) {
    for (let gx = 0; gx < W; gx++) {
      const x = BALL_BOUNDS.xMin + gx * CELL;
      const z = BALL_BOUNDS.zMin + gz * CELL;
      const i = gz * W + gx;
      ballOk[i] = overlapsSolid(x, BALL_RADIUS, z) ? 0 : 1;
      stand[i] = playerCanStand(x, z) ? 1 : 0;
    }
  }
  // reachable = a player can stand within pickup range; only ball spots a
  // player can't stand on themselves (next to furniture) need the search
  const rCells = Math.floor((PICKUP_RADIUS - 0.05) / CELL);
  const disk: number[] = [];
  for (let dz = -rCells; dz <= rCells; dz++)
    for (let dx = -rCells; dx <= rCells; dx++) if (dx * dx + dz * dz <= rCells * rCells) disk.push(dx, dz);
  for (let gz = 0; gz < H; gz++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gz * W + gx;
      if (stand[i]) {
        reach[i] = 1;
        continue;
      }
      if (!ballOk[i]) continue;
      for (let k = 0; k < disk.length; k += 2) {
        const ax = gx + disk[k];
        const az = gz + disk[k + 1];
        if (ax >= 0 && ax < W && az >= 0 && az < H && stand[az * W + ax]) {
          reach[i] = 1;
          break;
        }
      }
    }
  }

  // breadth-first from every reachable ball spot, outward through ball spots
  const queue = new Int32Array(n);
  const seen = new Uint8Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (reach[i] && ballOk[i]) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  }
  const NB = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];
  while (head < tail) {
    const i = queue[head++];
    const gx = i % W;
    const gz = (i - gx) / W;
    for (let k = 0; k < NB.length; k += 2) {
      const ax = gx + NB[k];
      const az = gz + NB[k + 1];
      if (ax < 0 || ax >= W || az < 0 || az >= H) continue;
      const j = az * W + ax;
      if (seen[j] || !ballOk[j]) continue;
      seen[j] = 1;
      const len = Math.hypot(NB[k], NB[k + 1]);
      flowX[j] = -NB[k] / len; // back toward the cell we came from
      flowZ[j] = -NB[k + 1] / len;
      queue[tail++] = j;
    }
  }

  field = {
    reach,
    flowX,
    flowZ,
    cellAt: (x, z) => {
      const gx = Math.round((x - BALL_BOUNDS.xMin) / CELL);
      const gz = Math.round((z - BALL_BOUNDS.zMin) / CELL);
      return gx < 0 || gx >= W || gz < 0 || gz >= H ? -1 : gz * W + gx;
    },
  };
  return field;
}

/** Push a ball out of any furniture / walls / floor without touching its
 *  velocity — for positions that arrive from the network or a spawn. */
export function ejectBall(b: { x: number; y: number; z: number }): void {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    if (b.y < BALL_RADIUS) b.y = BALL_RADIUS;
    b.x = clamp(b.x, BALL_BOUNDS.xMin, BALL_BOUNDS.xMax);
    b.z = clamp(b.z, BALL_BOUNDS.zMin, BALL_BOUNDS.zMax);
    for (const s of SOLIDS) {
      if (!contact(b.x, b.y, b.z, s, scratch)) continue;
      b.x += scratch.nx * scratch.depth;
      b.y += scratch.ny * scratch.depth;
      b.z += scratch.nz * scratch.depth;
      moved = true;
    }
    if (!moved) return;
  }
}

function overlapsSolid(x: number, y: number, z: number): boolean {
  for (const s of SOLIDS) if (contact(x, y, z, s, scratch)) return true;
  return false;
}

const REACHES = [1, 0.8, 0.6, 0.4, 0.2, 0];

/**
 * Where a carried ball sits for a player at (px, py, pz) facing `facing`:
 * out front at hand height, pulled back toward the body when furniture is
 * in the way. `reach` / `height` let a throw start from its own hand spot.
 */
export function handPoint(
  px: number,
  py: number,
  pz: number,
  facing: number,
  out: { x: number; y: number; z: number },
  reach = HAND_REACH,
  height = HAND_HEIGHT
): { x: number; y: number; z: number } {
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const y = py + height;
  for (const k of REACHES) {
    const x = px + fx * reach * k;
    const z = pz + fz * reach * k;
    if (!overlapsSolid(x, y, z)) {
      out.x = x;
      out.y = y;
      out.z = z;
      return out;
    }
  }
  // wedged (e.g. perched on the sofa): settle the ball just outside
  out.x = px + fx * reach;
  out.y = y;
  out.z = pz + fz * reach;
  ejectBall(out);
  return out;
}
