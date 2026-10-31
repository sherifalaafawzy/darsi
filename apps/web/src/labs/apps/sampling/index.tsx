import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { meanOf, population, sampleMeans, sdOf } from "./model";

const S = {
  en: {
    intro: "The school has 400 pupils. We want the average journey time, but we can only ask a sample. Each dot is one survey's answer; the line is the true average.",
    size: "Pupils in each sample", how: "How we choose", random: "At random", gate: "Only near the gate", more: "Run 10 more surveys",
    chart: "The answers of many surveys (dots) and the true average (line)", truth: "True average (minutes)", avg: "Average of the surveys", wobble: "Typical wobble (minutes)",
    biased: "Every survey is too low: pupils near the gate live close. More surveys or bigger samples cannot fix a biased way of choosing.",
    fair: "The surveys scatter around the true average. Bigger samples scatter less.",
    try1: "Set the sample to 5 pupils and run more surveys: answers jump around a lot. Now try 80: they bunch close to the line.",
    try2: "Choose Only near the gate: every survey lands far below the true average, however big the sample.",
    try3: "Compare the typical wobble at 10 and at 40 pupils: four times the pupils roughly halves the wobble.",
    takeaway: "A random sample gives an answer close to the truth, with a wobble you can measure; a biased sample can be confidently wrong.",
  },
  ar: {
    intro: "في المدرسة ٤٠٠ تلميذ. نريد متوسط زمن الوصول، لكننا نستطيع سؤال عيّنة فقط. كل نقطة نتيجة استبيان واحد، والخط هو المتوسط الحقيقي.",
    size: "عدد التلاميذ في كل عيّنة", how: "طريقة الاختيار", random: "عشوائيًا", gate: "قرب البوابة فقط", more: "أجرِ ١٠ استبيانات أخرى",
    chart: "نتائج استبيانات كثيرة (نقاط) والمتوسط الحقيقي (خط)", truth: "المتوسط الحقيقي (دقائق)", avg: "متوسط الاستبيانات", wobble: "التأرجح المعتاد (دقائق)",
    biased: "كل استبيان أقل من الحقيقة: التلاميذ قرب البوابة يسكنون قريبًا. لا تُصلح الاستبيانات الأكثر ولا العيّنات الأكبر طريقة اختيار متحيّزة.",
    fair: "تتوزع الاستبيانات حول المتوسط الحقيقي، والعيّنات الأكبر تتشتت أقل.",
    try1: "اجعل العيّنة خمسة تلاميذ وأجرِ استبيانات أكثر: تقفز النتائج كثيرًا. جرّب الآن ثمانين: تتجمع قرب الخط.",
    try2: "اختر «قرب البوابة فقط»: كل استبيان يقع أقل بكثير من المتوسط الحقيقي مهما كبرت العيّنة.",
    try3: "قارن التأرجح المعتاد عند عشرة تلاميذ وعند أربعين: أربعة أضعاف التلاميذ تقلّل التأرجح إلى النصف تقريبًا.",
    takeaway: "العيّنة العشوائية تعطي نتيجة قريبة من الحقيقة بتأرجح يمكن قياسه، أما العيّنة المتحيّزة فقد تكون مخطئة بثقة.",
  },
};

export default function Sampling({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const pop = useMemo(() => population(), []);
  const truth = meanOf(pop.map((p) => p.minutes));
  const [n, setN] = useState(10);
  const [biased, setBiased] = useState(false);
  const [k, setK] = useState(20);
  const means = useMemo(() => sampleMeans(pop, n, k, biased), [pop, n, k, biased]);
  useEffect(() => { if (biased && k >= 30) onDone?.(); }, [biased, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const r1 = (v: number) => num(Math.round(v * 10) / 10);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => setK(20)}>
      <div className="lb-two">
        <Plot x={[0, k + 1]} y={[0, 50]} height={260} ticks={0} yTicks={5} label={s.chart}
          lines={[{ points: [[0, truth], [k + 1, truth]], tone: "ink", width: 3 }]}
          dots={means.map((m, i) => ({ x: i + 1, y: m, tone: biased ? ("b" as const) : ("a" as const), r: 4.5 }))} />
        <div className="stack">
          <Slider label={s.size} value={n} min={5} max={80} step={5} format={(v) => num(v)} onChange={setN} />
          <Segmented label={s.how} value={biased ? 1 : 0} options={[[0, s.random], [1, s.gate]]} onChange={(v) => setBiased(v === 1)} />
          <Button size="sm" variant="secondary" onClick={() => setK(Math.min(200, k + 10))}>{s.more}</Button>
          <Stats items={[{ label: s.truth, value: r1(truth) }, { label: s.avg, value: r1(meanOf(means)) }, { label: s.wobble, value: r1(sdOf(means)) }]} />
          <p className={biased ? "notice err" : "notice"} role="status">{biased ? s.biased : s.fair}</p>
        </div>
      </div>
    </LabShell>
  );
}
