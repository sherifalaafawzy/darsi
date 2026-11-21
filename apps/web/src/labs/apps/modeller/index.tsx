import { useEffect, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { sandbox } from "../../../code/sandbox";
import type { RunOne } from "../../../code/harness";
import { RUNTIMES } from "../../../content/runtimes";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

/** Text with `code` in backticks: the code keeps its own left-to-right order inside Arabic. */
const rich = (t: string) => t.split("`").map((part, i) => (i % 2 ? <code key={i} dir="ltr" className="lb-cpsat-inline">{part}</code> : part));
import { EXAMPLE_IDS, EXAMPLES, type ExampleId } from "./model";

const S = {
  en: {
    intro: "The other labs show how solvers work inside. Here you only describe the problem: the choices (variables), the rules (constraints) and, if you like, a goal. CP‑SAT, from Google's OR‑Tools, does the search. Edit the program and run it.",
    example: "Example", ex: { timetable: "Timetable", exams: "Exam slots", truck: "Truck load" } as Record<ExampleId, string>,
    what: {
      timetable: "Each lesson's period is a variable from 1 to 4. All-different rules keep classes and teachers in one place at a time.",
      exams: "Each exam's slot is a variable. A pupil's exams must all differ, and the goal makes the last slot as early as possible.",
      truck: "Each load is a yes-or-no variable (take it or not). The weight must fit, and the goal is the most points.",
    } as Record<ExampleId, string>,
    editor: "Python program", run: "Run", stop: "Stop", restore: "Restore the example", printed: "Printed", error: "Error",
    loading: (mb: string) => `Getting Python ready (${mb} MB the first time, then it stays on the phone)…`,
    offline: (mb: string) => `Python isn't on this phone yet: connect once to download it (${mb} MB).`,
    timeout: "Stopped after 3 seconds: the model may be too big for this phone. Try fewer choices.", failed: "Something went wrong running the program. Try again.",
    status: { OPTIMAL: "The solver found the best answer (or, with no goal, an answer that keeps every rule).", FEASIBLE: "The solver found an answer, maybe not the best.", INFEASIBLE: "No answer keeps every rule: the solver has proved it.", MODEL_INVALID: "The model has a mistake.", UNKNOWN: "The solver gave up before it was sure." } as Record<string, string>,
    try1: "Run the timetable. Then add a line before the solver, `model.add(period[\"5A\", \"art\"] == 4)`, and run again: 5A's art moves to period 4 and the rest rearrange.",
    try2: "In Exam slots, add `model.add(last <= 2)` before the solver and run: `INFEASIBLE`. The solver has proved that 2 slots can't work, because a pupil who takes 3 exams needs 3 different slots.",
    try3: "In Truck load, change `capacity` to `1100`: which loads does it take now? Compare with the Pack the truck lab.",
    takeaway: "Modelling is the real skill: say exactly what may change, what must hold and what is best. The same Python runs on Google's OR‑Tools for timetables with hundreds of teachers, delivery routes and factory plans; only the solver underneath is stronger.",
  },
  ar: {
    intro: "تبيّن المختبرات الأخرى كيف تعمل برامج الحل من الداخل. أما هنا فتصف المسألة فقط: الخيارات (المتغيّرات)، والقواعد (القيود)، وهدفًا إن شئت. ويتولّى CP‑SAT من أدوات OR‑Tools من Google البحث. عدّل البرنامج وشغّله.",
    example: "المثال", ex: { timetable: "جدول مدرسي", exams: "مواعيد الامتحانات", truck: "حمولة الشاحنة" } as Record<ExampleId, string>,
    what: {
      timetable: "موعد كل درس متغيّر من ١ إلى ٤. وقواعد «كلها مختلفة» تُبقي كل صف وكل معلّم في مكان واحد في الوقت نفسه.",
      exams: "موعد كل امتحان متغيّر. يجب أن تختلف امتحانات التلميذ الواحد كلها، والهدف أن يكون آخر موعد مبكرًا قدر الإمكان.",
      truck: "كل حمولة متغيّر بنعم أو لا (تؤخذ أو لا). ويجب أن يتّسع الوزن، والهدف أكثر النقاط.",
    } as Record<ExampleId, string>,
    editor: "برنامج بايثون", run: "شغّل", stop: "أوقف", restore: "أعِد المثال", printed: "المطبوع", error: "خطأ",
    loading: (mb: string) => `تجهيز بايثون (${mb} م.ب في المرة الأولى، ثم يبقى على الهاتف)…`,
    offline: (mb: string) => `بايثون ليس على هذا الهاتف بعد: اتصل مرة واحدة لتنزيله (${mb} م.ب).`,
    timeout: "توقّف بعد ٣ ثوانٍ: قد يكون النموذج أكبر من أن يحتمله هذا الهاتف. جرّب خيارات أقل.", failed: "حدث خطأ أثناء تشغيل البرنامج. حاول من جديد.",
    status: { OPTIMAL: "وجد برنامج الحل أفضل إجابة (أو، بلا هدف، إجابة تحترم كل القواعد).", FEASIBLE: "وجد برنامج الحل إجابة، قد لا تكون الأفضل.", INFEASIBLE: "لا توجد إجابة تحترم كل القواعد: وقد أثبت برنامج الحل ذلك.", MODEL_INVALID: "في النموذج خطأ.", UNKNOWN: "استسلم برنامج الحل قبل أن يتأكّد." } as Record<string, string>,
    try1: "شغّل الجدول المدرسي. ثم أضف قبل برنامج الحل السطر `model.add(period[\"5A\", \"art\"] == 4)` وشغّل من جديد: ينتقل درس الفنون للصف `5A` إلى الحصة ٤ ويُعاد ترتيب الباقي.",
    try2: "في «مواعيد الامتحانات» أضف `model.add(last <= 2)` قبل برنامج الحل وشغّل: `INFEASIBLE`. لقد أثبت برنامج الحل أن موعدين لا يكفيان، لأن التلميذ الذي يؤدّي ٣ امتحانات يحتاج إلى ٣ مواعيد مختلفة.",
    try3: "في «حمولة الشاحنة» غيّر `capacity` إلى `1100`: ما الحمولات التي يأخذها الآن؟ قارن بمختبر «حمّل الشاحنة».",
    takeaway: "النمذجة هي المهارة الحقيقية: أن تقول بدقة ما الذي يمكن أن يتغيّر، وما الذي يجب أن يتحقّق، وما الأفضل. وبايثون نفسه يعمل على أدوات OR‑Tools من Google لجداول فيها مئات المعلّمين وطرق توصيل وخطط مصانع، والفرق فقط أن برنامج الحل تحتها أقوى.",
  },
};

export default function Modeller({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [ex, setEx] = useState<ExampleId>("timetable");
  const [code, setCode] = useState<string>(EXAMPLES.timetable);
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [out, setOut] = useState<RunOne | null>(null);
  const [note, setNote] = useState("");
  const [ran, setRan] = useState(new Set<ExampleId>());
  const busy = useRef(false);
  busy.current = state === "running" || state === "loading";
  useEffect(() => () => { if (busy.current) sandbox().stop(); }, []);
  useEffect(() => { if (ran.size >= 2) onDone?.(); }, [ran.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const mb = num(RUNTIMES.python.sizeMB);

  const go = async () => {
    const sb = sandbox();
    setNote(""); setOut(null);
    try {
      setState("loading");
      await sb.prepare("python");
      setState("running");
      const r = await sb.run({ lang: "python", code });
      setState("idle");
      if (r.stopped) return;
      if (r.timeout) { setNote(s.timeout); return; }
      if (r.failed) { setNote(s.failed); return; }
      setOut(r.runs[0] ?? null);
      setRan((x) => new Set(x).add(ex));
    } catch (e) {
      const offline = (e as Error).message === "offline";
      setState(offline ? "offline" : "idle");
      if (!offline) setNote(s.failed);
    }
  };
  const pick = (id: ExampleId) => { if (busy.current) sandbox().stop(); setEx(id); setCode(EXAMPLES[id]); setOut(null); setNote(""); };
  const status = out?.out.trim().split(/\s/)[0] ?? "";

  return (
    <LabShell meta={meta} intro={s.intro} tries={[rich(s.try1), rich(s.try2), rich(s.try3)]} takeaway={s.takeaway}>
      <Segmented label={s.example} value={ex} onChange={pick} options={EXAMPLE_IDS.map((id) => [id, s.ex[id]] as const)} />
      <p className="lb-note">{s.what[ex]}</p>
      <label className="lb-cpsat">
        <span className="dr-field-label">{s.editor}</span>
        <textarea className="lb-cpsat-code" dir="ltr" translate="no" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={18} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <div className="lb-runbar">
        {state === "running"
          ? <Button size="sm" variant="secondary" icon="pause" onClick={() => sandbox().stop()}>{s.stop}</Button>
          : <Button size="sm" icon="play" loading={state === "loading"} onClick={go}>{s.run}</Button>}
        <Button size="sm" variant="ghost" icon="undo" disabled={code === EXAMPLES[ex]} onClick={() => setCode(EXAMPLES[ex])}>{s.restore}</Button>
      </div>
      {state === "loading" && <p className="lb-note">{s.loading(mb)}</p>}
      {state === "offline" && <p className="lb-verdict is-warn">{s.offline(mb)}</p>}
      {note && <p className="lb-verdict is-warn" role="alert">{note}</p>}
      {out && (
        <div className="stack-sm" aria-live="polite">
          {s.status[status] && <p className={status === "INFEASIBLE" || status === "MODEL_INVALID" ? "lb-verdict is-warn" : "lb-verdict"}>{s.status[status]}</p>}
          {out.out && <><span className="dr-field-label">{s.printed}</span><pre className="lb-cpsat-out" dir="ltr" translate="no">{out.out}</pre></>}
          {out.error && <><span className="dr-field-label">{s.error}</span><pre className="lb-cpsat-out is-error" dir="ltr" translate="no">{out.error}</pre></>}
        </div>
      )}
    </LabShell>
  );
}
