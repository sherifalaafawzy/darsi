import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { ENTRY_BYTES, expectScan, expectSeek, scan, seekSteps, SIZES, small, trial } from "./model";

const S = {
  en: {
    intro: "The school office looks pupils up by their number. Without an index it must read the rows one by one. An index is a sorted copy of the pupil numbers, each with a pointer to its row.",
    watch: "Watch one lookup", find: (k: string) => `Find pupil ${k}`, lane1: "Reading every row", lane2: "With the sorted index (halving)",
    looks: (n: string) => `Looks: ${n}`, found: "Found, ",
    grow: "As the table grows", size: "Rows in the table", lookup: "Look up 20 pupils", busy: "Building the table and its index…",
    without: "Looks without an index (average)", withIdx: "Looks with the index (average)", space: "Extra space for the index", time: "Time for 20 lookups on this phone",
    ms: (a: string, b: string) => `${a} against ${b} ms`, under: "under 0.1", press: "Press “Look up 20 pupils” to measure this size.",
    kb: (n: string) => `${n} KB`, mb: (n: string) => `${n} MB`,
    chart: "Looks per lookup against rows in the table; each step on either axis is ten times more", rows: "rows", looksAxis: "looks",
    legend: "Solid line and squares: reading every row. Dashed line and circles: with the index. Lines are the averages expected; marks are what this phone measured.",
    try1: "Press Run under “Watch one lookup”: reading row by row takes many looks; the sorted index halves the list each time and never needs more than 6 looks (32 → 16 → 8 → 4 → 2 → 1).",
    try2: "Choose 1M rows and press “Look up 20 pupils”: about 500,000 looks each without an index, about 20 with one.",
    try3: "On the chart each step is ten times more rows: the no-index line climbs ten times each step, while the index line adds only about 3 looks.",
    takeaway: "An index is a sorted copy of one column with a pointer to each row, so a lookup can halve the search again and again: about 20 looks for a million rows instead of half a million. It costs space, and every new row must be added to it too, so index the columns you search by, not every column.",
  },
  ar: {
    intro: "يبحث مكتب المدرسة عن التلاميذ بأرقامهم. ودون فهرس عليه أن يقرأ الصفوف واحدًا تلو الآخر. أما الفهرس فنسخة مرتّبة من أرقام التلاميذ، مع كل رقم إشارة إلى صفه.",
    watch: "شاهد بحثًا واحدًا", find: (k: string) => `ابحث عن التلميذ رقم ${k}`, lane1: "قراءة كل الصفوف", lane2: "مع الفهرس المرتّب (التنصيف)",
    looks: (n: string) => `النظرات: ${n}`, found: "وُجد، ",
    grow: "حين يكبر الجدول", size: "عدد صفوف الجدول", lookup: "ابحث عن ٢٠ تلميذًا", busy: "جارٍ بناء الجدول وفهرسه…",
    without: "النظرات دون فهرس (في المتوسط)", withIdx: "النظرات مع الفهرس (في المتوسط)", space: "المساحة الإضافية للفهرس", time: "زمن ٢٠ بحثًا على هذا الهاتف",
    ms: (a: string, b: string) => `${a} مقابل ${b} ملّي ثانية`, under: "أقل من ٠٫١", press: "اضغط «ابحث عن ٢٠ تلميذًا» لتقيس هذا الحجم.",
    kb: (n: string) => `${n} كيلوبايت`, mb: (n: string) => `${n} ميغابايت`,
    chart: "النظرات لكل بحث مقابل صفوف الجدول، وكل خطوة على أي محور تعني عشرة أضعاف", rows: "الصفوف", looksAxis: "النظرات",
    legend: "الخط المتصل والمربعات: قراءة كل الصفوف. الخط المتقطع والدوائر: مع الفهرس. الخطوط هي المتوسطات المتوقعة، والعلامات ما قاسه هذا الهاتف.",
    try1: "اضغط «شغّل» تحت «شاهد بحثًا واحدًا»: القراءة صفًّا صفًّا تحتاج نظرات كثيرة، أما الفهرس المرتّب فيقسم القائمة نصفين كل مرة، فلا يحتاج أبدًا إلى أكثر من ٦ نظرات (٣٢ ← ١٦ ← ٨ ← ٤ ← ٢ ← ١).",
    try2: "اختر مليون صف واضغط «ابحث عن ٢٠ تلميذًا»: نحو نصف مليون نظرة لكل بحث دون فهرس، ونحو ٢٠ مع الفهرس.",
    try3: "في الرسم، كل خطوة تعني صفوفًا أكثر بعشر مرات: يصعد خط «دون فهرس» عشرة أضعاف في كل خطوة، أما خط الفهرس فلا يزيد إلا نحو ٣ نظرات.",
    takeaway: "الفهرس نسخة مرتّبة من عمود واحد مع إشارة إلى كل صف، فيستطيع البحث أن يقسم القائمة نصفين مرة بعد مرة: نحو ٢٠ نظرة لمليون صف بدلًا من نصف مليون. لكنه يأخذ مساحة، ويجب أن يُضاف إليه كل صف جديد أيضًا، ففهرس الأعمدة التي تبحث بها، لا كل عمود.",
  },
};

/** One look every this many milliseconds while watching. */
const PACE = 300;
type Result = ReturnType<typeof trial>;

export default function Index({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [seed, setSeed] = useState(5);
  const w = useMemo(() => small(seed), [seed]);
  const scanLen = useMemo(() => scan(w.ids, w.key), [w]);
  const steps = useMemo(() => seekSteps(w.keys, w.key), [w]);
  const last = Math.max(scanLen, steps.length);
  const t0 = useRef(0);
  const [tick, setTick] = useState(0);
  const loop = useLoop(() => { const t = Math.min(last, 1 + Math.floor((performance.now() - t0.current) / PACE)); setTick(t); return t < last; }, { maxPerFrame: 1 });
  const [watched, setWatched] = useState(false);
  const start = () => {
    if (loop.running) { loop.stop(); return; }
    if (tick) setSeed((x) => x + 1);
    setWatched(true);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setTick(Infinity); return; }
    setTick(0); t0.current = performance.now(); loop.start();
  };

  const [n, setN] = useState(SIZES[2]);
  const [res, setRes] = useState<Record<number, Result>>({});
  const [busy, setBusy] = useState(false);
  const measured = Object.keys(res).length;
  useEffect(() => { if (watched && measured >= 2) onDone?.(); }, [watched && measured >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const measure = () => { setBusy(true); setTimeout(() => { const r = trial(n); setRes((m) => ({ ...m, [n]: r })); setBusy(false); }, 30); };
  const r = res[n];
  const compact = (v: number) => num(v, { notation: "compact" });
  const sz = (b: number) => (b < 1000 * 1024 ? s.kb(num(b / 1024, { maximumFractionDigits: 1 })) : s.mb(num(b / 1048576, { maximumFractionDigits: 1 })));
  const ms = (v: number) => (v < 0.1 ? s.under : num(v, { maximumFractionDigits: 1 }));
  const xs = Array.from({ length: 17 }, (_, i) => 2 + i * 0.25);
  const sc = Math.min(tick, scanLen), sk = Math.min(tick, steps.length), cur = sk ? steps[sk - 1] : null;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-panel">
        <strong>{s.watch}</strong>
        <RunBar running={loop.running} onToggle={start}><span className="lb-verdict">{s.find(num(w.key))}</span></RunBar>
        <div className="lb-lane">
          <span className="dr-field-label">{s.lane1}: <span aria-live="polite">{sc >= scanLen ? s.found : ""}{s.looks(num(sc))}</span></span>
          <ol className="lb-cells" dir="ltr">
            {Array.from(w.ids, (id, i) => <li key={i} className={i === scanLen - 1 && sc >= scanLen ? "lb-cell is-hit" : i === sc - 1 ? "lb-cell is-now" : i < sc ? "lb-cell is-seen" : "lb-cell"}>{num(id)}</li>)}
          </ol>
        </div>
        <div className="lb-lane">
          <span className="dr-field-label">{s.lane2}: <span aria-live="polite">{sk >= steps.length ? s.found : ""}{s.looks(num(sk))}</span></span>
          <ol className="lb-cells" dir="ltr">
            {Array.from(w.keys, (id, i) => {
              const hit = sk >= steps.length && i === steps[steps.length - 1].mid;
              const cls = hit ? "is-hit" : cur && i === cur.mid ? "is-now" : steps.slice(0, sk).some((x) => x.mid === i) ? "is-seen" : cur && (i < cur.lo || i > cur.hi) ? "is-out" : "";
              return <li key={i} className={`lb-cell ${cls}`}>{num(id)}</li>;
            })}
          </ol>
        </div>
      </div>
      <div className="stack">
        <strong>{s.grow}</strong>
        <div className="lb-two">
          <div className="stack">
            <Segmented label={s.size} value={n} options={SIZES.map((v) => [v, compact(v)] as const)} onChange={setN} />
            <div className="lb-row"><Button size="sm" icon="search" onClick={measure} loading={busy}>{s.lookup}</Button></div>
            {busy && <p className="lb-note">{s.busy}</p>}
            {r ? <Stats items={[
              { label: s.without, value: num(Math.round(r.scan)) }, { label: s.withIdx, value: num(r.seek, { maximumFractionDigits: 1 }) },
              { label: s.space, value: sz(n * ENTRY_BYTES) }, { label: s.time, value: s.ms(ms(r.scanMs), ms(r.seekMs)) },
            ]} /> : <p className="lb-note">{s.press}</p>}
          </div>
          <div className="stack">
            <Plot x={[1, 7]} y={[0, 6]} height={240} label={s.chart} xLabel={s.rows} yLabel={s.looksAxis} ticks={6} yTicks={6} xFmt={(v) => (v < 1.5 || v > 6.5 ? "" : compact(10 ** v))} yFmt={(v) => compact(10 ** v)}
              lines={[{ points: xs.map((x) => [x, Math.log10(expectScan(10 ** x))] as const), tone: "b" }, { points: xs.map((x) => [x, Math.log10(expectSeek(10 ** x))] as const), tone: "a", dashed: true }]}
              dots={Object.values(res).flatMap((m) => [{ x: Math.log10(m.n), y: Math.log10(m.scan), tone: "b" as const, shape: "square" as const }, { x: Math.log10(m.n), y: Math.log10(m.seek), tone: "a" as const }])} />
            <p className="lb-note">{s.legend}</p>
          </div>
        </div>
      </div>
    </LabShell>
  );
}
