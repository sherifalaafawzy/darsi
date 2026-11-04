/**
 * The unit editor's outline: the unit, its lessons, the open lesson's steps (with their kind's icon), slides and kit,
 * the checks and the languages to fill. Lessons and steps can be dragged to a new place with a mouse; touch screens
 * use the move buttons in the forms (a drag there would fight scrolling).
 */
import { useState, type DragEvent, type ReactNode } from "react";
import { Icon, TrackChip } from "@darsi/design-system";
import { useTracks } from "../content/settings";
import { audienceOf, type Step, type Unit } from "../content/types";
import type { Issue } from "../content/validate";
import { labMeta } from "../labs/catalog";
import { languageOf, useI18n, useLanguages } from "../i18n";
import { LangName } from "./fields";
import { STEP_LABEL } from "./steps";
import { groupOf, STEP_ICON } from "./stepMeta";
import type { Sel } from "./UnitEditor";

/** A short line for a step: its video's or reading's title, its lab's name, else its prompt. */
export function useStepSummary() {
  const { L } = useI18n();
  return (s: Step) => {
    const own = s.type === "video" || s.type === "read" ? L(s.title) : s.type === "lab" ? L(labMeta(s.tool)?.title ?? { en: s.tool }) : "";
    return own || L(s.prompt);
  };
}

/** A step kind's icon in its group's colour. */
export function StepIcon({ type, size = 18 }: { type: Step["type"]; size?: number }) {
  return <span className={`ed-ico is-${groupOf(type)}`} aria-hidden><Icon name={STEP_ICON[type]} size={size} /></span>;
}

interface Props {
  unit: Unit; view: Sel; errors: Issue[]; editLangs: string[];
  pick: (s: Sel) => void;
  onInsertLesson: (at: number) => void;
  onMoveLesson: (from: number, to: number) => void;
  onMoveStep: (lesson: number, from: number, to: number) => void;
  onToggleLang: (code: string) => void;
}

export function Outline({ unit, view, errors, editLangs, pick, onInsertLesson, onMoveLesson, onMoveStep, onToggleLang }: Props) {
  const { t, L, num } = useI18n();
  const tracks = useTracks();
  const languages = useLanguages();
  const summary = useStepSummary();
  const [drag, setDrag] = useState<{ kind: "lesson" | "step"; lesson: number; from: number } | null>(null);
  const [over, setOver] = useState("");
  const here = (s: Sel) => JSON.stringify(s) === JSON.stringify(view);
  const count = (f: (i: Issue) => boolean) => errors.filter(f).length;
  const openId = "lesson" in view ? view.lesson : "";
  const langChoices = [...new Set([...languages.map((l) => l.code), ...editLangs])];

  /** Drag handlers for one row: lessons onto lessons, steps onto steps of the same lesson. */
  const dnd = (kind: "lesson" | "step", lesson: number, i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", `${kind}:${i}`); setDrag({ kind, lesson, from: i }); },
    onDragEnd: () => { setDrag(null); setOver(""); },
    onDragOver: (e: DragEvent) => { if (drag && drag.kind === kind && drag.lesson === lesson) { e.preventDefault(); setOver(`${kind}-${lesson}-${i}`); } },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag && drag.kind === kind && drag.lesson === lesson && drag.from !== i) (kind === "lesson" ? onMoveLesson(drag.from, i) : onMoveStep(lesson, drag.from, i));
      setDrag(null); setOver("");
    },
  });
  const dropCls = (key: string) => (over === key ? " is-drop" : "");

  return (
    <nav className="ed-outline" aria-label={t("cms.outline")}>
      <button type="button" className={`ed-course${here({ kind: "unit" }) ? " is-on" : ""}`} aria-current={here({ kind: "unit" }) ? "true" : undefined} onClick={() => pick({ kind: "unit" })}>
        <span className="ed-course-top">
          <TrackChip track={unit.track} solid>{tracks.name(unit.track)}</TrackChip>
          {count((x) => x.at.lesson === undefined) > 0 && <span className="ed-badge">{num(count((x) => x.at.lesson === undefined))}</span>}
        </span>
        <strong><bdi>{L(unit.title) || t("cms.untitled")}</bdi></strong>
        <span className="muted small">{[tracks.levelName(unit.track, unit.level), t(`cms.audience.${audienceOf(unit)}`)].join(t("common.sep"))}</span>
        <span className="ed-course-edit"><Icon name="settings" size={16} />{t("cms.unitDetails")}</span>
      </button>

      <h4 className="ed-outline-h">{`${t("cms.lessons")} (${num(unit.lessons.length)})`}</h4>
      <ol className="ed-tree">
        {unit.lessons.map((l, i) => {
          const open = openId === l.id;
          return (
            <li key={l.id} className={dropCls(`lesson--1-${i}`)}>
              <Insert label={t("cms.insertLesson")} onClick={() => onInsertLesson(i)} />
              <Node on={here({ kind: "lesson", lesson: l.id })} open={open} badge={count((x) => x.at.lesson === i)} onClick={() => pick({ kind: "lesson", lesson: l.id })}
                drag={dnd("lesson", -1, i)}>
                <span className="ed-num" dir="ltr">{num(i + 1)}</span><span className="ed-node-text">{L(l.title) || t("cms.untitled")}</span>
              </Node>
              {open && (
                <ol className="ed-tree ed-tree-sub">
                  {l.steps.map((s, k) => (
                    <li key={`${s.id}-${k}`} className={dropCls(`step-${i}-${k}`)}>
                      <Insert label={t("cms.insertStep")} onClick={() => pick({ kind: "add-step", lesson: l.id, at: k })} />
                      <Node on={here({ kind: "step", lesson: l.id, step: s.id })} badge={count((x) => x.at.lesson === i && x.at.step === k)}
                        onClick={() => pick({ kind: "step", lesson: l.id, step: s.id })} drag={dnd("step", i, k)}>
                        <StepIcon type={s.type} size={16} />
                        <span className="ed-node-text"><strong>{t(STEP_LABEL[s.type])}</strong> <span className="muted">{summary(s)}</span></span>
                      </Node>
                    </li>
                  ))}
                  <li><Node on={here({ kind: "add-step", lesson: l.id, at: l.steps.length })} onClick={() => pick({ kind: "add-step", lesson: l.id, at: l.steps.length })}>
                    <Icon name="edit" size={18} /><span className="ed-node-text">{t("cms.addStep")}</span></Node></li>
                  <li><Node on={here({ kind: "slides", lesson: l.id })} badge={count((x) => x.at.lesson === i && x.at.slide !== undefined)} onClick={() => pick({ kind: "slides", lesson: l.id })}>
                    <Icon name="file" size={18} /><span className="ed-node-text">{`${t("kit.slides")} (${num(l.slides.length)})`}</span></Node></li>
                  <li><Node on={here({ kind: "kit", lesson: l.id })} badge={count((x) => x.at.lesson === i && x.at.kit !== undefined)} onClick={() => pick({ kind: "kit", lesson: l.id })}>
                    <Icon name="print" size={18} /><span className="ed-node-text">{`${t("kit.title")} (${num(l.kit.length)})`}</span></Node></li>
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className="ed-node ed-node-add" onClick={() => onInsertLesson(unit.lessons.length)}><Icon name="edit" size={18} /><span className="ed-node-text">{t("cms.addLesson")}</span></button>
      <Node on={here({ kind: "checks" })} badge={errors.length} onClick={() => pick({ kind: "checks" })}>
        <Icon name={errors.length ? "warning" : "check"} size={18} /><span className="ed-node-text">{t("cms.issues")}</span>
      </Node>
      <fieldset className="ed-fieldset ed-langs">
        <legend className="ed-outline-h">{t("cms.langs")}</legend>
        <div className="ed-filter">
          {langChoices.map((code) => {
            const on = code === "en" || editLangs.includes(code);
            return <button key={code} type="button" className={`ed-chip${on ? " is-on" : ""}`} aria-pressed={on} disabled={code === "en"} onClick={() => onToggleLang(code)}>
              <LangName name={languageOf(code).native} code={code} /></button>;
          })}
        </div>
        <p className="muted small">{t("cms.langsHint")}</p>
      </fieldset>
    </nav>
  );
}

/** One line of the outline. */
function Node({ on, open, badge = 0, onClick, drag, children }: { on: boolean; open?: boolean; badge?: number; onClick: () => void; drag?: object; children: ReactNode }) {
  const { num } = useI18n();
  return (
    <button type="button" className={`ed-node${on ? " is-on" : ""}${drag ? " is-draggable" : ""}`} aria-current={on ? "true" : undefined} aria-expanded={open} onClick={onClick} {...drag}>
      {children}{badge > 0 && <span className="ed-badge">{num(badge)}</span>}
    </button>
  );
}

/** "+" between two items: add one right here. */
export function Insert({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="ed-insert" aria-label={label} title={label} onClick={onClick}><span aria-hidden>+</span></button>;
}
