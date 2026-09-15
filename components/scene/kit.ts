// ─── Cozy Hall · scene building kit ─────────────────────────────────────────
// Small, shared pieces the environment is assembled from: cached materials,
// soft rounded boxes, plants that breathe, lamps that glow, steam that rises.
// Anything animated registers a `tick`; everything else gets frozen so the
// renderer skips its matrix work every frame (a big win on phones).

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { glowTexture } from "./textures";

export type Tick = (elapsed: number, dt: number) => void;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** Shared standard material by look. */
export function mat(color: string, roughness = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}|${roughness}|${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function roundedBox(w: number, h: number, d: number, radius = 0.08) {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return cachedGeo(`rb|${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
}

export function sphere(r: number, ws = 20, hs = 14) {
  return cachedGeo(`sp|${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

export function cylinder(rt: number, rb: number, h: number, seg = 20) {
  return cachedGeo(`cy|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function torus(r: number, tube: number, seg = 24) {
  return cachedGeo(`to|${r}|${tube}|${seg}`, () => new THREE.TorusGeometry(r, tube, 10, seg));
}

// Z-FIGHTING RULE for everything built with this kit: two surfaces that face
// the same way must never share a plane. Stack parts with at least 1 cm of
// daylight (or tuck one fully inside the other) — otherwise the GPU can't
// decide which is in front and the overlap shimmers as the camera moves.

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Static from here on: skip per-frame matrix updates for the whole subtree. */
export function freeze(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
}

let glowTex: THREE.Texture | null = null;
export function glowSprite(color: string, scale: number, opacity = 1) {
  glowTex ??= glowTexture();
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  sp.scale.set(scale, scale, 1);
  return sp;
}

// ─── plants ─────────────────────────────────────────────────────────────────
const POT_COLORS = ["#e07a5f", "#f2cc8f", "#81b29a", "#f4a6b8", "#9fb4d6"];
const LEAF_COLORS = ["#6a9f6b", "#5c9a72", "#7bb37a", "#4f8f63"];

/** A potted plant in one of three silhouettes; it sways a touch. */
export function plant(x: number, z: number, scale: number, variant: number): { group: THREE.Group; tick: Tick } {
  const g = new THREE.Group();
  const pot = mat(POT_COLORS[variant % POT_COLORS.length], 0.75);
  const leaf = mat(LEAF_COLORS[variant % LEAF_COLORS.length], 0.8);
  // pot body (top cap at 0.60) · soil sitting 3 cm proud of it (top 0.63) ·
  // a rolled rim hugging the lip — no two upward faces share a height, so the
  // top of the pot can't flicker between soil and clay as the camera moves
  g.add(mesh(cylinder(0.42, 0.32, 0.6, 18), pot, 0, 0.3, 0, true));
  g.add(mesh(cylinder(0.4, 0.4, 0.03, 18), mat("#6b4f3a", 1), 0, 0.615, 0));
  const rim = mesh(torus(0.42, 0.045, 24), pot, 0, 0.6, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const foliage = new THREE.Group();
  foliage.position.y = 0.6;
  if (variant % 3 === 0) {
    // round bush
    for (const [lx, ly, lz, r] of [[0, 0.62, 0, 0.55], [-0.32, 0.36, 0.12, 0.4], [0.32, 0.4, -0.12, 0.42], [0.05, 0.3, 0.3, 0.34]])
      foliage.add(mesh(sphere(r, 14, 12), leaf, lx, ly, lz, true));
  } else if (variant % 3 === 1) {
    // tall leafy (monstera-ish): stems with flattened leaves
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stem = new THREE.Group();
      stem.rotation.y = a;
      stem.rotation.z = 0.55;
      const leafM = mesh(sphere(0.3, 12, 10), leaf, 0, 0.75, 0, true);
      leafM.scale.set(1.2, 0.18, 0.8);
      stem.add(mesh(cylinder(0.02, 0.025, 0.8, 6), mat("#5a7d4f"), 0, 0.4, 0));
      stem.add(leafM);
      foliage.add(stem);
    }
  } else {
    // snake plant: tall pointed blades
    for (let i = 0; i < 7; i++) {
      const blade = mesh(new THREE.ConeGeometry(0.09, 1.1 + (i % 3) * 0.25, 8), leaf, Math.cos(i * 2.3) * 0.16, 0.55, Math.sin(i * 2.3) * 0.16, true);
      blade.scale.z = 0.35;
      blade.rotation.set(Math.sin(i) * 0.12, i, Math.cos(i) * 0.12);
      foliage.add(blade);
    }
  }
  g.add(foliage);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  const phase = (x * 7 + z * 3) % 6;
  return {
    group: g,
    tick: (t) => {
      foliage.rotation.z = Math.sin(t * 0.8 + phase) * 0.025;
      foliage.rotation.x = Math.cos(t * 0.6 + phase) * 0.02;
    },
  };
}

// ─── floor lamp ─────────────────────────────────────────────────────────────
export function floorLamp(x: number, z: number): { group: THREE.Group; tick: Tick } {
  const g = new THREE.Group();
  const brass = mat("#b08d5f", 0.45, { metalness: 0.35 });
  g.add(mesh(cylinder(0.32, 0.36, 0.06, 20), brass, 0, 0.03, 0));
  g.add(mesh(cylinder(0.035, 0.05, 2.4, 10), brass, 0, 1.2, 0, true));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.7, 0.75, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: "#ffe3b3", emissive: "#ffbe6b", emissiveIntensity: 0.75, side: THREE.DoubleSide, roughness: 0.9 })
  );
  shade.position.y = 2.55;
  shade.castShadow = true;
  g.add(shade);
  const glow = glowSprite("#ffcf8a", 1.9, 0.55);
  glow.position.y = 2.25;
  g.add(glow);
  g.position.set(x, 0, z);
  const phase = x + z;
  return {
    group: g,
    tick: (t) => {
      glow.material.opacity = 0.5 + Math.sin(t * 2.1 + phase) * 0.04;
    },
  };
}

// ─── steam ──────────────────────────────────────────────────────────────────
/** Lazy wisps rising from a cup or machine. */
export function steam(x: number, y: number, z: number, count = 5, size = 0.35): { group: THREE.Group; tick: Tick } {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const puffs = Array.from({ length: count }, (_, i) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: (glowTex ??= glowTexture()), color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })
    );
    g.add(sp);
    return { sp, phase: i / count };
  });
  const LIFE = 2.6;
  return {
    group: g,
    tick: (t) => {
      for (const p of puffs) {
        const k = ((t / LIFE + p.phase) % 1 + 1) % 1; // 0 → 1
        p.sp.position.set(Math.sin((t + p.phase * 9) * 1.3) * 0.06, k * 0.9, Math.cos((t + p.phase * 7) * 1.1) * 0.05);
        const s = size * (0.4 + k * 1.1);
        p.sp.scale.set(s, s, 1);
        p.sp.material.opacity = Math.sin(k * Math.PI) * 0.33;
      }
    },
  };
}
