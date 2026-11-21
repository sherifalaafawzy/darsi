import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { CLASSES, DEFAULT_RULES, has, LESSONS, PERIODS, RULES, rulesOf, solve, type Klass, type Lesson, type Step, type Subject, type Teacher } from "./model";

const S = {
  en: {
    intro: "Three classes, four periods, four teachers. Every lesson needs a period. A teacher can't be in two classes at once, and a class can't have two lessons at once. The table shows the periods still possible for each lesson.",
    klass: { "5A": "5A", "5B": "5B", "6A": "6A" } as Record<Klass, string>,
    subject: { maths: "Maths", science: "Science", english: "English", art: "Art" } as Record<Subject, string>,
    teacher: { musa: "Mr Musa", huda: "Ms Huda", ali: "Mr Ali", rana: "Ms Rana" } as Record<Teacher, string>,
    rule: { huda: "Ms Huda leaves after period 3", test: "6A's maths test is in period 1", art: "The art room holds an exam in period 3", lab: "The lab is busy in period 1" } as Record<string, string>,
    rulesH: "Extra rules", how: "How to search", prop: "Propagate and search", plain: "Plain backtracking",
    lessonH: "Lesson", period: (p: string) => `Period ${p}`, p: (p: string) => `P${p}`, cellOk: "possible", cellNo: "crossed out", cellSet: "chosen",
    gridLabel: "Each lesson's possible periods: a tick is possible, a dash is crossed out, a filled cell is chosen",
    cap: {
      ready: "Press Run or One step to start.",
      rule: (r: string, n: string) => `${r}: ${n} crossed out.`,
      prune: (l: string, p: string, n: string) => `${l} can only be in period ${p}, so period ${p} is crossed out for ${n} that share its teacher or class.`,
      guess: (l: string, p: string) => `Stuck: no lesson is down to one period. Guess: put ${l} in period ${p} (it has the fewest periods left).`,
      try: (l: string, p: string) => `Try ${l} in period ${p}.`,
      dead: (l: string) => `Dead end: ${l} has no period left.`,
      clash: (l: string, p: string, o: string) => `Clash: ${l} in period ${p} meets ${o}.`,
      undo: (l: string, p: string) => `Undo: ${l} can't be in period ${p} after all.`,
      done: "Every lesson has a period: the timetable is ready.",
      none: "Every guess led to a dead end: no timetable keeps all these rules.",
    },
    periods: { one: "{n} period", other: "{n} periods" } as Forms, lessons: { one: "1 lesson", other: "{n} lessons" } as Forms,
    guesses: "Guesses", undos: "Dead ends", removed: "Crossed out", stepN: "Step",
    result: "The timetable", outOf: (a: string, b: string) => `${a} of ${b}`,
    try1: "Press One step a few times: the rules cross periods out, and every lesson with one period left takes it away from the lessons that share its teacher or class.",
    try2: "Press Run: propagation alone gets stuck, so search guesses, meets 3 dead ends and undoes them: 8 guesses in all. Then choose “Plain backtracking” and Run: 389 guesses for the same timetable.",
    try3: "Tick “The art room holds an exam in period 3”: one more rule, and only 2 guesses. Then tick “The lab is busy in period 1” too: the search proves no timetable exists (science needs 3 periods, and only 2 are left).",
    takeaway: "Timetables, exam plans and rotas are constraint problems. Propagation does most of the work by crossing out what can't happen; search only guesses when it must, and every dead end teaches it something. Google's CP-SAT works this way, with much cleverer propagation.",
  },
  ar: {
    intro: "ثلاثة فصول وأربع حصص وأربعة معلّمين. تحتاج كل حصة دراسية إلى موعد. لا يستطيع المعلّم أن يكون في فصلين في الوقت نفسه، ولا يستطيع الفصل أن يأخذ درسين في الوقت نفسه. يبيّن الجدول المواعيد الباقية الممكنة لكل درس.",
    klass: { "5A": "٥أ", "5B": "٥ب", "6A": "٦أ" } as Record<Klass, string>,
    subject: { maths: "الرياضيات", science: "العلوم", english: "الإنجليزية", art: "الفنون" } as Record<Subject, string>,
    teacher: { musa: "الأستاذ موسى", huda: "الأستاذة هدى", ali: "الأستاذ علي", rana: "الأستاذة رنا" } as Record<Teacher, string>,
    rule: { huda: "تغادر الأستاذة هدى بعد الحصة ٣", test: "اختبار الرياضيات لفصل ٦أ في الحصة ١", art: "في غرفة الفنون امتحان في الحصة ٣", lab: "المختبر مشغول في الحصة ١" } as Record<string, string>,
    rulesH: "قواعد إضافية", how: "طريقة البحث", prop: "الانتشار ثم البحث", plain: "التراجع البسيط",
    lessonH: "الدرس", period: (p: string) => `الحصة ${p}`, p: (p: string) => `ح${p}`, cellOk: "ممكنة", cellNo: "مشطوبة", cellSet: "مختارة",
    gridLabel: "المواعيد الممكنة لكل درس: العلامة ممكنة، والشَّرطة مشطوبة، والخانة الممتلئة مختارة",
    cap: {
      ready: "اضغط «شغّل» أو «خطوة واحدة» لتبدأ.",
      rule: (r: string, n: string) => `${r}: شُطبت ${n}.`,
      prune: (l: string, p: string, n: string) => `لا يمكن أن يكون ${l} إلا في الحصة ${p}، لذا تُشطب الحصة ${p} من ${n} تشاركه المعلّم أو الفصل.`,
      guess: (l: string, p: string) => `توقّف الانتشار: لم يبقَ لأي درس موعد واحد فقط. تخمين: ضع ${l} في الحصة ${p} (له أقل المواعيد الباقية).`,
      try: (l: string, p: string) => `جرّب ${l} في الحصة ${p}.`,
      dead: (l: string) => `طريق مسدود: لم يبقَ لـ ${l} أي موعد.`,
      clash: (l: string, p: string, o: string) => `تعارض: ${l} في الحصة ${p} يصطدم بـ ${o}.`,
      undo: (l: string, p: string) => `تراجع: لا يمكن أن يكون ${l} في الحصة ${p} في النهاية.`,
      done: "صار لكل درس موعد: الجدول جاهز.",
      none: "كل تخمين انتهى إلى طريق مسدود: لا يوجد جدول يحترم كل هذه القواعد.",
    },
    periods: { one: "حصة واحدة", two: "حصتان", few: "{n} حصص", many: "{n} حصة", other: "{n} حصة" } as Forms, lessons: { one: "درس واحد", two: "درسين", few: "{n} دروس", many: "{n} درسًا", other: "{n} درس" } as Forms,
    guesses: "التخمينات", undos: "الطرق المسدودة", removed: "المشطوب", stepN: "الخطوة",
    result: "الجدول", outOf: (a: string, b: string) => `${a} من ${b}`,
    try1: "اضغط «خطوة واحدة» بضع مرات: تشطب القواعد بعض الحصص، وكل درس بقي له موعد واحد يشطبه من الدروس التي تشاركه المعلّم أو الفصل.",
    try2: "اضغط «شغّل»: يتوقّف الانتشار وحده، فيخمّن البحث، ويصادف ٣ طرق مسدودة ويتراجع عنها: ٨ تخمينات في المجموع. ثم اختر «التراجع البسيط» وشغّل: ٣٨٩ تخمينًا للجدول نفسه.",
    try3: "فعّل «في غرفة الفنون امتحان في الحصة ٣»: قاعدة إضافية، وتخمينان فقط. ثم فعّل أيضًا «المختبر مشغول في الحصة ١»: يثبت البحث أنه لا يوجد جدول (العلوم تحتاج إلى ٣ حصص، ولم يبقَ إلا حصتان).",
    takeaway: "الجداول المدرسية وخطط الامتحانات وجداول المناوبة مسائل قيود. يقوم الانتشار بمعظم العمل حين يشطب ما لا يمكن أن يحدث، ولا يخمّن البحث إلا عند الضرورة، وكل طريق مسدود يعلّمه شيئًا. ويعمل CP-SAT من Google بهذه الطريقة، مع انتشار أذكى بكثير.",
  },
};

export default function Timetable({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [ruleIds, setRuleIds] = useState<string[]>(DEFAULT_RULES);
  const [mode, setMode] = useState<"prop" | "plain">("prop");
  const trace = useMemo(() => solve(LESSONS, rulesOf(ruleIds), mode === "prop"), [ruleIds, mode]);
  const [at, setAt] = useState(-1);
  const atRef = useRef(at); atRef.current = at;
  const last = trace.steps.length - 1;
  const [finished, setFinished] = useState(0);
  useEffect(() => { if (at === last && last >= 0) setFinished((f) => f + 1); }, [at, last]);
  useEffect(() => { if (finished >= 2) onDone?.(); }, [finished >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastAt = useRef(0);
  // Paced by time: two steps a second, faster for long searches so any run ends within about 15 seconds.
  const perSec = Math.max(2, trace.steps.length / 15);
  const loop = useLoop(() => {
    const now = performance.now(), gap = now - lastAt.current;
    if (lastAt.current && gap < 1000 / perSec) return true;
    const k = lastAt.current ? Math.max(1, Math.floor((gap * perSec) / 1000)) : 1;
    lastAt.current = now;
    const next = Math.min(atRef.current + k, last);
    atRef.current = next; setAt(next);
    return next < last;
  }, { maxPerFrame: 1 });
  const restart = () => { loop.stop(); setAt(-1); };
  // Changing the rules or the method starts over at once (in the click, so a quick Run isn't undone).
  const choose = (next: () => void) => { restart(); next(); };

  const st: Step | null = at >= 0 ? trace.steps[Math.min(at, last)] : null;
  const base = LESSONS.map(() => (1 << PERIODS) - 1);
  const d = st?.d ?? base, fixed = st?.fixed ?? LESSONS.map(() => -1);
  const cut = new Set(st && (st.kind === "rule" || st.kind === "prune") ? st.removed.map(([i, p]) => `${i}-${p}`) : []);
  const focus = st && "lesson" in st ? st.lesson : st && st.kind === "prune" ? st.from : -1;
  const name = (i: number) => { const l: Lesson = LESSONS[i]; return `${s.klass[l.klass]} ${s.subject[l.subject]}`; };
  const P = (p: number) => num(p + 1);
  const upTo = trace.steps.slice(0, Math.max(0, at + 1));
  const guesses = upTo.filter((x) => x.kind === "guess").length, undos = upTo.filter((x) => x.kind === "undo").length;
  const removed = upTo.reduce((n, x) => n + (x.kind === "rule" || x.kind === "prune" ? x.removed.length : 0), 0);
  const caption = !st ? s.cap.ready
    : st.kind === "rule" ? s.cap.rule(s.rule[st.rule], count(st.removed.length, s.periods))
    : st.kind === "prune" ? s.cap.prune(name(st.from), P(st.period), count(st.removed.length, s.lessons))
    : st.kind === "guess" ? (mode === "prop" ? s.cap.guess : s.cap.try)(name(st.lesson), P(st.period))
    : st.kind === "dead" ? s.cap.dead(name(st.lesson))
    : st.kind === "clash" ? s.cap.clash(name(st.lesson), P(st.period), name(st.with))
    : st.kind === "undo" ? s.cap.undo(name(st.lesson), P(st.period))
    : s.cap[st.kind];
  // Plain backtracking shows the chosen periods only (it keeps no list of what is still possible).
  const shown = (i: number, p: number) => (mode === "plain" ? has(d[i], p) && (fixed[i] < 0 || fixed[i] === p) : has(d[i], p));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.rulesH}</span>
          {RULES.map((r) => (
            <button key={r.id} type="button" className={ruleIds.includes(r.id) ? "lb-switch lb-opt-switch is-on" : "lb-switch lb-opt-switch"} aria-pressed={ruleIds.includes(r.id)} onClick={() => choose(() => setRuleIds((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id])))}><span className="lb-switch-knob" aria-hidden /><span>{s.rule[r.id]}</span></button>
          ))}
          <Segmented label={s.how} value={mode} options={[["prop", s.prop], ["plain", s.plain]]} onChange={(m) => choose(() => setMode(m))} />
          <RunBar running={loop.running} onToggle={() => { if (at >= last) setAt(-1); lastAt.current = 0; loop.toggle(); }} onStep={() => setAt((a) => Math.min(a + 1, last))} onReset={restart} />
          <p className={st?.kind === "none" || st?.kind === "dead" ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{caption}</p>
          <Stats items={[{ label: s.stepN, value: s.outOf(num(at + 1), num(trace.steps.length)) }, { label: s.guesses, value: num(guesses) }, { label: s.undos, value: num(undos) }, ...(mode === "prop" ? [{ label: s.removed, value: num(removed) }] : [])]} />
        </div>
        <div className="stack">
          <div className="lb-scroll">
            <table className="lb-table lb-domains" aria-label={s.gridLabel}>
              <thead><tr><th>{s.lessonH}</th>{Array.from({ length: PERIODS }, (_, p) => <th key={p} title={s.period(P(p))}>{s.p(P(p))}</th>)}</tr></thead>
              <tbody>{LESSONS.map((l, i) => (
                <tr key={i} className={i === focus ? "is-focus" : undefined}>
                  <th>{name(i)}<br /><small className="lb-note">{s.teacher[l.teacher]}</small></th>
                  {Array.from({ length: PERIODS }, (_, p) => {
                    const set = fixed[i] === p, ok = shown(i, p), justCut = cut.has(`${i}-${p}`);
                    return <td key={p} className={set ? "is-set" : justCut ? "is-cut" : ok ? undefined : "is-gone"} aria-label={`${s.period(P(p))}: ${set ? s.cellSet : ok ? s.cellOk : s.cellNo}`}>{set ? "●" : ok ? "✓" : "–"}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {st?.kind === "done" && trace.solution && (
            <>
              <h3 className="lb-h">{s.result}</h3>
              <div className="lb-scroll">
                <table className="lb-table lb-domains lb-tt-result">
                  <thead><tr><th />{Array.from({ length: PERIODS }, (_, p) => <th key={p}>{s.p(P(p))}</th>)}</tr></thead>
                  <tbody>{CLASSES.map((k) => (
                    <tr key={k}><th>{s.klass[k]}</th>{Array.from({ length: PERIODS }, (_, p) => { const i = LESSONS.findIndex((l, j) => l.klass === k && trace.solution![j] === p); return <td key={p}>{i >= 0 && <>{s.subject[LESSONS[i].subject]}<br /><small className="lb-note">{s.teacher[LESSONS[i].teacher]}</small></>}</td>; })}</tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </LabShell>
  );
}
