import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { PUZZLES, choices, peek, put, simulate, take, type Kind } from "./model";

type Action = { kind: "word"; word: string } | { kind: "bold" } | { kind: "big" } | { kind: "star" };

const S = {
  en: {
    intro: "Stacks and queues both keep things in a line. The only difference is which end things come out of.",
    kind: "Show", stack: "Stack: undo", queue: "Queue: the bank",
    stackIntro: "In a notes app, every change goes on top of the undo stack. Undo takes off the top one: the last thing you did.",
    queueIntro: "At the bank, new customers join the back of the queue and the counter serves the front: first come, first served.",
    note: "Your note", words: ["We", "learn", "something", "new", "every", "day"], type: (w: string) => `Type “${w}”`, bold: "Bold", big: "Bigger", star: "Add a star",
    undo: "Undo (pop)", nothingUndo: "Nothing to undo: the stack is empty.", pile: "The undo stack", top: "top", full: "The stack is full in this lab: undo something first.",
    names: ["Amina", "Tunde", "Sara", "Kofi", "Leila", "Omar", "Grace", "Yusuf"], arrive: "A customer arrives (enqueue)", serve: "Serve the next (dequeue)",
    serving: (n: string, t: string) => `Now serving: ${n}, ticket ${t}.`, nobody: "No one is waiting.", line: "The queue", front: "front", back: "back", fullQ: "The hall is full: serve someone first.",
    size: (n: string) => `Waiting: ${n}`, stackSize: (n: string) => `On the stack: ${n}`,
    puzzle: "What comes out?", puzzleIntro: (k: string) => `These steps run on a ${k}, from the start. What comes out, in order?`,
    stackWord: "stack", queueWord: "queue", push: (x: string) => `push ${x}`, pop: "pop", enqueue: (x: string) => `enqueue ${x}`, dequeue: "dequeue",
    right: "Right!", wrong: "Not quite: the right answer is marked.", why: { stack: "A stack always gives back the newest item.", queue: "A queue always gives back the oldest item." } as Record<Kind, string>,
    nextPuzzle: "Another one",
    try1: "In the stack, type three words, make it bold, then press Undo twice: the bold goes first, then the last word.",
    try2: "In the queue, let four customers arrive, then serve two: the first two to arrive are served first.",
    try3: "Answer “What comes out?” for a stack, then switch to the queue: the same steps give a different order.",
    takeaway: "A stack is last in, first out: undo, the back button, a pile of plates, and the calls a program is waiting on. A queue is first in, first out: printers, messages and anything served in turn.",
  },
  ar: {
    intro: "يحفظ المكدّس والطابور الأشياء في صفّ، والفرق الوحيد بينهما هو الطرف الذي تخرج منه.",
    kind: "اعرض", stack: "المكدّس: التراجع", queue: "الطابور: البنك",
    stackIntro: "في تطبيق الملاحظات، يوضع كل تغيير فوق مكدّس التراجع. والتراجع يرفع العنصر الذي في الأعلى: آخر شيء فعلته.",
    queueIntro: "في البنك، يقف العملاء الجدد في آخر الطابور، ويخدم الموظف من في أوله: من يأتي أولًا يُخدم أولًا.",
    note: "ملاحظتك", words: ["نتعلّم", "شيئًا", "جديدًا", "كل", "يوم"], type: (w: string) => `اكتب «${w}»`, bold: "خط عريض", big: "أكبر", star: "أضِف نجمة",
    undo: "تراجع (إخراج)", nothingUndo: "لا شيء للتراجع عنه: المكدّس فارغ.", pile: "مكدّس التراجع", top: "الأعلى", full: "امتلأ المكدّس في هذا المختبر: تراجع عن شيء أولًا.",
    names: ["أمينة", "تندي", "سارة", "كوفي", "ليلى", "عمر", "غريس", "يوسف"], arrive: "وصل عميل (إضافة إلى الطابور)", serve: "اخدم التالي (إخراج من الطابور)",
    serving: (n: string, t: string) => `يُخدم الآن: ${n}، رقم ${t}.`, nobody: "لا أحد ينتظر.", line: "الطابور", front: "الأول", back: "الأخير", fullQ: "امتلأت القاعة: اخدم أحدًا أولًا.",
    size: (n: string) => `المنتظرون: ${n}`, stackSize: (n: string) => `في المكدّس: ${n}`,
    puzzle: "ماذا يخرج؟", puzzleIntro: (k: string) => `تُنفَّذ هذه الخطوات على ${k} من البداية. ماذا يخرج، وبأي ترتيب؟`,
    stackWord: "مكدّس", queueWord: "طابور", push: (x: string) => `أضِف ${x}`, pop: "أخرِج", enqueue: (x: string) => `أضِف ${x}`, dequeue: "أخرِج",
    right: "صحيح!", wrong: "ليس تمامًا: الإجابة الصحيحة مميّزة.", why: { stack: "المكدّس يعيد دائمًا أحدث عنصر.", queue: "الطابور يعيد دائمًا أقدم عنصر." } as Record<Kind, string>,
    nextPuzzle: "سؤال آخر",
    try1: "في المكدّس، اكتب ثلاث كلمات واجعلها بخط عريض، ثم اضغط «تراجع» مرتين: يُلغى الخط العريض أولًا، ثم آخر كلمة.",
    try2: "في الطابور، دع أربعة عملاء يصلون، ثم اخدم اثنين: أول اثنين وصلا هما أول من يُخدم.",
    try3: "أجب عن «ماذا يخرج؟» للمكدّس، ثم انتقل إلى الطابور: الخطوات نفسها تعطي ترتيبًا مختلفًا.",
    takeaway: "المكدّس: آخر من يدخل أول من يخرج، كالتراجع وزر الرجوع وكومة الصحون والاستدعاءات التي ينتظرها البرنامج. والطابور: أول من يدخل أول من يخرج، كالطابعات والرسائل وكل ما يُخدم بالدور.",
  },
};
const MAX = 8;

export default function Stack({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [kind, setKind] = useState<Kind>("stack");
  const [actions, setActions] = useState<Action[]>([]);
  const [undone, setUndone] = useState<Action | null | "none">(null);
  const [people, setPeople] = useState<{ name: string; ticket: number }[]>([]);
  const [arrived, setArrived] = useState(0);
  const [served, setServed] = useState<{ name: string; ticket: number } | null | "none">(null);
  const [pz, setPz] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const ops = PUZZLES[pz % PUZZLES.length];
  const opts = useMemo(() => choices(kind, ops, pz + (kind === "queue" ? 2 : 1)), [kind, ops, pz]);
  const right = simulate(kind, ops).join();
  useEffect(() => { if (score >= 2) onDone?.(); }, [score >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = actions.filter((a) => a.kind === "word").length;
  const nextWord = s.words[words % s.words.length];
  const flip = (k: Action["kind"]) => actions.filter((a) => a.kind === k).length % 2 === 1;
  const label = (a: Action) => (a.kind === "word" ? s.type(a.word) : a.kind === "bold" ? s.bold : a.kind === "big" ? s.big : s.star);
  const push = (a: Action) => { if (actions.length < MAX) { setActions(put(actions, a)); setUndone(null); } };
  const pop = () => { const r = take("stack", actions); setActions(r.rest); setUndone(r.item ?? "none"); };
  const arrive = () => { if (people.length < MAX) { setPeople(put(people, { name: s.names[arrived % s.names.length], ticket: arrived + 1 })); setArrived(arrived + 1); } };
  const serve = () => { const r = take("queue", people); setPeople(r.rest); setServed(r.item ?? "none"); };
  const top = peek("stack", actions);
  const opLabel = (x: string | null) => (x === null ? (kind === "stack" ? s.pop : s.dequeue) : kind === "stack" ? s.push(x) : s.enqueue(x));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}
      onReset={() => { setActions([]); setUndone(null); setPeople([]); setArrived(0); setServed(null); setPz(0); setAnswer(null); setScore(0); }}>
      <Segmented label={s.kind} value={kind} onChange={(k) => { setKind(k); setAnswer(null); }} options={[["stack", s.stack], ["queue", s.queue]]} />
      {kind === "stack" ? (
        <div className="lb-two">
          <div className="stack">
            <p className="lb-note">{s.stackIntro}</p>
            <div className={`lb-stack-doc${flip("bold") ? " is-bold" : ""}${flip("big") ? " is-big" : ""}`} aria-label={s.note} role="figure">
              {actions.filter((a) => a.kind === "word").map((a) => (a as { word: string }).word).join(" ")}
              {actions.some((a) => a.kind === "star") && <span aria-hidden> {"⭐".repeat(actions.filter((a) => a.kind === "star").length)}</span>}
              {!actions.length && <span className="lb-note">{s.note}</span>}
            </div>
            <div className="lb-row">
              <Button size="sm" variant="secondary" onClick={() => push({ kind: "word", word: nextWord })}>{s.type(nextWord)}</Button>
              <Button size="sm" variant="secondary" onClick={() => push({ kind: "bold" })}>{s.bold}</Button>
              <Button size="sm" variant="secondary" onClick={() => push({ kind: "big" })}>{s.big}</Button>
              <Button size="sm" variant="secondary" onClick={() => push({ kind: "star" })}>{s.star}</Button>
            </div>
            <Button size="sm" icon="undo" onClick={pop}>{s.undo}</Button>
            <p className="lb-note" aria-live="polite">{actions.length >= MAX ? s.full : undone === "none" ? s.nothingUndo : undone ? `${s.undo}: ${label(undone)}` : ""}</p>
          </div>
          <div className="stack">
            <span className="dr-field-label">{s.pile} <span className="lb-note">{s.stackSize(num(actions.length))}</span></span>
            <ol className="lb-stack-pile" aria-label={s.pile}>
              {actions.map((a, i) => <li key={i} className={a === top ? "lb-stack-item is-top" : "lb-stack-item"}>{label(a)}{a === top && <small>{s.top}</small>}</li>)}
            </ol>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="lb-note">{s.queueIntro}</p>
          <div className="lb-row">
            <Button size="sm" variant="secondary" onClick={arrive}>{s.arrive}</Button>
            <Button size="sm" onClick={serve}>{s.serve}</Button>
          </div>
          <p className="lb-verdict" aria-live="polite">{served === "none" ? s.nobody : served ? s.serving(served.name, num(served.ticket)) : people.length >= MAX ? s.fullQ : " "}</p>
          <span className="dr-field-label">{s.line} <span className="lb-note">{s.size(num(people.length))}</span></span>
          <ol className="lb-stack-line" aria-label={s.line}>
            {people.map((p, i) => (
              <li key={p.ticket} className={i === 0 ? "lb-stack-person is-front" : "lb-stack-person"}>
                <strong>{num(p.ticket)}</strong><span>{p.name}</span>
                {i === 0 ? <small>{s.front}</small> : i === people.length - 1 ? <small>{s.back}</small> : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      <section className="lb-panel" aria-label={s.puzzle}>
        <h3 className="lb-stack-h">{s.puzzle}</h3>
        <p className="lb-note">{s.puzzleIntro(kind === "stack" ? s.stackWord : s.queueWord)}</p>
        <ol className="lb-stack-ops">{ops.map((x, i) => <li key={i} className={x === null ? "is-out" : undefined}>{opLabel(x)}</li>)}</ol>
        <div className="lb-stack-choices">
          {opts.map((c, i) => {
            const ok = c.join() === right;
            const cls = answer === null ? "lb-stack-choice" : ok ? "lb-stack-choice is-right" : answer === i ? "lb-stack-choice is-wrong" : "lb-stack-choice";
            return <button key={c.join()} type="button" className={cls} aria-pressed={answer === i} disabled={answer !== null}
              onClick={() => { setAnswer(i); if (ok) setScore((x) => x + 1); }}><span className="lb-stack-seq">{c.map((x) => <span key={x}>{x}</span>)}</span></button>;
          })}
        </div>
        {answer !== null && (
          <>
            <p className="lb-verdict" role="status">{opts[answer].join() === right ? s.right : s.wrong} {s.why[kind]}</p>
            <Button size="sm" variant="secondary" icon="next" onClick={() => { setPz(pz + 1); setAnswer(null); }}>{s.nextPuzzle}</Button>
          </>
        )}
      </section>
    </LabShell>
  );
}
