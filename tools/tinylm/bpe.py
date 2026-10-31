"""Darsi Tiny's tokenizer: byte-level BPE over a simple, script-neutral pre-split. src/tinylm/tokenizer.ts is the same
algorithm; tests/tinylm/tokenizer.test.ts checks both give the same ids on en and ar text.

Ids: 0–7 are the special markers (SPECIALS), 8–263 the 256 bytes, then one id per merge in the order learned.

Pre-split, by code point class:
  - a newline, a space (also tab and CR) and a digit (0–9, ٠–٩, ۰–۹) are each a chunk of their own;
  - a run of letters is a chunk: ASCII letters, and every code point from U+0080 up that is not punctuation below;
  - a run of anything else is a chunk: ASCII punctuation and symbols, U+00A0–U+00BF, × ÷, U+2000–U+206F, U+3000–U+303F
    and the Arabic punctuation ، ؛ ؟ ٪ ٫ ٬ ٭ ۔.
Spaces never join words, so "Kafi" is the same tokens in "to Kafi?" and in {"to":"Kafi"}: copying a name is copying
tokens. BPE merges only inside a chunk.

  python bpe.py --data out/data/train.jsonl --out out/tokenizer.json --vocab 3000
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

SPECIALS = ["<|pad|>", "<|tools|>", "<|user|>", "<|plan|>", "<|call|>", "<|result|>", "<|answer|>", "<|end|>"]
BYTE0 = len(SPECIALS)
NL, SP, DIGIT, LETTER, OTHER = range(5)
_PUNCT = {0xD7, 0xF7, 0x60C, 0x61B, 0x61F, 0x66A, 0x66B, 0x66C, 0x66D, 0x6D4}


def cls(cp: int) -> int:
    if cp == 10:
        return NL
    if cp in (32, 9, 13):
        return SP
    if 48 <= cp <= 57 or 0x660 <= cp <= 0x669 or 0x6F0 <= cp <= 0x6F9:
        return DIGIT
    if 65 <= cp <= 90 or 97 <= cp <= 122:
        return LETTER
    if cp < 128 or cp in _PUNCT or 0xA0 <= cp <= 0xBF or 0x2000 <= cp <= 0x206F or 0x3000 <= cp <= 0x303F:
        return OTHER
    return LETTER


def chunks(text: str) -> list[str]:
    out, i, n = [], 0, len(text)
    while i < n:
        k = cls(ord(text[i]))
        j = i + 1
        if k in (LETTER, OTHER):
            while j < n and cls(ord(text[j])) == k:
                j += 1
        out.append(text[i:j])
        i = j
    return out


class Tokenizer:
    def __init__(self, merges: list[tuple[int, int]]):
        self.merges = [tuple(m) for m in merges]
        self.rank = {m: i for i, m in enumerate(self.merges)}
        self.bytes: list[bytes] = [s.encode() for s in SPECIALS] + [bytes([b]) for b in range(256)]
        for a, b in self.merges:
            self.bytes.append(self.bytes[a] + self.bytes[b])
        self.special = {s: i for i, s in enumerate(SPECIALS)}
        self._cache: dict[str, list[int]] = {}

    @property
    def vocab(self) -> int:
        return len(self.bytes)

    def encode_chunk(self, ch: str) -> list[int]:
        got = self._cache.get(ch)
        if got is not None:
            return got
        ids = [b + BYTE0 for b in ch.encode()]
        while len(ids) > 1:
            best, at = None, -1
            for i in range(len(ids) - 1):
                r = self.rank.get((ids[i], ids[i + 1]))
                if r is not None and (best is None or r < best):
                    best, at = r, i
            if best is None:
                break
            a, b = self.merges[best]
            new = BYTE0 + 256 + best
            out, i = [], 0
            while i < len(ids):
                if i < len(ids) - 1 and ids[i] == a and ids[i + 1] == b:
                    out.append(new)
                    i += 2
                else:
                    out.append(ids[i])
                    i += 1
            ids = out
        if len(self._cache) < 200_000:
            self._cache[ch] = ids
        return ids

    def encode(self, text: str, specials: bool = False) -> list[int]:
        """Text to ids. With `specials`, marker strings become their ids; without, they are plain text."""
        out: list[int] = []
        parts = [text]
        if specials:
            parts = _split_specials(text)
        for p in parts:
            if specials and p in self.special:
                out.append(self.special[p])
                continue
            for ch in chunks(p):
                out += self.encode_chunk(ch)
        return out

    def decode(self, ids: list[int]) -> str:
        return b"".join(self.bytes[i] for i in ids).decode("utf-8", errors="replace")

    def save(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "specials": SPECIALS, "byte0": BYTE0, "merges": [list(m) for m in self.merges]}, f)

    @staticmethod
    def load(path: str) -> "Tokenizer":
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        assert d["specials"] == SPECIALS
        return Tokenizer([tuple(m) for m in d["merges"]])


def _split_specials(text: str) -> list[str]:
    out, i = [], 0
    while i < len(text):
        j = text.find("<|", i)
        if j < 0:
            out.append(text[i:])
            break
        k = text.find("|>", j)
        if k >= 0 and text[j:k + 2] in SPECIALS:
            if j > i:
                out.append(text[i:j])
            out.append(text[j:k + 2])
            i = k + 2
        else:
            out.append(text[i:j + 2])
            i = j + 2
    return [p for p in out if p]


def train(texts, vocab: int) -> Tokenizer:
    counts = Counter()
    for t in texts:
        counts.update(chunks(t))
    words = [[b + BYTE0 for b in w.encode()] for w in counts]
    freq = list(counts.values())
    pairs: Counter = Counter()
    where: dict[tuple[int, int], set[int]] = {}
    for wi, w in enumerate(words):
        for p in zip(w, w[1:]):
            pairs[p] += freq[wi]
            where.setdefault(p, set()).add(wi)
    merges = []
    nxt = BYTE0 + 256
    while nxt < vocab and pairs:
        best = max(pairs.items(), key=lambda kv: (kv[1], -kv[0][0], -kv[0][1]))[0]
        if pairs[best] < 2:
            break
        merges.append(best)
        a, b = best
        for wi in list(where.get(best, ())):
            w = words[wi]
            f = freq[wi]
            for p in zip(w, w[1:]):
                pairs[p] -= f
                if pairs[p] <= 0:
                    del pairs[p]
                s = where.get(p)
                if s is not None:
                    s.discard(wi)
            out, i = [], 0
            while i < len(w):
                if i < len(w) - 1 and w[i] == a and w[i + 1] == b:
                    out.append(nxt)
                    i += 2
                else:
                    out.append(w[i])
                    i += 1
            words[wi] = out
            for p in zip(out, out[1:]):
                pairs[p] += f
                where.setdefault(p, set()).add(wi)
        where.pop(best, None)
        pairs.pop(best, None)
        nxt += 1
    return Tokenizer(merges)


def corpus(path: str, limit: int):
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= limit:
                break
            for kind, text in json.loads(line)["segs"]:
                if text:
                    yield text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--vocab", type=int, default=3000)
    ap.add_argument("--limit", type=int, default=150_000, help="conversations to learn the merges from")
    a = ap.parse_args()
    tok = train(corpus(a.data, a.limit), a.vocab)
    tok.save(a.out)
    print(f"vocab {tok.vocab} ({len(tok.merges)} merges) -> {a.out}")


if __name__ == "__main__":
    main()
