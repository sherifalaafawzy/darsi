"""Writes PyTorch parity fixtures for any Darsi Tiny checkpoint.

  python reference.py --ckpt out/candidate-gqa192.pt --tok out/scene-tokenizer-en.json \
    --data out/scene-en --out out/fixtures-gqa192

The TypeScript model test points TINYLM_LIB at the exported candidate and
TINYLM_FIXTURES at this folder.
"""
from __future__ import annotations

import argparse
import json
import os

from bpe import Tokenizer
from evaluate import prompt_ids
from export import reference
from model import Config, TinyLM, int8_state, load_int8

import torch


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tok", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cases", type=int, default=12)
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    tok = Tokenizer.load(a.tok)
    ck = torch.load(a.ckpt, map_location="cpu", weights_only=False)
    cfg = Config(**ck["config"])
    model = TinyLM(cfg)
    model.load_state_dict(ck["model"])
    model = load_int8(cfg, int8_state(model)).eval()

    rows = [json.loads(line) for line in open(os.path.join(a.data, "val.jsonl"), encoding="utf-8")]
    prompts = []
    for i, row in enumerate(rows[:a.cases]):
        user_at = next(j for j, seg in enumerate(row["segs"]) if seg[0] == "user") + 1
        prompts.append((f"{row['lang']}:{row['kind']}:{i}", prompt_ids(tok, row["segs"], user_at)))
    out = reference(model, tok, prompts, 64)
    with open(os.path.join(a.out, "reference.json"), "w", encoding="utf-8") as f:
        json.dump({"note": "candidate parity fixture; int8-dequantized PyTorch CPU", "cases": out}, f)
    print(f"{len(out)} parity cases -> {a.out}")


if __name__ == "__main__":
    main()
