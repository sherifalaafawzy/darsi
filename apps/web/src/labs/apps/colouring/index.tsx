import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { biggestClique, clashes, dsatur, edges, EXAMS, fewest, greedy, PUPILS, SPOTS, used, type Exam } from "./model";

const MAX_SLOTS = 5;
const S = {
  en: {
    intro: "Each dot is an exam. A line joins two exams when a pupil takes both, so they can't be at the same time. Give every exam a time slot (a colour) so that no line joins two of the same colour. How few slots are enough?",
    exam: { maths: "Maths", english: "English", science: "Science", arabic: "Arabic", history: "History", geography: "Geography", art: "Art", french: "French" } as Record<Exam, string>,
    pupil: { sami: "Sami", hala: "Hala", omar: "Omar", dina: "Dina", nadia: "Nadia", tarek: "Tarek" } as Record<string, string>,
    map: "The exams and their clashes: a line means a pupil takes both; colours and numbers are time slots", slot: (n: string) => `slot ${n}`, noSlot: "no slot",
    examsH: "Tap an exam to change its slot", pupilsH: "Pupils sitting exams", takes: (p: string, list: string) => `${p}: ${list}`, list: ", ",
    greedy: "Greedy (list order)", dsatur: "DSatur", clear: "Clear all", fewest: "How few slots?",
    used: "Slots used", clashes: "Clashes", left: "Without a slot",
    cap: {
      you: "Tap the exams to give them slots.",
      clash: { one: "1 clash: the red line joins two exams in the same slot.", other: "{n} clashes: red lines join exams in the same slot." } as Forms,
      todo: { one: "No clashes so far; 1 exam still needs a slot.", other: "No clashes so far; {n} exams still need a slot." } as Forms,
      ok: { one: "No clashes, with 1 slot.", other: "No clashes, with {n} slots." } as Forms,
      greedy: (e: string, n: string) => `Greedy: ${e} takes the first slot free of clashes, ${n}.`,
      finished: { greedy: "Greedy has finished.", dsatur: "DSatur has finished." } as Record<"greedy" | "dsatur", string>,
      dsatur: (e: string, n: string) => `DSatur: next is ${e}, whose neighbours already use the most different slots. It takes ${n}.`,
    },
    fewestIs: (k: string, list: string) => `Enough: ${k}. Fewer is impossible: ${list} all clash with each other, so each needs its own slot.`,
    fewestNone: "No exams clash, so one slot is enough.", slots: { one: "1 slot", other: "{n} slots" } as Forms,
    try1: "Press “Greedy (list order)”: going down the list, each exam takes the first free slot. It needs 4 slots.",
    try2: "Press “DSatur”: it always does next the exam that is hardest to place. 3 slots. Then press “How few slots?”: 3 is the fewest, because Omar's three exams all clash.",
    try3: "Untick Omar: the clash map changes. Colour it yourself: how few slots do you need now?",
    takeaway: "Exam timetables, radio frequencies and sports fixtures are graph colouring. Finding the fewest colours is hard in general, so schools use good rules like DSatur, and solvers prove the answer with search. A group that all clash (a clique) shows that fewer is impossible.",
  },
  ar: {
    intro: "كل نقطة امتحان. ويصل خطٌّ بين امتحانين حين يأخذهما تلميذ واحد، فلا يمكن أن يكونا في الوقت نفسه. أعطِ كل امتحان موعدًا (لونًا) بحيث لا يصل خطٌّ بين امتحانين من اللون نفسه. فما أقل عدد من المواعيد يكفي؟",
    exam: { maths: "الرياضيات", english: "الإنجليزية", science: "العلوم", arabic: "العربية", history: "التاريخ", geography: "الجغرافيا", art: "الفنون", french: "الفرنسية" } as Record<Exam, string>,
    pupil: { sami: "سامي", hala: "هالة", omar: "عمر", dina: "دينا", nadia: "نادية", tarek: "طارق" } as Record<string, string>,
    map: "الامتحانات وتعارضاتها: الخط يعني أن تلميذًا يأخذ الامتحانين، والألوان والأرقام مواعيد", slot: (n: string) => `الموعد ${n}`, noSlot: "بلا موعد",
    examsH: "المس امتحانًا لتغيّر موعده", pupilsH: "التلاميذ الذين يقدّمون الامتحانات", takes: (p: string, list: string) => `${p}: ${list}`, list: "، ",
    greedy: "الجشع (بترتيب القائمة)", dsatur: "DSatur", clear: "امسح الكل", fewest: "ما أقل عدد من المواعيد؟",
    used: "المواعيد المستخدمة", clashes: "التعارضات", left: "بلا موعد",
    cap: {
      you: "المس الامتحانات لتعطيها مواعيد.",
      clash: { one: "تعارض واحد: الخط الأحمر يصل بين امتحانين في الموعد نفسه.", two: "تعارضان: الخطان الأحمران يصلان بين امتحانات في الموعد نفسه.", few: "{n} تعارضات: الخطوط الحمراء تصل بين امتحانات في الموعد نفسه.", many: "{n} تعارضًا: الخطوط الحمراء تصل بين امتحانات في الموعد نفسه.", other: "{n} تعارض: الخطوط الحمراء تصل بين امتحانات في الموعد نفسه." } as Forms,
      todo: { one: "لا تعارض حتى الآن، وبقي امتحان واحد بلا موعد.", two: "لا تعارض حتى الآن، وبقي امتحانان بلا موعد.", few: "لا تعارض حتى الآن، وبقيت {n} امتحانات بلا موعد.", many: "لا تعارض حتى الآن، وبقي {n} امتحانًا بلا موعد.", other: "لا تعارض حتى الآن، وبقي {n} امتحان بلا موعد." } as Forms,
      ok: { one: "لا تعارض، بموعد واحد.", two: "لا تعارض، بموعدين.", few: "لا تعارض، بـ {n} مواعيد.", many: "لا تعارض، بـ {n} موعدًا.", other: "لا تعارض، بـ {n} موعد." } as Forms,
      greedy: (e: string, n: string) => `الجشع: يأخذ امتحان ${e} أول موعد خالٍ من التعارض، ${n}.`,
      finished: { greedy: "انتهت الطريقة الجشعة.", dsatur: "انتهى DSatur." } as Record<"greedy" | "dsatur", string>,
      dsatur: (e: string, n: string) => `DSatur: التالي امتحان ${e}، لأن جيرانه يستخدمون أكثر عدد من المواعيد المختلفة. يأخذ ${n}.`,
    },
    fewestIs: (k: string, list: string) => `يكفي ${k}، والأقل مستحيل: ${list} تتعارض كلها مع بعضها، فيحتاج كل منها إلى موعد خاص.`,
    fewestNone: "لا يتعارض أي امتحانين، فيكفي موعد واحد.", slots: { one: "موعد واحد", two: "موعدان", few: "{n} مواعيد", many: "{n} موعدًا", other: "{n} موعد" } as Forms,
    try1: "اضغط «الجشع (بترتيب القائمة)»: نزولًا في القائمة، يأخذ كل امتحان أول موعد خالٍ. يحتاج إلى ٤ مواعيد.",
    try2: "اضغط «DSatur»: يختار دائمًا الامتحان الأصعب في التوزيع. ٣ مواعيد. ثم اضغط «ما أقل عدد من المواعيد؟»: ٣ هو الأقل، لأن امتحانات عمر الثلاثة تتعارض كلها.",
    try3: "ألغِ تحديد عمر: تتغيّر خريطة التعارضات. لوّنها بنفسك: كم موعدًا تحتاج الآن؟",
    takeaway: "جداول الامتحانات وترددات الراديو ومواعيد المباريات كلها تلوين مخطّطات. وإيجاد أقل عدد من الألوان صعب عمومًا، لذا تستخدم المدارس قواعد جيدة مثل DSatur، وتثبت برامج الحل الإجابة بالبحث. ومجموعة تتعارض كلها (زمرة) تبيّن أن الأقل مستحيل.",
  },
};

export default function Colouring({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [on, setOn] = useState<Set<string>>(() => new Set(PUPILS.map((p) => p.id)));
  const [slots, setSlots] = useState<number[]>(() => EXAMS.map(() => 0));
  const [anim, setAnim] = useState<{ kind: "greedy" | "dsatur"; frames: { exam: number; slots: number[] }[]; at: number } | null>(null);
  const [showFew, setShowFew] = useState(false);
  const es = useMemo(() => edges(PUPILS.filter((p) => on.has(p.id))), [on]);
  const few = useMemo(() => (showFew ? fewest(es) : null), [es, showFew]);
  const clique = useMemo(() => (showFew ? biggestClique(es) : []), [es, showFew]);
  const bad = clashes(es, slots), k = used(slots), left = slots.filter((x) => !x).length;
  const [seen, setSeen] = useState(new Set<string>());
  useEffect(() => { if (seen.has("you") && seen.has("algo")) onDone?.(); }, [seen.has("you") && seen.has("algo")]); // eslint-disable-line react-hooks/exhaustive-deps
  const mark = (x: string) => setSeen((v) => (v.has(x) ? v : new Set(v).add(x)));
  const animRef = useRef(anim); animRef.current = anim;
  const lastAt = useRef(0);
  const loop = useLoop(() => {
    const now = performance.now(), a = animRef.current;
    if (!a) return false;
    if (lastAt.current && now - lastAt.current < 800) return true;
    lastAt.current = now;
    const at = a.at + 1;
    if (at >= a.frames.length) return false;
    const next = { ...a, at }; animRef.current = next; setAnim(next); setSlots(a.frames[at].slots);
    return at < a.frames.length - 1;
  }, { maxPerFrame: 1 });
  const play = (kind: "greedy" | "dsatur") => { loop.stop(); const frames = (kind === "greedy" ? greedy : dsatur)(es); setSlots(EXAMS.map(() => 0)); const a = { kind, frames, at: -1 }; animRef.current = a; setAnim(a); lastAt.current = 0; mark("algo"); loop.start(); };
  const cycle = (i: number) => { loop.stop(); setAnim(null); mark("you"); setSlots((x) => x.map((v, j) => (j === i ? (v + 1) % (MAX_SLOTS + 1) : v))); };
  const name = (i: number) => s.exam[EXAMS[i]];
  const cur = anim && anim.at >= 0 ? anim.frames[anim.at] : null;
  const animating = !!(cur && anim && anim.at < anim.frames.length - 1);
  const caption = animating ? s.cap[anim!.kind](name(cur!.exam), s.slot(num(cur!.slots[cur!.exam])))
    : bad.length ? count(bad.length, s.cap.clash)
    : left === EXAMS.length ? s.cap.you
    : left ? count(left, s.cap.todo)
    : `${anim && cur ? `${s.cap.finished[anim.kind]} ` : ""}${count(k, s.cap.ok)}`;
  const pick = (x: number, y: number) => { const i = SPOTS.findIndex(([a, b]) => Math.hypot(a - x, b - y) < 1); if (i >= 0) cycle(i); };
  const inClique = new Set(clique);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 10]} y={[0, 10]} ticks={0} height={300} label={s.map} onPick={pick}>
            {({ px, py }) => <>
              {es.map(([a, b]) => <line key={`${a}-${b}`} x1={px(SPOTS[a][0])} y1={py(SPOTS[a][1])} x2={px(SPOTS[b][0])} y2={py(SPOTS[b][1])} className={slots[a] && slots[a] === slots[b] ? "lb-clash-line is-clash" : inClique.has(a) && inClique.has(b) ? "lb-clash-line is-strong" : "lb-clash-line"} />)}
              {SPOTS.map(([x, y], i) => {
                const ly = py(y) + (y > 5 ? -22 : 32); // names outside the ring
                return <g key={i}>
                  <circle cx={px(x)} cy={py(y)} r={15} className={`lb-exam-dot lb-slot-${slots[i]}${cur?.exam === i ? " is-on" : ""}`} />
                  <text x={px(x)} y={py(y) + 5} textAnchor="middle" className="lb-vil-num">{slots[i] ? num(slots[i]) : ""}</text>
                  <text x={px(x)} y={ly} textAnchor="middle" className="lb-plot-label is-on">{name(i)}</text>
                </g>;
              })}
            </>}
          </Plot>
          <p className="lb-note">{s.map}</p>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.examsH}</span>
          <div className="lb-exams">
            {EXAMS.map((e, i) => <button key={e} type="button" className="lb-exam" aria-label={`${name(i)}: ${slots[i] ? s.slot(num(slots[i])) : s.noSlot}`} onClick={() => cycle(i)}><span className={`lb-swatch lb-slot-${slots[i]}`} aria-hidden>{slots[i] ? num(slots[i]) : ""}</span>{name(i)}</button>)}
          </div>
          <div className="lb-row">
            <Button size="sm" variant="secondary" icon="play" onClick={() => play("greedy")}>{s.greedy}</Button>
            <Button size="sm" variant="secondary" icon="play" onClick={() => play("dsatur")}>{s.dsatur}</Button>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => { loop.stop(); setAnim(null); setSlots(EXAMS.map(() => 0)); }}>{s.clear}</Button>
          </div>
          <p className={bad.length ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{caption}</p>
          <Stats items={[{ label: s.used, value: num(k) }, { label: s.clashes, value: num(bad.length) }, { label: s.left, value: num(left) }]} />
          <div className="lb-row"><Button size="sm" icon="target" onClick={() => setShowFew(true)}>{s.fewest}</Button></div>
          {few && <p className="lb-note">{clique.length > 1 ? s.fewestIs(count(few.k, s.slots), clique.map(name).join(s.list)) : s.fewestNone}</p>}
          <span className="dr-field-label">{s.pupilsH}</span>
          {PUPILS.map((p) => (
            <button key={p.id} type="button" className={on.has(p.id) ? "lb-switch lb-opt-switch is-on" : "lb-switch lb-opt-switch"} aria-pressed={on.has(p.id)} onClick={() => { loop.stop(); setAnim(null); setOn((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }}><span className="lb-switch-knob" aria-hidden /><span>{s.takes(s.pupil[p.id], p.exams.map(name).join(s.list))}</span></button>
          ))}
        </div>
      </div>
    </LabShell>
  );
}
