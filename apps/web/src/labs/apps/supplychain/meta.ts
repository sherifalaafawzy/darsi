import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "supplychain", category: "aisec-models", level: 2, minutes: 10, order: 5,
  title: { en: "Is this the real model?", ar: "أهذا هو النموذج الحقيقي؟" },
  summary: { en: "Before you run a downloaded model, check it. A SHA-256 fingerprint shows a single changed byte; a signature, from keys made on your phone, shows who really published it. Real fingerprints, real signatures.", ar: "قبل تشغيل نموذج نزّلته، تحقّق منه. بصمة SHA-256 تكشف تغيّر بايت واحد؛ وتوقيعٌ بمفاتيح صُنعت على هاتفك يُظهر من نشره حقًّا. بصمات حقيقية وتواقيع حقيقية." },
};
