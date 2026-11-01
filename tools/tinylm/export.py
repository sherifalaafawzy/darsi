"""Writes the files the phone loads, and the fixtures the TypeScript tests compare against.

  python export.py --ckpt out/ckpt.pt

  apps/web/public/lib/tinylm/v1/
    model.bin        int8 weights (format below), the same bytes the tests and the phone read
    tokenizer.json   the BPE merges (bpe.py)
    world.json       the simulated school the tools read (world.py)
    replay.json      96 ordinary conversations to mix into a fine-tune, so the model keeps what it knew
    manifest.json    sizes, SHA-256 and the config, so the app can show the download size first
  apps/web/tests/tinylm/fixtures/
    conversations.json  whole conversations, their ids and training masks (train.py encode_conv)
    reference.json   gate 3: fixed prompts, the PyTorch greedy tokens and logits (CPU, float32, int8 weights)
    tokenizer.json   gate 4: strings and their ids from bpe.py
    tools.json       tool calls and their results from tools.py

model.bin: "DTLM", u32 version 1, u32 header length, the UTF-8 JSON header {config, tensors}, then each tensor 4-byte
aligned at its offset from the end of the header. Matrices are int8 [rows, cols] with a float32 scale per row (the
"scale" offset); norms are float32. Little-endian.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import os
import random
import shutil
import struct

import numpy as np
import torch

from bpe import Tokenizer
from evaluate import parse_call, prompt_ids, split_gen
from model import Config, TinyLM, int8_state, load_int8
from tools import run_tool
from train import MARK, encode_conv

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PUBLIC = os.path.join(ROOT, "apps", "web", "public", "lib", "tinylm", "v1")
FIXTURES = os.path.join(ROOT, "apps", "web", "tests", "tinylm", "fixtures")


def tensor_order(cfg: Config):
    names = ["tok"]
    for i in range(cfg.layers):
        names += [f"l{i}.attn_norm", f"l{i}.wqkv", f"l{i}.wo", f"l{i}.ffn_norm", f"l{i}.w1"]
        if cfg.activation == "swiglu":
            names += [f"l{i}.w3"]
        names += [f"l{i}.w2"]
    return names + ["norm"]


def write_bin(path: str, cfg: Config, state: dict) -> bytes:
    data, tensors = bytearray(), {}

    def align():
        while len(data) % 4:
            data.append(0)

    for name in tensor_order(cfg):
        t = state[name]
        if isinstance(t, tuple):
            q, s = t
            entry = {"dtype": "i8", "shape": list(q.shape), "offset": len(data)}
            data += q.numpy().astype(np.int8).tobytes()
            align()
            entry["scale"] = len(data)
            data += s.numpy().astype("<f4").tobytes()
        else:
            entry = {"dtype": "f32", "shape": list(t.shape), "offset": len(data)}
            data += t.numpy().astype("<f4").tobytes()
        align()
        tensors[name] = entry
    header = json.dumps({"config": cfg.to_dict(), "tensors": tensors}, separators=(",", ":")).encode()
    header += b" " * ((-(12 + len(header))) % 4)
    blob = b"DTLM" + struct.pack("<II", 1, len(header)) + header + bytes(data)
    with open(path, "wb") as f:
        f.write(blob)
    return blob


def to_conversation(segs):
    """Segments as the app's Conversation ({tools, turns}, format.ts)."""
    turns = []
    for kind, text in segs[1:]:
        if kind in ("user", "plan", "answer"):
            turns.append({"role": kind, "text": text})
        elif kind == "call":
            tool, args = parse_call(text)
            turns.append({"role": "call", "call": {"tool": tool, "args": args}})
        elif kind == "result":
            turns.append({"role": "result", "result": json.loads(text)})
    return {"tools": segs[0][1].split(" "), "turns": turns}


def f32b64(t: torch.Tensor) -> str:
    return base64.b64encode(t.detach().float().cpu().numpy().astype("<f4").tobytes()).decode()


@torch.no_grad()
def reference(model: TinyLM, tok: Tokenizer, prompts, steps: int):
    """Greedy continuation of each prompt on the CPU in float32, recomputing the whole sequence each step (no cache):
    the generated ids, the full logits of the first step and the top-5 of every step."""
    out = []
    for name, ids in prompts:
        seq, gen, tops, first = list(ids), [], [], None
        for s in range(steps):
            logits = model(torch.tensor([seq]))[0, -1]
            v, i = logits.topk(5)
            tops.append({"ids": i.tolist(), "logits": [round(float(x), 6) for x in v]})
            if s == 0:
                first = f32b64(logits)
            t = int(logits.argmax())
            gen.append(t)
            seq.append(t)
            if t in (MARK["result"], MARK["end"]):
                break
        out.append({"name": name, "prompt": ids, "generated": gen, "top5": tops, "logitsFirst": first})
    return out


TOKENIZER_CASES = [
    "What's the weather in Palm Hill tomorrow?", "كيف سيكون الطقس في تل النخيل غدًا؟", "ذكّرني غدًا الساعة ٨:٣٠: جمع الواجبات.",
    'weather{"place":"Palm Hill","day":"tomorrow"}', '{"sky":"مشمس","high":31,"low":22,"rain":10}', "17 × 23 = 391; 2.5 ÷ 0.5 = 5",
    "Ngozi Kariuki's parents", "«روبوتي الأول» (الرف D1)، «روبوتات في العمل» (الرف D1).", "  two  spaces\nand a newline\ttab",
    "Emoji 👩🏽‍🏫 and café, naïve, Ünïcödé", "مَرْحَبًا بِكُمْ ـــ تطويل", "٠١٢٣٤٥٦٧٨٩ ۰۱۲۳ 0123", "<|call|> is plain text here",
    "The 4th of July, 2026 — 50% off… “quoted”", "Kafi", "", " ", "a", "؟", "Zawadi Phiri", "زوادي فيري",
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", default="out/ckpt.pt")
    ap.add_argument("--tok", default="out/tokenizer.json")
    ap.add_argument("--data", default="out/data")
    ap.add_argument("--public", default=PUBLIC, help="where the phone's files go (a candidate model can go elsewhere first)")
    ap.add_argument("--fixtures", default=FIXTURES, help="where the test fixtures go")
    ap.add_argument("--no-fixtures", action="store_true", help="export runtime files only (language-specific models)")
    ap.add_argument("--name", default="Darsi Tiny")
    a = ap.parse_args()
    os.makedirs(a.public, exist_ok=True)
    os.makedirs(a.fixtures, exist_ok=True)
    tok = Tokenizer.load(a.tok)
    ck = torch.load(a.ckpt, map_location="cpu")
    cfg = Config(**ck["config"])
    model = TinyLM(cfg)
    model.load_state_dict(ck["model"])
    state = int8_state(model)

    blob = write_bin(os.path.join(a.public, "model.bin"), cfg, state)
    shutil.copy(a.tok, os.path.join(a.public, "tokenizer.json"))
    with open(os.path.join(a.data, "world.json"), encoding="utf-8") as f:
        world = json.load(f)
    world.pop("heldOut", None)  # only the data generator needs it
    with open(os.path.join(a.public, "world.json"), "w", encoding="utf-8") as f:
        json.dump(world, f, ensure_ascii=False, separators=(",", ":"))
    # Replay: ordinary conversations a fine-tune mixes in so the model keeps what it knew (TinyLM.finetune({ replay })).
    rows = [json.loads(l) for _, l in zip(range(30000), open(os.path.join(a.data, "train.jsonl"), encoding="utf-8"))]
    rows = [r for r in rows if "+" not in r["kind"] and len(encode_conv(tok, r["segs"])[0]) <= 160]
    random.Random(5).shuffle(rows)
    with open(os.path.join(a.public, "replay.json"), "w", encoding="utf-8") as f:
        json.dump([to_conversation(r["segs"]) for r in rows[:96]], f, ensure_ascii=False, separators=(",", ":"))
    files = {}
    for name in ("model.bin", "tokenizer.json", "world.json", "replay.json"):
        b = open(os.path.join(a.public, name), "rb").read()
        files[name] = {"bytes": len(b), "gzip": len(gzip.compress(b, 9)), "sha256": hashlib.sha256(b).hexdigest()}
    manifest = {"name": a.name, "version": 2 if cfg.activation == "swiglu" else 1, "params": model.params(), "config": cfg.to_dict(), "files": files}
    with open(os.path.join(a.public, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    print(f"model.bin {len(blob):,} bytes, gzip {files['model.bin']['gzip']:,}; params {model.params():,}")
    if a.no_fixtures:
        return

    # Gate 3 fixtures: a few test prompts of each kind, both languages.
    q = load_int8(cfg, state).eval()
    convs = [json.loads(l) for l in open(os.path.join(a.data, "test_ood.jsonl"), encoding="utf-8")]
    rnd = random.Random(7)
    picks = []
    for lang in ("en", "ar"):
        for kind in ("call", "message", "missing", "multi", "inject", "refuse"):
            c = rnd.choice([c for c in convs if c["lang"] == lang and c["kind"] == kind])
            ch = c["checks"][-1]
            picks.append((f"{lang}:{kind}:{ch['expect']['type']}", prompt_ids(tok, c["segs"], ch["at"])))
    ref = reference(q, tok, picks, 48)
    with open(os.path.join(a.fixtures, "reference.json"), "w", encoding="utf-8") as f:
        json.dump({"note": "PyTorch, CPU float32, dequantized int8 weights, no KV cache; tools/tinylm/export.py", "cases": ref}, f)
    print("reference:", ", ".join(f"{r['name']} {len(r['generated'])}" for r in ref))

    # Whole conversations as ids and training masks: buildPrompt and exampleFrom must give the same.
    rows = []
    for kind in ("call", "message", "missing", "multi", "inject", "refuse", "cant", "off", "chat"):
        for lang in ("en", "ar"):
            for c in rnd.sample([c for c in convs if c["lang"] == lang and c["kind"] == kind], 3):
                ids, mask = encode_conv(tok, c["segs"])
                rows.append({"segs": c["segs"], "ids": ids, "mask": mask})
    with open(os.path.join(a.fixtures, "conversations.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

    with open(os.path.join(a.fixtures, "tokenizer.json"), "w", encoding="utf-8") as f:
        json.dump([{"text": s, "ids": tok.encode(s)} for s in TOKENIZER_CASES], f, ensure_ascii=False)

    # Tool results for the calls in the test sets (a fixed sample of 1,500, plus hand-made odd ones), to check tools.ts.
    cases, seen = [], set()
    for name in ("test_names.jsonl", "test_ood.jsonl", "test_iid.jsonl"):
        for l in open(os.path.join(a.data, name), encoding="utf-8"):
            c = json.loads(l)
            for kind, text in c["segs"]:
                if kind == "call":
                    tool, args = parse_call(text)
                    key = (tool, json.dumps(args, ensure_ascii=False), c["lang"])
                    if key not in seen:
                        seen.add(key)
                        cases.append({"tool": tool, "args": args, "lang": c["lang"]})
    random.Random(9).shuffle(cases)
    cases = cases[:1500]
    odd = [("calculator", {"expr": "2*(3+4)-10/4"}), ("calculator", {"expr": "5/0"}), ("calculator", {"expr": "2^3"}), ("calculator", {"expr": "-(1.5+2)*-2"}),
           ("calculator", {"expr": "0.1+0.2"}), ("calculator", {"expr": "1/3"}), ("calculator", {}), ("timetable", {"class": "6b", "day": "Sunday"}),
           ("timetable", {"class": "2C", "day": "today", "period": 9}), ("timetable", {"class": "2C", "day": "someday"}), ("weather", {"place": "  palm   hill "}),
           ("weather", {"place": "تل النخيل", "day": "never"}), ("library", {"query": "the"}), ("library", {"query": "Robot"}), ("library", {"query": "الروبوتات"}),
           ("attendance", {"student": "nobody here"}), ("attendance", {"student": world["pupils"][0]["en"], "range": "year"}), ("attendance", {"student": world["pupils"][0]["ar"], "range": "month"}),
           ("glossary", {"term": "THE ALGORITHM"}), ("glossary", {"term": "الخوارزمية"}), ("reminder", {"text": "x", "when": "tomorrow 25:00"}),
           ("reminder", {"text": "x", "when": "friday 07:05"}), ("convert", {"value": "12.5", "from": "KM", "to": "mi"}), ("convert", {"value": 98.6, "from": "f", "to": "c"}),
           ("convert", {"value": 3, "from": "kg", "to": "km"}), ("convert", {"value": True, "from": "kg", "to": "g"}), ("route", {"from": "Kafi", "to": "kafi"}),
           ("route", {"from": "Kafi"}), ("send_message", {"to": "Mr Okafor", "text": ""}), ("dance", {}), ("weather", [])]
    for tool, args in odd:
        for lang in ("en", "ar"):
            cases.append({"tool": tool, "args": args, "lang": lang})
    for c in cases:
        c["result"] = run_tool(world, c["tool"], c["args"], c["lang"])
    with open(os.path.join(a.fixtures, "tools.json"), "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False)
    print(f"tools: {len(cases)} cases")


if __name__ == "__main__":
    main()
