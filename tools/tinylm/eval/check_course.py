"""Audit of the course-card dump. This is not the tutor's answer.

The answer is a Lesson Studio scene (see check_scenes.py): a small canvas the
packs animate on the phone. These cards are only a check that the lesson
sentences were copied faithfully. Do not ship them.

Does the card dump actually answer real questions?

  python eval/check_course.py

Gold text is the written lesson in content/units, not the card. Each idea is asked
in several ways. A card is only "right" when its answer still says what the lesson says.

Writes eval/term_questions.json (every key term, five ways, both languages) and
eval/course-report.txt.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CARDS = os.path.join(ROOT, "tools", "tinylm", "out", "course.json")
UNITS = os.path.join(ROOT, "content", "units")
HELD = os.path.join(HERE, "heldout_questions.json")
TERM_OUT = os.path.join(HERE, "term_questions.json")
REPORT = os.path.join(HERE, "course-report.txt")

AR_MARKS = re.compile(r"[ً-ٰٟـ]")
AR_LETTERS = re.compile(r"[؀-ۿ]")
LATIN = re.compile(r"[A-Za-z]")
TOKEN = re.compile(r"[^\W_]+", re.UNICODE)

STOP = {
    "a", "an", "the", "is", "are", "was", "what", "how", "why", "does", "do", "can", "you",
    "explain", "teach", "me", "about", "of", "to", "and", "or", "i", "dont", "understand",
    "still", "again", "tell", "mean", "means", "please", "this", "that", "in", "on", "for",
    "with", "it", "my", "your", "simple", "words", "when", "we", "talk",
    "ما", "هو", "هي", "اشرح", "لي", "لا", "افهم", "علمني", "معنى", "في", "من", "عن",
    "هذا", "هذه", "مره", "اخري", "زدني", "قليلا", "ماذا", "لماذا", "كيف", "هل", "ان",
    "الى", "علي", "مع", "كل", "ذلك", "التي", "الذي",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = AR_MARKS.sub("", s)
    s = s.replace("إ", "ا").replace("أ", "ا").replace("آ", "ا").replace("ٱ", "ا")
    s = s.replace("ى", "ي").replace("ة", "ه")
    return " ".join(s.split())


def tokens(s: str) -> list[str]:
    return [t for t in TOKEN.findall(norm(s)) if t not in STOP and len(t) >= 2]


def keys_of(q: str) -> list[str]:
    extras = re.findall(r"\(([^)]+)\)", q)
    bare = re.sub(r"\([^)]*\)", " ", q)
    out = []
    for part in (q, bare, *extras):
        n = norm(part).strip(" -")
        if len(n) >= 2 and n not in out:
            out.append(n)
    return out


def contains_key(hay: str, key: str) -> bool:
    """A single word must be a whole word, so "count" does not match inside "account". An English plural may add s."""
    if len(key) < 2:
        return False
    if " " in key:
        return key in hay
    return re.search(rf"(^|[^\w]){re.escape(key)}s?([^\w]|$)", hay, re.UNICODE) is not None


def related(a: str, b: str) -> bool:
    ta, tb = set(tokens(a)), set(tokens(b))
    if not ta or not tb:
        return False
    inter = ta & tb
    return len(inter) >= 2 or len(inter) / min(len(ta), len(tb)) >= 0.34


def load_cards() -> dict[str, list[dict]]:
    data = json.load(open(CARDS, encoding="utf-8"))
    indexed = {}
    for lang in ("en", "ar"):
        rows = []
        for card in data[lang]:
            rows.append({**card, "keys": keys_of(card["q"]), "n": norm(card["text"])})
        indexed[lang] = rows
    return indexed


def lookup(question: str, lang: str, cards: dict[str, list[dict]]) -> dict | None:
    hay = norm(question)
    best = None
    best_rank = -1
    for card in cards[lang]:
        matched = 0
        for key in card["keys"]:
            if contains_key(hay, key):
                matched = max(matched, len(key))
        if not matched:
            continue
        # Longer phrase wins. A term (k 0) beats a reused exercise prompt of the same length.
        rank = matched * 10 - int(card.get("k", 9))
        if rank > best_rank:
            best, best_rank = card, rank
    if best and best_rank >= 20:
        return best
    qt = tokens(question)
    if len(qt) < 3:
        return None
    quiz = None
    quiz_f = 0.0
    for card in cards[lang]:
        ct = tokens(card["q"])
        if len(ct) < 3:
            continue
        inter = len(set(qt) & set(ct))
        if inter < 2:
            continue
        prec, rec = inter / len(set(qt)), inter / len(set(ct))
        f1 = 0 if prec + rec == 0 else 2 * prec * rec / (prec + rec)
        if f1 >= 0.5 and f1 > quiz_f:
            quiz, quiz_f = card, f1
    return quiz


def says(text: str, phrases: list[str]) -> bool:
    hay = norm(text)
    return any(norm(p) in hay for p in phrases)


def gold_terms() -> dict[str, dict[str, list[str]]]:
    """term name -> language -> every definition the lessons give it."""
    out: dict[str, dict[str, list[str]]] = {"en": {}, "ar": {}}
    for name in sorted(os.listdir(UNITS)):
        if not name.endswith(".json"):
            continue
        unit = json.load(open(os.path.join(UNITS, name), encoding="utf-8"))
        for lesson in unit.get("lessons") or []:
            for step in lesson.get("steps") or []:
                if step.get("type") != "read":
                    continue
                for term in step.get("keyTerms") or []:
                    for lang in ("en", "ar"):
                        q = (term.get("term") or {}).get(lang) or ""
                        defin = (term.get("def") or {}).get(lang) or ""
                        if len(q) < 2 or len(defin) < 12:
                            continue
                        out[lang].setdefault(q, []).append(defin)
    return out


def term_questions(golds: dict[str, dict[str, list[str]]]) -> list[dict]:
    rows = []
    en_ways = [
        "What is {name}?",
        "Can you explain {name}?",
        "I don't understand {name}.",
        "What does {name} mean?",
        "Teach me {name}.",
    ]
    ar_ways = [
        "ما هو {name}؟",
        "اشرح لي {name}",
        "لا أفهم {name}",
        "ما معنى {name}؟",
        "علّمني {name}",
    ]
    for lang, ways in (("en", en_ways), ("ar", ar_ways)):
        for name, defs in golds[lang].items():
            asks = [w.format(name=name) for w in ways]
            abbr = re.findall(r"\(([^)]+)\)", name)
            if abbr and lang == "en":
                asks.append(f"What is {abbr[0]}?")
            if abbr and lang == "ar":
                asks.append(f"ما معنى {abbr[0]}؟")
            rows.append({"lang": lang, "name": name, "asks": asks, "defs": defs})
    return rows


def faithful(answer: str, defs: list[str]) -> bool:
    got = norm(answer)
    if len(got) < 12:
        return False
    for defin in defs:
        gold = norm(defin)
        if got[:48] in gold or gold[:48] in got:
            return True
        gt, at = set(tokens(defin)), set(tokens(answer))
        if gt and len(gt & at) / len(gt) >= 0.34:
            return True
    return False


def audit(cards: dict[str, list[dict]]) -> list[str]:
    lines = ["Card audit"]
    for lang in ("en", "ar"):
        rows = cards[lang]
        bad_k = sum(1 for c in rows if c.get("k") not in (0, 1, 2))
        empty = sum(1 for c in rows if len(c["q"].strip()) < 2 or len(c["text"].strip()) < 12)
        middot = sum(1 for c in rows if "·" in c["q"] or "·" in c["text"] or "·" in c.get("more", ""))
        latin_only = []
        for c in rows:
            if lang == "ar" and not AR_LETTERS.search(c["text"]):
                latin_only.append(c["q"][:80])
            if lang == "en" and AR_LETTERS.search(c["text"]) and not LATIN.search(c["text"]):
                latin_only.append(c["q"][:80])
        groups: dict[str, list[dict]] = {}
        for c in rows:
            groups.setdefault(norm(c["q"]), []).append(c)
        unrelated = []
        for q, group in groups.items():
            texts = list({c["text"] for c in group})
            if len(texts) < 2:
                continue
            if all(related(texts[0], other) for other in texts[1:]):
                continue
            unrelated.append((len(texts), q, texts))
        unrelated.sort(reverse=True)
        lines.append(
            f"  {lang}: {len(rows)} cards, {len(groups)} different questions, "
            f"{len(unrelated)} questions with unrelated answers, "
            f"bad kind {bad_k}, empty {empty}, middle-dot {middot}, "
            f"wrong script {len(latin_only)}"
        )
        if latin_only:
            lines.append("    wrong script: " + " | ".join(latin_only[:4]))
        lines.append("    unrelated answers for the same question:")
        for n, q, texts in unrelated[:8]:
            lines.append(f"    ({n}) {q[:90]}")
            for text in texts[:3]:
                lines.append(f"        {text[:110]}")
    return lines


def score_terms(cards, golds) -> tuple[list[str], list[dict]]:
    rows = term_questions(golds)
    json.dump(rows, open(TERM_OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    lines = ["Key terms, asked five ways (gold is the lesson definition)"]
    misses = []
    for lang in ("en", "ar"):
        asked = hit = right = 0
        samples = []
        for row in rows:
            if row["lang"] != lang:
                continue
            for q in row["asks"]:
                asked += 1
                got = lookup(q, lang, cards)
                if not got:
                    if len(samples) < 6:
                        samples.append(f"    MISS  {q}")
                    misses.append({"lang": lang, "q": q, "name": row["name"], "why": "miss"})
                    continue
                hit += 1
                if faithful(got["text"], row["defs"]):
                    right += 1
                else:
                    if len(samples) < 6:
                        samples.append(f"    WRONG {q}")
                        samples.append(f"          got: {got['text'][:110]}")
                    misses.append({"lang": lang, "q": q, "name": row["name"], "why": "wrong", "got": got["text"][:160]})
        lines.append(f"  {lang}: {right}/{asked} answers match the lesson ({hit} found a card)")
        lines.extend(samples)
    return lines, misses


def score_heldout(cards) -> list[str]:
    spec = json.load(open(HELD, encoding="utf-8"))
    lines = ["Held-out questions"]
    for lang in ("en", "ar"):
        ok = n = para_ok = para_n = 0
        lines.append(f"  {lang}:")
        for item in spec["items"]:
            for ask in item[lang]:
                n += 1
                para = bool(ask.get("paraphrase"))
                if para:
                    para_n += 1
                got = lookup(ask["q"], lang, cards)
                good = bool(got) and says(got["text"], ask["any"])
                if good:
                    ok += 1
                    if para:
                        para_ok += 1
                mark = "ok" if good else "MISS" if not got else "WRONG"
                if mark != "ok":
                    shown = got["text"][:90] if got else "(no card)"
                    lines.append(f"    {mark:5} {ask['q'][:70]}")
                    lines.append(f"          {shown}")
        rej_ok = rej_n = 0
        for item in spec["reject"]:
            for q in item[lang]:
                rej_n += 1
                got = lookup(q, lang, cards)
                if got is None:
                    rej_ok += 1
                else:
                    lines.append(f"    LEAK  {q[:70]}")
                    lines.append(f"          {got['text'][:90]}")
        lines.append(f"    named ideas {ok}/{n}, of which paraphrases without the usual name {para_ok}/{para_n}")
        lines.append(f"    should stay silent {rej_ok}/{rej_n}")
    return lines


def main() -> None:
    cards = load_cards()
    golds = gold_terms()
    parts = [audit(cards), *score_terms(cards, golds)[:1], score_heldout(cards)]
    # score_terms returns (lines, misses); keep the lines
    text = "\n".join(line for block in parts for line in block) + "\n"
    open(REPORT, "w", encoding="utf-8").write(text)
    print(text)
    print(f"wrote {TERM_OUT}")
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
