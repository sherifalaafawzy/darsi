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
| Softness (of fruit, the knn lab's axis and ai-s3-2) | **الطراوة** | الليونة |
| Pass mark | **درجة النجاح** | حد النجاح |
| Quiz sheet (a unit check's kit) | **ورقة الاختبار**; "Review plan and quiz sheet": **خطة المراجعة وورقة الاختبار** | ورقة المسابقة (a contest sheet) |
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
| IT team (who to tell, in university courses) | **فريق الآي تي** (ar-EG narration), **فريق تقنية المعلومات** (MSA course text) | مدرّس, المدرسة (cyber-s4 is a university course) |
| Hop (a message passing from one device to the next) | **قفزة**, plural **قفزات** (narration and MSA; the mesh lab says «القفزات») | نطّة |
| Computational graph (backprop) | **المخطط الحسابي**, plural **المخططات الحسابية** | الشبكة الحسابية (collides with الشبكة العصبية) |
| Permutation-equivariant (attention) | **متساوي التغيّر مع التبديل**, glossed once (reorder the inputs and the outputs reorder the same way) | متكافئ مع التبديل; متساوي التغاير (التغاير is covariance) |
| Seminar (a university discussion class; the lecturer courses) | **حلقة النقاش** (narration and MSA), as ai-u1 and the other `*-u1` courses write it | a bare «الحلقة», which is also the ring of points in ai-u2 |
| Residual connection (transformer) | **الوصلة المتبقية**; the path: **المسار المتبقي** | الباقي (reads as "the rest") |
| Fine-tuning (the teach lab, ai-3-1, agents-3-1, agents-s4, ai-d3, ai-u4) | **الضبط الدقيق** (a small one: **ضبط دقيق مصغَّر**) | التعديل الدقيق |
| Transformer block; the top block a small fine-tune teaches | **كتلة المحوّل**; **الكتلة العليا**, plural **الكتل** (ar-EG narration and the ai-d3-2/ai-u4-2 videos: **الكتلة اللي فوق**, **الكتل اللي تحت**) | «البلوك»; الطبقة الأخيرة (reads as the output layer, which the teach lab keeps frozen) |
| Vanishing gradient (backprop through many steps or layers) | **التدرّج المتلاشي** (as ai-u1 and ai-d1 write it); the problem: **مشكلة التدرّج المتلاشي** | «تلاشي التدرّج» as the term's name |
| Repository (GitHub) | **المستودع** (also in the capstones' Egyptian text, as the milestone card's «مستودع البداية» says); a link is **رابط** | ريبو; لينك |
| Convolution (vision networks) | **الالتفاف** (narration and MSA; the CNN diagrams in the videos say it) | الطي |
| Max pooling | **التجميع الأقصى**; average pooling: **التجميع المتوسط** | التجميع alone where the kind matters |
| Prototype (a detector's average of its training examples) | **النمط المرجعي** | النموذج الأوّلي (an early product) |
| Noise (in a picture or a signal); denoising | **الضوضاء**; denoise: **إزالة الضوضاء** (the ai-u3-4 and ai-d2-4 videos say it, as ai-u1 does) | الضجيج, or the two mixed |
| Brightness (of a pixel; where it sits, the vae lab's code) | **السطوع**: «موضع السطوع», «مركز السطوع» (ai-d2, ai-u3) | الإضاءة (that is lighting) |
| Variational autoencoder | **المرمّز التلقائي المتغيّر (VAE)** (the vae lab's «المرمّز المتغير») | النموذج المتغير |
| GAN | **الشبكة التوليدية الخصمية (GAN)** in full once, then **الشبكة الخصمية (GAN)**; its discriminator: **المميِّز** | شبكة خصمية without the acronym; القاضي (a court judge) |
| Hash, hash function | **الهاش** / **دالة الهاش** (ar-EG narration); **دالة التجزئة (الهاش)** at its first mention and in the key terms of MSA course text, then **دالة التجزئة** (as cyber-2-1 and cyber-s4 write it) | التجزيء; دالة التجزئة with no «(الهاش)» on first mention when the video says الهاش |
| Aliasing (sampling too slowly); an alias (the false frequency) | **التشويه الترددي** (the adc lab's «التشويه الترددي (aliasing)»), with «(aliasing)» at its first mention and in the key terms; an alias: **تردد زائف**. The ar-EG narration may shorten it to «التشويه» | «التشويه» alone in MSA course text (that is distortion, as in THD) |
| Rate-monotonic (RM) scheduling | **الجدولة الرتيبة المعدّل (RM)**; its bound: **حد الجدولة الرتيبة المعدّل**; the priority rule: **إسناد الأولوية الرتيب المعدّل**; after an indefinite noun, no «ال»: «بأولويات رتيبة المعدّل» (iot-u1) | «المعدّل الثابت» (that means a fixed rate) |
| Oscilloscope | **راسم الإشارة** | مذبذب (an oscillator) |
| Derating (a safety margin taken off a battery's or a part's rating) | **هامش الأمان من السعة**; before derating: **قبل خصم هامش الأمان من السعة** | خفض التصنيف (reads as downgrading a classification) |
| Scaffolding (teaching) | **السقالات التعليمية (التدرّج بالدعم)** in MSA course text, as the key term; **السقالة** / **سقّل** in ar-EG narration; scaffolded labs: **المعامل المتدرّجة** | «التدرّج» alone as the term's name |
| Fail-safe defaults (Saltzer and Schroeder's principle) | **الإعدادات الافتراضية الآمنة** (a default setting is **الإعداد الافتراضي**) | «الافتراضات الآمنة» (that means safe assumptions) |
| Scope (the signed list of what students may test, cyber-u1) | **النطاق**; a signed scope: **نطاق موقّع** | «نطاق» for the cyber range |
| Cyber range (an isolated network of virtual machines for attack practice, cyber-u1) | **ميدان تدريب سيبراني**; an isolated range: **ميدان تدريب معزول** | «نطاق معزول», «نطاق أمن معزول» (نطاق is the scope) |
| Replication (copies of a database on several machines, data-u1) | **النسخ المتماثل**; replicated data: **بيانات منسوخة نسخًا متماثلًا** | التكرار, متكررة (that is the redundancy normalisation removes) |
| Local optimum (local search, opt) | **الحل الأمثل المحلي** (**حل أمثل محلي**), plural **الحلول المثلى المحلية**, as opt-s4 writes it | «قمة محلية», «القمم المحلية» (a peak: wrong for the minimisations in opt-u1-3, where the anneal lab says «قيمة صغرى محلية») |
| Integrality (integer programs, opt) | **شرط الأعداد الصحيحة** | «شرط الصحة» (reads as a validity or health condition) |
| Cutting planes (opt) | **المستويات القاطعة** | «مستويات القطع» |
| Tampered (a result, page or file an attacker changed, aisec) | **مُتلاعَب به** / **مُتلاعَب بها** in MSA course text (as aisec-s3, aisec-s4 and aisec-4-1 write it), matching the ar-EG narration's **متلعّب فيه** / **متلاعب فيها** | «معبوثة», «المعبوثة» with no «بها» (عبث takes بـ); «معبوث بها» is grammatical but not the course term. The labs' own labels change with the lab |
| Epsilon (the size of an adversarial nudge, aisec) | **إبسلون** (masculine: «إبسلون يساوي ٠٫٥»), in course text and narration; `eps` in code. University courses (`*-u1`), whose formulas use Latin digits inside isolates (ε = 0.1, ε-DP), keep ε as notation | the bare Greek ε in the Arabic text of school and student courses (next to Arabic-Indic digits it reads as ٤: «٤ε» shows as «٤٤») |
| Red teaming (the activity, aisec) | **الاختبار الهجومي**, with «(الفريق الأحمر)» at its first mention (as aisec-4-1 and aisec-s4 write it); the group, and a red-team exercise or round: **الفريق الأحمر**, **تمرين فريق أحمر** | «الفريق الأحمر» for the activity («ننفّذ الفريق الأحمر») |
| Arm span (fingertip to fingertip, arms stretched out; ds-s3) | **امتداد الذراعين** (MSA course text), glossed once «(من طرف الأصابع إلى طرف الأصابع)»; ar-EG narration: **الدراعين وهما مفرودين** | طول الذراعين (the length of the arms; a learner may measure one arm) |

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
- **AI policy principles (ai-4-1-2):** Purpose is **الهدف** and Equal access is **الفرص المتساوية**, in the narration, on screen and in the course text (not الغاية or تكافؤ الفرص), so learners match the names they heard. The video keeps its words; the unit follows.
- **The coreference example (ai-u1-3):** in Arabic every noun in "the student couldn't fit the laptop in the bag because it was full" is masculine (الطالب، اللابتوب، **الدُّرج**; «الطالب مقدرش يحط اللابتوب في الدُّرج لأنه كان مليان»), so grammar doesn't give the answer away and only the meaning does. The English keeps "bag".
- **Capstones (`*-capstone`):** their course text is Egyptian Arabic, by the user's choice, and the glossary still applies (كلمة السر، بيانات الاختبار، المستودع، رابط). Between Arabic steps the arrow is «←» («المستودع ← تبويب Actions»); «→» stays only inside a left-to-right run such as «Code → Codespaces».

## Where this file is used

- Every Arabic fix in `content/units/*.json` and `content/darsi/**/ar-EG.json` and the storyboards in `H:\htdocs\lessonstudio\content\darsi\`.
- The reviewers' proposals (in `H:\htdocs\lessonstudio\out\validation\REPORT.md`) are suggestions. Apply them through this glossary.
- Any Arabic term that is not in the table: add it here first, with the reason.
