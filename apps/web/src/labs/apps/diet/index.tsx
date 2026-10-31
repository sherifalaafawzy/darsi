import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { cheapest, COMMON, cost, EMPTY, FOODS, meets, NEEDS, NUTRIENTS, PER, short, totals, UNIT, type Food, type Mix, type Nutrient } from "./model";

const S = {
  en: {
    intro: "A school kitchen must give every pupil enough energy, protein and iron at lunch, for as little money as possible. Build a plate yourself, then ask the computer for the cheapest one that meets every need.",
    food: { rice: "Rice (cup)", beans: "Beans (cup)", eggs: "Egg", milk: "Milk (cup)", greens: "Greens (cup)", nuts: "Groundnuts (handful)" } as Record<Food, string>,
    nut: { energy: "Energy", protein: "Protein", iron: "Iron" } as Record<Nutrient, string>,
    unit: { kcal: "kcal", g: "g", mg: "mg" },
    plate: "Your plate", portions: "Portions", price: (n: string) => `${n} coins each`, have: "In the market today", more: (f: string) => `More ${f}`, less: (f: string) => `Less ${f}`,
    needs: "What the plate gives, against what a pupil needs", of: (a: string, need: string, unit: string) => `${a} ${unit} (needs ${need})`, list: ", ",
    cost: "Cost", coins: (n: string) => `${n} coins`, ok: "This plate meets every need.", shortOf: (what: string) => `Short of: ${what}.`, sep: ", ",
    usual: "Serve the usual plate", clear: "Empty the plate", solve: "Find the cheapest (simplex)", cap: "Most portions of one food",
    best: "The cheapest plate that meets every need", corners: (path: string) => `Corners the simplex method visited, cost at each: ${path}.`, arrow: " → ",
    tight: (what: string) => `Met exactly: ${what}. These needs set the price.`, free: (what: string) => `More than enough: ${what}, at no extra cost.`,
    none: "No plate can meet every need with these foods.", serve: "Serve this plate", vs: (a: string, b: string) => `Your plate costs ${a}; the cheapest costs ${b}.`, save: "Saved",
    try1: "Press “Serve the usual plate” (two cups of rice, an egg, a cup of milk): plenty of energy and protein, but not enough iron, for 60 coins.",
    try2: "Press “Find the cheapest”: 41 coins, with rice, groundnuts and a little greens. Energy and iron are met exactly; protein comes free.",
    try3: "Raise “Most portions of one food” to 4: the cheapest plate becomes almost all groundnuts. The model obeys only the rules it is given, so people must add the rules that matter (variety, taste, allergies).",
    takeaway: "This is the diet problem, one of the first problems linear programming solved (in the 1940s). The simplex method moves from corner to corner of the plans that meet every need, each time cheaper, until no move helps.",
  },
  ar: {
    intro: "على مطبخ المدرسة أن يعطي كل تلميذ ما يكفي من الطاقة والبروتين والحديد في الغداء، بأقل مال ممكن. ركّب طبقًا بنفسك، ثم اطلب من الحاسوب أرخص طبق يلبّي كل الاحتياجات.",
    food: { rice: "أرز (كوب)", beans: "فاصولياء (كوب)", eggs: "بيضة", milk: "حليب (كوب)", greens: "خضار ورقية (كوب)", nuts: "فول سوداني (حفنة)" } as Record<Food, string>,
    nut: { energy: "الطاقة", protein: "البروتين", iron: "الحديد" } as Record<Nutrient, string>,
    unit: { kcal: "سعرة", g: "غ", mg: "ملغ" },
    plate: "طبقك", portions: "الحصص", price: (n: string) => `${n} قطعة نقدية للحصة`, have: "متوفّر في السوق اليوم", more: (f: string) => `زِد ${f}`, less: (f: string) => `قلّل ${f}`,
    needs: "ما يعطيه الطبق مقارنةً بما يحتاج إليه التلميذ", of: (a: string, need: string, unit: string) => `${a} ${unit} (المطلوب ${need})`, list: "، ",
    cost: "الكلفة", coins: (n: string) => `${n} قطعة نقدية`, ok: "هذا الطبق يلبّي كل الاحتياجات.", shortOf: (what: string) => `الطبق ناقص في: ${what}.`, sep: "، ",
    usual: "قدّم الطبق المعتاد", clear: "أفرغ الطبق", solve: "جِد الأرخص (السمبلكس)", cap: "أكبر عدد من حصص طعام واحد",
    best: "أرخص طبق يلبّي كل الاحتياجات", corners: (path: string) => `الزوايا التي زارتها طريقة السمبلكس، والكلفة عند كل منها: ${path}.`, arrow: " ← ",
    tight: (what: string) => `مستوفى بالضبط: ${what}. هذه الاحتياجات هي التي تحدّد السعر.`, free: (what: string) => `أكثر من الكفاية: ${what}، دون كلفة إضافية.`,
    none: "لا يوجد طبق يلبّي كل الاحتياجات بهذه الأطعمة.", serve: "قدّم هذا الطبق", vs: (a: string, b: string) => `طبقك يكلّف ${a}، وأرخص طبق يكلّف ${b}.`, save: "التوفير",
    try1: "اضغط «قدّم الطبق المعتاد» (كوبا أرز وبيضة وكوب حليب): طاقة وبروتين بوفرة، لكن الحديد لا يكفي، والكلفة ٦٠ قطعة نقدية.",
    try2: "اضغط «جِد الأرخص»: ٤١ قطعة نقدية، بالأرز والفول السوداني وقليل من الخضار الورقية. الطاقة والحديد مستوفيان بالضبط، والبروتين يأتي مجانًا.",
    try3: "ارفع «أكبر عدد من حصص طعام واحد» إلى ٤: يصبح أرخص طبق فولًا سودانيًا كله تقريبًا. النموذج لا يطيع إلا القواعد التي تُعطى له، فعلى الناس أن يضيفوا القواعد المهمة (التنوّع والطعم والحساسية).",
    takeaway: "هذه مسألة الحِمية، من أولى المسائل التي حلّتها البرمجة الخطية (في أربعينيات القرن الماضي). تنتقل طريقة السمبلكس من زاوية إلى زاوية بين الخطط التي تلبّي كل الاحتياجات، وفي كل مرة بكلفة أقل، حتى لا تفيد أي حركة.",
  },
};

export default function Diet({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [mix, setMix] = useState<Mix>(EMPTY);
  const [cap, setCap] = useState(2);
  const [have, setHave] = useState<Set<Food>>(() => new Set(FOODS));
  const [shown, setShown] = useState(false);
  const res = useMemo(() => cheapest(cap, have), [cap, have]);
  useEffect(() => { if (shown && meets(mix)) onDone?.(); }, [shown && meets(mix)]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = totals(mix), lacking = short(mix);
  const n1 = (v: number) => num(Math.round(v * 10) / 10);
  const coins = (v: number) => s.coins(n1(v));
  const ok = res.lp.status === "optimal";
  const tight = res.tight.map((n) => s.nut[n]), free = NUTRIENTS.filter((n) => !res.tight.includes(n)).map((n) => s.nut[n]);
  const step = (f: Food, d: number) => setMix((m) => ({ ...m, [f]: Math.max(0, Math.min(4, m[f] + d)) }));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <h3 className="lb-h">{s.plate}</h3>
          <ul className="lb-foods">
            {FOODS.map((f) => (
              <li key={f} className={have.has(f) ? "lb-food" : "lb-food is-off"}>
                <div className="lb-food-name"><strong>{s.food[f]}</strong><small>{s.price(num(PER[f].price))}</small></div>
                <div className="lb-portion">
                  <button type="button" className="lb-portion-btn" aria-label={s.less(s.food[f])} disabled={!mix[f]} onClick={() => step(f, -0.5)}>−</button>
                  <output className="lb-portion-val">{n1(mix[f])}</output>
                  <button type="button" className="lb-portion-btn" aria-label={s.more(s.food[f])} onClick={() => step(f, 0.5)}>+</button>
                </div>
                <button type="button" className={have.has(f) ? "lb-switch lb-opt-switch is-on" : "lb-switch lb-opt-switch"} aria-pressed={have.has(f)} aria-label={`${s.have}: ${s.food[f]}`} onClick={() => setHave((h) => { const n = new Set(h); if (n.has(f)) n.delete(f); else n.add(f); return n; })}><span className="lb-switch-knob" aria-hidden /><span>{s.have}</span></button>
              </li>
            ))}
          </ul>
          <div className="lb-row">
            <Button size="sm" variant="secondary" onClick={() => setMix(COMMON)}>{s.usual}</Button>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => setMix(EMPTY)}>{s.clear}</Button>
          </div>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.needs}</span>
          <ul className="lb-amounts">
            {NUTRIENTS.map((n) => (
              <li key={n} className={t[n] < NEEDS[n] - 1e-6 ? "lb-amount is-short" : "lb-amount"}>
                <span>{s.nut[n]}</span><span>{s.of(n1(t[n]), num(NEEDS[n]), s.unit[UNIT[n]])}</span>
                <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.min(100, Math.round((t[n] / NEEDS[n]) * 100))}%` }} /></span>
              </li>
            ))}
          </ul>
          <Stats items={[{ label: s.cost, value: coins(cost(mix)) }]} />
          <p className={lacking.length ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{lacking.length ? s.shortOf(lacking.map((n) => s.nut[n]).join(s.sep)) : s.ok}</p>
          <Slider label={s.cap} value={cap} min={1} max={4} step={0.5} onChange={setCap} format={n1} />
          <div className="lb-row"><Button size="sm" icon="target" onClick={() => setShown(true)}>{s.solve}</Button></div>
          {shown && (ok ? (
            <div className="lb-panel" aria-live="polite">
              <strong>{s.best}: {coins(res.lp.value)}</strong>
              <ul className="lb-meal">{FOODS.filter((f) => res.mix[f] > 0.005).map((f) => <li key={f}><span>{s.food[f]}</span><span>{n1(res.mix[f])}</span></li>)}</ul>
              <p className="lb-note">{s.corners(res.lp.path.map((p) => n1(p.value)).join(s.arrow))}</p>
              {!!tight.length && <p className="lb-note">{s.tight(tight.join(s.list))}</p>}
              {!!free.length && <p className="lb-note">{s.free(free.join(s.list))}</p>}
              {meets(mix) && <p className="lb-note">{s.vs(coins(cost(mix)), coins(res.lp.value))}</p>}
              <div className="lb-row"><Button size="sm" variant="secondary" onClick={() => setMix(Object.fromEntries(FOODS.map((f) => [f, Math.round(res.mix[f] * 100) / 100])) as Mix)}>{s.serve}</Button></div>
            </div>
          ) : <p className="lb-verdict is-warn" aria-live="polite">{s.none}</p>)}
        </div>
      </div>
    </LabShell>
  );
}
