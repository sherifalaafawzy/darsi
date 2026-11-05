import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "denoise", category: "ai-vision", level: 3, minutes: 6, order: 6,
  title: { en: "One denoise step", ar: "خطوة إزالة ضجيج" },
  summary: { en: "Add noise to an 8×8 picture, then take one step that pulls each pixel toward its neighbours. One step is not the whole picture back.", ar: "أضف ضجيجًا إلى صورة ٨×٨، ثم خذ خطوة تسحب كل بكسل نحو جيرانه. خطوة واحدة لا تعيد الصورة كلها." },
};
