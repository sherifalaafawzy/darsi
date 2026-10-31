import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "colouring", category: "opt-search", level: 2, minutes: 7, order: 5,
  title: { en: "Exam slots without clashes", ar: "مواعيد امتحانات بلا تعارض" },
  summary: { en: "Plan exam slots as graph colouring: exams that share a pupil can't share a slot. Try it yourself, watch greedy and DSatur, and find out how few slots are really enough.", ar: "خطّط مواعيد الامتحانات بتلوين مخطّط: الامتحانان اللذان يشتركان في تلميذ لا يشتركان في موعد. جرّب بنفسك، وشاهد الطريقة الجشعة وDSatur، واكتشف أقل عدد من المواعيد يكفي حقًا." },
};
