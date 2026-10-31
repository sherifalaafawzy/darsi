import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "routes", category: "opt-search", level: 2, minutes: 7, order: 3,
  title: { en: "The school bus route", ar: "طريق حافلة المدرسة" },
  summary: { en: "Plan a school bus route through the villages: nearest neighbour first, then 2-opt swaps that untangle it while the distance falls, compared with the best route there is.", ar: "خطّط طريق حافلة المدرسة بين القرى: أقرب جار أولًا، ثم تبديلات 2-opt تفكّ تشابكه والمسافة تقصر، مقارنةً بأفضل طريق ممكن." },
};
