import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "knapsack", category: "opt-models", level: 2, minutes: 7, order: 3,
  title: { en: "Pack the truck", ar: "حمّل الشاحنة" },
  summary: { en: "Load supplies for a village school onto a small truck: greedy packing by value per kilo against the true best load from dynamic programming, with a case where greedy gets it wrong.", ar: "حمّل لوازم مدرسة القرية على شاحنة صغيرة: التعبئة الجشعة بحسب القيمة لكل كيلوغرام مقابل أفضل حمولة فعلًا بالبرمجة الديناميكية، مع حالة يخطئ فيها الجشع." },
};
