// ─── Cozy Hall · identity contract tests ────────────────────────────────────
// Whose name shows where, locked in as executable specs:
//
//   3D ......... my overhead tag is hidden, everyone else keeps theirs
//   HUD ........ my name lives top-right on its own line ("you · …"),
//                in both layouts, tapping it opens profile customization
//   MOBILE ..... profile entry sits in the top bar (not just the ⋯ menu),
//                and the panel copy matches the hidden-tag reality
//
// Run: `npx tsx tests/identity.test.mts` (or `npm test` runs every suite)
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

console.log("identity — my name in the HUD, theirs overhead");

ok("3D: my overhead tag is hidden, others keep theirs", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /r\.label\.visible = id !== MY_ID/, "own tag hidden per rig sync");
});

ok("HUD: my name on its own line, top-right, both layouts", () => {
  const hud = read("components/Hud.tsx");
  assert.match(hud, /you ·/, "you-line marker exists");
  assert.match(hud, /<YouChip name=\{me\.name\} color=\{me\.color\} onOpen=\{p\.onOpenProfile\} \/>/, "chip wired to the profile customizer");
  const chips = hud.match(/<YouChip /g) ?? [];
  assert.equal(chips.length, 2, "desktop top bar + mobile top bar each carry the you-line");
});

ok("mobile: profile customization is one tap away in the top bar", () => {
  const hud = read("components/Hud.tsx");
  const mobileBar = hud.slice(hud.indexOf("function MobileHud"), hud.indexOf("options menu, top-right"));
  assert.ok(mobileBar.includes("<YouChip"), "direct profile entry in the mobile top bar");
  assert.ok(mobileBar.includes("onOpen={p.onOpenProfile}"), "it opens the customizer");
});

ok("panel copy matches the hidden-tag reality", () => {
  const panel = read("components/ProfilePanel.tsx");
  assert.ok(!panel.includes("over your head"), "no stale overhead claim");
  assert.match(panel, /friends see this name/, "friends still see it over me");
});

console.log(`\nPASS ${passed} checks — identity placement holds.`);
