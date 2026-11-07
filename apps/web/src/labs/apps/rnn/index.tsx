import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { cueLeft } from "./model";

const S = {
  en: {
    intro: "A recurrent net reads one symbol at a time and keeps a hidden state. Here the first symbol is the cue, and the next three are empty. The memory number is how much of the hidden state survives each step.",
    memory: "How much memory survives", weak: "Almost none", strong: "Almost all",
    cue: "Cue", empty: "Empty", end: "Hidden state at the end",
    kept: "The cue still left",
    forgot: "The cue has faded. The net no longer knows how it started.",
    holds: "The cue is still in the state. A longer gap would need a stronger memory, or attention.",
    try1: "Keep memory low (near 0) and read the end: the cue is gone.",
    try2: "Raise memory towards 0.95: the end still carries the sign of the cue.",
    try3: "Find the smallest memory that still leaves more than half the cue.",
    takeaway: "A recurrent net can carry a short pattern. A weak memory forgets the start of a long sequence. Attention looks back instead of hoping the hidden state kept it.",
  },
  ar: {
    intro: "تقرأ الشبكة التكرارية رمزًا واحدًا في كل مرة وتحتفظ بحالة مخفية. الرمز الأول هنا هو الإشارة، والثلاثة التالية فارغة. رقم الذاكرة هو مقدار الحالة المخفية الذي يبقى في كل خطوة.",
    memory: "مقدار الذاكرة الذي يبقى", weak: "لا شيء تقريبًا", strong: "كلها تقريبًا",
    cue: "إشارة", empty: "فارغ", end: "الحالة المخفية في النهاية",
    kept: "ما تبقى من الإشارة",
    forgot: "خبت الإشارة. لم تعد الشبكة تعرف كيف بدأت.",
    holds: "الإشارة ما زالت في الحالة. والفجوة الأطول تحتاج ذاكرة أقوى، أو انتباهًا.",
    try1: "اجعل الذاكرة صغيرة (قرب ٠) واقرأ النهاية: الإشارة ذهبت.",
    try2: "ارفع الذاكرة نحو ٠٫٩٥: النهاية ما زالت تحمل إشارة البداية.",
    try3: "ابحث عن أصغر ذاكرة تُبقي أكثر من نصف الإشارة.",
    takeaway: "تستطيع الشبكة التكرارية حمل نمط قصير. والذاكرة الضعيفة تنسى بداية المتسلسلة الطويلة. أما الانتباه فينظر إلى الوراء بدل أن يأمل أن الحالة المخفية احتفظت بالبداية.",
  },
};

export default function Rnn({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [memory, setMemory] = useState(0.3);
  const { states, kept } = cueLeft(memory);
  const holds = kept > 0.5;
  useEffect(() => { if (holds) onDone?.(); }, [holds]); // eslint-disable-line react-hooks/exhaustive-deps
  // Three decimals: the lessons work the states out by hand (½ × ½ × ½ = 0.125, 0.9³ = 0.729).
  const n = (v: number) => num(Math.round(v * 1000) / 1000);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.memory} value={memory} min={0} max={0.95} step={0.05} onChange={setMemory} format={(v) => num(v)} />
      <p className="lb-note">{memory < 0.2 ? s.weak : memory > 0.8 ? s.strong : ""}</p>
      {/* No list numbers: in a flex row each marker was drawn over the previous value ("0.76" read "0.72"). The labels give the order. */}
      <ol className="lb-stages">
        {[s.cue, s.empty, s.empty, s.empty].map((label, i) => (
          <li key={i}><span>{label}</span> <bdi dir="ltr">{n(states[i] ?? 0)}</bdi></li>
        ))}
      </ol>
      <p><strong>{s.end}</strong> <bdi dir="ltr">{n(states.at(-1) ?? 0)}</bdi></p>
      <p>{s.kept} <bdi dir="ltr">{n(kept)}</bdi>. {holds ? s.holds : s.forgot}</p>
    </LabShell>
  );
}
