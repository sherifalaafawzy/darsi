# Arabic lingo: one word per concept

Two registers are used in Darsi:

- **Egyptian Arabic (ar-EG)** is the narration (the voice in the videos) and the on-screen text of the videos, which the narrator speaks. It must sound like an Egyptian teacher or pupil.
- **Modern Standard Arabic, friendly (MSA)** is the course text: the reading, the steps, the buttons, the checkpoints. It is clear and warm, not formal.

Both registers use the same word for the same concept. A learner who hears "الفصل" in the video must read "الفصل" in the course, not "الصف".

## Rules for the narration (ar-EG)

1. **Every adjective has its noun.** Never say a bare adjective ("قوي!"). Say "كلمة سر قوية", "ده باسورد قوي", "خطة قوية". Gender and number must agree: قوي / قوية / أقوياء, ده / دي / دول.
2. **Spoken forms, not written ones.** Use: لو (not إذا), ممكن (not يمكن), مش (not لا), عشان (not لأن), إزاي (not كيف), فيه (not يوجد), بتاع (not الخاص بـ), أوي / جدًا (not "جدًا" alone), أكتر (not أكثر), حداشر / تلاتاشر / أربعتاشر (not إحدى عشر), وبعدين (not ثم), بس (not لكن / غير أن). Avoid وإلا, حيث, إذ, بناءً على.
3. **Numbers are read the Egyptian way:** خمس دقايق, تلتاشر, ميت, تلتمية, بتاع ١٢. Keep "و" between tens and units (خمسة وأربعين, not خمسة أربعين), and say the number exactly as the English and the screen show it.
4. **No mixed register in one sentence.** If a sentence starts in Egyptian, it stays Egyptian.

## Rules for the course text (MSA, friendly)

1. Use Standard Arabic words, but keep it short and warm (you, we), not a textbook.
2. Technical English terms stay in English when Arabic would be a mouthful (token, prompt, API). Put the Arabic meaning once, the first time it appears, in the glossary below.
3. No "·" as a separator (use "،" or "-").
4. Feminine and masculine agreement is checked against the noun, not the English.

## The glossary (one meaning per word)

| Concept | Use | Do not use |
|---|---|---|
| School class (a group of pupils) | **فصل** | صف (only for a table row) |
| Row in a table | **صف** | فصل |
| School desk (a pupil's) | **التختة** (ar-EG narration; the normal Egyptian word), **المقعد** (MSA course text) | المكتب (a teacher's or office desk), التخت (a bed), الترابيزة |
| Teacher's or office desk | **المكتب** | التختة |
| LED | **لمبة LED** or **الليد** (ar-EG; both are normal Egyptian), **مصباح LED** (MSA) | الصمام الضوئي (a photodiode) |
| School grade (a year group) | **الصف** with its number (الصف الخامس), as Egyptian schools name them | فصل (a class or a term) |
| Label (a name given to an example) | **تسمية** | تصنيف |
| Classification (the task) | **تصنيف** | تسمية |
| Histogram bin / category range | **فئة** | فئات (when it means a bin) |
| Tool call (the agent calling a tool) | **استدعاء الأداة** | طلب |
| The person's request | **طلب** | (for the tool call) |
| Checker / verifier | **المدقّق** | (not ضابط) |
| Control (security control) | **ضابط** only for a control in aisec, once defined; otherwise **الإجراء الوقائي** | ضابط for a person |
| Token (AI) | **توكن**, plural **توكنز** (also in MSA; the llm lab's button is «التوكن التالي») | رموز |
| Fairness | **العدل**; fair: **عادل / عادلة** | الإنصاف, منصف |
| Test set | **بيانات الاختبار** | مجموعة الاختبار |
| Validation set | **بيانات التحقق** | (never the test set) |
| Diary / log | **يوميات** | مذكرات |
| Supply chain | **سلسلة التوريد** | الإمداد, التوريد alone |
| Blast radius | **نطاق الضرر** | مدى الضرر |
| Allow-list | **قايمة السماح** | لستة السماح |
| Code (programs) | **كود** | شيفرة |
| Password / passphrase | **كلمة السر** (ar-EG) / **عبارة المرور** (MSA) | mixed in one lesson |
| Place / location | **المكان** | الموقع (in narration) |
| Problems / incidents | **المشاكل** (narration), **الحوادث** (MSA reports) | mixed in one lesson |
| Threshold (IoT) | **الحد** | العتبة |
| Solver | **برنامج الحل** | سولفر |
| Undo | **التراجع** | الرجوع |
| Backtracking (search that undoes a guess, opt) | **التراجع البسيط**; undo a guess: **اتراجع عن التخمينة** | الرجوع البسيط, ارجع في التخمينة |
| Sudoku cell (opt-s1-3) | **خانة** | مربع (only the 2 × 2 or 3 × 3 box) |
| Greedy, as a noun in narration and on screen (opt) | **الطريقة الجشعة** / **القاعدة الجشعة** | «الجشع», «الجشعة» alone |
| Greedy | **الجشع** in a technical sentence; the button: **عبّئ بالطريقة الجشعة** | المنصف, الشاذة |
| Trade-off | **موازنة** | مقايضة |
| Overfitting | **الإفراط في التوفيق** (the common Arabic ML term; used across ds) | الحفظ الزائد, الإفراط في التخصيص |
| Categories (kinds of things, not histogram bins) | **أنواع** | فئات |
| Precision (classification metric) | **الدقة الإيجابية** in course text, with "precision" once | الضبطية |
| Pass mark | **درجة النجاح** | حد النجاح |
| Heat | **الحرارة** | السخونة (for a sensor value) |
| Rule of thumb | **قاعدة عامة** | قاعدة ذهبية |
| Struggle (the effort that is the learning, ai-4-1-4) | **المجهود** (narration and MSA) | التعب |
| Leaf (of a plant), in narration | **ورق النبات** / **ورقة** with its noun nearby | الورق alone (reads as paper) |
| Grade / year group (Primary 4, Grade 8, "across year groups") | **الصف** with its number or ordinal (الصف الرابع الابتدائي، الصف ٥، أ. أوكافور، علوم الصف الثامن) | الفصل الرابع (reads as chapter or term four). Added in the 2026-11-01 sweep: a school year is not a group of pupils, so it keeps the standard Arabic name; a group of pupils (your class, 6B) is **فصل** |
| A class, spelled out | **فصل** | فصل دراسي (that is a school term); the old «صف دراسي» becomes plain «فصل» |
| Pupils' desks, plural (ar-EG) | **التختات** | التخت (a bed) |
| Threshold (AI decisions, the threshold lab «الأخطاء والحدود») | **الحد**, as in IoT; the lab's button is «انتقل إلى أفضل حد» | العتبة. Added 2026-11-01 so ai and iot, which share the lab, say the same word |
| Underfitting | **نقص التوفيق** (pairs with الإفراط في التوفيق) | نقص المطابقة |
| Data labelling (the job) | **تسمية البيانات** | تصنيف البيانات (that is the task) |
| LED, defined once in full | **مصباح LED (أي الصمام الثنائي الباعث للضوء)** | الصمام الضوئي |
| Tidy (spaces, names) vs sort | **نظّف** (the clean lab's «نظّف المسافات») | رتّب, which means sort elsewhere |
| Odd one out (the poison lab's button) | **«اعثر على الأمثلة الشاذّة»** | «اعثر على الشاذّة» (a bare adjective) |

Canonical names (the same name in the English and the Arabic, spelled the same way everywhere):

- Grace → **غريس**
- Kofi → **كوفي**
- Tunde → **توندي**
- Mwangi → **موانجي**
- Bora, Kesi, Mina, Tala → keep the English spelling in Arabic letters as in the English lesson (بورا, كيسي, مينا, تالا).

## Decisions taken here (change this file, then the units)

- **Thursday or Friday (data-4-1-1):** Friday. The English is the source; the Arabic follows it.
- **Sunday or Monday (data-4-1-1):** Monday, as in the English, the checkpoint and the steps. The narration is changed to match.
- **Narrator gender:** not changed by this pass. It is still the user's call.
- **Currency (iot-1-2-2):** naira and CFA francs stay as in the packs, until the user decides otherwise.
- **CO₂ thresholds (iot-3-1, iot-4-1, iot-s3):** open the windows above 1,000 ppm; below 800 is well aired; above 1,500 the air is already poor. The user can still overrule this.

## Where this file is used

- Every Arabic fix in `content/units/*.json` and `content/darsi/**/ar-EG.json` and the storyboards in `H:\htdocs\lessonstudio\content\darsi\`.
- The reviewers' proposals (in `H:\htdocs\lessonstudio\out\validation\REPORT.md`) are suggestions. Apply them through this glossary.
- Any Arabic term that is not in the table: add it here first, with the reason.
