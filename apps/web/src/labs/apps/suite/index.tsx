import { useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { CASES, judge, tally, type Mark } from "./model";

const S = {
  en: {
    intro: "A test that only counts right answers can hide a model that should have refused. Mark each case. A required refusal that you mark as pass is a miss, even if the other nine are right.",
    pass: "Pass", refuse: "Refuse",
    score: "Right so far", missed: "Refusals marked pass",
    left: "You have not marked every case.",
    held: "Every required refusal was refused, and the other cases passed.",
    failed: "A case that must be refused was marked pass. The suite has not passed.",
    try1: "Mark the arithmetic and the filter questions as pass.",
    try2: "Mark the photo, the mark change, the library card and the password message as refuse.",
    try3: "Change one refuse to pass and read the line: the suite fails on that one miss.",
    takeaway: "An evaluation needs the cases the model must not answer. A high score without those cases does not say the model is safe to use.",
  },
  ar: {
    intro: "الاختبار الذي يعدّ الإجابات الصحيحة فقط قد يخفي نموذجًا كان يجب أن يرفض. ضع علامة على كل حالة. والرفض المطلوب الذي تضعه ناجحًا خطأ، حتى لو صحت التسع الأخرى.",
    pass: "ناجح", refuse: "مرفوض",
    score: "الصحيح حتى الآن", missed: "رفض وُضع ناجحًا",
    left: "لم تضع علامة على كل الحالات.",
    held: "رُفض كل رفض مطلوب، ونجحت الحالات الأخرى.",
    failed: "حالة يجب رفضها وُضعت ناجحة. لم ينجح الاختبار.",
    try1: "ضع ناجحًا على سؤال الحساب وسؤال المرشّح.",
    try2: "ضع مرفوضًا على الصورة وتغيير الدرجة وبطاقة المكتبة ورسالة كلمة المرور.",
    try3: "بدّل رفضًا واحدًا إلى ناجح واقرأ السطر: يفشل الاختبار بهذا الخطأ الواحد.",
    takeaway: "يحتاج التقييم إلى الحالات التي يجب ألا يجيب عنها النموذج. والدرجة العالية من غير هذه الحالات لا تقول إن النموذج آمن للاستعمال.",
  },
};

export default function Suite({ meta }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const [marks, setMarks] = useState<Record<string, Mark | undefined>>({});
  const rows = judge(CASES, marks);
  const t = tally(rows);
  const done = t.marked === CASES.length;
  const line = !done ? s.left : t.missed ? s.failed : t.right === CASES.length ? s.held : s.failed;
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <ul className="stack">
        {rows.map((c) => (
          <li key={c.id} className="lb-row">
            <p>{lang === "ar" ? c.ar : c.en}</p>
            <button type="button" className={c.mark === "pass" ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => setMarks((m) => ({ ...m, [c.id]: "pass" }))}>{s.pass}</button>
            <button type="button" className={c.mark === "refuse" ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => setMarks((m) => ({ ...m, [c.id]: "refuse" }))}>{s.refuse}</button>
          </li>
        ))}
      </ul>
      <p>{s.score} <bdi dir="ltr">{num(t.right)}</bdi>. {s.missed} <bdi dir="ltr">{num(t.missed)}</bdi>. {line}</p>
    </LabShell>
  );
}
