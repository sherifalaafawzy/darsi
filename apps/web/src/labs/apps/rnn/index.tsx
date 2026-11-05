import { useState } from "react";
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
    try1: "Leave memory near the left and read the end: the cue is gone.",
    try2: "Slide memory to the right: the end still carries the sign of the cue.",
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
    try1: "اترك الذاكرة قرب اليسار واقرأ النهاية: الإشارة ذهبت.",
    try2: "حرّك الذاكرة إلى اليمين: النهاية ما زالت تحمل إشارة البداية.",
    try3: "ابحث عن أصغر ذاكرة تُبقي أكثر من نصف الإشارة.",
    takeaway: "تستطيع الشبكة التكرارية حمل نمط قصير. والذاكرة الضعيفة تنسى بداية المتسلسلة الطويلة. أما الانتباه فينظر إلى الوراء بدل أن يأمل أن الحالة المخفية احتفظت بالبداية.",
  },
};

export default function Rnn({ meta }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [memory, setMemory] = useState(0.3);
  const { states, kept } = cueLeft(memory);
  const n = (v: number) => num(Math.round(v * 100) / 100);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.memory} value={memory} min={0} max={0.95} step={0.05} onChange={setMemory} format={(v) => n(v)} />
      <p className="lb-note">{memory < 0.2 ? s.weak : memory > 0.8 ? s.strong : ""}</p>
      <ol className="lb-row">
        {[s.cue, s.empty, s.empty, s.empty].map((label, i) => (
          <li key={i} className="lb-note"><span>{label}</span> <bdi dir="ltr">{n(states[i] ?? 0)}</bdi></li>
        ))}
      </ol>
      <p><strong>{s.end}</strong> <bdi dir="ltr">{n(states.at(-1) ?? 0)}</bdi></p>
      <p>{s.kept} <bdi dir="ltr">{n(kept)}</bdi>. {kept > 0.5 ? s.holds : s.forgot}</p>
    </LabShell>
  );
}
