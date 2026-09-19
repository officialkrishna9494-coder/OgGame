"use client";

// ─── Cozy Hall · Three.js scene ─────────────────────────────────────────────
// Tailored procedural avatars (gentleman's suit / lady's dress, tinted by each
// wearer's clothing color) + soft physics + dollhouse hall.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BallState, CartState, ContextState, DodgeState, GameState, HairstyleId, OutfitId, PlayerState, RoomConfig, RpsState, SosState, TvState } from "../lib/hall-types";
import { DODGE_LIVE_MS, DODGE_SHIELD_MS, IDLE_CONTEXT, resolveHairstyle } from "../lib/hall-types";
import { ejectBall, handPoint, PICKUP_RADIUS, reachField, stepBall, TOUCH_FLOOR, TOUCH_SOLID, TOUCH_WALL } from "../lib/ball-physics";
import { HALL, RPS_SPOT, SOS_SPOT, SPAWN, TV, WALL_ART, ZONES, inCourt } from "../lib/hall-layout";
import { buildEnvironment, type CourtMode } from "./scene/environment";
import { buildOutfit, disposeOutfit, OUTFIT_LABEL_Y, poseOutfit, setHairstyle, tintOutfit, type OutfitRig } from "./scene/outfits";
import { buildCart, cartSeatOffset, disposeCart, poseCart, CART_RIDER_Y, type CartRig } from "./scene/carts";
import { drawIcon, drawIconText, type CanvasIcon } from "../lib/canvas-icons";
import { actionAnchor, actionKey, promptAnchor } from "../lib/interaction";
import { joyState, resetJoy } from "../lib/joy-state";
import { drivePad } from "../lib/drive-pad";
import { cycleViewMode, isFirstPerson, viewState } from "../lib/view-state";
import { resetTurbo, turboState } from "../lib/turbo-state";
import { COLLIDERS, HALL_BOUNDS, SOFA_SEATS } from "../lib/room-defaults";

export interface DodgeThrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Props {
  myName: string;
  myColor: string;
  myOutfit: OutfitId;
  myHairstyle: HairstyleId;
  mySocketId: string;
  players: Record<string, PlayerState>;
  ball: BallState;
  room: RoomConfig;
  tv: TvState;
  game: GameState;
  rps: RpsState;
  sos: SosState | null;
  dodge: DodgeState;
  carts: CartState[];
  serverOffset: number;
  onMove: (p: PlayerState) => void;
  onBall: (b: BallState) => void;
  onNear: (nearId: string | null, nearName: string | null) => void;
  onContext: (c: ContextState) => void;
  onCollect: (starId: string) => void;
  onHit: () => void;
  onCartDrive: (c: { id: string; x: number; z: number; facing: number; speed: number; boost: number }) => void;
  onDodgePickup: (ballId: string) => void;
  onDodgeThrow: (ballId: string, b: DodgeThrow) => void;
  onDodgeSpend: (ballId: string, rev: number) => void;
  onDodgeHit: (ballId: string, b: { x: number; y: number; z: number; vx: number; vz: number }) => void;
}

const MY_ID = "me";
// sun direction (from the hall toward the light) — fixed, so shadows stay put
const SUN_DIR = new THREE.Vector3(10, 16, 10).normalize();
// dodgeball throw: flat and quick, so a hit is a skill shot, not a lob
const DODGE_THROW_SPEED = 11.5;
const DODGE_THROW_LIFT = 2.6;
// gentle aim assist toward an opponent within this cone / range
const AIM_CONE = 0.45;
const AIM_RANGE = 14;

// camera distance range — shared by wheel, trackpad pinch and touch pinch
const ZOOM_MIN = 14;
const ZOOM_MAX = 27;
// px a single canvas finger must travel before it counts as steering, so
// the first finger of a pinch doesn't walk the character
const TOUCH_STEER_DEAD = 10;

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.font = "600 34px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // pill
  const w = Math.min(240, g.measureText(text).width + 44);
  const x0 = (256 - w) / 2;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.strokeStyle = "rgba(60,40,60,0.14)";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x0, 12, w, 52, 26);
  g.fill();
  g.stroke();
  g.fillStyle = "#4a3f55";
  g.fillText(text.slice(0, 14), 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.5, 0.47, 1);
  return sp;
}

// chat bubble — big dark pill with up to 2 wrapped lines (readable at distance)
function makeChatBubble(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 560;
  c.height = 184;
  const g = c.getContext("2d")!;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 24) {
      lines.push(line.trim());
      line = w;
      if (lines.length === 2) break;
    } else {
      line += (line ? " " : "") + w;
    }
  }
  if (lines.length < 2 && line.trim()) lines.push(line.trim());
  if (words.join(" ").length > lines.join(" ").length + 1) {
    lines[lines.length - 1] += "…";
  }
  const h = lines.length > 1 ? 156 : 108;
  const y0 = (184 - h) / 2;
  g.fillStyle = "rgba(45, 36, 54, 0.95)";
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(8, y0, 544, h, 44);
  g.fill();
  g.stroke();
  // tail
  g.beginPath();
  g.moveTo(248, y0 + h - 4);
  g.lineTo(280, y0 + h + 28);
  g.lineTo(312, y0 + h - 4);
  g.closePath();
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "700 37px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l.slice(0, 28), 280, y0 + h / 2 + (i - (lines.length - 1) / 2) * 46));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sp.scale.set(2.9, 0.95, 1);
  return sp;
}

function makeEmoteSprite(emoji: string): THREE.Sprite {  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.font = "84px serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sp.scale.set(0.9, 0.9, 1);
  return sp;
}

// soft white disc with an outline icon — table decor in the HUD icon style
function makeIconBadgeSprite(icon: CanvasIcon): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.94)";
  g.strokeStyle = "rgba(61,51,71,0.12)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  drawIcon(g, icon, 64, 64, 66, "#3d3347");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.9, 0.9, 1);
  return sp;
}

function frameTexture(title: string, caption: string, hue: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 340;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 512, 340);
  grad.addColorStop(0, `hsl(${hue},70%,78%)`);
  grad.addColorStop(1, `hsl(${(hue + 50) % 360},65%,62%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 340);
  // soft hills
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.ellipse(140, 260, 220, 110, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(400, 280, 200, 90, 0, 0, Math.PI * 2);
  g.fill();
  // sun
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(400, 90, 44, 0, Math.PI * 2);
  g.fill();
  // caption bar
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.roundRect(24, 238, 464, 78, 18);
  g.fill();
  g.fillStyle = "#4a3f55";
  g.font = "700 34px ui-rounded, system-ui, sans-serif";
  g.fillText(title.slice(0, 22), 44, 270);
  g.font = "400 26px ui-rounded, system-ui, sans-serif";
  g.fillStyle = "#8a7f98";
  g.fillText(caption.slice(0, 28), 44, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function posterTexture(title: string, sub: string, hue: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 480;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fffaf2";
  g.fillRect(0, 0, 360, 480);
  g.fillStyle = `hsl(${hue},60%,88%)`;
  g.beginPath();
  g.arc(180, 150, 110, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `hsl(${hue},45%,45%)`;
  g.font = "800 52px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  const words = title.split(" ");
  words.forEach((w, i) => g.fillText(w, 180, 300 + i * 56));
  g.font = "400 26px ui-rounded, system-ui, sans-serif";
  g.fillStyle = "#8a7f98";
  g.fillText(sub.slice(0, 24), 180, 300 + words.length * 56 + 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─── star collectible (mini-game) ───────────────────────────────────────────
function createStar(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26),
    new THREE.MeshStandardMaterial({
      color: "#ffd166",
      emissive: "#ffb703",
      emissiveIntensity: 0.9,
      roughness: 0.3,
    })
  );
  core.castShadow = true;
  g.add(core);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255, 220, 120, 0.9)");
  grad.addColorStop(1, "rgba(255, 220, 120, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const glow = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false })
  );
  sp.scale.set(1.5, 1.5, 1);
  g.add(sp);
  return g;
}

interface AvatarRig {
  group: THREE.Group;
  outfit: OutfitRig;
  outfitId: OutfitId;
  colorHex: string;
  name: string;
  label: THREE.Sprite;
  emote: THREE.Sprite | null;
  emoteUntil: number;
  chat: THREE.Sprite | null;
  chatText: string;
  ring: THREE.Mesh;
}

function createAvatar(color: string, name: string, outfitId: OutfitId, hairstyle: HairstyleId): AvatarRig {
  const group = new THREE.Group();
  const outfit = buildOutfit(outfitId, color, hairstyle);
  group.add(outfit.group);

  const label = makeLabel(name);
  label.position.y = OUTFIT_LABEL_Y;
  group.add(label);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.045, 10, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  return { group, outfit, outfitId, colorHex: color, name, label, emote: null, emoteUntil: 0, chat: null, chatText: "", ring };
}

// Swap the dressed body when the wearer changes outfit in the profile
// editor. Label, bubbles and ring stay — only the cloth is rebuilt.
function redress(rig: AvatarRig, outfitId: OutfitId, hairstyle: HairstyleId): void {
  if (rig.outfitId === outfitId) {
    setHairstyle(rig.outfit, hairstyle);
    return;
  }
  rig.group.remove(rig.outfit.group);
  disposeOutfit(rig.outfit);
  rig.outfit = buildOutfit(outfitId, rig.colorHex, hairstyle);
  rig.outfitId = outfitId;
  rig.group.add(rig.outfit.group);
}

// shortest-path angle lerp (stops the sit-down 360° spin)
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const hallToss: { fn: null | (() => void) } = { fn: null };
/** mobile hop button — the on-screen joystick has no spacebar, so this is it */
export const hallJump: { fn: null | (() => void) } = { fn: null };

// jump take-off velocity (gravity is 14) — apex ≈ 1.2 m, enough to vault the
// bleachers, coffee table, stools and cushions, but not the sofa or counter
const JUMP_VY = 5.8;
// knee allowance: furniture at or below the feet + this never blocks, so a
// running jump carries over it instead of sticking mid-air
const STEP_KNEE = 0.28;
// only low furniture is vaultable — sofa, counter, shelves and plants stay
// solid no matter how high you hop, so the layout keeps its meaning
const VAULT_MAX = 1.0;

// hall carts — arcade handling: brisk accel, grippy steering that bites more
// the faster you roll, gentle drag so lifts coast to a stop
const CART_ACCEL = 9;
const CART_MAX = 6.5;
const CART_REV = -2.5;
const CART_DRAG = 1.4;
const CART_TURN = 2.1;
const CART_RADIUS = 0.8;
// first person — keyboard / stick turn rate (A/D turn the head, W/S throttle)
const FP_TURN = 2.6;

// turbo (spacebar while driving) — a 5 s tank of boost that refills in 10 s,
// i.e. 0.5 s of boost banked per second. An early release therefore just tops
// the remainder up at that same rate: hold 3 s, keep 2 s, and those 2 s come
// back over 4 s. Top speed and acceleration both scale, so the speed climbs
// through the TURBO_RAMP ease rather than snapping to 2.5×.
const TURBO_TANK = 5; // seconds of boost in a full tank
const TURBO_REFILL = 10; // seconds to bank a full tank from empty
const TURBO_MUL = 2.5; // top-speed / acceleration multiplier while boosting
const TURBO_RAMP = 3.5; // how fast the boost eases in and out

export default function HallScene({ myName, myColor, myOutfit, myHairstyle, mySocketId, players, ball, room, tv, game, rps, sos, dodge, carts, serverOffset, onMove, onBall, onNear, onContext, onCollect, onHit, onCartDrive, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ players, ball, room, tv, game, rps, sos, dodge, carts, serverOffset, myName, myColor, myOutfit, myHairstyle, mySocketId });
  const cbRef = useRef({ onMove, onBall, onNear, onContext, onCollect, onHit, onCartDrive, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit });

  // keep the long-lived Three.js loop fed with fresh props without re-creating it
  useEffect(() => {
    stateRef.current = { players, ball, room, tv, game, rps, sos, dodge, carts, serverOffset, myName, myColor, myOutfit, myHairstyle, mySocketId };
    cbRef.current = { onMove, onBall, onNear, onContext, onCollect, onHit, onCartDrive, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit };
  });

  useEffect(() => {
    const mount = mountRef.current!;
    const W = mount.clientWidth || 800;
    const H = mount.clientHeight || 600;
    // CSS-pixel size of the view (the HUD shares it) for prompt projection
    let viewW = W;
    let viewH = H;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f6efe6");
    scene.fog = new THREE.Fog("#f6efe6", 48, 100);

    // near plane at 1: the follow camera is never closer than ~5 units to
    // anything, and depth precision scales with near — 10× finer than 0.1,
    // which keeps close surfaces from shimmering on phone GPUs
    const camera = new THREE.PerspectiveCamera(44, W / H, 1, 140);
    let camDist = 20;
    camera.position.set(0, 13, 16);

    // ── lights ──
    scene.add(new THREE.HemisphereLight("#fff7ea", "#d9c3a5", 0.95));
    // ── stable shadows ──
    // The sun and its shadow box never move: the box is fitted once around
    // the whole hall (walls included). A shadow camera that follows the player
    // makes shadow texels slide across every surface — the shimmer on plant
    // pots and leaves as you walk. Bias + normal bias stop self-shadow speckle
    // on curved shapes. Desktops get a sharper map; phones keep 2048.
    const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    sun.castShadow = true;
    const hallCenter = new THREE.Vector3((HALL.xMin + HALL.xMax) / 2, 0, (HALL.zMin + HALL.zMax) / 2);
    sun.position.copy(hallCenter).addScaledVector(SUN_DIR, 40);
    sun.target.position.copy(hallCenter);
    const shadowRes = window.matchMedia("(pointer: coarse)").matches ? 2048 : 4096;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    {
      const cam = sun.shadow.camera;
      cam.position.copy(sun.position);
      cam.lookAt(hallCenter);
      cam.updateMatrixWorld();
      const inv = cam.matrixWorldInverse;
      const p = new THREE.Vector3();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const x of [HALL.xMin - 1, HALL.xMax + 1])
        for (const y of [0, HALL.wallHeight])
          for (const z of [HALL.zMin - 1, HALL.zMax + 1]) {
            p.set(x, y, z).applyMatrix4(inv);
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
          }
      cam.left = minX;
      cam.right = maxX;
      cam.bottom = minY;
      cam.top = maxY;
      cam.near = Math.max(0.5, -maxZ - 2);
      cam.far = -minZ + 2;
      cam.updateProjectionMatrix();
      const texel = (maxX - minX) / shadowRes;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = texel * 1.5;
    }
    scene.add(sun, sun.target);
    const tvGlow = new THREE.PointLight("#a0c4ff", 8, 13, 2);
    tvGlow.position.set(TV.x, 3.2, TV.standZ + 1.8);
    scene.add(tvGlow);

    // ── the hall itself: shell, lounge, café, fireplace nook, court, garden ──
    const env = buildEnvironment(scene);
    let courtMode: CourtMode = "idle";
    let lastBoardSig = "";

    // ── TV wall ──
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.6, 0.9),
      new THREE.MeshStandardMaterial({ color: "#7d6b8a", roughness: 0.7 })
    );
    stand.position.set(TV.x, 0.3, TV.standZ);
    stand.castShadow = stand.receiveShadow = true;
    scene.add(stand);
    const tvBody = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 2.9, 0.2),
      new THREE.MeshStandardMaterial({ color: "#2b2430", roughness: 0.4 })
    );
    tvBody.position.set(TV.x, TV.screenY, TV.bodyZ);
    tvBody.castShadow = true;
    scene.add(tvBody);
    const tvCanvas = document.createElement("canvas");
    tvCanvas.width = 512;
    tvCanvas.height = 288;
    const tvTex = new THREE.CanvasTexture(tvCanvas);
    tvTex.colorSpace = THREE.SRGBColorSpace;
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6), new THREE.MeshBasicMaterial({ map: tvTex }));
    tvScreen.position.set(TV.x, TV.screenY, TV.bodyZ + 0.12);
    scene.add(tvScreen);

    const drawTv = () => {
      const { tv: tvState, room: rm } = stateRef.current;
      const g = tvCanvas.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 512, 288);
      grad.addColorStop(0, "#2b2d5c");
      grad.addColorStop(1, "#7b5ea7");
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 288);
      g.fillStyle = "rgba(255,255,255,0.16)";
      for (let i = 0; i < 24; i++) {
        g.beginPath();
        g.arc((i * 97) % 512, (i * 61) % 288, 2 + (i % 4), 0, Math.PI * 2);
        g.fill();
      }
      const cur = tvState.playlist[tvState.index] ?? rm.tv[0];
      g.fillStyle = "#ffffff";
      g.font = "700 30px system-ui, sans-serif";
      g.textAlign = "center";
      drawIconText(g, tvState.playing ? "play" : "pause", tvState.playing ? "NOW PLAYING" : "PAUSED", 256, 60, 26, "#ffffff");
      g.font = "500 24px system-ui, sans-serif";
      const title = (cur?.title ?? "pick a video from the TV shelf").slice(0, 40);      // wrap
      const words = title.split(" ");
      let line = "";
      let y = 130;
      for (const w of words) {
        if ((line + " " + w).length > 30) {
          g.fillText(line, 256, y);
          y += 32;
          line = w;
        } else line += (line ? " " : "") + w;
      }
      if (line) g.fillText(line, 256, y);
      // watch-party position readout (same math every viewer uses)
      const pos = Math.max(
        0,
        (tvState.positionSec ?? 0) + (tvState.playing ? (Date.now() - tvState.updatedAt) / 1000 : 0)
      );
      const mm = `${Math.floor(pos / 60)}:${String(Math.floor(pos % 60)).padStart(2, "0")}`;
      g.font = "700 22px system-ui, sans-serif";
      drawIconText(g, tvState.playing ? "play" : "pause", `${mm} · synced`, 256, 210, 18, "#ffd166");
      g.font = "400 20px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText("open the TV panel below to watch together", 256, 248);
      tvTex.needsUpdate = true;
    };
    drawTv();

    // memory frames (data-driven, Cloudinary photos when set)
    const frameGroup = new THREE.Group();
    scene.add(frameGroup);
    const photoCache = new Map<string, THREE.Texture>();
    const photoPending = new Set<string>();
    const disposeGroup = (root: THREE.Object3D) => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => {
            const withMap = x as THREE.MeshBasicMaterial;
            // cached Cloudinary photos are shared — never dispose those
            if (withMap.map && ![...photoCache.values()].includes(withMap.map)) withMap.map.dispose();
            x.dispose();
          });
        }
      });
    };
    const photoTexture = (url: string): THREE.Texture | null => {
      const hit = photoCache.get(url);
      if (hit) return hit;
      if (!photoPending.has(url)) {
        photoPending.add(url);
        new THREE.TextureLoader().load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            photoCache.set(url, tex);
            photoPending.delete(url);
            if (!dead) rebuildFrames(); // re-run now that the photo is cached
          },
          undefined,
          () => photoPending.delete(url)
        );
      }
      return null;
    };
    // legacy back-wall slots (x = -10, -6, -2, 2, …) map onto free wall spots
    const LEGACY_SLOTS = [-10.5, -6.5, 6.5, 10.5, 14.5, 21, -14.5, -21];
    const hangFrame = (p: [number, number, number]): [number, number, number] => {
      if (Math.abs(p[2] - WALL_ART.legacyBackZ) > 0.3) return p;
      const k = Math.round((p[0] + 10) / 4);
      const x = LEGACY_SLOTS[k] ?? Math.max(HALL.xMin + 1.5, Math.min(HALL.xMax - 1.5, p[0] * 1.4));
      return [x, p[1], WALL_ART.backZ];
    };
    const hangPoster = (p: [number, number, number]): [number, number, number] =>
      Math.abs(p[0] - WALL_ART.legacyRightX) > 0.3 ? p : [WALL_ART.rightX, p[1], Math.max(HALL.zMin + 1.5, Math.min(HALL.zMax - 1.5, p[2] * 1.3 + 8))];
    const rebuildFrames = () => {
      const { room: rm } = stateRef.current;
      while (frameGroup.children.length) {
        const ch = frameGroup.children[0];
        frameGroup.remove(ch);
        disposeGroup(ch);
      }
      for (const f of rm.frames) {
        const g = new THREE.Group();
        const border = new THREE.Mesh(
          new THREE.BoxGeometry(f.size[0] + 0.16, f.size[1] + 0.16, 0.08),
          new THREE.MeshStandardMaterial({ color: "#8a6f55", roughness: 0.6 })
        );
        border.castShadow = true;
        g.add(border);
        const art = new THREE.Mesh(
          new THREE.PlaneGeometry(f.size[0], f.size[1]),
          new THREE.MeshBasicMaterial({
            map: (f.imageUrl && photoTexture(f.imageUrl)) || frameTexture(f.title, f.caption, f.hue),
          })
        );
        art.position.z = 0.045;
        g.add(art);
        g.position.set(...hangFrame(f.position));
        if (f.rotationY) g.rotation.y = f.rotationY;
        frameGroup.add(g);
      }
      for (const p of rm.posters) {
        const g = new THREE.Group();
        const art = new THREE.Mesh(
          new THREE.PlaneGeometry(p.size[0], p.size[1]),
          new THREE.MeshBasicMaterial({
            map: (p.imageUrl && photoTexture(p.imageUrl)) || posterTexture(p.title, p.subtitle, p.hue),
          })
        );
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(p.size[0] + 0.08, p.size[1] + 0.08, 0.04),
          new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 })
        );
        edge.position.z = -0.025;
        g.add(edge, art);
        art.position.z = 0.005;
        g.position.set(...hangPoster(p.position));
        g.rotation.y = -Math.PI / 2;
        frameGroup.add(g);
      }
    };
    rebuildFrames();

    // ── RPS arena ──
    const RPS_POS = RPS_SPOT.table;
    const woodDark = new THREE.MeshStandardMaterial({ color: "#8a6f55", roughness: 0.7 });
    const rpsTable = new THREE.Group();
    const rpsTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.14, 28),
      new THREE.MeshStandardMaterial({ color: "#fffaf0", roughness: 0.5 })
    );
    rpsTop.position.y = 0.78;
    rpsTop.castShadow = rpsTop.receiveShadow = true;
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 28),
      new THREE.MeshStandardMaterial({ color: "#2d6a4f", roughness: 0.9 })
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.865; // 1.5 cm above the tabletop, never sharing its plane
    felt.receiveShadow = true;
    const rpsLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.72, 12), woodDark);
    rpsLeg.position.y = 0.37;
    rpsLeg.castShadow = true;
    rpsTable.add(rpsTop, felt, rpsLeg);
    rpsTable.position.set(RPS_POS.x, 0, RPS_POS.z);
    scene.add(rpsTable);
    // stools for the duelists
    const stoolAt = (x: number, z: number, color: string) => {
      const st = new THREE.Group();
      const seatm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
      );
      seatm.position.y = 0.55;
      seatm.castShadow = true;
      const legm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 10), woodDark);
      legm.position.y = 0.26;
      st.add(seatm, legm);
      st.position.set(x, 0, z);
      scene.add(st);
    };
    for (const st of RPS_SPOT.stools) stoolAt(st.x, st.z, st.color);
    // floating rock · paper · scissors badges above the table
    const rpsDeco: Array<{ sp: THREE.Sprite; phase: number }> = [];
    (["rock", "paper", "scissors"] as const).forEach((e, i) => {
      const sp = makeIconBadgeSprite(e);
      sp.position.set(RPS_POS.x - 0.8 + i * 0.8, 2.0 + (i % 2) * 0.25, RPS_POS.z);
      sp.scale.set(0.55, 0.55, 1);
      scene.add(sp);
      rpsDeco.push({ sp, phase: i * 2.1 });
    });

    // scoreboard FACING the room (+z, toward the camera) — live RPS state here.
    // Wide in x, thin in z, readable face front AND back.
    const rpsCanvas = document.createElement("canvas");
    rpsCanvas.width = 512;
    rpsCanvas.height = 340;
    const rpsTex = new THREE.CanvasTexture(rpsCanvas);
    rpsTex.colorSpace = THREE.SRGBColorSpace;
    const boardGrp = new THREE.Group();
    // post ends exactly at the frame's bottom edge (y=1.35) — no overlap
    const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.35, 0.28), woodDark);
    postMesh.position.y = 0.675;
    postMesh.castShadow = true;
    const boardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.7, 0.16),
      new THREE.MeshStandardMaterial({ color: "#3d3347", roughness: 0.6 })
    );
    boardMesh.position.y = 2.2;
    boardMesh.castShadow = true;
    boardGrp.add(postMesh, boardMesh);
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.45),
        new THREE.MeshBasicMaterial({ map: rpsTex })
      );
      face.position.set(0, 2.2, side * 0.085);
      if (side < 0) face.rotation.y = Math.PI;
      boardGrp.add(face);
    }
    boardGrp.position.set(RPS_SPOT.board.x, 0, RPS_SPOT.board.z);
    scene.add(boardGrp);

    const drawRps = () => {
      const rs = stateRef.current.rps;
      const g = rpsCanvas.getContext("2d")!;
      g.fillStyle = "#234034";
      g.fillRect(0, 0, 512, 340);
      g.strokeStyle = "#ffb703";
      g.lineWidth = 6;
      g.strokeRect(10, 10, 492, 320);
      g.textAlign = "center";
      g.fillStyle = "#ffd166";
      g.font = "800 30px system-ui, sans-serif";
      g.textBaseline = "middle";
      g.fillText("SHOWDOWN", 256 + 42, 40);
      (["rock", "paper", "scissors"] as const).forEach((c, i) => drawIcon(g, c, 118 + i * 34, 40, 28, "#ffd166"));
      g.textBaseline = "alphabetic";
      const playing = rs.status === "picking" || rs.status === "revealing";
      const waiting = rs.status === "waiting";
      const nameA = playing || rs.status === "ended" ? rs.names.a || "—" : "???";
      const nameB = playing || rs.status === "ended" ? rs.names.b || "—" : "???";
      g.font = "700 26px system-ui, sans-serif";
      g.fillStyle = "#ff8fab";
      g.fillText(nameA.slice(0, 12), 130, 92);
      g.fillStyle = "#9bf6ff";
      g.fillText(nameB.slice(0, 12), 382, 92);
      // score pips (first to 3)
      const pips = (n: number, x: number) => {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i < n ? "#ffd166" : "rgba(255,255,255,0.22)";
          g.beginPath();
          g.arc(x - 28 + i * 28, 118, 11, 0, Math.PI * 2);
          g.fill();
        }
      };
      pips(rs.scores.a, 130);
      pips(rs.scores.b, 382);
      g.fillStyle = "#ffffff";
      g.font = "800 44px system-ui, sans-serif";
      g.fillText(`${rs.scores.a} – ${rs.scores.b}`, 256, 122);
      g.font = "600 22px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.8)";
      // center stage
      if (rs.status === "revealing" && rs.lastReveal) {
        const rv = rs.lastReveal;
        drawIcon(g, rv.a, 196, 196, 72, "#ff8fab");
        drawIcon(g, rv.b, 316, 196, 72, "#9bf6ff");
        g.font = "800 30px system-ui, sans-serif";
        g.fillStyle = "#ffd166";
        g.fillText(
          rv.result === "draw" ? "DRAW — REPLAY!" : rv.result === "a" ? `${nameA.slice(0, 12)} TAKES R${rv.round}!` : `${nameB.slice(0, 12)} TAKES R${rv.round}!`,
          256,
          272
        );
      } else if (rs.status === "ended") {
        drawIcon(g, "trophy", 256, 196, 72, "#ffd166");
        g.font = "800 30px system-ui, sans-serif";
        g.fillStyle = "#ffd166";
        g.fillText(`${(rs.winner ?? "???").slice(0, 16)} WINS!`, 256, 272);
      } else if (waiting) {
        g.font = "600 24px system-ui, sans-serif";
        g.fillStyle = "#ffffff";
        g.fillText(`${rs.names.a.slice(0, 14)} wants a duel…`, 256, 210);
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.fillText("stand by the table · E or ACT", 256, 248);
      } else if (playing) {
        const left = Math.max(0, Math.ceil((rs.deadline - Date.now()) / 1000));
        g.font = "600 26px system-ui, sans-serif";
        g.fillStyle = "#ffffff";
        g.fillText(`ROUND ${rs.round} · ${left}s — throw!`, 256, 225);
      } else {
        g.font = "600 24px system-ui, sans-serif";
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.fillText("table open — stand by · E or ACT", 256, 210);
        g.fillText("best of 5 · first to 3", 256, 248);
      }
      g.font = "600 20px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.7)";
      if (playing || rs.status === "ended") g.fillText(`ROUND ${rs.round} · FIRST TO 3`, 256, 312);
      rpsTex.needsUpdate = true;
    };
    drawRps();

    // ── emergency button (right of the TV) ───────────────────────────────
    const sosGrp = new THREE.Group();
    const sosBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.52, 0.16, 20),
      new THREE.MeshStandardMaterial({ color: "#3d3347", roughness: 0.6 })
    );
    sosBase.position.y = 0.08;
    sosBase.castShadow = true;
    const sosPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.0, 0.3),
      new THREE.MeshStandardMaterial({ color: "#6b6478", roughness: 0.6 })
    );
    sosPost.position.y = 0.65;
    sosPost.castShadow = true;
    const sosDomeMat = new THREE.MeshStandardMaterial({
      color: "#ff3b3b",
      emissive: "#ff1f1f",
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    const sosDome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), sosDomeMat);
    sosDome.position.y = 1.15;
    sosDome.castShadow = true;
    const sosCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.1, 20),
      new THREE.MeshStandardMaterial({ color: "#fff6ea", roughness: 0.5 })
    );
    sosCollar.position.y = 1.15;
    sosGrp.add(sosBase, sosPost, sosDome, sosCollar);
    const sosTag = makeLabel("SOS");
    sosTag.position.y = 1.95;
    sosTag.scale.set(1.1, 0.34, 1);
    sosGrp.add(sosTag);
    sosGrp.position.set(SOS_SPOT.x, 0, SOS_SPOT.z);
    scene.add(sosGrp);
    const sosLight = new THREE.PointLight("#ff3b3b", 3, 10, 2);
    sosLight.position.set(SOS_SPOT.x, 2.4, SOS_SPOT.z);
    scene.add(sosLight);

    // ball
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 18),
      new THREE.MeshStandardMaterial({ color: "#ff6b6b", roughness: 0.45 })
    );
    ballMesh.castShadow = true;
    const ballStripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.045, 10, 24),
      new THREE.MeshStandardMaterial({ color: "#fff6ea", roughness: 0.5 })
    );
    ballMesh.add(ballStripe);
    scene.add(ballMesh);

    // ── dodgeballs: one local simulation per server ball ──
    // The server owns who holds / threw each ball (+ a rev per change); every
    // client simulates flight with the shared physics and fast-forwards a
    // fresh throw by its age on the server clock, so screens stay in step.
    const dodgeGeo = new THREE.SphereGeometry(0.28, 24, 18);
    const dodgeMat = new THREE.MeshStandardMaterial({ color: "#4cc9f0", roughness: 0.4 });
    const dodgeSeam = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
    interface DodgeSim {
      id: string;
      body: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
      rev: number;
      live: boolean;
      /** my throw is flying locally until the server echo lands */
      localUntil: number;
      mesh: THREE.Group;
      trail: THREE.Sprite;
    }
    const dodgeSims = new Map<string, DodgeSim>();
    let myDodgeBall: string | null = null; // optimistic pickup
    let myDodgeUntil = 0;
    let lastDodgeHitAt = 0;
    const noPickupUntil = new Map<string, number>();
    const trailTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const makeDodgeMesh = () => {
      const grp = new THREE.Group();
      const core = new THREE.Mesh(dodgeGeo, dodgeMat);
      core.castShadow = true;
      grp.add(core);
      for (const rot of [0, Math.PI / 2]) {
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.281, 0.018, 6, 28), dodgeSeam);
        seam.rotation.y = rot;
        grp.add(seam);
      }
      const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: trailTex, color: "#4cc9f0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      trail.scale.set(1.3, 1.3, 1);
      grp.add(trail);
      scene.add(grp);
      return { grp, trail };
    };
    const FF_STEP = 1 / 60;
    const fastForward = (sim: DodgeSim, seconds: number) => {
      for (let t = 0; t < seconds; t += FF_STEP) {
        const touched = stepBall(sim.body, FF_STEP);
        if (touched & (TOUCH_FLOOR | TOUCH_SOLID | TOUCH_WALL)) sim.live = false;
      }
    };

    // floating +1 / −1 over players when a hit lands
    const popups: Array<{ sp: THREE.Sprite; id: string; born: number }> = [];
    let lastFeedId = 0;
    const makePopup = (text: string, color: string) => {
      const c = document.createElement("canvas");
      c.width = 192;
      c.height = 96;
      const g = c.getContext("2d")!;
      g.font = "900 72px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 10;
      g.strokeStyle = "rgba(40,30,55,0.85)";
      g.strokeText(text, 96, 50);
      g.fillStyle = color;
      g.fillText(text, 96, 50);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      sp.scale.set(1.2, 0.6, 1);
      scene.add(sp);
      return sp;
    };

    // ── avatars ──
    const rigs = new Map<string, AvatarRig>();
    const starMeshes = new Map<string, { group: THREE.Group; phase: number }>();
    // one mesh per hall cart, keyed by cart id (colors follow the snapshot)
    const cartRigs = new Map<string, CartRig>();
    const getCartRig = (id: string, color: string) => {
      let r = cartRigs.get(id);
      if (!r) {
        r = buildCart(color);
        cartRigs.set(id, r);
        scene.add(r.group);
      }
      return r;
    };
    const getRig = (id: string, p: PlayerState) => {
      let r = rigs.get(id);
      // older servers / cached snapshots may not send an outfit yet
      const outfit: OutfitId = p.outfit === "dress" ? "dress" : "suit";
      const hairstyle = resolveHairstyle(outfit, p.hairstyle);
      if (!r) {
        r = createAvatar(p.color, p.name, outfit, hairstyle);
        rigs.set(id, r);
        scene.add(r.group);
      }
      // outfit swap (profile editor) rebuilds the cloth; recolor re-tints it.
      // The ring always follows the clothing color so identical outfits of
      // different wearers stay distinguishable; the action pulse below
      // overrides it while fresh.
      if (r.name !== p.name) {
        r.group.remove(r.label);
        r.label.material.map?.dispose();
        r.label.material.dispose();
        r.label = makeLabel(p.name);
        r.label.position.y = OUTFIT_LABEL_Y;
        r.group.add(r.label);
        r.name = p.name;
      }
      redress(r, outfit, hairstyle);
      if (r.colorHex !== p.color) {
        r.colorHex = p.color;
        tintOutfit(r.outfit, p.color);
        (r.ring.material as THREE.MeshBasicMaterial).color.set(p.color);
      }
      return r;
    };

    // ── local physics state ──
    const me = {
      x: (Math.random() - 0.5) * 2 * SPAWN.xSpread,
      z: SPAWN.zMin + Math.random() * (SPAWN.zMax - SPAWN.zMin),
      vx: 0,
      vz: 0,
      y: 0,
      vy: 0,
      facing: Math.PI,
      sitting: false,
      grounded: true,
    };
    // ── hall carts: which one I drive + display sim for every cart ─────────
    // The driver's client owns its cart (server relays + validates); parked
    // carts and rivals' carts ease toward the relayed snapshot every frame.
    let myCartId: string | null = null;
    const cartSim = new Map<string, { x: number; z: number; facing: number; speed: number; steer: number; boost: number }>();
    // turbo tank + the smoothed boost that actually drives the physics
    let turbo = TURBO_TANK;
    let turboBlend = 0;
    let lastNearCart: string | null = null;
    let lastCartDriveSent = 0;
    let enterTween: { x: number; z: number; at: number } | null = null;
    const keys = new Set<string>();
    // typing in chat / admin inputs must never steer the character.
    // keyup always releases (no stuck keys); keydown is ignored while typing.
    const isTypingTarget = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!down) {
        keys.delete(k);
        return;
      }
      if (isTypingTarget(e) || (e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      // V — cycle the triple view: dollhouse follow → first-person → close
      // chase → follow … Modifiers excluded so shortcuts never flip it.
      if (k === "v" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        cycleViewMode();
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) || ["w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
      }
      keys.add(k);
      if (k === " ") {
        if (!myCartId && me.grounded && !me.sitting) me.vy = JUMP_VY;
      }
    };
    const doJump = () => {
      if (myCartId || !me.grounded || me.sitting) return;
      me.vy = JUMP_VY;
    };
    hallJump.fn = doJump;
    const kd = onKey(true);
    const ku = onKey(false);
    const clearKeys = () => keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", clearKeys);

    // joystick (mobile) — the visible Joystick UI writes here; canvas drag
    // is the fallback so touch screens without the stick can still steer
    const joy = joyState;

    const resolveCircleAABB = (px: number, pz: number, r: number, c: { x: number; z: number; hx: number; hz: number }) => {
      const cx = Math.max(c.x - c.hx, Math.min(px, c.x + c.hx));
      const cz = Math.max(c.z - c.hz, Math.min(pz, c.z + c.hz));
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return { x: px, z: pz, hit: false };
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, hit: true };
      }
      // center inside: push out along smallest axis
      const ox = c.hx + r - Math.abs(px - c.x);
      const oz = c.hz + r - Math.abs(pz - c.z);
      if (ox < oz) return { x: px + Math.sign(px - c.x || 1) * ox, z: pz, hit: true };
      return { x: px, z: pz + Math.sign(pz - c.z || 1) * oz, hit: true };
    };

    // ball physics (local authority when held / recently tossed)
    const ballPhys: BallState = { ...stateRef.current.ball };
    ejectBall(ballPhys);
    const hand = { x: 0, y: 0, z: 0 }; // scratch for carried-ball placement
    const vmBall = new THREE.Vector3(); // scratch for the first-person held-ball spot
    const seatOff = { x: 0, z: 0 }; // scratch for the driver's seat offset
    let lastNetBall = JSON.stringify(ballPhys);
    let lastMoveSent = 0;
    let lastMoveFlag = "";
    let nearId: string | null = null;
    let nearName: string | null = null;
    const nearIdRef = { current: null as string | null };
    let lastTvSig = "";
    let lastRpsSig = "";
    let lastCtxSig = "";
    let lastCtx: ContextState = { ...IDLE_CONTEXT };
    const claimedStars = new Set<string>();
    // ball ownership optimism: instant local feedback across the ~100ms echo
    let optimisticHold = false;
    let optimisticUntil = 0;
    let tossedUntil = 0;
    let selfHitAt = 0;

    const timer = new THREE.Timer();
    let dead = false;
    // smoothed look target — the camera gazes at this, never at the raw
    // player position, so footsteps can't shake the frame.
    const lookSm = new THREE.Vector3(0, 1, 2);
    const desired = new THREE.Vector3();
    const anchorWorld = { x: 0, y: 0, z: 0 };
    const anchorNdc = new THREE.Vector3();

    const step = (dt: number) => {
      const st = stateRef.current;
      // ── cart seat sync: the snapshot player (instant local echo on hop in /
      // out, server truth a beat later) decides whether I drive right now ──
      const serverCartId = st.players[MY_ID]?.cartId ?? null;
      if (serverCartId && !myCartId) {
        myCartId = serverCartId;
        const s = st.carts.find((c) => c.id === myCartId);
        cartSim.set(myCartId, {
          x: s?.x ?? me.x,
          z: s?.z ?? me.z,
          facing: s?.facing ?? me.facing,
          speed: 0,
          steer: 0,
          boost: 0,
        });
        // glide the hips into the seat instead of snapping across the gap
        enterTween = { x: me.x, z: me.z, at: performance.now() };
      } else if (!serverCartId && myCartId) {
        // stepped out beside the seat
        const sim = cartSim.get(myCartId);
        if (sim) {
          me.x = sim.x - Math.cos(sim.facing) * 1.5;
          me.z = sim.z + Math.sin(sim.facing) * 1.5;
        }
        me.y = 0;
        me.vy = 0;
        myCartId = null;
      }
      // lost the race for a cart someone else just took — step back out
      if (myCartId && st.mySocketId) {
        const srv = st.carts.find((c) => c.id === myCartId);
        if (srv && srv.driverId && srv.driverId !== st.mySocketId) {
          myCartId = null;
          me.y = 0;
          me.vy = 0;
        }
      }
      // every cart gets a display sim (the driven one stays authoritative)
      for (const c of st.carts) {
        if (c.id === myCartId || cartSim.has(c.id)) continue;
        cartSim.set(c.id, { x: c.x, z: c.z, facing: c.facing, speed: 0, steer: 0, boost: c.boost ?? 0 });
      }
      // ── input dir (camera looks -z, so screen-up = -z) ──
      let ix = 0;
      let iz = 0;
      if (keys.has("w") || keys.has("arrowup")) iz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) iz += 1;
      if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
      if (keys.has("d") || keys.has("arrowright")) ix += 1;
      if (joy.active) {
        ix += joy.x;
        iz += joy.y;
      }
      // Driving reads its own axes from the RAW input, before the walk vector
      // is normalised — otherwise holding W+D gave 0.71 throttle and 0.71
      // lock at once, so a turn always bled speed. WASD and the arrow keys
      // are interchangeable: both feed ix / iz identically below. The mobile
      // car hub (drivePad) adds on top; every flag is false on desktop, so
      // the keyboard path is untouched there.
      const driveThrottle = Math.max(-1, Math.min(1, -iz + (drivePad.up ? 1 : 0) - (drivePad.down ? 1 : 0)));
      const driveSteer = Math.max(-1, Math.min(1, ix + (drivePad.right ? 1 : 0) - (drivePad.left ? 1 : 0)));
      const len = Math.hypot(ix, iz);
      if (len > 1) {
        ix /= len;
        iz /= len;
      }
      const sitting = st.players[MY_ID]?.sitting ?? me.sitting;
      const sofaMode = sitting && st.players[MY_ID]?.seatMode === "sofa";
      let mySeat = st.players[MY_ID]?.seat ?? null;
      // turn-and-throttle walking suits every camera that looks along the
      // nose (first-person AND close chase); the dollhouse strafes instead
      const steerView = viewState.mode !== 0;

      // ── turbo: SPACE while driving (the on-screen gauge doubles as the
      // boost button on touch, where there is no spacebar). The tank drains
      // while boosting and banks back at a fixed 0.5 s of boost per second,
      // so a partial hold simply tops up its remainder on the same clock.
      const boosting = myCartId !== null && (keys.has(" ") || turboState.held) && turbo > 0.001;
      turbo = boosting
        ? Math.max(0, turbo - dt)
        : Math.min(TURBO_TANK, turbo + dt * (TURBO_TANK / TURBO_REFILL));
      turboBlend += ((boosting ? 1 : 0) - turboBlend) * Math.min(1, dt * TURBO_RAMP);
      turboState.driving = myCartId !== null;
      turboState.level = turbo / TURBO_TANK;
      turboState.active = turboBlend > 0.02;

      // driving — the same sticks steer the cart instead of the feet
      // (screen-up = forward), so the mobile joystick drives with no new UI
      if (myCartId) {
        let sim = cartSim.get(myCartId);
        if (!sim) {
          const s = st.carts.find((c) => c.id === myCartId);
          sim = { x: s?.x ?? me.x, z: s?.z ?? me.z, facing: s?.facing ?? me.facing, speed: 0, steer: 0, boost: 0 };
          cartSim.set(myCartId, sim);
        }
        // turbo scales BOTH the pull and the ceiling, so the extra speed
        // arrives as a smooth climb through the boost ramp and then coasts
        // back down under the normal drag instead of snapping off.
        const boost = 1 + (TURBO_MUL - 1) * turboBlend;
        sim.speed += driveThrottle * CART_ACCEL * boost * dt;
        // drag applied exactly once per frame (exponential → frame-rate-proof;
        // the old `speed -= speed*DRAG*dt` plus collider scrubs fought it)
        sim.speed *= Math.exp(-CART_DRAG * dt);
        if (Math.abs(driveThrottle) < 0.05 && Math.abs(sim.speed) < 0.35) sim.speed = 0;
        sim.speed = Math.max(CART_REV, Math.min(CART_MAX * boost, sim.speed));
        sim.boost = turboBlend;
        // The wheel bites harder the faster you roll, but never goes fully
        // dead: the old /2.5 ramp gave ZERO authority below ~0.55 m/s, so a
        // kart nudged into furniture couldn't turn its way free. A small floor
        // keeps it manoeuvrable at a crawl (and lets it pivot when boxed in).
        const grip = 0.22 + 0.78 * Math.min(1, Math.abs(sim.speed) / 2.5);
        // Car-relative steering, the way a kart actually steers: A/← holds the
        // wheel left, D/→ holds it right, and the yaw mirrors in reverse like
        // every real car. The old `facing +=` spun the nose the WRONG way —
        // press D and the kart curved to the driver's left — so the wheel now
        // rotates the nose toward the driver's right, no matter which way the
        // (fixed) camera happens to be looking.
        sim.steer += (driveSteer - sim.steer) * Math.min(1, dt * 7);
        const dir = sim.speed < -0.2 ? -1 : 1;
        sim.facing -= sim.steer * CART_TURN * grip * dir * dt;
        let nx = sim.x + Math.sin(sim.facing) * sim.speed * dt;
        let nz = sim.z + Math.cos(sim.facing) * sim.speed * dt;
        // anything solid — bump, never clip through. Speed is scrubed ONCE
        // per frame below (the old per-collider ×0.55 was a dead stick:
        // three overlapping colliders multiplied to ×0.17 every frame).
        let bumped = false;
        for (const c of COLLIDERS) {
          const cx = Math.max(c.x - c.hx, Math.min(nx, c.x + c.hx));
          const cz = Math.max(c.z - c.hz, Math.min(nz, c.z + c.hz));
          const dx = nx - cx;
          const dz = nz - cz;
          if (dx * dx + dz * dz < CART_RADIUS * CART_RADIUS) {
            const d = Math.hypot(dx, dz);
            if (d > 1e-6) {
              nx = cx + (dx / d) * CART_RADIUS;
              nz = cz + (dz / d) * CART_RADIUS;
            } else {
              nx = sim.x;
              nz = sim.z;
            }
            bumped = true;
          }
        }
        // the other cart is solid too
        for (const [id, other] of cartSim) {
          if (id === myCartId) continue;
          const dx = nx - other.x;
          const dz = nz - other.z;
          const d = Math.hypot(dx, dz);
          if (d < CART_RADIUS * 2 && d > 1e-4) {
            nx = other.x + (dx / d) * CART_RADIUS * 2;
            nz = other.z + (dz / d) * CART_RADIUS * 2;
            bumped = true;
          }
        }
        // friends are soft — the cart shoves aside instead of mowing them down
        for (const [id, p] of Object.entries(st.players)) {
          if (id === MY_ID) continue;
          const dx = nx - p.x;
          const dz = nz - p.z;
          const d = Math.hypot(dx, dz);
          if (d < CART_RADIUS + 0.45 && d > 1e-4) {
            nx = p.x + (dx / d) * (CART_RADIUS + 0.45);
            nz = p.z + (dz / d) * (CART_RADIUS + 0.45);
            bumped = true;
          }
        }
        // walls
        if (nx < HALL.xMin + 0.9 || nx > HALL.xMax - 0.9) {
          nx = Math.max(HALL.xMin + 0.9, Math.min(HALL.xMax - 0.9, nx));
          bumped = true;
        }
        if (nz < HALL.zMin + 0.9 || nz > HALL.zMax - 0.9) {
          nz = Math.max(HALL.zMin + 0.9, Math.min(HALL.zMax - 0.9, nz));
          bumped = true;
        }
        // one frame-rate-proof scrub per frame — a graze bleeds momentum,
        // but the throttle always stays alive
        if (bumped) sim.speed *= Math.exp(-6 * dt);
        sim.x = nx;
        sim.z = nz;
        // the rider glides with the seat — no walk, no gravity, no jump
        me.x = sim.x;
        me.z = sim.z;
        me.y = CART_RIDER_Y;
        me.vx = 0;
        me.vz = 0;
        me.vy = 0;
        me.facing = sim.facing;
        me.grounded = true;
        // relay to the hall ~12Hz so every screen rolls the same cart
        const driveNow = performance.now();
        if (driveNow - lastCartDriveSent > 80) {
          lastCartDriveSent = driveNow;
          cbRef.current.onCartDrive({
            id: myCartId,
            x: Math.round(sim.x * 100) / 100,
            z: Math.round(sim.z * 100) / 100,
            facing: Math.round(sim.facing * 100) / 100,
            speed: Math.round(sim.speed * 100) / 100,
            boost: Math.round(turboBlend * 100) / 100,
          });
        }
      } else if (sitting) {
        me.vx = me.vz = 0;
        if (sofaMode) {
          // perch ON the nearest sofa seat (front edge of the cushions)
          let best = 0;
          let bd = 1e9;
          for (let i = 0; i < SOFA_SEATS.length; i++) {
            const s = SOFA_SEATS[i];
            const d = Math.hypot(me.x - s.x, me.z - s.z);
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          mySeat = best;
          const seat = SOFA_SEATS[best];
          const k = Math.min(1, dt * 6);
          me.x += (seat.x - me.x) * k;
          me.z += (seat.z - me.z) * k;
          me.y += (seat.y - me.y) * k;
          me.facing = lerpAngle(me.facing, seat.facing, k);
        }
        // floor-sit: stay exactly where you stand (no glide, no sink)
      } else if (steerView) {
        // first person on foot — A/D (or ←/→, or the stick sideways) turn the
        // head, W/S (or ↑/↓, or the stick up/down) throttle along the nose.
        // World-aligned strafing would fight the camera, so it stays home.
        const ACCEL = 30;
        const MAX = 4.4;
        const turnIn =
          (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + joy.x;
        // minus: turning right (D) rotates the nose clockwise on screen,
        // i.e. facing decreases — plus would mirror it
        me.facing -= turnIn * FP_TURN * dt;
        const thr =
          (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - joy.y;
        const fx = Math.sin(me.facing);
        const fz = Math.cos(me.facing);
        me.vx += fx * thr * ACCEL * dt;
        me.vz += fz * thr * ACCEL * dt;
        const fr = Math.exp(-9 * dt);
        if (Math.abs(thr) < 0.05) {
          me.vx *= fr;
          me.vz *= fr;
        }
        const sp = Math.hypot(me.vx, me.vz);
        if (sp > MAX) {
          me.vx = (me.vx / sp) * MAX;
          me.vz = (me.vz / sp) * MAX;
        }
        me.x += me.vx * dt;
        me.z += me.vz * dt;
      } else {
        const ACCEL = 30;
        const MAX = 4.4;
        me.vx += ix * ACCEL * dt;
        me.vz += iz * ACCEL * dt;
        // friction
        const fr = Math.exp(-9 * dt);
        if (len < 0.05) {
          me.vx *= fr;
          me.vz *= fr;
        }
        const sp = Math.hypot(me.vx, me.vz);
        if (sp > MAX) {
          me.vx = (me.vx / sp) * MAX;
          me.vz = (me.vz / sp) * MAX;
        }
        me.x += me.vx * dt;
        me.z += me.vz * dt;
        if (sp > 0.4) me.facing = Math.atan2(me.vx, me.vz);
      }

      // gravity + vaulting — skipped while sitting (seat glide) or driving
      // (the rider glides with the seat), so gravity never fights either
      if (!sitting && !myCartId) {
        // low furniture never blocks once the feet are above its top: a
        // running jump carries over coffee tables, stools, cushions and the
        // bleachers instead of sticking to them mid-air
        for (const c of COLLIDERS) {
          const top = c.y1 ?? 0;
          if (top <= VAULT_MAX && me.y >= top - STEP_KNEE) continue;
          const r = resolveCircleAABB(me.x, me.z, 0.38, c);
          me.x = r.x;
          me.z = r.z;
        }
        // ground support — the highest top underfoot close enough to stand
        // on, so jumps land ON low furniture instead of falling through it
        // (and tiny curbs like the hearth step up with no hop at all)
        let ground = 0;
        for (const c of COLLIDERS) {
          const top = c.y1 ?? 0;
          if (top <= 0.001 || top > VAULT_MAX || top > me.y + STEP_KNEE) continue;
          if (
            me.x > c.x - c.hx - 0.15 && me.x < c.x + c.hx + 0.15 &&
            me.z > c.z - c.hz - 0.15 && me.z < c.z + c.hz + 0.15
          ) {
            if (top > ground) ground = top;
          }
        }
        me.vy -= 14 * dt;
        me.y += me.vy * dt;
        if (me.y <= ground) {
          me.y = ground;
          me.vy = 0;
          me.grounded = true;
        } else {
          me.grounded = false;
        }
        // soft player-player push
        for (const [id, p] of Object.entries(st.players)) {
          if (id === MY_ID) continue;
          const dx = me.x - p.x;
          const dz = me.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.75 && d > 1e-4) {
            me.x = p.x + (dx / d) * 0.75;
            me.z = p.z + (dz / d) * 0.75;
          }
        }
        // carts are solid to walkers (drivers never run this branch, so the
        // seat never shoves its own rider out)
        for (const [, cs] of cartSim) {
          const dx = me.x - cs.x;
          const dz = me.z - cs.z;
          const d = Math.hypot(dx, dz);
          const minD = 0.38 + CART_RADIUS;
          if (d < minD && d > 1e-4) {
            me.x = cs.x + (dx / d) * minD;
            me.z = cs.z + (dz / d) * minD;
          }
        }
      } else {
        me.vy = 0;
        me.grounded = true;
      }
      me.x = Math.max(-HALL_BOUNDS.x, Math.min(HALL_BOUNDS.x, me.x));
      me.z = Math.max(HALL_BOUNDS.zMin, Math.min(HALL_BOUNDS.zMax, me.z));

      // ── ball: network is the source of truth for WHO holds it ──────────
      // Own socket id translates to "me" so held balls always resolve.
      const netBall = st.ball;
      const myId = st.mySocketId;
      const rawHolder = netBall.holderId ?? null;
      const netHolder = rawHolder && myId !== "" && rawHolder === myId ? MY_ID : rawHolder;
      const nowMs = performance.now();
      if (netHolder && netHolder !== MY_ID) optimisticHold = false; // someone else grabbed it
      if (optimisticHold && nowMs >= optimisticUntil && netHolder !== MY_ID) optimisticHold = false;
      const echoStale = nowMs < tossedUntil; // just threw: trust local sim, not the old echo
      const held = !echoStale && (netHolder === MY_ID || optimisticHold);

      const netSig = JSON.stringify([netBall.x, netBall.z, netBall.holderId]);
      if (netSig !== lastNetBall) {
        lastNetBall = netSig;
        if (!held) {
          ballPhys.x = netBall.x;
          ballPhys.z = netBall.z;
          ballPhys.y = netBall.y;
          ballPhys.vx = netBall.vx;
          ballPhys.vy = netBall.vy;
          ballPhys.vz = netBall.vz;
          ballPhys.holderId = null;
          ejectBall(ballPhys);
        }
      }
      if (held) {
        ballPhys.holderId = MY_ID;
        ballPhys.vx = ballPhys.vy = ballPhys.vz = 0;
        handPoint(me.x, me.y, me.z, me.facing, hand);
        ballPhys.x = hand.x;
        ballPhys.y = hand.y;
        ballPhys.z = hand.z;
      } else if (netHolder && st.players[netHolder]) {
        // friend is holding it — glide to their hand (always visible now)
        const holder = st.players[netHolder];
        ballPhys.holderId = netHolder;
        handPoint(holder.x, 0, holder.z, holder.facing, hand);
        const k = Math.min(1, dt * 10);
        ballPhys.x += (hand.x - ballPhys.x) * k;
        ballPhys.z += (hand.z - ballPhys.z) * k;
        ballPhys.y += (hand.y - ballPhys.y) * k;
      } else {
        ballPhys.holderId = null;
        // sphere vs the hall's furniture (lib/ball-physics) — bounces off,
        // lands on and rolls off solids; never passes into them
        stepBall(ballPhys, dt);
        // pickup
        const d = Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z);
        const speed = Math.hypot(ballPhys.vx, ballPhys.vz);
        if (d < PICKUP_RADIUS && ballPhys.y < 0.9 && speed < 3 && !sitting && st.dodge.status !== "playing") {
          ballPhys.holderId = MY_ID;
          ballPhys.throwerId = null;
          ballPhys.thrownAt = 0;
          optimisticHold = true;
          optimisticUntil = nowMs + 1500;
          cbRef.current.onBall({ ...ballPhys });
        }
      }

      // ── dodgeball court ──
      {
        const dg = st.dodge;
        const serverNow = Date.now() + st.serverOffset;
        const perf = performance.now();
        const meRow = myId ? dg.roster[myId] : undefined;
        const inRound = dg.status === "playing" && !!meRow && !meRow.left;
        const seenIds = new Set<string>();
        let holdingNet: string | null = null;
        for (const nb of dg.balls) {
          seenIds.add(nb.id);
          let sim = dodgeSims.get(nb.id);
          if (!sim) {
            const { grp, trail } = makeDodgeMesh();
            sim = { id: nb.id, body: { x: nb.x, y: nb.y, z: nb.z, vx: nb.vx, vy: nb.vy, vz: nb.vz }, rev: -1, live: false, localUntil: 0, mesh: grp, trail };
            dodgeSims.set(nb.id, sim);
          }
          if (nb.holderId && nb.holderId === myId) holdingNet = nb.id;
          if (nb.rev !== sim.rev) {
            sim.rev = nb.rev;
            const mineInFlight = perf < sim.localUntil && nb.holderId === myId; // stale pickup echo of my throw
            if (!mineInFlight) {
              sim.localUntil = 0;
              sim.body.x = nb.x;
              sim.body.y = nb.y;
              sim.body.z = nb.z;
              sim.body.vx = nb.vx;
              sim.body.vy = nb.vy;
              sim.body.vz = nb.vz;
              ejectBall(sim.body);
              sim.live = !nb.holderId && !nb.spent && !!nb.throwerId;
              if (!nb.holderId && nb.thrownAt) fastForward(sim, Math.min(1.2, Math.max(0, (serverNow - nb.thrownAt) / 1000)));
            }
          }
          const flyingLocally = perf < sim.localUntil;
          if (nb.holderId && !flyingLocally) continue; // carried: rendered at a hand
          if (nb.spent) sim.live = false;
          if (serverNow - nb.thrownAt > DODGE_LIVE_MS) sim.live = false;
          const wasLive = sim.live;
          const touched = stepBall(sim.body, dt);
          if (touched & (TOUCH_FLOOR | TOUCH_SOLID | TOUCH_WALL)) sim.live = false;
          // the thrower's screen calls a throw dead the moment it lands
          if (wasLive && !sim.live && nb.throwerId === myId && !flyingLocally) cbRef.current.onDodgeSpend(nb.id, nb.rev);

          if (!inRound || flyingLocally) continue;
          const dx = me.x - sim.body.x;
          const dz = me.z - sim.body.z;
          const dist = Math.hypot(dx, dz);
          // hit: a live throw from someone else reaches my body
          if (
            sim.live &&
            nb.throwerId &&
            nb.throwerId !== myId &&
            dist < 0.62 &&
            sim.body.y > me.y + 0.05 &&
            sim.body.y < me.y + 1.75 &&
            Date.now() - lastDodgeHitAt > DODGE_SHIELD_MS
          ) {
            sim.live = false;
            lastDodgeHitAt = Date.now();
            selfHitAt = Date.now();
            cbRef.current.onDodgeHit(nb.id, { x: sim.body.x, y: sim.body.y, z: sim.body.z, vx: sim.body.vx, vz: sim.body.vz });
            sim.body.vx *= -0.25;
            sim.body.vz *= -0.25;
            sim.body.vy = 2.4;
          }
          // pickup: walk over a resting ball (one at a time)
          const busy = holdingNet !== null || (myDodgeBall !== null && perf < myDodgeUntil);
          const speed = Math.hypot(sim.body.vx, sim.body.vz);
          const blocked = (noPickupUntil.get(nb.id) ?? 0) > perf || (nb.throwerId !== myId && serverNow - nb.thrownAt < 350);
          if (!busy && !nb.holderId && !sitting && !blocked && dist < PICKUP_RADIUS && sim.body.y < 0.9 && speed < 3) {
            myDodgeBall = nb.id;
            myDodgeUntil = perf + 1500;
            cbRef.current.onDodgePickup(nb.id);
          }
        }
        for (const [id, sim] of dodgeSims) {
          if (seenIds.has(id)) continue;
          scene.remove(sim.mesh);
          (sim.trail.material as THREE.SpriteMaterial).dispose();
          dodgeSims.delete(id);
        }
        // optimistic pickup settles: confirmed, taken by someone else, or timed out
        if (myDodgeBall) {
          const nb = dg.balls.find((b) => b.id === myDodgeBall);
          if (!nb || (nb.holderId && nb.holderId !== myId) || (!nb.holderId && performance.now() > myDodgeUntil) || holdingNet === myDodgeBall) {
            if (holdingNet !== myDodgeBall) myDodgeBall = null;
          }
        }
        if (dg.status !== "playing") myDodgeBall = null;
      }

      // ── dodgeball bonk: fast free ball, thrown by a friend, meets me ──
      {
        const spd = Math.hypot(ballPhys.vx, ballPhys.vz);
        const thr = st.ball.throwerId ?? null;
        const thrownAt = st.ball.thrownAt ?? 0;
        const now = Date.now();
        const selfThrow = !thr || thr === MY_ID || (myId !== "" && thr === myId);
        const alreadyHit = selfHitAt !== 0 && now - selfHitAt < 2500;
        if (
          !held &&
          !selfThrow &&
          !alreadyHit &&
          spd > 3 &&
          now - thrownAt > 700 &&
          now - thrownAt < 4000 &&
          ballPhys.y < 1.5 &&
          Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z) < 0.9
        ) {
          selfHitAt = now;
          cbRef.current.onHit();
        }
      }

      // ── broadcast move ~15Hz ──
      const now = performance.now();
      const cartSpeed = myCartId ? Math.abs(cartSim.get(myCartId)?.speed ?? 0) : 0;
      const moving = myCartId ? cartSpeed > 0.4 : Math.hypot(me.vx, me.vz) > 0.35;
      if (now - lastMoveSent > 66 || moving !== (lastMoveFlag === "m")) {
        lastMoveSent = now;
        lastMoveFlag = moving ? "m" : "s";
        // carry fresh emote / action along — otherwise the next move packet
        // wipes the bubble ~66ms after it appears (the "instant vanish" bug)
        const self = st.players[MY_ID];
        const freshEmote =
          self?.emote && self?.emoteAt && Date.now() - self.emoteAt < 2600
            ? { emote: self.emote, emoteAt: self.emoteAt }
            : {};
        const freshAction =
          self?.action && self?.actionAt && Date.now() - self.actionAt < 1200
            ? { action: self.action, actionAt: self.actionAt, actionTarget: self.actionTarget ?? null }
            : {};
        const freshHit = selfHitAt !== 0 && Date.now() - selfHitAt < 2000 ? { hitAt: selfHitAt } : {};
        const freshChat =
          self?.chat && self?.chatAt && Date.now() - self.chatAt < 5000
            ? { chat: self.chat, chatAt: self.chatAt }
            : {};
        cbRef.current.onMove({
          id: MY_ID,
          name: st.myName,
          color: st.myColor,
          outfit: st.myOutfit,
          hairstyle: st.myHairstyle,
          x: me.x,
          z: me.z,
          facing: me.facing,
          moving,
          sitting,
          seat: myCartId ? null : mySeat,
          seatMode: myCartId || !sofaMode ? null : "sofa",
          cartId: myCartId,
          jumping: !myCartId && me.y > 0.02,
          ...freshEmote,
          ...freshAction,
          ...freshHit,
          ...freshChat,
        });
      }

      // ── proximity for poke / high-five ──
      let bestId: string | null = null;
      let bestName: string | null = null;
      let bestD = 1.6;
      for (const [id, p] of Object.entries(st.players)) {
        if (id === MY_ID) continue;
        const d = Math.hypot(me.x - p.x, me.z - p.z);
        if (d < bestD) {
          bestD = d;
          bestId = id;
          bestName = p.name;
        }
      }
      if (bestId !== nearId) {
        nearId = bestId;
        nearName = bestName;
        cbRef.current.onNear(nearId, nearName);
      }

      // ── contextual zones with hysteresis (lib/hall-layout ZONES) ──────
      // Enter radius < exit radius per zone: crossing a boundary can't
      // flutter the ACT button.
      const near = (z: { x: number; z: number; enter: number; exit: number }, was: boolean) =>
        Math.hypot(me.x - z.x, me.z - z.z) < (was ? z.exit : z.enter);
      const nearGame = near(ZONES.game, lastCtx.nearGame);
      const dxSofa = Math.abs(me.x - ZONES.sofa.x);
      const dzSofa = Math.abs(me.z - ZONES.sofa.z);
      const nearSofa = lastCtx.nearSofa
        ? dxSofa < ZONES.sofa.hxExit && dzSofa < ZONES.sofa.hzExit
        : dxSofa < ZONES.sofa.hxEnter && dzSofa < ZONES.sofa.hzEnter;
      const nearTv = near(ZONES.tv, lastCtx.nearTv);
      const nearRps = near(ZONES.rps, lastCtx.nearRps);
      const nearEmergency = near(ZONES.sos, lastCtx.nearEmergency);
      const nearDodgePad = near(ZONES.dodgePad, lastCtx.nearDodgePad);
      const lobbyActive = st.dodge.status !== "playing";
      const dBall = Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z);
      const nearBall = lobbyActive && (lastCtx.nearBall ? dBall < 2.0 : dBall < 1.5);
      const holdingDodge =
        st.dodge.status === "playing" &&
        (st.dodge.balls.some((b) => b.holderId === myId && performance.now() >= (dodgeSims.get(b.id)?.localUntil ?? 0)) || myDodgeBall !== null);
      // free carts in hop-in range (hysteresis like every other zone); never
      // while driving — E already means "hop out" then
      let nearCart: string | null = null;
      if (!myCartId) {
        let best = lastNearCart && st.carts.some((c) => c.id === lastNearCart && !c.driverId) ? 2.8 : 2.2;
        for (const c of st.carts) {
          if (c.driverId) continue;
          const d = Math.hypot(me.x - c.x, me.z - c.z);
          const lim = c.id === lastNearCart ? 2.8 : 2.2;
          if (d < lim && d < best) {
            best = d;
            nearCart = c.id;
          }
        }
      }
      lastNearCart = nearCart;
      const ctx: ContextState = {
        nearSofa,
        nearBall,
        holdingBall: lobbyActive && ballPhys.holderId === MY_ID,
        nearTv,
        nearGame,
        nearRps,
        nearEmergency,
        nearDodgePad,
        holdingDodge,
        nearCart,
        driving: myCartId !== null,
      };
      lastCtx = ctx;
      const ctxSig =
        [ctx.nearSofa, ctx.nearBall, ctx.holdingBall, ctx.nearTv, ctx.nearGame, ctx.nearRps, ctx.nearEmergency, ctx.nearDodgePad, ctx.holdingDodge, ctx.driving]
          .map((v) => (v ? 1 : 0))
          .join("") + "|" + (ctx.nearCart ?? "");
      if (ctxSig !== lastCtxSig) {
        lastCtxSig = ctxSig;
        cbRef.current.onContext(ctx);
      }

      // ── star collect: walk over a star, server validates + scores ──
      const gstate = st.game;
      if (gstate.status === "playing") {
        for (const s of gstate.stars) {
          if (claimedStars.has(s.id)) continue;
          if (Math.hypot(me.x - s.x, me.z - s.z) < 1.0) {
            claimedStars.add(s.id);
            cbRef.current.onCollect(s.id);
          }
        }
      } else if (claimedStars.size) {
        claimedStars.clear();
      }
    };

    const animate = () => {
      if (dead) return;
      requestAnimationFrame(animate);
      // Variable timestep (clamped): physics + camera advance once per
      // displayed frame, so motion stays butter-smooth on 60Hz and 120Hz+
      // screens alike — no fixed-step quantization judder.
      timer.update();
      const dt = Math.min(Math.max(timer.getDelta(), 0.0005), 1 / 30);
      const elapsed = timer.getElapsed();
      step(dt);

      const st = stateRef.current;

      // ── sync avatars ──
      const seen = new Set<string>();
      for (const [id, p] of Object.entries(st.players)) {
        seen.add(id);
        const rig = getRig(id, p);
        const g = rig.group;
        // drivers ride their cart's seat — pos/rotation come from the cart
        // sim, never from the walk lerp, so rider and kart stay glued
        const driverCartId = id === MY_ID ? myCartId : (p.cartId ?? null);
        const driverSim = driverCartId ? cartSim.get(driverCartId) : undefined;
        const driving = !!driverCartId && !!driverSim;
        if (driving && driverSim) {
          // the rider sits ON the seat cushion, which is set back behind the
          // car's origin — otherwise they perch on the steering column
          cartSeatOffset(driverSim.facing, seatOff);
          const seatX = driverSim.x + seatOff.x;
          const seatZ = driverSim.z + seatOff.z;
          g.position.set(seatX, CART_RIDER_Y, seatZ);
          g.rotation.y = driverSim.facing;
          // fresh hop-in: glide the hips from the door into the seat
          if (id === MY_ID && enterTween && performance.now() - enterTween.at < 350) {
            const k = (performance.now() - enterTween.at) / 350;
            const e = k * k * (3 - 2 * k);
            g.position.x += (enterTween.x - seatX) * (1 - e);
            g.position.z += (enterTween.z - seatZ) * (1 - e);
          }
        } else if (id === MY_ID) {
          g.position.set(me.x, me.y, me.z);
          g.rotation.y = me.facing;
        } else {
          // smooth interpolation toward network state
          g.position.x += (p.x - g.position.x) * Math.min(1, dt * 10);
          g.position.z += (p.z - g.position.z) * Math.min(1, dt * 10);
          let d = p.facing - g.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          g.rotation.y += d * Math.min(1, dt * 10);
        }
        // first person hides your own head and body (the camera rides inside
        // it) — chase and follow show you, everyone else always shows
        g.visible = id !== MY_ID || !isFirstPerson();
        const cartSpeed = driverSim ? Math.abs(driverSim.speed) : 0;
        const speed = driving ? cartSpeed : id === MY_ID ? Math.hypot(me.vx, me.vz) : p.moving ? 3 : 0;
        const walking = driving ? cartSpeed > 0.4 : id === MY_ID ? speed > 0.4 : p.moving;
        const jumping = !driving && !p.sitting && (p.jumping || (id === MY_ID && me.y > 0.02));
        // bonk freshness 1 → 0 — drives the cloth flash + wobble inside the
        // pose engine (self reads the local stamp, friends the server echo)
        const selfStamp = id === MY_ID ? selfHitAt : 0;
        const hitStamp = selfStamp !== 0 ? selfStamp : (p.hitAt ?? 0);
        const hitK = hitStamp !== 0 && Date.now() - hitStamp < 2000 ? 1 - (Date.now() - hitStamp) / 2000 : 0;
        // perched sitters stand on the cushion edge (feet dangle); floor
        // sitters sink into a deep kneel (see poseOutfit)
        const baseY = driving ? CART_RIDER_Y : p.sitting ? (p.seat != null ? (SOFA_SEATS[p.seat]?.y ?? 0.55) - 0.635 : -0.38) : id === MY_ID ? me.y : 0;
        g.position.y = baseY;
        poseOutfit(rig.outfit, dt, {
          speed,
          moving: walking,
          sitting: p.sitting,
          floorSit: p.sitting && p.seat == null,
          jumping,
          driving,
          steer: driving ? (driverSim?.steer ?? 0) : 0,
          action: p.action ?? null,
          actionAt: p.actionAt,
          elapsed,
          hitK,
        });
        // head-bob on the stride (peaks mid-stance) — stillness when idle
        const ob = rig.outfit;
        if (!driving && !p.sitting && !jumping && ob.blend > 0.02) {
          g.position.y += Math.abs(Math.cos(ob.phase)) * 0.045 * ob.blend;
        }

        // chat bubble — overhead text for ~5s, even with chat closed.
        // The emoji rides above it when both show at once.
        const chatFresh = p.chat && p.chatAt && Date.now() - p.chatAt < 5000;
        if (chatFresh && p.chat) {
          if (!rig.chat || rig.chatText !== p.chat) {
            if (rig.chat) {
              g.remove(rig.chat);
              rig.chat.material.map?.dispose();
              rig.chat.material.dispose();
            }
            rig.chat = makeChatBubble(p.chat);
            rig.chatText = p.chat;
            g.add(rig.chat);
          }
          rig.chat.position.y = 2.62 + Math.sin(elapsed * 2.4) * 0.04;
        } else if (rig.chat) {
          g.remove(rig.chat);
          rig.chat.material.map?.dispose();
          rig.chat.material.dispose();
          rig.chat = null;
          rig.chatText = "";
        }

        // emote bubble
        if (p.emote && p.emoteAt && Date.now() - p.emoteAt < 2600) {
          if (!rig.emote || rig.emoteUntil < Date.now() - 2600) {
            if (rig.emote) {
              g.remove(rig.emote);
              rig.emote.material.map?.dispose();
              rig.emote.material.dispose();
            }
            rig.emote = makeEmoteSprite(p.emote);
            g.add(rig.emote);
            rig.emoteUntil = Date.now();
          }
          const pop = 1 + Math.sin(Math.min(1, (Date.now() - p.emoteAt) / 300) * Math.PI) * 0.25;
          rig.emote.scale.set(0.9 * pop, 0.9 * pop, 1);
          rig.emote.position.y = (rig.chat ? 3.6 : 2.55) + Math.sin(elapsed * 3) * 0.05;
        } else if (rig.emote) {
          g.remove(rig.emote);
          rig.emote.material.map?.dispose();
          rig.emote.material.dispose();
          rig.emote = null;
        }

        // bonk'd! — dizzy hop for 2s. The cloth flash + wobble already ran in
        // the pose engine; the hop here is group-level so it stacks cleanly.
        if (hitK > 0) g.position.y += Math.abs(Math.sin(elapsed * 13)) * 0.26 * hitK;

        // action ring (poke = pink pulse, high-five = gold)
        const freshAction = p.action && p.actionAt && Date.now() - p.actionAt < 1200;
        const mat = rig.ring.material as THREE.MeshBasicMaterial;
        if (freshAction) {
          mat.opacity = 0.9;
          mat.color.set(p.action === "highfive" ? "#ffd166" : "#ff8fab");
          const s = 1 + ((Date.now() - (p.actionAt ?? 0)) / 1200) * 0.7;
          rig.ring.scale.set(s, s, 1);
          // happy hop for high-five
          if (p.action === "highfive") g.position.y = baseY + Math.sin(((Date.now() - (p.actionAt ?? 0)) / 1200) * Math.PI) * 0.45;
        } else {
          // No idle ground ring — avatars walk clean on real shadows only.
          // The torus stays in the rig purely for the 1.2s poke / high-five
          // pulse handled above; otherwise it fades out and stays hidden.
          rig.ring.scale.set(1, 1, 1);
          mat.opacity += (0 - mat.opacity) * Math.min(1, dt * 6);
          if (mat.opacity < 0.02) mat.opacity = 0;
        }
      }
      for (const [id, rig] of rigs) {
        if (!seen.has(id)) {
          scene.remove(rig.group);
          // cloth materials are per-avatar clones (geometry stays cached)
          disposeOutfit(rig.outfit);
          rigs.delete(id);
        }
      }
      // ── hall carts: ease parked + rival carts to the relay, roll the mesh ──
      // (the cart I drive is authoritative — its sim is never touched here)
      for (const c of st.carts) {
        const rig = getCartRig(c.id, c.color);
        let sim = cartSim.get(c.id);
        if (!sim) {
          sim = { x: c.x, z: c.z, facing: c.facing, speed: 0, steer: 0, boost: c.boost ?? 0 };
          cartSim.set(c.id, sim);
        }
        if (c.id !== myCartId) {
          const k = Math.min(1, dt * 6);
          // snap a fresh / teleported cart, ease everything else (no lerp lag
          // across the hall, no pop for sub-meter corrections)
          if (Math.hypot(c.x - sim.x, c.z - sim.z) > 3) {
            sim.x = c.x;
            sim.z = c.z;
            sim.facing = c.facing;
          } else {
            sim.x += (c.x - sim.x) * k;
            sim.z += (c.z - sim.z) * k;
            let d = c.facing - sim.facing;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            sim.facing += d * k;
          }
          sim.speed += (c.speed - sim.speed) * k;
          sim.steer += (0 - sim.steer) * k;
          sim.boost += ((c.boost ?? 0) - sim.boost) * k;
        }
        rig.group.position.set(sim.x, 0, sim.z);
        rig.group.rotation.y = sim.facing;
        poseCart(rig, dt, { speed: sim.speed, steer: sim.steer, elapsed, boost: sim.boost });
      }
      // ── ball mesh: held balls render from synced player positions ──
      // (never from fragile local adoption chains — always visible)
      const rawH = st.ball.holderId ?? null;
      const renderHolder = rawH && st.mySocketId !== "" && rawH === st.mySocketId ? MY_ID : rawH;
      if (renderHolder === MY_ID) {
        handPoint(me.x, me.y, me.z, me.facing, hand);
        ballMesh.position.set(hand.x, hand.y, hand.z);
      } else if (renderHolder && st.players[renderHolder]) {
        // Ride the holder's INTERPOLATED rig (smoothed every frame like the
        // character itself) — never the raw 12Hz network pos. That's what
        // was making the carried ball judder on remote screens.
        const rig = rigs.get(renderHolder);
        if (rig) {
          handPoint(rig.group.position.x, rig.group.position.y, rig.group.position.z, rig.group.rotation.y, hand);
        } else {
          const h = st.players[renderHolder];
          handPoint(h.x, 0, h.z, h.facing, hand);
        }
        ballMesh.position.set(hand.x, hand.y, hand.z);
      } else {
        ballMesh.position.set(ballPhys.x, ballPhys.y, ballPhys.z);
      }
      ballMesh.rotation.x += dt * (Math.hypot(ballPhys.vx, ballPhys.vz) * 1.6 + 0.4);
      ballMesh.rotation.z += dt * 0.5;
      ballMesh.visible = st.dodge.status !== "playing";

      // ── dodgeballs ──
      let fpDodgeMesh: THREE.Object3D | null = null; // my held ball, for the FP viewmodel below
      {
        const dg = st.dodge;
        for (const nb of dg.balls) {
          const sim = dodgeSims.get(nb.id);
          if (!sim) continue;
          const flyingLocally = performance.now() < sim.localUntil;
          const holder = flyingLocally ? null : nb.holderId === st.mySocketId || (myDodgeBall === nb.id && !nb.holderId) ? MY_ID : nb.holderId;
          if (holder === MY_ID) {
            handPoint(me.x, me.y, me.z, me.facing, hand);
          } else if (holder && rigs.get(holder)) {
            const rig = rigs.get(holder)!;
            handPoint(rig.group.position.x, rig.group.position.y, rig.group.position.z, rig.group.rotation.y, hand);
          } else {
            hand.x = sim.body.x;
            hand.y = sim.body.y;
            hand.z = sim.body.z;
          }
          sim.mesh.position.set(hand.x, hand.y, hand.z);
          if (holder === MY_ID) fpDodgeMesh = sim.mesh;
          const spin = Math.hypot(sim.body.vx, sim.body.vz);
          sim.mesh.rotation.x += dt * (spin * 2.2 + 0.3);
          sim.mesh.rotation.y += dt * 0.6;
          const tm = sim.trail.material as THREE.SpriteMaterial;
          const thrower = nb.throwerId ? st.players[nb.throwerId === st.mySocketId ? MY_ID : nb.throwerId] : undefined;
          if (sim.live && thrower) tm.color.set(thrower.color);
          tm.opacity += ((sim.live ? 0.85 : 0) - tm.opacity) * Math.min(1, dt * 12);
        }

        // +1 / −1 popups for fresh hits
        for (const h of dg.feed) {
          if (h.id <= lastFeedId) continue;
          lastFeedId = h.id;
          if (Date.now() + st.serverOffset - h.at > 3000) continue;
          popups.push({ sp: makePopup("+1", "#8ce8c0"), id: h.by, born: elapsed });
          popups.push({ sp: makePopup("−1", "#ff8a8a"), id: h.victim, born: elapsed });
        }
        for (let i = popups.length - 1; i >= 0; i--) {
          const p = popups[i];
          const age = elapsed - p.born;
          const rig = rigs.get(p.id === st.mySocketId ? MY_ID : p.id);
          if (age > 1.4 || !rig) {
            scene.remove(p.sp);
            p.sp.material.map?.dispose();
            p.sp.material.dispose();
            popups.splice(i, 1);
            continue;
          }
          p.sp.position.set(rig.group.position.x, rig.group.position.y + 2.5 + age * 0.9, rig.group.position.z);
          p.sp.material.opacity = age < 1 ? 1 : 1 - (age - 1) / 0.4;
          const pop = 1 + Math.max(0, 0.25 - age) * 2;
          p.sp.scale.set(1.2 * pop, 0.6 * pop, 1);
        }

        // court scoreboard + corner lights follow the round
        if (dg.status !== courtMode) {
          courtMode = dg.status;
          env.setCourtMode(courtMode);
        }
        const serverNow = Date.now() + st.serverOffset;
        let onCourt = 0;
        if (dg.status === "countdown") {
          if (inCourt(me.x, me.z, 0.2)) onCourt++;
          for (const [id, p] of Object.entries(st.players)) if (id !== MY_ID && inCourt(p.x, p.z, 0.2)) onCourt++;
        }
        const boardSig = [
          dg.status,
          dg.status === "idle" ? 0 : Math.ceil(((dg.status === "countdown" ? dg.startsAt : dg.endsAt) - serverNow) / 1000),
          onCourt,
          Object.values(dg.roster).map((r) => `${r.hits}.${r.taken}.${r.left ? 1 : 0}`).join(","),
          dg.ranking.length,
        ].join("|");
        if (boardSig !== lastBoardSig) {
          lastBoardSig = boardSig;
          env.drawCourtBoard(dg, serverNow, onCourt);
        }
      }
      env.tick(elapsed, dt);

      // ── star collectibles ──
      const starSeen = new Set<string>();
      if (st.game.status === "playing") {
        for (const s of st.game.stars) {
          starSeen.add(s.id);
          let entry = starMeshes.get(s.id);
          if (!entry) {
            entry = { group: createStar(), phase: Math.random() * 6 };
            entry.group.position.set(s.x, 0.8, s.z);
            starMeshes.set(s.id, entry);
            scene.add(entry.group);
          }
          entry.group.position.y = 0.8 + Math.sin(elapsed * 3 + entry.phase) * 0.15;
          entry.group.rotation.y += dt * 2.5;
        }
      }
      for (const [id, entry] of starMeshes) {
        if (!starSeen.has(id)) {
          scene.remove(entry.group);
          starMeshes.delete(id);
        }
      }

      // ── tv + scoreboard refresh ──
      const tvSig = `${st.tv.index}-${st.tv.playing}-${st.room.tv.length}`;
      if (tvSig !== lastTvSig) {
        lastTvSig = tvSig;
        drawTv();
      }
      const rpsSig = [
        st.rps.status,
        st.rps.round,
        st.rps.scores.a,
        st.rps.scores.b,
        st.rps.lastReveal?.at ?? 0,
        st.rps.names.a,
        st.rps.names.b,
        st.rps.winner ?? "",
      ].join("|");
      if (rpsSig !== lastRpsSig) {
        lastRpsSig = rpsSig;
        drawRps();
      }
      for (const d of rpsDeco) d.sp.position.y += Math.sin(elapsed * 2 + d.phase) * dt * 0.15;

      // ── emergency alarm: red blink across the 3D hall ──
      const sosFresh = st.sos != null && Date.now() - st.sos.at < 3000;
      if (sosFresh) {
        const blink = 0.5 + 0.5 * Math.sin(elapsed * 10);
        sosLight.intensity = 8 + blink * 26;
        sosDomeMat.emissiveIntensity = 1 + blink * 3;
      } else {
        sosLight.intensity += (3 - sosLight.intensity) * Math.min(1, dt * 4);
        sosDomeMat.emissiveIntensity += (0.7 - sosDomeMat.emissiveIntensity) * Math.min(1, dt * 4);
      }
      tvGlow.intensity = 8 + Math.sin(elapsed * 6) * 1 + (st.tv.playing ? 3 : 0);

      // ── camera follow: both the position AND the gaze point are damped,
      // so the frame glides instead of shaking ──
      const fpCam = isFirstPerson();
      const chaseCam = !fpCam && viewState.mode === 2;
      const drivingCam = (fpCam || chaseCam) && myCartId !== null;
      // head anchor (avatar group position, so the seat + walk-bob ride along)
      const myG = rigs.get(MY_ID)?.group.position;
      const px = myG ? myG.x : me.x;
      const py = myG ? myG.y : me.y;
      const pz = myG ? myG.z : me.z;
      const fx = Math.sin(me.facing);
      const fz = Math.cos(me.facing);
      if (fpCam) {
        // first person — ride the head and gaze down the nose. In the kart
        // the gaze tips down so the hood and nose fill the lower frame like
        // a real cockpit; on foot it stays near level.
        desired.set(px + fx * 0.22, py + 1.55, pz + fz * 0.22);
        camera.position.lerp(desired, Math.min(1, dt * 10));
        const k = Math.min(1, dt * 10);
        const ahead = drivingCam ? 7 : 8;
        const drop = drivingCam ? 1.6 : 0.25;
        lookSm.x += (px + fx * ahead - lookSm.x) * k;
        lookSm.y += (py + 1.55 - drop - lookSm.y) * k;
        lookSm.z += (pz + fz * ahead - lookSm.z) * k;
      } else if (chaseCam) {
        // close chase — hover just behind the back, nearer than max zoom-in
        // ever reaches, full body in frame with the road ahead up top.
        // Clamped inside the room so the new front/left walls never swallow
        // the lens (it slides along them instead, like a real camera rig).
        desired.set(
          Math.max(HALL.xMin + 0.6, Math.min(HALL.xMax - 0.6, px - fx * 4.0)),
          py + 2.7,
          Math.max(HALL.zMin + 0.6, Math.min(HALL.zMax - 0.6, pz - fz * 4.0))
        );
        camera.position.lerp(desired, Math.min(1, dt * 6));
        const k = Math.min(1, dt * 6);
        lookSm.x += (px + fx * 6 - lookSm.x) * k;
        lookSm.y += (py + 0.9 - lookSm.y) * k;
        lookSm.z += (pz + fz * 6 - lookSm.z) * k;
      } else {
        const tx = me.x * 0.72;
        const tz = me.z * 0.7 + 2.4;
        desired.set(tx, camDist * 0.64, tz + camDist * 0.6);
        camera.position.lerp(desired, Math.min(1, dt * 4));
        lookSm.x += (tx - lookSm.x) * Math.min(1, dt * 4);
        lookSm.y += (1.0 - lookSm.y) * Math.min(1, dt * 4);
        lookSm.z += (tz - 4 - lookSm.z) * Math.min(1, dt * 4);
      }
      camera.lookAt(lookSm);
      // lens to match the view: wider + a close near-plane in first person
      // (the dash and the held ball live under a metre away), a touch wider
      // in close chase, classic 44 and deep precision back outside
      const wantFov = chaseCam ? 50 : !fpCam ? 44 : drivingCam ? 62 : 55;
      const wantNear = fpCam ? 0.1 : 1;
      if (Math.abs(camera.fov - wantFov) > 0.05 || camera.near !== wantNear) {
        camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 6);
        if (Math.abs(camera.fov - wantFov) <= 0.05) camera.fov = wantFov;
        camera.near = wantNear;
        camera.updateProjectionMatrix();
      }
      // first-person viewmodel — a held ball rides bottom-right of the lens
      // like a carried item. (The hands hide with the avatar, so the normal
      // hand-spot ball would float oddly at the frame edge instead.)
      if (fpCam) {
        camera.updateMatrixWorld();
        vmBall.set(0.45, -0.18, -1.0).applyMatrix4(camera.matrixWorld);
        const iHoldLobby =
          ballMesh.visible &&
          st.ball.holderId !== null &&
          (st.ball.holderId === st.mySocketId || st.ball.holderId === MY_ID);
        if (iHoldLobby) ballMesh.position.copy(vmBall);
        if (fpDodgeMesh) fpDodgeMesh.position.copy(vmBall);
      }

      // ── in-world prompt: project the current action's anchor to screen ──
      const pk = actionKey(lastCtx, {
        sitting: st.players[MY_ID]?.sitting ?? me.sitting,
        driving: myCartId !== null,
        gameStatus: st.game.status,
        dodgeStatus: st.dodge.status,
      });
      if (pk) {
        const nearCartSim = pk === "drive" && lastCtx.nearCart ? cartSim.get(lastCtx.nearCart) : undefined;
        actionAnchor(pk, me, anchorWorld, nearCartSim ? { x: nearCartSim.x, z: nearCartSim.z } : undefined);
        anchorNdc.set(anchorWorld.x, anchorWorld.y, anchorWorld.z).project(camera);
        promptAnchor.key = pk;
        promptAnchor.visible = anchorNdc.z > -1 && anchorNdc.z < 1;
        promptAnchor.x = ((anchorNdc.x + 1) / 2) * viewW;
        promptAnchor.y = ((1 - anchorNdc.y) / 2) * viewH;
      } else {
        promptAnchor.key = null;
      }

      // room finishes itself around an inside camera: front wall + ceiling
      // appear in first-person / chase, hide in follow (open dollhouse)
      env.setEnclosure(viewState.mode !== 0);
      renderer.render(scene, camera);
    };

    const origOnNear = cbRef.current.onNear;
    cbRef.current.onNear = (id, name) => {
      nearIdRef.current = id;
      origOnNear(id, name);
    };

    // room rebuild polling (admin edits arrive via props) + tv/scoreboard tick
    let lastRoomSig = JSON.stringify([room.frames, room.posters]);
    const roomTimer = window.setInterval(() => {
      const s = JSON.stringify([stateRef.current.room.frames, stateRef.current.room.posters]);
      if (s !== lastRoomSig) {
        lastRoomSig = s;
        rebuildFrames();
      }
      drawTv();
      drawRps();
    }, 1000);

    const onResize = () => {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      viewW = w;
      viewH = h;
    };
    window.addEventListener("resize", onResize);

    // ── zoom: mouse wheel, trackpad pinch and touch pinch share one range ──
    // (follow view only — head-cam and chase keep their own framing)
    const setZoom = (d: number) => {
      if (viewState.mode !== 0) return;
      camDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, d));
    };
    const onWheel = (e: WheelEvent) => {
      // trackpad pinch arrives as ctrl+wheel: zoom the camera, not the page
      if (e.ctrlKey) e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      setZoom(camDist + px * (e.ctrlKey ? 0.04 : 0.008));
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // expose toss to parent via ballPhys mutation
    const doToss = () => {
      const st = stateRef.current;
      const dg = st.dodge;
      const myId = st.mySocketId;
      const carried = dg.status === "playing" ? dg.balls.find((b) => b.holderId === myId || b.id === myDodgeBall) : undefined;
      const sim = carried ? dodgeSims.get(carried.id) : undefined;
      if (carried && sim) {
        // aim assist: snap to an opponent inside a narrow cone ahead of you
        let yaw = me.facing;
        let bestScore = Infinity;
        for (const [id, p] of Object.entries(st.players)) {
          if (id === MY_ID || !dg.roster[id] || dg.roster[id].left) continue;
          const d = Math.hypot(p.x - me.x, p.z - me.z);
          if (d > AIM_RANGE || d < 0.5) continue;
          const a = Math.atan2(p.x - me.x, p.z - me.z);
          let diff = a - me.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) > AIM_CONE) continue;
          const score = Math.abs(diff) * 6 + d;
          if (score < bestScore) {
            bestScore = score;
            yaw = a;
          }
        }
        handPoint(me.x, me.y, me.z, yaw, hand, 0.6, 1.05);
        sim.body.x = hand.x;
        sim.body.y = hand.y;
        sim.body.z = hand.z;
        sim.body.vx = Math.sin(yaw) * DODGE_THROW_SPEED;
        sim.body.vz = Math.cos(yaw) * DODGE_THROW_SPEED;
        sim.body.vy = DODGE_THROW_LIFT;
        sim.live = true;
        sim.localUntil = performance.now() + 700;
        me.facing = yaw;
        myDodgeBall = null;
        noPickupUntil.set(carried.id, performance.now() + 700);
        cbRef.current.onDodgeThrow(carried.id, { ...sim.body });
        return;
      }
      if (dg.status === "playing") return;
      if (ballPhys.holderId === MY_ID || Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z) < 1.2) {
        const f = me.facing;
        ballPhys.holderId = null;
        handPoint(me.x, me.y, me.z, f, hand, 0.6, 1.0);
        ballPhys.x = hand.x;
        ballPhys.z = hand.z;
        ballPhys.y = hand.y;
        ballPhys.vx = Math.sin(f) * 5.5;
        ballPhys.vz = Math.cos(f) * 5.5;
        ballPhys.vy = 4.6;
        ballPhys.throwerId = MY_ID;
        ballPhys.thrownAt = Date.now();
        optimisticHold = false;
        tossedUntil = performance.now() + 500;
        cbRef.current.onBall({ ...ballPhys });
      }
    };
    hallToss.fn = doToss;
    (mount as unknown as { __toss?: () => void }).__toss = doToss;
    // ── canvas touch: two fingers pinch to zoom; one finger drags to steer
    // (the fallback for touch screens without the on-screen stick). A pinch
    // owns the gesture until every finger lifts, so zooming never nudges the
    // character, and a held on-screen stick always wins over a canvas drag. ──
    const touches = new Map<number, { x: number; y: number }>();
    let steerId: number | null = null;
    let steerX0 = 0;
    let steerY0 = 0;
    let steering = false;
    let pinching = false;
    let pinchSpan0 = 1;
    let pinchCam0 = camDist;
    const pinchSpan = () => {
      const [a, b] = Array.from(touches.values());
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    };
    const beginPinch = () => {
      pinching = true;
      pinchSpan0 = pinchSpan();
      pinchCam0 = camDist;
    };
    const stopCanvasSteer = () => {
      steerId = null;
      steering = false;
      if (joy.owner === "canvas") resetJoy();
    };
    const onTouchStart = (e: TouchEvent) => {
      // drop fingers whose end we never saw (element swaps, OS gestures)
      const live = new Set(Array.from(e.touches, (t) => t.identifier));
      for (const id of touches.keys()) if (!live.has(id)) touches.delete(id);
      for (const t of Array.from(e.changedTouches)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });

      if (touches.size >= 2) {
        stopCanvasSteer();
        beginPinch();
      } else if (!pinching && steerId === null) {
        const t = e.changedTouches[0];
        steerId = t.identifier;
        steerX0 = t.clientX;
        steerY0 = t.clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (pinching) {
        // fingers apart → zoom in (closer camera)
        if (touches.size >= 2) setZoom(pinchCam0 * (pinchSpan0 / pinchSpan()));
        return;
      }
      const p = steerId === null ? undefined : touches.get(steerId);
      if (!p) return;
      if (joy.owner === "stick") {
        steerId = null;
        steering = false;
        return;
      }
      const dx = p.x - steerX0;
      const dy = p.y - steerY0;
      if (!steering && Math.hypot(dx, dy) < TOUCH_STEER_DEAD) return;
      steering = true;
      joy.owner = "canvas";
      joy.active = true;
      joy.x = Math.max(-1, Math.min(1, dx / 60));
      joy.y = Math.max(-1, Math.min(1, dy / 60));
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier);
        if (t.identifier === steerId) stopCanvasSteer();
      }
      if (pinching) {
        if (touches.size >= 2) beginPinch(); // re-baseline on the remaining pair
        else if (touches.size === 0) pinching = false;
      }
    };
    // iOS Safari pinch-zooms the whole page over HUD buttons — keep it a game
    const blockPageZoom = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd);
    renderer.domElement.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("gesturestart", blockPageZoom, { passive: false });
    document.addEventListener("gesturechange", blockPageZoom, { passive: false });

    animate();

    // build the ball's "never out of reach" map while the hall is idle,
    // so the first time the ball settles never costs a frame
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warmId = idle.requestIdleCallback
      ? idle.requestIdleCallback(() => reachField(), { timeout: 2500 })
      : window.setTimeout(() => reachField(), 1200);

    return () => {
      dead = true;
      if (idle.cancelIdleCallback) idle.cancelIdleCallback(warmId);
      else window.clearTimeout(warmId);
      hallToss.fn = null;
      hallJump.fn = null;
      promptAnchor.key = null;
      resetTurbo();
      window.clearInterval(roomTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", clearKeys);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("gesturestart", blockPageZoom);
      document.removeEventListener("gesturechange", blockPageZoom);
      if (joy.owner === "canvas") resetJoy();
      env.dispose();
      for (const r of cartRigs.values()) {
        scene.remove(r.group);
        disposeCart(r);
      }
      cartRigs.clear();
      for (const sim of dodgeSims.values()) scene.remove(sim.mesh);
      for (const p of popups) scene.remove(p.sp);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mountRef} className="absolute inset-0 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:touch-none" />
  );
}
