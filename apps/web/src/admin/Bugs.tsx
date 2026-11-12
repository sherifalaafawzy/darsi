import { useState } from "react";
import { Link } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n, type MessageKey } from "../i18n";
import { api } from "../auth/api";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote } from "../staff/LoadState";
import { bugShotUrl, setBugStatus, useBugReports, type BugReport } from "./data";
import { k } from "./governanceStrings";
import { Tabs, TabPanel, useTab, type TabDef } from "./Tabs";
import "../styles/admin.css";
import "./strings";

/**
 * /super/bugs: what people sent with "Report a problem" (TECHNICAL.md "Problem reports"), newest first, the new ones by
 * default. Read once when opened, a page at a time; a screenshot downloads only when someone opens it. "Copy the
 * details" puts the whole report on the clipboard as JSON, to paste into a ticket or a coding assistant. "Delete
 * report" removes one for good, screenshot included (the deleteBugReport callable: a report can hold someone's
 * private details), after a question on the page.
 */
const PAGE = 30;
const ROLES = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const STATUS: Record<BugReport["status"], MessageKey> = { new: "bg.statusNew", fixed: "bg.statusFixed", closed: "bg.statusClosed" };

type Log = { entries?: { t: number; kind: string; msg: string }[]; pages?: { t: number; path: string }[] };
const get = (o: unknown, ...keys: string[]) => keys.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);

/** "Chrome 141, Android 14 — 375 × 812 @3×": the browser and screen at a glance; the full details are below. */
export function deviceLine(d: Record<string, unknown>): string {
  const ua = String(get(d, "device", "ua") ?? "");
  const browser = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /SamsungBrowser\/(\d+)/.exec(ua) ? `Samsung Internet ${/SamsungBrowser\/(\d+)/.exec(ua)![1]}`
    : /(?:Chrome|CriOS)\/(\d+)/.exec(ua) ? `Chrome ${/(?:Chrome|CriOS)\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Version\/(\d+)[\d.]* .*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : "";
  const os = /Android (\d+)/.exec(ua) ? `Android ${/Android (\d+)/.exec(ua)![1]}` : /iPhone OS (\d+)/.exec(ua) ? `iOS ${/iPhone OS (\d+)/.exec(ua)![1]}` : /iPad/.test(ua) ? "iPadOS"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const vp = get(d, "device", "viewport") as number[] | undefined, dpr = get(d, "device", "dpr");
  return [[browser, os].filter(Boolean).join(", "), Array.isArray(vp) ? `${vp[0]} × ${vp[1]}${dpr ? ` @${dpr}×` : ""}` : ""].filter(Boolean).join(" — ");
}

function Report({ r, onChanged, onDeleted }: { r: BugReport; onChanged: () => void; onDeleted: () => void }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [shot, setShot] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState(false);
  // One write at a time per report: a status being saved, or the report being deleted.
  const [busy, setBusy] = useState<BugReport["status"] | "delete" | null>(null);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = r.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.createdAt.seconds * 1000)) : "";
  const log = (r.details.log ?? {}) as Log;
  const errors = (log.entries ?? []).slice(-6).reverse();
  const net = r.details.network as Record<string, unknown> | undefined;

  const status = async (s: BugReport["status"]) => {
    if (!user || busy) return;
    setBusy(s); setErr(null);
    try { await setBugStatus(r.id, s, user.uid); onChanged(); } catch (e) { setErr(errorText(e, t)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy("delete"); setErr(null);
    // The list is read again and this report leaves it: the page says what happened (onDeleted), not this card.
    try { await api.deleteBugReport({ id: r.id }); onDeleted(); } catch (e) { setErr(errorText(e, t)); } finally { setBusy(null); setAsking(false); }
  };
  const copy = async () => {
    const all = { id: r.id, status: r.status, at: r.createdAt ? new Date(r.createdAt.seconds * 1000).toISOString() : null, text: r.text, url: r.url, user: r.user, shot: r.shot, server: r.server, details: r.details };
    try { await navigator.clipboard.writeText(JSON.stringify(all, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr(t("bg.copyFailed")); }
  };
  const openShot = async () => {
    if (!r.shot) return;
    setShotErr(false);
    try { setShot(await bugShotUrl(r.shot.path)); } catch { setShotErr(true); }
  };

  return (
    <article className="panel stack">
      <p className="muted small">
        <span className="pill">{t(STATUS[r.status] ?? "bg.statusNew")}</span>{" "}
        {when}{t("common.sep")}
        {r.user ? <Link className="person-link" to={`/super/people/${r.user.uid}`}><bdi>{r.user.name || r.user.email || r.user.uid}</bdi></Link> : t("bg.guest")}
        {r.user && <>{t("common.sep")}{ROLES.includes(r.user.role) ? t(`rn.${r.user.role}` as MessageKey) : r.user.role}</>}
      </p>
      <p className="bug-report-text">{r.text}</p>
      <p className="small"><b>{t("bg.page")}:</b> <bdi dir="ltr"><code>{r.path || "—"}</code></bdi></p>
      <p className="small"><b>{t("bg.device")}:</b> <bdi dir="ltr">{deviceLine(r.details) || "—"}</bdi>
        {net && <>{t("common.sep")}{net.online === false ? t("bg.offline") : t("bg.online")}{net.effectiveType ? ` (${String(net.effectiveType)})` : ""}{net.saveData ? `${t("common.sep")}${t("bg.saveData")}` : ""}</>}
      </p>

      {r.shot ? (shot
        ? <a href={shot} target="_blank" rel="noreferrer"><img className="bug-report-shot" src={shot} alt={t("bg.shot")} /></a>
        : <div><Button size="sm" variant="secondary" icon="image" onClick={() => void openShot()}>{t("bg.openShot")}</Button>{shotErr && <span className="err-text"> {t("bg.shotFailed")}</span>}</div>)
        : <p className="muted small">{t("bg.noShot")}</p>}

      <div>
        <p className="small"><b>{t("bg.errors")}</b></p>
        {errors.length
          ? <ul className="bug-report-log" dir="ltr">{errors.map((e, i) => <li key={i}><code>{e.kind}</code> {e.msg}</li>)}</ul>
          : <p className="muted small">{t("bg.noErrors")}</p>}
      </div>
      <details>
        <summary className="bug-report-more">{t("bg.details")}</summary>
        <pre className="bug-report-json" dir="ltr">{JSON.stringify({ url: r.url, user: r.user, shot: r.shot, server: r.server, ...r.details }, null, 2)}</pre>
      </details>
      {err && <p className="err-text" role="alert">{err}</p>}
      {asking && <InlineConfirm danger title={t(k("gv.bug.deleteTitle"))} body={t(k("gv.bug.deleteBody"))} confirmLabel={t(k("gv.bug.deleteConfirm"))} busy={busy === "delete"} onConfirm={() => void remove()} onCancel={() => setAsking(false)} />}
      <div className="row-gap">
        {/* While one of them saves, the others wait: two status writes at once would leave whichever landed last. */}
        {r.status !== "fixed" && <Button size="sm" loading={busy === "fixed"} disabled={!!busy && busy !== "fixed"} onClick={() => void status("fixed")}>{t("bg.markFixed")}</Button>}
        {r.status !== "closed" && <Button size="sm" variant="secondary" loading={busy === "closed"} disabled={!!busy && busy !== "closed"} onClick={() => void status("closed")}>{t("bg.close")}</Button>}
        {r.status !== "new" && <Button size="sm" variant="ghost" loading={busy === "new"} disabled={!!busy && busy !== "new"} onClick={() => void status("new")}>{t("bg.reopen")}</Button>}
        <Button size="sm" variant="ghost" icon={copied ? "check" : "file"} onClick={() => void copy()}>{copied ? t("bg.copied") : t("bg.copy")}</Button>
        <Button size="sm" variant="ghost" icon="cross" disabled={!!busy && busy !== "delete"} onClick={() => { setErr(null); setAsking(true); }}>{t(k("gv.bug.delete"))}</Button>
      </div>
    </article>
  );
}

export function BugsPage() {
  const { t } = useI18n();
  // New and All are the page's tabs (admin/Tabs): /super/bugs and ?tab=all, one list under them.
  const TABS: TabDef[] = [{ id: "new", label: t("bg.new") }, { id: "all", label: t("bg.all") }];
  const st = useTab(TABS);
  const onlyNew = st.tab !== "all";
  // "Show more" counts for the tab it was pressed on: the other tab (Back and Forward too) starts at one page again.
  // Worked out while rendering, not in an effect, so a new tab never reads once with the old tab's larger page first.
  const [more, setMore] = useState({ tab: st.tab, max: PAGE });
  if (more.tab !== st.tab) setMore({ tab: st.tab, max: PAGE });
  const max = more.tab === st.tab ? more.max : PAGE;
  const list = useBugReports(onlyNew, max);
  // The other tab's rows are not this tab's: while its own are being read, the list says it is loading (usePaged
  // keeps the older rows meanwhile; Refresh and Show more are not `loading`, so the rows stay on screen for them).
  const ready = !!list.data && !list.loading;
  const rows = ready ? list.data! : [];
  const [deleted, setDeleted] = useState(false);
  return (
    <>
      <AppBar title={t("bg.title")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("bg.intro")}</p>
        {/* Refresh reads the open tab's list again: an action, so a button above the tabs, not one of them. */}
        <div><Button size="sm" variant="ghost" icon="sync" onClick={() => { setDeleted(false); list.reload(); }}>{t("bg.refresh")}</Button></div>
        {deleted && <p className="notice ok" role="status">{t(k("gv.bug.deleted"))}</p>}
        <Tabs label={t("bg.title")} tabs={TABS}>
          {/* One panel, named after the open tab: the list is the same component under both, never remounted. */}
          <TabPanel id={st.tab}>
            {/* Nor is the other tab's failed read this tab's: its error goes while this tab's own rows are being read. */}
            {list.error && !list.loading && <ErrorNote error={list.error} reload={list.reload} />}
            {!ready && (list.loading || !list.error) && <div className="loading" aria-busy="true" />}
            {ready && !rows.length && <EmptyState icon="check" title={onlyNew ? t("bg.noneNew") : t("bg.none")} />}
            {rows.map((r) => <Report key={r.id} r={r} onChanged={() => { setDeleted(false); list.reload(); }} onDeleted={() => { setDeleted(true); list.reload(); }} />)}
            {rows.length === max && <div><Button variant="secondary" onClick={() => setMore({ tab: st.tab, max: max + PAGE })}>{t("bg.more")}</Button></div>}
          </TabPanel>
        </Tabs>
      </main>
    </>
  );
}
