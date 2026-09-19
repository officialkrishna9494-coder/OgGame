// ─── Cozy Hall · scoreboard contract tests ──────────────────────────────────
// Every in-world scoreboard reads the same from both sides:
//
//   DODGEBALL ... front + back faces share one canvas texture
//   RPS ......... front + back faces share one canvas texture
//
// Run: `npx tsx tests/boards.test.mts` (or `npm test` runs every suite)
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

console.log("boards — same screen on both sides");

ok("dodgeball: front + back faces share one live texture", () => {
  const env = read("components/scene/environment.ts");
  assert.match(env, /faceBack\.rotation\.y = Math\.PI/, "back face turned around");
  assert.match(env, /new THREE\.PlaneGeometry\(3\.12, 1\.76\), new THREE\.MeshBasicMaterial\(\{ map: boardTex \}\)/, "both faces share boardTex");
  const faces = env.match(/map: boardTex \}\)/g) ?? [];
  assert.ok(faces.length >= 2, "two faces on the one texture — one repaint serves both");
});

ok("rps: front + back faces share one live texture", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /if \(side < 0\) face\.rotation\.y = Math\.PI/, "back face turned around");
  assert.match(scene, /MeshBasicMaterial\(\{ map: rpsTex \}\)/, "both faces share rpsTex");
});

console.log(`\nPASS ${passed} checks — scoreboards read both ways.`);
