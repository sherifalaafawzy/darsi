/** 8×8 drawings. 1 is ink. No photographs. */
export const N = 8;

const dot = (rows: string[]): number[] => rows.join("").split("").map((c) => (c === "#" ? 1 : 0));

/** Two eyes and a mouth, close together. The training group. */
export const ROUND = dot([
  "........",
  "..#..#..",
  "..#..#..",
  "........",
  "........",
  ".######.",
  "........",
  "........",
]);
/** The same marks, spread wider. Never shown in training. */
export const WIDE = dot([
  "........",
  ".#....#.",
  ".#....#.",
  "........",
  "........",
  "########",
  "........",
  "........",
]);
/** A box. Not a face. */
export const BOX = dot([
  "########",
  "#......#",
  "#......#",
  "#......#",
  "#......#",
  "#......#",
  "#......#",
  "########",
]);

export interface Example { id: string; pixels: number[]; face: boolean; group: "round" | "wide" | "other" }

export const TRAIN: Example[] = [
  { id: "r1", pixels: ROUND, face: true, group: "round" },
];
export const TEST: Example[] = [
  { id: "r2", pixels: ROUND.map((v, i) => (i % 9 === 0 ? 0 : v)), face: true, group: "round" },
  { id: "w1", pixels: WIDE, face: true, group: "wide" },
  { id: "b1", pixels: BOX, face: false, group: "other" },
];

/** The detector is the average of the training faces. */
export function prototype(examples: Example[]): number[] {
  const faces = examples.filter((e) => e.face);
  const n = faces.length || 1;
  const out = Array(N * N).fill(0);
  for (const e of faces) e.pixels.forEach((v, i) => { out[i] += v / n; });
  return out;
}

/** How close a picture is to the prototype: 1 is identical, 0 is unrelated. */
export function likeness(proto: number[], pixels: number[]): number {
  let dot = 0, a = 0, b = 0;
  for (let i = 0; i < pixels.length; i++) {
    dot += proto[i]! * pixels[i]!;
    a += proto[i]! ** 2;
    b += pixels[i]! ** 2;
  }
  const d = Math.sqrt(a) * Math.sqrt(b);
  return d === 0 ? 0 : Math.max(0, dot / d);
}

export const FACE_LINE = 0.55;

/** Right when a face scores at or above the line and a non-face scores below it. */
export function judged(proto: number[], examples: Example[], line = FACE_LINE) {
  return examples.map((e) => {
    const score = likeness(proto, e.pixels);
    const said = score >= line;
    return { ...e, score, said, right: said === e.face };
  });
}
