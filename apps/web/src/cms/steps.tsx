/**
 * One small form per step type. Labels for the types are the ones learners see (QuestionHeader), so the editor and the
 * lesson speak the same words. Fill-the-gaps is written as "A sensor turns [heat] into a [number]." per language.
 */
import { useEffect, useState } from "react";
import type { ChoiceStep, FillStep, LocalText, Step, TrueFalseStep, VideoStep } from "../content/types";
import { ARTS } from "../content/validate";
import { categoryOf } from "../labs/categories";
import { LAB_METAS, labMeta } from "../labs/catalog";
import { useI18n, type MessageKey } from "../i18n";
import { blankStep, nextLetter } from "./ids";
import { Check, Items, LangName, LList, LText, Num, Sel, Text, Upload } from "./fields";
import { useEditLangs } from "./langs";

export const STEP_LABEL: Record<Step["type"], MessageKey> = {
  video: "lesson.video", read: "lesson.read", choice: "q.choice", multi: "q.multi", truefalse: "q.truefalse", image: "q.image", match: "q.match",
  order: "q.order", fill: "q.fill", type: "q.type", hotspot: "q.hotspot", scenario: "q.scenario", lab: "q.lab", project: "project.kicker", reflect: "q.reflect",
};
/** The order offered in "Add a step": a lesson usually runs watch → read → practise → project → reflect. */
export const STEP_MENU: Step["type"][] = ["video", "read", "choice", "multi", "truefalse", "image", "match", "order", "fill", "type", "hotspot", "scenario", "lab", "project", "reflect"];
const LT = (): LocalText => ({ en: "", ar: "" });

export interface MediaCtx { owner: string; unitId: string; lessonId: string }

export function StepForm({ step, onChange, media }: { step: Step; onChange: (s: Step) => void; media: MediaCtx }) {
  const { t } = useI18n();
  const set = <K extends string>(patch: Partial<Record<K, unknown>>) => onChange({ ...step, ...patch } as Step);
  const graded = ["choice", "multi", "truefalse", "image", "match", "order", "fill", "type", "hotspot"].includes(step.type);
  return (
    <div className="stack">
      <LText label={t("cms.prompt")} value={step.prompt} onChange={(prompt) => set({ prompt })} />
      <Body step={step} onChange={onChange} media={media} />
      {graded && <LText label={t("cms.explain")} hint={t("cms.explainHint")} value={step.explain} onChange={(explain) => set({ explain })} multiline rows={2} />}
    </div>
  );
}

function Body({ step: s, onChange, media }: { step: Step; onChange: (s: Step) => void; media: MediaCtx }) {
  const { t } = useI18n();
  switch (s.type) {
    case "choice": case "multi": case "image": {
      const ids = s.options.map((o) => o.id);
      const optionLabel = (i: number) => `${t("cms.option")} ${ids[i]?.toUpperCase() ?? i + 1}`;
      const answerSel = s.type !== "multi" && <Sel label={t("cms.answer")} value={s.answer} onChange={(answer) => onChange({ ...s, answer })}
        options={s.options.map((o, i) => [o.id, `${optionLabel(i)}: ${("text" in o ? o.text : o.label).en || "…"}`] as const)} />;
      return (
        <>
          <Items items={s.options as Array<(typeof s.options)[number]>} min={2} itemLabel={optionLabel} addLabel={t("cms.addOption")}
            onChange={(options) => onChange({ ...s, options } as Step)}
            add={() => (s.type === "image" ? { id: nextLetter(ids), label: LT(), art: "lamp" as const } : { id: nextLetter(ids), text: LT() })}
            render={(o, set) => "art" in o ? (
              <div className="stack">
                <LText label={t("cms.label")} value={o.label} onChange={(label) => set({ ...o, label })} />
                <Sel label={t("cms.picture")} value={o.art} onChange={(art) => set({ ...o, art })} options={ARTS.map((a) => [a, t(`cms.art.${a}` as MessageKey)] as const)} />
              </div>
            ) : (
              <div className="stack">
                <LText label={t("cms.optionText")} value={(o as { text: LocalText }).text} onChange={(text) => set({ ...o, text })} />
                {s.type === "multi" && <Check label={t("cms.correct")} checked={s.answers.includes(o.id)}
                  onChange={(on) => onChange({ ...s, answers: on ? [...s.answers, o.id] : s.answers.filter((a) => a !== o.id) })} />}
              </div>
            )} />
          {answerSel}
        </>
      );
    }
    case "truefalse": return <Sel label={t("cms.answer")} value={s.answer ? "true" : "false"} onChange={(v) => onChange({ ...s, answer: v === "true" })} options={[["true", t("q.true")], ["false", t("q.false")]]} />;
    case "match": return <Items items={s.pairs} min={2} itemLabel={(i) => `${t("cms.pair")} ${i + 1}`} addLabel={t("cms.addPair")} onChange={(pairs) => onChange({ ...s, pairs })} add={() => ({ left: LT(), right: LT() })}
      render={(p, set) => <div className="stack"><LText label={t("cms.left")} value={p.left} onChange={(left) => set({ ...p, left })} /><LText label={t("cms.right")} value={p.right} onChange={(right) => set({ ...p, right })} /></div>} />;
    case "order": return (
      <>
        <p className="muted small">{t("cms.orderHint")}</p>
        <Items items={s.steps} min={2} itemLabel={(i) => `${i + 1}`} addLabel={t("cms.addItem")} onChange={(steps) => onChange({ ...s, steps })} add={LT}
          render={(it, set) => <LText label={t("cms.item")} value={it} onChange={set} />} />
      </>
    );
    case "fill": return <FillForm step={s} onChange={onChange} />;
    case "type": return (
      <>
        <LList label={t("cms.accept")} hint={t("cms.acceptHint")} value={s.accept} onChange={(accept) => onChange({ ...s, accept })} />
        <LText label={t("cms.placeholder")} value={s.placeholder} onChange={(placeholder) => onChange({ ...s, placeholder })} />
      </>
    );
    case "hotspot": return (
      <>
        <Text label={t("cms.mockFrom")} value={s.mock.from} onChange={(from) => onChange({ ...s, mock: { ...s.mock, from } })} />
        <LText label={t("cms.mockBody")} value={s.mock.body} onChange={(body) => onChange({ ...s, mock: { ...s.mock, body } })} multiline />
        <LText label={t("cms.mockLink")} value={s.mock.link} onChange={(link) => onChange({ ...s, mock: { ...s.mock, link } })} />
        <p className="muted small">{t("cms.spotsHint")}</p>
        <Items items={s.spots} min={1} itemLabel={(i) => `${t("cms.spot")} ${i + 1}`} addLabel={t("cms.addSpot")} onChange={(spots) => onChange({ ...s, spots })}
          add={() => ({ id: `s${s.spots.length + 1}${Date.now().toString(36).slice(-2)}`, x: 5, y: 50, w: 90, h: 30, label: LT() })}
          render={(sp, set) => (
            <div className="stack">
              <LText label={t("cms.spotLabel")} value={sp.label} onChange={(label) => set({ ...sp, label })} />
              <div className="ed-grid4">{(["x", "y", "w", "h"] as const).map((k) => <Num key={k} label={t(`cms.spot.${k}` as MessageKey)} min={0} max={100} value={sp[k]} onChange={(v) => set({ ...sp, [k]: v })} />)}</div>
            </div>
          )} />
      </>
    );
    case "scenario": return (
      <>
        <LText label={t("cms.who")} value={s.who} onChange={(who) => onChange({ ...s, who })} />
        <LText label={t("cms.initial")} hint={t("cms.initialHint")} value={s.initial} onChange={(initial) => onChange({ ...s, initial })} />
        <LText label={t("cms.situation")} value={s.situation} onChange={(situation) => onChange({ ...s, situation })} multiline />
        <Items items={s.choices} min={1} itemLabel={(i) => `${t("cms.option")} ${i + 1}`} addLabel={t("cms.addOption")} onChange={(choices) => onChange({ ...s, choices })}
          add={() => ({ id: nextLetter(s.choices.map((c) => c.id)), label: LT(), tone: "consider" as const, consequence: LT() })}
          render={(c, set) => (
            <div className="stack">
              <LText label={t("cms.optionText")} value={c.label} onChange={(label) => set({ ...c, label })} />
              <Sel label={t("cms.tone")} value={c.tone} onChange={(tone) => set({ ...c, tone })} options={[["good", t("q.strong")], ["consider", t("q.think")]]} />
              <LText label={t("cms.consequence")} value={c.consequence} onChange={(consequence) => set({ ...c, consequence })} multiline rows={2} />
            </div>
          )} />
      </>
    );
    case "reflect": return <LText label={t("cms.placeholder")} value={s.placeholder} onChange={(placeholder) => onChange({ ...s, placeholder })} />;
    case "lab": return <LabPicker value={s.tool} onChange={(tool) => onChange({ ...s, tool })} />;
    case "read": return (
      <>
        <LText label={t("cms.title")} value={s.title} onChange={(title) => onChange({ ...s, title })} />
        <LText label={t("cms.body")} hint={t("cms.bodyHint")} value={s.body} onChange={(body) => onChange({ ...s, body })} multiline rows={8} />
        <Items items={s.keyTerms ?? []} itemLabel={(i) => `${t("lesson.keyTerms")} ${i + 1}`} addLabel={t("cms.addTerm")} onChange={(keyTerms) => onChange({ ...s, keyTerms })} add={() => ({ term: LT(), def: LT() })}
          render={(k, set) => <div className="stack"><LText label={t("cms.term")} value={k.term} onChange={(term) => set({ ...k, term })} /><LText label={t("cms.def")} value={k.def} onChange={(def) => set({ ...k, def })} multiline rows={2} /></div>} />
      </>
    );
    case "project": return (
      <>
        <LText label={t("cms.task")} value={s.task} onChange={(task) => onChange({ ...s, task })} multiline />
        <LText label={t("project.deliver")} value={s.deliverable} onChange={(deliverable) => onChange({ ...s, deliverable })} />
        <Items items={s.rubric} min={1} itemLabel={(i) => `${t("cms.criterion")} ${i + 1}`} addLabel={t("cms.addCriterion")} onChange={(rubric) => onChange({ ...s, rubric })} add={() => ({ criterion: LT() })}
          render={(r, set) => <LText label={t("cms.criterion")} value={r.criterion} onChange={(criterion) => set({ criterion })} />} />
      </>
    );
    case "video": return <VideoForm step={s} onChange={onChange} media={media} />;
  }
}

/** Any app from the Labs catalogue, as "Shelf: Title". An id the catalogue doesn't know (an old import) stays visible. */
function LabPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, L } = useI18n();
  const options = LAB_METAS.map((m) => [m.id, `${L(categoryOf(m.category).name)}: ${L(m.title)}`] as const);
  return <Sel label={t("cms.tool")} value={value} onChange={onChange} options={labMeta(value) ? options : [[value, value], ...options]} />;
}

/* ---------- Fill the gaps ---------- */

const toText = (s: FillStep, lang: string) => (s.sentence[lang] ?? []).map((p) => (typeof p === "string" ? p : `[${s.answers[lang]?.[p.blank] ?? ""}]`)).join("");
const extrasOf = (s: FillStep, lang: string) => (s.bank[lang] ?? []).filter((w) => !(s.answers[lang] ?? []).includes(w)).join(", ");
/** "A sensor turns [heat] into a [number]." → sentence parts, answers in order, and a bank of the answers plus extra words. */
export function parseFill(text: string, extras: string) {
  const sentence: Array<string | { blank: number }> = []; const answers: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^[\]]+)\]/g)) {
    if (m.index! > last) sentence.push(text.slice(last, m.index));
    sentence.push({ blank: answers.length }); answers.push(m[1].trim());
    last = m.index! + m[0].length;
  }
  if (last < text.length) sentence.push(text.slice(last));
  const bank = [...new Set([...answers, ...extras.split(/[,،]/).map((w) => w.trim()).filter(Boolean)])];
  return { sentence, answers, bank };
}

function FillForm({ step, onChange }: { step: FillStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  const langs = useEditLangs();
  return (
    <>
      <p className="muted small">{t("cms.fillHint")}</p>
      <div className="ed-pair">{langs.map((l) => <FillLang key={l.code} lang={l.code} dir={l.dir} name={l.name} step={step} onChange={onChange} />)}</div>
    </>
  );
}
function FillLang({ lang, dir, name, step, onChange }: { lang: string; dir: "ltr" | "rtl"; name: string; step: FillStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(() => toText(step, lang));
  const [extras, setExtras] = useState(() => extrasOf(step, lang));
  useEffect(() => { if (parseFill(text, extras).answers.join("|") !== (step.answers[lang] ?? []).join("|")) { setText(toText(step, lang)); setExtras(extrasOf(step, lang)); } }, [step.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (nt: string, ne: string) => {
    setText(nt); setExtras(ne);
    const p = parseFill(nt, ne);
    const drop = !nt.trim() && lang !== "en";
    const without = <T,>(o: Partial<Record<string, T>>) => { const c = { ...o }; delete c[lang]; return c as { en: T } & Partial<Record<string, T>>; };
    onChange(drop ? { ...step, sentence: without(step.sentence), answers: without(step.answers), bank: without(step.bank) }
      : { ...step, sentence: { ...step.sentence, [lang]: p.sentence }, answers: { ...step.answers, [lang]: p.answers }, bank: { ...step.bank, [lang]: p.bank } });
  };
  const n = parseFill(text, extras).answers.length;
  return (
    <div className="stack">
      <div className="dr-field">
        <label className="dr-field-label" htmlFor={`fill-${step.id}-${lang}`}>{t("cms.sentence")}<span className="ed-lang"><LangName name={name} code={lang} /></span></label>
        <textarea id={`fill-${step.id}-${lang}`} className="dr-field-input" rows={3} dir={dir} lang={lang} value={text} onChange={(e) => apply(e.target.value, extras)} />
        <span className="dr-field-hint">{t("cms.blanks", { n })}</span>
      </div>
      <div className="dr-field">
        <label className="dr-field-label" htmlFor={`fillx-${step.id}-${lang}`}>{t("cms.extraWords")}<span className="ed-lang"><LangName name={name} code={lang} /></span></label>
        <input id={`fillx-${step.id}-${lang}`} className="dr-field-input" dir={dir} lang={lang} value={extras} onChange={(e) => apply(text, e.target.value)} />
      </div>
    </div>
  );
}

/* ---------- Video ---------- */

function VideoForm({ step: s, onChange, media }: { step: VideoStep; onChange: (s: Step) => void; media: MediaCtx }) {
  const { t } = useI18n();
  const langs = useEditLangs();
  const cp = s.checkpoint;
  const setSource = (key: "sources" | "captions", lang: string, url: string | null, bytes = 0) => {
    const next = { ...(s[key] ?? {}) } as Record<string, string>;
    if (url) next[lang] = url; else delete next[lang];
    const sizeMB = key === "sources" && url ? Math.max(s.sizeMB || 0, Math.round((bytes / 1e6) * 10) / 10) : s.sizeMB;
    onChange({ ...s, [key]: Object.keys(next).length ? next : undefined, sizeMB });
  };
  return (
    <>
      <LText label={t("cms.title")} value={s.title} onChange={(title) => onChange({ ...s, title })} />
      <div className="form-grid">
        <Num label={t("cms.duration")} hint={t("cms.seconds")} min={1} value={s.duration} onChange={(duration) => onChange({ ...s, duration })} />
        <Num label={t("cms.sizeMB")} hint={t("cms.sizeHint")} min={0} step={0.1} value={s.sizeMB} onChange={(sizeMB) => onChange({ ...s, sizeMB })} />
      </div>
      <div className="ed-pair">
        {langs.map((l) => (
          <div key={l.code} className="stack">
            <Upload label={<>{t("cms.videoFile")} (<LangName name={l.name} code={l.code} />)</>} kind="video" owner={media.owner} unitId={media.unitId} base={`${media.lessonId}_${s.id}_video_${l.code}`}
              current={s.sources?.[l.code]} onDone={(url, bytes) => setSource("sources", l.code, url, bytes)} onClear={() => setSource("sources", l.code, null)} />
            <Upload label={<>{t("cms.captions")} (<LangName name={l.name} code={l.code} />)</>} kind="captions" owner={media.owner} unitId={media.unitId} base={`${media.lessonId}_${s.id}_captions_${l.code}`}
              current={s.captions?.[l.code]} onDone={(url) => setSource("captions", l.code, url)} onClear={() => setSource("captions", l.code, null)} />
          </div>
        ))}
      </div>
      {s.src !== null && <Text label={t("cms.videoPath")} hint={t("cms.videoPathHint", { lang: "{lang}" })} dir="ltr" value={s.src} onChange={(v) => onChange({ ...s, src: v.trim() || null })} />}
      <LText label={t("lesson.transcript")} hint={t("cms.transcriptHint")} value={s.transcript} onChange={(transcript) => onChange({ ...s, transcript })} multiline rows={6} />
      <Items items={s.chapters ?? []} itemLabel={(i) => `${t("cms.chapter")} ${i + 1}`} addLabel={t("cms.addChapter")} onChange={(chapters) => onChange({ ...s, chapters: chapters.length ? chapters : undefined })}
        add={() => ({ at: 0, label: LT() })}
        render={(c, set) => <div className="stack"><Num label={t("cms.at")} hint={t("cms.seconds")} min={0} value={c.at} onChange={(at) => set({ ...c, at })} /><LText label={t("cms.label")} value={c.label} onChange={(label) => set({ ...c, label })} /></div>} />
      <Check label={t("cms.checkpoint")} checked={!!cp} onChange={(on) => onChange({ ...s, checkpoint: on ? { at: Math.max(0, Math.min(30, (s.duration || 1) - 1)), question: blankStep("choice", `${s.id}-q`) as ChoiceStep } : undefined })} />
      {cp && (
        <div className="ed-item stack">
          <div className="form-grid">
            <Num label={t("cms.at")} hint={t("cms.seconds")} min={0} value={cp.at} onChange={(at) => onChange({ ...s, checkpoint: { ...cp, at } })} />
            <Sel label={t("cms.questionType")} value={cp.question.type} onChange={(type) => onChange({ ...s, checkpoint: { ...cp, question: blankStep(type, `${s.id}-q`) as ChoiceStep | TrueFalseStep } })}
              options={[["choice", t("q.choice")], ["truefalse", t("q.truefalse")]]} />
          </div>
          <StepForm step={cp.question} media={media} onChange={(q) => onChange({ ...s, checkpoint: { ...cp, question: q as ChoiceStep | TrueFalseStep } })} />
        </div>
      )}
    </>
  );
}
