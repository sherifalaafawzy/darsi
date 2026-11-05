import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "split", category: "ai-learning", level: 3, minutes: 5, order: 8,
  title: { en: "Two machines, one training step", ar: "جهازان وخطوة تدريب" },
  summary: { en: "A layer can be too wide for one machine, or a batch too big. Choose whether to split the examples or the layer, and see which one fits.", ar: "قد تكون الطبقة أعرض من جهاز واحد، أو الدفعة أكبر من سعته. اختر أن تقسم الأمثلة أو الطبقة، وانظر أيهما يتسع." },
};
