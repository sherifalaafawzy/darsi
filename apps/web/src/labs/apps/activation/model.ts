/** The four activation functions every network course meets first. */
export type Fn = "step" | "sigmoid" | "tanh" | "relu";
export const FNS: Fn[] = ["step", "sigmoid", "tanh", "relu"];
export const apply: Record<Fn, (z: number) => number> = {
  step: (z) => (z >= 0 ? 1 : 0),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  tanh: Math.tanh,
  relu: (z) => Math.max(0, z),
};
/** The range of outputs each one can give (ReLU has no top). */
export const RANGE: Record<Fn, [number, number | null]> = { step: [0, 1], sigmoid: [0, 1], tanh: [-1, 1], relu: [0, null] };
export const curve = (f: Fn, from = -6, to = 6, n = 121) => Array.from({ length: n }, (_, i) => { const z = from + ((to - from) * i) / (n - 1); return [z, apply[f](z)] as const; });
