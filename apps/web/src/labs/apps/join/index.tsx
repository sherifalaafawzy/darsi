import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { counts, dropped, join, KINDS, MARKS, PUPIL_IDS, SQL, type Kind } from "./model";

const S = {
  en: {
    intro: "Two tables from the school office: pupils, each with an id, and yesterday's maths marks, each with the id of the pupil who wrote it. A join puts them side by side by matching `pupil_id` to `id`. Chidi and Musa missed the test, Kofi sat it twice, and one mark has an id that isn't on the list yet.",
    names: ["Amina", "Tunde", "Chidi", "Kofi", "Grace", "Musa"],
    kind: "Join", kinds: { inner: "Inner: only matches", pupils: "Left: all pupils", marks: "Left: all marks" } as Record<Kind, string>,
    chart: "Lines join each pupil to their marks; faded rows are left out of the result", result: "The result",
    rows: "Rows: `COUNT(*)`", marks: "Marks: `COUNT(mark)`", avg: "Average: `AVG(mark)`",
    out: "Left out", noMark: (n: string) => `${n} (no mark)`, noPupil: (id: string) => `the mark for pupil ${id} (no such pupil)`, none: "Nobody: every row is in the result.",
    nullNote: "`NULL` means empty: there was nothing to match, so the join filled the gap.", and: ", ",
    try1: "Start with Inner: Chidi and Musa are missing from the result, because nothing matches them.",
    try2: "Choose “Left: all pupils”: they come back with `NULL` (empty) marks. `COUNT(*)` says 7 rows but `COUNT(mark)` says 5, and the average stays the same.",
    try3: "Kofi is in two rows in every join, one for each match. The mark for pupil 7 shows only with “Left: all marks”, next to an empty name.",
    takeaway: "A join pairs rows whose keys match. An inner join keeps only pairs, so rows with no partner vanish without a word; a left join keeps every row of the first table and fills the gaps with `NULL`. Choose the join by the question: “all pupils” and “all marks” are different questions.",
  },
  ar: {
    intro: "جدولان من مكتب المدرسة: التلاميذ، ولكلٍّ رقم `id`، ودرجات اختبار الرياضيات أمس، ومع كل درجة رقم التلميذ الذي كتبها. يضعهما الربط جنبًا إلى جنب بمطابقة `pupil_id` مع `id`. غابت ليلى وكريم عن الاختبار، وأدّاه يوسف مرتين، وإحدى الدرجات لها رقم ليس في القائمة بعد.",
    names: ["أمينة", "عمر", "ليلى", "يوسف", "مريم", "كريم"],
    kind: "نوع الربط", kinds: { inner: "داخلي: المتطابق فقط", pupils: "يساري: كل التلاميذ", marks: "يساري: كل الدرجات" },
    chart: "تربط الخطوط كل تلميذ بدرجاته، والصفوف الباهتة خارج النتيجة", result: "النتيجة",
    rows: "الصفوف: `COUNT(*)`", marks: "الدرجات: `COUNT(mark)`", avg: "المتوسط: `AVG(mark)`",
    out: "خارج النتيجة", noMark: (n: string) => `${n} (بلا درجة)`, noPupil: (id: string) => `درجة التلميذ رقم ${id} (لا يوجد تلميذ بهذا الرقم)`, none: "لا أحد: كل الصفوف في النتيجة.",
    nullNote: "`NULL` تعني فارغة: لم يوجد ما يطابق، فملأ الربط الفراغ.", and: "، ",
    try1: "ابدأ بـ«داخلي»: تغيب ليلى وكريم عن النتيجة، لأن لا شيء يطابقهما.",
    try2: "اختر «يساري: كل التلاميذ»: يعودان بدرجات `NULL` (فارغة). تقول `COUNT(*)` إن الصفوف ٧، لكن `COUNT(mark)` تقول ٥، ويبقى المتوسط كما هو.",
    try3: "يظهر يوسف في صفين في كل ربط، صف لكل تطابق. ودرجة التلميذ رقم ٧ لا تظهر إلا مع «يساري: كل الدرجات»، بجانب اسم فارغ.",
    takeaway: "الربط يضم الصفوف التي تتطابق مفاتيحها. الربط الداخلي يُبقي الأزواج فقط، فتختفي الصفوف التي لا شريك لها دون أي تنبيه، أما الربط اليساري فيُبقي كل صفوف الجدول الأول ويملأ الفراغات بـ`NULL`. اختر الربط بحسب السؤال: «كل التلاميذ» و«كل الدرجات» سؤالان مختلفان.",
  },
};

const rich = (t: string): ReactNode => t.split("`").map((p, i) => (i % 2 ? <code key={i} className="lb-snip" dir="ltr">{p}</code> : p));
/** Left-to-right isolates around code inside a plain-text label. */
const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);
const PITCH = 44, TOP = 26, BOX = 36;
const y = (i: number) => TOP + i * PITCH;

export default function Join({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [kind, setKind] = useState<Kind>("inner");
  const [tried, setTried] = useState(() => new Set<Kind>(["inner"]));
  useEffect(() => { if (tried.size === KINDS.length) onDone?.(); }, [tried.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = join(kind), gone = dropped(rows), c = counts(rows);
  const H = TOP + PUPIL_IDS.length * PITCH;
  const outs = [...gone.pupils.map((i) => s.noMark(s.names[i])), ...gone.marks.map((j) => s.noPupil(num(MARKS[j].pupil)))];

  return (
    <LabShell meta={meta} intro={rich(s.intro)} tries={[rich(s.try1), rich(s.try2), rich(s.try3)]} takeaway={rich(s.takeaway)}>
      <Segmented label={s.kind} value={kind} options={KINDS.map((k) => [k, s.kinds[k]] as const)} onChange={(k) => { setKind(k); setTried((x) => new Set(x).add(k)); }} />
      <div className="lb-two">
        <figure className="lb-plot" dir="ltr">
          <svg className="lb-join" viewBox={`0 0 320 ${H}`} role="img" aria-label={s.chart}>
            <text x={4} y={16} className="lb-join-head">pupils</text>
            <text x={192} y={16} className="lb-join-head">marks</text>
            {MARKS.map((m, j) => { const i = PUPIL_IDS.indexOf(m.pupil); return i < 0 ? null : <line key={j} x1={130} y1={y(i) + BOX / 2} x2={190} y2={y(j) + BOX / 2} className={rows.some((r) => r.m === j && r.p === i) ? "lb-join-line" : "lb-join-line is-out"} />; })}
            {PUPIL_IDS.map((id, i) => (
              <g key={id} className={gone.pupils.includes(i) ? "is-out" : undefined}>
                <rect x={2} y={y(i)} width={128} height={BOX} rx={6} className="lb-join-box" />
                <text x={12} y={y(i) + 23} className="lb-join-id">{num(id)}</text>
                <text x={36} y={y(i) + 23} className="lb-join-text">{s.names[i]}</text>
                {kind === "pupils" && !MARKS.some((m) => m.pupil === id) && <text x={160} y={y(i) + 23} textAnchor="middle" className="lb-join-null">NULL</text>}
              </g>
            ))}
            {MARKS.map((m, j) => (
              <g key={j} className={gone.marks.includes(j) ? "is-out" : undefined}>
                <rect x={190} y={y(j)} width={128} height={BOX} rx={6} className="lb-join-box" />
                <text x={200} y={y(j) + 23} className="lb-join-id">{num(m.pupil)}</text>
                <text x={300} y={y(j) + 23} textAnchor="end" className="lb-join-text">{num(m.mark)}</text>
                {kind === "marks" && !PUPIL_IDS.includes(m.pupil) && <text x={160} y={y(j) + 23} textAnchor="middle" className="lb-join-null">NULL</text>}
              </g>
            ))}
          </svg>
        </figure>
        <div className="stack">
          <pre className="lb-pre" dir="ltr" translate="no">{SQL[kind]}</pre>
          <Stats items={[{ label: s.rows, value: num(c.all) }, { label: s.marks, value: num(c.marks) }, { label: s.avg, value: c.avg === null ? "–" : num(c.avg, { maximumFractionDigits: 1 }) }].map((x) => ({ ...x, label: x.label.replace(/`([^`]*)`/g, `${LRI}$1${PDI}`) }))} />
          <p className="lb-note"><strong>{s.out}:</strong> {outs.length ? outs.join(s.and) : s.none}</p>
        </div>
      </div>
      <div className="stack">
        <span className="dr-field-label">{s.result}</span>
        <div className="lb-scroll" dir="ltr" role="region" aria-label={s.result} tabIndex={0}>
          <table className="lb-dt" aria-live="polite">
            <thead><tr><th scope="col">p.id</th><th scope="col">p.name</th><th scope="col">m.pupil_id</th><th scope="col">m.mark</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                {r.p === null ? <><td className="is-empty"><span className="lb-dt-null">NULL</span></td><td className="is-empty"><span className="lb-dt-null">NULL</span></td></>
                  : <><td>{num(PUPIL_IDS[r.p])}</td><td dir="auto">{s.names[r.p]}</td></>}
                {r.m === null ? <><td className="is-empty"><span className="lb-dt-null">NULL</span></td><td className="is-empty"><span className="lb-dt-null">NULL</span></td></>
                  : <><td>{num(MARKS[r.m].pupil)}</td><td>{num(MARKS[r.m].mark)}</td></>}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="lb-note">{rich(s.nullNote)}</p>
      </div>
    </LabShell>
  );
}
