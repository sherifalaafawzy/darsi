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

/**
 * The lab's picture: a blob in the middle and two bright specks on opposite sides. The specks balance, so the code (the
 * centre of the brightness) is still the middle; but two numbers can't keep them, so the decode loses them, and moving
 * the code anywhere makes the difference grow. A plain painted blob came back pixel for pixel (difference 0), so the lab
 * never showed a summary forgetting anything; a single speck pulled the code off the blob, so one nudge back toward the
 * blob made the difference smaller.
 */
export const PICTURE: number[] = (() => {
  const p = paint(0.5, 0.5);
  p[1 * N + 1] = 0.9;
  p[6 * N + 6] = 0.9;
  return p;
})();

export const mse = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / a.length;
