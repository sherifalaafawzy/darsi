import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "pipeline", category: "data-pipelines", level: 2, minutes: 7, order: 2,
  title: { en: "A data pipeline", ar: "خط بيانات" },
  summary: { en: "Every evening, attendance goes from the class registers to the district's report: extract, transform, load. Make a step fail, retry, and see why running twice mustn't count pupils twice.", ar: "كل مساء ينتقل الحضور من سجلّات الفصول إلى تقرير الإدارة: استخراج، فتحويل، فتحميل. اجعل خطوة تفشل، وأعد المحاولة، وانظر لماذا يجب ألا يعدّ التشغيل مرتين التلاميذ مرتين." },
};
