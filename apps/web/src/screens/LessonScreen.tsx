import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, FeedbackSheet, LessonComplete, LessonTopBar } from "@darsi/design-system";
import { loadUnit, useAsync } from "../content/load";
import { pick } from "../content/types";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { grade, isGraded, LessonRun, type Answer } from "../lesson/engine";
import { StepView } from "../lesson/StepView";
import { speak } from "../lesson/speech";

export function LessonScreen() {
  const { unitId = "", lessonId = "" } = useParams();
  const { data: unit, error, retry } = useAsync(() => loadUnit(unitId), [unitId]);
  const { t } = useI18n();
  if (error) return <EmptyState tone="error" title={t("err.title")} body={t("err.body")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
  if (!unit) return <div className="loading" aria-busy="true" />;
  const lesson = unit.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <EmptyState title={t("err.notFound")} />;
  return <LessonPlayer key={lesson.id} unitId={unit.id} lesson={lesson} nextId={unit.lessons[unit.lessons.indexOf(lesson) + 1]?.id} track={unit.track} />;
}

function LessonPlayer({ unitId, lesson, nextId, track }: { unitId: string; lesson: import("../content/types").Lesson; nextId?: string; track: import("../content/types").Track }) {
  const nav = useNavigate();
  const { t, L, lang, num } = useI18n();
  const { state, dispatch } = useStore();
  const run = useMemo(() => new LessonRun(lesson), [lesson]);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [finished, setFinished] = useState<ReturnType<LessonRun["summary"]> | null>(null);
  const step = run.current;

  const onAnswer = useCallback((a: Answer | null) => setAnswer(a), []);
  const onUngradedReady = useCallback((r: boolean) => setReady(r), []);

  const advance = () => {
    run.next(); setAnswer(null); setReady(false); setResult(null);
    if (run.done) { const s = run.summary(); dispatch({ type: "completeLesson", id: lesson.id, result: { ...s, unitId, track, competencies: lesson.competencies } }); setFinished(s); }
    rerender();
    window.scrollTo({ top: 0 });
  };
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
          actions={<>
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
      <div className="lesson-top"><LessonTopBar value={run.progress} track={track} onClose={() => nav("/learn")} closeLabel={t("common.close")} onAudio={() => speak(audioText, lang)} audioLabel={t("common.readAloud")} /></div>
      <main className="screen narrow lesson-body" aria-live="polite">
        {run.isRetry && <p className="retry-note">{t("lesson.again")}</p>}
        <StepView key={`${step.id}-${run.index}`} step={step} result={result} onAnswer={onAnswer} onUngradedReady={onUngradedReady} attempt={attempt} lessonId={lesson.id} unitId={unitId}
          note={state.notes[lesson.id]} onNote={(text) => dispatch({ type: "saveNote", id: lesson.id, text })} />
      </main>
      {result === null ? (
        <div className="lesson-bar">
          {graded
            ? <Button block disabled={!answer} onClick={check}>{t("common.check")}</Button>
            : <Button block iconEnd="next" disabled={!ready} onClick={advance}>{t("common.continue")}</Button>}
        </div>
      ) : (
        <FeedbackSheet result={result ? "correct" : "wrong"} title={result ? t("lesson.correct") : t("lesson.wrong")} explanation={explain}
          continueLabel={result ? t("common.continue") : t("common.gotIt")} onContinue={advance} />
      )}
    </div>
  );
}
