import { TrainClassifier } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import type { LabProps } from "../../types";

/** A word-overlap classifier trained on the learner's own examples. */
export default function Classifier(_: LabProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  return <>
    <TryThis items={[
      L("Change the test to “Confirm the bank password today”: none of its words are in the examples, so the model only guesses, at 50%.", "غيّر نص الاختبار إلى «أكد كلمة سر البنك اليوم»: لا توجد أي كلمة منه في الأمثلة، فيكتفي النموذج بالتخمين، بثقة ٥٠٪."),
      L("Type that message in “New example”, add it to Phishing and test again: now the model gets it right, because it has seen those words.", "اكتب الرسالة نفسها في «مثال جديد» وأضفها إلى «تصيّد»، ثم اختبر من جديد: يصيب النموذج الآن، لأنه رأى هذه الكلمات."),
      L("Test “Click now to see the exam timetable”: words from both lists compete, and the model calls it safe. With few examples, a model is easy to fool.", "اختبر «اضغط الآن لترى جدول الامتحانات»: تتنافس كلمات من القائمتين، فيحكم النموذج بأنها آمنة. النموذج الذي تعلّم من أمثلة قليلة سهل الخداع."),
    ]} />
    <TrainClassifier key={lang} kicker={L("AI lab", "مختبر الذكاء الاصطناعي")} title={L("Teach the machine", "علّم الآلة")}
    addLabel={L("Add example", "أضف مثالًا")} draftLabel={L("New example", "مثال جديد")} testLabel={L("Test the model", "اختبر النموذج")} guessLabel={L("The model thinks:", "يظن النموذج أنها:")} confidenceLabel={L("Confidence", "الثقة")}
    classes={[
      { id: "s", label: L("Safe message", "رسالة آمنة"), tone: "lagoon", examples: ar ? ["الاجتماع يوم الثلاثاء", "جدول الامتحانات مرفق"] : ["Meeting moved to Tuesday", "Exam timetable attached"] },
      { id: "p", label: L("Phishing", "تصيّد"), tone: "hibiscus", examples: ar ? ["حسابك سيغلق اضغط الآن", "ربحت جائزة أرسل رقمك السري"] : ["Your account will be closed click now", "You won a prize send your PIN"] },
    ]}
    test={L("Click now to keep your account", "اضغط الآن للحفاظ على حسابك")}
    takeaway={L("The model only knows the examples you gave it. Few or biased examples give wrong answers.", "النموذج لا يعرف إلا الأمثلة التي أعطيته إياها. الأمثلة القليلة أو المنحازة تعطي إجابات خاطئة.")} />
  </>;
}
