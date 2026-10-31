import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "poison", category: "aisec-models", level: 2, minutes: 10, order: 1,
  title: { en: "Poison the training data", ar: "سمّم بيانات التدريب" },
  summary: { en: "Flip some labels in a small training set, train a model on your phone and watch its accuracy fall. Then find the poisoned points as odd ones out, drop them, and train again.", ar: "اقلب بعض التسميات في مجموعة تدريب صغيرة، ودرّب نموذجًا على هاتفك وراقب دقّته تهبط. ثم اعثر على النقاط المسمّمة بوصفها شاذّة، واحذفها، ودرّب من جديد." },
};
