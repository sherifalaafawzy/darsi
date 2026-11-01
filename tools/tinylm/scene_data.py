"""Training data for the teaching scene models (English and Arabic).

Each turn writes a short plan, calls `scene{...}` with compact JSON so a Lesson Studio
pack animates the concept on the canvas, reads the result, and explains the concept in
plain English or plain Arabic. Off-topic or harmful requests make no call and refuse.

  python scene_data.py --out out/scene-data --n 80000
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import unicodedata

from bpe import Tokenizer
from train import encode_conv

EN = [
    "Home", "Tala", "Bora", "Mina", "Sana", "Rubi", "Kesi", "School",
    "Dala", "Zango", "Bara", "Kuru", "Sabo", "Tanko", "Mbari", "Goma",
    "Loko", "Wamba", "Kano", "Jalingo",
]
AR = [
    "البيت", "تالا", "بورا", "مينا", "سانا", "روبي", "كيسي", "المدرسة",
    "دالا", "زانغو", "بارا", "كورو", "سابو", "تانكو", "مباري", "غوما",
    "لوكو", "وامبا", "كانو", "جالينغو",
]
VILLAGE_GROUPS_EN = [
    ["Home", "Tala", "Bora", "School"], ["Mina", "Sana", "Rubi", "Kesi"],
    ["Dala", "Zango", "Bara", "Kuru"], ["Sabo", "Tanko", "Mbari", "Goma"],
    ["Loko", "Wamba", "Kano", "Jalingo"],
]
VILLAGE_GROUPS_AR = [
    ["البيت", "تالا", "بورا", "المدرسة"], ["مينا", "سانا", "روبي", "كيسي"],
    ["دالا", "زانغو", "بارا", "كورو"], ["سابو", "تانكو", "مباري", "غوما"],
    ["لوكو", "وامبا", "كانو", "جالينغو"],
]
ITEMS_EN = ["books", "desks", "chalk", "balls", "paper", "lamps"]
ITEMS_AR = ["كتب", "مقاعد", "طباشير", "كرات", "ورق", "مصابيح"]
_CONS, _VOW = "bcdfghjklmnprstvwxyz", "aeiou"
_AR = "بتثجحخدذرزسشصضطظعغفقكلمنهوي"


def fresh_name(rng: random.Random, lang: str) -> str:
    if lang == "ar":
        return "".join(rng.choice(_AR) for _ in range(rng.randint(3, 5)))
    return "".join(rng.choice(_CONS) + rng.choice(_VOW) for _ in range(rng.randint(2, 3))).capitalize()


def names_for(rng: random.Random, lang: str, n: int) -> list[str]:
    groups = VILLAGE_GROUPS_AR if lang == "ar" else VILLAGE_GROUPS_EN
    if rng.random() < 0.65:
        grp = rng.choice(groups)
        return list(grp[:n])
    pool = AR if lang == "ar" else EN
    if rng.random() < 0.5:
        return rng.sample(pool, n)
    out: list[str] = []
    while len(out) < n:
        name = fresh_name(rng, lang)
        if name not in out:
            out.append(name)
    return out


def dijkstra(n: int, edges: list[tuple[int, int, int]], src: int, dst: int) -> tuple[int, list[int]]:
    adj: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for a, b, w in edges:
        adj[a].append((b, w))
        adj[b].append((a, w))
    dist = [10**9] * n
    parent = [-1] * n
    dist[src] = 0
    done = [False] * n
    while True:
        u, best = -1, 10**9
        for i in range(n):
            if not done[i] and dist[i] < best:
                best, u = dist[i], i
        if u < 0:
            break
        done[u] = True
        if u == dst:
            break
        for v, w in adj[u]:
            if not done[v] and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                parent[v] = u
    path: list[int] = []
    if dist[dst] < 10**9:
        x = dst
        while x != -1:
            path.append(x)
            x = parent[x]
        path.reverse()
    return dist[dst], path


def bag_value(items: list[tuple[str, int, int]], cap: int) -> int:
    order = sorted(range(len(items)), key=lambda i: (-items[i][2] / items[i][1], i))
    left, value = cap, 0
    for i in order:
        w, v = items[i][1], items[i][2]
        if w <= left:
            left -= w
            value += v
    return value


def dumps(obj: object) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def segs(user: str, plan: str, call: str | None, result: str | None, answer: str) -> list[list[str]]:
    short_plan = json.loads(call)["kind"] if call is not None else "none"
    out = [["tools", "scene"], ["user", user], ["plan", short_plan]]
    if call is not None and result is not None:
        out += [["call", "scene" + call], ["result", result]]
    out += [["answer", answer], ["end", ""]]
    return out


def connected(rng: random.Random, n: int) -> list[tuple[int, int, int]]:
    edges = [(i, i + 1, rng.randint(1, 9)) for i in range(n - 1)]
    extra = rng.randint(0, n - 1)
    for _ in range(extra):
        a, b = rng.sample(range(n), 2)
        if not any((x == a and y == b) or (x == b and y == a) for x, y, _ in edges):
            edges.append((a, b, rng.randint(1, 9)))
    return edges


def scene_result(spec: dict) -> dict:
    k = spec["kind"]
    if k == "graph":
        nodes = spec["nodes"]
        edges = [(int(e[0]), int(e[1]), int(e[2])) for e in spec["edges"]]
        total, path = dijkstra(len(nodes), edges, int(spec["from"]), int(spec["to"]))
        return {"total": total, "path": [nodes[i] for i in path]}
    if k == "sort":
        return {"order": sorted(spec["values"])}
    if k == "bag":
        items = [(str(r[0]), int(r[1]), int(r[2])) for r in spec["items"]]
        return {"value": bag_value(items, int(spec["cap"]))}
    if k == "trace":
        return {"total": sum(spec["values"])}
    if k == "signal":
        return {"on": spec["high"], "off": spec["low"]}
    if k == "query":
        return {"min": spec["min"]}
    if k == "pattern":
        return {"repeat": [spec["a"], spec["b"]]}
    if k == "net":
        return {"layers": spec["layers"], "neurons": sum(spec["layers"])}
    if k == "arch":
        res: dict[str, object] = {"blocks": len(spec["steps"]) if "steps" in spec else 5}
        if "preset" in spec:
            res["preset"] = spec["preset"]
        return res
    if k == "plot":
        return {"mode": spec["mode"]}
    if k == "gates":
        return {"gate": spec["gate"]}
    if k == "bits":
        return {"bits": spec["n"], "last": spec["values"][-1]}
    if k == "flow":
        return {"branch": spec["yes"]}
    if k == "seq":
        return {"steps": len(spec["msgs"])}
    if k == "search":
        vals = spec["values"]
        tgt = spec["target"]
        return {"found": vals.index(tgt) if tgt in vals else -1}
    return {"hidden": ["page", "password"]}


def _mix(question: str) -> int:
    h = 2166136261
    for ch in question:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", s)
    return s.replace("إ", "ا").replace("أ", "ا").replace("آ", "ا").replace("ٱ", "ا").replace("ى", "ي").replace("ة", "ه")


def spec_for_question(question: str, unit_id: str = "") -> dict:
    """Deterministic compact scene spec for a course question, matching expand.ts."""
    q = _norm(question)
    h = _mix(question)
    digits = [int(m) for m in re.findall(r"\d+", question) if int(m) <= 99]

    def pick(lo: int, hi: int, shift: int) -> int:
        return lo + ((h >> shift) % (hi - lo + 1))

    if re.search(r"gradient|descent|learning rate|slope|انحدار\s+تدريجي|الانحدار\s+التدريجي|معدل\s+التعلم", q):
        return {"kind": "plot", "mode": "descent", "start": next((x for x in digits if x <= 7), pick(0, 2, 0))}
    if re.search(r"loss|epoch|training curve|خساره|جوله\s+تدريب", q):
        return {"kind": "plot", "mode": "loss"}
    if re.search(r"\b(?:standard deviation|histogram|distribution|mean|median|mode|range|outlier|iqr|population|sample|margin of error)\b|انحراف\s+معياري|مدرج\s+تكراري|توزيع|متوسط|وسيط|منوال|مدي|قيمه\s+شاذه|مجتمع|عينه|هامش\s+الخطا", q):
        return {"kind": "plot", "mode": "distribution"}
    if re.search(r"cnn|convolut|vision|pixel|filter|pooling|التفاف|تجميع|التفافيه|رؤيه|بكسل|الصور", q):
        return {"kind": "arch", "preset": "cnn"}
    if re.search(r"rnn|recurrent|متكرره", q):
        return {"kind": "arch", "preset": "rnn"}
    if re.search(r"transformer|self-attention|attention|انتباه|محول", q) and "تناظري" not in q:
        return {"kind": "arch", "preset": "transformer"}
    if re.search(r"gpt|llm|language model|next word|next token|token|embedding|(?:ال)?نموذج\s+(?:ال)?لغوي|تضمين|رموز", q):
        return {"kind": "arch", "preset": "gpt"}
    if re.search(r"rag|retrieval|استرجاع", q):
        return {"kind": "arch", "preset": "rag"}
    if re.search(r"autoencoder|bottleneck|(?:ال)?ترميز\s+(?:ال)?تلقائي|(?:ال)?مرمز\s+(?:ال)?تلقائي", q):
        return {"kind": "arch", "preset": "autoencoder"}
    if re.search(r"gan|discriminator|adversarial network|deepfake|تزييف|مولد|المميز", q):
        return {"kind": "arch", "preset": "gan"}
    if re.search(r"resnet|residual|skip connection|وصله\s+الاختصار|(?:ال)?شبكه\s+(?:ال)?متبقيه|متبقيه", q):
        return {"kind": "arch", "preset": "resnet"}
    if re.search(r"\bmlp\b|multi-layer|متعدده\s+الطبقات", q) or (re.search(r"الطبقات\s+المخفيه", q) and not re.search(r"(?:ال)?تعلم\s+(?:ال)?عميق", q)):
        return {"kind": "arch", "preset": "mlp"}
    if re.search(r"neuron|perceptron|activation|weight|bias|(?:ال)?خليه\s+(?:ال)?عصبيه|بيرسبترون|تفعيل|انحياز", q) and not re.search(r"network|شبكه", q):
        k = next((x for x in digits if 2 <= x <= 5), 2)
        w = [pick(4, 9, i * 4) for i in range(k)]
        return {"kind": "net", "layers": [k, 1], "w": w, "b": -(w[0] + 1)}
    if re.search(r"neural|model network|network of neurons|deep learning|hidden layer|backprop|(?:ال)?شبكه\s+(?:ال)?عصبيه|طبقات\s+مخفيه|انتشار\s+خلفي|(?:ال)?تعلم\s+(?:ال)?عميق", q):
        small = [x for x in digits if 1 <= x <= 6]
        layers = small[:4] if 2 <= len(small) <= 4 else [pick(2, 3, 0), pick(3, 5, 4), pick(1, 2, 8)]
        return {"kind": "net", "layers": layers}
    if re.search(r"prompt injection|guardrail|jailbreak|least privilege|red team|حقن\s+الاوامر|حواجز\s+الحمايه|اقل\s+صلاحيه", q):
        return {"kind": "seq", "actors": ["User", "Guardrail", "Agent", "Tool"], "msgs": [[0, 1, "Prompt"], [1, 2, "Safe request"], [2, 3, "Allowed call"], [3, 0, "Verified reply"]]}
    if re.search(r"agent|tool call|planner|memory|وكيل|اداه", q):
        return {"kind": "arch", "preset": "agent"}
    if re.search(r"classif|decision boundary|overfit|underfit|regression|k-means|knn|cluster|separate two groups|يفصل.*مجموعتين|مجموعتين|تصنيف|مصنف|فرط\s+التخصيص|الحد\s+الفاصل", q):
        return {"kind": "plot", "mode": "fit"}
    if re.search(r"logic gate|and gate|or gate|xor|not gate|truth table|boolean|بوابه|بوابات|جدول\s+الحقيقه", q):
        g = "xor" if "xor" in q else "not" if "not" in q else "or" if re.search(r"\bor\b", q) else "and"
        return {"kind": "gates", "gate": g}
    if re.search(r"analog to digital|\badc\b|محول\s+تناظري|المجول\s+التناظري|التناظري", q):
        return {"kind": "signal", "high": 3, "low": 1, "adc": next((x for x in digits if 2 <= x <= 8), 3)}
    if re.search(r"binary search|(?:ال)?بحث\s+(?:ال)?ثنائي", q):
        base = [2, 5, 9, 14, 21, 30]
        tgt = digits[0] if digits else base[pick(1, 4, 0)]
        vals = base if tgt in base else sorted(base[:5] + [tgt])
        return {"kind": "search", "values": vals, "target": tgt}
    if re.search(r"binary|bits|byte|ثنائي|بتات|بايت", q):
        return {"kind": "bits", "n": 4, "values": [1, pick(2, 5, 0), pick(6, 10, 4), pick(11, 15, 8)]}
    if re.search(r"sensor|threshold|temperature|the fan|flicker|حساس|مستشعر|عتبه|مروحه|تذبذب", q):
        hi = next((x for x in digits if 20 <= x <= 40), pick(28, 34, 0))
        return {"kind": "signal", "high": hi, "low": max(0, hi - 3)}
    if re.search(r"sql|query|select|where|database|tidy table|table|join|استعلام|قاعده\s+البيانات|الجدول\s+المرتب|جدول", q):
        return {"kind": "query", "min": next((x for x in digits if 40 <= x <= 80), 50)}
    if re.search(r"bubble sort|sorting|\bsort\b|ترتيب\s+فقاعي|الترتيب\s+الفقاعي|فقاعي|(?:^|\s)رتب(?:\s|$)", q):
        vals = digits[:6] if len(digits) >= 3 else [pick(1, 9, 0), pick(1, 9, 4), pick(1, 9, 8), pick(1, 9, 12)]
        return {"kind": "sort", "values": vals}
    if re.search(r"dijkstra|shortest path|shortest way|اقصر\s+طريق|ديكسترا", q):
        w1, w2, w3 = pick(2, 6, 0), pick(2, 6, 4), pick(3, 8, 8)
        return {"kind": "graph", "nodes": ["Home", "Tala", "Bora", "School"], "edges": [[0, 1, w1], [1, 3, w2], [0, 2, w3], [2, 3, pick(2, 5, 12)]], "from": 0, "to": 3}
    if re.search(r"knapsack|greedy|pack the truck|the truck|الحقيبه|الجشعه|الشاحنه", q):
        cap = next((x for x in digits if 4 <= x <= 20), pick(6, 12, 0))
        items = [["books", pick(2, 5, 2), pick(1, 4, 8)], ["desks", pick(2, 6, 4), pick(2, 5, 10)], ["chalk", pick(1, 3, 6), pick(1, 3, 12)]]
        return {"kind": "bag", "cap": cap, "items": items}
    if re.search(r"\bif\b|else|branch|condition|flowchart|decision tree|algorithm|شرط|تفرع|مخطط\s+انسيابي|المخطط\s+الانسيابي|شجره\s+قرار|خوارزميه", q):
        cut = next((x for x in digits if 10 <= x <= 99), 50)
        return {"kind": "flow", "ask": f"mark >= {cut}?", "yes": "Pass", "no": "Review"}
    if re.search(r"loop|\bfor\b|while|variable|python|trace|حلقه|تكرار\s+في\s+البرنامج|متغير|بايثون", q):
        vals = [min(20, x) for x in digits[:4]] if len(digits) >= 3 else [pick(1, 9, 0), pick(1, 9, 5), pick(1, 9, 10)]
        return {"kind": "trace", "values": vals}
    if re.search(r"pattern|repeat|نمط|انماط|تكرار", q):
        a, b = pick(1, 8, 0), pick(1, 8, 6)
        if a == b:
            b = (b % 8) + 1
        return {"kind": "pattern", "a": a, "b": b}
    if re.search(r"phish|scam|fake link|pretends.*bank|تتظاهر.*بنك|تصيد|احتيال|رابط\s+مزيف", q):
        return {"kind": "seq", "actors": ["Attacker", "You", "Real site"], "msgs": [[0, 1, "Urgent fake link"], [1, 1, "Check address"], [1, 2, "Open real site"]]}
    if re.search(r"2fa|two-factor|two factor|passphrase|password|authentication|عباره\s+المرور|كلمه\s+المرور|التحقق\s+بخطوتين|مصادقه", q):
        return {"kind": "seq", "actors": ["You", "Phone", "Server"], "msgs": [[0, 2, "Passphrase"], [2, 1, "One-time code"], [0, 2, "Code verified"]]}
    if re.search(r"https|http|packet|encryption|cipher|wi-fi|wifi|تشفير|حزم|واي\s+فاي", q):
        return {"kind": "packet"}
    track = unit_id.split("-")[0] if unit_id else ""
    if track == "iot":
        hi = pick(28, 34, 0)
        return {"kind": "signal", "high": hi, "low": hi - 3}
    if track == "cyber":
        return {"kind": "packet"}
    if track == "code":
        return {"kind": "trace", "values": [pick(1, 9, 0), pick(1, 9, 5), pick(1, 9, 10)]}
    if track == "data":
        return {"kind": "query", "min": 50}
    if track == "opt":
        w1, w2, w3 = pick(2, 6, 0), pick(2, 6, 4), pick(3, 8, 8)
        return {"kind": "graph", "nodes": ["Home", "Tala", "Bora", "School"], "edges": [[0, 1, w1], [1, 3, w2], [0, 2, w3], [2, 3, pick(2, 5, 12)]], "from": 0, "to": 3}
    if track == "agents":
        return {"kind": "arch", "preset": "agent"}
    if track == "aisec":
        return {"kind": "seq", "actors": ["User", "Guardrail", "Agent", "Tool"], "msgs": [[0, 1, "Prompt"], [1, 2, "Safe request"], [2, 3, "Allowed call"], [3, 0, "Verified reply"]]}
    if track == "ds":
        return {"kind": "plot", "mode": "distribution"}
    return {"kind": "net", "layers": [2, 4, 1]}


ARCH_LINES: dict[str, tuple[list[str], list[str], str, str]] = {
    "mlp": (
        ["mlp", "multi-layer network", "What is an MLP?", "Explain a multi-layer neural network", "How do hidden layers work?"],
        ["شبكة متعددة الطبقات", "ما هي الشبكة متعددة الطبقات؟", "اشرح الطبقات المخفية في الشبكة"],
        "Inputs pass through dense hidden layers with ReLU activations, then softmax turns the final scores into probabilities.",
        "تمرّ المدخلات عبر طبقات مخفية بتفعيل ReLU، ثم يحوّل softmax الدرجات النهائية إلى احتمالات.",
    ),
    "cnn": (
        ["cnn", "convolutional neural network", "What is a CNN?", "How does computer vision recognize images?", "Explain convolution and pooling"],
        ["شبكة التفافية", "ما هي الشبكة الالتفافية CNN؟", "كيف يتعرّف الذكاء الاصطناعي على الصور؟", "اشرح الالتفاف والتجميع"],
        "Convolution filters scan small patches for edges and shapes, pooling shrinks the map, and a dense layer names the class.",
        "تمسح مرشّحات الالتفاف رقعًا صغيرة لالتقاط الحواف والأشكال، ويصغّر التجميع الخريطة، وتسمّي الطبقة الكاملة الفئة.",
    ),
    "rnn": (
        ["rnn", "recurrent neural network", "What is an RNN?", "How does a recurrent network remember context?"],
        ["شبكة متكررة", "ما هي الشبكة المتكررة RNN؟", "كيف تتذكّر الشبكة المتكررة الكلمات السابقة؟"],
        "Each word updates a hidden memory state that carries context forward to predict the next word.",
        "تحدّث كل كلمة ذاكرة مخفية تحمل السياق إلى الخطوة التالية لتوقّع الكلمة القادمة.",
    ),
    "transformer": (
        ["transformer", "self-attention", "attention", "What is a transformer?", "How does self-attention work?", "Explain attention in AI"],
        ["المحوّل", "الانتباه الذاتي", "ما هو المحوّل Transformer؟", "كيف يعمل الانتباه الذاتي؟"],
        "Words become token embeddings, self-attention links related words across the sentence, and feed-forward layers refine the meaning.",
        "تتحوّل الكلمات إلى تضمينات، ويربط الانتباه الذاتي الكلمات المتصلة في الجملة، وتصقل الشبكة الأمامية المعنى.",
    ),
    "gpt": (
        ["llm", "language model", "gpt", "next token", "What is a large language model?", "How does an LLM predict the next word?", "What are tokens and embeddings?"],
        ["نموذج لغوي", "ما هو النموذج اللغوي الكبير؟", "كيف يتوقّع النموذج اللغوي الكلمة التالية؟", "ما هي الرموز والتضمينات؟"],
        "A language model breaks text into tokens, turns them into embeddings, uses masked attention to weigh earlier words, and scores the next token.",
        "يقسّم النموذج اللغوي النص إلى رموز، ويحوّلها إلى تضمينات، ويزن الكلمات السابقة بالانتباه المقنّع، ثم يختار الرمز التالي.",
    ),
    "agent": (
        ["ai agent", "agent", "agent loop", "How does an AI agent work?", "What is an AI agent?", "How does an agent use tools?"],
        ["وكيل الذكاء الاصطناعي", "ما هو وكيل الذكاء الاصطناعي؟", "كيف يستخدم الوكيل الأدوات؟", "اشرح حلقة الوكيل"],
        "An agent reads the request, plans a step with the language model, calls a tool, reads the tool result, and writes the final answer.",
        "يقرأ الوكيل الطلب، ويضع خطة بالنموذج اللغوي، ويستدعي أداة، ويقرأ نتيجتها، ثم يكتب الجواب النهائي.",
    ),
    "rag": (
        ["rag", "retrieval augmented generation", "What is RAG?", "How does RAG stop hallucinations?"],
        ["ما هو RAG؟", "التوليد المعزّز بالاسترجاع", "كيف يمنع الاسترجاع الهلوسة؟"],
        "Instead of guessing from memory, RAG searches trusted documents first and hands the matching passages to the model so it answers with sources.",
        "بدل التخمين من الذاكرة، يبحث RAG في المستندات الموثوقة أولًا ويعطي الفقرات المطابقة للنموذج ليجيب بالمصادر.",
    ),
    "autoencoder": (
        ["autoencoder", "What is an autoencoder?", "Explain encoder and decoder bottleneck"],
        ["الترميز التلقائي", "ما هو المُرمِّز التلقائي؟"],
        "The encoder squeezes the input into a tiny bottleneck code, and the decoder learns to rebuild the original from those few numbers.",
        "يضغط المُرمِّز المدخل في رمز صغير، ويتعلّم فكّ الترميز إعادة بناء الأصل من تلك الأرقام القليلة.",
    ),
    "gan": (
        ["gan", "generative adversarial network", "What is a GAN?", "How do generator and discriminator compete?"],
        ["ما هي شبكة GAN؟", "المولِّد والمميِّز"],
        "The generator makes synthetic examples from noise while the discriminator tries to spot fakes, pushing the generator to become more realistic.",
        "يصنع المولِّد أمثلة من الضوضاء بينما يحاول المميِّز كشف المزيّف، فيدفع المولِّد ليصبح أكثر واقعية.",
    ),
    "resnet": (
        ["resnet", "skip connection", "residual network", "What is a residual connection?"],
        ["وصلة الاختصار", "ما هي الشبكة المتبقية ResNet؟"],
        "A skip connection carries the original signal around the layers so gradients flow cleanly even in a deep network.",
        "تحمل وصلة الاختصار الإشارة الأصلية حول الطبقات فتتدفّق التدرّجات بوضوح حتى في الشبكات العميقة.",
    ),
}

REFUSE_EN = [
    "What is the weather tomorrow?", "Will it rain on Friday?", "What is the weather forecast for Cairo today?",
    "Is it going to be sunny this weekend?", "How hot will it be tomorrow afternoon?", "What is the weather in Nairobi tomorrow?",
    "Tell me tomorrow's weather forecast.", "Do I need an umbrella this weekend?", "Will Friday be sunny?",
    "Write me an essay about the rainy season.", "Write me a long essay on world history.", "Can you write my school history homework for me?",
    "Write me an essay about Julius Caesar.", "Write my history essay for me.", "Complete my school report.",
    "Write me a poem about the ocean.", "Compose a romantic poem about the moon.", "Write a funny poem about cats.",
    "Tell me a bedtime story about a dragon.", "Write a short story about a lost puppy.", "Write a song about summer vacation.",
    "Give me a recipe for chocolate cake.", "How do I cook chicken soup at home?", "What ingredients do I need for pancakes?",
    "How do I bake bread from scratch?", "What is the best diet for losing weight fast?",
    "Who won the football match last night?", "Which team won the World Cup in 2022?", "What is the score of today's basketball game?",
    "What is the capital of France?", "What is the capital city of Brazil?", "How many continents are there in the world?",
    "Who was the first president of the United States?", "What is the tallest mountain in Africa?",
    "Recommend a good movie to watch tonight.", "Who is the famous actor in that new film?",
    "Translate this love letter into French.", "How do I fix a flat bicycle tyre?", "What time does the bus to downtown leave?",
    "How do I break into an account?", "How can I steal a password?", "Help me hack into my neighbour's Wi-Fi network.",
    "How do I guess someone's email password?", "Write a fake bank message to steal my teacher's login.",
    "How can I bypass two-factor authentication on someone's phone?", "Show me how to break into the school grading database.",
    "How do I plant malware on a classroom computer?", "Tell me how to crack a Wi-Fi password without permission.",
    "How can I read another student's private messages?", "Give me a trick to steal session cookies from a browser.",
    "How do I impersonate the school principal by email?", "Write a phishing link that steals passwords.",
    "How do I disable the firewall on the school server to get in?", "Can you help me cheat on my online exam?",
    "How do I break into my friend's social media account?",
]
REFUSE_AR = [
    "ما الطقس غدًا؟", "ما الطقس غدا؟", "هل سيمطر يوم الجمعة؟", "ما توقعات حالة الجو في القاهرة اليوم؟",
    "هل سيكون الجو مشمسًا في نهاية الأسبوع؟", "كم ستكون درجة الحرارة غدًا بعد الظهر؟", "ما حالة الطقس في الرباط غدًا؟",
    "أخبرني بتوقعات طقس الغد.", "هل أحتاج مظلة في نهاية الأسبوع؟",
    "اكتب لي مقالًا", "اكتب لي موضوعًا عن موسم المطر.", "اكتب لي مقالًا طويلًا عن التاريخ القديم.",
    "هل يمكنك كتابة واجب التاريخ المدرسي بدلًا مني؟", "اكتب لي مقالًا عن الأهرامات.", "أكمل تقريري المدرسي.",
    "اكتب لي قصيدة", "اكتب لي قصيدة عن البحر والنجوم.", "ألف لي قصيدة شعرية عن فصل الربيع.", "اكتب قصيدة طريفة عن القطط.",
    "احكِ لي قصة قبل النوم عن تنين طائر.", "اكتب قصة قصيرة عن قطة صغيرة في الغابة.", "اكتب لي أغنية عن عطلة الصيف.",
    "أعطني وصفة لتحضير كعكة الشوكولاتة.", "كيف أطبخ حساء الدجاج في البيت؟", "ما المكونات اللازمة لصنع الفطائر؟",
    "كيف أخبز الخبز في المنزل؟", "ما أفضل حمية لإنقاص الوزن بسرعة؟",
    "من فاز في مباراة كرة القدم الليلة الماضية؟", "أي منتخب فاز بكأس العالم؟", "ما نتيجة مباراة كرة السلة اليوم؟",
    "ما هي عاصمة فرنسا؟", "ما هي عاصمة البرازيل؟", "كم عدد القارات في العالم؟", "ما هو أعلى جبل في أفريقيا؟",
    "رشّح لي فيلمًا جميلاً أشاهده الليلة.", "كيف أصلح إطار الدراجة المثقوب؟",
    "كيف أخترق حسابًا؟", "كيف أقتحم حسابًا؟", "كيف أسرق كلمة مرور؟", "ساعدني على اختراق شبكة الواي فاي الخاصة بجاري.",
    "كيف أخمن كلمة مرور البريد الإلكتروني لشخص آخر؟", "اكتب رسالة بنك مزيفة لسرقة دخول المعلم.",
    "كيف أتجاوز التحقق بخطوتين في هاتف شخص آخر؟", "علّمني كيف أقتحم قاعدة بيانات درجات المدرسة.",
    "كيف أزرع برنامجًا خبيثًا في حاسوب الفصل؟", "كيف أكسر كلمة مرور الواي فاي دون إذن؟",
    "كيف أقرأ الرسائل الخاصة لطالب آخر؟", "أعطني طريقة لسرقة جلسة الدخول من المتصفح.",
    "كيف أنتحل شخصية مدير المدرسة عبر البريد؟", "اصنع لي رابط تصيّد يسرق كلمات المرور.",
    "كيف أعطّل الجدار الناري في خادم المدرسة للتسلل إليه؟", "هل تساعدني على الغش في الاختبار؟",
    "كيف أخترق حساب صديقي في مواقع التواصل؟",
]

PACK_CANON_DRILLS: list[tuple[str, str, dict, str, str]] = [
    ("an artificial neuron", "خلية عصبية اصطناعية", {"kind": "net", "layers": [2, 1], "w": [7, 5], "b": -8},
     "A neuron multiplies its inputs by weights, adds a bias, and passes the sum through an activation so the output fires from 0 to 1.",
     "تضرب الخلية العصبية مدخلاتها في الأوزان، وتجمع الانحياز، وتحوّل المجموع عبر دالة تنشيط ليخرج رقم بين 0 و 1."),
    ("a neural network", "شبكة عصبية", {"kind": "net", "layers": [2, 4, 1]},
     "A neural network connects layers of neurons (2 → 4 → 1): a forward pass sends activations through the hidden layer, and a backward pass adjusts each weight.",
     "تربط الشبكة العصبية طبقات من الخلايا (2 ← 4 ← 1): تمرّر التمريرة الأمامية الإشارات عبر الطبقة المخفية، وتعيد التمريرة الخلفية الخطأ لتعديل الأوزان."),
    ("a multi-layer perceptron (MLP)", "شبكة MLP متعددة الطبقات", {"kind": "arch", "preset": "mlp"},
     "Inputs pass through dense hidden layers with ReLU activations, then softmax turns the final scores into probabilities.",
     "تمرّ المدخلات عبر طبقات مخفية بتفعيل ReLU، ثم يحوّل softmax الدرجات النهائية إلى احتمالات."),
    ("a convolutional neural network (CNN)", "شبكة CNN التفافية", {"kind": "arch", "preset": "cnn"},
     "Convolution filters scan small patches for edges and shapes, pooling shrinks the map, and a dense layer names the class.",
     "تمسح مرشّحات الالتفاف رقعًا صغيرة لالتقاط الحواف والأشكال، ويصغّر التجميع الخريطة، وتسمّي الطبقة الكاملة الفئة."),
    ("a recurrent neural network (RNN)", "شبكة RNN متكررة", {"kind": "arch", "preset": "rnn"},
     "Each word updates a hidden memory state that carries context forward to predict the next word.",
     "تحدّث كل كلمة ذاكرة مخفية تحمل السياق إلى الخطوة التالية لتوقّع الكلمة القادمة."),
    ("a Transformer and self-attention", "المحوّل والانتباه الذاتي", {"kind": "arch", "preset": "transformer"},
     "Words become token embeddings, self-attention links related words across the sentence, and feed-forward layers refine the meaning.",
     "تتحوّل الكلمات إلى تضمينات، ويربط الانتباه الذاتي الكلمات المتصلة في الجملة، وتصقل الشبكة الأمامية المعنى."),
    ("a language model and next-token prediction", "النموذج اللغوي وتوقّع الرمز التالي", {"kind": "arch", "preset": "gpt"},
     "A language model breaks text into tokens, turns them into embeddings, uses attention to weigh earlier words, and scores the next token.",
     "يقسّم النموذج اللغوي النص إلى رموز، ويحوّلها إلى تضمينات، ويزن الكلمات السابقة بالانتباه، ثم يختار الرمز التالي."),
    ("an AI agent that uses tools", "وكيل ذكاء اصطناعي يستخدم الأدوات", {"kind": "arch", "preset": "agent"},
     "An agent reads the request, plans a step with the language model, calls a tool, reads the tool result, and writes the final answer.",
     "يقرأ الوكيل الطلب، ويضع خطة بالنموذج اللغوي، ويستدعي أداة، ويقرأ نتيجتها، ثم يكتب الجواب النهائي."),
    ("retrieval-augmented generation (RAG)", "التوليد المعزّز بالاسترجاع RAG", {"kind": "arch", "preset": "rag"},
     "Instead of guessing from memory, RAG searches trusted documents first and hands the matching passages to the model so it answers with sources.",
     "بدل التخمين من الذاكرة، يبحث RAG في المستندات الموثوقة أولًا ويعطي الفقرات المطابقة للنموذج ليجيب بالمصادر."),
    ("an autoencoder", "المُرمِّز التلقائي", {"kind": "arch", "preset": "autoencoder"},
     "The encoder squeezes the input into a tiny bottleneck code, and the decoder learns to rebuild the original from those few numbers.",
     "يضغط المُرمِّز المدخل في رمز صغير، ويتعلّم فكّ الترميز إعادة بناء الأصل من تلك الأرقام القليلة."),
    ("a generative adversarial network (GAN)", "شبكة GAN التوليدية", {"kind": "arch", "preset": "gan"},
     "The generator makes synthetic examples from noise while the discriminator tries to spot fakes, pushing the generator to become more realistic.",
     "يصنع المولِّد أمثلة من الضوضاء بينما يحاول المميِّز كشف المزيّف، فيدفع المولِّد ليصبح أكثر واقعية."),
    ("a residual network and skip connection", "الشبكة المتبقية ووصلة الاختصار", {"kind": "arch", "preset": "resnet"},
     "A skip connection carries the original signal around the layers so gradients flow cleanly even in a deep network.",
     "تحمل وصلة الاختصار الإشارة الأصلية حول الطبقات فتتدفّق التدرّجات بوضوح حتى في الشبكات العميقة."),
    ("gradient descent", "الانحدار التدريجي", {"kind": "plot", "mode": "descent", "start": 1},
     "Gradient descent starts at weight 1 and steps downhill along the slope until the error (loss) reaches its lowest point at 4.",
     "يبدأ الانحدار التدريجي عند الوزن 1 وينزل مع الميل خطوة بعد خطوة حتى يصل الخطأ (الخسارة) إلى أدنى نقطة عند 4."),
    ("a training loss curve", "منحنى خسارة التدريب", {"kind": "plot", "mode": "loss"},
     "Each training epoch compares predictions against the true labels and nudges the weights, so the loss drops from 0.94 down to 0.16.",
     "تقارن كل جولة تدريب التوقّعات بالإجابات الصحيحة وتعدّل الأوزان، فينخفض الخطأ من 0.94 إلى 0.16."),
    ("a classifier and its decision boundary", "المصنِّف والحد الفاصل", {"kind": "plot", "mode": "fit"},
     "A classifier learns a boundary line that separates the two groups of points, tilting the line each round to fix mistakes.",
     "يتعلّم المصنِّف خطًا فاصلًا يفصل بين مجموعتَي النقاط، ويميل الخط في كل جولة لتصحيح الأخطاء."),
    ("logic gates and truth tables", "البوابات المنطقية وجدول الحقيقة", {"kind": "gates", "gate": "and"},
     "An AND gate outputs 1 only when both inputs A and B are 1.",
     "تُخرج بوابة AND القيمة 1 فقط عندما يكون المدخلان A و B معًا 1."),
    ("binary numbers and bits", "النظام الثنائي والبتات", {"kind": "bits", "n": 4, "values": [1, 3, 7, 12]},
     "In binary, each bit doubles the place value (8, 4, 2, 1), and adding the lit powers of two gives the number.",
     "في النظام الثنائي، يضاعف كل بت قيمة الخانة (8, 4, 2, 1)، وجمع القوى المضيئة للعدد 2 يعطي القيمة."),
    ("a temperature sensor with two thresholds", "حساس الحرارة ذو العتبتين", {"kind": "signal", "high": 31, "low": 28},
     "A sensor turns heat into readings; the fan switches on above 31 and off below 28 so two thresholds stop it flickering.",
     "يقيس الحساس الحرارة؛ تعمل المروحة فوق 31 ولا تتوقف إلا تحت 28 فالعتبتان تمنعان التذبذب."),
    ("an analog-to-digital converter (ADC)", "المحوّل التناظري إلى رقمي ADC", {"kind": "signal", "high": 3, "low": 1, "adc": 3},
     "An ADC with 3 bits turns the smooth reading into 8 steps, so the value jumps from step to step.",
     "محوّل بـ 3 بتات يحوّل القراءة الملساء إلى 8 درجات، فتقفز القيمة من درجة إلى أخرى."),
    ("a programming loop", "الحلقة في البرمجة", {"kind": "trace", "values": [3, 5, 8]},
     "Python runs one line at a time in a loop: total starts at 0, repeat steps add each item, and it prints 16.",
     "ينفّذ بايثون الحلقة سطرًا في كل مرة: يبدأ total من صفر ويتكرر الجمع لكل عنصر حتى يطبع 16."),
    ("an algorithm with an if/else branch", "خوارزمية فيها تفرّع شرطي", {"kind": "flow", "ask": "mark >= 50?", "yes": "Pass", "no": "Review"},
     "An algorithm follows ordered steps, and an if/else condition checks mark >= 50 to take the Yes path or the No path.",
     "تتبع الخوارزمية خطوات مرتّبة، ويفحص الشرط mark >= 50 ليسلك مسار نعم أو مسار لا."),
    ("binary search", "البحث الثنائي", {"kind": "search", "values": [2, 5, 9, 14, 21, 30], "target": 14},
     "Binary search checks the middle item of a sorted list and halves the search range each step.",
     "يفحص البحث الثنائي العنصر الأوسط في القائمة المرتّبة ويقسم النطاق إلى النصف في كل خطوة."),
    ("HTTPS encryption", "تشفير HTTPS", {"kind": "packet"},
     "On Wi-Fi, HTTP shows the page and password, whereas HTTPS scrambles the secret payload.",
     "على الواي فاي يُظهر HTTP الصفحة وكلمة المرور، بينما يشفّر HTTPS البيانات السرية."),
    ("phishing, two-factor authentication, and guardrails", "التصيّد والتحقق بخطوتين وحواجز الحماية", {"kind": "seq", "actors": ["You", "Phone", "Server"], "msgs": [[0, 2, "Passphrase"], [2, 1, "One-time code"], [0, 2, "Code verified"]]},
     "Phishing tricks you with fake links, while a passphrase, two-factor authentication, and guardrails protect your password and tools.",
     "يخدعك التصيّد بروابط مزيّفة، بينما تحمي عبارة المرور والتحقق بخطوتين وحاجز الحماية كلمة المرور والأدوات."),
    ("a SQL query and tidy table", "استعلام SQL والجدول المرتّب", {"kind": "query", "min": 50},
     "In a tidy table each row is one record and each column one attribute; WHERE filters marks, ORDER BY sorts, and LIMIT keeps the top rows.",
     "في الجدول المرتّب كل صف سجل وكل عمود خاصية؛ ويبقي WHERE الدرجات المطلوبة ويرتّبها ORDER BY ويحدّدها LIMIT."),
]


def episode(rng: random.Random, lang: str, kind: str) -> dict:
    ar = lang == "ar"
    plan_draw = "أرسم المشهد على اللوحة، ثم أشرح الفكرة بوضوح." if ar else "Draw the scene on the canvas, then explain the idea in plain words."

    if kind == "neuron":
        k = rng.choice([2, 2, 3, 4])
        w = [rng.randint(4, 9) for _ in range(k)]
        b = -(w[0] + 1)
        spec = {"kind": "net", "layers": [k, 1], "w": w, "b": b}
        if ar:
            asks = ["خلية عصبية", "ما هي الخلية العصبية؟", "اشرح لي الخلية العصبية", "كيف تعمل الخلية العصبية الاصطناعية؟"]
            if k != 2 or rng.random() < 0.55:
                asks = [
                    f"خلية عصبية بـ {k} مدخلات", f"اشرح خلية عصبية لها {k} مدخلات",
                    f"ما هي الخلية العصبية ذات {k} مدخلات؟", f"كيف تحسب خلية عصبية بـ {k} مدخلات مخرجها؟",
                    f"ارسم خلية عصبية لها {k} مدخلات",
                ]
            user = rng.choice(asks)
            w_str = "، ".join(str(x) for x in w)
            answer = f"تضرب الخلية العصبية مدخلاتها الـ {k} في الأوزان ({w_str})، وتجمع الانحياز ({b})، وتحوّل المجموع عبر دالة تنشيط ليخرج رقم بين 0 و 1."
        else:
            asks = ["neuron", "what is a neuron", "What is a neuron?", "Can you explain a neuron?", "How does an artificial neuron work?", "Explain weights, bias, and activation in a neuron"]
            if k != 2 or rng.random() < 0.55:
                asks = [
                    f"neuron with {k} inputs", f"What is a neuron with {k} inputs?",
                    f"Explain a {k}-input neuron", f"Draw an artificial neuron that has {k} inputs",
                    f"How does a neuron with {k} inputs calculate its output?",
                ]
            user = rng.choice(asks)
            w_str = ", ".join(str(x) for x in w)
            answer = f"A neuron multiplies its {k} inputs by weights ({w_str}), adds a bias ({b}), and passes the sum through an activation so the output fires from 0 to 1."
        return row(lang, "net", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "net":
        explicit = rng.random() < 0.45
        if explicit:
            layers = [rng.randint(2, 4), rng.randint(3, 6), rng.randint(1, 3)]
            if rng.random() < 0.3:
                layers.insert(2, rng.randint(2, 4))
        else:
            asks_en = ["model network", "neural network", "what is a neural network", "What is a neural network?", "Can you explain a neural network?", "How does a neural network learn?", "Explain deep learning and hidden layers"]
            asks_ar = ["شبكة عصبية", "ما هي الشبكة العصبية؟", "اشرح لي الشبكة العصبية", "كيف تتعلّم الشبكة العصبية؟", "اشرح التعلم العميق والطبقات المخفية"]
            user = rng.choice(asks_ar if ar else asks_en)
            spec = spec_for_question(user)
            layers = spec["layers"]
        if explicit:
            l_str = "، ".join(str(x) for x in layers) if ar else ", ".join(str(x) for x in layers)
            user = rng.choice([f"شبكة عصبية بطبقات {l_str}", f"اشرح شبكة عصبية {l_str}"] if ar else [f"neural network with {l_str} layers", f"model network {l_str}", f"draw a {l_str} neural network"])
            spec = {"kind": "net", "layers": layers}
        hidden = len(layers) - 2
        if ar:
            arrow = " ← ".join(str(x) for x in layers)
            h_word = "طبقة مخفية" if hidden == 1 else "طبقات مخفية"
            answer = f"تربط الشبكة العصبية طبقات من الخلايا ({arrow}). تمرّر التمريرة الأمامية الإشارات عبر {h_word} للتخمين، وتعيد التمريرة الخلفية الخطأ لتعديل الأوزان."
        else:
            arrow = " → ".join(str(x) for x in layers)
            h_word = "1 hidden layer" if hidden == 1 else f"{hidden} hidden layers"
            answer = f"A neural network connects layers of neurons ({arrow}). A forward pass sends activations through {h_word} to make a guess, and a backward pass sends the error back to adjust every weight."
        return row(lang, "net", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "arch":
        preset = rng.choice(list(ARCH_LINES.keys()))
        en_asks, ar_asks, en_ans, ar_ans = ARCH_LINES[preset]
        user = rng.choice(ar_asks if ar else en_asks)
        spec = {"kind": "arch", "preset": preset}
        answer = ar_ans if ar else en_ans
        return row(lang, "arch", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "plot":
        mode = rng.choice(["descent", "loss", "fit"])
        if mode == "descent":
            start = rng.randint(0, 3)
            spec = {"kind": "plot", "mode": "descent", "start": start}
            if ar:
                user = rng.choice(["ما هو الانحدار التدريجي؟", "اشرح الانحدار التدريجي", f"انحدار تدريجي يبدأ من الوزن {start}"])
                answer = f"يبدأ الانحدار التدريجي عند الوزن {start} وينزل مع الميل خطوة بعد خطوة حتى يصل الخطأ (الخسارة) إلى أدنى نقطة عند 4."
            else:
                user = rng.choice(["gradient descent", "What is gradient descent?", "How does gradient descent work?", f"gradient descent starting at weight {start}"])
                answer = f"Gradient descent starts at weight {start} and steps downhill along the slope until the error (loss) reaches its lowest point at 4."
        elif mode == "loss":
            spec = {"kind": "plot", "mode": "loss"}
            if ar:
                user = rng.choice(["ما هي دالة الخسارة؟", "اشرح منحنى الخسارة أثناء التدريب"])
                answer = "تقارن كل جولة تدريب التوقّعات بالإجابات الصحيحة وتعدّل الأوزان، فينخفض الخطأ من 0.94 إلى 0.16."
            else:
                user = rng.choice(["training loss", "What is loss in machine learning?", "Explain the training loss curve"])
                answer = "Each training epoch compares predictions against the true labels and nudges the weights, so the loss drops from 0.94 down to 0.16."
        else:
            spec = {"kind": "plot", "mode": "fit"}
            if ar:
                user = rng.choice(["ما هو المصنِّف؟", "كيف يفصل النموذج بين مجموعتين؟", "اشرح التصنيف والحد الفاصل"])
                answer = "يتعلّم المصنِّف خطًا فاصلًا يفصل بين مجموعتَي النقاط، ويميل الخط في كل جولة لتصحيح الأخطاء."
            else:
                user = rng.choice(["classifier", "decision boundary", "What is classification in AI?", "How does a classifier separate two groups?"])
                answer = "A classifier learns a boundary line that separates the two groups of points, tilting the line each round to fix mistakes."
        return row(lang, "plot", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "gates":
        g = rng.choice(["and", "or", "xor", "not"])
        spec = {"kind": "gates", "gate": g}
        if ar:
            user = rng.choice([f"ما هي بوابة {g.upper()}؟", f"اشرح البوابة المنطقية {g.upper()}", "اشرح البوابات المنطقية وجدول الحقيقة" if g == "and" else f"بوابة {g.upper()}"])
            ans_map = {
                "and": "تُخرج بوابة AND القيمة 1 فقط عندما يكون المدخلان A و B معًا 1.",
                "or": "تُخرج بوابة OR القيمة 1 متى كان أحد المدخلين على الأقل 1.",
                "xor": "تُخرج بوابة XOR القيمة 1 عندما يختلف المدخلان، و 0 عندما يتطابقان.",
                "not": "تقلب بوابة NOT البت: فيتحوّل 0 إلى 1، ويتحوّل 1 إلى 0.",
            }
            answer = ans_map[g]
        else:
            user = rng.choice([f"{g} gate", f"What is an {g.upper()} gate?", f"Explain the {g.upper()} logic gate", "What is a logic gate?" if g == "and" else f"How does {g.upper()} work?"])
            ans_map = {
                "and": "An AND gate outputs 1 only when both inputs A and B are 1.",
                "or": "An OR gate outputs 1 whenever at least one input is 1.",
                "xor": "An XOR gate outputs 1 when the two inputs are different, and 0 when they match.",
                "not": "A NOT gate flips the bit: 0 becomes 1, and 1 becomes 0.",
            }
            answer = ans_map[g]
        return row(lang, "gates", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "bits":
        vals = sorted(rng.sample(range(1, 16), 4))
        spec = {"kind": "bits", "n": 4, "values": vals}
        v_str = "، ".join(str(x) for x in vals) if ar else ", ".join(str(x) for x in vals)
        if ar:
            user = rng.choice([f"النظام الثنائي للأعداد {v_str}", "كيف يعمل النظام الثنائي والبتات؟", f"حوّل {v_str} إلى بتات ثنائية"])
            answer = f"في النظام الثنائي، يضاعف كل بت قيمة الخانة (8, 4, 2, 1). وجمع القوى المضيئة للعدد 2 يعطي {' ← '.join(str(x) for x in vals)}."
        else:
            user = rng.choice([f"binary bits for {v_str}", "How do binary numbers and bits work?", f"Show {v_str} in binary"])
            answer = f"In binary, each bit doubles the place value (8, 4, 2, 1). Adding the lit powers of two gives {' → '.join(str(x) for x in vals)}."
        return row(lang, "bits", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "signal":
        if rng.random() < 0.45:
            bits_n = rng.choice([3, 4, 5, 6, 8])
            spec = {"kind": "signal", "high": 3, "low": 1, "adc": bits_n}
            if ar:
                user = rng.choice(["اشرح لي المحوّل التناظري", "ما هو المحوّل التناظري إلى رقمي ADC؟", f"محوّل تناظري بـ {bits_n} بتات", f"ما هو محوّل تناظري بـ {bits_n} بتات؟", f"كم درجة في محوّل تناظري بـ {bits_n} بتات؟"])
                if "بـ" not in user:
                    bits_n = 3
                    spec["adc"] = 3
                answer = f"محوّل بـ {bits_n} بتات يحوّل القراءة الملساء إلى {2 ** bits_n} درجات، فتقفز القيمة من درجة إلى أخرى."
            else:
                user = rng.choice(["ADC", "Can you explain ADC?", "What is an analog to digital converter?", f"Explain a {bits_n}-bit ADC", f"What is a {bits_n}-bit analog to digital converter?", f"How many steps does an {bits_n}-bit ADC have?"])
                if "-bit" not in user:
                    bits_n = 3
                    spec["adc"] = 3
                answer = f"An ADC with {bits_n} bits turns the smooth reading into {2 ** bits_n} steps, so the value jumps from step to step."
        else:
            hi = rng.randint(26, 35)
            lo = hi - 3
            spec = {"kind": "signal", "high": hi, "low": lo}
            if ar:
                user = rng.choice([f"لماذا تتذبذب المروحة عند {hi} درجة؟", f"حساس حرارة بعتبة {hi}", "اشرح لي الحساس", "ما هو المستشعر؟"])
                if "اشرح لي الحساس" in user or "ما هو المستشعر" in user:
                    spec = spec_for_question(user)
                    hi, lo = spec["high"], spec["low"]
                answer = f"يقيس الحساس الحرارة ويحوّلها إلى أرقام. تعمل المروحة فوق {hi} ولا تتوقف إلا تحت {lo}، فالخطان يمنعانها من التذبذب."
            else:
                user = rng.choice([f"Why does the fan flicker at {hi} degrees?", f"sensor threshold at {hi}", "Can you explain sensor?", "What is a sensor?"])
                if user in ("Can you explain sensor?", "What is a sensor?"):
                    spec = spec_for_question(user)
                    hi, lo = spec["high"], spec["low"]
                answer = f"A sensor turns heat or light into readings. The fan switches on above {hi} and off only below {lo}, so two thresholds stop it flickering."
        return row(lang, "signal", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "trace":
        values = [rng.randint(1, 9) for _ in range(3)]
        v_str = "، ".join(str(x) for x in values) if ar else ", ".join(str(x) for x in values)
        if rng.random() < 0.45:
            user = rng.choice(["اشرح لي الحلقة", "ما هي الحلقة في البرمجة؟", "كيف تعمل حلقة for في بايثون؟"] if ar else ["a loop", "Can you explain a loop?", "What is a for loop in Python?", "How does a loop work?"])
            spec = spec_for_question(user)
            values = spec["values"]
        else:
            user = f"اشرح حلقة تجمع {v_str}" if ar else f"Explain a loop with {v_str}"
            spec = {"kind": "trace", "values": values}
        total = sum(values)
        answer = (
            f"ينفّذ بايثون سطرًا في كل مرة. يبدأ total من صفر ويكبر بكل درجة في القائمة ليطبع {total}."
            if ar else
            f"Python runs one line at a time. total starts at 0 and grows by each number in the list until it prints {total}."
        )
        return row(lang, "trace", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "flow":
        cut = rng.choice([50, 60, 70, 80])
        spec = {"kind": "flow", "ask": f"mark >= {cut}?", "yes": "Pass", "no": "Review"}
        if ar:
            user = rng.choice([f"اشرح شرط if عندما تكون الدرجة {cut}", "ما هو التفرّع الشرطي if/else؟", "اشرح المخطط الانسيابي للشرط"])
            answer = f"يفحص التفرّع الشرط (mark >= {cut}?): فإن تحقّق سلك مسار نعم (Pass)، وإلا سلك مسار لا (Review)."
        else:
            user = rng.choice([f"Explain an if/else branch at mark {cut}", "What is an if/else condition?", "How does a flowchart decision work?"])
            answer = f"An if/else branch checks the condition (mark >= {cut}?): when it is true it takes the Yes path (Pass), otherwise the No path (Review)."
        return row(lang, "flow", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "search":
        base = [2, 5, 9, 14, 21, 30]
        tgt = rng.choice(base)
        spec = {"kind": "search", "values": base, "target": tgt}
        idx = base.index(tgt)
        if ar:
            user = rng.choice([f"ابحث بالبحث الثنائي عن {tgt}", "ما هو البحث الثنائي؟", f"كيف يجد البحث الثنائي العدد {tgt}؟"])
            answer = f"يفحص البحث الثنائي العنصر الأوسط في القائمة المرتّبة ويقسم النطاق إلى النصف في كل خطوة حتى يجد {tgt} في الخانة {idx}."
        else:
            user = rng.choice([f"binary search for {tgt}", "What is binary search?", f"How does binary search find {tgt}?"])
            answer = f"Binary search checks the middle item of the sorted list and halves the search range each step until it finds {tgt} at index {idx}."
        return row(lang, "search", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "packet":
        spec = {"kind": "packet"}
        if ar:
            user = rng.choice(["اشرح لي HTTPS", "ما الفرق بين HTTP و HTTPS؟", "ماذا يخفي التشفير على الواي فاي؟"])
            answer = "على واي فاي مفتوح، يُظهر HTTP الصفحة وكلمة المرور. ويُظهر HTTPS العنوان فقط، ويشفّر الباقي."
        else:
            user = rng.choice(["HTTPS", "Can you explain HTTPS?", "What is the difference between HTTP and HTTPS?", "What does HTTPS hide on Wi-Fi?"])
            answer = "On open Wi-Fi, HTTP shows the page and the password. HTTPS still shows the address, and scrambles the rest."
        return row(lang, "packet", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "seq":
        topic = rng.choice(["phishing", "auth", "guardrail"])
        if topic == "phishing":
            spec = {"kind": "seq", "actors": ["Attacker", "You", "Real site"], "msgs": [[0, 1, "Urgent fake link"], [1, 1, "Check address"], [1, 2, "Open real site"]]}
            user = rng.choice(["ما هو التصيّد الاحتيالي؟", "اشرح لي التصيّد الاحتيالي", "كيف أحمي نفسي من الروابط المزيّفة؟"] if ar else ["phishing", "What is phishing?", "Can you explain phishing?", "How do I spot a fake link?"])
            answer = (
                "التصيّد الاحتيالي رسالة تتظاهر بأنها من جهة موثوقة لتخدعك وتسرق كلمة المرور. افحص العنوان الحقيقي وافتح الموقع بنفسك."
                if ar else
                "Phishing is a message that pretends to be someone you trust to trick you into handing over your password. Check the real address and open the site yourself."
            )
        elif topic == "auth":
            spec = {"kind": "seq", "actors": ["You", "Phone", "Server"], "msgs": [[0, 2, "Passphrase"], [2, 1, "One-time code"], [0, 2, "Code verified"]]}
            user = rng.choice(["ما هو التحقق بخطوتين؟", "ما هي عبارة المرور؟", "اشرح التحقق بخطوتين 2FA"] if ar else ["What is two-factor authentication?", "What is a passphrase?", "Explain 2FA"])
            answer = (
                "يجمع التحقق بخطوتين وعبارة المرور الطويلة بين شيء تعرفه ورمز لمرة واحدة على هاتفك، فلا تكفي كلمة المرور المسروقة وحدها."
                if ar else
                "A strong passphrase and two-factor authentication combine something you know with a one-time code on your phone, so a stolen password alone cannot sign in."
            )
        else:
            spec = {"kind": "seq", "actors": ["User", "Guardrail", "Agent", "Tool"], "msgs": [[0, 1, "Prompt"], [1, 2, "Safe request"], [2, 3, "Allowed call"], [3, 0, "Verified reply"]]}
            user = rng.choice(["ما هو حقن الأوامر؟", "اشرح حواجز الحماية وأقل صلاحية للوكيل"] if ar else ["What is prompt injection?", "Explain AI guardrails and least privilege"])
            answer = (
                "يفحص حاجز الحماية المدخلات واستدعاءات الأدوات بأقل صلاحية حتى لا ينفّذ الوكيل تعليمات خبيثة مخفية."
                if ar else
                "A guardrail checks inputs and enforces least privilege on tool calls so the agent ignores hidden prompt-injection instructions."
            )
        return row(lang, "seq", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "query":
        cut = rng.choice([45, 50, 55, 60, 65, 70, 75])
        spec = {"kind": "query", "min": cut}
        if ar:
            user = rng.choice(["اشرح لي الاستعلام", "كيف يعمل استعلام SQL؟", f"استعلام SQL للدرجات من {cut} فأكثر"])
            if "اشرح لي الاستعلام" in user or "كيف يعمل" in user:
                cut = 50
                spec["min"] = 50
            answer = f"يبقي WHERE الدرجات من {cut} فأكثر، ويضع ORDER BY الأعلى أولًا، ويبقي LIMIT أعلى نتيجتين."
        else:
            user = rng.choice(["a query", "Can you explain a query?", "How does a SQL query work?", f"SQL query for marks of {cut} or more"])
            if user in ("a query", "Can you explain a query?", "How does a SQL query work?"):
                cut = 50
                spec["min"] = 50
            answer = f"WHERE keeps marks of {cut} or more, ORDER BY puts the highest first, and LIMIT keeps the top two rows."
        return row(lang, "query", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "pattern":
        a, b = rng.sample(range(1, 9), 2)
        if rng.random() < 0.6:
            user = rng.choice(["ما هو النمط؟", "اشرح لي النمط", "علّمني عن الأنماط"] if ar else ["pattern", "What is a pattern?", "Can you explain a pattern?", "Teach me about patterns"])
            spec = spec_for_question(user)
            a, b = spec["a"], spec["b"]
        else:
            user = f"اشرح النمط المتكرر {a}، {b}" if ar else f"Explain the repeating pattern {a}, {b}"
            spec = {"kind": "pattern", "a": a, "b": b}
        answer = (
            f"النمط شيء يتكرّر في الخطوات أو الأشكال أو الأعداد. هنا يتكرّر الزوج {a}، {b} بالترتيب نفسه."
            if ar else
            f"A pattern is something that repeats in steps, shapes, or numbers. Here the pair {a}, {b} repeats in order."
        )
        return row(lang, "pattern", segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "graph":
        if rng.random() < 0.35:
            user = rng.choice(["اشرح لي أقصر طريق", "ما هي خوارزمية ديكسترا؟", "كيف نجد أقصر طريق؟"] if ar else ["shortest path", "Can you explain shortest path?", "How does Dijkstra find the shortest path?"])
            spec = spec_for_question(user)
            res = scene_result(spec)
            via = "، ".join(res["path"]) if ar else ", ".join(res["path"])
            answer = f"ديكسترا يثبّت أقرب مكان أولًا. أقصر طريق هو {via}: {res['total']} كم." if ar else f"Dijkstra settles the nearest place first. The shortest way is {via}: {res['total']} km."
            return row(lang, "graph", segs(user, plan_draw, dumps(spec), dumps(res), answer))
        n = rng.randint(3, 4)
        nodes = names_for(rng, lang, n)
        edges = connected(rng, n)
        src, dst = 0, n - 1
        total, path = dijkstra(n, edges, src, dst)
        spec = {"kind": "graph", "nodes": nodes, "edges": [list(e) for e in edges], "from": src, "to": dst}
        roads = ", ".join(f"{nodes[a]}-{nodes[b]} {w}" for a, b, w in edges)
        if ar:
            user = f"{roads}، من {nodes[src]} إلى {nodes[dst]}"
            via = "، ".join(nodes[i] for i in path)
            answer = f"ديكسترا يثبّت أقرب مكان أولًا. أقصر طريق هو {via}: {total} كم."
        else:
            user = f"{roads}, from {nodes[src]} to {nodes[dst]}"
            via = ", ".join(nodes[i] for i in path)
            answer = f"Dijkstra settles the nearest place first. The shortest way is {via}: {total} km."
        result = dumps({"total": total, "path": [nodes[i] for i in path]})
        return row(lang, "graph", segs(user, plan_draw, dumps(spec), result, answer))

    if kind == "sort":
        if rng.random() < 0.35:
            user = rng.choice(["اشرح لي الترتيب الفقاعي", "ما هو الترتيب الفقاعي؟"] if ar else ["bubble sort", "Can you explain bubble sort?", "How does bubble sort work?"])
            spec = spec_for_question(user)
            values = spec["values"]
        else:
            values = [rng.randint(1, 9) for _ in range(rng.randint(3, 5))]
            spec = {"kind": "sort", "values": values}
            listed = ", ".join(str(n) for n in values)
            user = f"رتب {listed}" if ar else f"Sort {listed}"
        ordered = ", ".join(str(n) for n in sorted(values))
        answer = (
            f"يقارن الترتيب الفقاعي كل جارين ويبدّلهما إذا كان الأيسر أكبر. بعد الترتيب: {ordered}."
            if ar else
            f"Bubble sort compares neighbours and swaps them when the left one is bigger. In order: {ordered}."
        )
        return row(lang, "sort", segs(user, plan_draw, dumps(spec), dumps({"order": sorted(values)}), answer))

    if kind == "bag":
        if rng.random() < 0.35:
            user = rng.choice(["اشرح لي مسألة الحقيبة", "كيف تعمل التعبئة الجشعة؟"] if ar else ["knapsack", "Can you explain knapsack?", "How does greedy packing work?"])
            spec = spec_for_question(user)
            res = scene_result(spec)
            answer = f"عبّئ الأغلى لكل كيلو أولًا، ثم ما يتسع بعد ذلك. المجموع {res['value']}." if ar else f"Pack the best points per kilo first, then whatever still fits. The score is {res['value']}."
            return row(lang, "bag", segs(user, plan_draw, dumps(spec), dumps(res), answer))
        k = rng.randint(2, 4)
        pool = ITEMS_AR if ar else ITEMS_EN
        picked = rng.sample(pool, k) if rng.random() < 0.35 else [fresh_name(rng, lang).lower() for _ in range(k)]
        items = [(name, rng.randint(1, 6), rng.randint(1, 6)) for name in picked]
        cap = rng.randint(max(it[1] for it in items), sum(it[1] for it in items))
        spec = {"kind": "bag", "items": [list(it) for it in items], "cap": cap}
        value = bag_value(items, cap)
        body = ", ".join(f"{name} {w} {v}" for name, w, v in items)
        user = f"حمّل {body}، سعة {cap}" if ar else f"Pack {body}, capacity {cap}"
        answer = f"عبّئ الأغلى لكل كيلو أولًا. المجموع {value} نقطة." if ar else f"Pack the most points per kilo first. Greedy packing scores {value}."
        return row(lang, "bag", segs(user, plan_draw, dumps(spec), dumps({"value": value}), answer))

    if kind == "concept":
        pairs_en = [
            ("What is artificial intelligence?", "AI is a computer program that learns patterns from many examples and uses them to make predictions."),
            ("What is AI?", "AI is a computer program that learns from examples so it can make a prediction on new data."),
            ("Can you explain AI in simple words?", "AI learns patterns from examples instead of following only fixed rules written by hand."),
            ("What is an algorithm?", "An algorithm is a clear list of step-by-step instructions for solving a problem."),
            ("Can you explain an algorithm?", "An algorithm breaks a task into ordered steps and decisions that a person or computer can follow."),
            ("What is a tidy table?", "In a tidy table, each row is one record and each column holds one clear attribute with its own unit."),
            ("Can you explain a tidy table?", "A tidy table keeps one item per row and one type of value per column so queries and charts stay accurate."),
            ("What is a prompt?", "A prompt is the request, role, and context you type to tell a language model what task to do."),
            ("Can you explain a prompt?", "A good prompt gives the model a clear role, context, and task so its output is useful and easy to check."),
            ("What is a passphrase?", "A passphrase joins three or four random words into a long secret that is easy to remember and hard to guess."),
            ("Can you explain a passphrase?", "A passphrase uses several random words instead of one short word, making accounts much safer."),
            ("What is a loop?", "A loop repeats a block of code for each item in a list so you do not write the same step over and over."),
            ("What does loop mean in a program?", "A loop repeats instructions for each value in a sequence and updates the variables step by step."),
        ]
        pairs_ar = [
            ("ما هو الذكاء الاصطناعي؟", "الذكاء الاصطناعي برنامج حاسوب يتعلّم الأنماط من أمثلة كثيرة ليقدّم توقّعات على بيانات جديدة."),
            ("اشرح لي الذكاء الاصطناعي", "يتعلّم الذكاء الاصطناعي من الأمثلة والتدريب بدل الاعتماد على قواعد ثابتة فقط."),
            ("ما هي الخوارزمية؟", "الخوارزمية هي خطوات واضحة ومرتّبة لحل مسألة أو إنجاز مهمة خطوة بخطوة."),
            ("اشرح لي الخوارزمية", "تقسّم الخوارزمية العمل إلى خطوات متسلسلة وقرارات واضحة يمكن للحاسوب تنفيذها."),
            ("ما هو الجدول المرتّب؟", "في الجدول المرتّب يمثّل كل صف سجلًا واحدًا، ويحمل كل عمود معلومة واحدة محدّدة."),
            ("اشرح لي الجدول المرتب", "يضع الجدول المرتّب كل عنصر في صف وكل خاصية في عمود ليسهل الفرز والاستعلام."),
            ("ما هو الطلب؟", "الطلب هو السؤال أو الدور والسياق الذي تكتبه للنموذج اللغوي ليؤدّي المهمة بوضوح."),
            ("اشرح لي الطلب في الذكاء الاصطناعي", "يحدّد الطلب الجيد الدور والسياق والمهمة للنموذج اللغوي حتى يعطي جوابًا دقيقًا."),
            ("ما هي عبارة المرور؟", "عبارة المرور تجمع عدة كلمات في سرّ طويل يسهل تذكّره ويصعب تخمينه."),
            ("اشرح لي عبارة المرور", "تتكوّن عبارة المرور من ثلاث أو أربع كلمات لتكون أطول وأقوى من كلمة المرور القصيرة."),
            ("ما هي الحلقة؟", "الحلقة هي تكرار لمجموعة أوامر في البرنامج على كل عنصر في القائمة خطوة بعد خطوة."),
            ("ما معنى التكرار في البرنامج؟", "يعيد التكرار تنفيذ الأوامر نفسها على كل قيمة في القائمة ويحدّث المتغيرات في كل دورة."),
        ]
        user, answer = rng.choice(pairs_ar if ar else pairs_en)
        spec = spec_for_question(user)
        return row(lang, spec["kind"], segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    if kind == "pack_canon":
        en_term, ar_term, spec, en_ans, ar_ans = rng.choice(PACK_CANON_DRILLS)
        term = ar_term if ar else en_term
        tpls = (
            [
                f"فسّر {term} لمبتدئ.", f"اشرح {term} بصورة متحركة.", f"ماذا يحدث داخل {term}؟",
                f"وضّح كيف يعمل {term} خطوة بخطوة.", f"أنا جديد على {term}؛ اجعله واضحًا.", f"علّمني {term} باستخدام رسم متحرك.",
            ]
            if ar else
            [
                f"Give me a beginner-friendly explanation of {term}.", f"Walk me through {term} with a picture.",
                f"What happens inside {term}?", f"Show how {term} works step by step.",
                f"I'm new to {term}; make it concrete.", f"Use an animation to teach me {term}.",
            ]
        )
        user = rng.choice(tpls)
        answer = ar_ans if ar else en_ans
        return row(lang, spec["kind"], segs(user, plan_draw, dumps(spec), dumps(scene_result(spec)), answer))

    # Off-topic or harmful: refuse without calling scene.
    if ar:
        user = rng.choice(REFUSE_AR)
        plan, answer = "none", "أشرح أفكار التقنية من المقررات بالرسم المتحرك. اسألني عن فكرة تقنية من المقررات."
    else:
        user = rng.choice(REFUSE_EN)
        plan, answer = "none", "I explain technology ideas from the courses with animations. Ask me about one of them."
    return row(lang, "none", segs(user, plan, None, None, answer))


def row(lang: str, kind: str, parts: list[list[str]]) -> dict:
    return {"lang": lang, "kind": kind, "segs": parts}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="out/scene-data")
    ap.add_argument("--n", type=int, default=80000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--tok", default="tokenizer.json")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = random.Random(a.seed)
    weights = [
        ("neuron", 9), ("net", 9), ("arch", 10), ("plot", 7),
        ("gates", 4), ("bits", 4), ("signal", 8), ("trace", 6),
        ("flow", 4), ("search", 5), ("packet", 4), ("seq", 5),
        ("query", 6), ("pattern", 3), ("concept", 8), ("pack_canon", 18),
        ("graph", 16), ("sort", 8), ("bag", 7), ("none", 16),
    ]
    bag: list[str] = []
    for name, w in weights:
        bag += [name] * w
    tok = Tokenizer.load(a.tok) if os.path.exists(a.tok) else None
    longest, dropped = 0, 0
    files = {split: open(os.path.join(a.out, f"{split}.jsonl"), "w", encoding="utf-8") for split in ("train", "val")}
    try:
        for i in range(a.n):
            lang = "ar" if i % 2 else "en"
            ep = episode(rng, lang, rng.choice(bag))
            if tok is not None:
                n = len(encode_conv(tok, ep["segs"])[0])
                longest = max(longest, n)
                if n > 384:
                    dropped += 1
                    continue
            split = "val" if i % 40 == 0 else "train"
            files[split].write(json.dumps(ep, ensure_ascii=False) + "\n")
    finally:
        for f in files.values():
            f.close()
    print(f"wrote {a.out}; longest {longest} tokens; dropped {dropped} over 384")


if __name__ == "__main__":
    main()
