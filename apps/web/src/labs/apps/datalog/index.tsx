import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { csv, daily, dryHours, glitches, HOURS, stats, week } from "./model";

const S = {
  en: {
    intro: "A soil sensor in the school garden logged a reading every hour for a week. Moisture falls in the heat of the day and jumps when the gardening club waters. A loose wire also made a few readings nonsense.",
    chart: "Soil moisture over the week (%); red dots are glitches; the flat line is the “needs water” level", hours: "day of the week", pct: "%",
    clean: "Glitches", keep: "Keep them", hide: "Leave them out", found: (n: string) => `Found ${n} glitches: readings of exactly 0 or 100, or far from the hours around them.`,
    line: "Needs water below", min: "Lowest", max: "Highest", mean: "Average", median: "Middle value (median)", dry: "Hours too dry",
    daily: "Average for each day", days: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
    save: "Save as a spreadsheet file (CSV)", saved: "Saved: open it in any spreadsheet app.",
    try1: "Choose “Leave them out”: the lowest reading jumps from 0 to about 55, and the hours too dry fall to 0. The garden never dried out; a loose wire did that.",
    try2: "Compare the daily bars before and after: days 4 and 5 rise by about 3, yet the middle value (median) doesn't move.",
    try3: "Raise “Needs water below” to 60%: now the real dry hours show up, all on days 2 and 3, just before the club waters.",
    takeaway: "Logged data is only useful after checking it. A few bad readings can drag an average or fake a “lowest” value; the median barely moves. Always look at the chart before trusting a summary, and keep the raw data with a note of what you removed.",
  },
  ar: {
    intro: "سجّل مستشعر للتربة في حديقة المدرسة قراءة كل ساعة لمدة أسبوع. تنخفض الرطوبة في حرّ النهار وتقفز حين يسقي نادي البستنة. وجعل سلك مرتخٍ بعض القراءات بلا معنى.",
    chart: "رطوبة التربة خلال الأسبوع (٪)؛ النقاط الحمراء قراءات خاطئة، والخط الأفقي مستوى «تحتاج إلى سقاية»", hours: "يوم الأسبوع", pct: "٪",
    clean: "القراءات الخاطئة", keep: "أبقِها", hide: "استبعدها", found: (n: string) => `وُجدت ${n} قراءات خاطئة: قراءات تساوي ٠ أو ١٠٠ تمامًا، أو بعيدة عن الساعات المحيطة بها.`,
    line: "تحتاج إلى سقاية تحت", min: "الأدنى", max: "الأعلى", mean: "المتوسط", median: "القيمة الوسطى (الوسيط)", dry: "ساعات الجفاف",
    daily: "متوسط كل يوم", days: ["اليوم ١", "اليوم ٢", "اليوم ٣", "اليوم ٤", "اليوم ٥", "اليوم ٦", "اليوم ٧"],
    save: "احفظ ملفَّ جدول (CSV)", saved: "حُفظ الملف: افتحه في أي برنامج جداول.",
    try1: "اختر «استبعدها»: تقفز أدنى قراءة من ٠ إلى نحو ٥٥، وتنخفض ساعات الجفاف إلى ٠. لم تجفّ الحديقة قط، بل السلك المرتخي هو ما صنع ذلك.",
    try2: "قارن أعمدة الأيام قبل الاستبعاد وبعده: يرتفع اليومان ٤ و٥ نحو ٣ نقاط، لكن القيمة الوسطى (الوسيط) لا تتحرك.",
    try3: "ارفع «تحتاج إلى سقاية تحت» إلى ٦٠٪: تظهر الآن ساعات الجفاف الحقيقية، وكلها في اليومين ٢ و٣، قبل أن يسقي النادي مباشرة.",
    takeaway: "لا تفيد البيانات المسجّلة إلا بعد فحصها. قراءات خاطئة قليلة قد تشدّ المتوسط أو تصنع قيمة «دنيا» زائفة، أما الوسيط فبالكاد يتحرك. انظر دائمًا إلى الرسم قبل أن تثق بالملخّص، واحتفظ بالبيانات الأصلية مع ملاحظة بما استبعدته.",
  },
};

export default function Datalog({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const rows = useMemo(() => week(), []);
  const bad = useMemo(() => glitches(rows), [rows]);
  const [hide, setHide] = useState(false);
  const [line, setLine] = useState(40);
  const [saved, setSaved] = useState(false);
  const skip = hide ? bad : bad.map(() => false);
  const st = stats(rows.filter((_, i) => !skip[i]).map((x) => x.v));
  const days = daily(rows, skip);
  useEffect(() => { if (hide && saved) onDone?.(); }, [hide && saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const n1 = (v: number) => num(Math.round(v * 10) / 10);
  const save = () => {
    const url = URL.createObjectURL(new Blob([csv(rows, bad)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "garden-soil-week.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Plot x={[0, HOURS]} y={[0, 100]} height={240} ticks={7} label={s.chart} xLabel={s.hours} yLabel={s.pct} yTicks={4} xFmt={(v) => (v >= HOURS ? "" : num(Math.round(v / 24) + 1))}
        lines={[{ points: rows.filter((_, i) => !skip[i]).map((x) => [x.h, x.v] as const), tone: "a", width: 1.5 }, { points: [[0, line], [HOURS, line]], tone: "c", dashed: true, width: 1.5 }]}
        dots={hide ? [] : rows.filter((_, i) => bad[i]).map((x) => ({ x: x.h, y: x.v, r: 5, tone: "c" as const }))} />
      <p className="lb-note">{s.chart}</p>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.clean} value={hide ? 1 : 0} options={[[0, s.keep], [1, s.hide]]} onChange={(v) => setHide(v === 1)} />
          <p className="lb-note">{s.found(num(bad.filter(Boolean).length))}</p>
          <Slider label={s.line} value={line} min={20} max={60} step={5} onChange={setLine} format={(v) => `${num(v)}${s.pct}`} />
          <Stats items={[{ label: s.min, value: n1(st.min) }, { label: s.max, value: n1(st.max) }, { label: s.mean, value: n1(st.mean) }, { label: s.median, value: n1(st.median) }, { label: s.dry, value: num(dryHours(rows, skip, line)) }]} />
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.daily}</span>
          <ul className="lb-bars">
            {days.map((v, d) => <li key={d} className="lb-bar"><span>{s.days[d]}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(v)}%` }} /></span><span>{n1(v)}</span></li>)}
          </ul>
          <div className="lb-row"><Button size="sm" variant="secondary" icon="file" onClick={save}>{s.save}</Button></div>
          {saved && <p className="lb-note" aria-live="polite">{s.saved}</p>}
        </div>
      </div>
    </LabShell>
  );
}
