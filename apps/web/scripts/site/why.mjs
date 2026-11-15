/**
 * "Why Darsi": how Darsi answers education needs in the world (TECHNICAL.md "Public pages").
 * Every figure here was read on its source's own page (the address in SOURCES) on 2026-11-15, and names its year.
 * When a source publishes a newer edition, update the figure and its source together; never a figure without a source.
 * Facts about Darsi are {placeholders} counted at build time (features.mjs `facts`).
 */
import { ORG_ID, WEBSITE_ID, appOf, faqBlock, faqLd, pathOf } from "./render.mjs";
import { facts, fill } from "./features.mjs";
import { WORDS } from "./strings.mjs";
import { cut, esc, plain, rich } from "./util.mjs";

/** Each source once: who published it, what, when, and the page the figures were read on. */
export const SOURCES = {
  "unesco-teachers": { label: "UNESCO (2024), Global report on teachers: what you need to know", url: "https://www.unesco.org/en/articles/global-report-teachers-what-you-need-know" },
  "un-sdg-2026": { label: "United Nations (2026), The Sustainable Development Goals Report 2026, Goal 4", url: "https://unstats.un.org/sdgs/report/2026/goal-04/" },
  "itu-2025": { label: "ITU (2025), Facts and Figures 2025: press release", url: "https://www.itu.int/en/mediacentre/Pages/PR-2025-11-17-Facts-and-Figures.aspx" },
  "itu-2025-rural": { label: "ITU (2025), Facts and Figures 2025: Internet use in urban and rural areas", url: "https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-internet-use-in-urban-and-rural-areas/" },
  "itu-2025-phones": { label: "ITU (2025), Facts and Figures 2025: Mobile phone ownership", url: "https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-mobile-phone-ownership/" },
  "gsma-2026": { label: "GSMA (2026), State of Mobile Internet Connectivity 2026: press release", url: "https://www.gsma.com/newsroom/press-release/gsma-warns-of-emerging-global-ai-divide-as-three-billion-people-remain-offline-and-smartphone-component-costs-soar/" },
  "unicef-itu-2020": { label: "UNICEF and ITU (2020), Two thirds of the world's school-age children have no internet access at home", url: "https://www.unicef.org/press-releases/two-thirds-worlds-school-age-children-have-no-internet-access-home-new-unicef-itu" },
  "worldbank-2022": { label: "World Bank, UNESCO, UNICEF and others (2022), The State of Global Learning Poverty: 2022 update", url: "https://www.worldbank.org/en/news/press-release/2022/06/23/70-of-10-year-olds-now-in-learning-poverty-unable-to-read-and-understand-a-simple-text" },
  "un-news-gem-2023": { label: "UN News (2023), on UNESCO's Global Education Monitoring Report 2023: Technology in education", url: "https://news.un.org/en/story/2023/07/1139122" },
  "unesco-genai-2023": { label: "UNESCO (2023), Governments must quickly regulate generative AI in schools", url: "https://www.unesco.org/en/articles/unesco-governments-must-quickly-regulate-generative-ai-schools" },
  "isc2-2024": { label: "ISC2 (2024), Cybersecurity Workforce Study", url: "https://www.isc2.org/insights/2024/10/isc2-2024-cybersecurity-workforce-study" },
  "unicef-2019": { label: "UNICEF (2019), U-Report poll on online bullying in 30 countries", url: "https://www.unicef.org/press-releases/unicef-poll-more-third-young-people-30-countries-report-being-victim-online-bullying" },
  "un-arabic": { label: "United Nations, World Arabic Language Day", url: "https://www.un.org/en/observances/arabiclanguageday" },
  "ungeneva-arabic-2025": { label: "UN Geneva (2025), Director-General's remarks for World Arabic Language Day", url: "https://www.ungeneva.org/ar/director-general/tatiana-valovaya/activities/2025/12/director-generals-remarks-event-celebrate" },
  "unesco-ai-cft": { label: "UNESCO (2024), AI competency framework for teachers", url: "https://www.unesco.org/en/articles/ai-competency-framework-teachers" },
  "unesco-ai-cfs": { label: "UNESCO (2024), AI competency framework for students", url: "https://www.unesco.org/en/articles/ai-competency-framework-students" },
  "jrc-digcomp-22": { label: "European Commission, Joint Research Centre (2022), DigComp 2.2", url: "https://publications.jrc.ec.europa.eu/repository/handle/JRC128415" },
};

/** The needs, in groups. `value` is the highlight; `text` is a whole sentence that can be quoted on its own. */
const NEEDS = [
  {
    id: "teachers",
    h3: { en: "Not enough teachers, and not enough training", ar: "معلمون أقل من الحاجة، وتدريب أقل منها" },
    items: [
      { value: { en: "44 million", ar: "٤٤ مليون" }, src: ["unesco-teachers"],
        text: { en: "The world needs 44 million more primary and secondary teachers by 2030, 15 million of them in sub-Saharan Africa (UNESCO, 2024).", ar: "يحتاج العالم إلى ٤٤ مليون معلم إضافي في التعليم الابتدائي والثانوي بحلول ٢٠٣٠، منهم ١٥ مليونًا في أفريقيا جنوب الصحراء (اليونسكو، ٢٠٢٤)." } },
      { value: { en: "9.06%", ar: "٩٫٠٦٪" }, src: ["unesco-teachers"],
        text: { en: "Attrition among primary teachers worldwide almost doubled, from 4.62% in 2015 to 9.06% in 2022 (UNESCO, 2024).", ar: "تضاعف تقريبًا تسرّب معلمي المرحلة الابتدائية من المهنة حول العالم، من ٤٫٦٢٪ في ٢٠١٥ إلى ٩٫٠٦٪ في ٢٠٢٢ (اليونسكو، ٢٠٢٤)." } },
      { value: { en: "30–40%", ar: "٣٠–٤٠٪" }, src: ["un-sdg-2026"],
        text: { en: "In sub-Saharan Africa, 30 to 40% of teachers still lack the minimum qualifications (United Nations, 2026).", ar: "في أفريقيا جنوب الصحراء، ما زال ٣٠ إلى ٤٠٪ من المعلمين يفتقرون إلى الحد الأدنى من المؤهلات (الأمم المتحدة، ٢٠٢٦)." } },
    ],
  },
  {
    id: "connection",
    h3: { en: "Connection is scarce and costly", ar: "الاتصال نادر ومكلف" },
    items: [
      { value: { en: "2.2 billion", ar: "٢٫٢ مليار" }, src: ["itu-2025"],
        text: { en: "2.2 billion people were still offline in 2025 (ITU).", ar: "ما زال ٢٫٢ مليار شخص دون اتصال بالإنترنت في ٢٠٢٥ (الاتحاد الدولي للاتصالات)." } },
      { value: { en: "23%", ar: "٢٣٪" }, src: ["itu-2025"],
        text: { en: "In 2025, 23% of people in low-income countries used the internet, against 94% in high-income countries (ITU).", ar: "في ٢٠٢٥، استخدم الإنترنت ٢٣٪ من سكان البلدان منخفضة الدخل، مقابل ٩٤٪ في البلدان مرتفعة الدخل (الاتحاد الدولي للاتصالات)." } },
      { value: { en: "1 in 7", ar: "١ من ٧" }, src: ["itu-2025-rural"],
        text: { en: "In low-income countries, only one rural dweller in seven (14%) was online in 2025 (ITU).", ar: "في البلدان منخفضة الدخل، كان واحد فقط من كل سبعة من سكان الريف (١٤٪) متصلًا بالإنترنت في ٢٠٢٥ (الاتحاد الدولي للاتصالات)." } },
      { value: { en: "60%", ar: "٦٠٪" }, src: ["itu-2025"],
        text: { en: "Mobile broadband is still unaffordable in around 60% of low- and middle-income countries (ITU, 2025).", ar: "ما زال الإنترنت عبر الهاتف المحمول غير ميسور التكلفة في نحو ٦٠٪ من البلدان منخفضة ومتوسطة الدخل (الاتحاد الدولي للاتصالات، ٢٠٢٥)." } },
      { value: { en: "44%", ar: "٤٤٪" }, src: ["gsma-2026"],
        text: { en: "An entry-level internet phone costs the poorest 20% of people in low- and middle-income countries the equivalent of 44% of their average monthly income, and 76% in sub-Saharan Africa (GSMA, 2026).", ar: "يكلّف أرخص هاتف متصل بالإنترنت أفقرَ ٢٠٪ من الناس في البلدان منخفضة ومتوسطة الدخل ما يعادل ٤٤٪ من متوسط دخلهم الشهري، و٧٦٪ في أفريقيا جنوب الصحراء (جي إس إم إيه، ٢٠٢٦)." } },
      { value: { en: "66% / 36%", ar: "٦٦٪ / ٣٦٪" }, src: ["itu-2025-phones"],
        text: { en: "In Africa, 66% of people own a mobile phone but only 36% are online (ITU, 2025): the phone is the device people have.", ar: "في أفريقيا، يملك ٦٦٪ من الناس هاتفًا محمولًا، لكن ٣٦٪ فقط متصلون بالإنترنت (الاتحاد الدولي للاتصالات، ٢٠٢٥): الهاتف هو الجهاز الذي يملكه الناس." } },
    ],
  },
  {
    id: "schools",
    h3: { en: "Schools without computers, and learning at risk", ar: "مدارس بلا حواسيب، وتعلّم في خطر" },
    items: [
      { value: { en: "Under half", ar: "أقل من النصف" }, src: ["un-sdg-2026"],
        text: { en: "Fewer than half of the world's primary schools have computers or internet access; in the least developed countries, around three quarters lack them (United Nations, 2026).", ar: "أقل من نصف المدارس الابتدائية في العالم لديها حواسيب أو اتصال بالإنترنت، وفي البلدان الأقل نموًا يفتقر نحو ثلاثة أرباعها إليها (الأمم المتحدة، ٢٠٢٦)." } },
      { value: { en: "2 in 3", ar: "٢ من ٣" }, src: ["unicef-itu-2020"],
        text: { en: "In 2020, two thirds of the world's school-age children, 1.3 billion aged 3 to 17, had no internet connection at home; in low-income countries, fewer than 1 in 20 had one (UNICEF and ITU).", ar: "في ٢٠٢٠، لم يكن لدى ثلثي أطفال العالم في سن الدراسة، أي ١٫٣ مليار طفل بين ٣ و١٧ عامًا، اتصال بالإنترنت في المنزل، وفي البلدان منخفضة الدخل كان لدى أقل من ١ من كل ٢٠ منهم اتصال (اليونيسف والاتحاد الدولي للاتصالات)." } },
      { value: { en: "70%", ar: "٧٠٪" }, src: ["worldbank-2022"],
        text: { en: "An estimated 70% of 10-year-olds in low- and middle-income countries could not read and understand a simple text in 2022 (World Bank, UNESCO, UNICEF and partners).", ar: "قُدّر أن ٧٠٪ من الأطفال في سن العاشرة في البلدان منخفضة ومتوسطة الدخل لم يستطيعوا قراءة نص بسيط وفهمه في ٢٠٢٢ (البنك الدولي واليونسكو واليونيسف وشركاؤهم)." } },
    ],
  },
  {
    id: "readiness",
    h3: { en: "Few are ready for AI and online safety", ar: "قلة مستعدون للذكاء الاصطناعي والأمان على الإنترنت" },
    items: [
      { value: { en: "11 of 51", ar: "١١ من ٥١" }, src: ["un-news-gem-2023"],
        text: { en: "Only 11 of 51 governments surveyed had curricula for AI, and only half of countries had standards for developing teachers' ICT skills (UNESCO GEM Report 2023, reported by UN News).", ar: "لم يكن لدى سوى ١١ حكومة من ٥١ شملها المسح مناهج للذكاء الاصطناعي، ولم يكن لدى سوى نصف البلدان معايير لتنمية مهارات المعلمين في تقنية المعلومات والاتصالات (تقرير اليونسكو العالمي لرصد التعليم ٢٠٢٣، كما نقلته أخبار الأمم المتحدة)." } },
      { value: { en: "Under 10%", ar: "أقل من ١٠٪" }, src: ["unesco-genai-2023"],
        text: { en: "In a 2023 UNESCO survey of over 450 schools and universities, fewer than 10% had policies or formal guidance on generative AI.", ar: "في مسح أجرته اليونسكو في ٢٠٢٣ على أكثر من ٤٥٠ مدرسة وجامعة، كان لدى أقل من ١٠٪ منها سياسات أو إرشادات رسمية بشأن الذكاء الاصطناعي التوليدي." } },
      { value: { en: "4.76 million", ar: "٤٫٧٦ مليون" }, src: ["isc2-2024"],
        text: { en: "ISC2 estimated the world's shortfall of cyber security workers at 4,763,963 people in 2024.", ar: "قدّرت ISC2 النقص العالمي في العاملين في الأمن السيبراني بـ ٤٬٧٦٣٬٩٦٣ شخصًا في ٢٠٢٤." } },
      { value: { en: "1 in 3", ar: "١ من ٣" }, src: ["unicef-2019"],
        text: { en: "In a 2019 UNICEF poll of more than 170,000 young people in 30 countries, one in three said they had been bullied online, and one in five had skipped school because of it.", ar: "في استطلاع لليونيسف في ٢٠١٩ شارك فيه أكثر من ١٧٠ ألف شاب في ٣٠ بلدًا، قال واحد من كل ثلاثة إنه تعرّض للتنمّر عبر الإنترنت، وتغيّب واحد من كل خمسة عن المدرسة بسببه." } },
    ],
  },
  {
    id: "language",
    h3: { en: "Training rarely comes in the teacher's language", ar: "التدريب نادرًا ما يأتي بلغة المعلم" },
    items: [
      { value: { en: "400 million+", ar: "أكثر من ٤٠٠ مليون" }, src: ["un-arabic", "ungeneva-arabic-2025"],
        text: { en: "Arabic is used daily by more than 400 million people and is an official language of 22 countries (United Nations, 2025).", ar: "يستخدم العربيةَ يوميًا أكثر من ٤٠٠ مليون شخص، وهي لغة رسمية في ٢٢ بلدًا (الأمم المتحدة، ٢٠٢٥)." } },
    ],
  },
];

/** How Darsi answers them. Every sentence is something the app does today; links go only to pages that exist. */
const ANSWERS = [
  { id: "a-teachers",
    h3: { en: "Train the teachers who are already in classrooms", ar: "تدريب المعلمين الموجودين في الفصول الآن" },
    p: {
      en: "Darsi trains the teachers schools already have, in short lessons (most take {lessonMin} to {lessonMax} minutes), and every lesson ends with something to try in class. Every lesson comes with a [classroom kit](/features/kits/) of slides as PDF and PowerPoint and a lesson plan or worksheet, and students have [courses of their own](/courses/), so what one teacher learns reaches a whole class.",
      ar: "يدرّب «درسي» المعلمين الموجودين في المدارس الآن، بدروس قصيرة (يستغرق معظمها من {lessonMin} إلى {lessonMax} دقيقة)، وينتهي كل درس بشيء يُجرَّب في الفصل. ومع كل درس [حقيبة للفصل](/ar/features/kits/) فيها شرائح بصيغتي PDF وPowerPoint وخطة درس أو ورقة عمل، وللطلاب [دورات خاصة بهم](/ar/courses/)، فيصل ما يتعلّمه معلم واحد إلى فصل كامل.",
    } },
  { id: "a-offline",
    h3: { en: "Work offline, on data people can afford", ar: "العمل دون اتصال، وببيانات في المتناول" },
    p: {
      en: "[Download a course once on Wi-Fi](/features/offline/), and its lessons, videos and kits keep working with no signal; progress syncs when a connection returns. Each download shows its size first: a course averages {avgMb} MB in English. Lesson videos are small, and every video has a transcript to read instead.",
      ar: "[نزّل الدورة مرة واحدة عبر Wi-Fi](/ar/features/offline/)، فتبقى دروسها وفيديوهاتها وحقائبها تعمل دون إشارة، ويُزامَن التقدّم عند عودة الاتصال. ويعرض كل تنزيل حجمه أولًا: متوسط حجم الدورة {avgMb} ميغابايت بالعربية. وفيديوهات الدروس صغيرة، ولكل فيديو نص مكتوب يمكن قراءته بدلًا منه.",
    } },
  { id: "a-phone",
    h3: { en: "Built for the phone people have", ar: "مصمَّم للهاتف الذي يملكه الناس" },
    p: {
      en: "Darsi runs in the browser and installs like an app, with no app store and no laptop. It works on older Android phones as well as new ones, tablets and computers, and has a high-contrast mode for outdoor classrooms.",
      ar: "يعمل «درسي» في المتصفح ويُثبَّت كتطبيق، دون متجر تطبيقات ودون حاسوب محمول. ويعمل على هواتف أندرويد القديمة والحديثة، وعلى الأجهزة اللوحية والحواسيب، وفيه وضع عالي التباين للفصول في الهواء الطلق.",
    } },
  { id: "a-nolab",
    h3: { en: "Computing without a computer lab", ar: "تعلّم الحوسبة دون معمل حاسوب" },
    p: {
      en: "Darsi's [{labs}](/features/labs/) compute on the phone itself, and [programming lessons](/features/code/) run real Python and SQL on the phone. The classroom activities in the kits are written to need no devices or electricity.",
      ar: "[{labs}](/ar/features/labs/) في «درسي» تحسب على الهاتف نفسه، و[دروس البرمجة](/ar/features/code/) تشغّل بايثون وSQL حقيقيين على الهاتف. وأنشطة الفصل في الحقائب مكتوبة بحيث لا تحتاج إلى أجهزة ولا إلى كهرباء.",
    } },
  { id: "a-ai",
    h3: { en: "Ready for AI, against international frameworks", ar: "استعداد للذكاء الاصطناعي، وفق أطر دولية" },
    p: {
      en: "[Lessons are mapped](/features/standards/) to UNESCO's AI competency frameworks for teachers (15 competencies in five dimensions) and for students (12 competencies in four dimensions), both from 2024, and digital-safety lessons to the European Commission's DigComp 2.2 (2022). A learner's finished lessons add up to a capability profile against them.",
      ar: "[ترتبط الدروس](/ar/features/standards/) بإطاري اليونسكو لكفايات الذكاء الاصطناعي للمعلمين (١٥ كفاية في خمسة أبعاد) وللطلاب (١٢ كفاية في أربعة أبعاد)، وكلاهما من ٢٠٢٤، وترتبط دروس الأمان الرقمي بإطار DigComp 2.2 للمفوضية الأوروبية (٢٠٢٢). وتتجمّع الدروس التي أنهاها المتعلّم في ملف قدرات وفق هذه الأطر.",
    } },
  { id: "a-safety",
    h3: { en: "Cyber security and AI safety for every school", ar: "الأمن السيبراني وأمان الذكاء الاصطناعي لكل مدرسة" },
    p: {
      en: "The cyber security and AI security tracks teach passwords, two-step verification, phishing, protecting pupils' and school data, and attacks on AI apps, for teachers and for students.",
      ar: "يعلّم مسارا الأمن السيبراني وأمن الذكاء الاصطناعي كلمات المرور، والتحقّق بخطوتين، والتصيّد، وحماية بيانات الطلاب والمدرسة، والهجمات على تطبيقات الذكاء الاصطناعي، للمعلمين وللطلاب.",
    } },
  { id: "a-language",
    h3: { en: "In the learner's own language", ar: "بلغة المتعلّم نفسه" },
    p: {
      en: "Every course is in English and Arabic, with videos narrated in English and in Egyptian Arabic. The Arabic screens are [designed right to left](/features/languages/), not translated afterwards, and the platform is built so that more languages can be added.",
      ar: "كل دورة بالعربية والإنجليزية، مع فيديوهات مشروحة بالصوت بالإنجليزية وبالعامية المصرية. والشاشات العربية [مصمَّمة من اليمين إلى اليسار](/ar/features/languages/)، لا مترجمة لاحقًا، والمنصة مبنية بحيث يمكن إضافة لغات أخرى.",
    } },
  { id: "a-free",
    h3: { en: "Free for teachers and learners", ar: "مجاني للمعلمين والمتعلّمين" },
    p: {
      en: "[Courses](/courses/), labs and classroom kits are free for individual teachers and learners, and anyone can start as a guest. Kits are free to copy for a school.",
      ar: "[الدورات](/ar/courses/) والمختبرات وحقائب الفصل مجانية للمعلمين والمتعلّمين الأفراد، ويمكن لأي شخص أن يبدأ كزائر. ويُسمح بنسخ الحقائب للمدرسة مجانًا.",
    } },
];

const COPY = {
  title: { en: "Why Darsi exists: teacher training for AI, IoT and cyber security where it is hardest to reach", ar: "لماذا وُجد «درسي»: تدريب المعلمين على الذكاء الاصطناعي وإنترنت الأشياء والأمن السيبراني حيث يصعب الوصول" },
  h1: { en: "Why Darsi exists", ar: "لماذا وُجد «درسي»" },
  description: {
    en: "The world needs 44 million more teachers by 2030, 2.2 billion people are offline, and few teachers are trained for AI. How Darsi trains teachers and students on low-cost phones, offline, in English and Arabic, with sources.",
    ar: "يحتاج العالم إلى ٤٤ مليون معلم إضافي بحلول ٢٠٣٠، و٢٫٢ مليار شخص دون اتصال، وقلة من المعلمين مدرَّبون على الذكاء الاصطناعي. كيف يدرّب «درسي» المعلمين والطلاب على الهواتف منخفضة التكلفة، دون اتصال، بالعربية والإنجليزية، مع المصادر.",
  },
  lead: {
    en: [
      "Schools everywhere are now asked to teach artificial intelligence, computing and staying safe online. The people asked to do it are teachers, and most of them never had the chance to learn these subjects.",
      "The training that exists usually assumes a laptop, a fast and cheap connection, free time and fluent English. Darsi is built for the teacher who has one phone, pays for data by the megabyte and teaches in Arabic or English: {courses} in {courseTracks}, free, offline, in their language.",
    ],
    ar: [
      "يُطلب اليوم من المدارس في كل مكان أن تعلّم الذكاء الاصطناعي والحوسبة والأمان على الإنترنت. ومن يُطلب منهم ذلك هم المعلمون، ومعظمهم لم تُتح لهم فرصة تعلّم هذه المواد.",
      "والتدريب الموجود يفترض عادةً حاسوبًا محمولًا، واتصالًا سريعًا ورخيصًا، ووقت فراغ، وإنجليزية متقنة. أما «درسي» فمصمَّم لمعلم يملك هاتفًا واحدًا، ويدفع ثمن البيانات بالميغابايت، ويدرّس بالعربية أو بالإنجليزية: {courses} في {courseTracks}، مجانًا، ودون اتصال، وبلغته.",
    ],
  },
  needs: { en: "The needs, in figures", ar: "الاحتياجات بالأرقام" },
  needsNote: { en: "Each figure names its source and year; the sources are listed with links at the end of the page.", ar: "يذكر كل رقم مصدره وسنته، والمصادر مذكورة مع روابطها في آخر الصفحة." },
  answers: { en: "How Darsi answers them", ar: "كيف يستجيب «درسي» لها" },
  cta: { href: "/", en: "Start learning with Darsi", ar: "ابدأ التعلّم مع «درسي»" },
  source: { en: "Source", ar: "المصدر" },
  faq: {
    en: [
      ["Who is Darsi for?", "School and university teachers and their students, especially where devices are shared, data is costly and training is scarce. Schools, universities, ministries and NGOs can register an organization to bring their people in."],
      ["What does Darsi teach?", "{courses} in {courseTracks}: {trackNames}. Each has narrated videos, readings, practice questions, hands-on labs and projects, in English and Arabic."],
      ["Does Darsi work without the internet?", "Yes. After a course is downloaded, its lessons, videos and kits work offline, and progress syncs when a connection returns."],
      ["Which frameworks does Darsi follow?", "UNESCO's AI competency frameworks for teachers and for students (2024), and the European Commission's DigComp 2.2 (2022) for digital safety, with Darsi's own strands for subjects no international school framework covers yet."],
      ["Is Darsi free?", "Yes, for individual teachers and learners: courses, labs and classroom kits, with no account needed to start."],
      ["Where do the figures on this page come from?", "From UNESCO, the United Nations, ITU, UNICEF, the World Bank, GSMA and ISC2. Each figure names its year, and its source is linked at the end of the page."],
    ],
    ar: [
      ["لمن «درسي»؟", "لمعلمي المدارس والجامعات وطلابهم، خصوصًا حيث تُتقاسم الأجهزة، وتكون البيانات مكلفة، والتدريب نادرًا. ويمكن للمدارس والجامعات والوزارات والمنظمات تسجيل مؤسسة لإضافة أفرادها."],
      ["ماذا يعلّم «درسي»؟", "{courses} في {courseTracks}: {trackNames}. في كل دورة فيديوهات مشروحة بالصوت، وقراءات، وأسئلة للتدريب، ومختبرات تفاعلية، ومشروعات، بالعربية والإنجليزية."],
      ["هل يعمل «درسي» دون إنترنت؟", "نعم. بعد تنزيل الدورة، تعمل دروسها وفيديوهاتها وحقائبها دون اتصال، ويُزامَن التقدّم عند عودة الاتصال."],
      ["ما الأطر التي يتبعها «درسي»؟", "إطارا اليونسكو لكفايات الذكاء الاصطناعي للمعلمين وللطلاب (٢٠٢٤)، وإطار DigComp 2.2 للمفوضية الأوروبية (٢٠٢٢) للأمان الرقمي، مع محاور «درسي» الخاصة للمواد التي لا يغطيها بعدُ إطار مدرسي دولي."],
      ["هل «درسي» مجاني؟", "نعم، للمعلمين والمتعلّمين الأفراد: الدورات والمختبرات وحقائب الفصل، دون حاجة إلى حساب للبدء."],
      ["من أين تأتي الأرقام في هذه الصفحة؟", "من اليونسكو والأمم المتحدة والاتحاد الدولي للاتصالات واليونيسف والبنك الدولي وجي إس إم إيه وISC2. ويذكر كل رقم سنته، ومصدره مرتبط في آخر الصفحة."],
    ],
  },
};

export const WHY_KEYS = ["index"];

/** The page. Sources are numbered in the order the figures first use them. */
export function whyPage(key, lang, data, models) {
  const W = WORDS[lang];
  const f = facts(data, models, lang);
  const order = [];
  for (const g of NEEDS) for (const it of g.items) for (const s of it.src) if (!order.includes(s)) order.push(s);
  for (const s of ["unesco-ai-cft", "unesco-ai-cfs", "jrc-digcomp-22"]) if (!order.includes(s)) order.push(s);
  const ref = (s) => `<a href="#src-${s}">[${(order.indexOf(s) + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")}]</a>`;
  const needs = NEEDS.map((g) => `<h3 id="${g.id}">${esc(g.h3[lang])}</h3><ul class="pp-figures">${g.items.map((it) =>
    `<li class="pp-figure"><strong>${esc(it.value[lang])}</strong><p>${esc(it.text[lang])}</p><p class="pp-cite">${esc(COPY.source[lang])}: ${it.src.map(ref).join(" ")}</p></li>`).join("")}</ul>`).join("\n");
  const answers = ANSWERS.map((a) => `<h3 id="${a.id}">${esc(a.h3[lang])}</h3><p>${rich(fill(a.p[lang], f))}</p>`).join("\n");
  const faq = COPY.faq[lang].map(([q, a]) => [fill(q, f), plain(fill(a, f))]);
  const sources = `<section class="pp-section" aria-labelledby="sources"><h2 id="sources">${esc(W.sources)}</h2><ol class="pp-sources">${order.map((s) =>
    `<li id="src-${s}"><a href="${esc(SOURCES[s].url)}" rel="noopener" lang="en" dir="ltr">${esc(SOURCES[s].label)}</a></li>`).join("")}</ol><p class="pp-note">${esc(W.updated)}</p></section>`;
  const body = `<article>
<header class="pp-head">
<h1>${esc(COPY.h1[lang])}</h1>
${COPY.lead[lang].map((p, i) => `<p${i === 0 ? ' class="pp-lead"' : ""}>${rich(fill(p, f))}</p>`).join("\n")}
<p class="pp-cta"><a class="pp-btn" href="${esc(appOf(COPY.cta.href, lang))}">${esc(COPY.cta[lang])}</a> <a class="pp-link" href="${pathOf("courses", lang)}">${esc(W.footer.courses)}</a></p>
</header>
<section class="pp-section" aria-labelledby="needs"><h2 id="needs">${esc(COPY.needs[lang])}</h2><p class="pp-note">${esc(COPY.needsNote[lang])}</p>
${needs}
</section>
<section class="pp-section" aria-labelledby="answers"><h2 id="answers">${esc(COPY.answers[lang])}</h2>
${answers}
</section>
${faqBlock(W.faq.title, faq)}
${sources}
</article>`;
  return {
    slug: "why-darsi", lang, kind: "article", h1: COPY.h1[lang],
    title: `${COPY.title[lang]} | ${W.brand}`, description: cut(COPY.description[lang], 300), crumbs: [], body,
    ld: [{ "@type": "Article", headline: COPY.h1[lang], description: cut(COPY.description[lang], 300), inLanguage: lang, author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID }, isPartOf: { "@id": WEBSITE_ID },
      citation: order.map((s) => ({ "@type": "CreativeWork", name: SOURCES[s].label, url: SOURCES[s].url })) }, ...faqLd(faq)],
  };
}

export { NEEDS, ANSWERS };
