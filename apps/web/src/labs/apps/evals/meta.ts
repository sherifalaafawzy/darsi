import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "evals", category: "agents-practice", level: 3, minutes: 10, order: 3,
  title: { en: "Test an agent", ar: "اختبر الوكيل" },
  summary: { en: "Run Darsi Tiny over a test set of 32 requests and score the tool and its details. Compare English and Arabic, and wordings it was trained on with new ones, and read every failure.", ar: "شغّل «درسي الصغير» على مجموعة اختبار من ٣٢ طلبًا وقيّم الأداة وتفاصيلها. قارن العربية بالإنجليزية، والصيغ التي تدرّب عليها بصيغ جديدة، واقرأ كل خطأ." },
};
