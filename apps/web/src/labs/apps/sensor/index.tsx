import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { alerts, END, mistakes, readings, smooth, START, truth } from "./model";

const S = {
  en: {
    intro: "A thermometer in the classroom turns the fan on when it passes the threshold. The dashed line is the real temperature; dots are what the sensor reads. Make it cheaper, more careful or quicker, and watch the mistakes.",
    chart: "Temperature through the school day: real (dashed), readings (dots), smoothed (line), threshold (flat line)", time: "time of day", temp: "°C",
    every: "Read every", min: (n: string) => `${n} min`, noise: "Sensor quality", good: "Good", cheap: "Cheap", awful: "Very noisy",
    smooth: "Average the last", readingsN: (n: string, c: number) => `${n} ${c === 1 ? "reading" : "readings"}`, threshold: "Fan on above",
    perDay: "Readings a day", falseAlerts: "False alarms", missed: "Minutes too hot, fan off", fanOn: (t: string) => `Fan switched on at ${t}`, never: "The fan never switched on.",
    takeaway: "Every sensor reading is a little wrong. Reading more often costs battery and data; averaging hides noise but reacts later. Good IoT design balances the three for the job: a fan can wait a few minutes, a gas alarm cannot.",
  },
  ar: {
    intro: "ميزان حرارة في الصف يشغّل المروحة حين تتجاوز الحرارة العتبة. الخط المتقطع هو الحرارة الحقيقية، والنقاط ما يقرؤه المستشعر. اجعله أرخص أو أكثر دقة أو أسرع، وراقب الأخطاء.",
    chart: "الحرارة خلال اليوم الدراسي: الحقيقية (متقطع)، والقراءات (نقاط)، والمنعّمة (خط)، والعتبة (خط أفقي)", time: "الوقت", temp: "°س",
    every: "اقرأ كل", min: (n: string) => `${n} دقيقة`, noise: "جودة المستشعر", good: "جيد", cheap: "رخيص", awful: "كثير التشويش",
    smooth: "خذ متوسط آخر", readingsN: (n: string, c: number) => (c === 1 ? "قراءة واحدة" : c === 2 ? "قراءتين" : `${n} قراءات`), threshold: "شغّل المروحة فوق",
    perDay: "القراءات في اليوم", falseAlerts: "إنذارات كاذبة", missed: "دقائق حر والمروحة متوقفة", fanOn: (t: string) => `اشتغلت المروحة الساعة ${t}`, never: "لم تشتغل المروحة أبدًا.",
    takeaway: "كل قراءة مستشعر فيها خطأ صغير. القراءة الأكثر تكرارًا تكلّف بطارية وبيانات، والمتوسط يخفي التشويش لكنه يتأخر في الاستجابة. والتصميم الجيد لإنترنت الأشياء يوازن بين الثلاثة بحسب المهمة: المروحة تحتمل الانتظار دقائق، أما إنذار الغاز فلا.",
  },
};

export default function Sensor({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const [every, setEvery] = useState(5);
  const [noise, setNoise] = useState(0.8);
  const [win, setWin] = useState(1);
  const [th, setTh] = useState(30);
  const [moves, setMoves] = useState(0);
  const raw = useMemo(() => readings(every, noise), [every, noise]);
  const sm = useMemo(() => smooth(raw, win), [raw, win]);
  const on = alerts(sm, th), m = mistakes(sm, th);
  const touch = () => setMoves((x) => x + 1);
  useEffect(() => { if (moves >= 4) onDone?.(); }, [moves >= 4]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = (t: number) => `${num(Math.floor(t / 60))}:${num(t % 60, { minimumIntegerDigits: 2 })}`;
  const real = Array.from({ length: (END - START) / 5 + 1 }, (_, i) => [START + i * 5, truth(START + i * 5)] as const);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Plot x={[START, END]} y={[20, 36]} height={240} label={s.chart} xLabel={s.time} yLabel={s.temp} xFmt={(v) => clock(Math.round(v))} yFmt={(v) => num(Math.round(v))}
        lines={[{ points: real, tone: "muted", dashed: true }, { points: sm.map((x) => [x.t, x.v] as const), tone: "b" }, { points: [[START, th], [END, th]], tone: "c", width: 1.5 }]}
        dots={raw.length <= 120 ? raw.map((x) => ({ x: x.t, y: x.v, r: 2.5, tone: "a" as const })) : []} />
      <p className="lb-note">{s.chart}</p>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.every} value={every} options={[1, 5, 15, 60].map((n) => [n, s.min(num(n))] as const)} onChange={(v) => { setEvery(v); touch(); }} />
          <Segmented label={s.noise} value={noise} options={[[0.3, s.good], [0.8, s.cheap], [1.6, s.awful]]} onChange={(v) => { setNoise(v); touch(); }} />
          <Segmented label={s.smooth} value={win} options={[1, 3, 6, 12].map((n) => [n, s.readingsN(num(n), n)] as const)} onChange={(v) => { setWin(v); touch(); }} />
          <Slider label={s.threshold} value={th} min={26} max={34} step={0.5} onChange={(v) => { setTh(v); touch(); }} format={(v) => `${num(v)}${s.temp}`} />
        </div>
        <div className="stack">
          <Stats items={[{ label: s.perDay, value: num(raw.length) }, { label: s.falseAlerts, value: num(m.falseAlerts) }, { label: s.missed, value: num(m.missed) }]} />
          <p className="lb-verdict" aria-live="polite">{on.length ? s.fanOn(on.map(clock).join(lang === "ar" ? "، " : ", ")) : s.never}</p>
        </div>
      </div>
    </LabShell>
  );
}
