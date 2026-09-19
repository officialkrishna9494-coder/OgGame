// ─── Cozy Hall · enclosure contract tests ───────────────────────────────────
// The dollhouse opens toward the camera: front wall + ceilings (the "upper
// floor") exist only for inside cameras, locked in as executable specs:
//
//   INIT .... view-gated groups start hidden (follow view is the default)
//   DRIVE ... one setter flips both groups, called every frame from the view
//
// The bug this locks: groups default to visible in three.js while the flag
// starts false, and setEnclosure(false) early-returns — so the ceiling
// rendered on load until the first view switch.
//
// Run: `npx tsx tests/enclosure.test.mts` (or `npm test` runs every suite)
// Pure Node — no browser, no dev server. Fails non-zero on violation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log("enclosure — no upper floor in follow view");

ok("init: view-gated groups start hidden, matching the flag", () => {
  const env = read("components/scene/environment.ts");
  assert.match(env, /let enclosureOn = false/, "flag starts at follow (outside)");
  const init = env.slice(env.indexOf("let enclosureOn = false"));
  assert.ok(init.includes("enclosure.visible = false"), "front wall + ceiling start hidden");
  assert.ok(init.includes("raceGated.visible = false"), "race south wall + ceiling start hidden");
});

ok("drive: one setter flips both groups from the live view", () => {
  const env = read("components/scene/environment.ts");
  assert.match(env, /enclosure\.visible = inside/, "setter drives the front group");
  assert.match(env, /raceGated\.visible = inside/, "setter drives the race group");
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /env\.setEnclosure\(viewState\.mode !== 0\)/, "follow hides, head-cams show");
});

console.log(`\nPASS ${passed} checks — follow view stays an open dollhouse.`);
