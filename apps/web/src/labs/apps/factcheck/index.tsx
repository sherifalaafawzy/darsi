import { useRef } from "react";
import { FactCheck } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

const S = {
  en: {
    try1: "Tap each highlighted part of the answer and mark it. The note tells you whether you were right, and why.",
    try2: "Look hard at the date: could that really have happened in 1950? Confident wording is not proof.",
    try3: "For a number you can't check from memory, “Check a source” is the right answer, not a guess.",
    kicker: "Gen AI lab", title: "Check the AI’s answer", answer: "AI answer", right: "Correct", wrong: "Wrong", unsure: "Check a source",
    checked: (a: string, b: string) => `${a} of ${b} claims checked`,
    a1: "The Nile is ", c1: "the longest river in Africa", n1: "Correct — most sources agree.",
    a2: ", ", c2: "about 6,650 km long",
    n2: "Roughly right: many books say about 6,650 km, but sources disagree, depending on where they say the river starts. Check a number like this in a trusted source before you teach it.",
    a3: ". It flows ", c3: "from north to south", n3: "Wrong — it flows south to north into the Mediterranean. AI can state errors confidently.",
    a4: " and ", c4: "was first mapped by satellites in 1950", n4: "Invented — there were no satellites in 1950. This is a “hallucination”.",
    a5: ".",
    takeaway: "Treat AI like a confident new classmate or colleague: helpful, but check its facts before you use or share them.",
  },
  ar: {
    try1: "المس كل جزء مميَّز في الإجابة وصنّفه. تخبرك الملاحظة إن كنت مصيبًا، ولماذا.",
    try2: "تمعّن في التاريخ: هل يمكن أن يحدث ذلك فعلًا عام ١٩٥٠؟ الصياغة الواثقة ليست دليلًا.",
    try3: "حين يأتي رقم لا تستطيع التحقق منه من ذاكرتك، فالإجابة الصحيحة «أبحث عن مصدر»، لا التخمين.",
    kicker: "مختبر الذكاء التوليدي", title: "تحقّق من إجابة الذكاء الاصطناعي", answer: "إجابة الذكاء الاصطناعي", right: "صحيح", wrong: "خطأ", unsure: "أبحث عن مصدر",
    checked: (a: string, b: string) => `تم فحص ${a} من ${b} ادّعاءات`,
    a1: "النيل ", c1: "أطول نهر في أفريقيا", n1: "صحيح، تتّفق معظم المصادر على ذلك.",
    a2: "، ويبلغ طوله ", c2: "نحو ٦٦٥٠ كيلومترًا",
    n2: "قريب من الصواب: تذكر كتب كثيرة نحو ٦٦٥٠ كيلومترًا، لكن المصادر تختلف بحسب النقطة التي تعدّها منبع النهر. تحقّق من رقم كهذا في مصدر موثوق قبل أن تدرّسه.",
    a3: "، ويجري ", c3: "من الشمال إلى الجنوب", n3: "خطأ، يجري من الجنوب إلى الشمال نحو البحر المتوسط. قد يذكر الذكاء الاصطناعي الأخطاء بثقة.",
    a4: "، و", c4: "رُسمت أول خريطة له بالأقمار الصناعية عام ١٩٥٠", n4: "مختلق، لم تكن هناك أقمار صناعية عام ١٩٥٠. هذه «هلوسة».",
    a5: ".",
    takeaway: "تعامل مع الذكاء الاصطناعي كزميل جديد واثق: مفيد، لكن تحقّق من معلوماته قبل أن تستخدمها أو تشاركها.",
  },
};

/** Hallucinations made visible: claim by claim. One claim of each kind: right, wrong, invented, and one to look up. */
export default function Factcheck({ onDone }: LabProps) {
  const { lang, num } = useI18n();
  const s = useS(S);
  // Marking every claim is the lab. The design-system card has no callback; its counter ("3 of 4 claims checked") is
  // the one place that knows the count, so it marks the lab done, after the card's render.
  const done = useRef(false);
  const checked = (a: number, b: number) => {
    if (b > 0 && a === b && !done.current) { done.current = true; queueMicrotask(() => onDone?.()); }
    return s.checked(num(a), num(b));
  };
  return <>
    <TryThis items={[s.try1, s.try2, s.try3]} />
    <FactCheck key={lang} kicker={s.kicker} title={s.title}
    answerLabel={s.answer} labels={{ true: s.right, false: s.wrong, unsure: s.unsure }}
    checkedText={checked}
    answer={[
      { text: s.a1 }, { text: s.c1, claim: { id: "c1", verdict: "true", note: s.n1 } },
      { text: s.a2 }, { text: s.c2, claim: { id: "c2", verdict: "unsure", note: s.n2 } },
      { text: s.a3 }, { text: s.c3, claim: { id: "c3", verdict: "false", note: s.n3 } },
      { text: s.a4 }, { text: s.c4, claim: { id: "c4", verdict: "false", note: s.n4 } }, { text: s.a5 },
    ]}
    takeaway={s.takeaway} />
  </>;
}
