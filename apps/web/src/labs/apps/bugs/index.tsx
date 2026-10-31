import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { sandbox } from "../../../code/sandbox";
import type { RunOne } from "../../../code/harness";
import { RUNTIMES } from "../../../content/runtimes";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { BUGS, parseError, same, type BugId, type ErrorKind } from "./model";

const C = (t: string) => <code className="lb-code-inline" dir="ltr">{t}</code>;

const S = {
  en: {
    intro: "Every programmer writes bugs. The skill is finding them: run the program, read what Python says (the last line names the problem, and it tells you the line), fix it, and run it again.",
    bug: "Bug", goal: "This program should print:", editor: "The program (fix it here)", run: "Run", restore: "Start again", hint: "Show a hint",
    loading: (mb: string) => `Getting Python ready (${mb} MB, once)…`, offline: (mb: string) => `Python needs one download (${mb} MB). Connect once, then it works offline too.`,
    timeout: "Stopped after 3 seconds. Does a loop never end?", failed: "Python could not run this.",
    errorOn: (n: string) => `Error on line ${n}`, whatItMeans: "What it means:", printed: "It ran, and printed:", nothing: "It ran, but printed nothing.",
    wrong: "No error, but not what it should print. A program can run and still be wrong: compare the two.",
    fixed: "Fixed! It prints exactly what it should.", wasBug: "The bug was:", next: "Next bug",
    kind: {
      syntax: "Python couldn't read this line, so nothing ran at all. Look for a missing colon (:) after for, if or def, a single = where == is meant, or a line that should be indented.",
      indent: "The spaces at the start of a line are wrong. Lines inside a for, if or def are indented, usually by 4 spaces.",
      name: "Python doesn't know this name. Is it spelt exactly as when it was made? Capital letters count.",
      type: <>Two kinds of value that don't go together, like text + a number. Turn the number into text with {C("str()")}.</>,
      zero: "Dividing by zero has no answer.", index: "Asking for an item past the end of a list. The first item is number 0.",
      value: <>The right kind of value, but one that doesn't work here, like {C('int("ten")')}.</>, other: "Read the last line of the error: it names the problem.",
    } as Record<ErrorKind, ReactNode>,
    hints: {
      colon: <>Lines that start a block ({C("for")}, {C("if")}, {C("while")}, {C("def")}) end with a colon.</>,
      equals: <>One {C("=")} stores a value; two, {C("==")}, compare two values.</>,
      offbyone: <>{C("range(1, 5)")} counts 1, 2, 3, 4: it stops just before the second number.</>,
      indent: <>The line that should repeat must be indented under the {C("for")} line.</>,
      name: <>Compare the name on line 3 with the one made on line 1.</>,
      text: <>Text and a number can't be added with {C("+")}. Turn the number into text first: {C("str(age)")}.</>,
    } as Record<BugId, ReactNode>,
    names: { colon: "a missing colon.", equals: "= where == was meant.", offbyone: "off by one: the loop stopped one too early.", indent: "a missing indent.", name: "a misspelt variable name.", text: "adding text and a number." } as Record<BugId, string>,
    try1: "Run bug 1 first, without changing anything, and read the error: which line does it point to?",
    try2: "Bug 3 has no error message at all. Compare what it printed with what it should print.",
    try3: "After fixing a bug, break it again on purpose in a new way and read the new error.",
    takeaway: "Errors are messages, not failures: the last line names the problem and the line number says where to look. And a program with no error can still be wrong, so always check its output against what you expected.",
  },
  ar: {
    intro: "كل مبرمج يكتب أخطاء، والمهارة هي إيجادها: شغّل البرنامج، واقرأ ما تقوله Python (السطر الأخير يسمّي المشكلة ويذكر رقم السطر)، ثم أصلحه وشغّله من جديد.",
    bug: "الخطأ", goal: "يجب أن يطبع هذا البرنامج:", editor: "البرنامج (أصلحه هنا)", run: "شغّل", restore: "ابدأ من جديد", hint: "أظهر تلميحًا",
    loading: (mb: string) => `جارٍ تجهيز Python (${mb} ميغابايت، مرة واحدة)…`, offline: (mb: string) => `تحتاج Python إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم تعمل دون اتصال أيضًا.`,
    timeout: "توقّف بعد ٣ ثوانٍ. هل توجد حلقة لا تنتهي؟", failed: "لم تستطع Python تشغيل هذا.",
    errorOn: (n: string) => `خطأ في السطر ${n}`, whatItMeans: "المعنى:", printed: "اشتغل وطبع:", nothing: "اشتغل لكنه لم يطبع شيئًا.",
    wrong: "لا يوجد خطأ، لكن هذا ليس ما يجب أن يطبعه. فقد يشتغل البرنامج ويبقى مع ذلك خاطئًا: قارن بين الاثنين.",
    fixed: "أصلحته! إنه يطبع ما يجب أن يطبعه تمامًا.", wasBug: "كان الخطأ:", next: "الخطأ التالي",
    kind: {
      syntax: "لم تستطع Python قراءة هذا السطر، فلم يُنفَّذ شيء أصلًا. ابحث عن نقطتين (:) ناقصتين بعد for أو if أو def، أو = واحدة في مكان ==، أو سطر كان يجب أن يُزاح إلى الداخل.",
      indent: "المسافات في أول السطر غير صحيحة. فالأسطر داخل for أو if أو def تُزاح إلى الداخل، عادةً بـ٤ مسافات.",
      name: "لا تعرف Python هذا الاسم. هل كُتب تمامًا كما كُتب حين أُنشئ؟ فالحروف الكبيرة تُحسب.",
      type: <>نوعان من القيم لا يجتمعان، مثل نص + رقم. حوّل الرقم إلى نص باستعمال {C("str()")}.</>,
      zero: "القسمة على صفر ليس لها جواب.", index: "طلب عنصر بعد نهاية القائمة. وأول عنصر رقمه ٠.",
      value: <>نوع القيمة صحيح، لكنها لا تصلح هنا، مثل {C('int("ten")')}.</>, other: "اقرأ السطر الأخير من رسالة الخطأ: إنه يسمّي المشكلة.",
    } as Record<ErrorKind, ReactNode>,
    hints: {
      colon: <>الأسطر التي تبدأ كتلة ({C("for")}، {C("if")}، {C("while")}، {C("def")}) تنتهي بنقطتين.</>,
      equals: <>علامة {C("=")} الواحدة تخزّن قيمة، والعلامتان {C("==")} تقارنان بين قيمتين.</>,
      offbyone: <>{C("range(1, 5)")} تعدّ ١ و٢ و٣ و٤: إنها تتوقّف قبل الرقم الثاني مباشرة.</>,
      indent: <>السطر الذي يجب أن يتكرّر يجب أن يُزاح إلى الداخل تحت سطر {C("for")}.</>,
      name: <>قارن الاسم في السطر ٣ بالاسم الذي أُنشئ في السطر ١.</>,
      text: <>لا يُجمع نص ورقم بعلامة {C("+")}. حوّل الرقم إلى نص أولًا: {C("str(age)")}.</>,
    } as Record<BugId, ReactNode>,
    names: { colon: "نقطتان ناقصتان.", equals: "= في مكان ==.", offbyone: "خطأ بفارق واحد: توقّفت الحلقة قبل موعدها بخطوة.", indent: "إزاحة ناقصة.", name: "اسم متغيّر مكتوب خطأً.", text: "جمع نص ورقم." } as Record<BugId, string>,
    try1: "شغّل الخطأ ١ أولًا من دون أن تغيّر شيئًا، واقرأ رسالة الخطأ: إلى أي سطر تشير؟",
    try2: "الخطأ ٣ ليس له أي رسالة خطأ. قارن ما طبعه بما يجب أن يطبعه.",
    try3: "بعد أن تصلح خطأً، أفسده من جديد عمدًا بطريقة أخرى، واقرأ رسالة الخطأ الجديدة.",
    takeaway: "رسائل الخطأ معلومات لا فشل: السطر الأخير يسمّي المشكلة ورقم السطر يدلّك أين تبحث. والبرنامج الخالي من رسائل الخطأ قد يبقى خاطئًا، فقارن دائمًا ناتجه بما كنت تتوقّعه.",
  },
};

/** The program as editable text: line numbers (the error's line marked), a symbol row, and Tab to indent. */
function Editor({ value, onChange, label, errorLine }: { value: string; onChange: (v: string) => void; label: string; errorLine?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = value.split("\n").length;
  const insert = (text: string) => { const el = ref.current; if (!el) return; el.focus(); el.setRangeText(text, el.selectionStart, el.selectionEnd, "end"); onChange(el.value); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); insert("    "); } };
  return (
    <div className="lb-code">
      <div className="lb-code-box" dir="ltr">
        <div className="lb-code-gutter" aria-hidden>{Array.from({ length: lines }, (_, i) => <span key={i} className={errorLine === i + 1 ? "is-err" : undefined}>{i + 1}</span>)}</div>
        <textarea ref={ref} className="lb-code-text" value={value} rows={Math.max(4, lines)} dir="ltr" wrap="off" translate="no" spellCheck={false}
          autoCapitalize="off" autoCorrect="off" autoComplete="off" aria-label={label} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
      </div>
      <div className="lb-code-keys" dir="ltr">
        {["⇥", ":", "=", "(", ")", "\"", "+"].map((k) => (
          <button key={k} type="button" className="lb-code-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k === "⇥" ? "    " : k)} aria-label={k === "⇥" ? "Tab" : k}>{k}</button>
        ))}
      </div>
    </div>
  );
}

export default function Bugs({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [i, setI] = useState(0);
  const [codes, setCodes] = useState(() => BUGS.map((b) => b.code));
  const [fixed, setFixed] = useState<boolean[]>(() => BUGS.map(() => false));
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [res, setRes] = useState<{ run?: RunOne; note?: string; ok?: boolean } | null>(null);
  const [hint, setHint] = useState(false);
  const busy = useRef(false);
  busy.current = state === "running";
  useEffect(() => () => { if (busy.current) sandbox().stop(); }, []);
  useEffect(() => { if (fixed.filter(Boolean).length >= 3) onDone?.(); }, [fixed.filter(Boolean).length >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  const bug = BUGS[i], code = codes[i];
  const pick = (k: number) => { setI(k); setRes(null); setHint(false); };
  const edit = (v: string) => { setCodes((c) => c.map((x, j) => (j === i ? v : x))); setRes(null); };
  const run = async () => {
    const sb = sandbox();
    try {
      setState("loading");
      await sb.prepare("python");
      setState("running");
      const r = await sb.run({ lang: "python", code, tests: [{ output: bug.output }] });
      setState("idle");
      if (r.timeout || r.failed || r.stopped) { setRes({ note: r.timeout ? s.timeout : s.failed }); return; }
      const one = r.runs[0], ok = !!one && !one.error && (one.passed ?? same(one.out, bug.output));
      setRes({ run: one, ok });
      if (ok) setFixed((f) => f.map((x, j) => (j === i ? true : x)));
    } catch (e) {
      const offline = (e as Error).message === "offline";
      setState(offline ? "offline" : "idle");
      if (!offline) setRes({ note: s.failed });
    }
  };
  const mb = num(RUNTIMES.python.sizeMB);
  const err = res?.run?.error ? parseError(res.run.error) : null;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}
      onReset={() => { setCodes(BUGS.map((b) => b.code)); setFixed(BUGS.map(() => false)); pick(0); }}>
      <Segmented label={s.bug} value={i} onChange={pick} options={BUGS.map((_, k) => [k, fixed[k] ? `${num(k + 1)} ✓` : num(k + 1)] as const)} />
      <div className="lb-bug-goal">
        <span className="dr-field-label">{s.goal}</span>
        <pre className="lb-code-print" dir="ltr" translate="no">{bug.output}</pre>
      </div>
      <Editor value={code} onChange={edit} label={s.editor} errorLine={res?.run?.line} />
      <div className="lb-runbar">
        <Button size="sm" icon="play" loading={state === "loading" || state === "running"} onClick={run}>{s.run}</Button>
        <Button size="sm" variant="ghost" icon="undo" disabled={code === bug.code} onClick={() => edit(bug.code)}>{s.restore}</Button>
        <Button size="sm" variant="ghost" icon="idea" disabled={hint} onClick={() => setHint(true)}>{s.hint}</Button>
      </div>
      {state === "loading" && <p className="lb-note">{s.loading(mb)}</p>}
      {state === "offline" && <p className="notice">{s.offline(mb)}</p>}
      {hint && <p className="lb-bug-hint">{s.hints[bug.id]}</p>}
      {res && (
        <section className={`lb-code-out${res.ok ? " is-ok" : ""}`} aria-live="polite">
          {res.note ? <p className="lb-code-err-h">{res.note}</p>
            : res.ok ? <>
                <p className="lb-verdict">{s.fixed}</p>
                <p className="lb-note">{s.wasBug} {s.names[bug.id]}</p>
                {i < BUGS.length - 1 && <Button size="sm" variant="secondary" icon="next" onClick={() => pick(i + 1)}>{s.next}</Button>}
              </>
            : err ? <>
                <p className="lb-code-err-h">{s.errorOn(num(res.run!.line ?? 0))}</p>
                <pre className="lb-code-err" dir="ltr" translate="no">{res.run!.error}</pre>
                <p className="lb-bug-means"><strong>{s.whatItMeans}</strong> {err.name && <>{C(err.name)}: </>}{s.kind[err.kind]}</p>
              </>
            : <>
                <p className="lb-note">{res.run?.out ? s.printed : s.nothing}</p>
                {res.run?.out && <pre className="lb-code-print" dir="ltr" translate="no">{res.run.out}</pre>}
                <p className="lb-verdict is-warn">{s.wrong}</p>
              </>}
        </section>
      )}
    </LabShell>
  );
}
