/**
 * Teach it to see: a small network (144 pixels → 16 hidden neurons → 3 shapes) learns from drawings. Every drawing is
 * first moved to the middle and resized, as real vision systems do, so the network only has to learn the shape.
 */
import { argmax } from "../../kit/math";
import { Net } from "../../kit/nn";
import { blank, circle, line, type Img } from "../../kit/raster";
import { rng } from "../../kit/rng";

export const N = 12;
export const SHAPES = ["circle", "cross", "line"] as const;
export type Shape = (typeof SHAPES)[number];
export interface Example { img: Img; shape: Shape }

/** Thicken strokes the way a finger drawing does (the drawing grid paints the 4 neighbours at half strength). */
function thicken(img: Img, n = N): Img {
  const out = Float32Array.from(img);
  for (let i = 0; i < n * n; i++) {
    if (img[i] < 1) continue;
    const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) out[rr * n + cc] = Math.max(out[rr * n + cc], 0.5); }
  }
  return out;
}

/** A drawing of `shape` at a random spot and size: the starter examples, and fresh ones for testing. */
export function draw(shape: Shape, seed: number): Img {
  const r = rng(seed), img = blank(N);
  const cx = 5.5 + (r() - 0.5) * 2, cy = 5.5 + (r() - 0.5) * 2;
  if (shape === "circle") circle(img, N, cx, cy, 2.5 + r() * 1.5);
  else if (shape === "cross") { const s = 2 + r() * 2; line(img, N, cx - s, cy - s, cx + s, cy + s); line(img, N, cx - s, cy + s, cx + s, cy - s); }
  else { const a = r() * Math.PI, h = 3 + r() * 1.5; line(img, N, cx - h * Math.cos(a), cy - h * Math.sin(a), cx + h * Math.cos(a), cy + h * Math.sin(a)); }
  return thicken(img);
}

export const starters = (perShape = 5, seed = 1): Example[] => SHAPES.flatMap((shape, k) => Array.from({ length: perShape }, (_, i) => ({ shape, img: draw(shape, seed * 1000 + k * 100 + i) })));

const ink = (img: Img) => img.reduce((a, v) => a + (v > 0.3 ? 1 : 0), 0);
export const isBlank = (img: Img) => ink(img) < 3;

/** Move the drawing to the middle and resize it to fill the grid (with a one-pixel margin), sampling smoothly. */
export function normalize(img: Img, n = N): Img {
  let r0 = n, r1 = -1, c0 = n, c1 = -1;
  for (let i = 0; i < n * n; i++) if (img[i] > 0.3) { const r = Math.floor(i / n), c = i % n; r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const out = blank(n);
  if (r1 < 0) return out;
  const scale = Math.max(r1 - r0 + 1, c1 - c0 + 1) / (n - 2), cy = (r0 + r1) / 2, cx = (c0 + c1) / 2, mid = (n - 1) / 2;
  const px = (r: number, c: number) => (r >= 0 && r < n && c >= 0 && c < n ? img[r * n + c] : 0);
  for (let R = 0; R < n; R++) for (let C = 0; C < n; C++) {
    const y = cy + (R - mid) * scale, x = cx + (C - mid) * scale, y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
    out[R * n + C] = px(y0, x0) * (1 - fy) * (1 - fx) + px(y0, x0 + 1) * (1 - fy) * fx + px(y0 + 1, x0) * fy * (1 - fx) + px(y0 + 1, x0 + 1) * fy * fx;
  }
  return out;
}

export const makeNet = (seed = 7) => new Net({ sizes: [N * N, 16, SHAPES.length], hidden: "tanh", output: "softmax", seed });
export const target = (s: Shape) => SHAPES.map((x) => (x === s ? 1 : 0));
export const batch = (ex: Example[]) => ({ X: ex.map((e) => normalize(e.img)), T: ex.map((e) => target(e.shape)) });
export const guess = (net: Net, img: Img) => Array.from(net.predict(normalize(img)));
export function accuracy(net: Net, ex: Example[]) {
  if (!ex.length) return 0;
  return ex.filter((e) => SHAPES[argmax(guess(net, e.img))] === e.shape).length / ex.length;
}
export const RATE = 0.15;
