import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, ProgressBar, dirFor } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { downloadBlob } from "../admin/importer";
import { BUILTIN_CODES, BUILTIN_LANGUAGES, checkTranslation, cleanMessages, placeholdersOf, validateLanguage, type LanguageProblem } from "../content/languages";
import type { LanguageDef } from "../content/types";
import { setLanguages, useI18n, type MessageKey } from "../i18n";
import en from "../i18n/en.json";
import ar from "../i18n/ar.json";
import { cmsApi } from "./api";
import { createTranslation, deleteTranslation, getTranslation, listTranslations, saveTranslation, statusOf, type TranslationDraft } from "./data";
import { LangName, Sel, Text } from "./fields";
import { readTranslations, sheetCsv, sheetRows, sheetXlsx } from "./sheets";
import "../styles/editor.css";
import "./strings";

/** The app's UI strings: what a language translates (the course editor's own strings stay English and Arabic). */
const EN: Record<string, string> = en, AR: Record<string, string> = ar;
const PAGE = 30;

/** Common languages for "Add a language", with their own names (here, not in content/languages.ts, so learners never download the list). Direction comes from the code (dirFor). */
export const COMMON_LANGUAGES: { code: string; native: string; english: string; numerals?: string }[] = [
  { code: "fr", native: "Français", english: "French" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "sw", native: "Kiswahili", english: "Swahili" },
  { code: "ha", native: "Hausa", english: "Hausa" },
  { code: "am", native: "አማርኛ", english: "Amharic" },
  { code: "so", native: "Soomaali", english: "Somali" },
  { code: "fa", native: "فارسی", english: "Persian", numerals: "fa" },
  { code: "ur", native: "اردو", english: "Urdu", numerals: "ur" },
  { code: "ps", native: "پښتو", english: "Pashto", numerals: "ps" },
  { code: "ku", native: "Kurdî", english: "Kurdish" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay" },
  { code: "fil", native: "Filipino", english: "Filipino" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "zh", native: "中文", english: "Chinese" },
];
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
/** A sample of the numbers and dates a locale gives, or null when the browser doesn't know it. */
function localeSample(locale: string) {
  try { return `${new Intl.NumberFormat(locale).format(1234567.5)}, ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(2026, 9, 26))}`; }
  catch { return null; }
}

/**
 * /super/languages: English and Arabic come with the app; platform admins add more here. One-shot list of the drafts
 * (translations/{code}); "Add a language" creates one and opens it for translating.
 */
export function LanguagesPage() {
  const { t, num } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState<TranslationDraft[] | undefined>();
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { listTranslations().then(setList).catch((e: Error) => setErr(e.message)); }, []);
  if (!user) return <main className="screen"><EmptyState title={t("err.notFound")} /></main>;

  const create = async (def: LanguageDef) => { await createTranslation(def, user.uid); nav(`/super/languages/${def.code}`); };
  return (
    <>
      <AppBar title={t("cms.lang.title")} onBack={() => nav("/super/content")} backLabel={t("common.back")}
        actions={<Button size="sm" icon="edit" onClick={() => setAdding(!adding)}>{t("cms.lang.add")}</Button>} />
      <main className="screen wide stack-lg ed">
        <p className="muted">{t("cms.lang.intro")}</p>
        {err && <p className="notice err" role="alert">{err}</p>}
        {adding && <AddLanguage taken={[...BUILTIN_CODES, ...(list ?? []).map((d) => d.code)]} onCreate={create} onCancel={() => setAdding(false)} />}
        <ol className="ed-units">
          {BUILTIN_LANGUAGES.map((l) => (
            <li key={l.code} className="ed-unit">
              <div className="ed-item-head"><strong className="ed-unit-title"><LangName name={l.native} code={l.code} /></strong><span className="pill">{t("cms.lang.builtIn")}</span></div>
              <p className="muted small">{[l.english, t("cms.lang.builtInBody")].join(t("common.sep"))}</p>
            </li>
          ))}
          {!list ? <li><div className="loading" aria-busy="true" /></li> : list.map((d) => {
            const c = checkTranslation(d.messages ?? {}, EN), st = statusOf(d);
            return (
              <li key={d.code} className="ed-unit">
                <div className="ed-item-head">
                  <a className="ed-unit-title" href={`/super/languages/${d.code}`} onClick={(e) => { e.preventDefault(); nav(`/super/languages/${d.code}`); }}><LangName name={d.native} code={d.code} /></a>
                  <span className={`ed-status is-${st}`}>{t(`cms.status.${st}` as MessageKey, { n: d.published?.version ?? 0 })}</span>
                </div>
                <p className="muted small">{[d.english, d.code].join(t("common.sep"))}</p>
                <ProgressBar value={pct(c.done, c.total)} label={t("cms.lang.progress", { done: c.done, total: c.total })} valueText={num(pct(c.done, c.total) / 100, { style: "percent" })} />
                <div className="ed-toolbar"><Button size="sm" variant="secondary" icon="edit" onClick={() => nav(`/super/languages/${d.code}`)}>{t("cms.open")}</Button></div>
              </li>
            );
          })}
        </ol>
      </main>
    </>
  );
}

const PROBLEM: Record<LanguageProblem, MessageKey> = {
  code: "cms.lang.bad.code", builtIn: "cms.lang.bad.builtIn", native: "cms.lang.bad.native", english: "cms.lang.bad.english", dir: "cms.lang.bad.dir",
  numerals: "cms.lang.bad.numerals", messages: "cms.lang.bad.messages", tooLong: "cms.lang.bad.tooLong", empty: "cms.lang.bad.empty",
};
const fromPreset = (p?: (typeof COMMON_LANGUAGES)[number]): LanguageDef =>
  p ? { code: p.code, native: p.native, english: p.english, dir: dirFor(p.code), numerals: p.numerals ?? p.code } : { code: "", native: "", english: "", dir: "ltr", numerals: "" };

/** The language's names, writing direction and number format: shared by "Add a language" and the translate screen. */
function LanguageFields({ def, onChange, codeLocked }: { def: LanguageDef; onChange: (d: LanguageDef) => void; codeLocked?: boolean }) {
  const { t } = useI18n();
  const sample = localeSample(def.numerals);
  return (
    <div className="stack">
      {codeLocked ? <p className="muted small">{t("cms.lang.code")}: <span className="cap-code" dir="ltr">{def.code}</span></p>
        : <Text label={t("cms.lang.code")} hint={t("cms.lang.codeHint")} dir="ltr" value={def.code}
          onChange={(code) => { const c = code.trim().toLowerCase(); onChange({ ...def, code: c, dir: dirFor(c), numerals: def.numerals && def.numerals !== def.code ? def.numerals : c }); }} />}
      <div className="ed-pair">
        <Text label={t("cms.lang.native")} value={def.native} onChange={(native) => onChange({ ...def, native })} />
        <Text label={t("cms.lang.english")} value={def.english} onChange={(english) => onChange({ ...def, english })} />
      </div>
      <fieldset className="ed-fieldset">
        <legend className="dr-field-label">{t("cms.lang.dir")}</legend>
        <div className="ed-seg" role="radiogroup" aria-label={t("cms.lang.dir")}>
          {(["ltr", "rtl"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={def.dir === d} className={`ed-seg-btn${def.dir === d ? " is-on" : ""}`}
            onClick={() => onChange({ ...def, dir: d })}>{t(d === "ltr" ? "cms.lang.ltr" : "cms.lang.rtl")}</button>)}
        </div>
      </fieldset>
      <Text label={t("cms.lang.numerals")} hint={sample ? t("cms.lang.numeralsHint", { example: sample }) : t("cms.lang.bad.numerals")} dir="ltr" value={def.numerals}
        onChange={(numerals) => onChange({ ...def, numerals: numerals.trim() })} />
    </div>
  );
}

function AddLanguage({ taken, onCreate, onCancel }: { taken: string[]; onCreate: (d: LanguageDef) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const options = COMMON_LANGUAGES.filter((l) => !taken.includes(l.code));
  const [pick, setPick] = useState(options[0]?.code ?? "");
  const [def, setDef] = useState<LanguageDef>(() => fromPreset(options[0]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const problems = validateLanguage(def, { x: "x" });
  const isTaken = taken.includes(def.code);
  const go = async () => {
    setBusy(true); setErr("");
    try { await onCreate(def); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="ed-addlang-h">
      <h3 id="ed-addlang-h">{t("cms.lang.add")}</h3>
      <Sel label={t("cms.lang.pick")} value={pick} onChange={(code) => { setPick(code); setDef(fromPreset(COMMON_LANGUAGES.find((l) => l.code === code))); }}
        options={[...options.map((o) => [o.code, `${o.english} (${o.native})`] as const), ["", t("cms.lang.other")] as const]} />
      <LanguageFields def={def} onChange={setDef} codeLocked={pick !== ""} />
      {(isTaken || problems.length > 0) && <ul className="ed-issues">{isTaken ? <li className="err-text">{t("cms.lang.taken")}</li>
        : problems.map((p) => <li key={p} className="err-text">{t(PROBLEM[p])}</li>)}</ul>}
      {err && <p className="notice err" role="alert">{err}</p>}
      <div className="row-gap">
        <Button loading={busy} disabled={isTaken || problems.length > 0} onClick={() => { void go(); }}>{t("cms.lang.create")}</Button>
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </section>
  );
}

type Filter = "all" | "missing" | "fix";
const fieldsOf = (d: TranslationDraft) => ({ native: d.native, english: d.english, dir: d.dir, numerals: d.numerals, messages: d.messages });

/**
 * /super/languages/:code: translate the app's UI strings into one language. Saved as a draft (translations/{code},
 * with a rev check); "Publish" saves, then asks publishLanguage to put it in front of learners.
 */
export function TranslatePage() {
  const { code = "" } = useParams();
  const { t, num } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const [draft, setDraft] = useState<TranslationDraft | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [saved, setSaved] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "delete" | "import">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<"" | "delete" | "unpublish">("");

  useEffect(() => {
    getTranslation(code).then((d) => { if (!d) setLoadErr(t("err.notFound")); else { const x = { ...d, messages: d.messages ?? {} }; setDraft(x); setSaved(JSON.stringify(fieldsOf(x))); } })
      .catch((e: Error) => setLoadErr(e.message));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => !!draft && JSON.stringify(fieldsOf(draft)) !== saved, [draft, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  const check = useMemo(() => checkTranslation(draft?.messages ?? {}, EN), [draft?.messages]);
  const setMessage = useCallback((k: string, v: string) => { setDraft((d) => (d ? { ...d, messages: { ...d.messages, [k]: v } } : d)); setMsg(null); }, []);

  if (loadErr) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={loadErr} action={<Button size="sm" onClick={() => nav("/super/languages")}>{t("common.back")}</Button>} /></main>;
  if (!draft || !user) return <div className="loading" aria-busy="true" />;

  const needle = q.trim().toLowerCase();
  const fix = new Set(check.placeholders), missing = new Set(check.missing);
  const keys = Object.keys(EN).filter((k) => (filter === "all" || (filter === "missing" ? missing.has(k) : fix.has(k)))
    && (!needle || [k, EN[k], AR[k] ?? "", draft.messages[k] ?? ""].some((s) => s.toLowerCase().includes(needle))));
  const st = statusOf(draft);
  const problems = validateLanguage(draft, cleanMessages(draft.messages, EN));

  const save = async (d = draft): Promise<boolean> => {
    setBusy("save"); setMsg(null);
    try {
      const r = await saveTranslation(d, d.rev, user.uid);
      if ("conflict" in r) { setMsg({ ok: false, text: t("cms.lang.conflict") }); return false; }
      const next = { ...d, rev: r.rev };
      setDraft(next); setSaved(JSON.stringify(fieldsOf(next))); setMsg({ ok: true, text: t("cms.saved") });
      return true;
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
    finally { setBusy(""); }
  };
  const publish = async () => {
    if (check.placeholders.length) { setFilter("fix"); setMsg({ ok: false, text: t("cms.lang.publishBlocked", { n: check.placeholders.length }) }); return; }
    if (problems.length) { setMsg({ ok: false, text: problems.map((p) => t(PROBLEM[p])).join(" ") }); return; }
    // Publish what the app can use: keys it has, trimmed. Strings for keys it no longer has are dropped here.
    const clean = { ...draft, messages: cleanMessages(draft.messages, EN) };
    if ((dirty || JSON.stringify(clean.messages) !== JSON.stringify(draft.messages)) && !(await save(clean))) return;
    setBusy("publish"); setMsg(null);
    try {
      const r = await cmsApi.publishLanguage({ code });
      setLanguages(r.languages);
      setDraft((d) => (d ? { ...d, published: { version: r.version, rev: d.rev } } : d));
      setMsg({ ok: true, text: t("cms.lang.published", { n: r.version }) });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  const unpublish = async () => {
    setAsk(""); setBusy("unpublish"); setMsg(null);
    try { const r = await cmsApi.unpublishLanguage({ code }); setLanguages(r.languages); setDraft((d) => (d ? { ...d, published: null } : d)); setMsg({ ok: true, text: t("cms.lang.unpublished") }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  const remove = async () => {
    setAsk(""); setBusy("delete");
    try { await deleteTranslation(code); setSaved(JSON.stringify(fieldsOf(draft))); nav("/super/languages"); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); setBusy(""); }
  };
  const rows = () => sheetRows(code, EN, AR, draft.messages);
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy("import"); setMsg(null);
    try {
      const r = await readTranslations(file, [code, draft.native, draft.english]);
      const known = Object.entries(r.messages).filter(([k]) => k in EN);
      const skipped = Object.keys(r.messages).length - known.length;
      if (!known.length) setMsg({ ok: false, text: t("cms.lang.importNone", { code }) });
      else {
        setDraft((d) => (d ? { ...d, messages: { ...d.messages, ...Object.fromEntries(known) } } : d));
        setMsg({ ok: true, text: [t("cms.lang.imported", { n: known.length }), skipped ? t("cms.lang.importSkipped", { n: skipped }) : ""].filter(Boolean).join(" ") });
      }
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };

  return (
    <>
      <AppBar title={draft.native || code} onBack={() => { if (!dirty || confirm(t("cms.leaveConfirm"))) nav("/super/languages"); }} backLabel={t("common.back")}
        actions={<span className={`ed-status is-${st}`}>{t(`cms.status.${st}` as MessageKey, { n: draft.published?.version ?? 0 })}</span>} />
      <main className="screen wide stack-lg ed">
        <details className="panel ed-more">
          <summary>{t("cms.lang.details")}</summary>
          <LanguageFields def={draft} codeLocked onChange={(d) => setDraft({ ...draft, ...d, code })} />
        </details>

        <section className="panel stack" aria-labelledby="ed-strings-h">
          <h3 id="ed-strings-h" className="ed-h4">{t("cms.lang.strings")}</h3>
          <ProgressBar value={pct(check.done, check.total)} label={t("cms.lang.progress", { done: check.done, total: check.total })} valueText={num(pct(check.done, check.total) / 100, { style: "percent" })} />
          <div className="ed-filters">
            <div className="dr-field">
              <label htmlFor="ed-lq" className="dr-field-label">{t("cms.lang.search")}</label>
              <input id="ed-lq" type="search" className="dr-field-input" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
            </div>
            <div className="ed-filter" role="group" aria-label={t("cms.lang.show")}>
              {([["all", "cms.lang.filter.all", check.total], ["missing", "cms.lang.filter.missing", check.missing.length], ["fix", "cms.lang.filter.fix", check.placeholders.length]] as const).map(([f, key, n]) => (
                <button key={f} type="button" className={`ed-chip${filter === f ? " is-on" : ""}`} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }}>{`${t(key)} (${num(n)})`}</button>
              ))}
            </div>
          </div>
          {keys.length === 0 ? <p className="muted">{t("cms.lang.noMatch")}</p> : (
            <ol className="ed-strings">
              {keys.slice(0, shown).map((k) => <StringRow key={k} k={k} value={draft.messages[k] ?? ""} code={code} dir={draft.dir} name={draft.english} onChange={setMessage} />)}
            </ol>
          )}
          {keys.length > shown && <Button variant="secondary" onClick={() => setShown(shown + PAGE)}>{t("cms.lang.more", { n: keys.length - shown })}</Button>}
        </section>

        <section className="panel stack" aria-labelledby="ed-sheet-h">
          <h3 id="ed-sheet-h" className="ed-h4">{t("cms.lang.sheet")}</h3>
          <p className="muted small">{t("cms.lang.sheetHint")}</p>
          <div className="ed-toolbar">
            <Button size="sm" variant="secondary" icon="file" onClick={async () => downloadBlob(await sheetXlsx(rows()), `darsi-${code}.xlsx`)}>{t("cms.lang.xlsx")}</Button>
            <Button size="sm" variant="ghost" icon="file" onClick={() => downloadBlob(sheetCsv(rows()), `darsi-${code}.csv`)}>{t("cms.lang.csv")}</Button>
            <label className="file-pick"><span>{t("cms.lang.import")}</span>
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!!busy}
                onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
          </div>
        </section>
      </main>

      <div className="ed-bar">
        <Button loading={busy === "save"} disabled={!!busy && busy !== "save"} variant={dirty ? "primary" : "secondary"} icon="check" onClick={() => { void save(); }}>{dirty ? t("cms.save") : t("cms.savedShort")}</Button>
        <Button loading={busy === "publish"} disabled={!!busy} variant={dirty ? "secondary" : "primary"} icon="share" onClick={() => { void publish(); }}>{t("cms.publish")}</Button>
        {draft.published ? <Button variant="ghost" disabled={!!busy} onClick={() => setAsk("unpublish")}>{t("cms.unpublish")}</Button>
          : <Button variant="ghost" icon="close" disabled={!!busy} onClick={() => setAsk("delete")}>{t("cms.lang.delete")}</Button>}
        {msg && <p className={msg.ok ? "notice ok ed-confirm" : "notice err ed-confirm"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        {ask && (
          <div className="notice ed-confirm" role="alert">
            <span>{t(ask === "delete" ? "cms.lang.deleteConfirm" : "cms.lang.unpublishConfirm")}</span>
            <Button size="sm" autoFocus onClick={() => { void (ask === "delete" ? remove() : unpublish()); }}>{ask === "delete" ? t("cms.confirmDelete") : t("cms.unpublish")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("common.cancel")}</Button>
          </div>
        )}
      </div>
    </>
  );
}

/** One UI string: its key, the English and Arabic text for reference, and the translation (re-renders only itself). */
const StringRow = memo(function StringRow({ k, value, code, dir, name, onChange }: { k: string; value: string; code: string; dir: "ltr" | "rtl"; name: string; onChange: (k: string, v: string) => void }) {
  const { t } = useI18n();
  const want = placeholdersOf(EN[k]);
  const wrong = value.trim() !== "" && placeholdersOf(value).join() !== want.join();
  const id = `ed-s-${k}`;
  return (
    <li className="ed-string">
      <code className="ed-string-key" dir="ltr">{k}</code>
      <div className="ed-string-ref">
        <p dir="ltr" lang="en"><span className="ed-lang">English</span> {EN[k]}</p>
        {AR[k] && <p dir="rtl" lang="ar"><span className="ed-lang">العربية</span> {AR[k]}</p>}
      </div>
      <label htmlFor={id} className="dr-field-label">{name}</label>
      <textarea id={id} className="dr-field-input" rows={2} dir={dir} lang={code} value={value} aria-invalid={wrong || undefined} onChange={(e) => onChange(k, e.target.value)} />
      {wrong && <span className="err-text">{want.length ? t("cms.lang.keep", { list: want.map((p) => `{${p}}`).join(" ") }) : t("cms.lang.keepNone")}</span>}
    </li>
  );
});
