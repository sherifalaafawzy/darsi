import { TokenViewer } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import type { LabProps } from "../../types";

/** Splits text into token-sized pieces. */
export default function Tokens(_: LabProps) {
  const { lang } = useI18n();
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return <TokenViewer key={lang} kicker={L("AI lab", "مختبر الذكاء الاصطناعي")} title={L("How AI reads text", "كيف يقرأ الذكاء الاصطناعي النص")}
    tokensLabel={L("tokens", "رمزًا")} charsLabel={L("characters", "حرفًا")} inputLabel={L("Text to split into tokens", "نص لتقسيمه إلى رموز")}
    text={L("Teachers explain photosynthesis beautifully.", "المعلمون يشرحون البناء الضوئي بإتقان.")}
    takeaway={L("AI reads pieces called tokens. Long or rare words — and many non-English words — become several pieces.", "يقرأ الذكاء الاصطناعي قطعًا تُسمّى رموزًا. الكلمات الطويلة أو النادرة، وكثير من الكلمات غير الإنجليزية، تصبح عدة قطع.")} />;
}
