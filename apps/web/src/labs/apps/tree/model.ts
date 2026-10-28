/**
 * A decision tree learned with ID3: at each step ask the question whose answers best sort the examples, measured by
 * information gain (how much the question reduces the entropy, the "mixedness" of yes and no). The data is the
 * classic 14-day weather table, retold as "do we play football outside at break?".
 */
export const ATTRS = ["sky", "heat", "humid", "wind"] as const;
export type Attr = (typeof ATTRS)[number];
export const VALUES: Record<Attr, readonly string[]> = { sky: ["sunny", "cloudy", "rainy"], heat: ["hot", "mild", "cool"], humid: ["high", "normal"], wind: ["weak", "strong"] };
export type Day = Record<Attr, string>;
export interface Row extends Day { play: boolean }

const row = (sky: string, heat: string, humid: string, wind: string, play: boolean): Row => ({ sky, heat, humid, wind, play });
export const DATA: Row[] = [
  row("sunny", "hot", "high", "weak", false), row("sunny", "hot", "high", "strong", false), row("cloudy", "hot", "high", "weak", true),
  row("rainy", "mild", "high", "weak", true), row("rainy", "cool", "normal", "weak", true), row("rainy", "cool", "normal", "strong", false),
  row("cloudy", "cool", "normal", "strong", true), row("sunny", "mild", "high", "weak", false), row("sunny", "cool", "normal", "weak", true),
  row("rainy", "mild", "normal", "weak", true), row("sunny", "mild", "normal", "strong", true), row("cloudy", "mild", "high", "strong", true),
  row("cloudy", "hot", "normal", "weak", true), row("rainy", "mild", "high", "strong", false),
];

/** 0 when every answer is the same, 1 bit when it is half yes, half no. */
export function entropy(rows: Row[]) {
  if (!rows.length) return 0;
  const p = rows.filter((r) => r.play).length / rows.length;
  return p === 0 || p === 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}
export const split = (rows: Row[], a: Attr) => VALUES[a].map((v) => [v, rows.filter((r) => r[a] === v)] as const);
/** How much asking about `a` lowers the entropy, on average over its answers. */
export const gain = (rows: Row[], a: Attr) => entropy(rows) - split(rows, a).reduce((s, [, part]) => s + (part.length / rows.length) * entropy(part), 0);

/** A node's place in the tree: the answers on the way to it, like "sky=sunny/humid=high". */
export type Path = string;
export const child = (path: Path, a: Attr, v: string): Path => (path ? `${path}/` : "") + `${a}=${v}`;

export type Node =
  | { kind: "leaf"; path: Path; rows: Row[]; play: boolean }
  | { kind: "open"; path: Path; rows: Row[]; options: { attr: Attr; gain: number }[] }
  | { kind: "split"; path: Path; rows: Row[]; attr: Attr; kids: { value: string; node: Node }[] };

const majority = (rows: Row[]) => rows.filter((r) => r.play).length * 2 >= rows.length;

/**
 * Grows the tree from the learner's choices (path → question asked there). Pure or exhausted nodes become leaves. An
 * answer no day had (an empty branch) has nothing to learn from, so it goes with the majority one level up, as in ID3.
 */
export function grow(choices: ReadonlyMap<Path, Attr>, rows: Row[] = DATA, path: Path = "", used: Attr[] = [], fallback = true): Node {
  const left = ATTRS.filter((a) => !used.includes(a));
  if (!rows.length) return { kind: "leaf", path, rows, play: fallback };
  if (entropy(rows) === 0 || !left.length) return { kind: "leaf", path, rows, play: majority(rows) };
  const attr = choices.get(path);
  if (!attr) return { kind: "open", path, rows, options: left.map((a) => ({ attr: a, gain: gain(rows, a) })).sort((x, y) => y.gain - x.gain) };
  return { kind: "split", path, rows, attr, kids: split(rows, attr).map(([value, part]) => ({ value, node: grow(choices, part, child(path, attr, value), [...used, attr], majority(rows)) })) };
}

/** ID3: at every open node, ask the question with the biggest gain. */
export function auto(choices: ReadonlyMap<Path, Attr> = new Map()): Map<Path, Attr> {
  const out = new Map(choices);
  for (let open = findOpen(grow(out)); open; open = findOpen(grow(out))) out.set(open.path, open.options[0].attr);
  return out;
}
export function findOpen(n: Node): Extract<Node, { kind: "open" }> | null {
  if (n.kind === "open") return n;
  if (n.kind === "split") for (const k of n.kids) { const o = findOpen(k.node); if (o) return o; }
  return null;
}
export const questions = (n: Node): number => (n.kind === "split" ? 1 + n.kids.reduce((s, k) => s + questions(k.node), 0) : 0);

/** Follows the answers down the tree; null when the path reaches a node not decided yet. */
export function classify(n: Node, day: Day): { play: boolean | null; path: Path } {
  if (n.kind === "leaf") return { play: n.play, path: n.path };
  if (n.kind === "open") return { play: null, path: n.path };
  const k = n.kids.find((c) => c.value === day[n.attr])!;
  return classify(k.node, day);
}
export const accuracy = (n: Node, rows: Row[] = DATA) => rows.filter((r) => classify(n, r).play === r.play).length / rows.length;
