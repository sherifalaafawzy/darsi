import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { best, CAPACITY, greedy, ITEMS, MAX_CAPACITY, value, weight } from "./model";

const S = {
  en: {
    intro: "A small truck takes supplies to a village school, but it can't carry everything. Each load has a weight and points for how much the school needs it. Which loads give the most points without going over the limit?",
    item: { solar: "Solar panels", desks: "Desks", books: "Books", filter: "Water filter", balls: "Footballs", chalk: "Chalk and paper" } as Record<string, string>,
    kg: (n: string) => `${n} kg`, pts: { one: "{n} point", other: "{n} points" } as Forms, per: (n: string) => `${n} points per 100 kg`, list: ", ",
    cap: "The truck can carry", of: (a: string, b: string) => `${a} of ${b}`, tap: "Tap loads to put them on the truck yourself.", load: "On the truck", over: (n: string) => `Too heavy by ${n}: take something off.`,
    method: "Method", weight: "Weight", value: "Points", you: "Your load", greedy: "Greedy", best: "Best (dynamic programming)",
    packG: "Pack greedily", showB: "Show the best load", clear: "Empty the truck",
    gTitle: "Greedy: best points per kilo first", took: "loaded", skip: "no room",
    gWrong: (n: string) => `Greedy is ${n} short of the best here: the solar panels' high value per kilo used space that two other loads fill better.`, gRight: "Here greedy finds the best load too. It often does, but not always.",
    youBest: "Your load is as good as the best!", youShort: (n: string) => `The best load has ${n} more.`,
    dp: "How dynamic programming finds the best: each cell is the most points with the first loads and that much room. A cell is the better of skipping the load (the cell above) or taking it (its points plus the cell above, its weight to the left). Outlined cells trace the best load back.",
    room: "Room (100 kg)", none: "No loads",
    try1: "Press “Pack greedily”: solar panels first (7 points per 100 kg), then whatever still fits: 60 points. Then press “Show the best load”: desks and books, 65 points.",
    try2: "Move the truck's limit to 1,100 kg and 1,600 kg and compare again: at most sizes greedy is right, but there is no promise.",
    try3: "Open the table under the results and follow the outlined cells from the bottom-right corner: each step either skips a load or takes it.",
    takeaway: "Greedy rules are fast and often good, but a choice that looks best now can block a better whole. Dynamic programming is exact: it solves every smaller truck first and builds on those answers. Solvers mix both ideas.",
  },
  ar: {
    intro: "تنقل شاحنة صغيرة لوازم إلى مدرسة القرية، لكنها لا تستطيع حمل كل شيء. لكل حمولة وزن ونقاط تبيّن مدى حاجة المدرسة إليها. فأيّ الحمولات تعطي أكثر النقاط دون تجاوز الحد؟",
    item: { solar: "ألواح شمسية", desks: "مقاعد دراسية", books: "كتب", filter: "مرشّح ماء", balls: "كرات قدم", chalk: "طباشير وورق" } as Record<string, string>,
    kg: (n: string) => `${n} كغ`, pts: { one: "نقطة واحدة", two: "نقطتان", few: "{n} نقاط", many: "{n} نقطة", other: "{n} نقطة" } as Forms, per: (n: string) => `${n} من النقاط لكل ١٠٠ كغ`, list: "، ",
    cap: "تستطيع الشاحنة حمل", of: (a: string, b: string) => `${a} من ${b}`, tap: "المس الحمولات لتضعها على الشاحنة بنفسك.", load: "على الشاحنة", over: (n: string) => `أثقل من اللازم بـ ${n}: أنزِل شيئًا.`,
    method: "الطريقة", weight: "الوزن", value: "النقاط", you: "حمولتك", greedy: "الطريقة الجشعة", best: "الأفضل (البرمجة الديناميكية)",
    packG: "عبّئ بالطريقة الجشعة", showB: "اعرض أفضل حمولة", clear: "أفرغ الشاحنة",
    gTitle: "الطريقة الجشعة: الأكثر نقاطًا لكل كيلوغرام أولًا", took: "حُمِّلت", skip: "لا مكان",
    gWrong: (n: string) => `تنقص الطريقة الجشعة هنا ${n} عن الأفضل: القيمة العالية للألواح الشمسية لكل كيلوغرام شغلت مكانًا تملؤه حمولتان أخريان بشكل أفضل.`, gRight: "هنا تجد الطريقة الجشعة أفضل حمولة أيضًا. يحدث ذلك كثيرًا، لكن ليس دائمًا.",
    youBest: "حمولتك جيدة كأفضل حمولة!", youShort: (n: string) => `أفضل حمولة تزيد عليها ${n}.`,
    dp: "كيف تجد البرمجة الديناميكية الأفضل: كل خانة هي أكثر النقاط بالحمولات الأولى وبهذا القدر من المكان. والخانة هي الأفضل بين تخطّي الحمولة (الخانة التي فوقها) أو أخذها (نقاطها مع الخانة التي فوقها بعد طرح وزنها). والخانات المحاطة تتتبّع أفضل حمولة رجوعًا.",
    room: "المكان (١٠٠ كغ)", none: "لا حمولات",
    try1: "اضغط «عبّئ بالطريقة الجشعة»: الألواح الشمسية أولًا (٧ نقاط لكل ١٠٠ كغ)، ثم ما يتّسع بعدها: ٦٠ نقطة. ثم اضغط «اعرض أفضل حمولة»: المقاعد والكتب، ٦٥ نقطة.",
    try2: "اجعل حدّ الشاحنة ١٬١٠٠ كغ ثم ١٬٦٠٠ كغ وقارن من جديد: في أغلب الأحجام تصيب الطريقة الجشعة، لكن لا ضمان لذلك.",
    try3: "افتح الجدول تحت النتائج واتبع الخانات المحاطة من الزاوية السفلى: كل خطوة إمّا تتخطّى حمولة وإمّا تأخذها.",
    takeaway: "القواعد الجشعة سريعة وجيدة غالبًا، لكن الخيار الذي يبدو الأفضل الآن قد يسدّ الطريق أمام كلٍّ أفضل. أما البرمجة الديناميكية فدقيقة: تحلّ كل شاحنة أصغر أولًا وتبني على تلك الإجابات. وبرامج الحل تمزج الفكرتين.",
  },
};

export default function Knapsack({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const pts = (n: number) => count(n, s.pts);
  const [cap, setCap] = useState(CAPACITY);
  const [pick, setPick] = useState<Set<string>>(() => new Set());
  const [showG, setShowG] = useState(false);
  const [showB, setShowB] = useState(false);
  const g = useMemo(() => greedy(ITEMS, cap), [cap]);
  const b = useMemo(() => best(ITEMS, cap), [cap]);
  useEffect(() => { if (showG && showB) onDone?.(); }, [showG && showB]); // eslint-disable-line react-hooks/exhaustive-deps
  const kg = (w: number) => s.kg(num(w * 100));
  const w = weight(ITEMS, pick), v = value(ITEMS, pick), gv = value(ITEMS, g.pick);
  const names = (p: ReadonlySet<string>) => ITEMS.filter((it) => p.has(it.id)).map((it) => s.item[it.id]).join(s.list) || s.none;
  const onPath = new Set(b.cells.map(([k, c]) => `${k}-${c}`));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.cap} value={cap} min={5} max={MAX_CAPACITY} onChange={(c) => { setCap(c); }} format={kg} />
      <p className="lb-note">{s.tap}</p>
      <ul className="lb-truck">
        {ITEMS.map((it) => (
          <li key={it.id}>
            <button type="button" className={pick.has(it.id) ? "lb-truck-load is-on" : "lb-truck-load"} aria-pressed={pick.has(it.id)} onClick={() => setPick((p) => { const n = new Set(p); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>
              <strong>{s.item[it.id]}</strong>
              <span>{kg(it.w)}{s.list}{pts(it.v)}</span>
              <small>{s.per(num(Math.round((it.v / it.w) * 10) / 10))}</small>
            </button>
          </li>
        ))}
      </ul>
      <div className="lb-amount">
        <span>{s.load}</span><span>{s.of(kg(w), kg(cap))}</span>
        <span className={w > cap ? "lb-bar-track is-over" : "lb-bar-track"}><span className="lb-bar-fill" style={{ inlineSize: `${Math.min(100, Math.round((w / cap) * 100))}%` }} /></span>
      </div>
      {w > cap && <p className="lb-verdict is-warn" aria-live="polite">{s.over(kg(w - cap))}</p>}
      <div className="lb-row">
        <Button size="sm" variant="secondary" onClick={() => setShowG(true)}>{s.packG}</Button>
        <Button size="sm" icon="target" onClick={() => setShowB(true)}>{s.showB}</Button>
        <Button size="sm" variant="ghost" icon="sync" onClick={() => setPick(new Set())}>{s.clear}</Button>
      </div>
      <div className="lb-scroll">
        <table className="lb-table">
          <thead><tr><th>{s.method}</th><th>{s.weight}</th><th>{s.value}</th></tr></thead>
          <tbody>
            <tr><th>{s.you}<br /><small className="lb-note">{names(pick)}</small></th><td>{kg(w)}</td><td>{w > cap ? "—" : num(v)}</td></tr>
            {showG && <tr><th>{s.greedy}<br /><small className="lb-note">{names(g.pick)}</small></th><td>{kg(weight(ITEMS, g.pick))}</td><td>{num(gv)}</td></tr>}
            {showB && <tr className="is-on"><th>{s.best}<br /><small className="lb-note">{names(b.pick)}</small></th><td>{kg(weight(ITEMS, b.pick))}</td><td>{num(b.value)}</td></tr>}
          </tbody>
        </table>
      </div>
      {showG && (
        <div className="stack-sm">
          <span className="dr-field-label">{s.gTitle}</span>
          <ol className="lb-tries">{g.order.map((id) => <li key={id} className={g.pick.has(id) ? "is-on" : undefined}><Icon name={g.pick.has(id) ? "check" : "cross"} size={16} /><span>{s.item[id]}</span><span className="lb-note">{g.pick.has(id) ? s.took : s.skip}</span></li>)}</ol>
        </div>
      )}
      {showG && showB && <p className={gv < b.value ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{gv < b.value ? s.gWrong(pts(b.value - gv)) : s.gRight}</p>}
      {showB && w <= cap && pick.size > 0 && <p className="lb-note">{v >= b.value ? s.youBest : s.youShort(pts(b.value - v))}</p>}
      {showB && (
        <details className="lb-doc lb-dp-box">
          <summary>{s.best}</summary>
          <p className="lb-note">{s.dp}</p>
          <div className="lb-scroll" dir="ltr">
            <table className="lb-dp">
              <thead><tr><th>{s.room}</th>{b.table[0].map((_, c) => <th key={c}>{num(c)}</th>)}</tr></thead>
              <tbody>{b.table.map((row, k) => (
                <tr key={k}><th>{k ? s.item[ITEMS[k - 1].id] : s.none}</th>{row.map((val, c) => <td key={c} className={onPath.has(`${k}-${c}`) ? "is-path" : undefined}>{num(val)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
    </LabShell>
  );
}
