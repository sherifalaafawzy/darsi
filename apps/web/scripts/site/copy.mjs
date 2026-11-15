/**
 * The public pages' handwritten copy (TECHNICAL.md "Public pages"). Rules, because AI answer engines quote these pages:
 * - Every number about Darsi is a {placeholder} counted at build time (features.mjs `facts`), never typed.
 * - Every claim about Darsi is something the app does today (README.md, TECHNICAL.md); nothing that is planned or off.
 * - Every figure about the world names its source, which is listed with a link (why.mjs).
 * - Arabic is Modern Standard, friendly (docs/curriculum/ar-lingo.md), never "·" as a separator.
 * Marks: [words](/path) is a link, **words** is bold.
 */
export const FEATURES_INDEX = {
  title: { en: "What Darsi does: features for teachers, students and schools", ar: "ماذا يقدّم «درسي»: مزايا للمعلمين والطلاب والمدارس" },
  h1: { en: "What Darsi does", ar: "ماذا يقدّم «درسي»" },
  description: {
    en: "How Darsi works: {courses} free courses in {courseTracks}, hands-on labs, classroom kits and offline use on low-cost phones, in English and Arabic.",
    ar: "كيف يعمل «درسي»: {courses} مجانية في {courseTracks}، ومختبرات تفاعلية، وحقائب للفصل، واستخدام دون اتصال على الهواتف منخفضة التكلفة، بالعربية والإنجليزية.",
  },
  lead: {
    en: ["Darsi is built for teachers who learn on one phone, with costly data and little time, and who then teach what they learned. Each page here explains one part of it."],
    ar: ["صُمّم «درسي» لمعلم يتعلّم على هاتف واحد، ببيانات مكلفة ووقت قليل، ثم يدرّس ما تعلّمه. وكل صفحة هنا تشرح جزءًا منه."],
  },
};

const LESSONS = {
  title: { en: "How a Darsi lesson works: video, practice, a lab and a classroom project", ar: "كيف يعمل درس «درسي»: فيديو وتدريب ومختبر ومشروع للفصل" },
  h1: { en: "How a lesson works", ar: "كيف يعمل الدرس" },
  description: {
    en: "Most Darsi lessons take {lessonRange}: a narrated video, a short reading, practice with feedback that explains why, a hands-on lab and a project to try in class. In English and Arabic, offline too.",
    ar: "تستغرق معظم دروس «درسي» {lessonRange}: فيديو مشروح بالصوت، وقراءة قصيرة، وتدريب مع تعليق يشرح السبب، ومختبر تفاعلي، ومشروع تجرّبه في الفصل. بالعربية والإنجليزية، ودون اتصال أيضًا.",
  },
  lead: {
    en: [
      "Every lesson in Darsi has the same shape, so a teacher always knows what comes next: a short narrated video, a reading with the key terms, practice questions around a hands-on lab, a project for a real classroom, a short reflection, and one thing to try in class tomorrow.",
      "Most lessons take {lessonRange}. Darsi's published courses hold {lessons} and {videos}.",
    ],
    ar: [
      "لكل درس في «درسي» الشكل نفسه، فيعرف المعلم دائمًا ما الذي يأتي بعد ذلك: فيديو قصير مشروح بالصوت، ثم قراءة مع المصطلحات الأساسية، ثم أسئلة تدريب حول مختبر تفاعلي، ثم مشروع لفصل حقيقي، وتأمّل قصير، وشيء واحد تجرّبه في الفصل غدًا.",
      "تستغرق معظم الدروس {lessonRange}، وفي الدورات المنشورة على «درسي» {lessons} و{videos}.",
    ],
  },
  cta: { page: "courses", en: "See the courses", ar: "تصفّح الدورات" },
  sections: [
    {
      id: "steps",
      h2: { en: "Step by step", ar: "خطوة بخطوة" },
      list: {
        en: [
          "**The video.** Most run {videoRange}, narrated in English or in Egyptian Arabic, with captions. A question pauses it partway, so learners check they followed.",
          "**The reading.** The same ideas in writing, with the key terms explained. Anyone who would rather not stream the video can read its transcript instead: a lesson never waits for a video.",
          "**Practice.** {kindsN}, among them {kindList}. Every answer is explained, and a question answered wrongly comes back once at the end of the lesson.",
          "**A lab.** Most lessons include one of Darsi's [hands-on labs](/features/labs/), where you change something and watch what happens.",
          "**A project.** A task for the teacher's own class, or a piece of work for a student, which a person reviews. See [projects and certificates](/features/projects/).",
          "**Reflect, then try it.** A short written reflection goes to your notes, and the lesson ends with one thing to try in class tomorrow (for students, this week).",
        ],
        ar: [
          "**الفيديو.** مدة معظمها {videoRange}، مشروحة بالصوت بالإنجليزية أو بالعامية المصرية، مع ترجمة مكتوبة. ويتوقف الفيديو عند سؤال في منتصفه، ليتأكد المتعلّم أنه تابع.",
          "**القراءة.** الأفكار نفسها مكتوبة، مع شرح المصطلحات الأساسية. ومن لا يريد تشغيل الفيديو عبر الإنترنت يستطيع قراءة نصه بدلًا منه، فالدرس لا ينتظر الفيديو أبدًا.",
          "**التدريب.** {kindsN}، منها {kindList}. وتُشرح كل إجابة، والسؤال الذي أُجيب عنه خطأً يعود مرة أخرى في آخر الدرس.",
          "**مختبر.** يضم معظم الدروس أحد [المختبرات التفاعلية](/ar/features/labs/) في «درسي»، حيث تغيّر شيئًا وتشاهد ما يحدث.",
          "**مشروع.** مهمة لفصل المعلم نفسه، أو عمل يُنجزه الطالب، ويراجعه شخص. انظر [المشروعات والشهادات](/ar/features/projects/).",
          "**تأمّل، ثم جرّب.** يُحفظ تأمّل مكتوب قصير في ملاحظاتك، وينتهي الدرس بشيء واحد تجرّبه في الفصل غدًا (وللطلاب: هذا الأسبوع).",
        ],
      },
    },
    {
      id: "video",
      h2: { en: "Videos that cost little data", ar: "فيديوهات ببيانات قليلة" },
      p: {
        en: [
          "Darsi plays {lightShare} as a light lesson: the phone draws the pictures itself from a small file and plays the narration with them. A typical lesson video is about {lightKb} KB that way, against {mp4Mb} MB for the same video as an MP4 file, and it stays sharp on any screen. \"Watch as a video file\" switches to the MP4 whenever that suits better.",
          "Quick checks inside the video ask a question at the right moment. Captions come in both languages, and the player has full screen and a portrait view for phones held upright.",
        ],
        ar: [
          "يشغّل «درسي» {lightShare} على هيئة «درس خفيف»: يرسم الهاتف الصور بنفسه من ملف صغير، ويشغّل معها الشرح الصوتي. فيصبح حجم فيديو الدرس المعتاد نحو {lightKb} كيلوبايت، مقابل {mp4Mb} ميغابايت للفيديو نفسه بصيغة MP4، ويبقى واضحًا على أي شاشة. ويحوّلك زر «شاهده ملفَّ فيديو» إلى نسخة MP4 متى كانت أنسب.",
          "وتطرح أسئلة سريعة داخل الفيديو سؤالًا في اللحظة المناسبة. والترجمة المكتوبة متاحة باللغتين، وفي المشغّل وضع ملء الشاشة وعرض رأسي للهاتف حين يُمسك عموديًا.",
        ],
      },
    },
    {
      id: "progress",
      h2: { en: "Progress that encourages", ar: "تقدّم يشجّع" },
      list: {
        en: [
          "**Streaks count weeks, not days.** You set a weekly goal, so a busy day never breaks a streak.",
          "**Mistakes come back for another try.** A wrong answer is explained, then asked again at the end of the lesson.",
          "**A lesson in progress waits for you.** Close the app mid-lesson and it opens where you were, for up to a day.",
          "**Reminders only if you want them.** Turn them on for your phone, at most one a day, at the hour you choose, and never worded to make you feel guilty.",
        ],
        ar: [
          "**سلسلة التعلّم تُحسب بالأسابيع لا بالأيام.** تختار هدفًا أسبوعيًا، فلا يقطع يوم مزدحم سلسلتك.",
          "**الأخطاء تعود لمحاولة أخرى.** تُشرح الإجابة الخطأ، ثم يُطرح السؤال مرة أخرى في آخر الدرس.",
          "**الدرس الذي بدأته ينتظرك.** أغلق التطبيق في منتصف الدرس، فيُفتح حيث توقفت، لمدة تصل إلى يوم.",
          "**تذكيرات عند الطلب فقط.** فعّلها لهاتفك، تذكيرًا واحدًا في اليوم على الأكثر، في الساعة التي تختارها، ودون كلمات تُشعرك بالذنب.",
        ],
      },
    },
    {
      id: "access",
      h2: { en: "For every learner", ar: "لكل متعلّم" },
      list: {
        en: [
          "**Sunlight mode** gives high contrast for outdoor classrooms.",
          "**Read aloud** reads the step on screen with the phone's own voice, where the phone has one for the language.",
          "**Screen readers** hear each new step's heading and every explanation.",
          "**Typed answers are forgiving.** Capital letters and Arabic diacritics don't count against you, and Arabic digits are read as numbers.",
        ],
        ar: [
          "**وضع ضوء الشمس** يرفع التباين للفصول في الهواء الطلق.",
          "**القراءة بصوت عالٍ** تقرأ الخطوة الظاهرة على الشاشة بصوت الهاتف نفسه، إن كان في الهاتف صوت لتلك اللغة.",
          "**قارئات الشاشة** تسمع عنوان كل خطوة جديدة وكل شرح.",
          "**الإجابات المكتوبة متسامحة.** لا تُحسب عليك الحروف الكبيرة ولا التشكيل، وتُقرأ الأرقام العربية أرقامًا.",
        ],
      },
    },
  ],
  faq: {
    en: [
      ["How long is a Darsi lesson?", "Most take {lessonRange}, video included. Each lesson stands on its own, so you can take one in a break and the next on another day."],
      ["Can I skip the video?", "Yes. Open the transcript and read it instead, which saves data; the video's question sits with the transcript. If a video can't load, the lesson switches to the transcript by itself."],
      ["What happens when I get an answer wrong?", "You see why, and the question comes back once at the end of the lesson. Nothing resets and nothing is lost."],
      ["Do lessons work offline?", "Yes. Download a course on Wi-Fi and its lessons, videos and classroom kits work with no signal. Progress is saved on the phone and syncs when a connection returns."],
    ],
    ar: [
      ["كم يستغرق درس «درسي»؟", "تستغرق معظم الدروس {lessonRange}، والفيديو منها. وكل درس قائم بذاته، فيمكنك أن تأخذ درسًا في استراحة، والدرس التالي في يوم آخر."],
      ["هل يمكنني تخطّي الفيديو؟", "نعم. افتح نص الفيديو واقرأه بدلًا منه، فهذا يوفّر البيانات، وسؤال الفيديو موجود مع النص. وإن لم يُحمَّل الفيديو، ينتقل الدرس إلى النص من تلقاء نفسه."],
      ["ماذا يحدث إذا أخطأت في إجابة؟", "ترى سبب الخطأ، ويعود السؤال مرة واحدة في آخر الدرس. لا شيء يُعاد من البداية، ولا شيء يضيع."],
      ["هل تعمل الدروس دون اتصال؟", "نعم. نزّل الدورة عبر Wi-Fi، فتعمل دروسها وفيديوهاتها وحقائب الفصل فيها دون إشارة. ويُحفظ تقدّمك على الهاتف ويُزامَن عند عودة الاتصال."],
    ],
  },
};

const OFFLINE = {
  title: { en: "Darsi offline: built for low-cost phones and costly mobile data", ar: "«درسي» دون اتصال: مصمَّم للهواتف منخفضة التكلفة والبيانات المكلفة" },
  h1: { en: "Built for old phones and costly data", ar: "مصمَّم للهواتف القديمة والبيانات المكلفة" },
  description: {
    en: "Darsi opens with no signal after the first visit, downloads a course in about {avgMb} MB on average, shows every size before it downloads, and stays light on battery and storage. Here is how.",
    ar: "يُفتح «درسي» دون إشارة بعد الزيارة الأولى، ويُنزَّل متوسط الدورة في نحو {avgMb} ميغابايت، ويعرض كل حجم قبل التنزيل، ويبقى خفيفًا على البطارية والتخزين. وهذا كيف.",
  },
  lead: {
    en: [
      "Many teachers learn on one Android phone, often shared with the family, with data paid for by the megabyte. Darsi is built for that phone first.",
      "After the first visit, the app opens with no signal at all. A downloaded course keeps working offline: its lessons, videos, labs and classroom kits. Progress is saved on the phone and syncs when a connection returns.",
    ],
    ar: [
      "يتعلّم كثير من المعلمين على هاتف أندرويد واحد، يتشاركونه غالبًا مع الأسرة، ويدفعون ثمن البيانات بالميغابايت. و«درسي» مصمَّم لهذا الهاتف أولًا.",
      "بعد الزيارة الأولى يُفتح التطبيق دون أي إشارة. والدورة المنزَّلة تبقى تعمل دون اتصال: دروسها وفيديوهاتها ومختبراتها وحقائب الفصل فيها. ويُحفظ التقدّم على الهاتف ويُزامَن عند عودة الاتصال.",
    ],
  },
  cta: { href: "/", en: "Open Darsi", ar: "افتح «درسي»" },
  sections: [
    {
      id: "data",
      h2: { en: "Every megabyte counts", ar: "كل ميغابايت مهم" },
      list: {
        en: [
          "**Sizes before downloads.** A course shows its download size in your language before you tap (on average {avgMb} MB), and it downloads your language only.",
          "**Data saver respected.** On mobile data with Data saver on, Darsi asks before a download starts.",
          "**Light lessons.** A typical lesson video drawn by the phone is about {lightKb} KB, against {mp4Mb} MB as an MP4 file. [How lessons work](/features/lessons/).",
          "**Read instead of stream.** Every video has a transcript, which costs almost nothing to open.",
          "**Only your fonts.** Each phone keeps only the fonts of its own language.",
          "**Photos made smaller first.** Project photos are shrunk on the phone before they are sent.",
          "**No account code for guests.** Visitors who never sign in never download the code for accounts and syncing.",
        ],
        ar: [
          "**الحجم قبل التنزيل.** تعرض الدورة حجم تنزيلها بلغتك قبل أن تضغط (متوسطه {avgMb} ميغابايت)، ولا تُنزِّل إلا لغتك.",
          "**احترام توفير البيانات.** على بيانات الهاتف مع تشغيل «توفير البيانات» يسألك «درسي» قبل أن يبدأ التنزيل.",
          "**الدروس الخفيفة.** فيديو الدرس المعتاد الذي يرسمه الهاتف نحو {lightKb} كيلوبايت، مقابل {mp4Mb} ميغابايت بصيغة MP4. [كيف يعمل الدرس](/ar/features/lessons/).",
          "**اقرأ بدلًا من التشغيل.** لكل فيديو نص مكتوب، وفتحه لا يكاد يكلّف شيئًا.",
          "**خطوط لغتك فقط.** يحتفظ كل هاتف بخطوط لغته وحدها.",
          "**تصغير الصور أولًا.** تُصغَّر صور المشروعات على الهاتف قبل إرسالها.",
          "**لا كود للحسابات عند الزائر.** من لا يسجّل الدخول أبدًا لا يُنزِّل أبدًا كود الحسابات والمزامنة.",
        ],
      },
    },
    {
      id: "battery",
      h2: { en: "Light on battery", ar: "خفيف على البطارية" },
      list: {
        en: [
          "**No live connections, no polling.** The app reads your progress once when you sign in, and sends only what changed.",
          "**Nothing plays by itself.** Videos and lab animations start when you press play, and lab animations stop by themselves.",
        ],
        ar: [
          "**لا اتصالات مفتوحة ولا استطلاع متكرر.** يقرأ التطبيق تقدّمك مرة واحدة عند تسجيل الدخول، ولا يرسل إلا ما تغيّر.",
          "**لا شيء يعمل من تلقاء نفسه.** تبدأ الفيديوهات ورسوم المختبرات المتحركة حين تضغط تشغيل، وتتوقف رسوم المختبرات من تلقاء نفسها.",
        ],
      },
    },
    {
      id: "storage",
      h2: { en: "Kind to a full phone", ar: "رفيق بالهاتف الممتلئ" },
      list: {
        en: [
          "**Stored only when used.** Labs, the Python and SQL runtimes and lesson videos are saved only when you open or download them.",
          "**Not enough space? It says so.** A download that won't fit stops, says so, and removes what it saved.",
          "**Remove a course** to free its space. Your progress stays.",
          "**Updates wait for you.** A new version of Darsi waits for you to tap Reload, never in the middle of a lesson, and courses you downloaded stay ready offline.",
        ],
        ar: [
          "**لا يُحفظ إلا ما تستخدمه.** المختبرات وبيئتا بايثون وSQL وفيديوهات الدروس لا تُحفظ إلا حين تفتحها أو تنزّلها.",
          "**لا توجد مساحة كافية؟ يخبرك بذلك.** التنزيل الذي لا يتّسع له الهاتف يتوقف، ويخبرك، ويحذف ما حفظه.",
          "**احذف دورة** لتحرير مساحتها، ويبقى تقدّمك كما هو.",
          "**التحديثات تنتظرك.** ينتظر الإصدار الجديد من «درسي» أن تضغط «تحديث»، ولا يقاطع أي درس، وتبقى الدورات التي نزّلتها جاهزة دون اتصال.",
        ],
      },
    },
    {
      id: "phones",
      h2: { en: "On the phones teachers have", ar: "على الهواتف التي يملكها المعلمون" },
      list: {
        en: [
          "**No app store needed.** Darsi runs in the phone's browser, and can be added to the home screen, where it opens like an app.",
          "**Older phones too.** A second, compatible version of the app is built for older browsers.",
          "**Start without an account.** Begin as a guest; create a free account later and your progress comes with you.",
        ],
        ar: [
          "**لا حاجة إلى متجر تطبيقات.** يعمل «درسي» في متصفح الهاتف، ويمكن إضافته إلى الشاشة الرئيسية، فيُفتح منها كأي تطبيق.",
          "**والهواتف القديمة أيضًا.** تُبنى من التطبيق نسخة ثانية متوافقة مع المتصفحات القديمة.",
          "**ابدأ دون حساب.** ابدأ كزائر، وحين تنشئ حسابًا مجانيًا لاحقًا ينتقل معك تقدّمك.",
        ],
      },
    },
  ],
  faq: {
    en: [
      ["Does Darsi work without the internet?", "Yes. After the first visit the app opens with no signal. Download a course on Wi-Fi and its lessons, videos and kits work offline; labs are saved the first time they open, or all at once."],
      ["How much data does a course use?", "On average {avgMb} MB in your language, shown before you download. Reading transcripts instead of watching videos uses even less."],
      ["Which phones does Darsi run on?", "Android phones and iPhones, old and new, as well as tablets and computers. It is built for low-cost Android phones first."],
      ["Do I need to install anything?", "No. Open darsiai.org in the phone's browser. You can add it to the home screen to open it like an app."],
    ],
    ar: [
      ["هل يعمل «درسي» دون إنترنت؟", "نعم. بعد الزيارة الأولى يُفتح التطبيق دون إشارة. نزّل الدورة عبر Wi-Fi فتعمل دروسها وفيديوهاتها وحقائبها دون اتصال، وتُحفظ المختبرات أول مرة تُفتح، أو كلها مرة واحدة."],
      ["كم تستهلك الدورة من البيانات؟", "{avgMb} ميغابايت في المتوسط بلغتك، ويظهر الحجم قبل التنزيل. وقراءة نصوص الفيديوهات بدلًا من مشاهدتها تستهلك أقل من ذلك."],
      ["على أي هواتف يعمل «درسي»؟", "على هواتف أندرويد وآيفون، القديمة والحديثة، وعلى الأجهزة اللوحية والحواسيب. وهو مصمَّم لهواتف أندرويد منخفضة التكلفة أولًا."],
      ["هل أحتاج إلى تثبيت شيء؟", "لا. افتح darsiai.org في متصفح الهاتف، ويمكنك إضافته إلى الشاشة الرئيسية لتفتحه كأي تطبيق."],
    ],
  },
};

const LANGUAGES = {
  title: { en: "Darsi in English and Arabic: designed right to left, not translated", ar: "«درسي» بالعربية والإنجليزية: مصمَّم من اليمين إلى اليسار، لا مترجَم" },
  h1: { en: "English and Arabic, both first", ar: "العربية والإنجليزية، كلتاهما أولًا" },
  description: {
    en: "Every Darsi course, lab and classroom kit is in English and Arabic. Videos are narrated in English and Egyptian Arabic, Arabic screens are designed right to left, and numbers, code and formulas read the right way.",
    ar: "كل دورات «درسي» ومختبراته وحقائب الفصل فيه بالعربية والإنجليزية. الفيديوهات مشروحة بالإنجليزية وبالعامية المصرية، والشاشات العربية مصمَّمة من اليمين إلى اليسار، والأرقام والكود والمعادلات تُقرأ في اتجاهها الصحيح.",
  },
  lead: {
    en: [
      "Most technology training is in English. Darsi treats Arabic as a first language: every screen, course, lab and classroom kit exists in both, and Arabic pages are laid out right to left from the start, not mirrored afterwards.",
      "You can switch language at any time in Me, and the lesson, its video and its kit follow.",
    ],
    ar: [
      "معظم التدريب التقني بالإنجليزية. أما «درسي» فيعامل العربية لغةً أولى: كل شاشة ودورة ومختبر وحقيبة فصل موجودة باللغتين، والصفحات العربية مبنية من اليمين إلى اليسار من البداية، لا معكوسة لاحقًا.",
      "يمكنك تغيير اللغة في أي وقت من «حسابي»، فيتبعك الدرس وفيديوهه وحقيبته.",
    ],
  },
  cta: { href: "/", en: "Open Darsi", ar: "افتح «درسي»" },
  sections: [
    {
      id: "arabic",
      h2: { en: "Arabic done properly", ar: "عربية متقنة" },
      list: {
        en: [
          "**Two registers, on purpose.** Course text is friendly Modern Standard Arabic; the videos are narrated in Egyptian Arabic, the way a colleague would explain it.",
          "**One word per idea.** A glossary keeps each technical term the same in the narration, the course text and the labs.",
          "**Arabic numerals where Arabic is read.** Arabic pages show Arabic digits, and counted words agree with their numbers.",
          "**Code and formulas keep their direction.** Python, SQL, formulas and web addresses inside Arabic sentences stay left to right, so they never read backwards.",
          "**Answers in either digits.** Typed answers with Arabic digits or without diacritics are marked correctly, and code typed on an Arabic keyboard has its digits and commas fixed before it runs.",
        ],
        ar: [
          "**مستويان من العربية، عن قصد.** نصوص الدورات بفصحى ودودة، والفيديوهات مشروحة بالعامية المصرية، كما يشرح زميل لزميله.",
          "**كلمة واحدة لكل مفهوم.** يحافظ مسرد للمصطلحات على كل مصطلح تقني كما هو في الشرح الصوتي ونص الدورة والمختبرات.",
          "**أرقام عربية حيث تُقرأ العربية.** تعرض الصفحات العربية الأرقام العربية، وتتوافق الكلمات المعدودة مع أعدادها.",
          "**الكود والمعادلات في اتجاهها.** يبقى كود بايثون وSQL والمعادلات وعناوين المواقع داخل الجمل العربية من اليسار إلى اليمين، فلا تُقرأ معكوسة أبدًا.",
          "**الإجابات بأي أرقام.** تُصحَّح الإجابات المكتوبة بالأرقام العربية أو دون تشكيل تصحيحًا سليمًا، ويُصلَح ما يُكتب من أرقام وفواصل بلوحة المفاتيح العربية في الكود قبل تشغيله.",
        ],
      },
    },
    {
      id: "everything",
      h2: { en: "Every part, in both languages", ar: "كل جزء باللغتين" },
      list: {
        en: [
          "**Videos and captions,** narrated and captioned separately in each language, so the timing fits each one.",
          "**Labs:** every lab's words, examples and results. [See the labs](/features/labs/).",
          "**Classroom kits:** slides, lesson plans and question sheets in each language; Arabic PowerPoint slides run right to left. [See the kits](/features/kits/).",
          "**Reports for schools,** in the language of the admin who reads them.",
        ],
        ar: [
          "**الفيديوهات والترجمة المكتوبة،** مشروحة ومترجمة لكل لغة على حدة، فيناسب التوقيت كل لغة.",
          "**المختبرات:** كلمات كل مختبر وأمثلته ونتائجه. [تعرّف على المختبرات](/ar/features/labs/).",
          "**حقائب الفصل:** شرائح وخطط دروس وأوراق أسئلة بكل لغة، وشرائح PowerPoint العربية من اليمين إلى اليسار. [تعرّف على الحقائب](/ar/features/kits/).",
          "**تقارير المدارس،** بلغة المشرف الذي يقرؤها.",
        ],
      },
    },
    {
      id: "more",
      h2: { en: "More languages", ar: "لغات أخرى" },
      p: {
        en: ["Darsi's team can translate the app's screens into another language without a new version of the app, and right-to-left languages such as Persian and Urdu are laid out right to left. Courses and labs are written in English and Arabic."],
        ar: ["يستطيع فريق «درسي» ترجمة شاشات التطبيق إلى لغة أخرى دون إصدار جديد من التطبيق، وتُعرض اللغات التي تُكتب من اليمين إلى اليسار، مثل الفارسية والأردية، من اليمين إلى اليسار. أما الدورات والمختبرات فمكتوبة بالعربية والإنجليزية."],
      },
    },
  ],
  faq: {
    en: [
      ["Is Darsi available in Arabic?", "Yes, completely: the app, every course, every lab and every classroom kit. Videos are narrated in Egyptian Arabic and the course text is Modern Standard Arabic."],
      ["Can I switch between English and Arabic?", "Yes, at any time, from Me. Your progress is the same in both."],
      ["Are the Arabic videos a translation?", "No. Each language is narrated on its own, with its own captions and timing."],
    ],
    ar: [
      ["هل «درسي» متاح بالعربية؟", "نعم، بالكامل: التطبيق، وكل دورة، وكل مختبر، وكل حقيبة فصل. والفيديوهات مشروحة بالعامية المصرية، ونصوص الدورات بالفصحى."],
      ["هل يمكنني التبديل بين العربية والإنجليزية؟", "نعم، في أي وقت، من «حسابي»، وتقدّمك هو نفسه في اللغتين."],
      ["هل الفيديوهات العربية مترجمة؟", "لا. كل لغة مشروحة بالصوت وحدها، بترجمتها المكتوبة وتوقيتها الخاصين بها."],
    ],
  },
};

const KITS = {
  title: { en: "Classroom kits: slides, lesson plans and question sheets, free to copy", ar: "حقائب الفصل: شرائح وخطط دروس وأوراق أسئلة، يُسمح بنسخها مجانًا" },
  h1: { en: "Classroom kits", ar: "حقائب الفصل" },
  description: {
    en: "A classroom kit comes with {kitShare} in Darsi's courses: slides as PDF and editable PowerPoint, a lesson plan and a question sheet with its answers, in English and Arabic, free to copy for your school.",
    ar: "تأتي حقيبة للفصل مع {kitShare} في دورات «درسي»: شرائح بصيغة PDF وPowerPoint قابلة للتعديل، وخطة درس، وورقة أسئلة مع إجاباتها، بالعربية والإنجليزية، ويُسمح بنسخها لمدرستك مجانًا.",
  },
  lead: {
    en: [
      "Learning a subject is one thing; teaching it the next morning is another. So a classroom kit comes with {kitShare} in Darsi's courses: the lesson's slides, a lesson plan, and a sheet of questions for the class, with the answers on their own page.",
      "Kits are in English and Arabic, and you may copy them for your school free of charge.",
    ],
    ar: [
      "أن تتعلّم مادة شيء، وأن تدرّسها صباح اليوم التالي شيء آخر. لهذا تأتي حقيبة للفصل مع {kitShare} في دورات «درسي»: شرائح الدرس، وخطة الدرس، وورقة أسئلة للفصل، وإجاباتها في صفحة مستقلة.",
      "الحقائب بالعربية والإنجليزية، ويُسمح لك بنسخها لمدرستك مجانًا.",
    ],
  },
  cta: { page: "courses", en: "Find a course and its kits", ar: "اعثر على دورة وحقائبها" },
  sections: [
    {
      id: "inside",
      h2: { en: "What is in a kit", ar: "ماذا في الحقيبة" },
      list: {
        en: [
          "**Slides,** as a PDF to show or print and as a PowerPoint file you can edit. Arabic slides run right to left, in a font every school computer has.",
          "**A lesson plan:** what the activity needs, every step of it, and how long it really takes.",
          "**A question sheet** with the lesson's questions to copy for the class, and the answers on a separate page so the copies stay clean.",
          "**Pages counted.** Each course page here lists every kit file with its number of pages, before you print.",
        ],
        ar: [
          "**الشرائح،** بصيغة PDF للعرض أو الطباعة، وبصيغة PowerPoint التي يمكنك تعديلها. والشرائح العربية من اليمين إلى اليسار، بخط موجود في كل حاسوب مدرسي.",
          "**خطة الدرس:** ما يحتاج إليه النشاط، وكل خطوة فيه، والوقت الذي يستغرقه فعلًا.",
          "**ورقة أسئلة** فيها أسئلة الدرس لنسخها للفصل، والإجابات في صفحة مستقلة لتبقى النسخ نظيفة.",
          "**عدد الصفحات معروف.** تعرض كل صفحة دورة هنا ملفات الحقيبة وعدد صفحات كل ملف، قبل أن تطبع.",
        ],
      },
    },
    {
      id: "who",
      h2: { en: "Written for whoever holds the paper", ar: "مكتوبة لمن يمسك الورقة" },
      p: {
        en: ["A sheet speaks to whoever answers it: pupils in a teacher's class, the teacher practising on their own, university students working in groups, or a student revising alone. Students' courses come with revision slides and activity sheets of their own."],
        ar: ["تخاطب الورقة من يجيب عنها: تلاميذ في فصل المعلم، أو المعلم وهو يتدرّب وحده، أو طلاب جامعة يعملون في مجموعات، أو طالب يراجع وحده. ولدورات الطلاب شرائح للمراجعة وأوراق أنشطة خاصة بهم."],
      },
    },
    {
      id: "class",
      h2: { en: "Made for real classrooms", ar: "مصمَّمة لفصول حقيقية" },
      list: {
        en: [
          "**Prepare the night before.** Each lesson plan lists what its activity needs.",
          "**Sheets that don't give the answer away.** Ordering and matching questions are printed shuffled.",
          "**In your pocket.** A downloaded course keeps its kits on the phone, to open with no signal.",
          "**Free to copy** for your school.",
        ],
        ar: [
          "**استعدّ في الليلة السابقة.** تذكر كل خطة درس ما يحتاج إليه نشاطها.",
          "**أوراق لا تكشف الإجابة.** تُطبع أسئلة الترتيب والتوصيل بترتيب عشوائي.",
          "**في جيبك.** تبقى حقائب الدورة المنزَّلة على الهاتف، لتفتحها دون إشارة.",
          "**يُسمح بنسخها مجانًا** لمدرستك.",
        ],
      },
    },
  ],
  faq: {
    en: [
      ["Are the classroom kits free?", "Yes. Kits come with the courses, which are free, and you may copy them for your school."],
      ["Can I edit the slides?", "Yes. The slides come as a PowerPoint file you can open and change, as well as a PDF."],
      ["Where do I find a lesson's kit?", "In Darsi, teachers find every kit under Kit, and students at the end of each lesson. Each course page here lists them lesson by lesson."],
    ],
    ar: [
      ["هل حقائب الفصل مجانية؟", "نعم. الحقائب تأتي مع الدورات، وهي مجانية، ويُسمح لك بنسخها لمدرستك."],
      ["هل يمكنني تعديل الشرائح؟", "نعم. تأتي الشرائح ملفَّ PowerPoint يمكنك فتحه وتغييره، إلى جانب ملف PDF."],
      ["أين أجد حقيبة الدرس؟", "في «درسي» يجد المعلمون كل الحقائب في قسم «الحقيبة»، ويجدها الطلاب في نهاية كل درس. وتعرضها كل صفحة دورة هنا درسًا درسًا."],
    ],
  },
};

const CODE = {
  title: { en: "Code on the phone: Python and SQL exercises that run offline", ar: "البرمجة على الهاتف: تمارين بايثون وSQL تعمل دون اتصال" },
  h1: { en: "Code that runs on the phone", ar: "كود يعمل على الهاتف" },
  description: {
    en: "Darsi's courses have {codeSteps} in Python and SQL that run on the phone itself, with no server and no laptop: write and run programs, put lines in order, fill the gaps and find the bug.",
    ar: "في دورات «درسي» {codeSteps} ببايثون وSQL تعمل على الهاتف نفسه، دون خادم ودون حاسوب محمول: اكتب برامج وشغّلها، ورتّب الأسطر، وأكمل الفراغات، واعثر على الخطأ.",
  },
  lead: {
    en: [
      "Programming is learned by writing programs. In Darsi, a code exercise runs real Python or SQL on the phone itself, checks the result against tests, and works offline once the course is downloaded.",
      "The published courses hold {codeSteps} in {codeCourses}.",
    ],
    ar: [
      "تُتعلَّم البرمجة بكتابة البرامج. وفي «درسي» يشغّل تمرين البرمجة كود بايثون أو SQL حقيقيًا على الهاتف نفسه، ويتحقق من النتيجة بالاختبارات، ويعمل دون اتصال بعد تنزيل الدورة.",
      "في الدورات المنشورة {codeSteps} في {codeCourses}.",
    ],
  },
  cta: { page: "courses/code", en: "See the programming courses", ar: "تصفّح دورات البرمجة" },
  sections: [
    {
      id: "kinds",
      h2: { en: "Kinds of code exercise", ar: "أنواع تمارين البرمجة" },
      list: {
        en: [
          "**Write and run.** Write a program in Python or a query in SQL; Darsi runs it against the exercise's tests and shows what it printed.",
          "**Put the lines in order.** Move the lines of a program into place and indent them.",
          "**Fill the gaps.** Complete a program by filling in its missing parts.",
          "**Find the bug.** Tap the line with the mistake.",
        ],
        ar: [
          "**اكتب وشغّل.** اكتب برنامجًا ببايثون أو استعلامًا بـSQL، فيشغّله «درسي» على اختبارات التمرين ويعرض ما طبعه.",
          "**رتّب الأسطر.** ضع أسطر البرنامج في أماكنها وأزِحها إلى مستواها الصحيح.",
          "**أكمل الفراغات.** أكمل البرنامج بملء الأجزاء الناقصة منه.",
          "**اعثر على الخطأ.** اضغط على السطر الذي فيه الخطأ.",
        ],
      },
    },
    {
      id: "runtimes",
      h2: { en: "Real languages, small downloads", ar: "لغات حقيقية وتنزيلات صغيرة" },
      p: {
        en: [
          "Python runs in MicroPython, which speaks real Python 3, with numpy-style arrays. SQL runs in SQLite. Each is downloaded once, the first time a lesson needs it, and its size is shown first: {pyMb} MB for Python and {sqlMb} MB for SQL.",
          "Python in Darsi also has a virtual board with pins, sensors and lights for IoT, which plays back what a program did, and a small solver shaped like Google's OR-Tools for optimization, so the same programs run on the real thing.",
        ],
        ar: [
          "تعمل بايثون في MicroPython، وهي بايثون 3 حقيقية، مع مصفوفات على طريقة numpy. وتعمل SQL في SQLite. وتُنزَّل كل منهما مرة واحدة، أول مرة يحتاج إليها درس، ويظهر حجمها أولًا: {pyMb} ميغابايت لبايثون و{sqlMb} ميغابايت لـSQL.",
          "وفي بايثون داخل «درسي» لوحة افتراضية فيها منافذ ومستشعرات وأضواء لإنترنت الأشياء، تعيد عرض ما فعله البرنامج، وحلّال صغير على شكل OR-Tools من Google للحلول المثلى، فتعمل البرامج نفسها على الأداة الحقيقية.",
        ],
      },
    },
    {
      id: "safe",
      h2: { en: "Safe by design", ar: "آمن من الأساس" },
      list: {
        en: [
          "**Sealed off.** Code runs in a sandbox with no access to the internet, the page or your account.",
          "**A time limit.** A program that runs too long is stopped after a few seconds, and Stop works at any time.",
          "**Arabic keyboards welcome.** Arabic digits, commas and quotation marks typed on a phone keyboard become code before it runs, and the editor shows what ran.",
          "**Nothing to install.** No compiler, no laptop, no account.",
        ],
        ar: [
          "**معزول تمامًا.** يعمل الكود في بيئة معزولة لا تصل إلى الإنترنت ولا إلى الصفحة ولا إلى حسابك.",
          "**حدّ للوقت.** البرنامج الذي يطول تشغيله يتوقف بعد ثوانٍ قليلة، وزر الإيقاف يعمل في أي وقت.",
          "**لوحة المفاتيح العربية مرحَّب بها.** الأرقام والفواصل وعلامات التنصيص العربية المكتوبة بلوحة مفاتيح الهاتف تتحوّل إلى كود قبل التشغيل، ويعرض المحرّر ما شُغِّل فعلًا.",
          "**لا شيء لتثبيته.** لا مترجِم برمجي، ولا حاسوب محمول، ولا حساب.",
        ],
      },
    },
  ],
  courses: {
    h2: { en: "Courses with code exercises", ar: "دورات فيها تمارين برمجة" },
    p: { en: "{codeCourses}, with the kinds of exercise in each and how many.", ar: "{codeCourses}، مع أنواع التمارين في كل منها وعددها." },
  },
  faq: {
    en: [
      ["Which programming languages can I practise in Darsi?", "Python and SQL. Python runs in MicroPython, a version of Python 3 made for small devices, and SQL in SQLite."],
      ["Do code exercises need the internet?", "Only once, to download Python or SQL the first time a lesson needs it. After that they run offline."],
      ["Is my code checked automatically?", "Yes. Each exercise has tests; Darsi runs your program against them, tells you whether it passed, and shows what it printed."],
    ],
    ar: [
      ["ما لغات البرمجة التي يمكنني التدرّب عليها في «درسي»؟", "بايثون وSQL. تعمل بايثون في MicroPython، وهي نسخة من بايثون 3 مصمَّمة للأجهزة الصغيرة، وتعمل SQL في SQLite."],
      ["هل تحتاج تمارين البرمجة إلى الإنترنت؟", "مرة واحدة فقط، لتنزيل بايثون أو SQL أول مرة يحتاج إليها درس. وبعد ذلك تعمل دون اتصال."],
      ["هل يُصحَّح الكود تلقائيًا؟", "نعم. لكل تمرين اختبارات، يشغّل «درسي» برنامجك عليها، ويخبرك هل نجح، ويعرض ما طبعه."],
    ],
  },
};

const PROJECTS = {
  title: { en: "Projects, reviews and certificates in Darsi", ar: "المشروعات والمراجعة والشهادات في «درسي»" },
  h1: { en: "Projects, reviews and certificates", ar: "المشروعات والمراجعة والشهادات" },
  description: {
    en: "Darsi's courses have {projects} done in real classrooms, each sent to a person to review: a teacher, a school's admins or the Darsi team. Finish a course and you get a certificate of completion.",
    ar: "في دورات «درسي» {projects} تُنفَّذ في فصول حقيقية، ويُرسَل كل منها إلى شخص يراجعه: معلم، أو مشرفو المدرسة، أو فريق «درسي». وحين تُنهي دورة تحصل على شهادة إتمام.",
  },
  lead: {
    en: [
      "A Darsi lesson ends in the classroom, not on the screen. Most lessons set a project: a task to try with a class, or a piece of work for a student, sent with text, photos or files.",
      "Every project goes to a person to review. Learners in a school send theirs to their teacher or the school's admins; everyone else's goes to the Darsi team.",
    ],
    ar: [
      "ينتهي درس «درسي» في الفصل، لا على الشاشة. فمعظم الدروس تضع مشروعًا: مهمة تُجرَّب مع فصل، أو عملًا يُنجزه طالب، ويُرسَل نصًّا أو صورًا أو ملفات.",
      "ويذهب كل مشروع إلى شخص يراجعه. فالمتعلّمون في مدرسة يرسلون مشروعاتهم إلى معلمهم أو إلى مشرفي المدرسة، ومشروعات غيرهم تذهب إلى فريق «درسي».",
    ],
  },
  cta: { page: "courses", en: "See the courses", ar: "تصفّح الدورات" },
  sections: [
    {
      id: "projects",
      h2: { en: "How projects work", ar: "كيف تعمل المشروعات" },
      list: {
        en: [
          "**Real work.** Each project says what to do and what to hand in. Every course page here shows its projects.",
          "**Photos made smaller.** Photos are shrunk on the phone before they go, so sending one costs little data.",
          "**Feedback comes back.** The reviewer's notes appear under My projects in Me, with Send a new version.",
          "**Guests can still do it.** Without an account, a project can be done in class; a free account lets you send it for review.",
        ],
        ar: [
          "**عمل حقيقي.** يذكر كل مشروع ما المطلوب وما الذي تسلّمه، وتعرض كل صفحة دورة هنا مشروعاتها.",
          "**تصغير الصور.** تُصغَّر الصور على الهاتف قبل إرسالها، فلا يكلّف إرسالها إلا قليلًا من البيانات.",
          "**الملاحظات تصلك.** تظهر ملاحظات المراجِع في «مشاريعي» داخل «حسابي»، مع زر «أرسل نسخة جديدة».",
          "**والزائر يستطيع أيضًا.** دون حساب يمكن تنفيذ المشروع في الفصل، والحساب المجاني يتيح لك إرساله للمراجعة.",
        ],
      },
    },
    {
      id: "capstones",
      when: "capstones",
      h2: { en: "Capstone projects", ar: "المشروعات الختامية" },
      p: {
        en: ["Darsi has {capstones} for students at Intermediate level: real software built on their own computer, or in a free cloud workspace in a browser, in three parts and a series of milestones."],
        ar: ["في «درسي» {capstones} للطلاب في المستوى المتوسط: برمجيات حقيقية يبنونها على حواسيبهم، أو في مساحة عمل سحابية مجانية داخل المتصفح، في ثلاثة أجزاء وسلسلة من المراحل."],
      },
      list: {
        en: [
          "**Starter repositories** on GitHub set up every project, with steps for Windows, Mac or a browser.",
          "**Checks before a person reads it.** Sending a milestone checks the learner's public repository: that it exists, that its automated tests passed, and that the project's own check file passed that milestone.",
          "**An AI suggestion, a human decision.** An AI review may suggest scores against the rubric, labelled as a suggestion. A person decides, and a failed check caps what the AI may suggest.",
          "**No quiz, no score.** Capstones are not graded; the certificate needs every milestone sent.",
        ],
        ar: [
          "**مستودعات بداية** على GitHub تُهيّئ كل مشروع، مع خطوات لويندوز وماك والمتصفح.",
          "**فحوص قبل أن يقرأه شخص.** إرسال مرحلة يفحص مستودع المتعلّم العام: أنه موجود، وأن اختباراته الآلية نجحت، وأن ملف الفحص الخاص بالمشروع اجتاز تلك المرحلة.",
          "**اقتراح من الذكاء الاصطناعي، وقرار من إنسان.** قد تقترح مراجعة بالذكاء الاصطناعي درجات وفق معايير التقييم، موسومة بأنها اقتراح. والقرار لشخص، والفحص الذي لم ينجح يضع حدًا أعلى لما يقترحه الذكاء الاصطناعي.",
          "**لا اختبار ولا درجة.** المشروعات الختامية لا تُقيَّم بدرجات، والشهادة تتطلب إرسال كل المراحل.",
        ],
      },
      courses: "capstones",
      coursesLabel: { en: "The capstones:", ar: "المشروعات الختامية:" },
    },
    {
      id: "certificates",
      h2: { en: "Certificates", ar: "الشهادات" },
      list: {
        en: [
          "**One per course.** Finish every lesson of a course and Darsi records a certificate of completion, with your name, the course, the date and its own code.",
          "**Yours to keep.** Signed in, your certificates are kept with your account and come back on a new phone, even if the course is later taken down.",
          "**Your school's name on it.** In an organization, the certificate carries the organization's logo.",
        ],
        ar: [
          "**شهادة لكل دورة.** أنهِ كل دروس الدورة فيسجّل «درسي» شهادة إتمام، باسمك واسم الدورة والتاريخ ورمز خاص بها.",
          "**تبقى لك.** حين تسجّل الدخول تُحفظ شهاداتك مع حسابك، وتعود على أي هاتف جديد، حتى لو أُزيلت الدورة لاحقًا.",
          "**باسم مدرستك.** في المؤسسة تحمل الشهادة شعار المؤسسة.",
        ],
      },
    },
  ],
  faq: {
    en: [
      ["Who reviews my project?", "If you are in a school or organization on Darsi, your teacher or its admins. Otherwise, the Darsi team."],
      ["Do I need an account to send a project?", "Yes, a free one. As a guest you can still do the project in class and come back to it."],
      ["How do I get a certificate?", "Finish every lesson of a course. For a capstone project, send every milestone for review."],
      ["Do certificates cost anything?", "No. Courses and their certificates are free."],
    ],
    ar: [
      ["من يراجع مشروعي؟", "إن كنت في مدرسة أو مؤسسة على «درسي»، فمعلمك أو مشرفوها. وإلا ففريق «درسي»."],
      ["هل أحتاج إلى حساب لإرسال مشروع؟", "نعم، حساب مجاني. وكزائر يمكنك أن تنفّذ المشروع في الفصل ثم تعود إليه."],
      ["كيف أحصل على شهادة؟", "أنهِ كل دروس الدورة. وفي المشروع الختامي أرسل كل المراحل للمراجعة."],
      ["هل للشهادات تكلفة؟", "لا. الدورات وشهاداتها مجانية."],
    ],
  },
};

const SCHOOLS = {
  title: { en: "Darsi for schools, universities and organizations", ar: "«درسي» للمدارس والجامعات والمؤسسات" },
  h1: { en: "For schools, universities and organizations", ar: "للمدارس والجامعات والمؤسسات" },
  description: {
    en: "Schools, universities, ministries and NGOs can run Darsi for their teachers and students: invite codes and bulk accounts, chosen courses, project review, their own name and logo, and reports against UNESCO's frameworks and DigComp.",
    ar: "تستطيع المدارس والجامعات والوزارات والمنظمات غير الحكومية تشغيل «درسي» لمعلميها وطلابها: رموز دعوة وإنشاء حسابات بالجملة، واختيار الدورات، ومراجعة المشروعات، واسمها وشعارها، وتقارير وفق أطر اليونسكو وDigComp.",
  },
  lead: {
    en: [
      "Darsi works for one teacher on their own, and for a whole school. An organization registers in the app; the Darsi team reviews every request, and once it is approved its admins can bring in their people and follow their learning.",
    ],
    ar: [
      "يصلح «درسي» لمعلم واحد بمفرده، ولمدرسة كاملة. تسجّل المؤسسة في التطبيق، ويراجع فريق «درسي» كل طلب، وبعد الموافقة يستطيع مشرفوها إضافة أفرادها ومتابعة تعلّمهم.",
    ],
  },
  cta: { href: "/signup?org=1", en: "Register your organization", ar: "سجّل مؤسستك" },
  sections: [
    {
      id: "people",
      h2: { en: "Bringing people in", ar: "إضافة الأفراد" },
      list: {
        en: [
          "**Invite codes and links.** Separate codes for teachers and for students; an invite link fills the code in at sign-up.",
          "**Accounts in bulk.** Import a list from Excel or CSV. People without email get a username and a printable login slip, and every password is made by the server.",
          "**Classes and teachers.** Put students in classes and give them a teacher, many at a time.",
          "**Joining asks first.** Before anyone joins, Darsi tells them who will see their learning.",
        ],
        ar: [
          "**رموز وروابط دعوة.** رمز للمعلمين وآخر للطلاب، ورابط الدعوة يملأ الرمز عند إنشاء الحساب.",
          "**حسابات بالجملة.** استورد قائمة من Excel أو CSV. ومن ليس لديه بريد إلكتروني يحصل على اسم مستخدم وبطاقة دخول قابلة للطباعة، وكل كلمات المرور يولّدها الخادم.",
          "**الفصول والمعلمون.** ضع الطلاب في فصول وحدّد لهم معلمًا، لعدد كبير منهم دفعة واحدة.",
          "**الانضمام يسأل أولًا.** قبل أن ينضم أي شخص يخبره «درسي» بمن سيرى تعلّمه.",
        ],
      },
    },
    {
      id: "choose",
      h2: { en: "Your courses, your look", ar: "دوراتك، وهويتك" },
      list: {
        en: [
          "**Courses per group.** Admins choose which courses teachers, students and each class see, or leave every course open.",
          "**Your own courses.** Admins can write and publish courses for their own members with Darsi's lesson editor.",
          "**Your name and logo** in the app bar, the navigation and on certificates.",
          "**Your own web address,** such as learn.yourschool.edu, approved and connected by the Darsi team.",
        ],
        ar: [
          "**دورات لكل مجموعة.** يختار المشرفون الدورات التي يراها المعلمون والطلاب وكل فصل، أو يتركون كل الدورات متاحة.",
          "**دوراتكم الخاصة.** يستطيع المشرفون كتابة دورات ونشرها لأفراد مؤسستهم بمحرّر الدروس في «درسي».",
          "**اسمكم وشعاركم** في شريط التطبيق والتنقّل وعلى الشهادات.",
          "**عنوان ويب خاص بكم،** مثل learn.yourschool.edu، يوافق عليه فريق «درسي» ويربطه.",
        ],
      },
    },
    {
      id: "reports",
      h2: { en: "Following progress", ar: "متابعة التقدّم" },
      list: {
        en: [
          "**A report against standards.** Each person and class against UNESCO's AI competency frameworks for students and teachers and DigComp 2.2, with a crosswalk to the ISTE and CSTA standards that is marked as Darsi's own, not official. [About the standards](/features/standards/).",
          "**Who needs help.** Each learner shows as on track, needs support, inactive or not started, so a teacher sees whom to help first.",
          "**Teachers see their own students,** and review their projects.",
          "**Export to Excel** for your own records.",
        ],
        ar: [
          "**تقرير وفق المعايير.** كل فرد وكل فصل وفق إطاري اليونسكو لكفايات الذكاء الاصطناعي للطلاب والمعلمين وإطار DigComp 2.2، مع ربط بمعايير ISTE وCSTA موسوم بأنه من عمل «درسي» وليس رسميًا. [عن المعايير](/ar/features/standards/).",
          "**من يحتاج إلى مساعدة.** يظهر كل متعلّم: على المسار، أو يحتاج إلى دعم، أو غير نشط، أو لم يبدأ، فيعرف المعلم بمن يبدأ.",
          "**يرى المعلمون طلابهم،** ويراجعون مشروعاتهم.",
          "**تصدير إلى Excel** لسجلاتكم الخاصة.",
        ],
      },
    },
  ],
  faq: {
    en: [
      ["How does a school join Darsi?", "Choose \"Register your organization\" and create an account. The Darsi team reviews every request; once it is approved, you get invite codes and the admin screens."],
      ["Can we add many accounts at once?", "Yes. Import a list from Excel or CSV; people without email get a username and a printable login slip."],
      ["Can we choose which courses our people see?", "Yes: for all teachers, for all students and for each class, or leave every course open."],
      ["Who can see a learner's progress?", "The organization's admins and the learner's teacher. Darsi tells each person this before they join."],
    ],
    ar: [
      ["كيف تنضم مدرسة إلى «درسي»؟", "اختر «سجّل مؤسستك» وأنشئ حسابًا. يراجع فريق «درسي» كل طلب، وبعد الموافقة تحصل على رموز الدعوة وشاشات الإشراف."],
      ["هل يمكننا إضافة حسابات كثيرة دفعة واحدة؟", "نعم. استورد قائمة من Excel أو CSV، ومن ليس لديه بريد إلكتروني يحصل على اسم مستخدم وبطاقة دخول قابلة للطباعة."],
      ["هل يمكننا اختيار الدورات التي يراها أفرادنا؟", "نعم: لكل المعلمين، ولكل الطلاب، ولكل فصل، أو اترك كل الدورات متاحة."],
      ["من يستطيع رؤية تقدّم المتعلّم؟", "مشرفو المؤسسة ومعلم المتعلّم. ويخبر «درسي» كل شخص بذلك قبل أن ينضم."],
    ],
  },
};

const STANDARDS = {
  title: { en: "Standards: Darsi's lessons mapped to UNESCO's AI frameworks and DigComp", ar: "المعايير: دروس «درسي» مربوطة بأطر اليونسكو للذكاء الاصطناعي وDigComp" },
  h1: { en: "Mapped to international standards", ar: "مربوطة بالمعايير الدولية" },
  description: {
    en: "Each Darsi lesson is tagged with the competencies it builds, from UNESCO's AI competency frameworks for teachers and students, the EU's DigComp 2.2 and Darsi's own strands: {comps} across the published courses.",
    ar: "كل درس في «درسي» موسوم بالكفايات التي يبنيها، من إطاري اليونسكو لكفايات الذكاء الاصطناعي للمعلمين والطلاب، وإطار DigComp 2.2 الأوروبي، ومحاور «درسي» الخاصة: {comps} في الدورات المنشورة.",
  },
  wide: true,
  lead: {
    en: [
      "A school needs to know what a course builds, not only what it covers. Every Darsi lesson lists the competencies it builds, and each finished lesson adds evidence to the learner's profile.",
      "The frameworks are public: UNESCO's [AI competency framework for teachers]({srcUnescoT}) and [for students]({srcUnescoS}), and the European Commission's [DigComp 2.2]({srcDigComp}). Where no international school framework covers a subject yet, such as IoT or optimization, Darsi uses strands of its own.",
    ],
    ar: [
      "تحتاج المدرسة إلى معرفة ما تبنيه الدورة، لا ما تغطيه فقط. لذلك يذكر كل درس في «درسي» الكفايات التي يبنيها، ويضيف كل درس مكتمل دليلًا إلى ملف المتعلّم.",
      "والأطر منشورة للجميع: [إطار اليونسكو لكفايات الذكاء الاصطناعي للمعلمين]({srcUnescoT}) و[للطلاب]({srcUnescoS})، وإطار [DigComp 2.2]({srcDigComp}) للمفوضية الأوروبية. وحيث لا يغطي أي إطار مدرسي دولي مادةً بعدُ، مثل إنترنت الأشياء أو الحلول المثلى، يستخدم «درسي» محاور خاصة به.",
    ],
  },
  cta: { page: "courses", en: "See the courses", ar: "تصفّح الدورات" },
  sections: [
    {
      id: "levels",
      h2: { en: "Levels and school stages", ar: "المستويات والمراحل الدراسية" },
      p: {
        en: [
          "Every track goes from Beginner to Advanced, and its levels are written for school stages: {stageLevels}. A short placement check, with questions for each level, finds where each learner starts, and My tracks can check again at any time.",
        ],
        ar: [
          "يمتد كل مسار من «مبتدئ» إلى «متقدم»، ومستوياته مكتوبة للمراحل الدراسية: {stageLevels}. ويحدّد اختبار تحديد مستوى قصير، فيه أسئلة لكل مستوى، من أين يبدأ كل متعلّم، ويمكن إعادته في أي وقت من «مساراتي».",
        ],
      },
    },
  ],
  after: [
    {
      id: "reports",
      h2: { en: "In a school's reports", ar: "في تقارير المدرسة" },
      p: {
        en: ["In an organization, admins and teachers see each learner and class against these frameworks, with a strength for each item: emerging, developing or secure. Reports can also show the ISTE Standards and the CSTA K–12 Computer Science Standards through Darsi's own crosswalk, which the report labels as not official. [Darsi for schools](/features/schools/)."],
        ar: ["في المؤسسة يرى المشرفون والمعلمون كل متعلّم وكل فصل وفق هذه الأطر، مع درجة قوة لكل بند: ناشئ، أو نامٍ، أو راسخ. ويمكن للتقارير أن تعرض أيضًا معايير ISTE ومعايير CSTA لعلوم الحاسوب من الروضة إلى الصف الثاني عشر، عبر ربط من عمل «درسي» يصفه التقرير بأنه غير رسمي. [«درسي» للمدارس](/ar/features/schools/)."],
      },
    },
  ],
  frameworkNote: {
    "UNESCO-T": { en: "What a teacher needs to teach with and about AI, in three steps: acquire, deepen, create.", ar: "ما يحتاج إليه المعلم ليدرّس بالذكاء الاصطناعي وعنه، على ثلاث خطوات: الاكتساب، ثم التعميق، ثم الإبداع." },
    "UNESCO-S": { en: "What students need to understand, use and question AI, in three steps: understand, apply, create.", ar: "ما يحتاج إليه الطلاب لفهم الذكاء الاصطناعي واستخدامه ومساءلته، على ثلاث خطوات: الفهم، ثم التطبيق، ثم الإبداع." },
    DigComp: { en: "The European framework for digital competence, used here for data literacy, safety and privacy, programming and problem solving.", ar: "الإطار الأوروبي للكفاية الرقمية، ويُستخدم هنا للثقافة المعلوماتية، والسلامة والخصوصية، والبرمجة، وحل المشكلات." },
    Darsi: { en: "Darsi's own strands for IoT, programming, data, AI agents, optimization and AI security, which no international school framework covers yet.", ar: "محاور «درسي» الخاصة لإنترنت الأشياء والبرمجة والبيانات ووكلاء الذكاء الاصطناعي والحلول المثلى وأمن الذكاء الاصطناعي، التي لا يغطيها بعدُ أي إطار مدرسي دولي." },
  },
  inCourses: { en: "In:", ar: "في:" },
  // A UNESCO competency's step (Acquire, Deepen, Create; Understand, Apply, Create).
  level: { en: (x) => `Step: ${x}`, ar: (x) => `الخطوة: ${x}` },
  faq: {
    en: [
      ["Which frameworks does Darsi follow?", "UNESCO's AI competency frameworks for teachers and for students (2024), the EU's DigComp 2.2, and Darsi's own strands for subjects such as IoT. Organization reports also offer a crosswalk to the ISTE and CSTA standards, marked as not official."],
      ["Is Darsi endorsed by UNESCO?", "No. Darsi maps its lessons to UNESCO's public frameworks; the mapping is Darsi's own work, not an endorsement."],
      ["How does Darsi find a learner's level?", "With a short placement check when you start, which asks questions for each level, and My tracks lets you check again at any time."],
    ],
    ar: [
      ["ما الأطر التي يتبعها «درسي»؟", "إطارا اليونسكو لكفايات الذكاء الاصطناعي للمعلمين وللطلاب (٢٠٢٤)، وإطار DigComp 2.2 الأوروبي، ومحاور «درسي» الخاصة لمواد مثل إنترنت الأشياء. وتعرض تقارير المؤسسات أيضًا ربطًا بمعايير ISTE وCSTA موسومًا بأنه غير رسمي."],
      ["هل «درسي» معتمَد من اليونسكو؟", "لا. يربط «درسي» دروسه بأطر اليونسكو المنشورة للجميع، وهذا الربط من عمل «درسي» نفسه، وليس اعتمادًا."],
      ["كيف يحدّد «درسي» مستوى المتعلّم؟", "باختبار تحديد مستوى قصير عند البدء، يطرح أسئلة لكل مستوى، ويمكنك إعادته في أي وقت من «مساراتي»."],
    ],
  },
};

const LABS = {
  wide: true,
  title: {
    en: "Labs: {apps} for AI, IoT, cyber security and programming",
    ar: "المختبرات: {apps} في الذكاء الاصطناعي وإنترنت الأشياء والأمن السيبراني والبرمجة",
  },
  h1: { en: "Labs that run on the phone", ar: "مختبرات تعمل على الهاتف" },
  description: {
    en: "Darsi's Labs are {apps}, in English and Arabic, that teach AI, IoT, cyber security, programming, data and optimization by doing. They compute on the phone itself and keep working offline.",
    ar: "مختبرات «درسي» {apps}، بالعربية والإنجليزية، تعلّم الذكاء الاصطناعي وإنترنت الأشياء والأمن السيبراني والبرمجة والبيانات والحلول المثلى بالتجربة. تحسب على الهاتف نفسه وتبقى تعمل دون اتصال.",
  },
  lead: {
    en: [
      "Darsi has {labs}: small apps where you change something and watch what happens. Train a neuron, then a whole network. Wire a sensor. Crack a cipher. Run Python and SQL. Plan a delivery route.",
      "Everything computes on the phone itself, with no server doing the work, so a lab keeps working with no signal once it has opened. Every lab is in English and Arabic, and you don't need an account to use them.",
    ],
    ar: [
      "في «درسي» {labs}: تطبيقات صغيرة تغيّر فيها شيئًا وتشاهد ما يحدث. درّب خلية عصبية، ثم شبكة كاملة. صِل مستشعرًا. فُكّ شيفرة. شغّل بايثون وSQL. خطّط مسار توصيل.",
      "كل الحسابات تجري على الهاتف نفسه، دون خادم يقوم بالعمل، فيبقى المختبر يعمل دون إشارة بعد فتحه أول مرة. وكل مختبر بالعربية والإنجليزية، ولا تحتاج إلى حساب لاستخدامه.",
    ],
  },
  cta: { href: "/labs", en: "Open Labs in Darsi", ar: "افتح المختبرات في «درسي»" },
  sections: [
    {
      id: "why-labs",
      h2: { en: "Why labs, and not only videos", ar: "لماذا المختبرات، لا الفيديوهات وحدها" },
      p: {
        en: [
          "A teacher who has moved a weight and watched a model change its mind can explain it to a class. A video alone rarely gets there. So most lessons in Darsi's courses include a lab, and the questions around it ask about what you saw there.",
          "The labs use examples from schools, farms, markets and phones. Their examples are written and reviewed in advance, so no learner ever sees unreviewed AI output.",
        ],
        ar: [
          "المعلم الذي حرّك وزنًا ورأى النموذج يغيّر قراره يستطيع أن يشرحه لفصله، والفيديو وحده نادرًا ما يوصل إلى ذلك. لهذا يضم معظم دروس «درسي» مختبرًا، وتسألك الأسئلة حوله عمّا رأيته فيه.",
          "تستخدم المختبرات أمثلة من المدارس والمزارع والأسواق والهواتف، وأمثلتها مكتوبة ومراجَعة مسبقًا، فلا يرى أي متعلّم مخرجات ذكاء اصطناعي لم يراجعها أحد.",
        ],
      },
    },
    {
      id: "offline-labs",
      h2: { en: "Made for old phones and costly data", ar: "مصمَّمة للهواتف القديمة والبيانات المكلفة" },
      list: {
        en: [
          "**Downloaded only when used.** Labs aren't part of the app's install. Each lab is fetched the first time you open it, then kept on the phone.",
          "**Save them all at once.** On Wi-Fi, \"Save all labs for offline\" stores every lab, and shows the size before it starts.",
          "**Bigger tools once.** The few labs that run Python, SQL or Darsi Tiny, Darsi's own small language model, download that tool once (up to 3 MB) the first time they are used online.",
          "**No account needed.** A guest can open every lab; an account, which is free, only keeps lesson progress across phones.",
        ],
        ar: [
          "**تُنزَّل عند استخدامها فقط.** المختبرات ليست جزءًا من تثبيت التطبيق، ويُنزَّل كل مختبر أول مرة تفتحه، ثم يبقى على الهاتف.",
          "**احفظها كلها مرة واحدة.** عبر Wi-Fi، يحفظ زر «احفظ كل المختبرات للعمل دون اتصال» كل المختبرات، ويعرض الحجم قبل أن يبدأ.",
          "**الأدوات الأكبر مرة واحدة.** المختبرات القليلة التي تشغّل بايثون أو SQL أو «درسي الصغير»، وهو نموذج لغوي صغير من «درسي»، تنزّل تلك الأداة مرة واحدة (حتى ٣ ميغابايت) أول مرة تُستخدم فيها مع الاتصال.",
          "**دون حساب.** يستطيع الزائر فتح كل المختبرات، والحساب، وهو مجاني، يحفظ تقدّمك في الدروس على أكثر من هاتف فقط.",
        ],
      },
    },
  ],
  ladder: {
    h2: { en: "The AI ladder", ar: "سُلّم الذكاء الاصطناعي" },
    p: {
      en: "{ladderLabs} in order, from a single neuron to whole networks, language models and machines that make decisions. Each step builds on the one before.",
      ar: "{ladderLabs} بالترتيب، من خلية عصبية واحدة إلى شبكات كاملة ونماذج لغوية وآلات تتخذ القرارات. كل خطوة تبني على التي قبلها.",
    },
  },
  all: {
    h2: { en: "All {labsN} labs", ar: "كل المختبرات ({labsN})" },
    p: {
      en: "On {shelvesN}. Starter labs need nothing before them; explorer and advanced labs build on earlier ideas. Where a course uses a lab, its name is linked.",
      ar: "على {shelvesN}. مختبرات المبتدئ لا تحتاج إلى شيء قبلها، ومختبرات المستكشف والمتقدّم تبني على أفكار سابقة. وحيث تستخدم دورةٌ مختبرًا، يظهر اسمها رابطًا.",
    },
  },
  levels: { en: ["Starter", "Explorer", "Advanced"], ar: ["مبتدئ", "مستكشف", "متقدّم"] },
  usedIn: { en: "Used in:", ar: "تستخدمه:" },
  faq: {
    en: [
      ["Do the labs need the internet?", "Only to download them. Each lab is saved on the phone the first time it opens, or all of them at once with \"Save all labs for offline\". After that they work with no signal."],
      ["Do I need an account?", "No. Choose \"Continue without an account\" in Darsi and open Labs. An account, which is free, keeps your lesson progress across phones."],
      ["Are the labs in Arabic?", "Yes. Every lab is written in English and Arabic, and the Arabic labs read right to left, with numbers and formulas set the right way."],
      ["Which subjects do the labs cover?", "AI and machine learning, IoT and electronics, cyber security and cryptography, programming, data engineering, data science, AI agents, AI security and optimization: {labs} in all."],
    ],
    ar: [
      ["هل تحتاج المختبرات إلى الإنترنت؟", "فقط لتنزيلها. يُحفظ كل مختبر على الهاتف أول مرة يُفتح، أو تُحفظ كلها مرة واحدة بزر «احفظ كل المختبرات للعمل دون اتصال». بعد ذلك تعمل دون إشارة."],
      ["هل أحتاج إلى حساب؟", "لا. اختر «المتابعة دون حساب» في «درسي» ثم افتح المختبرات. والحساب، وهو مجاني، يحفظ تقدّمك في الدروس على أكثر من هاتف."],
      ["هل المختبرات بالعربية؟", "نعم. كل مختبر مكتوب بالعربية والإنجليزية، والمختبرات العربية تُقرأ من اليمين إلى اليسار، مع ضبط الأرقام والمعادلات في اتجاهها الصحيح."],
      ["ما المواد التي تغطيها المختبرات؟", "الذكاء الاصطناعي وتعلّم الآلة، وإنترنت الأشياء والإلكترونيات، والأمن السيبراني والتشفير، والبرمجة، وهندسة البيانات، وعلم البيانات، ووكلاء الذكاء الاصطناعي، وأمن الذكاء الاصطناعي، والحلول المثلى: {labs} في المجموع."],
    ],
  },
};

/**
 * The feature pages, in the order the list and the home page show them; the key is the address (/features/<key>/).
 * Darsi Super (the tutor) has no page while it is switched off on the live site.
 */
export const FEATURES = { lessons: LESSONS, labs: LABS, offline: OFFLINE, languages: LANGUAGES, kits: KITS, code: CODE, projects: PROJECTS, schools: SCHOOLS, standards: STANDARDS };
