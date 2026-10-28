import { FactCheck } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import type { LabProps } from "../../types";

/** Hallucinations made visible: claim by claim. One claim of each kind: right, wrong, invented, and one to look up. */
export default function Factcheck(_: LabProps) {
  const { lang, num } = useI18n();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  return <>
    <TryThis items={[
      L("Tap each highlighted part of the answer and mark it. The note tells you whether you were right, and why.", "المس كل جزء مميَّز في الإجابة وصنّفه. تخبرك الملاحظة إن كنت مصيبًا، ولماذا."),
      L("Look hard at the date: could that really have happened in 1950? Confident wording is not proof.", "تمعّن في التاريخ: هل يمكن أن يحدث ذلك فعلًا عام ١٩٥٠؟ الصياغة الواثقة ليست دليلًا."),
      L("For a number you can't check from memory, “Check a source” is the right answer, not a guess.", "حين يأتي رقم لا تستطيع التحقق منه من ذاكرتك، فالإجابة الصحيحة «أبحث عن مصدر»، لا التخمين."),
    ]} />
    <FactCheck key={lang} kicker={L("Gen AI lab", "مختبر الذكاء التوليدي")} title={L("Check the AI’s answer", "تحقّق من إجابة الذكاء الاصطناعي")}
    answerLabel={L("AI answer", "إجابة الذكاء الاصطناعي")} labels={{ true: L("Correct", "صحيح"), false: L("Wrong", "خطأ"), unsure: L("Check a source", "أبحث عن مصدر") }}
    checkedText={(a, b) => L(`${a} of ${b} claims checked`, `تم فحص ${num(a)} من ${num(b)} ادّعاءات`)}
    answer={ar ? [
      { text: "النيل " }, { text: "أطول نهر في أفريقيا", claim: { id: "c1", verdict: "true", note: "صحيح، تتّفق معظم المصادر على ذلك." } },
      { text: "، ويبلغ طوله " }, { text: "نحو ٦٦٥٠ كيلومترًا", claim: { id: "c2", verdict: "unsure", note: "قريب من الصواب: تذكر كتب كثيرة نحو ٦٦٥٠ كيلومترًا، لكن المصادر تختلف بحسب النقطة التي تعدّها منبع النهر. تحقّق من رقم كهذا في مصدر موثوق قبل أن تدرّسه." } },
      { text: "، ويجري " }, { text: "من الشمال إلى الجنوب", claim: { id: "c3", verdict: "false", note: "خطأ، يجري من الجنوب إلى الشمال نحو البحر المتوسط. قد يذكر الذكاء الاصطناعي الأخطاء بثقة." } },
      { text: "، و" }, { text: "رُسمت أول خريطة له بالأقمار الصناعية عام ١٩٥٠", claim: { id: "c4", verdict: "false", note: "مختلق، لم تكن هناك أقمار صناعية عام ١٩٥٠. هذه «هلوسة»." } }, { text: "." },
    ] : [
      { text: "The Nile is " }, { text: "the longest river in Africa", claim: { id: "c1", verdict: "true", note: "Correct — most sources agree." } },
      { text: ", " }, { text: "about 6,650 km long", claim: { id: "c2", verdict: "unsure", note: "Roughly right: many books say about 6,650 km, but sources disagree, depending on where they say the river starts. Check a number like this in a trusted source before you teach it." } },
      { text: ". It flows " }, { text: "from north to south", claim: { id: "c3", verdict: "false", note: "Wrong — it flows south to north into the Mediterranean. AI can state errors confidently." } },
      { text: " and " }, { text: "was first mapped by satellites in 1950", claim: { id: "c4", verdict: "false", note: "Invented — there were no satellites in 1950. This is a “hallucination”." } }, { text: "." },
    ]}
    takeaway={L("Treat AI like a confident new classmate or colleague: helpful, but check its facts before you use or share them.", "تعامل مع الذكاء الاصطناعي كزميل جديد واثق: مفيد، لكن تحقّق من معلوماته قبل أن تستخدمها أو تشاركها.")} />
  </>;
}
