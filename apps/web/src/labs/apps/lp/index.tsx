import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { Formula } from "../../kit/Formula";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { best, BOX, fits, LIMITS, PRICES, profit, profitLine, r1, region, tight, type Limit, type P } from "./model";

const S = {
  en: {
    intro: "The school garden has room for tomato beds (x) and bean beds (y). Three limits: land, water and the hours pupils can work. Every plan that keeps all three is in the shaded area. Which plan earns the most?",
    limitsH: "The limits", profitH: "The goal",
    lim: { land: "Land: beds in the garden", water: "Water: cans a day", hours: "Hours: pupils' work a week" } as Record<Limit["id"], string>,
    short: { land: "land", water: "water", hours: "hours" } as Record<Limit["id"], string>,
    xy: "x = tomato beds, y = bean beds", profit: "profit",
    tomato: "Price of a bed of tomatoes", bean: "Price of a bed of beans", hoursMax: "Hours pupils can work a week", aim: "Profit to aim for (the dashed line)",
    map: "The garden plans: shaded = every limit kept; the dashed line is every plan with the profit you aim for; rings are the corners", xAxis: "tomato beds (x)", yAxis: "bean beds (y)",
    reach: (v: string) => `Some plans earn ${v}: the dashed line still crosses the shaded area. Aim higher.`,
    top: (v: string, x: string, y: string) => `${v} is the most any plan earns: the line only touches the corner (${x}, ${y}): ${x} tomato beds and ${y} bean beds.`,
    beyond: (v: string) => `No plan earns ${v}: the dashed line has left the shaded area.`,
    jump: "Jump to the best", tap: "Tap the drawing to try a plan of your own.",
    trial: (x: string, y: string) => `Your plan: ${x} tomato beds and ${y} bean beds.`,
    ok: (v: string) => `It keeps every limit and earns ${v}.`, breaks: (what: string) => `It breaks the ${what} limit.`, and: " and the ",
    sep: ", ", pt: (x: string, y: string) => `(${x}, ${y})`,
    corners: "Corners", bestAt: "Best corner", bestVal: "Best profit", tightH: (a: string) => `Limits used up at the best corner: ${a}.`,
    try1: "Drag “Profit to aim for” up, slowly. The dashed line slides up the shaded area; the last point it touches is a corner, (3, 5), earning 290.",
    try2: "Raise the price of tomatoes to 50 and press “Jump to the best”: the best plan jumps to another corner, (6, 2). The plans didn't change, only what you value.",
    try3: "Set the pupils' hours to 24: the hours line moves out and stops mattering, so the corners change. Tap a point inside the shaded area: it fits but earns less than the best corner.",
    takeaway: "This is a linear program: a straight-line goal and straight-line limits. The best answer is always at a corner, so the simplex method (in every optimisation solver) walks from corner to corner instead of trying every plan.",
  },
  ar: {
    intro: "في حديقة المدرسة مكان لأحواض الطماطم (x) وأحواض الفاصولياء (y). وهناك ثلاثة قيود: الأرض والماء والساعات التي يستطيع التلاميذ العمل فيها. كل خطة تحترم القيود الثلاثة تقع في المنطقة المظلّلة. فأيّ خطة تربح أكثر؟",
    limitsH: "القيود", profitH: "الهدف",
    lim: { land: "الأرض: الأحواض في الحديقة", water: "الماء: الدلاء في اليوم", hours: "الساعات: عمل التلاميذ في الأسبوع" } as Record<Limit["id"], string>,
    short: { land: "أرض", water: "ماء", hours: "ساعات" } as Record<Limit["id"], string>,
    xy: "x = أحواض الطماطم، y = أحواض الفاصولياء", profit: "الربح",
    tomato: "سعر حوض الطماطم", bean: "سعر حوض الفاصولياء", hoursMax: "ساعات عمل التلاميذ في الأسبوع", aim: "الربح المطلوب (الخط المتقطّع)",
    map: "خطط الحديقة: المظلّل = كل القيود محترمة، والخط المتقطّع كل الخطط التي تعطي الربح المطلوب، والحلقات هي الزوايا", xAxis: "أحواض الطماطم (x)", yAxis: "أحواض الفاصولياء (y)",
    reach: (v: string) => `بعض الخطط تربح ${v}: ما زال الخط المتقطّع يعبر المنطقة المظلّلة. اطلب أكثر.`,
    top: (v: string, x: string, y: string) => `${v} أكبر ربح تحقّقه أي خطة: الخط يلمس الزاوية (${x}، ${y}) فقط، أي ${x} من أحواض الطماطم و${y} من أحواض الفاصولياء.`,
    beyond: (v: string) => `لا توجد خطة تربح ${v}: خرج الخط المتقطّع من المنطقة المظلّلة.`,
    jump: "انتقل إلى الأفضل", tap: "المس الرسم لتجرّب خطة من عندك.",
    trial: (x: string, y: string) => `خطتك: ${x} من أحواض الطماطم و${y} من أحواض الفاصولياء.`,
    ok: (v: string) => `تحترم كل القيود وتربح ${v}.`, breaks: (what: string) => `تخالف قيد ${what}.`, and: " وقيد ",
    sep: "، ", pt: (x: string, y: string) => `(${x}، ${y})`,
    corners: "الزوايا", bestAt: "أفضل زاوية", bestVal: "أكبر ربح", tightH: (a: string) => `القيود المستنفدة عند أفضل زاوية: ${a}.`,
    try1: "اسحب «الربح المطلوب» إلى الأعلى ببطء. ينزلق الخط المتقطّع فوق المنطقة المظلّلة، وآخر نقطة يلمسها زاوية: (٣، ٥)، وربحها ٢٩٠.",
    try2: "ارفع سعر الطماطم إلى ٥٠ واضغط «انتقل إلى الأفضل»: تقفز أفضل خطة إلى زاوية أخرى، (٦، ٢). لم تتغيّر الخطط، بل تغيّر ما تقدّره.",
    try3: "اجعل ساعات التلاميذ ٢٤: يبتعد خط الساعات ولا يعود مؤثّرًا، فتتغيّر الزوايا. ثم المس نقطة داخل المنطقة المظلّلة: تصلح، لكنها تربح أقل من أفضل زاوية.",
    takeaway: "هذا برنامج خطي: هدف على شكل خط مستقيم وقيود على شكل خطوط مستقيمة. وأفضل إجابة تقع دائمًا في زاوية، ولذلك تمشي طريقة السمبلكس (الموجودة في كل برامج التحسين) من زاوية إلى زاوية بدل أن تجرّب كل الخطط.",
  },
};

export default function Lp({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [px, setPx] = useState(PRICES.x);
  const [py, setPy] = useState(PRICES.y);
  const [hours, setHours] = useState(18);
  const [level, setLevel] = useState(120);
  const [trial, setTrial] = useState<P | null>(null);
  const limits = useMemo(() => LIMITS.map((l) => (l.id === "hours" ? { ...l, max: hours } : l)), [hours]);
  const poly = useMemo(() => region(limits), [limits]);
  const b = useMemo(() => best(limits, px, py), [limits, px, py]);
  const top = Math.max(100, Math.ceil((b.value * 1.4) / 10) * 10);
  const atTop = Math.abs(level - b.value) < 0.5, over = level > b.value + 0.5;
  const [reached, setReached] = useState(0);
  useEffect(() => { if (atTop) setReached((n) => n + 1); }, [atTop, b.value]);
  useEffect(() => { if (reached >= 2) onDone?.(); }, [reached >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const n1 = (v: number) => num(r1(v));
  const line = profitLine(px, py, level);
  const trialBreaks = trial ? limits.filter((l) => l.a * trial[0] + l.b * trial[1] > l.max + 1e-7).map((l) => s.short[l.id]) : [];
  const t = tight(b.at, limits).map((id) => s.short[id as Limit["id"]]);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, BOX]} y={[0, BOX]} ticks={5} height={300} label={s.map} xLabel={s.xAxis} yLabel={s.yAxis}
            onPick={(x, y) => setTrial([Math.round(x * 2) / 2, Math.round(y * 2) / 2])}
            dots={[
              ...poly.map(([x, y]) => ({ x, y, r: 5, tone: "ink" as const, ring: true })),
              ...(atTop || over ? [{ x: b.at[0], y: b.at[1], r: 8, tone: "b" as const }] : []),
              ...(trial ? [{ x: trial[0], y: trial[1], r: 6, tone: (fits(trial, limits) ? "a" : "c") as "a" | "c", shape: "square" as const }] : []),
            ]}>
            {({ px: X, py: Y }) => <>
              {poly.length > 2 && <polygon points={poly.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} className="lb-lp-region" />}
              {/* Drawn over the region (Plot's own lines would sit under it). */}
              {limits.map((l) => { const e = profitLine(l.a, l.b, l.max); return e.length ? <line key={l.id} x1={X(e[0][0])} y1={Y(e[0][1])} x2={X(e[1][0])} y2={Y(e[1][1])} className="lb-plot-line lb-tone-muted" strokeWidth={2} /> : null; })}
              {line.length > 0 && <line x1={X(line[0][0])} y1={Y(line[0][1])} x2={X(line[1][0])} y2={Y(line[1][1])} className={`lb-plot-line lb-tone-${over ? "c" : "b"}`} strokeWidth={3} strokeDasharray="7 5" />}
              {limits.map((l) => { const e = profitLine(l.a, l.b, l.max); if (!e.length) return null; const [a, c] = e, lx = a[0] + (c[0] - a[0]) * 0.12, ly = a[1] + (c[1] - a[1]) * 0.12; return <text key={l.id} x={X(lx) + 4} y={Y(ly) - 4} className="lb-plot-label">{s.short[l.id]}</text>; })}
            </>}
          </Plot>
          <p className="lb-note">{s.map}</p>
          <p className="lb-note">{s.tap}</p>
          {trial && <p className={fits(trial, limits) ? "lb-verdict" : "lb-verdict is-warn"} aria-live="polite">{s.trial(n1(trial[0]), n1(trial[1]))} {fits(trial, limits) ? s.ok(num(r1(profit(trial, px, py)))) : s.breaks(trialBreaks.join(s.and))}</p>}
        </div>
        <div className="stack">
          <h3 className="lb-h">{s.limitsH}</h3>
          {limits.map((l) => <div key={l.id}><span className="dr-field-label">{s.lim[l.id]}</span><Formula parts={[...(l.a === 1 ? ["x"] : [num(l.a), "×", "x"]), "+", ...(l.b === 1 ? ["y"] : [num(l.b), "×", "y"]), "≤", num(l.max)]} /></div>)}
          <p className="lb-note">{s.xy}</p>
          <Slider label={s.hoursMax} value={hours} min={12} max={24} onChange={(v) => { setHours(v); setTrial(null); }} format={(v) => num(v)} />
          <h3 className="lb-h">{s.profitH}</h3>
          <Formula parts={[s.profit, "=", num(px), "×", "x", "+", num(py), "×", "y"]} />
          <Slider label={s.tomato} value={px} min={10} max={60} step={5} onChange={setPx} format={(v) => num(v)} />
          <Slider label={s.bean} value={py} min={10} max={60} step={5} onChange={setPy} format={(v) => num(v)} />
          <Slider label={s.aim} value={Math.min(level, top)} min={0} max={top} step={10} onChange={setLevel} format={(v) => num(v)} />
          <div className="lb-row"><Button size="sm" variant="secondary" icon="target" onClick={() => setLevel(r1(b.value))}>{s.jump}</Button></div>
          <p className={over ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{atTop ? s.top(num(r1(b.value)), n1(b.at[0]), n1(b.at[1])) : over ? s.beyond(num(level)) : s.reach(num(level))}</p>
          {(atTop || over) && <>
            <Stats items={[{ label: s.bestAt, value: s.pt(n1(b.at[0]), n1(b.at[1])) }, { label: s.bestVal, value: num(r1(b.value)) }, { label: s.corners, value: num(poly.length) }]} />
            {!!t.length && <p className="lb-note">{s.tightH(t.join(s.sep))}</p>}
          </>}
        </div>
      </div>
    </LabShell>
  );
}
