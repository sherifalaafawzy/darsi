import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { CLASSES, firstCome, hungarian, SCORES, TEACHERS, TOP, total, type Klass, type Step, type Teacher } from "./model";

const S = {
  en: {
    intro: "Five teachers, five classes. The table says how well each teacher suits each class, from 0 to 9. Each class needs one teacher and each teacher takes one class. What is the best total?",
    teacher: { amina: "Amina", karim: "Karim", leila: "Leila", yusuf: "Yusuf", zainab: "Zainab" } as Record<Teacher, string>,
    klass: { maths5: ["Maths", "grade 5"], science6: ["Science", "grade 6"], english7: ["English", "grade 7"], history8: ["History", "grade 8"], art9: ["Art", "grade 9"] } as Record<Klass, [string, string]>,
    table: "How well each teacher suits each class (0 to 9; you can change them)", cell: (t: string, c: string) => `${t}, ${c}`,
    fcH: "First come, first served", fc: "Let them choose in turn", fcNote: "Each teacher in turn, from the top, takes their favourite class still free.",
    hH: "The Hungarian method", total: "Total", pairs: "Pairs", gets: (t: string, c: string, v: string) => `${t}: ${c} (${v})`,
    step: {
      start: (top: string) => `Each score becomes a shortfall from ${top} (${top} minus the score). The smallest total shortfall is the biggest total score.`,
      rows: "Take each row's smallest number off the whole row. Every teacher now has a zero: their best class.",
      cols: "Take each column's smallest number off the whole column. Every class now has a zero too.",
      cover: (k: string, l: string) => `Only ${k} zeros can be chosen with one in each row and column (circled), so ${l} lines (shaded) cover every zero. Not yet enough.`,
      adjust: (m: string) => `The smallest number not under a line is ${m}. Take it off every number not under a line, and add it where two lines cross. New zeros appear.`,
      done: "Now one zero in every row and column can be chosen: those are the pairs, the best total there is.",
    },
    stepN: (a: string, b: string) => `Step ${a} of ${b}`, fcTotal: "First come", bestTotal: "Hungarian",
    lost: (n: string) => `First come, first served gives away ${n} points: an early choice took another teacher's only good class.`,
    lostHere: (n: string) => `First come, first served gives away ${n} points: Amina takes maths first, so Karim, who is only good at maths, gets a class he can hardly teach.`,
    same: "This time first come, first served is just as good.",
    try1: "Press “Let them choose in turn”: Amina picks maths, and the rest follow: a total of 29.",
    try2: "Press Run (or One step) to watch the Hungarian method: rows and columns lose their smallest numbers, lines cover the zeros, and after a few rounds the best pairs appear: 39.",
    try3: "Change Karim's maths score from 9 to 5, and run both again: does choosing in turn still lose?",
    takeaway: "The assignment problem pairs people with jobs, buses with routes, or pupils with projects. Choosing in turn can be far from the best, because an early choice takes away someone else's only good option. The Hungarian method (1955) always finds the best total, fast.",
  },
  ar: {
    intro: "خمسة معلّمين وخمسة صفوف. يبيّن الجدول مدى ملاءمة كل معلّم لكل صف، من ٠ إلى ٩. يحتاج كل صف إلى معلّم واحد، ويأخذ كل معلّم صفًا واحدًا. فما أفضل مجموع؟",
    teacher: { amina: "أمينة", karim: "كريم", leila: "ليلى", yusuf: "يوسف", zainab: "زينب" } as Record<Teacher, string>,
    klass: { maths5: ["رياضيات", "الصف ٥"], science6: ["علوم", "الصف ٦"], english7: ["إنجليزي", "الصف ٧"], history8: ["تاريخ", "الصف ٨"], art9: ["فنون", "الصف ٩"] } as Record<Klass, [string, string]>,
    table: "مدى ملاءمة كل معلّم لكل صف (من ٠ إلى ٩، ويمكنك تغييرها)", cell: (t: string, c: string) => `${t}، ${c}`,
    fcH: "من يسبق يختار", fc: "دعهم يختارون بالدور", fcNote: "يأخذ كل معلّم بدوره، من الأعلى، الصف المفضّل لديه من الصفوف الباقية.",
    hH: "الطريقة الهنغارية", total: "المجموع", pairs: "الأزواج", gets: (t: string, c: string, v: string) => `${t}: ${c} (${v})`,
    step: {
      start: (top: string) => `تتحوّل كل درجة إلى نقص عن ${top} (${top} ناقص الدرجة). وأصغر مجموع للنقص هو أكبر مجموع للدرجات.`,
      rows: "اطرح أصغر رقم في كل صف من الصف كله. صار لكل معلّم صفر: أنسب صف له.",
      cols: "اطرح أصغر رقم في كل عمود من العمود كله. صار لكل صف دراسي صفر أيضًا.",
      cover: (k: string, l: string) => `يمكن اختيار ${k} أصفار فقط بحيث يكون واحد في كل صف وعمود (المحاطة بدائرة)، لذا تغطي ${l} خطوط (المظلّلة) كل الأصفار. لم يكفِ ذلك بعد.`,
      adjust: (m: string) => `أصغر رقم غير مغطّى بخط هو ${m}. اطرحه من كل رقم غير مغطّى، وأضفه حيث يتقاطع خطان. تظهر أصفار جديدة.`,
      done: "الآن يمكن اختيار صفر واحد في كل صف وكل عمود: هذه هي الأزواج، وهي أفضل مجموع ممكن.",
    },
    stepN: (a: string, b: string) => `الخطوة ${a} من ${b}`, fcTotal: "من يسبق يختار", bestTotal: "الهنغارية",
    lost: (n: string) => `«من يسبق يختار» يضيّع ${n} من النقاط: أخذ خيار مبكر الصف الجيد الوحيد لمعلّم آخر.`,
    lostHere: (n: string) => `«من يسبق يختار» يضيّع ${n} من النقاط: تأخذ أمينة الرياضيات أولًا، فيحصل كريم، الذي لا يُحسن إلا الرياضيات، على صف لا يكاد يستطيع تدريسه.`,
    same: "هذه المرة «من يسبق يختار» جيد بالقدر نفسه.",
    try1: "اضغط «دعهم يختارون بالدور»: تختار أمينة الرياضيات، ثم يتبعها الباقون: المجموع ٢٩.",
    try2: "اضغط «شغّل» (أو «خطوة واحدة») لتشاهد الطريقة الهنغارية: تفقد الصفوف والأعمدة أصغر أرقامها، وتغطّي الخطوط الأصفار، وبعد بضع جولات تظهر أفضل الأزواج: ٣٩.",
    try3: "غيّر درجة كريم في الرياضيات من ٩ إلى ٥، وشغّل الطريقتين من جديد: هل ما زال الاختيار بالدور يخسر؟",
    takeaway: "مسألة التعيين تقرن الناس بالأعمال، أو الحافلات بالطرق، أو التلاميذ بالمشاريع. وقد يكون الاختيار بالدور بعيدًا عن الأفضل، لأن خيارًا مبكرًا قد يأخذ من شخص آخر خياره الجيد الوحيد. أما الطريقة الهنغارية (١٩٥٥) فتجد دائمًا أفضل مجموع، وبسرعة.",
  },
};

export default function Assign({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [scores, setScores] = useState(() => SCORES.map((r) => r.slice()));
  const [fc, setFc] = useState(false);
  const [at, setAt] = useState(0);
  const steps = useMemo(() => hungarian(scores), [scores]);
  const st: Step = steps[Math.min(at, steps.length - 1)];
  const finished = at >= steps.length - 1;
  const fcPairs = useMemo(() => firstCome(scores), [scores]);
  const bestPairs = steps[steps.length - 1].pairs, best = total(scores, bestPairs), fcv = total(scores, fcPairs);
  useEffect(() => { if (fc && finished) onDone?.(); }, [fc && finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastAt = useRef(0), atRef = useRef(at);
  atRef.current = at;
  const loop = useLoop(() => {
    const now = performance.now();
    if (now - lastAt.current < 1400) return true;
    lastAt.current = now;
    const next = Math.min(atRef.current + 1, steps.length - 1);
    atRef.current = next; setAt(next);
    return next < steps.length - 1;
  }, { maxPerFrame: 1 });
  const edit = (r: number, c: number, v: number) => { loop.stop(); setAt(0); setScores((x) => x.map((row, i) => (i === r ? row.map((y, j) => (j === c ? v : y)) : row))); };
  const cls = (c: number) => s.klass[CLASSES[c]].join(" ");
  const caption = st.kind === "cover" ? s.step.cover(num(st.pairs.filter((c) => c >= 0).length), num(st.n ?? 0)) : st.kind === "adjust" ? s.step.adjust(num(st.n ?? 0)) : st.kind === "start" ? s.step.start(num(TOP)) : s.step[st.kind];
  const pairList = (pairs: number[]) => <ul className="lb-meal">{pairs.map((c, r) => <li key={r}><span>{s.teacher[TEACHERS[r]]}</span><span>{s.klass[CLASSES[c]][0]} ({num(scores[r][c])})</span></li>)}</ul>;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <span className="dr-field-label">{s.table}</span>
      <div className="lb-scroll">
        <table className="lb-table lb-matrix-table lb-assign">
          <thead><tr><th />{CLASSES.map((c) => <th key={c}>{s.klass[c][0]}<br /><small>{s.klass[c][1]}</small></th>)}</tr></thead>
          <tbody>{TEACHERS.map((t, r) => (
            <tr key={t}><th>{s.teacher[t]}</th>{CLASSES.map((c, j) => (
              <td key={c} className={finished && bestPairs[r] === j ? "is-pick" : undefined}>
                <input type="number" className="dr-field-input lb-num" min={0} max={9} step={1} value={scores[r][j]} aria-label={s.cell(s.teacher[t], cls(j))}
                  onChange={(e) => edit(r, j, Math.max(0, Math.min(9, Math.round(Number(e.target.value) || 0))))} />
              </td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
      <div className="lb-two">
        <div className="stack">
          <h3 className="lb-h">{s.fcH}</h3>
          <p className="lb-note">{s.fcNote}</p>
          <div className="lb-row"><Button size="sm" variant="secondary" onClick={() => setFc(true)}>{s.fc}</Button></div>
          {fc && <>{pairList(fcPairs)}<p className="lb-verdict">{s.total}: {num(fcv)}</p></>}
        </div>
        <div className="stack">
          <h3 className="lb-h">{s.hH}</h3>
          <RunBar running={loop.running} onToggle={() => { if (finished) setAt(0); lastAt.current = performance.now(); loop.toggle(); }} onStep={() => setAt((a) => Math.min(a + 1, steps.length - 1))} onReset={() => { loop.stop(); setAt(0); }} />
          <p className="lb-note">{s.stepN(num(Math.min(at, steps.length - 1) + 1), num(steps.length))}</p>
          <div className="lb-scroll">
            <table className="lb-hung">
              <thead><tr><th />{CLASSES.map((c) => <th key={c}>{s.klass[c][0]}</th>)}</tr></thead>
              <tbody>{st.m.map((row, r) => (
                <tr key={r}><th>{s.teacher[TEACHERS[r]]}</th>{row.map((v, c) => {
                  const line = st.coverRows[r] || st.coverCols[c], cross = st.coverRows[r] && st.coverCols[c];
                  return <td key={c} className={[v === 0 && "is-zero", st.pairs[r] === c && "is-pick", line && "is-line", cross && "is-cross"].filter(Boolean).join(" ") || undefined}>{num(v)}</td>;
                })}</tr>
              ))}</tbody>
            </table>
          </div>
          <p className="lb-note" aria-live="polite">{caption}</p>
          {finished && <>{pairList(bestPairs)}<p className="lb-verdict">{s.total}: {num(best)}</p></>}
        </div>
      </div>
      {fc && finished && <>
        <Stats items={[{ label: s.fcTotal, value: num(fcv) }, { label: s.bestTotal, value: num(best) }]} />
        <p className={fcv < best ? "lb-verdict is-warn" : "lb-verdict"}>{fcv < best ? (scores.every((row, r) => row.every((v, c) => v === SCORES[r][c])) ? s.lostHere : s.lost)(num(best - fcv)) : s.same}</p>
      </>}
    </LabShell>
  );
}
