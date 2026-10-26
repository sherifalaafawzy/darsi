import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { best, cases, confusion, cost, COST, roc, type Job } from "./model";

const S = {
  en: {
    intro: "A detector gives every case a score from 0 to 1. Above your threshold it sounds the alarm. No threshold is perfect, because some real and harmless cases score alike. Choose which mistakes you can live with.",
    job: "Detector", smoke: "Smoke alarm", spam: "Spam filter", t: "Threshold",
    real: { smoke: "real smoke", spam: "spam" } as Record<Job, string>, harmless: { smoke: "cooking steam", spam: "real email" } as Record<Job, string>,
    strip: "Every case by its score; filled circles are real, open squares harmless; the dashed line is the threshold (tap to move it)",
    alarm: "Alarm", noAlarm: "No alarm", caught: "Caught", missed: "Missed", falseAlarm: "False alarm", quiet: "Rightly quiet",
    costLine: (miss: string, fa: string, cm: string, cf: string, total: string) => `Cost of mistakes: ${miss} missed × ${cm} + ${fa} false alarms × ${cf} = ${total}`,
    why: { smoke: "A missed fire is far worse than an annoying false alarm, so a missed case costs 20 and a false alarm 1.", spam: "Hiding a real email (a false alarm) is worse than letting a spam through, so a false alarm costs 5 and a miss 1." } as Record<Job, string>,
    best: (t: string, c: string) => `Lowest cost: ${c}, at threshold ${t}.`, go: "Go to the best threshold",
    rocTitle: "ROC curve: real cases caught against harmless cases flagged, for every threshold (the ring is yours)", rocX: "harmless flagged", rocY: "real caught",
    takeaway: "Every detector, human or AI, trades false alarms for misses. The threshold is a choice about values, not maths: decide which mistake is worse for the people affected, then set it, and check it again as things change.",
  },
  ar: {
    intro: "يعطي الكاشف كل حالة درجة من ٠ إلى ١، وفوق العتبة التي تحدّدها يطلق الإنذار. لا توجد عتبة مثالية، لأن بعض الحالات الحقيقية وغير الضارة تحصل على درجات متقاربة. اختر الأخطاء التي تستطيع تقبّلها.",
    job: "الكاشف", smoke: "إنذار الدخان", spam: "مرشّح الرسائل المزعجة", t: "العتبة",
    real: { smoke: "دخان حقيقي", spam: "رسالة مزعجة" } as Record<Job, string>, harmless: { smoke: "بخار الطبخ", spam: "رسالة حقيقية" } as Record<Job, string>,
    strip: "كل حالة بحسب درجتها؛ الدوائر الممتلئة حقيقية والمربعات المفرغة غير ضارة، والخط المتقطع هو العتبة (المس لتحريكه)",
    alarm: "إنذار", noAlarm: "لا إنذار", caught: "اكتُشفت", missed: "فاتت", falseAlarm: "إنذار كاذب", quiet: "صمت صحيح",
    costLine: (miss: string, fa: string, cm: string, cf: string, total: string) => `كلفة الأخطاء: ${miss} فائتة × ${cm} + ${fa} إنذارات كاذبة × ${cf} = ${total}`,
    why: { smoke: "الحريق الفائت أسوأ بكثير من إنذار كاذب مزعج، لذلك كلفة الحالة الفائتة ٢٠ والإنذار الكاذب ١.", spam: "إخفاء رسالة حقيقية (إنذار كاذب) أسوأ من مرور رسالة مزعجة، لذلك كلفة الإنذار الكاذب ٥ والفائتة ١." } as Record<Job, string>,
    best: (t: string, c: string) => `أقل كلفة: ${c}، عند العتبة ${t}.`, go: "انتقل إلى أفضل عتبة",
    rocTitle: "منحنى ROC: الحالات الحقيقية المكتشفة مقابل الحالات غير الضارة المُنذَر بها، لكل عتبة (الحلقة هي عتبتك)", rocX: "غير الضارة المُنذَر بها", rocY: "الحقيقية المكتشفة",
    takeaway: "كل كاشف، إنسانًا كان أو ذكاءً اصطناعيًا، يقايض الإنذارات الكاذبة بالحالات الفائتة. والعتبة اختيار قيمي لا حسابي: قرّر أي الخطأين أسوأ على الناس المتأثرين، ثم اضبطها، وراجعها كلما تغيّرت الأمور.",
  },
};

export default function Threshold({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [job, setJob] = useState<Job>("smoke");
  const [t, setT] = useState(0.5);
  const [tried, setTried] = useState(() => new Set<Job>());
  const cs = useMemo(() => cases(job), [job]);
  const curve = useMemo(() => roc(cs), [cs]);
  const m = confusion(cs, t), c = cost(job, m), bt = best(job, cs), bc = cost(job, confusion(cs, bt));
  const fpr = m.falseAlarm / Math.max(1, m.falseAlarm + m.quiet), tpr = m.hit / Math.max(1, m.hit + m.miss);
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const touch = (v: number) => { setT(Math.round(v * 100) / 100); setTried((x) => new Set(x).add(job)); };
  useEffect(() => { if (tried.size >= 2) onDone?.(); }, [tried.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.job} value={job} options={[["smoke", s.smoke], ["spam", s.spam]]} onChange={(v) => { setJob(v); setT(0.5); }} />
      <p className="lb-note">{s.why[job]}</p>
      <Plot x={[0, 1]} y={[0, 1]} height={170} ticks={4} label={s.strip} onPick={(x) => touch(x)}
        dots={cs.map((cc, i) => ({ x: cc.score, y: (cc.real ? 0.72 : 0.28) + (((i * 37) % 11) - 5) * 0.025, r: 5, tone: cc.real ? "b" as const : "a" as const, shape: cc.real ? "circle" as const : "square" as const, ring: !cc.real }))}
        lines={[{ points: [[t, 0], [t, 1]], tone: "ink", dashed: true }]}>
        {({ px, py }) => <>
          <text x={px(0.01)} y={py(0.93)} className="lb-plot-label">{s.real[job]}</text>
          <text x={px(0.01)} y={py(0.05)} className="lb-plot-label">{s.harmless[job]}</text>
        </>}
      </Plot>
      <p className="lb-note">{s.strip}</p>
      <Slider label={s.t} value={t} min={0} max={1} step={0.01} onChange={touch} format={n2} />
      <div className="lb-two">
        <div className="stack">
          <table className="lb-table lb-confusion">
            <thead><tr><th /><th>{s.alarm}</th><th>{s.noAlarm}</th></tr></thead>
            <tbody>
              <tr><th>{s.real[job]}</th><td className="lb-ok">{s.caught} {num(m.hit)}</td><td className="lb-no">{s.missed} {num(m.miss)}</td></tr>
              <tr><th>{s.harmless[job]}</th><td className="lb-no">{s.falseAlarm} {num(m.falseAlarm)}</td><td className="lb-ok">{s.quiet} {num(m.quiet)}</td></tr>
            </tbody>
          </table>
          <p className="lb-verdict" aria-live="polite">{s.costLine(num(m.miss), num(m.falseAlarm), num(COST[job].miss), num(COST[job].falseAlarm), num(c))}</p>
          <p className="lb-note">{s.best(n2(bt), num(bc))}</p>
          <div className="lb-row"><Button size="sm" variant="secondary" disabled={t === bt} onClick={() => touch(bt)}>{s.go}</Button></div>
        </div>
        <div className="stack">
          <Plot x={[0, 1]} y={[0, 1]} height={220} label={s.rocTitle} xLabel={s.rocX} yLabel={s.rocY}
            lines={[{ points: [[0, 0], [1, 1]], tone: "muted", dashed: true, width: 1 }, { points: curve, tone: "b" }]} dots={[{ x: fpr, y: tpr, r: 7, ring: true, tone: "ink" }]} />
        </div>
      </div>
    </LabShell>
  );
}
