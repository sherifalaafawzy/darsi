import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, ChoiceCard, LanguagePicker, Mark, OnboardingStep as Step, PlacementResult, QuestionHeader, QuizOption, TrueFalse, LessonTopBar, type IconName } from "@darsi/design-system";
import { useI18n, useLanguages } from "../i18n";
import { useStore, type AppState } from "../state/store";
import { loadPlacement, useAsync } from "../content/load";
import { teachStage, type Audience, type Placement, type Stage, type Track } from "../content/types";
import { useTracks } from "../content/settings";
import { useMine, usePlacement, useStagesOffered } from "../content/mine";
import { track } from "../analytics/track";
import { grade, shuffled, type Answer } from "../lesson/engine";
import { CodeBlock } from "../code/CodeBlock";
import { focusHeading } from "../components/Layout";

type Phase = "language" | "where" | "teach" | "stage" | "tracks" | "time" | "offer" | "quiz" | "result";
const STAGE_ICON: Record<Stage, IconName> = { primary: "book", lower: "learn", upper: "target", university: "award" };
/** A setup step, its progress bar named in the page's language (screen readers). */
function OnboardingStep(props: ComponentProps<typeof Step>) {
  const { t } = useI18n();
  return <Step progressLabel={t("onb.progress")} {...props} />;
}
/**
 * Onboarding shows in place of the learning page that was asked for (App.tsx Onboarded): /learn, a lesson link, a
 * project to review. Finishing it never navigates, so that page then opens at the same address. `exit`: a teacher's or
 * an org admin's own page, which every step links to, since there is no navigation until it is done.
 */
export function Onboarding({ exit }: { exit?: { to: string; label: string } } = {}) {
  const { t } = useI18n();
  const languages = useLanguages();
  const { state, dispatch } = useStore();
  const [phase, setPhase] = useState<Phase>("language");
  const tracks = useTracks();
  const nav = useNavigate();
  const place = usePlacement();
  const out = exit && <div className="row-gap"><Button size="sm" variant="ghost" icon="back" onClick={() => nav(exit.to)}>{exit.label}</Button></div>;
  // School accounts are already a teacher or a student, so they skip "Who are you?".
  // Every teacher then says where they teach, and every student where they study. Neither step can be skipped.
  const mine = useMine();
  const { fixed } = mine;
  const isStudent = fixed ? mine.audience === "students" : state.audience === "students";
  const steps: Phase[] = [...(fixed ? [] : ["where" as const]), ...(isStudent ? ["stage" as const] : ["teach" as const]), "tracks", "time", "offer"];
  const stepOf = (p: Phase) => steps.indexOf(p) + 1;
  // Only stages that have courses (a stage whose courses are all unpublished disappears).
  const teachStages = useStagesOffered("teachers"), studyStages = useStagesOffered("students");
  const teachNow = teachStages.find((st) => st === teachStage(state.teach));
  const studyNow = studyStages.find((st) => st === state.stage);
  const [levels, setLevels] = useState<Partial<Record<Track, number>>>({});
  const [checked, setChecked] = useState(0);
  const set = (patch: Partial<AppState>) => dispatch({ type: "set", patch });
  const finish = (lv: Partial<Record<Track, number>>) => {
    set({ onboarded: true, levels: lv });
    track("onboarding_done", { a: state.audience ?? "teachers", n: state.tracks.length });
  };
  // Each Continue swaps the whole step: focus goes to the new step's title. So does the first step when a button
  // brought the person here ("Continue without an account"), but not when the page has just loaded (React Router's
  // first location is "default"). The check moves focus to each question itself (PlacementQuiz).
  const firstLoad = useLocation().key === "default";
  const shown = useRef<Phase | null>(firstLoad ? phase : null);
  useEffect(() => {
    if (shown.current === phase) return;
    shown.current = phase;
    if (phase !== "quiz") focusHeading(document.querySelector<HTMLElement>(".dr-onb-title"));
  }, [phase]);
  const cont = (to: Phase, disabled = false) => <Button block iconEnd="next" disabled={disabled} onClick={() => setPhase(to)}>{t("common.continue")}</Button>;

  if (phase === "language") return (
    <main className="screen narrow onb">
      {out}
      <div className="onb-hero"><Mark size={72} /></div>
      <h1 className="dr-onb-title">{t("onb.language")}</h1>
      <LanguagePicker label={t("onb.language")} value={state.lang} onChange={(lang) => set({ lang })} languages={languages} />
      {cont(steps[0])}
    </main>
  );
  if (phase === "where") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("where")} total={steps.length} title={t("onb.where")} body={t("onb.whereBody")} primary={cont(state.audience === "students" ? "stage" : "teach", !state.audience)}>
        <div role="radiogroup" aria-label={t("onb.where")}>
          <ChoiceCard icon="profile" title={t("me.teacher")} description={t("onb.teacherD")} selected={state.audience === "teachers"} onClick={() => set({ audience: "teachers" })} />
          <ChoiceCard icon="book" title={t("me.student")} description={t("onb.studentD")} selected={state.audience === "students"} onClick={() => set({ audience: "students", teach: undefined })} />
        </div>
      </OnboardingStep>
    </main>
  );
  if (phase === "teach") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("teach")} total={steps.length} title={t("onb.teach")} body={t("onb.teachBody")} primary={cont("tracks", !teachNow)}>
        <div role="radiogroup" aria-label={t("onb.teach")}>
          {teachStages.map((st) => <ChoiceCard key={st} icon={STAGE_ICON[st]} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={teachNow === st} onClick={() => set({ teach: st, audience: "teachers" })} />)}
        </div>
      </OnboardingStep>
    </main>
  );
  if (phase === "stage") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("stage")} total={steps.length} title={t("onb.stage")} body={t("onb.stageBody")} primary={cont("tracks", !studyNow)}>
        <div role="radiogroup" aria-label={t("onb.stage")}>
          {studyStages.map((st) => <ChoiceCard key={st} icon={STAGE_ICON[st]} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={studyNow === st} onClick={() => set({ stage: st })} />)}
        </div>
      </OnboardingStep>
    </main>
  );
  if (phase === "tracks") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("tracks")} total={steps.length} title={t("onb.tracks")} body={t("onb.tracksBody")} primary={cont("time", !state.tracks.length)}>
        {tracks.visible.map(({ id: tr, icon }) => <ChoiceCard key={tr} icon={icon as IconName} multi title={tracks.name(tr)} selected={state.tracks.includes(tr)}
          onClick={() => set({ tracks: state.tracks.includes(tr) ? state.tracks.filter((x) => x !== tr) : [...state.tracks, tr] })} />)}
      </OnboardingStep>
    </main>
  );
  if (phase === "time") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("time")} total={steps.length} title={t("onb.time")} body={t("onb.timeBody")} primary={cont("offer")}>
        {([[2, "onb.t15", "onb.t15d"], [4, "onb.t30", "onb.t30d"], [8, "onb.t60", "onb.t60d"]] as const).map(([n, a, b]) =>
          <ChoiceCard key={n} title={t(a)} description={t(b)} selected={state.weeklyLessons === n} onClick={() => set({ weeklyLessons: n })} />)}
      </OnboardingStep>
    </main>
  );
  if (phase === "offer") return (
    <main className="screen narrow">
      {out}
      <OnboardingStep step={stepOf("offer")} total={steps.length} title={t("onb.placement")} body={t(isStudent ? "onb.placementBodyStudent" : "onb.placementBody")} art={<Mark size={72} />}
        primary={<Button block iconEnd="next" onClick={() => setPhase("quiz")}>{t("onb.startCheck")}</Button>}
        secondary={<Button block variant="ghost" onClick={() => finish({})}>{t("onb.skipCheck")}</Button>} />
    </main>
  );
  // Closing the check goes back a step, where it can be skipped.
  if (phase === "quiz") return <PlacementQuiz onClose={() => setPhase("offer")} onDone={(lv, n) => { setLevels(lv); setChecked(n); setPhase("result"); }} />;
  // The level each track starts at, as the check placed it, else where the learner starts among the levels with courses
  // for them: what Home then shows as "Your level". It is what Start learning saves.
  const placed = tracks.visible.filter(({ id }) => !state.tracks.length || state.tracks.includes(id))
    .map(({ id: tr, levels: of }) => ({ tr, of, level: levels[tr] ?? place.start(tr) }));
  return (
    <main className="screen narrow">
      <PlacementResult title={t("place.title")} summary={t(checked ? "place.summary" : "place.summaryNone")}
        levels={placed.map(({ tr, of, level }) => ({ track: tr, trackLabel: tracks.name(tr), level, of, label: mine.levelName(tr, level) }))}
        actions={<Button block iconEnd="next" onClick={() => finish(Object.fromEntries(placed.map(({ tr, level }) => [tr, level])))}>{t("place.go")}</Button>} />
    </main>
  );
}

type PQ = Placement["questions"][number];
/**
 * Where the check stands in one track: the level being asked, how many of its two questions were answered, and which
 * way it has moved from the starting level (up after a pass, down after a miss).
 */
export interface PlaceState { level: number; asked: number; dir?: "up" | "down" }
/**
 * After one answer. Each level asks two questions and is passed only with both right, so a wrong answer (or "I don't
 * know yet") is a miss. The check starts at the learner's level (their school stage: where they teach, or where they
 * study), and moves among `levels`: the levels it may place them at, lowest first (placeLevels: those with courses for
 * them), or a top level for every level from 1 up to it:
 * - a pass moves up, until a level is missed (the learner starts there) or the top is passed (they start at the top);
 * - a miss at the start moves down, until a level is passed (they start one above it) or the lowest is missed.
 */
export function placementNext(s: PlaceState, ok: boolean, levels: number | number[]): { level: number } | { state: PlaceState } {
  const ls = typeof levels === "number" ? Array.from({ length: levels }, (_, i) => i + 1) : levels;
  const i = Math.max(0, ls.indexOf(s.level));
  if (ok && s.asked === 0) return { state: { ...s, asked: 1 } };
  if (ok) {
    if (s.dir === "down") return { level: ls[i + 1] ?? s.level };
    return i >= ls.length - 1 ? { level: s.level } : { state: { level: ls[i + 1], asked: 0, dir: "up" } };
  }
  if (s.dir === "up" || i <= 0) return { level: s.level };
  return { state: { level: ls[i - 1], asked: 0, dir: "down" } };
}
/**
 * How full the check's bar is at question `n` (1 for the first) of track `ti` of `tracks`: it follows the questions
 * asked, never the level being asked, so it only moves forward (a miss steps the level down, not the bar). From
 * `start`, the check walks one way only, up to the top or down to Beginner, two questions a level at most, so `n` never
 * fills the track's share of the bar before the track is done.
 */
export function placementProgress(ti: number, tracks: number, n: number, start: number, top: number): number {
  const most = 2 * Math.max(start, top - start + 1);
  return ((ti + Math.min(1, (n - 1) / most)) / Math.max(1, tracks)) * 100;
}
const randomly = <T,>(items: T[]) => items.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
/**
 * One track's questions for one audience: two per level (picked at random, so checking again asks others). University
 * teachers get the university questions at the top level; nobody else sees them.
 */
export const placementBank = (questions: PQ[], track: Track, audience: Audience, top: number, pick: (q: PQ[]) => PQ[] = randomly, uni = false): PQ[][] =>
  Array.from({ length: top }, (_, i) => {
    const at = questions.filter((q) => q.track === track && q.audience === audience && q.level === i + 1);
    const forUni = uni && i + 1 === top ? at.filter((q) => q.teach === "university") : [];
    return pick(forUni.length ? forUni : at.filter((q) => !q.teach)).slice(0, 2);
  });

/**
 * The placement check for the learner's tracks (or only `tracks`), for their audience. It places them only at levels
 * with courses for them (usePlacement), so its answer is the level Home shows; a track where that leaves one level
 * asks nothing, and nor does a track without questions: both start where the learner starts among those levels.
 * `onDone` gets the levels and how many tracks were asked about; closing it gives no levels.
 */
export function PlacementQuiz({ tracks: only, onDone, onClose }: { tracks?: Track[]; onDone: (levels: Partial<Record<Track, number>>, checked: number) => void; onClose?: () => void }) {
  const { t, L, lang } = useI18n();
  const tracks = useTracks();
  const mine = useMine();
  const place = usePlacement();
  const { data } = useAsync(loadPlacement, []);
  const list = only ?? mine.tracks.map((x) => x.id);
  // The questions, and the levels each track may place at (fixed once the catalog has answered, so they never move mid-check).
  const ready = useMemo(() => (data && place.ready ? {
    banks: Object.fromEntries(list.map((tr) => [tr, placementBank(data.questions, tr, mine.audience, tracks.of(tr).levels, undefined, mine.uni)])),
    levels: Object.fromEntries(list.map((tr) => [tr, place.levels(tr)])),
    start: Object.fromEntries(list.map((tr) => [tr, place.start(tr)])),
  } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, place.ready]);
  const banks = ready?.banks;
  const startOf = (tr: Track) => ready?.start[tr] ?? mine.startLevel(tr);
  // Only tracks where the answers can move the learner (more than one level), with questions where the check starts.
  const asked = list.filter((tr) => (ready?.levels[tr].length ?? 0) > 1 && banks?.[tr]?.[startOf(tr) - 1]?.length);
  const [ti, setTi] = useState(0);
  const begin = (tr: Track | undefined): PlaceState => ({ level: tr ? startOf(tr) : 1, asked: 0 });
  const [st, setSt] = useState<PlaceState | null>(null);
  const [n, setN] = useState(1);
  const [levels, setLevels] = useState<Partial<Record<Track, number>>>({});
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Each question (the first one too: the check opens from a button) takes focus, since Continue goes disabled with it.
  const askAt = useCallback((el: HTMLElement | null) => focusHeading(el?.querySelector<HTMLElement>(".dr-qhead-prompt")), []);
  const all = (got: Partial<Record<Track, number>>) => ({ ...Object.fromEntries(list.map((tr) => [tr, startOf(tr)])), ...got });
  useEffect(() => { if (banks && !asked.length) onDone(all({}), 0); }, [banks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!banks || !asked.length) return <div className="loading" aria-busy="true" />;
  const tr = asked[ti];
  const ls = ready!.levels[tr];
  const at = st ?? begin(tr);
  const q = banks[tr][at.level - 1]?.[at.asked];
  const finish = (level: number) => {
    const got = { ...levels, [tr]: level };
    setLevels(got); setAnswer(null); setN(1); setSt(begin(asked[ti + 1]));
    if (ti + 1 < asked.length) setTi(ti + 1); else onDone(all(got), asked.length);
  };
  const next = (ok: boolean) => {
    const r = placementNext(at, ok, ls);
    if ("level" in r) return finish(r.level);
    // A level without two questions (a track with more levels than the check covers): going up, the learner starts
    // there; going down, at the level they just missed.
    if (!banks[tr][r.state.level - 1]?.[r.state.asked]) return finish(r.state.dir === "down" ? at.level : r.state.level);
    setSt(r.state); setAnswer(null); setN(n + 1);
  };
  if (!q) return <div className="loading" aria-busy="true" />;
  const keys = lang === "ar" ? ["أ", "ب", "ج", "د"] : ["A", "B", "C", "D"];
  // The bar counts the levels the check can walk through, wherever they are.
  const progress = placementProgress(ti, asked.length, n, ls.indexOf(startOf(tr)) + 1, ls.length);
  return (
    <div className="lesson">
      <div className="lesson-top"><LessonTopBar value={progress} track={tr} onClose={onClose ?? (() => onDone({}, 0))} closeLabel={t("common.close")} progressLabel={t("lesson.progress")} /></div>
      <main className="screen narrow lesson-body">
        <div className="stack" key={`${tr}:${n}`} ref={askAt}>
          <QuestionHeader type={q.type} typeLabel={t("place.qTrack", { track: tracks.name(tr), n })} prompt={L(q.prompt)}
            media={q.snippet ? <CodeBlock text={q.snippet.text} lang={q.snippet.lang} label={t("code.snippet")} /> : undefined} />
          {q.type === "truefalse"
            ? <TrueFalse value={answer?.kind === "truefalse" ? answer.value : undefined} trueLabel={t("q.true")} falseLabel={t("q.false")} onChange={(v) => setAnswer({ kind: "truefalse", value: v })} />
            : shuffled(q.options, q.id).map((o, k) => <QuizOption key={o.id} keyLabel={keys[k]} state={answer?.kind === "choice" && answer.id === o.id ? "selected" : "idle"} onClick={() => setAnswer({ kind: "choice", id: o.id })}>{L(o.text)}</QuizOption>)}
          <Button block variant="ghost" onClick={() => next(false)}>{t("common.dontKnow")}</Button>
        </div>
      </main>
      <div className="lesson-bar"><Button block disabled={!answer} onClick={() => next(grade(q, answer!, lang))}>{t("common.continue")}</Button></div>
    </div>
  );
}
