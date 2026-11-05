export const N = 8;

/** Brightness of a blob whose centre is (cx, cy), each in 0..1. */
export function paint(cx: number, cy: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const dx = c / (N - 1) - cx, dy = r / (N - 1) - cy;
    out.push(Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.38));
  }
  return out;
}

/** The code: where the brightness sits, as two numbers in 0..1. */
export function encode(pixels: number[]): { x: number; y: number } {
  let w = 0, sx = 0, sy = 0;
  pixels.forEach((v, i) => {
    w += v; sx += v * (i % N); sy += v * Math.floor(i / N);
  });
  if (w === 0) return { x: 0.5, y: 0.5 };
  return { x: sx / w / (N - 1), y: sy / w / (N - 1) };
}

export const decode = (x: number, y: number) => paint(x, y);

export const mse = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / a.length;
