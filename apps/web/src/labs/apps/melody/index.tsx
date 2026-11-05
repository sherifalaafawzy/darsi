import { useMemo, useState } from "react";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { continueSong, PITCHES, SONG, transitions } from "./model";

const S = {
  en: {
    intro: "This model does not hear music. It counts, in one eight-note tune, which pitch followed which. Then it continues by always picking the most common follower. A pitch it never saw after another cannot appear.",
    heard: "The tune it counted", next: "The four notes it writes next",
    from: "Starting from the last note",
    try1: "Read the tune, then the continuation: it repeats the pattern it counted, C–E–A–E.",
    try2: "Notice it never invents a pitch that did not follow another in the tune.",
    try3: "Say what a longer training tune would change, and what it still would not know.",
    takeaway: "A next-note model continues the counts it was given. Eight notes are not a song, and a GPU lab with thousands of pieces is the same idea at a size this phone does not pretend to be.",
  },
  ar: {
    intro: "هذا النموذج لا يسمع موسيقى. إنه يعدّ، في لحن من ثماني نغمات، أي درجة تبعت أي درجة. ثم يكمل باختيار التابع الأكثر تكرارًا دائمًا. والدرجة التي لم يرها بعد أخرى لا يمكن أن تظهر.",
    heard: "اللحن الذي عدّه", next: "النغمات الأربع التي يكتبها بعد ذلك",
    from: "بدءًا من النغمة الأخيرة",
    try1: "اقرأ اللحن ثم التكملة: يكرّر النمط الذي عدّه.",
    try2: "لاحظ أنه لا يخترع درجة لم تتبع درجة أخرى في اللحن.",
    try3: "قل ماذا يغيّر لحن تدريب أطول، وما الذي يظل لا يعرفه.",
    takeaway: "نموذج النغمة التالية يكمل الأعداد التي أُعطيها. ثماني نغمات ليست أغنية، ومعمل بطاقة رسوم فيه آلاف المقطوعات هو الفكرة نفسها بحجم لا يدّعي هذا الهاتف أنه بلغه.",
  },
};

const name = (i: number) => PITCHES[i] ?? "?";

export default function Melody({ meta }: LabProps) {
  const s = useS(S);
  const counts = useMemo(() => transitions(SONG), []);
  const [show, setShow] = useState(false);
  const next = continueSong(counts, SONG.at(-1) ?? 0, 4);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <p><strong>{s.heard}</strong></p>
      <p dir="ltr">{SONG.map(name).join("  ")}</p>
      <button type="button" className="lb-seg-btn" onClick={() => setShow(true)}>{s.from}</button>
      {show && <p><strong>{s.next}</strong> <bdi dir="ltr">{next.map(name).join("  ")}</bdi></p>}
    </LabShell>
  );
}
