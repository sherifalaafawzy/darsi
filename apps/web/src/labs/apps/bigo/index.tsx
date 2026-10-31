import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot, type Line, type Tone } from "../../kit/Plot";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { GROWTHS, SIZES, count, curve, duration, estimate, ratio, seconds, type Growth, type Unit } from "./model";

const S = {
  en: {
    intro: "Big O describes how the work grows when the job gets bigger. Each job below really runs here, counting its comparisons, for a class list of n pupils.",
    n: "Pupils on the list (n)", chart: "Comparisons as n grows", show: "Chart", all: "All four", noSquare: "Without n²",
    job: { log: "Find a name in the sorted list", n: "Find the tallest pupil", nlogn: "Sort the list (merge sort)", n2: "Check every pair for a shared birthday" } as Record<Growth, string>,
    growth: "Grows like", steps: "Comparisons", time: "On a phone", double: "When n doubles, the work…",
    plus: "+1 step", times: (x: string) => `×${x}`,
    million: "And for a whole country's pupils: a million?", worked: "Worked out, not counted: too big to count here.",
    instant: "under a millisecond",
    unit: { ms: { other: "{n} ms" }, s: { one: "{n} second", other: "{n} seconds" }, min: { one: "{n} minute", other: "{n} minutes" }, h: { one: "{n} hour", other: "{n} hours" }, d: { one: "{n} day", other: "{n} days" } } as Record<Exclude<Unit, "instant">, Forms>,
    phone: "A phone does about ten million simple steps a second.",
    try1: "Move n from 10 to 1,000: the n² job's comparisons shoot up while the others hardly leave the floor of the chart.",
    try2: "Choose “Without n²”: now you can see n log n pull away from n, slowly.",
    try3: "Read the million row: the same phone takes a fraction of a second for n, but hours for n².",
    takeaway: "How the work grows matters more than how fast the computer is. An n² method that is fine for a class of 30 can take hours for a whole country; a better method (n log n) makes the same job take seconds.",
  },
  ar: {
    intro: "تصف O الكبيرة كيف ينمو العمل حين تكبر المهمة. وكل مهمة في الأسفل تُنفَّذ هنا فعلًا وتُعَدّ مقارناتها، لقائمة صفّ فيها n من التلاميذ.",
    n: "عدد التلاميذ في القائمة (n)", chart: "المقارنات كلما كبر n", show: "الرسم", all: "الأربع كلها", noSquare: "بدون n²",
    job: { log: "ابحث عن اسم في القائمة المرتّبة", n: "اعثر على أطول تلميذ", nlogn: "رتّب القائمة (الترتيب بالدمج)", n2: "افحص كل زوج بحثًا عن عيد ميلاد مشترك" } as Record<Growth, string>,
    growth: "ينمو مثل", steps: "المقارنات", time: "على الهاتف", double: "حين يتضاعف n، يصير العمل…",
    plus: "+١ خطوة", times: (x: string) => `×${x}`,
    million: "وماذا عن تلاميذ بلد كامل: مليون؟", worked: "محسوبة بالمعادلة لا بالعدّ: أكبر من أن تُعَدّ هنا.",
    instant: "أقل من ملّي ثانية",
    unit: {
      ms: { other: "{n} ملّي ثانية" },
      s: { one: "ثانية واحدة", two: "ثانيتان", few: "{n} ثوانٍ", many: "{n} ثانية", other: "{n} ثانية" },
      min: { one: "دقيقة واحدة", two: "دقيقتان", few: "{n} دقائق", many: "{n} دقيقة", other: "{n} دقيقة" },
      h: { one: "ساعة واحدة", two: "ساعتان", few: "{n} ساعات", many: "{n} ساعة", other: "{n} ساعة" },
      d: { one: "يوم واحد", two: "يومان", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" },
    } as Record<Exclude<Unit, "instant">, Forms>,
    phone: "ينفّذ الهاتف نحو عشرة ملايين خطوة بسيطة في الثانية.",
    try1: "حرّك n من ١٠ إلى ١٠٠٠: تقفز مقارنات مهمة n² بينما لا تكاد المهام الأخرى ترتفع عن أسفل الرسم.",
    try2: "اختر «بدون n²»: سترى الآن n log n تبتعد عن n ببطء.",
    try3: "اقرأ صف المليون: يحتاج الهاتف نفسه إلى جزء من الثانية لمهمة n، لكن إلى ساعات لمهمة n².",
    takeaway: "طريقة نموّ العمل أهم من سرعة الحاسوب. فطريقة n² التي تكفي لصف من ٣٠ تلميذًا قد تستغرق ساعات لبلد كامل، وطريقة أفضل (n log n) تنجز المهمة نفسها في ثوانٍ.",
  },
};
const TONE: Record<Growth, Tone> = { log: "muted", n: "a", nlogn: "b", n2: "c" };
const NAME: Record<Growth, string> = { log: "log n", n: "n", nlogn: "n log n", n2: "n²" };

export default function BigO({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const plural = usePlural();
  const [i, setI] = useState(2);
  const [square, setSquare] = useState(true);
  const [seen, setSeen] = useState(new Set([2]));
  const n = SIZES[i];
  const shown = square ? GROWTHS : GROWTHS.filter((g) => g !== "n2");
  const curves = useMemo(() => Object.fromEntries(GROWTHS.map((g) => [g, curve(g, n)])) as Record<Growth, [number, number][]>, [n]);
  const counts = useMemo(() => Object.fromEntries(GROWTHS.map((g) => [g, count(g, n)])) as Record<Growth, number>, [n]);
  const grows = useMemo(() => Object.fromEntries(GROWTHS.map((g) => [g, ratio(g, n)])) as Record<Growth, number>, [n]);
  const top = Math.max(1, ...shown.map((g) => curves[g][curves[g].length - 1][1]));
  const lines: Line[] = shown.map((g) => ({ points: curves[g], tone: TONE[g], dashed: g === "log", width: 3 }));
  const time = (ops: number) => { const d = duration(seconds(ops)); return d.unit === "instant" ? s.instant : plural(d.n, s.unit[d.unit]); };
  useEffect(() => { if (seen.size >= 3) onDone?.(); }, [seen.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (g: Growth) => <bdi dir="ltr" className="lb-bigo-name">{NAME[g]}</bdi>;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.n} value={i} min={0} max={SIZES.length - 1} onChange={(v) => { setI(v); setSeen((x) => new Set(x).add(v)); }} format={(v) => num(SIZES[v])} />
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, n]} y={[0, top]} lines={lines} label={s.chart} xLabel="n" yLabel={s.steps} height={240}
            xFmt={(v) => num(Math.round(v))} yFmt={(v) => num(Math.round(v), { notation: "compact" })} />
          <Segmented label={s.show} value={square ? 1 : 0} onChange={(v) => setSquare(v === 1)} options={[[1, s.all], [0, s.noSquare]]} />
        </div>
        <ul className="lb-bigo-jobs">
          {GROWTHS.map((g) => (
            <li key={g} className="lb-bigo-job">
              <span className={`lb-bigo-key is-${g}`} aria-hidden />
              <div className="lb-bigo-what"><strong>{s.job[g]}</strong> <span className="lb-note">{s.growth} {name(g)}</span></div>
              <dl className="lb-bigo-nums">
                <div><dt>{s.steps}</dt><dd>{num(counts[g])}</dd></div>
                <div><dt>{s.time}</dt><dd>{time(counts[g])}</dd></div>
                <div><dt>{s.double}</dt><dd>{g === "log" ? s.plus : s.times(num(Math.round(grows[g] * 10) / 10))}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
      <table className="lb-table">
        <caption className="lb-bigo-cap">{s.million}</caption>
        <thead><tr><th scope="col">{s.growth}</th><th scope="col">{s.steps}</th><th scope="col">{s.time}</th></tr></thead>
        <tbody>{GROWTHS.map((g) => <tr key={g}><td>{name(g)}</td><td>{num(estimate(g, 1e6))}</td><td>{time(estimate(g, 1e6))}</td></tr>)}</tbody>
      </table>
      <p className="lb-note">{s.worked} {s.phone}</p>
    </LabShell>
  );
}
