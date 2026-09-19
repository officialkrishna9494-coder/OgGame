// ─── Cozy Hall · identity contract tests ────────────────────────────────────
// Whose name shows where, locked in as executable specs:
//
//   3D ......... my overhead tag is hidden, everyone else keeps theirs
//   HUD ........ my name appears nowhere on screen (no overhead, no chip)
//   PROFILE .... the customizer opens from the top-left room card on BOTH
//                layouts (desktop button + mobile button), so name/look/
//                color are editable everywhere — plus the ⋯ tile on mobile
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

console.log("identity — no self name on screen, profile on both top bars");

ok("3D: my overhead tag is hidden, others keep theirs", () => {
  const scene = read("components/HallScene.tsx");
  assert.match(scene, /r\.label\.visible = id !== MY_ID/, "own tag hidden per rig sync");
});

ok("HUD: my name appears nowhere on screen", () => {
  const hud = read("components/Hud.tsx");
  assert.ok(!hud.includes("you ·"), "no you-name chip anywhere");
  assert.ok(!hud.includes("YouChip"), "no you-name component anywhere");
});

ok("profile: customizer opens from the top-left room card on both layouts", () => {
  const hud = read("components/Hud.tsx");
  // desktop room card button (long-standing) + mobile room card button (new)
  const entries = hud.match(/aria-label="edit profile"/g) ?? [];
  assert.ok(entries.length >= 2, "desktop top bar + mobile top bar each carry the entry");
  assert.match(hud, /onClick=\{p\.onOpenProfile\}/, "entries open the customizer");
  // mobile keeps its ⋯-menu tile as a second way in
  assert.match(hud, /\{ key: "profile", icon: "user", label: "profile", run: p\.onOpenProfile \}/, "menu tile still wired");
});

ok("panel copy matches the hidden-tag reality", () => {
  const panel = read("components/ProfilePanel.tsx");
  assert.ok(!panel.includes("over your head"), "no stale overhead claim");
  assert.match(panel, /friends see this name/, "friends still see it over me");
});

console.log(`\nPASS ${passed} checks — identity placement holds.`);
