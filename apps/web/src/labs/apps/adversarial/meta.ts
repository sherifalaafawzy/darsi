import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "adversarial", category: "aisec-models", level: 3, minutes: 12, order: 2,
  title: { en: "Fool it with a few pixels", ar: "اخدعه ببضعة بكسلات" },
  summary: { en: "A small vision model is sure what it sees. Nudge a handful of pixels in exactly the right way and it changes its mind, though you still see the same shape. Then train it to resist.", ar: "نموذج رؤية صغير واثق مما يرى. ادفع حفنة بكسلات بالطريقة الصحيحة تمامًا فيغيّر رأيه، مع أن الشكل ما زال واضحًا في عينيك. ثم درّبه على المقاومة." },
};
