import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { END, RULES, simulate, START, STEP, type Rules } from "./model";

const S = {
  en: {
    intro: "Every five minutes the classroom's controller checks its sensors and runs your rules. Change the rules and the whole school day replays: is the class comfortable, and how much electricity does it use?",
    fanRule: "IF the temperature is above", fanThen: "THEN turn the fan on", lightRule: "IF the daylight is below", lightThen: "THEN turn the lights on", onlyIn: "only while a class is in",
    winRule: "IF the CO₂ (stale air) is above", winThen: "THEN open the window", use: "Use this rule", unitC: "°C", unitLux: "lux", unitPpm: "ppm",
    timeline: "The school day: when a class is in and when each device is on", rows: { occupied: "Class in", fan: "Fan", lights: "Lights", window: "Window open" },
    energy: "Electricity used", kwh: (n: string) => `${n} kWh`, hot: "Minutes too hot", dark: "Minutes too dark", stuffy: "Minutes of stale air", during: "(counted only while a class is in)",
    takeaway: "Automation is rules plus sensors. Good rules use the right sensor, a sensible threshold and conditions like “only when someone is there”. Every rule trades comfort, energy and cost, and someone has to choose that balance.",
  },
  ar: {
    intro: "كل خمس دقائق يفحص متحكّم الصف مستشعراته وينفّذ قواعدك. غيّر القواعد فيُعاد اليوم الدراسي كله: هل الصف مريح، وكم يستهلك من الكهرباء؟",
    fanRule: "إذا تجاوزت الحرارة", fanThen: "فشغّل المروحة", lightRule: "إذا قلّ ضوء النهار عن", lightThen: "فشغّل الأضواء", onlyIn: "فقط حين يكون في الصف تلاميذ",
    winRule: "إذا تجاوز ثاني أكسيد الكربون (الهواء الفاسد)", winThen: "فافتح النافذة", use: "فعّل هذه القاعدة", unitC: "°س", unitLux: "لكس", unitPpm: "جزء في المليون",
    timeline: "اليوم الدراسي: متى يكون في الصف تلاميذ ومتى يعمل كل جهاز", rows: { occupied: "الصف مشغول", fan: "المروحة", lights: "الأضواء", window: "النافذة مفتوحة" },
    energy: "الكهرباء المستهلكة", kwh: (n: string) => `${n} كيلوواط ساعة`, hot: "دقائق حرّ", dark: "دقائق إضاءة ضعيفة", stuffy: "دقائق هواء فاسد", during: "(تُحسب فقط حين يكون في الصف تلاميذ)",
    takeaway: "الأتمتة قواعد ومستشعرات. والقواعد الجيدة تستعمل المستشعر المناسب وعتبة معقولة وشروطًا مثل «فقط حين يوجد أحد». وكل قاعدة تقايض بين الراحة والطاقة والكلفة، ولا بد أن يختار أحدٌ هذا التوازن.",
  },
};
type Row = "occupied" | "fan" | "lights" | "window";
const ROWS: Row[] = ["occupied", "fan", "lights", "window"];

export default function RulesLab({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [r, setR] = useState<Rules>(RULES);
  const [moves, setMoves] = useState(0);
  const sim = useMemo(() => simulate(r), [r]);
  const set = (next: Rules) => { setR(next); setMoves((m) => m + 1); };
  useEffect(() => { if (moves >= 3) onDone?.(); }, [moves >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const W = 320, LABEL = 84, x = (t: number) => LABEL + ((t - START) / (END - START)) * (W - LABEL - 4);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-rules">
        <div className="lb-rule">
          <label className="lb-check"><input type="checkbox" checked={r.fan.on} onChange={(e) => set({ ...r, fan: { ...r.fan, on: e.target.checked } })} /> {s.use}</label>
          <Slider label={s.fanRule} value={r.fan.above} min={24} max={32} step={0.5} disabled={!r.fan.on} onChange={(v) => set({ ...r, fan: { ...r.fan, above: v } })} format={(v) => `${num(v)} ${s.unitC}`} />
          <strong>{s.fanThen}</strong>
        </div>
        <div className="lb-rule">
          <label className="lb-check"><input type="checkbox" checked={r.lights.on} onChange={(e) => set({ ...r, lights: { ...r.lights, on: e.target.checked } })} /> {s.use}</label>
          <Slider label={s.lightRule} value={r.lights.below} min={100} max={600} step={50} disabled={!r.lights.on} onChange={(v) => set({ ...r, lights: { ...r.lights, below: v } })} format={(v) => `${num(v)} ${s.unitLux}`} />
          <label className="lb-check"><input type="checkbox" checked={r.lights.onlyIfOccupied} disabled={!r.lights.on} onChange={(e) => set({ ...r, lights: { ...r.lights, onlyIfOccupied: e.target.checked } })} /> {s.onlyIn}</label>
          <strong>{s.lightThen}</strong>
        </div>
        <div className="lb-rule">
          <label className="lb-check"><input type="checkbox" checked={r.window.on} onChange={(e) => set({ ...r, window: { ...r.window, on: e.target.checked } })} /> {s.use}</label>
          <Slider label={s.winRule} value={r.window.above} min={600} max={2000} step={100} disabled={!r.window.on} onChange={(v) => set({ ...r, window: { ...r.window, above: v } })} format={(v) => `${num(v)} ${s.unitPpm}`} />
          <strong>{s.winThen}</strong>
        </div>
      </div>
      <figure className="lb-plot" dir="ltr">
        <svg viewBox={`0 0 ${W} ${ROWS.length * 26 + 24}`} role="img" aria-label={s.timeline} className="lb-plot-svg">
          {ROWS.map((row, i) => (
            <g key={row}>
              <text x={0} y={i * 26 + 17} className="lb-plot-label is-on">{s.rows[row]}</text>
              <rect x={LABEL} y={i * 26 + 4} width={W - LABEL - 4} height={18} className="lb-plot-bg" />
              {sim.steps.filter((m) => m[row]).map((m) => <rect key={m.t} x={x(m.t)} y={i * 26 + 4} width={x(m.t + STEP) - x(m.t) + 0.5} height={18} className={`lb-tl lb-tl-${row}`} />)}
            </g>
          ))}
          {[7, 9, 11, 13, 15].map((h) => <text key={h} x={x(h * 60)} y={ROWS.length * 26 + 18} textAnchor="middle" className="lb-plot-tick">{`${num(h)}:${num(0, { minimumIntegerDigits: 2 })}`}</text>)}
        </svg>
      </figure>
      <p className="lb-note">{s.timeline}</p>
      <Stats items={[{ label: s.energy, value: s.kwh(num(Math.round(sim.energy * 100) / 100)) }, { label: s.hot, value: num(sim.hot) }, { label: s.dark, value: num(sim.dark) }, { label: s.stuffy, value: num(sim.stuffy) }]} />
      <p className="lb-note">{s.during}</p>
    </LabShell>
  );
}
