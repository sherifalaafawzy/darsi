import { useMemo } from "react";
import { Button } from "@darsi/design-system";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { BUILD } from "../build";
import { useI18n } from "../i18n";
import { LoadState, useRead } from "../staff/LoadState";
import { actionWords, detailText } from "./auditLog";
import { k } from "./governanceStrings";
import "./strings";

/**
 * Is the platform healthy? For platform admins, from what the functions already leave behind:
 * - this build, and the builds phones reported errors from today and yesterday (analytics/{day}.errBuild and err);
 * - the scheduled jobs' heartbeats (stats/jobs: each job writes {at, ok, …} when it ends), late when older than twice
 *   the job's interval, when the last run failed (ok: false) or didn't get through everyone (complete: false);
 * - the newest audit entries that someone should look at (an address that stopped working, an organization with its
 *   own address renamed, a payment not matched or not applied);
 * - what the report-only Content-Security-Policy would have blocked (stats/csp, running totals by directive).
 * Everything is read once when the section opens (five documents and one page of the audit log) and again only on
 * Refresh: no listeners, no timer.
 */
const HOUR = 3600e3;
/** Each job and how old its last run may be: twice its interval, with the daily ones given two hours' grace. */
export const JOBS = [
  { id: "statsJob", lateMs: 26 * HOUR },
  { id: "dailyNudges", lateMs: 2 * HOUR },
  { id: "sitesJob", lateMs: HOUR / 2 },
  { id: "retentionJob", lateMs: 26 * HOUR },
  // School sign-in's upkeep (functions/src/sso.ts ssoJob, daily at 02:30 UTC): sessions that ran out, keys, endpoints
  // that moved, client secrets about to expire. A step that failed leaves ok: false with which one.
  { id: "ssoJob", lateMs: 26 * HOUR },
] as const;
type JobId = (typeof JOBS)[number]["id"];
type Beat = { at?: unknown; ok?: unknown; complete?: unknown; error?: unknown };
export type JobState = "ok" | "late" | "failed" | "incomplete" | "never";
/** A heartbeat's state. Age first: an old heartbeat is late whatever it said then; then what the last run said. */
export function jobState(beat: Beat | undefined, lateMs: number, now: number): JobState {
  const at = Number(beat?.at);
  if (!beat || !Number.isFinite(at) || at <= 0) return "never";
  if (now - at > lateMs) return "late";
  if (beat.ok === false) return "failed";
  if (beat.complete === false) return "incomplete";
  return "ok";
}

/** The entries someone should act on. */
const ATTENTION = new Set(["siteLost", "orgRebrand", "paymentUnapplied", "paymentUnmatched"]);
/**
 * How far back the audit log is looked through for them. Asking Firestore for these four actions newest first would
 * need an index on (action, at) that the project doesn't have; the newest entries by time need none.
 */
const SCAN = 200, SHOW = 20;
const OTHER = "other";
const dayId = (ms: number) => new Date(ms).toISOString().slice(0, 10);
type Counts = Record<string, number>;
const counts = (v: unknown): Counts => Object.fromEntries(Object.entries(v && typeof v === "object" ? (v as Record<string, unknown>) : {}).flatMap(([key, n]) => (typeof n === "number" && n > 0 ? [[key, n]] : [])));
type Row = Record<string, unknown> & { id: string; at?: { seconds: number } | null };

async function load() {
  const now = Date.now();
  const [jobs, csp, today, yesterday, audit] = await Promise.all([
    getDoc(doc(db, "stats", "jobs")), getDoc(doc(db, "stats", "csp")),
    getDoc(doc(db, "analytics", dayId(now))), getDoc(doc(db, "analytics", dayId(now - 24 * HOUR))),
    getDocs(query(collection(db, "audit"), orderBy("at", "desc"), limit(SCAN))),
  ]);
  const day = (d: { data: () => Record<string, unknown> | undefined }) => { const x = d.data() ?? {}; return { builds: counts(x.errBuild), n: Number((x.err as { n?: unknown } | undefined)?.n) || 0 }; };
  const { at: cspAt, ...directives } = (csp.data() ?? {}) as Record<string, unknown>;
  return {
    now, jobs: (jobs.data() ?? {}) as Partial<Record<JobId, Beat>>,
    csp: { at: Number(cspAt) || 0, counts: counts(directives) },
    today: day(today), yesterday: day(yesterday),
    attention: audit.docs.map((d) => ({ ...d.data(), id: d.id }) as Row).filter((r) => ATTENTION.has(String(r.action))).slice(0, SHOW),
  };
}

export function PlatformStatus() {
  const { t, locale, num } = useI18n();
  const q = useRead(load, []);
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  return (
    <div className="stack">
      <div className="row-gap">
        <Button size="sm" variant="ghost" icon="sync" onClick={q.reload}>{t(k("gv.refresh"))}</Button>
        {q.data && <span className="muted small" role="status">{t(k("gv.stat.readAt"), { time: when.format(new Date(q.data.now)) })}</span>}
      </div>
      <p className="small"><b>{t(k("gv.stat.build"))}:</b> <code dir="ltr">{BUILD}</code> <span className="muted">{t(k("gv.stat.buildHint"))}</span></p>
      <LoadState q={q}>
        {(s) => {
          const builds = [...new Set([...Object.keys(s.today.builds), ...Object.keys(s.yesterday.builds)])]
            .sort((a, b) => (a === OTHER ? 1 : 0) - (b === OTHER ? 1 : 0) || (s.today.builds[b] ?? 0) - (s.today.builds[a] ?? 0) || (s.yesterday.builds[b] ?? 0) - (s.yesterday.builds[a] ?? 0) || a.localeCompare(b));
          const directives = Object.keys(s.csp.counts).sort((a, b) => s.csp.counts[b] - s.csp.counts[a] || a.localeCompare(b));
          return (
            <>
              <div className="stack-sm">
                <h4>{t(k("gv.stat.errs"))}</h4>
                <span className="muted small">{t(k("gv.stat.errsHint"))}</span>
                {builds.length || s.today.n || s.yesterday.n ? (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>{t(k("gv.stat.colBuild"))}</th><th className="num">{t(k("gv.stat.today"))}</th><th className="num">{t(k("gv.stat.yesterday"))}</th></tr></thead>
                    <tbody>
                      {builds.map((b) => (
                        <tr key={b}>
                          <td data-cell="main" data-label={t(k("gv.stat.colBuild"))}><span>{b === OTHER ? t(k("gv.stat.otherBuilds")) : <code dir="ltr">{b}</code>}{b === BUILD && <> <span className="pill">{t(k("gv.stat.thisBuild"))}</span></>}</span></td>
                          <td data-label={t(k("gv.stat.today"))} className="num">{num(s.today.builds[b] ?? 0)}</td>
                          <td data-label={t(k("gv.stat.yesterday"))} className="num">{num(s.yesterday.builds[b] ?? 0)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td data-cell="main" data-label={t(k("gv.stat.colBuild"))}><strong>{t(k("gv.stat.total"))}</strong></td>
                        <td data-label={t(k("gv.stat.today"))} className="num">{num(s.today.n)}</td>
                        <td data-label={t(k("gv.stat.yesterday"))} className="num">{num(s.yesterday.n)}</td>
                      </tr>
                    </tbody>
                  </table></div>
                ) : <span className="muted">{t(k("gv.stat.errsNone"))}</span>}
              </div>

              <div className="stack-sm">
                <h4>{t(k("gv.stat.jobs"))}</h4>
                <div className="table-wrap"><table className="data-table">
                  <thead><tr><th>{t(k("gv.stat.colJob"))}</th><th>{t(k("gv.stat.colLast"))}</th><th>{t(k("gv.stat.colState"))}</th></tr></thead>
                  <tbody>{JOBS.map((j) => {
                    const beat = s.jobs[j.id], state = jobState(beat, j.lateMs, s.now), at = Number(beat?.at);
                    return (
                      <tr key={j.id}>
                        {/* On a phone's card: the job across the top; its last run and its state (which can carry an error) keep a line each. */}
                        <td data-cell="main" data-label={t(k("gv.stat.colJob"))}><span>{t(k(`gv.stat.job.${j.id}`))} <span className="muted small">({t(k(`gv.stat.every.${j.id}`))})</span></span></td>
                        <td data-cell="row" data-label={t(k("gv.stat.colLast"))}>{Number.isFinite(at) && at > 0 ? when.format(new Date(at)) : "—"}</td>
                        <td data-cell="row" data-label={t(k("gv.stat.colState"))}>
                          <span>
                            {state === "ok" ? <span className="pill">{t(k("gv.stat.ok"))}</span> : <strong className="err-text">{t(k(`gv.stat.${state}`))}</strong>}
                            {typeof beat?.error === "string" && beat.error && <> <code dir="ltr" className="small">{beat.error}</code></>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              </div>

              <div className="stack-sm">
                <h4>{t(k("gv.stat.attention"))}</h4>
                <span className="muted small">{t(k("gv.stat.attentionHint"), { n: SCAN })}</span>
                {s.attention.length ? (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>{t("led.when")}</th><th>{t("led.what")}</th><th>{t("led.details")}</th></tr></thead>
                    <tbody>{s.attention.map((r) => {
                      const { id: _id, at, action, by: _by, ip: _ip, rid: _rid, ...rest } = r;
                      return (
                        <tr key={r.id}>
                          <td data-label={t("led.when")}>{at?.seconds ? when.format(new Date(at.seconds * 1000)) : "—"}</td>
                          <td data-label={t("led.what")}>{actionWords(String(action), t) ?? <code dir="ltr">{String(action)}</code>}</td>
                          <td data-label={t("led.details")}><code dir="ltr" className="small">{detailText(rest) || "—"}</code></td>
                        </tr>
                      );
                    })}</tbody>
                  </table></div>
                ) : <span className="muted">{t(k("gv.stat.attentionNone"))}</span>}
              </div>

              <div className="stack-sm">
                <h4>{t(k("gv.stat.csp"))}</h4>
                <span className="muted small">{t(k("gv.stat.cspHint"))}{s.csp.at > 0 && <> {t(k("gv.stat.cspLast"), { date: when.format(new Date(s.csp.at)) })}</>}</span>
                {directives.length ? (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>{t(k("gv.stat.colDirective"))}</th><th className="num">{t(k("gv.stat.colReports"))}</th></tr></thead>
                    <tbody>{directives.map((d) => (
                      <tr key={d}>
                        {/* In a span, as the builds above: the left-to-right code alone would be the cell's flex item, and on an Arabic card its title would start at the far end. */}
                        <td data-cell="main" data-label={t(k("gv.stat.colDirective"))}><span><code dir="ltr">{d}</code></span></td>
                        <td data-label={t(k("gv.stat.colReports"))} className="num">{num(s.csp.counts[d])}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <span className="muted">{t(k("gv.stat.cspNone"))}</span>}
              </div>
            </>
          );
        }}
      </LoadState>
    </div>
  );
}
