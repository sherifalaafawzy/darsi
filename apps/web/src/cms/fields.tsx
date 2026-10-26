/**
 * Form building blocks for the course editor. Every learner-facing text is edited as an English/Arabic pair (Arabic
 * right-to-left, side by side on wide screens). Ids come from useId(): labels can't be used, Arabic ones collapse
 * to the same id in the design system's TextField.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, ProgressBar, Switch } from "@darsi/design-system";
import type { LocalList, LocalText } from "../content/types";
import { useI18n } from "../i18n";
import { fits, MEDIA, uploadMedia, type MediaKind } from "./upload";

export const LANGS = [{ code: "en", name: "English", dir: "ltr" }, { code: "ar", name: "العربية", dir: "rtl" }] as const;
type Lang = (typeof LANGS)[number]["code"];

/** A language's own name. Arabic words on an English page are marked so that page never downloads the Arabic fonts. */
export function LangName({ name }: { name: string }) {
  return /[؀-ۿ]/.test(name) ? <span lang="ar" className="dr-other-script">{name}</span> : <>{name}</>;
}

/** Label + control + hint, in the design system's field styles. */
function Field({ id, label, tag, hint, children }: { id: string; label: string; tag?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="dr-field">
      <label htmlFor={id} className="dr-field-label"><bdi>{label}</bdi>{tag && <span className="ed-lang"><LangName name={tag} /></span>}</label>
      {children}
      {hint && <span className="dr-field-hint">{hint}</span>}
    </div>
  );
}

/** A LocalText: English (required, the fallback) and Arabic. */
export function LText({ label, value, onChange, multiline, rows = 3, hint }: { label: string; value?: LocalText; onChange: (v: LocalText) => void; multiline?: boolean; rows?: number; hint?: string }) {
  const id = useId();
  const v = value ?? { en: "" };
  return (
    <div className="ed-pair">
      {LANGS.map((l) => {
        const props = { id: `${id}-${l.code}`, className: "dr-field-input", dir: l.dir, lang: l.code, value: v[l.code] ?? "", onChange: (e: { target: { value: string } }) => onChange({ ...v, [l.code]: e.target.value }) };
        return <Field key={l.code} id={props.id} label={label} tag={l.name} hint={l.code === "en" ? hint : undefined}>{multiline ? <textarea rows={rows} {...props} /> : <input {...props} />}</Field>;
      })}
    </div>
  );
}

/** A LocalList, one item per line. Typing keeps blank lines on screen; the lesson only gets the filled ones. */
export function LList({ label, value, onChange, hint, rows = 4 }: { label: string; value?: LocalList; onChange: (v: LocalList) => void; hint?: string; rows?: number }) {
  const id = useId();
  return <div className="ed-pair">{LANGS.map((l) => <ListBox key={l.code} id={`${id}-${l.code}`} lang={l.code} label={label} tag={l.name} hint={l.code === "en" ? hint : undefined} rows={rows}
    items={value?.[l.code] ?? []} onChange={(items) => onChange({ ...(value ?? { en: [] }), [l.code]: items })} />)}</div>;
}
function ListBox({ id, lang, label, tag, hint, rows, items, onChange }: { id: string; lang: Lang; label: string; tag: string; hint?: string; rows: number; items: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(items.join("\n"));
  const clean = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  // Follow outside changes (moving items, importing) without fighting the typing.
  useEffect(() => { if (clean(text).join("\n") !== items.join("\n")) setText(items.join("\n")); }, [items.join("\n")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field id={id} label={label} tag={tag} hint={hint}>
      <textarea id={id} className="dr-field-input" rows={rows} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} value={text} onChange={(e) => { setText(e.target.value); onChange(clean(e.target.value)); }} />
    </Field>
  );
}

export function Num({ label, value, onChange, min, max, step = 1, hint }: { label: string; value?: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  const id = useId();
  return <Field id={id} label={label} hint={hint}><input id={id} className="dr-field-input" type="number" inputMode="decimal" dir="ltr" min={min} max={max} step={step}
    value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} /></Field>;
}

export function Text({ label, value, onChange, hint, dir = "auto" }: { label: string; value?: string; onChange: (v: string) => void; hint?: string; dir?: "ltr" | "auto" }) {
  const id = useId();
  return <Field id={id} label={label} hint={hint}><input id={id} className="dr-field-input" dir={dir} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
}

export function Sel<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <select id={id} className="dr-field-input" value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Switch id={useId()} label={label} checked={checked} onChange={onChange} />;
}

/** A list the author can add to, reorder and trim. Items are edited in place by `render`. */
export function Items<T>({ items, onChange, render, add, addLabel, itemLabel, min = 0 }: {
  items: T[]; onChange: (v: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => ReactNode;
  add?: () => T; addLabel?: string; itemLabel: (i: number, item: T) => string; min?: number;
}) {
  const { t } = useI18n();
  const set = (i: number, v: T) => onChange(items.map((x, k) => (k === i ? v : x)));
  const move = (i: number, d: -1 | 1) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  return (
    <div className="ed-items">
      {items.map((it, i) => (
        <div key={i} className="ed-item">
          <div className="ed-item-head">
            <strong>{itemLabel(i, it)}</strong>
            <span className="ed-tools">
              <Button size="sm" variant="ghost" iconOnly icon="up" disabled={i === 0} onClick={() => move(i, -1)}>{t("q.up")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>{t("q.down")}</Button>
              <Button size="sm" variant="ghost" iconOnly icon="close" disabled={items.length <= min} onClick={() => onChange(items.filter((_, k) => k !== i))}>{t("cms.remove")}</Button>
            </span>
          </div>
          {render(it, (v) => set(i, v), i)}
        </div>
      ))}
      {add && <Button size="sm" variant="secondary" onClick={() => onChange([...items, add()])}>{addLabel}</Button>}
    </div>
  );
}

const mb = (bytes: number) => Math.round((bytes / 1e6) * 10) / 10;

/** One uploaded file (a video, captions or a kit file): what's there now, and pick or replace it. */
export function Upload({ label, kind, owner, unitId, base, current, onDone, onClear }: {
  label: ReactNode; kind: MediaKind; owner: string; unitId: string; base: string; current?: string;
  onDone: (url: string, bytes: number) => void; onClear: () => void;
}) {
  const { t, num } = useI18n();
  const [pct, setPct] = useState<number | null>(null);
  const [size, setSize] = useState(0);
  const [err, setErr] = useState("");
  const job = useRef<{ cancel: () => void } | null>(null);
  useEffect(() => () => job.current?.cancel(), []);
  const pick = async (file?: File) => {
    setErr("");
    if (!file) return;
    if (!fits(file, kind)) return setErr(t("cms.wrongType", { ext: MEDIA[kind].ext }));
    if (file.size > MEDIA[kind].maxMB * 1e6) return setErr(t("cms.tooBig", { max: MEDIA[kind].maxMB }));
    setSize(file.size); setPct(0);
    const up = uploadMedia(owner, unitId, base, kind, file, setPct);
    job.current = up;
    try { const r = await up.done; onDone(r.url, r.bytes); }
    catch (e) { if ((e as { code?: string }).code !== "storage/canceled") setErr((e as Error).message || t("cms.uploadFailed")); }
    finally { setPct(null); job.current = null; }
  };
  return (
    <div className="ed-upload">
      <span className="dr-field-label">{label}</span>
      {current ? <a href={current} target="_blank" rel="noreferrer noopener" className="ed-file">{t("cms.uploaded")}</a> : <span className="muted small">{t("cms.noFile")}</span>}
      {pct === null ? (
        <span className="row-gap">
          <label className="file-pick"><span>{current ? t("cms.replace") : t("cms.choose", { max: MEDIA[kind].maxMB })}</span>
            <input type="file" accept={MEDIA[kind].accept} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {current && <Button size="sm" variant="ghost" onClick={onClear}>{t("cms.removeFile")}</Button>}
        </span>
      ) : (
        <span className="ed-progress">
          <ProgressBar value={pct} label={t("cms.uploading", { mb: num(mb(size), { maximumFractionDigits: 1 }) })} valueText={`${num(pct)}%`} />
          <Button size="sm" variant="ghost" onClick={() => job.current?.cancel()}>{t("dl.cancel")}</Button>
        </span>
      )}
      {err && <span className="err-text" role="alert">{err}</span>}
    </div>
  );
}
