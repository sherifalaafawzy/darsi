import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "llm", category: "ai-language", level: 3, minutes: 10, order: 6, ladder: 16,
  title: { en: "Inside an LLM", ar: "داخل نموذج لغوي كبير" },
  summary: { en: "Follow one word being written: tokens become numbers, attention gathers context, the model scores every next word, picks one and repeats.", ar: "تتبّع كتابة كلمة واحدة: تصبح الرموز أرقامًا، ويجمع الانتباه السياق، ويقيّم النموذج كل كلمة تالية، ثم يختار واحدة ويكرّر." },
};
