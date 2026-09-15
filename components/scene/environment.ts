// ─── Cozy Hall · the environment (everything that isn't a player or a game) ─
// Built once from lib/hall-layout: the room shell, the lounge, café corner,
// fireplace nook, dodgeball court, garden and all the little living details
// (fire, steam, drifting clouds, twinkle lights, a rocking chair, a sleeping
// cat). Returns one `tick` for animation plus the court's scoreboard hooks.

import * as THREE from "three";
import { drawIcon, drawIconText } from "../../lib/canvas-icons";
import {
  BACK_WALL_Z,
  BOOKSHELF,
  CAFE,
  COURT,
  FLOOR_LAMPS,
  GARDEN,
  HALL,
  LOUNGE,
  NOOK,
  PLANTS,
  RIGHT_WALL_X,
  courtBumpers,
} from "../../lib/hall-layout";
import type { DodgeState } from "../../lib/hall-types";
import { rankDodge } from "../../lib/hall-types";
import { cylinder, floorLamp, freeze, glowSprite, mat, mesh, plant, roundedBox, sphere, steam, type Tick } from "./kit";
import {
  chalkboardTexture,
  cloudLayerTexture,
  courtTexture,
  glowTexture,
  ovalRugTexture,
  padTexture,
  roundRugTexture,
  stoneTexture,
  windowViewTexture,
  woodFloorTexture,
} from "./textures";

export type CourtMode = "idle" | "countdown" | "playing" | "ended";

export interface Environment {
  tick: Tick;
  /** repaint the court scoreboard (cheap; call on state change + once a second) */
  drawCourtBoard: (d: DodgeState, serverNow: number, onCourt: number) => void;
  setCourtMode: (mode: CourtMode) => void;
  /** the fireplace + café lights, for the render loop's light budget */
  dispose: () => void;
}

const W = HALL.xMax - HALL.xMin;
const D = HALL.zMax - HALL.zMin;
const CX = (HALL.xMin + HALL.xMax) / 2;
const CZ = (HALL.zMin + HALL.zMax) / 2;

export function buildEnvironment(scene: THREE.Scene): Environment {
  const root = new THREE.Group();
  root.name = "environment";
  scene.add(root);
  const ticks: Tick[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  // ───────────────────────────── room shell ─────────────────────────────
  {
    const shell = new THREE.Group();
    // dollhouse base slab, so the open sides read as a finished floor edge
    shell.add(mesh(roundedBox(W + 0.8, 0.5, D + 0.8, 0.12), mat("#cdb08a", 0.9), CX + 0.2, -0.26, CZ - 0.2));
    const floorTex = woodFloorTexture(W, D);
    disposables.push(floorTex);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(CX, 0, CZ);
    floor.receiveShadow = true;
    shell.add(floor);

    const wallMat = mat("#fbf5ea", 0.95);
    const sideWallMat = mat("#f7eddc", 0.95);
    const trim = mat("#fffaf2", 0.7);
    const wood = mat("#c9a876", 0.75);
    const wainscot = mat("#f0dfc6", 0.9);
    const H = HALL.wallHeight;
    // A box from its extents — walls and trims meet in BUTT joints (one piece
    // stops where the other's face begins) and their open-edge ends are
    // staggered by a centimetre or two, so no two same-facing faces ever share
    // a plane at the corner or the open edges (that's what shimmers).
    const span = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material) =>
      mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const B = BACK_WALL_Z;
    const R = RIGHT_WALL_X;
    const L = HALL.xMin;
    const F = HALL.zMax;
    // walls: the back wall stops at the right wall's inner face
    shell.add(span(L - 0.2, R, 0, H, B - 0.4, B, wallMat));
    shell.add(span(R, R + 0.4, 0, H, B - 0.4, F, sideWallMat));
    // back-wall trims run to the corner; right-wall trims start at their faces
    const trims: Array<{ depth: number; y0: number; y1: number; overhang: number; m: THREE.Material }> = [
      { depth: 0.06, y0: 0, y1: 1.1, overhang: 0, m: wainscot },
      { depth: 0.1, y0: 1.08, y1: 1.16, overhang: 0.02, m: trim },
      { depth: 0.09, y0: 0, y1: 0.18, overhang: 0.01, m: wood },
      { depth: 0.24, y0: H - 0.24, y1: H, overhang: 0.03, m: trim },
    ];
    for (const t of trims) {
      shell.add(span(L - t.overhang, R, t.y0, t.y1, B, B + t.depth, t.m));
      shell.add(span(R - t.depth, R, t.y0, t.y1, B + t.depth, F + t.overhang, t.m));
    }
    // wainscot battens every 1.5 m
    const batten = new THREE.BoxGeometry(0.06, 0.9, 0.03);
    for (let x = HALL.xMin + 0.75; x < HALL.xMax; x += 1.5) shell.add(mesh(batten, trim, x, 0.56, BACK_WALL_Z + 0.07));
    const battenR = new THREE.BoxGeometry(0.03, 0.9, 0.06);
    for (let z = HALL.zMin + 0.75; z < HALL.zMax; z += 1.5) shell.add(mesh(battenR, trim, RIGHT_WALL_X - 0.07, 0.56, z));
    root.add(shell);
    freeze(shell);
  }

  // ───────────────────────── windows + light beams ─────────────────────────
  const clouds = cloudLayerTexture();
  const view = windowViewTexture();
  disposables.push(clouds, view);
  const beamTex = glowTexture("rgba(255,244,214,0.55)", "rgba(255,244,214,0)");
  disposables.push(beamTex);
  const motes: THREE.Points[] = [];
  for (const win of [CAFE.window, NOOK.window]) {
    const g = new THREE.Group();
    const z = BACK_WALL_Z + 0.02;
    g.add(mesh(roundedBox(3.7, 2.7, 0.2, 0.06), mat("#ffffff", 0.6), win.x, win.y, z + 0.05));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.3), new THREE.MeshBasicMaterial({ map: view }));
    pane.position.set(win.x, win.y, z + 0.16);
    g.add(pane);
    const cloudPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 1.6),
      new THREE.MeshBasicMaterial({ map: clouds, transparent: true, depthWrite: false })
    );
    cloudPlane.position.set(win.x, win.y + 0.3, z + 0.17);
    g.add(cloudPlane);
    const bar = mat("#ffffff", 0.6);
    g.add(mesh(new THREE.BoxGeometry(0.08, 2.3, 0.05), bar, win.x, win.y, z + 0.19));
    g.add(mesh(new THREE.BoxGeometry(3.3, 0.08, 0.05), bar, win.x, win.y, z + 0.195));
    g.add(mesh(roundedBox(4.0, 0.12, 0.4, 0.04), mat("#fffaf2", 0.7), win.x, win.y - 1.4, z + 0.2));
    // soft curtains, gathered at the sides
    for (const side of [-1, 1]) {
      const curtain = mesh(roundedBox(0.55, 3.1, 0.14, 0.07), mat("#ffd6e0", 0.95), win.x + side * 2.15, win.y - 0.05, z + 0.26);
      curtain.scale.x = 0.9;
      g.add(curtain);
    }
    root.add(g);
    freeze(g);
    // a warm sunbeam slanting to the floor, with dust drifting in it
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 9),
      new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    beam.position.set(win.x + 0.8, win.y - 2.6, z + 2.6);
    beam.rotation.set(-0.75, 0, 0.12);
    root.add(beam);
    const count = 36;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = win.x - 1.4 + Math.random() * 3.6;
      pos[i * 3 + 1] = 0.6 + Math.random() * 5;
      pos[i * 3 + 2] = z + 0.8 + Math.random() * 4.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: "#fff4d6", size: 0.06, transparent: true, opacity: 0.7, depthWrite: false })
    );
    root.add(pts);
    motes.push(pts);
  }
  ticks.push((t, dt) => {
    clouds.offset.x = (clouds.offset.x + dt * 0.012) % 1;
    for (const pts of motes) {
      const a = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) + dt * 0.06;
        if (y > 5.8) y = 0.5;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(t * 0.4 + i) * dt * 0.03);
      }
      a.needsUpdate = true;
    }
  });

  // ─────────────────────── twinkle string lights ───────────────────────
  {
    const pts: THREE.Vector3[] = [];
    const hooks = 6;
    const span = (HALL.xMax - HALL.xMin - 1) / hooks;
    const y0 = 7.9;
    for (let h = 0; h < hooks; h++) {
      const xa = HALL.xMin + 0.5 + h * span;
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        pts.push(new THREE.Vector3(xa + u * span, y0 - Math.sin(u * Math.PI) * 0.55, BACK_WALL_Z + 0.25));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.012, 5, false), mat("#5b4a5e", 0.6));
    root.add(wire);
    freeze(wire);
    const N = 64;
    const bulbs = new THREE.InstancedMesh(sphere(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }), N);
    const palette = ["#ffd166", "#ff8fab", "#9bf6ff", "#caffbf", "#ffc6ff"].map((c) => new THREE.Color(c));
    const m4 = new THREE.Matrix4();
    const base: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const p = curve.getPointAt((i + 0.5) / N);
      p.y -= 0.08;
      base.push(p);
      bulbs.setColorAt(i, palette[i % palette.length]);
    }
    root.add(bulbs);
    const tmpScale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    ticks.push((t) => {
      for (let i = 0; i < N; i++) {
        const s = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7));
        m4.compose(base[i], q, tmpScale.set(s, s, s));
        bulbs.setMatrixAt(i, m4);
      }
      bulbs.instanceMatrix.needsUpdate = true;
    });
  }

  // ───────────────────────────── wall clock ─────────────────────────────
  {
    const clock = new THREE.Group();
    clock.position.set(RIGHT_WALL_X - 0.06, 6.7, 5.4);
    clock.rotation.y = -Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), mat("#fffaf2", 0.6));
    face.position.z = 0.04;
    clock.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.06, 10, 40), mat("#8a6f55", 0.5));
    clock.add(rim);
    for (let i = 0; i < 12; i++) {
      const tick = mesh(new THREE.BoxGeometry(0.03, i % 3 === 0 ? 0.12 : 0.06, 0.01), mat("#5b4a5e"), Math.sin((i / 12) * Math.PI * 2) * 0.5, Math.cos((i / 12) * Math.PI * 2) * 0.5, 0.05);
      tick.rotation.z = -(i / 12) * Math.PI * 2;
      clock.add(tick);
    }
    const hand = (len: number, w: number, color: string, layer: number) => {
      const pivot = new THREE.Group();
      pivot.position.z = 0.055 + layer * 0.012;
      const bar = mesh(new THREE.BoxGeometry(w, len, 0.015), mat(color, 0.5), 0, len / 2 - 0.05, 0);
      pivot.add(bar);
      clock.add(pivot);
      return pivot;
    };
    const hourH = hand(0.32, 0.05, "#3d3347", 0);
    const minH = hand(0.46, 0.035, "#3d3347", 1);
    const secH = hand(0.5, 0.012, "#ff8fab", 2);
    clock.add(mesh(cylinder(0.04, 0.04, 0.03, 12), mat("#3d3347"), 0, 0, 0.07).rotateX(Math.PI / 2));
    root.add(clock);
    ticks.push(() => {
      const now = new Date();
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      secH.rotation.z = -(s / 60) * Math.PI * 2;
      minH.rotation.z = -(m / 60) * Math.PI * 2;
      hourH.rotation.z = -(h / 12) * Math.PI * 2;
    });
  }

  // ─────────────────────────────── lounge ───────────────────────────────
  {
    const lounge = new THREE.Group();
    const rugTex = roundRugTexture("#ffd9e2", "#fff3f6", "#ff8fab");
    disposables.push(rugTex);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(LOUNGE.rug.r, 64), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1, transparent: true }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(LOUNGE.rug.x, 0.012, LOUNGE.rug.z);
    rug.receiveShadow = true;
    lounge.add(rug);

    // sofa — soft rounded blocks, faces the TV (-z)
    const sofa = new THREE.Group();
    const sofaMat = mat("#a0c4ff", 0.85);
    const sofaDark = mat("#8ab0f5", 0.85);
    sofa.add(mesh(roundedBox(5.6, 0.7, 1.4, 0.14), sofaMat, 0, 0.55, 0, true));
    sofa.add(mesh(roundedBox(5.56, 1.05, 0.42, 0.16), sofaMat, 0, 1.18, 0.62, true));
    for (const sx of [-2.7, 2.7]) sofa.add(mesh(new THREE.CapsuleGeometry(0.36, 0.9, 6, 14), sofaDark, sx, 0.85, 0, true));
    for (const sx of [-1.75, 0, 1.75]) sofa.add(mesh(roundedBox(1.66, 0.3, 1.1, 0.13), mat("#c3d5fd", 0.95), sx, 1.02, -0.06, true));
    for (const sx of [-1.75, 0, 1.75]) {
      const back = mesh(roundedBox(1.55, 0.62, 0.26, 0.12), mat("#b3caf9", 0.95), sx, 1.42, 0.32, true);
      back.rotation.x = -0.18;
      sofa.add(back);
    }
    for (const [sx, col, rot] of [[-2.15, "#ffadad", 0.4], [2.15, "#ffd166", -0.35]] as const) {
      const pillow = mesh(roundedBox(0.58, 0.52, 0.2, 0.09), mat(col, 0.95), sx, 1.34, 0.08, true);
      pillow.rotation.set(-0.25, rot, rot * 0.3);
      sofa.add(pillow);
    }
    const legMat = mat("#8a6f55", 0.6);
    for (const [lx, lz] of [[-2.5, -0.5], [2.5, -0.5], [-2.5, 0.5], [2.5, 0.5]] as const) sofa.add(mesh(cylinder(0.07, 0.05, 0.25, 10), legMat, lx, 0.12, lz));
    sofa.position.set(LOUNGE.sofa.x, 0, LOUNGE.sofa.z);
    lounge.add(sofa);

    // coffee table with books, a cocoa and a tiny succulent
    const table = new THREE.Group();
    table.add(mesh(cylinder(1.4, 1.4, 0.12, 40), mat("#fffaf0", 0.45), 0, 0.55, 0, true));
    table.add(mesh(cylinder(1.3, 1.3, 0.05, 40), mat("#e9d4ae", 0.7), 0, 0.2, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      table.add(mesh(cylinder(0.05, 0.04, 0.5, 8), mat("#c9a876", 0.6), Math.cos(a) * 1.0, 0.25, Math.sin(a) * 1.0));
    }
    const book1 = mesh(roundedBox(0.55, 0.08, 0.4, 0.02), mat("#ff8fab"), -0.4, 0.65, 0.15);
    book1.rotation.y = 0.4;
    const book2 = mesh(roundedBox(0.5, 0.07, 0.38, 0.02), mat("#9bf6ff"), -0.38, 0.72, 0.12);
    book2.rotation.y = 0.25;
    table.add(book1, book2, mesh(cylinder(0.12, 0.1, 0.18, 16), mat("#ff9770", 0.5), 0.55, 0.7, -0.25));
    table.add(mesh(cylinder(0.1, 0.08, 0.12, 12), mat("#f2cc8f"), 0.2, 0.67, 0.55), mesh(sphere(0.1, 10, 8), mat("#7bb37a"), 0.2, 0.78, 0.55));
    table.position.set(LOUNGE.table.x, 0, LOUNGE.table.z);
    lounge.add(table);
    const cocoa = steam(LOUNGE.table.x + 0.55, 0.82, LOUNGE.table.z - 0.25, 4, 0.22);
    root.add(cocoa.group);
    ticks.push(cocoa.tick);

    // floor cushions
    for (const c of LOUNGE.cushions) {
      const cu = mesh(sphere(0.72, 24, 16), mat(c.color, 0.95), c.x, 0.3, c.z, true);
      cu.scale.set(1, 0.42, 1);
      lounge.add(cu);
      lounge.add(mesh(sphere(0.06, 8, 6), mat("#ffffff", 0.8), c.x, 0.6, c.z));
    }

    // bookshelf by the TV wall
    const shelf = new THREE.Group();
    shelf.add(mesh(roundedBox(3.4, 3.6, 0.7, 0.06), mat("#b08d5f", 0.7), 0, 1.8, 0, true));
    const bookCols = ["#ff8fab", "#9bf6ff", "#ffd6a5", "#caffbf", "#bdb2ff", "#ffc6ff", "#8ce8c0"];
    for (let row = 0; row < 3; row++) {
      const y = 0.9 + row * 1.05;
      shelf.add(mesh(new THREE.BoxGeometry(3.0, 0.9, 0.5), mat("#6b5844", 0.9), 0, y, 0.08));
      let bx = -1.35;
      let ci = row * 2;
      while (bx < 1.25) {
        const bw = 0.16 + ((ci * 37) % 10) / 60;
        const bh = 0.62 + ((ci * 53) % 10) / 45;
        shelf.add(mesh(new THREE.BoxGeometry(bw, bh, 0.4), mat(bookCols[ci % bookCols.length], 0.8), bx + bw / 2, y - 0.42 + bh / 2, 0.12));
        bx += bw + 0.035;
        ci++;
      }
    }
    shelf.add(mesh(cylinder(0.16, 0.12, 0.24, 12), mat("#e07a5f"), -1.1, 3.72, 0), mesh(sphere(0.2, 10, 8), mat("#6a9f6b"), -1.1, 3.95, 0));
    shelf.add(mesh(roundedBox(0.5, 0.4, 0.05, 0.02), mat("#fffaf2"), 0.9, 3.8, 0.1));
    shelf.position.set(BOOKSHELF.x, 0, BOOKSHELF.z);
    lounge.add(shelf);
    root.add(lounge);
    freeze(lounge);
  }

  // ───────────────────────────── floor lamps ─────────────────────────────
  for (const l of FLOOR_LAMPS) {
    const lamp = floorLamp(l.x, l.z);
    root.add(lamp.group);
    ticks.push(lamp.tick);
  }

  // ───────────────────────────── café corner ─────────────────────────────
  {
    const cafe = new THREE.Group();
    const { counter } = CAFE;
    // counter: mint body, wood top, battens, toe kick
    cafe.add(mesh(roundedBox(counter.hx * 2, 1.0, counter.hz * 2, 0.06), mat("#b9e4c9", 0.8), counter.x, 0.5, counter.z, true));
    cafe.add(mesh(new THREE.BoxGeometry(counter.hx * 2 - 0.2, 0.12, counter.hz * 2 - 0.1), mat("#7fa58c", 0.9), counter.x, 0.06, counter.z));
    cafe.add(mesh(roundedBox(counter.hx * 2 + 0.3, 0.12, counter.hz * 2 + 0.2, 0.04), mat("#e6c49a", 0.55), counter.x, 1.06, counter.z + 0.05, true));
    const battenGeo = new THREE.BoxGeometry(0.05, 0.8, 0.03);
    for (let x = counter.x - counter.hx + 0.35; x < counter.x + counter.hx; x += 0.5) cafe.add(mesh(battenGeo, mat("#a6d6b8"), x, 0.52, counter.z + counter.hz + 0.01));

    // espresso machine, cups, cake under a dome, herb box
    const ex = CAFE.espresso.x;
    const ez = CAFE.espresso.z;
    const steel = mat("#dfe3ea", 0.3, { metalness: 0.55 });
    cafe.add(mesh(roundedBox(0.76, 0.58, 0.55, 0.06), steel, ex, 1.12 + 0.29, ez, true));
    cafe.add(mesh(roundedBox(0.8, 0.06, 0.6, 0.02), mat("#3d3347", 0.5), ex, 1.73, ez));
    cafe.add(mesh(cylinder(0.08, 0.08, 0.12, 12), mat("#3d3347", 0.4), ex - 0.15, 1.3, ez + 0.3), mesh(cylinder(0.08, 0.08, 0.12, 12), mat("#3d3347", 0.4), ex + 0.15, 1.3, ez + 0.3));
    cafe.add(mesh(cylinder(0.06, 0.05, 0.09, 12), mat("#ffffff", 0.4), ex - 0.15, 1.17, ez + 0.32), mesh(cylinder(0.06, 0.05, 0.09, 12), mat("#ffffff", 0.4), ex + 0.15, 1.17, ez + 0.32));
    const espressoSteam = steam(ex + 0.1, 1.85, ez, 6, 0.4);
    root.add(espressoSteam.group);
    ticks.push(espressoSteam.tick);
    const cakeX = counter.x + 1.4;
    cafe.add(mesh(cylinder(0.32, 0.32, 0.03, 24), mat("#ffffff", 0.3), cakeX, 1.3, counter.z - 0.05));
    cafe.add(mesh(cylinder(0.03, 0.05, 0.16, 8), mat("#ffffff", 0.3), cakeX, 1.2, counter.z - 0.05));
    cafe.add(mesh(cylinder(0.22, 0.22, 0.16, 24), mat("#ffc6d9", 0.7), cakeX, 1.39, counter.z - 0.05));
    cafe.add(mesh(cylinder(0.225, 0.225, 0.03, 24), mat("#fffaf2", 0.6), cakeX, 1.48, counter.z - 0.05));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#e8f6ff", transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false })
    );
    dome.position.set(cakeX, 1.31, counter.z - 0.05);
    cafe.add(dome);
    const herbX = counter.x + counter.hx - 0.7;
    cafe.add(mesh(roundedBox(0.95, 0.22, 0.32, 0.04), mat("#b08d5f"), herbX, 1.23, counter.z - 0.15));
    for (let i = 0; i < 5; i++) cafe.add(mesh(sphere(0.1, 10, 8), mat(i % 2 ? "#7bb37a" : "#5c9a72"), herbX - 0.36 + i * 0.18, 1.4, counter.z - 0.15));

    // chalkboard menu + shelves either side
    const chalk = chalkboardTexture();
    disposables.push(chalk);
    cafe.add(mesh(roundedBox(3.5, 2.3, 0.1, 0.04), mat("#8a6f55", 0.6), CAFE.chalkboard.x, CAFE.chalkboard.y, BACK_WALL_Z + 0.05));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 2.05), new THREE.MeshStandardMaterial({ map: chalk, roughness: 0.95 }));
    board.position.set(CAFE.chalkboard.x, CAFE.chalkboard.y, BACK_WALL_Z + 0.11);
    cafe.add(board);
    const jarCols = ["#ffd6a5", "#caffbf", "#ffadad", "#bdb2ff"];
    for (const sx of [counter.x - 3.3, counter.x + 3.3]) {
      for (const [row, y] of [[0, 2.35], [1, 3.25]] as const) {
        cafe.add(mesh(roundedBox(1.5, 0.08, 0.36, 0.02), mat("#caa472", 0.6), sx, y, BACK_WALL_Z + 0.2));
        for (let i = 0; i < 4; i++) {
          const jar = mesh(cylinder(0.1, 0.1, row ? 0.26 : 0.2, 12), mat(jarCols[(i + row) % 4], 0.35, { transparent: true, opacity: 0.9 }), sx - 0.52 + i * 0.35, y + (row ? 0.17 : 0.14), BACK_WALL_Z + 0.2);
          cafe.add(jar);
        }
      }
    }

    // pendant lights (they sway a hair) + one warm light over the counter
    const pendants: THREE.Group[] = [];
    for (const px of [counter.x - 2.6, counter.x, counter.x + 2.6]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, HALL.wallHeight - 0.2, counter.z + 0.55);
      const cordLen = HALL.wallHeight - 0.2 - 4.1;
      pivot.add(mesh(cylinder(0.012, 0.012, cordLen, 6), mat("#3d3347"), 0, -cordLen / 2, 0));
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.42, 0.38, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: "#f4a6b8", emissive: "#ffb38a", emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.6 })
      );
      shade.position.y = -cordLen - 0.1;
      pivot.add(shade);
      const bulb = glowSprite("#ffd9a0", 1.1, 0.8);
      bulb.position.y = -cordLen - 0.25;
      pivot.add(bulb);
      cafe.add(pivot);
      pendants.push(pivot);
    }
    const cafeLight = new THREE.PointLight("#ffc27a", 12, 13, 2);
    cafeLight.position.set(counter.x, 3.4, counter.z + 2.2);
    root.add(cafeLight);
    ticks.push((t) => pendants.forEach((p, i) => (p.rotation.z = Math.sin(t * 0.7 + i) * 0.012)));

    // bar stools
    CAFE.stools.forEach((s, i) => {
      const stool = new THREE.Group();
      stool.add(mesh(cylinder(0.28, 0.3, 0.04, 20), mat("#5b4a5e", 0.5, { metalness: 0.3 }), 0, 0.02, 0));
      stool.add(mesh(cylinder(0.04, 0.04, 0.72, 10), mat("#b08d5f", 0.45, { metalness: 0.35 }), 0, 0.38, 0));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 24), mat("#b08d5f", 0.45, { metalness: 0.35 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.3;
      stool.add(ring);
      stool.add(mesh(roundedBox(0.64, 0.12, 0.64, 0.06), mat(i % 2 ? "#9bf6ff" : "#ff8fab", 0.9), 0, 0.77, 0, true));
      stool.position.set(s.x, 0, s.z);
      cafe.add(stool);
    });

    // bistro tables with chairs, a cocoa and a little vase
    CAFE.tables.forEach((t, i) => {
      const tb = new THREE.Group();
      tb.add(mesh(cylinder(0.3, 0.34, 0.05, 20), mat("#3d3347", 0.5), 0, 0.025, 0));
      tb.add(mesh(cylinder(0.05, 0.05, 0.75, 10), mat("#3d3347", 0.5), 0, 0.4, 0));
      tb.add(mesh(cylinder(0.62, 0.62, 0.05, 32), mat("#fbf7f2", 0.3), 0, 0.8, 0, true));
      for (const side of [-1, 1]) {
        const chair = new THREE.Group();
        chair.add(mesh(roundedBox(0.58, 0.08, 0.58, 0.03), mat("#caa472", 0.6), 0, 0.5, 0, true));
        chair.add(mesh(roundedBox(0.08, 0.56, 0.58, 0.03), mat("#caa472", 0.6), side * 0.25, 0.83, 0, true));
        for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const)
          chair.add(mesh(cylinder(0.025, 0.025, 0.5, 6), mat("#8a6f55"), lx, 0.25, lz));
        chair.position.set(side * 1.0, 0, 0);
        tb.add(chair);
      }
      if (i === 0) {
        tb.add(mesh(cylinder(0.08, 0.07, 0.13, 12), mat("#ffffff", 0.4), 0.15, 0.89, 0.1));
        const s = steam(t.x + 0.15, 0.97, t.z + 0.1, 4, 0.18);
        root.add(s.group);
        ticks.push(s.tick);
      } else {
        tb.add(mesh(cylinder(0.06, 0.08, 0.2, 12), mat("#9fb4d6", 0.2, { transparent: true, opacity: 0.8 }), 0, 0.92, 0));
        tb.add(mesh(sphere(0.08, 10, 8), mat("#ff8fab", 0.7), 0, 1.1, 0), mesh(sphere(0.06, 8, 6), mat("#ffd166"), 0.08, 1.06, 0.05));
      }
      tb.position.set(t.x, 0, t.z);
      cafe.add(tb);
    });
    root.add(cafe);
    freeze(cafe);
    // pendants animate: unfreeze just them
    for (const p of pendants) p.traverse((o) => (o.matrixAutoUpdate = true));
  }

  // ─────────────────────────── fireplace nook ───────────────────────────
  let fireLight: THREE.PointLight;
  {
    const nook = new THREE.Group();
    const fz = NOOK.fire.z;
    const stone = stoneTexture();
    disposables.push(stone);
    const stoneMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 });
    const chimneyH = HALL.wallHeight - 0.24; // stops under the crown molding
    nook.add(mesh(roundedBox(0.7, chimneyH, 3.6, 0.06), stoneMat, RIGHT_WALL_X - 0.35, chimneyH / 2, fz, true));
    nook.add(mesh(new THREE.BoxGeometry(0.06, 1.3, 1.9), mat("#1d1412", 1), RIGHT_WALL_X - 0.71, 0.95, fz));
    nook.add(mesh(roundedBox(0.2, 0.22, 2.3, 0.05), mat("#9c8c7e", 0.9), RIGHT_WALL_X - 0.78, 1.72, fz));
    nook.add(mesh(roundedBox(0.9, 0.24, 4.2, 0.06), mat("#9c8c7e", 0.9), RIGHT_WALL_X - 1.05, 0.12, fz, true));
    nook.add(mesh(roundedBox(0.6, 0.14, 3.0, 0.04), mat("#8a5a3b", 0.6), RIGHT_WALL_X - 0.95, 1.94, fz, true));
    const logMat = mat("#6b4428", 0.9);
    for (const [dz, rot, y] of [[-0.25, 0.3, 0.33], [0.25, -0.3, 0.33], [0, 0, 0.47]] as const) {
      const log = mesh(cylinder(0.09, 0.1, 1.0, 10), logMat, RIGHT_WALL_X - 0.95, y, fz + dz);
      log.rotation.set(Math.PI / 2, 0, rot);
      nook.add(log);
    }
    // mantel decor: candles, a photo, a little plant
    const candleFlames: THREE.Sprite[] = [];
    [-1.1, -0.85, -0.62].forEach((dz, i) => {
      const h = 0.18 + i * 0.05;
      nook.add(mesh(cylinder(0.05, 0.05, h, 10), mat("#fff6ea", 0.6), RIGHT_WALL_X - 0.95, 2.01 + h / 2, fz + dz));
      const fl = glowSprite("#ffb347", 0.22, 0.95);
      fl.position.set(RIGHT_WALL_X - 0.95, 2.05 + h, fz + dz);
      nook.add(fl);
      candleFlames.push(fl);
    });
    const photo = mesh(roundedBox(0.05, 0.42, 0.55, 0.02), mat("#caa472"), RIGHT_WALL_X - 0.93, 2.25, fz + 0.5);
    photo.rotation.z = 0.08;
    nook.add(photo);
    nook.add(mesh(cylinder(0.12, 0.1, 0.18, 12), mat("#81b29a"), RIGHT_WALL_X - 0.95, 2.1, fz + 1.1), mesh(sphere(0.16, 10, 8), mat("#6a9f6b"), RIGHT_WALL_X - 0.95, 2.28, fz + 1.1));

    // tall shelves flanking the fire
    const bookCols = ["#c8553d", "#f2d0a4", "#81b29a", "#3d405b", "#f4a261", "#9a8c98"];
    for (const s of NOOK.shelves) {
      nook.add(mesh(roundedBox(0.7, 3.3, 1.9, 0.05), mat("#caa472", 0.7), RIGHT_WALL_X - 0.35, 1.65, s.z, true));
      for (let row = 0; row < 3; row++) {
        const y = 0.75 + row * 0.95;
        nook.add(mesh(new THREE.BoxGeometry(0.5, 0.8, 1.7), mat("#7a5a3e", 0.9), RIGHT_WALL_X - 0.42, y, s.z));
        let bz = s.z - 0.78;
        let ci = row * 3 + Math.round(s.z);
        while (bz < s.z + 0.7) {
          const bw = 0.12 + ((Math.abs(ci) * 37) % 10) / 70;
          const bh = 0.5 + ((Math.abs(ci) * 53) % 10) / 40;
          nook.add(mesh(new THREE.BoxGeometry(0.36, bh, bw), mat(bookCols[Math.abs(ci) % bookCols.length], 0.8), RIGHT_WALL_X - 0.5, y - 0.38 + bh / 2, bz + bw / 2));
          bz += bw + 0.03;
          ci++;
        }
      }
    }

    // hearth rug, bean bags, basket of yarn
    const rugTex = ovalRugTexture();
    disposables.push(rugTex);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(NOOK.rug.rx, NOOK.rug.rz, 1);
    rug.position.set(NOOK.rug.x, 0.012, NOOK.rug.z);
    rug.receiveShadow = true;
    nook.add(rug);
    for (const b of NOOK.beanBags) {
      const bag = mesh(sphere(0.82, 28, 18), mat(b.color, 1), b.x, 0.38, b.z, true);
      bag.scale.set(1, 0.6, 1);
      nook.add(bag);
      const dent = mesh(sphere(0.5, 18, 12), mat(b.color, 1), b.x, 0.62, b.z);
      dent.scale.set(1, 0.35, 1);
      nook.add(dent);
    }
    const bk = NOOK.basket;
    nook.add(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 20, 1, true), mat("#c9a26b", 0.95, { side: THREE.DoubleSide }), bk.x, 0.2, bk.z, true));
    nook.add(mesh(cylinder(0.24, 0.24, 0.02, 20), mat("#8a6f55"), bk.x, 0.02, bk.z));
    ["#ffadad", "#9bf6ff", "#ffd166"].forEach((c, i) => nook.add(mesh(sphere(0.13, 14, 10), mat(c, 1), bk.x - 0.1 + i * 0.1, 0.4 + (i % 2) * 0.05, bk.z + (i - 1) * 0.08)));
    const needle = mesh(cylinder(0.012, 0.012, 0.6, 6), mat("#b08d5f"), bk.x, 0.55, bk.z);
    needle.rotation.z = 0.6;
    nook.add(needle);
    root.add(nook);
    freeze(nook);

    // ── living fire: flames, embers, glow, flicker light ──
    const fireGroup = new THREE.Group();
    fireGroup.position.set(RIGHT_WALL_X - 0.9, 0.35, fz);
    const flameCols = ["#ff7b2e", "#ffb347", "#ffd166", "#ff9a3c", "#ffc56b"];
    const flames = flameCols.map((c, i) => {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.17 - i * 0.012, 0.75, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      f.position.set(0, 0.35, (i - 2) * 0.2);
      fireGroup.add(f);
      return { f, phase: i * 1.37 };
    });
    const fireGlow = glowSprite("#ff8a3d", 2.4, 0.55);
    fireGlow.position.set(-0.1, 0.45, 0);
    fireGroup.add(fireGlow);
    const embers = Array.from({ length: 10 }, (_, i) => {
      const e = glowSprite("#ffb347", 0.08, 0);
      fireGroup.add(e);
      return { e, phase: i / 10 };
    });
    root.add(fireGroup);
    fireLight = new THREE.PointLight("#ff8a3d", 9, 12, 2);
    fireLight.position.set(RIGHT_WALL_X - 1.6, 1.2, fz);
    root.add(fireLight);
    ticks.push((t) => {
      for (const { f, phase } of flames) {
        const n = Math.sin(t * 11 + phase) * 0.18 + Math.sin(t * 17.3 + phase * 2) * 0.1;
        f.scale.set(0.85 + n * 0.3, 1 + n, 0.85 + n * 0.3);
        f.rotation.z = Math.sin(t * 3 + phase) * 0.08;
        (f.material as THREE.MeshBasicMaterial).opacity = 0.7 + n * 0.4;
      }
      const flick = Math.sin(t * 9) * 0.6 + Math.sin(t * 23.7) * 0.45 + Math.sin(t * 4.1) * 0.3;
      fireLight.intensity = 9 + flick * 1.6;
      fireGlow.material.opacity = 0.5 + flick * 0.05;
      for (const { e, phase } of embers) {
        const k = (t * 0.45 + phase) % 1;
        e.position.set(Math.sin((phase + t) * 5) * 0.12 - 0.05, 0.3 + k * 1.3, Math.cos(phase * 20) * 0.5);
        e.material.opacity = Math.sin(k * Math.PI) * 0.9;
      }
      for (let i = 0; i < candleFlames.length; i++) {
        const s = 0.2 + Math.sin(t * 13 + i * 2) * 0.03;
        candleFlames[i].scale.set(s, s * 1.25, 1);
      }
    });

    // ── rocking chair (it rocks) ──
    const rocker = new THREE.Group();
    const wood = mat("#9a6b47", 0.6);
    for (const side of [-1, 1]) {
      const runner = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 8, 24, 0.95), wood);
      runner.rotation.z = -Math.PI / 2 - 0.475;
      runner.position.set(0, 1.3, side * 0.34);
      rocker.add(runner);
      rocker.add(mesh(cylinder(0.03, 0.03, 0.48, 8), wood, 0.25, 0.28, side * 0.34), mesh(cylinder(0.03, 0.03, 0.48, 8), wood, -0.25, 0.28, side * 0.34));
      rocker.add(mesh(roundedBox(0.66, 0.05, 0.07, 0.02), wood, 0.02, 0.8, side * 0.36));
      rocker.add(mesh(cylinder(0.025, 0.025, 0.3, 6), wood, 0.28, 0.65, side * 0.36));
    }
    rocker.add(mesh(roundedBox(0.72, 0.08, 0.76, 0.03), wood, 0, 0.52, 0, true));
    rocker.add(mesh(roundedBox(0.62, 0.1, 0.62, 0.05), mat("#ffc6ff", 1), 0.02, 0.6, 0));
    const back = new THREE.Group();
    back.position.set(-0.34, 0.55, 0);
    back.rotation.z = 0.2;
    back.add(mesh(roundedBox(0.06, 1.0, 0.72, 0.03), wood, 0, 0.5, 0, true));
    for (let i = 0; i < 4; i++) back.add(mesh(cylinder(0.018, 0.018, 0.85, 6), mat("#b98b62"), 0.03, 0.48, -0.24 + i * 0.16));
    const blanket = mesh(roundedBox(0.04, 0.7, 0.66, 0.02), mat("#9bf6ff", 1), 0.06, 0.55, 0);
    blanket.rotation.x = 0.05;
    back.add(blanket);
    rocker.add(back);
    rocker.position.set(NOOK.rocker.x, 0, NOOK.rocker.z);
    root.add(rocker);
    ticks.push((t) => {
      rocker.rotation.z = Math.sin(t * 1.15) * 0.075;
    });

    // ── sleeping cat by the fire (it breathes, its tail twitches) ──
    const cat = new THREE.Group();
    const fur = mat("#f6b26b", 0.9);
    const body = mesh(sphere(0.28, 20, 14), fur, 0, 0.2, 0, true);
    body.scale.set(1.45, 0.72, 1);
    cat.add(body);
    const head = new THREE.Group();
    head.position.set(0.36, 0.2, 0.08);
    head.add(mesh(sphere(0.17, 16, 12), fur, 0, 0, 0, true));
    for (const side of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.055, 0.12, 8), fur, 0.02, 0.15, side * 0.09);
      ear.rotation.x = side * 0.3;
      head.add(ear);
      head.add(mesh(new THREE.BoxGeometry(0.01, 0.012, 0.05), mat("#3d3347"), 0.15, 0.03, side * 0.06));
    }
    head.add(mesh(sphere(0.02, 8, 6), mat("#ff8fab"), 0.17, -0.02, 0));
    cat.add(head);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 18, Math.PI * 1.1), fur);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(-0.05, 0.06, 0);
    cat.add(tail);
    const zzz: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "#8a7f98";
      g.font = "900 44px ui-rounded, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("z", 32, 34);
      const t = new THREE.CanvasTexture(c);
      disposables.push(t);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false }));
      cat.add(sp);
      zzz.push(sp);
    }
    cat.position.set(NOOK.cat.x, 0, NOOK.cat.z);
    cat.rotation.y = -0.6;
    root.add(cat);
    ticks.push((t) => {
      const breath = 1 + Math.sin(t * 1.6) * 0.045;
      body.scale.set(1.45, 0.72 * breath, 1 * (1 + (breath - 1) * 0.5));
      tail.rotation.z = Math.sin(t * 0.9) * 0.12 + (Math.sin(t * 0.23) > 0.9 ? Math.sin(t * 14) * 0.15 : 0);
      head.rotation.z = Math.sin(t * 1.6) * 0.03;
      zzz.forEach((sp, i) => {
        const k = (t * 0.28 + i / 3) % 1;
        sp.position.set(0.45 + k * 0.25, 0.4 + k * 0.7, 0.1);
        const s = 0.12 + k * 0.14;
        sp.scale.set(s, s, 1);
        sp.material.opacity = Math.sin(k * Math.PI) * 0.8;
      });
    });
  }

  // ─────────────────────────── dodgeball court ───────────────────────────
  const courtW = COURT.xMax - COURT.xMin;
  const courtD = COURT.zMax - COURT.zMin;
  const courtCX = (COURT.xMin + COURT.xMax) / 2;
  const courtCZ = (COURT.zMin + COURT.zMax) / 2;
  const cornerGlows: Array<{ ball: THREE.Mesh; glow: THREE.Sprite }> = [];
  let padRing: THREE.Mesh;
  let rackBalls: THREE.Group;
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 576;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  disposables.push(boardTex);
  {
    const court = new THREE.Group();
    const ct = courtTexture(courtW, courtD);
    disposables.push(ct);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(courtW, courtD), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(courtCX, 0.014, courtCZ);
    floor.receiveShadow = true;
    court.add(floor);
    for (const b of courtBumpers()) {
      court.add(mesh(roundedBox(b.hx * 2, COURT.bumperH, b.hz * 2, 0.12), mat("#7bdff2", 0.8), b.x, COURT.bumperH / 2, b.z, true));
      court.add(mesh(roundedBox(Math.max(0.06, b.hx * 2 - 0.1), 0.05, Math.max(0.06, b.hz * 2 - 0.1), 0.02), mat("#ffffff", 0.7), b.x, COURT.bumperH + 0.005, b.z));
    }
    // corner posts with glowing caps (they pulse with the round)
    for (const [x, z] of [[COURT.xMin, COURT.zMin], [COURT.xMax, COURT.zMin], [COURT.xMin, COURT.zMax], [COURT.xMax, COURT.zMax]] as const) {
      court.add(mesh(cylinder(0.12, 0.14, 1.2, 14), mat("#ffffff", 0.5), x, 0.6, z, true));
      const cap = new THREE.Mesh(sphere(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: "#4cc9f0", emissive: "#4cc9f0", emissiveIntensity: 0.6 }));
      cap.position.set(x, 1.3, z);
      court.add(cap);
      const glow = glowSprite("#4cc9f0", 1.0, 0.5);
      glow.position.set(x, 1.3, z);
      court.add(glow);
      cornerGlows.push({ ball: cap, glow });
    }
    // bunting over the back line
    const poleMat = mat("#ffffff", 0.5);
    court.add(mesh(cylinder(0.05, 0.05, 3.3, 8), poleMat, COURT.xMin - 0.35, 1.65, COURT.zMin - 0.3), mesh(cylinder(0.05, 0.05, 3.3, 8), poleMat, COURT.xMax + 0.35, 1.65, COURT.zMin - 0.3));
    const flagCols = ["#ff8fab", "#ffd166", "#9bf6ff", "#caffbf", "#bdb2ff"];
    const flagShape = new THREE.Shape([new THREE.Vector2(-0.22, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0, -0.42)]);
    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const flags: THREE.Mesh[] = [];
    const nFlags = 22;
    for (let i = 0; i < nFlags; i++) {
      const u = (i + 0.5) / nFlags;
      const x = COURT.xMin - 0.35 + u * (courtW + 0.7);
      const y = 3.25 - Math.sin(u * Math.PI) * 0.6;
      const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: flagCols[i % flagCols.length], side: THREE.DoubleSide, roughness: 0.9 }));
      f.position.set(x, y, COURT.zMin - 0.3);
      court.add(f);
      flags.push(f);
    }
    // start pad
    const padTex = padTexture();
    disposables.push(padTex);
    court.add(mesh(cylinder(COURT.pad.r, COURT.pad.r + 0.05, 0.04, 40), mat("#2b2d42", 0.6), COURT.pad.x, 0.02, COURT.pad.z));
    const padTop = new THREE.Mesh(new THREE.CircleGeometry(COURT.pad.r - 0.02, 40), new THREE.MeshBasicMaterial({ map: padTex, transparent: true }));
    padTop.rotation.x = -Math.PI / 2; // reads upright from the camera side
    padTop.position.set(COURT.pad.x, 0.043, COURT.pad.z);
    court.add(padTop);
    padRing = new THREE.Mesh(
      new THREE.TorusGeometry(COURT.pad.r + 0.12, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color: "#4cc9f0", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.set(COURT.pad.x, 0.06, COURT.pad.z);
    court.add(padRing);
    // scoreboard
    const bx = COURT.board.x;
    const bz = COURT.board.z;
    court.add(mesh(new THREE.BoxGeometry(0.28, 1.5, 0.28), mat("#5b4a5e", 0.6), bx, 0.75, bz, true));
    court.add(mesh(roundedBox(3.4, 2.0, 0.16, 0.08), mat("#2b2d42", 0.5), bx, 2.45, bz, true));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.12, 1.76), new THREE.MeshBasicMaterial({ map: boardTex }));
    face.position.set(bx, 2.45, bz + 0.085);
    court.add(face);
    // bleachers
    const bl = COURT.bleachers;
    court.add(mesh(roundedBox(1.2, 0.48, bl.len, 0.06), mat("#caa472", 0.7), bl.x - 0.6, 0.24, bl.z, true));
    court.add(mesh(roundedBox(1.2, 0.96, bl.len, 0.06), mat("#b08d5f", 0.7), bl.x + 0.6, 0.48, bl.z, true));
    court.add(mesh(roundedBox(1.0, 0.06, bl.len - 0.3, 0.03), mat("#ff8fab", 0.95), bl.x - 0.6, 0.5, bl.z));
    court.add(mesh(roundedBox(1.0, 0.06, bl.len - 0.3, 0.03), mat("#9bf6ff", 0.95), bl.x + 0.6, 0.98, bl.z));
    // ball rack (shows its balls between rounds)
    const rk = COURT.rack;
    court.add(mesh(roundedBox(0.5, 0.08, 1.3, 0.03), mat("#8a6f55"), rk.x, 0.95, rk.z), mesh(roundedBox(0.5, 0.08, 1.3, 0.03), mat("#8a6f55"), rk.x, 0.45, rk.z));
    for (const dz of [-0.6, 0.6]) court.add(mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), mat("#8a6f55"), rk.x, 0.5, rk.z + dz));
    rackBalls = new THREE.Group();
    const dodgeMat = mat("#4cc9f0", 0.45);
    for (let i = 0; i < 4; i++) rackBalls.add(mesh(sphere(0.24, 20, 14), dodgeMat, rk.x, i < 2 ? 0.73 : 1.23, rk.z - 0.3 + (i % 2) * 0.6, true));
    court.add(rackBalls);
    root.add(court);
    freeze(court);
    for (const o of [padRing, rackBalls, ...flags, ...cornerGlows.flatMap((c) => [c.ball, c.glow])]) o.matrixAutoUpdate = true;
    ticks.push((t) => {
      flags.forEach((f, i) => (f.rotation.x = Math.sin(t * 2 + i * 0.7) * 0.18));
    });
  }

  let courtMode: CourtMode = "idle";
  ticks.push((t) => {
    const pulse = courtMode === "countdown" ? 0.5 + 0.5 * Math.sin(t * 9) : courtMode === "playing" ? 0.85 : 0.35 + 0.25 * Math.sin(t * 2);
    const col = courtMode === "ended" ? "#ffd166" : courtMode === "countdown" ? "#ffd166" : "#4cc9f0";
    for (const c of cornerGlows) {
      const m = c.ball.material as THREE.MeshStandardMaterial;
      m.emissive.set(col);
      m.color.set(col);
      m.emissiveIntensity = 0.3 + pulse * 1.2;
      c.glow.material.color.set(col);
      c.glow.material.opacity = 0.25 + pulse * 0.5;
    }
    const idle = courtMode === "idle";
    padRing.visible = idle;
    if (idle) {
      const s = 1 + Math.sin(t * 3) * 0.06;
      padRing.scale.set(s, s, s);
      (padRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.3;
    }
    rackBalls.visible = idle || courtMode === "countdown";
  });

  // ─────────────────────────── garden + plants ───────────────────────────
  {
    const garden = new THREE.Group();
    const b = GARDEN.bench;
    const benchWood = mat("#c98f63", 0.7);
    for (let i = 0; i < 3; i++) garden.add(mesh(roundedBox(2.5, 0.07, 0.2, 0.02), benchWood, b.x, 0.5, b.z - 0.22 + i * 0.22, true));
    for (let i = 0; i < 2; i++) {
      const slat = mesh(roundedBox(2.5, 0.16, 0.06, 0.02), benchWood, b.x, 0.72 + i * 0.2, b.z + 0.36);
      slat.rotation.x = -0.12;
      garden.add(slat);
    }
    for (const side of [-1, 1]) {
      garden.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.7), mat("#3d3347", 0.5, { metalness: 0.3 }), b.x + side * 1.1, 0.25, b.z));
      garden.add(mesh(new THREE.BoxGeometry(0.045, 0.55, 0.045), mat("#3d3347", 0.5, { metalness: 0.3 }), b.x + side * 1.1, 0.72, b.z + 0.36));
    }
    // stepping stones from the garden toward the court
    for (let i = 0; i < 6; i++) {
      const st = mesh(cylinder(0.32 + (i % 2) * 0.06, 0.34, 0.03, 18), mat("#d6ccc2", 0.95), b.x + 1.6 + i * 1.05, 0.016, b.z - 1.4 - Math.sin(i * 0.9) * 0.6);
      st.scale.z = 0.8;
      garden.add(st);
    }
    root.add(garden);
    freeze(garden);
  }
  PLANTS.forEach((p, i) => {
    const pl = plant(p.x, p.z, p.s, i);
    root.add(pl.group);
    ticks.push(pl.tick);
  });

  // ──────────────────────────── court board ────────────────────────────
  const drawCourtBoard = (d: DodgeState, now: number, onCourt: number) => {
    const g = boardCanvas.getContext("2d")!;
    const Wc = boardCanvas.width;
    const Hc = boardCanvas.height;
    const bg = g.createLinearGradient(0, 0, Wc, Hc);
    bg.addColorStop(0, "#1f2447");
    bg.addColorStop(1, "#3a2f5b");
    g.fillStyle = bg;
    g.fillRect(0, 0, Wc, Hc);
    g.strokeStyle = "#4cc9f0";
    g.lineWidth = 8;
    g.strokeRect(12, 12, Wc - 24, Hc - 24);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 54px system-ui, sans-serif";
    drawIconText(g, "dodge", "DODGEBALL", Wc / 2, 70, 50, "#ffffff");

    if (d.status === "idle") {
      g.font = "700 40px system-ui, sans-serif";
      g.fillStyle = "#9bf6ff";
      g.fillText("step on the START pad · press E / ACT", Wc / 2, 210);
      g.font = "600 34px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillText("everyone on the court plays · one ball each", Wc / 2, 290);
      g.fillStyle = "#caffbf";
      g.fillText("land a hit  +1", Wc / 2 - 190, 380);
      g.fillStyle = "#ffadad";
      g.fillText("get hit  −1", Wc / 2 + 210, 380);
      g.font = "500 28px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillText("only throws that haven't touched the floor count", Wc / 2, 470);
      return;
    }
    if (d.status === "countdown") {
      const left = Math.max(0, Math.ceil((d.startsAt - now) / 1000));
      g.font = "900 190px system-ui, sans-serif";
      g.fillStyle = "#ffd166";
      g.fillText(String(left), Wc / 2, 280);
      g.font = "700 40px system-ui, sans-serif";
      g.fillStyle = "#ffffff";
      g.fillText(`get on the court! · ${onCourt} ready`, Wc / 2, 450);
      return;
    }
    const rows = d.status === "ended" && d.ranking.length ? d.ranking : rankDodge(d.roster);
    if (d.status === "playing") {
      const left = Math.max(0, Math.ceil((d.endsAt - now) / 1000));
      g.font = "900 46px system-ui, sans-serif";
      drawIconText(g, "timer", `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, Wc / 2, 140, 42, left <= 10 ? "#ffadad" : "#ffd166");
    } else {
      const top = rows[0];
      g.font = "900 50px system-ui, sans-serif";
      drawIconText(g, "crown", top ? `${top.name} wins` : "round over", Wc / 2, 140, 48, "#ffd166");
    }
    // standings: rank · name · hits · taken · score
    g.font = "700 26px system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.textAlign = "left";
    g.fillText("#", 90, 205);
    g.fillText("PLAYER", 150, 205);
    g.textAlign = "right";
    g.fillText("HITS", 690, 205);
    g.fillText("HIT BY", 830, 205);
    g.fillText("SCORE", 950, 205);
    rows.slice(0, 5).forEach((r, i) => {
      const y = 262 + i * 62;
      if (i % 2 === 0) {
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(60, y - 28, Wc - 120, 56);
      }
      g.textAlign = "left";
      g.font = "800 34px system-ui, sans-serif";
      g.fillStyle = r.rank === 1 ? "#ffd166" : "#ffffff";
      g.fillText(String(r.rank), 90, y);
      g.fillStyle = r.color;
      g.beginPath();
      g.arc(165, y, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = r.left ? "rgba(255,255,255,0.45)" : "#ffffff";
      g.fillText(r.name.slice(0, 14), 195, y);
      g.textAlign = "right";
      g.fillStyle = "#caffbf";
      g.fillText(String(r.hits), 690, y);
      g.fillStyle = "#ffadad";
      g.fillText(String(r.taken), 830, y);
      g.fillStyle = r.score > 0 ? "#caffbf" : r.score < 0 ? "#ffadad" : "#ffffff";
      g.fillText(r.score > 0 ? `+${r.score}` : String(r.score), 950, y);
    });
    if (d.status === "ended" && rows[0]) drawIcon(g, "trophy", Wc - 90, 70, 56, "#ffd166");
    boardTex.needsUpdate = true;
  };
  // the idle/countdown branches return early — make sure they upload too
  const drawBoard = (d: DodgeState, now: number, onCourt: number) => {
    drawCourtBoard(d, now, onCourt);
    boardTex.needsUpdate = true;
  };

  return {
    tick: (t, dt) => {
      for (const fn of ticks) fn(t, dt);
    },
    drawCourtBoard: drawBoard,
    setCourtMode: (mode) => {
      courtMode = mode;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
      scene.remove(root);
    },
  };
}
