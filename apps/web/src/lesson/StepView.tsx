import { useEffect, useMemo, useState } from "react";
import {
  FillBlank, HotspotImage, ImageChoice, MatchPairs, OrderSteps, QuestionHeader, QuizOption, Reflection, ScenarioCard, TextField, TrueFalse, VideoPlayer, Button,
} from "@darsi/design-system";
import { captionsFor, pickList, videoSrc, type Step, type VideoStep, type ChoiceStep, type TrueFalseStep } from "../content/types";
import { useI18n, type MessageKey } from "../i18n";
import { Art } from "../components/Art";
import { LabEmbed } from "../labs/loader";
import { ProjectView } from "./ProjectView";
import { grade, shuffled, type Answer } from "./engine";

const KEY_LABELS: Record<string, string[]> = { en: ["A", "B", "C", "D", "E"], ar: ["أ", "ب", "ج", "د", "هـ"] };

export interface StepViewProps {
  step: Step;
  /** null until checked; then true/false for graded steps. */
  result: boolean | null;
  /** Graded steps: the current answer (null = not ready to check). Ungraded: a sentinel when the step may continue. */
  onAnswer: (a: Answer | null) => void;
  onUngradedReady: (ready: boolean) => void;
  note?: string;
  onNote?: (text: string) => void;
  attempt: number;
  lessonId: string;
  unitId: string;
  /** Course editor preview: a project can't be submitted. */
  preview?: boolean;
}

export function StepView(p: StepViewProps) {
  const { t, L, lang, dir } = useI18n();
  const s = p.step;
  const keys = KEY_LABELS[lang] ?? KEY_LABELS.en;
  const res = p.result === null ? undefined : p.result ? "correct" : "wrong";
  const seed = `${s.id}-${p.attempt}`;
  const header = (typeKey: MessageKey, extra?: { hint?: string }) => <QuestionHeader type={s.type === "lab" ? "reflect" : s.type === "image" ? "image" : (s.type as "choice")} typeLabel={t(typeKey)} prompt={L(s.prompt)} hint={extra?.hint} />;

  switch (s.type) {
    case "choice": return <Choice key={seed} step={s} keys={keys} result={p.result} onAnswer={p.onAnswer} header={header("q.choice")} />;
    case "multi": return <Multi key={seed} {...p} keys={keys} header={header("q.multi")} />;
    case "truefalse": return <TF key={seed} step={s} result={p.result} onAnswer={p.onAnswer} header={header("q.truefalse")} />;
    case "image": return <Img key={seed} {...p} header={header("q.image")} res={res} />;
    case "match": {
      const left = s.pairs.map((x, i) => ({ id: `l${i}`, label: L(x.left) }));
      const right = shuffled(s.pairs.map((x, i) => ({ id: `r${i}`, label: L(x.right) })), seed);
      const answer = Object.fromEntries(s.pairs.map((_, i) => [`l${i}`, `r${i}`]));
      return <div className="stack">{header("q.match")}
        <MatchPairs key={seed} left={left} right={right} result={p.result !== null} answer={answer}
          onChange={(pairs) => p.onAnswer(Object.keys(pairs).length === s.pairs.length ? { kind: "match", pairs: Object.fromEntries(Object.entries(pairs).map(([l, r]) => [l.slice(1), r.slice(1)])) } : null)} /></div>;
    }
    case "order": return <Order key={seed} {...p} header={header("q.order")} />;
    case "fill": return <Fill key={seed} {...p} header={header("q.fill")} />;
    case "type": return <TypeIn key={seed} {...p} header={header("q.type")} />;
    case "hotspot": {
      return <div className="stack">{header("q.hotspot")}
        <HotspotImage key={seed} spots={s.spots.map((x) => ({ ...x, label: L(x.label) }))} counter={(a, b) => t("q.found", { n: a, total: b })}
          onChange={(found) => p.onAnswer({ kind: "hotspot", found })}>
          <div className="mock-answer" dir={dir} lang={lang}>
            <p className="mock-from">{s.mock.from}</p><p>{L(s.mock.body)}</p><p className="mock-link" dir="ltr">{L(s.mock.link)}</p>
          </div>
        </HotspotImage></div>;
    }
    case "scenario":
      return <div className="stack">{header("q.scenario")}
        <ScenarioCard key={seed} who={L(s.who)} initial={L(s.initial)} situation={L(s.situation)} ask={L(s.prompt)}
          choices={s.choices.map((c) => ({ id: c.id, label: L(c.label), tone: c.tone, toneLabel: c.tone === "good" ? t("q.strong") : t("q.think"), consequence: L(c.consequence) }))}
          onChange={() => p.onUngradedReady(true)} /></div>;
    case "reflect":
      return <Reflect key={seed} {...p} />;
    case "lab":
      return <LabStepView key={seed} {...p} />;
    case "video":
      return <VideoStepView key={seed} step={s} onReady={() => p.onUngradedReady(true)} />;
    case "read":
      return <ReadView key={seed} step={s} onReady={p.onUngradedReady} />;
    case "project":
      return <ProjectView key={seed} step={s} lessonId={p.lessonId} unitId={p.unitId} onReady={p.onUngradedReady} preview={p.preview} />;
  }
}

function ReadView({ step, onReady }: { step: Extract<Step, { type: "read" }>; onReady: (r: boolean) => void }) {
  const { t, L } = useI18n();
  useEffect(() => { onReady(true); }, [onReady]);
  return (
    <article className="reading" dir="auto">
      <QuestionHeader type="reflect" icon="file" typeLabel={t("lesson.read")} prompt={L(step.title)} />
      {L(step.body).split(/\n\n+/).map((para, i) => <p key={i}>{para}</p>)}
      {step.keyTerms?.length ? <aside className="key-terms"><h3>{t("lesson.keyTerms")}</h3><dl>{step.keyTerms.map((k, i) => <div key={i}><dt>{L(k.term)}</dt><dd>{L(k.def)}</dd></div>)}</dl></aside> : null}
    </article>
  );
}

function Choice({ step, keys, result, onAnswer, header }: { step: ChoiceStep; keys: string[]; result: boolean | null; onAnswer: (a: Answer | null) => void; header: React.ReactNode }) {
  const { L } = useI18n();
  const [sel, setSel] = useState<string>();
  const opts = useMemo(() => shuffled(step.options, step.id), [step]);
  return <div className="stack">{header}
    {opts.map((o, i) => {
      const st = result === null ? (sel === o.id ? "selected" : "idle") : o.id === step.answer ? "correct" : sel === o.id ? "wrong" : "idle";
      return <QuizOption key={o.id} keyLabel={keys[i]} state={st} disabled={result !== null}
        feedback={result !== null && o.id === step.answer && step.explain ? L(step.explain) : undefined}
        onClick={() => { setSel(o.id); onAnswer({ kind: "choice", id: o.id }); }}>{L(o.text)}</QuizOption>;
    })}</div>;
}

function Multi(p: StepViewProps & { keys: string[]; header: React.ReactNode }) {
  const { L } = useI18n();
  const s = p.step as Extract<Step, { type: "multi" }>;
  const [sel, setSel] = useState<string[]>([]);
  const opts = useMemo(() => shuffled(s.options, s.id), [s]);
  const toggle = (id: string) => { const n = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; setSel(n); p.onAnswer(n.length ? { kind: "multi", ids: n } : null); };
  return <div className="stack">{p.header}
    {opts.map((o) => {
      const right = s.answers.includes(o.id), picked = sel.includes(o.id);
      const st = p.result === null ? (picked ? "selected" : "idle") : right ? "correct" : picked ? "wrong" : "idle";
      return <QuizOption key={o.id} multi state={st} disabled={p.result !== null} onClick={() => toggle(o.id)}>{L(o.text)}</QuizOption>;
    })}</div>;
}

function TF({ result, onAnswer, header }: { step: TrueFalseStep; result: boolean | null; onAnswer: (a: Answer | null) => void; header: React.ReactNode }) {
  const { t } = useI18n();
  const [v, setV] = useState<boolean>();
  return <div className="stack">{header}
    <TrueFalse value={v} result={result === null ? undefined : result ? "correct" : "wrong"} trueLabel={t("q.true")} falseLabel={t("q.false")} label={t("q.truefalse")}
      onChange={(x) => { if (result !== null) return; setV(x); onAnswer({ kind: "truefalse", value: x }); }} /></div>;
}

function Img(p: StepViewProps & { header: React.ReactNode; res?: "correct" | "wrong" }) {
  const { L } = useI18n();
  const s = p.step as Extract<Step, { type: "image" }>;
  const [v, setV] = useState<string>();
  return <div className="stack">{p.header}
    <ImageChoice value={v} result={p.res} answer={s.answer} options={s.options.map((o) => ({ id: o.id, label: L(o.label), media: <Art name={o.art} /> }))}
      onChange={(id) => { if (p.result !== null) return; setV(id); p.onAnswer({ kind: "choice", id }); }} /></div>;
}

function Order(p: StepViewProps & { header: React.ReactNode }) {
  const { L, t, num } = useI18n();
  const s = p.step as Extract<Step, { type: "order" }>;
  const items = useMemo(() => shuffled(s.steps.map((x, i) => ({ id: String(i), label: L(x) })), `${s.id}-${p.attempt}`), [s, L, p.attempt]);
  const { onAnswer } = p;
  useEffect(() => { onAnswer({ kind: "order", order: items.map((x) => Number(x.id)) }); }, [items, onAnswer]);
  return <div className="stack">{p.header}
    <OrderSteps items={items} result={p.result !== null} answer={s.steps.map((_, i) => String(i))} numerals={s.steps.map((_, i) => num(i + 1))} upLabel={t("q.up")} downLabel={t("q.down")}
      onChange={(n) => onAnswer({ kind: "order", order: n.map((x) => Number(x.id)) })} /></div>;
}

function Fill(p: StepViewProps & { header: React.ReactNode }) {
  const { lang } = useI18n();
  const s = p.step as Extract<Step, { type: "fill" }>;
  const parts = s.sentence[lang] ?? s.sentence.en;
  const answers = pickList(s.answers, lang);
  const bank = useMemo(() => shuffled(pickList(s.bank, lang), s.id), [s, lang]);
  return <div className="stack">{p.header}
    <FillBlank parts={parts} bank={bank} result={p.result !== null} answer={Object.fromEntries(answers.map((w, i) => [i, w]))}
      onChange={(f) => p.onAnswer(Object.keys(f).length === answers.length ? { kind: "fill", words: f } : null)} /></div>;
}

function TypeIn(p: StepViewProps & { header: React.ReactNode }) {
  const { t, L } = useI18n();
  const s = p.step as Extract<Step, { type: "type" }>;
  const [v, setV] = useState("");
  return <div className="stack">{p.header}
    <TextField label={t("q.typeHere")} value={v} placeholder={L(s.placeholder)} disabled={p.result !== null} autoComplete="off"
      onChange={(e) => { setV(e.target.value); p.onAnswer(e.target.value.trim() ? { kind: "type", text: e.target.value } : null); }} /></div>;
}

function Reflect(p: StepViewProps) {
  const { t, L } = useI18n();
  const s = p.step as Extract<Step, { type: "reflect" }>;
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState(p.note ?? "");
  useEffect(() => { p.onUngradedReady(true); }, []); // reflection is optional
  return <Reflection prompt={L(s.prompt)} value={text} placeholder={L(s.placeholder)} countText={(n) => t("common.words", { n })}
    onChange={(v) => { setText(v); setSaved(false); }}
    action={<Button size="sm" variant="secondary" icon="check" disabled={!text.trim()} onClick={() => { p.onNote?.(text); setSaved(true); }}>{saved ? t("common.saved") : t("common.save")}</Button>} />;
}

/** Any Labs app as a lesson's "Try it" step (loaded on demand); trying it is optional, so Continue is ready at once. */
function LabStepView(p: StepViewProps) {
  const { t, L } = useI18n();
  const s = p.step as Extract<Step, { type: "lab" }>;
  useEffect(() => { p.onUngradedReady(true); }, []);
  return <div className="stack"><QuestionHeader type="reflect" icon="ai" typeLabel={t("q.lab")} prompt={L(s.prompt)} /><LabEmbed id={s.tool} embedded /></div>;
}

/**
 * Plays the video when it can; otherwise, or whenever the teacher opens the transcript to read instead of spending data,
 * the checkpoint question sits under the transcript. It must be answered to continue, so a missing, undownloaded or
 * offline video never blocks the lesson.
 */
function VideoStepView({ step, onReady }: { step: VideoStep; onReady: () => void }) {
  const { t, L, lang, num } = useI18n();
  const [failed, setFailed] = useState(false);
  const src = videoSrc(step, lang), captions = captionsFor(step, lang);
  const playable = !!src && !failed;
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [cpDone, setCpDone] = useState(false);
  const [cpResult, setCpResult] = useState<boolean | null>(null);
  const [cpAnswer, setCpAnswer] = useState<Answer | null>(null);
  const [showTranscript, setShowTranscript] = useState(!src);
  const reading = !playable || showTranscript;
  useEffect(() => { if (!step.checkpoint) onReady(); }, []);
  const cp = step.checkpoint?.question;
  const keys = KEY_LABELS[lang] ?? KEY_LABELS.en;
  const fmt = (sec: number) => `${num(Math.floor(sec / 60))}:${num(sec % 60, { minimumIntegerDigits: 2 })}`;
  const poster = (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={320} height={180} fill="var(--lagoon-ink)" /><rect x={40} y={30} width={240} height={110} rx={10} fill="var(--ink)" />
      <rect x={60} y={52} width={120} height={10} rx={5} fill="var(--sunbird)" /><rect x={60} y={74} width={170} height={8} rx={4} fill="var(--ink-inverse)" />
      <rect x={60} y={92} width={140} height={8} rx={4} fill="var(--ink-inverse)" /><circle cx={240} cy={110} r={18} fill="var(--kola)" />
    </svg>
  );
  const question = cp && (
    <div className="stack">
      <strong>{L(cp.prompt)}</strong>
      {cp.type === "truefalse"
        ? <TrueFalse value={cpAnswer?.kind === "truefalse" ? cpAnswer.value : undefined} result={cpResult === null ? undefined : cpResult ? "correct" : "wrong"} trueLabel={t("q.true")} falseLabel={t("q.false")}
            onChange={(v) => { if (cpResult === null) setCpAnswer({ kind: "truefalse", value: v }); }} />
        : cp.options.map((o, i) => <QuizOption key={o.id} keyLabel={keys[i]} disabled={cpResult !== null}
            state={cpResult === null ? (cpAnswer?.kind === "choice" && cpAnswer.id === o.id ? "selected" : "idle") : o.id === cp.answer ? "correct" : cpAnswer?.kind === "choice" && cpAnswer.id === o.id ? "wrong" : "idle"}
            onClick={() => setCpAnswer({ kind: "choice", id: o.id })}>{L(o.text)}</QuizOption>)}
      {cpResult === null
        ? <Button block disabled={!cpAnswer} onClick={() => { const ok = grade(cp, cpAnswer!, lang); setCpResult(ok); }}>{t("common.check")}</Button>
        : <><p className={cpResult ? "cp-ok" : "cp-no"}>{cpResult ? t("lesson.correct") : t("lesson.wrong")} — {L(cp.explain)}</p>
            <Button block iconEnd="next" onClick={() => { setCheckpointOpen(false); setCpDone(true); onReady(); }}>{t("common.continue")}</Button></>}
    </div>
  );
  return (
    <div className="stack">
      <QuestionHeader type="video" typeLabel={t("lesson.video")} prompt={L(step.title)} />
      <VideoPlayer
        poster={poster} src={playable ? src! : undefined} duration={step.duration} title={L(step.title)}
        meta={[fmt(step.duration), "240p", `${num(step.sizeMB, { maximumFractionDigits: 1 })} MB`].join(t("common.sep"))}
        chapters={step.chapters?.map((c) => ({ at: c.at, label: L(c.label) }))} questionsAt={step.checkpoint ? [step.checkpoint.at] : []}
        tracks={captions ? <track kind="captions" srcLang={captions.lang} src={captions.src} default /> : undefined}
        checkpoint={playable && !reading && checkpointOpen && !cpDone ? question : undefined} checkpointLabel={t("lesson.pause")}
        onTimeUpdate={(sec) => { if (step.checkpoint && cpResult === null && sec >= step.checkpoint.at) setCheckpointOpen(true); }}
        onError={() => { setFailed(true); setShowTranscript(true); }}
        actions={<Button size="sm" variant="ghost" icon="file" onClick={() => setShowTranscript((x) => !x)}>{t("lesson.transcript")}</Button>}
        playLabel={t("lesson.video")} captionsLabel="CC"
      />
      {!playable && <p className="muted small">{t("lesson.noVideo")}</p>}
      {showTranscript && <div className="transcript" dir="auto"><strong>{t("lesson.transcript")}</strong><p>{L(step.transcript)}</p></div>}
      {reading && cp && !cpDone && <div className="checkpoint-card"><span className="checkpoint-tag">{t("lesson.pause")}</span>{question}</div>}
    </div>
  );
}
