import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, EmptyState, FeedbackSheet, LessonComplete, LessonTopBar } from "@darsi/design-system";
import { loadUnit, useAsync } from "../content/load";
import { pick, type Step } from "../content/types";
import { useMine } from "../content/mine";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { grade, isGraded, LessonRun, type Answer } from "../lesson/engine";
import { StepView } from "../lesson/StepView";
import { speak } from "../lesson/speech";
import { track as trackEvent } from "../analytics/track";

export function LessonScreen() {
  const { unitId = "", lessonId = "" } = useParams();
  const { data: unit, error, retry } = useAsync(() => loadUnit(unitId), [unitId]);
  const { t } = useI18n();
  const { all } = useMine();
  const [params] = useSearchParams();
  if (error) return <EmptyState tone="error" title={t("err.title")} body={t("err.body")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
  if (!unit) return <div className="loading" aria-busy="true" />;
  const lesson = unit.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <EmptyState title={t("err.notFound")} />;
  // Platform admins can open any lesson at any step (?step=project opens it at its project).
  const explore = all ? { at: Math.max(0, lesson.steps.findIndex((s) => s.type === params.get("step"))) } : undefined;
  return <LessonPlayer key={lesson.id} unitId={unit.id} lesson={lesson} nextId={unit.lessons[unit.lessons.indexOf(lesson) + 1]?.id} track={unit.track} explore={explore} />;
}

/** What kind of step it is, for the platform admin's step list. */
const KINDS: Record<string, string> = { video: "video", read: "read", lab: "lab", project: "project", reflect: "reflect", code: "code", codefill: "code", parsons: "code", bug: "code", blocks: "code" };
const kindOf = (s: Step) => KINDS[s.type] ?? "question";

/**
 * Plays one lesson. With `preview` (the course editor's preview of an unsaved draft) nothing is recorded, saved,
 * submitted or synced, and leaving returns to the editor instead of the learner's screens.
 * With `explore` (platform admins) any step can be opened from a list, nothing has to be answered or watched first,
 * and a lesson they skipped through isn't recorded as finished.
 */
export function LessonPlayer({ unitId, lesson, nextId, track, preview, explore }: { unitId: string; lesson: import("../content/types").Lesson; nextId?: string; track: import("../content/types").Track; preview?: { onExit: () => void }; explore?: { at: number } }) {
  const navigate = useNavigate();
  const nav = (to: string) => (preview ? preview.onExit() : navigate(to));
  const { t, L, lang, num } = useI18n();
  const { state, dispatch } = useStore();
  const run = useMemo(() => { const r = new LessonRun(lesson); if (explore) r.index = Math.min(explore.at, lesson.steps.length - 1); return r; }, [lesson]); // eslint-disable-line react-hooks/exhaustive-deps
  const skipped = useRef(!!explore?.at);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [finished, setFinished] = useState<ReturnType<LessonRun["summary"]> | null>(null);
  const step = run.current;

  // Not in the editor's preview: authors trying a lesson aren't learners.
  useEffect(() => { if (!preview) trackEvent("lesson_start", { u: unitId, l: lesson.id, tr: track }); }, [preview, unitId, lesson.id, track]);
  const onAnswer = useCallback((a: Answer | null) => setAnswer(a), []);
  const onUngradedReady = useCallback((r: boolean) => setReady(r), []);

  const advance = () => {
    run.next(); setAnswer(null); setReady(false); setResult(null);
    if (run.done) {
      const s = run.summary();
      if (!preview && !skipped.current) {
        dispatch({ type: "completeLesson", id: lesson.id, result: { ...s, unitId, track, competencies: lesson.competencies } });
        trackEvent("lesson_complete", { u: unitId, l: lesson.id, tr: track, acc: Math.round(s.accuracy * 100), sec: s.seconds, xp: s.xp });
      }
      setFinished(s);
    }
    rerender();
    window.scrollTo({ top: 0 });
  };
  const jump = (i: number) => {
    skipped.current = true;
    run.index = i; setAnswer(null); setReady(false); setResult(null);
    rerender();
    window.scrollTo({ top: 0 });
  };
  const skip = () => { skipped.current = true; advance(); };
  const check = () => {
    if (!step || !isGraded(step) || !answer) return;
    const ok = grade(step, answer, lang);
    run.record(step, ok); setResult(ok);
  };

  if (finished) {
    return (
      <main className="screen narrow">
        <LessonComplete title={t("lesson.done")} subtitle={L(lesson.title)}
          stats={[{ label: "XP", value: `+${num(finished.xp)}` }, { label: t("lesson.accuracy"), value: num(finished.accuracy, { style: "percent" }), tone: track }, { label: t("lesson.time"), value: t("common.minutes", { n: Math.max(1, Math.round(finished.seconds / 60)) }), tone: "ai" }]}
          tryLabel={t("lesson.try")} tryTomorrow={L(lesson.tryTomorrow)}
          actions={preview ? <Button block onClick={preview.onExit}>{t("common.close")}</Button> : <>
            {nextId && <Button block iconEnd="next" onClick={() => nav(`/lesson/${unitId}/${nextId}`)}>{t("lesson.next")}</Button>}
            <Button block variant={nextId ? "secondary" : "primary"} icon="award" onClick={() => nav(`/kit#${lesson.id}`)}>{t("lesson.toKit")}</Button>
            <Button block variant="ghost" onClick={() => nav("/learn")}>{t("lesson.home")}</Button>
          </>} />
      </main>
    );
  }
  if (!step) return null;
  const graded = isGraded(step);
  const attempt = run.queue.slice(0, run.index).filter((x) => x.id === step.id).length; // 0 first time, 1 on the retry
  const explain = "explain" in step && step.explain ? L(step.explain) : undefined;
  const audioText = [pick(step.prompt, lang), "options" in step && Array.isArray(step.options) ? step.options.map((o) => ("text" in o ? pick(o.text, lang) : pick(o.label, lang))).join(". ") : ""].join(". ");

  return (
    <div className="lesson">
      <div className="lesson-top"><LessonTopBar value={run.progress} track={track} onClose={() => nav("/learn")} closeLabel={t("common.close")} progressLabel={t("lesson.progress")} onAudio={() => speak(audioText, lang)} audioLabel={t("common.readAloud")} /></div>
      <main className="screen narrow lesson-body" aria-live="polite">
        {explore && (
          <label className="lesson-jump">
            <span>{t("lesson.jump")}</span>
            <select value={lesson.steps.indexOf(step)} onChange={(e) => jump(Number(e.target.value))}>
              {lesson.steps.map((s, i) => <option key={s.id} value={i}>{t("lesson.stepN", { n: i + 1, kind: t(`lesson.kind.${kindOf(s)}` as "lesson.kind.video") })}</option>)}
            </select>
          </label>
        )}
        {run.isRetry && <p className="retry-note">{t("lesson.again")}</p>}
        <StepView key={`${step.id}-${run.index}`} step={step} result={result} onAnswer={onAnswer} onUngradedReady={onUngradedReady} attempt={attempt} lessonId={lesson.id} unitId={unitId}
          note={preview ? undefined : state.notes[lesson.id]} onNote={(text) => { if (!preview) dispatch({ type: "saveNote", id: lesson.id, text }); }} preview={!!preview} />
      </main>
      {result === null ? (
        <div className="lesson-bar">
          {graded
            ? <div className={explore ? "lesson-bar-row" : undefined}>
                <Button block disabled={!answer} onClick={check}>{t("common.check")}</Button>
                {explore && <Button variant="secondary" iconEnd="next" onClick={skip}>{t("lesson.skip")}</Button>}
              </div>
            : <Button block iconEnd="next" disabled={!ready && !explore} onClick={ready ? advance : skip}>{t("common.continue")}</Button>}
        </div>
      ) : (
        <FeedbackSheet result={result ? "correct" : "wrong"} title={result ? t("lesson.correct") : t("lesson.wrong")} explanation={explain}
          continueLabel={result ? t("common.continue") : t("common.gotIt")} onContinue={advance} />
      )}
    </div>
  );
}
