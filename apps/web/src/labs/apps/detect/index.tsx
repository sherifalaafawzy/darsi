import { useEffect, useMemo } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { FACE_LINE, judged, prototype, TEST, TRAIN } from "./model";

const S = {
  en: {
    intro: "The detector is the average of its training faces. Here there is one drawn face: two eyes close together and a short mouth. It never saw a wider face. A high score means “face-like”. The line is the same for every picture.",
    trained: "What it trained on", tests: "What it is tested on",
    face: "Face", not: "Not a face", said: "It says", yes: "face", no: "not a face", score: "Score",
    line: "The line is", rule: "A score at or above it means “face”.",
    miss: "It was trained on one shape of face. A real detector that misses a group is not ready to use, however neat its training pictures look.",
    try1: "Compare the training picture with the wide one: the marks are the same idea, further apart.",
    try2: "Read the scores. The wide face falls below the line. The box stays below it too.",
    try3: "Say which mistake is worse for a real tool: missing a face, or calling a box a face.",
    takeaway: "A detector repeats the faces it was shown. Testing only the training shape hides who it misses. These are drawings, not photographs.",
  },
  ar: {
    intro: "الكاشف هو متوسط وجوه التدريب، وهنا وجه مرسوم واحد: عينان متقاربتان وفم قصير. لم يرَ وجهًا أعرض. والدرجة العالية تعني «يشبه وجهًا». والخط واحد لكل صورة.",
    trained: "ما تدرّب عليه", tests: "ما يُختبر عليه",
    face: "وجه", not: "ليس وجهًا", said: "يقول", yes: "وجه", no: "ليس وجهًا", score: "الدرجة",
    line: "الخط هو", rule: "الدرجة عند الخط أو فوقه تعني «وجه».",
    miss: "تدرّب على شكل واحد من الوجوه. والكاشف الحقيقي الذي يفوّت مجموعة ليس جاهزًا للاستعمال، مهما بدت صور تدريبه مرتبة.",
    try1: "قارن صورة التدريب بالصورة العريضة: العلامات الفكرة نفسها، لكن المسافة أبعد.",
    try2: "اقرأ الدرجات. الوجه العريض ينزل تحت الخط. والصندوق يبقى تحته أيضًا.",
    try3: "قل أي خطأ أسوأ لأداة حقيقية: تفويت وجه، أم اعتبار الصندوق وجهًا.",
    takeaway: "الكاشف يكرّر الوجوه التي عُرضت عليه. والاختبار على شكل التدريب وحده يخفي من يفوّته. وهذه رسوم، وليست صورًا فوتوغرافية.",
  },
};

export default function Detect({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const proto = useMemo(() => prototype(TRAIN), []);
  const rows = useMemo(() => judged(proto, TEST), [proto]);
  useEffect(() => { onDone?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nothing to press: reading the scores is the lab
  // Three decimals: the wide face scores 0.548, just under the line. Rounded to two it read "0.55", the line itself.
  const n = (v: number) => num(Math.round(v * 1000) / 1000);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <p><strong>{s.trained}</strong></p>
      <PixelGrid n={8} value={TRAIN[0]!.pixels} readOnly label={s.trained} />
      <p><strong>{s.tests}</strong></p>
      {rows.map((r) => (
        <div key={r.id} className="lb-row">
          <PixelGrid n={8} value={r.pixels} readOnly label={r.face ? s.face : s.not} />
          <p>{r.face ? s.face : s.not}. {s.score} <bdi dir="ltr">{n(r.score)}</bdi>. {s.said} {r.said ? s.yes : s.no}. {r.right ? "" : s.miss}</p>
        </div>
      ))}
      <p className="lb-note">{s.line} <bdi dir="ltr">{n(FACE_LINE)}</bdi>. {s.rule}</p>
    </LabShell>
  );
}
