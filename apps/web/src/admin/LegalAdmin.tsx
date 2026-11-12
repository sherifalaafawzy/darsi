import { useEffect, useId, useState } from "react";
import { Button } from "@darsi/design-system";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { api, type LegalDoc } from "../auth/api";
import { isolate, useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { LoadState, useRead } from "../staff/LoadState";
import { useLeaveGuard } from "../staff/useLeaveGuard";
import { k } from "./governanceStrings";
import { reasonOf } from "./refusals";
import { useTabActive } from "./Tabs";
import "./strings";

/**
 * The privacy notice and the terms of use, for platform admins (functions/src/legal.ts; TECHNICAL.md).
 * Each page has a draft per language and, once published, a version everyone reads and new sign-ups accept. This
 * screen edits the English and Arabic texts as plain text; other languages a draft may hold are left as they are
 * (saveLegal replaces only the languages it is sent). It holds no wording of its own, and suggests none: the text is
 * the owner's lawyer's. config/legal is read once when the section opens; after a save the screen shows what the
 * callable answered instead of reading again.
 * Unsaved text is guarded (staff/useLeaveGuard) while this section's tab is the open one; "Leave without saving" puts
 * the boxes back to what is saved, because the section stays mounted behind another tab (admin/Tabs) and would
 * otherwise go on holding every tap with a question nobody can see.
 */
const DOCS: LegalDoc[] = ["privacy", "terms"];
/** One language's text, in characters (functions/src/legalCore.ts MAX_TEXT): said at the field before the server refuses. */
const MAX = 60_000;
interface Entry { draft?: Record<string, unknown>; published?: { version?: unknown; at?: unknown } }
type Config = Partial<Record<LegalDoc, Entry>>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** `onAsk`: the leave question is up, so whoever hides this section (the Records switch) shows it again. */
export function LegalAdmin({ onAsk }: { onAsk?: () => void }) {
  const { t } = useI18n();
  const q = useRead(async () => ((await getDoc(doc(db, "config", "legal"))).data() ?? {}) as Config, []);
  const [dirty, setDirty] = useState<Partial<Record<LegalDoc, boolean>>>({});
  const active = useTabActive();
  const guard = useLeaveGuard(active && DOCS.some((d) => dirty[d]));
  const [reset, setReset] = useState(0);
  const leave = () => { guard.leave(); setReset((n) => n + 1); };
  useEffect(() => { if (guard.asking) onAsk?.(); }, [guard.asking]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack">
      <p className="muted small">{t(k("gv.legal.intro"))}</p>
      <p className="notice"><strong>{t(k("gv.legal.lawyer"))}</strong></p>
      {guard.asking && <InlineConfirm danger title={t(k("gv.leave.title"))} body={t(k("gv.leave.body"))} confirmLabel={t(k("gv.leave.go"))} cancelLabel={t(k("gv.leave.stay"))} onConfirm={leave} onCancel={guard.stay} />}
      <LoadState q={q}>
        {(cfg) => <>{DOCS.map((d) => <DocEditor key={d} doc={d} entry={cfg[d]} reset={reset} onDirty={(on) => setDirty((x) => (!!x[d] === on ? x : { ...x, [d]: on }))} />)}</>}
      </LoadState>
    </div>
  );
}

function DocEditor({ doc: which, entry, reset, onDirty }: { doc: LegalDoc; entry?: Entry; reset: number; onDirty: (dirty: boolean) => void }) {
  const { t, locale } = useI18n();
  const id = useId();
  const name = t(k(which === "privacy" ? "gv.legal.privacy" : "gv.legal.terms"));
  const [pub, setPub] = useState<{ version: number; at: number } | null>(() => {
    const version = Number(entry?.published?.version), at = Number(entry?.published?.at);
    return Number.isInteger(version) && version > 0 ? { version, at: Number.isFinite(at) ? at : 0 } : null;
  });
  const [base, setBase] = useState(() => ({ en: str(entry?.draft?.en), ar: str(entry?.draft?.ar) }));
  const [text, setText] = useState(base);
  const [asking, setAsking] = useState<"" | "publish" | "unpublish">("");
  const [busy, setBusy] = useState<"" | "draft" | "publish" | "unpublish">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const others = Object.keys(entry?.draft ?? {}).filter((l) => l !== "en" && l !== "ar" && str(entry?.draft?.[l]));
  const dirty = text.en !== base.en || text.ar !== base.ar;
  useEffect(() => { onDirty(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Leave without saving" was chosen: back to what is saved.
  useEffect(() => { if (reset) { setText(base); setMsg(null); setAsking(""); } }, [reset]); // eslint-disable-line react-hooks/exhaustive-deps
  const tooLong = text.en.length > MAX || text.ar.length > MAX;
  const noEnglish = !text.en.trim();

  const run = async (what: "draft" | "publish" | "unpublish") => {
    if (busy) return;
    setBusy(what); setMsg(null);
    // Both languages every time: one sent empty is taken out of the draft, which is what clearing its box means.
    const sent = what === "unpublish" ? null : { ...text };
    try {
      if (!sent) {
        await api.saveLegal({ doc: which, unpublish: true });
        setPub(null);
        setMsg({ ok: true, text: t(k("gv.legal.unpublished")) });
      } else {
        const got = await api.saveLegal({ doc: which, text: sent, ...(what === "publish" ? { publish: true } : {}) });
        setBase(sent);
        if (what === "publish" && got.version) { setPub({ version: got.version, at: Date.now() }); setMsg({ ok: true, text: t(k("gv.legal.publishedNow"), { version: got.version }) }); }
        else setMsg({ ok: true, text: t(k("gv.legal.draftSaved")) });
      }
      setAsking("");
    } catch (e) {
      // "legal-file" (functions/src/legal.ts): Firestore has the change, the draft included, but content/legal.json
      // could not be written, so the public page is as it was. Said as that, not as "something went wrong": the same
      // action again writes the file. What is shown as published stays as it was, which is what readers still see.
      const words = errorText(e, t), half = reasonOf(e) === "legal-file";
      if (half && sent) setBase(sent);
      setMsg({ ok: false, text: half ? t(k("gv.legal.fileFailed")) : words }); setAsking("");
    } finally { setBusy(""); }
  };

  const area = (lang: "en" | "ar") => {
    const fid = `${id}-${lang}`, value = text[lang], over = value.length > MAX;
    return (
      <div className={over ? "dr-field has-error" : "dr-field"}>
        <label htmlFor={fid} className="dr-field-label">{t(k(lang === "en" ? "gv.legal.en" : "gv.legal.ar"), { doc: name })}</label>
        <textarea id={fid} className="dr-field-input" rows={10} dir="auto" lang={lang} spellCheck aria-invalid={over ? true : undefined} aria-describedby={`${fid}-hint`}
          value={value} onChange={(e) => { setText((x) => ({ ...x, [lang]: e.target.value })); setMsg(null); }} />
        <span id={`${fid}-hint`} className="dr-field-hint">{over ? t(k("gv.legal.tooLong"), { max: MAX }) : t(k("gv.legal.textHint"), { max: MAX, n: value.length })}</span>
      </div>
    );
  };

  return (
    <div className="stack" role="group" aria-labelledby={`${id}-h`}>
      <h4 id={`${id}-h`}>{name}</h4>
      <p className="small">
        {pub
          ? <strong>{t(k("gv.legal.published"), { version: pub.version, date: pub.at ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(pub.at)) : "—" })}</strong>
          : <span className="muted">{t(k("gv.legal.notPublished"))}</span>}
      </p>
      {area("en")}
      {area("ar")}
      {others.length > 0 && <p className="muted small">{t(k("gv.legal.others"), { langs: others.map(isolate).join(t("common.sep")) })}</p>}
      {noEnglish && (text.ar.trim() || dirty) && <p className="muted small">{t(k("gv.legal.needEnglish"))}</p>}
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {asking === "publish" && <InlineConfirm title={t(k("gv.legal.publishTitle"), { doc: name })} body={t(k("gv.legal.publishBody"))} confirmLabel={t(k("gv.legal.publish"))} busy={busy === "publish"} onConfirm={() => void run("publish")} onCancel={() => setAsking("")} />}
      {asking === "unpublish" && <InlineConfirm danger title={t(k("gv.legal.unpublishTitle"), { doc: name })} body={t(k("gv.legal.unpublishBody"))} confirmLabel={t(k("gv.legal.unpublish"))} busy={busy === "unpublish"} onConfirm={() => void run("unpublish")} onCancel={() => setAsking("")} />}
      {/* The buttons stay (and stay enabled; run() itself refuses a second press) while a question is up: it gives the
          keyboard focus back to the one that opened it. */}
      <div className="row-gap">
        <Button size="sm" variant="secondary" loading={busy === "draft"} disabled={!dirty || tooLong} onClick={() => void run("draft")}>{t(k("gv.legal.saveDraft"))}</Button>
        <Button size="sm" disabled={noEnglish || tooLong} onClick={() => { setMsg(null); setAsking("publish"); }}>{t(k("gv.legal.publish"))}</Button>
        {pub && <Button size="sm" variant="ghost" onClick={() => { setMsg(null); setAsking("unpublish"); }}>{t(k("gv.legal.unpublish"))}</Button>}
        {dirty && <span className="muted small" role="status">{t(k("gv.unsaved"))}</span>}
      </div>
    </div>
  );
}
