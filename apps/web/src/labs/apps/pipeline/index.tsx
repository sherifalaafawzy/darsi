import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { EMPTY, report, ROLL, run, STAGES, twice, type Event, type Fault, type Mode, type Stage, type World } from "./model";

const S = {
  en: {
    intro: "Every evening the school's pipeline takes the three class registers (P for present, A for away), counts them, and writes the counts into the district's table. Tonight's report should say 84 of 90 pupils came.",
    fault: "Make a step fail", none: "None", mode: "How Load writes", modes: { append: "Add the rows", replace: "Replace the day's rows" } as Record<Mode, string>,
    bad: "Marks like “?”", stopRun: "Stop the run", aside: "Set aside to check",
    stage: { extract: "Extract", transform: "Transform", load: "Load" } as Record<Stage, string>,
    does: { extract: "Read the 3 registers", transform: "Count each class", load: "Write to the district's table" } as Record<Stage, string>,
    status: { waiting: "Waiting", running: "Working…", done: "Done", failed: "Failed", skipped: "Not run" },
    extractOk: (n: string) => `${n} marks read.`, extractFail: "The connection dropped.",
    transformOk: (n: string) => `${n} classes counted.`, aside1: "1 row set aside to check.", transformFail: "A register says “?” instead of P or A.",
    loadOk: (n: string) => `${n} classes written.`, cleared: (n: string) => `Removed the day's ${n} old rows first.`, loadFail: (n: string) => `The database was busy after ${n} of 3 classes.`,
    run: "Run", retry: "Retry", again: "Run again", arrow: "→",
    table: "The district's table", cols: ["Day", "Class", "Present", "On roll", "Run"], day: "Mon", classes: { "5A": "5A", "5B": "5B", "6A": "6A" } as Record<string, string>,
    twiceNote: "Highlighted rows: the same class on the same day more than once.", empty: "Nothing loaded yet.",
    report: (p: string, r: string) => `Monday's report: ${p} of ${r} pupils present.`, right: "Right: the school has 90 pupils.", wrong: (r: string) => `Wrong: the school has 90 pupils, not ${r}.`,
    try1: "Choose Load to fail, keep “Add the rows”, and press Run: two classes are written before it fails. Press Retry: they're written again, and the report counts 152 pupils, not 90.",
    try2: "Choose “Replace the day's rows” and do the same: the retry clears Monday first, so the report is right. Press Run again: still 90.",
    try3: "Make Transform fail: retrying fails again, because the data is bad, not the network. Set the bad row aside and the run goes through.",
    takeaway: "A pipeline is steps that run again and again: extract, transform, load. Steps fail, so a run must be safe to repeat: one that replaces what it wrote (idempotent) gives the same answer however many times it runs. Retrying fixes passing faults; bad data needs a person.",
  },
  ar: {
    intro: "كل مساء يأخذ خط بيانات المدرسة سجلّات الفصول الثلاثة (P للحاضر وA للغائب)، ويعدّها، ويكتب الأعداد في جدول الإدارة. يجب أن يقول تقرير الليلة إن ٨٤ من ٩٠ تلميذًا حضروا.",
    fault: "اجعل خطوة تفشل", none: "لا شيء", mode: "كيف يكتب التحميل", modes: { append: "أضف الصفوف", replace: "استبدل صفوف اليوم" },
    bad: "علامات مثل «؟»", stopRun: "أوقف التشغيل", aside: "ضعها جانبًا للمراجعة",
    stage: { extract: "استخراج", transform: "تحويل", load: "تحميل" },
    does: { extract: "قراءة السجلّات الثلاثة", transform: "عدّ كل فصل", load: "الكتابة في جدول الإدارة" },
    status: { waiting: "ينتظر", running: "يعمل…", done: "تم", failed: "فشل", skipped: "لم يعمل" },
    extractOk: (n: string) => `قُرئت ${n} علامة.`, extractFail: "انقطع الاتصال.",
    transformOk: (n: string) => `عُدّت ${n} فصول.`, aside1: "وُضع صف واحد جانبًا للمراجعة.", transformFail: "أحد السجلّات فيه «؟» بدل P أو A.",
    loadOk: (n: string) => `كُتبت ${n} فصول.`, cleared: (n: string) => `حُذفت صفوف اليوم القديمة أولًا (${n}).`, loadFail: () => "كانت قاعدة البيانات مشغولة بعد كتابة فصلين من ثلاثة.",
    run: "شغّل", retry: "أعد المحاولة", again: "شغّل مرة أخرى", arrow: "←",
    table: "جدول الإدارة", cols: ["اليوم", "الفصل", "الحاضرون", "المسجَّلون", "التشغيل"], day: "الاثنين", classes: { "5A": "٥أ", "5B": "٥ب", "6A": "٦أ" },
    twiceNote: "الصفوف المظللة: الفصل نفسه في اليوم نفسه أكثر من مرة.", empty: "لم يُحمَّل شيء بعد.",
    report: (p: string, r: string) => `تقرير يوم الاثنين: حضر ${p} من ${r} تلميذًا.`, right: "صحيح: في المدرسة ٩٠ تلميذًا.", wrong: (r: string) => `خطأ: في المدرسة ٩٠ تلميذًا، لا ${r}.`,
    try1: "اختر أن يفشل «التحميل»، وأبقِ «أضف الصفوف»، واضغط «شغّل»: يُكتب فصلان قبل الفشل. اضغط «أعد المحاولة»: يُكتبان مرة أخرى، فيعدّ التقرير ١٥٢ تلميذًا لا ٩٠.",
    try2: "اختر «استبدل صفوف اليوم» وكرّر ما فعلت: تحذف إعادة المحاولة صفوف اليوم أولًا، فيأتي التقرير صحيحًا. اضغط «شغّل مرة أخرى»: يبقى ٩٠.",
    try3: "اجعل «التحويل» يفشل: تفشل إعادة المحاولة أيضًا، لأن العيب في البيانات لا في الاتصال. ضع الصف المعيب جانبًا فيمرّ التشغيل.",
    takeaway: "خط البيانات خطوات تعمل مرة بعد مرة: استخراج، ثم تحويل، ثم تحميل. والخطوات تفشل، فيجب أن يكون تكرار التشغيل آمنًا: التشغيل الذي يستبدل ما كتبه (أي متساوي الأثر) يعطي الجواب نفسه مهما تكرر. إعادة المحاولة تعالج الأعطال العابرة، أما البيانات المعيبة فتحتاج إلى إنسان.",
  },
};

/** How long each stage shows "Working…" (milliseconds). */
const STEP = 700;
interface Play { events: Event[]; next: World; shown: number; committed: boolean }

export default function Pipeline({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [fault, setFault] = useState<Fault>("none");
  const [mode, setMode] = useState<Mode>("append");
  const [aside, setAside] = useState(false);
  const [world, setWorld] = useState<World>(EMPTY);
  const [cur, setCur] = useState<Play | null>(null);
  const [seen, setSeen] = useState({ wrong: false, safeRerun: false });
  const playing = !!cur && cur.shown < cur.events.length;
  useEffect(() => { if (seen.wrong && seen.safeRerun) onDone?.(); }, [seen.wrong && seen.safeRerun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each stage shows "Working…" for a moment, then its result; the table changes when the run ends.
  useEffect(() => {
    if (!cur) return;
    if (cur.shown < cur.events.length) {
      const fast = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const t = setTimeout(() => setCur((c) => c && { ...c, shown: c.shown + 1 }), fast ? 0 : STEP);
      return () => clearTimeout(t);
    }
    if (!cur.committed) {
      setWorld(cur.next);
      const r = report(cur.next.table), ok = cur.events.every((e) => e.ok);
      setSeen((x) => ({ wrong: x.wrong || (r.roll > 0 && r.roll !== ROLL), safeRerun: x.safeRerun || (ok && mode === "replace" && !!cur.events.find((e) => e.stage === "load")?.cleared && r.roll === ROLL) }));
      setCur({ ...cur, committed: true });
    }
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => { const r = run(world, { fault, mode, aside }); setCur({ events: r.events, next: r.world, shown: 0, committed: false }); };
  const pickFault = (f: Fault) => { setFault(f); setWorld((w) => ({ ...w, failedOnce: false })); };
  const failed = !!cur && !playing && cur.events.some((e) => !e.ok);
  const status = (i: number) => {
    if (!cur) return "waiting";
    const e = cur.events[i];
    if (e && i < cur.shown) return e.ok ? "done" : "failed";
    if (playing && i === cur.shown) return "running";
    return playing ? "waiting" : "skipped";
  };
  const detail = (e: Event) => {
    if (e.stage === "extract") return e.ok ? s.extractOk(num(e.n!)) : s.extractFail;
    if (e.stage === "transform") return e.ok ? `${s.transformOk(num(e.n!))}${e.aside ? ` ${s.aside1}` : ""}` : s.transformFail;
    return `${e.cleared ? `${s.cleared(num(e.cleared))} ` : ""}${e.ok ? s.loadOk(num(e.n!)) : s.loadFail(num(e.n!))}`;
  };
  const rep = report(world.table), dup = twice(world.table);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setWorld(EMPTY); setCur(null); }}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.fault} value={fault} options={(["none", ...STAGES] as Fault[]).map((f) => [f, f === "none" ? s.none : s.stage[f]] as const)} onChange={pickFault} />
          {fault === "transform" && <Segmented label={s.bad} value={aside ? 1 : 0} options={[[0, s.stopRun], [1, s.aside]]} onChange={(v) => setAside(v === 1)} />}
        </div>
        <Segmented label={s.mode} value={mode} options={(["append", "replace"] as Mode[]).map((m) => [m, s.modes[m]] as const)} onChange={setMode} />
      </div>
      <ol className="lb-flow" aria-live="polite">
        {STAGES.map((st, i) => {
          const k = status(i), e = cur?.events[i];
          return (
            <li key={st} className={`lb-stage is-${k}`}>
              <strong>{s.stage[st]}</strong>
              <span className="lb-note">{s.does[st]}</span>
              <span className="lb-stage-state">{k === "done" && <Icon name="check" size={16} />}{k === "failed" && <Icon name="cross" size={16} />} {s.status[k]}</span>
              {e && i < (cur?.shown ?? 0) && <span className="lb-stage-detail">{detail(e)}</span>}
              {i < STAGES.length - 1 && <span className="lb-flow-arrow" aria-hidden>{s.arrow}</span>}
            </li>
          );
        })}
      </ol>
      <div className="lb-row">
        <Button size="sm" icon={failed ? "sync" : "play"} onClick={go} disabled={playing}>{failed ? s.retry : world.runs ? s.again : s.run}</Button>
      </div>
      <div className="lb-panel">
        <strong>{s.table}</strong>
        {world.table.length === 0 ? <p className="lb-note">{s.empty}</p> : (
          <>
            <div className="lb-scroll" role="region" aria-label={s.table} tabIndex={0}>
              <table className="lb-dt">
                <thead><tr>{s.cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{world.table.map((r, i) => (
                  <tr key={i} className={dup.has(`${r.day}|${r.cls}|${r.run}`) ? "is-dup" : undefined}>
                    <td>{s.day}</td><td>{s.classes[r.cls]}</td><td>{num(r.present)}</td><td>{num(r.roll)}</td><td>{num(r.run)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {dup.size > 0 && <p className="lb-note">{s.twiceNote}</p>}
            <p className="lb-verdict">{s.report(num(rep.present), num(rep.roll))}</p>
            <p className={rep.roll === ROLL ? "lb-ok lb-says" : "lb-no lb-says"}><Icon name={rep.roll === ROLL ? "check" : "cross"} size={16} /> {rep.roll === ROLL ? s.right : s.wrong(num(rep.roll))}</p>
          </>
        )}
      </div>
    </LabShell>
  );
}
