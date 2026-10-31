import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "teach", category: "agents-practice", level: 3, minutes: 15, order: 2,
  title: { en: "Teach the agent a new tool", ar: "علّم الوكيل أداة جديدة" },
  summary: { en: "Fine-tune Darsi Tiny on this phone: teach it a bus timetable tool from 16 examples, then test the new tool and its old skills. Without old examples mixed in, it forgets what it knew.", ar: "اضبط «درسي الصغير» على هذا الهاتف: علّمه أداة لمواعيد الحافلات من ١٦ مثالًا، ثم اختبر الأداة الجديدة ومهاراته القديمة. وإن لم تخلط معها أمثلة قديمة، نسي ما كان يعرفه." },
};
