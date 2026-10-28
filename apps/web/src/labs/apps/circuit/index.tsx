import { useEffect, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { Formula } from "../../kit/Formula";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { BATTERIES, CAPACITY, hours, led, LEDS, RESISTORS, safest, WIRE, type Colour } from "./model";

const GLOW: Record<Colour, string> = { red: "var(--hibiscus)", green: "var(--lagoon)", blue: "var(--sky, var(--lagoon))" };
const S = {
  en: {
    intro: "An LED needs just the right current. The resistor limits it. The LED always takes about the same voltage (red 2 V, blue 3 V); the resistor takes what's left, and Ohm's law gives the current.",
    battery: "Battery", volt: (n: string) => `${n} V`, resistor: "Resistor", colour: "LED colour", red: "Red", green: "Green", blue: "Blue", ohm: (n: string) => `${n} Ω`, none: "None",
    diagram: "Circuit: battery, resistor and LED in a loop", law: "Ohm's law: current = voltage left for the resistor ÷ resistance",
    state: { off: "Dark: the battery's voltage is too low to light this LED.", dim: "Dim: the resistor is too big, so only a little current flows.", good: "Just right: bright and safe.", bright: "Very bright, but it will run hot and wear out fast.", burnt: "Burned out! Too much current. Always use a resistor." } as Record<string, string>,
    current: "Current", mA: (n: string) => `${n} mA`, heat: "Heat in the resistor", mW: (n: string) => `${n} mW`, life: (mAh: string) => `A ${mAh} mAh battery lasts`, hrs: (n: string) => `${n} hours`, forever: "forever (nothing flows)",
    fresh: "Fit a new LED", hint: (r: string) => `Smallest safe resistor here: ${r}.`,
    try1: "The LED starts dim. Pick 470 Ω, then 220 Ω: each smaller resistor lets more current through, and the LED glows brighter.",
    try2: "Pick None: nothing limits the current, so it shoots past 30 mA and the LED burns out.",
    try3: "Pick 220 Ω, fit a new LED, then switch to 9 V: the same resistor now lets too much through. Which is the smallest safe one?",
    takeaway: "Every IoT gadget is circuits like this one. Ohm's law (V = I × R) lets you work out a part before you buy it, and protects your parts: a 20-cent resistor saves your LED, your pins and your battery.",
  },
  ar: {
    intro: "يحتاج الصمام الضوئي (LED) إلى تيار مناسب تمامًا، والمقاومة تحدّ منه. يأخذ الصمام دائمًا الجهد نفسه تقريبًا (الأحمر ٢ فولت، والأزرق ٣ فولت)، وتأخذ المقاومة الباقي، ويعطي قانون أوم التيار.",
    battery: "البطارية", volt: (n: string) => `${n} فولت`, resistor: "المقاومة", colour: "لون الصمام", red: "أحمر", green: "أخضر", blue: "أزرق", ohm: (n: string) => `${n} أوم`, none: "بلا",
    diagram: "الدائرة: بطارية ومقاومة وصمام ضوئي في حلقة", law: "قانون أوم: التيار = الجهد المتبقي للمقاومة ÷ المقاومة",
    state: { off: "مطفأ: جهد البطارية أقل من أن يضيء هذا الصمام.", dim: "خافت: المقاومة كبيرة جدًا، فلا يمر إلا تيار قليل.", good: "مناسب تمامًا: مضيء وآمن.", bright: "مضيء جدًا، لكنه سيسخن ويتلف بسرعة.", burnt: "احترق! التيار كبير جدًا. استعمل مقاومة دائمًا." } as Record<string, string>,
    current: "التيار", mA: (n: string) => `${n} ملي أمبير`, heat: "الحرارة في المقاومة", mW: (n: string) => `${n} ملي واط`, life: (mAh: string) => `بطارية ${mAh} ملي أمبير ساعة تدوم`, hrs: (n: string) => `${n} ساعة`, forever: "إلى الأبد (لا يمر تيار)",
    fresh: "ركّب صمامًا جديدًا", hint: (r: string) => `أصغر مقاومة آمنة هنا: ${r}.`,
    try1: "يبدأ الصمام خافتًا. اختر ٤٧٠ أوم ثم ٢٢٠ أوم: كل مقاومة أصغر تمرّر تيارًا أكبر، فيزداد توهّج الصمام.",
    try2: "اختر «بلا»: لا شيء يحدّ من التيار، فيتجاوز ٣٠ ملي أمبير ويحترق الصمام.",
    try3: "اختر ٢٢٠ أوم وركّب صمامًا جديدًا، ثم انتقل إلى ٩ فولت: المقاومة نفسها تمرّر الآن تيارًا زائدًا. ما أصغر مقاومة آمنة؟",
    takeaway: "كل جهاز من أجهزة إنترنت الأشياء دوائر كهذه. يتيح لك قانون أوم (الجهد = التيار × المقاومة) أن تحسب القطعة قبل شرائها، ويحمي قطعك: مقاومة ثمنها قروش تحمي الصمام والأطراف والبطارية.",
  },
};

export default function Circuit({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [v, setV] = useState(4.5);
  const [r, setR] = useState(1000);
  const [c, setC] = useState<Colour>("red");
  const [burnt, setBurnt] = useState(false);
  const [seen, setSeen] = useState(() => new Set<string>());
  const res = led(v, r, c);
  const dead = burnt || res.state === "burnt";
  useEffect(() => { if (res.state === "burnt") setBurnt(true); setSeen((x) => new Set(x).add(res.state)); }, [res.state]);
  useEffect(() => { if (seen.has("burnt") && seen.has("good")) onDone?.(); }, [seen.has("burnt") && seen.has("good")]); // eslint-disable-line react-hooks/exhaustive-deps
  const ohms = (x: number) => (x === 0 ? s.none : s.ohm(num(x)));
  const n = (x: number, d = 2) => num(Math.round(x * 10 ** d) / 10 ** d);
  const mAh = CAPACITY[v], life = hours(mAh, res.amps);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <svg viewBox="0 0 300 170" className="lb-diagram" role="img" aria-label={s.diagram} direction="ltr">
            <path d="M40 40 H260 V130 H40 Z" className="lb-wire" stroke="var(--ink)" strokeWidth={3} fill="none" />
            {/* battery */}
            <rect x={25} y={70} width={30} height={30} fill="var(--surface)" stroke="none" />
            <line x1={22} y1={78} x2={58} y2={78} stroke="var(--ink)" strokeWidth={4} />
            <line x1={30} y1={92} x2={50} y2={92} stroke="var(--ink)" strokeWidth={4} />
            <text x={66} y={90} className="lb-node-text">{num(v)} V</text>
            {/* resistor */}
            <rect x={110} y={30} width={80} height={20} fill="var(--surface)" stroke="none" />
            {r > 0 ? <polyline points="110,40 118,30 128,50 138,30 148,50 158,30 168,50 178,30 186,40 190,40" fill="none" stroke="var(--ink)" strokeWidth={3} /> : <line x1={110} y1={40} x2={190} y2={40} stroke="var(--ink)" strokeWidth={3} />}
            <text x={150} y={22} textAnchor="middle" className="lb-node-text">{r === 0 ? "0 Ω" : `${num(r)} Ω`}</text>
            {/* LED */}
            <rect x={245} y={70} width={30} height={34} fill="var(--surface)" stroke="none" />
            {!dead && res.glow > 0 && <circle cx={260} cy={86} r={14 + 16 * res.glow} fill={GLOW[c]} opacity={0.25 + 0.5 * res.glow} />}
            <polygon points="248,74 272,74 260,96" fill={dead ? "var(--line-strong)" : GLOW[c]} stroke="var(--ink)" strokeWidth={2} />
            <line x1={246} y1={98} x2={274} y2={98} stroke="var(--ink)" strokeWidth={3} />
            {dead && <path d="M250 70 L270 100 M270 70 L250 100" stroke="var(--ink)" strokeWidth={3} />}
          </svg>
          <Formula parts={res.amps > 0
            ? ["I", "=", "(", n(v, 1), "−", n(LEDS[c], 1), ")", "÷", ...(r === 0 ? [num(WIRE)] : ["(", num(r), "+", num(WIRE), ")"]), "=", n(res.amps * 1000, 1), "mA"]
            : ["I", "=", num(0), "mA"]} />
          <p className="lb-note">{s.law}</p>
        </div>
        <div className="stack">
          <Segmented label={s.battery} value={v} options={BATTERIES.map((b) => [b, s.volt(num(b))] as const)} onChange={setV} />
          <Segmented label={s.resistor} value={r} options={RESISTORS.map((x) => [x, ohms(x)] as const)} onChange={setR} />
          <Segmented label={s.colour} value={c} options={[["red", s.red], ["green", s.green], ["blue", s.blue]]} onChange={setC} />
          <p className={dead ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{s.state[dead ? "burnt" : res.state]}</p>
          {dead && <div className="lb-row"><Button size="sm" variant="secondary" disabled={res.state === "burnt"} onClick={() => setBurnt(false)}>{s.fresh}</Button></div>}
          {dead && <p className="lb-note">{s.hint(ohms(safest(v, c)))}</p>}
          <Stats items={[
            { label: s.current, value: s.mA(n(res.amps * 1000, 1)) },
            { label: s.heat, value: s.mW(n(res.watts * 1000, 0)) },
            { label: s.life(num(mAh)), value: dead ? "—" : Number.isFinite(life) ? s.hrs(num(Math.round(life))) : s.forever },
          ]} />
        </div>
      </div>
    </LabShell>
  );
}
