// Soft, articulated human avatars. All dimensions are in hall world units.
// A ~4-head silhouette keeps faces legible from the room camera, with connected
// shoulders, elbows, hips and knees. Geometry and neutral materials are shared.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { resolveHairstyle, type HairstyleId, type OutfitId } from "../../lib/hall-types";

export interface OutfitRig {
  id: OutfitId;
  hairstyle: HairstyleId;
  hair: THREE.Group;
  group: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  skirt: THREE.Group | null;
  /** one group per eye (sclera + iris + pupil + glint) — scaled for blinking */
  eyes: [THREE.Group, THREE.Group];
  blinkT: number;
  mats: {
    main: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    light: THREE.MeshStandardMaterial;
  };
  phase: number;
  blend: number;
  sitK: number;
  /** 0 → 1 while driving, so the limbs ease onto the wheel instead of snapping */
  driveK: number;
}

export interface OutfitPose {
  speed: number;
  moving: boolean;
  sitting: boolean;
  floorSit: boolean;
  jumping: boolean;
  /** hands on the wheel, feet on the footrest — overrides limbs below */
  driving: boolean;
  /** steering wheel held while driving (−1 left … 1 right) — weight transfer */
  steer?: number;
  action: "poke" | "highfive" | "wave" | null;
  actionAt?: number;
  elapsed: number;
  /** 1 → 0 over the 2s bonk window; drives cloth flash + wobble */
  hitK: number;
}

export const OUTFIT_LABEL_Y = 2.06;
const SKIN = "#eac09f";
const HAIR = "#392a29";
const SHIRT = "#fff8eb";
const HIT_RED = new THREE.Color("#ff3b3b");
const WHITE = new THREE.Color("#fff7ef");

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, create: () => THREE.BufferGeometry) {
  let geometry = geoCache.get(key);
  if (!geometry) { geometry = create(); geoCache.set(key, geometry); }
  return geometry;
}
function rb(w: number, h: number, d: number, radius = 0.04) {
  return cached(`box:${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
}
function sphere() { return cached("sphere", () => new THREE.SphereGeometry(1, 24, 18)); }
function capsule(r: number, length: number) {
  return cached(`capsule:${r}:${length}`, () => new THREE.CapsuleGeometry(r, length, 6, 16));
}
// Smooth continuous fabric surfaces, shaped from hem to neckline.
function silhouette(key: string, points: number[][], depth: number, pleats = 0) {
  return cached(key, () => {
    const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
    const geometry = new THREE.LatheGeometry(curve.getPoints(32), 48);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i);
      const fold = 1 + pleats * Math.cos(Math.atan2(x, z) * 12) * Math.max(0, -y / 0.44);
      positions.setXYZ(i, x * fold, y, z * depth * fold);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
}
const neutral = new Map<string, THREE.MeshStandardMaterial>();
function shared(color: string, roughness = 0.7) {
  const key = `${color}:${roughness}`;
  let material = neutral.get(key);
  if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness }); neutral.set(key, material); }
  return material;
}
function part(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function oval(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = part(sphere(), material, x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function stroke(key: string, points: number[][], radius: number) {
  return cached(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 20, radius, 6, false));
}
function panel(key: string, points: number[][]) {
  return cached(key, () => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.009, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2, steps: 1 });
  });
}
export function tintOutfit(rig: OutfitRig, color: string) {
  const c = new THREE.Color(color);
  rig.mats.main.color.copy(c);
  rig.mats.dark.color.copy(c).multiplyScalar(0.58);
  rig.mats.light.color.copy(c).lerp(WHITE, 0.32);
}
/** Only per-avatar fabric belongs to the rig; never dispose shared assets. */
export function disposeOutfit(rig: OutfitRig) {
  Object.values(rig.mats).forEach(material => material.dispose());
}

function buildFace(rig: OutfitRig) {
  const { head } = rig;
  const skin = shared(SKIN, 0.78);
  const face = cached("face", () => {
    const geometry = new THREE.SphereGeometry(1, 32, 24);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      // One surface: broad cheeks taper into a soft jaw, without a seam.
      const jaw = y < -0.2 ? 1 - (-y - 0.2) * 0.22 : 1;
      p.setXYZ(i, p.getX(i) * 0.245 * jaw, y * 0.255, p.getZ(i) * 0.211);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  head.add(part(face, skin));
  ([-1, 1] as const).forEach((side, i) => {
    const eye = rig.eyes[i];
    eye.position.set(side * 0.087, 0.016, 0.199);
    // Shallow oval eyes sit on the face, rather than protruding eyeballs.
    oval(eye, shared("#fff5e6"), 0, 0, 0, 0.043, 0.048, 0.016);
    oval(eye, shared("#49332e", 0.35), 0, -0.002, 0.012, 0.031, 0.04, 0.011);
    oval(eye, shared("#251f29", 0.28), 0, 0.001, 0.019, 0.021, 0.03, 0.007);
    oval(eye, shared("#ffffff", 0.2), -0.009, 0.015, 0.025, 0.009, 0.011, 0.004);
    head.add(eye);
    const brow = part(stroke(`brow:${side}`, [[side * 0.048, 0.085, 0.192], [side * 0.086, 0.098, 0.192], [side * 0.122, 0.088, 0.181]], 0.008), shared(HAIR));
    head.add(brow);
    const cheek = oval(head, shared("#e99e96", 0.95), side * 0.137, -0.053, 0.175, 0.037, 0.018, 0.008);
    cheek.rotation.y = side * 0.45;
    if (rig.id === "dress") {
      eye.add(part(stroke(`lash:${side}`, [[side * 0.012, 0.04, 0.005], [side * 0.037, 0.03, 0.003], [side * 0.046, 0.038, 0]], 0.006), shared(HAIR)));
    }
  });
  oval(head, skin, 0, -0.035, 0.211, 0.026, 0.026, 0.036);
  head.add(part(stroke("smile", [[-0.039, -0.087, 0.198], [0, -0.101, 0.2], [0.039, -0.087, 0.198]], 0.006), shared("#9a5952")));
}

function buildHair(rig: OutfitRig) {
  const head = rig.hair;
  const hair = shared(HAIR, 0.85);
  const cap = cached("full-hair-cap", () => {
    // A continuous shell wraps the temples, ear area and nape. Shape the
    // opening by azimuth instead of shifting half a sphere, which left gaps.
    const vertices: number[] = [], indices: number[] = [];
    const rings = 24, segments = 48;
    for (let row = 0; row <= rings; row++) {
      for (let col = 0; col <= segments; col++) {
        const phi = col / segments * Math.PI * 2;
        const front = THREE.MathUtils.clamp((Math.cos(phi) - 0.15) / 0.7, 0, 1);
        const opening = front * front * (3 - 2 * front);
        const theta = row / rings * THREE.MathUtils.lerp(2.2, 1.06, opening);
        vertices.push(0.261 * Math.sin(theta) * Math.sin(phi), 0.272 * Math.cos(theta), 0.232 * Math.sin(theta) * Math.cos(phi) - 0.006);
        if (row < rings && col < segments) {
          const a = row * (segments + 1) + col, b = a + segments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  head.add(part(cap, hair));
  if (rig.hairstyle === "swept") {
    const sweep = oval(head, hair, -0.045, 0.19, 0.125, 0.205, 0.085, 0.105);
    sweep.rotation.z = -0.23;
    const tuft = oval(head, hair, 0.078, 0.226, 0.04, 0.12, 0.077, 0.13);
    tuft.rotation.z = 0.32;
  } else if (rig.hairstyle === "textured") {
    // Broad overlapping curls form one soft silhouette, with full sides.
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2;
      oval(head, hair, Math.sin(angle) * 0.174, 0.193 + 0.013 * Math.cos(angle * 3), Math.cos(angle) * 0.144, 0.087, 0.085, 0.083);
    }
    oval(head, hair, -0.06, 0.261, 0.024, 0.107, 0.073, 0.11);
    oval(head, hair, 0.077, 0.249, -0.031, 0.107, 0.072, 0.11);
  } else if (rig.hairstyle === "curtains") {
    for (const side of [-1, 1]) {
      const fringe = oval(head, hair, side * 0.107, 0.169, 0.123, 0.139, 0.098, 0.109);
      fringe.rotation.z = side * 0.38;
      const lock = oval(head, hair, side * 0.229, -0.006, 0.048, 0.044, 0.137, 0.088);
      lock.rotation.z = side * 0.12;
    }
  } else {
    if (rig.hairstyle === "long") {
      oval(head, hair, 0, -0.14, -0.115, 0.263, 0.31, 0.16);
      for (const side of [-1, 1]) {
        const lock = oval(head, hair, side * 0.229, -0.11, 0.008, 0.064, 0.232, 0.093);
        lock.rotation.z = side * 0.09;
        oval(head, hair, side * 0.233, -0.235, -0.012, 0.065, 0.107, 0.09);
      }
    } else if (rig.hairstyle === "bob") {
      oval(head, hair, 0, -0.06, -0.1, 0.269, 0.236, 0.163);
      for (const side of [-1, 1]) {
        oval(head, hair, side * 0.233, -0.07, 0.018, 0.071, 0.179, 0.105);
      }
    } else {
      // Tied high behind the crown, then curved down toward the shoulders.
      oval(head, hair, 0, 0.113, -0.236, 0.106, 0.105, 0.107);
      const tail = oval(head, hair, 0, -0.066, -0.29, 0.104, 0.221, 0.108);
      tail.rotation.x = -0.3;
      oval(head, hair, 0, -0.247, -0.244, 0.079, 0.104, 0.085);
      for (const side of [-1, 1]) oval(head, hair, side * 0.232, -0.015, 0.04, 0.041, 0.135, 0.077);
      oval(head, rig.mats.main, 0, 0.102, -0.248, 0.112, 0.026, 0.11);
    }
    const fringe = oval(head, hair, -0.062, 0.172, 0.134, 0.173, 0.078, 0.078);
    fringe.rotation.z = -0.37;
    oval(head, hair, 0.145, 0.15, 0.096, 0.083, 0.093, 0.088);
    if (rig.hairstyle !== "ponytail") {
      for (const side of [-1, 1]) {
        const bow = oval(head, rig.mats.main, 0.212 + side * 0.034, 0.168, 0.105, 0.044, 0.03, 0.02);
        bow.rotation.z = side * 0.4;
      }
      oval(head, rig.mats.light, 0.212, 0.168, 0.124, 0.016, 0.019, 0.012);
    }
  }
}

/** Hair is independent of the body, so changing it preserves the current pose. */
export function setHairstyle(rig: OutfitRig, hairstyle: HairstyleId) {
  const next = resolveHairstyle(rig.id, hairstyle);
  if (rig.hairstyle === next) return;
  rig.hair.clear(); // All hair geometry/materials are cached or owned by the rig.
  rig.hairstyle = next;
  buildHair(rig);
}

function buildArm(rig: OutfitRig, side: -1 | 1) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * (rig.id === "suit" ? 0.246 : 0.222), 0.35, 0);
  rig.torso.add(shoulder);
  const female = rig.id === "dress";
  const skin = shared(SKIN);
  shoulder.add(part(capsule(0.076, 0.13), female ? skin : rig.mats.main, 0, -0.115, 0));
  if (female) oval(shoulder, rig.mats.main, 0, -0.045, 0, 0.098, 0.105, 0.095);
  const elbow = new THREE.Group();
  elbow.position.y = -0.24;
  shoulder.add(elbow);
  elbow.add(part(capsule(0.059, 0.14), female ? skin : rig.mats.main, 0, -0.095, 0));
  if (!female) elbow.add(part(capsule(0.06, 0.014), shared(SHIRT), 0, -0.188, 0));
  // Soft palm and a separate thumb read as hands even at room scale.
  oval(elbow, skin, 0, -0.266, 0.006, 0.058, 0.078, 0.042);
  oval(elbow, skin, -side * 0.048, -0.24, 0.027, 0.023, 0.038, 0.026);
  if (side === -1) { rig.armL = shoulder; rig.elbowL = elbow; }
  else { rig.armR = shoulder; rig.elbowR = elbow; }
}
function buildLeg(rig: OutfitRig, side: -1 | 1) {
  const female = rig.id === "dress";
  const cloth = female ? shared(SKIN) : rig.mats.dark;
  const hip = new THREE.Group();
  hip.position.set(side * 0.111, -0.035, 0);
  rig.hips.add(hip);
  hip.add(part(capsule(female ? 0.078 : 0.095, 0.17), cloth, 0, -0.14, 0));
  const knee = new THREE.Group();
  knee.position.y = -0.30;
  hip.add(knee);
  oval(knee, cloth, 0, 0, 0, female ? 0.062 : 0.084, 0.077, female ? 0.062 : 0.084);
  knee.add(part(capsule(female ? 0.062 : 0.079, 0.19), cloth, 0, -0.124, 0));
  const shoe = new THREE.Group();
  shoe.position.set(0, -0.34, 0.028);
  knee.add(shoe);
  shoe.add(part(rb(0.17, 0.035, 0.285, 0.016), shared("#ede3d6"), 0, -0.055, 0.04));
  oval(shoe, female ? rig.mats.dark : shared("#3b3034", 0.52), 0, -0.004, 0.046, 0.086, 0.073, 0.14);
  if (female) {
    shoe.add(part(rb(0.147, 0.022, 0.032, 0.01), rig.mats.light, 0, 0.057, 0.031));
    oval(shoe, shared("#d9b575", 0.4), side * 0.06, 0.053, 0.041, 0.014, 0.014, 0.012);
  } else {
    for (let i = 0; i < 2; i++) shoe.add(part(rb(0.086, 0.009, 0.014, 0.003), shared("#c6b5a2"), 0, 0.06, 0.048 + i * 0.026));
  }
  if (side === -1) { rig.legL = hip; rig.kneeL = knee; }
  else { rig.legR = hip; rig.kneeR = knee; }
}

function buildClothes(rig: OutfitRig) {
  const { torso, mats: { main, dark, light } } = rig;
  if (rig.id === "suit") {
    torso.add(part(silhouette("jacket", [[0, -0.14], [0.19, -0.14], [0.232, -0.105], [0.211, 0.1], [0.239, 0.29], [0.22, 0.375], [0.087, 0.425], [0, 0.425]], 0.63), main));
    torso.add(part(panel("shirt", [[-0.084, 0.405], [-0.065, 0.19], [0, 0.12], [0.065, 0.19], [0.084, 0.405]]), shared(SHIRT), 0, 0, 0.14));
    for (const side of [-1, 1]) {
      torso.add(part(panel(`lapel:${side}`, [[side * 0.074, 0.409], [side * 0.156, 0.349], [side * 0.122, 0.283], [side * 0.145, 0.261], [side * 0.012, 0.087]]), light, 0, 0, 0.153));
    }
    torso.add(part(panel("tie", [[-0.024, 0.327], [-0.032, 0.196], [0, 0.158], [0.032, 0.196], [0.024, 0.327]]), dark, 0, 0, 0.164));
    oval(torso, dark, 0, 0.35, 0.164, 0.03, 0.026, 0.016);
    for (const y of [0.052, -0.026]) oval(torso, shared("#d6b88b", 0.42), 0.019, y, 0.145, 0.013, 0.013, 0.009);
    torso.add(part(rb(0.066, 0.032, 0.012, 0.004), shared(SHIRT), -0.161, 0.249, 0.126));
    torso.add(part(rb(0.083, 0.017, 0.018, 0.005), dark, -0.161, 0.232, 0.133));
  } else {
    torso.add(part(silhouette("bodice", [[0, 0.055], [0.157, 0.055], [0.166, 0.14], [0.202, 0.28], [0.185, 0.365], [0.078, 0.408], [0, 0.408]], 0.72), main));
    for (const side of [-1, 1]) {
      const collar = oval(torso, shared(SHIRT), side * 0.052, 0.376, 0.1, 0.059, 0.038, 0.033);
      collar.rotation.z = side * 0.4;
    }
    for (const y of [0.29, 0.23]) oval(torso, shared("#fff1ce", 0.5), 0, y, 0.151, 0.011, 0.011, 0.008);
    const skirt = new THREE.Group();
    skirt.position.y = 0.09;
    // A single A-line dress with subtle folds and a rounded hem.
    skirt.add(part(silhouette("skirt", [[0, -0.455], [0.28, -0.455], [0.31, -0.428], [0.298, -0.37], [0.242, -0.19], [0.168, -0.015], [0.156, 0.013], [0, 0.013]], 0.78, 0.022), main));
    skirt.add(part(silhouette("hem", [[0.285, -0.454], [0.306, -0.446], [0.309, -0.427], [0.303, -0.411]], 0.78, 0.022), light));
    torso.add(skirt);
    rig.skirt = skirt;
    torso.add(part(silhouette("belt", [[0.16, 0.07], [0.169, 0.077], [0.168, 0.111], [0.162, 0.119]], 0.75), dark));
    for (const side of [-1, 1]) {
      const bow = oval(torso, light, side * 0.035, 0.099, 0.142, 0.038, 0.025, 0.019);
      bow.rotation.z = side * 0.4;
    }
    oval(torso, shared("#f5d79f", 0.4), 0, 0.099, 0.16, 0.013, 0.016, 0.009);
  }
}

export function buildOutfit(id: OutfitId, color: string, hairstyle?: HairstyleId): OutfitRig {
  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.76;
  group.add(hips);
  const torso = new THREE.Group();
  torso.position.y = 0.02;
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  const hair = new THREE.Group();
  head.add(hair);
  const rig: OutfitRig = {
    id, hairstyle: resolveHairstyle(id, hairstyle), hair, group, hips, torso, head,
    armL: new THREE.Group(), armR: new THREE.Group(),
    elbowL: new THREE.Group(), elbowR: new THREE.Group(),
    legL: new THREE.Group(), legR: new THREE.Group(),
    kneeL: new THREE.Group(), kneeR: new THREE.Group(),
    eyes: [new THREE.Group(), new THREE.Group()],
    skirt: null,
    mats: {
      main: new THREE.MeshStandardMaterial({ roughness: 0.82 }),
      dark: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      light: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    },
    phase: Math.random() * Math.PI * 2, blend: 0, sitK: 0, driveK: 0,
    blinkT: 2 + Math.random() * 3,
  };
  oval(hips, id === "suit" ? rig.mats.dark : shared(SKIN), 0, -0.015, 0, 0.19, 0.125, 0.125);
  torso.add(part(capsule(0.075, 0.105), shared(SKIN), 0, 0.47, 0));
  buildClothes(rig);
  for (const side of [-1, 1] as const) { buildArm(rig, side); buildLeg(rig, side); }
  buildFace(rig);
  buildHair(rig);
  tintOutfit(rig, color);
  return rig;
}

// ── locomotion engine ────────────────────────────────────────────────────────
function damp(cur: number, target: number, dt: number, rate = 8): number {
  return cur + (target - cur) * Math.min(1, dt * rate);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Advance the walk cycle / idle / sit / gesture pose. Call once per frame. */
export function poseOutfit(rig: OutfitRig, dt: number, o: OutfitPose): void {
  // a driver is never "walking" even though the car moves — otherwise the
  // stride cycle fights the seated pose
  const active = o.moving && !o.sitting && !o.driving && o.speed > 0.15;
  const targetBlend = active ? Math.min(1, o.speed / 3.5) : 0;
  rig.blend = damp(rig.blend, targetBlend, dt, 7);
  const b = rig.blend;
  // stride rate matched to travel speed: one full cycle ≈ 2 m, so feet plant
  // instead of skating (glide was the old tell)
  if (active) rig.phase += dt * (1.0 + 3.0 * o.speed);
  const p = rig.phase;
  const s = Math.sin(p);
  const c = Math.cos(p);

  rig.sitK = damp(rig.sitK, o.sitting ? 1 : 0, dt, 7);
  const sit = rig.sitK;
  // floor sitters fold into a deep kneel (thighs up, calves tucked under) so
  // the rigid shoes stay planted instead of spearing the boards
  const thighSit = (o.floorSit ? -1.35 : -1.22) * sit;
  const kneeSit = (o.floorSit ? 2.3 : 1.22) * sit;

  // legs — stride with knees that only ever bend backwards
  const swing = 0.5 * b * (1 - sit);
  rig.legL.rotation.x = -swing * s + thighSit;
  rig.legR.rotation.x = swing * s + thighSit;
  rig.kneeL.rotation.x = 0.8 * Math.pow(Math.max(0, c), 1.3) * b * (1 - sit) + kneeSit;
  rig.kneeR.rotation.x = 0.8 * Math.pow(Math.max(0, -c), 1.3) * b * (1 - sit) + kneeSit;

  // arms — counter-swing with a soft, always slightly bent elbow
  rig.armL.rotation.x = 0.45 * s * b * (1 - sit) - 0.18 * sit;
  rig.armR.rotation.x = -0.45 * s * b * (1 - sit) - 0.18 * sit;
  rig.armL.rotation.z = 0.12;
  rig.armR.rotation.z = -0.12;
  rig.elbowL.rotation.x = -(0.35 + 0.3 * b * Math.max(0, -s)) * (1 - sit) - 0.5 * sit;
  rig.elbowR.rotation.x = -(0.35 + 0.3 * b * Math.max(0, s)) * (1 - sit) - 0.5 * sit;

  // torso — lean into the stride, twist against the hips, breathe at rest
  rig.torso.rotation.x = 0.08 * b * (1 - sit) - 0.04 * sit + (o.jumping ? 0.1 : 0);
  rig.torso.rotation.y = 0.09 * s * b * (1 - sit);
  rig.torso.scale.y = 1 + Math.sin(o.elapsed * 2 + rig.phase) * 0.008 * (1 - b);
  rig.hips.rotation.y = -0.05 * s * b * (1 - sit);
  // idle weight shift — the standing leg alternates every ~14 s of fidgeting
  rig.hips.position.x = 0.03 * Math.sin(o.elapsed * 0.45 + rig.phase) * (1 - b) * (1 - sit);

  // head — steady gaze, gentle idle drift + slow look-around
  rig.head.rotation.y =
    -0.07 * s * b * (1 - sit) + 0.14 * Math.sin(o.elapsed * 0.37 + rig.phase * 0.3) * (1 - b) * (1 - sit);
  rig.head.rotation.z = Math.sin(o.elapsed * 1.3 + rig.phase) * 0.03 * (1 - b);
  rig.head.rotation.x = -0.05 * b * (1 - sit);

  // blink every few seconds — the cheapest life there is
  rig.blinkT -= dt;
  if (rig.blinkT <= 0) rig.blinkT = 2.2 + Math.random() * 3.2;
  const lid = rig.blinkT < 0.13 ? 0.1 : 1;
  for (const e of rig.eyes) e.scale.y += (lid - e.scale.y) * Math.min(1, dt * 40);

  // skirt sway
  if (rig.skirt) {
    rig.skirt.rotation.x = 0.08 * Math.sin(p - 0.8) * b * (1 - sit) - 0.72 * sit;
    rig.skirt.rotation.z = 0.04 * Math.sin(p * 0.5) * b;
  }

  // jump tuck — knees up, arms out
  if (o.jumping && !o.sitting && !o.driving) {
    rig.legL.rotation.x += -0.35;
    rig.legR.rotation.x += 0.2;
    rig.kneeL.rotation.x += 0.8;
    rig.kneeR.rotation.x += 0.5;
    rig.armL.rotation.x += -0.5;
    rig.armR.rotation.x += -0.5;
    rig.armL.rotation.z = 0.7;
    rig.armR.rotation.z = -0.7;
  }

  // driving — thighs forward onto the pedals, hands out to the wheel, torso
  // upright with a slight forward lean. The limbs EASE into place (driveK)
  // instead of snapping, so hopping in reads as sitting down and hopping out
  // as standing up. Blended over whatever the walk / sit pose left behind.
  rig.driveK = damp(rig.driveK, o.driving ? 1 : 0, dt, 6);
  const dk = rig.driveK;
  if (dk > 0.001) {
    const t = dk;
    rig.legL.rotation.x = lerp(rig.legL.rotation.x, -1.5, t);
    rig.legR.rotation.x = lerp(rig.legR.rotation.x, -1.5, t);
    rig.kneeL.rotation.x = lerp(rig.kneeL.rotation.x, 1.55, t);
    rig.kneeR.rotation.x = lerp(rig.kneeR.rotation.x, 1.55, t);
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, -1.15, t);
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, -1.15, t);
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, 0.2, t);
    rig.armR.rotation.z = lerp(rig.armR.rotation.z, -0.2, t);
    rig.elbowL.rotation.x = lerp(rig.elbowL.rotation.x, -0.35, t);
    rig.elbowR.rotation.x = lerp(rig.elbowR.rotation.x, -0.35, t);
    rig.torso.rotation.x = lerp(rig.torso.rotation.x, 0.17, t);
    rig.torso.rotation.y = lerp(rig.torso.rotation.y, 0, t);
    rig.hips.rotation.y = lerp(rig.hips.rotation.y, 0, t);
    rig.hips.position.x = lerp(rig.hips.position.x, 0, t);
    rig.head.rotation.x = lerp(rig.head.rotation.x, 0.02, t);
    rig.head.rotation.y = lerp(rig.head.rotation.y, (o.steer ?? 0) * 0.12, t);
    if (rig.skirt) {
      rig.skirt.rotation.x = lerp(rig.skirt.rotation.x, -0.55, t);
      rig.skirt.rotation.z = lerp(rig.skirt.rotation.z, 0, t);
    }
  }

  // gestures — high-five / wave raise the right hand, poke bows forward
  const freshAction = o.action && o.actionAt && Date.now() - o.actionAt < 1200;
  if (freshAction) {
    const k = 1 - (Date.now() - (o.actionAt ?? 0)) / 1200;
    if (o.action === "highfive" || o.action === "wave") {
      rig.armR.rotation.x += (-2.45 - rig.armR.rotation.x) * k;
      rig.elbowR.rotation.x = -0.25 * k;
      if (o.action === "wave") rig.armR.rotation.z = -0.07 - 0.3 * Math.sin(o.elapsed * 14) * k;
    } else {
      rig.torso.rotation.x += 0.3 * k;
      rig.head.rotation.x += 0.2 * k;
    }
  }

  // bonk wobble + cloth flash — emissive reads on any fabric color
  if (o.hitK > 0.003) {
    rig.torso.rotation.z = 0.16 * Math.sin(o.elapsed * 16) * o.hitK;
    rig.head.rotation.z += 0.22 * Math.sin(o.elapsed * 18) * o.hitK;
    for (const m of [rig.mats.main, rig.mats.dark, rig.mats.light]) {
      m.emissive.copy(HIT_RED).multiplyScalar(o.hitK * 0.55);
    }
  } else {
    rig.torso.rotation.z = 0;
    for (const m of [rig.mats.main, rig.mats.dark, rig.mats.light]) {
      if (m.emissiveIntensity !== 0 || m.emissive.r !== 0) m.emissive.setRGB(0, 0, 0);
    }
  }

  // steering weight transfer — applied last so the bonk wobble above can't
  // wipe it, and skipped while freshly bonked so a hit still reads clean
  if (dk > 0.001 && o.steer && o.hitK <= 0.003) {
    rig.torso.rotation.z += -o.steer * 0.06 * dk;
  }
}
