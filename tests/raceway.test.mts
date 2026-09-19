// ─── Cozy Hall · raceway contract tests ─────────────────────────────────────
// The big door + bigger race room, locked in as executable specs:
//
//   DOOR ...... big opening on the left wall, front (camera) half
//   ROOM ...... 78 × 36 west of the hall (twisty circuit needs the space)
//   TRACK ..... closed multi-turn centerline, two lanes, ramps on the line,
//               lap gates in travel order, clean racing props only
//
// Run: `npx tsx tests/raceway.test.mts` (or `npm test` runs every suite)
// Pure Node — no browser, no dev server. Fails non-zero on violation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const layout = await import("../lib/hall-layout");
const { HALL, RACE, DOOR_GAP, RAMPS, BRIDGES, TRACK, TRACK_POINTS, TRACK_PLANE, TRACK_WIDTH, TRACK_GATES, sampleTrackCenterline, bridgeTopAt, clampToRooms, rampGroundAt, resolveRamp, PROPS } = layout;
const { BALL_BOUNDS } = await import("../lib/room-defaults");

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log("raceway — big door + bigger twisty circuit");

// ── 1 · big door on the left wall, front half ────────────────────────────────
ok("door: big opening on the left wall, front (camera) half", () => {
  assert.equal(HALL.xMin, -23);
  const w = DOOR_GAP.z1 - DOOR_GAP.z0;
  assert.ok(w >= 5, `door ${w} m wide — karts must fit through side by side`);
  assert.ok(DOOR_GAP.h >= 4, `door ${DOOR_GAP.h} m tall`);
  assert.ok(DOOR_GAP.z0 > 0, "door sits on the front (camera) half, the bottom side");
  assert.ok(DOOR_GAP.z1 <= HALL.zMax, "door stays inside the shared wall");
  // the driving lane through the door stays empty — no lamp post (or
  // anything else) standing in front of it on either side
  for (const p of PROPS) {
    if (p.y0 != null && p.y0 > 0) continue;
    const ex = p.shape === "box" ? p.hx : p.r;
    const ez = p.shape === "box" ? p.hz : p.r;
    const inX = p.x - ex < -16 && p.x + ex > -30;
    const inZ = p.z - ez < 12.8 && p.z + ez > 7.2;
    assert.ok(!(inX && inZ), `prop at (${p.x},${p.z}) blocks the doorway lane`);
  }
});

// ── 2 · bigger room west ─────────────────────────────────────────────────────
ok("room: bigger than the hall, due west through the door", () => {
  const hallW = HALL.xMax - HALL.xMin;
  const raceW = RACE.xMax - RACE.xMin;
  const raceD = RACE.zMax - RACE.zMin;
  assert.equal(RACE.xMax, HALL.xMin, "shares the hall's left wall");
  assert.ok(raceW >= hallW + 20, `race ${raceW} m wide — room for turns and turns`);
  assert.ok(raceW * raceD > hallW * (HALL.zMax - HALL.zMin), "race annex is the bigger room");
});

// ── 3 · twisty two-lane centerline ───────────────────────────────────────────
const loop = sampleTrackCenterline(16);

ok("track: closed multi-turn loop with two lanes", () => {
  assert.ok(TRACK_POINTS.length >= 8, "enough control points for real turns");
  assert.equal(TRACK_WIDTH, 7);
  assert.equal(TRACK.laneW, 3.5, "two 3.5 m lanes");
  assert.ok(loop.length >= 128, "smoothly sampled");
  // closed: last sample flows back into the first
  const first = loop[0];
  const last = loop[loop.length - 1];
  const gap = Math.hypot(first.x - last.x, first.z - last.z);
  assert.ok(gap < 3, `loop closes (last→first ${gap.toFixed(2)} m)`);
  // every control point lives inside the room with racing margin
  for (const [x, z] of TRACK_POINTS) {
    assert.ok(x > RACE.xMin + 3 && x < RACE.xMax - 3, `point (${x},${z}) inside west/east walls`);
    assert.ok(z > RACE.zMin + 3 && z < RACE.zMax - 3, `point (${x},${z}) inside north/south walls`);
  }
  // genuinely twisty: heading must swing through all four quadrants
  const quads = new Set<string>();
  for (let i = 0; i < loop.length; i += 8) {
    const p = loop[i];
    const q = loop[(i + 8) % loop.length];
    quads.add(`${Math.sign(q.x - p.x)},${Math.sign(q.z - p.z)}`);
  }
  assert.ok(quads.size >= 4, `turns in every direction (${quads.size} heading quadrants)`);
});

const distToLoop = (x: number, z: number) => {
  let best = Infinity;
  for (const p of loop) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < best) best = d;
  }
  return best;
};

// ── 4 · jump ramps on the racing line, bridge approaches on the deck ─────────
ok("ramps: jump ramps ride the line, approaches land on the deck ends", () => {
  assert.ok(BRIDGES.length >= 1, "shortcut deck exists");
  const deck = BRIDGES[0];
  const ends = [-1, 1].map((s) => ({ x: deck.x + deck.dx * (deck.length / 2) * s, z: deck.z + deck.dz * (deck.length / 2) * s }));
  let jumps = 0;
  let approaches = 0;
  for (const r of RAMPS) {
    const topX = r.x + r.dx * r.length;
    const topZ = r.z + r.dz * r.length;
    const landsOnDeck = ends.some((e) => Math.hypot(topX - e.x, topZ - e.z) < 1.5);
    if (landsOnDeck) {
      approaches++;
      assert.ok(Math.abs(r.height - deck.height) < 0.01, "approach meets the deck flush");
      assert.ok(r.width <= deck.width + 0.01, "approach fits the deck");
      continue;
    }
    jumps++;
    assert.ok(r.height >= 1 && r.height <= 1.6, "launch height stays kart-safe");
    // midpoint of the slope must sit on the track
    const mx = r.x + r.dx * (r.length / 2);
    const mz = r.z + r.dz * (r.length / 2);
    assert.ok(distToLoop(mx, mz) <= TRACK_WIDTH / 2, `ramp at (${r.x},${r.z}) rides the line`);
    // facing travel: positive dot with the local loop direction
    let bi = 0;
    let bd = Infinity;
    loop.forEach((p, i) => {
      const d = Math.hypot(mx - p.x, mz - p.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const a = loop[bi];
    const b = loop[(bi + 8) % loop.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dot = ((b.x - a.x) / len) * r.dx + ((b.z - a.z) / len) * r.dz;
    assert.ok(dot > 0.7, `ramp faces travel (dot ${dot.toFixed(2)})`);
  }
  assert.ok(jumps >= 3, "jump ramps for the straights");
  assert.equal(approaches, 2, "one approach per deck end");
  // heightfield carries wheels over the mid-slope
  const r0 = RAMPS[0];
  const mid = rampGroundAt(r0.x + r0.dx * (r0.length / 2), r0.z + r0.dz * (r0.length / 2));
  assert.ok(mid > 0.3, "mid-slope has real height");
  // masonry beside the tall end shoves back at ground level …
  const lipX = r0.x + r0.dx * r0.length;
  const lipZ = r0.z + r0.dz * r0.length;
  const side = resolveRamp(lipX - r0.dz * (r0.width / 2 + 0.4), lipZ + r0.dx * (r0.width / 2 + 0.4), 0, 0.8);
  assert.equal(side.hit, true, "masonry beside the tall end shoves back");
  // … while riding the mid-slope is never a wall
  const ride = resolveRamp(r0.x + r0.dx * (r0.length / 2), r0.z + r0.dz * (r0.length / 2), mid, 0.8);
  assert.equal(ride.hit, false, "riding the slope is never a wall");
});

// ── 5 · lap gates in travel order ────────────────────────────────────────────
ok("gates: lap gates ring the loop in travel order", () => {
  assert.ok(TRACK_GATES.length >= 5, "start/finish plus sector gates");
  const order = TRACK_GATES.map((gt) => {
    let bi = 0;
    let bd = Infinity;
    loop.forEach((p, i) => {
      const d = Math.hypot(gt.x - p.x, gt.z - p.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    assert.ok(bd <= 4.5, `gate (${gt.x},${gt.z}) sits on the loop`);
    return bi;
  });
  for (let k = 1; k < order.length; k++) {
    const prev = order[k - 1];
    const cur = order[k];
    const fwd = (cur - prev + loop.length) % loop.length;
    assert.ok(fwd > 0 && fwd < loop.length / 2, `gate ${k} follows gate ${k - 1} in travel order`);
  }
});

// ── 6 · clean racing props, clear of the ribbon ──────────────────────────────
ok("props: tires, cones and floodlights only — clear of the ribbon", () => {
  // elevated spans (deck rails) hug the bridge, not the ribbon — §10 checks them
  const raceProps = PROPS.filter((p) => p.x < HALL.xMin && !(p.y0 != null && p.y0 > 0));
  assert.ok(raceProps.length >= 10, "a dressed circuit");
  for (const p of raceProps) {
    const r = p.shape === "box" ? Math.max(p.hx, p.hz) : p.r;
    const need = TRACK_WIDTH / 2 + r + 0.75;
    const d = distToLoop(p.x, p.z);
    assert.ok(d >= need, `prop at (${p.x},${p.z}) ${d.toFixed(1)} m off the line (needs ${need.toFixed(1)})`);
  }
  // no ground prop inside any wedge footprint either — a stack poking
  // through a slope reads as junk sitting on the road
  for (const r of RAMPS) {
    for (const p of PROPS) {
      if (p.y0 != null && p.y0 > 0) continue;
      if (p.x > HALL.xMin) continue; // race wedges live west of the hall
      const pr = p.shape === "box" ? Math.max(p.hx, p.hz) : p.r;
      const s = (p.x - r.x) * r.dx + (p.z - r.z) * r.dz;
      const lat = Math.abs((p.x - r.x) * -r.dz + (p.z - r.z) * r.dx);
      if (s > -0.5 && s < r.length + 0.5 && lat < r.width / 2 + pr + 0.4) {
        assert.fail(`prop at (${p.x},${p.z}) sits in the ${r.height >= 2 ? "bridge approach" : "jump ramp"} footprint`);
      }
    }
  }
  const env = read("components/scene/environment.ts");
  // scope to the raceway annex block (the dodgeball court has its own flags)
  const raceBlock = env.slice(env.indexOf("raceway annex"), env.indexOf("windows + light beams"));
  assert.ok(raceBlock.length > 1000, "race annex block found");
  for (const banned of ["grandstand", "crowd", "bannerTexture(", "bunting", "flagGeo"]) {
    assert.ok(!raceBlock.includes(banned), `no "${banned}" — the track stays clean`);
  }
});

// ── 7 · paint comes from the same centerline ─────────────────────────────────
ok("paint: track texture is drawn from the centerline over its plane", () => {
  const tex = read("components/scene/textures.ts");
  assert.match(tex, /sampleTrackCenterline/, "one centerline source for paint");
  assert.match(tex, /TRACK_PLANE/, "paint maps the same plane the mesh uses");
  assert.match(tex, /TRACK_WIDTH/, "curbs scale with the ribbon");
  assert.ok(TRACK_PLANE.x0 >= RACE.xMin + 1 && TRACK_PLANE.x1 <= RACE.xMax - 1, "paint plane inside the room");
  assert.ok(Math.abs(TRACK.cx - (TRACK_PLANE.x0 + TRACK_PLANE.x1) / 2) < 0.01, "mesh centres on its paint");
});

// ── 8 · balls, feet and karts all reach the far turn ─────────────────────────
ok("bounds: balls, walkers and karts cover the whole bigger room", () => {
  assert.ok(BALL_BOUNDS.xMin <= RACE.xMin + 1, "throws fly to the far hairpin");
  // doorway passes, masonry blocks
  const through = clampToRooms(-23.2, 10, 0.4);
  assert.ok(through.x < HALL.xMin, "doorway lets you through");
  const wall = clampToRooms(-23.2, 0, 0.4);
  assert.equal(wall.x, HALL.xMin + 0.4, "shared wall blocks off the gap");
  const far = clampToRooms(-200, 0, 0.4);
  assert.equal(far.x, RACE.xMin + 0.4, "far wall holds");
});

// ── 9 · rider glued to the seat + speed-scaled launches ─────────────────────
ok("air: rider rides kart height, take-off scales with driving speed", () => {
  const scene = read("components/HallScene.tsx");
  // seat placement AND the per-frame baseY both add the kart's air height —
  // otherwise the hips stay grounded while a jumping car flies without them
  assert.match(scene, /g\.position\.set\(seatX, driverSim\.y \+ CART_RIDER_Y, seatZ\)/, "seat follows kart air");
  assert.match(scene, /driving && driverSim \? driverSim\.y \+ CART_RIDER_Y/, "rider base follows kart air");
  // lip exit converts forward speed × climbed grade into upward velocity —
  // crawling dribbles off, turbo launches; reversing never launches
  assert.match(scene, /Math\.max\(0, sim\.speed\) \* grade/, "take-off scales with speed");
  assert.match(scene, /grade > 0\.02/, "no micro-pops off flat lips");
});

// ── 10 · shortcut bridge over the centre (over AND through) ──────────────────
ok("bridge: horizontal deck by the OG SPELL paint, joining road included", () => {
  assert.equal(BRIDGES.length, 1);
  const deck = BRIDGES[0];
  // horizontal span across the infield centre, near the OG SPELL paint
  assert.ok(Math.abs(deck.dx) > 0.9 && Math.abs(deck.dz) < 0.1, "deck runs horizontally");
  assert.ok(deck.x > RACE.xMin + 10 && deck.x < RACE.xMax - 10, "deck centred in the room");
  assert.ok(Math.hypot(deck.x - -60, deck.z - -1) < 8, "deck sits by the OG SPELL paint");
  assert.ok(deck.width >= 3, "a kart fits the deck");
  // the whole deck sits in the little centre, clear of every other road
  for (let k = 0; k <= 8; k++) {
    const px = deck.x + deck.dx * (deck.length / 2) * ((k / 4) - 1);
    const pz = deck.z + deck.dz * (deck.length / 2) * ((k / 4) - 1);
    let best = Infinity;
    for (const p of loop) {
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d < best) best = d;
    }
    assert.ok(best >= TRACK_WIDTH / 2 + 1, `deck centre clear of the ribbon (${best.toFixed(1)} m)`);
  }
  // tall enough to drive UNDER (through) as well as over
  assert.ok(deck.height >= 2, "clearance to drive underneath");
  assert.equal(bridgeTopAt(deck.x, deck.z), deck.height, "deck top is rideable surface");
  assert.equal(bridgeTopAt(deck.x, deck.z + deck.width / 2 + 2), 0, "no surface off the deck");
  // no pole on the driving line — open deck centre end to end (ground
  // clutter tucked fully underneath doesn't count: the driving band is
  // deck.height ± kart clearance)
  for (const p of PROPS) {
    const s = (p.x - deck.x) * deck.dx + (p.z - deck.z) * deck.dz;
    const lat = Math.abs((p.x - deck.x) * -deck.dz + (p.z - deck.z) * deck.dx);
    if (Math.abs(s) <= deck.length / 2 && lat < deck.width / 2 - 0.8) {
      const y0 = p.y0 ?? 0;
      if (y0 < deck.height + 1.0 && p.y1 > deck.height - 1.2) {
        assert.fail(`prop at (${p.x},${p.z}) stands on the driving line`);
      }
    }
  }
  // waist-high rails hug both deck edges at deck height — the rigid top road
  const rails = PROPS.filter(
    (p) => p.shape === "box" && p.y0 != null && p.y0 > 0 && Math.abs((p.x - deck.x) * deck.dx + (p.z - deck.z) * deck.dz) <= deck.length / 2
  );
  assert.equal(rails.length, 2, "one rail per deck edge");
  for (const r of rails) {
    assert.ok(r.shape === "box" && Math.abs(r.y0 - deck.height) < 0.01, "rails start at the deck");
    assert.ok(r.shape === "box" && r.y1 - deck.height >= 0.4, "rails stand waist-high");
  }
  // the sim merges the deck only when reachable — floor drivers underneath
  // keep floor ground (no teleport), walkers stroll the top road too, and
  // gates ignore airborne karts
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /bridgeTopAt/, "kart ground reads the deck");
  assert.match(scene, /deckGround/, "deck merges only when reachable");
  assert.match(scene, /deckGroundFeet/, "walkers stroll the top road too");
  assert.match(scene, /c\.y1 < sim\.y - 0\.3/, "karts fly over low props, stop at rails");
  assert.match(scene, /\(c\.y0 \?\? 0\) > sim\.y \+ 1\.2/, "karts pass under elevated spans");
  assert.match(scene, /\(c\.y0 \?\? 0\) > me\.y \+ 1\.7/, "walkers pass under elevated spans");
  assert.match(scene, /me\.y > 1\.5/, "lap gates ignore airborne karts");
  const env = read("components/scene/environment.ts");
  assert.match(env, /for \(const b of BRIDGES\)/, "deck mesh built from data");
});

console.log(`\nPASS ${passed} checks — big door + bigger twisty circuit hold.`);
