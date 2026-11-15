import { useEffect, useMemo, useRef, useState } from "react";
import { Button, TextField } from "@darsi/design-system";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { api, type RetentionCounts, type RetentionPeriods } from "../auth/api";
import { useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { LoadState, useRead } from "../staff/LoadState";
import { useLeaveGuard } from "../staff/useLeaveGuard";
import { k } from "./governanceStrings";
import { latinDigits } from "./typedNumber";
import { useTabActive } from "./Tabs";
import "./strings";

/**
 * How long each kind of record is kept before the nightly clean-up deletes it, for platform admins
 * (functions/src/retention.ts; TECHNICAL.md). One field per period of config/retention.periods, in
 * whole days; an empty field is "kept until deleted by hand", which is how every field starts: this screen chooses no
 * period and suggests none. Nothing is saved before the admin has seen what it would delete: "Check and save" asks
 * previewRetention with the typed periods, shows the count per kind, and saves at once only when every count is zero;
 * otherwise it asks first. The last run comes from stats/jobs.retentionJob. Both documents are read once on opening.
 * Unsaved periods are guarded as the legal pages' text is (admin/LegalAdmin.tsx): reload, closing the tab, a link or
 * Back asks first while the section's tab is the open one, and "Leave without saving" puts the fields back to what is
 * saved, since the section stays mounted behind another one (admin/Ledger.tsx keeps it).
 */
const KEYS = ["bugReportsClosedDays", "bugReportsAnyDays", "analyticsDevicesDays", "checkoutsOpenDays", "joinAttemptsDays", "auditDays", "orgExportsDays"] as const;
type Key = (typeof KEYS)[number];
const CATS = ["bugReports", "analyticsDevices", "checkouts", "joinAttempts", "audit", "orgExports"] as const;
type Cat = (typeof CATS)[number];
/** The server's limit (functions/src/retentionCore.ts MAX_DAYS): about ten years. */
const MAX_DAYS = 3650;
type Form = Record<Key, string>;
interface LastRun { at?: unknown; ok?: unknown; stopped?: unknown; deleted?: Partial<Record<Cat, unknown>>; failed?: unknown }

const valid = (v: string) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_DAYS);
const formOf = (p: unknown): Form => Object.fromEntries(KEYS.map((key) => {
  const v = (p && typeof p === "object" ? (p as Record<string, unknown>)[key] : null);
  return [key, typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_DAYS ? String(v) : ""];
})) as Form;
const periodsOf = (f: Form): RetentionPeriods => Object.fromEntries(KEYS.map((key) => [key, f[key] ? Number(f[key]) : null]));

/** `onAsk`: the leave question is up, so whoever hides this section (the Records switch) shows it again. */
export function RetentionAdmin({ onAsk }: { onAsk?: () => void }) {
  const q = useRead(async () => {
    const [cfg, jobs] = await Promise.all([getDoc(doc(db, "config", "retention")), getDoc(doc(db, "stats", "jobs"))]);
    return { periods: (cfg.data() ?? {}).periods as unknown, last: ((jobs.data() ?? {}).retentionJob ?? null) as LastRun | null };
  }, []);
  return <LoadState q={q}>{(data) => <Loaded start={data} onAsk={onAsk} />}</LoadState>;
}

function Loaded({ start, onAsk }: { start: { periods: unknown; last: LastRun | null }; onAsk?: () => void }) {
  const { t, locale, num } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(() => formOf(start.periods));
  const [form, setForm] = useState(base);
  // The count, with the periods it was asked for: those, and no others, are what a yes then saves.
  const [preview, setPreview] = useState<{ counts: RetentionCounts; partial: boolean; periods: RetentionPeriods } | null>(null);
  // What is in the fields now, for an answer that arrives after someone typed again.
  const typed = useRef(base);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<"" | "check" | "save">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = KEYS.some((key) => form[key] !== base[key]);
  const invalid = KEYS.some((key) => !valid(form[key]));
  // A count belongs to the periods it was asked with: typing again takes it (and its question) away.
  const edit = (key: Key, v: string) => { setForm((f) => ({ ...f, [key]: latinDigits(v).trim() })); setPreview(null); setAsking(false); setMsg(null); };
  const active = useTabActive();
  const guard = useLeaveGuard(active && dirty);
  const leave = () => { guard.leave(); setForm(base); setPreview(null); setAsking(false); setMsg(null); };
  // The question is asked in the section: whoever hid it shows it again. Hidden with nobody to show it, nobody would
  // see the question, and every tap would be held: the tap goes on then, with the fields kept as typed.
  useEffect(() => {
    if (!guard.asking) return;
    if (onAsk) onAsk();
    else if (box.current?.closest("[hidden]")) guard.leave();
  }, [guard.asking]); // eslint-disable-line react-hooks/exhaustive-deps

  typed.current = form;

  const save = async (periods: RetentionPeriods) => {
    setBusy("save"); setMsg(null);
    try {
      const got = await api.saveRetention({ periods });
      const now = formOf(got.periods);
      setBase(now); setForm(now); setAsking(false);
      setMsg({ ok: true, text: t(k("gv.ret.saved")) });
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); setAsking(false); } finally { setBusy(""); }
  };
  const check = async () => {
    if (busy || invalid || !dirty) return;
    setBusy("check"); setMsg(null); setPreview(null);
    const periods = periodsOf(form);
    let got: { counts: RetentionCounts; partial?: boolean };
    try { got = await api.previewRetention({ periods }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, t) }); setBusy(""); return; }
    // A field was changed while the count was on its way: this count is for other periods than the ones now typed.
    // Showing it (and a yes that saved the new ones, counted by nobody) would delete what the admin never saw.
    if (KEYS.some((key) => typed.current[key] !== form[key])) { setBusy(""); return; }
    setPreview({ counts: got.counts, partial: got.partial === true, periods });
    // Something would go (or the count ran out of time, so something may): the admin says yes first.
    if (got.partial === true || CATS.some((c) => (got.counts[c] ?? 0) > 0)) { setAsking(true); setBusy(""); return; }
    await save(periods);
  };

  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const last = start.last, lastAt = Number(last?.at);
  const deleted = CATS.filter((c) => Number(last?.deleted?.[c]) > 0).map((c) => `${t(k(`gv.ret.cat.${c}`))}: ${num(Number(last?.deleted?.[c]))}`);
  const failed = (Array.isArray(last?.failed) ? last.failed : []).filter((c): c is Cat => (CATS as readonly unknown[]).includes(c)).map((c) => t(k(`gv.ret.cat.${c}`)));
  const hits = preview ? CATS.filter((c) => (preview.counts[c] ?? 0) > 0) : [];

  return (
    <div className="stack" ref={box}>
      <p className="muted small">{t(k("gv.ret.intro"))}</p>
      {guard.asking && <InlineConfirm danger title={t(k("gv.leave.title"))} body={t(k("gv.leave.body"))} confirmLabel={t(k("gv.leave.go"))} cancelLabel={t(k("gv.leave.stay"))} onConfirm={leave} onCancel={guard.stay} />}
      <div className="form-grid">
        {KEYS.map((key) => {
          const name = t(k(`gv.ret.p.${key}`));
          return <TextField key={key} label={t(k("gv.ret.days"), { name })} hint={t(k(`gv.ret.h.${key}`))} error={valid(form[key]) ? undefined : t(k("gv.ret.bad"))}
            inputMode="numeric" dir="ltr" maxLength={4} placeholder={t(k("gv.ret.forever"))} value={form[key]} onChange={(e) => edit(key, e.target.value)} />;
        })}
      </div>
      <p className="muted small">{t(k("gv.ret.nightly"))}</p>

      {preview && (
        <div className="stack-sm" role="status">
          <strong>{t(k("gv.ret.previewTitle"))}</strong>
          {hits.length
            ? <ul>{hits.map((c) => <li key={c}>{t(k(`gv.ret.would.${c}`), { n: preview.counts[c] })}</li>)}</ul>
            : <span className="muted">{t(k("gv.ret.wouldNothing"))}</span>}
          {preview.partial && <span className="err-text">{t(k("gv.ret.partial"))}</span>}
        </div>
      )}
      {asking && <InlineConfirm danger title={t(k("gv.ret.confirmTitle"))} body={t(k("gv.ret.confirmBody"))} confirmLabel={t(k("gv.ret.confirm"))} busy={busy === "save"}
        onConfirm={() => { if (preview) void save(preview.periods); }} onCancel={() => { setAsking(false); setMsg({ ok: true, text: t(k("gv.ret.notSaved")) }); }} />}
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <div className="row-gap">
        <Button loading={busy === "check" || (busy === "save" && !asking)} disabled={!dirty || invalid} onClick={() => void check()}>{t(k("gv.ret.save"))}</Button>
        {dirty && <span className="muted small" role="status">{t(k("gv.unsaved"))}</span>}
      </div>

      <div className="stack-sm">
        {Number.isFinite(lastAt) && lastAt > 0 ? (
          <>
            <strong>{t(k("gv.ret.lastRun"), { date: when.format(new Date(lastAt)) })}</strong>
            <span className="muted small">{deleted.length ? t(k("gv.ret.lastDeleted"), { list: deleted.join(t("common.sep")) }) : t(k("gv.ret.lastNothing"))}</span>
            {failed.length > 0 && <span className="err-text">{t(k("gv.ret.lastFailed"), { list: failed.join(t("common.sep")) })}</span>}
            {last?.stopped === true && <span className="muted small">{t(k("gv.ret.lastStopped"))}</span>}
          </>
        ) : <span className="muted small">{t(k("gv.ret.lastNone"))}</span>}
      </div>
    </div>
  );
}
