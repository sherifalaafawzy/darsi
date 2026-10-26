/** A 10×10 picture and the simple maths that changes it: every edit is arithmetic on the numbers. */
import { blank, circle, dot, line, rect, type Img } from "../../kit/raster";

export const N = 10;
export type Preset = "smile" | "house" | "sun";
export function preset(p: Preset): Img {
  const img = blank(N);
  if (p === "smile") { circle(img, N, 4.5, 4.5, 4); dot(img, N, 3, 3); dot(img, N, 6, 3); line(img, N, 3, 6, 6, 6); dot(img, N, 2.6, 5.4, 0.6); dot(img, N, 6.4, 5.4, 0.6); }
  else if (p === "house") { line(img, N, 1, 4, 4.5, 1); line(img, N, 4.5, 1, 8, 4); rect(img, N, 2, 4, 7, 9); rect(img, N, 4, 6, 5, 9, 0.6, true); }
  else { circle(img, N, 4.5, 4.5, 2); rect(img, N, 4, 4, 5, 5, 1, true); for (const [x, y] of [[4.5, 0.5], [4.5, 8.5], [0.5, 4.5], [8.5, 4.5], [1.5, 1.5], [7.5, 7.5], [1.5, 7.5], [7.5, 1.5]]) dot(img, N, x, y, 0.6); }
  return img;
}
export const invert = (img: Img) => img.map((v) => 1 - v);
export const brighten = (img: Img, by: number) => img.map((v) => Math.min(1, Math.max(0, v + by)));
/** Moves every pixel one column (picture coordinates: column 0 is on the left, as the camera saw it). */
export function shift(img: Img, n = N): Img {
  const out = blank(n);
  for (let r = 0; r < n; r++) for (let c = 1; c < n; c++) out[r * n + c] = img[r * n + c - 1];
  return out;
}
/** 0–9 per pixel, the way the lab prints it. */
export const level = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 9);
