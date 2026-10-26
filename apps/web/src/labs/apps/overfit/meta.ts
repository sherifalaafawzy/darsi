import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "overfit", category: "ai-networks", level: 2, minutes: 7, order: 3, ladder: 7,
  title: { en: "Too good to be true", ar: "أفضل من أن يكون حقيقيًا" },
  summary: { en: "Give a model more and more freedom and watch it memorise the training points while getting new ones wrong: overfitting.", ar: "امنح النموذج حرية أكثر فأكثر، وشاهده يحفظ نقاط التدريب بينما يخطئ في النقاط الجديدة: إنه الإفراط في المطابقة." },
};
