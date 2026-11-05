import { useState } from "react";
import { Link } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n, type MessageKey } from "../i18n";
import { bugShotUrl, setBugStatus, useBugReports, type BugReport } from "./data";
import "../styles/admin.css";
import "./strings";

/**
 * /super/bugs: what people sent with "Report a problem" (TECHNICAL.md "Problem reports"), newest first, the new ones by
 * default. Read once when opened, a page at a time; a screenshot downloads only when someone opens it. "Copy the
 * details" puts the whole report on the clipboard as JSON, to paste into a ticket or a coding assistant.
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

function Report({ r, onChanged }: { r: BugReport; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [shot, setShot] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState(false);
  const [busy, setBusy] = useState<BugReport["status"] | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = r.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.createdAt.seconds * 1000)) : "";
  const log = (r.details.log ?? {}) as Log;
  const errors = (log.entries ?? []).slice(-6).reverse();
  const net = r.details.network as Record<string, unknown> | undefined;

  const status = async (s: BugReport["status"]) => {
    if (!user) return;
    setBusy(s); setErr(null);
    try { await setBugStatus(r.id, s, user.uid); onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
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
        {r.user && <>{t("common.sep")}{ROLES.includes(r.user.role) ? t(`role.${r.user.role}` as MessageKey) : r.user.role}</>}
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
      <div className="row-gap">
        {r.status !== "fixed" && <Button size="sm" loading={busy === "fixed"} onClick={() => void status("fixed")}>{t("bg.markFixed")}</Button>}
        {r.status !== "closed" && <Button size="sm" variant="secondary" loading={busy === "closed"} onClick={() => void status("closed")}>{t("bg.close")}</Button>}
        {r.status !== "new" && <Button size="sm" variant="ghost" loading={busy === "new"} onClick={() => void status("new")}>{t("bg.reopen")}</Button>}
        <Button size="sm" variant="ghost" icon={copied ? "check" : "file"} onClick={() => void copy()}>{copied ? t("bg.copied") : t("bg.copy")}</Button>
      </div>
    </article>
  );
}

export function BugsPage() {
  const { t } = useI18n();
  const [onlyNew, setOnlyNew] = useState(true);
  const [max, setMax] = useState(PAGE);
  const list = useBugReports(onlyNew, max);
  const rows = list.data ?? [];
  return (
    <>
      <AppBar title={t("bg.title")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("bg.intro")}</p>
        <div className="row-gap" role="group" aria-label={t("bg.title")}>
          <Button size="sm" variant={onlyNew ? "primary" : "ghost"} aria-pressed={onlyNew} onClick={() => { setOnlyNew(true); setMax(PAGE); }}>{t("bg.new")}</Button>
          <Button size="sm" variant={onlyNew ? "ghost" : "primary"} aria-pressed={!onlyNew} onClick={() => { setOnlyNew(false); setMax(PAGE); }}>{t("bg.all")}</Button>
          <Button size="sm" variant="ghost" icon="sync" onClick={list.reload}>{t("bg.refresh")}</Button>
        </div>
        {list.error && <p className="notice err">{list.error.message}</p>}
        {!list.data && !list.error && <div className="loading" aria-busy="true" />}
        {list.data && !rows.length && <EmptyState icon="check" title={onlyNew ? t("bg.noneNew") : t("bg.none")} />}
        {rows.map((r) => <Report key={r.id} r={r} onChanged={list.reload} />)}
        {rows.length === max && <div><Button variant="secondary" onClick={() => setMax(max + PAGE)}>{t("bg.more")}</Button></div>}
      </main>
    </>
  );
}
