import type { CategoryId, LocalStr, Track } from "./types";

/** The Labs shelves, in the order they appear. Adding an app never needs a change here; adding a shelf does. */
export const CATEGORIES: { id: CategoryId; track: Track; name: LocalStr }[] = [
  { id: "ai-learning", track: "ai", name: { en: "Neurons and learning", ar: "الخلايا العصبية والتعلّم" } },
  { id: "ai-networks", track: "ai", name: { en: "Neural networks", ar: "الشبكات العصبية" } },
  { id: "ai-vision", track: "ai", name: { en: "Computer vision", ar: "الرؤية الحاسوبية" } },
  { id: "ai-language", track: "ai", name: { en: "Language and LLMs", ar: "اللغة والنماذج اللغوية الكبيرة" } },
  { id: "ai-decisions", track: "ai", name: { en: "Decisions and agents", ar: "القرارات والوكلاء" } },
  { id: "ai-use", track: "ai", name: { en: "Using AI well", ar: "استخدام الذكاء الاصطناعي بحكمة" } },
  { id: "iot-sensors", track: "iot", name: { en: "Sensors and data", ar: "المستشعرات والبيانات" } },
  { id: "iot-electronics", track: "iot", name: { en: "Electronics and logic", ar: "الإلكترونيات والمنطق" } },
  { id: "iot-automation", track: "iot", name: { en: "Automation and networks", ar: "الأتمتة والشبكات" } },
  { id: "cyber-accounts", track: "cyber", name: { en: "Passwords and accounts", ar: "كلمات المرور والحسابات" } },
  { id: "cyber-threats", track: "cyber", name: { en: "Threats and scams", ar: "التهديدات والاحتيال" } },
  { id: "cyber-crypto", track: "cyber", name: { en: "Cryptography", ar: "التشفير" } },
  { id: "cyber-privacy", track: "cyber", name: { en: "Privacy and networks", ar: "الخصوصية والشبكات" } },
];
export const categoryOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
