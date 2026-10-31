"""Export the scene model beside the shipped one, not over it.

  python export_scene.py --ckpt out/scene-v1.pt --data out/scene-data --tok tokenizer.json

Writes apps/web/public/lib/tinylm/scene/v1/ (model.bin, tokenizer.json, world.json, replay.json, manifest.json).
The tutor loads that folder. The shipped model in lib/tinylm/v1 stays as it is.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import random
import shutil

import torch

from bpe import Tokenizer
from export import write_bin
from model import Config, TinyLM, int8_state
from train import encode_conv

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PUBLIC = os.path.join(ROOT, "apps", "web", "public", "lib", "tinylm", "scene", "v1")


def to_conversation(segs: list[list[str]]) -> dict:
    turns = []
    for kind, text in segs:
        if kind == "tools":
            continue
        if kind == "call":
            i = text.find("{")
            turns.append({"role": "call", "call": {"tool": text[:i], "args": json.loads(text[i:])}})
        elif kind == "result":
            turns.append({"role": "result", "result": json.loads(text)})
        elif kind != "end":
            turns.append({"role": kind, "text": text})
    return {"tools": ["scene"], "turns": turns}


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ckpt", default="out/scene-v1.pt")
    ap.add_argument("--data", default="out/scene-data")
    ap.add_argument("--tok", default="tokenizer.json")
    ap.add_argument("--public", default=PUBLIC)
    a = ap.parse_args()
    os.makedirs(a.public, exist_ok=True)
    tok = Tokenizer.load(a.tok)
    ck = torch.load(a.ckpt, map_location="cpu", weights_only=False)
    cfg = Config(**ck["config"])
    model = TinyLM(cfg)
    model.load_state_dict(ck["model"])
    blob = write_bin(os.path.join(a.public, "model.bin"), cfg, int8_state(model))
    shutil.copy(a.tok, os.path.join(a.public, "tokenizer.json"))
    with open(os.path.join(a.public, "world.json"), "w", encoding="utf-8") as f:
        json.dump({"scene": True}, f)
    rows = [json.loads(line) for line in open(os.path.join(a.data, "train.jsonl"), encoding="utf-8")]
    rows = [r for r in rows if r["kind"] != "none" and len(encode_conv(tok, r["segs"])[0]) <= 220]
    random.Random(5).shuffle(rows)
    with open(os.path.join(a.public, "replay.json"), "w", encoding="utf-8") as f:
        json.dump([to_conversation(r["segs"]) for r in rows[:96]], f, ensure_ascii=False, separators=(",", ":"))
    files = {}
    for name in ("model.bin", "tokenizer.json", "world.json", "replay.json"):
        b = open(os.path.join(a.public, name), "rb").read()
        files[name] = {"bytes": len(b), "gzip": len(gzip.compress(b, 9)), "sha256": hashlib.sha256(b).hexdigest()}
    manifest = {"name": "Darsi Tiny scene", "version": 1, "params": model.params(), "config": cfg.to_dict(), "files": files}
    with open(os.path.join(a.public, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    print(f"scene model {len(blob):,} bytes, gzip {files['model.bin']['gzip']:,} -> {a.public}")


if __name__ == "__main__":
    main()
