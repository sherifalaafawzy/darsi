import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "anneal", category: "opt-search", level: 3, minutes: 9, order: 6,
  title: { en: "Getting unstuck: simulated annealing", ar: "الخروج من الطريق المسدود: التلدين المحاكى" },
  summary: { en: "Make a seating plan by swapping pupils: hill climbing gets stuck in a plan no single swap improves, while simulated annealing accepts some worse swaps while it is hot and finds better plans.", ar: "اصنع خطة جلوس بتبديل أماكن التلاميذ: يعلق تسلّق التل في خطة لا يحسّنها أي تبديل واحد، بينما يقبل التلدين المحاكى بعض التبديلات الأسوأ ما دام ساخنًا فيجد خططًا أفضل." },
};
