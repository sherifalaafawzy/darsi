import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FillBlank, HotspotImage, ImageChoice, MatchPairs, OrderSteps, QuestionHeader, QuizOption, Reflection, ScenarioCard, TextField, TrueFalse, VideoPlayer, Button,
} from "@darsi/design-system";
import { captionsFor, lightLang, pickList, timeIn, videoSrc, type Step, type VideoStep, type ChoiceStep, type TrueFalseStep } from "../content/types";
import { languageOf, useI18n, type MessageKey } from "../i18n";
import { Art } from "../components/Art";
import { LabEmbed } from "../labs/loader";
import { ProjectView } from "./ProjectView";
import { attemptOrder, grade, shuffled, type Answer } from "./engine";
import { canPlayLight, LightLesson, saveVideoShape, videoShape, type VideoShape } from "./LightLesson";
import { CodeBlock } from "../code/CodeBlock";
import { CodeStepEmbed } from "../code/loader";
import { ReadingParagraphs, transcriptParas } from "./readingText";

/** The Lesson Studio player, only for lessons that have a light version (it carries its own small chunk). */

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
  /**
   * Says something in the lesson's live region (LessonScreen): a scenario's outcome, a warning sign found, a project
   * sent. The step itself is not a live region, so a playing video's clock and a new step aren't read out on their own.
   */
  announce?: (text: string) => void;
  /** After the step's own last action (a video's checkpoint), move the focus to the lesson's Continue. */
  focusContinue?: () => void;
  /** A students' course, or a student: no teacher wording ("in class"). */
  student?: boolean;
  /**
   * Moves on without this step's answer (only that step goes unrecorded): offered when a step's own chunk can't load,
   * such as a code exercise offline that isn't on the phone (code/loader.tsx), so it never traps the learner.
   */
  onSkip?: () => void;
}

export function StepView(p: StepViewProps) {
  const { t, L, lang, dir, num } = useI18n();
  const s = p.step;
  const keys = KEY_LABELS[lang] ?? KEY_LABELS.en;
  const res = p.result === null ? undefined : p.result ? "correct" : "wrong";
  // Shuffles are seeded per question, with the lesson as well as the step: step ids repeat in every lesson ("p1", "q6"),
  // and an id-only seed put the right answer of every lesson's "p1" in the same place.
  const qid = `${p.lessonId}/${s.id}`;
  const seed = `${s.id}-${p.attempt}`, mix = `${qid}-${p.attempt}`;
  // A question may show code above its answers ("What does this print?").
  const header = (typeKey: MessageKey, extra?: { hint?: string }) => <QuestionHeader type={s.type === "lab" ? "reflect" : s.type === "image" ? "image" : (s.type as "choice")} typeLabel={t(typeKey)} prompt={L(s.prompt)} hint={extra?.hint}
    media={s.snippet ? <CodeBlock text={s.snippet.text} lang={s.snippet.lang} label={t("code.snippet")} /> : undefined} />;

  switch (s.type) {
    case "choice": return <Choice key={seed} step={s} qid={qid} keys={keys} result={p.result} onAnswer={p.onAnswer} header={header("q.choice")} attempt={p.attempt} />;
    case "multi": return <Multi key={seed} {...p} keys={keys} header={header("q.multi")} />;
    case "truefalse": return <TF key={seed} step={s} result={p.result} onAnswer={p.onAnswer} header={header("q.truefalse")} />;
    case "image": return <Img key={seed} {...p} header={header("q.image")} res={res} />;
    case "match": {
      const left = s.pairs.map((x, i) => ({ id: `l${i}`, label: L(x.left) }));
      const right = shuffled(s.pairs.map((x, i) => ({ id: `r${i}`, label: L(x.right) })), mix);
      const answer = Object.fromEntries(s.pairs.map((_, i) => [`l${i}`, `r${i}`]));
      return <div className="stack">{header("q.match")}
        <MatchPairs key={seed} left={left} right={right} result={p.result !== null} answer={answer} numerals={s.pairs.map((_, i) => num(i + 1))}
          onChange={(pairs) => p.onAnswer(Object.keys(pairs).length === s.pairs.length ? { kind: "match", pairs: Object.fromEntries(Object.entries(pairs).map(([l, r]) => [l.slice(1), r.slice(1)])) } : null)} /></div>;
    }
    case "order": return <Order key={seed} {...p} header={header("q.order")} />;
    case "fill": return <Fill key={seed} {...p} header={header("q.fill")} />;
    case "type": return <TypeIn key={seed} {...p} header={header("q.type")} />;
    case "hotspot": {
      const spots = s.spots.map((x) => ({ ...x, label: L(x.label) }));
      // A spot with `line` covers that line of the message (or the link) however it wraps; the rest sit at their x/y/w/h.
      const on = (line: number | "link", spot: (id: string) => React.ReactNode) => s.spots.filter((x) => x.line === line).map((x) => spot(x.id));
      return <div className="stack">{header("q.hotspot")}
        <HotspotImage key={seed} spots={spots} spotLabel={(n, total) => t("q.spot", { n, total })} numerals={spots.map((_, i) => num(i + 1))} counter={(a, b) => t("q.found", { n: a, total: b })}
          onChange={(found) => {
            p.onAnswer({ kind: "hotspot", found });
            const last = spots.find((x) => x.id === found[found.length - 1]);
            p.announce?.(`${last?.label ?? ""} ${t("q.found", { n: found.length, total: spots.length })}`.trim());
          }}>
          {(spot) => <div className="mock-answer" dir={dir} lang={lang}>
            <p className="mock-from">{s.mock.from}</p>
            {L(s.mock.body).split("\n").map((line, i) => (line.trim() ? <p key={i} className="mock-line">{line}{on(i, spot)}</p> : null))}
            {/* An address alone reads left to right; "Appeal here: …" in Arabic reads right to left, its number on the right. */}
            <p className="mock-link mock-line" dir="auto">{L(s.mock.link)}{on("link", spot)}</p>
          </div>}
        </HotspotImage></div>;
    }
    case "scenario": {
      const choices = s.choices.map((c) => ({ id: c.id, label: L(c.label), tone: c.tone, toneLabel: c.tone === "good" ? t("q.strong") : t("q.think"), consequence: L(c.consequence) }));
      return <div className="stack">{header("q.scenario")}
        <ScenarioCard key={seed} who={L(s.who)} initial={L(s.initial)} situation={L(s.situation)} ask={L(s.prompt)} choices={choices} live={!p.announce}
          onChange={(id) => { p.onUngradedReady(true); const c = choices.find((x) => x.id === id); if (c) p.announce?.(`${c.toneLabel}. ${c.consequence}`); }} /></div>;
    }
    case "reflect":
      return <Reflect key={seed} {...p} />;
    case "lab":
      return <LabStepView key={seed} {...p} />;
    case "video":
      return <VideoStepView key={seed} step={s} onReady={() => p.onUngradedReady(true)} focusContinue={p.focusContinue} />;
    case "read":
      return <ReadView key={seed} step={s} onReady={p.onUngradedReady} />;
    case "project":
      return <ProjectView key={seed} step={s} lessonId={p.lessonId} unitId={p.unitId} onReady={p.onUngradedReady} preview={p.preview} announce={p.announce} student={p.student} />;
    case "code": case "parsons": case "codefill": case "bug": case "blocks":
      return <CodeStepEmbed key={seed} {...p} />;
  }
}

/**
 * A reading: paragraphs at blank lines, line breaks inside a paragraph kept, links tappable, and a lone paragraph
 * ![caption](/media/...) shown as an illustrative screenshot (lesson/readingText.tsx).
 */
function ReadView({ step, onReady }: { step: Extract<Step, { type: "read" }>; onReady: (r: boolean) => void }) {
  const { t, L } = useI18n();
  useEffect(() => { onReady(true); }, [onReady]);
  return (
    <article className="reading" dir="auto">
      <QuestionHeader type="reflect" icon="file" typeLabel={t("lesson.read")} prompt={L(step.title)} />
      <ReadingParagraphs text={L(step.body)} />
      {step.keyTerms?.length ? <aside className="key-terms"><h3>{t("lesson.keyTerms")}</h3><dl>{step.keyTerms.map((k, i) => <div key={i}><dt>{L(k.term)}</dt><dd>{L(k.def)}</dd></div>)}</dl></aside> : null}
    </article>
  );
}

/**
 * The options in the lesson's own order the first time; in another order on the retry, after the answer was shown.
 * After Check, the explanation is in the lesson's answer sheet (LessonScreen FeedbackSheet), not under the right option too.
 */
function Choice({ step, qid, keys, result, onAnswer, header, attempt }: { step: ChoiceStep; qid: string; keys: string[]; result: boolean | null; onAnswer: (a: Answer | null) => void; header: React.ReactNode; attempt: number }) {
  const { L } = useI18n();
  const [sel, setSel] = useState<string>();
  const opts = useMemo(() => attemptOrder(step.options, qid, attempt), [step, qid, attempt]);
  return <div className="stack">{header}
    {opts.map((o, i) => {
      const st = result === null ? (sel === o.id ? "selected" : "idle") : o.id === step.answer ? "correct" : sel === o.id ? "wrong" : "idle";
      return <QuizOption key={o.id} keyLabel={keys[i]} state={st} disabled={result !== null}
        onClick={() => { setSel(o.id); onAnswer({ kind: "choice", id: o.id }); }}>{L(o.text)}</QuizOption>;
    })}</div>;
}

function Multi(p: StepViewProps & { keys: string[]; header: React.ReactNode }) {
  const { L } = useI18n();
  const s = p.step as Extract<Step, { type: "multi" }>;
  const [sel, setSel] = useState<string[]>([]);
  const opts = useMemo(() => attemptOrder(s.options, `${p.lessonId}/${s.id}`, p.attempt), [s, p.lessonId, p.attempt]);
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
  const items = useMemo(() => shuffled(s.steps.map((x, i) => ({ id: String(i), label: L(x) })), `${p.lessonId}/${s.id}-${p.attempt}`), [s, L, p.lessonId, p.attempt]);
  const { onAnswer } = p;
  useEffect(() => { onAnswer({ kind: "order", order: items.map((x) => Number(x.id)) }); }, [items, onAnswer]);
  return <div className="stack">{p.header}
    <OrderSteps items={items} result={p.result !== null} answer={s.steps.map((_, i) => String(i))} numerals={s.steps.map((_, i) => num(i + 1))} upLabel={t("q.up")} downLabel={t("q.down")}
      onChange={(n) => onAnswer({ kind: "order", order: n.map((x) => Number(x.id)) })} /></div>;
}

function Fill(p: StepViewProps & { header: React.ReactNode }) {
  const { lang, t } = useI18n();
  const s = p.step as Extract<Step, { type: "fill" }>;
  const parts = s.sentence[lang] ?? s.sentence.en;
  const answers = pickList(s.answers, lang);
  const bank = useMemo(() => shuffled(pickList(s.bank, lang), `${p.lessonId}/${s.id}`), [s, lang, p.lessonId]);
  return <div className="stack">{p.header}
    <FillBlank parts={parts} bank={bank} result={p.result !== null} answer={Object.fromEntries(answers.map((w, i) => [i, w]))} bankLabel={t("q.bank")} blankLabel={t("q.blank")}
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

/** The longest note the cloud keeps (firestore.rules users/{uid}/notes): a longer one would never sync. */
export const MAX_NOTE = 50_000;

/**
 * An optional reflection. What was typed goes to the learner's notes when they move on (Continue, or leaving the
 * lesson) as well as with "Save to my notes", so it is never thrown away unseen. One save when the step closes, not one
 * per keystroke (each save re-renders the lesson and is a write to sync).
 */
function Reflect(p: StepViewProps) {
  const { t, L } = useI18n();
  const s = p.step as Extract<Step, { type: "reflect" }>;
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState(p.note ?? "");
  const unsaved = useRef<string | null>(null);
  const onNote = useRef(p.onNote);
  onNote.current = p.onNote;
  useEffect(() => { p.onUngradedReady(true); }, []); // reflection is optional
  useEffect(() => () => { const v = unsaved.current; if (v?.trim()) onNote.current?.(v); }, []);
  const save = () => { p.onNote?.(text); unsaved.current = null; setSaved(true); };
  return <Reflection prompt={L(s.prompt)} value={text} placeholder={L(s.placeholder)} countText={(n) => t("common.words", { n })} maxLength={MAX_NOTE}
    onChange={(v) => { setText(v); setSaved(false); unsaved.current = v; }}
    action={<Button size="sm" variant="secondary" icon="check" disabled={!text.trim()} onClick={save}>{saved ? t("common.saved") : t("common.save")}</Button>} />;
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
function VideoStepView({ step, onReady, focusContinue }: { step: VideoStep; onReady: () => void; focusContinue?: () => void }) {
  const { t, L, lang, num } = useI18n();
  const [failed, setFailed] = useState(false);
  const src = videoSrc(step, lang), captions = captionsFor(step, lang);
  // Times inside the video that plays: this language's own, or the English one when it falls back to English.
  const videoLang = step.sources?.[lang] ? lang : "en";
  // Each language is narrated on its own, and its captions are timed to its own video: offer only the captions of the
  // video that plays (and those of languages without a video, written against the English one).
  const capMap = step.captions ?? {};
  const capCodes = Object.keys(capMap).filter((code) => capMap[code] && (step.sources?.[code] ? code === videoLang : videoLang === "en"));
  const capOrder = captions && capCodes.includes(captions.lang) ? [captions.lang, ...capCodes.filter((code) => code !== captions.lang)] : capCodes;
  // The light lesson (Lesson Studio) plays first when it has this language; the MP4 is a choice, and the fallback.
  const pl = canPlayLight() ? lightLang(step, lang) : null;
  const [mode, setMode] = useState<"light" | "video">(pl ? "light" : "video");
  // A light lesson that couldn't load (offline and not downloaded) isn't offered again.
  const [lightFailed, setLightFailed] = useState(false);
  // Landscape by default; the learner can turn the drawn video to portrait (kept on this phone).
  const [shape, setShape] = useState<VideoShape>(videoShape);
  const turn = () => { const next: VideoShape = shape === "landscape" ? "portrait" : "landscape"; saveVideoShape(next); setShape(next); };
  const light = mode === "light" && !!pl && !!step.light;
  // MP4s are never part of a download: offline, the light lesson doesn't offer one (read when it draws; no listener).
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const readied = useRef(false);
  const ready = () => { if (!readied.current) { readied.current = true; onReady(); } };
  const playable = !!src && !failed;
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [cpDone, setCpDone] = useState(false);
  const [cpResult, setCpResult] = useState<boolean | null>(null);
  const [cpAnswer, setCpAnswer] = useState<Answer | null>(null);
  const [showTranscript, setShowTranscript] = useState(!src);
  const reading = !playable || showTranscript;
  useEffect(() => { if (!step.checkpoint) ready(); }, []);
  // Check is replaced by the result and Continue: the focus goes to the result (read out with its explanation), not the page.
  const cpSaid = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (cpResult !== null) cpSaid.current?.focus(); }, [cpResult]);
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
  // Answering the check (right or wrong) is what the lesson waits for: its own Continue is then the one way on. Inside the
  // playing video, the card's button only closes the card so the video plays on ("Keep watching"); under the transcript
  // the card keeps its result and explanation, with no button of its own.
  const question = (inVideo: boolean) => cp && (
    <div className="stack">
      <strong>{L(cp.prompt)}</strong>
      {/* "What does this program print?" needs the program, as in a question step. */}
      {cp.snippet && <CodeBlock text={cp.snippet.text} lang={cp.snippet.lang} label={t("code.snippet")} />}
      {cp.type === "truefalse"
        ? <TrueFalse value={cpAnswer?.kind === "truefalse" ? cpAnswer.value : undefined} result={cpResult === null ? undefined : cpResult ? "correct" : "wrong"} trueLabel={t("q.true")} falseLabel={t("q.false")} label={t("q.truefalse")}
            onChange={(v) => { if (cpResult === null) setCpAnswer({ kind: "truefalse", value: v }); }} />
        : cp.options.map((o, i) => <QuizOption key={o.id} keyLabel={keys[i]} disabled={cpResult !== null}
            state={cpResult === null ? (cpAnswer?.kind === "choice" && cpAnswer.id === o.id ? "selected" : "idle") : o.id === cp.answer ? "correct" : cpAnswer?.kind === "choice" && cpAnswer.id === o.id ? "wrong" : "idle"}
            onClick={() => setCpAnswer({ kind: "choice", id: o.id })}>{L(o.text)}</QuizOption>)}
      {cpResult === null
        ? <Button block disabled={!cpAnswer} onClick={() => { const ok = grade(cp, cpAnswer!, lang); setCpResult(ok); ready(); }}>{t("common.check")}</Button>
        : <>{/* The result, then the explanation as its own sentence ("Not quite" / «ليس تمامًا», then why), as in the answer sheet. */}
            <p ref={cpSaid} tabIndex={-1} className={cpResult ? "cp-ok" : "cp-no"}><strong>{cpResult ? t("lesson.correct") : t("lesson.wrong")}</strong><br />{L(cp.explain)}</p>
            {inVideo && <Button block variant="secondary" icon="play" onClick={() => { setCheckpointOpen(false); setCpDone(true); focusContinue?.(); }}>{t("video.keepWatching")}</Button>}</>}
    </div>
  );
  const kb = pl ? step.light?.sizeKB?.[lang] ?? step.light?.sizeKB?.en : undefined;
  const mb = num(step.sizeMB, { maximumFractionDigits: 1 });
  // The Transcript buttons show and hide it: they say whether it is open, and which part of the page they open.
  const trId = useId();
  const trToggle = { "aria-expanded": showTranscript, "aria-controls": showTranscript ? trId : undefined };
  const transcript = <div className="transcript" id={trId} dir="auto"><strong>{t("lesson.transcript")}</strong>{transcriptParas(L(step.transcript)).map((x, i) => <p key={i}>{x}</p>)}</div>;
  if (light) {
    return (
      <div className="stack">
        <QuestionHeader type="video" typeLabel={t("lesson.video")} prompt={L(step.title)} />
        {/* The quick checks are asked inside the player: answering one, or reaching the end, lets the lesson go on.
            Its own words: the lesson's Continue moves on, so the check's button keeps watching, and the end is the video's.
            The transcript hides it, paused, so closing the transcript goes on from the same moment. */}
        <LightLesson light={step.light!} lang={pl!} poster={poster} shape={shape} hidden={showTranscript} labels={{ next: t("video.keepWatching"), done: t("video.done"), score: t("video.score") }}
          onEvent={(e) => { if (e.type === "check" || e.type === "ended") ready(); }} onError={() => { setLightFailed(true); setMode("video"); }} />
        <div className="video-modes">
          <Button size="sm" variant="ghost" icon="file" {...trToggle} onClick={() => setShowTranscript((x) => !x)}>{t("lesson.transcript")}</Button>
          {!showTranscript && <Button size="sm" variant="ghost" icon="video" aria-pressed={shape === "portrait"} onClick={turn}>{t(shape === "landscape" ? "video.toPortrait" : "video.toLandscape")}</Button>}
          {playable && online && <Button size="sm" variant="ghost" icon="play" onClick={() => setMode("video")}>{t("lesson.asVideo", { mb })}</Button>}
        </div>
        {/* The check comes before the transcript: the transcript goes on past the moment the video asks it, and often
            says the answer straight after, so read under it the question would come after its answer. */}
        {showTranscript && cp && !cpDone && <div className="checkpoint-card"><span className="checkpoint-tag">{t("lesson.pause")}</span>{question(false)}</div>}
        {showTranscript && transcript}
      </div>
    );
  }
  return (
    <div className="stack">
      <QuestionHeader type="video" typeLabel={t("lesson.video")} prompt={L(step.title)} />
      {/* No video to play (not made yet, or it couldn't load): no player with a play button that does nothing. */}
      {playable && <VideoPlayer
        poster={poster} src={src!} duration={step.duration} title={L(step.title)}
        // step.duration is the English video's: another language's own video is shorter or longer, and the player
        // shows its real length once it has it.
        meta={[videoLang === "en" || !step.sources ? fmt(step.duration) : "", "240p", t("video.size", { mb })].filter(Boolean).join(t("common.sep"))}
        chapters={step.chapters?.map((c) => ({ at: timeIn(c, videoLang), label: L(c.label) }))} questionsAt={step.checkpoint ? [timeIn(step.checkpoint, videoLang)] : []}
        tracks={capOrder.length ? capOrder.map((code) => <track key={code} kind="captions" srcLang={code} label={languageOf(code).native} src={capMap[code]!} default={code === captions?.lang} />) : undefined}
        crossOrigin={[src, ...capOrder.map((code) => capMap[code])].some((u) => u && new URL(u, location.href).origin !== location.origin) ? "anonymous" : undefined}
        checkpoint={playable && !reading && checkpointOpen && !cpDone ? question(true) : undefined} checkpointLabel={t("lesson.pause")}
        onTimeUpdate={(sec) => { if (step.checkpoint && cpResult === null && sec >= timeIn(step.checkpoint, videoLang)) setCheckpointOpen(true); }}
        onError={() => { setFailed(true); setShowTranscript(true); }}
        actions={<Button size="sm" variant="ghost" icon="file" {...trToggle} onClick={() => setShowTranscript((x) => !x)}>{t("lesson.transcript")}</Button>}
        playLabel={t("video.play")} pauseLabel={t("video.pause")} captionsLabel={t("video.captions")} captionsOffLabel={t("video.captionsOff")}
        seekLabel={t("video.seek")} speedLabel={t("video.speed")} speedNormalLabel={t("video.speedNormal")}
        fullscreenLabel={t("video.fullscreen")} exitFullscreenLabel={t("video.exitFullscreen")}
        muteLabel={t("video.mute")} unmuteLabel={t("video.unmute")} volumeLabel={t("video.volume")}
        settingsLabel={t("video.settings")} loadingLabel={t("video.loading")}
      />}
      {/* Not made yet, or it exists but couldn't play here (offline, or not on this phone: MP4s aren't downloaded). */}
      {!playable && <p className="muted small">{t(src ? "lesson.videoFailed" : "lesson.noVideo")}</p>}
      {pl && !lightFailed && <div className="video-modes">
        <Button size="sm" variant="ghost" icon="play" onClick={() => setMode("light")}>{t("lesson.asLight", { mb: num((kb ?? 400) / 1024, { maximumFractionDigits: 1 }) })}</Button>
      </div>}
      {/* Before the transcript, which goes on past the check and often answers it (as in the light lesson above). */}
      {reading && cp && !cpDone && <div className="checkpoint-card"><span className="checkpoint-tag">{t("lesson.pause")}</span>{question(false)}</div>}
      {showTranscript && transcript}
    </div>
  );
}
