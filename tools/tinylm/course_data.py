"""Course episodes for the scene model, mixed with the drawing drills.

Reads the written lessons in content/units (readings, key terms, checked questions
and their explanations), in English and Arabic. A course turn is a question and a
short answer, with no scene call. The drawing drills stay the larger share, so the
model still writes scene JSON.

  python course_data.py --scene out/scene-data --out out/scene-course-data
"""
from __future__ import annotations

import argparse
import json
import os
import random

from bpe import Tokenizer
from scene_data import dumps, episode, row, scene_result, segs, spec_for_question
from train import encode_conv

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SKIP_PROMPT = {
    "read", "watch", "اقرأ", "شاهد", "try it", "جرّب",
    "what do you suggest", "complete the sentence", "complete the sentences",
    "what does this program print", "which statement is true", "which is best",
    "ماذا تقترح", "أكمل الجملة", "أكمل الجمل", "ماذا يطبع هذا البرنامج",
}


def clean(text: str) -> str:
    for ch in ("\u2066", "\u2067", "\u2068", "\u2069", "*"):
        text = text.replace(ch, "")
    return " ".join(text.replace("·", "،").split())


def txt(node: object, lang: str) -> str:
    if isinstance(node, str):
        return clean(node)
    if isinstance(node, dict):
        return clean(str(node.get(lang) or ""))
    return ""


def lead(text: str, n: int = 1) -> str:
    """One crisp sentence so each turn minimizes tokens and fits 384 context easily."""
    parts: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in ".!?؟" and len(buf.strip()) > 28:
            parts.append(buf.strip())
            buf = ""
            if len(parts) >= n:
                break
    got = " ".join(parts) if parts else text.strip()
    return got[:260].rsplit(" ", 1)[0] if len(got) > 260 else got


def opt_text(opt: dict, lang: str) -> str:
    return txt(opt.get("text") or opt.get("label"), lang)


def plan_for(lang: str) -> str:
    return "none"


def add(out: list[dict], lang: str, user: str, answer: str, unit_id: str = "") -> None:
    user, answer = user.strip(), answer.strip()
    if len(user) < 2 or len(answer) < 8:
        return
    low = user.rstrip(".؟?!").lower()
    if low in SKIP_PROMPT or any(p in low for p in ("this program", "this table", "what do you suggest", "complete the sentence", "البرنامج التالي", "ماذا تقترح", "أكمل الجمل")):
        return
    spec = spec_for_question(user, unit_id)
    out.append(row(lang, spec["kind"], segs(user, spec["kind"], dumps(spec), dumps(scene_result(spec)), answer)))


def dialogue(lang: str, turns: list[tuple[str, str]], unit_id: str = "") -> dict:
    """Two spoken turns: the person asks, sees the scene and explanation, then asks again."""
    parts: list[list[str]] = [["tools", "scene"]]
    first_q, _ = turns[0]
    spec = spec_for_question(first_q, unit_id)
    plan = spec["kind"]
    res_str = dumps(scene_result(spec))
    spec_str = dumps(spec)
    for user, answer in turns:
        parts += [
            ["user", user],
            ["plan", plan],
            ["call", "scene" + spec_str],
            ["result", res_str],
            ["answer", answer],
            ["end", ""],
        ]
    return row(lang, "course", parts)


def pair(text: str) -> tuple[str, str]:
    one = lead(text, 1)
    return one, ""


def talk(out: list[dict], lang: str, name: str, answer: str, unit_id: str = "") -> None:
    """The same explanation, asked the way a person talks to a tutor, then once more."""
    name = name.strip()
    both, _ = pair(answer)
    if len(name) < 2 or len(both) < 8:
        return
    if lang == "ar":
        asked = [
            name, f"ما هو {name}؟", f"اشرح لي {name}", f"لا أفهم {name}", f"علّمني {name}",
            f"ما معنى {name}؟", f"فسّر {name} بكلمات بسيطة.", f"كيف تشرح {name} لمبتدئ؟",
            f"ساعدني على فهم فكرة {name}.", f"اشرح {name} خطوة بخطوة.", f"لماذا يعد {name} مهمًا؟",
        ]
        again = "ما زلت لا أفهم. اشرح مرة أخرى."
        extra = "زدني قليلًا."
    else:
        asked = [
            name.lower(), f"What is {name}?", f"Can you explain {name}?", f"I don't understand {name}.", f"Teach me {name}.",
            f"What does {name} mean?", f"In simple words, explain {name}.", f"How would you teach {name} to a beginner?",
            f"Help me understand the idea of {name}.", f"Could you walk me through {name}?", f"Why does {name} matter?",
        ]
        if " " not in name and "(" not in name and len(name) > 2 and name[0].isupper() and name[1].islower():
            asked.append(f"What is a {name[0].lower()}{name[1:]}?")
        again = "I still don't understand. Explain it again."
        extra = "Tell me a bit more."
    for q in asked:
        add(out, lang, q, both, unit_id)
    out.append(dialogue(lang, [(asked[6], both), (again, both)], unit_id))
    out.append(dialogue(lang, [(asked[7], both), (extra, both)], unit_id))


def greetings() -> list[dict]:
    en = [
        ("Hello, can you teach me?", "Hello. Ask me about a technology idea, and I will explain it."),
        ("Can you help me understand?", "Yes. Tell me which idea you want to understand, and ask again if it is not clear."),
    ]
    ar = [
        ("مرحبًا، هل تعلّمني؟", "مرحبًا. اسألني عن فكرة تقنية، وسأشرحها."),
        ("هل تساعدني على الفهم؟", "نعم. قل لي أي فكرة تريد أن تفهمها، واسأل مرة أخرى إن لم تتضح."),
    ]
    return [row("en", "course", segs(q, "none", None, None, a)) for q, a in en] + [
        row("ar", "course", segs(q, "none", None, None, a)) for q, a in ar
    ]


def from_step(step: dict, lang: str, out: list[dict], unit_id: str = "") -> None:
    if step.get("type") != "read":
        return
    title = txt(step.get("title"), lang)
    body = lead(txt(step.get("body"), lang), 1)
    add(out, lang, f"اشرح: {title}" if lang == "ar" else f"Explain: {title}", body, unit_id)
    talk(out, lang, title, body, unit_id)
    for term in step.get("keyTerms") or []:
        name, defin = txt(term.get("term"), lang), lead(txt(term.get("def"), lang), 1)
        talk(out, lang, name, defin, unit_id)


PACK_NAMES = {
    "opt-dijkstra": ("shortest path", "أقصر طريق"),
    "opt-greedy": ("knapsack", "مسألة الحقيبة"),
    "iot-temperature": ("sensor", "الحساس"),
    "iot-adc": ("ADC", "المحوّل التناظري"),
    "trace-loop": ("a loop", "الحلقة"),
    "array-bubble": ("bubble sort", "الترتيب الفقاعي"),
    "query-top": ("a query", "الاستعلام"),
    "net-https": ("HTTPS", "HTTPS"),
}


def pack_talks() -> list[dict]:
    path = os.path.join(ROOT, "apps", "web", "src", "labs", "apps", "tutor", "draws.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        scenes = json.load(f)["scenes"]
    out: list[dict] = []
    for sid, (en, ar) in PACK_NAMES.items():
        nav = scenes[sid]["narration"]
        talk(out, "en", en, nav["en"])
        talk(out, "ar", ar, nav["ar"])
    return out


def from_unit(unit: dict) -> list[dict]:
    out: list[dict] = []
    unit_id = str(unit.get("id") or "")
    for lang in ("en", "ar"):
        title, summary = txt(unit.get("title"), lang), txt(unit.get("summary"), lang)
        q = f"عمّ يدور مقرر {title}؟" if lang == "ar" else f"What is the course {title} about?"
        add(out, lang, q, summary, unit_id)
        talk(out, lang, title, summary, unit_id)
        for lesson in unit.get("lessons") or []:
            for step in lesson.get("steps") or []:
                from_step(step, lang, out, unit_id)
                question = ((step.get("checkpoint") or {}).get("question"))
                if isinstance(question, dict):
                    from_step(question, lang, out, unit_id)
    return out


def fit(tok: Tokenizer, ep: dict) -> dict | None:
    answer = ep["segs"][-2]
    text = answer[1]
    while text:
        answer[1] = text
        if len(encode_conv(tok, ep["segs"])[0]) <= 384:
            return ep
        cut = text[: max(40, int(len(text) * 0.75))]
        text = cut.rsplit(" ", 1)[0].strip()
        if len(text) < 40:
            return None
    return None


def push_card(out: dict[str, list[dict]], seen: set[tuple[str, str, str]], lang: str, q: str, text: str, kind: int) -> None:
    """One thing the phone can look up: a term, a title, or a checked question. kind 0 is a term."""
    q = clean(q).strip()
    both, more = pair(text)
    if len(q) < 2 or len(both) < 12:
        return
    key = (lang, q.casefold(), both)
    if key in seen:
        return
    seen.add(key)
    card: dict[str, object] = {"q": q, "text": both, "k": kind}
    if more:
        card["more"] = more
    out[lang].append(card)


def index_step(step: dict, lang: str, out: dict[str, list[dict]], seen: set[tuple[str, str, str]]) -> None:
    kind = step.get("type")
    prompt = txt(step.get("prompt"), lang)
    explain = txt(step.get("explain"), lang)
    if kind == "read":
        title = txt(step.get("title"), lang)
        push_card(out, seen, lang, title, lead(txt(step.get("body"), lang), 2), 1)
        for term in step.get("keyTerms") or []:
            push_card(out, seen, lang, txt(term.get("term"), lang), txt(term.get("def"), lang), 0)
        return
    if kind in ("choice", "image"):
        picked = next((o for o in step.get("options") or [] if o.get("id") == step.get("answer")), None)
        if picked:
            ans = opt_text(picked, lang)
            push_card(out, seen, lang, prompt, f"{ans}. {explain}" if explain else ans, 2)
        return
    if kind == "multi":
        want = set(step.get("answers") or [])
        names = [n for n in (opt_text(o, lang) for o in step.get("options") or [] if o.get("id") in want) if n]
        if names:
            sep = "، " if lang == "ar" else ", "
            push_card(out, seen, lang, prompt, sep.join(names) + (". " + explain if explain else ""), 2)
        return
    if kind == "truefalse":
        ans = ("نعم" if lang == "ar" else "Yes") if step.get("answer") else ("لا" if lang == "ar" else "No")
        push_card(out, seen, lang, prompt, f"{ans}. {explain}" if explain else ans, 2)
        return
    if kind == "match":
        pairs = [f"{txt(p.get('left'), lang)}: {txt(p.get('right'), lang)}" for p in step.get("pairs") or []]
        pairs = [p for p in pairs if ": " in p and not p.startswith(": ") and not p.endswith(": ")]
        if pairs:
            sep = "، " if lang == "ar" else ", "
            push_card(out, seen, lang, prompt, sep.join(pairs), 2)
        return
    if kind == "order":
        steps = [s for s in (txt(s, lang) for s in step.get("steps") or []) if s]
        if steps:
            push_card(out, seen, lang, prompt, " ".join(f"{i}. {s}" for i, s in enumerate(steps, 1)), 2)
        return
    if kind == "scenario":
        good = next((c for c in step.get("choices") or [] if c.get("tone") == "good"), None)
        if good:
            ans, why = txt(good.get("label"), lang), txt(good.get("consequence"), lang)
            push_card(out, seen, lang, prompt, f"{ans}. {why}" if why else ans, 2)
        return
    if explain and len(prompt) > 12:
        push_card(out, seen, lang, prompt, explain, 2)


def build_index(units_dir: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {"en": [], "ar": []}
    seen: set[tuple[str, str, str]] = set()
    for name in sorted(n for n in os.listdir(units_dir) if n.endswith(".json")):
        with open(os.path.join(units_dir, name), encoding="utf-8") as f:
            unit = json.load(f)
        for lang in ("en", "ar"):
            push_card(out, seen, lang, txt(unit.get("title"), lang), txt(unit.get("summary"), lang), 1)
            for lesson in unit.get("lessons") or []:
                for step in lesson.get("steps") or []:
                    index_step(step, lang, out, seen)
                    question = (step.get("checkpoint") or {}).get("question")
                    if isinstance(question, dict):
                        index_step(question, lang, out, seen)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--units", default=os.path.join(ROOT, "content", "units"))
    ap.add_argument("--scene", default="out/scene-data")
    ap.add_argument("--out", default="out/scene-course-data")
    ap.add_argument("--tok", default="tokenizer.json")
    ap.add_argument("--share", type=float, default=0.30, help="course rows as a fraction of the drawing rows")
    ap.add_argument("--index", default="", help="write the phone's course lookup and exit")
    a = ap.parse_args()
    if a.index:
        data = build_index(a.units)
        with open(a.index, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        n = sum(len(v) for v in data.values())
        print(f"cards {n} -> {a.index} ({os.path.getsize(a.index):,} bytes)")
        return
    tok = Tokenizer.load(a.tok)
    episodes: list[dict] = []
    files = [n for n in os.listdir(a.units) if n.endswith(".json")]
    for name in sorted(files):
        with open(os.path.join(a.units, name), encoding="utf-8") as f:
            episodes += from_unit(json.load(f))
    episodes += greetings()
    episodes += pack_talks()
    kept = []
    dropped = 0
    for ep in episodes:
        got = fit(tok, ep)
        if got is None:
            dropped += 1
        else:
            kept.append(got)
    rng = random.Random(3)
    rng.shuffle(kept)
    # Every course fact stays in the training set. A 3 MB model does not generalise to a held-out wording,
    # and the lessons are what it is supposed to know. The val file stays the drawing drills.
    train = kept
    os.makedirs(a.out, exist_ok=True)

    def count(path: str) -> int:
        with open(path, encoding="utf-8") as f:
            return sum(1 for _ in f)

    scene_train = count(os.path.join(a.scene, "train.jsonl"))
    target = int(scene_train * a.share)
    copies = max(1, (target + len(train) - 1) // len(train)) if train else 0

    def write_mixed(split: str, course: list[dict], repeat: int) -> int:
        src = os.path.join(a.scene, f"{split}.jsonl")
        dst = os.path.join(a.out, f"{split}.jsonl")
        n = 0
        with open(src, encoding="utf-8") as inp, open(dst, "w", encoding="utf-8") as out:
            for line in inp:
                out.write(line)
                n += 1
            for _ in range(repeat):
                for ep in course:
                    out.write(json.dumps(ep, ensure_ascii=False) + "\n")
                    n += 1
        return n

    n_tr = write_mixed("train", train, copies)
    n_va = write_mixed("val", [], 0)
    kinds = ["neuron", "net", "arch", "plot", "gates", "bits", "signal", "trace", "flow", "search", "packet", "seq", "query", "pattern", "graph", "sort", "bag", "none"]
    for lang, seed in (("en", 99), ("ar", 101)):
        lang_dir = os.path.join(os.path.dirname(a.out) or "out", f"scene-{lang}")
        os.makedirs(lang_dir, exist_ok=True)
        for fn in os.listdir(lang_dir):
            if fn.endswith(".npz"):
                os.remove(os.path.join(lang_dir, fn))
        marker = f'"lang": "{lang}"'
        with open(os.path.join(a.out, "train.jsonl"), encoding="utf-8") as inp, open(os.path.join(lang_dir, "train.jsonl"), "w", encoding="utf-8") as out_f:
            lang_n = 0
            for line in inp:
                if marker in line:
                    out_f.write(line)
                    lang_n += 1
        vrng = random.Random(seed)
        with open(os.path.join(lang_dir, "val.jsonl"), "w", encoding="utf-8") as out_v:
            for i in range(1000):
                out_v.write(json.dumps(episode(vrng, lang, kinds[i % len(kinds)]), ensure_ascii=False) + "\n")
        print(f"scene-{lang}: train {lang_n}, val 1000 -> {lang_dir}")
    print(
        f"units {len(files)}; course episodes {len(kept)} (dropped {dropped}); "
        f"train copies {copies}; mixed train {n_tr}, val {n_va} -> {a.out}"
    )


if __name__ == "__main__":
    main()
