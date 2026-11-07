import { Fragment, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { continueSong, followers, PITCHES, SONG, transitions } from "./model";

const S = {
  en: {
    intro: "This model does not hear music. It counts, in one eight-note tune, which pitch followed which. Then it continues by always picking the most common follower. A pitch it never saw after another cannot appear.",
    heard: "The tune it counted", next: "The four notes it writes next",
    names: "",
    counted: "What it counted", after: "After", cameNext: "Came next (times)", sep: ", ",
    from: "Write the next four notes",
    try1: "Press the button and read the continuation: A E A E. The counts show why: after E came A twice and C once, so the model always takes A, and C never comes back.",
    try2: "Notice it never invents a pitch that did not follow another in the tune.",
    try3: "Say what a longer training tune would change, and what it still would not know.",
    takeaway: "A next-note model continues the counts it was given, and looks only at the last note. Eight notes are not a song. A lab that trains a real network on a collection of tunes does more: the network looks further back and can score a step it never saw, but it too predicts the next note.",
  },
  ar: {
    intro: "هذا النموذج لا يسمع موسيقى. إنه يعدّ، في لحن من ثماني نغمات، أي درجة تبعت أي درجة. ثم يكمل باختيار التابع الأكثر تكرارًا دائمًا. والدرجة التي لم يرها بعد أخرى لا يمكن أن تظهر.",
    heard: "اللحن الذي عدّه", next: "النغمات الأربع التي يكتبها بعد ذلك",
    names: "أسماء النغمات: C دو، D ري، E مي، G صول، A لا.",
    counted: "ما عدّه", after: "بعد", cameNext: "جاءت بعدها (عدد المرات)", sep: "، ",
    from: "اكتب النغمات الأربع التالية",
    try1: "اضغط الزر واقرأ التكملة: A E A E. والأعداد تبيّن السبب: بعد E جاءت A مرتين وC مرة واحدة، فيختار النموذج A دائمًا ولا تعود C أبدًا.",
    try2: "لاحظ أنه لا يخترع درجة لم تتبع درجة أخرى في اللحن.",
    try3: "قل ماذا يغيّر لحن تدريب أطول، وما الذي يظل لا يعرفه.",
    takeaway: "نموذج النغمة التالية يكمل الأعداد التي أُعطيها، ولا ينظر إلا إلى النغمة الأخيرة. وثماني نغمات ليست أغنية. أما المعمل الذي يدرّب شبكة حقيقية على مجموعة من الألحان فيفعل أكثر: تنظر الشبكة أبعد إلى الوراء، وتستطيع أن تقدّر تتابعًا لم تره قط، لكنها هي أيضًا تتنبأ بالنغمة التالية.",
  },
};

const name = (i: number) => PITCHES[i] ?? "?";

export default function Melody({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const counts = useMemo(() => transitions(SONG), []);
  const [show, setShow] = useState(false);
  const next = continueSong(counts, SONG.at(-1) ?? 0, 4);
  const rows = PITCHES.map((_, i) => [i, followers(counts, i)] as const).filter(([, f]) => f.length);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <p><strong>{s.heard}</strong></p>
      <p dir="ltr">{SONG.map(name).join("  ")}</p>
      {s.names && <p className="lb-note">{s.names}</p>}
      {/* The counts are the whole model: which note may follow E can be checked here, not only guessed. */}
      <p><strong>{s.counted}</strong></p>
      <table className="lb-table" aria-label={s.counted}>
        <thead><tr><th scope="col">{s.after}</th><th scope="col">{s.cameNext}</th></tr></thead>
        <tbody>
          {rows.map(([from, f]) => (
            <tr key={from}>
              <th scope="row"><bdi dir="ltr">{name(from)}</bdi></th>
              <td>{f.map(([to, times], k) => <Fragment key={to}>{k ? s.sep : ""}<bdi dir="ltr">{`${name(to)} ×${num(times)}`}</bdi></Fragment>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="lb-seg-btn" onClick={() => { setShow(true); onDone?.(); }}>{s.from}</button>
      {show && <p><strong>{s.next}</strong> <bdi dir="ltr">{next.map(name).join("  ")}</bdi></p>}
    </LabShell>
  );
}
