// Cozy hall cars. Small open-top roadsters sized to the avatars so a driver
// actually sits in them. All dimensions are in hall world units and the layout
// follows the avatar rig: the seat cushion top sits at 0.55 (exactly sofa
// height) and the seat centre sits CART_SEAT_Z behind the car's origin, so the
// rider is nudged back onto the cushion (see cartSeatOffset). Forward is +z,
// matching the facing convention used everywhere else. Geometry is cached and
// shared; the paint materials are per-car so the two keep their own colours.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface CartRig {
  group: THREE.Group;
  body: THREE.Group;
  /** wheel meshes (spin around local x) */
  wheels: THREE.Mesh[];
  /** steering pivots for the two front wheels (yaw) */
  steerPivots: THREE.Group[];
  /** cockpit steering wheel spinner — rotated by rig.steer so it reads as real driving */
  steerWheel: THREE.Group;
  /** turbo exhaust flames (outer, core, outer, core) — lit by CartPose.boost */
  flames: THREE.Mesh[];
  /** warm glow thrown by the flames while boosting */
  flameLight: THREE.PointLight;
  mats: {
    paint: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
  };
  steer: number;
  prevSpeed: number;
}

/** seat cushion top — matches the sofa perch so drivers sit correctly */
export const CART_SEAT_Y = 0.55;
/** seat centre in the car's local frame (behind the wheel = −z) */
export const CART_SEAT_Z = -0.34;
/**
 * Avatar group offset while driving. The pelvis oval bottoms out ~0.62 above
 * the avatar origin, so this drops the hips exactly onto the cushion top
 * instead of sinking the rider an inch into the foam.
 */
export const CART_RIDER_Y = CART_SEAT_Y - 0.62;

/** Wheel radius — also drives the wheel-spin rate in poseCart. */
export const CART_WHEEL_R = 0.26;
/** Axle position along z (front / rear). */
const AXLE_Z = 0.78;

/** World XZ of the seat, relative to the car origin, for a given facing. */
export function cartSeatOffset(facing: number, out: { x: number; z: number }): void {
  out.x = Math.sin(facing) * CART_SEAT_Z;
  out.z = Math.cos(facing) * CART_SEAT_Z;
}

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
  return cached(`cart-tor:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 10, 28));
}
/** open-ended cone, apex on +y — rotated to trail backwards for the flames */
function cone(r: number, h: number, seg = 14) {
  return cached(`cart-cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1, true));
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

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.16 });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.42),
    roughness: 0.55,
    metalness: 0.12,
  });
  const trim = new THREE.MeshStandardMaterial({ color: "#2b2730", roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#ded8cf", roughness: 0.22, metalness: 0.72 });
  const cushion = new THREE.MeshStandardMaterial({ color: "#332c38", roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({
    color: "#bfe0ea",
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.38,
  });
  const lamp = new THREE.MeshBasicMaterial({ color: "#fff4c9" });
  const tail = new THREE.MeshStandardMaterial({ color: "#d8434f", emissive: "#65101a", emissiveIntensity: 0.45, roughness: 0.5 });

  // ── hull (forward is +z) ───────────────────────────────────────────────
  body.add(part(rb(0.88, 0.16, 2.1, 0.06), trim, 0, 0.3, 0)); // floor pan
  body.add(part(rb(0.94, 0.4, 1.95, 0.16), paint, 0, 0.5, -0.02)); // lower shell
  body.add(part(rb(0.84, 0.2, 0.86, 0.1), paint, 0, 0.62, 0.66)); // hood
  body.add(part(rb(0.8, 0.16, 0.34, 0.07), paint, 0, 0.7, 0.34)); // cowl

  // nose + grille + headlights
  body.add(part(rb(0.9, 0.3, 0.4, 0.13), paint, 0, 0.5, 1.0));
  body.add(part(rb(0.52, 0.15, 0.06, 0.03), chrome, 0, 0.48, 1.2));
  for (const s of [-1, 1]) {
    const hl = part(rb(0.22, 0.14, 0.08, 0.05), lamp, s * 0.3, 0.58, 1.19);
    hl.castShadow = false;
    body.add(hl);
  }

  // rear deck + tail
  body.add(part(rb(0.86, 0.24, 0.72, 0.1), paint, 0, 0.6, -0.78));
  body.add(part(rb(0.9, 0.28, 0.36, 0.13), paint, 0, 0.5, -1.0));
  for (const s of [-1, 1]) body.add(part(rb(0.22, 0.12, 0.06, 0.04), tail, s * 0.3, 0.58, -1.16));
  body.add(part(rb(0.5, 0.1, 0.05, 0.03), chrome, 0, 0.42, -1.17));

  // cockpit: side sills, tub floor, dashboard
  for (const s of [-1, 1]) body.add(part(rb(0.08, 0.38, 1.2, 0.05), paint, s * 0.43, 0.64, -0.06));
  body.add(part(rb(0.78, 0.16, 1.3, 0.06), cushion, 0, 0.44, 0)); // tub floor
  body.add(part(rb(0.78, 0.24, 0.2, 0.06), trim, 0, 0.68, 0.34)); // dashboard

  // windshield + base rail
  const shield = part(rb(0.8, 0.38, 0.04, 0.02), glass, 0, 0.94, 0.52);
  shield.rotation.x = 0.4;
  shield.castShadow = false;
  body.add(shield);
  body.add(part(rb(0.84, 0.06, 0.07, 0.02), chrome, 0, 0.76, 0.58));

  // fender arches over the wheels
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.add(part(rb(0.16, 0.24, 0.66, 0.07), paint, sx * 0.45, 0.5, sz * AXLE_Z));
    }
  }

  // ── driver seat + controls ─────────────────────────────────────────────
  body.add(part(rb(0.52, 0.14, 0.5, 0.06), cushion, 0, CART_SEAT_Y - 0.07, CART_SEAT_Z));
  const back = part(rb(0.52, 0.52, 0.13, 0.06), cushion, 0, 0.78, CART_SEAT_Z - 0.28);
  back.rotation.x = -0.16;
  body.add(back);
  body.add(part(rb(0.26, 0.16, 0.1, 0.04), cushion, 0, 1.02, CART_SEAT_Z - 0.33)); // headrest
  // pedals under the driver's feet
  for (const s of [-1, 1]) body.add(part(rb(0.11, 0.04, 0.13, 0.02), chrome, s * 0.14, 0.3, -0.02));
  // steering column + wheel (reached by the seated hands)
  const column = part(cyl(0.028, 0.42), trim, 0, 0.66, 0.2);
  column.rotation.x = 0.52;
  body.add(column);
  // Cockpit wheel: an outer tilt group holds the real-world rake (-0.7 rad),
  // the inner spinner turns around the column axis with the steering input.
  // The rim alone would hide its own spin (a torus is symmetric), so a
  // horizontal spoke + hub cap ride inside the spinner to make the rotation
  // read at room scale — full lock ≈ ±110°.
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(0, 0.9, 0.12);
  wheelTilt.rotation.x = -0.7;
  body.add(wheelTilt);
  const steerWheel = new THREE.Group();
  wheelTilt.add(steerWheel);
  const rim = part(torus(0.19, 0.028), trim);
  steerWheel.add(rim);
  const spoke = part(rb(0.32, 0.045, 0.03, 0.012), trim);
  spoke.castShadow = false;
  steerWheel.add(spoke);
  const hubCap = part(cyl(0.05, 0.06), chrome);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.castShadow = false;
  steerWheel.add(hubCap);

  // wing mirrors
  for (const s of [-1, 1]) {
    body.add(part(cyl(0.018, 0.13), trim, s * 0.55, 0.84, 0.44));
    body.add(part(rb(0.13, 0.09, 0.04, 0.02), chrome, s * 0.61, 0.9, 0.44));
  }

  // ── turbo exhausts — two flames out of the rear valance ────────────────
  // Additive + depthWrite off, so they glow over the bodywork without ever
  // punching a hole in the depth buffer. Hidden until the boost blend lights
  // them (see poseCart), and scaled by the per-frame boost value.
  const flameOuter = new THREE.MeshBasicMaterial({
    color: "#ff7a18", transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flameCore = new THREE.MeshBasicMaterial({
    color: "#ffe9b0", transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flames: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    // half-length + the z the flame's base stays pinned to, so growing the
    // flame stretches it BACKWARDS instead of poking it through the bumper
    const outer = new THREE.Mesh(cone(0.21, 1.15), flameOuter);
    outer.position.set(s * 0.21, 0.42, -1.055 - 0.575);
    outer.rotation.x = -Math.PI / 2;
    outer.castShadow = false;
    outer.receiveShadow = false;
    outer.visible = false;
    outer.userData.flameBase = -1.05;
    outer.userData.flameHalf = 0.575;
    body.add(outer);
    flames.push(outer);

    const core = new THREE.Mesh(cone(0.12, 0.72), flameCore);
    core.position.set(s * 0.21, 0.42, -1.05 - 0.36);
    core.rotation.x = -Math.PI / 2;
    core.castShadow = false;
    core.receiveShadow = false;
    core.visible = false;
    core.userData.flameBase = -1.05;
    core.userData.flameHalf = 0.36;
    body.add(core);
    flames.push(core);
  }
  const flameLight = new THREE.PointLight("#ff8a2b", 0, 9, 2);
  flameLight.position.set(0, 0.55, -1.7);
  flameLight.castShadow = false;
  body.add(flameLight);

  // ── wheels — tires + hubcaps, fronts on steering pivots ────────────────
  const wheels: THREE.Mesh[] = [];
  const steerPivots: THREE.Group[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: "#26232b", roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: "#e8e0d4", roughness: 0.35, metalness: 0.35 });
  const wheelGeo = cyl(CART_WHEEL_R, 0.16);
  const hubGeo = cyl(0.12, 0.17);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.5, CART_WHEEL_R, sz * AXLE_Z);
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

  const owned = [paint, dark, trim, chrome, cushion, glass, lamp, tail, tireMat, hubMat, flameOuter, flameCore];
  group.userData.cartMats = owned;

  return { group, body, wheels, steerPivots, steerWheel, flames, flameLight, mats: { paint, dark }, steer: 0, prevSpeed: 0 };
}

export function disposeCart(rig: CartRig) {
  const owned = rig.group.userData.cartMats as THREE.Material[] | undefined;
  if (owned) for (const m of owned) m.dispose();
  else {
    rig.mats.paint.dispose();
    rig.mats.dark.dispose();
  }
}

export interface CartPose {
  /** signed speed m/s */
  speed: number;
  /** -1 (full left) … 1 (full right) */
  steer: number;
  elapsed: number;
  /** 0…1 turbo blend — lights and stretches the exhaust flames */
  boost?: number;
}

/** Spin wheels, yaw the fronts, lean the body — call once per frame. */
export function poseCart(rig: CartRig, dt: number, p: CartPose): void {
  const spin = (p.speed / CART_WHEEL_R) * dt;
  for (const w of rig.wheels) w.rotation.x += spin;
  // steer is the driver's held wheel (−1…1), already smoothed in the sim.
  // The wheel's rolling axis is +z, so a positive rotation.y would point the
  // fronts toward +x — but the car's right is −x (facing convention: 0 = +z),
  // which is why they used to slew opposite the turn. Negated to match.
  rig.steer = damp(rig.steer, p.steer, dt, 10);
  for (const pivot of rig.steerPivots) pivot.rotation.y = -rig.steer * 0.42;
  // Cockpit wheel spins with the same smoothed steer: +steer (right) reads
  // clockwise to the driver behind the rim (driver's right is −x), so the
  // spinner takes the opposite sign of the front-wheel yaw above. Full lock
  // ≈ ±1.9 rad (≈110°) like a real kart.
  rig.steerWheel.rotation.z = rig.steer * 1.9;
  // lean into corners, squat under braking, tremble softly with speed
  const grip = Math.min(1, Math.abs(p.speed) / 6);
  const accel = dt > 0 ? (p.speed - rig.prevSpeed) / dt : 0;
  rig.prevSpeed = p.speed;
  const targetRoll = -rig.steer * grip * 0.07;
  const targetPitch = Math.max(-0.03, Math.min(0.03, -accel * 0.004));
  rig.body.rotation.z = damp(rig.body.rotation.z, targetRoll, dt, 6);
  rig.body.rotation.x = damp(rig.body.rotation.x, targetPitch, dt, 6);
  rig.body.position.y = Math.abs(Math.sin(p.elapsed * 17)) * 0.008 * grip;

  // ── turbo flames — lit by the boost blend, flickering like a real exhaust.
  // Two out-of-phase sines read as an unsteady flame with no randomness (so
  // every screen shows the same fire), and the core burns shorter + paler.
  const boost = Math.max(0, Math.min(1, p.boost ?? 0));
  const lit = boost > 0.02;
  for (let i = 0; i < rig.flames.length; i++) {
    const f = rig.flames[i];
    if (f.visible !== lit) f.visible = lit;
    if (!lit) continue;
    const core = (i & 1) === 1;
    const flick = 0.74 + 0.19 * Math.sin(p.elapsed * 31 + i * 2.1) + 0.11 * Math.sin(p.elapsed * 57 + i);
    const len = boost * flick * (core ? 0.62 : 1);
    const girth = boost * (core ? 0.6 : 0.9) * (0.85 + 0.3 * flick);
    f.scale.set(girth, len, girth);
    f.position.z = (f.userData.flameBase as number) - (f.userData.flameHalf as number) * len;
    (f.material as THREE.MeshBasicMaterial).opacity = Math.min(1, boost * (core ? 0.95 : 0.75) * flick * 1.25);
  }
  rig.flameLight.intensity = lit ? boost * (6 + 3 * Math.sin(p.elapsed * 38) + 1.5 * Math.sin(p.elapsed * 71)) : 0;
}
