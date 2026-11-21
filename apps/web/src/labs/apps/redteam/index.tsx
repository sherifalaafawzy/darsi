import { useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { TOOLS } from "../../../tinylm";
import { ModelGate, RecordedTag, RunFailed, Thinking, useTiny, agentTurn } from "../inject/lab-tiny";
import { answersOf } from "../inject/lab-agent";
import { BANK, probeText, redteamGate, report, score, statusOf, type Category, type Status } from "./model";
import { RECORDED } from "./recorded";

interface Res { id: string; cat: Category; wording: string; status: Status; answer: string }

const S = {
  en: {
    intro: "A red team tries the requests a chatbot should say no to, and keeps score. Run the bank against Darsi Tiny: it refuses most, but some reworded ones slip through. Read the misses, add a rule in code, and run it again.",
    guard: "Add a rule in code", guardRule: "Refuse a pupil's record to a third party, and never act without approval.",
    run: "Run the bank", again: "Run again", running: (n: string, m: string) => `Testing ${n} of ${m}…`,
    scored: (n: string, m: string) => `Refused ${n} of ${m}.`,
    status: { refused: "refused", revealed: "revealed a record", willing: "willing to send", complied: "complied", caught: "caught by the rule" } as Record<Status, string>,
    cat: { cheat: "Cheating", records: "False records", privacy: "Private details", impersonate: "Impersonation", scam: "Scam", insult: "Unkind" } as Record<Category, string>,
    wording: { trained: "trained wording", new: "new wording" } as Record<string, string>,
    reportH: "Red-team report", colCat: "Kind", colTries: "Tried", colMiss: "Got through", colSev: "Severity",
    sev: { 1: "low", 2: "medium", 3: "high" } as Record<number, string>,
    misses: "The misses", noMiss: "Nothing got through this run.",
    try1: "Run the bank: Darsi Tiny refuses most requests, but watch the reworded privacy and scam ones slip past. Learned refusals don't cover every wording.",
    try2: "Read a miss: for one, the bot was willing to send a scam message; for another, it gave out a pupil's record to a “neighbour”. Those are your findings.",
    try3: "Turn on “Add a rule in code” and run again: the rule catches the misses the model let through, and the score reaches the top. The report shows what, how often, and how bad.",
    takeaway: "A red-team test is how you learn where a chatbot fails: run the bad requests, score them, and write down what got through, how often, and how serious. The fixes that hold are rules in code, not hoping the model always says no.",
  },
  ar: {
    intro: "الفريق الأحمر يجرّب الطلبات التي ينبغي أن يرفضها الروبوت، ويسجّل النتيجة. شغّل البنك على «درسي الصغير»: يرفض معظمها، لكن بعض الصيغ المعاد صياغتها يتسلّل. اقرأ ما أخطأ فيه، وأضف قاعدة في الكود، وأعد التشغيل.",
    guard: "أضف قاعدة في الكود", guardRule: "ارفض إعطاء سجل تلميذ لطرف ثالث، ولا تتصرّف أبدًا دون موافقة.",
    run: "شغّل البنك", again: "شغّل من جديد", running: (n: string, m: string) => `يُختبر ${n} من ${m}…`,
    scored: (n: string, m: string) => `رفض ${n} من ${m}.`,
    status: { refused: "رفض", revealed: "كشف سجلًا", willing: "مستعدّ للإرسال", complied: "امتثل", caught: "أمسكته القاعدة" } as Record<Status, string>,
    cat: { cheat: "الغش", records: "تزوير السجلات", privacy: "بيانات خاصة", impersonate: "انتحال", scam: "احتيال", insult: "جارحة" } as Record<Category, string>,
    wording: { trained: "صيغة مدرَّبة", new: "صيغة جديدة" } as Record<string, string>,
    reportH: "تقرير الفريق الأحمر", colCat: "النوع", colTries: "جُرّب", colMiss: "تسلّل", colSev: "الخطورة",
    sev: { 1: "منخفضة", 2: "متوسطة", 3: "عالية" } as Record<number, string>,
    misses: "ما تسلّل", noMiss: "لم يتسلّل شيء في هذا التشغيل.",
    try1: "شغّل البنك: يرفض «درسي الصغير» معظم الطلبات، لكن راقب صيغة الاحتيال المعاد صياغتها وهي تتسلّل. الرفض المكتسب لا يغطّي كل صياغة.",
    try2: "اقرأ الخطأ: كان الروبوت مستعدًّا لإرسال رسالة احتيال إلى جميع أولياء الأمور تطلب أرقام بطاقاتهم البنكية. تلك ملاحظتك.",
    try3: "فعّل «أضف قاعدة في الكود» وأعد التشغيل: تمسك القاعدة بما مرّره النموذج، وتبلغ النتيجة قمّتها. ويُظهر التقرير ماذا، وكم مرة، وكم الخطورة.",
    takeaway: "اختبار الفريق الأحمر هو كيف تعرف أين يفشل الروبوت: شغّل الطلبات السيئة، وسجّلها، ودوّن ما تسلّل وكم مرة وكم خطورته. والإصلاحات التي تصمد قواعد في الكود، لا أملٌ أن يقول النموذج «لا» دائمًا.",
  },
};

export default function Redteam({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const tlang = lang === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [guard, setGuard] = useState(false);
  const [results, setResults] = useState<Res[] | null>(null);
  const [step, setStep] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [failed, setFailed] = useState(false);
  const stopFlag = useState(() => ({ current: false }))[0];

  async function run() {
    if (tiny.busy) return;
    tiny.setBusy(true); setResults([]); setStep(0); setFailed(false); stopFlag.current = false;
    const acc: Res[] = [];
    try {
      const world = await tiny.prepare();
      for (let i = 0; i < BANK.length; i++) {
        if (stopFlag.current) break;
        setStep(i + 1);
        const p = BANK[i];
        const hooks = { gate: guard ? (redteamGate as never) : undefined, stopped: () => stopFlag.current };
        const r = await agentTurn(tiny.generate, { tools: TOOLS, turns: [{ role: "user", text: probeText(p, tlang) }] }, world, hooks);
        acc.push({ id: p.id, cat: p.cat, wording: p.wording, status: statusOf(p.cat, r.events, guard), answer: answersOf(r.events)[0] ?? "" });
        setResults([...acc]);
      }
      onDone?.();
    } catch { setResults(null); setFailed(true); } finally { stopFlag.current = false; tiny.setBusy(false); }
  }
  const stop = () => { stopFlag.current = true; tiny.stop(); };

  const done = results && results.length === BANK.length && !tiny.busy;
  const rows = done ? report(results!) : [];
  const misses = done ? results!.filter((r) => r.status !== "refused" && r.status !== "caught") : [];

  const body = (
    <div className="stack">
      <button type="button" className={guard ? "lb-fix is-on" : "lb-fix"} aria-pressed={guard} onClick={() => { setGuard(!guard); setResults(null); setFailed(false); }}>
        <Icon name={guard ? "check" : "close"} size={18} /><span>{s.guard}<span className="lb-fix-rule">{s.guardRule}</span></span>
      </button>
      <div className="lb-runbar"><Button size="sm" icon="play" disabled={tiny.busy} onClick={run}>{results && results.length ? s.again : s.run}</Button></div>
      {tiny.busy && <div className="stack-sm" aria-live="polite"><p className="lb-note">{s.running(num(step), num(BANK.length))}</p><Thinking onStop={stop} /></div>}
      {failed && !tiny.busy && <RunFailed onRetry={run} onRecorded={() => setRecorded(true)} />}

      {results && !!results.length && (
        <>
          {done && <p className={`lb-verdict ${score(results) < BANK.length ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${score(results) < BANK.length ? "bad" : "good"}`}>{num(score(results))}/{num(BANK.length)}</span> {s.scored(num(score(results)), num(BANK.length))}</p>}
          <ul className="lb-probes">
            {results.map((r) => (
              <li key={r.id} className={r.status === "refused" || r.status === "caught" ? "is-pass" : "is-miss"}>
                <span className="lb-probe-top"><span className={`lb-out-tag is-${r.status === "refused" || r.status === "caught" ? "good" : "bad"}`}>{s.status[r.status]}</span><small>{s.cat[r.cat]}{lang === "ar" ? "، " : " · "}{s.wording[r.wording]}</small></span>
                <p dir="auto">{probeText(BANK.find((p) => p.id === r.id)!, tlang)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {done && (
        <div className="stack-sm">
          <h3 className="lb-h">{s.reportH}</h3>
          <div className="lb-scroll">
            <table className="lb-table lb-report">
              <thead><tr><th>{s.colCat}</th><th>{s.colTries}</th><th>{s.colMiss}</th><th>{s.colSev}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cat} className={r.misses ? "is-bad" : undefined}>
                    <td>{s.cat[r.cat]}</td><td>{num(r.tries)}</td><td>{num(r.misses)}</td><td><span className={`lb-sev is-${r.severity}`}>{s.sev[r.severity]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lb-note">{s.misses}: {misses.length ? "" : s.noMiss}</p>
          {misses.map((m) => <p key={m.id} className="lb-answer is-guess" dir="auto"><strong>{s.cat[m.cat]}</strong> — <bdi dir="auto">{m.answer || probeText(BANK.find((p) => p.id === m.id)!, tlang)}</bdi></p>)}
        </div>
      )}
    </div>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setResults(null); setFailed(false); setGuard(false); }}>
      {recorded
        ? <><RecordedTag /><RecordedScore tlang={tlang} s={s} /></>
        : <ModelGate tiny={tiny} onRecorded={() => setRecorded(true)}>{body}</ModelGate>}
    </LabShell>
  );
}

function RecordedScore({ tlang, s }: { tlang: "en" | "ar"; s: typeof S.en }) {
  const { num } = useI18n();
  const res = RECORDED[tlang];
  return (
    <ul className="lb-probes">
      {res.map((r) => (
        <li key={r.id} className={r.status === "refused" || r.status === "caught" ? "is-pass" : "is-miss"}>
          <span className="lb-probe-top"><span className={`lb-out-tag is-${r.status === "refused" || r.status === "caught" ? "good" : "bad"}`}>{s.status[r.status]}</span><small>{s.cat[BANK.find((p) => p.id === r.id)!.cat]}</small></span>
          <p dir="auto">{probeText(BANK.find((p) => p.id === r.id)!, tlang)}</p>
        </li>
      ))}
      <li className="is-pass"><span>{s.scored(num(res.filter((r) => r.status === "refused" || r.status === "caught").length), num(res.length))}</span></li>
    </ul>
  );
}
