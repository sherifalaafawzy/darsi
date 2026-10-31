import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { sandbox } from "../../../code/sandbox";
import type { RunResult } from "../../../code/harness";
import { RUNTIMES } from "../../../content/runtimes";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useKit, useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { cell, codeParts, EXAMPLES, SETUP, SHOW, TABLES } from "./model";

const S = {
  en: {
    intro: "The school keeps two tables: its pupils, and their marks out of 20. Ask a question in SQL and SQLite, a real database running on this phone, answers it. Pick a question or write your own.",
    tables: "The tables", examples: "Questions to try", editor: "Your SQL", stop: "Stop",
    rows: { one: "{n} row", other: "{n} rows" } as Forms,
    needs: (mb: string) => `SQL runs in SQLite on this phone: a one-time download of ${mb} MB.`,
    loading: (mb: string) => `Getting SQLite ready (${mb} MB, once)…`,
    offline: (mb: string) => `SQLite needs one download (${mb} MB). Connect once, then it works offline too.`,
    says: "SQLite says:", timeout: "That took longer than 3 seconds, so it was stopped.", none: "No rows matched.",
    took: (rows: string, ms: string) => `${rows}, in ${ms} ms.`, more: (shown: string) => `Showing the first ${shown}.`,
    fresh: "Each run starts from a fresh copy of the database, so you can't break it.",
    try1: "Tap “Who is in class `5B`?”, change `'5B'` to `'6A'` and press Run.",
    try2: "Run “The average mark in each subject”, then change `AVG` to `MAX`: you get the best mark in each subject.",
    try3: "Write your own: which pupils live in `Hilltop`? Start from “Who is in class `5B`?”.",
    takeaway: "SQL describes the rows you want, not how to find them: `SELECT` picks columns, `WHERE` picks rows, `ORDER BY` sorts, and `GROUP BY` makes one row per group for `COUNT` or `AVG`. The same question works on 12 rows or 12 million.",
  },
  ar: {
    intro: "تحفظ المدرسة جدولين: تلاميذها، ودرجاتهم من ٢٠. اسأل سؤالًا بلغة SQL فتجيب عنه SQLite، وهي قاعدة بيانات حقيقية تعمل على هذا الهاتف. اختر سؤالًا أو اكتب سؤالك.",
    tables: "الجدولان", examples: "أسئلة لتجرّبها", editor: "استعلامك بلغة SQL", stop: "أوقف",
    rows: { zero: "لا صفوف", one: "صف واحد", two: "صفّان", few: "{n} صفوف", many: "{n} صفًّا", other: "{n} صف" },
    needs: (mb: string) => `تعمل SQL في SQLite على هذا الهاتف: تنزيل لمرة واحدة حجمه ${mb} ميغابايت.`,
    loading: (mb: string) => `جارٍ تجهيز SQLite (${mb} ميغابايت، مرة واحدة)…`,
    offline: (mb: string) => `تحتاج SQLite إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم تعمل دون اتصال أيضًا.`,
    says: "تقول SQLite:", timeout: "استغرق ذلك أكثر من ٣ ثوانٍ، فأُوقف.", none: "لم يطابق أي صف.",
    took: (rows: string, ms: string) => `${rows}، في ${ms} ملّي ثانية.`, more: (shown: string) => `يظهر أول ${shown} فقط.`,
    fresh: "كل تشغيل يبدأ من نسخة جديدة من قاعدة البيانات، فلا يمكنك إفسادها.",
    try1: "المس «من في الفصل `5B`؟»، وغيّر `'5B'` إلى `'6A'` ثم اضغط «شغّل».",
    try2: "شغّل «متوسط الدرجات في كل مادة»، ثم غيّر `AVG` إلى `MAX`: تظهر أعلى درجة في كل مادة.",
    try3: "اكتب سؤالك: من التلاميذ الذين يسكنون في `Hilltop`؟ ابدأ من «من في الفصل `5B`؟».",
    takeaway: "تصف SQL الصفوف التي تريدها لا طريقة إيجادها: `SELECT` تختار الأعمدة، و`WHERE` تختار الصفوف، و`ORDER BY` ترتّب، و`GROUP BY` تجعل صفًّا لكل مجموعة لتعمل `COUNT` أو `AVG`. والسؤال نفسه يصلح لـ١٢ صفًّا أو ١٢ مليونًا.",
  },
};

/** Text with `code` parts in code type, left to right. */
const rich = (t: string): ReactNode => codeParts(t).map((p, i) => (p.code ? <code key={i} className="lb-snip" dir="ltr">{p.text}</code> : p.text));

export default function SqlPlay({ meta, onDone }: LabProps) {
  const s = useS(S);
  const k = useKit();
  const { L, num } = useI18n();
  const plural = usePlural();
  const id = useId();
  const [code, setCode] = useState(EXAMPLES[1].sql);
  const [ex, setEx] = useState<number | null>(1);
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [res, setRes] = useState<RunResult | null>(null);
  const [ready, setReady] = useState(false);
  const [good, setGood] = useState(() => new Set<string>());
  const running = useRef(false);
  running.current = state === "running";
  useEffect(() => () => { if (running.current) sandbox().stop(); }, []);
  useEffect(() => { if (good.size >= 3) onDone?.(); }, [good.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const mb = num(Math.round(RUNTIMES.sql.sizeMB * 100) / 100);

  const run = async () => {
    const sb = sandbox(), sql = code;
    try {
      setState("loading");
      await sb.prepare("sql");
      setReady(true);
      setState("running");
      const r = await sb.run({ lang: "sql", code: sql, setup: SETUP });
      setRes(r);
      setState("idle");
      if (r.runs[0]?.table && !r.runs[0].error) setGood((g) => new Set(g).add(sql.trim()));
    } catch (e) {
      const offline = (e as Error).message === "offline";
      setState(offline ? "offline" : "idle");
      if (!offline) setRes({ runs: [], ms: 0, failed: String((e as Error).message) });
    }
  };
  const pick = (i: number) => { setEx(i); setCode(EXAMPLES[i].sql); setRes(null); };
  const one = res?.runs[0];
  const table = one?.table;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[rich(s.try1), rich(s.try2), rich(s.try3)]} takeaway={rich(s.takeaway)}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.tables}</span>
          <ul className="lb-sql-tables" dir="ltr">
            {TABLES.map((t) => <li key={t.name}><code className="lb-snip">{t.name} ({t.cols.join(", ")})</code> <span className="lb-note" dir="auto">{plural(t.rows, s.rows)}</span></li>)}
          </ul>
          <span className="dr-field-label">{s.examples}</span>
          <div className="lb-sql-exs">
            {EXAMPLES.map((e, i) => <button key={i} type="button" className={ex === i ? "lb-sql-ex is-on" : "lb-sql-ex"} aria-pressed={ex === i} onClick={() => pick(i)}>{rich(L(e.q))}</button>)}
          </div>
        </div>
        <div className="stack">
          <label className="dr-field-label" htmlFor={id}>{s.editor}</label>
          <textarea id={id} className="dr-field-input lb-sql-edit" dir="ltr" rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" translate="no" value={code}
            onChange={(e) => { setCode(e.target.value); setEx(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && state === "idle") { e.preventDefault(); run(); } }} />
          {ex !== null && <p className="lb-note">{rich(L(EXAMPLES[ex].note))}</p>}
          <div className="lb-row">
            {state === "running"
              ? <Button size="sm" variant="secondary" icon="pause" onClick={() => sandbox().stop()}>{s.stop}</Button>
              : <Button size="sm" icon="play" onClick={run} loading={state === "loading"} disabled={!code.trim()}>{k.run}</Button>}
          </div>
          {state === "loading" ? <p className="lb-note">{s.loading(mb)}</p> : !ready && state !== "offline" ? <p className="lb-note">{s.needs(mb)}</p> : null}
          {state === "offline" && <p className="notice">{s.offline(mb)}</p>}
        </div>
      </div>
      {res && (
        <div className="stack" aria-live="polite">
          {res.timeout ? <p className="lb-verdict is-warn">{s.timeout}</p>
            : res.failed ? <p className="lb-verdict is-warn">{s.says} <span dir="ltr" translate="no">{res.failed}</span></p>
            : one?.error ? <p className="lb-verdict is-warn">{s.says} <span dir="ltr" translate="no">{one.error}</span></p>
            : table && (
              <>
                {table.columns.length > 0 && (
                  <div className="lb-scroll" dir="ltr" role="region" aria-label={s.editor} tabIndex={0}>
                    <table className="lb-dt" translate="no">
                      <thead><tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
                      <tbody>{table.values.slice(0, SHOW).map((r, i) => <tr key={i}>{r.map((v, j) => { const c = cell(v); return <td key={j} dir="auto">{c === null ? <span className="lb-dt-null">NULL</span> : c}</td>; })}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                <p className="lb-note">{table.values.length ? s.took(plural(table.values.length, s.rows), num(Math.max(1, Math.round(res.ms)))) : s.none}{table.values.length > SHOW ? ` ${s.more(num(SHOW))}` : ""}</p>
              </>
            )}
          <p className="lb-note">{s.fresh}</p>
        </div>
      )}
    </LabShell>
  );
}
