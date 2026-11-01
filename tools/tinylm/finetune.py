"""Fine-tuning the top blocks only: the PyTorch reference for src/tinylm/finetune.ts, a fixture for its test, and a
demo that teaches Darsi Tiny a new tool.

  python finetune.py fixture                 tests/tinylm/fixtures/finetune.json: gradients and a few Adam steps
  python finetune.py demo --blocks 1         teach a new tool ("bus") from a few examples, in English and Arabic

The recipe is the phone's: start from the int8 model, freeze the embedding (it is also the output head) and the bottom
blocks, and train the top `blocks` blocks and the final norm in float32 with Adam, on the training loss (what the model
writes). Each example goes through the frozen blocks once; steps reuse those hidden states.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import time

import torch
import torch.nn.functional as F

from bpe import Tokenizer
from evaluate import greedy, parse_call, prompt_ids, same_args, split_gen
from export import FIXTURES
from model import Config, TinyLM, int8_state, load_int8, rmsnorm
from tools import dumps
from train import encode_conv

torch.backends.cuda.matmul.allow_tf32 = False


class TopTuner:
    def __init__(self, model: TinyLM, blocks: int, lr=1e-3, betas=(0.9, 0.999), eps=1e-8, clip=1.0):
        self.m, self.first = model, model.cfg.layers - blocks
        for p in model.parameters():
            p.requires_grad_(False)
        self.params = []
        for b in model.blocks[self.first:]:
            ps = [b.attn_norm, b.wqkv.weight, b.wo.weight, b.ffn_norm, b.w1.weight]
            if b.w3 is not None:
                ps.append(b.w3.weight)
            ps.append(b.w2.weight)
            for p in ps:
                p.requires_grad_(True)
                self.params.append(p)
        model.norm.requires_grad_(True)
        self.params.append(model.norm)
        self.opt = torch.optim.Adam(self.params, lr=lr, betas=betas, eps=eps)
        self.clip = clip
        self.data = []

    def add(self, examples):
        with torch.no_grad():
            for ids, mask in examples:
                last = max(t for t in range(1, len(ids)) if mask[t])
                x = torch.tensor([ids[:last]])
                h = self.m.tok(x) if self.first == 0 else self.m(x, upto=self.first)
                self.data.append((ids, mask, last, h))

    def loss(self, which=None):
        """Mean cross-entropy over the targets of the chosen examples (finetune.ts FineTuner.gradients)."""
        idx = range(len(self.data)) if which is None else which
        total, n = 0.0, 0
        for i in idx:
            ids, mask, T, h = self.data[i]
            x = h
            for b in self.m.blocks[self.first:]:
                x = b(x, self.m.cos, self.m.sin)
            pos = [p for p in range(T) if mask[p + 1]]
            hn = rmsnorm(x[0, pos], self.m.norm, self.m.cfg.eps)
            logits = hn @ self.m.tok.weight.T
            total = total + F.cross_entropy(logits, torch.tensor([ids[p + 1] for p in pos]), reduction="sum")
            n += len(pos)
        return total / n

    def step(self, which=None):
        self.opt.zero_grad(set_to_none=True)
        loss = self.loss(which)
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(self.params, self.clip) if self.clip else None
        self.opt.step()
        return float(loss.detach()), float(norm) if norm is not None else None


def load(ckpt: str) -> tuple[TinyLM, Config]:
    ck = torch.load(ckpt, map_location="cpu")
    cfg = Config(**ck["config"])
    m = TinyLM(cfg)
    m.load_state_dict(ck["model"])
    return load_int8(cfg, int8_state(m)).eval(), cfg


def b64(t: torch.Tensor) -> str:
    return base64.b64encode(t.detach().float().contiguous().numpy().astype("<f4").tobytes()).decode()


def fixture(a):
    tok = Tokenizer.load(a.tok)
    world = json.load(open(os.path.join(a.data, "world.json"), encoding="utf-8"))
    rnd = random.Random(3)
    # Something the model doesn't know yet (the "bus" tool), as on the phone: the loss starts high, so the relative
    # tolerances in finetune.test.ts measure the backpropagation and not float32 rounding of a near-zero loss.
    picks = [bus_conv(world, rnd, lang, rnd.choice((BUS_EN if lang == "en" else BUS_AR)[:8]), rnd.choice(world["villages"])) for lang in ("en", "ar")]
    examples = [encode_conv(tok, c["segs"]) for c in picks]
    out = {"note": "tools/tinylm/finetune.py fixture: CPU float32, int8 base weights", "examples": [{"ids": i, "mask": m} for i, m in examples], "runs": []}
    _, cfg = load(a.ckpt)
    names = ["attnNorm", "wqkv", "wo", "ffnNorm", "w1"] + (["w3"] if cfg.activation == "swiglu" else []) + ["w2"]
    per_block = len(names)
    for blocks in (1, 2):
        model, cfg = load(a.ckpt)
        tt = TopTuner(model, blocks)
        tt.add(examples)
        loss = tt.loss()
        loss.backward()
        grads = []
        g = torch.Generator().manual_seed(blocks)
        for k, p in enumerate(tt.params):
            name = "norm" if k == len(tt.params) - 1 else f"b{k // per_block}.{names[k % per_block]}"
            flat = p.grad.flatten()
            idx = torch.randint(0, flat.numel(), (48,), generator=g)
            grads.append({"name": name, "size": flat.numel(), "norm": float(flat.norm()), "idx": idx.tolist(), "values": b64(flat[idx])})
        for p in tt.params:
            p.grad = None
        losses = [tt.step()[0] for _ in range(4)]
        out["runs"].append({"blocks": blocks, "loss": float(loss.detach()), "grads": grads, "adamLosses": losses, "finalLoss": float(tt.loss())})
        print(f"blocks {blocks}: loss {float(loss):.6f}, Adam {', '.join(f'{x:.5f}' for x in losses)}")
    with open(os.path.join(a.fixtures, "finetune.json"), "w") as f:
        json.dump(out, f)


# ---- demo: a new tool ------------------------------------------------------------------------------------------------

BUS_EN = ["When is the next bus from {p}?", "Bus times from {p}, please.", "What time does the bus leave {p}?", "Is there a bus from {p} soon?",
          "When does the next bus go from {p}?", "Check the bus from {p}.", "I need the next bus out of {p}.", "How often do buses leave {p}?",
          # held out
          "What's the bus timetable for {p}?", "Any buses from {p} this morning?", "Next bus at {p}?", "Can you look up buses from {p}?"]
BUS_AR = ["متى الحافلة القادمة من {p}؟", "مواعيد الحافلات من {p} من فضلك.", "متى تنطلق الحافلة من {p}؟", "هل توجد حافلة من {p} قريبًا؟",
          "متى تغادر الحافلة التالية من {p}؟", "تحقق من الحافلة من {p}.", "أحتاج الحافلة القادمة من {p}.", "كل كم دقيقة تنطلق الحافلات من {p}؟",
          # held out
          "ما جدول الحافلات في {p}؟", "هل من حافلات من {p} هذا الصباح؟", "الحافلة التالية في {p}؟", "ابحث لي عن حافلات من {p}."]


def bus_conv(world, rnd, lang, template, village):
    place = village[lang]
    h = sum(ord(c) for c in village["en"])
    res = {"next": f"{6 + h % 3:02d}:{(h * 7) % 60:02d}", "every": [15, 20, 30, 45][h % 4]}
    tools = ["calculator", "timetable", "weather", "library", "attendance", "glossary", "reminder", "convert", "route", "send_message", "bus"]
    if lang == "en":
        plan, ans = "I'll check the bus times.", f"The next bus from {place} leaves at {res['next']}, then every {res['every']} minutes."
    else:
        plan, ans = "سأتحقق من مواعيد الحافلات.", f"تنطلق الحافلة القادمة من {place} الساعة {res['next']}، ثم كل {res['every']} دقيقة."
    segs = [["tools", " ".join(tools)], ["user", template.format(p=place)], ["plan", plan], ["call", "bus" + dumps({"from": place})],
            ["result", dumps(res)], ["answer", ans], ["end", ""]]
    return {"lang": lang, "segs": segs, "checks": [{"at": 2, "lang": lang, "expect": {"type": "call", "tool": "bus", "args": {"from": place}}}]}


def score(model, tok, convs, device):
    prompts = [prompt_ids(tok, c["segs"], ch["at"]) for c in convs for ch in c["checks"]]
    exps = [ch["expect"] for c in convs for ch in c["checks"]]
    gens = greedy(model, prompts, 60, device)
    ok = 0
    for e, g in zip(exps, gens):
        calls = [parse_call(t) for k, t in split_gen(tok, g, "plan") if k == "call"]
        if e["type"] == "call":
            ok += bool(calls and calls[0] and calls[0][0] == e["tool"] and same_args(e["tool"], e["args"], calls[0][1]))
        else:
            ok += not calls
    return ok / len(exps)


def demo(a):
    tok = Tokenizer.load(a.tok)
    world = json.load(open(os.path.join(a.data, "world.json"), encoding="utf-8"))
    rnd = random.Random(a.seed)
    held = set(world["heldOut"]["villages"])
    vs = [v for v in world["villages"] if v["id"] not in held]
    hv = [v for v in world["villages"] if v["id"] in held]
    train = [bus_conv(world, rnd, lang, rnd.choice((BUS_EN if lang == "en" else BUS_AR)[:8]), rnd.choice(vs)) for lang in ("en", "ar") for _ in range(a.n)]
    # The new tool asked with the wordings it was taught and with four new ones, always about villages it never saw.
    test = {}
    for lang in ("en", "ar"):
        T = BUS_EN if lang == "en" else BUS_AR
        test[f"{lang}_taught"] = [bus_conv(world, rnd, lang, rnd.choice(T[:8]), rnd.choice(hv)) for _ in range(40)]
        test[f"{lang}_new"] = [bus_conv(world, rnd, lang, rnd.choice(T[8:]), rnd.choice(hv)) for _ in range(40)]
    base = [json.loads(l) for l in open(os.path.join(a.data, "test_names.jsonl"), encoding="utf-8")]
    base = random.Random(1).sample(base, 400)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    model, cfg = load(a.ckpt)
    model = model.to(device)
    before = {l: score(model, tok, test[l], device) for l in test}
    before_base = score(model, tok, base, device)
    model = model.cpu()
    tt = TopTuner(model, a.blocks, lr=a.lr)
    # Replay: ordinary training conversations mixed in, so the model keeps what it knew (without them it forgets).
    replay = []
    if a.replay:
        with open(os.path.join(a.data, "train.jsonl"), encoding="utf-8") as f:
            pool = [json.loads(l) for _, l in zip(range(20000), f)]
        replay = random.Random(a.seed + 1).sample(pool, a.replay)
    tt.add([encode_conv(tok, c["segs"]) for c in train + replay])
    t0 = time.time()
    for s in range(a.steps):
        loss, _ = tt.step()
        if s % 10 == 0 or s == a.steps - 1:
            print(f"step {s:3d} loss {loss:.4f}")
    secs = time.time() - t0
    model = model.to(device).eval()
    after = {l: score(model, tok, test[l], device) for l in test}
    after_base = score(model, tok, base, device)
    print(json.dumps({"blocks": a.blocks, "examples": len(train), "replay": len(replay), "steps": a.steps, "lr": a.lr, "trainable": sum(p.numel() for p in tt.params),
                      "bus_before": before, "bus_after": after, "base_before": before_base, "base_after": after_base, "cpu_seconds": round(secs, 1)}, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["fixture", "demo"])
    ap.add_argument("--ckpt", default="out/ckpt.pt")
    ap.add_argument("--tok", default="out/tokenizer.json")
    ap.add_argument("--data", default="out/data")
    ap.add_argument("--blocks", type=int, default=1)
    ap.add_argument("--n", type=int, default=12, help="training examples per language")
    ap.add_argument("--steps", type=int, default=40)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--replay", type=int, default=0, help="ordinary training conversations to mix in")
    ap.add_argument("--fixtures", default=FIXTURES, help="where the fixture goes")
    a = ap.parse_args()
    fixture(a) if a.what == "fixture" else demo(a)


if __name__ == "__main__":
    main()
