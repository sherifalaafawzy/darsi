import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Slider, Stats } from "../../kit/controls";
import { Plot, type Line } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { judge, LINE, MINUTES, readings, TRUE_CROSS, type Mode } from "./model";

const S = {
  en: {
    intro: "A sensor on the river by the school sends the water level every minute. If the river goes above 2 m, pupils must move upstairs. The readings are noisy: a splash or a boat's wake can look like a flood for a few minutes.",
    mode: "How readings are handled", modes: { stream: "Stream: each as it arrives", batch: "Batch: every few minutes" } as Record<Mode, string>,
    window: "Readings in the average", every: "Minutes in each batch", replay: "Replay as it arrives",
    chart: "River level (m) over three hours: dots are readings, the line is what the alert watches, the dashed line is 2 m", minutes: "minutes", metres: "m",
    legend: "Hollow red triangles are false alarms; the filled triangle is the real alert. The upright dashed line is when the river really crossed 2 m.",
    falseN: "False alarms", real: "Real alert", delay: "Compared with the river", wake: "Times the computer woke up",
    at: (m: string) => `minute ${m}`, none: "none yet", late: (d: string) => `${d} late`, early: (d: string) => `${d} early`, onTime: "on time",
    try1: "Stream with 1 reading in the average: three false alarms from splashes before the water really rises.",
    try2: "Raise the average to 5: one false alarm is left, from a boat's wake that lasts four minutes. At 10 it's gone, but the real alert comes 5 minutes late; at 30, 15 minutes late.",
    try3: "Switch to Batch every 60 minutes: no false alarms and only 3 wake-ups, but the alert comes nearly an hour late. For a flood warning, that's too late.",
    takeaway: "A stream handles each reading as it arrives; a batch handles many together, later. Averaging over a window hides noise but adds delay, and waiting for a batch adds more. Choose by what a late alert costs, and what a false one costs.",
  },
  ar: {
    intro: "مستشعر على النهر بجانب المدرسة يرسل مستوى الماء كل دقيقة. إذا تجاوز النهر مترين، يجب أن يصعد التلاميذ إلى الطابق العلوي. والقراءات فيها تشويش: رذاذ أو موج قارب عابر قد يبدو فيضانًا لبضع دقائق.",
    mode: "كيف تُعالَج القراءات", modes: { stream: "تدفّق: كل قراءة لحظة وصولها", batch: "دفعات: كل بضع دقائق" },
    window: "عدد القراءات في المتوسط", every: "دقائق كل دفعة", replay: "أعِد العرض كما وصلت",
    chart: "مستوى النهر (م) خلال ثلاث ساعات: النقاط قراءات، والخط ما يراقبه الإنذار، والخط المتقطع عند مترين", minutes: "الدقائق", metres: "م",
    legend: "المثلثات المفرغة الحمراء إنذارات كاذبة، والمثلث الممتلئ هو الإنذار الحقيقي. والخط العمودي المتقطع لحظة تجاوز النهر مترين فعلًا.",
    falseN: "الإنذارات الكاذبة", real: "الإنذار الحقيقي", delay: "مقارنة بالنهر", wake: "مرات استيقاظ الحاسوب",
    at: (m: string) => `الدقيقة ${m}`, none: "لا شيء بعد", late: (d: string) => `متأخر ${d}`, early: (d: string) => `مبكر ${d}`, onTime: "في وقته",
    try1: "مع التدفّق وقراءة واحدة في المتوسط: ثلاثة إنذارات كاذبة من الرذاذ قبل أن يرتفع الماء فعلًا.",
    try2: "ارفع المتوسط إلى ٥: يبقى إنذار كاذب واحد، من موج قارب يدوم أربع دقائق. وعند ١٠ يختفي، لكن الإنذار الحقيقي يتأخر ٥ دقائق، وعند ٣٠ يتأخر ١٥ دقيقة.",
    try3: "انتقل إلى الدفعات كل ٦٠ دقيقة: لا إنذارات كاذبة، ولا يستيقظ الحاسوب إلا ٣ مرات، لكن الإنذار يتأخر قرابة ساعة. وهذا متأخر جدًّا لإنذار فيضان.",
    takeaway: "التدفّق يعالج كل قراءة لحظة وصولها، والدفعات تعالج قراءات كثيرة معًا لاحقًا. المتوسط على نافذة يخفي التشويش لكنه يضيف تأخيرًا، وانتظار الدفعة يضيف أكثر. اختر بحسب كلفة الإنذار المتأخر، وكلفة الإنذار الكاذب.",
  },
};

/** Milliseconds per minute of river time while replaying: three hours in nine seconds. */
const PACE = 50;

export default function Stream({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const xs = useMemo(() => readings(), []);
  const [mode, setMode] = useState<Mode>("stream");
  const [w, setW] = useState(1);
  const [b, setB] = useState(15);
  const [seen, setSeen] = useState({ modes: new Set<Mode>(["stream"]), windows: new Set<number>([1]) });
  useEffect(() => { if (seen.modes.size === 2 && seen.windows.size >= 3) onDone?.(); }, [seen.modes.size === 2 && seen.windows.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const j = useMemo(() => judge(xs, mode, mode === "stream" ? w : b), [xs, mode, w, b]);

  const [cursor, setCursor] = useState(MINUTES);
  const t0 = useRef(0);
  const loop = useLoop(() => { const c = Math.min(MINUTES, Math.floor((performance.now() - t0.current) / PACE)); setCursor(c); return c < MINUTES; }, { maxPerFrame: 1 });
  const replay = () => {
    if (loop.running) { loop.stop(); setCursor(MINUTES); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setCursor(MINUTES); return; }
    setCursor(0); t0.current = performance.now(); loop.start();
  };

  const upto = <T,>(t: number, x: T) => (t <= cursor ? [x] : []);
  // A batch's average holds for the whole batch: drawn as steps.
  const watch: Line = mode === "stream"
    ? { points: j.series.filter(([t]) => t <= cursor), tone: "a", width: 2.5 }
    : { points: j.series.flatMap(([t, v]) => upto(t, [[t - b + 1, v], [t + 1, v]] as const).flat()), tone: "a", width: 2.5 };
  const shown = j.alerts.filter((a) => a.t <= cursor);
  const real = j.real !== null && j.real <= cursor ? j.real : null;
  const mins = (v: number) => num(Math.abs(v), { style: "unit", unit: "minute", unitDisplay: "long" });
  const delay = real === null || j.delay === null ? s.none : j.delay > 0 ? s.late(mins(j.delay)) : j.delay < 0 ? s.early(mins(j.delay)) : s.onTime;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.mode} value={mode} options={(["stream", "batch"] as Mode[]).map((m) => [m, s.modes[m]] as const)} onChange={(m) => { setMode(m); setSeen((x) => ({ ...x, modes: new Set(x.modes).add(m) })); }} />
          {mode === "stream"
            ? <Slider label={s.window} value={w} min={1} max={30} onChange={(v) => { setW(v); setSeen((x) => ({ ...x, windows: new Set(x.windows).add(v) })); }} format={(v) => num(v)} />
            : <Slider label={s.every} value={b} min={5} max={60} step={5} onChange={setB} format={(v) => num(v)} />}
          <RunBar running={loop.running} onToggle={replay} runLabel={s.replay} />
          <Stats items={[
            { label: s.falseN, value: num(shown.filter((a) => a.false).length) }, { label: s.real, value: real === null ? s.none : s.at(num(real)) },
            { label: s.delay, value: delay }, { label: s.wake, value: num(mode === "stream" ? Math.min(cursor, MINUTES) : Math.floor(Math.min(cursor, MINUTES) / b)) },
          ]} />
        </div>
        <div className="stack">
          <Plot x={[0, MINUTES]} y={[1, 3]} height={260} ticks={6} yTicks={4} xFmt={(v) => (v >= MINUTES ? "" : num(v))} label={s.chart} xLabel={s.minutes} yLabel={s.metres}
            lines={[
              { points: [[0, LINE], [MINUTES, LINE]], tone: "c", dashed: true, width: 1.5 },
              { points: [[TRUE_CROSS, 1], [TRUE_CROSS, 3]], tone: "ink", dashed: true, width: 1 },
              ...(cursor < MINUTES ? [{ points: [[cursor, 1], [cursor, 3]] as const, tone: "muted" as const, width: 1 }] : []),
              watch,
            ]}
            dots={[
              ...xs.flatMap((v, t) => upto(t, { x: t, y: Math.min(3, v), r: 2, tone: "muted" as const })),
              ...shown.map((a) => ({ x: a.t, y: 2.88, r: 6, shape: "triangle" as const, tone: a.false ? "c" as const : "ink" as const, ring: a.false })),
            ]} />
          <p className="lb-note">{s.legend}</p>
        </div>
      </div>
    </LabShell>
  );
}
