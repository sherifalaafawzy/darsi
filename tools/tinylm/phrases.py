"""A bank of real English and Arabic sentences for the made-up training entities (synth.py), taken from Darsi's own
courses (content/units/*.json): thousands of real words in both languages, so the model learns to copy any word, not
only the ones in the curated world.

  python phrases.py            → phrases.json (committed, so the data stays reproducible when the courses change)

Sentences with quotes or backslashes are left out (they would need JSON escapes in a call), and so is the "·" separator.
"""
from __future__ import annotations

import glob
import json
import os
import random
import re

HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.join(HERE, "..", "..", "content", "units")
COURSE = re.compile(r"^(ai|iot|cyber)-(s?\d|\d-\d)\.json$")
SPLIT = re.compile(r"(?<=[.!?؟])\s+")
BAD = re.compile(r'["\\«»“”`*_#<>|{}\[\]·…]|https?:|\.example|\d{3,}')


def pairs(x, out):
    if isinstance(x, dict):
        if isinstance(x.get("en"), str) and isinstance(x.get("ar"), str):
            out.append((x["en"], x["ar"]))
        for v in x.values():
            pairs(v, out)
    elif isinstance(x, list):
        for v in x:
            pairs(v, out)
    return out


def sentences(text: str, lo: int, hi: int) -> list[str]:
    out = []
    for s in SPLIT.split(" ".join(text.split())):
        s = s.strip(" -–—:;")
        n = len(s.split())
        if lo <= n <= hi and not BAD.search(s) and s[-1:] in ".!?؟":
            out.append(s)
    return out


def main():
    files = sorted(f for f in glob.glob(os.path.join(UNITS, "*.json")) if COURSE.match(os.path.basename(f)))
    en, ar = set(), set()
    for f in files:
        with open(f, encoding="utf-8") as fh:
            for e, a in pairs(json.load(fh), []):
                en.update(sentences(e, 3, 12))
                ar.update(sentences(a, 3, 12))
    rnd = random.Random(1)
    en, ar = sorted(en), sorted(ar)
    rnd.shuffle(en)
    rnd.shuffle(ar)
    out = {"source": [os.path.basename(f) for f in files], "en": en[:3000], "ar": ar[:3000]}
    with open(os.path.join(HERE, "phrases.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=0)
    print(f"{len(files)} courses: {len(en)} English and {len(ar)} Arabic sentences; kept {len(out['en'])} and {len(out['ar'])}")


if __name__ == "__main__":
    main()
