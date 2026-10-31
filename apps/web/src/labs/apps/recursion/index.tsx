import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { CodeBlock } from "../../../code/CodeBlock";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { at, calls, fewestMoves, fibCalls, fibCallsRemembered, hanoi, layout, move, solved, startPegs, type Call, type Fn, type Pegs } from "./model";

const C = (t: string) => <code className="lb-rec-code" dir="ltr">{t}</code>;
const call = (fn: Fn, n: number) => C(`${fn}(${n})`);

const S = {
  en: {
    intro: "A recursive function solves a problem by calling itself on a smaller one, until the problem is small enough to answer at once. Each call waits on the call stack for the answers it needs.",
    show: "Show", fact: "Factorial", fib: "Fibonacci", hanoi: "Towers of Hanoi", n: "n",
    back: "Back", next: "Next", play: "Play", pause: "Pause", again: "Start again", step: (k: string, total: string) => `Step ${k} of ${total}`,
    start: "Press Next to make the first call.",
    callBase: (c: ReactNode) => <>{c} is called. It is small enough to answer straight away.</>,
    callWait: (c: ReactNode, need: ReactNode) => <>{c} is called. It needs {need} first, so it waits on the stack.</>,
    retBase: (c: ReactNode, v: string) => <>{c} answers {v}.</>,
    retFact: (c: ReactNode, n: string, sub: string, v: string) => <>{c} answers {n} × {sub} = {v} and leaves the stack.</>,
    retFib: (c: ReactNode, a: string, b: string, v: string) => <>{c} answers {a} + {b} = {v} and leaves the stack.</>,
    and: " and ", waiting: (n: string) => `Waiting on the stack: ${n}`, callsSoFar: (k: string, total: string) => `Calls so far: ${k} of ${total}`,
    repeats: (c: ReactNode, k: string) => <>{c} has now been worked out {k}.</>, times: { one: "once", two: "twice", other: "{n} times" } as Forms, tree: "The tree of calls: each circle is one call, with its n",
    table: <>Calls needed for {C("fib(n)")}</> as ReactNode, plain: "Calling itself", memo: "Remembering answers",
    discs: "Discs", pegs: "The three pegs: tap one to pick up its top disc, then another to put it down", peg: (k: string, d: string) => `Peg ${k}, ${d} discs`,
    goal: "Move the whole tower to peg 3. Only one disc at a time, never a bigger disc on a smaller one.",
    holding: (k: string) => `Holding the top disc of peg ${k}: tap where to put it.`, illegal: "Not allowed: a bigger disc can't go on a smaller one.",
    moves: (k: string) => `Moves: ${k}`, fewest: "Fewest possible:", solve: "Let recursion solve it", stop: "Stop",
    won: (k: string) => `Solved in ${k} moves!`, wonBest: "That is the fewest possible.",
    how: "To move n discs: move the top n − 1 out of the way, move the biggest across, then move the n − 1 back on top. Each disc you add doubles the work, plus one.",
    try1: "In Factorial, press Next until the stack is deepest: every call is waiting. Then watch the answers come back up.",
    try2: <>In Fibonacci with n = 5, step to the end: {C("fib(2)")} is worked out 3 times. The table shows where this leads.</> as ReactNode,
    try3: "Solve 3 discs by hand in 7 moves, then add one disc and let recursion solve it: 15 moves, about twice as many.",
    takeaway: "Recursion is a short way to write “do the smaller job, then finish”. It needs a case small enough to answer at once, or it never stops. And it can repeat work: remembering answers turns Fibonacci's millions of calls into a few dozen.",
  },
  ar: {
    intro: "تحلّ الدالة الذاتية الاستدعاء مسألةً باستدعاء نفسها على مسألة أصغر، حتى تصير المسألة صغيرة بما يكفي لإجابتها فورًا. وكل استدعاء ينتظر في مكدّس الاستدعاءات الإجابات التي يحتاج إليها.",
    show: "اعرض", fact: "المضروب", fib: "فيبوناتشي", hanoi: "أبراج هانوي", n: "n",
    back: "رجوع", next: "التالي", play: "شغّل", pause: "أوقف مؤقتًا", again: "ابدأ من جديد", step: (k: string, total: string) => `الخطوة ${k} من ${total}`,
    start: "اضغط «التالي» لإجراء أول استدعاء.",
    callBase: (c: ReactNode) => <>استُدعيت {c}. وهي صغيرة بما يكفي لتُجاب فورًا.</>,
    callWait: (c: ReactNode, need: ReactNode) => <>استُدعيت {c}. وهي تحتاج أولًا إلى {need}، فتنتظر في المكدّس.</>,
    retBase: (c: ReactNode, v: string) => <>أجابت {c} بـ{v}.</>,
    retFact: (c: ReactNode, n: string, sub: string, v: string) => <>أجابت {c} بـ{n} × {sub} = {v}، وغادرت المكدّس.</>,
    retFib: (c: ReactNode, a: string, b: string, v: string) => <>أجابت {c} بـ{a} + {b} = {v}، وغادرت المكدّس.</>,
    and: " و", waiting: (n: string) => `المنتظرة في المكدّس: ${n}`, callsSoFar: (k: string, total: string) => `الاستدعاءات حتى الآن: ${k} من ${total}`,
    repeats: (c: ReactNode, k: string) => <>حُسبت {c} حتى الآن {k}.</>, times: { one: "مرة واحدة", two: "مرتين", few: "{n} مرات", many: "{n} مرة", other: "{n} مرة" } as Forms, tree: "شجرة الاستدعاءات: كل دائرة استدعاء واحد، وفيها قيمة n",
    table: <>عدد الاستدعاءات اللازمة لـ{C("fib(n)")}</> as ReactNode, plain: "باستدعاء نفسها", memo: "بتذكّر الإجابات",
    discs: "الأقراص", pegs: "الأوتاد الثلاثة: انقر وتدًا لترفع قرصه العلوي، ثم وتدًا آخر لتضعه", peg: (k: string, d: string) => `الوتد ${k}، الأقراص: ${d}`,
    goal: "انقل البرج كله إلى الوتد ٣. قرصًا واحدًا في كل مرة، ولا تضع أبدًا قرصًا كبيرًا فوق قرص أصغر منه.",
    holding: (k: string) => `ترفع القرص العلوي من الوتد ${k}: انقر حيث تريد وضعه.`, illegal: "غير مسموح: لا يوضع قرص كبير فوق قرص أصغر منه.",
    moves: (k: string) => `النقلات: ${k}`, fewest: "أقل عدد ممكن:", solve: "دع الاستدعاء الذاتي يحلّها", stop: "أوقف",
    won: (k: string) => `حللتها في ${k} من النقلات!`, wonBest: "وهذا أقل عدد ممكن.",
    how: "لنقل n من الأقراص: انقل الأقراص n − 1 العلوية بعيدًا، ثم انقل القرص الأكبر، ثم أعد الأقراص n − 1 فوقه. وكل قرص تضيفه يضاعف العمل ويزيده نقلة.",
    try1: "في «المضروب»، اضغط «التالي» حتى يصير المكدّس في أعمق حالاته: كل الاستدعاءات تنتظر. ثم راقب الإجابات وهي تعود صاعدة.",
    try2: <>في «فيبوناتشي» مع n = ٥، تقدّم حتى النهاية: تُحسب {C("fib(2)")} ثلاث مرات. ويبيّن الجدول إلى أين يقود هذا.</> as ReactNode,
    try3: "حُلّ ٣ أقراص بيدك في ٧ نقلات، ثم أضِف قرصًا ودع الاستدعاء الذاتي يحلّها: ١٥ نقلة، أي نحو الضعف.",
    takeaway: "الاستدعاء الذاتي طريقة قصيرة لكتابة «أنجز العمل الأصغر، ثم أكمل». وهو يحتاج إلى حالة صغيرة تُجاب فورًا وإلا لن يتوقّف أبدًا. وقد يكرّر العمل: فتذكّر الإجابات يحوّل ملايين الاستدعاءات في فيبوناتشي إلى بضع عشرات.",
  },
};

const CODE: Record<Fn, string> = {
  fact: "def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)",
  fib: "def fib(n):\n    if n <= 1:\n        return n\n    return fib(n-1) + fib(n-2)",
};
const LIMIT: Record<Fn, number> = { fact: 7, fib: 6 };
const PACE_MS = 800;

/** Steps through one function's calls: Back, Next, and Play (one event every 0.8 s, stopping at the end). */
function Calls({ fn, onEnd }: { fn: Fn; onEnd: () => void }) {
  const s = useS(S);
  const { num, t } = useI18n();
  const count = usePlural();
  const [n, setN] = useState(fn === "fact" ? 4 : 5);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tr = useMemo(() => calls(fn, n), [fn, n]);
  const total = tr.events.length;
  const { stack, done } = at(tr.events, k);
  useEffect(() => {
    if (!playing) return;
    if (k >= total) { setPlaying(false); return; }
    const id = setTimeout(() => { if (document.hidden) setPlaying(false); else setK(k + 1); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : PACE_MS);
    return () => clearTimeout(id);
  }, [playing, k, total]);
  useEffect(() => { if (k === total) onEnd(); }, [k === total]); // eslint-disable-line react-hooks/exhaustive-deps

  const ev = k ? tr.events[k - 1] : null, c = ev ? tr.calls[ev.id] : null;
  const kids = (x: Call) => x.children.map((id) => tr.calls[id]);
  let said: ReactNode = s.start;
  if (ev && c) {
    if (ev.t === "call") said = c.n <= 1 ? s.callBase(call(fn, c.n)) : s.callWait(call(fn, c.n), fn === "fact" ? call(fn, c.n - 1) : <>{call(fn, c.n - 1)}{s.and}{call(fn, c.n - 2)}</>);
    else if (c.n <= 1) said = s.retBase(call(fn, c.n), num(c.value));
    else if (fn === "fact") said = s.retFact(call(fn, c.n), num(c.n), num(kids(c)[0].value), num(c.value));
    else said = s.retFib(call(fn, c.n), num(kids(c)[0].value), num(kids(c)[1].value), num(c.value));
  }
  const seen = tr.calls.slice(0, tr.events.slice(0, k).filter((e) => e.t === "call").length); // ids are given in call order
  const repeats = c && fn === "fib" ? tr.calls.filter((x) => x.n === c.n && (done.has(x.id) || stack.includes(x.id))).length : 0;

  return (
    <div className="stack">
      <div className="lb-two">
        <CodeBlock text={CODE[fn]} lang="python" />
        <Slider label={s.n} value={n} min={1} max={LIMIT[fn]} onChange={(v) => { setN(v); setK(0); setPlaying(false); }} format={(v) => num(v)} />
      </div>
      <div className="lb-runbar">
        <Button size="sm" variant="secondary" disabled={!k || playing} onClick={() => setK(k - 1)}>{s.back}</Button>
        <Button size="sm" icon="next" disabled={k >= total || playing} onClick={() => setK(k + 1)}>{s.next}</Button>
        <Button size="sm" variant="secondary" icon={playing ? "pause" : "play"} disabled={k >= total && !playing} onClick={() => setPlaying(!playing)}>{playing ? s.pause : s.play}</Button>
        <Button size="sm" variant="ghost" icon="sync" disabled={!k} onClick={() => { setK(0); setPlaying(false); }}>{s.again}</Button>
      </div>
      <p className="lb-note">{s.step(num(k), num(total))}{t("common.sep")}{s.waiting(num(stack.length))}</p>
      <p className="lb-verdict" aria-live="polite">{said}</p>
      {fn === "fact" ? (
        <ol className="lb-rec-chain" aria-label={s.fact}>
          {seen.map((x) => {
            const state = done.has(x.id) ? "is-done" : x.id === stack[stack.length - 1] ? "is-now" : "is-wait";
            return (
              <li key={x.id} className={`lb-rec-call ${state}`} style={{ marginInlineStart: `${x.depth * 12}px` }}>
                {C(done.has(x.id) ? `fact(${x.n}) = ${x.value}` : x.n <= 1 ? `fact(${x.n})` : `fact(${x.n}) = ${x.n} * fact(${x.n - 1})`)}
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          <Tree tr={tr} stack={stack} done={done} label={s.tree} />
          <p className="lb-note">{s.callsSoFar(num(seen.length), num(tr.calls.length))}</p>
          {repeats > 1 && c && <p className="lb-note">{s.repeats(call("fib", c.n), count(repeats, s.times))}</p>}
          <table className="lb-table">
            <caption className="lb-rec-cap">{s.table}</caption>
            <thead><tr><th scope="col">{s.n}</th><th scope="col">{s.plain}</th><th scope="col">{s.memo}</th></tr></thead>
            <tbody>{[5, 10, 20, 30].map((v) => <tr key={v}><td>{num(v)}</td><td>{num(fibCalls(v))}</td><td>{num(fibCallsRemembered(v))}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

const GAP = 26, ROW = 40;
function Tree({ tr, stack, done, label }: { tr: ReturnType<typeof calls>; stack: number[]; done: Set<number>; label: string }) {
  const { x, width, depth } = useMemo(() => layout(tr.calls), [tr]);
  const W = Math.max(220, width * GAP), H = depth * ROW;
  const off = (W - width * GAP) / 2;
  const px = (id: number) => off + (x[id] + 0.5) * GAP, py = (id: number) => ROW / 2 + tr.calls[id].depth * ROW;
  const called = (id: number) => done.has(id) || stack.includes(id);
  const top = stack[stack.length - 1];
  return (
    <svg className="lb-rec-tree" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {tr.calls.filter((c) => c.parent !== null).map((c) => (
        <line key={`e${c.id}`} x1={px(c.parent!)} y1={py(c.parent!)} x2={px(c.id)} y2={py(c.id)} className={called(c.id) ? "lb-rec-edge is-on" : "lb-rec-edge"} />
      ))}
      {tr.calls.map((c) => (
        <g key={c.id} className={`lb-rec-node${done.has(c.id) ? " is-done" : stack.includes(c.id) ? (c.id === top ? " is-now" : " is-wait") : ""}`}>
          <circle cx={px(c.id)} cy={py(c.id)} r={11} />
          <text x={px(c.id)} y={py(c.id) + 4.5} textAnchor="middle">{c.n}</text>
        </g>
      ))}
    </svg>
  );
}

/** The Towers of Hanoi: play by hand, or watch the recursive solution (paced by time, stopping by itself). */
function Hanoi({ onWin }: { onWin: () => void }) {
  const s = useS(S);
  const { num } = useI18n();
  const [n, setN] = useState(3);
  const [pegs, setPegs] = useState<Pegs>(() => startPegs(3));
  const [held, setHeld] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [warn, setWarn] = useState(false);
  const [auto, setAuto] = useState<{ t0: number; plan: [number, number][] } | null>(null);
  const restart = (d = n) => { setN(d); setPegs(startPegs(d)); setHeld(null); setMoves(0); setWarn(false); setAuto(null); };
  const won = solved(pegs, n);
  useEffect(() => { if (won && !auto) onWin(); }, [won]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!auto) return;
    const rate = Math.max(1.5, auto.plan.length / 20); // the solution takes about 20 seconds at most
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => {
      const k = reduce || document.hidden ? auto.plan.length : Math.min(auto.plan.length, Math.floor(((performance.now() - auto.t0) / 1000) * rate) + 1);
      let p = startPegs(n);
      for (const [a, b] of auto.plan.slice(0, k)) p = move(p, a, b)!;
      setPegs(p); setMoves(k);
      if (k >= auto.plan.length) { clearInterval(id); setAuto(null); }
    }, 100);
    return () => clearInterval(id);
  }, [auto, n]);
  const tap = (i: number) => {
    if (auto || won) return;
    if (held === null) { if (pegs[i].length) { setHeld(i); setWarn(false); } return; }
    if (held === i) { setHeld(null); return; }
    const next = move(pegs, held, i);
    if (!next) { setWarn(true); setHeld(null); return; }
    setPegs(next); setMoves(moves + 1); setHeld(null); setWarn(false);
  };
  const best = fewestMoves(n);
  return (
    <div className="stack">
      <Slider label={s.discs} value={n} min={1} max={6} onChange={(v) => restart(v)} format={(v) => num(v)} />
      <p className="lb-note">{s.goal}</p>
      <div className="lb-rec-pegs" dir="ltr" role="group" aria-label={s.pegs}>
        {pegs.map((p, i) => (
          <button key={i} type="button" className={held === i ? "lb-rec-peg is-held" : "lb-rec-peg"} aria-pressed={held === i} disabled={!!auto}
            aria-label={s.peg(num(i + 1), num(p.length))} onClick={() => tap(i)}>
            <span className="lb-rec-rod" aria-hidden />
            {p.map((d, j) => <span key={d} className={`lb-rec-disc${held === i && j === p.length - 1 ? " is-up" : ""}`} style={{ inlineSize: `${30 + (d / 6) * 70}%` }} aria-hidden />)}
            <span className="lb-rec-peg-n" aria-hidden>{num(i + 1)}</span>
          </button>
        ))}
      </div>
      <p className="lb-verdict" aria-live="polite">
        {won ? <>{s.won(num(moves))} {moves === best && s.wonBest}</> : warn ? s.illegal : held !== null ? s.holding(num(held + 1)) : s.moves(num(moves))}
      </p>
      <div className="lb-row">
        <span className="lb-note">{s.fewest}</span>
        <p className="lb-mono" dir="ltr"><bdi>{num(2)}</bdi><sup>{num(n)}</sup> <bdi>−</bdi> <bdi>{num(1)}</bdi> <bdi>=</bdi> <bdi>{num(best)}</bdi></p>
      </div>
      <div className="lb-runbar">
        {auto ? <Button size="sm" variant="secondary" icon="pause" onClick={() => setAuto(null)}>{s.stop}</Button>
          : <Button size="sm" icon="play" onClick={() => { restart(); setAuto({ t0: performance.now(), plan: hanoi(n) }); }}>{s.solve}</Button>}
        <Button size="sm" variant="ghost" icon="sync" onClick={() => restart()}>{s.again}</Button>
      </div>
      <p className="lb-note">{s.how}</p>
    </div>
  );
}

export default function Recursion({ meta, onDone }: LabProps) {
  const s = useS(S);
  const [mode, setMode] = useState<Fn | "hanoi">("fact");
  const [did, setDid] = useState(new Set<string>());
  const mark = (x: string) => setDid((d) => (d.has(x) ? d : new Set(d).add(x)));
  useEffect(() => { if (did.size >= 2) onDone?.(); }, [did.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.show} value={mode} onChange={setMode} options={[["fact", s.fact], ["fib", s.fib], ["hanoi", s.hanoi]]} />
      {mode === "hanoi" ? <Hanoi onWin={() => mark("hanoi")} /> : <Calls key={mode} fn={mode} onEnd={() => mark(mode)} />}
    </LabShell>
  );
}
