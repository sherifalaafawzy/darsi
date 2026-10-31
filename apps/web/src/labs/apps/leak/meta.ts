import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "leak", category: "aisec-models", level: 3, minutes: 12, order: 3,
  title: { en: "When a model remembers too much", ar: "حين يحفظ النموذج أكثر من اللازم" },
  summary: { en: "A tiny text model learns from a few sentences — including one private line. Prompt it the right way and it repeats the secret. Add privacy noise and watch the leak close, and usefulness dip with it.", ar: "نموذج نصّي صغير يتعلّم من جُمَل قليلة — فيها سطر خاص واحد. وجّهه بالطريقة الصحيحة فيكرّر السرّ. أضف ضوضاء الخصوصية وراقب التسريب ينغلق، والفائدة تهبط معه." },
};
