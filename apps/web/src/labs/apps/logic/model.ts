/**
 * Logic gates: tiny decisions made of electricity. Each gate turns one or two on/off inputs into one output. Chained
 * together they make every decision a chip takes, from a door alarm to a computer.
 */
export const GATES = ["AND", "OR", "NOT", "XOR", "NAND", "NOR"] as const;
export type Gate = (typeof GATES)[number];
export const TWO: Gate[] = ["AND", "OR", "XOR", "NAND", "NOR"];
export const gate = (g: Gate, a: boolean, b = false): boolean =>
  g === "AND" ? a && b : g === "OR" ? a || b : g === "NOT" ? !a : g === "XOR" ? a !== b : g === "NAND" ? !(a && b) : !(a || b);

/** Puzzles: make out = second(first(A, B), C) behave like the description. */
export const PUZZLES = {
  fan: { target: (a: boolean, b: boolean, c: boolean) => (a && b) || c }, // hot AND someone in, OR the teacher's switch
  alarm: { target: (a: boolean, b: boolean, c: boolean) => (a || b) && c }, // door OR window open, AND alarm armed
  lamp: { target: (a: boolean, b: boolean, c: boolean) => (a !== b) && c }, // stair lamp: either switch flips it, if the power is on
};
export type Puzzle = keyof typeof PUZZLES;
export const ROWS3 = Array.from({ length: 8 }, (_, i) => [!!(i & 4), !!(i & 2), !!(i & 1)] as const);
export const circuit = (g1: Gate, g2: Gate) => (a: boolean, b: boolean, c: boolean) => gate(g2, gate(g1, a, b), c);
export const solved = (p: Puzzle, g1: Gate, g2: Gate) => ROWS3.every(([a, b, c]) => circuit(g1, g2)(a, b, c) === PUZZLES[p].target(a, b, c));
