/**
 * A linear program with two choices, drawn. The school garden plants beds of tomatoes (x) and beans (y). Each limit
 * (land, water, pupils' hours) is a straight line, and the plans that keep every limit are the shaded region. The
 * profit is a straight line too: slide it up and the last point of the region it touches is the best plan, always a
 * corner. That is why solvers (the simplex method) only walk from corner to corner.
 */
export interface Limit { id: "land" | "water" | "hours"; a: number; b: number; max: number }
export type P = readonly [number, number];

/** a·x + b·y ≤ max. Defaults chosen so every limit is an edge of the region: corners (0,0) (7,0) (6,2) (3,5) (0,6). */
export const LIMITS: Limit[] = [
  { id: "land", a: 1, b: 1, max: 8 },
  { id: "water", a: 2, b: 1, max: 14 },
  { id: "hours", a: 1, b: 3, max: 18 },
];
export const PRICES = { x: 30, y: 40 };
/** The drawing shows 0–10 beds of each. */
export const BOX = 10;

const EPS = 1e-9;
export const fits = (p: P, limits: readonly Limit[]) => p[0] >= -EPS && p[1] >= -EPS && limits.every((l) => l.a * p[0] + l.b * p[1] <= l.max + 1e-7);
export const profit = (p: P, px: number, py: number) => px * p[0] + py * p[1];

/** The region where every limit holds (x, y ≥ 0), as a polygon: the box clipped by each half-plane in turn. */
export function region(limits: readonly Limit[], box = BOX): P[] {
  let poly: P[] = [[0, 0], [box, 0], [box, box], [0, box]];
  for (const l of limits) {
    const side = (p: P) => l.max - (l.a * p[0] + l.b * p[1]); // ≥ 0 inside
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
      if (sp >= -EPS) out.push(p);
      if ((sp >= -EPS) !== (sq >= -EPS)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    poly = dedupe(out);
    if (!poly.length) return [];
  }
  return poly;
}

function dedupe(ps: P[]): P[] {
  const out: P[] = [];
  for (const p of ps) if (!out.some((q) => Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7)) out.push(p);
  return out;
}

/** The best corner for these prices (ties: the first corner found). For a linear goal the best is always at a corner. */
export function best(limits: readonly Limit[], px: number, py: number) {
  const corners = region(limits);
  let at: P = [0, 0], value = -Infinity;
  for (const c of corners) { const v = profit(c, px, py); if (v > value + 1e-9) { value = v; at = c; } }
  return { at, value, corners };
}

/** The limits that are met exactly at a point (the lines it sits on). */
export const tight = (p: P, limits: readonly Limit[]) => limits.filter((l) => Math.abs(l.a * p[0] + l.b * p[1] - l.max) < 1e-6).map((l) => l.id);

/** The profit line px·x + py·y = level, clipped to the drawing box (two end points, or none if it misses the box). */
export function profitLine(px: number, py: number, level: number, box = BOX): P[] {
  const pts: P[] = [];
  const add = (x: number, y: number) => { if (x >= -EPS && x <= box + EPS && y >= -EPS && y <= box + EPS && !pts.some((q) => Math.abs(q[0] - x) < 1e-7 && Math.abs(q[1] - y) < 1e-7)) pts.push([x, y]); };
  if (py > 0) { add(0, level / py); add(box, (level - px * box) / py); }
  if (px > 0) { add(level / px, 0); add((level - py * box) / px, box); }
  if (pts.length < 2) return [];
  pts.sort((p, q) => p[0] - q[0] || q[1] - p[1]);
  return [pts[0], pts[pts.length - 1]];
}

/** Rounds to one decimal, for a corner such as (4.4, 4.8). */
export const r1 = (v: number) => Math.round(v * 10) / 10;
