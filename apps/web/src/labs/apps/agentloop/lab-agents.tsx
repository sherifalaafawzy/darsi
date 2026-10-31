/**
 * Darsi Tiny for the AI agents labs: the model's download note, the streamed steps of a conversation, and text that
 * may be English, Arabic or code. Shared by the nine agents apps (they import it from here, so it loads with the first
 * of them). Nothing runs until the learner presses a button; the worker ends by itself 5 s after the last request,
 * and at once when the lab closes.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, ProgressBar } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { fetchManifest, fetchWorld, isDownloaded, runTool, TinyLM, type Conversation, type Lang, type ToolCall, type Turn, type World } from "../../../tinylm";
import { useAppBase } from "../../../tinylm/base";
import { useS } from "../../kit/strings";
import { nextOf, type Gen, type GenResult } from "./agent";

const S = {
  en: {
    needs: (mb: string) => `Darsi Tiny, a small language model, runs on this phone. It needs a one-time download of ${mb} MB, then it works offline.`,
    here: "Darsi Tiny is on this phone, so this works offline.",
    loading: "Getting Darsi Tiny ready…",
    offline: (mb: string) => `Darsi Tiny needs one download (${mb} MB). Connect to the internet once, then it works offline too.`,
    failed: "Darsi Tiny couldn't start.", retry: "Try again",
    you: "You", model: "Darsi Tiny", app: "The app",
    plan: "Plan", call: "Tool call", result: "Tool result", answer: "Answer", writing: "writing…",
    loop: "The loop", request: "Request",
  },
  ar: {
    needs: (mb: string) => `يعمل «درسي الصغير»، وهو نموذج لغوي صغير، على هذا الهاتف. يحتاج إلى تنزيل لمرة واحدة حجمه ${mb} ميغابايت، ثم يعمل دون اتصال.`,
    here: "«درسي الصغير» موجود على هذا الهاتف، فيعمل هذا دون اتصال.",
    loading: "جارٍ تجهيز «درسي الصغير»…",
    offline: (mb: string) => `يحتاج «درسي الصغير» إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم يعمل دون اتصال أيضًا.`,
    failed: "تعذّر تشغيل «درسي الصغير».", retry: "حاول مجددًا",
    you: "أنت", model: "درسي الصغير", app: "التطبيق",
    plan: "الخطة", call: "استدعاء أداة", result: "نتيجة الأداة", answer: "الجواب", writing: "يكتب…",
    loop: "الحلقة", request: "الطلب",
  },
};
export const useTinyS = () => useS(S);

export type TinyState = "idle" | "loading" | "ready" | "offline" | "error";
/** The segment the model is writing now, as it streams. */
export interface Live { kind: "plan" | "call" | "answer" | null; text: string }

/** Download size of what the labs fetch (model, tokenizer, the school's data), gzipped, in bytes. */
export const DOWNLOAD_FALLBACK = 2_746_862 + 10_746 + 15_720;

/**
 * One Darsi Tiny per lab. `prepare()` downloads (or reads from the cache) the model and the school's data the first
 * time; `gen` is the agent loop's model step, streaming what it writes into `live`.
 */
export function useTiny() {
  const base = useAppBase();
  const lm = useMemo(() => new TinyLM({ base }), [base]);
  const [state, setState] = useState<TinyState>("idle");
  const [progress, setProgress] = useState(0);
  const [bytes, setBytes] = useState(DOWNLOAD_FALLBACK);
  const [onPhone, setOnPhone] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const world = useRef<World | null>(null);
  useEffect(() => {
    world.current = null;
    let alive = true;
    fetchManifest(base).then((m) => { if (alive) setBytes(m.files["model.bin"].gzip + m.files["tokenizer.json"].gzip + m.files["world.json"].gzip); }).catch(() => {});
    isDownloaded(base).then((d) => { if (alive) setOnPhone(d); });
    return () => { alive = false; lm.dispose(); };
  }, [lm, base]);

  const prepare = useCallback(async (): Promise<World> => {
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const [w] = await Promise.all([world.current ?? fetchWorld(base), lm.load((done, total) => setProgress(total ? done / total : 0))]);
      world.current = w;
      setState("ready");
      setOnPhone(true);
      return w;
    } catch (e) {
      setState(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
      throw e;
    }
  }, [lm, base]);

  const gen: Gen = useCallback(async (c, opts) => {
    let kind: Live["kind"] = nextOf(c.turns) === "plan" ? "plan" : null, text = "";
    setLive({ kind, text });
    try {
      return await lm.generate(c, {
        ...opts,
        onToken: (t) => {
          if (t.marker) { kind = t.marker === "plan" || t.marker === "call" || t.marker === "answer" ? t.marker : kind; text = ""; }
          else text += t.text;
          setLive({ kind, text });
        },
      }) as GenResult;
    } finally { setLive(null); }
  }, [lm]);

  const run = useCallback((call: ToolCall, lang: Lang) => runTool(world.current!, call.tool, call.args, lang), []);
  return { lm, state, progress, bytes, onPhone, live, prepare, gen, run, world };
}
export type Tiny = ReturnType<typeof useTiny>;

/** The download note before the first run, the progress while loading, and what to do offline. */
export function TinyGate({ tiny, onRetry }: { tiny: Tiny; onRetry?: () => void }) {
  const s = useTinyS();
  const { num } = useI18n();
  const mb = num(Math.round(tiny.bytes / 1e5) / 10);
  if (tiny.state === "ready") return null;
  if (tiny.state === "loading") return <ProgressBar value={Math.round(tiny.progress * 100)} label={s.loading} valueText={num(Math.round(tiny.progress * 100)) + "%"} />;
  if (tiny.state === "offline") return <p className="notice">{s.offline(mb)}</p>;
  if (tiny.state === "error") return <div className="lb-row"><p className="lb-verdict is-warn">{s.failed}</p>{onRetry && <Button variant="secondary" icon="sync" onClick={onRetry}>{s.retry}</Button>}</div>;
  return <p className="lb-note">{tiny.onPhone ? s.here : s.needs(mb)}</p>;
}

const ARABIC = /[؀-ۿ]/;
/** Text that may be Arabic on a page in another language: it gets lang="ar" and the phone's own font (no web font download). */
export function Txt({ text, className }: { text: string; className?: string }) {
  const ar = ARABIC.test(text);
  return <span dir="auto" lang={ar ? "ar" : undefined} className={[className, ar && "dr-other-script"].filter(Boolean).join(" ") || undefined}>{text}</span>;
}

/** Code-like text (a call, a result, the raw prompt), always left to right. */
export function Code({ text, block }: { text: string; block?: boolean }) {
  const ar = ARABIC.test(text);
  const cls = [block ? "lb-ag-code" : "lb-ag-inline", ar && "dr-other-script"].filter(Boolean).join(" ");
  return block
    ? <pre className={cls} dir="ltr" lang={ar ? "ar" : undefined} translate="no">{text}</pre>
    : <code className={cls} dir="ltr" lang={ar ? "ar" : undefined} translate="no">{text}</code>;
}

export const json = (v: unknown) => JSON.stringify(v);
export const callStr = (c: ToolCall) => c.tool + JSON.stringify(c.args);

/** One turn of a conversation: who wrote it (you, Darsi Tiny or the app) and what. */
function TurnRow({ t, faded, note }: { t: Turn; faded?: boolean; note?: ReactNode }) {
  const s = useTinyS();
  const who = t.role === "user" ? s.you : t.role === "result" ? s.app : s.model;
  const what = t.role === "user" ? s.request : t.role === "plan" ? s.plan : t.role === "call" ? s.call : t.role === "result" ? s.result : s.answer;
  const body = t.role === "call" ? <Code text={callStr(t.call)} /> : t.role === "result" ? <Code text={json(t.result)} /> : <Txt text={t.text} />;
  return (
    <li className={`lb-ag-turn is-${t.role}${faded ? " is-out" : ""}`}>
      <span className="lb-ag-who"><strong>{who}</strong><span>{what}</span></span>
      <span className="lb-ag-body">{body}</span>
      {note}
    </li>
  );
}

/** A conversation as it grows, with the segment Darsi Tiny is writing right now. */
export function Turns({ turns, live, out, notes, label }: { turns: readonly Turn[]; live?: Live | null; out?: (i: number) => boolean; notes?: (i: number) => ReactNode; label?: string }) {
  const s = useTinyS();
  if (!turns.length && !live) return null;
  return (
    <ol className="lb-ag-turns" aria-label={label}>
      {turns.map((t, i) => <TurnRow key={i} t={t} faded={out?.(i)} note={notes?.(i)} />)}
      {live && (
        <li className={`lb-ag-turn is-${live.kind ?? "plan"} is-live`}>
          <span className="lb-ag-who"><strong>{s.model}</strong><span>{live.kind === "call" ? s.call : live.kind === "answer" ? s.answer : s.plan}</span><span className="lb-ag-writing">{s.writing}</span></span>
          <span className="lb-ag-body">{live.kind === "call" ? <Code text={live.text} /> : <Txt text={live.text} />}</span>
        </li>
      )}
    </ol>
  );
}

/** Example requests as buttons (Arabic ones keep the phone's font on English pages). */
export function Examples({ items, value, onPick, label }: { items: readonly string[]; value?: string; onPick: (text: string) => void; label: string }) {
  return (
    <div className="lb-ag-exs" role="group" aria-label={label}>
      {items.map((x) => <button key={x} type="button" className={x === value ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={x === value} onClick={() => onPick(x)}><Txt text={x} /></button>)}
    </div>
  );
}

/** Picks the language of the examples: English or Arabic, each name in its own script. */
export function LangPick({ value, onChange, label }: { value: Lang; onChange: (l: Lang) => void; label: string }) {
  return (
    <div className="lb-seg" role="radiogroup" aria-label={label}>
      <span className="lb-seg-label">{label}</span>
      {(["en", "ar"] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} className={value === l ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => onChange(l)}>
          {l === "en" ? <span lang="en">English</span> : <span lang="ar" className="dr-other-script">العربية</span>}
        </button>
      ))}
    </div>
  );
}

/** An on/off setting as one large button (the whole row is the target, at least 48 px tall). */
export function Toggle({ label, note, checked, onChange, disabled }: { label: string; note?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={checked ? "lb-ag-toggle is-on" : "lb-ag-toggle"} onClick={() => onChange(!checked)} disabled={disabled}>
      <span className="lb-ag-toggle-box" aria-hidden>{checked ? "✓" : ""}</span>
      <span className="lb-ag-toggle-text"><strong>{label}</strong>{note && <span>{note}</span>}</span>
    </button>
  );
}

/** Stops a run when the page is hidden (the screen locks, another app opens): nothing works in the background. */
export function useStopWhenHidden(active: boolean, stop: () => void) {
  const ref = useRef(stop);
  ref.current = stop;
  useEffect(() => {
    if (!active) return;
    const on = () => { if (document.hidden) ref.current(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [active]);
}

/** A new conversation with one request. */
export const ask = (tools: readonly string[], text: string, before: readonly Turn[] = []): Conversation => ({ tools, turns: [...before, { role: "user", text }] });
