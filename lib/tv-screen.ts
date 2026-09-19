// ─── Cozy Hall · live TV overlay handoff ─────────────────────────────────────
// YouTube pixels can't enter WebGL (cross-origin iframes taint canvas), so
// the hall's TV shows real video through a DOM iframe pinned exactly over
// the 3D screen instead: the render loop projects the screen's four corners
// to CSS pixels here every frame and paints its box in the SAME tick, right
// before the frame is drawn. No React re-renders — same handoff as the
// in-world prompt anchor. The canvas status card underneath stays the
// fallback (no video / API blocked / facing away).
//
// One tick owns both, on purpose: a second rAF loop (or the wrong camera
// matrix) leaves the DOM a frame behind the canvas, which reads as the
// picture sliding across the TV whenever the camera moves.

export interface TvQuad {
  x0: number;
  y0: number; // top-left
  x1: number;
  y1: number; // top-right
  x2: number;
  y2: number; // bottom-right
  x3: number;
  y3: number; // bottom-left
}

/** overlay box — the same aspect as the 3D screen (4.8 × 2.6 world units) */
export const TV_OVERLAY_W = 480;
export const TV_OVERLAY_H = 260;

/** scene → overlay handoff: screen quad in CSS px, the overlay's box, and
 *  the gates both sides share. The render loop owns `visible` (per frame),
 *  the overlay owns `ready` (its muted player can show a frame), and only
 *  the render tick ever touches the element's style. */
export const tvScreenAnchor: {
  visible: boolean;
  ready: boolean;
  el: HTMLElement | null;
  /** last painted state — the scene rewrites only on change */
  shown: boolean;
  matrix: string;
} & TvQuad = {
  visible: false,
  ready: false,
  el: null,
  shown: false,
  matrix: "",
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  x3: 0,
  y3: 0,
};

/**
 * Paint the overlay onto the projected quad — called by the scene's render
 * loop in the tick that computes the corners and draws the frame, so the
 * DOM layer and the canvas always show the same camera. Hides (and stays
 * hidden) until the screen is in view and the overlay can actually show a
 * frame; the canvas status card is the fallback underneath.
 */
export function paintTvScreen(): void {
  const el = tvScreenAnchor.el;
  if (!el) return;
  const show = tvScreenAnchor.visible && tvScreenAnchor.ready;
  if (show !== tvScreenAnchor.shown) {
    tvScreenAnchor.shown = show;
    el.style.display = show ? "block" : "none";
  }
  if (!show) return;
  const m = quadToMatrix3d(tvScreenAnchor, TV_OVERLAY_W, TV_OVERLAY_H);
  if (m === tvScreenAnchor.matrix) return;
  tvScreenAnchor.matrix = m;
  el.style.transform = m;
}

/**
 * CSS matrix3d mapping a w×h box (origin top-left) onto a screen quad.
 * Solves the 8-parameter 2D homography with h33 = 1 — pure math, no DOM.
 */
export function quadToMatrix3d(q: TvQuad, w: number, h: number): string {
  // correspondences: (0,0)->p0, (w,0)->p1, (w,h)->p2, (0,h)->p3
  const src: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const dst: Array<[number, number]> = [
    [q.x0, q.y0],
    [q.x1, q.y1],
    [q.x2, q.y2],
    [q.x3, q.y3],
  ];
  // 8×8 system Ah = b, h = [h11,h12,h13,h21,h22,h23,h31,h32]
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const H = solve8(A, b);
  const f = (n: number) => (Math.abs(n) < 5e-12 ? 0 : +n.toFixed(6));
  // CSS matrix3d lists COLUMN-major: (h11,h21,0,h31, h12,h22,0,h32, …).
  // (Row-major here would silently transpose — identical only for
  // identity/translation/scale, mirrored for real perspective.)
  return `matrix3d(${f(H[0])},${f(H[3])},0,${f(H[6])},${f(H[1])},${f(H[4])},0,${f(H[7])},0,0,1,0,${f(H[2])},${f(H[5])},0,1)`;
}

/** Gaussian elimination with partial pivoting for the 8×8 above. */
function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) continue; // degenerate — shouldn't happen
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = M[r][col];
      if (k === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= k * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}
