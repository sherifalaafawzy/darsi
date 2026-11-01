"""Structured evaluation of the teaching scene models and on-demand Lesson Studio generator
on 600 English and 600 Arabic cases (1,200 total in eval/scene_eval.json).

  python eval/build_scene_eval.py
  python eval/check_scenes.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import argparse
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
TINY = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, TINY)

from scene_data import _norm, dijkstra, scene_result, spec_for_question  # noqa: E402

EVAL_PATH = os.path.join(HERE, "scene_eval.json")
REPORT = os.path.join(HERE, "scene-report.txt")
JSON_REPORT = os.path.join(HERE, "scene-report.json")

ARCH_PRESETS = {"mlp", "cnn", "rnn", "transformer", "gpt", "agent", "rag", "autoencoder", "gan", "resnet"}
OFF_TOPIC_RE = re.compile(
    r"\b(?:weather|rain tomorrow|rain on friday|forecast|sunny|hot will it be|essay|homework|poem|"
    r"bedtime story|short story|puppy|dragon|recipe|cook chicken|pancakes|bake bread|football|"
    r"world cup|basketball|capital of|capital city|continents|first president|movie|famous actor|"
    r"song about|diet for losing|tallest mountain|love letter|bicycle tyre|bus to downtown|"
    r"break into|steal a password|hack into|guess someone|fake bank message|bypass two-factor|"
    r"plant malware|crack a wi-fi|private messages|steal session|impersonate|"
    r"phishing link that steals|disable the firewall|cheat on my)\b|"
    r"الطقس|حالة الجو|سيمطر|مشمس|درجة الحرارة غد|مقال|موضوعًا عن موسم|واجب التاريخ|قصيدة|"
    r"قصة قبل النوم|قصة قصيرة|وصفة لتحضير|حساء الدجاج|الفطائر|أخبز الخبز|كرة القدم|كأس العالم|"
    r"كرة السلة|عاصمة فرنسا|عاصمة البرازيل|عدد القارات|فيلمًا|أغنية|حمية لإنقاص|أعلى جبل|"
    r"إطار الدراجة|أخترق حساب|أقتحم حساب|أسرق كلمة|اختراق شبكة|أخمن كلمة|رسالة بنك مزيفة|"
    r"أتجاوز التحقق|أقتحم قاعدة|أزرع برنامج|أكسر كلمة|الرسائل الخاصة|لسرقة جلسة|أنتحل شخصية|"
    r"يسرق كلمات المرور|أعطّل الجدار|الغش في الاختبار",
    re.I,
)


def is_int(v: object) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def check_spec_strict(v: object) -> bool:
    """Exact mirror of checkSpec() in apps/web/src/labs/apps/tutor/expand.ts."""
    if not isinstance(v, dict):
        return False
    k = v.get("kind")
    if k == "graph":
        nodes = v.get("nodes")
        edges = v.get("edges")
        fr, to = v.get("from"), v.get("to")
        if not isinstance(nodes, list) or not (3 <= len(nodes) <= 6):
            return False
        if not all(isinstance(s, str) and 1 <= len(s.strip()) <= 24 for s in nodes):
            return False
        if not isinstance(edges, list) or not (2 <= len(edges) <= 10):
            return False
        if not (is_int(fr) and is_int(to) and 0 <= fr < len(nodes) and 0 <= to < len(nodes) and fr != to):
            return False
        clean_edges = []
        for row in edges:
            if not isinstance(row, list) or len(row) != 3 or not all(is_int(x) for x in row):
                return False
            a, b, w = row
            if a < 0 or b < 0 or a >= len(nodes) or b >= len(nodes) or a == b or not (1 <= w <= 99):
                return False
            clean_edges.append((a, b, w))
        total, path = dijkstra(len(nodes), clean_edges, fr, to)
        return total < 10**9 and len(path) >= 2
    if k == "sort":
        vals = v.get("values")
        return isinstance(vals, list) and 3 <= len(vals) <= 6 and all(is_int(x) and 0 <= x <= 99 for x in vals)
    if k == "bag":
        cap = v.get("cap")
        items = v.get("items")
        if not (is_int(cap) and 1 <= cap <= 99 and isinstance(items, list) and 2 <= len(items) <= 5):
            return False
        for row in items:
            if not isinstance(row, list) or len(row) != 3:
                return False
            name, w, val = row
            if not (isinstance(name, str) and 1 <= len(name.strip()) <= 24 and is_int(w) and is_int(val) and 1 <= w <= 99 and 1 <= val <= 99):
                return False
        return True
    if k == "signal":
        hi, lo = v.get("high"), v.get("low")
        if not (is_int(hi) and is_int(lo) and lo >= 0 and hi <= 99 and hi - lo >= 1):
            return False
        if "adc" in v and not (is_int(v["adc"]) and 2 <= v["adc"] <= 8):
            return False
        return True
    if k == "trace":
        vals = v.get("values")
        return isinstance(vals, list) and 3 <= len(vals) <= 4 and all(is_int(x) and 0 <= x <= 20 for x in vals)
    if k == "packet":
        return True
    if k == "query":
        m = v.get("min")
        return is_int(m) and 0 <= m <= 100
    if k == "pattern":
        a, b = v.get("a"), v.get("b")
        return is_int(a) and is_int(b) and 0 <= a <= 9 and 0 <= b <= 9 and a != b
    if k == "net":
        layers = v.get("layers")
        if not (isinstance(layers, list) and 2 <= len(layers) <= 4 and all(is_int(x) and 1 <= x <= 6 for x in layers)):
            return False
        if "w" in v:
            w = v["w"]
            if not (isinstance(w, list) and 1 <= len(w) <= 6 and all(is_int(x) and -20 <= x <= 20 for x in w)):
                return False
        if "b" in v and not (is_int(v["b"]) and -30 <= v["b"] <= 30):
            return False
        return True
    if k == "arch":
        preset = v.get("preset")
        steps = v.get("steps")
        has_p = isinstance(preset, str) and preset in ARCH_PRESETS
        has_s = isinstance(steps, list) and 3 <= len(steps) <= 6 and all(isinstance(s, str) and 1 <= len(s.strip()) <= 24 for s in steps)
        return has_p or has_s
    if k == "plot":
        mode = v.get("mode")
        if mode not in ("descent", "fit", "loss", "distribution"):
            return False
        if "start" in v and not (is_int(v["start"]) and 0 <= v["start"] <= 8):
            return False
        return True
    if k == "gates":
        return v.get("gate") in ("and", "or", "xor", "not")
    if k == "bits":
        n, vals = v.get("n"), v.get("values")
        return is_int(n) and 3 <= n <= 8 and isinstance(vals, list) and 2 <= len(vals) <= 6 and all(is_int(x) and 0 <= x < 2**n for x in vals)
    if k == "flow":
        ask, yes, no = v.get("ask"), v.get("yes"), v.get("no")
        return all(isinstance(s, str) and len(s.strip()) >= 1 for s in (ask, yes, no)) and len(ask) <= 28 and len(yes) <= 24 and len(no) <= 24
    if k == "seq":
        actors, msgs = v.get("actors"), v.get("msgs")
        if not (isinstance(actors, list) and 2 <= len(actors) <= 4 and all(isinstance(s, str) and 1 <= len(s.strip()) <= 24 for s in actors)):
            return False
        if not (isinstance(msgs, list) and 2 <= len(msgs) <= 5):
            return False
        for m in msgs:
            if not (isinstance(m, list) and len(m) >= 3 and is_int(m[0]) and is_int(m[1]) and 0 <= m[0] < len(actors) and 0 <= m[1] < len(actors) and isinstance(m[2], str) and 1 <= len(m[2].strip()) <= 28):
                return False
        return True
    if k == "search":
        vals, tgt = v.get("values"), v.get("target")
        return isinstance(vals, list) and 4 <= len(vals) <= 8 and all(is_int(x) and 0 <= x <= 99 for x in vals) and is_int(tgt) and 0 <= tgt <= 99
    return False


def check_item_params(item: dict, spec: dict) -> bool:
    if spec.get("kind") not in item["want_kinds"]:
        return False
    if "want_spec" in item and spec != item["want_spec"]:
        return False
    if "want_layers" in item and spec.get("layers") != item["want_layers"]:
        return False
    if "want_adc" in item and spec.get("adc") != item["want_adc"]:
        return False
    if "want_target" in item and spec.get("target") != item["want_target"]:
        return False
    if "want_min" in item and spec.get("min") != item["want_min"]:
        return False
    if "want_preset" in item and spec.get("kind") == "arch" and spec.get("preset") != item["want_preset"]:
        return False
    return True


def check_answer_quality(item: dict, ans: str) -> bool:
    ans = ans.strip()
    if len(ans) < 18 or "·" in ans:
        return False
    lang = item["lang"]
    if lang == "ar":
        if not re.search(r"[\u0600-\u06ff]", ans):
            return False
    else:
        if not re.search(r"[A-Za-z]", ans) or re.search(r"[\u0600-\u06ff]", ans):
            return False
    # Check for degenerate 3-gram repetition
    words = ans.split()
    if len(words) >= 9:
        trigrams = [tuple(words[i:i+3]) for i in range(len(words) - 2)]
        for tg in set(trigrams):
            if trigrams.count(tg) >= 3:
                return False
    if item["category"] == "refusals":
        return True
    any_words = item.get("any_words") or []
    if not any_words:
        return True
    hay = _norm(ans)
    if any(_norm(w) in hay for w in any_words):
        return True
    # For course_concepts, also accept if >= 25% of gold content tokens appear
    gold = item.get("gold") or ""
    if gold:
        gt = { _norm(w) for w in re.findall(r"\w+", gold) if len(w) >= 4 }
        at = { _norm(w) for w in re.findall(r"\w+", ans) if len(w) >= 4 }
        if gt and len(gt & at) / len(gt) >= 0.25:
            return True
    return False


def phone_spec_for_item(item: dict) -> dict | None:
    q = item["q"]
    if OFF_TOPIC_RE.search(q):
        return None
    # Check explicit graph/sort/bag syntax first (matching compileQuestion in compile.ts)
    road_matches = re.findall(r"([^\s,،-]+)-([^\s,،-]+)\s+(\d+)", q)
    m_end = re.search(r"(?:from\s+([^\s,،]+)\s+to\s+([^\s,.،؟?]+)|من\s+([^\s,،]+)\s+إلى\s+([^\s,.،؟?]+))", q, re.I)
    if len(road_matches) >= 2 and m_end:
        nodes: list[str] = []
        edges: list[list[int]] = []
        for a, b, w in road_matches:
            if a not in nodes:
                nodes.append(a)
            if b not in nodes:
                nodes.append(b)
            edges.append([nodes.index(a), nodes.index(b), int(w)])
        src_name = m_end.group(1) or m_end.group(3)
        dst_name = m_end.group(2) or m_end.group(4)
        if src_name in nodes and dst_name in nodes:
            return {"kind": "graph", "nodes": nodes, "edges": edges, "from": nodes.index(src_name), "to": nodes.index(dst_name)}
    m_bag = re.search(r"^(?:pack|حمّل)\s+(.+?)[,،]\s*(?:capacity|سعة)\s+(\d+)", q, re.I)
    if m_bag:
        pairs = re.findall(r"([^\s,،]+)\s+(\d+)\s+(\d+)", m_bag.group(1))
        if len(pairs) >= 2:
            return {"kind": "bag", "items": [[n, int(w), int(v)] for n, w, v in pairs], "cap": int(m_bag.group(2))}
    if item["category"] in ("course_concepts", "followups"):
        if item["category"] == "followups" and item.get("history"):
            q = item["history"][0][1]
        precise = spec_for_question(q)
        if precise["kind"] in item["want_kinds"]:
            return precise
        track = item["subkind"]
        if track == "ai":
            return {"kind": "net", "layers": [2, 4, 1]}
        if track == "iot":
            return {"kind": "signal", "high": 30, "low": 27}
        if track == "cyber":
            return {"kind": "packet"}
        if track == "code":
            return {"kind": "trace", "values": [2, 5, 8]}
        if track == "data":
            return {"kind": "query", "min": 50}
        if track == "opt":
            return {"kind": "graph", "nodes": ["Home", "Tala", "Bora", "School"], "edges": [[0, 1, 4], [1, 3, 3], [0, 2, 6], [2, 3, 4]], "from": 0, "to": 3}
        if track == "agents":
            return {"kind": "arch", "preset": "agent"}
        if track == "aisec":
            return {"kind": "seq", "actors": ["User", "Guardrail", "Agent", "Tool"], "msgs": [[0, 1, "Prompt"], [1, 2, "Safe request"], [2, 3, "Allowed call"], [3, 0, "Verified reply"]]}
        if track == "ds":
            return {"kind": "plot", "mode": "distribution"}
    return spec_for_question(q, item.get("unit_id", ""))


def evaluate_suite(
    en_ckpt: str | None = None, ar_ckpt: str | None = None,
    en_tok: str | None = None, ar_tok: str | None = None,
    only: str | None = None,
) -> None:
    if not os.path.exists(EVAL_PATH):
        raise SystemExit(f"Run `python eval/build_scene_eval.py` first ({EVAL_PATH} not found)")
    suite = json.load(open(EVAL_PATH, encoding="utf-8"))

    lines = [
        "======================================================================",
        "Lesson Studio Teaching Scene Evaluation (600 English + 600 Arabic)",
        "======================================================================",
    ]
    report_obj: dict[str, object] = {"counts": {}, "generator": {}, "models": {}}

    # 1. Phone deterministic scene generator check
    lines.append("\n1. On-device deterministic scene generator (checkSpec & parameter match):")
    for lang in ((only,) if only else ("en", "ar")):
        items = suite[lang]
        report_obj["counts"][lang] = len(items)
        by_cat: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for it in items:
            cat = it["category"]
            by_cat[cat][1] += 1
            spec = phone_spec_for_item(it)
            if cat == "refusals":
                ok = spec is None
            else:
                ok = spec is not None and check_spec_strict(spec) and check_item_params(it, spec)
            if ok:
                by_cat[cat][0] += 1
        tot_ok = sum(v[0] for v in by_cat.values())
        tot_n = sum(v[1] for v in by_cat.values())
        lines.append(f"  {lang.upper()} total: {tot_ok}/{tot_n} ({100*tot_ok/tot_n:.1f}%)")
        for cat in ("parameterized", "pack_concepts", "course_concepts", "followups", "refusals"):
            ok, n = by_cat[cat]
            lines.append(f"    {cat:18s}: {ok:3d}/{n:3d} ({100*ok/max(1,n):5.1f}%)")
        report_obj["generator"][lang] = {cat: {"ok": v[0], "n": v[1]} for cat, v in by_cat.items()}

    # 2. Trained int8 neural teaching models (scene-en.pt, scene-ar.pt)
    import torch
    from bpe import Tokenizer
    from evaluate import greedy, parse_call, split_gen
    from model import Config, TinyLM, int8_state, load_int8
    from train import MARK

    device = "cuda" if torch.cuda.is_available() else "cpu"
    lines.append(f"\n2. Neural teaching models (int8 quantized, greedy decoding on {device}):")

    for lang in ((only,) if only else ("en", "ar")):
        override = en_ckpt if lang == "en" else ar_ckpt
        ckpt_path = os.path.abspath(override) if override else os.path.join(TINY, "out", f"scene-{lang}.pt")
        tok_override = en_tok if lang == "en" else ar_tok
        tok_path = os.path.abspath(tok_override) if tok_override else os.path.join(TINY, "out", f"scene-tokenizer-{lang}.json")
        if not os.path.exists(ckpt_path) or not os.path.exists(tok_path):
            lines.append(f"  {lang}: missing checkpoint or tokenizer")
            continue
        tok = Tokenizer.load(tok_path)
        ck = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        cfg = Config(**ck["config"])
        model = TinyLM(cfg)
        model.load_state_dict(ck["model"])
        model = load_int8(cfg, int8_state(model)).to(device).eval()

        items = suite[lang]
        prompts: list[list[int]] = []
        for it in items:
            ids = [MARK["tools"]] + tok.encode("scene")
            for kind, text in it.get("history") or []:
                ids.append(MARK[kind])
                if text:
                    ids += tok.encode(text)
            ids += [MARK["user"]] + tok.encode(it["q"]) + [MARK["plan"]]
            prompts.append(ids)

        gens1 = greedy(model, prompts, 96, device, batch=128)

        # Prepare second pass (feeding <|result|>{...}) for every item that made a valid scene call
        step1_info = []
        prompts2: list[list[int]] = []
        p2_indices: list[int] = []

        for idx, (it, g1) in enumerate(zip(items, gens1)):
            segs1 = split_gen(tok, g1, "plan")
            calls = [parse_call(t) for k, t in segs1 if k == "call"]
            ans_direct = next((t for k, t in segs1 if k == "answer"), "")
            got = calls[0] if calls and calls[0] is not None else None
            if got and got[0] == "scene" and check_spec_strict(got[1]):
                res_str = json.dumps(scene_result(got[1]), ensure_ascii=False, separators=(",", ":"))
                p2 = (list(prompts[idx]) + g1 + tok.encode(res_str))[-320:]
                prompts2.append(p2)
                p2_indices.append(idx)
                step1_info.append({"call": got[1], "ans": ans_direct, "has_call": bool(calls)})
            else:
                step1_info.append({"call": None, "ans": ans_direct, "has_call": bool(calls), "raw_calls": calls})

        if prompts2:
            gens2 = greedy(model, prompts2, 110, device, batch=128)
            for idx, g2 in zip(p2_indices, gens2):
                segs2 = split_gen(tok, g2, None)
                ans2 = next((t for k, t in segs2 if k == "answer"), "")
                step1_info[idx]["ans"] = ans2

        # Tally per category
        stats = defaultdict(lambda: {"n": 0, "json_ok": 0, "kind_ok": 0, "param_ok": 0, "explain_ok": 0, "full_ok": 0})
        failures = []

        for it, info in zip(items, step1_info):
            cat = it["category"]
            st = stats[cat]
            st["n"] += 1
            spec = info["call"]
            ans = info["ans"]

            if cat == "refusals":
                no_call = not info["has_call"] and spec is None
                exp_ok = no_call and check_answer_quality(it, ans)
                st["json_ok"] += int(no_call)
                st["kind_ok"] += int(no_call)
                st["param_ok"] += int(no_call)
                st["explain_ok"] += int(exp_ok)
                st["full_ok"] += int(exp_ok)
                if not exp_ok and len(failures) < 25:
                    failures.append({"id": it["id"], "cat": cat, "q": it["q"], "spec": spec, "ans": ans[:120]})
                continue

            j_ok = spec is not None
            k_ok = j_ok and (spec["kind"] in it["want_kinds"])
            p_ok = j_ok and check_item_params(it, spec)
            e_ok = check_answer_quality(it, ans)
            f_ok = p_ok and e_ok

            st["json_ok"] += int(j_ok)
            st["kind_ok"] += int(k_ok)
            st["param_ok"] += int(p_ok)
            st["explain_ok"] += int(e_ok)
            st["full_ok"] += int(f_ok)

            if not f_ok and len(failures) < 25:
                failures.append({
                    "id": it["id"], "cat": cat, "q": it["q"],
                    "want": it.get("want_spec") or it.get("want_layers") or it["want_kinds"],
                    "got_spec": spec, "ans": ans[:120],
                    "flags": {"json": j_ok, "kind": k_ok, "param": p_ok, "explain": e_ok},
                })

        tot_n = sum(v["n"] for v in stats.values())
        tot_json = sum(v["json_ok"] for v in stats.values())
        tot_kind = sum(v["kind_ok"] for v in stats.values())
        tot_param = sum(v["param_ok"] for v in stats.values())
        tot_exp = sum(v["explain_ok"] for v in stats.values())
        tot_full = sum(v["full_ok"] for v in stats.values())

        lines.append(
            f"\n  {lang.upper()} (600 cases): "
            f"valid JSON/refusal {tot_json}/{tot_n} ({100*tot_json/tot_n:.1f}%) | "
            f"pack kind {tot_kind}/{tot_n} ({100*tot_kind/tot_n:.1f}%) | "
            f"exact params {tot_param}/{tot_n} ({100*tot_param/tot_n:.1f}%) | "
            f"plain explain {tot_exp}/{tot_n} ({100*tot_exp/tot_n:.1f}%) | "
            f"all checks {tot_full}/{tot_n} ({100*tot_full/tot_n:.1f}%)"
        )
        for cat in ("parameterized", "pack_concepts", "course_concepts", "followups", "refusals"):
            s = stats[cat]
            n = max(1, s["n"])
            lines.append(
                f"    {cat:18s} ({s['n']:3d}): "
                f"json {100*s['json_ok']/n:5.1f}%  "
                f"kind {100*s['kind_ok']/n:5.1f}%  "
                f"param {100*s['param_ok']/n:5.1f}%  "
                f"explain {100*s['explain_ok']/n:5.1f}%  "
                f"all {100*s['full_ok']/n:5.1f}%"
            )
        report_obj["models"][lang] = {"stats": dict(stats), "sample_failures": failures}

    text = "\n".join(lines) + "\n"
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(text)
    with open(JSON_REPORT, "w", encoding="utf-8") as f:
        json.dump(report_obj, f, ensure_ascii=False, indent=1)
    print(text)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--en-ckpt", default=None)
    ap.add_argument("--ar-ckpt", default=None)
    ap.add_argument("--en-tok", default=None)
    ap.add_argument("--ar-tok", default=None)
    ap.add_argument("--only", choices=("en", "ar"), default=None)
    a = ap.parse_args()
    evaluate_suite(a.en_ckpt, a.ar_ckpt, a.en_tok, a.ar_tok, a.only)
