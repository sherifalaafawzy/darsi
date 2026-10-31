import { useEffect, useRef, useState } from "react";
import { Button, ProgressBar } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { storage } from "../../../platform";
import { runTool, TOOLS } from "../../../tinylm";
import { Segmented } from "../../kit/controls";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { callText, FINETUNE_KEY as SAVE_KEY } from "../agentloop/agent";
import { Code, TinyGate, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { CASES, pct, score, tally, type Group, type Scored } from "./model";

const S = {
  en: {
    intro: "Trying an agent a few times isn't enough: you test it on many requests whose right answers you know, and count. This test set has 32 requests, in English and Arabic, half in wordings Darsi Tiny was trained on and half in new ones. A request scores when the tool and every detail are right.",
    run: "Run the test", stop: "Stop", again: "Run it again", model: "Model", original: "Original", taught: "Taught a bus tool",
    progress: (a: string, b: string) => `${a} of ${b} requests`, time: (s: string, each: string) => `${s} s on this phone, ${each} s a request.`,
    table: "Scores", lang: "Language", trained: "Trained wordings", fresh: "New wordings", all: "All",
    cell: (a: string, n: string, p: string) => `${a}/${n} (${p}%)`, toolOnly: (p: string) => `Right tool only: ${p}%.`,
    total: (a: string, n: string, p: string) => `Right tool and details: ${a} of ${n} (${p}%).`,
    show: "Show", failures: "Failures only", every: "Every request",
    want: "Expected", got: "Darsi Tiny", noCall: "no call: ", none: "No failures.",
    groups: { "en-trained": "English, trained wording", "en-new": "English, new wording", "ar-trained": "Arabic, trained wording", "ar-new": "Arabic, new wording" } as Record<Group, string>,
    card: "The model card measured the same thing on thousands of requests: 96–98% with trained wordings and new names, 78–80% with new wordings.",
    try1: "Run the test and compare the two columns: trained wordings against new ones.",
    try2: "Read the failures: which details does Darsi Tiny copy wrongly, and which requests does it misread?",
    try3: "If you taught Darsi Tiny the bus tool in “Teach the agent a new tool”, test that model too, especially after teaching it with no old conversations mixed in.",
    takeaway: "An evaluation is a fixed test set with known answers, scored the same way every time. It shows where an agent fails (here: new wordings), so you know what to fix or guard before you trust it.",
  },
  ar: {
    intro: "لا يكفي أن تجرّب الوكيل بضع مرات: بل تختبره على طلبات كثيرة تعرف أجوبتها الصحيحة، وتعدّ. في مجموعة الاختبار هذه ٣٢ طلبًا، بالعربية والإنجليزية، نصفها بصيغ تدرّب عليها «درسي الصغير» ونصفها بصيغ جديدة. ويُحسب الطلب صحيحًا حين تصح الأداة وكل تفصيل.",
    run: "شغّل الاختبار", stop: "أوقف", again: "شغّله مجددًا", model: "النموذج", original: "الأصلي", taught: "المعلَّم أداة bus",
    progress: (a: string, b: string) => `${a} من ${b} طلبًا`, time: (s: string, each: string) => `${s} ثانية على هذا الهاتف، ${each} ثانية لكل طلب.`,
    table: "النتائج", lang: "اللغة", trained: "صيغ تدرّب عليها", fresh: "صيغ جديدة", all: "الكل",
    cell: (a: string, n: string, p: string) => `${a}/${n} (${p}٪)`, toolOnly: (p: string) => `الأداة وحدها صحيحة: ${p}٪.`,
    total: (a: string, n: string, p: string) => `الأداة والتفاصيل صحيحة: ${a} من ${n} (${p}٪).`,
    show: "اعرض", failures: "الأخطاء فقط", every: "كل الطلبات",
    want: "المتوقع", got: "«درسي الصغير»", noCall: "دون استدعاء: ", none: "لا أخطاء.",
    groups: { "en-trained": "الإنجليزية، صيغة تدرّب عليها", "en-new": "الإنجليزية، صيغة جديدة", "ar-trained": "العربية، صيغة تدرّب عليها", "ar-new": "العربية، صيغة جديدة" },
    card: "قاست بطاقة النموذج الشيء نفسه على آلاف الطلبات: ٩٦–٩٨٪ مع الصيغ التي تدرّب عليها وأسماء جديدة، و٧٨–٨٠٪ مع الصيغ الجديدة.",
    try1: "شغّل الاختبار وقارن العمودين: الصيغ التي تدرّب عليها بالصيغ الجديدة.",
    try2: "اقرأ الأخطاء: أي التفاصيل ينسخها «درسي الصغير» خطأً، وأي الطلبات يسيء فهمها؟",
    try3: "إن علّمت «درسي الصغير» أداة الحافلات في «علّم الوكيل أداة جديدة»، فاختبر ذلك النموذج أيضًا، خاصة بعد تعليمه دون محادثات قديمة ممزوجة.",
    takeaway: "التقييم مجموعة اختبار ثابتة أجوبتها معروفة، تُصحَّح بالطريقة نفسها كل مرة. وهو يُظهر أين يخطئ الوكيل (هنا: الصيغ الجديدة)، فتعرف ما تصلحه أو تحرسه قبل أن تثق به.",
  },
};

export default function Evals({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const tiny = useTiny();
  const [rows, setRows] = useState<Scored[]>([]);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const [only, setOnly] = useState<"fail" | "all">("fail");
  const [saved, setSaved] = useState<ArrayBuffer | null>(null);
  const [use, setUse] = useState<"original" | "taught">("original");
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => {
    let alive = true;
    storage.get<{ buf: ArrayBuffer }>(SAVE_KEY).then((x) => { if (alive && x?.buf) setSaved(x.buf); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    stopped.current = false;
    setRows([]);
    try {
      await tiny.prepare();
      await tiny.lm.useFineTune(use === "taught" ? saved : null);
      const calc = (e: string) => { const r = runTool(tiny.world.current!, "calculator", { expr: e }, "en"); return typeof r.value === "number" ? r.value : null; };
      const out: Scored[] = [];
      const t0 = performance.now();
      for (const cs of CASES) {
        if (stopped.current) break;
        const r = await tiny.lm.generate({ tools: TOOLS, turns: [{ role: "user", text: cs.text }] }, { maxTokens: 60 });
        if (r.stoppedBy === "stopped") break;
        out.push(score(cs, r.step.call, r.step.answer, r.prefillMs + r.decodeMs, calc));
        setRows([...out]);
        setMs(performance.now() - t0);
      }
      if (out.length === CASES.length) onDone?.();
    } catch { /* TinyGate */ } finally { setBusy(false); }
  };

  const t = tally(rows);
  const cell = (g: Group) => (t[g].n ? s.cell(num(t[g].args), num(t[g].n), num(pct(t[g].args, t[g].n))) : "–");
  const shown = rows.filter((r) => only === "all" || !r.args);
  const sec = (x: number) => num(Math.round(x / 100) / 10);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-row">
        {saved && <Segmented label={s.model} value={use} options={[["original", s.original], ["taught", s.taught]] as const} onChange={(v) => !busy && setUse(v)} />}
      </div>
      <div className="lb-row">
        {busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button>
          : <Button icon="play" onClick={run}>{rows.length ? s.again : s.run}</Button>}
      </div>
      <TinyGate tiny={tiny} onRetry={run} />
      {rows.length > 0 && (
        <div className="stack" aria-live="polite">
          <ProgressBar value={Math.round((100 * rows.length) / CASES.length)} label={s.progress(num(rows.length), num(CASES.length))} valueText={`${num(rows.length)}/${num(CASES.length)}`} />
          <p className="lb-note">{s.time(sec(ms), sec(ms / rows.length))}</p>
          <div className="lb-scroll" role="region" aria-label={s.table} tabIndex={0}>
            <table className="lb-dt lb-ag-score">
              <caption className="lb-dt-cap">{s.table}</caption>
              <thead><tr><th scope="col">{s.lang}</th><th scope="col">{s.trained}</th><th scope="col">{s.fresh}</th></tr></thead>
              <tbody>
                <tr><th scope="row">English</th><td>{cell("en-trained")}</td><td>{cell("en-new")}</td></tr>
                <tr><th scope="row"><span lang="ar" className="dr-other-script">العربية</span></th><td>{cell("ar-trained")}</td><td>{cell("ar-new")}</td></tr>
                <tr className="is-total"><th scope="row">{s.all}</th><td>{t.trained.n ? s.cell(num(t.trained.args), num(t.trained.n), num(pct(t.trained.args, t.trained.n))) : "–"}</td><td>{t.new.n ? s.cell(num(t.new.args), num(t.new.n), num(pct(t.new.args, t.new.n))) : "–"}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="lb-verdict">{s.total(num(t.all.args), num(t.all.n), num(pct(t.all.args, t.all.n)))} <span className="lb-note">{s.toolOnly(num(pct(t.all.tool, t.all.n)))}</span></p>
          <p className="lb-note">{s.card}</p>
          <Segmented label={s.show} value={only} options={[["fail", s.failures], ["all", s.every]] as const} onChange={setOnly} />
          {shown.length ? (
            <ul className="lb-ag-results">
              {shown.map((r) => (
                <li key={r.id} className={r.args ? "is-ok" : "is-bad"}>
                  <span aria-hidden>{r.args ? "✓" : "✗"}</span>
                  <span className="lb-ag-body">
                    <span className="lb-note">{s.groups[r.group]}</span><br />
                    <Txt text={r.text} /><br />
                    <span className="lb-note">{s.got}: </span>{r.got ? <Code text={callText(r.got)} /> : <><span className="lb-note">{s.noCall}</span><Txt text={r.said ?? ""} /></>}
                    {!r.args && <><br /><span className="lb-note">{s.want}: </span><Code text={callText(r.want)} /></>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="lb-note">{s.none}</p>}
        </div>
      )}
    </LabShell>
  );
}
