"""Made-up entities for training only: villages, pupils, words, topics, messages, reminders and recipients that exist
nowhere but in one training conversation, with plausible tool results. Half of the training requests use them, so the
model can't memorise the names of the real (shipped) world and has to learn to copy what it reads. The test sets
never use them, and world.json never contains them.

With `pieces` (round 4 training only), some made-up words are random runs of the tokenizer's own word pieces, and some messages and
reminders get a word swapped for one. v3 garbled held-out names whose pieces training never showed it ("tidy" is
"ti"+"dy"; 230 of the 3,000 pieces never appeared), so the drills make every piece something it has copied.
"""
from __future__ import annotations

import json
import os
import random
import re

from world import SKIES, STATUS

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "phrases.json"), encoding="utf-8") as _f:
    PHRASES = json.load(_f)
_STRIP = ".,;:!?؟،()’'"
_HERE = os.path.dirname(os.path.abspath(__file__))
_LETTERS = {"en": re.compile(r"[A-Za-z]+"), "ar": re.compile(r"[ء-غف-ْٰ]+")}


def word_pieces() -> dict[str, list[str]]:
    """The tokenizer's pieces that are letters only, per script (tokenizer.json, committed beside this file)."""
    from bpe import Tokenizer
    tok = Tokenizer.load(os.path.join(_HERE, "tokenizer.json"))
    out = {"en": [], "ar": []}
    for i in range(tok.vocab):
        p = tok.decode([i])
        for lang, rx in _LETTERS.items():
            if rx.fullmatch(p):
                out[lang].append(p)
    return out

EN_ON = ["b", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "y", "z", "ch", "sh", "mb", "nd", "ng", "kw", "j", "h"]
EN_V = ["a", "e", "i", "o", "u", "a", "o", "i"]
AR_C = list("بتثجحخدذرزسشصطعغفقكلمنهوي")
AR_V = ["ا", "و", "ي", "", "", ""]
EN_PLACE = ["Hill", "Wells", "Bridge", "Valley", "Market", "Springs", "Ridge", "Falls", "Creek", "Gardens"]
EN_PRE = ["New", "Upper", "Lower", "Old", "East", "West"]
AR_PLACE = ["تل", "عين", "وادي", "بئر", "سوق", "جسر", "مرج", "رأس"]

EN_ADJ = ["digital", "solar", "smart", "open", "binary", "local", "safe", "quick", "shared", "hidden", "wireless", "public", "careful", "simple", "strong",
          "daily", "outdoor", "clean", "fair", "secret"]
EN_NOUN = ["signal", "circuit", "network", "sensor", "pattern", "model", "message", "battery", "filter", "code", "garden", "habit", "lesson", "chart",
           "switch", "map", "planet", "machine", "tool", "record", "story", "rule", "tank", "panel", "key"]
EN_DOES = ["stores", "measures", "sends", "protects", "counts", "sorts", "switches on", "checks", "shares", "explains", "cleans", "grows", "tracks", "blocks"]
EN_WHAT = ["data", "heat", "light", "messages", "accounts", "numbers", "files", "water", "plants", "words", "signals", "lessons", "devices", "steps"]
EN_THING = ["a tool", "a way", "a device", "a list", "a rule", "a part", "a method", "a system", "a step", "a group"]
AR_NOUN = ["أداة", "طريقة", "جهاز", "قائمة", "قاعدة", "جزء", "نظام", "خطوة", "مجموعة", "وسيلة"]
AR_FOR = ["حفظ البيانات", "قياس الحرارة", "إرسال الرسائل", "حماية الحسابات", "عدّ الأشياء", "ترتيب الملفات", "تشغيل الأجهزة", "فهم النصوص",
          "تنظيف الماء", "زراعة النباتات", "تتبع الخطوات", "منع الإشارات", "شرح الدروس", "مشاركة الصور"]
AR_TERM_N = ["الإشارة", "الدائرة", "الشبكة", "النمط", "الرسالة", "البطارية", "المرشح", "الحديقة", "العادة", "الخريطة", "الآلة", "القاعدة", "اللوحة"]
AR_TERM_A = ["الرقمية", "الشمسية", "الذكية", "المفتوحة", "المحلية", "الآمنة", "السريعة", "المشتركة", "الخفية", "اللاسلكية", "العامة", "البسيطة", "اليومية"]

EN_SUBJ = ["The meeting", "The trip", "Sports day", "The library", "Lunch", "The exam", "The bus", "Parents' evening", "The science fair", "The garden club",
           "The coding club", "The football match", "The reading test", "The school play", "The health check", "Assembly"]
EN_PRED = ["is moved to {day}", "starts at {time}", "is cancelled", "ends early on {day}", "is in room {n}", "needs {n} more helpers",
           "will be outside on {day}", "is on {day} at {time}", "is put off until {day}", "will be short this week"]
EN_PLEASE = ["bring", "send", "return", "check", "sign", "prepare", "collect", "read"]
EN_OBJ = ["the permission form", "your science book", "the class list", "two pencils", "the report", "a water bottle", "the map", "the timetable", "your library card"]
AR_SUBJ = ["الاجتماع", "الرحلة", "اليوم الرياضي", "الامتحان", "الغداء", "معرض العلوم", "نادي الحديقة", "نادي البرمجة", "مباراة كرة القدم", "اختبار القراءة",
           "الحفل المدرسي", "الفحص الصحي", "الطابور الصباحي"]
AR_PRED = ["موعد {s} يوم {day}.", "تأجّل موعد {s} إلى يوم {day}.", "تم إلغاء {s}.", "يبدأ {s} الساعة {time}.", "{s} في الغرفة {n}.", "{s} يوم {day} الساعة {time}.",
           "نحتاج إلى {n} متطوعين من أجل {s}.", "تغيّر مكان {s} هذا الأسبوع."]
AR_PLEASE = ["إحضار", "إرسال", "إعادة", "مراجعة", "توقيع", "تجهيز", "جمع", "قراءة"]
AR_OBJ = ["استمارة الموافقة", "كتاب العلوم", "قائمة الصف", "قلمين", "التقرير", "زجاجة ماء", "الخريطة", "الجدول", "بطاقة المكتبة"]

EN_VERB = ["collect", "check", "print", "clean", "bring", "mark", "send", "order", "fix", "count", "call", "prepare", "return", "open", "close", "sort", "test",
           "plant", "water", "charge", "label", "move", "repair", "share"]
EN_THINGS = ["the homework", "the register", "the projector", "the tablets", "the science books", "the exam papers", "the garden", "the library cards",
             "the football", "the first aid box", "the water tank", "the solar panel", "the art materials", "the laptop", "the report", "the chairs",
             "the map", "the rain gauge", "the seeds", "the posters"]
AR_VN = ["جمع", "فحص", "طباعة", "تنظيف", "إحضار", "تصحيح", "إرسال", "طلب", "إصلاح", "عدّ", "تجهيز", "إعادة", "فتح", "إغلاق", "ترتيب", "تجربة", "زراعة",
         "سقي", "شحن", "نقل"]
AR_THINGS = ["الواجبات", "السجل", "جهاز العرض", "الأجهزة اللوحية", "كتب العلوم", "أوراق الاختبار", "الحديقة", "بطاقات المكتبة", "الكرة", "صندوق الإسعافات",
             "خزان الماء", "اللوح الشمسي", "أدوات الفن", "الحاسوب المحمول", "التقرير", "الكراسي", "الخريطة", "مقياس المطر", "البذور", "الملصقات"]
EN_ROLE = ["the bursar", "the cook", "the driver", "the IT teacher", "the art teacher", "the science teacher", "the maths teacher", "the head of year 4",
           "the school secretary", "the gardener"]
AR_ROLE = ["أمين الصندوق", "الطباخ", "السائق", "معلم الحاسوب", "معلمة الفنون", "معلم العلوم", "معلمة الرياضيات", "منسق الصف الرابع", "سكرتيرة المدرسة", "البستاني"]
EN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
AR_DAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]


def _kept(fn):
    """With `kept` (round 4), retry an entity until the whole of it (after suffixes and place words are added) contains
    no held-out name. Round 3 didn't, and 58 of its 612,000 training calls named a held-out reminder or word."""
    def wrapped(self, *a, **k):
        if not self.kept:
            return fn(self, *a, **k)
        for _ in range(50):
            x = fn(self, *a, **k)
            if self.keep(x[0] if isinstance(x, tuple) else x):
                return x
        raise RuntimeError(f"{fn.__name__}: no entity free of held-out names")
    return wrapped


class Synth:
    def __init__(self, rnd: random.Random, banned: set[str] = frozenset(), normalize=None, pieces=False, kept=False,
                 drill=0.40, swap=0.35):
        """`banned`: normalized words and names the held-out test sets use; course sentences and piece words containing
        one are left out, so made-up training entities never leak them. `drill`/`swap`: how often a made-up word is a
        piece word, and how often a message or reminder has a word swapped for one (round 4 used 0.40/0.35; round 5 far
        less, because v4 over-taught copying and garbled nothing but learned that any word can be a name)."""
        self.r = rnd
        self.keep = lambda t: not any(b in normalize(t) for b in banned) if banned else True  # noqa: E731
        self.phrases = {lang: [t for t in PHRASES[lang] if self.keep(t)] for lang in ("en", "ar")}
        self.pieces = word_pieces() if pieces else None
        self.kept = kept
        self.drill_rate, self.swap_rate = drill, swap

    # ---- copy drills: words made of random word pieces ----
    def piece_word(self, lang: str) -> str:
        R = self.r
        for _ in range(20):
            w = "".join(R.choice(self.pieces[lang]) for _ in range(R.choice([1, 2, 2, 3])))
            if len(w) >= 2 and self.keep(w):
                return w
        return "".join(R.choice(EN_ON) + R.choice(EN_V) for _ in range(2)) if lang == "en" else R.choice(AR_C) + R.choice(AR_C)

    def swap_words(self, text: str, lang: str) -> str:
        """`text` with one or two of its words replaced by piece words (capitalised like the word they replace)."""
        words = text.split(" ")
        spots = [i for i, w in enumerate(words) if len(w.strip(_STRIP)) >= 2 and w.strip(_STRIP).isalpha()]
        for i in self.r.sample(spots, min(len(spots), self.r.choice([1, 1, 2]))):
            core = words[i].strip(_STRIP)
            new = self.piece_word(lang)
            if lang == "en":
                new = new.capitalize() if core[0].isupper() else new.lower()
            words[i] = words[i].replace(core, new, 1)
        return " ".join(words)

    def drill(self, text: str, lang: str) -> str:
        return self.swap_words(text, lang) if self.pieces and self.r.random() < self.swap_rate else text

    # ---- real words from the courses (phrases.json) ----
    def sentence(self, lang: str) -> str:
        return self.r.choice(self.phrases[lang])

    def span(self, lang: str, lo: int, hi: int) -> str:
        """lo–hi consecutive words of a course sentence, without punctuation at the ends."""
        for _ in range(20):
            words = [w.strip(_STRIP) for w in self.sentence(lang).split()]
            words = [w for w in words if w]
            if len(words) >= lo:
                n = self.r.randint(lo, min(hi, len(words)))
                i = self.r.randint(0, len(words) - n)
                return " ".join(words[i:i + n])
        return self.en_word() if lang == "en" else self.ar_word()

    # ---- words ----
    def en_word(self, syl=(2, 3)) -> str:
        R = self.r
        if self.pieces and R.random() < self.drill_rate:
            return self.piece_word("en")
        return "".join(R.choice(EN_ON) + R.choice(EN_V) for _ in range(R.randint(*syl))) + (R.choice(["", "", "n", "r", "l", "m"]))

    def ar_word(self, syl=(2, 3)) -> str:
        R = self.r
        if self.pieces and R.random() < self.drill_rate:
            return self.piece_word("ar")
        w = "".join(R.choice(AR_C) + R.choice(AR_V) for _ in range(R.randint(*syl)))
        return w + R.choice(AR_C + ["", ""])

    # ---- entities ----
    @_kept
    def village(self, lang: str) -> str:
        R = self.r
        if R.random() < 0.2:
            w = self.span(lang, 1, 2)
            return (w[0].upper() + w[1:]) if lang == "en" else w
        if lang == "en":
            w = self.en_word().capitalize()
            x = R.random()
            return f"{w} {R.choice(EN_PLACE)}" if x < 0.25 else f"{R.choice(EN_PRE)} {w}" if x < 0.35 else w
        w = self.ar_word()
        return f"{R.choice(AR_PLACE)} {w}" if R.random() < 0.35 else w

    @_kept
    def person(self, lang: str, first_names) -> str:
        R = self.r
        if lang == "en":
            f = R.choice(first_names)[0] if R.random() < 0.5 else self.en_word().capitalize()
            return f"{f} {self.en_word().capitalize()}"
        f = R.choice(first_names)[1] if R.random() < 0.5 else self.ar_word()
        return f"{f} {self.ar_word()}"

    @_kept
    def term(self, lang: str) -> tuple[str, str]:
        """(term, definition)."""
        R = self.r
        if R.random() < 0.5:
            t = self.span(lang, 1, 3)
            return (t.lower() if lang == "en" and R.random() < 0.7 else t), self.span(lang, 4, 10)
        if lang == "en":
            t = self.en_word() if R.random() < 0.4 else f"{R.choice(EN_ADJ)} {R.choice(EN_NOUN)}"
            return t, f"{R.choice(EN_THING)} that {R.choice(EN_DOES)} {R.choice(EN_WHAT)}"
        t = self.ar_word() if R.random() < 0.4 else f"{R.choice(AR_TERM_N)} {R.choice(AR_TERM_A)}"
        return t, f"{R.choice(AR_NOUN)} تساعد على {R.choice(AR_FOR)}"

    @_kept
    def topic(self, lang: str) -> tuple[str, list]:
        """(topic, books)."""
        R = self.r
        books = []
        for _ in range(R.choice([0, 1, 1, 2, 2, 3])):
            if R.random() < 0.5:
                title = self.span(lang, 2, 5)
                books.append({"title": title[0].upper() + title[1:], "shelf": R.choice("ABCDEF") + str(R.randint(1, 9))})
                continue
            if lang == "en":
                title = R.choice([f"The {R.choice(EN_ADJ).capitalize()} {R.choice(EN_NOUN).capitalize()}", f"{R.choice(EN_NOUN).capitalize()}s for Beginners",
                                  f"All About {self.en_word().capitalize()}", f"My {R.choice(EN_NOUN).capitalize()} Book"])
            else:
                title = R.choice([f"{R.choice(AR_TERM_N)} {R.choice(AR_TERM_A)}", f"كل شيء عن {self.ar_word()}", f"كتاب {R.choice(AR_TERM_N)} للمبتدئين"])
            books.append({"title": title, "shelf": R.choice("ABCDEF") + str(R.randint(1, 9))})
        if R.random() < 0.5:
            t = self.span(lang, 1, 3)
            t = t.lower() if lang == "en" else t
        elif lang == "en":
            t = self.en_word() + R.choice(["s", ""]) if R.random() < 0.4 else f"{R.choice(EN_ADJ)} {R.choice(EN_NOUN)}s"
        else:
            t = self.ar_word() if R.random() < 0.4 else f"{R.choice(AR_TERM_N)} {R.choice(AR_TERM_A)}"
        return t, books

    @_kept
    def message(self, lang: str) -> str:
        return self.drill(self._message(lang), lang)

    def _message(self, lang: str) -> str:
        R = self.r
        day, time, n = R.randrange(6), f"{R.randint(7, 17)}:{R.choice(['00', '15', '30', '45'])}", R.randint(2, 12)
        if R.random() < 0.5:
            return self.sentence(lang)
        if lang == "en":
            if R.random() < 0.7:
                return f"{R.choice(EN_SUBJ)} {R.choice(EN_PRED).format(day=EN_DAYS[day], time=time, n=n)}."
            return f"Please {R.choice(EN_PLEASE)} {R.choice(EN_OBJ)} by {EN_DAYS[day]}."
        if R.random() < 0.7:
            return R.choice(AR_PRED).format(s=R.choice(AR_SUBJ), day=AR_DAYS[day], time=time, n=n)
        return f"يرجى {R.choice(AR_PLEASE)} {R.choice(AR_OBJ)} قبل يوم {AR_DAYS[day]}."

    @_kept
    def reminder(self, lang: str) -> str:
        return self.drill(self._reminder(lang), lang)

    def _reminder(self, lang: str) -> str:
        R = self.r
        if R.random() < 0.4:
            t = self.span(lang, 2, 6)
            return t[0].lower() + t[1:] if lang == "en" else t
        if lang == "en":
            t = f"{R.choice(EN_VERB)} {R.choice(EN_THINGS)}"
            x = R.random()
            return t + (f" for {R.randint(1, 6)}{R.choice('ABC')}" if x < 0.15 else f" in room {R.randint(1, 20)}" if x < 0.25 else "")
        t = f"{R.choice(AR_VN)} {R.choice(AR_THINGS)}"
        x = R.random()
        return t + (f" في الغرفة {R.randint(1, 20)}" if x < 0.2 else "")

    @_kept
    def recipient(self, lang: str) -> str:
        R = self.r
        x = R.random()
        if lang == "en":
            if x < 0.5:
                return f"{R.choice(['Mr', 'Mrs', 'Ms'])} {self.en_word().capitalize()}"
            return R.choice(EN_ROLE) if x < 0.8 else f"{self.en_word().capitalize()} {self.en_word().capitalize()}"
        if x < 0.5:
            return f"{R.choice(['الأستاذ', 'الأستاذة'])} {self.ar_word()}"
        return R.choice(AR_ROLE) if x < 0.8 else f"{self.ar_word()} {self.ar_word()}"

    # ---- results for made-up entities ----
    def weather(self, L: int):
        R = self.r
        sky = R.choice(list(SKIES))
        high = R.randint(18, 42)
        return {"sky": SKIES[sky][L], "high": high, "low": high - R.randint(5, 14), "rain": R.randint(0, 99)}

    def route(self, lang: str):
        return {"km": self.r.randint(3, 95), "via": [self.village(lang) for _ in range(self.r.choice([0, 0, 1, 1, 2, 2, 3, 4]))]}

    def attendance(self, rng: str, L: int):
        R = self.r
        if rng == "today":
            return {"status": STATUS[R.choices(list(STATUS), [0.8, 0.12, 0.08])[0]][L]}
        n = 5 if rng == "week" else 20
        a = R.randint(0, n // 4)
        l = R.randint(0, n // 5)
        return {"present": n - a - l, "absent": a, "late": l}
