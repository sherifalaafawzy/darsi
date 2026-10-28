import { TokenViewer } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

const S = {
  en: {
    kicker: "AI lab", title: "How AI reads text", tokens: "tokens", chars: "characters", input: "Text to split into tokens",
    text: "Teachers explain photosynthesis beautifully.",
    try1: "Replace the text with a short word such as “cat”: it is one token. Now type “photosynthesis”: one long word becomes several pieces.",
    try2: "Add a full stop, a comma or a question mark: each punctuation mark is a token of its own.",
    try3: "Type “teach”, then “teachers”: the longer word takes two tokens. Languages that join several parts into one word, as Arabic does, often need more tokens for the same idea.",
    takeaway: "AI reads pieces called tokens. Long or rare words — and many non-English words — become several pieces.",
  },
  ar: {
    kicker: "مختبر الذكاء الاصطناعي", title: "كيف يقرأ الذكاء الاصطناعي النص", tokens: "رمزًا", chars: "حرفًا", input: "نص لتقسيمه إلى رموز",
    text: "المعلمون يشرحون البناء الضوئي بإتقان.",
    try1: "اكتب بدل النص كلمة قصيرة مثل «قلم»: إنها رمز واحد. ثم اكتب «الاستراتيجيات»: تصبح الكلمة الطويلة عدة قطع.",
    try2: "أضف نقطة أو فاصلة أو علامة استفهام: كل علامة ترقيم رمز مستقل.",
    try3: "اكتب «مدرسة» ثم «والمدرسة»: الكلمة نفسها مع «و» و«ال» الملتصقتين بها تصبح أطول، فتنقسم إلى قطعتين. لهذا يحتاج النص العربي غالبًا إلى رموز أكثر ليقول الفكرة نفسها.",
    takeaway: "يقرأ الذكاء الاصطناعي قطعًا تُسمّى رموزًا. الكلمات الطويلة أو النادرة، وكثير من الكلمات غير الإنجليزية، تصبح عدة قطع.",
  },
};

/** Splits text into token-sized pieces. */
export default function Tokens(_: LabProps) {
  const { lang, num } = useI18n();
  const s = useS(S);
  return (
    <>
      <TryThis items={[s.try1, s.try2, s.try3]} />
      <TokenViewer key={lang} num={num} kicker={s.kicker} title={s.title} tokensLabel={s.tokens} charsLabel={s.chars} inputLabel={s.input} text={s.text} takeaway={s.takeaway} />
    </>
  );
}
