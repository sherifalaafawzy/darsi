import { TrainClassifier } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { LabProps } from "../../types";

/** A word-overlap classifier trained on the learner's own examples. */
export default function Classifier(_: LabProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  return <TrainClassifier key={lang} kicker={L("AI lab", "مختبر الذكاء الاصطناعي")} title={L("Teach the machine", "علّم الآلة")}
    addLabel={L("Add example", "أضف مثالًا")} draftLabel={L("New example", "مثال جديد")} testLabel={L("Test the model", "اختبر النموذج")} guessLabel={L("The model thinks:", "يظن النموذج أنها:")} confidenceLabel={L("Confidence", "الثقة")}
    classes={[
      { id: "s", label: L("Safe message", "رسالة آمنة"), tone: "lagoon", examples: ar ? ["الاجتماع يوم الثلاثاء", "جدول الامتحانات مرفق"] : ["Meeting moved to Tuesday", "Exam timetable attached"] },
      { id: "p", label: L("Phishing", "تصيّد"), tone: "hibiscus", examples: ar ? ["حسابك سيُغلق اضغط الآن", "ربحت جائزة أرسل رقمك السري"] : ["Your account will be closed click now", "You won a prize send your PIN"] },
    ]}
    test={L("Click now to keep your account", "اضغط الآن للحفاظ على حسابك")}
    takeaway={L("The model only knows the examples you gave it. Few or biased examples give wrong answers.", "النموذج لا يعرف إلا الأمثلة التي أعطيته إياها. الأمثلة القليلة أو المنحازة تعطي إجابات خاطئة.")} />;
}
