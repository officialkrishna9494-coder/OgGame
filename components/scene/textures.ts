// ─── Cozy Hall · procedural textures ────────────────────────────────────────
// Everything is painted on canvases at load time: no image assets to fetch,
// crisp at any zoom, and each texture is created once and shared.

import * as THREE from "three";
import { TRACK_PLANE, TRACK_POINTS, TRACK_WIDTH, sampleTrackCenterline } from "../../lib/hall-layout";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// deterministic noise so every client paints the same floor
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Warm oak planks with staggered joints and soft grain. One tile = 4 × 4 m. */
export function woodFloorTexture(worldW: number, worldD: number): THREE.CanvasTexture {
  const { c, g } = canvas(1024, 1024);
  const r = rng(7);
  const rows = 8;
  const rowH = 1024 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 300;
    while (x < 1024) {
      const len = 260 + r() * 300;
      const tone = 0.93 + r() * 0.1;
      const base = [233, 212, 174].map((v) => Math.min(255, Math.round(v * tone)));
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(x, row * rowH, len, rowH);
      // grain
      g.strokeStyle = `rgba(160,120,70,${0.06 + r() * 0.06})`;
      g.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) {
        const y = row * rowH + 8 + r() * (rowH - 16);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 8, x + len * 0.7, y + (r() - 0.5) * 8, x + len, y);
        g.stroke();
      }
      // end joint
      g.fillStyle = "rgba(150,110,70,0.35)";
      g.fillRect(x + len - 2, row * rowH, 3, rowH);
      x += len;
    }
    g.fillStyle = "rgba(150,110,70,0.4)";
    g.fillRect(0, row * rowH, 1024, 3);
  }
  return tex(c, [worldW / 4, worldD / 4]);
}

/** Rounded river stones for the fireplace. */
export function stoneTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(512, 512);
  const r = rng(21);
  g.fillStyle = "#b8a99a";
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 9; row++) {
    let x = -r() * 40;
    const y = row * 58 + 4;
    while (x < 512) {
      const w = 60 + r() * 50;
      const shade = 170 + Math.round(r() * 50);
      g.fillStyle = `rgb(${shade},${shade - 12},${shade - 24})`;
      g.beginPath();
      g.roundRect(x + 3, y + 3, w - 6, 50, 18);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.beginPath();
      g.roundRect(x + 8, y + 7, w - 22, 14, 8);
      g.fill();
      x += w;
    }
  }
  return tex(c, [1, 3]);
}

/** Round rug: soft rings + dotted border. */
export function roundRugTexture(outer: string, inner: string, accent: string): THREE.CanvasTexture {
  const { c, g } = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = outer;
  g.beginPath();
  g.arc(256, 256, 254, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = inner;
  g.beginPath();
  g.arc(256, 256, 186, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.setLineDash([2, 16]);
  g.lineCap = "round";
  g.beginPath();
  g.arc(256, 256, 222, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 3;
  g.globalAlpha = 0.5;
  g.beginPath();
  g.arc(256, 256, 120, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  return tex(c);
}

/** Oval hearth rug with a woven stripe pattern. */
export function ovalRugTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(512, 512);
  const rings = ["#c8553d", "#f2d0a4", "#9a3f2e", "#f6e7cb", "#c8553d", "#f2d0a4"];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(256, 256, 254 - i * 40, 0, Math.PI * 2);
    g.fill();
  });
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.lineWidth = 2;
  for (let rr = 20; rr < 254; rr += 13) {
    g.beginPath();
    g.arc(256, 256, rr, 0, Math.PI * 2);
    g.stroke();
  }
  return tex(c);
}

/** Dodgeball court floor: painted boundary, centre line + circle, corner arcs. */
export function courtTexture(w: number, d: number): THREE.CanvasTexture {
  const px = 64;
  const { c, g } = canvas(Math.round(w * px), Math.round(d * px));
  const W = c.width;
  const H = c.height;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#bfe6f0");
  grad.addColorStop(1, "#cfeee2");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // subtle court boards
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = 0; x < W; x += px) g.fillRect(x, 0, 2, H);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 10;
  const m = 26;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.beginPath();
  g.moveTo(W / 2, m);
  g.lineTo(W / 2, H - m);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, px * 1.4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.arc(W / 2, H / 2, px * 0.45, 0, Math.PI * 2);
  g.fill();
  // attack lines
  g.setLineDash([22, 18]);
  g.lineWidth = 6;
  for (const f of [0.3, 0.7]) {
    g.beginPath();
    g.moveTo(W * f, m);
    g.lineTo(W * f, H - m);
    g.stroke();
  }
  g.setLineDash([]);
  return tex(c);
}

/** Café chalkboard menu. */
export function chalkboardTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(768, 480);
  g.fillStyle = "#2f4a3f";
  g.fillRect(0, 0, 768, 480);
  // chalk dust
  g.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 90; i++) g.fillRect((i * 97) % 768, (i * 53) % 480, 60, 6);
  g.fillStyle = "#fdf6e3";
  g.textAlign = "center";
  g.font = "700 64px ui-rounded, 'Segoe Print', system-ui, sans-serif";
  g.fillText("Cozy Café", 384, 92);
  g.strokeStyle = "#ffd6a5";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(230, 118);
  g.quadraticCurveTo(384, 140, 538, 118);
  g.stroke();
  g.font = "500 38px ui-rounded, 'Segoe Print', system-ui, sans-serif";
  const items: Array<[string, string]> = [
    ["hot cocoa", "3"],
    ["honey latte", "4"],
    ["matcha", "4"],
    ["cookie", "2"],
  ];
  items.forEach(([name, price], i) => {
    const y = 196 + i * 62;
    g.textAlign = "left";
    g.fillStyle = "#fdf6e3";
    g.fillText(name, 150, y);
    g.textAlign = "right";
    g.fillStyle = "#ffd6a5";
    g.fillText(price, 620, y);
    g.fillStyle = "rgba(253,246,227,0.35)";
    g.fillRect(330, y - 10, 220, 3);
  });
  // cup doodle
  g.strokeStyle = "#fdf6e3";
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(660, 360, 70, 60, 12);
  g.stroke();
  g.beginPath();
  g.arc(738, 390, 16, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(675 + i * 20, 350);
    g.quadraticCurveTo(665 + i * 20, 330, 680 + i * 20, 310);
    g.stroke();
  }
  return tex(c);
}

/** Sky + hills seen through a window (the clouds are a separate moving layer). */
export function windowViewTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(512, 384);
  const sky = g.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, "#9fd8ff");
  sky.addColorStop(1, "#e7f6ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 384);
  g.fillStyle = "rgba(255,243,176,0.5)";
  g.beginPath();
  g.arc(120, 90, 66, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff3b0";
  g.beginPath();
  g.arc(120, 90, 42, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#b5e3b5";
  g.beginPath();
  g.ellipse(130, 420, 240, 120, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#93d193";
  g.beginPath();
  g.ellipse(420, 430, 220, 110, 0, 0, Math.PI * 2);
  g.fill();
  // a far-off tree line
  g.fillStyle = "#7cc07c";
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc(30 + i * 60, 318 + (i % 2) * 8, 22, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Tileable transparent clouds; animate `offset.x` to make them drift. */
export function cloudLayerTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(512, 256);
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.92)";
  const cloud = (x: number, y: number, s: number) => {
    for (const dx of [0, 512]) {
      g.beginPath();
      g.arc(x + dx, y, 22 * s, 0, Math.PI * 2);
      g.arc(x + dx + 26 * s, y - 10 * s, 28 * s, 0, Math.PI * 2);
      g.arc(x + dx + 56 * s, y, 21 * s, 0, Math.PI * 2);
      g.arc(x + dx + 28 * s, y + 6 * s, 22 * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  cloud(40, 70, 1.1);
  cloud(250, 120, 0.8);
  cloud(400, 60, 0.9);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Soft round glow for sprites (bulbs, flames, embers, steam). */
export function glowTexture(inner = "rgba(255,230,170,1)", outer = "rgba(255,200,120,0)"): THREE.CanvasTexture {
  const { c, g } = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** The court's start pad: ring + label. */
export function padTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = "rgba(76,201,240,0.28)";
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 18;
  g.beginPath();
  g.arc(256, 256, 214, 0, Math.PI * 2);
  g.stroke();
  // volleyball-style seams
  g.lineWidth = 12;
  g.beginPath();
  g.arc(256, 190, 70, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(206, 140);
  g.quadraticCurveTo(256, 200, 306, 140);
  g.moveTo(190, 205);
  g.quadraticCurveTo(256, 190, 322, 205);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "900 64px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("START", 256, 356);
  g.font = "700 32px ui-rounded, system-ui, sans-serif";
  g.fillText("dodgeball", 256, 398);
  return tex(c);
}

/** Raceway: twisty two-lane ribbon with curbs, dashes, start checker + arrows. */
export function trackTexture(): THREE.CanvasTexture {
  // Paint plane = TRACK_PLANE (74 × 32 world); canvas top = world −z.
  // The loop is the sampled TRACK_POINTS centerline — move the track in
  // lib/hall-layout, never here.
  const PX = 24;
  const PW = TRACK_PLANE.x1 - TRACK_PLANE.x0;
  const PD = TRACK_PLANE.z1 - TRACK_PLANE.z0;
  const W = Math.round(PW * PX);
  const H = Math.round(PD * PX);
  const { c, g } = canvas(W, H);
  const X = (wx: number) => ((wx - TRACK_PLANE.x0) / PW) * W;
  const Y = (wz: number) => ((wz - TRACK_PLANE.z0) / PD) * H;
  const S = (wm: number) => wm * PX; // world metres → px
  // grass base
  g.fillStyle = "#8fae7e";
  g.fillRect(0, 0, W, H);
  // subtle mow stripes
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < PD / 4; i++) g.fillRect(0, (i * 4 * PX) % H, W, 2 * PX);
  const loop = sampleTrackCenterline(24);
  const trace = () => {
    g.beginPath();
    loop.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z))));
    g.closePath();
  };
  // curbs: white base, red dashes, then asphalt over the middle
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = "#f4f1ea";
  g.lineWidth = S(TRACK_WIDTH + 0.9);
  trace();
  g.stroke();
  g.strokeStyle = "#e6395f";
  g.lineWidth = S(TRACK_WIDTH + 0.9);
  g.setLineDash([S(1.5), S(1.5)]);
  trace();
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = "#4a4d5e";
  g.lineWidth = S(TRACK_WIDTH);
  trace();
  g.stroke();
  // asphalt noise
  const rand = rng(7);
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 900; i++) g.fillRect(rand() * W, rand() * H, 3, 3);
  // two lanes: centre divider dashes along the loop
  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.lineWidth = S(0.22);
  g.setLineDash([S(1.6), S(1.4)]);
  trace();
  g.stroke();
  g.setLineDash([]);
  // start/finish checker across the line at TRACK_POINTS[0], square to travel
  {
    const [sx, sz] = TRACK_POINTS[0];
    const n0 = loop[0];
    const n1 = loop[8 % loop.length];
    const ang = Math.atan2(n1.z - n0.z, n1.x - n0.x); // canvas: x→x, y→z
    g.save();
    g.translate(X(sx), Y(sz));
    g.rotate(ang);
    const bw = S(1); // 1 m along travel
    const bh = S(TRACK_WIDTH); // full ribbon across
    const rows = 2;
    const cols = 7;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        g.fillStyle = (r + q) % 2 ? "#23232b" : "#f4f1ea";
        g.fillRect(-bw / 2 + (bw / rows) * r, -bh / 2 + (bh / cols) * q, bw / rows + 1, bh / cols + 1);
      }
    }
    g.restore();
  }
  // travel arrows sampled along the loop (pointing at the next sample)
  g.fillStyle = "rgba(255,255,255,0.65)";
  const arrowAt = (i: number) => {
    const p = loop[i % loop.length];
    const q = loop[(i + 8) % loop.length];
    const ang = Math.atan2(q.x - p.x, q.z - p.z);
    const ax = X(p.x);
    const ay = Y(p.z);
    const s = S(1.1);
    g.save();
    g.translate(ax, ay);
    // canvas x = world x, canvas y = world z: tip (+x local) → (dx, dz)
    g.rotate(Math.PI / 2 - ang);
    g.beginPath();
    g.moveTo(-s, -s * 0.7);
    g.lineTo(s * 0.6, 0);
    g.lineTo(-s, s * 0.7);
    g.lineTo(-s * 0.25, 0);
    g.closePath();
    g.fill();
    g.restore();
  };
  const step = Math.floor(loop.length / 8);
  for (let k = 0; k < 8; k++) arrowAt(k * step + 4);
  // painted title in the infield, reads from the camera side
  g.save();
  g.translate(X(-60), Y(-1));
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.font = "800 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("TURBO RACEWAY", 0, 0);
  g.restore();
  return tex(c);
}

/** Yellow/black chevrons for ramp slopes. */
export function chevronTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(256, 256);
  g.fillStyle = "#f4a259";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#23232b";
  for (let i = -2; i < 6; i++) {
    g.beginPath();
    const x = i * 64;
    g.moveTo(x, 256);
    g.lineTo(x + 64, 256);
    g.lineTo(x + 64 + 64, 0);
    g.lineTo(x + 64, 0);
    g.closePath();
    g.fill();
  }
  return tex(c);
}

/** Start/finish banner across the line. */
export function bannerTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(1024, 128);
  g.fillStyle = "#23232b";
  g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 32; i++) {
    g.fillStyle = i % 2 ? "#f4f1ea" : "#23232b";
    g.fillRect(i * 32, 0, 32, 16);
    g.fillStyle = i % 2 ? "#23232b" : "#f4f1ea";
    g.fillRect(i * 32, 112, 32, 16);
  }
  g.fillStyle = "#ffd166";
  g.font = "900 64px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("TURBO RACEWAY", 512, 88);
  return tex(c);
}

/** Hanging sign for the big door (arrow drawn, never an emoji). */
export function doorSignTexture(left: boolean): THREE.CanvasTexture {
  const { c, g } = canvas(512, 256);
  g.fillStyle = "#2b2430";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#ffd166";
  g.lineWidth = 10;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = "#ffd166";
  g.beginPath();
  if (left) {
    g.moveTo(70, 128);
    g.lineTo(150, 78);
    g.lineTo(150, 178);
  } else {
    g.moveTo(442, 128);
    g.lineTo(362, 78);
    g.lineTo(362, 178);
  }
  g.closePath();
  g.fill();
  g.fillStyle = "#f4f1ea";
  g.font = "900 72px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("RACEWAY", 256, 148);
  return tex(c);
}
