import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { COMPETENCIES } from "../content/competencies";
import { usePack, useTracks } from "../content/settings";
import { levelsByTrack } from "../content/tracks";
import { labMeta } from "../labs/catalog";
import { audienceOf, type KitFile, type KitFormat, type Lesson, type Slide, type Step, type Unit } from "../content/types";
import { errorsOf, SLIDE_LAYOUTS, validateUnit, type Issue } from "../content/validate";
import { I18nProvider, isolate, languageOf, useI18n, useLanguages, type MessageKey } from "../i18n";
import type { LessonPlayer } from "../screens/LessonScreen";
/** The lesson player, passed in by App (importing it here would split the startup bundle: see App.tsx). */
type Player = typeof LessonPlayer;
import { cmsApi, issuesOf } from "./api";
import { copyLessonTo, createUnit, getUnit, listUnits, saveUnit, statusOf, type UnitMeta } from "./data";
import { Items, LangName, LList, LText, Num, Sel, Upload } from "./fields";
import { EditLangsProvider, langsIn, savedEditLangs, saveEditLangs, useEditLangs } from "./langs";
import { useHistory, useUndoKeys } from "./history";
import { blankLesson, blankStep, copyLesson, copyStep, copyTitle, newLessonId, newStepId, withNewIds } from "./ids";
import { AudiencePicker, LevelPicker, TrackPicker } from "./pickers";
import { STEP_LABEL, STEP_MENU, StepForm, type MediaCtx } from "./steps";
import "../styles/editor.css";
import "./strings";

const CODES = new Set(COMPETENCIES.map((c) => c.code));
/** The shared validator only checks a lab id's shape; here we also know the Labs catalogue. */
const unknownLabs = (u: Unit): Issue[] => u.lessons.flatMap((l, lesson) => l.steps.flatMap((s, step) =>
  s.type === "lab" && !labMeta(s.tool) ? [{ at: { lesson, step, field: "tool" }, code: "badValue" as const, level: "error" as const, params: { value: s.tool } }] : []));
const LT = () => ({ en: "", ar: "" });

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

/**
 * /super/content/:unitId and /admin/content/:unitId. An outline of the unit (details, lessons, the open lesson's steps,
 * slides and kit, checks) beside the form for what's picked; on phones, one then the other. Edits stay in memory until
 * "Save draft" (no autosave timer), with undo for the last 50 changes. "Publish" saves, then asks the publishUnit
 * function to check the draft and put it live.
 */
export function UnitEditor({ Player }: { Player: Player }) {
  const { unitId = "" } = useParams();
  const nav = useNavigate();
  const { t, L, num } = useI18n();
  const tracks = useTracks();
  const { user, role } = useAuth();
  const base = role === "superadmin" ? "/super/content" : "/admin/content";
  const [meta, setMeta] = useState<UnitMeta | null>(null);
  const hist = useHistory<Unit | null>(null);
  const unit = hist.value;
  const [saved, setSaved] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "delete" | "copy">("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [ask, setAsk] = useState<Ask>("");
  const [sel, setSel] = useState<Sel>({ kind: "unit" });
  const [pane, setPane] = useState<"outline" | "detail">("outline");
  const [preview, setPreview] = useState<{ lesson: string; lang: string } | null>(null);
  const [editLangs, setEditLangs] = useState<string[]>(savedEditLangs);
  const languages = useLanguages();

  useEffect(() => {
    setMeta(null); setLoadErr(""); setMsg(null); setAsk(""); setSel({ kind: "unit" }); setPane("outline");
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
  // Bring the form into view when something far down the outline is picked.
  useEffect(() => { const el = document.getElementById("ed-detail"); if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" }); }, [sel, pane]);

  // Checking runs on a deferred copy, so typing stays smooth on a slow laptop.
  const checked = useDeferredValue(unit);
  const issues = useMemo(() => (checked ? [...validateUnit(checked, { competencies: CODES, tracks: levelsByTrack(tracks.all), langs: editLangs }), ...unknownLabs(checked)] : []), [checked, tracks.all, editLangs]);
  const errors = errorsOf(issues);

  if (loadErr) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={loadErr} action={<Button size="sm" onClick={() => nav(base)}>{t("common.back")}</Button>} /></main>;
  if (!unit || !meta) return <div className="loading" aria-busy="true" />;

  // A selection that undo or a delete took away falls back to its lesson, then to the unit.
  const li = "lesson" in sel ? unit.lessons.findIndex((l) => l.id === sel.lesson) : -1;
  const lesson = li >= 0 ? unit.lessons[li] : undefined;
  const si = sel.kind === "step" && lesson ? lesson.steps.findIndex((s) => s.id === sel.step) : -1;
  const view: Sel = !("lesson" in sel) ? sel : !lesson ? { kind: "unit" } : sel.kind === "step" && si < 0 ? { kind: "lesson", lesson: lesson.id } : sel;
  const status = statusOf(meta);
  const media = (l: Lesson): MediaCtx => ({ owner: meta.owner, unitId: unit.id, lessonId: l.id });

  const pick = (s: Sel) => { setSel(s); setPane("detail"); };
  /** One change. Typing in the same item merges into one undo step; anything else is its own. */
  const edit = (u: Unit, group?: string) => { hist.set(u, group); setMsg(null); setAsk((a) => (a === "delete" || a === "unpublish" ? "" : a)); };
  const typing = (u: Unit) => edit(u, JSON.stringify(view));
  const withLessons = (ls: Lesson[]) => ({ ...unit, lessons: ls });
  const setLesson = (i: number, l: Lesson, group?: string) => edit(withLessons(unit.lessons.map((x, k) => (k === i ? l : x))), group);
  const swap = <T,>(xs: T[], i: number, j: number) => { const n = [...xs]; [n[i], n[j]] = [n[j], n[i]]; return n; };

  const lessonOps = {
    insert: (at: number) => { const l = blankLesson(newLessonId(unit)); const ls = [...unit.lessons]; ls.splice(at, 0, l); edit(withLessons(ls)); pick({ kind: "lesson", lesson: l.id }); },
    duplicate: (i: number) => {
      const c = { ...copyLesson(unit.lessons[i], unit), title: copyTitle(unit.lessons[i].title) };
      const ls = [...unit.lessons]; ls.splice(i + 1, 0, c); edit(withLessons(ls)); pick({ kind: "lesson", lesson: c.id });
    },
    move: (i: number, d: -1 | 1) => edit(withLessons(swap(unit.lessons, i, i + d))),
    remove: (i: number) => { edit(withLessons(unit.lessons.filter((_, k) => k !== i))); setSel({ kind: "unit" }); setMsg({ ok: true, text: t("cms.deletedLesson"), undo: true }); },
  };
  const stepOps = (i: number, l: Lesson) => {
    const setSteps = (steps: Step[]) => setLesson(i, { ...l, steps });
    return {
      insert: (type: Step["type"], at: number) => { const s = blankStep(type, newStepId(l, type)); const st = [...l.steps]; st.splice(at, 0, s); setSteps(st); pick({ kind: "step", lesson: l.id, step: s.id }); },
      duplicate: (k: number) => { const c = copyStep(l.steps[k], l); const st = [...l.steps]; st.splice(k + 1, 0, c); setSteps(st); pick({ kind: "step", lesson: l.id, step: c.id }); },
      move: (k: number, d: -1 | 1) => setSteps(swap(l.steps, k, k + d)),
      remove: (k: number) => { setSteps(l.steps.filter((_, j) => j !== k)); setSel({ kind: "lesson", lesson: l.id }); setMsg({ ok: true, text: t("cms.deletedStep"), undo: true }); },
    };
  };

  const save = async (): Promise<boolean> => {
    if (!user) return false;
    setBusy("save"); setMsg(null);
    try {
      const r = await saveUnit(unit, meta.rev, user.uid);
      if ("conflict" in r) { setMsg({ ok: false, text: t("cms.conflict") }); return false; }
      setMeta({ ...meta, rev: r.rev, title: unit.title, track: unit.track, level: unit.level, lessonCount: unit.lessons.length });
      setSaved(JSON.stringify(unit)); setMsg({ ok: true, text: t("cms.saved") });
      return true;
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
    finally { setBusy(""); }
  };
  const publish = async () => {
    if (dirty && !(await save())) return;
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
  const go = (path: string) => (dirty ? setAsk({ leave: path }) : nav(path));

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

  let detail: ReactNode;
  if (view.kind === "unit") detail = (
    <div className="stack-lg">
      <h3 className="ed-h4">{t("cms.unitDetails")}</h3>
      <LText label={t("cms.title")} value={unit.title} onChange={(title) => typing({ ...unit, title })} />
      <LText label={t("cms.summary")} value={unit.summary} onChange={(summary) => typing({ ...unit, summary })} multiline rows={2} />
      <TrackPicker value={unit.track} onChange={(track) => edit({ ...unit, track, level: Math.min(unit.level, tracks.of(track).levels) })} />
      <LevelPicker track={unit.track} value={unit.level} onChange={(level) => edit({ ...unit, level })} />
      <AudiencePicker value={audienceOf(unit)} onChange={(a) => edit({ ...unit, audience: a === "students" ? a : undefined })} />
      <p className="muted small" dir="ltr"><span className="cap-code">{unit.id}</span></p>
      <div className="stack">
        <h4 className="ed-h4">{t("cms.unitActions")}</h4>
        <div className="ed-toolbar">
          <Button size="sm" variant="secondary" icon="file" loading={busy === "copy"} disabled={!!busy} onClick={() => { void duplicate(); }}>{t("cms.duplicateUnit")}</Button>
          <Button size="sm" variant="ghost" icon="share" onClick={() => download(`${unit.id}.json`, JSON.stringify(unit, null, 1))}>{t("cms.export")}</Button>
          {meta.published && <Button size="sm" variant="ghost" loading={busy === "unpublish"} disabled={!!busy} onClick={() => setAsk("unpublish")}>{t("cms.unpublish")}</Button>}
          <Button size="sm" variant="ghost" icon="close" loading={busy === "delete"} disabled={!!busy} onClick={() => setAsk("delete")}>{t("cms.delete")}</Button>
        </div>
      </div>
    </div>
  );
  else if (view.kind === "checks") detail = <IssuesPanel issues={issues} unit={unit} onJump={jump} />;
  else if (lesson) {
    const ops = stepOps(li, lesson);
    if (view.kind === "lesson") detail = (
      <LessonDetail lesson={lesson} index={li} count={unit.lessons.length} onChange={(l) => setLesson(li, l, JSON.stringify(view))}
        canPreview={count((x) => x.at.lesson === li) === 0} onPreview={(lang) => setPreview({ lesson: lesson.id, lang })}
        onDuplicate={() => lessonOps.duplicate(li)} onMove={(d) => lessonOps.move(li, d)} onRemove={() => lessonOps.remove(li)}
        copyTo={<CopyTo owner={meta.owner} unitId={unit.id} lesson={lesson} onDone={(text) => setMsg({ ok: true, text })} />} />
    );
    else if (view.kind === "step") {
      const s = lesson.steps[si];
      detail = (
        <div className="stack-lg">
          <h3 className="ed-h4">{`${t("cms.step")} ${num(si + 1)}: ${t(STEP_LABEL[s.type])}`}</h3>
          <div className="ed-toolbar">
            <Button size="sm" variant="ghost" icon="file" onClick={() => ops.duplicate(si)}>{t("cms.duplicate")}</Button>
            <Button size="sm" variant="ghost" icon="up" disabled={si === 0} onClick={() => ops.move(si, -1)}>{t("q.up")}</Button>
            <Button size="sm" variant="ghost" icon="down" disabled={si === lesson.steps.length - 1} onClick={() => ops.move(si, 1)}>{t("q.down")}</Button>
            <Button size="sm" variant="ghost" icon="close" onClick={() => ops.remove(si)}>{t("cms.deleteStep")}</Button>
          </div>
          <StepForm step={s} media={media(lesson)} onChange={(ns) => setLesson(li, { ...lesson, steps: lesson.steps.map((x, k) => (k === si ? ns : x)) }, JSON.stringify(view))} />
        </div>
      );
    } else if (view.kind === "add-step") detail = <StepTypes onPick={(type) => ops.insert(type, Math.min(view.at, lesson.steps.length))} />;
    else if (view.kind === "slides") detail = <SlidesForm lesson={lesson} onChange={(l) => setLesson(li, l, JSON.stringify(view))} />;
    else detail = <KitForm lesson={lesson} media={media(lesson)} onChange={(l) => setLesson(li, l, JSON.stringify(view))} />;
  }

  const here = (s: Sel) => JSON.stringify(s) === JSON.stringify(view);
  const crumb = view.kind === "step" ? `${t("cms.step")} ${num(si + 1)}` : view.kind === "add-step" ? t("cms.addStep") : view.kind === "slides" ? t("kit.slides")
    : view.kind === "kit" ? t("kit.title") : view.kind === "checks" ? t("cms.issues") : "";

  const toggleLang = (code: string) => setEditLangs((cur) => { const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]; saveEditLangs(next); return next; });
  const langChoices = [...new Set([...languages.map((l) => l.code), ...editLangs])];

  return (
    <EditLangsProvider langs={editLangs}>
      <AppBar title={L(unit.title) || t("cms.untitled")} onBack={() => go(base)} backLabel={t("common.back")}
        actions={<span className={`ed-status is-${status}`}>{t(`cms.status.${status}` as MessageKey, { n: meta.published?.version ?? 0 })}</span>} />
      <main className="screen wide ed">
        <div className={`ed-split is-${pane}`}>
          <nav className="ed-outline" aria-label={t("cms.outline")}>
            <Node on={here({ kind: "unit" })} badge={count((x) => x.at.lesson === undefined)} onClick={() => pick({ kind: "unit" })}><Icon name="settings" size={18} />{t("cms.unitDetails")}</Node>
            <h4 className="ed-outline-h">{t("cms.lessons")}</h4>
            <ol className="ed-tree">
              {unit.lessons.map((l, i) => {
                const open = lesson?.id === l.id;
                return (
                  <li key={l.id}>
                    <Insert label={t("cms.insertLesson")} onClick={() => lessonOps.insert(i)} />
                    <Node on={here({ kind: "lesson", lesson: l.id })} open={open} badge={count((x) => x.at.lesson === i)} onClick={() => pick({ kind: "lesson", lesson: l.id })}>
                      <span className="cap-code" dir="ltr">{num(i + 1)}</span><span>{L(l.title) || t("cms.untitled")}</span>
                    </Node>
                    {open && (
                      <ol className="ed-tree ed-tree-sub">
                        {l.steps.map((s, k) => (
                          <li key={`${s.id}-${k}`}>
                            <Insert label={t("cms.insertStep")} onClick={() => pick({ kind: "add-step", lesson: l.id, at: k })} />
                            <Node on={here({ kind: "step", lesson: l.id, step: s.id })} badge={count((x) => x.at.lesson === i && x.at.step === k)} onClick={() => pick({ kind: "step", lesson: l.id, step: s.id })}>
                              <span className="cap-code" dir="ltr">{num(k + 1)}</span><span><strong>{t(STEP_LABEL[s.type])}</strong> <span className="muted">{L(s.prompt)}</span></span>
                            </Node>
                          </li>
                        ))}
                        <li><Node on={here({ kind: "add-step", lesson: l.id, at: l.steps.length })} onClick={() => pick({ kind: "add-step", lesson: l.id, at: l.steps.length })}><Icon name="edit" size={18} />{t("cms.addStep")}</Node></li>
                        <li><Node on={here({ kind: "slides", lesson: l.id })} badge={count((x) => x.at.lesson === i && x.at.slide !== undefined)} onClick={() => pick({ kind: "slides", lesson: l.id })}>
                          <Icon name="file" size={18} />{`${t("kit.slides")} (${num(l.slides.length)})`}</Node></li>
                        <li><Node on={here({ kind: "kit", lesson: l.id })} badge={count((x) => x.at.lesson === i && x.at.kit !== undefined)} onClick={() => pick({ kind: "kit", lesson: l.id })}>
                          <Icon name="print" size={18} />{`${t("kit.title")} (${num(l.kit.length)})`}</Node></li>
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button size="sm" variant="secondary" onClick={() => lessonOps.insert(unit.lessons.length)}>{t("cms.addLesson")}</Button>
            <Node on={here({ kind: "checks" })} badge={errors.length} onClick={() => pick({ kind: "checks" })}><Icon name={errors.length ? "warning" : "check"} size={18} />{t("cms.issues")}</Node>
            <fieldset className="ed-fieldset">
              <legend className="ed-outline-h">{t("cms.langs")}</legend>
              <div className="ed-filter">
                {langChoices.map((code) => {
                  const on = code === "en" || editLangs.includes(code);
                  return <button key={code} type="button" className={`ed-chip${on ? " is-on" : ""}`} aria-pressed={on} disabled={code === "en"} onClick={() => toggleLang(code)}>
                    <LangName name={languageOf(code).native} code={code} /></button>;
                })}
              </div>
              <p className="muted small">{t("cms.langsHint")}</p>
            </fieldset>
          </nav>

          <section id="ed-detail" className="ed-detail" aria-label={t("cms.editing")}>
            <nav className="ed-crumbs" aria-label={t("cms.where")}>
              <Button size="sm" variant="ghost" icon="back" className="ed-to-outline" onClick={() => setPane("outline")}>{t("cms.outline")}</Button>
              <ol>
                <li><button type="button" onClick={() => pick({ kind: "unit" })}>{L(unit.title) || t("cms.untitled")}</button></li>
                {lesson && <li><Icon name="next" size={16} /><button type="button" onClick={() => pick({ kind: "lesson", lesson: lesson.id })}>{t("common.lessonN", { n: li + 1 })}</button></li>}
                {crumb && <li aria-current="page"><Icon name="next" size={16} /><span>{crumb}</span></li>}
              </ol>
            </nav>
            <div key={hist.version} className="panel">{detail}</div>
          </section>
        </div>
      </main>

      <div className="ed-bar">
        <span className="ed-toolbar">
          <Button variant="ghost" iconOnly icon="undo" disabled={!hist.canUndo} onClick={hist.undo} title={`${t("cms.undo")} (Ctrl+Z)`}>{t("cms.undo")}</Button>
          <Button variant="ghost" iconOnly icon="redo" disabled={!hist.canRedo} onClick={hist.redo} title={`${t("cms.redo")} (Ctrl+Y)`}>{t("cms.redo")}</Button>
        </span>
        <Button loading={busy === "save"} disabled={!!busy && busy !== "save"} variant={dirty ? "primary" : "secondary"} icon="check" onClick={() => { void save(); }}>{dirty ? t("cms.save") : t("cms.savedShort")}</Button>
        <Button loading={busy === "publish"} disabled={!!busy || errors.length > 0} variant={dirty ? "secondary" : "primary"} icon="share" onClick={() => { void publish(); }}>{t("cms.publish")}</Button>
        {errors.length > 0 && <button type="button" className="ed-link err-text" onClick={() => pick({ kind: "checks" })}>{t("cms.fixFirst", { n: errors.length })}</button>}
        {msg && (
          <div className={msg.ok ? "notice ok ed-confirm" : "notice err ed-confirm"} role={msg.ok ? "status" : "alert"}>
            <span>{msg.text}</span>
            {msg.undo && <Button size="sm" variant="secondary" onClick={() => { hist.undo(); setMsg(null); }}>{t("cms.undo")}</Button>}
            {msg.open && <Button size="sm" variant="secondary" onClick={() => go(`${base}/${msg.open}`)}>{t("cms.open")}</Button>}
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
        lang={preview.lang} onLang={(lang) => setPreview({ ...preview, lang })} onExit={() => setPreview(null)} />}
    </EditLangsProvider>
  );
}

/** One line of the outline. */
function Node({ on, open, badge = 0, onClick, children }: { on: boolean; open?: boolean; badge?: number; onClick: () => void; children: ReactNode }) {
  const { num } = useI18n();
  return (
    <button type="button" className={`ed-node${on ? " is-on" : ""}`} aria-current={on ? "true" : undefined} aria-expanded={open} onClick={onClick}>
      {children}{badge > 0 && <span className="ed-badge">{num(badge)}</span>}
    </button>
  );
}

/** "+" between two items of the outline: add one right here. */
function Insert({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="ed-insert" aria-label={label} title={label} onClick={onClick}><span aria-hidden>+</span></button>;
}

function Confirm({ text, children }: { text: string; children: ReactNode }) {
  return <div className="notice ed-confirm" role="alert"><span>{text}</span>{children}</div>;
}

function LessonDetail({ lesson: l, index, count, onChange, canPreview, onPreview, onDuplicate, onMove, onRemove, copyTo }: {
  lesson: Lesson; index: number; count: number; onChange: (l: Lesson) => void; canPreview: boolean; onPreview: (lang: string) => void;
  onDuplicate: () => void; onMove: (d: -1 | 1) => void; onRemove: () => void; copyTo: ReactNode;
}) {
  const { t, L, num, lang } = useI18n();
  const [copying, setCopying] = useState(false);
  const comps = l.competencies ?? [];
  return (
    <div className="stack-lg">
      <h3 className="ed-h4">{t("common.lessonN", { n: index + 1 })}</h3>
      <div className="ed-toolbar">
        <Button size="sm" variant="secondary" icon="play" disabled={!canPreview || !l.steps.length} onClick={() => onPreview(lang)}>{t("cms.preview")}</Button>
        <Button size="sm" variant="ghost" icon="file" onClick={onDuplicate}>{t("cms.duplicate")}</Button>
        <Button size="sm" variant="ghost" icon="share" aria-expanded={copying} onClick={() => setCopying(!copying)}>{t("cms.copyTo")}</Button>
        <Button size="sm" variant="ghost" icon="up" disabled={index === 0} onClick={() => onMove(-1)}>{t("q.up")}</Button>
        <Button size="sm" variant="ghost" icon="down" disabled={index === count - 1} onClick={() => onMove(1)}>{t("q.down")}</Button>
        <Button size="sm" variant="ghost" icon="close" disabled={count <= 1} onClick={onRemove}>{t("cms.deleteLesson")}</Button>
      </div>
      {!canPreview && <p className="muted small">{t("cms.previewBlocked")}</p>}
      {copying && copyTo}
      <LText label={t("cms.title")} value={l.title} onChange={(title) => onChange({ ...l, title })} />
      <div className="form-grid"><Num label={t("cms.minutes")} min={1} max={60} value={l.minutes} onChange={(minutes) => onChange({ ...l, minutes })} /></div>
      <LText label={t("lesson.try")} hint={t("cms.tryHint")} value={l.tryTomorrow} onChange={(tryTomorrow) => onChange({ ...l, tryTomorrow })} multiline rows={2} />
      <LList label={t("cms.materials")} hint={t("cms.materialsHint")} value={l.materials} rows={3}
        onChange={(materials) => onChange({ ...l, materials: materials.en.length || Object.values(materials).some((v) => v?.length) ? materials : undefined })} />
      <div className="stack-sm">
        <span className="dr-field-label">{t("p.capabilities")}</span>
        <div className="row-gap">
          {comps.map((c) => <span key={c} className="pill"><span className="cap-code" dir="ltr">{c}</span>
            <Button size="sm" variant="ghost" iconOnly icon="close" onClick={() => onChange({ ...l, competencies: comps.filter((x) => x !== c) })}>{t("cms.remove")}</Button></span>)}
        </div>
        <select className="dr-field-input" aria-label={t("cms.addCompetency")} value="" onChange={(e) => e.target.value && onChange({ ...l, competencies: [...comps, e.target.value] })}>
          <option value="">{t("cms.addCompetency")}</option>
          {COMPETENCIES.filter((c) => !comps.includes(c.code)).map((c) => <option key={c.code} value={c.code}>{`${c.code}: ${L(c.label)}${c.level ? ` — ${L(c.level)}` : ""}`}</option>)}
        </select>
      </div>
      <p className="muted small">{[t("cms.stepsCount", { n: num(l.steps.length) }), t("cms.slidesCount", { n: num(l.slides.length) })].join(t("common.sep"))}</p>
    </div>
  );
}

/** Copy the lesson into another unit of the same owner (saved there at once, as a normal draft save). */
function CopyTo({ owner, unitId, lesson, onDone }: { owner: string; unitId: string; lesson: Lesson; onDone: (text: string) => void }) {
  const { t, L } = useI18n();
  const tracks = useTracks();
  const { user } = useAuth();
  const [units, setUnits] = useState<UnitMeta[] | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    listUnits(owner).then((u) => { const others = u.filter((x) => x.id !== unitId); setUnits(others); setTarget(others[0]?.id ?? ""); }).catch((e: Error) => setErr(e.message));
  }, [owner, unitId]);
  const copy = async () => {
    if (!user || !target) return;
    setBusy(true); setErr("");
    try {
      const r = await copyLessonTo(target, lesson, user.uid);
      if (!r) setErr(t("err.notFound"));
      else if ("conflict" in r) setErr(t("cms.copyConflict"));
      else onDone(t("cms.copied", { title: L(r.title) || t("cms.untitled") }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="ed-item stack">
      {!units ? (err ? null : <div className="loading" aria-busy="true" />) : !units.length ? <p className="muted">{t("cms.copyNone")}</p> : (
        <>
          <Sel label={t("cms.copyToPick")} value={target} onChange={setTarget}
            options={units.map((u) => [u.id, `${L(u.title) || t("cms.untitled")} (${tracks.name(u.track)}${t("common.sep")}${tracks.levelName(u.track, u.level)})`] as const)} />
          <p className="muted small">{t("cms.copyHint")}</p>
          <div className="row-gap"><Button size="sm" loading={busy} onClick={() => { void copy(); }}>{t("cms.copyGo")}</Button></div>
        </>
      )}
      {err && <p className="err-text" role="alert">{err}</p>}
    </div>
  );
}

/** "Add a step": every kind, with what it's for. */
function StepTypes({ onPick }: { onPick: (type: Step["type"]) => void }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <h3 className="ed-h4">{t("cms.chooseStep")}</h3>
      <div className="ed-types">
        {STEP_MENU.map((type) => (
          <button key={type} type="button" className="ed-type" onClick={() => onPick(type)}>
            <strong>{t(STEP_LABEL[type])}</strong><span>{t(`cms.stepHint.${type}` as MessageKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlidesForm({ lesson: l, onChange }: { lesson: Lesson; onChange: (l: Lesson) => void }) {
  const { t, num } = useI18n();
  return (
    <div className="stack">
      <h3 className="ed-h4">{t("kit.slides")}</h3>
      <p className="muted small">{t("cms.slidesHint")}</p>
      <Items<Slide> items={l.slides} itemLabel={(i, s) => `${num(i + 1)}: ${t(`cms.layout.${s.layout}` as MessageKey)}`} addLabel={t("cms.addSlide")} onChange={(slides) => onChange({ ...l, slides })}
        add={() => ({ layout: l.slides.length ? "bullets" : "title", title: LT() })}
        render={(s, set) => (
          <div className="stack">
            <Sel label={t("cms.layout")} value={s.layout} onChange={(layout) => set({ ...s, layout })} options={SLIDE_LAYOUTS.map((x) => [x, t(`cms.layout.${x}` as MessageKey)] as const)} />
            <LText label={t("cms.title")} value={s.title} onChange={(title) => set({ ...s, title })} />
            <LList label={t("cms.bullets")} hint={t("cms.onePerLine")} value={s.bullets} onChange={(bullets) => set({ ...s, bullets })} rows={3} />
            {(s.layout === "activity" || s.details) && <LList label={t("cms.details")} hint={t("cms.detailsHint")} value={s.details} rows={5}
              onChange={(details) => set({ ...s, details: Object.values(details).some((v) => v?.length) ? details : undefined })} />}
            <LText label={t("cms.note")} value={s.note} onChange={(note) => set({ ...s, note })} multiline rows={2} />
            <LText label={t("cms.narration")} hint={t("cms.narrationHint")} value={s.narration} onChange={(narration) => set({ ...s, narration })} multiline rows={2} />
          </div>
        )} />
    </div>
  );
}

const KIT_FORMATS: Record<"slides" | "lesson-plan", KitFormat[]> = { slides: ["pdf", "pptx"], "lesson-plan": ["pdf"] };

/** Classroom kit files: uploaded per language and format. Built-in kits (from an imported unit) are kept as they are. */
function KitForm({ lesson: l, onChange, media }: { lesson: Lesson; onChange: (l: Lesson) => void; media: MediaCtx }) {
  const { t } = useI18n();
  const langs = useEditLangs();
  const add = (kind: "slides" | "lesson-plan") => onChange({ ...l, kit: [...l.kit, {
    kind, pages: 1, formats: KIT_FORMATS[kind], urls: {},
    title: kind === "slides" ? { en: "Slides", ar: "شرائح" } : { en: "Lesson plan", ar: "خطة الدرس" },
  }] });
  const setUrl = (k: KitFile, i: number, lang: string, fmt: KitFormat, url: string | null) => {
    const byLang = { ...(k.urls?.[lang] ?? {}) };
    if (url) byLang[fmt] = url; else delete byLang[fmt];
    onChange({ ...l, kit: l.kit.map((x, n) => (n === i ? { ...k, urls: { ...k.urls, [lang]: byLang } } : x)) });
  };
  return (
    <div className="stack">
      <h3 className="ed-h4">{t("kit.title")}</h3>
      <Items<KitFile> items={l.kit} itemLabel={(_, k) => t(k.kind === "slides" ? "kit.slides" : k.kind === "video" ? "kit.mp4" : "kit.plan")} onChange={(kit) => onChange({ ...l, kit })}
        render={(k, set, i) => (
          <div className="stack">
            <LText label={t("cms.title")} value={k.title} onChange={(title) => set({ ...k, title })} />
            <div className="form-grid"><Num label={t("cms.pages")} min={0} value={k.pages} onChange={(pages) => set({ ...k, pages })} /></div>
            {k.urls ? (
              <div className="ed-pair">
                {langs.map((lng) => <div key={lng.code} className="stack">{k.formats.map((fmt) => fmt !== "mp4" && (
                  <Upload key={fmt} label={<>{t(fmt === "pdf" ? "kit.pdf" : "kit.pptx")} (<LangName name={lng.name} code={lng.code} />)</>} kind={fmt} owner={media.owner} unitId={media.unitId}
                    base={`${media.lessonId}_kit_${k.kind}_${lng.code}`} current={k.urls?.[lng.code]?.[fmt]}
                    onDone={(url) => setUrl(k, i, lng.code, fmt, url)} onClear={() => setUrl(k, i, lng.code, fmt, null)} />
                ))}</div>)}
              </div>
            ) : <p className="muted small" dir="ltr">{k.base ?? k.path}</p>}
          </div>
        )} />
      <div className="row-gap">
        <Button size="sm" variant="secondary" onClick={() => add("slides")}>{t("cms.addKitSlides")}</Button>
        <Button size="sm" variant="secondary" onClick={() => add("lesson-plan")}>{t("cms.addKitPlan")}</Button>
      </div>
    </div>
  );
}

/** Errors first, then warnings; each opens the place it points at. */
function IssuesPanel({ issues, unit, onJump }: { issues: Issue[]; unit: Unit; onJump: (i: Issue) => void }) {
  const { t, num } = useI18n();
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  const where = (i: Issue) => {
    const parts: string[] = [];
    if (i.at.lesson !== undefined) parts.push(t("common.lessonN", { n: i.at.lesson + 1 }));
    if (i.at.step !== undefined) { const s = unit.lessons[i.at.lesson ?? 0]?.steps[i.at.step]; parts.push(`${t("cms.step")} ${num(i.at.step + 1)}${s ? ` (${t(STEP_LABEL[s.type])})` : ""}`); }
    if (i.at.slide !== undefined) parts.push(`${t("cms.slide")} ${num(i.at.slide + 1)}`);
    if (i.at.kit !== undefined) parts.push(t("kit.title"));
    if (!parts.length) parts.push(t("cms.unitDetails"));
    return parts.join(" › ");
  };
  const nErr = errorsOf(issues).length, nWarn = issues.length - nErr;
  // Missing translations can run to hundreds: one folded group per language, after everything else.
  const langName = (code: unknown) => isolate(languageOf(String(code)).native);
  const missing = new Map<string, Issue[]>();
  for (const i of sorted) if (i.code === "missingLang") missing.set(String(i.params?.lang), [...(missing.get(String(i.params?.lang)) ?? []), i]);
  const item = (i: Issue, k: number) => (
    <li key={k}>
      <button type="button" className={`ed-issue is-${i.level}`} onClick={() => onJump(i)}>
        <span className="ed-where">{where(i)}{i.at.field && <> <code dir="ltr">{i.at.field}</code></>}</span>
        <span>{t(`cms.issue.${i.code}` as MessageKey, { ...i.params, ...(i.params?.lang ? { lang: langName(i.params.lang) } : {}) })}</span>
      </button>
    </li>
  );
  const rest = sorted.filter((i) => i.code !== "missingLang");
  return (
    <div className="stack">
      <h3 className="ed-h4">{t("cms.issues")}</h3>
      <p className={nErr ? "notice err" : "notice ok"}>{nErr ? t("cms.errorsCount", { n: nErr }) : t("cms.noErrors")}{nWarn ? `${t("common.sep")}${t("cms.warningsCount", { n: nWarn })}` : ""}</p>
      {rest.length > 0 && <ul className="ed-issues">{rest.slice(0, 200).map(item)}</ul>}
      {[...missing].map(([code, list]) => (
        <details key={code} className="ed-more">
          <summary>{t("cms.issue.missingGroup", { lang: langName(code), n: list.length })}</summary>
          <ul className="ed-issues">{list.slice(0, 200).map(item)}</ul>
        </details>
      ))}
    </div>
  );
}

/** The lesson as learners will play it, from the unsaved draft: nothing is recorded, submitted or synced. */
function Preview({ Player, unit, lesson, lang, onLang, onExit }: { Player: Player; unit: Unit; lesson: Lesson; lang: string; onLang: (l: string) => void; onExit: () => void }) {
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
          <Player key={`${lesson.id}-${lang}`} unitId={unit.id} lesson={lesson} track={unit.track} preview={{ onExit }} />
        </div>
      </I18nProvider>
    </div>
  );
}
