/**
 * Word vectors for the language labs: count which words appear together, weigh the counts (PPMI), compare with
 * cosine similarity, and squash to a few dimensions (PCA) to draw or to feed a tiny model. Plain arrays; vocabularies
 * stay under a hundred words, so everything runs instantly.
 */
import { matchKey, sentences, words } from "./text";

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const norm = (a: ArrayLike<number>) => Math.sqrt(dot(a, a));
export const cosine = (a: ArrayLike<number>, b: ArrayLike<number>) => { const d = norm(a) * norm(b); return d ? dot(a, b) / d : 0; };

export interface Vocab {
  /** Match keys in order of first appearance. */
  keys: string[];
  /** Key → how it was first written. */
  surface: Map<string, string>;
  /** Each sentence as match keys, small words removed. */
  sents: string[][];
}

/** Content words of a text: small words are dropped, and so are words seen fewer than `min` times. */
export function vocab(text: string, stop: ReadonlySet<string>, min = 2): Vocab {
  const surface = new Map<string, string>(), counts = new Map<string, number>();
  const raw = sentences(text).map((s) => words(s).map((w) => {
    const k = matchKey(w), cur = surface.get(k);
    // Keep the first spelling, but prefer "clouds" to a sentence-initial "Clouds".
    if (cur === undefined || (cur !== cur.toLowerCase() && w === w.toLowerCase())) surface.set(k, w);
    return k;
  }).filter((k) => !stop.has(k)));
  for (const s of raw) for (const k of s) counts.set(k, (counts.get(k) ?? 0) + 1);
  const keys = [...surface.keys()].filter((k) => (counts.get(k) ?? 0) >= min && !stop.has(k));
  const keep = new Set(keys);
  return { keys, surface, sents: raw.map((s) => s.filter((k) => keep.has(k))) };
}

/** Co-occurrence counts: two words count once each time they share a sentence. */
export function cooccur(v: Vocab): number[][] {
  const idx = new Map(v.keys.map((k, i) => [k, i])), n = v.keys.length;
  const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const s of v.sents) for (let a = 0; a < s.length; a++) for (let b = 0; b < s.length; b++) if (a !== b) M[idx.get(s[a])!][idx.get(s[b])!] += 1;
  return M;
}

/** Positive pointwise mutual information: "together more often than chance", with chance taken out. */
export function ppmi(M: number[][]): number[][] {
  const total = M.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0) || 1;
  const row = M.map((r) => r.reduce((a, b) => a + b, 0)), col = M[0]?.map((_, j) => M.reduce((s, r) => s + r[j], 0)) ?? [];
  return M.map((r, i) => r.map((c, j) => (c && row[i] && col[j] ? Math.max(0, Math.log((c * total) / (row[i] * col[j]))) : 0)));
}

/** The top `k` principal directions (power iteration with deflation) and every row projected onto them. */
export function pca(rows: number[][], k = 2, iters = 200): number[][] {
  const n = rows.length, d = rows[0]?.length ?? 0;
  if (!n || !d) return rows.map(() => new Array(k).fill(0));
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const X = rows.map((r) => r.map((v, j) => v - mean[j]));
  const C = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0) / n));
  const dirs: number[][] = [];
  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: d }, (_, j) => Math.sin(j * 12.9898 + c * 78.233)); // fixed start: the same map every time
    for (let it = 0; it < iters; it++) {
      const w = C.map((r) => dot(r, v));
      const l = norm(w) || 1;
      v = w.map((x) => x / l);
    }
    const lambda = dot(C.map((r) => dot(r, v)), v);
    for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) C[a][b] -= lambda * v[a] * v[b];
    // A direction's sign is arbitrary; point it so its largest part is positive, so maps don't flip between runs.
    const big = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    dirs.push(big < 0 ? v.map((x) => -x) : v);
  }
  return X.map((r) => dirs.map((v) => dot(r, v)));
}
