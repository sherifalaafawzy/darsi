import { useEffect, useMemo, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { answers, emptyCells, FIXES, messy, OUT_OF, tidy, typeOf, type Answer, type Cell, type ColId, type Fix } from "./model";

const S = {
  en: {
    intro: "Mr Bello typed his class's marks the way many of us do, and people read it easily. Now a computer must answer three questions from it. Fix the table and watch its answers.",
    names: ["Amina", "Tunde", "Chidi", "Fatima", "Kofi", "Grace"], classes: ["5A", "5B"] as [string, string], total: "Total",
    fixes: "Fixes", fix: { fill: "Fill in the empty class cells", totals: "Delete the total rows", split: "Split the marks into two columns" } as Record<Fix, string>,
    rule: { fill: "Every row says its class", totals: "One row per pupil", split: "One value per cell" } as Record<Fix, string>,
    col: { name: "Name", cls: "Class", marks: "Maths / Science", maths: "Maths", science: "Science" } as Record<ColId, string>,
    type: { text: "text", number: "number" }, table: "Mr Bello's marks sheet, out of 20", empty: "empty",
    rows: "Rows", emptyCells: "Empty cells", asks: "The computer's answers",
    qCount: (c: string) => `How many pupils are in ${c}?`, qAverage: "What is the average maths mark?", qBest: "Who has the best science mark?",
    says: (v: string) => `It says: ${v}`, outOf: (v: string, o: string) => `${v} out of ${o}`, cant: "It can't: the marks are text, like “14 / 17”.",
    right: "Right", wrong: "Wrong",
    whyCount: (filled: boolean): string => (filled ? "The Total row got a class too, so it counts as a pupil." : "Only the first row of each class says its class."),
    whyTotals: "The Total rows count as pupils with very big marks.",
    tidy: "Tidy: the computer gets all three right.",
    try1: "Tap “Fill in the empty class cells” first: the computer now counts 4 pupils in 5B, not 3. The Total row got a class too, so it counts as a pupil.",
    try2: "Split the marks: now the computer can average maths, but it says 20 out of 20. Delete the total rows and the average drops to about 13.",
    try3: "Watch the type under each heading: “Maths / Science” is text until you split it, and a computer can't add up text.",
    takeaway: "A tidy table has one row per thing, one column per fact and one value per cell. Merged cells, total rows and two facts in one cell look fine to people but give a computer wrong answers. Keep totals for the report, not in the data.",
  },
  ar: {
    intro: "كتب الأستاذ سامي درجات تلاميذه كما يفعل كثيرون منا، فيقرؤها الناس بسهولة. لكن على الحاسوب الآن أن يجيب عن ثلاثة أسئلة منها. أصلح الجدول وراقب إجاباته.",
    names: ["أمينة", "عمر", "ليلى", "فاطمة", "يوسف", "مريم"], classes: ["٥أ", "٥ب"] as [string, string], total: "المجموع",
    fixes: "الإصلاحات", fix: { fill: "املأ خانات الفصل الفارغة", totals: "احذف صفوف المجموع", split: "قسّم الدرجات إلى عمودين" },
    rule: { fill: "كل صف يذكر فصله", totals: "صف واحد لكل تلميذ", split: "قيمة واحدة في كل خانة" },
    col: { name: "الاسم", cls: "الفصل", marks: "الرياضيات / العلوم", maths: "الرياضيات", science: "العلوم" },
    type: { text: "نص", number: "عدد" }, table: "ورقة درجات الأستاذ سامي، من ٢٠", empty: "فارغة",
    rows: "الصفوف", emptyCells: "الخانات الفارغة", asks: "إجابات الحاسوب",
    qCount: (c: string) => `كم تلميذًا في الفصل ${c}؟`, qAverage: "ما متوسط درجات الرياضيات؟", qBest: "من صاحب أعلى درجة في العلوم؟",
    says: (v: string) => `يقول: ${v}`, outOf: (v: string, o: string) => `${v} من ${o}`, cant: "لا يستطيع: الدرجات نصوص، مثل «١٤ / ١٧».",
    right: "صحيح", wrong: "خطأ",
    whyCount: (filled: boolean) => (filled ? "نال صفّ المجموع فصلًا هو أيضًا، فصار يُعدّ تلميذًا." : "أول صف في كل فصل هو وحده الذي يذكر الفصل."),
    whyTotals: "صفوف المجموع تُعدّ تلاميذ لهم درجات كبيرة جدًّا.",
    tidy: "صار الجدول مرتّبًا: أجاب الحاسوب عن الأسئلة الثلاثة إجابات صحيحة.",
    try1: "المس «املأ خانات الفصل الفارغة» أولًا: يعدّ الحاسوب الآن ٤ تلاميذ في ٥ب لا ٣. فقد نال صفّ المجموع فصلًا هو أيضًا، فصار يُعدّ تلميذًا.",
    try2: "قسّم الدرجات: يستطيع الحاسوب الآن حساب متوسط الرياضيات، لكنه يقول ٢٠ من ٢٠. احذف صفوف المجموع فينزل المتوسط إلى نحو ١٣.",
    try3: "راقب النوع تحت كل عنوان: «الرياضيات / العلوم» نصّ حتى تقسمه، والحاسوب لا يجمع النصوص.",
    takeaway: "الجدول المرتّب فيه صف لكل شيء، وعمود لكل معلومة، وقيمة واحدة في كل خانة. الخانات المدمجة وصفوف المجموع ومعلومتان في خانة واحدة تبدو سليمة للناس، لكنها تعطي الحاسوب إجابات خاطئة. اترك المجاميع للتقرير، لا للبيانات.",
  },
};

export default function Table({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [on, setOn] = useState<ReadonlySet<Fix>>(new Set());
  const raw = useMemo(() => messy(s.names, s.classes, s.total), [s]);
  const t = tidy(raw, on);
  const a = answers(t, s.classes, s.names);
  const all = a.count.right && a.average.right && a.best.right;
  useEffect(() => { if (all) onDone?.(); }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (f: Fix) => setOn((x) => { const n = new Set(x); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const cell = (c: Cell) => (c === null ? "" : typeof c === "number" ? num(c) : typeof c === "string" ? c : `${num(c[0])} / ${num(c[1])}`);
  const marksText = !t.cols.includes("maths");
  const whyAvg = marksText ? s.cant : s.whyTotals;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => setOn(new Set())}>
      <div className="lb-fixes" role="group" aria-label={s.fixes}>
        {FIXES.map((f) => (
          <button key={f} type="button" className={on.has(f) ? "lb-fix is-on" : "lb-fix"} aria-pressed={on.has(f)} onClick={() => toggle(f)}>
            <Icon name={on.has(f) ? "check" : "edit"} size={18} />
            <span><strong>{s.fix[f]}</strong><span className="lb-fix-rule">{s.rule[f]}</span></span>
          </button>
        ))}
      </div>
      <div className="lb-scroll" role="region" aria-label={s.table} tabIndex={0}>
        <table className="lb-dt">
          <caption className="lb-dt-cap">{s.table}</caption>
          <thead><tr>{t.cols.map((c) => <th key={c} scope="col">{s.col[c]}<span className={`lb-type is-${typeOf(t, c)}`}>{s.type[typeOf(t, c)]}</span></th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className={r.total ? "is-total" : undefined}>
                {r.cells.map((c, j) => <td key={j} className={c === null ? "is-empty" : r.filled && t.cols[j] === "cls" ? "is-new" : undefined}>{c === null ? <span className="lb-dt-null">{s.empty}</span> : cell(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Stats items={[{ label: s.rows, value: num(t.rows.length) }, { label: s.emptyCells, value: num(emptyCells(t)) }]} />
      <div className="lb-panel">
        <strong>{s.asks}</strong>
        <ul className="lb-qs">
          <Q q={s.qCount(s.classes[1])} a={a.count} says={s.says(num(a.count.value as number))} why={s.whyCount(on.has("fill"))} s={s} />
          <Q q={s.qAverage} a={a.average} says={a.average.value === null ? s.cant : s.says(s.outOf(num(a.average.value as number, { maximumFractionDigits: 1 }), num(OUT_OF)))} why={a.average.value === null ? undefined : whyAvg} s={s} />
          <Q q={s.qBest} a={a.best} says={a.best.value === null ? s.cant : s.says(String(a.best.value))} why={a.best.value === null ? undefined : s.whyTotals} s={s} />
        </ul>
        {all && <p className="lb-verdict" aria-live="polite">{s.tidy}</p>}
      </div>
    </LabShell>
  );
}

function Q({ q, a, says, why, s }: { q: string; a: Answer; says: string; why?: string; s: { right: string; wrong: string } }) {
  return (
    <li className="lb-q">
      <span className="lb-q-text">{q}</span>
      <span>{says}</span>
      <span className={a.right ? "lb-ok" : "lb-no"}><Icon name={a.right ? "check" : "cross"} size={16} /> {a.right ? s.right : s.wrong}</span>
      {!a.right && why && <span className="lb-note">{why}</span>}
    </li>
  );
}
