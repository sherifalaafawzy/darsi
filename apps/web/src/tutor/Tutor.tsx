import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Button } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { track } from "../analytics/track";
import { Gate, Speaker, floatToUlaw, mouthFor, startMic } from "./audio";
import { ExplainerCard, type ExplainerPlayer } from "./Explainer";
import { TutorFace } from "./Face";
import "./strings";
import "../styles/tutor.css";

/**
 * Darsi Super's tutor for a lesson (docs/SUPER.md §4), as the panel the lesson screen's button opens (TutorPanel) or
 * the /tutor?unit=…&lesson=… page (Tutor). A lazy chunk, not precached. Typing goes to the tutorAsk callable; talking
 * goes over a WebSocket to the relay on Cloud Run, which holds the Gemini Live session. App passes both in (they reach
 * Firebase), with the relay's address. The avatar is the cast's face, lip-synced on the phone from the tutor's voice.
 * With the tutor agent on (functions/src/agent.ts), answers can come with an explainer, a Lesson Studio package the
 * light player draws; "Show me" asks for one, and the agent keeps the conversation in its session (sessionId).
 */
type Source = { id: string; unitId: string; lessonId: string; stepId: string; lesson: string };
type Pkg = Parameters<typeof ExplainerCard>[0]["pkg"];
type Msg = { who: "me" | "tutor"; text: string; sources?: Source[]; credits?: number; q?: string; explainer?: Pkg; autoplay?: boolean };
type Ask = (d: { unitId: string; lessonId: string | null; question: string; lang: string; history: { role: string; text: string }[]; sessionId?: string; show?: boolean }) => Promise<{ inScope: boolean; answer: string; sources: Source[]; credits: number; left: number; explainer?: Pkg | null; sessionId?: string }>;
type Status = (d: Record<string, never>) => Promise<{ super: boolean; on: boolean; left: number; minute: number | null; maxMinutes: number; explainer?: number | null }>;
type Talk = "off" | "connecting" | "listening" | "thinking" | "speaking";
/** Player: the light player for explainers, from App (null where it isn't registered). */
export interface TutorProps { relayUrl: string; ask: Ask; status: Status; Player: ExplainerPlayer }

const saveData = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ""));
};

/** The /tutor page, for links from outside a lesson. */
export function Tutor(props: TutorProps) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const title = (useLocation().state as { title?: string } | null)?.title;
  return (
    <>
      <AppBar title={t("tu.title")} onBack={() => nav(-1)} backLabel={t("common.back")} />
      <main className="screen narrow stack">
        {title && <p className="muted">{t("tu.about", { lesson: title })}</p>}
        <TutorBody {...props} unitId={params.get("unit") ?? ""} lessonId={params.get("lesson")} />
      </main>
    </>
  );
}

/** The panel beside a lesson: a side panel from 900 px, a sheet below. Escape or Close shuts it (and any call). */
export function TutorPanel({ unitId, lessonId, onClose, ...props }: TutorProps & { unitId: string; lessonId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <aside ref={box} className="tu-panel" role="dialog" aria-label={t("tu.title")} tabIndex={-1}>
      <div className="tu-panel-head">
        <h2 className="tu-panel-title">{t("tu.title")}</h2>
        <Button size="sm" variant="ghost" icon="close" onClick={onClose}>{t("common.close")}</Button>
      </div>
      <div className="tu-panel-body stack">
        <TutorBody {...props} unitId={unitId} lessonId={lessonId} onLeave={onClose} />
      </div>
    </aside>
  );
}

function TutorBody({ relayUrl, ask, status, Player, unitId, lessonId, onLeave }: TutorProps & { unitId: string; lessonId: string | null; onLeave?: () => void }) {
  const { t, lang, num } = useI18n();
  const nav = useNavigate();
  const { user, plan } = useAuth();
  const active = !!plan && plan.until > Date.now();
  const [info, setInfo] = useState<Awaited<ReturnType<Status>> | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [mode, setMode] = useState<"type" | "talk">(() => (saveData() || !relayUrl ? "type" : "talk"));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [talk, setTalk] = useState<Talk>("off");
  const session = useRef<{ ws: WebSocket; mic?: { stop: () => void }; speaker: Speaker } | null>(null);
  const agentSession = useRef(""); // the tutor agent's session for this panel: it remembers the conversation
  // The avatar moves through CSS variables set on this element (no re-render): --mouth from the voice, --ear from the mic.
  const avatar = useRef<HTMLDivElement>(null);
  const setVar = (name: string, v: number) => avatar.current?.style.setProperty(name, v.toFixed(2));
  const tutorLang = lang === "ar" ? "ar" : "en";

  useEffect(() => { track("tutor_open", { u: unitId.slice(0, 40) }); }, [unitId]);
  useEffect(() => {
    if (!user || !active) return;
    status({}).then((s) => { setInfo(s); setLeft(s.left); }, () => setErr("offline"));
  }, [user, active, status]);
  useEffect(() => () => stopTalk(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => {
    const m = String((e as Error)?.message ?? e);
    setErr(/no-credits|resource-exhausted/.test(m) ? "no-credits" : /tutor-closed|not priced/.test(m) ? "closed" : /no-super|permission/.test(m) ? "no-super" : "error");
  };
  // Adds to the tutor's (or the learner's) current message while it is being spoken, else starts a new one.
  const append = (who: Msg["who"], text: string, fresh = false) => setMsgs((m) => {
    const last = m[m.length - 1];
    return !fresh && last?.who === who ? [...m.slice(0, -1), { ...last, text: last.text + text }] : [...m, { who, text }];
  });
  const leave = (to: string) => { stopTalk(); onLeave?.(); nav(to); };

  /** A typed question, or (show) a request to see an earlier question explained. */
  const send = async (question?: string, show = false) => {
    const q = (question ?? draft).trim();
    if (!q || busy) return;
    if (!show) setDraft("");
    setErr(null); setBusy(true);
    const history = msgs.filter((m) => m.text).slice(-6).map((m) => ({ role: m.who === "me" ? "user" : "tutor", text: m.text }));
    setMsgs((m) => [...m, { who: "me", text: show ? `${t("tu.showMe")}: ${q}` : q }]);
    track("tutor_question", { m: show ? "show" : "text" });
    try {
      const a = await ask({ unitId, lessonId, question: q, lang: tutorLang, history, sessionId: agentSession.current || undefined, show });
      if (a.sessionId) agentSession.current = a.sessionId;
      setMsgs((m) => [...m, { who: "tutor", text: a.answer, sources: a.sources, credits: a.credits, q: a.inScope ? q : undefined, explainer: a.explainer ?? undefined }]);
      setLeft(a.left);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const startTalk = async () => {
    if (!user || session.current) return;
    setErr(null); setTalk("connecting");
    const speaker = new Speaker((v) => setVar("--mouth", v));
    const ws = new WebSocket(relayUrl);
    ws.binaryType = "arraybuffer";
    session.current = { ws, speaker };
    let turnOpen = false;
    ws.onopen = async () => ws.send(JSON.stringify({ type: "hello", token: await user.getIdToken(), unitId, lessonId, lang: tutorLang }));
    ws.onmessage = async (e) => {
      if (e.data instanceof ArrayBuffer) { speaker.play(new Uint8Array(e.data)); setTalk("speaking"); return; }
      const m = JSON.parse(e.data as string) as { type: string; text?: string; left?: number; used?: number; code?: string; items?: Source[]; pkg?: Pkg };
      if (m.type === "ready") {
        setLeft(m.left ?? null); setTalk("listening");
        track("tutor_question", { m: "voice" });
        const gate = new Gate();
        try {
          const mic = await startMic((f) => {
            if (!speaker.speaking) setVar("--ear", mouthFor(f));
            for (const x of gate.push(f, speaker.speaking)) if (ws.readyState === 1) ws.send(floatToUlaw(x));
          });
          if (session.current) session.current.mic = mic; else mic.stop();
        } catch { setErr("mic"); stopTalk(); }
      } else if (m.type === "heard" && m.text) { append("me", m.text, turnOpen); turnOpen = false; if (!speaker.speaking) setTalk("thinking"); }
      else if (m.type === "said" && m.text) append("tutor", m.text);
      else if (m.type === "sources" && m.items?.length) setMsgs((x) => [...x, { who: "tutor", text: "", sources: m.items }]);
      else if (m.type === "explainer" && m.pkg) setMsgs((x) => [...x, { who: "tutor", text: "", explainer: m.pkg, autoplay: true }]);
      else if (m.type === "interrupted") { speaker.clear(); setTalk("listening"); }
      else if (m.type === "turn") { turnOpen = true; setTimeout(() => !speaker.speaking && session.current && setTalk("listening"), 300); }
      else if (m.type === "credits") setLeft(m.left ?? null);
      else if (m.type === "out") setErr("no-credits");
      else if (m.type === "error") setErr(m.code === "no-credits" ? "no-credits" : m.code === "tutor-closed" ? "closed" : m.code === "time" ? "time" : m.code === "no-super" ? "no-super" : "error");
    };
    ws.onclose = () => stopTalk();
    ws.onerror = () => { setErr("error"); stopTalk(); };
  };
  const stopTalk = () => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    s.mic?.stop(); s.speaker.close();
    if (s.ws.readyState === 1) { s.ws.send(JSON.stringify({ type: "bye" })); s.ws.close(); }
    setVar("--ear", 0);
    setTalk("off");
  };

  const minutes = info?.minute && left !== null ? Math.floor(left / info.minute) : null;
  const errText: Record<string, string> = { "no-credits": t("tu.noCredits"), closed: t("tu.closed"), "no-super": t("tu.needSuper"), mic: t("tu.mic"), time: t("tu.time"), offline: t("tu.offline"), error: t("tu.error") };
  const face = busy ? "thinking" : talk;
  const stateText = t(talk === "off" ? "tu.ready" : talk === "connecting" ? "tu.connecting" : talk === "speaking" ? "tu.speaking" : talk === "thinking" ? "tu.thinking" : "tu.listening");

  return (<>
    <div ref={avatar} className={`tu-av is-${face}`}><TutorFace className="tf-blink" /></div>
    {!user || !active ? (
      <section className="panel stack">
        <p>{t("tu.pitch")}</p>
        <div><Button onClick={() => leave("/upgrade?from=tutor")}>{t("tu.getSuper")}</Button></div>
      </section>
    ) : !unitId ? <p className="notice">{t("tu.fromLesson")}</p> : (<>
      {left !== null && <p className="muted small tu-center" role="status">{minutes !== null ? t("tu.leftMinutes", { n: num(left), m: num(minutes) }) : t("tu.left", { n: num(left) })}</p>}

      {mode === "talk" && (
        <div className="stack-sm tu-talk">
          <p className="tu-state" role="status">{stateText}</p>
          <div>{talk === "off"
            ? <Button icon="audio" onClick={() => void startTalk()}>{t("tu.start")}</Button>
            : <Button variant="secondary" icon="close" onClick={stopTalk}>{t("tu.stop")}</Button>}</div>
          <p className="muted small">{t("tu.talkData")}</p>
        </div>
      )}

      <div className="row-gap tu-modes" role="group" aria-label={t("tu.mode")}>
        {relayUrl && <Button size="sm" icon="audio" variant={mode === "talk" ? "primary" : "ghost"} aria-pressed={mode === "talk"} onClick={() => setMode("talk")}>{t("tu.talk")}</Button>}
        <Button size="sm" icon="edit" variant={mode === "type" ? "primary" : "ghost"} aria-pressed={mode === "type"} onClick={() => { stopTalk(); setMode("type"); }}>{t("tu.type")}</Button>
      </div>

      <ol className="tu-chat" aria-live="polite">
        {msgs.length === 0 && <li className="tu-hint muted">{t("tu.hint")}</li>}
        {msgs.map((m, i) => (
          <li key={i} className={m.who === "me" ? "tu-me" : m.explainer ? "tu-tutor tu-wide" : "tu-tutor"}>
            {m.text && <p dir="auto">{m.text}</p>}
            {m.sources?.length ? <p className="tu-src small">{t("tu.from")}{" "}
              {m.sources.map((s, j) => <button key={s.id} type="button" className="tu-link" onClick={() => leave(`/lesson/${s.unitId}/${s.lessonId}`)}>{s.lesson}{j < m.sources!.length - 1 ? t("common.sep") : ""}</button>)}</p> : null}
            {m.explainer && <ExplainerCard pkg={m.explainer} lang={tutorLang} autoplay={m.autoplay} Player={Player} />}
            {m.credits ? <p className="muted small">{t("tu.used", { n: num(m.credits) })}</p> : null}
            {m.q && !m.explainer && info?.explainer ? <div><Button size="sm" variant="secondary" icon="play" disabled={busy} onClick={() => void send(m.q, true)}>{t("tu.showMe")}</Button> <span className="muted small">{t("tu.showCost", { n: num(info.explainer) })}</span></div> : null}
          </li>
        ))}
      </ol>

      {err && <p className={err === "no-credits" ? "notice" : "notice err"} role="status">{errText[err]}{err === "no-credits" && <> <Button size="sm" variant="secondary" onClick={() => leave("/upgrade?from=tutor")}>{t("tu.more")}</Button></>}</p>}

      {mode === "type" && (
        <div className="stack-sm">
          <textarea className="dr-reflect-input" dir="auto" rows={3} value={draft} maxLength={1500} placeholder={t("tu.ask")} aria-label={t("tu.ask")} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <div><Button icon="next" loading={busy} disabled={!draft.trim()} onClick={() => void send()}>{t("tu.send")}</Button></div>
          {busy && msgs[msgs.length - 1]?.text.startsWith(`${t("tu.showMe")}:`) && <p className="muted small" role="status">{t("tu.showing")}</p>}
        </div>
      )}
    </>)}
  </>);
}
