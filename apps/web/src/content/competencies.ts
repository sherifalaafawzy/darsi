import type { LocalText } from "./types";

/**
 * Competency catalogue. Lessons tag the competencies they build; admins see a capability profile per person.
 * - T.*  UNESCO AI Competency Framework for Teachers (2024): 5 dimensions × 3 levels (Acquire, Deepen, Create).
 * - S.*  UNESCO AI Competency Framework for Students (2024): 4 dimensions × 3 levels (Understand, Apply, Create).
 * - DC.* EU DigComp 2.2 competences (used for cyber security and digital safety).
 * - IOT.* Darsi IoT strands (no international teacher framework exists yet for IoT).
 * - CODE.*, DATA.*, AGT.*, OPT.*, AIS.*, DS.* Darsi strands for programming, data engineering, AI agents, optimization, AI security and data science.
 */
export interface Competency { code: string; framework: "UNESCO-T" | "UNESCO-S" | "DigComp" | "Darsi"; area: LocalText; level?: LocalText; label: LocalText }

const T_DIMS: [string, LocalText][] = [
  ["HM", { en: "Human-centred mindset", ar: "عقلية محورها الإنسان" }],
  ["ET", { en: "Ethics of AI", ar: "أخلاقيات الذكاء الاصطناعي" }],
  ["AF", { en: "AI foundations and applications", ar: "أسس الذكاء الاصطناعي وتطبيقاته" }],
  ["PE", { en: "AI pedagogy", ar: "التدريس بالذكاء الاصطناعي" }],
  ["PL", { en: "AI for professional learning", ar: "الذكاء الاصطناعي للتطوّر المهني" }],
];
const T_LEVELS: [string, LocalText][] = [["A", { en: "Acquire", ar: "اكتساب" }], ["D", { en: "Deepen", ar: "تعميق" }], ["C", { en: "Create", ar: "إبداع" }]];
const S_DIMS: [string, LocalText][] = [
  ["HM", { en: "Human-centred mindset", ar: "عقلية محورها الإنسان" }],
  ["ET", { en: "Ethics of AI", ar: "أخلاقيات الذكاء الاصطناعي" }],
  ["TA", { en: "AI techniques and applications", ar: "تقنيات الذكاء الاصطناعي وتطبيقاته" }],
  ["SD", { en: "AI system design", ar: "تصميم أنظمة الذكاء الاصطناعي" }],
];
const S_LEVELS: [string, LocalText][] = [["U", { en: "Understand", ar: "فهم" }], ["A", { en: "Apply", ar: "تطبيق" }], ["C", { en: "Create", ar: "إبداع" }]];

const DIGCOMP: [string, LocalText, LocalText][] = [
  ["1.1", { en: "Information and data literacy", ar: "الثقافة المعلوماتية" }, { en: "Browsing, searching and filtering data", ar: "تصفّح البيانات والبحث عنها وتصفيتها" }],
  ["1.2", { en: "Information and data literacy", ar: "الثقافة المعلوماتية" }, { en: "Evaluating data, information and digital content", ar: "تقييم البيانات والمعلومات والمحتوى الرقمي" }],
  ["1.3", { en: "Information and data literacy", ar: "الثقافة المعلوماتية" }, { en: "Managing data, information and digital content", ar: "إدارة البيانات والمعلومات والمحتوى الرقمي" }],
  ["2.6", { en: "Communication and collaboration", ar: "التواصل والتعاون" }, { en: "Managing digital identity", ar: "إدارة الهوية الرقمية" }],
  ["3.4", { en: "Digital content creation", ar: "إنشاء المحتوى الرقمي" }, { en: "Programming", ar: "البرمجة" }],
  ["4.1", { en: "Safety", ar: "السلامة" }, { en: "Protecting devices", ar: "حماية الأجهزة" }],
  ["4.2", { en: "Safety", ar: "السلامة" }, { en: "Protecting personal data and privacy", ar: "حماية البيانات الشخصية والخصوصية" }],
  ["4.3", { en: "Safety", ar: "السلامة" }, { en: "Protecting health and well-being", ar: "حماية الصحة والرفاهية" }],
  ["5.1", { en: "Problem solving", ar: "حل المشكلات" }, { en: "Solving technical problems", ar: "حل المشكلات التقنية" }],
  ["5.2", { en: "Problem solving", ar: "حل المشكلات" }, { en: "Identifying needs and technological responses", ar: "تحديد الاحتياجات والحلول التقنية" }],
  ["5.3", { en: "Problem solving", ar: "حل المشكلات" }, { en: "Creatively using digital technologies", ar: "الاستخدام الإبداعي للتقنيات الرقمية" }],
];
const IOT: [string, LocalText][] = [
  ["IOT.1", { en: "Sensing and data collection", ar: "الاستشعار وجمع البيانات" }],
  ["IOT.2", { en: "Connectivity and networks", ar: "الاتصال والشبكات" }],
  ["IOT.3", { en: "Building and automating devices", ar: "بناء الأجهزة وأتمتتها" }],
  ["IOT.4", { en: "Securing connected devices", ar: "تأمين الأجهزة المتصلة" }],
];
/** Darsi strands for the tracks added in 2026-10 (no single international framework covers them for schools). */
const STRANDS: [LocalText, [string, LocalText][]][] = [
  [{ en: "Programming", ar: "البرمجة" }, [
    ["CODE.1", { en: "Algorithms and computational thinking", ar: "الخوارزميات والتفكير الحاسوبي" }],
    ["CODE.2", { en: "Reading and writing programs", ar: "قراءة البرامج وكتابتها" }],
    ["CODE.3", { en: "Testing and debugging", ar: "الاختبار وتصحيح الأخطاء" }],
    ["CODE.4", { en: "Designing software and teaching programming", ar: "تصميم البرمجيات وتعليم البرمجة" }],
  ]],
  [{ en: "Data engineering", ar: "هندسة البيانات" }, [
    ["DATA.1", { en: "Collecting and organising data", ar: "جمع البيانات وتنظيمها" }],
    ["DATA.2", { en: "Cleaning data and checking its quality", ar: "تنظيف البيانات والتحقق من جودتها" }],
    ["DATA.3", { en: "Databases and SQL", ar: "قواعد البيانات ولغة SQL" }],
    ["DATA.4", { en: "Pipelines, privacy and governance", ar: "خطوط البيانات والخصوصية والحوكمة" }],
  ]],
  [{ en: "Data science", ar: "علم البيانات" }, [
    ["DS.1", { en: "Describing data with statistics", ar: "وصف البيانات بالإحصاء" }],
    ["DS.2", { en: "Visualising and exploring data", ar: "تمثيل البيانات بصريًا واستكشافها" }],
    ["DS.3", { en: "Modelling and prediction", ar: "النمذجة والتنبؤ" }],
    ["DS.4", { en: "Evaluating, communicating and using data responsibly", ar: "تقييم البيانات وعرضها واستخدامها بمسؤولية" }],
  ]],
  [{ en: "AI agents", ar: "وكلاء الذكاء الاصطناعي" }, [
    ["AGT.1", { en: "How agents work: the loop, tools and memory", ar: "كيف يعمل الوكلاء: الحلقة والأدوات والذاكرة" }],
    ["AGT.2", { en: "Using agents safely: approval and permissions", ar: "استخدام الوكلاء بأمان: الموافقة والصلاحيات" }],
    ["AGT.3", { en: "Building and evaluating agents", ar: "بناء الوكلاء وتقييمهم" }],
  ]],
  [{ en: "Optimization", ar: "الحلول المثلى" }, [
    ["OPT.1", { en: "Modelling decisions: goals, limits and options", ar: "نمذجة القرارات: الأهداف والقيود والخيارات" }],
    ["OPT.2", { en: "Linear and whole-number models", ar: "النماذج الخطية ونماذج الأعداد الصحيحة" }],
    ["OPT.3", { en: "Search and heuristics", ar: "البحث والطرق التقريبية" }],
    ["OPT.4", { en: "Trade-offs and fairness in decisions", ar: "الموازنات والعدالة في القرارات" }],
  ]],
  [{ en: "AI security", ar: "أمن الذكاء الاصطناعي" }, [
    ["AIS.1", { en: "Attacks on AI apps and their defences", ar: "الهجمات على تطبيقات الذكاء الاصطناعي ودفاعاتها" }],
    ["AIS.2", { en: "Protecting models and data", ar: "حماية النماذج والبيانات" }],
    ["AIS.3", { en: "Testing and governing AI security", ar: "اختبار أمن الذكاء الاصطناعي وحوكمته" }],
  ]],
];

export const COMPETENCIES: Competency[] = [
  ...T_DIMS.flatMap(([d, area]) => T_LEVELS.map(([l, level]) => ({ code: `T.${d}.${l}`, framework: "UNESCO-T" as const, area, level, label: area }))),
  ...S_DIMS.flatMap(([d, area]) => S_LEVELS.map(([l, level]) => ({ code: `S.${d}.${l}`, framework: "UNESCO-S" as const, area, level, label: area }))),
  ...DIGCOMP.map(([c, area, label]) => ({ code: `DC.${c}`, framework: "DigComp" as const, area, label })),
  ...IOT.map(([c, label]) => ({ code: c, framework: "Darsi" as const, area: { en: "IoT", ar: "إنترنت الأشياء" }, label })),
  ...STRANDS.flatMap(([area, list]) => list.map(([c, label]) => ({ code: c, framework: "Darsi" as const, area, label }))),
];
export const competency = (code: string) => COMPETENCIES.find((c) => c.code === code);

/** Capability strength from evidence count: 0 none, 1 emerging, 2 developing, 3 secure. */
export const strength = (count: number) => (count >= 3 ? 3 : count);
