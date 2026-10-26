import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useKit, useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { accuracy, ATTRS, auto, classify, DATA, entropy, findOpen, grow, questions, VALUES, type Attr, type Day, type Node, type Path } from "./model";

const S = {
  en: {
    intro: "Here are 14 days from last term: the weather, and whether the class played football outside at break. A decision tree learns the pattern as a chain of questions. Pick the question at each step, or let the computer pick the best one.",
    attr: { sky: "Sky", heat: "Temperature", humid: "Humidity", wind: "Wind" } as Record<Attr, string>,
    q: { sky: "What is the sky like?", heat: "How hot is it?", humid: "How humid is it?", wind: "How windy is it?" } as Record<Attr, string>,
    val: { sunny: "sunny", cloudy: "cloudy", rainy: "rainy", hot: "hot", mild: "mild", cool: "cool", high: "high", normal: "normal", weak: "light", strong: "strong" } as Record<string, string>,
    play: "Play outside", stay: "Stay inside", days: (n: string, y: string, c: number) => `${c === 1 ? "1 day" : `${n} days`}, ${y} played`,
    open: "Which question should go here?", gain: (g: string) => `gain ${g}`, best: "biggest gain",
    entropy: "Mixedness (entropy) here:", gainHelp: "Gain is how much a question lowers the mixedness: 0 means the answers stay just as mixed, higher means it sorts the days into “play” and “stay” better.",
    auto: "Build the rest automatically", clear: "Clear the tree", table: "The 14 days (highlighted: the days that reach the chosen spot)", played: "Played",
    test: "Try a new day", answer: (a: string) => `The tree says: ${a}.`, unfinished: "The tree isn't finished on this path yet.",
    qs: "Questions", acc: "Right on the 14 days",
    takeaway: "Decision trees are easy to read and to question: you can see exactly why they decide. The computer picks each question by information gain, the same rule you can follow by hand. But a tree that fits a few examples perfectly can still be wrong about new days.",
  },
  ar: {
    intro: "هذه ١٤ يومًا من الفصل الماضي: حالة الطقس، وهل لعب الصف كرة القدم في الخارج وقت الاستراحة. تتعلّم شجرة القرار النمط في صورة سلسلة أسئلة. اختر السؤال في كل خطوة، أو دع الحاسوب يختار الأفضل.",
    attr: { sky: "السماء", heat: "الحرارة", humid: "الرطوبة", wind: "الرياح" } as Record<Attr, string>,
    q: { sky: "كيف السماء؟", heat: "ما درجة الحرارة؟", humid: "ما درجة الرطوبة؟", wind: "كيف الرياح؟" } as Record<Attr, string>,
    val: { sunny: "مشمسة", cloudy: "غائمة", rainy: "ممطرة", hot: "حارة", mild: "معتدلة", cool: "باردة", high: "عالية", normal: "عادية", weak: "خفيفة", strong: "قوية" } as Record<string, string>,
    play: "نلعب في الخارج", stay: "نبقى في الداخل", days: (n: string, y: string, c: number) => `${c === 1 ? "يوم واحد" : c === 2 ? "يومان" : c <= 10 ? `${n} أيام` : `${n} يومًا`}، لعبوا في ${y} منها`,
    open: "أي سؤال يوضع هنا؟", gain: (g: string) => `الكسب ${g}`, best: "أكبر كسب",
    entropy: "الاختلاط (الإنتروبيا) هنا:", gainHelp: "الكسب هو مقدار ما يقلّله السؤال من الاختلاط: صفر يعني أن الإجابات تبقى مختلطة كما هي، والأعلى يعني أنه يفرز الأيام إلى «نلعب» و«نبقى» أفضل.",
    auto: "ابنِ الباقي تلقائيًا", clear: "امسح الشجرة", table: "الأيام الأربعة عشر (المظلّلة: الأيام التي تصل إلى الموضع المختار)", played: "لعبوا",
    test: "جرّب يومًا جديدًا", answer: (a: string) => `تقول الشجرة: ${a}.`, unfinished: "لم تكتمل الشجرة على هذا المسار بعد.",
    qs: "الأسئلة", acc: "صحيحة في الأيام الأربعة عشر",
    takeaway: "أشجار القرار سهلة القراءة والمساءلة: ترى بالضبط لماذا تقرّر. ويختار الحاسوب كل سؤال بكسب المعلومات، وهي القاعدة نفسها التي تستطيع اتّباعها يدويًا. لكن الشجرة التي تطابق أمثلة قليلة تمامًا قد تخطئ في أيام جديدة.",
  },
};

export default function Tree({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { lang, num } = useI18n();
  const [choices, setChoices] = useState<Map<Path, Attr>>(() => new Map());
  const [day, setDay] = useState<Day>({ sky: "sunny", heat: "mild", humid: "normal", wind: "weak" });
  const [sel, setSel] = useState<Path | null>(null);
  const [tested, setTested] = useState(false);
  const root = useMemo(() => grow(choices), [choices]);
  const result = classify(root, day);
  const complete = !findOpen(root);
  useEffect(() => { if (complete && tested) onDone?.(); }, [complete && tested]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = sel ?? result.path;
  const inFocus = (r: Day) => focus.split("/").filter(Boolean).every((part) => { const [a, v] = part.split("="); return r[a as Attr] === v; });
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const sep = lang === "ar" ? "، " : ", ";

  // A plain render function (not a component), so the tree isn't remounted and focus stays put.
  const view = (node: Node): ReactElement => {
    const yes = node.rows.filter((r) => r.play).length;
    const onPath = result.path === node.path || result.path.startsWith(node.path ? `${node.path}/` : "");
    const cls = `lb-tree-node is-${node.kind}${onPath ? " is-path" : ""}${focus === node.path ? " is-sel" : ""}`;
    const head = <button type="button" className="lb-tree-count" onClick={() => setSel(node.path)}>{s.days(num(node.rows.length), num(yes), node.rows.length)}</button>;
    if (node.kind === "leaf") return <div className={cls}><strong><Icon name={node.play ? "check" : "close"} size={16} /> {node.play ? s.play : s.stay}</strong>{head}</div>;
    if (node.kind === "open") return (
      <div className={cls}>
        <strong>{s.open}</strong>{head}
        <span className="lb-note">{s.entropy} {n2(entropy(node.rows))}</span>
        <div className="lb-row">
          {node.options.map((o, i) => (
            <Button key={o.attr} size="sm" variant={i === 0 ? "primary" : "secondary"} onClick={() => setChoices((c) => new Map(c).set(node.path, o.attr))}>
              {s.attr[o.attr]}{sep}{s.gain(n2(o.gain))}{i === 0 ? `${sep}${s.best}` : ""}
            </Button>
          ))}
        </div>
      </div>
    );
    return (
      <div className={cls}>
        <strong>{s.q[node.attr]}</strong>{head}
        <ul className="lb-tree">
          {node.kids.map((c) => <li key={c.value}><span className="lb-tree-edge">{s.val[c.value]}</span>{view(c.node)}</li>)}
        </ul>
      </div>
    );
  };

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <p className="lb-note">{s.gainHelp}</p>
      <div className="lb-row">
        <Button size="sm" variant="secondary" disabled={complete} onClick={() => setChoices((c) => auto(c))}>{s.auto}</Button>
        <Button size="sm" variant="ghost" icon="sync" disabled={!choices.size} onClick={() => { setChoices(new Map()); setSel(null); }}>{s.clear}</Button>
      </div>
      <div className="lb-tree-wrap">{view(root)}</div>
      <Stats items={[{ label: s.qs, value: num(questions(root)) }, { label: s.acc, value: num(accuracy(root), { style: "percent" }) }]} />
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.test}</span>
          {ATTRS.map((a) => <Segmented key={a} label={s.attr[a]} value={day[a]} options={VALUES[a].map((v) => [v, s.val[v]] as const)} onChange={(v) => { setDay((d) => ({ ...d, [a]: v })); setTested(true); setSel(null); }} />)}
          <p className="lb-verdict" aria-live="polite">{result.play === null ? s.unfinished : s.answer(result.play ? s.play : s.stay)}</p>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.table}</span>
          <div className="lb-scroll">
            <table className="lb-table lb-days">
              <thead><tr>{ATTRS.map((a) => <th key={a}>{s.attr[a]}</th>)}<th>{s.played}</th></tr></thead>
              <tbody>{DATA.map((r, i) => <tr key={i} className={inFocus(r) ? "is-on" : undefined}>{ATTRS.map((a) => <td key={a}>{s.val[r[a]]}</td>)}<td>{r.play ? <span className="lb-ok">{k.yes}</span> : <span className="lb-no">{k.no}</span>}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </LabShell>
  );
}
