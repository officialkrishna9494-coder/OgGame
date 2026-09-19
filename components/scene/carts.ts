// Cozy hall go-karts. All dimensions are in hall world units and sized to the
// avatar rigs: the seat cushion top sits at 0.55, exactly sofa height, so a
// driver reuses the perched-seat math (avatar group y ≈ -0.085, feet forward
// onto the footrest). Geometry is cached and shared; paint materials are
// per-cart so the two karts keep their own colors.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface CartRig {
  group: THREE.Group;
  body: THREE.Group;
  /** wheel meshes (spin around local x) */
  wheels: THREE.Mesh[];
  /** steering pivots for the two front wheels (yaw) */
  steerPivots: THREE.Group[];
  mats: {
    paint: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
  };
  steer: number;
  prevSpeed: number;
}

/** seat cushion top — matches the sofa perch so drivers sit correctly */
export const CART_SEAT_Y = 0.55;
/** avatar group offset while driving (same recipe as the sofa perch) */
export const CART_RIDER_Y = CART_SEAT_Y - 0.635;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, create: () => THREE.BufferGeometry) {
  let geometry = geoCache.get(key);
  if (!geometry) {
    geometry = create();
    geoCache.set(key, geometry);
  }
  return geometry;
}
function rb(w: number, h: number, d: number, radius = 0.05) {
  return cached(
    `cart-box:${w}:${h}:${d}:${radius}`,
    () =>
      new RoundedBoxGeometry(
        w,
        h,
        d,
        3,
        Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
      )
  );
}
function cyl(r: number, h: number, seg = 20) {
  return cached(`cart-cyl:${r}:${h}:${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg));
}
function torus(r: number, tube: number) {
  return cached(`cart-tor:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 10, 24));
}
function sphere(r: number) {
  return cached(`cart-sph:${r}`, () => new THREE.SphereGeometry(r, 16, 12));
}
function part(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function damp(cur: number, target: number, dt: number, rate = 8): number {
  return cur + (target - cur) * Math.min(1, dt * rate);
}

export function buildCart(color: string): CartRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: "#3b3034", roughness: 0.55 });
  const cushion = new THREE.MeshStandardMaterial({ color: "#2e2833", roughness: 0.85 });
  const lampMat = new THREE.MeshBasicMaterial({ color: "#fff3c4" });

  // floor pan + side pods + nose — forward is +z (matches facing convention)
  body.add(part(rb(0.95, 0.16, 1.7, 0.06), trim, 0, 0.32, 0));
  body.add(part(rb(1.15, 0.3, 1.5, 0.12), paint, 0, 0.48, -0.05));
  const nose = part(rb(0.85, 0.24, 0.55, 0.1), paint, 0, 0.5, 0.95);
  nose.rotation.x = 0.1;
  body.add(nose);
  // front bumper + headlights
  body.add(part(rb(1.0, 0.14, 0.14, 0.06), dark, 0, 0.42, 1.22));
  for (const side of [-1, 1]) {
    const lamp = part(sphere(0.07), lampMat, side * 0.3, 0.56, 1.16);
    lamp.castShadow = false;
    body.add(lamp);
  }
  // seat cushion + backrest (cushion top lands exactly on CART_SEAT_Y)
  body.add(part(rb(0.62, 0.12, 0.55, 0.05), cushion, 0, CART_SEAT_Y - 0.06, -0.28));
  const back = part(rb(0.62, 0.55, 0.12, 0.05), cushion, 0, 0.82, -0.58);
  back.rotation.x = -0.22;
  body.add(back);
  // footrest where the driver's shoes land
  body.add(part(rb(0.6, 0.08, 0.4, 0.03), trim, 0, 0.33, 0.55));
  // steering column + wheel
  const column = part(cyl(0.035, 0.5), trim, 0, 0.72, 0.42);
  column.rotation.x = 0.5;
  body.add(column);
  const wheel = part(torus(0.16, 0.035), trim, 0, 0.88, 0.3);
  wheel.rotation.x = -0.9;
  body.add(wheel);
  // rear bar
  body.add(part(rb(0.9, 0.12, 0.12, 0.05), dark, 0, 0.55, -0.92));

  // wheels — tires + hubcaps, fronts on steering pivots
  const wheels: THREE.Mesh[] = [];
  const steerPivots: THREE.Group[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: "#26232b", roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: "#e8e0d4", roughness: 0.4, metalness: 0.25 });
  const wheelGeo = cyl(0.24, 0.18);
  const hubGeo = cyl(0.11, 0.19);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.62, 0.24, sz * 0.62);
    const tire = part(wheelGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    const hub = part(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = false;
    pivot.add(tire, hub);
    group.add(pivot);
    wheels.push(tire, hub);
    if (sz === 1) steerPivots.push(pivot);
  }

  return { group, body, wheels, steerPivots, mats: { paint, dark }, steer: 0, prevSpeed: 0 };
}

export function disposeCart(rig: CartRig) {
  rig.mats.paint.dispose();
  rig.mats.dark.dispose();
}

export interface CartPose {
  /** signed speed m/s */
  speed: number;
  /** -1 (full left) … 1 (full right) */
  steer: number;
  elapsed: number;
}

/** Spin wheels, yaw the fronts, lean the body — call once per frame. */
export function poseCart(rig: CartRig, dt: number, p: CartPose): void {
  const spin = (p.speed / 0.24) * dt;
  for (const w of rig.wheels) w.rotation.x += spin;
  // steer is the driver's held wheel (−1…1), already smoothed in the sim
  rig.steer = damp(rig.steer, p.steer, dt, 10);
  for (const pivot of rig.steerPivots) pivot.rotation.y = rig.steer * 0.42;
  // lean into corners, squat under braking, tremble softly with speed
  const grip = Math.min(1, Math.abs(p.speed) / 6);
  const accel = dt > 0 ? (p.speed - rig.prevSpeed) / dt : 0;
  rig.prevSpeed = p.speed;
  const targetRoll = -rig.steer * grip * 0.07;
  const targetPitch = Math.max(-0.03, Math.min(0.03, -accel * 0.004));
  rig.body.rotation.z = damp(rig.body.rotation.z, targetRoll, dt, 6);
  rig.body.rotation.x = damp(rig.body.rotation.x, targetPitch, dt, 6);
  rig.body.position.y = Math.abs(Math.sin(p.elapsed * 17)) * 0.008 * grip;
}
