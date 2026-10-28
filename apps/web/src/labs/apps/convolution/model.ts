/**
 * Convolution: a 3×3 grid of weights (a filter) slides over the picture; at each spot it multiplies the 9 pixels under
 * it by its weights and adds them up. Vision networks learn their filters; here we pick classic ones.
 */
import { blank, circle, type Img } from "../../kit/raster";

export const N = 24;
export type Kernel = number[]; // 9 weights, row by row
export const KERNELS: Record<"vertical" | "horizontal" | "outline" | "blur" | "sharpen", Kernel> = {
  vertical: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  horizontal: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  outline: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  blur: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9],
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
};
/**
 * "My own" starts as a diagonal edge filter (top-right minus bottom-left): it lights up edges that slope like \, such
 * as the right side of the roof, far more than / ones. Mirrored left to right, it lights up the left side instead.
 */
export const CUSTOM: Kernel = [0, 1, 2, -1, 0, 1, -2, -1, 0];

/** A small school with a door, two windows, a roof and the sun. Later parts paint over earlier ones. */
export function picture(): Img {
  const img = blank(N);
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img[y * N + x] = v; };
  for (let y = 6; y <= 11; y++) { const half = Math.round((y - 5) * 1.3); fill(11 - half, y, 12 + half, y, 0.5); } // roof
  fill(5, 12, 18, 21, 0.85); // walls
  fill(7, 14, 8, 15, 0); fill(15, 14, 16, 15, 0); // windows
  fill(10, 16, 13, 21, 0.3); // door
  circle(img, N, 20, 3, 1.6, 0.9); circle(img, N, 20, 3, 0.8, 0.9); // sun
  return img;
}

/** The filter's sum at one spot (r, c); pixels outside the picture count as 0. */
export function at(img: Img, k: Kernel, r: number, c: number, n = N) {
  let s = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) s += img[rr * n + cc] * k[(dr + 1) * 3 + dc + 1];
  }
  return s;
}
export const convolve = (img: Img, k: Kernel, n = N) => Float32Array.from({ length: n * n }, (_, i) => at(img, k, Math.floor(i / n), i % n, n));
/** For showing: strength of the response, 0–1 (edges can be negative; we show how strong they are). */
export const display = (out: Img) => out.map((v) => Math.min(1, Math.abs(v)));
/** 2×2 max pooling: keeps the strongest response in each block, halving the size. */
export function pool(img: Img, n = N): Img {
  const m = n / 2, out = blank(m);
  for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) out[r * m + c] = Math.max(img[2 * r * n + 2 * c], img[2 * r * n + 2 * c + 1], img[(2 * r + 1) * n + 2 * c], img[(2 * r + 1) * n + 2 * c + 1]);
  return out;
}
