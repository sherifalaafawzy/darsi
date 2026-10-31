import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "timetable", category: "opt-search", level: 3, minutes: 9, order: 1,
  title: { en: "Build the timetable", ar: "اصنع الجدول المدرسي" },
  summary: { en: "A small school timetable as constraints: watch propagation cross out impossible periods step by step, search guess when it is stuck, and plain backtracking need far more guesses.", ar: "جدول مدرسي صغير على شكل قيود: شاهد الانتشار يشطب الحصص المستحيلة خطوة بخطوة، والبحث يخمّن حين يتوقف، والتراجع البسيط يحتاج إلى تخمينات أكثر بكثير." },
};
