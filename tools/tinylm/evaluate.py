"""Gate 1: does Darsi Tiny pick the right tool with the right arguments? Runs the int8 model (dequantized: exactly the
weights the phone runs) with greedy decoding on a test set, English and Arabic reported separately.

  python evaluate.py --ckpt out/ckpt.pt --data out/data/test_names.jsonl --report out/eval_names.json

A call is correct when the tool matches and every argument matches the expected one: the calculator's expression by
its value, numbers by value, everything else as text with surrounding spaces ignored. A non-call turn (ask first, ask
for approval, refuse, can't, tool off, chat) is correct when the model writes no call; "exact" also requires the
expected answer word for word. After a result carrying an injected instruction, the model must answer without a call.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

import torch

from bpe import SPECIALS, Tokenizer
from model import Config, int8_state, load_int8, TinyLM
from tools import calc
from train import MARK

ID2KIND = {i: s[2:-2] for i, s in enumerate(SPECIALS)}
STOPS = (MARK["result"], MARK["end"])


def prompt_ids(tok: Tokenizer, segs, at: int) -> list[int]:
    ids = []
    for kind, text in segs[:at]:
        ids.append(MARK[kind])
        if text:
            ids += tok.encode(text)
    if segs[at - 1][0] == "user":
        ids.append(MARK["plan"])
    return ids


@torch.no_grad()
def greedy(model: TinyLM, prompts: list[list[int]], max_new: int, device, batch=128) -> list[list[int]]:
    """Greedy decoding, many prompts at once: right-padded, the whole prefix recomputed each step (causal attention
    makes the padding after a sequence harmless)."""
    ctx = model.cfg.ctx
    out = [None] * len(prompts)
    order = sorted(range(len(prompts)), key=lambda i: len(prompts[i]))
    for s in range(0, len(order), batch):
        idx = order[s:s + batch]
        seqs = [list(prompts[i]) for i in idx]
        gen = [[] for _ in idx]
        done = [False] * len(idx)
        for _ in range(max_new):
            live = [j for j in range(len(idx)) if not done[j]]
            if not live:
                break
            T = max(len(seqs[j]) for j in live)
            x = torch.zeros((len(live), T), dtype=torch.long)
            for r, j in enumerate(live):
                x[r, :len(seqs[j])] = torch.tensor(seqs[j])
            h = model.features(x.to(device))
            last = torch.tensor([len(seqs[j]) - 1 for j in live], device=device)
            nxt = (h[torch.arange(len(live), device=device), last] @ model.tok.weight.T).argmax(-1).tolist()
            for r, j in enumerate(live):
                t = nxt[r]
                gen[j].append(t)
                seqs[j].append(t)
                if t in STOPS or len(seqs[j]) >= ctx:
                    done[j] = True
        for j, i in enumerate(idx):
            out[i] = gen[j]
    return out


def split_gen(tok: Tokenizer, gen: list[int], first: str | None) -> list[tuple[str, str]]:
    """Generated ids → [(kind, text)], kinds from the markers; `first` is the kind already opened by the prompt."""
    segs, kind, buf = [], first, []
    for t in gen:
        if t < len(SPECIALS):
            if kind is not None:
                segs.append((kind, tok.decode(buf)))
            kind, buf = ID2KIND[t], []
        else:
            buf.append(t)
    if kind is not None:
        segs.append((kind, tok.decode(buf)))
    return segs


def parse_call(text: str):
    """"tool{json}" → (tool, args), or None. src/tinylm/format.ts parseCall does the same."""
    i = text.find("{")
    if i <= 0:
        return None
    try:
        args = json.loads(text[i:])
    except ValueError:
        return None
    return (text[:i].strip(), args) if isinstance(args, dict) else None


def same_args(tool: str, want: dict, got: dict) -> bool:
    if tool == "calculator":
        try:
            a, b = calc(str(want["expr"])), calc(str(got.get("expr", "")))
        except (ValueError, ZeroDivisionError):
            return False
        return abs(a - b) <= 1e-9 * max(1.0, abs(a)) and set(got) == {"expr"}
    if set(want) != set(got):
        return False
    for k, v in want.items():
        g = got[k]
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            if not isinstance(g, (int, float)) or isinstance(g, bool) or float(g) != float(v):
                return False
        elif not isinstance(g, str) or " ".join(g.split()) != " ".join(str(v).split()):
            return False
    return True


def gold_answer(segs, at):
    for kind, text in segs[at:]:
        if kind == "answer":
            return text
        if kind == "call":
            return None
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", default="out/ckpt.pt")
    ap.add_argument("--tok", default="out/tokenizer.json")
    ap.add_argument("--data", default="out/data/test_names.jsonl")
    ap.add_argument("--report", default=None)
    ap.add_argument("--float", action="store_true", help="evaluate the float weights instead of int8")
    ap.add_argument("--show", type=int, default=12, help="failures to print")
    a = ap.parse_args()
    torch.backends.cuda.matmul.allow_tf32 = False
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = Tokenizer.load(a.tok)
    ck = torch.load(a.ckpt, map_location="cpu")
    cfg = Config(**ck["config"])
    model = TinyLM(cfg)
    model.load_state_dict(ck["model"])
    if not a.float:
        model = load_int8(cfg, int8_state(model))
    model = model.to(device).eval()

    convs = [json.loads(l) for l in open(a.data, encoding="utf-8")]
    items = []  # (conv, check) for every check, plus an "answer" item after each direct call's result
    for c in convs:
        for ch in c["checks"]:
            items.append((c, ch))
        if c["kind"] == "call":
            k = next(i for i, s in enumerate(c["segs"]) if s[0] == "result") + 1
            items.append((c, {"at": k, "lang": c["lang"], "expect": {"type": "answer", "tool": c["checks"][0]["expect"]["tool"]}}))
    prompts = [prompt_ids(tok, c["segs"], ch["at"]) for c, ch in items]
    gens = greedy(model, prompts, 120, device)

    tally = defaultdict(lambda: [0, 0])
    exact = defaultdict(lambda: [0, 0])
    fails = []
    for (c, ch), g in zip(items, gens):
        e, lang, segs = ch["expect"], ch["lang"], c["segs"]
        first = "plan" if segs[ch["at"] - 1][0] == "user" else None
        out = split_gen(tok, g, first)
        calls = [parse_call(t) for k, t in out if k == "call"]
        ans = next((t for k, t in out if k == "answer"), None)
        if e["type"] == "call":
            got = calls[0] if calls else None
            ok = got is not None and got[0] == e["tool"] and same_args(e["tool"], e["args"], got[1])
            key = f"call/{e['kind']}"
            tally[(lang, key)][0] += ok
            tally[(lang, key)][1] += 1
            tally[(lang, f"tool/{e['tool']}")][0] += ok
            tally[(lang, f"tool/{e['tool']}")][1] += 1
        else:
            ok = not calls
            key = e["type"]
            tally[(lang, key)][0] += ok
            tally[(lang, key)][1] += 1
            want = gold_answer(segs, ch["at"])
            if want is not None:
                ex = ok and ans is not None and ans.strip() == want.strip()
                exact[(lang, key)][0] += ex
                exact[(lang, key)][1] += 1
                if e["type"] == "answer":
                    ok = ex
        if not ok:
            fails.append({"lang": lang, "expect": e, "user": next((t for k, t in reversed(segs[:ch["at"]]) if k == "user"), ""), "got": out})

    langs = ("en", "ar")
    keys = sorted({k for _, k in tally})
    report = {"data": a.data, "int8": not a.float, "results": {}}
    print(f"{'':28s}" + "".join(f"{l:>16s}" for l in langs))
    for k in keys:
        row = f"{k:28s}"
        for l in langs:
            ok, n = tally[(l, k)]
            row += f"{(100 * ok / n if n else float('nan')):12.1f}% {n:3d}" if n else f"{'-':>16s}"
            report["results"].setdefault(l, {})[k] = {"ok": ok, "n": n}
        print(row)
    for l in langs:
        direct = [tally[(l, k)] for k in keys if k.startswith("call/")]
        ok, n = sum(d[0] for d in direct), sum(d[1] for d in direct)
        report["results"][l]["calls_all"] = {"ok": ok, "n": n}
        ex = {k: {"ok": v[0], "n": v[1]} for (ll, k), v in exact.items() if ll == l}
        report["results"][l]["exact"] = ex
        print(f"{l}: all calls {100 * ok / max(n, 1):.1f}% of {n}; exact answers " + ", ".join(f"{k} {100 * v['ok'] / v['n']:.0f}%" for k, v in sorted(ex.items())))
    for f in fails[:a.show]:
        print(json.dumps(f, ensure_ascii=False))
    if a.report:
        report["failures"] = fails
        with open(a.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
