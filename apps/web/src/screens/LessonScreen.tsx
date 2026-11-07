import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, EmptyState, FeedbackSheet, LessonComplete, LessonTopBar } from "@darsi/design-system";
import { loadUnit, useAsync } from "../content/load";
import { pick, type Audience, type Lesson, type Step } from "../content/types";
import { useMine } from "../content/mine";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { useAuth } from "../auth/AuthProvider";
import { clearRun, grade, isGraded, LessonRun, loadRun, saveRun, type Answer } from "../lesson/engine";
import { StepView } from "../lesson/StepView";
import { isMilestone, milestoneSentAt } from "../lesson/ProjectView";
import { speak } from "../lesson/speech";
import { track as trackEvent } from "../analytics/track";

export function LessonScreen() {
  const { unitId = "", lessonId = "" } = useParams();
  const { data: unit, error, retry } = useAsync(() => loadUnit(unitId), [unitId]);
  const { t } = useI18n();
  const { all } = useMine();
  const finished = useStore().state.progress;
  const [params] = useSearchParams();
  if (error) return <EmptyState tone="error" title={t("err.title")} body={t("err.body")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
  if (!unit) return <div className="loading" aria-busy="true" />;
  const lesson = unit.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <EmptyState title={t("err.notFound")} />;
  // Platform admins can open any lesson at any step: ?step=project-m3 opens that step (a capstone milestone a reviewer
  // came from), ?step=project the lesson's first step of that type.
  const want = params.get("step");
  const byId = lesson.steps.findIndex((s) => s.id === want);
  const at = byId >= 0 ? byId : want ? lesson.steps.findIndex((s) => s.type === want) : -1;
  // So can a learner who has finished the lesson (Me's "My projects": send a new version of a project), and nothing is
  // recorded again, even when the linked step is the first (`again`).
  // In a lesson they haven't finished, a link to one of its projects opens that project alone (`only`): its new version
  // is sent from there, and then they go back. Nothing else is skipped to, and the lesson isn't recorded as finished.
  const explore = all || (want && finished[lesson.id])
    ? { at: Math.max(0, at), again: !all }
    : want && at >= 0 && lesson.steps[at].type === "project" ? { at, again: true, only: true } : undefined;
  return <LessonPlayer key={lesson.id} unitId={unit.id} lesson={lesson} nextId={unit.lessons[unit.lessons.indexOf(lesson) + 1]?.id} track={unit.track} unitKind={unit.kind} explore={explore}
    audience={unit.audience} teach={unit.teach} />;
}

/**
 * Where a capstone's submission lesson opens: its milestones take days, so at the first one this account hasn't sent
 * from this phone, once one has been (ProjectView keeps when, and by whom, each was sent). Otherwise, and once all are
 * sent, at the start.
 */
export function nextMilestone(lesson: Lesson, uid: string | null | undefined): number {
  const ms = lesson.steps.flatMap((s, i) => (isMilestone(s) ? [{ i, sent: !!milestoneSentAt(lesson.id, s.id, uid) }] : []));
  return ms.some((m) => m.sent) ? ms.find((m) => !m.sent)?.i ?? 0 : 0;
}

/** What kind of step it is, for the platform admin's step list. */
const KINDS: Record<string, string> = { video: "video", read: "read", lab: "lab", project: "project", reflect: "reflect", code: "code", codefill: "code", parsons: "code", bug: "code", blocks: "code" };
const kindOf = (s: Step) => KINDS[s.type] ?? "question";

/**
 * Plays one lesson. With `preview` (the course editor's preview of an unsaved draft) nothing is recorded, saved,
 * submitted or synced, and leaving returns to the editor instead of the learner's screens.
 * With `explore` (platform admins) any step can be opened from a list, nothing has to be answered or watched first,
 * and a lesson they skipped through isn't recorded as finished.
 * Otherwise a lesson in progress is kept on this phone (lesson/engine.ts saveRun), so a reload, Back, or a tab the phone
 * closed picks it up where it was, with "Start over" beside it.
 * Screen readers: the step isn't a live region (a playing video's clock, a whole new step). One status line outside it
 * says what a step reports (an explanation, an outcome), and focus moves to the new step's heading after each Continue.
 */
export function LessonPlayer({ unitId, lesson, nextId, track, unitKind, preview, explore, audience, teach }: {
  unitId: string; lesson: Lesson; nextId?: string; track: import("../content/types").Track; unitKind?: "capstone"; preview?: { onExit: () => void };
  /**
   * `at`: the step to open; `again`: a learner back in a lesson they finished, which is never recorded a second time;
   * `only`: a learner's own project in a lesson they haven't finished (My projects): that step alone, then back.
   */
  explore?: { at: number; again?: boolean; only?: boolean };
  /** Who the course is for: students never see teacher wording ("Try it in class tomorrow", the classroom kit). */
  audience?: Audience;
  /** A university course: the try-it line speaks of the next lecture, as its kit does. */
  teach?: "university";
}) {
  const navigate = useNavigate();
  const nav = (to: string) => (preview ? preview.onExit() : navigate(to));
  const { t, L, lang, num } = useI18n();
  const { state, dispatch } = useStore();
  const { user, offlineUid } = useAuth();
  const mine = useMine();
  // A students' course, or a student on any course.
  const student = audience === "students" || mine.audience === "students";
  // The store's person: "guest" or the account (App.tsx Scoped), so a shared phone keeps each person's lesson apart.
  const scope = user?.uid ?? offlineUid ?? "guest";
  const keep = !preview && !explore;
  const [fresh, setFresh] = useState(0); // "Start over" presses
  const resumed = useRef(false);
  const run = useMemo(() => {
    resumed.current = false;
    const r = new LessonRun(lesson);
    if (explore) { r.index = Math.min(explore.at, lesson.steps.length - 1); return r; }
    if (!keep || fresh) return r;
    const back = LessonRun.restore(lesson, loadRun(scope, lesson.id));
    if (back) { resumed.current = true; return back; }
    if (unitKind === "capstone") { const at = nextMilestone(lesson, user?.uid ?? offlineUid); if (at > 0) { r.index = at; resumed.current = true; } }
    return r;
  }, [lesson, fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const [resumeNote, setResumeNote] = useState(resumed.current);
  const save = () => { if (keep) saveRun(scope, lesson.id, run.snapshot()); };
  const skipped = useRef(!!explore?.at || !!explore?.again);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [finished, setFinished] = useState<ReturnType<LessonRun["summary"]> | null>(null);
  const step = run.current;

  // Not in the editor's preview: authors trying a lesson aren't learners.
  useEffect(() => { if (!preview) trackEvent("lesson_start", { u: unitId, l: lesson.id, tr: track }); }, [preview, unitId, lesson.id, track]);
  // While the answer sheet shows, the floating Report and tutor buttons stand above it, and the step can scroll clear of
  // both: the sheet's height goes to --sheet-h on <html> (app.css --fab-end; no :has() on old phones).
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const sheet = result === null ? null : box.current?.querySelector<HTMLElement>(".dr-sheet");
    if (!sheet) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--sheet-h", `${sheet.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    ro?.observe(sheet);
    return () => { ro?.disconnect(); root.style.removeProperty("--sheet-h"); };
  }, [result]);
  const onAnswer = useCallback((a: Answer | null) => setAnswer(a), []);
  const onUngradedReady = useCallback((r: boolean) => setReady(r), []);
  // The status line's words. The same words twice in a row still get read: a no-break space tells them apart.
  const [said, setSaid] = useState("");
  const announce = useCallback((text: string) => setSaid((was) => (was === text ? `${text}\u00A0` : text)), []);
  // After Continue (or Start over), the focus goes to the new step's heading, or the end screen's title, so keyboard and
  // screen reader users are where the page is; never on the first visit.
  const focusStep = useRef(false);
  const done = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusStep.current) return;
    focusStep.current = false;
    const root = finished ? done.current : box.current?.querySelector<HTMLElement>(".lesson-body");
    if (!root) return;
    const to = root.querySelector<HTMLElement>(".dr-qhead-prompt, .dr-complete-title, h2, .dr-reflect-label") ?? root;
    if (!to.hasAttribute("tabindex")) to.setAttribute("tabindex", "-1");
    to.focus({ preventScroll: true });
  });
  // A step's own last action (a video's checkpoint) hands the focus to Continue, which it has just made ready.
  const bar = useRef<HTMLDivElement>(null);
  const focusContinue = useCallback(() => { setTimeout(() => bar.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(), 0); }, []);

  // A learner's own project alone (`only`): done with it, back to where they came from (My projects).
  const only = !!explore?.only;
  const leave = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1); else navigate("/me#projects", { replace: true });
  };
  const advance = () => {
    if (only) { leave(); return; }
    run.next(); setAnswer(null); setReady(false); setResult(null); setResumeNote(false); setSaid("");
    if (run.done) {
      const s = run.summary();
      if (!preview && !skipped.current) {
        dispatch({ type: "completeLesson", id: lesson.id, result: { ...s, unitId, track, competencies: lesson.competencies } });
        // A lesson with nothing graded (a project, a capstone stage) sends no accuracy: its 100% says nothing (FC-06).
        trackEvent("lesson_complete", { u: unitId, l: lesson.id, tr: track, ...(lesson.steps.some((x) => isGraded(x)) ? { acc: Math.round(s.accuracy * 100) } : {}), sec: s.seconds, xp: s.xp });
      }
      if (keep) clearRun(scope, lesson.id);
      setFinished(s);
    } else {
      save();
      if (run.isRetry) announce(t("lesson.again"));
    }
    focusStep.current = true;
    rerender();
    window.scrollTo({ top: 0 });
  };
  // The step list is a <select>: arrowing through it changes the step, so the focus stays on it (WCAG 3.2.2).
  const jump = (i: number) => {
    skipped.current = true;
    run.index = i; setAnswer(null); setReady(false); setResult(null); setSaid("");
    rerender();
    window.scrollTo({ top: 0 });
  };
  const skip = () => { skipped.current = true; advance(); };
  const startOver = () => {
    if (keep) clearRun(scope, lesson.id);
    setAnswer(null); setReady(false); setResult(null); setResumeNote(false); setSaid("");
    focusStep.current = true;
    setFresh((n) => n + 1);
    window.scrollTo({ top: 0 });
  };
  const check = () => {
    if (!step || !isGraded(step) || !answer) return;
    const ok = grade(step, answer, lang);
    run.record(step, ok); setResult(ok);
    save();
    // The result sheet takes the focus and its title says right or wrong; the explanation is read out here.
    if ("explain" in step && step.explain) announce(L(step.explain));
  };

  if (finished) {
    // Capstones (and any lesson with only ungraded read/project steps) should not flash XP/accuracy.
    const hasGraded = lesson.steps.some((s) => isGraded(s));
    const showScore = unitKind !== "capstone" && hasGraded;
    const stats = showScore
      ? [{ label: t("col.xp"), value: `+${num(finished.xp)}` },{ label: t("lesson.accuracy"), value: num(finished.accuracy, { style: "percent" }), tone: track }, { label: t("lesson.time"), value: t("common.minutes", { n: Math.max(1, Math.round(finished.seconds / 60)) }), tone: "ai" }]
      : [];
    // Students: their try-it line is for home or school this week, and their kit (notes and slides) is never the main way
    // on; at the end of a course they go back to learning. University courses speak of the next lecture, as their kits do.
    const kit = <Button block variant={nextId || student ? "secondary" : "primary"} icon="award" onClick={() => nav(`/kit#${lesson.id}`)}>{t(student ? "lesson.toKitStudent" : "lesson.toKit")}</Button>;
    const home = <Button block variant={!nextId && student ? "primary" : "ghost"} onClick={() => nav("/learn")}>{t("lesson.home")}</Button>;
    return (
      <main className="screen narrow" ref={done}>
        <h1 className="lesson-h1">{L(lesson.title)}</h1>
        <LessonComplete title={t("lesson.done")} subtitle={L(lesson.title)}
          stats={stats}
          tryLabel={t(student ? "lesson.tryStudent" : teach === "university" ? "lesson.tryUni" : "lesson.try")} tryTomorrow={L(lesson.tryTomorrow)}
          actions={preview ? <Button block onClick={preview.onExit}>{t("common.close")}</Button> : <>
            {nextId && <Button block iconEnd="next" onClick={() => nav(`/lesson/${unitId}/${nextId}`)}>{t("lesson.next")}</Button>}
            {!nextId && student ? <>{home}{kit}</> : <>{kit}{home}</>}
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
    <div className="lesson" ref={box}>
      <div className="lesson-top"><LessonTopBar value={run.progress} track={track} onClose={() => nav("/learn")} closeLabel={t("common.close")} progressLabel={t("lesson.progress")} onAudio={() => speak(audioText, lang)} audioLabel={t("common.readAloud")} /></div>
      <main className="screen narrow lesson-body">
        {/* The page's heading for screen readers (the lesson's title); each step's prompt is a heading under it. */}
        <h1 className="lesson-h1">{L(lesson.title)}</h1>
        {resumeNote &&<p className="resume-note"><span>{t("lesson.resumed")}</span><Button size="sm" variant="ghost" icon="undo" onClick={startOver}>{t("lesson.startOver")}</Button></p>}
        {explore && !only && (
          <label className="lesson-jump">
            <span>{t("lesson.jump")}</span>
            <select value={lesson.steps.indexOf(step)} onChange={(e) => jump(Number(e.target.value))}>
              {lesson.steps.map((s, i) => <option key={s.id} value={i}>{t("lesson.stepN", { n: i + 1, kind: t(`lesson.kind.${kindOf(s)}` as "lesson.kind.video") })}</option>)}
            </select>
          </label>
        )}
        {run.isRetry && <p className="retry-note">{t("lesson.again")}</p>}
        <StepView key={`${fresh}-${step.id}-${run.index}`} step={step} result={result} onAnswer={onAnswer} onUngradedReady={onUngradedReady} attempt={attempt} lessonId={lesson.id} unitId={unitId}
          note={preview ? undefined : state.notes[lesson.id]} onNote={(text) => { if (!preview) dispatch({ type: "saveNote", id: lesson.id, text }); }} preview={!!preview}
          announce={announce} focusContinue={focusContinue} student={student} onSkip={advance} />
      </main>
      {/* The lesson's one status line for screen readers (outside the step, always on the page, so changes are read). */}
      <p className="lesson-live" role="status" aria-live="polite" aria-atomic="true">{said}</p>
      {result === null ? (
        <div className="lesson-bar" ref={bar}>
          {only
            ? <Button block variant={ready ? "primary" : "secondary"} onClick={leave}>{t("common.back")}</Button>
            : graded
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
