/** Home-page copy. Figures are sourced (see `sources`); keep claims factual — no invented statistics. */
type L = { en: string; ar: string };
const t = (en: string, ar: string): L => ({ en, ar });

export const landing = {
  nav: { approach: t("How it works", "كيف يعمل"), tracks: t("Tracks", "المسارات"), orgs: t("For organizations", "للمؤسسات"), standards: t("Standards", "المعايير"), faq: t("FAQ", "أسئلة شائعة"), language: t("Language", "اللغة"), signIn: t("Sign in", "تسجيل الدخول"), start: t("Start learning", "ابدأ التعلّم") },
  hero: {
    kicker: t("AI · IoT · Cyber security — for teachers", "الذكاء الاصطناعي، إنترنت الأشياء، الأمن السيبراني — للمعلمين"),
    title: t("Teachers who understand technology change a country.", "المعلم الذي يفهم التقنية يغيّر بلدًا."),
    body: t("Darsi gives school and university teachers serious, practical training in AI, IoT and cyber security: short lessons with narrated videos, real projects in their own classrooms, and ready-to-teach slides and lesson plans — in their language, on any phone, even offline.",
            "يقدّم «درسي» لمعلمي المدارس والجامعات تدريبًا جادًا وعمليًا في الذكاء الاصطناعي وإنترنت الأشياء والأمن السيبراني: دروس قصيرة مع فيديوهات مشروحة بالصوت، ومشاريع حقيقية في صفوفهم، وشرائح وخطط دروس جاهزة للتدريس — بلغتهم، على أي هاتف، وحتى دون اتصال."),
    primary: t("Start learning", "ابدأ التعلّم"), secondary: t("Bring Darsi to your school", "اجلب «درسي» إلى مؤسستك"),
    proof: t("Works offline · Arabic and English · Designed for low-cost phones", "يعمل دون اتصال، بالعربية والإنجليزية، ومصمَّم للهواتف منخفضة التكلفة"),
  },
  why: {
    title: t("Why this matters", "لماذا هذا مهم"),
    items: [
      { stat: t("44 million", "٤٤ مليون"), text: t("additional teachers the world needs by 2030 — 15 million in sub-Saharan Africa alone (UNESCO, 2024).", "معلم إضافي يحتاجه العالم بحلول ٢٠٣٠، منهم ١٥ مليونًا في أفريقيا جنوب الصحراء وحدها (اليونسكو، ٢٠٢٤).") },
      { stat: t("2.2 billion", "٢٫٢ مليار"), text: t("people are still offline; in low-income countries only 23% use the internet (ITU, 2025).", "شخص ما زالوا دون اتصال بالإنترنت، وفي البلدان منخفضة الدخل لا يستخدمه سوى ٢٣٪ (الاتحاد الدولي للاتصالات، ٢٠٢٥).") },
      { stat: t("1 teacher", "معلم واحد"), text: t("reaches hundreds of pupils over a career. Upskilling teachers is the fastest way to bring AI and digital safety into every classroom.", "يصل إلى مئات الطلاب خلال مسيرته. تأهيل المعلمين هو أسرع طريق لإدخال الذكاء الاصطناعي والسلامة الرقمية إلى كل صف.") },
    ],
    note: t("Most technology training is designed for well-connected offices, in English, on laptops. Darsi is designed for the staff room, the phone and the language teachers actually use.",
            "معظم برامج التدريب التقني صُمّمت لمكاتب متصلة جيدًا، بالإنجليزية، وعلى أجهزة محمولة. أما «درسي» فمصمَّم لغرفة المعلمين، وللهاتف، وللغة التي يستخدمها المعلمون فعلًا."),
  },
  how: {
    title: t("How Darsi works", "كيف يعمل «درسي»"),
    steps: [
      { title: t("Learn", "تعلّم"), text: t("10–12 minute lessons: a narrated animated video, a clear reading with key terms, and the ideas behind the tools — not just which button to press.", "دروس من ١٠ إلى ١٢ دقيقة: فيديو متحرّك مشروح بالصوت، وقراءة واضحة مع المصطلحات الأساسية، والأفكار التي تقف وراء الأدوات — لا مجرد الزر الذي تضغطه.") },
      { title: t("Practise", "تدرّب"), text: t("13 question types — from spotting phishing in a real message to ordering how a model is trained — plus an AI lab to experiment with prompts, tokens and classifiers.", "١٣ نوعًا من الأسئلة — من اكتشاف التصيّد في رسالة حقيقية إلى ترتيب خطوات تدريب نموذج — إضافة إلى مختبر للتجربة على الطلبات والرموز والمصنّفات.") },
      { title: t("Apply", "طبّق"), text: t("Every lesson ends with a project done in your own school: map the AI your pupils use, write prompts for a real lesson, draft your classroom AI policy. Teachers or admins review it against a rubric.", "ينتهي كل درس بمشروع تنفّذه في مدرستك: ارسم خريطة أدوات الذكاء الاصطناعي التي يستخدمها طلابك، اكتب طلبات لدرس حقيقي، صُغ سياسة صفّك لاستخدام الذكاء الاصطناعي. يراجعه معلم أو مشرف وفق معايير واضحة.") },
      { title: t("Teach", "علّم"), text: t("Download the lesson's slides as PDF or PowerPoint, the narrated video, and a lesson plan with a pupil worksheet — activities that work with chalk and paper.", "نزّل شرائح الدرس بصيغة PDF أو PowerPoint، والفيديو المشروح، وخطة درس مع ورقة عمل للطلاب — بأنشطة تعمل بالطباشير والورق.") },
      { title: t("Prove it", "أثبت ذلك"), text: t("Progress is mapped to international competency frameworks, so certificates and reports say exactly what a teacher can do.", "يرتبط التقدّم بأطر كفايات دولية، فتوضّح الشهادات والتقارير بدقة ما يستطيع المعلم فعله.") },
    ],
  },
  tracks: {
    title: t("Three tracks, four levels", "ثلاثة مسارات، أربعة مستويات"),
    levels: t("Level 1 Foundations → Level 2 Classroom use → Level 3 Build and evaluate → Level 4 Lead and create", "المستوى ١ الأساسيات ← المستوى ٢ الاستخدام في الصف ← المستوى ٣ البناء والتقييم ← المستوى ٤ القيادة والإبداع"),
    items: [
      { track: "ai" as const, title: t("Artificial intelligence", "الذكاء الاصطناعي"), points: [t("How models learn, and why they fail", "كيف تتعلّم النماذج، ولماذا تخطئ"), t("Prompting for planning, feedback and differentiation", "كتابة الطلبات للتخطيط والتغذية الراجعة ومراعاة الفروق"), t("Bias, privacy, academic honesty", "التحيّز والخصوصية والنزاهة الأكاديمية"), t("Teaching pupils to train and test simple models", "تعليم الطلاب تدريب نماذج بسيطة واختبارها")] },
      { track: "iot" as const, title: t("Internet of Things", "إنترنت الأشياء"), points: [t("Sensors, data and measurement", "المستشعرات والبيانات والقياس"), t("Low-cost builds: rain gauges, soil sensors, attendance counters", "مشاريع منخفضة التكلفة: مقاييس المطر، مستشعرات التربة، عدّادات الحضور"), t("Microcontrollers and simple programming", "المتحكّمات الدقيقة والبرمجة البسيطة"), t("Securing connected devices", "تأمين الأجهزة المتصلة")] },
      { track: "cyber" as const, title: t("Cyber security", "الأمن السيبراني"), points: [t("Passwords, two-step verification, phishing", "كلمات المرور، والتحقّق بخطوتين، والتصيّد"), t("Protecting pupils' and school data", "حماية بيانات الطلاب والمدرسة"), t("Safe use of school WhatsApp groups and shared phones", "الاستخدام الآمن لمجموعات واتساب المدرسية والهواتف المشتركة"), t("Running a school incident plan", "تطبيق خطة المدرسة للتعامل مع الحوادث")] },
    ],
    note: t("Level 1 of the AI track is live today. IoT and Cyber security units are in production.", "المستوى الأول من مسار الذكاء الاصطناعي متاح الآن، ووحدات إنترنت الأشياء والأمن السيبراني قيد الإنتاج."),
  },
  real: {
    title: t("Built for real conditions", "مصمَّم للظروف الحقيقية"),
    items: [
      [t("Offline first", "دون اتصال أولًا"), t("Download a unit on Wi-Fi; lessons, videos and kits then work without signal. Progress syncs later.", "نزّل وحدة عبر Wi-Fi، فتعمل الدروس والفيديوهات والحقائب دون إشارة، ويُزامَن التقدّم لاحقًا.")],
      [t("Light on data", "استهلاك قليل للبيانات"), t("The whole app is under 2 MB to install; videos default to low resolution and show their size before you download.", "حجم التطبيق كله أقل من ٢ ميغابايت، والفيديوهات بدقة منخفضة افتراضيًا وتعرض حجمها قبل التنزيل.")],
      [t("Your language first", "لغتك أولًا"), t("Arabic and English today, with right-to-left layouts designed — not translated. More languages are planned.", "العربية والإنجليزية اليوم، بتصميم من اليمين إلى اليسار مُعَدّ بعناية لا مترجم. ولغات أخرى قادمة.")],
      [t("Any screen", "أي شاشة"), t("Phone, tablet or computer. Install it like an app from the browser; Android and iOS apps will follow.", "هاتف أو جهاز لوحي أو حاسوب. ثبّته كتطبيق من المتصفح، وتطبيقات أندرويد وiOS قادمة.")],
      [t("Readable in sunlight", "مقروء تحت الشمس"), t("A high-contrast mode for outdoor classrooms and low-brightness screens.", "وضع عالي التباين للفصول الخارجية والشاشات منخفضة السطوع.")],
      [t("No ads, no tricks", "بلا إعلانات ولا حيل"), t("Streaks count teaching weeks, not days. Mistakes cost nothing. Pupils' data never goes into a chatbot.", "تُحسب السلسلة بأسابيع التدريس لا بالأيام، والأخطاء لا تكلّف شيئًا، وبيانات الطلاب لا تدخل أي روبوت دردشة.")],
    ],
  },
  orgs: {
    title: t("For ministries, school networks, universities and NGOs", "للوزارات وشبكات المدارس والجامعات والمنظمات"),
    body: t("Register your organization, get approved, and bring your teachers and students in within an afternoon.", "سجّل مؤسستك، واحصل على الموافقة، وأضف معلميك وطلابك في فترة ما بعد الظهر."),
    items: [
      [t("Add people in bulk", "أضف الأشخاص دفعة واحدة"), t("Upload an Excel or CSV file, match the columns, and Darsi creates accounts with secure random passwords — with printable login slips for people without email.", "ارفع ملف Excel أو CSV، وطابق الأعمدة، فينشئ «درسي» الحسابات بكلمات مرور عشوائية آمنة — مع بطاقات دخول قابلة للطباعة لمن ليس لديهم بريد إلكتروني.")],
      [t("See real capability", "شاهد القدرات الحقيقية"), t("For every teacher and student: lessons finished, accuracy, projects submitted, and a capability profile mapped to UNESCO and DigComp competencies.", "لكل معلم وطالب: الدروس المكتملة، والدقة، والمشاريع المرسلة، وملف قدرات مرتبط بكفايات اليونسكو وDigComp.")],
      [t("Teachers and students", "المعلمون والطلاب"), t("Teachers see their own students' progress and review their projects; admins see everyone.", "يرى المعلمون تقدّم طلابهم ويراجعون مشاريعهم، ويرى المشرفون الجميع.")],
      [t("Invite codes", "رموز الدعوة"), t("Share a teacher code and a student code; people join from their own phones.", "شارك رمزًا للمعلمين ورمزًا للطلاب، وينضم الأشخاص من هواتفهم.")],
    ],
    cta: t("Register your organization", "سجّل مؤسستك"),
  },
  standards: {
    title: t("Aligned with international frameworks", "متوافق مع الأطر الدولية"),
    items: [
      [t("UNESCO AI competency framework for teachers (2024)", "إطار اليونسكو لكفايات الذكاء الاصطناعي للمعلمين (٢٠٢٤)"), t("15 competencies across 5 dimensions — human-centred mindset, ethics, foundations and applications, pedagogy, professional learning — at three levels: acquire, deepen, create.", "١٥ كفاية في ٥ أبعاد — عقلية محورها الإنسان، والأخلاقيات، والأسس والتطبيقات، والتدريس، والتطوّر المهني — بثلاثة مستويات: اكتساب، وتعميق، وإبداع.")],
      [t("UNESCO AI competency framework for students (2024)", "إطار اليونسكو لكفايات الذكاء الاصطناعي للطلاب (٢٠٢٤)"), t("12 competencies across 4 dimensions at three levels: understand, apply, create — used for student tracks.", "١٢ كفاية في ٤ أبعاد بثلاثة مستويات: فهم، وتطبيق، وإبداع — تُستخدم لمسارات الطلاب.")],
      [t("EU DigComp 2.2", "إطار DigComp 2.2 الأوروبي"), t("21 digital competences in 5 areas; Darsi uses the safety and information-literacy competences for cyber security.", "٢١ كفاية رقمية في ٥ مجالات، ويستخدم «درسي» كفايات السلامة والثقافة المعلوماتية للأمن السيبراني.")],
    ],
  },
  quality: {
    title: t("Our quality bar", "معاييرنا للجودة"),
    items: [
      t("Concepts before buttons: teachers learn how the technology works, so their knowledge outlasts any app.", "المفاهيم قبل الأزرار: يتعلّم المعلم كيف تعمل التقنية، فتبقى معرفته بعد زوال أي تطبيق."),
      t("Every lesson ends in practice in a real classroom, reviewed by people — not just a quiz.", "ينتهي كل درس بتطبيق في صف حقيقي يراجعه بشر — لا مجرد اختبار."),
      t("Local examples: school WhatsApp groups, exam timetables, solar lamps, market prices.", "أمثلة محلية: مجموعات واتساب المدرسية، وجداول الامتحانات، والمصابيح الشمسية، وأسعار السوق."),
      t("Content is checked by subject specialists and native-language editors before it is published.", "يراجع المحتوى مختصون في المادة ومحرّرون بلغتها الأم قبل نشره."),
    ],
  },
  faq: {
    title: t("Frequently asked questions", "أسئلة شائعة"),
    items: [
      [t("Do I need a computer?", "هل أحتاج إلى حاسوب؟"), t("No. Darsi is designed for phones first and also works on tablets and computers.", "لا. صُمّم «درسي» للهاتف أولًا، ويعمل أيضًا على الأجهزة اللوحية والحواسيب.")],
      [t("Does it work without internet?", "هل يعمل دون إنترنت؟"), t("Yes. After you download a unit, its lessons, videos and teaching kits work offline. Your progress uploads when you reconnect.", "نعم. بعد تنزيل وحدة، تعمل دروسها وفيديوهاتها وحقائبها دون اتصال، ويُرفع تقدّمك عند عودة الاتصال.")],
      [t("Can I use the slides with my class?", "هل يمكنني استخدام الشرائح مع صفّي؟"), t("Yes. Kits are free to copy for your school. Slides come as PDF or editable PowerPoint, with speaker notes.", "نعم. يُسمح بنسخ الحقائب لمدرستك مجانًا. الشرائح متاحة بصيغة PDF أو PowerPoint قابلة للتعديل مع ملاحظات المتحدّث.")],
      [t("How does my school or ministry join?", "كيف تنضم مدرستي أو وزارتي؟"), t("Create an account, choose “Register your organization”, and tell us about it. After approval you become its admin and can add people.", "أنشئ حسابًا، واختر «سجّل مؤسستك»، وأخبرنا عنها. بعد الموافقة تصبح مشرفها وتستطيع إضافة الأشخاص.")],
      [t("Who can see my progress?", "من يستطيع رؤية تقدّمي؟"), t("Only you — unless you belong to an organization, where its admins (and, for students, their teacher) can see your learning record.", "أنت فقط — إلا إذا كنت عضوًا في مؤسسة، فيرى مشرفوها (ومعلمك إن كنت طالبًا) سجل تعلّمك.")],
      [t("Which languages are available?", "ما اللغات المتاحة؟"), t("Arabic and English today. The platform is built so more languages can be added without redesign.", "العربية والإنجليزية اليوم. والمنصة مبنية بحيث يمكن إضافة لغات أخرى دون إعادة تصميم.")],
    ],
  },
  cta: { title: t("Start with one lesson today.", "ابدأ بدرس واحد اليوم."), body: t("Ten minutes, your phone, your language.", "عشر دقائق، هاتفك، لغتك.") },
  footer: t("technology training for teachers. Kits are free to copy for your school.", "تدريب تقني للمعلمين. يُسمح بنسخ الحقائب لمدرستك مجانًا."), // after "Darsi (درسي) — " (Landing.tsx)
  sources: [
    { label: "UNESCO (2024), Global report on teachers — via UN News", url: "https://news.un.org/en/node/1147067" },
    { label: "ITU (2025), Facts and Figures 2025", url: "https://www.itu.int/en/mediacentre/Pages/PR-2025-11-17-Facts-and-Figures.aspx" },
    { label: "UNESCO (2024), AI competency framework for teachers", url: "https://gcedclearinghouse.org/en/node/146447" },
    { label: "UNESCO (2024), AI competency framework for students", url: "https://inee.org/fr/node/13027706" },
    { label: "European Commission JRC, DigComp 2.2", url: "https://joint-research-centre.ec.europa.eu/oldpage-digcomp/digcomp-framework_es" },
  ],
};
