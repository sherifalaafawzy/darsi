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
| Value (programming) | **قيمة** | |
| Type (of a value) | **نوع** | صنف |
| String (text in a program) | **نص**, with "string" in English the first time (`str`); plural **نصوص** | سلسلة نصية, سلسلة |
| Expression | **تعبير** | عبارة |
| Operator (+, *, //) | **عامل** | مؤثّر |
| Variable | **المتغيّر** (with the shadda) | المتحوّل |
| Assignment (`=`) | **الإسناد** | التعيين |
| Trace table | **جدول التتبّع** | |
| Conversion (`int()`, `str()`) | **التحويل** | |
| Floor division (`//`) and remainder (`%`) | **القسمة الصحيحة**, **باقي القسمة** | |
| Rounding | **التقريب** | |
| Invalid input | **إدخال غير صالح** | إدخال خاطئ |
| Studying (a student's own study time) | **المذاكرة**, in narration and course text | |
| Boolean | **القيمة المنطقية**, with "Boolean" in English the first time | |
| Comparison; condition | **المقارنة**; **الشرط** | |
| Branch (`if`/`elif`/`else`) | **الفرع** | |
| Indentation | **الإزاحة** | المسافة البادئة |
| Colon (`:`) | **النقطتان** (MSA); **نقطتين فوق بعض** (ar-EG) | |
| Boundary (of a rule, in testing) | **الحدّ**, the same word as threshold: a rule's boundary is its threshold | العتبة |
| Inclusive / exclusive | **شامل / غير شامل** | |
| Input validation | **التحقّق من الإدخال** | بيانات التحقق (that is a validation set) |
| Test case; expected result | **حالة الاختبار**; **النتيجة المتوقّعة** | |
| Policy (written rules of an institution) | **اللائحة** (MSA); **اللايحة** (ar-EG) | السياسة |
| Loop (`while`, `for`) | **حلقة** (MSA), **لوب** (ar-EG), as `code-2-1` already does; part of the open register question below | تكرار (that is repetition, the idea) |
| One turn of a loop (iteration) | **دورة** (MSA), **لفّة** (ar-EG) | |
| Infinite loop | **حلقة لا تنتهي**, as the app's message says; **لوب مبيخلصش** (ar-EG) | |
| Sentinel (the value that ends input) | **القيمة الحارسة** | |
| Accumulator (a running total) | **المُجمِّع** | |
| Off-by-one error | **الخطأ بواحد** (MSA), **الغلطة بواحد** (ar-EG) | |
| List | **القائمة** with "list" in English the first time (MSA), **الليست** (ar-EG); part of the open register question | اللائحة (that is a policy) |
| Index (a position in a list) | **الفهرس** or **الموضع** (MSA), **الإندكس** / **رقم المكان** (ar-EG). The `index` lab's «الفهرس» is a table's index: the same word, a related idea | |
| Dictionary; key | **القاموس**; **المفتاح**, each with the English the first time | |
| Tuple | **الزوج** for a pair, with "tuple" in English the first time | الصف (a table row) |
| Set (the type) | **المجموعة**, with "set" the first time | |
| Nested loop | **الحلقة المتداخلة** (MSA), **لوب جوه لوب** (ar-EG) | |
| Record (one item's fields) | **السجلّ** | |
| Normalise (make spellings match) | **التوحيد**, verb **وحّد** | التطبيع |
| Duplicate | **المكرّر** | |
| Inventory | **الجرد** | |
| Microscope | **المجهر** (MSA), **ميكروسكوب** (ar-EG); part of the open register question | |
| Function | **الدالة**, plural **الدوال** (as `code-s3`) | الوظيفة |
| Parameter; argument | **المعامل**; **الوسيط**, each with the English the first time | |
| Return (a value) | **تُعيد**, noun **الإرجاع** (MSA); **بترجّع** (ar-EG); the keyword stays `return` | |
| Call (a function) | **تستدعي**, **الاستدعاء** (MSA); **بتنادي على** (ar-EG) | |
| Local scope | **النطاق المحلي** | |
| Docstring | **نص التوثيق**, with "docstring" the first time | |
| Default parameter | **المعامل الافتراضي** | |
| Contract (what a function expects and returns) | **العقد** | |
| Decomposition | **التقسيم** | التفكيك |
| Parsing | **التحليل**, with "parsing" the first time | |
| Model (AI) | **النموذج** | |
| Training data | **بيانات التدريب** | |
| Prediction | **التوقّع** | التنبؤ |
| Language model | **النموذج اللغوي** | |
| Next-token prediction | **توقّع التوكن التالي** | |
| Prompt | **الطلب (prompt)** in course text, as `ai-2-1`; **البرومبت** in the videos ("البرومبت، يعني الطلب" the first time); part of the open register question | الموجّه (in `ai-u1` it means supervised) |
| Context (what the chatbot is told) | **السياق** | |
| Hallucination | **الهلوسة** | |
| Stakes (what a mistake would cost) | **الخطورة**; in narration «على قد الخطورة», «الغلطة هتكلّفك قد إيه» | الرهان |
| Trusted source | **المصدر الموثوق** | |
| Neuron | **الخلية العصبية** (as `ai-3-1`, `ai-d1`, `ai-u2`) | عصبون (`ai-u1` aligns at its standard pass) |
| Weight | **الوزن** | |
| Bias (a neuron's number) | **الانحياز** | التحيّز is unfairness (bias in data or decisions); never for the number |
| Activation | **التنشيط** (دالة التنشيط for the function) | |
| Hidden layer | **الطبقة المخفية** | الطبقة الخفية |
| Loss | **الخسارة** | |
| Gradient | **التدرّج** | الميل is the school slope, used when the lesson means the slope |
| Learning rate | **معدّل التعلّم** | |
| Gradient descent | **الانحدار التدريجي** (the `gradient` lab's name) | النزول التدريجي |
| Backpropagation | **الانتشار العكسي** | |
| Recurrent network | **الشبكة التكرارية** | الشبكة المتكررة |
| Hidden state | **الحالة المخفية** | |
| Vanishing gradient | **التدرّج المتلاشي** | |
| Embedding | **التضمين** | |
| Attention | **الانتباه** | |
| Transformer (block) | **المحوّل** (**كتلة المحوّل**) | |
| Query (in attention) | **الاستعلام** | |
| Multi-head attention | **الانتباه متعدد الرؤوس** | |
| Positional encoding | **ترميز الموضع** | |
| Computational graph | **المخطط الحسابي** | الشبكة الحسابية |
| Optimiser | **المحسِّن** | |
| Mini-batch | **الدفعة الصغيرة** | |
| Empirical risk | **الخطر التجريبي** | |
| Recall (of a model) | **الاستدعاء** | |
| Selection bias | **تحيّز الاختيار** | |
| Model card | **بطاقة النموذج** | |
| Decision boundary | **حد القرار** | |
| Depth (of a network) | **العمق** | |
| Residual connection | **الوصلة المتبقية** | الباقي |
| Validation loss | **خسارة التحقق** | |
| Early stopping | **الإيقاف المبكر** | |
| Loss curve | **منحنى الخسارة** | |
| Attention heat map | **الخريطة الحرارية للانتباه** | |
| Seminar | **الحلقة النقاشية** (MSA, as `ai-u1`, `ai-u3`, `ai-u4`), **حلقة نقاش** in narration; always in full (a bare «الحلقة» is a loop) | حلقة النقاش |
| Ring (a drawn ring, a ring of places) | **دائرة** (MSA), **دايرة** (ar-EG) | حلقة (that is a loop) |
| Feature map | **خريطة الملامح** | |
| Prototype (the `detect` lab's) | **النمط المرجعي** (as `ai-d2`) | النموذج الأوّلي (clashes with «النموذج», a model) |
| Pixel | **البكسل** | |
| Filter (in an image) | **المرشّح** (the `convolution` lab's word) | |
| Pooling (in an image network) | **التصغير** (the `convolution` lab's word) | التجميع (that is clustering) |
| Clustering; centre (of a cluster) | **التجميع** (as the data courses); **المركز** | |
| Score (a detector's) | **الدرجة** | |
| Miss (a face the detector misses) | **التفويت** | |
| Diffusion (image generation) | **الانتشار**; denoising step **خطوة إزالة الضجيج** | |
| Policy (in reinforcement learning) | **السياسة** (only in RL; an institution's rules are «اللائحة») | |
| Reward | **المكافأة** | |
| Value (in reinforcement learning) | **القيمة** | |
| Pretraining | **التدريب المسبق** | |
| Forgetting (of a fine-tuned model) | **النسيان**; catastrophic forgetting below | |
| Accountability | **المساءلة** | |
| Held-out set (an evaluation's unseen cases) | **البيانات المحجوبة** (as `agents-s4`) | مجموعة منفصلة |
| Grounding | **الاستناد** | |
| Human in the loop | **الإنسان في الحلقة** (the agent's loop, so «الحلقة» keeps its meaning) | |
| Audit log | **سجلّ الأحداث** (the agent log row above; as `agents-4-1`, `agents-u1`) | سجلّ التدقيق |
| Normalisation (of a database) | **التطبيع** (only for database design; making spellings match is «التوحيد») | |
| Query optimiser (of a database) | **مُحسِّن الاستعلامات**, in text and narration (a bare «المحسِّن» is the ML optimiser) | المخطِّط |
| Seat (a place in a course or a room) | **المقعد** (MSA), **الكرسي** (ar-EG) | |
| Anomaly (in a database) | **الشذوذ** | |
| Functional dependency | **الاعتمادية الوظيفية** | |
| Candidate key | **المفتاح المرشّح** | |
| B+ tree | **شجرة B+** (narration «شجرة بي بلس») | |
| Selectivity | **الانتقائية** | |
| Query plan | **خطة الاستعلام** | |
| Transaction (database) | **المعاملة** | |
| Serializability | **قابلية التسلسل** | |
| Write skew | **انحراف الكتابة** | |
| Snapshot isolation | **العزل باللقطة** | |
| Network partition | **انقسام الشبكة** | |
| Lost update | **التحديث الضائع** (narration «الضايع») | |
| Data quality dimension | **بُعد جودة البيانات** | |
| Lineage (of data) | **النَّسَب** | |
| Datasheet (for a dataset) | **ورقة البيانات** | |
| Aliasing | **التشويه الترددي (aliasing)** first, then **التشويه** (the `adc` lab's word) | |
| Scaffolding (teaching) | **السقالة التعليمية (scaffolding)** | التدرّج بالدعم |
| Consent | **الموافقة عن علم** (approval is «الموافقة») | |
| Error by group | **الخطأ حسب المجموعة** | |
| Data gap | **الفجوة في البيانات** (as `ai-s1`, `ai-s3`, `ai-s4`) | فجوة البيانات (`ai-1-1` aligns at its pass) |
| False positive / false negative | **الإيجابي الكاذب** / **السلبي الكاذب** | |
| Automation / augmentation (of a job's tasks) | **الأتمتة** / **التعزيز** (not reinforcement learning, which is «التعلّم المعزّز») | |
| Academic integrity | **النزاهة الأكاديمية** | |
| AI-use statement | **بيان استخدام الذكاء الاصطناعي** | |
| Copyright / licence | **حقوق النشر** / **الترخيص** | |
| Sensor | open: courses mostly «حسّاس» (36), labs mostly «مستشعر» (17); one word to be chosen | |
| Credit assignment | **توزيع الفضل** | |
| Fine-tuning | **الضبط الدقيق** (the `teach` lab's word) | التعديل الدقيق |
| Frozen layer | **الطبقة المجمّدة** | |
| Catastrophic forgetting | **النسيان الكارثي** | |
| Test suite | **حزمة الاختبار** | مجموعة الاختبار (that is a test set) |
| Refusal case | **حالة الرفض** | |
| Data / model parallelism | **توازي البيانات** / **توازي النموذج** | |
| Surrogate (stand-in) model | **النموذج البديل** | |
| Batch | **الدفعة** | |
| Rubric | **معيار التصحيح** | |
| Graphics card | **بطاقة الرسوم** (MSA), **كارت الشاشة** (ar-EG); part of the open register question | |
| Latent code | **الرمز الكامن** | |
| Encoder / decoder | **المرمِّز** / **المفكِّك** | |
| Sampling | **أخذ العيّنة** | |
| GAN | **الشبكة التوليدية التنافسية (GAN)** (as `ai-d2`); in narration **الشبكة التنافسية** | الخصمية |
| Mode collapse | **انهيار الأنماط** | |
| Noise (in images) | **الضجيج** (the `denoise` lab's word) | ضوضاء |
| Brightness | **الإضاءة** (the `vae` lab's word) | سطوع |
| Cue (the `rnn` lab's signal) | **الإشارة** | |
| Overfitting | **الإفراط في التوفيق** | الإفراط في الملاءمة; the `overfit` lab's own labels say «الإفراط في المطابقة» (lab change pending) |
| Tools list (what an agent can use) | **قائمة الأدوات** (MSA), **قايمة الأدوات** (ar-EG) | |
| Argument (of a tool call or a function) | **الوسيط**, plural **الوسائط** (as `aisec-3-1`, `code-m4`); in narration avoid the plural «وسايط», which sounds like «واسطة» | التفاصيل, المعاملات (that is parameters). `agents-1-1-2` aligns at its standard pass |
| Slip (a small mistake in a call or a result) | **الهفوة** (as `agents-s2`, `agents-s4-0`) | الزلّة. `agents-1-1-3` aligns at its standard pass |
| Permission level | **مستوى الصلاحية** (as `agents-1-1`, `agents-4-1`) | مستوى الإذن. `agents-s2-3` aligns at its standard pass |
| Approval | **الموافقة** | |
| Guardrail | **حاجز الحماية**; after the first use, **الحاجز** | |
| Log (of what an agent did) | **سجلّ الأحداث**; after the first use, **السجلّ**. A record of data (`code-m5`) is also «السجلّ»: in a lesson that has both, write «سجلّ الأحداث» in full | اليوميات (that is a diary) |
| Asking back (the agent asks for what is missing) | **يسأل عن الناقص** | |
| AI agent | **الوكيل** / **وكيل الذكاء الاصطناعي** | |
| System prompt | **تعليمات النظام (system prompt)** in course text; **السيستم برومبت** in the videos | |
| Prompt injection | **حقن الأوامر** (as `aisec-2-1`, `aisec-s2` to `aisec-s4`) | حقن التعليمات. `aisec-u1` aligns at its standard pass |
| Indirect injection | **الحقن غير المباشر** | |
| Untrusted content | **المحتوى غير الموثوق** (ar-EG «محتوى مش موثوق») | |
| Jailbreak | **كسر القيود (jailbreak)** | كسر الحماية. `aisec-u1` aligns at its standard pass |
| Keyword filter | **مرشّح الكلمات** in course text, **فلتر الكلمات** in the videos | |
| Action check (a check on what the tool does) | **فحص الفعل** | فحص الإجراء as a term |
| Least privilege | **مبدأ أقل الصلاحيات**, short **أقل الصلاحيات** | أقل صلاحية. `agents-u1` and `aisec-u1` align at their standard pass |
| Personal data; chat history | **البيانات الشخصية**; **سجلّ المحادثات** | |
| Median | **الوسيط** (the school maths word). It is also a function's argument (above): open, for the user and an Arabic reader. Until then, a lesson that needs both says «القيمة الوسيطة» for the median | |
| Recursion | **الاستدعاء الذاتي** (the lab's word, `code-s4`) | العودية |
| Edge case | **الحالة الحدّية** (as `code-m3`) | الطرفية |
| Diagnostic distractor | **الخيار التشخيصي** (as `code-3-1`) | |
| Activation record | **سجلّ التنشيط** | |
| Well-founded measure | **مقياس حسن التأسيس** | |
| Inductive hypothesis | **فرضية الاستقراء** | |
| Notional machine | **الآلة التصوّرية** | |
| Autograder / hidden test | **المصحّح الآلي** / **اختبار مخفي** | |
| Mutation testing | **اختبار الطفرات** | |
| Similarity checker | **أداة كشف التشابه** | |
| Cyber range | **الميدان السيبراني** (ar-EG «ميدان سيبراني») | نطاق أمن معزول («النطاق» is the signed scope) |
| Fail-safe defaults | **الإعدادات الافتراضية الآمنة** | الافتراضات الآمنة |
| Memory-hard function | **دالة كثيفة الذاكرة** | |
| Discrete logarithm | **مسألة اللوغاريتم المتقطع** | |
| Trust boundary | **حد الثقة** | |
| Regression test | **اختبار الانحدار (regression test)** (as `aisec-s4`) | اختبار التراجع («التراجع» is undo) |
| Data minimisation | **تقليل البيانات** (as `cyber-3-1`, `iot-4-1`, `agents-4-1`) | الحد الأدنى من البيانات |
| Named lead (for incidents) | **المسؤول المحدّد** | |
| Passing (transient) fault | **العطل العابر** | |
| Run log | **سجلّ التشغيل**, always in full | |
| Idempotent | **متساوي الأثر** | |
| Range check / uniqueness check | **فحص المدى** / **فحص عدم التكرار** | |
| Pseudonymisation | **الترميز بأسماء مستعارة** (ar-EG «أسماء مستعارة») | |
| Re-identification | **إعادة التعرّف** | |
| Retention rule | **قاعدة الاحتفاظ** | |
| Restore test | **اختبار الاسترجاع** | |
| Unplugged (teaching without devices) | **دون أجهزة** (ar-EG «من غير أجهزة») | |
| Pair programming; driver / navigator | **البرمجة في أزواج**; **السائق** / **الملّاح** (ar-EG «السوّاق» / «الملاح») | |
| Tester / reporter (group roles) | **المختبِر** / **المقرِّر** | |
| Desk check | **التتبّع باليد** | |
| Scheme of work; progression; assessment point | **خطة العمل**; **التدرّج**; **نقطة التقييم** | |
| Device timetable | **جدول الأجهزة** | |
| Live coding | **البرمجة الحيّة** (MSA), **الكود على الهوا** (ar-EG); part of the open register question | |
| School term | **الفصل الدراسي**, always in full (a bare «الفصل» is a class); ar-EG **الترم** | |
| Open format | **الصيغة المفتوحة** | |
| Deputy head (of a school) | **وكيل المدرسة** / **وكيلة المدرسة**, always with «المدرسة» (a bare «الوكيل» is an AI agent) | |
| Attendance register | **سجلّ الحضور** (MSA), **كشف الغياب** (ar-EG); part of the open register question | |
| Nudge (a small push to each input number) | **الدفع** (the `pixels` lab's word); narration **الزقّة** | الدفعة (that is a batch) |
| Provenance | **تتبّع المصدر** | |
| Threat model | **نموذج التهديد** | نموذج التهديدات |
| Adversarial example | **المثال الخادع** (as `aisec-3-1`, `aisec-s4`) | المثال العدائي |
| Data-flow diagram | **مخطط مسارات البيانات** | |
| Rules of engagement | **قواعد الاشتباك** | |
| Responsible disclosure | **الإفصاح المسؤول** | |
| Model extraction | **استخراج النموذج** | |
| Improper output handling / excessive agency (OWASP) | **التعامل غير السليم مع المخرجات** / **الصلاحيات المفرطة** (MSA); ar-EG «التعامل الغلط مع المخرجات» / «الصلاحيات الزيادة» | |
| Red teaming | **اختبار الفريق الأحمر** (the `redteam` lab, `aisec-2-1`) | الاختبار الهجومي |
| Risk owner | **مسؤول الخطر** | |
| Enforced check; approved tool | **الفحص المفروض**; **الأداة المعتمدة** | |
| Untrusted input | **المدخلات غير الموثوقة** (ar-EG «مدخلات مش موثوقة») | |
| Data breach | **خرق البيانات** | |
| Replay (mixing old examples into fine-tuning) | **إعادة القديم** | |
| Defence in depth | **الدفاع في العمق** (the security term, as `cyber-s4`) | الحماية متعدّدة الطبقات, الدفاع المتعدد الطبقات |
| Slow hash | **دالة التجزئة البطيئة** (MSA), **هاش بطيء** (ar-EG) | |
| Hashing | **التجزئة** | التجزيء (the `hash` lab's Arabic; lab change pending) |
| Network segmentation; security operations centre | **تقسيم الشبكة**; **مركز عمليات الأمن** | |
| Key pair | **زوج المفاتيح** | |
| Corner (of a feasible region) | **زاوية** (the `lp` lab's word) | رأس, ركن |
| Feasible region | **المنطقة الممكنة** | |
| LP relaxation; incumbent | **الإرخاء الخطي** (as `opt-s4`); **الحل الحالي** | الاسترخاء الخطي |
| Prune (a branch) | **نقطع** (the solver pack's tree notes) | يقصّ |
| Local optimum | **حل أمثل محلي** | القمة المحلية |
| Metaheuristic | **الطريقة الفوقية**, plural **الطرق الفوقية** (as `opt-s4`) | طريقة فوق تقريبية |
| Complementary slackness | **التراخي المتمّم** | |
| Linear program; mixed-integer program | **البرنامج الخطي**; **البرنامج الصحيح المختلط** | |
| Branch and bound | **التفريع والتحديد** | |
| Big-M | **قيد M الكبير** | |
| Propagation (constraint); fail-first | **الانتشار**; **«الفشل أولًا»** | |
| Canteen | **المقصف** (MSA), **الكافتيريا** (ar-EG) | |
| Capture the flag | **التقاط العلم (CTF)** | |
| Plan-then-act; step-by-step planning | **التخطيط ثم التنفيذ**; **التخطيط خطوة بخطوة** | |
| Compounding errors | **تضاعف الأخطاء** | |
| Exact match | **التطابق التام** | |
| Retrieval | **الاسترجاع** | |
| Context window | **نافذة السياق** | |
| Labs (the app section) / a lab app | **المختبرات** / **المختبر** (the app menu says «المختبرات»), in text and narration | المعمل for the app |
| A real lab (a room, a university practical session) | **المعمل** («معمل الحاسب», «ورقة المعمل») | المختبر (that is the app) |
| Regression (something that worked breaks after a change) | **الانتكاس**; the test that catches it is **اختبار الانحدار** | |
| Group (of pupils or people) | **مجموعة** | فئة (that is a histogram bin) |
| Backward design | **التخطيط العكسي** | |
| Pareto front; shadow price | **جبهة باريتو**; **سعر الظل** | |
| Max-min goal; floor; price of fairness | **هدف تعظيم الحد الأدنى**; **الأرضية**; **ثمن العدل** (ar-EG «تمن العدل») | |
| Two-step solve | **الحل على خطوتين** | |
| Missing constraint; assumptions | **القيد الناقص**; **الافتراضات** | |
| Model validation (optimisation) | **التحقّق من صحة النموذج**, in full in text (ar-EG may say «التحقّق») | |
| Sensitivity (optimisation) | **الحساسية** (as in differential privacy; the English word is the same) | |
| Local search; hill climbing; simulated annealing | **البحث المحلي**; **تسلّق التل**; **التلدين المحاكى** | |
| Bound (in optimisation); optimality gap | **الحد الأدنى**, always with «الأدنى» (a bare «الحد» is a threshold); **فجوة الأمثلية** | |
| Fairness | **العدل** | العدالة |
| Standard error; confidence interval | **الخطأ المعياري**; **فترة الثقة** | |
| Bootstrap | **الـ bootstrap** | |
| Sampling distribution | **توزيع المعاينة** (sampling, the act, is «أخذ العيّنة») | |
| Wobble (the sampling lab's word) | **التأرجح** | |
| Leakage (in a model's data) | **التسريب** | |
| k-fold cross-validation | **التحقق المتقاطع بـ k طيّة** | |
| Bias–variance trade-off | **الموازنة بين التحيّز والتباين** | |
| Noise (statistical) | **الضجيج**, as for images | |
| Scaling (of features) | **التحجيم** | |
| Confounder; mediator | **المتغيّر المربك**; **المتغيّر الوسيط** (always with «المتغيّر»: a bare «الوسيط» is the median or an argument) | |
| Back-door criterion; parallel trends | **معيار الباب الخلفي**; **الاتجاهات المتوازية** | |
| Constructive alignment | **التنسيق البنّاء** | |
| Analytic rubric | **معيار التصحيح التحليلي** | |
| Reproducible / repeatable | **قابل لإعادة الإنتاج** / **قابل للتكرار** | |
| Inject (in a tabletop exercise) | **المستجدّ**, plural **المستجدّات** | |
| Tabletop exercise | **تمرين المحاكاة** | |
| No-blame culture | **ثقافة عدم اللوم** | |
| Acceptable use agreement | **اتفاقية الاستخدام المقبول** | |
| Sextortion | **الابتزاز بالصور** | |
| Disclosure (a pupil telling an adult) | **الإفصاح** | |
| Spiral curriculum | **المنهج الحلزوني** | |
| Asset; likelihood and impact | **الأصل** (plural **الأصول**); **الاحتمال والأثر** | |
| Cyber lead; safeguarding lead | **مسؤول الأمن السيبراني**; **مسؤول حماية الطلاب** | |
| Control (in cyber risk) | **الإجراء الوقائي** for now; open: it reads oddly for controls that detect or recover | |
| Cipher | **الشيفرة** (MSA, as the lab), **الشفرة** (ar-EG) | |
| Retention (how long data is kept); purpose | **مدة الاحتفاظ**; **الغرض** | |
| Recalibration | **إعادة المعايرة** | |
| Default password | **كلمة المرور الافتراضية** (MSA), **باسورد افتراضي** (ar-EG; see the open password question) | |
| Baseline; decision matrix | **خط الأساس**; **مصفوفة القرار** | |
| Measurable question; success measure | **سؤال قابل للقياس**; **مقياس النجاح** | |
| Pilot (a small first trial) | **التجربة الأولية** (MSA), **التجربة** (ar-EG) | |
| False alarm; miss | **الإنذار الكاذب**; **الحالة الفائتة** (the `threshold` lab; ar-EG «حاجة فاتت») | |
| Miss rate; false alarm rate; error rate | **نسبة الفوات** (as `ds-3-1`, `ds-4-1`); **نسبة الإنذار الكاذب**; **نسبة الخطأ** | |
| Population (statistics); random sample; margin of error | **المجتمع**; **العينة العشوائية**; **هامش الخطأ** | |
| Fair trial; comparison group; effect | **التجربة العادلة**; **مجموعة المقارنة**; **الأثر** | |
| Big O; linear, quadratic, logarithmic | **O الكبيرة**; **خطّي**, **تربيعي**, **لوغاريتمي** | |
| Base case; call stack; memoisation | **الحالة الأساسية**; **مكدّس الاستدعاءات**; **تذكّر النتائج** | |
| Stack; queue | **المكدّس**; **الطابور**; LIFO/FIFO as the `stack` lab: «آخر من يدخل أول من يخرج» / «أول من يدخل أول من يخرج» | |
| Test-first; refactor; code review | **الاختبار أولًا**; **التحسين**; **مراجعة الكود** | |
| University shuttle; dorm | **حافلة الجامعة** / **السكن الجامعي** (MSA), **أتوبيس الجامعة** / **المدينة الجامعية** (ar-EG) | |
| Process evidence | **أدلّة مراحل العمل** (ar-EG «أدلة على مراحل الشغل») | |
| Adaptive attack | **الهجوم المتكيّف** | |
| Sensitivity (differential privacy) | **الحساسية** | |
| Privacy budget | **ميزانية الخصوصية** | |
| Availability attack | **هجوم الإتاحة** | |
| Red-team scope | **نطاق الفريق الأحمر** | |
| Membership inference | **استدلال العضوية** (the `leak` lab's word) | استنتاج العضوية |
| Tier (a price band) | **الشريحة**, plural **الشرائح**. In kit titles «شرائح» means slides: a lesson about tiers says «شرائح السعر» | |

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
- **One word, or the Egyptian word in the video and the standard word in the text? (open, 2026-11-15).** The rule
  above says one word, but several pairs already differ by register across the courses: chatbot («شات بوت» in 36
  videos, «روبوت الدردشة» in the text), spreadsheet («الشيت» / «جدول البيانات»), whole number («رقم صحيح» /
  «عدد صحيح»), decimal («رقم عشري» / «عدد عشري»), and since the Programming module courses loop («لوب» /
  «حلقة»), list («الليست» / «القائمة») and microscope («ميكروسكوب» / «المجهر»). LED and password are already allowed to differ. The user's call;
  until then, keep each course as it is.
- **Currency (iot-1-2-2):** naira and CFA francs stay as in the packs, until the user decides otherwise.
- **CO₂ thresholds (iot-3-1, iot-4-1, iot-s3):** open the windows above 1,000 ppm; below 800 is well aired; above 1,500 the air is already poor. The user can still overrule this.

## Where this file is used

- Every Arabic fix in `content/units/*.json` and `content/darsi/**/ar-EG.json` and the storyboards in `H:\htdocs\lessonstudio\content\darsi\`.
- The reviewers' proposals (in `H:\htdocs\lessonstudio\out\validation\REPORT.md`) are suggestions. Apply them through this glossary.
- Any Arabic term that is not in the table: add it here first, with the reason.
