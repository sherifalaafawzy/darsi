"""Trains Darsi Tiny on the synthetic episodes (GPU if there is one).

  python train.py --data out/data --tok out/tokenizer.json --out out/ckpt.pt --steps 32000 --accum 2 --checkpoint

The loss counts only what the model writes: plans, calls, answers and the markers that end them (<|result|> after a
call, <|end|> after an answer). Requests, tool lists and tool results are context, never targets, so the model learns
to stop and wait for a result instead of inventing one.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import time
from array import array

import numpy as np
import torch
import torch.nn.functional as F

from bpe import SPECIALS, Tokenizer
from model import Config, TinyLM

MARK = {k: SPECIALS.index(f"<|{k}|>") for k in ("tools", "user", "plan", "call", "result", "answer", "end")}
WRITES = {"plan", "call", "answer"}


def encode_conv(tok: Tokenizer, segs) -> tuple[list[int], list[int]]:
    """Ids and a 0/1 mask: 1 where the model should predict that token."""
    ids, mask = [], []
    for kind, text in segs:
        ids.append(MARK[kind])
        mask.append(1 if kind in WRITES or kind in ("result", "end") else 0)
        if text:
            t = tok.encode(text)
            ids += t
            mask += [1 if kind in WRITES else 0] * len(t)
    return ids, mask


def prepare(path: str, tok: Tokenizer, ctx: int, cache: str):
    if os.path.exists(cache) and os.path.getmtime(cache) > max(os.path.getmtime(path), os.path.getmtime(tok_path)):
        d = np.load(cache)
        return d["ids"], d["mask"], d["off"]
    # Typed arrays, not lists: 80 M tokens as Python ints would take several GB.
    ids, mask, off, dropped = array("H"), array("B"), array("q", [0]), 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            i, m = encode_conv(tok, json.loads(line)["segs"])
            if len(i) > ctx:
                dropped += 1
                continue
            ids.extend(i)
            mask.extend(m)
            off.append(len(ids))
    print(f"{path}: {len(off) - 1} conversations, {len(ids)} tokens, {dropped} longer than {ctx} dropped")
    ids, mask, off = np.frombuffer(ids, np.uint16).copy(), np.frombuffer(mask, np.uint8).copy(), np.frombuffer(off, np.int64).copy()
    np.savez(cache, ids=ids, mask=mask, off=off)
    return ids, mask, off


def batch(ids, mask, off, rows, device):
    lens = [off[r + 1] - off[r] for r in rows]
    T = max(lens)
    x = np.zeros((len(rows), T), np.int64)
    m = np.zeros((len(rows), T), np.float32)
    for j, r in enumerate(rows):
        x[j, :lens[j]] = ids[off[r]:off[r + 1]]
        m[j, :lens[j]] = mask[off[r]:off[r + 1]]
    return torch.from_numpy(x).to(device, non_blocking=True), torch.from_numpy(m).to(device, non_blocking=True)


def loss_fn(model, x, m):
    """Mean cross-entropy over the target tokens; the head runs only where there is a target (about half the
    positions), which halves the memory the logits take."""
    h = model.features(x[:, :-1])
    sel = m[:, 1:] > 0
    logits = h[sel] @ model.tok.weight.T
    return F.cross_entropy(logits.float(), x[:, 1:][sel])


tok_path = ""


def main():
    global tok_path
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="out/data")
    ap.add_argument("--tok", default="out/tokenizer.json")
    ap.add_argument("--out", default="out/ckpt.pt")
    ap.add_argument("--steps", type=int, default=32000)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--warmup", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--dim", type=int, default=192)
    ap.add_argument("--layers", type=int, default=6)
    ap.add_argument("--heads", type=int, default=6)
    ap.add_argument("--ffn", type=int, default=640)
    ap.add_argument("--accum", type=int, default=1, help="split each batch into this many parts (less GPU memory, same result)")
    ap.add_argument("--checkpoint", action="store_true", help="recompute block activations in the backward pass (less memory)")
    a = ap.parse_args()
    tok_path = a.tok

    torch.manual_seed(a.seed)
    random.seed(a.seed)
    np.random.seed(a.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = Tokenizer.load(a.tok)
    cfg = Config(vocab=tok.vocab, dim=a.dim, layers=a.layers, heads=a.heads, ffn=a.ffn)
    tr = prepare(os.path.join(a.data, "train.jsonl"), tok, cfg.ctx, os.path.join(a.data, "train.npz"))
    va = prepare(os.path.join(a.data, "val.jsonl"), tok, cfg.ctx, os.path.join(a.data, "val.npz"))

    model = TinyLM(cfg).to(device)
    model.checkpoint = a.checkpoint
    print(f"{model.params() / 1e6:.3f} M parameters, {cfg}")
    decay = [p for n, p in model.named_parameters() if p.dim() == 2]
    other = [p for n, p in model.named_parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": 0.1}, {"params": other, "weight_decay": 0.0}],
                            lr=a.lr, betas=(0.9, 0.95), eps=1e-8, fused=device == "cuda")
    sched = lambda s: min(1.0, (s + 1) / a.warmup) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * min(1.0, s / a.steps))))  # noqa: E731
    n_tr = len(tr[2]) - 1
    gen = np.random.default_rng(a.seed)
    t0, seen = time.time(), 0

    def val_loss():
        model.eval()
        tot, cnt = 0.0, 0
        with torch.no_grad(), torch.autocast(device, dtype=torch.bfloat16, enabled=device == "cuda"):
            for i in range(0, len(va[2]) - 1, 64):
                rows = list(range(i, min(i + 64, len(va[2]) - 1)))
                x, m = batch(*va, rows, device)
                tot += loss_fn(model, x, m).item() * m[:, 1:].sum().item()
                cnt += m[:, 1:].sum().item()
        model.train()
        return tot / cnt

    for step in range(a.steps):
        for g in opt.param_groups:
            g["lr"] = a.lr * sched(step)
        rows = gen.integers(0, n_tr, a.batch)
        opt.zero_grad(set_to_none=True)
        parts = [batch(*tr, rows[i::a.accum], device) for i in range(a.accum)]
        total = sum(float(m[:, 1:].sum()) for _, m in parts)
        for x, m in parts:
            with torch.autocast(device, dtype=torch.bfloat16, enabled=device == "cuda"):
                part = loss_fn(model, x, m)
            (part * (float(m[:, 1:].sum()) / total)).backward()
        loss = part
        m = parts[0][1]
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        seen += int(total)
        if step % 200 == 0 or step == a.steps - 1:
            msg = f"step {step:6d}  loss {loss.item():.4f}  lr {a.lr * sched(step):.2e}  {time.time() - t0:6.0f}s"
            if device == "cuda" and step == 200:
                msg += f"  peak {torch.cuda.max_memory_allocated() / 2**20:.0f} MiB"
            if step % 2000 == 0 or step == a.steps - 1:
                msg += f"  val {val_loss():.4f}"
            print(msg, flush=True)
        if step % 2000 == 1999:
            torch.save({"config": cfg.to_dict(), "model": model.state_dict(), "steps": step + 1, "args": vars(a)}, a.out)
    torch.save({"config": cfg.to_dict(), "model": model.state_dict(), "steps": a.steps, "args": vars(a)}, a.out)
    print(f"saved {a.out}; {seen / 1e6:.1f} M target tokens seen; {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
