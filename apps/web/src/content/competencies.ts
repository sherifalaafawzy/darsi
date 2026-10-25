import type { LocalText } from "./types";

/**
 * Competency catalogue. Lessons tag the competencies they build; admins see a capability profile per person.
 * - T.*  UNESCO AI Competency Framework for Teachers (2024): 5 dimensions × 3 levels (Acquire, Deepen, Create).
 * - S.*  UNESCO AI Competency Framework for Students (2024): 4 dimensions × 3 levels (Understand, Apply, Create).
 * - DC.* EU DigComp 2.2 competences (used for cyber security and digital safety).
 * - IOT.* Darsi IoT strands (no international teacher framework exists yet for IoT).
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
  ["1.2", { en: "Information and data literacy", ar: "الثقافة المعلوماتية" }, { en: "Evaluating data, information and digital content", ar: "تقييم البيانات والمعلومات والمحتوى الرقمي" }],
  ["2.6", { en: "Communication and collaboration", ar: "التواصل والتعاون" }, { en: "Managing digital identity", ar: "إدارة الهوية الرقمية" }],
  ["3.4", { en: "Digital content creation", ar: "إنشاء المحتوى الرقمي" }, { en: "Programming", ar: "البرمجة" }],
  ["4.1", { en: "Safety", ar: "السلامة" }, { en: "Protecting devices", ar: "حماية الأجهزة" }],
  ["4.2", { en: "Safety", ar: "السلامة" }, { en: "Protecting personal data and privacy", ar: "حماية البيانات الشخصية والخصوصية" }],
  ["4.3", { en: "Safety", ar: "السلامة" }, { en: "Protecting health and well-being", ar: "حماية الصحة والرفاهية" }],
  ["5.1", { en: "Problem solving", ar: "حل المشكلات" }, { en: "Solving technical problems", ar: "حل المشكلات التقنية" }],
  ["5.3", { en: "Problem solving", ar: "حل المشكلات" }, { en: "Creatively using digital technologies", ar: "الاستخدام الإبداعي للتقنيات الرقمية" }],
];
const IOT: [string, LocalText][] = [
  ["IOT.1", { en: "Sensing and data collection", ar: "الاستشعار وجمع البيانات" }],
  ["IOT.2", { en: "Connectivity and networks", ar: "الاتصال والشبكات" }],
  ["IOT.3", { en: "Building and automating devices", ar: "بناء الأجهزة وأتمتتها" }],
  ["IOT.4", { en: "Securing connected devices", ar: "تأمين الأجهزة المتصلة" }],
];

export const COMPETENCIES: Competency[] = [
  ...T_DIMS.flatMap(([d, area]) => T_LEVELS.map(([l, level]) => ({ code: `T.${d}.${l}`, framework: "UNESCO-T" as const, area, level, label: area }))),
  ...S_DIMS.flatMap(([d, area]) => S_LEVELS.map(([l, level]) => ({ code: `S.${d}.${l}`, framework: "UNESCO-S" as const, area, level, label: area }))),
  ...DIGCOMP.map(([c, area, label]) => ({ code: `DC.${c}`, framework: "DigComp" as const, area, label })),
  ...IOT.map(([c, label]) => ({ code: c, framework: "Darsi" as const, area: { en: "IoT", ar: "إنترنت الأشياء" }, label })),
];
export const competency = (code: string) => COMPETENCIES.find((c) => c.code === code);

/** Capability strength from evidence count: 0 none, 1 emerging, 2 developing, 3 secure. */
export const strength = (count: number) => (count >= 3 ? 3 : count);
