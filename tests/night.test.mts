// ─── Cozy Hall · day / night ambiance contract tests ──────────────────────────
// The moon toggle (bottom bar on desktop, ⋯ menu on mobile, N key) flips one
// singleton; the 3D loop glides the sun, sky and practicals toward it.
//
// Run: `npx tsx tests/night.test.mts` (or `npm test` runs every suite)
// Pure Node — no browser, no dev server. Fails non-zero on violation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const night = await import("../lib/night-state");

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log("night — day / night party lights");

// ── 1 · singleton toggle + listener fan-out ──────────────────────────────────
ok("state: day by default, toggle flips and notifies", () => {
  assert.equal(night.nightState.night, false);
  const seen: boolean[] = [];
  const off = night.onNightChange((n) => seen.push(n));
  assert.equal(night.toggleNight(), true);
  assert.equal(night.nightState.night, true);
  assert.equal(night.toggleNight(), false);
  assert.deepEqual(seen, [true, false]);
  off();
  night.toggleNight();
  assert.deepEqual(seen, [true, false], "unsubscribed listener stays silent");
  night.toggleNight(); // back to day for the next suite
  assert.equal(night.nightState.night, false);
});

// ── 2 · scene cross-fades sun + sky, practicals follow ───────────────────────
ok("scene: loop damps toward the flag, environment owns the practicals", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /nightState\.night/, "loop reads the flag every frame");
  assert.match(scene, /NIGHT_BG/, "party-navy sky target exists");
  assert.match(scene, /NIGHT_SUN/, "moonlight sun target exists");
  assert.match(scene, /hemi\.intensity = 0\.95 - nightK/, "hemisphere dims after dark");
  assert.match(scene, /sun\.intensity = 1\.6 - nightK/, "sun cools into moonlight");
  assert.match(scene, /env\.setNight\(nightState\.night\)/, "practicals follow the flag");
  assert.match(scene, /toneMappingExposure = 1\.05 - nightK/, "exposure dips a touch");
  const env = read("components/scene/environment.ts");
  assert.match(env, /setNight: \(night\)/, "environment exposes setNight");
  assert.match(env, /cafeLight\.intensity = 12 \+ nightK/, "café burns brighter at night");
  assert.match(env, /fireLight\.intensity = 9 \+ nightK/, "fireplace glows harder at night");
});

// ── 3 · buttons everywhere: dock, mobile menu, N key ─────────────────────────
ok("controls: moon button on desktop dock + mobile menu, N key flips", () => {
  const hud = read("components/Hud.tsx");
  assert.match(hud, /onToggleNight/, "Hud takes the night toggle");
  assert.match(hud, /Icon name="moon"/, "moon icon on the button");
  assert.match(hud, /key: "night", icon: "moon"/, "mobile ⋯ menu carries the tile");
  assert.match(hud, /LegendKey>N<\/LegendKey> night/, "desktop legend names the N key");
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /toggleNight\(\)/, "N key flips the same singleton");
  const page = read("app/page.tsx");
  assert.match(page, /onToggleNight=\{handleToggleNight\}/, "page wires the toggle into Hud");
  assert.match(page, /party lights on/, "switching answers with a toast");
});

console.log(`\nPASS ${passed} checks — night party lights hold.`);
