/**
 * Shared screen pieces for the AI-security labs that run Darsi Tiny (inject, guardrails, privilege, redteam):
 *  - a gate that shows the ~2.8 MB download size (model, tokenizer and the school's data) and only fetches the model on a button press (brand: never on load);
 *  - a transcript that shows every step of the agent loop (plan, call, result, answer), left to right;
 *  - a scripted fallback, clearly labelled "recorded", so a lab still teaches on a phone that can't download the model.
 *
 * Imported by the four labs above; named lab-* so the service worker keeps it out of the precache (vite.config.ts).
 * It imports Darsi Tiny only through src/tinylm/index.ts, the one module a lab may use.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TinyLM, fetchManifest, fetchWorld, isDownloaded, type World } from "../../../tinylm";
import { useAppBase } from "../../../tinylm/base";
import { useS } from "../../kit/strings";
import { agentTurn, converse, type Event, type Generate, type Hooks } from "./lab-agent";

const T = {
  en: {
    model: "Darsi Tiny", about: "A tiny AI agent that runs on your phone: it reads a request, plans, calls a pretend school tool, and answers. Everything here is a simulation — it sends no real messages.",
    size: (mb: string) => `Download the model (${mb} MB, once)`, downloading: "Downloading the model…", loaded: "Model ready, on your phone.",
    recorded: "See a recorded run instead", recordedTag: "Recorded run (the model is not downloaded)", retry: "Try the download again",
    offline: "Couldn't download the model. You can still watch a recorded run.", thinking: "Darsi Tiny is thinking…", stop: "Stop",
    you: "You", plan: "Plan", calls: "Calls the tool", result: "Tool result", shows: "Shown to the model", answer: "Answers", blocked: "Blocked by a rule", codeSays: "Code answers",
    note: "This result also carried an instruction.",
  },
  ar: {
    model: "«درسي الصغير»", about: "وكيل ذكاء اصطناعي صغير يعمل على هاتفك: يقرأ الطلب، ويخطّط، ويستدعي أداة مدرسية محاكاة، ثم يجيب. وكل ما هنا محاكاة، فهو لا يرسل أي رسالة حقيقية.",
    size: (mb: string) => `نزّل النموذج (${mb} ميغابايت، مرة واحدة)`, downloading: "يجري تنزيل النموذج…", loaded: "النموذج جاهز على هاتفك.",
    recorded: "شاهد تشغيلًا مسجّلًا بدلًا من ذلك", recordedTag: "تشغيل مسجّل (النموذج غير مُنزّل)", retry: "أعد محاولة التنزيل",
    offline: "تعذّر تنزيل النموذج. ما زال بإمكانك مشاهدة تشغيل مسجّل.", thinking: "يفكّر «درسي الصغير»…", stop: "أوقف",
    you: "أنت", plan: "الخطة", calls: "يستدعي الأداة", result: "نتيجة الأداة", shows: "ما يراه النموذج", answer: "يجيب", blocked: "أوقفته قاعدة", codeSays: "يجيب الكود",
    note: "حملت هذه النتيجة تعليمات أيضًا.",
  },
};

/** The one TinyLM for a lab (the worker ends itself when idle). State for the gate: not started, loading, ready, failed. */
export type TinyState = "idle" | "loading" | "ready" | "error";
export interface Tiny {
  state: TinyState;
  mb: string;
  progress: number;
  world: World | null;
  /** Download (or read from cache) and start the model. */
  load: () => void;
  /** One move of the model in a conversation (what agentTurn/converse want). */
  generate: Generate;
  stop: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}

export function useTiny(): Tiny {
  const base = useAppBase();
  const lm = useMemo(() => new TinyLM({ base }), [base]);
  const lmRef = useRef(lm);
  lmRef.current = lm;
  const [state, setState] = useState<TinyState>("idle");
  const [bytes, setBytes] = useState(2_746_862 + 10_746 + 15_720);
  const [progress, setProgress] = useState(0);
  const [world, setWorld] = useState<World | null>(null);
  const [busy, setBusy] = useState(false);
  const { num } = useI18n();

  useEffect(() => {
    let live = true;
    setWorld(null);
    fetchManifest(base).then((m) => { if (live && m.files["model.bin"]) setBytes(m.files["model.bin"].gzip + m.files["tokenizer.json"].gzip + m.files["world.json"].gzip); }).catch(() => {});
    isDownloaded(base).then((has) => { if (live && has) setState((s) => (s === "idle" ? "ready" : s)); }).catch(() => {});
    return () => { live = false; lm.dispose(); };
  }, [lm, base]);

  const load = useCallback(() => {
    setState("loading"); setProgress(0);
    const total = bytes;
    Promise.all([
      lm.load((loaded, t) => setProgress(Math.min(1, loaded / (t || total)))),
      fetchWorld(base),
    ]).then(([, w]) => { setWorld(w); setProgress(1); setState("ready"); }).catch(() => setState("error"));
  }, [bytes, lm, base]);

  const generate: Generate = useCallback(async (conv) => {
    const r = await lmRef.current.generate(conv, { maxTokens: 120 });
    return { step: r.step, stoppedBy: r.stoppedBy };
  }, []);
  const stop = useCallback(() => lmRef.current.stop(), []);

  return { state, mb: num(Math.round(bytes / 1e5) / 10), progress, world, load, generate, stop, busy, setBusy };
}

/** The download gate. Shows the size and a button; while loading, a progress bar; on failure, Retry and the fallback.
 *  `onRecorded` switches the lab to its recorded transcript. Children show once the model is ready. */
export function ModelGate({ tiny, onRecorded, children }: { tiny: Tiny; onRecorded?: () => void; children: ReactNode }) {
  const t = useS(T);
  if (tiny.state === "ready") return <>{children}</>;
  return (
    <div className="lb-tiny-gate">
      <p className="lb-note"><Icon name="agent" size={18} /> {t.about}</p>
      {tiny.state === "loading" ? (
        <>
          <p aria-live="polite">{t.downloading}</p>
          <div className="lb-meter" aria-hidden><span style={{ inlineSize: `${Math.round(tiny.progress * 100)}%` }} /></div>
        </>
      ) : tiny.state === "error" ? (
        <>
          <p className="lb-verdict is-warn" aria-live="assertive">{t.offline}</p>
          <div className="lb-row">
            <Button size="sm" icon="sync" onClick={tiny.load}>{t.retry}</Button>
            {onRecorded && <Button size="sm" variant="secondary" onClick={onRecorded}>{t.recorded}</Button>}
          </div>
        </>
      ) : (
        <div className="lb-row">
          <Button size="sm" icon="install" onClick={tiny.load}>{t.size(tiny.mb)}</Button>
          {onRecorded && <Button size="sm" variant="ghost" onClick={onRecorded}>{t.recorded}</Button>}
        </div>
      )}
    </div>
  );
}

/** "Darsi Tiny is thinking…" with a Stop button, while a turn runs. */
export function Thinking({ onStop }: { onStop: () => void }) {
  const t = useS(T);
  return <div className="lb-row" aria-live="polite"><span className="dr-spinner" aria-hidden /><span>{t.thinking}</span><Button size="sm" variant="ghost" icon="pause" onClick={onStop}>{t.stop}</Button></div>;
}

/** A banner naming a transcript as recorded (not a live run of the model). */
export function RecordedTag() {
  const t = useS(T);
  return <p className="lb-tiny-tag"><Icon name="info" size={16} /> {t.recordedTag}</p>;
}

const asLtr = (s: string) => <bdi dir="ltr">{s}</bdi>;

/** The agent loop as a transcript: each person turn, plan, call, result (with what the model was shown), answer. */
export function Transcript({ events }: { events: readonly Event[] }) {
  const t = useS(T);
  return (
    <ol className="lb-convo">
      {events.map((e, i) => <li key={i} className={`lb-ev is-${e.kind}`}>{renderEvent(e, t)}</li>)}
    </ol>
  );
}

function renderEvent(e: Event, t: typeof T.en): ReactNode {
  if (e.kind === "user") return <><span className="lb-ev-tag">{t.you}</span><p dir="auto">{e.text}</p></>;
  if (e.kind === "plan") return <><span className="lb-ev-tag">{t.plan}</span><p dir="auto">{e.text}</p></>;
  if (e.kind === "call") return <><span className="lb-ev-tag">{e.blocked ? t.blocked : t.calls}</span><code className={e.blocked ? "lb-ev-call is-blocked" : "lb-ev-call"}>{asLtr(e.call.tool + JSON.stringify(e.call.args))}</code>{e.blocked && <p className="lb-ev-why">{e.blocked}</p>}</>;
  if (e.kind === "result") return (
    <>
      <span className="lb-ev-tag">{e.seen !== undefined ? t.shows : t.result}</span>
      <code className="lb-ev-res">{asLtr(JSON.stringify(e.seen !== undefined ? e.seen : e.result))}</code>
    </>
  );
  if (e.kind === "answer") return <><span className="lb-ev-tag">{e.byCode ? t.codeSays : t.answer}</span><p dir="auto">{e.text}</p></>;
  return <><span className="lb-ev-tag">—</span><code className="lb-ev-res" dir="ltr">{e.text}</code></>;
}

export { agentTurn, converse, type Event, type Hooks };
