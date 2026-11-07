import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "denoise", category: "ai-vision", level: 3, minutes: 6, order: 6,
  title: { en: "One denoise step", ar: "خطوة إزالة ضوضاء" },
  summary: { en: "Add noise to an 8×8 picture, then take one step that pulls each pixel toward black or white. One step is not the whole picture back.", ar: "أضف ضوضاء إلى صورة ٨×٨، ثم خذ خطوة تسحب كل بكسل نحو الأسود أو الأبيض. خطوة واحدة لا تعيد الصورة كلها." },
};
