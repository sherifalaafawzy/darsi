import { useRef, type MouseEvent } from "react";
import { TrainClassifier } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

const S = {
  en: {
    try1: "Change the test to “Confirm the bank password today”: none of its words are in the examples, so the model only guesses, at 50%.",
    try2: "Type that message in “New example”, add it to Phishing and test again: now the model gets it right, because it has seen those words.",
    try3: "Test “Click now to see the exam timetable”: words from both lists compete, and the model calls it safe. With few examples, a model is easy to fool.",
    kicker: "AI lab", title: "Teach the machine", add: "Add example", draft: "New example", test: "Test the model", guess: "The model thinks:",
    confidence: "Confidence", safe: "Safe message", phishing: "Phishing",
    takeaway: "The model only knows the examples you gave it. Few or biased examples give wrong answers.",
  },
  ar: {
    try1: "غيّر نص الاختبار إلى «أكد كلمة سر البنك اليوم»: لا توجد أي كلمة منه في الأمثلة، فيكتفي النموذج بالتخمين، بثقة ٥٠٪.",
    try2: "اكتب الرسالة نفسها في «مثال جديد» وأضفها إلى «تصيّد»، ثم اختبر من جديد: يصيب النموذج الآن، لأنه رأى هذه الكلمات.",
    try3: "اختبر «اضغط الآن لترى جدول امتحانات يوم الثلاثاء»: تتنافس كلمات من القائمتين، فيحكم النموذج بأنها آمنة. النموذج الذي تعلّم من أمثلة قليلة سهل الخداع.",
    kicker: "مختبر الذكاء الاصطناعي", title: "علّم الآلة", add: "أضف مثالًا", draft: "مثال جديد", test: "اختبر النموذج", guess: "يظن النموذج أنها:",
    confidence: "الثقة", safe: "رسالة آمنة", phishing: "تصيّد",
    takeaway: "النموذج لا يعرف إلا الأمثلة التي أعطيته إياها. الأمثلة القليلة أو المنحازة تعطي إجابات خاطئة.",
  },
};

/** A word-overlap classifier trained on the learner's own examples. Its examples and test message are what the model
 * computes on, so they stay English in every language but Arabic. */
export default function Classifier({ onDone }: LabProps) {
  const { lang, num } = useI18n();
  const ar = lang === "ar";
  const s = useS(S);
  // Adding an example is the lab, so the first one marks it done. The design-system card has no callback: its only
  // buttons are "Add example" (a disabled one sends no click), and their clicks bubble up to the wrapper below.
  const done = useRef(false);
  const added = (e: MouseEvent) => { if (!done.current && (e.target as Element).closest("button")) { done.current = true; onDone?.(); } };
  return <>
    <TryThis items={[s.try1, s.try2, s.try3]} />
    <div onClick={added}>
    <TrainClassifier key={lang} num={num} kicker={s.kicker} title={s.title}
    addLabel={s.add} draftLabel={s.draft} testLabel={s.test} guessLabel={s.guess} confidenceLabel={s.confidence}
    classes={[
      { id: "s", label: s.safe, tone: "lagoon", examples: ar ? ["الاجتماع يوم الثلاثاء", "جدول الامتحانات مرفق"] : ["Meeting moved to Tuesday", "Exam timetable attached"] },
      { id: "p", label: s.phishing, tone: "hibiscus", examples: ar ? ["حسابك سيغلق اضغط الآن", "ربحت جائزة أرسل رقمك السري"] : ["Your account will be closed click now", "You won a prize send your PIN"] },
    ]}
    test={ar ? "اضغط الآن للحفاظ على حسابك" : "Click now to keep your account"}
    takeaway={s.takeaway} />
    </div>
  </>;
}
