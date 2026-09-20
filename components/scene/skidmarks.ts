// ─── Cozy Hall · turbo tire marks ────────────────────────────────────────────
// Short-lived burnout streaks laid by the rear tires while a kart boosts.
// Each mark is a small dark quad pinned to the ground where the tire was;
// the whole trail fades out over ~2.5 s so the floor never fills up.
//
// Usage (per frame, per cart):
//   skids.lay(cartId, x, z, groundY, facing, laying) // laying = boosting && fast && grounded
//   skids.update(dt)                                 // ages + fades every mark
//
// Marks connect last→current wheel positions (not the car's facing), so
// curves paint smooth ribbons instead of stamped dashes. Geometry is shared,
// materials are per-mark clones (individual opacity), capped so two boosting
// karts can never leak meshes.
import * as THREE from "three";

/** rear-axle layout — must match carts.ts (axle z, track half-width) */
const REAR_Z = -0.78;
const TRACK_X = 0.5;
/** drop a segment once a tire rolled this far — dense enough to overlap */
const SPACING = 0.28;
/** full-strength opacity, then linear fade to 0 over LIFE — kept subtle like real rubber */
const MARK_OPACITY = 0.3;
const MARK_WIDTH = 0.24;
const LIFE = 2.6;

interface Mark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
}

export class TurboSkids {
  private scene: THREE.Scene;
  private geo: THREE.PlaneGeometry;
  private marks: Mark[] = [];
  /** last stamped rear-tire XZ per cart (both wheels share the centre stamp) */
  private last = new Map<string, { x: number; z: number }>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // unit-length ribbon along +z, baked flat so scale.z stretches length
    this.geo = new THREE.PlaneGeometry(MARK_WIDTH, 1);
    this.geo.rotateX(-Math.PI / 2);
  }

  /**
   * Stamp rear-tire streaks for one cart.
   * @param groundY cart base height (0 on the floor, deck top on the bridge)
   * @param laying false while parked / slow / airborne — clears the anchor so
   *   the next burnout starts clean instead of drawing a long connector
   */
  lay(id: string, x: number, z: number, groundY: number, facing: number, laying: boolean): void {
    if (!laying) {
      this.last.delete(id);
      return;
    }
    // rear-axle centre in world space (both tires stamp around it)
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const cx = x + fx * REAR_Z;
    const cz = z + fz * REAR_Z;
    const prev = this.last.get(id);
    if (!prev) {
      this.last.set(id, { x: cx, z: cz });
      // anchor only — the first real segment lands on the next frame
      this.stamp(cx, cz, cx, cz, groundY, facing);
      return;
    }
    const dx = cx - prev.x;
    const dz = cz - prev.z;
    if (dx * dx + dz * dz < SPACING * SPACING) return;
    this.stamp(prev.x, prev.z, cx, cz, groundY, facing);
    this.last.set(id, { x: cx, z: cz });
  }

  /** one quad per rear tire, from last centre to current centre */
  private stamp(x0: number, z0: number, x1: number, z1: number, groundY: number, facing: number): void {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const segLen = Math.hypot(x1 - x0, z1 - z0);
    // segment heading keeps curves smooth; fall back to the car's nose for
    // the anchor dot (zero-length) on the first frame
    const heading = segLen > 1e-4 ? Math.atan2(x1 - x0, z1 - z0) : facing;
    const len = Math.max(0.32, segLen + 0.3);
    // car's right is −x (facing 0 = +z), so the lateral axis is
    // (cos f, −sin f) — offset each tire along it from the centre line
    const rx = Math.cos(facing);
    const rz = -Math.sin(facing);
    for (const s of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({
        color: "#4a4453",
        transparent: true,
        opacity: MARK_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.set(mx + rx * TRACK_X * s, groundY + 0.03, mz + rz * TRACK_X * s);
      mesh.rotation.y = heading;
      mesh.scale.set(1, 1, len);
      mesh.renderOrder = 2;
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.scene.add(mesh);
      this.marks.push({ mesh, mat, age: 0 });
    }
    // hard cap — two full-throttle karts mint ~65/s; drop the oldest first
    while (this.marks.length > 240) {
      const old = this.marks.shift()!;
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
  }

  /** age every mark, fade it out, drop it at LIFE — call once per frame */
  update(dt: number): void {
    if (this.marks.length === 0) return;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.age += dt;
      if (m.age >= LIFE) {
        this.scene.remove(m.mesh);
        m.mat.dispose();
        this.marks.splice(i, 1);
        continue;
      }
      m.mat.opacity = MARK_OPACITY * (1 - m.age / LIFE);
    }
  }

  dispose(): void {
    for (const m of this.marks) {
      this.scene.remove(m.mesh);
      m.mat.dispose();
    }
    this.marks.length = 0;
    this.last.clear();
    this.geo.dispose();
  }
}
