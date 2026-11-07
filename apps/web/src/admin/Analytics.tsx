import { useMemo, useState } from "react";
import { courseTitle } from "./courseTitles";
import { refusalText } from "./refusals";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { call } from "../firebase";
import { firebaseConfig } from "../firebase-config";
import { useI18n, type MessageKey } from "../i18n";
import { loadCatalog, useAsync } from "../content/load";
import { useTracks } from "../content/settings";
import { labMeta } from "../labs/catalog";
import { saveGaConfig, useActiveDevices, useDays, useGaConfig, useMembers, useOrg, useOverview, usePeople, dayKey, type DayCounts, type Overview } from "./data";
import { PeopleTable } from "./AdminHome";
import { OrgBranding } from "./OrgBranding";
import { OrgManage } from "./OrgsAdmin";
import { LicencePanel, SeatsPanel } from "./Super";
import { Bars, Ranked } from "./charts";
import "../styles/admin.css";
import "../styles/analytics.css";
import "./strings";

const DAYS = 30;
type Num = Record<string, number>;
/** A nested count in a day's document, e.g. ["lessons", "track"] → {ai: 4, iot: 1}. */
const at = (d: DayCounts, path: string[]): unknown => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), d);
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const sum = (days: DayCounts[], path: string[]) => days.reduce((a, d) => a + num(at(d, path)), 0);
/** The counts under a map summed over the days, largest first. */
function totals(days: DayCounts[], path: string[]): Array<[string, number]> {
  const out: Num = {};
  for (const d of days) for (const [k, v] of Object.entries((at(d, path) as Num | undefined) ?? {})) out[k] = (out[k] ?? 0) + num(v);
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}
/** Every day of the period, oldest first, with the day's value (0 where no events came in). */
function series(days: DayCounts[], path: string[], n = DAYS) {
  const by = new Map(days.map((d) => [d.day, num(at(d, path))]));
  return Array.from({ length: n }, (_, i) => { const day = dayKey(new Date(Date.now() - (n - 1 - i) * 864e5)); return { day, v: by.get(day) ?? 0 }; });
}

/** Screens as their names in the navigation (analytics/useAnalytics.ts screenOf: a path's first part); others as recorded. */
const SCREENS: Record<string, MessageKey> = {
  home: "nav.home", learn: "nav.learn", lesson: "col.lessons", downloads: "nav.downloads", labs: "nav.lab", kit: "nav.kit", me: "nav.me",
  tracks: "tracks.title", signin: "auth.signIn", signup: "auth.create", forgot: "auth.forgotTitle", licences: "me.licences", org: "nav.org",
  upgrade: "me.super", results: "results.title", admin: "nav.admin", teach: "nav.teach", super: "nav.super",
};
/** /lab only redirects to /labs: one row. */
const sameScreen = (rows: Array<[string, number]>) => {
  const out = new Map<string, number>();
  for (const [k, v] of rows) { const id = k === "lab" ? "labs" : k; out.set(id, (out.get(id) ?? 0) + v); }
  return [...out].sort((a, b) => b[1] - a[1]);
};
/** Organization types (OrgsAdmin TYPES) in words. */
const ORG_TYPES = ["school", "university", "ministry", "ngo", "company", "other"] as const;
const isOrgType = (x: string): x is (typeof ORG_TYPES)[number] => (ORG_TYPES as readonly string[]).includes(x);

/** The day series as bars, labelled with short dates. */
function DayBars({ data, label, loading }: { data: Array<{ day: string; v: number }>; label: string; /** The days are still being read. */ loading?: boolean }) {
  const { t, locale } = useI18n();
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  if (loading) return <p className="muted small" aria-busy="true">{t("adm.loading")}</p>;
  return <Bars data={data.map((d) => ({ key: d.day, label: date.format(new Date(d.day)), v: d.v }))} label={label} per="day" empty={t("an.noData")} />;
}

/** Platform analytics for platform admins (TECHNICAL.md "Analytics"). Every figure is one read; nothing is live. */
export function AnalyticsPage() {
  const { t, num: fmt, L, locale } = useI18n();
  const nav = useNavigate();
  const tracks = useTracks();
  const overview = useOverview();
  const days = useDays(DAYS);
  const devices = useActiveDevices();
  const { data: catalog } = useAsync(loadCatalog, []);
  const [metric, setMetric] = useState<"dev" | "lessons" | "sessions">("dev");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const o = overview.data ?? undefined, d = days.data ?? [];
  // "…" while the overview loads; "—" once it is known that nothing has been counted yet (or it failed to load).
  const none = overview.data === undefined && !overview.error ? "…" : "—";
  // A course no longer published keeps its title (courseTitles.json), not its id.
  const unitName = (id: string) => { const c = courseTitle(id, catalog?.units, L); return c.gone && c.known ? t("or.retired", { id: c.text }) : c.text; };
  // Until the days are read, the lists below say "Loading…", not "Nothing yet".
  const daysLoading = days.loading && !days.data;
  const emptyText = daysLoading ? t("adm.loading") : t("an.noData");
  // A language's name in the page's own language ("Arabic", «العربية»), so an English page shows no Arabic script.
  const langName = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames([locale], { type: "language" }); } catch { /* an old browser: the codes */ }
    return (code: string) => { try { return names?.of(code) ?? code; } catch { return code; } };
  }, [locale]);

  const refresh = async () => {
    setRefreshing(true); setRefreshErr("");
    try { await call<Record<string, never>, { at: string }>("refreshStats")({}); overview.reload(); days.reload(); devices.reload(); }
    catch (e) { setRefreshErr((e as Error).message); } finally { setRefreshing(false); }
  };
  const lessons30 = sum(d, ["lessons", "n"]), accN = sum(d, ["lessons", "accN"]);
  // Net of refunds (billing.recordRefund counts them per day, in the same units): the money Darsi kept.
  const revenue = (["EGP", "USD"] as const).map((c) => [c, sum(d, ["revenue", c, "value"]) - sum(d, ["refunds", c, "value"])] as const).filter(([, v]) => v !== 0);
  const events = sum(d, ["n"]), sessions = sum(d, ["sessions", "n"]);
  const share = (part: number, whole: number) => (whole ? fmt(part / whole, { style: "percent" }) : "—");
  const error = overview.error ?? days.error ?? devices.error;

  return (
    <>
      <AppBar title={t("an.title")} />
      <main className="screen wide stack-lg">
        <div className="an-head">
          <p className="muted small">{overview.loading && !overview.data ? t("adm.loading") : o ? t("an.updated", { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.at)) }) : t("an.never")}</p>
          <Button size="sm" variant="secondary" icon="sync" loading={refreshing} onClick={() => { void refresh(); }}>{t("an.refresh")}</Button>
        </div>
        {(error || refreshErr) && <p className="notice err">{refreshErr || error?.message}</p>}

        <section className="tiles" aria-label={t("an.title")}>
          <div className="tile"><span>{t("an.phones")}</span><strong>{devices.data ? fmt(devices.data.d7) : "…"}</strong><small>{devices.data ? t("an.phonesMore", { today: devices.data.d1, month: devices.data.d30 }) : ""}</small></div>
          <div className="tile"><span>{t("an.accounts")}</span><strong>{o ? fmt(o.users.total) : none}</strong><small>{o ? t("an.newWeek", { n: o.users.new7 }) : ""}</small></div>
          <div className="tile"><span>{t("an.active")}</span><strong>{o ? fmt(o.users.active7) : none}</strong><small>{o ? t("an.activeMonth", { n: o.users.active30 }) : ""}</small></div>
          <div className="tile"><span>{t("an.lessons")}</span><strong>{o ? fmt(o.lessons) : none}</strong><small>{t("an.lessons30", { n: lessons30 })}</small></div>
          <div className="tile"><span>{t("an.score")}</span><strong>{o?.avgAccuracy != null ? fmt(o.avgAccuracy, { style: "percent" }) : "—"}</strong><small>{accN ? t("an.score30", { pct: share(sum(d, ["lessons", "acc"]) / 100, accN) }) : ""}</small></div>
          <div className="tile"><span>{t("an.orgs")}</span><strong>{o ? fmt(o.orgsByStatus.active ?? 0) : none}</strong><small>{o ? t("an.orgsPending", { n: o.orgsByStatus.pending ?? 0 }) : ""}</small></div>
          {/* Revenue from verified payments only (billing.recordPayment), per currency; never from phones. */}
          <div className="tile"><span>{t("an.revenue")}</span><strong>{revenue.length ? revenue.map(([cur, v]) => new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v)).join(t("common.sep")) : "—"}</strong><small>{t("an.revenueLine", { n: sum(d, ["revenue", "EGP", "n"]) + sum(d, ["revenue", "USD", "n"]), refunds: sum(d, ["refunds", "EGP", "n"]) + sum(d, ["refunds", "USD", "n"]) })}</small></div>
          <div className="tile"><span>{t("an.superActive")}</span><strong>{o?.super ? fmt(o.super.individuals + o.super.seatsUsed) : "—"}</strong><small>{o?.super ? t("an.superLine", { individuals: o.super.individuals, seats: o.super.seatsUsed }) : ""}</small></div>
          {/* Capstone AI reviews (checkCapstone counts them in analytics/{day}.capstone) and what they cost at the provider. */}
          <div className="tile"><span>{t("an.capstone")}</span><strong>{fmt(sum(d, ["capstone", "reviews"]))}</strong><small>{t("an.capstoneLine", { calls: sum(d, ["capstone", "calls"]), usd: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 3 }).format(sum(d, ["capstone", "usd"])) })}</small></div>
        </section>

        <section className="panel stack">
          <div className="an-head"><h3>{t("an.last30")}</h3>
            <div className="row-gap" role="group" aria-label={t("an.last30")}>
              {(["dev", "lessons", "sessions"] as const).map((m) => <Button key={m} size="sm" variant={metric === m ? "primary" : "ghost"} aria-pressed={metric === m} onClick={() => setMetric(m)}>{t(`an.m.${m}`)}</Button>)}
            </div>
          </div>
          <DayBars data={series(d, metric === "dev" ? ["dev"] : [metric, "n"])} label={t(`an.m.${metric}`)} loading={daysLoading} />
          <p className="muted small">{t("an.usage", { offline: share(sum(d, ["off"]), events), installed: share(sum(d, ["sessions", "installed"]), sessions), mb: Math.round(sum(d, ["downloads", "mb"])), downloads: sum(d, ["downloads", "n"]) })}</p>
        </section>

        <div className="an-grid">
          <Ranked title={t("an.byTrack")} rows={totals(d, ["lessons", "track"])} name={(k) => tracks.name(k)} empty={emptyText} />
          <Ranked title={t("an.byCourse")} rows={totals(d, ["lessons", "unit"])} name={unitName} empty={emptyText} />
          <Ranked title={t("an.byLab")} rows={totals(d, ["labs"])} name={(k) => { const m = labMeta(k); return m ? L(m.title) : k; }} empty={emptyText} />
          <Ranked title={t("an.byLang")} rows={totals(d, ["sessions", "lang"])} name={langName} empty={emptyText} />
          <Ranked title={t("an.byRole")} rows={totals(d, ["sessions", "role"])} name={(k) => (k === "guest" ? t("an.guest") : t(`rn.${k}` as "rn.student"))} empty={emptyText} />
          <Ranked title={t("an.byScreen")} rows={sameScreen(totals(d, ["screens"]))} name={(k) => (SCREENS[k] ? t(SCREENS[k]) : k)} empty={emptyText} />
        </div>

        <OrgsTable o={o} loading={overview.loading && !overview.data} onOpen={(id) => nav(`/super/orgs/${id}`, { state: { back: "/super/analytics" } })} />
        <People />
        <GaConnect />
      </main>
    </>
  );
}

function OrgsTable({ o, loading, onOpen }: { o?: Overview; loading?: boolean; onOpen: (id: string) => void }) {
  const { t, num: fmt } = useI18n();
  const rows = Object.entries(o?.orgs ?? {}).sort((a, b) => b[1].members - a[1].members);
  return (
    <section className="panel stack"><h3>{t("an.orgsTitle")}</h3>
      {rows.length === 0 ? <p className="muted" aria-busy={loading || undefined}>{loading ? t("adm.loading") : o ? t("an.noOrgs") : t("an.never")}</p> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("col.name")}</th><th className="num">{t("an.members")}</th><th className="num">{t("an.active")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th></tr></thead>
          <tbody>{rows.map(([id, s]) => (
            <tr key={id}>
              <td data-label={t("col.name")}><Link to={`/super/orgs/${id}`} className="person-link" onClick={(e) => { e.preventDefault(); onOpen(id); }}><span><strong><bdi>{s.name}</bdi></strong>{s.country && <small>{s.country}</small>}</span></Link></td>
              <td data-label={t("an.members")} className="num">{fmt(s.members)}</td>
              <td data-label={t("an.active")} className="num">{fmt(s.active7)}</td>
              <td data-label={t("col.lessons")} className="num">{fmt(s.lessons)}</td>
              <td data-label={t("col.accuracy")} className="num">{s.avgAccuracy == null ? "—" : fmt(s.avgAccuracy, { style: "percent" })}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

/** /super/people (platform admins): every account, from the nav rail. One page of 50 at a time, read once. */
export function PeoplePage() {
  const { t } = useI18n();
  // What a person's page did before coming back here (an account deleted), said where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  return (
    <>
      <AppBar title={t("nav.people")} />
      <main className="screen wide stack-lg">{done && <p className="notice ok" role="status">{done}</p>}<People paged /></main>
    </>
  );
}

/** Every account: most recently active first, or found by name. `paged` adds "Show more" (50 more each time). */
function People({ paged }: { paged?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  const [max, setMax] = useState(50);
  const people = usePeople(search, max);
  return (
    <section className="panel stack">
      <div className="table-tools"><h3>{t("an.people")}</h3>
        <form className="row-gap" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
          <input className="search-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("an.searchName")} aria-label={t("an.searchName")} />
          <Button size="sm" variant="secondary" icon="search" type="submit">{t("an.search")}</Button>
        </form>
      </div>
      {people.error && <p className="notice err">{refusalText(people.error, t)}</p>}
      {people.loading && !people.data && <p className="muted" aria-busy="true">{t("adm.loading")}</p>}
      {people.data && (people.data.length ? <PeopleTable rows={people.data} to={(m) => `/super/people/${m.uid}`} /> : <p className="muted">{t("an.noPeople")}</p>)}
      {paged && !search && people.data?.length === max && <div className="row-gap"><Button size="sm" variant="secondary" onClick={() => setMax(max + 50)}>{t("an.showMore")}</Button></div>}
      <p className="muted small">{search ? t("an.searchHint") : t("an.recentHint")}</p>
    </section>
  );
}

/**
 * Where collect forwards events: the Firebase web app's Google Analytics stream. The measurement ID is the app's own;
 * the API secret is made in Google Analytics (Admin → Data streams → the web stream → Measurement Protocol API secrets).
 */
function GaConnect() {
  const { t } = useI18n();
  const { user } = useAuth();
  const ga = useGaConfig();
  const [mid, setMid] = useState<string | null>(null), [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shownMid = mid ?? (ga.data?.measurementId || firebaseConfig.measurementId || "");
  const shownSecret = secret ?? ga.data?.apiSecret ?? "";
  const on = Boolean(ga.data?.measurementId && ga.data?.apiSecret);
  const save = async () => {
    if (!user) return;
    if (shownMid && !/^G-[A-Z0-9]{4,16}$/.test(shownMid.trim())) return setMsg({ ok: false, text: t("an.gaBadId") });
    try { await saveGaConfig(user.uid, { measurementId: shownMid, apiSecret: shownSecret }); setMsg({ ok: true, text: t("an.gaSaved") }); ga.reload(); setMid(null); setSecret(null); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <section className="panel stack" aria-labelledby="ga-h">
      <h3 id="ga-h">{t("an.gaTitle")}</h3>
      <p className={on ? "notice ok" : "notice"}>{on ? t("an.gaOn") : t("an.gaOff")}</p>
      <p className="muted small">{t("an.gaHint")}</p>
      <div className="form-grid">
        <TextField label={t("an.gaId")} value={shownMid} onChange={(e) => setMid(e.target.value)} dir="ltr" autoComplete="off" />
        <TextField label={t("an.gaSecret")} type="password" value={shownSecret} onChange={(e) => setSecret(e.target.value)} dir="ltr" autoComplete="off" />
      </div>
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}
      <div><Button onClick={() => { void save(); }} disabled={!ga.data}>{t("an.gaSave")}</Button></div>
    </section>
  );
}

/** One organization for platform admins: its figures, its look (which they may change too) and its people. */
export function OrgAnalytics() {
  const { orgId = "" } = useParams();
  const { t, num: fmt } = useI18n();
  const nav = useNavigate();
  // Back goes to the list the admin opened it from (Analytics passes itself; /super/orgs is the default). Always a
  // fixed page, never history: the report's own Back comes here, and history would then lead back to the report.
  const from = (useLocation().state as { back?: string } | null)?.back;
  const back = from?.startsWith("/super") ? from : "/super/orgs";
  // Read once (no listeners): the panels below ask for a new read after their changes.
  const orgQ = useOrg(orgId);
  const membersQ = useMembers(orgId);
  const { data: org, error } = orgQ;
  const { data: members = [] } = membersQ;
  // Until the members are read, nothing says "No people yet" or offers their seats.
  const membersLoading = membersQ.loading && !membersQ.data;
  const changed = () => { orgQ.reload(); membersQ.reload(); };
  const overview = useOverview();
  const days = useDays(DAYS);
  const s = overview.data?.orgs[orgId];
  const d = days.data ?? [];
  const lessons = useMemo(() => series(d, ["org", orgId, "lessons"]), [d, orgId]);
  if (error && !org) return <main className="screen"><EmptyState title={error.message} /></main>;
  return (
    <>
      <AppBar title={org?.name ?? "…"} onBack={() => nav(back)} backLabel={t("common.back")} />
      <main className="screen wide stack-lg">
        {org && <div className="person-link"><span><strong><bdi>{org.name}</bdi></strong><small>{[isOrgType(org.type) ? t(`po.t.${org.type}`) : org.type, org.city, org.country].filter(Boolean).join(t("common.sep"))}</small></span></div>}
        <section className="tiles">
          <div className="tile"><span>{t("an.members")}</span><strong>{s ? fmt(s.members) : membersLoading ? "…" : fmt(members.length)}</strong><small>{t("an.teachersStudents", { teachers: s?.teachers ?? 0, students: s?.students ?? 0 })}</small></div>
          <div className="tile"><span>{t("an.active")}</span><strong>{s ? fmt(s.active7) : "—"}</strong><small>{s ? t("an.activeMonth", { n: s.active30 }) : ""}</small></div>
          <div className="tile"><span>{t("an.lessons")}</span><strong>{s ? fmt(s.lessons) : "—"}</strong></div>
          <div className="tile"><span>{t("an.score")}</span><strong>{s?.avgAccuracy != null ? fmt(s.avgAccuracy, { style: "percent" }) : "—"}</strong></div>
        </section>
        <div><Button icon="chart" onClick={() => nav(`/super/orgs/${orgId}/report`)}>{t("or.open")}</Button></div>
        <section className="panel stack"><h3>{t("an.orgLessons30")}</h3><DayBars data={lessons} label={t("an.m.lessons")} loading={days.loading && !days.data} /></section>
        {org && <OrgBranding org={org} onSaved={orgQ.reload} />}
        {org && <LicencePanel org={org} onChanged={orgQ.reload} />}
        {org && membersQ.data && <SeatsPanel org={org} members={members} onChanged={membersQ.reload} />}
        {org && <OrgManage org={org} members={members} loading={membersLoading} onChanged={changed} />}
        <section className="panel stack"><h3>{t("adm.people")}</h3>
          {membersLoading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : membersQ.error && !membersQ.data ? <p className="notice err">{refusalText(membersQ.error, t)}</p>
            : members.length ? <PeopleTable rows={members} to={(m) => `/super/people/${m.uid}`} /> : <p className="muted">{t("adm.noPeople")}</p>}
        </section>
      </main>
    </>
  );
}
