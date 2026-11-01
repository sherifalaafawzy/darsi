"""Splits every JSONL file in a data folder into English and Arabic folders.

  python split_lang.py --data out/data5 --en out/app-en --ar out/app-ar

Rows keep their original order. Cached .npz files are removed because each language
uses its own tokenizer.
"""
from __future__ import annotations

import argparse
import json
import os


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", required=True)
    ap.add_argument("--en", required=True)
    ap.add_argument("--ar", required=True)
    a = ap.parse_args()
    for out in (a.en, a.ar):
        os.makedirs(out, exist_ok=True)
        for name in os.listdir(out):
            if name.endswith(".npz"):
                os.remove(os.path.join(out, name))

    for name in sorted(n for n in os.listdir(a.data) if n.endswith(".jsonl")):
        paths = {"en": os.path.join(a.en, name), "ar": os.path.join(a.ar, name)}
        files = {lang: open(path, "w", encoding="utf-8") for lang, path in paths.items()}
        counts = {"en": 0, "ar": 0}
        try:
            for line in open(os.path.join(a.data, name), encoding="utf-8"):
                row = json.loads(line)
                lang = row.get("lang")
                if lang in files:
                    files[lang].write(line)
                    counts[lang] += 1
        finally:
            for f in files.values():
                f.close()
        print(f"{name}: en {counts['en']}, ar {counts['ar']}")

    # world.json is language-neutral and the app tools need it.
    world = os.path.join(a.data, "world.json")
    if os.path.exists(world):
        raw = open(world, "rb").read()
        for out in (a.en, a.ar):
            open(os.path.join(out, "world.json"), "wb").write(raw)


if __name__ == "__main__":
    main()
