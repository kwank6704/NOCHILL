/**
 * Radial fracture: rays from an impact point, cut by an irregular ring, with a
 * jagged midpoint on every ray. Neighbouring pieces share ray vertices, so the
 * pieces tile the object perfectly before they fly apart.
 */
export type Fragment = {
  /** Polygon vertices, relative to the fragment centroid. */
  poly: Float32Array;
  /** Centroid, relative to the sprite centre. */
  cx: number;
  cy: number;
};

const TAU = Math.PI * 2;

export function fracture(w: number, h: number, ix: number, iy: number, rays: number): Fragment[] {
  const R = Math.hypot(w, h) * 0.75;
  const angles: number[] = [];
  const base = Math.random() * TAU;
  for (let i = 0; i < rays; i++) {
    angles.push(base + ((i + 0.5 + (Math.random() - 0.5) * 0.7) / rays) * TAU);
  }

  const inner: [number, number][] = [];
  const mid: [number, number][] = [];
  const outer: [number, number][] = [];
  for (const a of angles) {
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const r1 = Math.min(w, h) * (0.16 + Math.random() * 0.22);
    const rm = r1 + (Math.min(w, h) * 0.5 - r1) * (0.4 + Math.random() * 0.4);
    const jit = (Math.random() - 0.5) * 10;
    inner.push([ix + ux * r1, iy + uy * r1]);
    mid.push([ix + ux * rm - uy * jit, iy + uy * rm + ux * jit]);
    outer.push([ix + ux * R, iy + uy * R]);
  }

  const polys: [number, number][][] = [];
  for (let i = 0; i < rays; i++) {
    const j = (i + 1) % rays;
    polys.push([[ix, iy], inner[i], inner[j]]);
    polys.push([inner[i], mid[i], outer[i], outer[j], mid[j], inner[j]]);
  }

  const hw = w / 2;
  const hh = h / 2;
  const out: Fragment[] = [];
  for (const p of polys) {
    // Clip to the sprite rectangle so centroids reflect visible material.
    const clipped = clipRect(p, -hw, -hh, hw, hh);
    if (clipped.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of clipped) {
      cx += x;
      cy += y;
    }
    cx /= clipped.length;
    cy /= clipped.length;
    const poly = new Float32Array(clipped.length * 2);
    clipped.forEach(([x, y], k) => {
      poly[k * 2] = x - cx;
      poly[k * 2 + 1] = y - cy;
    });
    out.push({ poly, cx, cy });
  }
  return out;
}

/** Sutherland–Hodgman against an axis-aligned rectangle. */
function clipRect(poly: [number, number][], x0: number, y0: number, x1: number, y1: number) {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= x0, (a, b) => lerpAt(a, b, (x0 - a[0]) / (b[0] - a[0]))],
    [(p) => p[0] <= x1, (a, b) => lerpAt(a, b, (x1 - a[0]) / (b[0] - a[0]))],
    [(p) => p[1] >= y0, (a, b) => lerpAt(a, b, (y0 - a[1]) / (b[1] - a[1]))],
    [(p) => p[1] <= y1, (a, b) => lerpAt(a, b, (y1 - a[1]) / (b[1] - a[1]))],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (!out.length) break;
  }
  return out;
}

const lerpAt = (a: [number, number], b: [number, number], t: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
