"""The simulated school world Darsi Tiny's tools read: villages and roads, pupils and attendance, timetables, the library,
the glossary and the weather. Everything is made up and bilingual (English, Modern Standard Arabic). build_world(seed)
is deterministic; world.json (written by export.py) carries it to the phone, where src/tinylm/tools.ts reads it.

Some entities are held out: they exist in the world, so the tools know them, but no training request mentions them.
The held-out test set uses only those, so it measures copying names the model has never seen.
"""
from __future__ import annotations

import math
import random

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAYS = DAYS[:5]
WEATHER_DAYS = ["today", "tomorrow"] + DAYS
TODAY = "wednesday"  # the world's fixed "today", for the timetable

# (english, arabic). Made-up places; none is meant to be a real town.
VILLAGES = [
    ("Kafi", "كافي"), ("Dala", "دالا"), ("Riverbend", "منعطف النهر"), ("Tanko", "تانكو"), ("Mbari", "مباري"),
    ("Sabo", "سابو"), ("Palm Hill", "تل النخيل"), ("Stone Bridge", "الجسر الحجري"), ("Lafiya", "لافيا"),
    ("Zango", "زانغو"), ("Kuru", "كورو"), ("Nyota", "نيوتا"), ("Kisima", "كيسيما"), ("Bara", "بارا"),
    ("Green Valley", "الوادي الأخضر"), ("Oasis Springs", "عين الواحة"), ("Olive Grove", "بستان الزيتون"),
    ("Sandy Wells", "آبار الرمل"), ("Red Rock", "الصخرة الحمراء"), ("Two Rivers", "ملتقى النهرين"), ("Ganda", "غاندا"),
    ("Moyo", "مويو"), ("Tamaru", "تمارو"), ("Ewa", "إيوا"), ("Kibo", "كيبو"), ("Sunrise", "الشروق"),
    ("Fig Tree", "شجرة التين"), ("Salt Pan", "السبخة"), ("High Meadow", "المرج العالي"), ("Baobab Corner", "ركن الباوباب"),
    ("Dumi", "دومي"), ("Langi", "لانجي"), ("Iyani", "إياني"), ("Waterfall", "الشلال"), ("Ash Hill", "تل الرماد"),
    ("Cedar Ridge", "مرتفع الأرز"), ("Kambi", "كامبي"), ("Mazira", "مزيرة"), ("New Market", "السوق الجديد"),
    ("Eagle Rock", "صخرة النسر"),
]

FIRST_NAMES = [
    ("Amina", "أمينة"), ("Yusuf", "يوسف"), ("Fatima", "فاطمة"), ("Ibrahim", "إبراهيم"), ("Khadija", "خديجة"),
    ("Musa", "موسى"), ("Zainab", "زينب"), ("Ali", "علي"), ("Maryam", "مريم"), ("Omar", "عمر"), ("Hassan", "حسن"),
    ("Aisha", "عائشة"), ("Salma", "سلمى"), ("Karim", "كريم"), ("Layla", "ليلى"), ("Tariq", "طارق"), ("Nadia", "نادية"),
    ("Samir", "سمير"), ("Huda", "هدى"), ("Bilal", "بلال"), ("Rania", "رانيا"), ("Ahmed", "أحمد"), ("Noor", "نور"),
    ("Idris", "إدريس"), ("Hawa", "حواء"), ("Sani", "ساني"), ("Chidi", "تشيدي"), ("Ngozi", "نغوزي"), ("Tunde", "توندي"),
    ("Kemi", "كيمي"), ("Emeka", "إيميكا"), ("Ada", "آدا"), ("Kofi", "كوفي"), ("Ama", "آما"), ("Juma", "جمعة"),
    ("Neema", "نعمة"), ("Baraka", "بركة"), ("Zawadi", "زوادي"), ("Grace", "غريس"), ("John", "جون"), ("Mary", "ماري"),
    ("Peter", "بيتر"), ("Esther", "إستير"), ("Daniel", "دانيال"), ("Ruth", "روث"), ("Samuel", "صموئيل"), ("Joy", "جوي"),
    ("Adam", "آدم"),
]
LAST_NAMES = [
    ("Bello", "بيلو"), ("Okafor", "أوكافور"), ("Mensah", "مينسا"), ("Adeyemi", "أديمي"), ("Mwangi", "موانجي"),
    ("Osei", "أوسي"), ("Diallo", "ديالو"), ("Kamara", "كامارا"), ("Traore", "تراوري"), ("Abdullahi", "عبد اللهي"),
    ("Haruna", "هارونا"), ("Yakubu", "ياكوبو"), ("Nwosu", "نووسو"), ("Okeke", "أوكيكي"), ("Banda", "باندا"),
    ("Phiri", "فيري"), ("Otieno", "أوتيينو"), ("Achieng", "أتشينغ"), ("Kariuki", "كاريوكي"), ("Mahmoud", "محمود"),
    ("Saleh", "صالح"), ("Nasser", "ناصر"), ("Haddad", "حداد"), ("Khalil", "خليل"), ("Farouk", "فاروق"),
    ("Suleiman", "سليمان"), ("Rashid", "راشد"), ("Hamdan", "حمدان"), ("Darwish", "درويش"), ("Mansour", "منصور"),
    ("Amin", "أمين"), ("Taha", "طه"),
]

GRADES = [1, 2, 3, 4, 5, 6]
SECTIONS = [("A", "أ"), ("B", "ب"), ("C", "ج")]
ORDINALS_AR = {1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع", 5: "الخامس", 6: "السادس"}

SUBJECTS = {
    "maths": ("Maths", "الرياضيات"), "english": ("English", "اللغة الإنجليزية"), "arabic": ("Arabic", "اللغة العربية"),
    "science": ("Science", "العلوم"), "social": ("Social studies", "الدراسات الاجتماعية"), "art": ("Art", "الفنون"),
    "pe": ("PE", "التربية البدنية"), "computing": ("Computing", "الحاسوب"), "music": ("Music", "الموسيقى"),
}

SKIES = {
    "sunny": ("sunny", "مشمس"), "partly_cloudy": ("partly cloudy", "غائم جزئيًا"), "cloudy": ("cloudy", "غائم"),
    "light_rain": ("light rain", "مطر خفيف"), "heavy_rain": ("heavy rain", "مطر غزير"),
    "storms": ("thunderstorms", "عواصف رعدية"), "windy": ("windy", "رياح قوية"),
}

STATUS = {"present": ("present", "حضور"), "absent": ("absent", "غياب"), "late": ("late", "تأخير")}

# term (en, ar), definition (en, ar). Extra spellings people type go in ALIASES below.
GLOSSARY = [
    (("algorithm", "خوارزمية"), ("a list of steps that solves a problem", "قائمة خطوات تحل مشكلة")),
    (("dataset", "مجموعة بيانات"), ("a collection of examples used to train or test a model", "مجموعة أمثلة تُستخدم لتدريب نموذج أو اختباره")),
    (("neuron", "خلية عصبية"), ("a small unit that adds weighted inputs and passes the result on", "وحدة صغيرة تجمع المدخلات الموزونة وتمرر النتيجة")),
    (("machine learning", "تعلم الآلة"), ("teaching computers to find patterns from examples", "تعليم الحاسوب اكتشاف الأنماط من الأمثلة")),
    (("model", "نموذج"), ("a program that has learned patterns from data", "برنامج تعلّم أنماطًا من البيانات")),
    (("token", "رمز"), ("a small piece of text that a language model reads", "قطعة صغيرة من النص يقرؤها النموذج اللغوي")),
    (("prompt", "موجّه"), ("the text you give an AI model to tell it what to do", "النص الذي تعطيه لنموذج الذكاء الاصطناعي ليعرف ما يفعل")),
    (("bias", "تحيّز"), ("a pattern that treats some groups unfairly", "نمط يعامل بعض المجموعات بشكل غير عادل")),
    (("agent", "وكيل"), ("an AI program that plans steps and uses tools", "برنامج ذكاء اصطناعي يخطط للخطوات ويستخدم الأدوات")),
    (("sensor", "مستشعر"), ("a device that measures something like heat or light", "جهاز يقيس شيئًا مثل الحرارة أو الضوء")),
    (("actuator", "مشغّل"), ("a part that makes something move or switch on", "جزء يحرّك شيئًا أو يشغّله")),
    (("microcontroller", "متحكم دقيق"), ("a tiny computer on one chip that controls a device", "حاسوب صغير على شريحة واحدة يتحكم في جهاز")),
    (("Internet of Things", "إنترنت الأشياء"), ("everyday devices connected so they can share data", "أجهزة يومية متصلة لتتبادل البيانات")),
    (("battery", "بطارية"), ("a store of chemical energy that gives electric power", "مخزن للطاقة الكيميائية يعطي طاقة كهربائية")),
    (("circuit", "دائرة كهربائية"), ("a closed path that electric current flows around", "مسار مغلق يسري فيه التيار الكهربائي")),
    (("voltage", "الجهد الكهربائي"), ("the push that moves electric current", "الدفع الذي يحرّك التيار الكهربائي")),
    (("password", "كلمة المرور"), ("a secret word or phrase that protects an account", "كلمة أو عبارة سرية تحمي الحساب")),
    (("phishing", "التصيّد الاحتيالي"), ("a fake message that tries to steal your details", "رسالة مزيفة تحاول سرقة بياناتك")),
    (("malware", "البرمجيات الخبيثة"), ("software made to harm a device or steal data", "برامج صُنعت لإيذاء الجهاز أو سرقة البيانات")),
    (("encryption", "التشفير"), ("scrambling data so only someone with the key can read it", "خلط البيانات بحيث لا يقرؤها إلا من يملك المفتاح")),
    (("firewall", "جدار الحماية"), ("a filter that blocks unwanted network traffic", "مرشح يمنع حركة الشبكة غير المرغوبة")),
    (("two-step verification", "التحقق بخطوتين"), ("a second check, like a code, after your password", "فحص ثانٍ، مثل رمز، بعد كلمة المرور")),
    (("backup", "النسخة الاحتياطية"), ("a spare copy of your files kept somewhere safe", "نسخة إضافية من ملفاتك محفوظة في مكان آمن")),
    (("software update", "تحديث البرامج"), ("a new version of software that fixes problems", "إصدار جديد من البرنامج يصلح المشكلات")),
    (("photosynthesis", "التمثيل الضوئي"), ("how plants make food from light, water and air", "طريقة صنع النبات غذاءه من الضوء والماء والهواء")),
    (("evaporation", "التبخر"), ("when a liquid turns into a gas", "تحوّل السائل إلى غاز")),
    (("condensation", "التكاثف"), ("when a gas cools and turns into a liquid", "تحوّل الغاز إلى سائل عندما يبرد")),
    (("fraction", "الكسر"), ("a part of a whole, like one half", "جزء من كل، مثل النصف")),
    (("percentage", "النسبة المئوية"), ("a part out of one hundred", "جزء من مئة")),
    (("average", "المتوسط"), ("the total divided by how many numbers there are", "المجموع مقسومًا على عدد الأرقام")),
    (("perimeter", "المحيط"), ("the distance around the edge of a shape", "طول الحدود حول الشكل")),
    (("area", "المساحة"), ("the amount of space a flat shape covers", "مقدار السطح الذي يغطيه الشكل المسطح")),
    (("gravity", "الجاذبية"), ("the force that pulls things towards the ground", "القوة التي تشد الأشياء نحو الأرض")),
    (("energy", "الطاقة"), ("the ability to do work or cause change", "القدرة على بذل شغل أو إحداث تغيير")),
    (("solar panel", "اللوح الشمسي"), ("a panel that turns sunlight into electricity", "لوح يحوّل ضوء الشمس إلى كهرباء")),
    (("ecosystem", "النظام البيئي"), ("living things and their surroundings working together", "الكائنات الحية وبيئتها تعمل معًا")),
    (("habitat", "الموطن"), ("the natural home of an animal or plant", "المكان الطبيعي الذي يعيش فيه حيوان أو نبات")),
    (("vaccine", "اللقاح"), ("a medicine that trains the body to fight a disease", "دواء يدرّب الجسم على مقاومة مرض")),
    (("nutrient", "العنصر الغذائي"), ("a substance in food that the body needs", "مادة في الطعام يحتاجها الجسم")),
    (("climate", "المناخ"), ("the usual weather of a place over many years", "الطقس المعتاد لمكان ما على مدى سنوات")),
    (("erosion", "التعرية"), ("when wind or water slowly wears away land", "تآكل الأرض ببطء بفعل الرياح أو الماء")),
    (("democracy", "الديمقراطية"), ("a system where people choose their leaders by voting", "نظام يختار فيه الناس قادتهم بالتصويت")),
    (("noun", "الاسم"), ("a word for a person, place or thing", "كلمة تدل على شخص أو مكان أو شيء")),
    (("verb", "الفعل"), ("a word for an action", "كلمة تدل على حدث أو عمل")),
    (("paragraph", "الفقرة"), ("a group of sentences about one idea", "مجموعة جمل عن فكرة واحدة")),
    (("pixel", "البكسل"), ("one tiny dot of colour in a picture", "نقطة لون صغيرة في الصورة")),
    (("binary", "النظام الثنائي"), ("counting with only 0 and 1", "العد باستخدام 0 و1 فقط")),
    (("network", "الشبكة"), ("devices connected so they can share data", "أجهزة متصلة لتتبادل البيانات")),
    (("cloud storage", "التخزين السحابي"), ("keeping files on internet servers instead of your device", "حفظ الملفات على خوادم الإنترنت بدل جهازك")),
    (("privacy", "الخصوصية"), ("your right to control who sees your information", "حقك في التحكم بمن يرى معلوماتك")),
    (("spreadsheet", "جدول البيانات"), ("a grid of cells for numbers and sums", "شبكة خلايا للأرقام والحسابات")),
    (("robot", "الروبوت"), ("a machine that senses, decides and moves by itself", "آلة تستشعر وتقرر وتتحرك بنفسها")),
]

# Topic (en, ar) → books ((title en, title ar), shelf). Topics with no books make the tool answer with an empty list.
LIBRARY = [
    (("solar energy", "الطاقة الشمسية"), [(("Power from the Sun", "طاقة من الشمس"), "C2"), (("Build a Solar Lamp", "اصنع مصباحًا شمسيًا"), "C3")]),
    (("fractions", "الكسور"), [(("Fractions Made Easy", "الكسور بسهولة"), "A1")]),
    (("the water cycle", "دورة الماء"), [(("Where Rain Comes From", "من أين يأتي المطر"), "B2")]),
    (("robots", "الروبوتات"), [(("My First Robot", "روبوتي الأول"), "D1"), (("Robots at Work", "روبوتات في العمل"), "D1")]),
    (("passwords", "كلمات المرور"), [(("Safe Online", "آمن على الإنترنت"), "D3")]),
    (("plants", "النباتات"), [(("How Seeds Grow", "كيف تنمو البذور"), "B1"), (("The School Garden", "حديقة المدرسة"), "B1")]),
    (("the human body", "جسم الإنسان"), [(("Inside Your Body", "داخل جسمك"), "B4")]),
    (("electricity", "الكهرباء"), [(("Circuits for Beginners", "الدوائر للمبتدئين"), "C1")]),
    (("coding", "البرمجة"), [(("Coding with Blocks", "البرمجة بالكتل"), "D2"), (("First Steps in Python", "خطوات أولى في بايثون"), "D2")]),
    (("artificial intelligence", "الذكاء الاصطناعي"), [(("Thinking Machines", "آلات تفكر"), "D4")]),
    (("maps", "الخرائط"), [(("Reading Maps", "قراءة الخرائط"), "E1")]),
    (("farming", "الزراعة"), [(("Farming Through the Year", "الزراعة على مدار العام"), "E2")]),
    (("animals", "الحيوانات"), [(("Animals of the Savanna", "حيوانات السافانا"), "B3"), (("Birds Near Us", "طيور من حولنا"), "B3")]),
    (("weather", "الطقس"), [(("Clouds and Storms", "الغيوم والعواصف"), "B2")]),
    (("geometry", "الهندسة"), [(("Shapes Around Us", "أشكال من حولنا"), "A2")]),
    (("multiplication", "الضرب"), [(("Times Tables Fun", "متعة جدول الضرب"), "A1")]),
    (("stories", "القصص"), [(("Tales from the Village", "حكايات من القرية"), "F1"), (("The Clever Tortoise", "السلحفاة الذكية"), "F1")]),
    (("poetry", "الشعر"), [(("Poems for Young Readers", "قصائد للقراء الصغار"), "F2")]),
    (("grammar", "القواعد"), [(("Grammar Step by Step", "القواعد خطوة بخطوة"), "F3")]),
    (("history", "التاريخ"), [(("Long Ago", "منذ زمن بعيد"), "E3")]),
    (("health", "الصحة"), [(("Healthy Habits", "عادات صحية"), "B4")]),
    (("recycling", "إعادة التدوير"), [(("Waste Into Treasure", "من النفايات إلى كنز"), "C4")]),
    (("space", "الفضاء"), [(("Stars and Planets", "النجوم والكواكب"), "C5")]),
    (("sensors", "المستشعرات"), [(("Measuring the World", "قياس العالم"), "D5")]),
    (("internet safety", "الأمان على الإنترنت"), [(("Think Before You Click", "فكّر قبل أن تنقر"), "D3")]),
    (("music", "الموسيقى"), [(("Drums and Songs", "الطبول والأغاني"), "F4")]),
    (("art", "الفن"), [(("Draw Anything", "ارسم أي شيء"), "F5")]),
    (("statistics", "الإحصاء"), [(("Counting and Charts", "العد والرسوم البيانية"), "A3")]),
    (("water", "المياه"), [(("Clean Water for All", "مياه نظيفة للجميع"), "C4")]),
    (("magnets", "المغناطيس"), [(("The Magic of Magnets", "سحر المغناطيس"), "C1")]),
    # No books on these.
    (("volcanoes", "البراكين"), []), (("dinosaurs", "الديناصورات"), []), (("chess", "الشطرنج"), []),
    (("cooking", "الطبخ"), []), (("football", "كرة القدم"), []), (("oceans", "المحيطات"), []),
    (("photography", "التصوير"), []), (("languages", "اللغات"), []), (("money", "المال"), []), (("cars", "السيارات"), []),
]

UNITS = {
    # unit: (dimension, factor to the base unit)
    "km": ("length", 1000.0), "mi": ("length", 1609.344), "m": ("length", 1.0), "ft": ("length", 0.3048),
    "cm": ("length", 0.01), "in": ("length", 0.0254), "kg": ("mass", 1000.0), "lb": ("mass", 453.59237),
    "g": ("mass", 1.0), "oz": ("mass", 28.349523125), "l": ("volume", 1.0), "gal": ("volume", 3.785411784),
    "c": ("temperature", 1.0), "f": ("temperature", 1.0),
}


def normalize(s: str) -> str:
    """Lookup key: lower case, no Arabic diacritics or tatweel, one form of alef, yaa and taa marbuta, no leading "the "
    or "ال", single spaces. src/tinylm/tools.ts has the same function; keep them in step."""
    s = s.strip().lower()
    out = []
    for ch in s:
        o = ord(ch)
        if 0x064B <= o <= 0x065F or o == 0x0670 or o == 0x0640:
            continue
        if ch in "أإآٱ":
            ch = "ا"
        elif ch == "ى":
            ch = "ي"
        elif ch == "ة":
            ch = "ه"
        elif ch in "-_":
            ch = " "
        elif ch in ".,!?؟،؛:;\"'«»()":
            continue
        out.append(ch)
    words = "".join(out).split()
    words = [w[2:] if w.startswith("ال") and len(w) > 3 else w for w in words]
    if words and words[0] == "the":
        words = words[1:]
    return " ".join(words)


def build_world(seed: int = 1) -> dict:
    rnd = random.Random(seed)

    # Villages on a 60 km square, each joined to its nearest neighbours; road length is rounded and at least 2 km.
    villages = []
    for i, (en, ar) in enumerate(VILLAGES):
        villages.append({"id": i, "en": en, "ar": ar, "x": rnd.uniform(0, 60), "y": rnd.uniform(0, 60)})
    roads: dict[tuple[int, int], int] = {}
    for a in villages:
        near = sorted((math.dist((a["x"], a["y"]), (b["x"], b["y"])), b["id"]) for b in villages if b["id"] != a["id"])
        for d, bid in near[:5]:
            key = (min(a["id"], bid), max(a["id"], bid))
            roads[key] = max(2, round(d * 1.2))
    # Join any separate groups with their shortest link, so every pair has a route.
    def groups():
        parent = list(range(len(villages)))
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for a, b in roads:
            parent[find(a)] = find(b)
        return find
    while True:
        find = groups()
        comps = {find(v["id"]) for v in villages}
        if len(comps) == 1:
            break
        best = None
        for a in villages:
            for b in villages:
                if find(a["id"]) != find(b["id"]):
                    d = math.dist((a["x"], a["y"]), (b["x"], b["y"]))
                    if best is None or d < best[0]:
                        best = (d, a["id"], b["id"])
        d, a, b = best
        roads[(min(a, b), max(a, b))] = max(2, round(d * 1.2))

    held_villages = set(rnd.sample(range(len(villages)), 8))

    # Classes 1A–6C and their timetables: five lessons a day, Monday to Friday.
    classes = [f"{g}{s}" for g in GRADES for s, _ in SECTIONS]
    subj = list(SUBJECTS)
    timetable = {}
    for c in classes:
        timetable[c] = {d: [rnd.choice(subj) for _ in range(5)] for d in WEEKDAYS}

    # Pupils: unique first + last names, each in a class, with today's status, this week (5 days) and this month (20).
    pairs = [(f, l) for f in range(len(FIRST_NAMES)) for l in range(len(LAST_NAMES))]
    rnd.shuffle(pairs)
    pupils = []
    for i, (f, l) in enumerate(pairs[:240]):
        week = [rnd.choices(["present", "absent", "late"], [0.82, 0.1, 0.08])[0] for _ in range(5)]
        month = week + [rnd.choices(["present", "absent", "late"], [0.82, 0.1, 0.08])[0] for _ in range(15)]
        pupils.append({
            "id": i, "en": f"{FIRST_NAMES[f][0]} {LAST_NAMES[l][0]}", "ar": f"{FIRST_NAMES[f][1]} {LAST_NAMES[l][1]}",
            "class": rnd.choice(classes), "today": week[2],
            "week": {k: week.count(k) for k in ("present", "absent", "late")},
            "month": {k: month.count(k) for k in ("present", "absent", "late")},
        })
    held_pupils = set(rnd.sample(range(len(pupils)), len(pupils) // 5))

    # Weather for every village and day: a sky, highs and lows in °C and a chance of rain.
    weather = {}
    sky_keys = list(SKIES)
    for v in villages:
        weather[v["id"]] = {}
        for d in WEATHER_DAYS:
            sky = rnd.choices(sky_keys, [0.3, 0.2, 0.15, 0.15, 0.07, 0.06, 0.07])[0]
            high = rnd.randint(24, 38)
            low = high - rnd.randint(6, 13)
            rain = {"sunny": rnd.randint(0, 10), "partly_cloudy": rnd.randint(5, 25), "cloudy": rnd.randint(15, 40),
                    "light_rain": rnd.randint(50, 75), "heavy_rain": rnd.randint(75, 95), "storms": rnd.randint(70, 95),
                    "windy": rnd.randint(5, 30)}[sky]
            weather[v["id"]][d] = {"sky": sky, "high": high, "low": low, "rain": rain}

    glossary = [{"id": i, "en": t[0], "ar": t[1], "def_en": d[0], "def_ar": d[1]} for i, (t, d) in enumerate(GLOSSARY)]
    held_terms = set(rnd.sample(range(len(glossary)), len(glossary) // 5))

    library, books = [], []
    for i, ((ten, tar), bs) in enumerate(LIBRARY):
        ids = []
        for (ben, bar), shelf in bs:
            ids.append(len(books))
            books.append({"id": len(books), "en": ben, "ar": bar, "shelf": shelf})
        library.append({"id": i, "en": ten, "ar": tar, "books": ids})
    held_topics = set(rnd.sample(range(len(library)), len(library) // 5))

    return {
        "version": 1,
        "seed": seed,
        "today": TODAY,
        "villages": [{"id": v["id"], "en": v["en"], "ar": v["ar"]} for v in villages],
        "roads": [[a, b, km] for (a, b), km in sorted(roads.items())],
        "classes": classes,
        "subjects": {k: list(v) for k, v in SUBJECTS.items()},
        "timetable": timetable,
        "pupils": pupils,
        "weather": {str(k): v for k, v in weather.items()},
        "skies": {k: list(v) for k, v in SKIES.items()},
        "status": {k: list(v) for k, v in STATUS.items()},
        "glossary": glossary,
        "topics": library,
        "books": books,
        "units": {k: [d, f] for k, (d, f) in UNITS.items()},
        # Which entities only the held-out test set may mention (not used by the tools).
        "heldOut": {
            "villages": sorted(held_villages), "pupils": sorted(held_pupils),
            "glossary": sorted(held_terms), "topics": sorted(held_topics),
        },
    }
