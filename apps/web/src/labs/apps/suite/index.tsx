import { useEffect, useId, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { CASES, judge, tally, verdict, type Mark } from "./model";

const S = {
  en: {
    intro: "A test that only counts right answers can hide a model that should have refused. Mark each case. A required refusal that you mark as pass is a miss, even if the other nine are right.",
    pass: "Pass", refuse: "Refuse",
    score: "Right so far", missed: "Refusals marked pass", overCount: "Ordinary cases marked refuse",
    left: "You have not marked every case.",
    held: "Every required refusal was refused, and the other cases passed.",
    failed: "A case that must be refused was marked pass. The suite has not passed.",
    over: "No required refusal was missed, but a model that refuses questions it should answer has not passed either.",
    try1: "Mark the arithmetic and the filter questions as pass.",
    try2: "Mark the photo, the mark change, the library card and the password message as refuse.",
    try3: "Change one refuse to pass and read the line: the suite fails on that one miss.",
    takeaway: "An evaluation needs the cases the model must not answer. A high score without those cases does not say the model is safe to use.",
  },
  ar: {
    intro: "الاختبار الذي يعدّ الإجابات الصحيحة فقط قد يخفي نموذجًا كان يجب أن يرفض. ضع علامة على كل حالة. والرفض المطلوب الذي تضعه ناجحًا خطأ، حتى لو صحت التسع الأخرى.",
    pass: "ناجح", refuse: "مرفوض",
    score: "الصحيح حتى الآن", missed: "رفض وُضع ناجحًا", overCount: "حالات عادية وُضعت مرفوضة",
    left: "لم تضع علامة على كل الحالات.",
    held: "رُفض كل رفض مطلوب، ونجحت الحالات الأخرى.",
    failed: "حالة يجب رفضها وُضعت ناجحة. لم ينجح الاختبار.",
    over: "لم يفُت أي رفض مطلوب، لكن النموذج الذي يرفض أسئلة كان يجب أن يجيب عنها لم ينجح أيضًا.",
    try1: "ضع ناجحًا على سؤال الحساب وسؤال المرشّح.",
    try2: "ضع مرفوضًا على الصورة وتغيير الدرجة وبطاقة المكتبة ورسالة كلمة المرور.",
    try3: "بدّل رفضًا واحدًا إلى ناجح واقرأ السطر: يفشل الاختبار بهذا الخطأ الواحد.",
    takeaway: "يحتاج التقييم إلى الحالات التي يجب ألا يجيب عنها النموذج. والدرجة العالية من غير هذه الحالات لا تقول إن النموذج آمن للاستعمال.",
  },
};

export default function Suite({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const id = useId();
  const [marks, setMarks] = useState<Record<string, Mark | undefined>>({});
  const rows = judge(CASES, marks);
  const t = tally(rows), v = verdict(rows);
  useEffect(() => { if (v === "held") onDone?.(); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = s[v]; // "over": every refusal kept, but ordinary questions marked refuse (the count is just before it)
  const choice = (c: (typeof rows)[number], m: Mark, label: string) => (
    <button type="button" role="radio" aria-checked={c.mark === m} className={c.mark === m ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => setMarks((x) => ({ ...x, [c.id]: m }))}>{label}</button>
  );
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <ul className="stack">
        {rows.map((c) => (
          <li key={c.id} className="lb-row">
            <p id={`${id}-${c.id}`}>{lang === "ar" ? c.ar : c.en}</p>
            {/* One choice per case, named by its case: a screen reader hears which one is picked. */}
            <span className="lb-row" role="radiogroup" aria-labelledby={`${id}-${c.id}`}>{choice(c, "pass", s.pass)}{choice(c, "refuse", s.refuse)}</span>
          </li>
        ))}
      </ul>
      <p>{s.score} <bdi dir="ltr">{num(t.right)}</bdi>. {s.missed} <bdi dir="ltr">{num(t.missed)}</bdi>. {s.overCount} <bdi dir="ltr">{num(t.over)}</bdi>. <span role="status">{line}</span></p>
    </LabShell>
  );
}
