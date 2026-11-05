# -*- coding: utf-8 -*-
"""Rebuild 9 Darsi capstones as a proper 3-stage project with multi-step photo starter."""
from __future__ import annotations
import json
import re
from copy import deepcopy
from pathlib import Path

UNITS = Path(r"H:\htdocs\darsi\content\units")
CATALOG = Path(r"H:\htdocs\darsi\apps\web\public\content\dev-catalog.json")
QUIZ = {"choice", "truefalse", "multi", "order", "match", "fill", "type", "image", "hotspot", "scenario"}

def lt(en: str, ar: str):
    return {"en": en, "ar": ar}

def fig(en_cap: str, ar_cap: str, name: str) -> dict:
    """Lone-paragraph figure for ReadingBody / SetupBody."""
    return lt(
        f"![{en_cap} (illustrative)](/media/capstone-shared/{name}.jpg)",
        f"![{ar_cap} (توضيحي)](/media/capstone-shared/{name}.jpg)",
    )

def join_body(*parts: dict) -> dict:
    """Join bilingual body parts with blank lines; skip empties."""
    en, ar = [], []
    for p in parts:
        if not p:
            continue
        e = (p.get("en") or "").strip()
        a = (p.get("ar") or "").strip()
        if e:
            en.append(e)
        if a:
            ar.append(a)
    return lt("\n\n".join(en) + "\n", "\n\n".join(ar) + "\n")

def para(en: str, ar: str) -> dict:
    return lt(en.strip(), ar.strip())

def demarkdown(text: str) -> str:
    if not text:
        return text
    out = []
    for para_ in re.split(r"\n\n+", text.strip()):
        cleaned = para_.strip()
        if not cleaned:
            continue
        raw = cleaned.replace("\u2066", "").replace("\u2067", "").replace("\u2068", "").replace("\u2069", "")
        raw = raw.replace("\u202A", "").replace("\u202B", "").replace("\u202C", "").replace("\u202D", "").replace("\u202E", "")
        if re.match(r"^!\[[^\]]*\]\((/media/[^)\s]+)\)$", raw):
            out.append(raw)
            continue
        lines = []
        for line in cleaned.splitlines():
            line = re.sub(r"^#{1,6}\s+", "", line)
            line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
            line = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", line)
            if line.strip():
                lines.append(line.rstrip())
        if lines:
            out.append("\n".join(lines))
    return "\n\n".join(out) + ("\n" if out else "")

def demarkdown_body(body: dict | None) -> dict | None:
    if not body:
        return body
    return {"en": demarkdown(body.get("en") or ""), "ar": demarkdown(body.get("ar") or "")}

def extract_tools(lessons):
    tools_en, tools_ar, seen = [], [], set()
    patterns = [
        r"(?:##\s*)?Tools(?: overview)?\n((?:[-•].+\n)+)",
        r"(?:##\s*)?نظرة على الأدوات\n((?:[-•].+\n)+)",
    ]
    for l in lessons:
        for s in l.get("steps") or []:
            if s.get("type") != "read":
                continue
            body = s.get("body") or {}
            for lang, bucket in (("en", tools_en), ("ar", tools_ar)):
                text = body.get(lang) or ""
                for pat in patterns:
                    m = re.search(pat, text)
                    if not m:
                        continue
                    for line in m.group(1).strip().splitlines():
                        item = re.sub(r"^[-•]\s*", "", line).strip()
                        item = re.sub(r"\*\*([^*]+)\*\*", r"\1", item)
                        key = item.lower()
                        if item and key not in seen:
                            seen.add(key)
                            bucket.append(item)
    if len(tools_ar) < len(tools_en):
        tools_ar = tools_en[:]
    return tools_en[:12], tools_ar[:12]

def collect_projects(lessons):
    projects, total_h = [], 0
    lines_en, lines_ar = [], []
    for l in lessons:
        for s in l.get("steps") or []:
            if s.get("type") != "project":
                continue
            projects.append(s)
            h = s.get("hours") or 0
            total_h += h
            prompt_en = ((s.get("prompt") or {}).get("en") or "").split("\n")[0].strip()
            prompt_ar = ((s.get("prompt") or {}).get("ar") or prompt_en).split("\n")[0].strip()
            mid = s.get("milestone") or "?"
            title_en = prompt_en if prompt_en else f"Milestone {mid}"
            title_ar = prompt_ar if prompt_ar else f"المرحلة {mid}"
            task_en = ((s.get("task") or {}).get("en") or "").split("\n")[0].strip()
            task_ar = ((s.get("task") or {}).get("ar") or task_en).split("\n")[0].strip()
            lines_en.append(f"{title_en} (~{h} h): {task_en}")
            lines_ar.append(f"{title_ar} (~{h} ساعة): {task_ar}")
    return projects, total_h, lines_en, lines_ar

def starter_repo(projects, unit_id):
    for p in projects:
        if p.get("starterRepo"):
            return p["starterRepo"]
    return unit_id

def rewrite_setup(setup, repo: str):
    if not setup:
        return [
            {"os": "windows", "body": lt(
                f"Already finished stage 2 (Starter)?\n1. Open YOUR copy of https://github.com/darsi-org/{repo}\n2. Code → Codespaces → Create codespace on main\n   Or local: VS Code → Terminal → New Terminal\n3. .venv\\Scripts\\activate\n4. pip install -r requirements.txt\n5. python check.py",
                f"خلّصت المرحلة 2 (البداية)؟\n1. افتح نسختك من https://github.com/darsi-org/{repo}\n2. Code → Codespaces → Create codespace on main\n   أو محلي: VS Code → Terminal → New Terminal\n3. .venv\\Scripts\\activate\n4. pip install -r requirements.txt\n5. python check.py",
            )},
            {"os": "mac", "body": lt(
                f"Already finished stage 2 (Starter)?\n1. Open YOUR copy of https://github.com/darsi-org/{repo}\n2. Codespaces or local Terminal\n3. source .venv/bin/activate\n4. pip install -r requirements.txt\n5. python check.py",
                f"خلّصت المرحلة 2 (البداية)؟\n1. افتح نسختك\n2. Codespaces أو طرفية محلية\n3. source .venv/bin/activate\n4. pip install -r requirements.txt\n5. python check.py",
            )},
            {"os": "colab", "body": lt(
                "Codespaces preferred for most tracks.\nAI notebooks: Runtime → Change runtime type → T4 GPU → Save.\nThen run the first cell / python check.py.",
                "Codespaces أفضل لمعظم المسارات.\nدفاتر AI: Runtime → Change runtime type → T4 GPU → Save.\nبعدين أول خلية / python check.py.",
            )},
        ]
    out = []
    for tab in setup:
        t = deepcopy(tab)
        body = t.get("body") or {}
        for lang in ("en", "ar"):
            if lang in body and isinstance(body[lang], str):
                body[lang] = demarkdown(
                    body[lang]
                    .replace("Already finished the Setup lesson?", "Already finished stage 2 (Starter)?")
                    .replace("Already finished the Starter page?", "Already finished stage 2 (Starter)?")
                    .replace("خلّصت درس التجهيز؟", "خلّصت المرحلة 2 (البداية)؟")
                    .replace("خلّصت صفحة البداية؟", "خلّصت المرحلة 2 (البداية)؟")
                )
        t["body"] = body
        out.append(t)
    return out

def slides_for(title, note, bullets_en, bullets_ar, narration_en, narration_ar, discuss_en=None, discuss_ar=None):
    return [
        {"layout": "title", "title": title, "note": note, "narration": lt(narration_en, narration_ar)},
        {"layout": "bullets", "title": lt("You will", "هتعمل"), "bullets": lt(bullets_en, bullets_ar)},
        {"layout": "activity", "title": lt("Do this", "اعمل كده"), "bullets": lt(bullets_en[:4] or bullets_en, bullets_ar[:4] or bullets_ar)},
        {"layout": "questions", "title": lt("Check yourself", "راجع نفسك"), "bullets": lt(
            discuss_en or ["Can I explain why this stage exists?", "What do I open next?"],
            discuss_ar or ["أقدر أشرح ليه المرحلة دي موجودة؟", "هفتح إيه بعد كده؟"],
        )},
        {"layout": "exit", "title": lt("Before you go", "قبل ما تمشي"), "bullets": lt(
            ["One sentence: what this stage asked me to understand or do."],
            ["جملة واحدة: المرحلة دي طلبت مني أفهم أو أعمل إيه."],
        ), "narration": lt("Three stages. Real project.", "ثلاث مراحل. مشروع حقيقي.")},
    ]

def kit_for(lesson_id, title):
    return [
        {"kind": "slides", "title": lt(f"Slides: {title['en']}", f"شرائح: {title['ar']}"), "pages": 5, "base": f"{lesson_id}/slides", "formats": ["pdf", "pptx"]},
        {"kind": "worksheet", "title": lt(f"Notes & worksheet: {title['en']}", f"ملاحظات وورقة: {title['ar']}"), "pages": 2, "base": f"{lesson_id}/lesson-plan", "formats": ["pdf"]},
    ]

def pick_comps(lessons):
    out = []
    for l in lessons:
        for c in l.get("competencies") or []:
            if c not in out:
                out.append(c)
    return out

def materials_shared(lessons):
    for l in lessons:
        if l.get("materials"):
            return l["materials"]
    return lt(
        ["A computer or Codespaces", "A free GitHub account", "Notes from the course"],
        ["كمبيوتر أو Codespaces", "حساب GitHub مجاني", "ملاحظات من الكورس"],
    )

def try_tomorrow(lessons):
    for l in lessons:
        if l.get("tryTomorrow"):
            return l["tryTomorrow"]
    return lt(
        "Show one person what you are building and ask them one question it should answer.",
        "وري لحد حاجة اللي بتبنيها واسأله سؤال واحد المشروع لازم يرد عليه.",
    )

def read_step(sid: str, title: dict, prompt: dict, body: dict) -> dict:
    return {
        "type": "read",
        "id": sid,
        "prompt": prompt,
        "title": title,
        "body": body,
        "keyTerms": [],
    }

def track_extra_step(track: str, repo: str) -> dict | None:
    if track in ("ai", "ds", "data-science"):
        return read_step(
            "colab",
            lt("Optional: Colab GPU", "اختياري: GPU في Colab"),
            lt("Set a Colab GPU if this track needs it", "فعّل GPU في Colab لو المسار محتاجه"),
            join_body(
                para(
                    "Some notebooks in this track need a free GPU. Open the notebook link from the starter README.",
                    "بعض الدفاتر في المسار ده محتاجة GPU مجاني. افتح رابط الدفتر من README البداية.",
                ),
                fig("Colab Runtime menu", "قائمة Runtime في Colab", "colab-runtime"),
                para(
                    "Exact clicks:\n1. Runtime → Change runtime type\n2. Hardware accelerator → T4 GPU\n3. Save\n4. Run the first cell, then follow the README",
                    "الضغطات بالظبط:\n1. Runtime → Change runtime type\n2. Hardware accelerator → T4 GPU\n3. Save\n4. شغّل أول خلية، وبعدين اتبع README",
                ),
            ),
        )
    if track == "cyber":
        return read_step(
            "juice",
            lt("Practice app on localhost", "تطبيق التدريب على localhost"),
            lt("See Juice Shop on your machine", "شوف Juice Shop على جهازك"),
            join_body(
                para(
                    "This track's practice target runs only on your computer (defence practice). Follow the starter README to start it.",
                    "هدف التدريب في المسار ده بيشتغل على جهازك بس (تدريب دفاعي). اتبع README البداية عشان تشغّله.",
                ),
                fig("Juice Shop on localhost", "Juice Shop على localhost", "localhost-juice"),
                para(
                    "Exact idea: open http://localhost:3000 (or the port the README names) after the containers are up. Never point tools at a live school site.",
                    "الفكرة: افتح http://localhost:3000 (أو البورت اللي README بيقوله) بعد ما الكونتينرات تشتغل. متوجّهش أدوات لموقع مدرسة حي.",
                ),
            ),
        )
    if track == "iot":
        return read_step(
            "wokwi",
            lt("Optional: Wokwi ESP32 sim", "اختياري: محاكي Wokwi ESP32"),
            lt("Open the ESP32 sim if you have no board", "افتح محاكي ESP32 لو مفيش بورد"),
            join_body(
                para(
                    "No physical board? Use the Wokwi link in the starter README.",
                    "مفيش بورد؟ استخدم رابط Wokwi في README البداية.",
                ),
                fig("Wokwi ESP32 simulator", "محاكي Wokwi ESP32", "wokwi-esp32"),
                para(
                    "Exact clicks in Wokwi: open the project link → Start simulation → watch the serial monitor. Flash steps stay in the README.",
                    "الضغطات في Wokwi: افتح رابط المشروع → Start simulation → راقب الشاشة التسلسلية. خطوات الفلاش في README.",
                ),
            ),
        )
    return None

def description_lesson(unit, tools_en, tools_ar, mil_en, mil_ar, hours, repo, comps, mats, try_tm):
    uid = unit["id"]
    desc_id = f"{uid}-description"
    title = lt("1. Project description", "1. وصف المشروع")
    n_m = len(mil_en) or 5
    tools_en_txt = "\n".join(f"• {t}" for t in tools_en) or "• See the starter README"
    tools_ar_txt = "\n".join(f"• {t}" for t in tools_ar) or "• شوف README البداية"
    mil_en_txt = "\n\n".join(mil_en)
    mil_ar_txt = "\n\n".join(mil_ar)
    build_en = unit["title"]["en"].replace("Capstone: ", "").strip()
    if build_en:
        build_en = build_en[0].upper() + build_en[1:]
    body = join_body(
        para(
            "This course is a real project in three stages. Stage 1 (this page) is the map. Stage 2 walks you through setup with screenshots. Stage 3 is where you submit.",
            "الكورس ده مشروع حقيقي على ثلاث مراحل. المرحلة 1 (الصفحة دي) الخريطة. المرحلة 2 تمشّيك في التجهيز بصور. المرحلة 3 مكان التسليم.",
        ),
        para("Why this capstone", "ليه المشروع الختامي ده"),
        para(unit["summary"]["en"], unit["summary"]["ar"]),
        para("What you build", "هتبني إيه"),
        para(
            f"{build_en}.\n\nYou leave with a public GitHub repository, darsi-check.json evidence, and a short explanation in your own words.",
            f"{unit['title']['ar']}.\n\nهتطلع بريبو عام على GitHub، ودليل darsi-check.json، وشرح قصير بكلامك.",
        ),
        para("Hours and tools", "الساعات والأدوات"),
        para(
            f"About {hours} hours across {n_m} milestones (Starter setup is extra once).\n\n{tools_en_txt}\n\nStarter template: https://github.com/darsi-org/{repo}",
            f"حوالي {hours} ساعة على {n_m} مراحل (تجهيز البداية مرة زيادة).\n\n{tools_ar_txt}\n\nقالب البداية: https://github.com/darsi-org/{repo}",
        ),
        fig("Use this template on GitHub", "Use this template على GitHub", "github-use-this-template"),
        para(
            "You will click that green button in stage 2. Keep going to Starter when you finish this page.",
            "هتضغط الزر الأخضر ده في المرحلة 2. كمّل للبداية لما تخلّص الصفحة دي.",
        ),
        para("Milestone summary", "ملخص المراحل"),
        para(mil_en_txt, mil_ar_txt),
    )
    return {
        "id": desc_id,
        "title": title,
        "minutes": 15,
        "tryTomorrow": try_tm,
        "materials": mats,
        "competencies": comps[:8],
        "kit": kit_for(desc_id, title),
        "steps": [
            read_step(
                "brief",
                title,
                lt("Read the project map", "اقرا خريطة المشروع"),
                body,
            )
        ],
        "slides": slides_for(
            title,
            lt("Three stages: map, setup, submit", "ثلاث مراحل: خريطة، تجهيز، تسليم"),
            [
                "Know why this capstone exists",
                f"Plan about {hours} hours across milestones",
                "See the starter template photo",
                "Next: stage 2 — Starter (multi-step setup)",
            ],
            [
                "تعرف ليه المشروع الختامي موجود",
                f"تخطّط حوالي {hours} ساعة على المراحل",
                "تشوف صورة قالب البداية",
                "بعدين: المرحلة 2 — البداية (تجهيز بخطوات)",
            ],
            "Stage 1 is the map only.",
            "المرحلة 1 الخريطة بس.",
        ),
    }

def starter_lesson(unit, repo, comps, mats, track: str):
    uid = unit["id"]
    starter_id = f"{uid}-starter"
    title = lt("2. Starter", "2. البداية")
    url = f"https://github.com/darsi-org/{repo}"
    steps = [
        read_step(
            "need",
            lt("What you need", "محتاج إيه"),
            lt("Check you have the basics", "اتأكد إن الأساسيات جاهزة"),
            join_body(para(
                "You need:\n• A free GitHub account\n• A browser (Chrome or Edge is fine)\n• Either Codespaces (no install) or your laptop\n\nStage 2 is only setup. You build the project after this, then submit in stage 3.",
                "محتاج:\n• حساب GitHub مجاني\n• متصفح (Chrome أو Edge تمام)\n• Codespaces (من غير تثبيت) أو لابتوبك\n\nالمرحلة 2 تجهيز بس. البناء بعد كده، والتسليم في المرحلة 3.",
            )),
        ),
        read_step(
            "github",
            lt("Create a GitHub account", "اعمل حساب GitHub"),
            lt("Sign up if you still need an account", "سجّل لو لسه محتاج حساب"),
            join_body(para(
                "Skip this step if you already have GitHub.\n\nExact clicks:\n1. Open https://github.com/signup\n2. Enter email → Continue\n3. Create a password → Continue\n4. Verify → Create account\n5. Open the email GitHub sent you and confirm",
                "تخطّى الخطوة دي لو عندك GitHub.\n\nالضغطات بالظبط:\n1. افتح https://github.com/signup\n2. إيميل → Continue\n3. باسورد → Continue\n4. Verify → Create account\n5. افتح الإيميل اللي GitHub باعته وأكّد",
            )),
        ),
        read_step(
            "template",
            lt("Use this template", "Use this template"),
            lt("Make YOUR copy of the starter", "اعمل نسختك من البداية"),
            join_body(
                para(
                    f"Open the starter for this track:\n{url}",
                    f"افتح قالب البداية للمسار ده:\n{url}",
                ),
                fig("Use this template on GitHub", "Use this template على GitHub", "github-use-this-template"),
                para(
                    "Exact clicks:\n1. Green button: Use this template → Create a new repository\n2. Owner: you\n3. Repository name: keep the default\n4. Public → Create repository\n5. You are now on YOUR copy (the URL has your username)",
                    "الضغطات بالظبط:\n1. الزر الأخضر: Use this template → Create a new repository\n2. Owner: أنت\n3. اسم الريبو: سيبه زي ما هو\n4. Public → Create repository\n5. دلوقتي أنت على نسختك (اللينك فيه يوزرك)",
                ),
            ),
        ),
        read_step(
            "codespaces",
            lt("Open in Codespaces", "افتح في Codespaces"),
            lt("Edit in the browser without installing", "عدّل من المتصفح من غير تثبيت"),
            join_body(
                para(
                    "Easiest path: no Git or Python install on your laptop.",
                    "أسهل طريق: من غير تثبيت Git أو Python على اللابتوب.",
                ),
                fig("Code → Codespaces → Create", "Code → Codespaces → Create", "github-codespaces"),
                para(
                    "Exact clicks on YOUR copy:\n1. Green Code button\n2. Codespaces tab\n3. Create codespace on main\n4. Wait 1–2 minutes until the editor appears\n5. Terminal is at the bottom (or Menu: Terminal → New Terminal)",
                    "الضغطات بالظبط على نسختك:\n1. زر Code الأخضر\n2. تبويب Codespaces\n3. Create codespace on main\n4. استنى ١–٢ دقيقة لحد المحرر يظهر\n5. الطرفية تحت (أو Menu: Terminal → New Terminal)",
                ),
            ),
        ),
        read_step(
            "local",
            lt("Or open on your computer", "أو افتح على جهازك"),
            lt("Clone locally if you prefer VS Code", "انسخ محلي لو بتفضّل VS Code"),
            join_body(
                para(
                    "Skip this step if you use Codespaces.",
                    "تخطّى الخطوة دي لو بتستخدم Codespaces.",
                ),
                fig("VS Code terminal", "طرفية VS Code", "vscode-terminal"),
                para(
                    "Exact path:\n1. Install Git (https://git-scm.com), VS Code (https://code.visualstudio.com), Python 3.12 (tick Add to PATH)\n2. On YOUR repo: Code → Local → copy the HTTPS URL\n3. In a terminal: git clone <URL> then cd into the folder\n4. VS Code: File → Open Folder → that folder\n5. Terminal → New Terminal",
                    "المسار بالظبط:\n1. ثبّت Git وVS Code وPython 3.12 (علّم Add to PATH)\n2. على الريبو: Code → Local → انسخ رابط HTTPS\n3. في الطرفية: git clone ثم cd للفولدر\n4. VS Code: File → Open Folder → الفولدر\n5. Terminal → New Terminal",
                ),
            ),
        ),
        read_step(
            "install",
            lt("Install dependencies", "ثبّت الاعتماديات"),
            lt("Create a venv and install requirements", "اعمل venv وثبّت المتطلبات"),
            join_body(para(
                "In the project terminal (Codespaces or local):\n\nWindows:\npython -m venv .venv\n.venv\\Scripts\\activate\npip install -r requirements.txt\n\nMac / Codespaces:\npython3 -m venv .venv\nsource .venv/bin/activate\npip install -r requirements.txt\n\nIf the starter uses another install command, the README wins — follow it.",
                "في طرفية المشروع (Codespaces أو محلي):\n\nWindows:\npython -m venv .venv\n.venv\\Scripts\\activate\npip install -r requirements.txt\n\nMac / Codespaces:\npython3 -m venv .venv\nsource .venv/bin/activate\npip install -r requirements.txt\n\nلو البداية فيها أمر تثبيت تاني، README هو الأصل.",
            )),
        ),
        read_step(
            "check",
            lt("Run check.py", "شغّل check.py"),
            lt("Prove the check script writes darsi-check.json", "اتأكد إن الفحص بيكتب darsi-check.json"),
            join_body(para(
                "Exact command in the project terminal:\n\npython check.py\n\nYou should see milestone lines (m1…m5 or similar) and a new file darsi-check.json.\n\nThat file is what you upload in stage 3. Darsi never runs your code on its servers.",
                "الأمر بالظبط في طرفية المشروع:\n\npython check.py\n\nهتشوف سطور المراحل (m1…m5 أو شبيه) وملف جديد darsi-check.json.\n\nالملف ده اللي هترفعه في المرحلة 3. درسي مش بتشغّل كودك على سيرفراتها.",
            )),
        ),
    ]
    extra = track_extra_step(track, repo)
    if extra:
        steps.append(extra)
    steps.append(read_step(
        "done",
        lt("Starter done — next is submission", "البداية خلصت — الجاي التسليم"),
        lt("Confirm your repo URL before stage 3", "اتأكد من رابط الريبو قبل المرحلة 3"),
        join_body(para(
            f"Copy your repo URL (it looks like https://github.com/YOU/{repo}).\n\nYou finished stage 2. Stage 3 is Project submission: hand in milestones with the repo link and darsi-check.json.",
            f"انسخ رابط الريبو (شكلُه https://github.com/YOU/{repo}).\n\nخلّصت المرحلة 2. المرحلة 3 تسليم المشروع: سلّم المراحل برابط الريبو و darsi-check.json.",
        )),
    ))
    return {
        "id": starter_id,
        "title": title,
        "minutes": 45,
        "tryTomorrow": lt(
            "Run python check.py once on your copy and open darsi-check.json.",
            "شغّل python check.py مرة على نسختك وافتح darsi-check.json.",
        ),
        "materials": mats,
        "competencies": comps[:8],
        "kit": kit_for(starter_id, title),
        "steps": steps,
        "slides": slides_for(
            title,
            lt("Photos + exact clicks", "صور + ضغطات بالظبط"),
            [
                "GitHub account if needed",
                "Use this template → your repo",
                "Codespaces or local terminal",
                "venv + pip + python check.py",
            ],
            [
                "حساب GitHub لو محتاج",
                "Use this template → الريبو بتاعك",
                "Codespaces أو طرفية محلية",
                "venv + pip + python check.py",
            ],
            "Stage 2 is multi-step setup with screenshots.",
            "المرحلة 2 تجهيز متعدد الخطوات بصور.",
            ["Did check.py write darsi-check.json?", "Do I have my repo URL?"],
            ["check.py كتب darsi-check.json؟", "معايا رابط الريبو؟"],
        ),
    }

def submission_lesson(unit, repo, projects, comps, mats):
    uid = unit["id"]
    submit_id = f"{uid}-submission"
    title = lt("3. Project submission", "3. تسليم المشروع")
    rows_en, rows_ar = [], []
    for p in projects:
        mid = p.get("milestone") or p.get("id") or "?"
        ev = ", ".join(e.get("kind") for e in (p.get("evidence") or []) if isinstance(e, dict))
        task = ((p.get("task") or {}).get("en") or "").split("\n")[0].strip()
        task_ar = ((p.get("task") or {}).get("ar") or task).split("\n")[0].strip()
        rows_en.append(f"• {mid}: {task} — evidence: {ev or 'repo + check'}")
        rows_ar.append(f"• {mid}: {task_ar} — الدليل: {ev or 'repo + check'}")
    body = join_body(
        para(
            "This is stage 3 — the FINAL stage: project submission. Finish work in your starter copy, then hand in here.",
            "دي المرحلة 3 — المرحلة الأخيرة: تسليم المشروع. خلّص الشغل في نسختك من البداية، وبعدين سلّم هنا.",
        ),
        para("What to send every time", "تبعت إيه كل مرة"),
        para(
            f"1. GitHub repo link — your copy, e.g. https://github.com/YOU/{repo}\n2. darsi-check.json — from python check.py (or python check.py --milestone mN)\n3. Your explanation — how it works in your own words; say if you used AI and how\n4. Extra links when asked (Colab, Space, dashboard, release)",
            f"1. رابط ريبو GitHub — نسختك، مثال https://github.com/YOU/{repo}\n2. darsi-check.json — من python check.py (أو python check.py --milestone mN)\n3. شرحك — بكلامك؛ وقول لو استخدمت ذكاء اصطناعي وإزاي\n4. روابط زيادة لو مطلوب (Colab، Space، داشبورد، إصدار)",
        ),
        fig("GitHub Actions green", "GitHub Actions أخضر", "github-actions-green"),
        fig("Release v1", "إصدار v1", "github-release-v1"),
        para(
            "Green Actions and a v1.0 release help on the final milestone. Exact menu paths: repo → Actions tab; repo → Releases → Create a new release.",
            "Actions أخضر وإصدار v1.0 بيفيدوا في المرحلة الأخيرة. المسارات: الريبو → تبويب Actions؛ الريبو → Releases → Create a new release.",
        ),
        para("Milestone checklist", "قائمة تحقق المراحل"),
        para("\n".join(rows_en), "\n".join(rows_ar)),
        para(
            "Staff/AI read darsi-check.json and your links. A human still Approves. Use the project steps below to submit each milestone.",
            "الموظفين/الذكاء الاصطناعي بيقراوا darsi-check.json وروابطك. إنسان لسه بيعمل Approve. استخدم خطوات المشروع تحت عشان تسلّم كل مرحلة.",
        ),
    )
    project_steps = []
    for p in projects:
        np = deepcopy(p)
        mid = np.get("milestone") or "m"
        np["id"] = f"project-{mid}"
        np["setup"] = rewrite_setup(np.get("setup"), repo)
        np["final"] = False
        project_steps.append(np)
    if project_steps:
        project_steps[-1]["final"] = True
    return {
        "id": submit_id,
        "title": title,
        "minutes": 60,
        "tryTomorrow": lt(
            "Submit the next milestone with repo link and darsi-check.json.",
            "سلّم المرحلة الجاية برابط الريبو و darsi-check.json.",
        ),
        "materials": mats,
        "competencies": comps[:8],
        "kit": kit_for(submit_id, title),
        "steps": [
            read_step(
                "brief",
                title,
                lt("Read how to submit the project", "اقرا إزاي تسلّم المشروع"),
                body,
            ),
            *project_steps,
        ],
        "slides": slides_for(
            title,
            lt("Final stage: hand in evidence", "المرحلة الأخيرة: سلّم الدليل"),
            [
                "Paste your GitHub repo URL",
                "Upload darsi-check.json",
                "Explain in your own words",
                "Human Approves after checks",
            ],
            [
                "الصق رابط ريبو GitHub",
                "ارفع darsi-check.json",
                "اشرح بكلامك",
                "الإنسان بيوافق بعد الفحص",
            ],
            "Stage 3 is submission — the final stage.",
            "المرحلة 3 التسليم — المرحلة الأخيرة.",
        ),
    }

def rebuild(unit: dict) -> dict:
    old = unit.get("lessons") or []
    tools_en, tools_ar = extract_tools(old)
    projects, hours, mil_en, mil_ar = collect_projects(old)
    repo = starter_repo(projects, unit["id"])
    comps = pick_comps(old)
    mats = materials_shared(old)
    try_tm = try_tomorrow(old)
    track = unit.get("track") or unit["id"].split("-")[0]
    desc = description_lesson(unit, tools_en, tools_ar, mil_en, mil_ar, hours, repo, comps, mats, try_tm)
    starter = starter_lesson(unit, repo, comps, mats, track)
    submit = submission_lesson(unit, repo, projects, comps, mats)
    out = deepcopy(unit)
    out["kind"] = "capstone"
    out["lessons"] = [desc, starter, submit]
    return out

def assert_clean(unit: dict):
    assert len(unit["lessons"]) == 3, unit["id"]
    assert unit["lessons"][0]["title"]["en"].startswith("1.")
    assert unit["lessons"][1]["title"]["en"].startswith("2.")
    assert unit["lessons"][2]["title"]["en"].startswith("3.")
    starter_steps = unit["lessons"][1]["steps"]
    assert len(starter_steps) >= 5, (unit["id"], len(starter_steps))
    imgs = 0
    for s in starter_steps:
        if s.get("type") != "read":
            continue
        for lang in ("en", "ar"):
            body = (s.get("body") or {}).get(lang) or ""
            assert "##" not in body and "**" not in body, (unit["id"], s["id"], lang)
            imgs += body.count("![")
    assert imgs >= 6, (unit["id"], imgs)  # en+ar figures across steps
    sub = unit["lessons"][2]
    projects = [s for s in sub["steps"] if s["type"] == "project"]
    assert projects and projects[-1].get("final") is True
    assert all(not p.get("final") for p in projects[:-1])
    for l in unit["lessons"]:
        bad = [s["type"] for s in l["steps"] if s["type"] in QUIZ]
        assert not bad, (l["id"], bad)

def main():
    changed = []
    for path in sorted(UNITS.glob("*-capstone.json")):
        unit = json.loads(path.read_text(encoding="utf-8"))
        new_u = rebuild(unit)
        assert_clean(new_u)
        path.write_text(json.dumps(new_u, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        changed.append(new_u["id"])
        st = new_u["lessons"][1]
        n_img = sum(((s.get("body") or {}).get("en") or "").count("![") for s in st["steps"])
        print(new_u["id"], "lessons=3", "starter_steps=", len(st["steps"]), "starter_imgs_en=", n_img)

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    n = 0
    for u in cat.get("units") or []:
        if u.get("id", "").endswith("-capstone") or u.get("kind") == "capstone":
            u["lessons"] = 3
            u["kind"] = "capstone"
            u["available"] = True
            if not (u.get("src") or "").startswith("/content/dev/"):
                u["src"] = f"/content/dev/{u['id']}.json"
            n += 1
    CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("catalog capstones updated", n)
    print("done", len(changed))

if __name__ == "__main__":
    main()
