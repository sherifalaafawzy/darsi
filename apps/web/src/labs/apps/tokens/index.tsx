import { useRef } from "react";
import { TokenViewer } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

const S = {
  en: {
    kicker: "AI lab", title: "How AI reads text", input: "Text to split into tokens",
    // The counts under the pieces: the counted word follows the number ("1 token", «توكن واحد», «٣ أحرف», «١١ حرفًا»).
    tokens: { one: "{n} token", other: "{n} tokens" } as Forms, chars: { one: "{n} character", other: "{n} characters" } as Forms,
    text: "Teachers explain photosynthesis beautifully.",
    try1: "Replace the text with a short word such as “cat”: it is one token. Now type “photosynthesis”: one long word becomes several pieces.",
    try2: "Add a full stop, a comma or a question mark: each punctuation mark is a token of its own.",
    try3: "Type “teach”, then “teachers”: the longer word takes two tokens. Languages that join several parts into one word, as Arabic does, often need more tokens for the same idea.",
    takeaway: "AI reads pieces called tokens. Long or rare words — and many non-English words — become several pieces.",
  },
  ar: {
    kicker: "مختبر الذكاء الاصطناعي", title: "كيف يقرأ الذكاء الاصطناعي النص", input: "نص لتقسيمه إلى توكنز",
    tokens: { zero: "{n} توكن", one: "توكن واحد", two: "توكنان", few: "{n} توكنز", many: "{n} توكنًا", other: "{n} توكن" },
    chars: { zero: "{n} حرف", one: "حرف واحد", two: "حرفان", few: "{n} أحرف", many: "{n} حرفًا", other: "{n} حرف" },
    text: "المعلمون يشرحون البناء الضوئي بإتقان.",
    try1: "اكتب بدل النص كلمة قصيرة مثل «قلم»: إنها توكن واحد. ثم اكتب «الاستراتيجيات»: تصبح الكلمة الطويلة عدة قطع.",
    try2: "أضف نقطة أو فاصلة أو علامة استفهام: كل علامة ترقيم توكن مستقل.",
    try3: "اكتب «مدرسة» ثم «والمدرسة»: الكلمة نفسها مع «و» و«ال» الملتصقتين بها تصبح أطول، فتنقسم إلى قطعتين. لهذا يحتاج النص العربي غالبًا إلى توكنز أكثر ليقول الفكرة نفسها.",
    takeaway: "يقرأ الذكاء الاصطناعي قطعًا تُسمّى توكنز (tokens). الكلمات الطويلة أو النادرة، وكثير من الكلمات غير الإنجليزية، تصبح عدة قطع.",
  },
};

/** Splits text into token-sized pieces. */
export default function Tokens({ onDone }: LabProps) {
  const { lang, num } = useI18n();
  const s = useS(S);
  const plural = usePlural();
  // The number stands out as before; a form without one («توكن واحد», «حرفان») is plain words.
  const count = (forms: Forms) => (n: number) => {
    const text = plural(n, forms), k = num(n), at = text.indexOf(k);
    return at < 0 ? text : <>{text.slice(0, at)}<strong>{k}</strong>{text.slice(at + k.length)}</>;
  };
  // Typing your own text is the lab, so the first change marks it done. The design-system card has no callback; its
  // textarea's input event bubbles up to this wrapper. (Without it the AI ladder's rung 11 could never be ticked.)
  const done = useRef(false);
  const typed = () => { if (!done.current) { done.current = true; onDone?.(); } };
  return (
    <>
      <TryThis items={[s.try1, s.try2, s.try3]} />
      <div onInput={typed}>
        <TokenViewer key={lang} num={num} kicker={s.kicker} title={s.title} tokensText={count(s.tokens)} charsText={count(s.chars)} inputLabel={s.input} text={s.text} takeaway={s.takeaway} />
      </div>
    </>
  );
}
