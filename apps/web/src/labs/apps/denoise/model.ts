export const N = 8;

/** A plus sign. */
export const CLEAN: number[] = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N), c = i % N;
  return r === 3 || c === 3 ? 1 : 0;
});

/** Mix the clean picture with a fixed noise pattern. t = 0 is clean, t = 1 is noise. */
export function addNoise(clean: number[], t: number, noise: number[]): number[] {
  return clean.map((v, i) => (1 - t) * v + t * noise[i]!);
}

export function noisePattern(seed = 3): number[] {
  let s = seed;
  return Array.from({ length: N * N }, () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return (s % 1000) / 1000;
  });
}

/** One step toward black or white, whichever this pixel is closer to. A real model learns the step; this one only shows a single pull. */
export function denoiseStep(img: number[], amount = 0.5): number[] {
  return img.map((v) => {
    const target = v >= 0.5 ? 1 : 0;
    return v + amount * (target - v);
  });
}

export const mse = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / a.length;
