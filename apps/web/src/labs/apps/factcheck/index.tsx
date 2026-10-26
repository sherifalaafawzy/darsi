import { FactCheck } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { LabProps } from "../../types";

/** Hallucinations made visible: claim by claim. */
export default function Factcheck(_: LabProps) {
  const { lang, num } = useI18n();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  return <FactCheck key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Check the AI’s answer", "تحقّق من إجابة الذكاء الاصطناعي")}
    answerLabel={L("AI answer", "إجابة الذكاء الاصطناعي")} labels={{ true: L("Correct", "صحيح"), false: L("Wrong", "خطأ"), unsure: L("Check a source", "أبحث عن مصدر") }}
    checkedText={(a, b) => L(`${a} of ${b} claims checked`, `تم فحص ${num(a)} من ${num(b)} ادّعاءات`)}
    answer={ar ? [
      { text: "النيل " }, { text: "أطول نهر في أفريقيا", claim: { id: "c1", verdict: "true", note: "صحيح، تتّفق معظم المصادر على ذلك." } },
      { text: "، ويجري " }, { text: "من الشمال إلى الجنوب", claim: { id: "c2", verdict: "false", note: "خطأ، يجري من الجنوب إلى الشمال نحو البحر المتوسط. قد يذكر الذكاء الاصطناعي الأخطاء بثقة." } },
      { text: "، و" }, { text: "رُسمت أول خريطة له بالأقمار الصناعية عام ١٩٥٠", claim: { id: "c3", verdict: "false", note: "مختلق، لم تكن هناك أقمار صناعية عام ١٩٥٠. هذه «هلوسة»." } }, { text: "." },
    ] : [
      { text: "The Nile is " }, { text: "the longest river in Africa", claim: { id: "c1", verdict: "true", note: "Correct — most sources agree." } },
      { text: ". It flows " }, { text: "from north to south", claim: { id: "c2", verdict: "false", note: "Wrong — it flows south to north into the Mediterranean. AI can state errors confidently." } },
      { text: " and " }, { text: "was first mapped by satellites in 1950", claim: { id: "c3", verdict: "false", note: "Invented — there were no satellites in 1950. This is a “hallucination”." } }, { text: "." },
    ]}
    takeaway={L("Treat AI like a confident new colleague: helpful, but check facts before they reach your pupils.", "تعامل مع الذكاء الاصطناعي كزميل جديد واثق: مفيد، لكن تحقّق من المعلومات قبل أن تصل إلى طلابك.")} />;
}
