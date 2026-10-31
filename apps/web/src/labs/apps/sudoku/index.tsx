import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { bit, boxOf, parse, plain, PUZZLES, smart, type Frame } from "./model";

type Mode = "smart" | "prop" | "plain";
const S = {
  en: {
    intro: "Each row, column and box must hold every digit once. Small digits in a cell are its candidates: the digits still possible there. Watch a computer solve it with rules, and count its guesses.",
    puzzle: "Puzzle", p: { small: "4 × 4", easy: "9 × 9 easy", hard: "9 × 9 hard", trap: "9 × 9, 17 givens" } as Record<string, string>,
    how: "How to solve", smart: "Propagate, then guess", prop: "Propagate only", plain: "Plain backtracking",
    grid: "The sudoku: big digits are placed, small digits are a cell's candidates", at: (r: string, c: string) => `row ${r}, column ${c}`,
    unit: { row: "row", col: "column", box: "box" } as Record<string, string>,
    cap: {
      ready: "Press Run or One step to start.",
      start: (n: string) => `Every given digit is crossed out of its row, column and box: ${n} gone.`,
      remove: (d: string, at: string, n: string) => `The ${d} at ${at} is crossed out of its row, column and box: ${n}.`,
      single: (d: string, at: string) => `Only one left: ${at} can only be ${d}.`,
      hidden: (d: string, u: string, at: string) => `Only one place: in its ${u}, ${d} fits only at ${at}.`,
      guess: (d: string, at: string) => `Stuck, so guess: ${d} at ${at}, the cell with the fewest candidates.`,
      dead: (at: string) => `Dead end at ${at}: nothing fits there.`,
      deadUnit: (d: string, u: string) => `Dead end: ${d} has no place left in a ${u}.`,
      undo: (d: string, at: string) => `Undo the guess ${d} at ${at} and try the next candidate.`,
      done: "Solved!",
      stuck: "Propagation is stuck: every empty cell has two or more candidates. Only a guess can go on from here.",
      plain: "Plain backtracking tries 1, 2, 3… in each empty cell in turn, keeps the first digit that doesn't clash, and goes back to change an earlier cell when nothing fits.",
      plainDone: (n: string) => `Solved after ${n} guesses.`, plainCap: (n: string) => `Gave up after ${n} guesses without finishing.`,
    },
    cands: { one: "1 candidate", other: "{n} candidates" } as Forms,
    guesses: "Guesses", removed: "Crossed out", filled: "Filled", of: (a: string, b: string) => `${a} of ${b}`,
    try1: "Pick 4 × 4 and press One step a few times: each placed digit removes itself from its neighbours' candidates until every cell is down to one. No guess at all; plain backtracking needs 12.",
    try2: "Pick “9 × 9 hard” with “Propagate only” and Run: it gets stuck with 51 digits. With “Propagate, then guess”, 4 guesses finish it; plain backtracking needs 13,528.",
    try3: "Pick “17 givens” and try “Plain backtracking”: it gives up after 100,000 guesses. Propagation solves the same puzzle without guessing once.",
    takeaway: "Constraint solvers don't try every answer. They cross out what is impossible (propagation) and guess only when stuck, undoing guesses that lead to a dead end. Good rules can save millions of guesses. Timetables and delivery plans are solved the same way.",
  },
  ar: {
    intro: "يجب أن يضمّ كل صف وكل عمود وكل مربع كل رقم مرة واحدة. الأرقام الصغيرة في الخانة هي مرشّحاتها: الأرقام التي ما زالت ممكنة فيها. شاهد الحاسوب يحلّها بالقواعد، وعُدّ تخميناته.",
    puzzle: "اللغز", p: { small: "٤ × ٤", easy: "٩ × ٩ سهل", hard: "٩ × ٩ صعب", trap: "٩ × ٩، ١٧ رقمًا معطى" } as Record<string, string>,
    how: "طريقة الحل", smart: "انتشار ثم تخمين", prop: "انتشار فقط", plain: "التراجع البسيط",
    grid: "السودوكو: الأرقام الكبيرة موضوعة، والأرقام الصغيرة مرشّحات الخانة", at: (r: string, c: string) => `الصف ${r}، العمود ${c}`,
    unit: { row: "صفه", col: "عموده", box: "مربعه" } as Record<string, string>,
    cap: {
      ready: "اضغط «شغّل» أو «خطوة واحدة» لتبدأ.",
      start: (n: string) => `يُشطب كل رقم معطى من صفه وعموده ومربعه: حُذف ${n}.`,
      remove: (d: string, at: string, n: string) => `يُشطب الرقم ${d} الذي في ${at} من صفه وعموده ومربعه: ${n}.`,
      single: (d: string, at: string) => `بقي واحد فقط: لا يمكن أن تكون الخانة في ${at} إلا ${d}.`,
      hidden: (d: string, u: string, at: string) => `مكان واحد فقط: في ${u} لا يتّسع الرقم ${d} إلا في ${at}.`,
      guess: (d: string, at: string) => `توقّف الانتشار، فلنخمّن: ${d} في ${at}، الخانة ذات أقل المرشّحات.`,
      dead: (at: string) => `طريق مسدود في ${at}: لا يصلح فيها أي رقم.`,
      deadUnit: (d: string, u: string) => `طريق مسدود: لم يبقَ للرقم ${d} مكان في ${u}.`,
      undo: (d: string, at: string) => `تراجع عن تخمين ${d} في ${at} وجرّب المرشّح التالي.`,
      done: "حُلّ اللغز!",
      stuck: "توقّف الانتشار: لكل خانة فارغة مرشّحان أو أكثر. لا يمكن المتابعة من هنا إلا بتخمين.",
      plain: "يجرّب التراجع البسيط ١ ثم ٢ ثم ٣… في كل خانة فارغة بالترتيب، ويُبقي أول رقم لا يتعارض، ويعود لتغيير خانة سابقة حين لا يصلح شيء.",
      plainDone: (n: string) => `حُلّ بعد ${n} من التخمينات.`, plainCap: (n: string) => `استسلم بعد ${n} من التخمينات دون أن ينتهي.`,
    },
    cands: { one: "مرشّح واحد", two: "مرشّحان", few: "{n} مرشّحات", many: "{n} مرشّحًا", other: "{n} مرشّح" } as Forms,
    guesses: "التخمينات", removed: "المشطوب", filled: "الممتلئ", of: (a: string, b: string) => `${a} من ${b}`,
    try1: "اختر ٤ × ٤ واضغط «خطوة واحدة» بضع مرات: كل رقم يوضع يحذف نفسه من مرشّحات جيرانه حتى يبقى لكل خانة رقم واحد. بلا أي تخمين، بينما يحتاج التراجع البسيط إلى ١٢.",
    try2: "اختر «٩ × ٩ صعب» مع «انتشار فقط» وشغّل: يتوقّف عند ٥١ رقمًا. ومع «انتشار ثم تخمين» تكفي ٤ تخمينات، بينما يحتاج التراجع البسيط إلى ١٣٬٥٢٨.",
    try3: "اختر «١٧ رقمًا معطى» وجرّب «التراجع البسيط»: يستسلم بعد ١٠٠٬٠٠٠ تخمين. أما الانتشار فيحلّ اللغز نفسه دون تخمين واحد.",
    takeaway: "برامج حلّ القيود لا تجرّب كل الإجابات. إنها تشطب المستحيل (الانتشار) ولا تخمّن إلا عند التوقف، وتتراجع عن التخمينات التي تنتهي إلى طريق مسدود. والقواعد الجيدة قد توفّر ملايين التخمينات. وتُحلّ الجداول المدرسية وخطط التوصيل بالطريقة نفسها.",
  },
};

export default function Sudoku({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [pid, setPid] = useState("small");
  const [mode, setMode] = useState<Mode>("smart");
  const puzzle = PUZZLES.find((p) => p.id === pid)!, n = puzzle.n, b = boxOf(n), givens = useMemo(() => parse(puzzle), [puzzle]);
  const run = useMemo(() => (mode === "plain" ? null : smart(n, givens, mode === "smart")), [n, givens, mode]);
  const moves = useMemo(() => (mode === "plain" ? plain(n, givens) : null), [n, givens, mode]);
  const total = run ? run.frames.length : moves!.moves.length;
  const [at, setAt] = useState(-1);
  const atRef = useRef(at); atRef.current = at;
  // Plain backtracking replays moves onto one grid (no copy per move: a run can be 200,000 moves).
  const grid = useRef<number[]>(givens.slice()), applied = useRef(0), tried = useRef(0);
  const [done, setDone] = useState(new Set<string>());
  useEffect(() => { if (at === total - 1 && total > 0) setDone((d) => new Set(d).add(`${pid}-${mode}`)); }, [at, total, pid, mode]);
  useEffect(() => { if (done.size >= 2) onDone?.(); }, [done.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const perSec = run ? Math.max(3, total / 12) : Math.max(30, total / 10);
  const lastAt = useRef(0);
  const loop = useLoop(() => {
    const now = performance.now(), gap = now - lastAt.current;
    if (lastAt.current && gap < 1000 / perSec) return true;
    const k = lastAt.current ? Math.max(1, Math.floor((gap * perSec) / 1000)) : 1;
    lastAt.current = now;
    const next = Math.min(atRef.current + k, total - 1);
    atRef.current = next; setAt(next);
    return next < total - 1;
  }, { maxPerFrame: 1 });
  const restart = () => { loop.stop(); setAt(-1); grid.current = givens.slice(); applied.current = 0; tried.current = 0; };
  // A new puzzle or method starts over at once (in the click, not in an effect, so a quick Run isn't undone).
  const choose = (next: () => void) => { restart(); next(); };

  let v: number[], c: number[] | null = null, f: Frame | null = null;
  const key = `${pid}-${mode}`, gridKey = useRef(key);
  if (gridKey.current !== key) { gridKey.current = key; grid.current = givens.slice(); applied.current = 0; tried.current = 0; }
  if (run) { f = at >= 0 ? run.frames[at] : null; v = f?.v ?? givens; c = f?.c ?? null; }
  else {
    if (at + 1 < applied.current) { grid.current = givens.slice(); applied.current = 0; tried.current = 0; }
    for (; applied.current <= at; applied.current++) { const m = moves!.moves[applied.current]; grid.current[m >> 4] = m & 15; if (m & 15) tried.current++; }
    v = grid.current;
  }
  const rc = (i: number) => s.at(num(Math.floor(i / n) + 1), num((i % n) + 1));
  const caption = !run ? (at < 0 ? s.cap.plain : at >= total - 1 ? (moves!.solved ? s.cap.plainDone : s.cap.plainCap)(num(moves!.guesses)) : s.cap.plain)
    : !f ? s.cap.ready
    : f.kind === "start" ? s.cap.start(count(f.removed ?? 0, s.cands))
    : f.kind === "remove" ? s.cap.remove(num(f.digit!), rc(f.cell!), count(f.removed ?? 0, s.cands))
    : f.kind === "single" ? s.cap.single(num(f.digit!), rc(f.cell!))
    : f.kind === "hidden" ? s.cap.hidden(num(f.digit!), s.unit[f.unit!], rc(f.cell!))
    : f.kind === "guess" ? s.cap.guess(num(f.digit!), rc(f.cell!))
    : f.kind === "dead" ? (f.unit ? s.cap.deadUnit(num(f.digit!), s.unit[f.unit]) : s.cap.dead(rc(f.cell!)))
    : f.kind === "undo" ? s.cap.undo(num(f.digit!), rc(f.cell!))
    : s.cap[f.kind];
  const upTo = run ? run.frames.slice(0, at + 1) : [];
  const guesses = run ? upTo.filter((x) => x.kind === "guess").length : tried.current;
  const removed = upTo.reduce((t, x) => t + (x.kind === "start" || x.kind === "remove" ? x.removed ?? 0 : 0), 0);
  const filled = v.filter(Boolean).length;
  const cell = f?.cell ?? -1;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.puzzle} value={pid} options={PUZZLES.map((p) => [p.id, s.p[p.id]] as const)} onChange={(id) => choose(() => setPid(id))} />
      <Segmented label={s.how} value={mode} options={[["smart", s.smart], ["prop", s.prop], ["plain", s.plain]]} onChange={(m) => choose(() => setMode(m))} />
      <div className="lb-two">
        <div className={`lb-sd is-${n}`} role="img" aria-label={s.grid} dir="ltr">
          {v.map((x, i) => {
            const r = Math.floor(i / n), col = i % n;
            const cls = ["lb-sd-cell", givens[i] ? "is-given" : x ? "is-placed" : "", i === cell ? (f?.kind === "dead" ? "is-dead" : "is-on") : "", col % b === b - 1 && col < n - 1 ? "is-be" : "", r % b === b - 1 && r < n - 1 ? "is-bb" : ""].filter(Boolean).join(" ");
            return (
              <span key={i} className={cls}>
                {x ? num(x) : c ? <span className="lb-sd-cands">{Array.from({ length: n }, (_, d) => <span key={d}>{c![i] & bit(d + 1) ? num(d + 1) : ""}</span>)}</span> : null}
              </span>
            );
          })}
        </div>
        <div className="stack">
          <RunBar running={loop.running} onToggle={() => { if (at >= total - 1) restart(); lastAt.current = 0; loop.toggle(); }} onStep={() => setAt((a) => Math.min(a + 1, total - 1))} onReset={restart} />
          <p className={f?.kind === "dead" || f?.kind === "stuck" || (!run && at >= total - 1 && !moves!.solved) ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{caption}</p>
          <Stats items={[
            { label: s.guesses, value: num(guesses) },
            ...(run ? [{ label: s.removed, value: num(removed) }] : []),
            { label: s.filled, value: s.of(num(filled), num(n * n)) },
          ]} />
        </div>
      </div>
    </LabShell>
  );
}
