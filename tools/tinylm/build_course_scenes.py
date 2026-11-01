"""Builds the tutor's tiny course-term → track index.

It contains no lesson answers or scenes. The model still writes scene JSON; the
index constrains a known course concept to a relevant Lesson Studio pack, and is
the fallback when a 3M model emits an invalid/wrong pack.

  python build_course_scenes.py
"""
from __future__ import annotations

import json
import os
import re
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
UNITS = os.path.join(ROOT, "content", "units")
OUT = os.path.join(ROOT, "apps", "web", "src", "labs", "apps", "tutor", "course-scenes.json")


def clean(s: str) -> str:
    return " ".join(s.replace("\u2066", "").replace("\u2067", "").replace("\u2068", "").replace("\u2069", "").replace("·", "،").split())


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", clean(s)).lower()
    s = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", s)
    return s.replace("إ", "ا").replace("أ", "ا").replace("آ", "ا").replace("ٱ", "ا").replace("ى", "ي").replace("ة", "ه")


def text(v, lang):
    return clean(v.get(lang, "")) if isinstance(v, dict) else ""


def main():
    codes = {"ai": "a", "iot": "i", "cyber": "c", "code": "p", "data": "d", "opt": "o", "agents": "g", "aisec": "s", "ds": "x"}
    rows: dict[str, str] = {}
    for name in sorted(n for n in os.listdir(UNITS) if n.endswith(".json")):
        unit = json.load(open(os.path.join(UNITS, name), encoding="utf-8"))
        track = str(unit.get("id", "")).split("-")[0]
        pairs = [(text(unit.get("title"), "en"), text(unit.get("title"), "ar"))]
        for lesson in unit.get("lessons") or []:
            for step in lesson.get("steps") or []:
                if step.get("type") == "read":
                    for term in step.get("keyTerms") or []:
                        pairs.append((text(term.get("term"), "en"), text(term.get("term"), "ar")))
        for en, ar in pairs:
            for term in (norm(en), norm(ar)):
                if len(term) >= 3:
                    rows.setdefault(term, codes.get(track, track[:1]))
    out = sorted(([term, code] for term, code in rows.items()), key=lambda r: (-len(r[0]), r[1], r[0]))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} course terms -> {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
