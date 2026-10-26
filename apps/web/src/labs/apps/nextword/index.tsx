import { NextWordLab } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { LabProps } from "../../types";

/** Next-word probabilities and temperature. */
export default function NextWord(_: LabProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  return <NextWordLab key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Guess the next word", "خمّن الكلمة التالية")}
    tempLabel={L("Temperature", "درجة الحرارة")} lowLabel={L("Predictable", "متوقَّع")} highLabel={L("Creative", "مبدع")} generateLabel={L("Pick the next word", "اختر الكلمة التالية")}
    context={L("In the morning the pupils open their", "في الصباح يفتح الطلاب")}
    candidates={ar ? [{ word: "كتبهم", p: 0.5 }, { word: "دفاترهم", p: 0.3 }, { word: "النوافذ", p: 0.12 }, { word: "هواتفهم", p: 0.08 }] : [{ word: "books", p: 0.55 }, { word: "notebooks", p: 0.25 }, { word: "windows", p: 0.12 }, { word: "phones", p: 0.08 }]}
    takeaway={L("A chatbot writes by choosing likely next words. Temperature changes how adventurous it is.", "يكتب روبوت الدردشة باختيار الكلمات التالية المحتملة، ودرجة الحرارة تغيّر مدى جرأته.")} />;
}
