/** Tiny greyscale images for the vision labs: n×n numbers in [0, 1], row by row, row 0 at the top. */
export type Img = Float32Array;
export const blank = (n: number): Img => new Float32Array(n * n);

export function dot(img: Img, n: number, x: number, y: number, v = 1) {
  const c = Math.round(x), r = Math.round(y);
  if (c >= 0 && c < n && r >= 0 && r < n) img[r * n + c] = Math.max(img[r * n + c], v);
}
export function line(img: Img, n: number, x0: number, y0: number, x1: number, y1: number, v = 1) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
  for (let i = 0; i <= steps; i++) dot(img, n, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, v);
}
export function circle(img: Img, n: number, cx: number, cy: number, r: number, v = 1) {
  const steps = Math.max(12, Math.ceil(r * 12));
  for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; dot(img, n, cx + r * Math.cos(a), cy + r * Math.sin(a), v); }
}
export function rect(img: Img, n: number, x0: number, y0: number, x1: number, y1: number, v = 1, fill = false) {
  if (fill) { for (let y = Math.ceil(y0); y <= y1; y++) for (let x = Math.ceil(x0); x <= x1; x++) dot(img, n, x, y, v); return; }
  line(img, n, x0, y0, x1, y0, v); line(img, n, x1, y0, x1, y1, v); line(img, n, x1, y1, x0, y1, v); line(img, n, x0, y1, x0, y0, v);
}
