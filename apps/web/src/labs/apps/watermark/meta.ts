import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "watermark", category: "aisec-models", level: 2, minutes: 9, order: 4,
  title: { en: "Watermark the words", ar: "علِّم الكلمات بعلامة مائية" },
  summary: { en: "A model can secretly prefer a hidden “green” half of its words, so a detector can later spot its writing. See the signal, then edit the text and watch it fade — detectors are a hint, never proof.", ar: "يمكن للنموذج أن يفضّل سرًّا نصفًا «أخضر» خفيًّا من كلماته، فيلتقط كاشفٌ كتابته لاحقًا. انظر الإشارة، ثم عدّل النص وراقبها تتلاشى — الكواشف قرينة لا دليل." },
};
