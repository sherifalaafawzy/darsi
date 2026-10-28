import { useEffect, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { circuit, gate, GATES, PUZZLES, ROWS3, solved, TWO, type Gate, type Puzzle } from "./model";

const S = {
  en: {
    intro: "A logic gate turns on/off inputs into an on/off output. Flip the switches; 1 means on, 0 means off. Then wire two gates together to solve real classroom problems.",
    try: "Try one gate", gate: "Gate", out: "Output", table: "Truth table: every possible input",
    what: { AND: "On only when both inputs are on.", OR: "On when either input is on, or both.", NOT: "Flips its one input: on becomes off, off becomes on.", XOR: "On when exactly one input is on.", NAND: "The opposite of AND.", NOR: "The opposite of OR." } as Record<Gate, string>,
    build: "Build it: two gates", puzzle: "Problem", names: { fan: "Fan", alarm: "Door alarm", lamp: "Stair lamp" } as Record<Puzzle, string>,
    story: { fan: "The fan runs when it is hot (A) and someone is in the room (B), or when the teacher presses the switch (C).", alarm: "The alarm rings when the door (A) or the window (B) opens, but only if the alarm is armed (C).", lamp: "Stair lamp: flipping either switch (A downstairs, B upstairs) changes the lamp, as long as the power (C) is on." } as Record<Puzzle, string>,
    first: "First gate (A, B)", second: "Second gate (first gate's output, C)", wanted: "Wanted", yours: "Yours",
    solved: "Solved! Your two gates behave exactly as described, for all 8 cases.", notYet: (n: string) => `${n} of 8 cases right. Try other gates.`,
    switch: (n: string, on: boolean) => `Switch ${n}: ${on ? "on" : "off"}`,
    try1: "Pick XOR and switch A and B both on: the lamp goes off. That one row is the only difference from OR.",
    try2: "Solve the Fan: each ✗ in the table is a case your gates get wrong. Change one gate at a time until all 8 rows show ✓.",
    try3: "Then try the Stair lamp: which gate changes its output whenever either input flips?",
    takeaway: "Every chip is built from gates like these, millions or billions of them. A microcontroller in an IoT device runs your IF … AND … OR … rules on exactly this kind of logic.",
  },
  ar: {
    intro: "تحوّل البوابة المنطقية مدخلات تشغيل وإطفاء إلى مخرج تشغيل أو إطفاء. اقلب المفاتيح؛ ١ يعني تشغيل و٠ يعني إطفاء. ثم صِل بوابتين معًا لتحلّ مشكلات حقيقية في الصف.",
    try: "جرّب بوابة واحدة", gate: "البوابة", out: "المخرج", table: "جدول الحقيقة: كل المدخلات الممكنة",
    what: { AND: "يعمل فقط حين يعمل المدخلان معًا.", OR: "يعمل حين يعمل أحد المدخلين أو كلاهما.", NOT: "يعكس مدخله الوحيد: التشغيل يصبح إطفاءً والإطفاء تشغيلًا.", XOR: "يعمل حين يعمل مدخل واحد فقط.", NAND: "عكس AND.", NOR: "عكس OR." } as Record<Gate, string>,
    build: "ابنِها: بوابتان", puzzle: "المشكلة", names: { fan: "المروحة", alarm: "إنذار الباب", lamp: "مصباح الدرج" } as Record<Puzzle, string>,
    story: { fan: "تعمل المروحة حين يكون الجو حارًا (A) ويوجد أحد في الغرفة (B)، أو حين يضغط المعلم المفتاح (C).", alarm: "يرنّ الإنذار حين يُفتح الباب (A) أو النافذة (B)، لكن فقط إن كان الإنذار مفعّلًا (C).", lamp: "مصباح الدرج: قلب أي من المفتاحين (A في الأسفل، B في الأعلى) يغيّر حالة المصباح، ما دامت الكهرباء (C) موصولة." } as Record<Puzzle, string>,
    first: "البوابة الأولى (A وB)", second: "البوابة الثانية (مخرج الأولى وC)", wanted: "المطلوب", yours: "دائرتك",
    solved: "أحسنت! تتصرّف بوابتاك تمامًا كما في الوصف، في الحالات الثماني كلها.", notYet: (n: string) => `${n} من ٨ حالات صحيحة. جرّب بوابات أخرى.`,
    switch: (n: string, on: boolean) => `المفتاح ${n}: ${on ? "يعمل" : "متوقف"}`,
    try1: "اختر XOR وشغّل المفتاحين A وB معًا: ينطفئ المصباح. هذا الصف وحده هو الفرق بينها وبين OR.",
    try2: "حلّ مشكلة المروحة: كل ✗ في الجدول حالة تخطئ فيها بوابتاك. غيّر بوابة واحدة في كل مرة حتى تظهر ✓ في الصفوف الثمانية كلها.",
    try3: "ثم جرّب مصباح الدرج: أي بوابة يتغيّر مخرجها كلما انقلب أحد مدخليها؟",
    takeaway: "كل شريحة إلكترونية مبنية من بوابات كهذه، بالملايين أو المليارات. والمتحكّم الدقيق في أجهزة إنترنت الأشياء ينفّذ قواعدك «إذا … و … أو …» بهذا النوع من المنطق تمامًا.",
  },
};

function Switch({ name, on, onFlip, label }: { name: string; on: boolean; onFlip: () => void; label: string }) {
  return <button type="button" className={on ? "lb-switch is-on" : "lb-switch"} aria-pressed={on} aria-label={label} onClick={onFlip}><span>{name}</span><span className="lb-switch-knob" aria-hidden /></button>;
}
const Lamp = ({ on, label }: { on: boolean; label: string }) => <span className={on ? "lb-lamp is-on" : "lb-lamp"} role="img" aria-label={label}><Icon name="idea" size={22} /></span>;

export default function Logic({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [g, setG] = useState<Gate>("AND");
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [p, setP] = useState<Puzzle>("fan");
  const [g1, setG1] = useState<Gate>("AND"); // AND then AND solves none of the problems, so no problem starts solved
  const [g2, setG2] = useState<Gate>("AND");
  const [abc, setAbc] = useState<[boolean, boolean, boolean]>([true, false, false]);
  const [wins, setWins] = useState(() => new Set<Puzzle>());
  const bit = (x: boolean) => num(x ? 1 : 0);
  const ok = solved(p, g1, g2);
  useEffect(() => { if (ok) setWins((w) => new Set(w).add(p)); }, [ok, p]);
  useEffect(() => { if (wins.size >= 2) onDone?.(); }, [wins.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = gate(g, a, b), f = circuit(g1, g2), right = ROWS3.filter(([x, y, z]) => f(x, y, z) === PUZZLES[p].target(x, y, z)).length;
  const rows2 = g === "NOT" ? [[false, false], [true, false]] : [[false, false], [false, true], [true, false], [true, true]];

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <h3 className="lb-h">{s.try}</h3>
      <Segmented label={s.gate} value={g} options={GATES.map((x) => [x, x] as const)} onChange={setG} />
      <p className="lb-note">{s.what[g]}</p>
      <div className="lb-two">
        <div className="lb-gate" dir="ltr">
          <div className="stack-sm">
            <Switch name="A" on={a} onFlip={() => setA(!a)} label={s.switch("A", a)} />
            {g !== "NOT" && <Switch name="B" on={b} onFlip={() => setB(!b)} label={s.switch("B", b)} />}
          </div>
          <span className="lb-gate-box">{g}</span>
          <Lamp on={out} label={`${s.out}: ${bit(out)}`} />
        </div>
        <table className="lb-table lb-truth" dir="ltr" aria-label={s.table}>
          <thead><tr><th>A</th>{g !== "NOT" && <th>B</th>}<th>{s.out}</th></tr></thead>
          <tbody>{rows2.map(([x, y], i) => <tr key={i} className={x === a && (g === "NOT" || y === b) ? "is-on" : undefined}><td>{bit(x)}</td>{g !== "NOT" && <td>{bit(y)}</td>}<td>{bit(gate(g, x, y))}</td></tr>)}</tbody>
        </table>
      </div>

      <h3 className="lb-h">{s.build}</h3>
      <Segmented label={s.puzzle} value={p} options={(Object.keys(PUZZLES) as Puzzle[]).map((x) => [x, s.names[x]] as const)} onChange={setP} />
      <p>{s.story[p]}</p>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.first} value={g1} options={TWO.map((x) => [x, x] as const)} onChange={setG1} />
          <Segmented label={s.second} value={g2} options={TWO.map((x) => [x, x] as const)} onChange={setG2} />
          <div className="lb-gate" dir="ltr">
            <div className="stack-sm">
              {(["A", "B", "C"] as const).map((n, i) => <Switch key={n} name={n} on={abc[i]} onFlip={() => setAbc((v) => v.map((x, j) => (j === i ? !x : x)) as [boolean, boolean, boolean])} label={s.switch(n, abc[i])} />)}
            </div>
            <span className="lb-gate-box">{g1}<br />↓<br />{g2}</span>
            <Lamp on={f(...abc)} label={`${s.out}: ${bit(f(...abc))}`} />
          </div>
          <p className={ok ? "lb-verdict" : "lb-note"} aria-live="polite">{ok ? s.solved : s.notYet(num(right))}</p>
        </div>
        <table className="lb-table lb-truth" dir="ltr">
          <thead><tr><th>A</th><th>B</th><th>C</th><th>{s.wanted}</th><th>{s.yours}</th></tr></thead>
          <tbody>{ROWS3.map(([x, y, z], i) => { const want = PUZZLES[p].target(x, y, z), got = f(x, y, z); return <tr key={i} className={x === abc[0] && y === abc[1] && z === abc[2] ? "is-on" : undefined}><td>{bit(x)}</td><td>{bit(y)}</td><td>{bit(z)}</td><td>{bit(want)}</td><td className={want === got ? "lb-ok" : "lb-no"}>{bit(got)} {want === got ? "✓" : "✗"}</td></tr>; })}</tbody>
        </table>
      </div>
    </LabShell>
  );
}
