"use client";

// ─── Cozy Hall · Three.js scene ─────────────────────────────────────────────
// Cute rounded chibi avatars + soft physics + dollhouse hall, all procedural.
// No external assets: every mesh / texture is generated so the room is fully
// data-driven from RoomConfig (admin-editable).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BallState, ContextState, DodgeState, GameState, PlayerState, RoomConfig, RpsState, SosState, TvState } from "../lib/hall-types";
import { DODGE_LIVE_MS, DODGE_SHIELD_MS, IDLE_CONTEXT } from "../lib/hall-types";
import { ejectBall, handPoint, PICKUP_RADIUS, reachField, stepBall, TOUCH_FLOOR, TOUCH_SOLID, TOUCH_WALL } from "../lib/ball-physics";
import { HALL, RPS_SPOT, SOS_SPOT, SPAWN, TV, WALL_ART, ZONES, inCourt } from "../lib/hall-layout";
import { buildEnvironment, type CourtMode } from "./scene/environment";
import { drawIcon, drawIconText, type CanvasIcon } from "../lib/canvas-icons";
import { actionAnchor, actionKey, promptAnchor } from "../lib/interaction";
import { joyState, resetJoy } from "../lib/joy-state";
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
  mySocketId: string;
  players: Record<string, PlayerState>;
  ball: BallState;
  room: RoomConfig;
  tv: TvState;
  game: GameState;
  rps: RpsState;
  sos: SosState | null;
  dodge: DodgeState;
  serverOffset: number;
  onMove: (p: PlayerState) => void;
  onBall: (b: BallState) => void;
  onNear: (nearId: string | null, nearName: string | null) => void;
  onContext: (c: ContextState) => void;
  onCollect: (starId: string) => void;
  onHit: () => void;
  onDodgePickup: (ballId: string) => void;
  onDodgeThrow: (ballId: string, b: DodgeThrow) => void;
  onDodgeSpend: (ballId: string, rev: number) => void;
  onDodgeHit: (ballId: string, b: { x: number; y: number; z: number; vx: number; vz: number }) => void;
}

const MY_ID = "me";
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

const HIT_RED = new THREE.Color("#ff5d5d");

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
  body: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  footL: THREE.Mesh;
  footR: THREE.Mesh;
  label: THREE.Sprite;
  emote: THREE.Sprite | null;
  emoteUntil: number;
  chat: THREE.Sprite | null;
  chatText: string;
  ring: THREE.Mesh;
  walkPhase: number;
  // dodgeball: true while the red-flash stunt is showing (skips recolor)
  wasHit: boolean;
}

function createAvatar(color: string, name: string): AvatarRig {  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.82),
    roughness: 0.6,
  });
  const cream = new THREE.MeshStandardMaterial({ color: "#fff6ea", roughness: 0.7 });

  // body — chubby capsule
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.42, 8, 20), mat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  // belly patch
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), cream);
  belly.scale.set(1, 1.15, 0.55);
  belly.position.set(0, 0.58, 0.24);
  group.add(belly);

  // head — big squishy sphere
  const head = new THREE.Group();
  head.position.y = 1.28;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 22), mat);
  skull.castShadow = true;
  head.add(skull);
  // ears
  const earGeo = new THREE.SphereGeometry(0.11, 14, 12);
  const earL = new THREE.Mesh(earGeo, mat);
  earL.position.set(-0.32, 0.12, 0);
  const earR = new THREE.Mesh(earGeo, mat);
  earR.position.set(0.32, 0.12, 0);
  head.add(earL, earR);
  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.055, 12, 10);
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#2b2430", roughness: 0.25 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.13, 0.02, 0.32);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.13, 0.02, 0.32);
  const hlGeo = new THREE.SphereGeometry(0.018, 8, 8);
  const hlMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const hlL = new THREE.Mesh(hlGeo, hlMat);
  hlL.position.set(-0.11, 0.04, 0.37);
  const hlR = new THREE.Mesh(hlGeo, hlMat);
  hlR.position.set(0.15, 0.04, 0.37);
  // blush
  const blushMat = new THREE.MeshBasicMaterial({ color: "#ff8fab", transparent: true, opacity: 0.55 });
  const blushGeo = new THREE.SphereGeometry(0.045, 10, 8);
  const bL = new THREE.Mesh(blushGeo, blushMat);
  bL.scale.set(1, 0.6, 0.4);
  bL.position.set(-0.22, -0.08, 0.3);
  const bR = new THREE.Mesh(blushGeo, blushMat);
  bR.scale.set(1, 0.6, 0.4);
  bR.position.set(0.22, -0.08, 0.3);
  // smile
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI),
    new THREE.MeshBasicMaterial({ color: "#5b4a5e" })
  );
  smile.position.set(0, -0.06, 0.33);
  smile.rotation.z = Math.PI;
  head.add(eyeL, eyeR, hlL, hlR, bL, bR, smile);
  group.add(head);

  // arms — tiny capsules that swing
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.28, 6, 12);
  const armL = new THREE.Mesh(armGeo, dark);
  armL.position.set(-0.42, 0.72, 0);
  armL.castShadow = true;
  const armR = new THREE.Mesh(armGeo, dark);
  armR.position.set(0.42, 0.72, 0);
  armR.castShadow = true;
  group.add(armL, armR);

  // feet — rounded nubs
  const footGeo = new THREE.SphereGeometry(0.13, 14, 12);
  const footL = new THREE.Mesh(footGeo, dark);
  footL.scale.set(1, 0.7, 1.3);
  footL.position.set(-0.16, 0.1, 0.06);
  const footR = new THREE.Mesh(footGeo, dark);
  footR.scale.set(1, 0.7, 1.3);
  footR.position.set(0.16, 0.1, 0.06);
  group.add(footL, footR);

  // tuft
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), cream);
  tuft.position.set(0, 0.38, 0);
  head.add(tuft);

  const label = makeLabel(name);
  label.position.y = 2.0;
  group.add(label);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.045, 10, 28),
    new THREE.MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  return { group, body, head, armL, armR, footL, footR, label, emote: null, emoteUntil: 0, chat: null, chatText: "", ring, walkPhase: Math.random() * 6, wasHit: false };
}

// shortest-path angle lerp (stops the sit-down 360° spin)
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const hallToss: { fn: null | (() => void) } = { fn: null };

export default function HallScene({ myName, myColor, mySocketId, players, ball, room, tv, game, rps, sos, dodge, serverOffset, onMove, onBall, onNear, onContext, onCollect, onHit, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ players, ball, room, tv, game, rps, sos, dodge, serverOffset, myName, myColor, mySocketId });
  const cbRef = useRef({ onMove, onBall, onNear, onContext, onCollect, onHit, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit });

  // keep the long-lived Three.js loop fed with fresh props without re-creating it
  useEffect(() => {
    stateRef.current = { players, ball, room, tv, game, rps, sos, dodge, serverOffset, myName, myColor, mySocketId };
    cbRef.current = { onMove, onBall, onNear, onContext, onCollect, onHit, onDodgePickup, onDodgeThrow, onDodgeSpend, onDodgeHit };
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

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 140);
    let camDist = 20;
    camera.position.set(0, 13, 16);

    // ── lights ──
    scene.add(new THREE.HemisphereLight("#fff7ea", "#d9c3a5", 0.95));
    const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    sun.position.set(10, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // the shadow frustum follows the camera's gaze (see the render loop), so a
    // hall twice the size keeps the same crisp shadows
    sun.shadow.camera.left = -19;
    sun.shadow.camera.right = 19;
    sun.shadow.camera.top = 19;
    sun.shadow.camera.bottom = -19;
    sun.shadow.camera.far = 60;
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
    felt.position.y = 0.855;
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
    const getRig = (id: string, p: PlayerState) => {
      let r = rigs.get(id);
      if (!r) {
        r = createAvatar(p.color, p.name);
        rigs.set(id, r);
        scene.add(r.group);
      }
      // recolor / rename if changed (never mid bonk-flash — that restores itself)
      if (!r.wasHit && (r.body.material as THREE.MeshStandardMaterial).color.getStyle() !== new THREE.Color(p.color).getStyle()) {
        (r.body.material as THREE.MeshStandardMaterial).color.set(p.color);
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
    };
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
      if (isTypingTarget(e)) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) || ["w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
      }
      keys.add(k);
      if (k === " ") {
        if (me.y < 0.01 && !me.sitting) me.vy = 5.2;
      }
    };
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
      const len = Math.hypot(ix, iz);
      if (len > 1) {
        ix /= len;
        iz /= len;
      }
      const sitting = st.players[MY_ID]?.sitting ?? me.sitting;
      const sofaMode = sitting && st.players[MY_ID]?.seatMode === "sofa";
      let mySeat = st.players[MY_ID]?.seat ?? null;

      if (sitting) {
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

      // gravity / jump — skipped while sitting so gravity never fights
      // the seat glide (that fight was the perched "jumping" jitter)
      if (!sitting) {
        me.vy -= 14 * dt;
        me.y += me.vy * dt;
        if (me.y <= 0) {
          me.y = 0;
          me.vy = 0;
        }
      } else {
        me.vy = 0;
      }

      // collisions — skipped while sitting (perched sitters rest ON furniture)
      if (!sitting) {
        for (const c of COLLIDERS) {
          const r = resolveCircleAABB(me.x, me.z, 0.38, c);
          me.x = r.x;
          me.z = r.z;
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
      const moving = Math.hypot(me.vx, me.vz) > 0.35;
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
          x: me.x,
          z: me.z,
          facing: me.facing,
          moving,
          sitting,
          seat: mySeat,
          seatMode: sofaMode ? "sofa" : null,
          jumping: me.y > 0.02,
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
      };
      lastCtx = ctx;
      const ctxSig = [ctx.nearSofa, ctx.nearBall, ctx.holdingBall, ctx.nearTv, ctx.nearGame, ctx.nearRps, ctx.nearEmergency, ctx.nearDodgePad, ctx.holdingDodge]
        .map((v) => (v ? 1 : 0))
        .join("");
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
        if (id === MY_ID) {
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
        const speed = id === MY_ID ? Math.hypot(me.vx, me.vz) : p.moving ? 3 : 0;
        const walking = id === MY_ID ? speed > 0.4 : p.moving;
        rig.walkPhase += dt * (walking ? 11 : 2);
        const bob = walking ? Math.abs(Math.sin(rig.walkPhase)) * 0.09 : Math.sin(elapsed * 2 + rig.walkPhase) * 0.025;
        // floor-sitters settle down; sofa-sitters ride at seat height
        const sitDrop = p.sitting && p.seat == null ? -0.28 : 0;
        const seatY = p.sitting && p.seat != null ? (SOFA_SEATS[p.seat]?.y ?? 0.55) : 0;
        const baseY = (id === MY_ID ? me.y : seatY) + sitDrop + bob;
        g.position.y = baseY;
        // lean + squash
        const targetTilt = walking ? 0.12 : 0;
        rig.body.rotation.x += (targetTilt - rig.body.rotation.x) * Math.min(1, dt * 8);
        const squash = p.jumping || (id === MY_ID && me.y > 0.02) ? 1.08 : walking ? 1 + Math.sin(rig.walkPhase * 2) * 0.02 : 1;
        rig.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        rig.head.position.y = 1.28 + (walking ? Math.abs(Math.sin(rig.walkPhase)) * 0.03 : Math.sin(elapsed * 2) * 0.015);
        rig.head.rotation.z = walking ? Math.sin(rig.walkPhase) * 0.06 : Math.sin(elapsed * 1.4) * 0.03;
        const swing = walking ? Math.sin(rig.walkPhase) * 0.7 : Math.sin(elapsed * 2) * 0.08;
        rig.armL.rotation.x = swing;
        rig.armR.rotation.x = -swing;
        // sit pose
        const sitK = p.sitting ? 1 : 0;
        rig.footL.position.z += ((0.3 * sitK + 0.06) - rig.footL.position.z) * Math.min(1, dt * 8);
        rig.footR.position.z += ((0.3 * sitK + 0.06) - rig.footR.position.z) * Math.min(1, dt * 8);

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

        // bonk'd! — red flash + dizzy hop for 2s (self reads local stamp,
        // friends read the server echo; both restore cleanly after)
        const selfStamp = id === MY_ID ? selfHitAt : 0;
        const hitStamp = selfStamp !== 0 ? selfStamp : (p.hitAt ?? 0);
        const hitFresh = hitStamp !== 0 && Date.now() - hitStamp < 2000;
        const bodyMat = rig.body.material as THREE.MeshStandardMaterial;
        if (hitFresh) {
          const k = 1 - (Date.now() - hitStamp) / 2000; // 1 → 0
          bodyMat.color.set(p.color).lerp(HIT_RED, 0.3 + 0.7 * k);
          rig.wasHit = true;
          g.position.y += Math.abs(Math.sin(elapsed * 13)) * 0.26 * k;
          rig.head.rotation.z += Math.sin(elapsed * 18) * 0.28 * k;
          rig.head.rotation.x = Math.sin(elapsed * 15) * 0.15 * k;
        } else if (rig.wasHit) {
          bodyMat.color.set(p.color);
          rig.head.rotation.x = 0;
          rig.wasHit = false;
        }

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
          mat.opacity += ((id === nearIdRef.current ? 0.22 : 0) - mat.opacity) * Math.min(1, dt * 6);
        }
      }
      for (const [id, rig] of rigs) {
        if (!seen.has(id)) {
          scene.remove(rig.group);
          rigs.delete(id);
        }
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
      const tx = me.x * 0.72;
      const tz = me.z * 0.7 + 2.4;
      desired.set(tx, camDist * 0.64, tz + camDist * 0.6);
      camera.position.lerp(desired, Math.min(1, dt * 4));
      lookSm.x += (tx - lookSm.x) * Math.min(1, dt * 4);
      lookSm.y += (1.0 - lookSm.y) * Math.min(1, dt * 4);
      lookSm.z += (tz - 4 - lookSm.z) * Math.min(1, dt * 4);
      camera.lookAt(lookSm);
      sun.position.set(lookSm.x + 10, 16, lookSm.z + 10);
      sun.target.position.set(lookSm.x, 0, lookSm.z);
      sun.target.updateMatrixWorld();

      // ── in-world prompt: project the current action's anchor to screen ──
      const pk = actionKey(lastCtx, {
        sitting: st.players[MY_ID]?.sitting ?? me.sitting,
        gameStatus: st.game.status,
        dodgeStatus: st.dodge.status,
      });
      if (pk) {
        actionAnchor(pk, me, anchorWorld);
        anchorNdc.set(anchorWorld.x, anchorWorld.y, anchorWorld.z).project(camera);
        promptAnchor.key = pk;
        promptAnchor.visible = anchorNdc.z > -1 && anchorNdc.z < 1;
        promptAnchor.x = ((anchorNdc.x + 1) / 2) * viewW;
        promptAnchor.y = ((1 - anchorNdc.y) / 2) * viewH;
      } else {
        promptAnchor.key = null;
      }

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
    const setZoom = (d: number) => {
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
      promptAnchor.key = null;
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
