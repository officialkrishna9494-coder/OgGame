// ─── Cozy Hall · live-TV contract tests ─────────────────────────────────────
// The hall's TV shows the room's real video, locked in as executable specs:
//
//   MATH ..... quad→matrix3d maps box corners exactly onto the quad
//              (identity, translation, and a skewed perspective case)
//   OVERLAY .. muted pinned player: never clicks, never emits, hides when
//              the screen turns away / empties / API blocked, below the HUD
//   SCENE .... render loop projects the 4.8 × 2.6 corners every frame,
//              gated on shelf + facing (canvas card stays the fallback)
//   SHARED ... one YouTube API loader for panel + overlay, mounted in page
//
// Run: `npx tsx tests/tv-screen.test.mts` (or `npm test` runs every suite)
// Pure Node — no browser, no dev server. Fails non-zero on violation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const { quadToMatrix3d, tvScreenAnchor } = await import("../lib/tv-screen");

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

/** apply a matrix3d() string to (x, y), with the projective divide */
function applyMatrix(s: string, x: number, y: number): [number, number] {
  const m = s
    .slice("matrix3d(".length, -1)
    .split(",")
    .map(Number);
  assert.equal(m.length, 16);
  const X = (m[0] * x + m[4] * y + m[12]) / (m[3] * x + m[7] * y + m[15]);
  const Y = (m[1] * x + m[5] * y + m[13]) / (m[3] * x + m[7] * y + m[15]);
  return [X, Y];
}

function expectMaps(q: { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }, w: number, h: number) {
  const s = quadToMatrix3d(q, w, h);
  const targets: Array<[number, number]> = [
    [q.x0, q.y0],
    [q.x1, q.y1],
    [q.x2, q.y2],
    [q.x3, q.y3],
  ];
  const sources: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  sources.forEach(([x, y], i) => {
    const [X, Y] = applyMatrix(s, x, y);
    assert.ok(Math.abs(X - targets[i][0]) < 0.5 && Math.abs(Y - targets[i][1]) < 0.5, `corner ${i} lands on the quad`);
  });
}

console.log("live TV — real video pinned to the 3D screen");

ok("matrix: identity quad is the identity matrix", () => {
  const s = quadToMatrix3d({ x0: 0, y0: 0, x1: 480, y1: 0, x2: 480, y2: 260, x3: 0, y3: 260 }, 480, 260);
  assert.equal(s, "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
});

ok("matrix: translated quad carries the offset (column-major, not transposed)", () => {
  const s = quadToMatrix3d({ x0: 10, y0: 20, x1: 490, y1: 20, x2: 490, y2: 280, x3: 10, y3: 280 }, 480, 260);
  assert.equal(s, "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,10,20,0,1)");
});

ok("matrix: skewed perspective quad maps all four corners", () => {
  expectMaps({ x0: 100, y0: 50, x1: 400, y1: 70, x2: 380, y2: 250, x3: 120, y3: 230 }, 480, 260);
});

ok("matrix: anchor starts hidden", () => {
  assert.equal(tvScreenAnchor.visible, false);
});

ok("overlay: muted, click-through, read-only follower below the HUD", () => {
  const ov = read("components/TvScreenOverlay.tsx");
  assert.match(ov, /player\.mute\(\)/, "never doubles the panel's audio");
  assert.match(ov, /pointer-events-none/, "clicks fall through to the hall");
  assert.match(ov, /aria-hidden/, "decorative to assistive tech");
  assert.ok(!ov.includes("onControl") && !ov.includes(".emit("), "read-only — no echo guards needed");
  assert.match(ov, /loadVideoById/, "swaps with the shelf");
  assert.match(ov, /playVideo\(\)/, "plays with the room");
  assert.match(ov, /pauseVideo\(\)/, "pauses with the room");
  assert.match(ov, /seekTo/, "seeks to the room clock on drift");
  assert.match(ov, /tvScreenAnchor\.visible/, "hides with the anchor");
  assert.match(ov, /z-\[11\]/, "above the canvas, below the HUD");
  assert.match(ov, /quadToMatrix3d\(tvScreenAnchor/, "pinned by the solved quad");
});

ok("overlay: heals its own playback (catch-up beat, gesture unlock, tab return)", () => {
  const ov = read("components/TvScreenOverlay.tsx");
  assert.match(ov, /const RESYNC_MS = 4_000/, "frozen/stalled video retries on a beat");
  assert.match(ov, /setInterval\(\(\) => \{\s*if \(!document\.hidden\) syncPlayer\(\);/, "beat skips backgrounded tabs");
  assert.match(ov, /addEventListener\("pointerdown", unlock\)/, "first tap unlocks a gated autoplay");
  assert.match(ov, /addEventListener\("keydown", unlock\)/, "first keypress unlocks a gated autoplay");
  assert.match(ov, /addEventListener\("visibilitychange", onVis\)/, "resyncs on tab return");
  assert.match(ov, /clearInterval\(beat\)/, "no timer outlives the overlay");
  assert.match(ov, /removeEventListener\("pointerdown", unlock\)/, "the unlock fires once");
});

ok("scene: leaving the hall clears the projected quad", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /tvScreenAnchor\.visible = false;/, "unmount hides the overlay");
});

ok("scene: corners projected per frame, gated on shelf + facing", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /tvScreenAnchor\.visible = show/, "anchor driven every frame");
  assert.match(scene, /TV\.bodyZ \+ 0\.3/, "screen must face the camera");
  assert.match(scene, /TV\.x \+ \(i === 0 \|\| i === 3 \? -2\.4 : 2\.4\)/, "4.8 m wide corners");
  assert.match(scene, /TV\.screenY \+ \(i < 2 \? 1\.3 : -1\.3\)/, "2.6 m tall corners");
});

ok("shared: one API loader, overlay mounted with the shelf", () => {
  const lib = read("lib/youtube.ts");
  assert.match(lib, /iframe_api/, "single script for the hall");
  const panel = read("components/TvPanel.tsx");
  assert.ok(!panel.includes("iframe_api"), "panel reuses the shared loader");
  assert.match(panel, /loadYouTubeApi/, "panel reuses the shared loader");
  const ov = read("components/TvScreenOverlay.tsx");
  assert.match(ov, /loadYouTubeApi/, "overlay reuses the shared loader");
  const page = read("app/page.tsx");
  assert.match(page, /<TvScreenOverlay/, "mounted above the canvas, below the HUD");
});

console.log(`\nPASS ${passed} checks — the wall TV plays the room's video.`);
