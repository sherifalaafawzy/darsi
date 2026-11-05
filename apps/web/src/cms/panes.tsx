/**
 * What the unit editor shows beside its outline: the unit (at a glance, details, its lessons as cards, actions), a
 * lesson (title, its steps as a storyboard, classroom files, the rest of its details), the step chooser, slides, kit
 * files and the checks. Each pane lists the problems that belong to it at its top.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { COMPETENCIES } from "../content/competencies";
import { useTracks } from "../content/settings";
import type { KitFile, KitFormat, Lesson, Slide, Step, Unit } from "../content/types";
import { errorsOf, SLIDE_LAYOUTS, type Issue } from "../content/validate";
import { isolate, languageOf, useI18n, type MessageKey } from "../i18n";
import { copyLessonTo, listUnits, type UnitMeta } from "./data";
import { Items, LangName, LList, LText, Num, Sel, Upload } from "./fields";
import { useEditLangs, useLangView } from "./langs";
import { Insert, StepIcon, useStepSummary } from "./outline";
import { STEP_LABEL, type MediaCtx } from "./steps";
import { STEP_GROUPS } from "./stepMeta";

const LT = () => ({ en: "", ar: "" });

/* ---------- Problems ---------- */

/** Where an issue points, in words: "Lesson 2 › Step 3 (Choose one)". */
export function useWhere(unit: Unit) {
  const { t, num } = useI18n();
  return (i: Issue) => {
    const parts: string[] = [];
    if (i.at.lesson !== undefined) parts.push(t("common.lessonN", { n: i.at.lesson + 1 }));
    if (i.at.step !== undefined) { const s = unit.lessons[i.at.lesson ?? 0]?.steps[i.at.step]; parts.push(`${t("cms.step")} ${num(i.at.step + 1)}${s ? ` (${t(STEP_LABEL[s.type])})` : ""}`); }
    if (i.at.slide !== undefined) parts.push(`${t("cms.slide")} ${num(i.at.slide + 1)}`);
    if (i.at.kit !== undefined) parts.push(t("kit.title"));
    if (!parts.length) parts.push(t("cms.unitDetails"));
    return parts.join(" › ");
  };
}
const langName = (code: unknown) => isolate(languageOf(String(code)).native);
function useIssueText() {
  const { t } = useI18n();
  return (i: Issue) => t(`cms.issue.${i.code}` as MessageKey, { ...i.params, ...(i.params?.lang ? { lang: langName(i.params.lang) } : {}) });
}

/**
 * The problems of the open pane, at its top: errors and warnings in words (with the field they are about), and missing
 * translations as one line per language with a button to translate there.
 */
export function HereIssues({ issues, onTranslate }: { issues: Issue[]; onTranslate: (lang: string) => void }) {
  const { t, num } = useI18n();
  const text = useIssueText();
  const { view } = useLangView();
  const rest = issues.filter((i) => i.code !== "missingLang");
  const missing = new Map<string, number>();
  for (const i of issues) if (i.code === "missingLang") missing.set(String(i.params?.lang), (missing.get(String(i.params?.lang)) ?? 0) + 1);
  if (!rest.length && !missing.size) return null;
  const nErr = errorsOf(rest).length;
  return (
    <div className={`ed-here${nErr ? " is-error" : ""}`} role="status">
      {rest.length > 0 && <>
        <strong className="ed-here-h"><Icon name="warning" size={18} />{nErr ? t("cms.hereErrors", { n: num(nErr) }) : t("cms.hereWarnings", { n: num(rest.length) })}</strong>
        <ul>{rest.slice(0, 8).map((i, k) => <li key={k} className={`is-${i.level}`}>{text(i)}{i.at.field && <> <code dir="ltr">{i.at.field}</code></>}</li>)}</ul>
      </>}
      {[...missing].map(([code, n]) => (
        <p key={code} className="ed-here-lang">
          <span>{t("cms.issue.missingGroup", { lang: langName(code), n })}</span>
          {view !== code && <Button size="sm" variant="secondary" icon="language" onClick={() => onTranslate(code)}>{t("cms.translateNow")}</Button>}
        </p>
      ))}
    </div>
  );
}

/** Every problem in the unit: errors first, then warnings; each opens the place it points at. */
export function IssuesPanel({ issues, unit, onJump }: { issues: Issue[]; unit: Unit; onJump: (i: Issue) => void }) {
  const { t } = useI18n();
  const where = useWhere(unit);
  const text = useIssueText();
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  const nErr = errorsOf(issues).length, nWarn = issues.length - nErr;
  // Missing translations can run to hundreds: one folded group per language, after everything else.
  const missing = new Map<string, Issue[]>();
  for (const i of sorted) if (i.code === "missingLang") missing.set(String(i.params?.lang), [...(missing.get(String(i.params?.lang)) ?? []), i]);
  const item = (i: Issue, k: number) => (
    <li key={k}>
      <button type="button" className={`ed-issue is-${i.level}`} onClick={() => onJump(i)}>
        <span className="ed-where">{where(i)}{i.at.field && <> <code dir="ltr">{i.at.field}</code></>}</span>
        <span>{text(i)}</span>
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

/* ---------- The unit ---------- */

/** The unit at a glance: size, length, what blocks publishing, and how far each language is translated. */
export function Glance({ unit, issues, onChecks, onTranslate }: { unit: Unit; issues: Issue[]; onChecks: () => void; onTranslate: (lang: string) => void }) {
  const { t, num } = useI18n();
  const langs = useLangView().all.filter((l) => l.code !== "en");
  const nErr = errorsOf(issues).length;
  const steps = unit.lessons.reduce((n, l) => n + l.steps.length, 0);
  const minutes = unit.lessons.reduce((n, l) => n + (Number.isFinite(l.minutes) ? l.minutes : 0), 0);
  const missing = (code: string) => issues.filter((i) => i.code === "missingLang" && i.params?.lang === code).length;
  return (
    <section className="ed-glance" aria-label={t("cms.atAGlance")}>
      <div className="ed-glance-tiles">
        <span className="ed-tile"><strong>{num(unit.lessons.length)}</strong>{t("cms.lessons")}</span>
        <span className="ed-tile"><strong>{num(steps)}</strong>{t("cms.steps")}</span>
        <span className="ed-tile"><strong>{num(minutes)}</strong>{t("cms.minutes")}</span>
        <button type="button" className={`ed-tile${nErr ? " is-error" : " is-ok"}`} onClick={onChecks}>
          <strong>{nErr ? num(nErr) : <Icon name="check" size={22} />}</strong>{nErr ? t("cms.errorsShort") : t("cms.readyShort")}
        </button>
      </div>
      {langs.map((l) => {
        const n = missing(l.code);
        return (
          <p key={l.code} className="ed-glance-lang">
            <LangName name={l.name} code={l.code} />
            <span className={n ? "muted" : "ed-ok"}>{n ? t("cms.toTranslate", { n: num(n) }) : t("cms.translatedAll")}</span>
            {n > 0 && <Button size="sm" variant="ghost" icon="language" onClick={() => onTranslate(l.code)}>{t("cms.translateNow")}</Button>}
          </p>
        );
      })}
    </section>
  );
}

/** The unit's lessons as cards: number, title, length, and the kinds of its steps in order. */
export function LessonCards({ unit, errors, onOpen, onAdd }: { unit: Unit; errors: Issue[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const { t, L, num } = useI18n();
  return (
    <div className="stack">
      <ol className="ed-cards">
        {unit.lessons.map((l, i) => {
          const bad = errors.filter((x) => x.at.lesson === i).length;
          return (
            <li key={l.id}>
              <button type="button" className="ed-card" onClick={() => onOpen(l.id)}>
                <span className="ed-card-top"><span className="ed-num" dir="ltr">{num(i + 1)}</span><strong><bdi>{L(l.title) || t("cms.untitled")}</bdi></strong>
                  {bad > 0 && <span className="ed-badge">{num(bad)}</span>}</span>
                <span className="muted small">{[t("common.minutes", { n: l.minutes || 0 }), t("cms.stepsCount", { n: num(l.steps.length) })].join(t("common.sep"))}</span>
                <span className="ed-strip">{l.steps.slice(0, 14).map((s, k) => <StepIcon key={k} type={s.type} size={14} />)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <Button size="sm" variant="secondary" icon="edit" onClick={onAdd}>{t("cms.addLesson")}</Button>
    </div>
  );
}

/* ---------- A lesson ---------- */

export interface StepOps { insertAt: (at: number) => void; duplicate: (k: number) => void; move: (k: number, d: -1 | 1) => void; remove: (k: number) => void; open: (id: string) => void }

/** The lesson's steps in order, as cards to open, with "+" between them and tools on each. */
export function StepBoard({ lesson, lessonIndex, errors, ops }: { lesson: Lesson; lessonIndex: number; errors: Issue[]; ops: StepOps }) {
  const { t, num } = useI18n();
  const summary = useStepSummary();
  if (!lesson.steps.length) return (
    <div className="ed-empty">
      <p className="muted">{t("cms.noSteps")}</p>
      <Button size="sm" icon="edit" onClick={() => ops.insertAt(0)}>{t("cms.addStep")}</Button>
    </div>
  );
  return (
    <ol className="ed-board">
      {lesson.steps.map((s, k) => {
        const bad = errors.filter((x) => x.at.lesson === lessonIndex && x.at.step === k).length;
        return (
          <li key={`${s.id}-${k}`}>
            <Insert label={t("cms.insertStep")} onClick={() => ops.insertAt(k)} />
            <div className={`ed-scard${bad ? " is-error" : ""}`}>
              <button type="button" className="ed-scard-main" onClick={() => ops.open(s.id)}>
                <StepIcon type={s.type} size={20} />
                <span className="ed-scard-text">
                  <span className="ed-scard-kind"><span dir="ltr">{num(k + 1)}</span>{t("common.sep")}{t(STEP_LABEL[s.type])}</span>
                  <span className="ed-scard-sum">{summary(s) || <em className="muted">{t("cms.noPrompt")}</em>}</span>
                </span>
                {bad > 0 && <span className="ed-badge">{num(bad)}</span>}
              </button>
              <span className="ed-tools">
                <Button size="sm" variant="ghost" iconOnly icon="up" disabled={k === 0} onClick={() => ops.move(k, -1)}>{t("cms.moveStepUp")}</Button>
                <Button size="sm" variant="ghost" iconOnly icon="down" disabled={k === lesson.steps.length - 1} onClick={() => ops.move(k, 1)}>{t("cms.moveStepDown")}</Button>
                <Button size="sm" variant="ghost" iconOnly icon="file" onClick={() => ops.duplicate(k)}>{t("cms.duplicateStep")}</Button>
                <Button size="sm" variant="ghost" iconOnly icon="close" onClick={() => ops.remove(k)}>{t("cms.removeStep")}</Button>
              </span>
            </div>
          </li>
        );
      })}
      <li><Button size="sm" variant="secondary" icon="edit" onClick={() => ops.insertAt(lesson.steps.length)}>{t("cms.addStep")}</Button></li>
    </ol>
  );
}

/** The rest of a lesson: what to try in class, materials and competencies. */
export function LessonMore({ lesson: l, onChange }: { lesson: Lesson; onChange: (l: Lesson) => void }) {
  const { t, L } = useI18n();
  const comps = l.competencies ?? [];
  return (
    <div className="stack-lg">
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
    </div>
  );
}

/** A link card to another part of the lesson (slides, kit). */
export function GoCard({ icon, title, body, onClick }: { icon: "file" | "print"; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" className="ed-go" onClick={onClick}>
      <Icon name={icon} size={20} /><span><strong>{title}</strong><span className="muted small">{body}</span></span><Icon name="next" size={18} />
    </button>
  );
}

/** Copy the lesson into another unit of the same owner (saved there at once, as a normal draft save). */
export function CopyTo({ owner, unitId, lesson, onDone }: { owner: string; unitId: string; lesson: Lesson; onDone: (text: string) => void }) {
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

/* ---------- Adding a step ---------- */

/** "Add a step": every kind, in four groups, each with its icon and what it's for. */
export function StepTypes({ onPick, onCancel }: { onPick: (type: Step["type"]) => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div className="stack-lg">
      <div className="ed-pane-head">
        <h3 className="ed-h4">{t("cms.chooseStep")}</h3>
        <Button size="sm" variant="ghost" icon="close" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
      {STEP_GROUPS.map((g) => (
        <section key={g.id} className="stack-sm" aria-labelledby={`ed-g-${g.id}`}>
          <h4 id={`ed-g-${g.id}`} className="ed-outline-h">{t(g.label)}</h4>
          <div className="ed-types">
            {g.types.map((type) => (
              <button key={type} type="button" className="ed-type" onClick={() => onPick(type)}>
                <StepIcon type={type} size={20} />
                <span><strong>{t(STEP_LABEL[type])}</strong><span>{t(`cms.stepHint.${type}` as MessageKey)}</span></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Slides and kit ---------- */

export function SlidesForm({ lesson: l, onChange }: { lesson: Lesson; onChange: (l: Lesson) => void }) {
  const { t, num } = useI18n();
  return (
    <div className="stack">
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
export function KitForm({ lesson: l, onChange, media }: { lesson: Lesson; onChange: (l: Lesson) => void; media: MediaCtx }) {
  const { t } = useI18n();
  const langs = useEditLangs();
  const add = (kind: "slides" | "lesson-plan") => onChange({ ...l, kit: [...l.kit, {
    kind, pages: 1, formats: KIT_FORMATS[kind], urls: {},
    title: kind === "slides" ? { en: "Slides", ar: "شرائح" } : { en: "Lesson plan", ar: "خطة الدرس" },
  }] });
  // Each file's size goes with its link, so the catalog can say what a download costs.
  const setUrl = (k: KitFile, i: number, lang: string, fmt: KitFormat, url: string | null, bytes = 0) => {
    const byLang = { ...(k.urls?.[lang] ?? {}) };
    const kb = { ...(k.sizeKB?.[lang] ?? {}) };
    if (url) { byLang[fmt] = url; kb[fmt] = Math.round(bytes / 1024); } else { delete byLang[fmt]; delete kb[fmt]; }
    onChange({ ...l, kit: l.kit.map((x, n) => (n === i ? { ...k, urls: { ...k.urls, [lang]: byLang }, sizeKB: { ...k.sizeKB, [lang]: kb } } : x)) });
  };
  return (
    <div className="stack">
      <p className="muted small">{t("cms.kitHint")}</p>
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
                    onDone={(url, bytes) => setUrl(k, i, lng.code, fmt, url, bytes)} onClear={() => setUrl(k, i, lng.code, fmt, null)} />
                ))}</div>)}
              </div>
            ) : <p className="muted small" dir="ltr">{k.base ?? k.path}</p>}
          </div>
        )} />
      <div className="row-gap">
        <Button size="sm" variant="secondary" icon="file" onClick={() => add("slides")}>{t("cms.addKitSlides")}</Button>
        <Button size="sm" variant="secondary" icon="print" onClick={() => add("lesson-plan")}>{t("cms.addKitPlan")}</Button>
      </div>
    </div>
  );
}

/** A pane's heading row: the title (with an icon) and the tools beside it. */
export function PaneHead({ icon, title, sub, children }: { icon?: ReactNode; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="ed-pane-head">
      <div className="ed-pane-title">{icon}<h3 className="ed-h4">{title}</h3>{sub && <span className="muted small">{sub}</span>}</div>
      {children}
    </div>
  );
}
