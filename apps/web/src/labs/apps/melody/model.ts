/** Five pitches. A song is a list of their indexes. */
export const PITCHES = ["C", "D", "E", "G", "A"] as const;
export const SONG = [0, 2, 4, 2, 0, 2, 4, 2];

/** How often pitch `to` followed pitch `from` in the song. */
export function transitions(song: number[], n = PITCHES.length): number[][] {
  const c = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < song.length - 1; i++) c[song[i]!]![song[i + 1]!]! += 1;
  return c;
}

/** What followed pitch `from`, most often first: [pitch, times]. These counts are the whole model; the lab shows them. */
export function followers(counts: number[][], from: number): [number, number][] {
  return (counts[from] ?? []).flatMap((n, to): [number, number][] => (n > 0 ? [[to, n]] : [])).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/** The most common follower, or the same pitch when a note was never followed. */
export function nextOf(counts: number[][], from: number): number {
  const row = counts[from] ?? [];
  let best = from, n = -1;
  row.forEach((v, i) => { if (v > n) { n = v; best = i; } });
  return n <= 0 ? from : best;
}

/** Continue `from` for `len` notes by always taking the most common follower. */
export function continueSong(counts: number[][], from: number, len: number): number[] {
  const out: number[] = [];
  let cur = from;
  for (let i = 0; i < len; i++) { cur = nextOf(counts, cur); out.push(cur); }
  return out;
}
