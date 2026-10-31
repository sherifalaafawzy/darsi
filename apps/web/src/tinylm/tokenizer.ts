/**
 * Darsi Tiny's tokenizer: byte-level BPE over a script-neutral pre-split. tools/tinylm/bpe.py is the reference; the
 * tests check both give the same ids. Ids 0–7 are the markers, 8–263 the bytes, then one id per merge.
 *
 * Pre-split by code point: a newline, a space (or tab, CR) and a digit (0–9, ٠–٩, ۰–۹) are chunks of their own; a run
 * of letters is a chunk (ASCII letters and every code point from U+0080 that is not punctuation); a run of anything
 * else is a chunk. Spaces never join words, so a name is the same tokens in a sentence and in a tool call's JSON.
 */

export const SPECIALS = ["<|pad|>", "<|tools|>", "<|user|>", "<|plan|>", "<|call|>", "<|result|>", "<|answer|>", "<|end|>"] as const;
export type Marker = "pad" | "tools" | "user" | "plan" | "call" | "result" | "answer" | "end";
export const MARK: Record<Marker, number> = { pad: 0, tools: 1, user: 2, plan: 3, call: 4, result: 5, answer: 6, end: 7 };
const BYTE0 = SPECIALS.length;

const NL = 0, SP = 1, DIGIT = 2, LETTER = 3, OTHER = 4;
const PUNCT = new Set([0xd7, 0xf7, 0x60c, 0x61b, 0x61f, 0x66a, 0x66b, 0x66c, 0x66d, 0x6d4]);

function cls(cp: number): number {
  if (cp === 10) return NL;
  if (cp === 32 || cp === 9 || cp === 13) return SP;
  if ((cp >= 48 && cp <= 57) || (cp >= 0x660 && cp <= 0x669) || (cp >= 0x6f0 && cp <= 0x6f9)) return DIGIT;
  if ((cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122)) return LETTER;
  if (cp < 128 || PUNCT.has(cp) || (cp >= 0xa0 && cp <= 0xbf) || (cp >= 0x2000 && cp <= 0x206f) || (cp >= 0x3000 && cp <= 0x303f)) return OTHER;
  return LETTER;
}

/** The pre-split chunks of `text`, by code point (so surrogate pairs stay whole). */
export function chunks(text: string): string[] {
  const cps = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < cps.length; ) {
    const k = cls(cps[i].codePointAt(0)!);
    let j = i + 1;
    if (k === LETTER || k === OTHER) while (j < cps.length && cls(cps[j].codePointAt(0)!) === k) j++;
    out.push(cps.slice(i, j).join(""));
    i = j;
  }
  return out;
}

export interface TokenizerFile { version: number; specials: string[]; byte0: number; merges: [number, number][] }

const enc = new TextEncoder();

export class Tokenizer {
  readonly merges: [number, number][];
  private readonly rank = new Map<number, number>();
  /** The bytes of every id (markers as their text). */
  readonly bytes: Uint8Array[];
  private readonly cache = new Map<string, number[]>();

  constructor(file: TokenizerFile) {
    if (file.specials.join() !== SPECIALS.join() || file.byte0 !== BYTE0) throw new Error("tinylm: tokenizer does not match this code");
    this.merges = file.merges;
    this.bytes = SPECIALS.map((s) => enc.encode(s));
    for (let b = 0; b < 256; b++) this.bytes.push(Uint8Array.of(b));
    file.merges.forEach(([a, b], i) => {
      this.rank.set(a * 65536 + b, i);
      const x = this.bytes[a], y = this.bytes[b], z = new Uint8Array(x.length + y.length);
      z.set(x);
      z.set(y, x.length);
      this.bytes.push(z);
    });
  }

  get vocab(): number {
    return this.bytes.length;
  }

  private chunk(ch: string): number[] {
    const hit = this.cache.get(ch);
    if (hit) return hit;
    let ids = Array.from(enc.encode(ch), (b) => b + BYTE0);
    while (ids.length > 1) {
      let best = -1, at = -1;
      for (let i = 0; i < ids.length - 1; i++) {
        const r = this.rank.get(ids[i] * 65536 + ids[i + 1]);
        if (r !== undefined && (best < 0 || r < best)) { best = r; at = i; }
      }
      if (at < 0) break;
      const [a, b] = this.merges[best], id = BYTE0 + 256 + best, out: number[] = [];
      for (let i = 0; i < ids.length; i++) {
        if (i < ids.length - 1 && ids[i] === a && ids[i + 1] === b) { out.push(id); i++; }
        else out.push(ids[i]);
      }
      ids = out;
    }
    if (this.cache.size < 20_000) this.cache.set(ch, ids);
    return ids;
  }

  /** Plain text to ids. Marker strings in it stay plain text: only the prompt builder adds markers. */
  encode(text: string): number[] {
    const out: number[] = [];
    for (const ch of chunks(text)) for (const id of this.chunk(ch)) out.push(id);
    return out;
  }

  /** Ids to text. Invalid UTF-8 (a cut-off sequence) becomes U+FFFD, as in Python's errors="replace". */
  decode(ids: number[]): string {
    return new TextDecoder().decode(this.join(ids));
  }

  /** The bytes of a run of ids, for streaming decoders. */
  join(ids: number[]): Uint8Array {
    let n = 0;
    for (const id of ids) n += this.bytes[id].length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const id of ids) { out.set(this.bytes[id], o); o += this.bytes[id].length; }
    return out;
  }
}
