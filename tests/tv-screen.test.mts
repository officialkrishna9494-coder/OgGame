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
  assert.match(ov, /cueVideoById/, "a paused room cues a real frame — never a black player");
  assert.match(ov, /loadVideoById\(id, target\)/, "loads straight to the room's frame");
  assert.match(ov, /z-0/, "a layer below the canvas");
  assert.ok(!ov.includes("z-[11]"), "never lifted above the hall");
  assert.match(ov, /tvScreenAnchor\.el = wrapRef\.current/, "hands its box to the render tick");
  assert.match(ov, /tvScreenAnchor\.ready = /, "reports when it has a frame to show");
  assert.ok(!ov.includes("requestAnimationFrame"), "no rAF of its own — the render tick paints it");
  assert.ok(!ov.includes("style.transform"), "never moves itself");
});

ok("occlusion: the picture shows through a depth-tested hole, not over the hall", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /new THREE\.WebGLRenderer\(\{[\s\S]{0,700}?alpha: true/, "canvas keeps an alpha channel to punch through");
  assert.match(scene, /depthFunc: THREE\.EqualDepth/, "only the front-most surface is punched");
  assert.match(scene, /blendSrc: THREE\.ZeroFactor,[\s\S]{0,80}blendDst: THREE\.ZeroFactor/, "the punch clears pixels, it doesn't tint them");
  assert.match(scene, /tvHole\.position\.copy\(tvScreen\.position\)/, "hole sits exactly on the screen");
  assert.match(scene, /tvHole\.visible = show && tvScreenAnchor\.ready/, "no hole without a picture to show through it");
  assert.match(scene, /tvHole\.visible = false;/, "starts closed — the status card is the fallback");
  const page = read("app/page.tsx");
  const overlay = page.indexOf("<TvScreenOverlay");
  const hall = page.indexOf("<HallScene");
  assert.ok(overlay > 0 && overlay < hall, "mounted before the canvas, so it paints under it");
});

ok("paint: the DOM layer moves in the frame tick, from the same camera", () => {
  const scene = read("components/HallScene.tsx");
  const paint = scene.indexOf("paintTvScreen()");
  const render = scene.indexOf("renderer.render(scene, camera)");
  assert.ok(paint > 0, "the scene paints the overlay");
  assert.ok(render > paint, "painted before the frame is drawn — never a frame behind");
  // the camera matrix must be refreshed once per frame, right after aiming
  assert.match(
    scene,
    /camera\.lookAt\(lookSm\);\n(?:\s*\/\/[^\n]*\n)*\s*camera\.updateMatrixWorld\(\);/,
    "fresh camera matrix before projecting (render only refreshes it after)"
  );
  const lib = read("lib/tv-screen.ts");
  assert.match(lib, /quadToMatrix3d\(tvScreenAnchor, TV_OVERLAY_W, TV_OVERLAY_H\)/, "the one solve the tick owns");
  assert.match(lib, /tvScreenAnchor\.shown/, "hide/show only on change");
});

ok("sound: exactly one speaker per viewer, and the shelf owns it when open", () => {
  const ov = read("components/TvScreenOverlay.tsx");
  assert.match(
    ov,
    /audioRef\.current && !panelAudioRef\.current && tvGestureSeen\(\)\s*\)\s*player\.unMute\(\)/,
    "the wall speaks only when joined, the shelf is shut, and a gesture happened"
  );
  assert.match(ov, /else player\.mute\(\)/, "silent otherwise — the room never hears it twice");
  assert.match(ov, /markTvGesture\(\)/, "records the interaction browsers demand");
  assert.match(ov, /frame\.style\.position = "absolute"/, "the wall frame is sized by us, not by a copied class");
  assert.match(ov, /\}, \[audio, panelAudio\]\)/, "joining applies to the wall at once");
  const lib = read("lib/tv-audio.ts");
  assert.match(lib, /localStorage/, "the choice is remembered between visits");
  assert.match(lib, /typeof window === "undefined"/, "safe to render on the server");
  const page = read("app/page.tsx");
  assert.match(page, /const toggleTvAudio = useCallback\(\(\) => \{\s*[\s\S]{0,220}markTvGesture\(\);/, "asking for sound counts as the interaction");
});

ok("shelf: controls first, the player exists only while it is open", () => {
  const panel = read("components/TvPanel.tsx");
  // closed = controls only: no box, no parked embed, nothing that can pop up
  assert.ok(!panel.includes("opacity-0"), "a closed shelf parks no invisible screen");
  assert.match(panel, /\{playerOpen && \(/, "the screen's box exists only while open");
  assert.match(panel, /max-h-\[calc\(100dvh-6rem\)\]/, "the panel can never outgrow the viewport");
  assert.match(panel, /h-\[min\(44dvh,240px\)\]/, "the video is viewport-capped, so the controls stay reachable");
  const controls = panel.indexOf("play for everyone");
  const list = panel.indexOf("max-h-28 min-h-0 flex-1 overflow-y-auto");
  assert.ok(controls > 0 && controls < list, "controls sit outside the scrolling list");
  assert.match(panel, /controls: 1/, "native controls for seek / fast-forward");
  assert.match(panel, /fs: 1/, "fullscreen is offered");
  assert.match(panel, /!frame\.hasAttribute\("allowfullscreen"\)/, "only patched when missing — re-editing restarts the embed");
  assert.match(panel, /onToggleAudio/, "one button joins the room's sound");
  assert.match(panel, /onTogglePlayer/, "one button opens the full player");
  assert.match(panel, /seekTo: t/, "a seek in the opened player is relayed to the room");
  assert.match(panel, /setProg\(\{\s*\n\s*t: Math\.max\(0, \(s\.positionSec/, "the readout still follows the room's clock with the screen closed");
  const page = read("app/page.tsx");
  assert.match(page, /panelAudio=\{tvOpen && tvPlayerOpen\}/, "the shelf is the speaker only while open");
  assert.match(page, /onToggleAudio=\{toggleTvAudio\}/, "the panel drives the shared state");
  assert.match(page, /setTvPlayerOpen\(false\);/, "hiding the shelf hands the sound back to the wall");
});

ok("player lifecycle: one embed per open, never rebuilt on a video change", () => {
  const panel = read("components/TvPanel.tsx");
  const create = panel.indexOf("const host = document.createElement(\"div\");");
  const effectEnd = panel.indexOf("}, [playerOpen]);");
  assert.ok(create > 0 && effectEnd > create, "the embed is built in the open-only effect");
  const block = panel.slice(create, effectEnd);
  assert.match(block, /wrap\.appendChild\(host\)/, "the API owns OUR node, never one React renders");
  assert.ok(!/\[videoId\]/.test(panel), "videoId is never an effect dep — rebuilding per video is the storm");
  assert.ok(!block.includes("new YT.Player(host") === false, "the player is constructed on that node");
  assert.match(block, /return \(\) => \{[\s\S]{0,260}player\?\.destroy\(\);[\s\S]{0,120}host\.remove\(\);/, "closing destroys the embed and its node");
  assert.match(panel, /if \(!playerOpen\) return;\s*\n\s*const wrap = wrapRef\.current;/, "nothing is created while the shelf is closed");
  // videos swap through the open player, never by rebuilding it
  const sync = panel.slice(panel.indexOf("const syncToRoom"), panel.indexOf("// Open → build the player"));
  assert.match(sync, /if \(id !== loadedRef\.current\) \{/, "a video change is a swap, not a rebuild");
  assert.match(sync, /player\.loadVideoById\(id, target\)/, "a playing room loads straight to the room's frame");
  assert.match(sync, /player\.cueVideoById\(id, target\)/, "a paused room cues a real frame — never a black player");
  assert.ok(!/new YT\.Player/.test(sync), "the sync path can never construct a player");
});

ok("player lifecycle: a loading player can never walk the shelf forward", () => {
  const panel = read("components/TvPanel.tsx");
  assert.match(panel, /const LOAD_GRACE_MS = 3_000/,
    "a player younger than the grace window cannot have ended a video");
  const ended = panel.indexOf("YT.PlayerState.ENDED");
  const after = panel.indexOf("YT.PlayerState.PLAYING", ended);
  const guard = panel.slice(ended, after > 0 ? after : panel.length);
  assert.match(guard, /loadedRef\.current !== curIdRef\.current/, "only the video we actually loaded may advance");
  assert.match(guard, /now - loadAtRef\.current < LOAD_GRACE_MS/, "no advance within the load grace window");
  assert.match(guard, /now < applyingUntil\.current/, "our own load/seek never reads as an ended video");
  assert.match(guard, /if \(!\(dur > 1\)\) return;/, "a video with no duration is not a finished video");
  assert.match(guard, /ctlRef\.current\(\{ index: \(s\.index \+ 1\) % len, playing: true, positionSec: 0 \}\)/,
    "a real end still advances for everyone");
});

ok("sound: a closed shelf has no player at all, so it cannot be heard", () => {
  const panel = read("components/TvPanel.tsx");
  assert.ok(!panel.includes("quietStop"), "no hidden player left to mute — it is destroyed instead");
  assert.match(panel, /if \(audioRef\.current\) player\.unMute\(\),?/, "the open screen carries this viewer's sound");
  assert.match(panel, /else player\.mute\(\)/, "silent until this viewer joins");
  assert.match(panel, /if \(!player \|\| !readyRef\.current \|\| !playerOpenRef\.current\) return;/,
    "nothing syncs without an open, ready player");
  assert.match(panel, /if \(!player \|\| !playerOpenRef\.current\) \{/, "a closed screen relays no seeks and no heartbeats");
  assert.match(panel, /const RESYNC_MS = 4_000/, "an open screen re-reads the room on a beat");
  assert.match(panel, /setInterval\(\(\) => \{\s*if \(!document\.hidden\) syncToRoom\(\);/, "the beat skips backgrounded tabs");
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
