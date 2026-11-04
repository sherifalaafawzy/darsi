import { Component, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { COMPETENCIES } from "../content/competencies";
import { usePack, useTracks } from "../content/settings";
import { levelsByTrack } from "../content/tracks";
import { labMeta } from "../labs/catalog";
import { audienceOf, type Lesson, type Step, type Unit } from "../content/types";
import { errorsOf, validateUnit, type Issue } from "../content/validate";
import { I18nProvider, languageOf, useI18n, useLanguages, type MessageKey } from "../i18n";
import type { LessonPlayer } from "../screens/LessonScreen";
/** The lesson player, passed in by App (importing it here would split the startup bundle: see App.tsx). */
type Player = typeof LessonPlayer;
import { cmsApi, issuesOf } from "./api";
import { createUnit, getUnit, saveUnit, statusOf, type UnitMeta } from "./data";
import { LangName, LText, Num } from "./fields";
import { EditLangsProvider, langsIn, savedEditLangs, saveEditLangs, savedLangView, saveLangView, type LangView } from "./langs";
import { useHistory, useUndoKeys } from "./history";
import { blankLesson, blankStep, copyLesson, copyStep, copyTitle, newLessonId, newStepId, withNewIds } from "./ids";
import { Outline, StepIcon } from "./outline";
import { CopyTo, Glance, GoCard, HereIssues, IssuesPanel, KitForm, LessonCards, LessonMore, PaneHead, SlidesForm, StepBoard, StepTypes } from "./panes";
import { AudiencePicker, LevelPicker, TrackPicker } from "./pickers";
import { STEP_LABEL, StepForm, type MediaCtx } from "./steps";
import "../styles/editor.css";
import "./strings";

const CODES = new Set(COMPETENCIES.map((c) => c.code));
/** The shared validator only checks a lab id's shape; here we also know the Labs catalogue. */
const unknownLabs = (u: Unit): Issue[] => u.lessons.flatMap((l, lesson) => l.steps.flatMap((s, step) =>
  s.type === "lab" && !labMeta(s.tool) ? [{ at: { lesson, step, field: "tool" }, code: "badValue" as const, level: "error" as const, params: { value: s.tool } }] : []));
/** Changes save by themselves this long after the last one. */
const AUTOSAVE_MS = 3000;
const LIVE_KEY = "darsi:editLive";
const savedLive = () => { try { return localStorage.getItem(LIVE_KEY) !== "0"; } catch { return true; } };

/** What the detail pane shows. Lessons and steps are picked by id, so moving them or undoing keeps the selection. */
export type Sel =
  | { kind: "unit" | "checks" }
  | { kind: "lesson" | "slides" | "kit"; lesson: string }
  | { kind: "step"; lesson: string; step: string }
  | { kind: "add-step"; lesson: string; at: number };
type Ask = "" | "delete" | "unpublish" | { leave: string };
interface Msg { ok: boolean; text: string; undo?: boolean; open?: string }

function download(name: string, text: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
const moveTo = <T,>(xs: T[], from: number, to: number) => { const n = [...xs]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; };

/**
 * /super/content/:unitId and /admin/content/:unitId. An outline of the unit beside the pane for what's picked (on
 * phones, one then the other). Edits save themselves a few seconds after the last one (and before leaving), with undo
 * for the last 50 changes. The author can see every language side by side or one at a time, and a step being edited
 * plays live beside its form on wide screens. "Publish" saves, then asks the publishUnit function to check the draft
 * and put it live.
 */
export function UnitEditor({ Player }: { Player: Player }) {
  const { unitId = "" } = useParams();
  const nav = useNavigate();
  const { t, L, num, locale, lang: uiLang } = useI18n();
  const tracks = useTracks();
  const { user, role } = useAuth();
  const base = role === "superadmin" ? "/super/content" : "/admin/content";
  const [meta, setMeta] = useState<UnitMeta | null>(null);
  const hist = useHistory<Unit | null>(null);
  const unit = hist.value;
  const [saved, setSaved] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveErr, setSaveErr] = useState<"" | "conflict" | "failed">("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "delete" | "copy">("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [ask, setAsk] = useState<Ask>("");
  const [sel, setSel] = useState<Sel>({ kind: "unit" });
  const [pane, setPane] = useState<"outline" | "detail">("outline");
  const [preview, setPreview] = useState<{ lesson: string; lang: string; at: number } | null>(null);
  const [editLangs, setEditLangs] = useState<string[]>(savedEditLangs);
  const [view, setView] = useState<LangView>(() => savedLangView(uiLang));
  const [live, setLive] = useState(savedLive);
  const [copying, setCopying] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMeta(null); setLoadErr(""); setMsg(null); setAsk(""); setSel({ kind: "unit" }); setPane("outline"); setSaveErr("");
    getUnit(unitId).then((r) => {
      if (!r) return setLoadErr(t("err.notFound"));
      setMeta(r.meta); hist.reset(r.unit); setSaved(JSON.stringify(r.unit));
      setEditLangs((cur) => [...new Set([...cur, ...langsIn(r.unit)])]); // never hide a language the unit already has
    })
      .catch((e: Error) => setLoadErr(e.message));
  }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => !!unit && JSON.stringify(unit) !== saved, [unit, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  useUndoKeys(hist.undo, hist.redo, !preview);
  // Bring the pane into view when something far down the outline is picked.
  useEffect(() => { const el = document.getElementById("ed-detail"); if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" }); }, [sel, pane]);

  // Checking runs on a deferred copy, so typing stays smooth on a slow laptop.
  const checked = useDeferredValue(unit);
  const issues = useMemo(() => (checked ? [...validateUnit(checked, { competencies: CODES, tracks: levelsByTrack(tracks.all), langs: editLangs }), ...unknownLabs(checked)] : []), [checked, tracks.all, editLangs]);
  const errors = errorsOf(issues);

  /** Saves the draft. `quiet` (autosave) shows no message unless it fails. */
  const save = useCallback(async (quiet = false): Promise<boolean> => {
    if (!user || !unit || !meta) return false;
    setBusy("save"); if (!quiet) setMsg(null);
    try {
      const r = await saveUnit(unit, meta.rev, user.uid);
      if ("conflict" in r) { setSaveErr("conflict"); setMsg({ ok: false, text: t("cms.conflict") }); return false; }
      setMeta((m) => (m ? { ...m, rev: r.rev, title: unit.title, track: unit.track, level: unit.level, lessonCount: unit.lessons.length } : m));
      setSaved(JSON.stringify(unit)); setSavedAt(new Date()); setSaveErr("");
      if (!quiet) setMsg({ ok: true, text: t("cms.saved") });
      return true;
    } catch (e) { setSaveErr("failed"); setMsg({ ok: false, text: (e as Error).message }); return false; }
    finally { setBusy(""); }
  }, [user, unit, meta, t]);
  // Autosave: a few seconds after the last change, never while something else runs or after someone else saved.
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    if (!dirty || busy || saveErr === "conflict") return;
    const id = setTimeout(() => { void saveRef.current(true); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [unit, dirty, busy, saveErr]);
  // Leaving the tab (switching apps on a phone) saves at once; Ctrl+S saves now.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden" && dirty && !busy && saveErr !== "conflict") void saveRef.current(true); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); } };
    document.addEventListener("visibilitychange", hide); addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", hide); removeEventListener("keydown", key); };
  }, [dirty, busy, saveErr]);

  if (loadErr) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={loadErr} action={<Button size="sm" onClick={() => nav(base)}>{t("common.back")}</Button>} /></main>;
  if (!unit || !meta) return <div className="loading" aria-busy="true" />;

  // A selection that undo or a delete took away falls back to its lesson, then to the unit.
  const li = "lesson" in sel ? unit.lessons.findIndex((l) => l.id === sel.lesson) : -1;
  const lesson = li >= 0 ? unit.lessons[li] : undefined;
  const si = sel.kind === "step" && lesson ? lesson.steps.findIndex((s) => s.id === sel.step) : -1;
  const view_: Sel = !("lesson" in sel) ? sel : !lesson ? { kind: "unit" } : sel.kind === "step" && si < 0 ? { kind: "lesson", lesson: lesson.id } : sel;
  const status = statusOf(meta);
  const media = (l: Lesson): MediaCtx => ({ owner: meta.owner, unitId: unit.id, lessonId: l.id });

  const pick = (s: Sel) => { setSel(s); setPane("detail"); setCopying(false); };
  /** One change. Typing in the same item merges into one undo step; anything else is its own. */
  const edit = (u: Unit, group?: string) => { hist.set(u, group); setMsg((m) => (m && !m.ok ? m : null)); setAsk((a) => (a === "delete" || a === "unpublish" ? "" : a)); };
  const typing = (u: Unit) => edit(u, JSON.stringify(view_));
  const withLessons = (ls: Lesson[]) => ({ ...unit, lessons: ls });
  const setLesson = (i: number, l: Lesson, group?: string) => edit(withLessons(unit.lessons.map((x, k) => (k === i ? l : x))), group);

  const lessonOps = {
    insert: (at: number) => { const l = blankLesson(newLessonId(unit)); const ls = [...unit.lessons]; ls.splice(at, 0, l); edit(withLessons(ls)); pick({ kind: "lesson", lesson: l.id }); },
    duplicate: (i: number) => {
      const c = { ...copyLesson(unit.lessons[i], unit), title: copyTitle(unit.lessons[i].title) };
      const ls = [...unit.lessons]; ls.splice(i + 1, 0, c); edit(withLessons(ls)); pick({ kind: "lesson", lesson: c.id });
    },
    move: (from: number, to: number) => edit(withLessons(moveTo(unit.lessons, from, to))),
    remove: (i: number) => { edit(withLessons(unit.lessons.filter((_, k) => k !== i))); setSel({ kind: "unit" }); setMsg({ ok: true, text: t("cms.deletedLesson"), undo: true }); },
  };
  const stepOps = (i: number, l: Lesson) => {
    const setSteps = (steps: Step[]) => setLesson(i, { ...l, steps });
    return {
      insert: (type: Step["type"], at: number) => { const s = blankStep(type, newStepId(l, type)); const st = [...l.steps]; st.splice(at, 0, s); setSteps(st); pick({ kind: "step", lesson: l.id, step: s.id }); },
      insertAt: (at: number) => pick({ kind: "add-step", lesson: l.id, at }),
      duplicate: (k: number) => { const c = copyStep(l.steps[k], l); const st = [...l.steps]; st.splice(k + 1, 0, c); setSteps(st); pick({ kind: "step", lesson: l.id, step: c.id }); },
      move: (k: number, d: -1 | 1) => setSteps(moveTo(l.steps, k, k + d)),
      moveTo: (from: number, to: number) => setSteps(moveTo(l.steps, from, to)),
      remove: (k: number) => { setSteps(l.steps.filter((_, j) => j !== k)); setSel({ kind: "lesson", lesson: l.id }); setMsg({ ok: true, text: t("cms.deletedStep"), undo: true }); },
      open: (id: string) => pick({ kind: "step", lesson: l.id, step: id }),
    };
  };

  const publish = async () => {
    if (dirty && !(await save(true))) return;
    setBusy("publish"); setMsg(null);
    try {
      const { version } = await cmsApi.publishUnit({ unitId: unit.id });
      setMeta((m) => (m ? { ...m, published: { version, rev: m.rev } } : m));
      setMsg({ ok: true, text: t("cms.published", { n: version }) });
    } catch (e) {
      const n = issuesOf(e).length;
      setMsg({ ok: false, text: n ? t("cms.publishBlocked", { n }) : (e as Error).message });
    } finally { setBusy(""); }
  };
  const unpublish = async () => {
    setAsk(""); setBusy("unpublish"); setMsg(null);
    try { await cmsApi.unpublishUnit({ unitId: unit.id }); setMeta({ ...meta, published: null }); setMsg({ ok: true, text: t("cms.unpublished") }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  const remove = async () => {
    setAsk(""); setBusy("delete");
    try { await cmsApi.deleteUnit({ unitId: unit.id }); setSaved(JSON.stringify(unit)); nav(base); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); setBusy(""); }
  };
  /** A copy of the unit as it is on screen (unsaved changes included), as a new draft with new ids. */
  const duplicate = async () => {
    if (!user) return;
    setBusy("copy"); setMsg(null);
    try {
      const copy = withNewIds({ ...unit, title: copyTitle(unit.title) });
      await createUnit(meta.owner, copy, user.uid);
      setMsg({ ok: true, text: t("cms.duplicated", { title: L(copy.title) || t("cms.untitled") }), open: copy.id });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  /** Leaving saves first; only a save that fails asks. */
  const go = async (path: string) => {
    if (!dirty) return nav(path);
    if (saveErr !== "conflict" && await save(true)) return nav(path);
    setAsk({ leave: path });
  };

  /** From the checks: open the place an issue points at. */
  const jump = (i: Issue) => {
    const l = i.at.lesson !== undefined ? unit.lessons[i.at.lesson] : undefined;
    if (!l) return pick({ kind: "unit" });
    if (i.at.step !== undefined && l.steps[i.at.step]) return pick({ kind: "step", lesson: l.id, step: l.steps[i.at.step].id });
    if (i.at.slide !== undefined) return pick({ kind: "slides", lesson: l.id });
    if (i.at.kit !== undefined) return pick({ kind: "kit", lesson: l.id });
    pick({ kind: "lesson", lesson: l.id });
  };
  const count = (f: (i: Issue) => boolean) => errors.filter(f).length;
  const translate = (code: string) => { setView(code); saveLangView(code); };
  const here = (f: (i: Issue) => boolean) => <HereIssues issues={issues.filter(f)} onTranslate={translate} />;
  const lessonOf = (n: number) => t("cms.lessonOf", { n: num(n + 1), total: num(unit.lessons.length) });

  let detail: ReactNode;
  let liveStep: Step | undefined;
  if (view_.kind === "unit") detail = (
    <div className="stack-lg">
      <Glance unit={unit} issues={issues} onChecks={() => pick({ kind: "checks" })} onTranslate={translate} />
      {here((x) => x.at.lesson === undefined)}
      <section className="stack-lg" aria-labelledby="ed-details-h">
        <h3 id="ed-details-h" className="ed-h4">{t("cms.unitDetails")}</h3>
        <LText label={t("cms.title")} value={unit.title} onChange={(title) => typing({ ...unit, title })} />
        <LText label={t("cms.summary")} value={unit.summary} onChange={(summary) => typing({ ...unit, summary })} multiline rows={2} />
        <TrackPicker value={unit.track} onChange={(track) => edit({ ...unit, track, level: Math.min(unit.level, tracks.of(track).levels) })} />
        <LevelPicker track={unit.track} value={unit.level} onChange={(level) => edit({ ...unit, level })} />
        <AudiencePicker value={audienceOf(unit)} onChange={(a) => edit({ ...unit, audience: a === "students" ? a : undefined })} />
      </section>
      <section className="stack" aria-labelledby="ed-lessons-h">
        <h3 id="ed-lessons-h" className="ed-h4">{t("cms.lessons")}</h3>
        <LessonCards unit={unit} errors={errors} onOpen={(id) => pick({ kind: "lesson", lesson: id })} onAdd={() => lessonOps.insert(unit.lessons.length)} />
      </section>
      <section className="stack ed-danger" aria-labelledby="ed-actions-h">
        <h3 id="ed-actions-h" className="ed-h4">{t("cms.unitActions")}</h3>
        <div className="ed-toolbar">
          <Button size="sm" variant="secondary" icon="file" loading={busy === "copy"} disabled={!!busy} onClick={() => { void duplicate(); }}>{t("cms.duplicateUnit")}</Button>
          <Button size="sm" variant="ghost" icon="share" onClick={() => download(`${unit.id}.json`, JSON.stringify(unit, null, 1))}>{t("cms.export")}</Button>
          {meta.published && <Button size="sm" variant="ghost" loading={busy === "unpublish"} disabled={!!busy} onClick={() => setAsk("unpublish")}>{t("cms.unpublish")}</Button>}
          <Button size="sm" variant="ghost" icon="close" loading={busy === "delete"} disabled={!!busy} onClick={() => setAsk("delete")}>{t("cms.delete")}</Button>
        </div>
        <p className="muted small" dir="ltr"><span className="cap-code">{unit.id}</span></p>
      </section>
    </div>
  );
  else if (view_.kind === "checks") detail = <IssuesPanel issues={issues} unit={unit} onJump={jump} />;
  else if (lesson) {
    const ops = stepOps(li, lesson);
    const group = JSON.stringify(view_);
    const canPreview = count((x) => x.at.lesson === li) === 0 && lesson.steps.length > 0;
    if (view_.kind === "lesson") detail = (
      <div className="stack-lg">
        <PaneHead title={lessonOf(li)}>
          <Button size="sm" variant="secondary" icon="play" disabled={!canPreview} onClick={() => setPreview({ lesson: lesson.id, lang: view === "all" ? "en" : view, at: 0 })}>{t("cms.preview")}</Button>
        </PaneHead>
        <div className="ed-toolbar">
          <Button size="sm" variant="ghost" icon="file" onClick={() => lessonOps.duplicate(li)}>{t("cms.duplicate")}</Button>
          <Button size="sm" variant="ghost" icon="share" aria-expanded={copying} onClick={() => setCopying(!copying)}>{t("cms.copyTo")}</Button>
          <span className="ed-tools ed-tools-end">
            <Button size="sm" variant="ghost" iconOnly icon="up" disabled={li === 0} onClick={() => lessonOps.move(li, li - 1)}>{t("q.up")}</Button>
            <Button size="sm" variant="ghost" iconOnly icon="down" disabled={li === unit.lessons.length - 1} onClick={() => lessonOps.move(li, li + 1)}>{t("q.down")}</Button>
            <Button size="sm" variant="ghost" iconOnly icon="close" disabled={unit.lessons.length <= 1} onClick={() => lessonOps.remove(li)}>{t("cms.deleteLesson")}</Button>
          </span>
        </div>
        {!canPreview && lesson.steps.length > 0 && <p className="muted small">{t("cms.previewBlocked")}</p>}
        {copying && <CopyTo owner={meta.owner} unitId={unit.id} lesson={lesson} onDone={(text) => { setMsg({ ok: true, text }); setCopying(false); }} />}
        {here((x) => x.at.lesson === li && x.at.step === undefined && x.at.slide === undefined && x.at.kit === undefined)}
        <LText label={t("cms.title")} value={lesson.title} onChange={(title) => setLesson(li, { ...lesson, title }, group)} />
        <div className="form-grid"><Num label={t("cms.minutes")} min={1} max={60} value={lesson.minutes} onChange={(minutes) => setLesson(li, { ...lesson, minutes }, group)} /></div>
        <section className="stack" aria-labelledby="ed-steps-h">
          <h4 id="ed-steps-h" className="ed-h4">{`${t("cms.steps")} (${num(lesson.steps.length)})`}</h4>
          <StepBoard lesson={lesson} lessonIndex={li} errors={errors} ops={ops} />
        </section>
        <section className="stack" aria-labelledby="ed-class-h">
          <h4 id="ed-class-h" className="ed-h4">{t("cms.classroom")}</h4>
          <div className="ed-gos">
            <GoCard icon="file" title={t("kit.slides")} body={t("cms.slidesCount", { n: num(lesson.slides.length) })} onClick={() => pick({ kind: "slides", lesson: lesson.id })} />
            <GoCard icon="print" title={t("kit.title")} body={t("cms.filesCount", { n: num(lesson.kit.length) })} onClick={() => pick({ kind: "kit", lesson: lesson.id })} />
          </div>
        </section>
        <details className="ed-more ed-fold" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
          <summary>{t("cms.moreAboutLesson")}</summary>
          <LessonMore lesson={lesson} onChange={(l) => setLesson(li, l, group)} />
        </details>
      </div>
    );
    else if (view_.kind === "step") {
      const s = lesson.steps[si];
      liveStep = s;
      const stepErrs = count((x) => x.at.lesson === li && x.at.step === si);
      detail = (
        <div className="stack-lg">
          <PaneHead icon={<StepIcon type={s.type} size={22} />} title={`${t("cms.step")} ${num(si + 1)}: ${t(STEP_LABEL[s.type])}`} sub={t("cms.ofN", { n: num(lesson.steps.length) })} />
          <div className="ed-toolbar">
            <Button size="sm" variant="secondary" icon="play" disabled={!canPreview} onClick={() => setPreview({ lesson: lesson.id, lang: view === "all" ? "en" : view, at: si })}>{t("cms.previewFrom")}</Button>
            {!live && <Button size="sm" variant="ghost" icon="play" className="ed-wide-only" aria-pressed={false}
              onClick={() => { setLive(true); try { localStorage.setItem(LIVE_KEY, "1"); } catch { /* private mode */ } }}>{t("cms.livePreview")}</Button>}
          </div>
          <div className="ed-toolbar ed-steptools">
            <span className="ed-tools">
              <Button size="sm" variant="ghost" iconOnly icon="back" disabled={si === 0} onClick={() => ops.open(lesson.steps[si - 1].id)}>{t("cms.prevStep")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="next" disabled={si === lesson.steps.length - 1} onClick={() => ops.open(lesson.steps[si + 1].id)}>{t("cms.nextStep")}</Button>
            </span>
            <span className="ed-tools ed-tools-end">
              <Button size="sm" variant="ghost" iconOnly icon="file" onClick={() => ops.duplicate(si)}>{t("cms.duplicate")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="up" disabled={si === 0} onClick={() => ops.move(si, -1)}>{t("q.up")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="down" disabled={si === lesson.steps.length - 1} onClick={() => ops.move(si, 1)}>{t("q.down")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="close" onClick={() => ops.remove(si)}>{t("cms.deleteStep")}</Button>
            </span>
          </div>
          {here((x) => x.at.lesson === li && x.at.step === si)}
          <StepForm step={s} media={media(lesson)} onChange={(ns) => setLesson(li, { ...lesson, steps: lesson.steps.map((x, k) => (k === si ? ns : x)) }, group)} />
          {stepErrs === 0 && si < lesson.steps.length - 1 && (
            <div className="ed-next">
              <Button size="sm" variant="secondary" iconEnd="next" onClick={() => ops.open(lesson.steps[si + 1].id)}>{t("cms.nextStepIs", { kind: t(STEP_LABEL[lesson.steps[si + 1].type]) })}</Button>
            </div>
          )}
        </div>
      );
    } else if (view_.kind === "add-step") detail = <StepTypes onPick={(type) => ops.insert(type, Math.min(view_.at, lesson.steps.length))} onCancel={() => pick({ kind: "lesson", lesson: lesson.id })} />;
    else if (view_.kind === "slides") detail = (
      <div className="stack-lg">
        <PaneHead icon={<Icon name="file" size={22} />} title={t("kit.slides")} sub={lessonOf(li)} />
        {here((x) => x.at.lesson === li && x.at.slide !== undefined)}
        <SlidesForm lesson={lesson} onChange={(l) => setLesson(li, l, group)} />
      </div>
    );
    else detail = (
      <div className="stack-lg">
        <PaneHead icon={<Icon name="print" size={22} />} title={t("kit.title")} sub={lessonOf(li)} />
        {here((x) => x.at.lesson === li && x.at.kit !== undefined)}
        <KitForm lesson={lesson} media={media(lesson)} onChange={(l) => setLesson(li, l, group)} />
      </div>
    );
  }

  const crumb = view_.kind === "step" ? `${t("cms.step")} ${num(si + 1)}` : view_.kind === "add-step" ? t("cms.addStep") : view_.kind === "slides" ? t("kit.slides")
    : view_.kind === "kit" ? t("kit.title") : view_.kind === "checks" ? t("cms.issues") : "";
  const toggleLang = (code: string) => setEditLangs((cur) => {
    const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    saveEditLangs(next);
    if (!next.includes(code) && view === code) translate("all");
    return next;
  });
  const shownLangs = ["en", ...editLangs.filter((c) => c !== "en")];
  const missingIn = (code: string) => issues.filter((i) => i.code === "missingLang" && i.params?.lang === code).length;
  const showLive = live && !!liveStep && !!lesson;
  const time = savedAt ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(savedAt) : "";
  const saveState = busy === "save" ? t("cms.saving") : saveErr ? t("cms.notSaved") : dirty ? t("cms.unsaved") : time ? t("cms.savedAt", { time }) : t("cms.allSaved");

  return (
    <EditLangsProvider langs={editLangs} view={view}>
      <AppBar title={L(unit.title) || t("cms.untitled")} onBack={() => { void go(base); }} backLabel={t("common.back")}
        actions={<span className={`ed-status is-${status}`}>{t(`cms.status.${status}` as MessageKey, { n: meta.published?.version ?? 0 })}</span>} />
      <main className="screen wide ed">
        {shownLangs.length > 1 && (
          <div className="ed-head" role="group" aria-label={t("cms.view")}>
            <span className="dr-field-label">{t("cms.view")}</span>
            <button type="button" className={`ed-chip${view === "all" ? " is-on" : ""}`} aria-pressed={view === "all"} onClick={() => translate("all")}>{t("cms.view.all")}</button>
            {shownLangs.map((code) => {
              const n = code === "en" ? 0 : missingIn(code);
              return (
                <button key={code} type="button" className={`ed-chip${view === code ? " is-on" : ""}`} aria-pressed={view === code} onClick={() => translate(code)}>
                  <LangName name={languageOf(code).native} code={code} />{n > 0 && <span className="ed-chip-n" aria-label={t("cms.toTranslate", { n: num(n) })}>{num(n)}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className={`ed-split is-${pane}${showLive ? " has-live" : ""}`}>
          <Outline unit={unit} view={view_} errors={errors} editLangs={editLangs} pick={pick} onInsertLesson={lessonOps.insert}
            onMoveLesson={lessonOps.move} onMoveStep={(l, from, to) => stepOps(l, unit.lessons[l]).moveTo(from, to)} onToggleLang={toggleLang} />

          <section id="ed-detail" className="ed-detail" aria-label={t("cms.editing")}>
            <nav className="ed-crumbs" aria-label={t("cms.where")}>
              <Button size="sm" variant="ghost" icon="back" className="ed-to-outline" onClick={() => { setPane("outline"); if (showLive) setLive(false); }}>{t("cms.outline")}</Button>
              <ol>
                <li><button type="button" onClick={() => pick({ kind: "unit" })}>{L(unit.title) || t("cms.untitled")}</button></li>
                {lesson && <li><Icon name="next" size={16} /><button type="button" onClick={() => pick({ kind: "lesson", lesson: lesson.id })}>{t("common.lessonN", { n: li + 1 })}</button></li>}
                {crumb && <li aria-current="page"><Icon name="next" size={16} /><span>{crumb}</span></li>}
              </ol>
            </nav>
            <div key={hist.version} className="panel">{detail}</div>
          </section>

          {showLive && <LivePreview Player={Player} unit={unit} lesson={lesson!} step={liveStep!} lang={view === "all" ? "en" : view}
            blocked={count((x) => x.at.lesson === li && x.at.step === si) > 0} onClose={() => { setLive(false); try { localStorage.setItem(LIVE_KEY, "0"); } catch { /* private mode */ } }} />}
        </div>
      </main>

      <div className="ed-bar">
        <span className="ed-toolbar">
          <Button variant="ghost" iconOnly icon="undo" disabled={!hist.canUndo} onClick={hist.undo} title={`${t("cms.undo")} (Ctrl+Z)`}>{t("cms.undo")}</Button>
          <Button variant="ghost" iconOnly icon="redo" disabled={!hist.canRedo} onClick={hist.redo} title={`${t("cms.redo")} (Ctrl+Y)`}>{t("cms.redo")}</Button>
        </span>
        <span className={`ed-save${saveErr ? " is-error" : ""}`} title={t("cms.autosaveHint")}>{saveState}</span>
        <span className="ed-bar-end">
          {dirty && <Button size="sm" loading={busy === "save"} disabled={!!busy && busy !== "save"} variant="secondary" icon="check" title="Ctrl+S" onClick={() => { void save(); }}>{t("cms.save")}</Button>}
          {errors.length > 0
            ? <Button variant="secondary" icon="warning" onClick={() => pick({ kind: "checks" })}>{t("cms.fixFirst", { n: errors.length })}</Button>
            : <Button loading={busy === "publish"} disabled={!!busy} icon="share" onClick={() => { void publish(); }}>{t("cms.publish")}</Button>}
        </span>
        {msg && (
          <div className={msg.ok ? "notice ok ed-confirm" : "notice err ed-confirm"} role={msg.ok ? "status" : "alert"}>
            <span>{msg.text}</span>
            {msg.undo && <Button size="sm" variant="secondary" onClick={() => { hist.undo(); setMsg(null); }}>{t("cms.undo")}</Button>}
            {msg.open && <Button size="sm" variant="secondary" onClick={() => { void go(`${base}/${msg.open}`); }}>{t("cms.open")}</Button>}
            <Button size="sm" variant="ghost" iconOnly icon="close" onClick={() => setMsg(null)}>{t("common.close")}</Button>
          </div>
        )}
        {ask === "delete" && <Confirm text={t("cms.deleteConfirm", { title: L(unit.title) || unit.id })}>
          <Button size="sm" autoFocus onClick={() => { void remove(); }}>{t("cms.confirmDelete")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("common.cancel")}</Button></Confirm>}
        {ask === "unpublish" && <Confirm text={t("cms.unpublishConfirm")}>
          <Button size="sm" autoFocus onClick={() => { void unpublish(); }}>{t("cms.unpublish")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("common.cancel")}</Button></Confirm>}
        {typeof ask === "object" && <Confirm text={t("cms.leaveConfirm")}>
          <Button size="sm" autoFocus loading={busy === "save"} onClick={async () => { if (await save()) nav(ask.leave); }}>{t("cms.saveLeave")}</Button>
          <Button size="sm" variant="secondary" onClick={() => { setSaved(JSON.stringify(unit)); nav(ask.leave); }}>{t("cms.leaveAnyway")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("cms.stay")}</Button></Confirm>}
      </div>

      {preview && unit.lessons.find((l) => l.id === preview.lesson) && <Preview Player={Player} unit={unit} lesson={unit.lessons.find((l) => l.id === preview.lesson)!}
        lang={preview.lang} at={preview.at} onLang={(lang) => setPreview({ ...preview, lang })} onExit={() => setPreview(null)} />}
    </EditLangsProvider>
  );
}

function Confirm({ text, children }: { text: string; children: ReactNode }) {
  return <div className="notice ed-confirm" role="alert"><span>{text}</span>{children}</div>;
}

/** Shows `fallback` instead of a preview that throws (a half-written step can be any shape). */
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * The step being edited, played as learners will see it, in a phone-sized frame beside the form (from 900 px). It
 * starts again a moment after each change. The frame contains the player's fixed bars (it is their containing block).
 */
function LivePreview({ Player, unit, lesson, step, lang, blocked, onClose }: { Player: Player; unit: Unit; lesson: Lesson; step: Step; lang: string; blocked: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const languages = useLanguages();
  const [shownLang, setShownLang] = useState(lang);
  useEffect(() => setShownLang(lang), [lang]);
  usePack(shownLang);
  const [shown, setShown] = useState(step);
  useEffect(() => { const id = setTimeout(() => setShown(step), 400); return () => clearTimeout(id); }, [step]);
  const one = useMemo(() => ({ ...lesson, steps: [shown] }), [lesson, shown]);
  const key = `${JSON.stringify(shown)}-${shownLang}`;
  const noop = useCallback(() => {}, []);
  return (
    <aside className="ed-live" aria-label={t("cms.livePreview")}>
      <div className="ed-live-head">
        <strong>{t("cms.livePreview")}</strong>
        <span className="row-gap">
          {languages.length > 1 && languages.map((l) => (
            <button key={l.code} type="button" className={`ed-chip${l.code === shownLang ? " is-on" : ""}`} aria-pressed={l.code === shownLang} onClick={() => setShownLang(l.code)}>
              <LangName name={l.native} code={l.code} /></button>
          ))}
          <Button size="sm" variant="ghost" iconOnly icon="close" onClick={onClose}>{t("cms.hidePreview")}</Button>
        </span>
      </div>
      <div className="ed-live-frame">
        <div className="ed-live-scroll">
          {blocked ? <p className="ed-live-note">{t("cms.liveBlocked")}</p> : (
            <Guard key={key} fallback={<p className="ed-live-note">{t("cms.liveBlocked")}</p>}>
              <I18nProvider lang={shownLang}>
                <div dir={languageOf(shownLang).dir} lang={shownLang}>
                  <Player key={key} unitId={unit.id} lesson={one} track={unit.track} preview={{ onExit: noop }} />
                </div>
              </I18nProvider>
            </Guard>
          )}
        </div>
      </div>
      <p className="muted small">{t("cms.liveHint")}</p>
    </aside>
  );
}

/** The lesson as learners will play it, from the unsaved draft: nothing is recorded, submitted or synced. Any step can be opened. */
function Preview({ Player, unit, lesson, lang, at, onLang, onExit }: { Player: Player; unit: Unit; lesson: Lesson; lang: string; at: number; onLang: (l: string) => void; onExit: () => void }) {
  const { t } = useI18n();
  const languages = useLanguages();
  usePack(lang); // an added language's interface strings, for the preview's buttons and labels
  const dir = languageOf(lang).dir;
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && onExit(); addEventListener("keydown", esc); return () => removeEventListener("keydown", esc); }, [onExit]);
  return (
    <div className="ed-preview" role="dialog" aria-modal="true" aria-label={t("cms.preview")}>
      <div className="ed-preview-bar">
        <strong>{t("cms.preview")}</strong>
        <span className="row-gap">
          {languages.map((l) => <Button key={l.code} size="sm" variant={l.code === lang ? "primary" : "ghost"} onClick={() => onLang(l.code)}><LangName name={l.native} code={l.code} /></Button>)}
          <Button size="sm" variant="secondary" icon="close" onClick={onExit}>{t("common.close")}</Button>
        </span>
      </div>
      <I18nProvider lang={lang}>
        <div dir={dir} lang={lang} className="ed-preview-body">
          <Player key={`${lesson.id}-${lang}`} unitId={unit.id} lesson={lesson} track={unit.track} preview={{ onExit }} explore={{ at }} />
        </div>
      </I18nProvider>
    </div>
  );
}
