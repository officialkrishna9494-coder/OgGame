"use client";

// ─── Cozy Hall · Three.js scene ─────────────────────────────────────────────
// Cute rounded chibi avatars + soft physics + dollhouse hall, all procedural.
// No external assets: every mesh / texture is generated so the room is fully
// data-driven from RoomConfig (admin-editable).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BallState, ContextState, GameState, PlayerState, RoomConfig, TvState } from "../lib/hall-types";
import { joyState } from "../lib/joy-state";
import { COLLIDERS, HALL_BOUNDS, SOFA_SEATS } from "../lib/room-defaults";

interface Props {
  myName: string;
  myColor: string;
  mySocketId: string;
  players: Record<string, PlayerState>;
  ball: BallState;
  room: RoomConfig;
  tv: TvState;
  game: GameState;
  onMove: (p: PlayerState) => void;
  onBall: (b: BallState) => void;
  onNear: (nearId: string | null, nearName: string | null) => void;
  onContext: (c: ContextState) => void;
  onCollect: (starId: string) => void;
  onHit: () => void;
}

const MY_ID = "me";

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

function makeEmoteSprite(emoji: string): THREE.Sprite {
  const c = document.createElement("canvas");
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

// window view — painted ON the pane so the outside stays inside the frame
function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 320;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, "#aee2ff");
  sky.addColorStop(1, "#e8f6ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, 480, 320);
  // sun + halo
  g.fillStyle = "rgba(255, 243, 176, 0.45)";
  g.beginPath();
  g.arc(110, 78, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff3b0";
  g.beginPath();
  g.arc(110, 78, 42, 0, Math.PI * 2);
  g.fill();
  // clouds
  g.fillStyle = "rgba(255,255,255,0.92)";
  const cloud = (x: number, y: number, s: number) => {
    g.beginPath();
    g.arc(x, y, 22 * s, 0, Math.PI * 2);
    g.arc(x + 24 * s, y - 8 * s, 26 * s, 0, Math.PI * 2);
    g.arc(x + 52 * s, y, 20 * s, 0, Math.PI * 2);
    g.fill();
  };
  cloud(300, 66, 1);
  cloud(185, 128, 0.7);
  // hills
  g.fillStyle = "#b5e3b5";
  g.beginPath();
  g.ellipse(120, 345, 220, 110, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#93d193";
  g.beginPath();
  g.ellipse(405, 355, 200, 100, 0, 0, Math.PI * 2);
  g.fill();
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

  return { group, body, head, armL, armR, footL, footR, label, emote: null, emoteUntil: 0, ring, walkPhase: Math.random() * 6, wasHit: false };
}

export const hallToss: { fn: null | (() => void) } = { fn: null };

export default function HallScene({ myName, myColor, mySocketId, players, ball, room, tv, game, onMove, onBall, onNear, onContext, onCollect, onHit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ players, ball, room, tv, game, myName, myColor, mySocketId });
  const cbRef = useRef({ onMove, onBall, onNear, onContext, onCollect, onHit });

  // keep the long-lived Three.js loop fed with fresh props without re-creating it
  useEffect(() => {
    stateRef.current = { players, ball, room, tv, game, myName, myColor, mySocketId };
    cbRef.current = { onMove, onBall, onNear, onContext, onCollect, onHit };
  });

  useEffect(() => {
    const mount = mountRef.current!;
    const W = mount.clientWidth || 800;
    const H = mount.clientHeight || 600;

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
    scene.fog = new THREE.Fog("#f6efe6", 36, 75);

    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 140);
    let camDist = 20;
    camera.position.set(0, 13, 16);

    // ── lights ──
    scene.add(new THREE.HemisphereLight("#fff7ea", "#d9c3a5", 0.95));
    const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    sun.position.set(10, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);
    const lampLight = new THREE.PointLight("#ffca7a", 18, 20, 2);
    lampLight.position.set(11.5, 3.4, 3.5);
    scene.add(lampLight);
    const lampLight2 = new THREE.PointLight("#ffca7a", 10, 16, 2);
    lampLight2.position.set(-12, 3.2, -6);
    scene.add(lampLight2);
    const tvGlow = new THREE.PointLight("#a0c4ff", 8, 13, 2);
    tvGlow.position.set(0, 3.4, -9.4);
    scene.add(tvGlow);

    // ── room shell · 32 × 25 ──
    const floorMat = new THREE.MeshStandardMaterial({ color: "#e9d4ae", roughness: 0.85 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 25), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // plank lines
    const plankMat = new THREE.MeshBasicMaterial({ color: "#dcc194", transparent: true, opacity: 0.55 });
    for (let i = -13; i <= 13; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 25), plankMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(i * 1.15, 0.002, 0);
      scene.add(p);
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: "#fbf5ea", roughness: 0.95 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(32, 8.5, 0.4), wallMat);
    backWall.position.set(0, 4.25, -12.6);
    backWall.receiveShadow = true;
    scene.add(backWall);
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.5, 25), wallMat);
    sideWall.position.set(16.2, 4.25, 0);
    sideWall.receiveShadow = true;
    scene.add(sideWall);
    // wainscot strip
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(32, 0.9, 0.44),
      new THREE.MeshStandardMaterial({ color: "#f0dfc6", roughness: 0.9 })
    );
    strip.position.set(0, 0.8, -12.58);
    scene.add(strip);
    // rug — big soft ellipse
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 56),
      new THREE.MeshStandardMaterial({ color: "#ffd9e2", roughness: 1 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 2.2);
    rug.receiveShadow = true;
    scene.add(rug);
    const rugInner = new THREE.Mesh(
      new THREE.CircleGeometry(4.0, 56),
      new THREE.MeshStandardMaterial({ color: "#fff3f6", roughness: 1 })
    );
    rugInner.rotation.x = -Math.PI / 2;
    rugInner.position.set(0, 0.015, 2.2);
    rugInner.receiveShadow = true;
    scene.add(rugInner);

    // window on back wall — kept clear of the memory-frame gallery (x ≥ -11)
    const winFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.4, 0.16),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 })
    );
    winFrame.position.set(-13.6, 5.4, -12.35);
    scene.add(winFrame);
    // the outside, painted on the pane — clipped by the frame by construction
    const winView = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 2.0),
      new THREE.MeshBasicMaterial({ map: windowTexture() })
    );
    winView.position.set(-13.6, 5.4, -12.25);
    scene.add(winView);
    // crossbars sell the "window" read
    const barMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.0, 0.04), barMat);
    barV.position.set(-13.6, 5.4, -12.23);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.09, 0.04), barMat);
    barH.position.set(-13.6, 5.4, -12.23);
    scene.add(barV, barH);

    // ── sofa (all rounded, seats five) ──
    const sofa = new THREE.Group();
    const sofaMat = new THREE.MeshStandardMaterial({ color: "#a0c4ff", roughness: 0.8 });
    const sofaDark = new THREE.MeshStandardMaterial({ color: "#8ab0f5", roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.7, 1.4), sofaMat);
    base.position.y = 0.55;
    base.castShadow = base.receiveShadow = true;
    sofa.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 0.4), sofaMat);
    back.position.set(0, 1.2, 0.62);
    back.castShadow = true;
    sofa.add(back);
    for (const sx of [-2.7, 2.7]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 6, 14), sofaDark);
      arm.position.set(sx, 0.85, 0);
      arm.castShadow = true;
      sofa.add(arm);
    }
    for (const sx of [-1.95, -0.65, 0.65, 1.95]) {
      const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), new THREE.MeshStandardMaterial({ color: "#c3d5fd", roughness: 0.9 }));
      cushion.scale.set(1.05, 0.55, 0.95);
      cushion.position.set(sx, 0.95, -0.05);
      cushion.castShadow = true;
      sofa.add(cushion);
    }
    for (const [lx, lz] of [[-2.5, -0.5], [2.5, -0.5], [-2.5, 0.5], [2.5, 0.5]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.25, 10), new THREE.MeshStandardMaterial({ color: "#8a6f55" }));
      leg.position.set(lx, 0.12, lz);
      sofa.add(leg);
    }
    sofa.position.set(0, 0, 5.5);
    scene.add(sofa);

    // coffee table
    const table = new THREE.Group();
    const tableTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: "#fffaf0", roughness: 0.5 })
    );
    tableTop.position.y = 0.55;
    tableTop.castShadow = tableTop.receiveShadow = true;
    table.add(tableTop);
    const tableLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: "#c9a876", roughness: 0.7 })
    );
    tableLeg.position.y = 0.26;
    table.add(tableLeg);
    // tiny books + cocoa
    const book1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.4), new THREE.MeshStandardMaterial({ color: "#ff8fab" }));
    book1.position.set(-0.4, 0.65, 0.15);
    book1.rotation.y = 0.4;
    const book2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.38), new THREE.MeshStandardMaterial({ color: "#9bf6ff" }));
    book2.position.set(-0.38, 0.72, 0.12);
    book2.rotation.y = 0.25;
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.18, 14), new THREE.MeshStandardMaterial({ color: "#ff9770" }));
    mug.position.set(0.55, 0.7, -0.25);
    table.add(book1, book2, mug);
    table.position.set(0, 0, 3.0);
    scene.add(table);

    // ── TV wall ──
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.6, 0.9),
      new THREE.MeshStandardMaterial({ color: "#7d6b8a", roughness: 0.7 })
    );
    stand.position.set(0, 0.3, -10.8);
    stand.castShadow = stand.receiveShadow = true;
    scene.add(stand);
    const tvBody = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 2.9, 0.2),
      new THREE.MeshStandardMaterial({ color: "#2b2430", roughness: 0.4 })
    );
    tvBody.position.set(0, 3.1, -11.2);
    tvBody.castShadow = true;
    scene.add(tvBody);
    const tvCanvas = document.createElement("canvas");
    tvCanvas.width = 512;
    tvCanvas.height = 288;
    const tvTex = new THREE.CanvasTexture(tvCanvas);
    tvTex.colorSpace = THREE.SRGBColorSpace;
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6), new THREE.MeshBasicMaterial({ map: tvTex }));
    tvScreen.position.set(0, 3.1, -11.08);
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
      g.fillText(tvState.playing ? "▶  NOW PLAYING" : "❚❚  PAUSED", 256, 70);
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
      g.fillStyle = "#ffd166";
      g.fillText(`${tvState.playing ? "▶" : "❚❚"} ${mm} · synced`, 256, 218);
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
        g.position.set(...f.position);
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
        g.position.set(...p.position);
        g.rotation.y = -Math.PI / 2;
        frameGroup.add(g);
      }
    };
    rebuildFrames();

    // lamps (two, for the long room)
    const makeLamp = () => {
      const lampGrp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.4, 10), new THREE.MeshStandardMaterial({ color: "#8a6f55" }));
      pole.position.y = 1.2;
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 0.75, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: "#ffe3b3", emissive: "#ffbe6b", emissiveIntensity: 0.7, side: THREE.DoubleSide })
      );
      shade.position.y = 2.55;
      lampGrp.add(pole, shade);
      lampGrp.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      return lampGrp;
    };
    const lampA = makeLamp();
    lampA.position.set(11.5, 0, 3.5);
    scene.add(lampA);
    const lampB = makeLamp();
    lampB.position.set(-12, 0, -6);
    scene.add(lampB);

    const plantAt = (x: number, z: number) => {
      const grp = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.6, 16), new THREE.MeshStandardMaterial({ color: "#e07a5f", roughness: 0.8 }));
      pot.position.y = 0.3;
      pot.castShadow = true;
      grp.add(pot);
      const leafMat = new THREE.MeshStandardMaterial({ color: "#6a9f6b", roughness: 0.8 });
      const blobs: Array<[number, number, number, number]> = [[0, 1.2, 0, 0.55], [-0.32, 0.92, 0.12, 0.4], [0.32, 0.98, -0.12, 0.42]];
      for (const [lx, ly, lz, r] of blobs) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), leafMat);
        b.position.set(lx, ly, lz);
        b.castShadow = true;
        grp.add(b);
      }
      grp.position.set(x, 0, z);
      scene.add(grp);
    };
    plantAt(-12.5, 3.5);
    plantAt(11.5, -9.5);
    plantAt(-11, -9);

    // bookshelf — fills the wide back wall
    const shelf = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: "#b08d5f", roughness: 0.7 });
    const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.7), woodMat);
    shelfBody.position.y = 1.8;
    shelfBody.castShadow = shelfBody.receiveShadow = true;
    shelf.add(shelfBody);
    const bookCols = ["#ff8fab", "#9bf6ff", "#ffd6a5", "#caffbf", "#bdb2ff", "#ffc6ff", "#8ce8c0"];
    for (let row = 0; row < 3; row++) {
      const y = 0.9 + row * 1.05;
      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.9, 0.5),
        new THREE.MeshStandardMaterial({ color: "#6b5844", roughness: 0.9 })
      );
      inset.position.set(0, y, 0.08);
      shelf.add(inset);
      let bx = -1.35;
      let ci = row * 2;
      while (bx < 1.25) {
        const bw = 0.16 + ((ci * 37) % 10) / 60;
        const bh = 0.62 + ((ci * 53) % 10) / 45;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, 0.4),
          new THREE.MeshStandardMaterial({ color: bookCols[ci % bookCols.length], roughness: 0.8 })
        );
        book.position.set(bx + bw / 2, y - 0.42 + bh / 2, 0.12);
        shelf.add(book);
        bx += bw + 0.035;
        ci++;
      }
    }
    shelf.position.set(8.5, 0, -11.9);
    scene.add(shelf);

    // squishy floor cushions
    const cushionAt = (x: number, z: number, color: string) => {
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.72, 20, 16),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
      );
      c.scale.set(1, 0.42, 1);
      c.position.set(x, 0.3, z);
      c.castShadow = c.receiveShadow = true;
      scene.add(c);
    };
    cushionAt(-4.2, 1.2, "#ffc6ff");
    cushionAt(4.2, 1.6, "#9bf6ff");
    cushionAt(7.5, 4.5, "#caffbf");

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
      x: (Math.random() - 0.5) * 10,
      z: 6 + Math.random() * 2,
      vx: 0,
      vz: 0,
      y: 0,
      vy: 0,
      facing: Math.PI,
      sitting: false,
    };
    const keys = new Set<string>();
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) || ["w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
      }
      if (down) keys.add(k);
      else keys.delete(k);
      if (down && k === " ") {
        if (me.y < 0.01 && !me.sitting) me.vy = 5.2;
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // joystick (mobile) — the visible Joystick UI writes here too;
    // canvas drag is the fallback so every touch can steer
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
    let lastNetBall = JSON.stringify(ballPhys);
    let lastMoveSent = 0;
    let lastMoveFlag = "";
    let nearId: string | null = null;
    let nearName: string | null = null;
    const nearIdRef = { current: null as string | null };
    let lastTvSig = "";
    let lastCtxSig = "";
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

      if (sitting) {
        // glide to nearest sofa seat
        let best = SOFA_SEATS[0];
        let bd = 1e9;
        for (const s of SOFA_SEATS) {
          const d = Math.hypot(me.x - s.x, me.z - s.z);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        me.x += (best.x - me.x) * Math.min(1, dt * 6);
        me.z += (best.z - me.z) * Math.min(1, dt * 6);
        me.vx = me.vz = 0;
        me.facing += (best.facing - me.facing) * Math.min(1, dt * 6);
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

      // gravity / jump
      me.vy -= 14 * dt;
      me.y += me.vy * dt;
      if (me.y <= 0) {
        me.y = 0;
        me.vy = 0;
      }

      // collisions
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
        }
      }
      if (held) {
        ballPhys.holderId = MY_ID;
        ballPhys.vx = ballPhys.vy = ballPhys.vz = 0;
        ballPhys.x = me.x + Math.sin(me.facing) * 0.55;
        ballPhys.z = me.z + Math.cos(me.facing) * 0.55;
        ballPhys.y = 0.85 + me.y;
      } else if (netHolder && st.players[netHolder]) {
        // friend is holding it — glide to their hand (always visible now)
        const holder = st.players[netHolder];
        ballPhys.holderId = netHolder;
        ballPhys.x += (holder.x + Math.sin(holder.facing) * 0.55 - ballPhys.x) * Math.min(1, dt * 10);
        ballPhys.z += (holder.z + Math.cos(holder.facing) * 0.55 - ballPhys.z) * Math.min(1, dt * 10);
        ballPhys.y += (0.85 - ballPhys.y) * Math.min(1, dt * 10);
      } else {
        ballPhys.holderId = null;
        ballPhys.vy -= 16 * dt;
        ballPhys.x += ballPhys.vx * dt;
        ballPhys.z += ballPhys.vz * dt;
        ballPhys.y += ballPhys.vy * dt;
        if (ballPhys.y < 0.28) {
          ballPhys.y = 0.28;
          ballPhys.vy *= -0.55;
          ballPhys.vx *= 0.8;
          ballPhys.vz *= 0.8;
          if (Math.abs(ballPhys.vy) < 0.8) ballPhys.vy = 0;
        }
        ballPhys.vx *= Math.exp(-0.6 * dt);
        ballPhys.vz *= Math.exp(-0.6 * dt);
        if (ballPhys.x < -14.4 || ballPhys.x > 14.4) ballPhys.vx *= -0.7;
        if (ballPhys.z < -11.2 || ballPhys.z > 11) ballPhys.vz *= -0.7;
        ballPhys.x = Math.max(-14.4, Math.min(14.4, ballPhys.x));
        ballPhys.z = Math.max(-11.2, Math.min(11, ballPhys.z));
        // pickup
        const d = Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z);
        const speed = Math.hypot(ballPhys.vx, ballPhys.vz);
        if (d < 0.65 && ballPhys.y < 0.9 && speed < 3 && !sitting) {
          ballPhys.holderId = MY_ID;
          ballPhys.throwerId = null;
          ballPhys.thrownAt = 0;
          optimisticHold = true;
          optimisticUntil = nowMs + 1500;
          cbRef.current.onBall({ ...ballPhys });
        }
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
        cbRef.current.onMove({
          id: MY_ID,
          name: st.myName,
          color: st.myColor,
          x: me.x,
          z: me.z,
          facing: me.facing,
          moving,
          sitting,
          jumping: me.y > 0.02,
          ...freshEmote,
          ...freshAction,
          ...freshHit,
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

      // ── contextual zones (sofa / ball / tv / game rug) ──
      // Designed to grow: future mini-games just add another zone + flag.
      const ctx: ContextState = {
        nearSofa: Math.abs(me.x) < 3.8 && Math.abs(me.z - 5.5) < 2.1,
        nearBall: Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z) < 1.7,
        holdingBall: ballPhys.holderId === MY_ID,
        nearTv: Math.hypot(me.x, me.z + 9.6) < 3.8,
        nearGame: Math.hypot(me.x, me.z - 2.2) < 3.6,
      };
      const ctxSig = `${ctx.nearSofa ? 1 : 0}${ctx.nearBall ? 1 : 0}${ctx.holdingBall ? 1 : 0}${ctx.nearTv ? 1 : 0}${ctx.nearGame ? 1 : 0}`;
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
        const baseY = (id === MY_ID ? me.y : 0) + (p.sitting ? -0.28 : 0) + bob;
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

        // emote bubble
        if (p.emote && p.emoteAt && Date.now() - p.emoteAt < 2600) {
          if (!rig.emote || rig.emoteUntil < Date.now() - 2600) {
            if (rig.emote) {
              g.remove(rig.emote);
              rig.emote.material.map?.dispose();
              rig.emote.material.dispose();
            }
            rig.emote = makeEmoteSprite(p.emote);
            rig.emote.position.y = 2.55;
            g.add(rig.emote);
            rig.emoteUntil = Date.now();
          }
          const pop = 1 + Math.sin(Math.min(1, (Date.now() - p.emoteAt) / 300) * Math.PI) * 0.25;
          rig.emote.scale.set(0.9 * pop, 0.9 * pop, 1);
          rig.emote.position.y = 2.55 + Math.sin(elapsed * 3) * 0.05;
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
        ballMesh.position.set(
          me.x + Math.sin(me.facing) * 0.55,
          0.85 + me.y,
          me.z + Math.cos(me.facing) * 0.55
        );
      } else if (renderHolder && st.players[renderHolder]) {
        // Ride the holder's INTERPOLATED rig (smoothed every frame like the
        // character itself) — never the raw 12Hz network pos. That's what
        // was making the carried ball judder on remote screens.
        const rig = rigs.get(renderHolder);
        if (rig) {
          const fx = Math.sin(rig.group.rotation.y) * 0.55;
          const fz = Math.cos(rig.group.rotation.y) * 0.55;
          ballMesh.position.set(
            rig.group.position.x + fx,
            rig.group.position.y + 0.85,
            rig.group.position.z + fz
          );
        } else {
          const h = st.players[renderHolder];
          ballMesh.position.set(
            h.x + Math.sin(h.facing) * 0.55,
            0.85,
            h.z + Math.cos(h.facing) * 0.55
          );
        }
      } else {
        ballMesh.position.set(ballPhys.x, ballPhys.y, ballPhys.z);
      }
      ballMesh.rotation.x += dt * (Math.hypot(ballPhys.vx, ballPhys.vz) * 1.6 + 0.4);
      ballMesh.rotation.z += dt * 0.5;

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

      // ── tv refresh (title changes) ──
      const tvSig = `${st.tv.index}-${st.tv.playing}-${st.room.tv.length}`;
      if (tvSig !== lastTvSig) {
        lastTvSig = tvSig;
        drawTv();
      }
      tvGlow.intensity = 8 + Math.sin(elapsed * 6) * 1 + (st.tv.playing ? 3 : 0);

      // ── camera follow: both the position AND the gaze point are damped,
      // so the frame glides instead of shaking ──
      const tx = me.x * 0.55;
      const tz = me.z * 0.55 + 2.4;
      desired.set(tx, camDist * 0.64, tz + camDist * 0.6);
      camera.position.lerp(desired, Math.min(1, dt * 4));
      lookSm.x += (tx - lookSm.x) * Math.min(1, dt * 4);
      lookSm.y += (1.0 - lookSm.y) * Math.min(1, dt * 4);
      lookSm.z += (tz - 4 - lookSm.z) * Math.min(1, dt * 4);
      camera.lookAt(lookSm);

      // lamp flicker (barely)
      lampLight.intensity = 18 + Math.sin(elapsed * 7.3) * 0.35;

      renderer.render(scene, camera);
    };

    const origOnNear = cbRef.current.onNear;
    cbRef.current.onNear = (id, name) => {
      nearIdRef.current = id;
      origOnNear(id, name);
    };

    // room rebuild polling (admin edits arrive via props) + tv readout tick
    let lastRoomSig = JSON.stringify([room.frames, room.posters]);
    const roomTimer = window.setInterval(() => {
      const s = JSON.stringify([stateRef.current.room.frames, stateRef.current.room.posters]);
      if (s !== lastRoomSig) {
        lastRoomSig = s;
        rebuildFrames();
      }
      drawTv();
    }, 1000);

    const onResize = () => {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const onWheel = (e: WheelEvent) => {
      camDist = Math.max(14, Math.min(27, camDist + e.deltaY * 0.008));
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    // expose toss to parent via ballPhys mutation
    const doToss = () => {
      if (ballPhys.holderId === MY_ID || Math.hypot(me.x - ballPhys.x, me.z - ballPhys.z) < 1.2) {
        const f = me.facing;
        ballPhys.holderId = null;
        ballPhys.x = me.x + Math.sin(f) * 0.6;
        ballPhys.z = me.z + Math.cos(f) * 0.6;
        ballPhys.y = 1.0 + me.y;
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
    // touch joystick on canvas (left half drag = move)
    let touchId: number | null = null;
    let tx0 = 0;
    let ty0 = 0;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (touchId !== null) return;
      touchId = t.identifier;
      tx0 = t.clientX;
      ty0 = t.clientY;
      joy.active = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) {
          joy.x = Math.max(-1, Math.min(1, (t.clientX - tx0) / 60));
          joy.y = Math.max(-1, Math.min(1, (t.clientY - ty0) / 60));
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) {
          touchId = null;
          joy.x = joy.y = 0;
          joy.active = false;
        }
      }
    };
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd);

    animate();

    return () => {
      dead = true;
      hallToss.fn = null;
      window.clearInterval(roomTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
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
