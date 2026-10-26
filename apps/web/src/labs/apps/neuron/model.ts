/** One artificial neuron: a weighted sum of the inputs plus a bias, squashed by an activation function. */
export type Activation = "step" | "sigmoid";

export const activate = (z: number, f: Activation) => (f === "step" ? (z >= 0 ? 1 : 0) : 1 / (1 + Math.exp(-z)));
export const weightedSum = (x: readonly number[], w: readonly number[], b: number) => x.reduce((s, xi, i) => s + xi * w[i], b);
/** The neuron's yes/no answer: output of at least 0.5. */
export const decide = (x: readonly number[], w: readonly number[], b: number, f: Activation) => activate(weightedSum(x, w, b), f) >= 0.5;

/** Inputs: how cloudy (0–1), the forecast's chance of rain (0–1), and whether it is the rainy season (0 or 1). */
export interface Day { x: [number, number, number]; umbrella: boolean }
export const DAYS: Day[] = [
  { x: [0.1, 0.05, 0], umbrella: false }, // sunny, dry season
  { x: [0.9, 0.7, 1], umbrella: true },   // cloudy, likely rain, rainy season
  { x: [0.8, 0.1, 0], umbrella: false },  // cloudy but a dry forecast
  { x: [0.3, 0.8, 1], umbrella: true },   // light cloud, rain forecast
];
export const score = (w: readonly number[], b: number, f: Activation) => DAYS.filter((d) => decide(d.x, w, b, f) === d.umbrella).length;
