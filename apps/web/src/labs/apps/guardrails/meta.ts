import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "guardrails", category: "aisec-apps", level: 2, minutes: 11, order: 2,
  title: { en: "Rules around the model", ar: "قواعد حول النموذج" },
  summary: { en: "Put a word filter and a code check around Darsi Tiny. See a keyword filter miss a reworded message, while a check on the action itself holds every time.", ar: "ضع مرشّح كلمات وفحصًا في الكود حول «درسي الصغير». انظر كيف يُفلت مرشّح الكلمات رسالة أُعيدت صياغتها، بينما يصمد فحص الفعل نفسه في كل مرة." },
};
