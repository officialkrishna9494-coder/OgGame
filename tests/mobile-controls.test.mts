// ─── Cozy Hall · mobile controls contract tests ─────────────────────────────
// Industry-standard thumb layout, locked in as executable specs:
//
//   LEFT (car) ..... straight ▲▼ pedals + round TURBO (TURBO alone drives
//                  forward like a held ▲, ring meter, no pedal clobber)
//   RIGHT (car) .... ACT (upper) + steer ◀ ▶
//   RIGHT (foot) ... ACT (upper, contextual) + JUMP = SPACE (lower circle)
//   TOP-RIGHT ...... ⋯ menu (every other action)
//   DESKTOP ........ untouched dock + WASD / Space / E / V legend
//
// Run: `npx tsx tests/mobile-controls.test.mts`  (or `npm test`)
// Pure Node — no browser, no Next dev server. Fails non-zero on violation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

// dynamic imports after path setup (tsx resolves TS directly)
const { drivePad, resetDrivePad } = await import("../lib/drive-pad");
const { turboState, resetTurbo } = await import("../lib/turbo-state");
const { joyState, resetJoy } = await import("../lib/joy-state");
const { actionKey, resolveAction } = await import("../lib/interaction");
const { holdHandlers } = await import("../lib/touch-input");
const { IDLE_CONTEXT } = await import("../lib/hall-types");

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log("mobile controls — thumb layout contract");

// ── 1 · input singletons ────────────────────────────────────────────────────
ok("drivePad holds opposite directions without clobbering", () => {
  resetDrivePad();
  drivePad.left = true;
  drivePad.right = true;
  drivePad.up = true;
  assert.equal(drivePad.left, true);
  assert.equal(drivePad.right, true);
  assert.equal(drivePad.up, true);
  resetDrivePad();
  assert.deepEqual({ ...drivePad }, { up: false, down: false, left: false, right: false, turbo: false });
});

ok("drivePad.turbo is its own flag (TURBO never clobbers the ▲ pedal)", () => {
  resetDrivePad();
  drivePad.up = true;
  drivePad.turbo = true;
  // releasing ▲ leaves the TURBO launch alive; releasing TURBO leaves ▲ alive
  drivePad.up = false;
  assert.equal(drivePad.turbo, true);
  drivePad.turbo = false;
  assert.equal(drivePad.up, false);
  resetDrivePad();
  assert.equal(drivePad.turbo, false);
});

ok("turboState resets to a full, idle tank", () => {
  turboState.level = 0.2;
  turboState.active = true;
  turboState.driving = true;
  turboState.held = true;
  resetTurbo();
  assert.equal(turboState.level, 1);
  assert.equal(turboState.active, false);
  assert.equal(turboState.driving, false);
  assert.equal(turboState.held, false);
});

ok("joyState resets to a neutral stick", () => {
  joyState.x = 0.9;
  joyState.y = -0.4;
  joyState.active = true;
  joyState.owner = "stick";
  resetJoy();
  assert.equal(joyState.x, 0);
  assert.equal(joyState.y, 0);
  assert.equal(joyState.active, false);
  assert.equal(joyState.owner, null);
});

// ── 2 · hold binding (every touch button shares this) ───────────────────────
const mockPointer = () => {
  let captured: number | null = null;
  let prevented = false;
  return {
    e: {
      preventDefault: () => {
        prevented = true;
      },
      pointerId: 7,
      currentTarget: {
        setPointerCapture: (id: number) => {
          captured = id;
        },
      },
    } as unknown as React.PointerEvent<HTMLElement>,
    wasPrevented: () => prevented,
    wasCaptured: () => captured,
  };
};

ok("holdHandlers: press sets + captures, every release path clears", () => {
  let flag = false;
  const h = holdHandlers((v) => {
    flag = v;
  });
  const p = mockPointer();
  h.onPointerDown(p.e as never);
  assert.equal(flag, true);
  assert.equal(p.wasPrevented(), true);
  assert.equal(p.wasCaptured(), 7);
  h.onPointerUp();
  assert.equal(flag, false);
  h.onPointerDown(mockPointer().e as never);
  assert.equal(flag, true);
  h.onPointerCancel();
  assert.equal(flag, false);
  h.onPointerDown(mockPointer().e as never);
  h.onLostPointerCapture();
  assert.equal(flag, false);
});

ok("holdHandlers: momentary tap fires on press (jump latency), never throws without haptics", () => {
  let taps = 0;
  const h = holdHandlers(() => {}, { onTap: () => taps++, haptic: false });
  h.onPointerDown(mockPointer().e as never);
  assert.equal(taps, 1);
  let prevented = false;
  h.onContextMenu({ preventDefault: () => (prevented = true) } as never);
  assert.equal(prevented, true);
});

// ── 3 · contextual action priority (ACT button + E key + 3D prompt agree) ────
ok("actionKey: driving always wins (hop out first)", () => {
  const ctx = { ...IDLE_CONTEXT, nearEmergency: true, holdingBall: true, nearCart: "c1" };
  assert.equal(actionKey(ctx, { sitting: false, driving: true }), "park");
});

ok("actionKey: emergency > throw > hop-in > tv > duel > games > sofa", () => {
  const f = { sitting: false, driving: false };
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearEmergency: true }, f), "sos");
  assert.equal(actionKey({ ...IDLE_CONTEXT, holdingBall: true, nearCart: "c1" }, f), "toss");
  assert.equal(actionKey({ ...IDLE_CONTEXT, holdingDodge: true }, f), "toss");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearCart: "c1" }, f), "drive");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearTv: true }, f), "addLink");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearRps: true }, f), "duel");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearGame: true }, { ...f, gameStatus: "idle" }), "starGame");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearDodgePad: true }, { ...f, dodgeStatus: "idle" }), "dodge");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearSofa: true }, f), "sit");
  assert.equal(actionKey({ ...IDLE_CONTEXT, nearSofa: true }, { ...f, sitting: true }), "stand");
  assert.equal(actionKey(IDLE_CONTEXT, f), null);
  assert.equal(actionKey(undefined, f), null);
});

ok("resolveAction: hop-out + throw carry the right icon/label for the ACT circle", () => {
  const park = resolveAction(IDLE_CONTEXT, { sitting: false, driving: true });
  assert.equal(park?.key, "park");
  assert.equal(park?.label, "hop out");
  const toss = resolveAction({ ...IDLE_CONTEXT, holdingBall: true }, { sitting: false, driving: false });
  assert.equal(toss?.key, "toss");
});

// ── 4 · static layout contract (regression net for the thumb zones) ──────────
ok("car hub: LEFT = straight ▲▼ + round TURBO · RIGHT = ACT above steer ◀ ▶", () => {
  const car = read("components/CarPad.tsx");
  const turboBtn = read("components/touch/TurboButton.tsx");
  const sim = read("components/HallScene.tsx");
  // shared primitives — no bespoke gesture code per button
  assert.match(car, /TouchButton/, "steering/pedals build on TouchButton");
  assert.match(car, /TurboButton/, "left thumb owns the boost");
  assert.match(car, /ActButton/, "right thumb ACT is the shared circle");
  assert.match(car, /aria-label="steer left"/);
  assert.match(car, /aria-label="steer right"/);
  assert.match(car, /aria-label="drive forward"/);
  assert.match(car, /aria-label="reverse"/);
  assert.match(turboBtn, /aria-label="hold for turbo boost"/, "TURBO primitive carries the boost label");
  // round turbo with a ring meter (not the old wide pill bar)
  assert.match(turboBtn, /rounded-full/, "TURBO is round, grouped with the pedals");
  assert.match(turboBtn, /strokeDashoffset/, "ring meter drains without re-renders");
  // TURBO alone drives forward: dedicated flag, merged into the throttle
  assert.match(turboBtn, /drivePad\.turbo/, "TURBO sets its own drive flag (no ▲ clobber)");
  assert.match(turboBtn, /turboState\.held/, "TURBO still spends the boost tank");
  assert.match(sim, /drivePad\.turbo/, "sim ORs TURBO into the forward throttle");
  // left cluster sits left, steering sits right (muscle memory never moves)
  const leftIdx = car.indexOf("left-[calc(var(--safe-l)");
  const rightIdx = car.indexOf("right-[calc(var(--safe-r)");
  assert.ok(leftIdx !== -1 && rightIdx !== -1 && leftIdx < rightIdx, "left cluster precedes right cluster");
  // LEFT = straight pedals: ▲ over ▼ in one column, TURBO beside the column
  const upIdx = car.indexOf('"drive forward"');
  const downIdx = car.indexOf('"reverse"');
  const turboUseIdx = car.indexOf("<TurboButton");
  const steerIdx = car.indexOf('"steer left"');
  assert.ok(upIdx !== -1 && downIdx !== -1 && turboUseIdx !== -1 && steerIdx !== -1, "pedals, turbo and steering present");
  assert.ok(upIdx < downIdx && downIdx < turboUseIdx && turboUseIdx < steerIdx, "▲▼ straight left, TURBO with them, steering right");
  assert.match(car, /flex-col[\s\S]*drive forward[\s\S]*reverse/, "▲ over ▼ in one straight column");
  // ACT rides above the steering in the same right column
  const actIdx = car.indexOf("<ActButton");
  assert.ok(actIdx !== -1 && actIdx < steerIdx, "ACT above steering");
  // stuck-input safety: every hold clears on background
  assert.match(car, /useReleaseOnHide/, "car hub releases on hide/blur");
  assert.match(car, /resetDrivePad/, "pedals reset on hide");
});

ok("on foot: RIGHT = ACT (upper) + JUMP = SPACE (lower circle) · LEFT = stick", () => {
  const hud = read("components/Hud.tsx");
  const jump = read("components/touch/JumpButton.tsx");
  const act = read("components/touch/ActButton.tsx");
  // same shared ACT circle in both worlds
  assert.match(hud, /<ActButton/, "on-foot uses the shared ACT circle");
  assert.match(hud, /<JumpButton/, "on-foot JUMP is the dedicated Space button");
  assert.match(hud, /<CarPad/, "driving swaps the column for the car hub");
  assert.match(hud, /\{!driving && <Joystick/, "stick only on foot (hub steers the car)");
  const actIdx = hud.indexOf("<ActButton");
  const jumpIdx = hud.indexOf("<JumpButton");
  assert.ok(actIdx !== -1 && jumpIdx !== -1 && actIdx < jumpIdx, "ACT upper, JUMP lower");
  // JUMP really is Space: same hallJump handoff, fired on press
  assert.match(jump, /hallJump/, "JUMP writes the Space handoff");
  assert.match(jump, /onTap/, "JUMP fires on press, not on laggy click");
  assert.match(jump, /aria-label="jump"/);
  // ACT ghost keeps the spot stable when there is nothing to do
  assert.match(act, /border-dashed/, "ACT ghost marks the resting spot");
});

ok("top-right ⋯ menu owns every other action (right thumb stays clean)", () => {
  const hud = read("components/Hud.tsx");
  assert.match(hud, /aria-label=\{menuOpen \? "close menu" : "open menu"\}/);
  for (const key of ['"react"', '"poke"', '"five"', '"tv"', '"sit"', '"voice"', '"chat"', '"profile"', '"view"']) {
    assert.ok(hud.includes(`key: ${key}`), `menu tile ${key} present`);
  }
  // duels are ACT-at-the-table only: no menu tile, no dock button anywhere
  assert.ok(!hud.includes('key: "rps"'), "no rps menu tile");
  assert.ok(!hud.includes("p.onToggleRps"), "no rps bar button on either layout");
  assert.ok(!hud.includes('title="rock-paper-scissors arena"'), "no rps dock entry");
  // opens downward from the top-right, never over the right thumb column
  assert.match(hud, /right-\[calc\(var\(--safe-r\)/, "menu anchored top-right");
});

ok("turbo: round ring meter without re-renders, gauge parks on touch (hub owns it)", () => {
  const turbo = read("components/touch/TurboButton.tsx");
  const gauge = read("components/TurboGauge.tsx");
  assert.match(turbo, /turboState\.held/, "TURBO button holds the boost flag");
  assert.match(turbo, /turboState\.level/, "ring meter reads the shared level");
  assert.match(turbo, /requestAnimationFrame/, "meter writes DOM directly, no re-renders");
  assert.match(turbo, /rounded-full/, "round turbo groups with the pedals");
  assert.match(gauge, /!coarse\.matches/, "floating gauge parks on coarse pointers");
});

ok("touch primitive: capture + haptic + 44 px targets + no callout", () => {
  const btn = read("components/touch/TouchButton.tsx");
  const input = read("lib/touch-input.ts");
  assert.match(btn, /touch-none/, "no double-tap zoom / scroll fight");
  assert.match(btn, /active:scale-90/, "pressed feedback");
  assert.match(btn, /h-14 w-14|h-16 w-16|76px/, "44 px+ touch targets");
  assert.match(input, /setPointerCapture/, "per-button pointer capture");
  assert.match(input, /visibilitychange/, "background release");
  assert.match(input, /vibrate/, "haptic tick");
  assert.match(input, /preventDefault/, "long-press callout off");
});

ok("desktop untouched: dock + WASD / Space / E / V legend intact", () => {
  const hud = read("components/Hud.tsx");
  assert.match(hud, /W A S D[\s\S]*move/, "desktop move legend");
  assert.match(hud, /Space[\s\S]*hop/, "desktop hop legend");
  assert.match(hud, /E[\s\S]*interact/, "desktop interact legend");
  assert.match(hud, /V[\s\S]*view/, "desktop view legend");
});

console.log(`\nPASS ${passed} checks — mobile thumb contract holds.`);
