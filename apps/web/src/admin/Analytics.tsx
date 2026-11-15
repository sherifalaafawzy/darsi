import { useMemo, useState } from "react";
import { courseTitle } from "./courseTitles";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../auth/types";
import { call } from "../firebase";
import { firebaseConfig } from "../firebase-config";
import { useI18n, type MessageKey } from "../i18n";
import { loadCatalog, useAsync } from "../content/load";
import { useTracks } from "../content/settings";
import { labMeta } from "../labs/catalog";
import { saveGaConfig, useActiveDevices, useDays, useGaConfig, useMembers, useOrg, useOverview, usePeople, dayKey, type DayCounts, type Overview } from "./data";
import { PeopleTable } from "./PeopleTable";
import { errorText, reasonText } from "../staff/errors";
import { ErrorNote } from "../staff/LoadState";
import { reasonOf } from "./refusals";
import { OrgBranding } from "./OrgBranding";
import { OrgManage, OrgSignIn } from "./OrgsAdmin";
import { OrgCoursesPanel } from "./OrgCourses";
import { OrgSiteSummary } from "./Domains";
import { OrgActivity } from "./OrgActivity";
import { OrgPolicy } from "./OrgPolicy";
import { OrgExport } from "./OrgExport";
import { k } from "./orgsStrings";
import { LicencePanel, SeatsPanel } from "./Super";
import { Bars, Ranked } from "./charts";
import { Tabs, TabPanel, useTab, type TabDef } from "./Tabs";
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

/**
 * Platform analytics for platform admins (TECHNICAL.md "Analytics"). Every figure is one read; nothing is live.
 * The page reads what its first tab and Refresh need (the overview, the 30 days, active phones); each other tab reads
 * its own only when it is first opened: course titles for Learning, 50 accounts for People, the connection for
 * Google Analytics.
 */
export function AnalyticsPage() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const overview = useOverview();
  const days = useDays(DAYS);
  const devices = useActiveDevices();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const o = overview.data ?? undefined, d = days.data ?? [];
  // "…" while the overview loads; "—" once it is known that nothing has been counted yet (or it failed to load).
  const none = overview.data === undefined && !overview.error ? "…" : "—";
  // Until the days are read, the lists below say "Loading…", not "Nothing yet".
  const daysLoading = days.loading && !days.data;
  const emptyText = daysLoading ? t("adm.loading") : t("an.noData");

  const refresh = async () => {
    setRefreshing(true); setRefreshErr("");
    try { await call<Record<string, never>, { at: string }>("refreshStats")({}); overview.reload(); days.reload(); devices.reload(); }
    catch (e) { setRefreshErr(errorText(e, t)); } finally { setRefreshing(false); }
  };
  const error = overview.error ?? days.error ?? devices.error;
  const readAgain = () => { overview.reload(); days.reload(); devices.reload(); };
  const TABS: TabDef[] = [
    { id: "overview", label: t("tabs.overview") }, { id: "learning", label: t("tabs.learning") }, { id: "audience", label: t("tabs.audience") },
    { id: "orgs", label: t("tabs.orgs") }, { id: "people", label: t("tabs.people") }, { id: "ga", label: t("an.gaTitle") },
  ];

  return (
    <>
      <AppBar title={t("an.title")} />
      <main className="screen wide stack-lg">
        <div className="an-head">
          <p className="muted small">{overview.loading && !overview.data ? t("adm.loading") : o ? t("an.updated", { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.at)) }) : t("an.never")}</p>
          <Button size="sm" variant="secondary" icon="sync" loading={refreshing} onClick={() => { void refresh(); }}>{t("an.refresh")}</Button>
        </div>
        {refreshErr && <p className="notice err" role="alert">{refreshErr}</p>}
        {/* A read that failed: why, and Retry. What an earlier read brought stays under it. */}
        {error && <ErrorNote error={error} reload={readAgain} stale={!!(overview.data || days.data)} />}

        <Tabs label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="overview"><PlatformOverview o={o} none={none} d={d} devices={devices.data} daysLoading={daysLoading} /></TabPanel>
          <TabPanel id="learning"><Learning d={d} empty={emptyText} /></TabPanel>
          <TabPanel id="audience"><Audience d={d} empty={emptyText} /></TabPanel>
          {/* Only the page's own figures, in a table that can be long: off the page while another tab shows. */}
          <TabPanel id="orgs" keep={false}><OrgsTable o={o} loading={overview.loading && !overview.data} onOpen={(id) => nav(`/super/orgs/${id}`, { state: { back: "/super/analytics?tab=orgs" } })} /></TabPanel>
          {/* Kept while another tab shows (the default): a name that was searched for, and a secret half typed, stay. */}
          <TabPanel id="people"><People /></TabPanel>
          <TabPanel id="ga"><GaConnect /></TabPanel>
        </Tabs>
      </main>
    </>
  );
}

/** The Overview tab: the tiles and the last 30 days, from what the page read. Which measure the bars show stays here. */
function PlatformOverview({ o, none, d, devices, daysLoading }: { o?: Overview; /** What a tile says without the overview: "…" while it loads, "—" after. */ none: string; d: DayCounts[]; devices?: { d1: number; d7: number; d30: number }; daysLoading: boolean }) {
  const { t, num: fmt, locale } = useI18n();
  const [metric, setMetric] = useState<"dev" | "lessons" | "sessions">("dev");
  const lessons30 = sum(d, ["lessons", "n"]), accN = sum(d, ["lessons", "accN"]);
  // Net of refunds (billing.recordRefund counts them per day, in the same units): the money Darsi kept.
  const revenue = (["EGP", "USD"] as const).map((c) => [c, sum(d, ["revenue", c, "value"]) - sum(d, ["refunds", c, "value"])] as const).filter(([, v]) => v !== 0);
  const events = sum(d, ["n"]), sessions = sum(d, ["sessions", "n"]);
  const share = (part: number, whole: number) => (whole ? fmt(part / whole, { style: "percent" }) : "—");
  return (
    <>
      <section className="tiles" aria-label={t("an.title")}>
        <div className="tile"><span>{t("an.phones")}</span><strong>{devices ? fmt(devices.d7) : "…"}</strong><small>{devices ? t("an.phonesMore", { today: devices.d1, month: devices.d30 }) : ""}</small></div>
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
    </>
  );
}

/** The Learning tab: lessons by track and course, and labs. The catalog (course titles) is read here, so only once the tab is first opened. */
function Learning({ d, empty }: { d: DayCounts[]; empty: string }) {
  const { t, L } = useI18n();
  const tracks = useTracks();
  const { data: catalog } = useAsync(loadCatalog, []);
  // A course no longer published keeps its title (courseTitles.json), not its id.
  const unitName = (id: string) => { const c = courseTitle(id, catalog?.units, L); return c.gone && c.known ? t("or.retired", { id: c.text }) : c.text; };
  return (
    <div className="an-grid">
      <Ranked title={t("an.byTrack")} rows={totals(d, ["lessons", "track"])} name={(k) => tracks.name(k)} empty={empty} />
      <Ranked title={t("an.byCourse")} rows={totals(d, ["lessons", "unit"])} name={unitName} empty={empty} />
      <Ranked title={t("an.byLab")} rows={totals(d, ["labs"])} name={(k) => { const m = labMeta(k); return m ? L(m.title) : k; }} empty={empty} />
    </div>
  );
}

/** The Audience tab: sessions by language and role, and the screens opened. */
function Audience({ d, empty }: { d: DayCounts[]; empty: string }) {
  const { t, locale } = useI18n();
  // A language's name in the page's own language ("Arabic", «العربية»), so an English page shows no Arabic script.
  const langName = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames([locale], { type: "language" }); } catch { /* an old browser: the codes */ }
    return (code: string) => { try { return names?.of(code) ?? code; } catch { return code; } };
  }, [locale]);
  return (
    <div className="an-grid">
      <Ranked title={t("an.byLang")} rows={totals(d, ["sessions", "lang"])} name={langName} empty={empty} />
      <Ranked title={t("an.byRole")} rows={totals(d, ["sessions", "role"])} name={(k) => (k === "guest" ? t("an.guest") : t(`rn.${k}` as "rn.student"))} empty={empty} />
      <Ranked title={t("an.byScreen")} rows={sameScreen(totals(d, ["screens"]))} name={(k) => (SCREENS[k] ? t(SCREENS[k]) : k)} empty={empty} />
    </div>
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
              <td data-cell="main" data-label={t("col.name")}><Link to={`/super/orgs/${id}`} className="person-link" onClick={(e) => { e.preventDefault(); onOpen(id); }}><span><strong><bdi>{s.name}</bdi></strong>{s.country && <small>{s.country}</small>}</span></Link></td>
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
      {people.error && <ErrorNote error={people.error} reload={people.reload} stale={!!people.data} />}
      {people.loading && !people.data && <p className="muted" aria-busy="true">{t("adm.loading")}</p>}
      {people.data && (people.data.length ? <PeopleTable rows={people.data} to={(m) => `/super/people/${m.uid}`} /> : <p className="muted">{t("an.noPeople")}</p>)}
      {paged && !search && people.data?.length === max && <div className="row-gap"><Button size="sm" variant="secondary" onClick={() => setMax(max + 50)}>{t("an.showMore")}</Button></div>}
      <p className="muted small">{search ? t("an.searchHint") : t("an.recentHint")}</p>
    </section>
  );
}

/** What setGaConfig accepts: a measurement ID (or none) and an API secret of at most 100 characters. */
const GA_ID = /^G-[A-Z0-9]{4,16}$/, GA_SECRET_MAX = 100;

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
  const [saving, setSaving] = useState(false);
  const shownMid = mid ?? (ga.data?.measurementId || firebaseConfig.measurementId || "");
  const shownSecret = secret ?? ga.data?.apiSecret ?? "";
  const on = Boolean(ga.data?.measurementId && ga.data?.apiSecret);
  // The server's own checks (functions/src/analytics.ts setGaConfig), said at once and each on its own: a secret pasted
  // with more than the key (a whole page, a note) used to be refused with the ID's words.
  const save = async () => {
    if (!user || saving) return;
    // An ID of only spaces is no ID (the server trims it, and accepts none).
    if (shownMid.trim() && !GA_ID.test(shownMid.trim())) return setMsg({ ok: false, text: t("an.gaBadId") });
    // Said from here, not thrown: reasonText logs nothing, so "Report a problem" isn't handed an error that never was.
    if (shownSecret.trim().length > GA_SECRET_MAX) return setMsg({ ok: false, text: reasonText("bad-ga-secret", t) });
    setSaving(true); setMsg(null);
    try { await saveGaConfig(user.uid, { measurementId: shownMid, apiSecret: shownSecret }); setMsg({ ok: true, text: t("an.gaSaved") }); ga.reload(); setMid(null); setSecret(null); }
    catch (e) {
      // A server that says only "bad-ga" (before it told the two apart): the secret's own words when it is the long one.
      // errorText first either way, so the server's real answer is the one logged.
      const said = errorText(e, t);
      const secretTooLong = reasonOf(e) === "bad-ga" && shownSecret.trim().length > GA_SECRET_MAX;
      setMsg({ ok: false, text: secretTooLong ? reasonText("bad-ga-secret", t) : said });
    } finally { setSaving(false); }
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
      <div><Button onClick={() => { void save(); }} loading={saving} disabled={!ga.data}>{t("an.gaSave")}</Button></div>
    </section>
  );
}

/** Members shown at first, and added by each "Show more". */
const MEMBER_ROWS = 100;

/**
 * One organization for platform admins, in tabs: its figures, its people (found and added, each with a role), the
 * courses they see, Darsi Super, who can join it, its school sign-in, its settings (details, look, web addresses), its records (what was
 * done in it, and its data as files) and its status (suspended or resumed, deleted). The page reads the organization once;
 * the members (admin/data.ts useMembers: in pages, shared with the report) only once a tab that lists them is opened,
 * and each tab reads its own when first opened (the platform's figures for Overview, the plans for Darsi Super, the
 * logo and addresses for Settings, both catalogs for Courses).
 *
 * The members are listed once on the page, under People, 100 rows at a time; a role change or a removal mends that
 * list where it is (patch, remove) instead of reading every member again.
 */
export function OrgAnalytics() {
  const { orgId = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  // Back goes to the list the admin opened it from (Analytics passes itself; /super/orgs is the default). Always a
  // fixed page, never history: the report's own Back comes here, and history would then lead back to the report.
  // Choosing a tab keeps the state (Tabs passes it on), so Back still knows after a look at another tab.
  // The notices' own links to Status pass it on too, or Back would forget where the admin came from.
  const state = useLocation().state as { back?: string } | null;
  const from = state?.back;
  const back = from?.startsWith("/super") ? from : "/super/orgs";
  // Read once (no listeners): the panels below ask for a new read after their changes.
  const orgQ = useOrg(orgId);
  const { data: org, error } = orgQ;
  // An organization that isn't there (deleted since, a mistyped link) has nothing to manage: only its figures and
  // people. One that is being deleted can't be changed (the server refuses): its people, its records (the export
  // still works) and the deletion to continue.
  const gone = org === null;
  const deleting = org?.status === "deleting";
  const TABS: TabDef[] = [
    { id: "overview", label: t("tabs.overview") }, { id: "people", label: t("tabs.people") },
    { id: "courses", label: t("tabs.courses"), hidden: gone || deleting }, { id: "super", label: t("tabs.super"), hidden: gone || deleting },
    { id: "join", label: t("tabs.invite"), hidden: gone || deleting },
    // Its school sign-in (OrgsAdmin OrgSignIn). The provider sends a platform admin's own test back to this tab
    // (functions/src/ssoCore.ts: /super/orgs/<id>?tab=signin#sso=…), where the panel takes the return and finishes it.
    { id: "signin", label: t("tabs.schoolSignIn"), hidden: gone || deleting },
    { id: "settings", label: t("tabs.settings"), hidden: gone || deleting },
    { id: "records", label: t("tabs.records"), hidden: gone }, { id: "status", label: t("po.status"), hidden: gone },
  ];
  const tab = useTab(TABS);
  // The members are read when a tab that lists them is first opened, and kept from then on (the Overview's count is
  // the organization's own): a look at the figures of a school of 5,000 reads none of them.
  const wants = tab.is("people") || tab.is("courses") || tab.is("super");
  const [asked, setAsked] = useState(false);
  if (wants && !asked) setAsked(true);
  const membersQ = useMembers(asked || wants ? orgId : null);
  // `data` is the whole list or nothing: until then nothing says "No people yet" or offers their seats.
  const members = membersQ.data;
  const membersWait = !members && (membersQ.error
    ? <ErrorNote error={membersQ.error} reload={membersQ.reload} />
    : <p className="muted" role="status" aria-busy="true">{membersQ.loaded ? t(k("og.loadedSoFar"), { n: membersQ.loaded }) : t("adm.loading")}</p>);
  // A reload that failed keeps the list it had: said above it.
  const membersStale = members && membersQ.error ? <ErrorNote error={membersQ.error} reload={membersQ.reload} stale /> : null;
  const bar = <AppBar title={org?.name ?? "…"} onBack={() => nav(back)} backLabel={t("common.back")} />;
  // The organization couldn't be read: the way back stays, with the reason and Retry.
  if (error && !org) return <>{bar}<main className="screen wide stack-lg"><ErrorNote error={error} reload={orgQ.reload} /></main></>;
  // A tab opened by its link before the organization is read.
  const wait = <p className="muted" aria-busy="true">{t("adm.loading")}</p>;
  return (
    <>
      {bar}
      <main className="screen wide stack-lg">
        {org && <div className="person-link"><span><strong><bdi>{org.name}</bdi></strong><small>{[isOrgType(org.type) ? t(`po.t.${org.type}`) : org.type, org.city, org.country].filter(Boolean).join(t("common.sep"))}</small></span></div>}
        {/* Said on every tab, with the way to the tab that ends it. */}
        {org?.status === "suspended" && <p className="notice err row-gap"><span>{t(k("og.suspendedNow"))}</span>{!tab.is("status") && <Link to={{ search: tab.search("status") }} state={state}>{t(k("og.openStatus"))}</Link>}</p>}
        {deleting && <p className="notice err row-gap"><span><strong>{t(k("og.deleting"))}</strong></span>{!tab.is("status") && <Link to={{ search: tab.search("status") }} state={state}>{t(k("og.deletingGo"))}</Link>}</p>}
        <Tabs label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="overview"><OrgOverview orgId={orgId} members={org ? org.memberCount ?? 0 : undefined} orgLoading={org === undefined} /></TabPanel>
          {/* The one list of its members: found and added above it, each with a role. Kept while another tab shows
              (the default): a search half typed and the rows already shown stay. */}
          <TabPanel id="people">
            {membersStale}
            {org === undefined ? wait : org && !deleting
              ? <OrgManage part="people" org={org} members={members ?? NO_MEMBERS} loading={!members} loaded={membersQ.loaded} failed={membersQ.error && !members ? membersWait : undefined}
                  onChanged={() => { orgQ.reload(); membersQ.reload(); }} onMember={(uid, c) => (c ? membersQ.patch(uid, c) : membersQ.remove(uid))} />
              : <section className="panel stack"><h3>{t("adm.people")}</h3>{members ? <MemberRows members={members} /> : membersWait}</section>}
          </TabPanel>
          {/* Which courses its teachers, students and classes see: the panel org admins have on /admin/courses. Not kept:
              with unsaved ticks its leave guard holds links and asks inside the panel, where nobody would see it hidden. */}
          <TabPanel id="courses" keep={false}>{org ? <OrgCoursesPanel key={org.id} org={org} members={members} membersFailed={!!membersQ.error && !members} onSaved={orgQ.reload} /> : wait}</TabPanel>
          <TabPanel id="super">{org ? <>
            <LicencePanel org={org} onChanged={orgQ.reload} />
            {membersStale}
            {members ? <SeatsPanel org={org} members={members} onChanged={membersQ.reload} /> : membersWait}
          </> : wait}</TabPanel>
          {/* Who can join with its codes, and the people it removed (the panel its own admins have). Not kept, like
              Courses: its leave guard asks about unsaved rules inside the panel, where nobody would see it hidden. */}
          <TabPanel id="join" keep={false}>{org ? <OrgPolicy orgId={org.id} /> : wait}</TabPanel>
          {/* The wizard or status card its own admins have, plus the members ceiling and the keys' health. Kept while
              another tab shows, as on /admin: what was typed in the wizard (the client secret, the teachers' addresses)
              lives only on the page, and a look at People would lose it; returning reads nothing again. A test that
              comes back (#sso=…) is a new page load that opens this tab, and the panel takes a return only when it
              mounts, which is when its tab is first opened: a hidden one never takes it. */}
          <TabPanel id="signin">{org ? <OrgSignIn org={org} /> : wait}</TabPanel>
          <TabPanel id="settings">{org ? <>
            <OrgManage part="details" org={org} members={NO_MEMBERS} onChanged={orgQ.reload} />
            <OrgBranding org={org} onSaved={orgQ.reload} />
            {/* Its own web addresses (cis.darsiai.org): where each stands, managed on /super/domains. */}
            <OrgSiteSummary orgId={org.id} />
          </> : wait}</TabPanel>
          <TabPanel id="records">{org ? <>
            <OrgActivity orgId={org.id} />
            <OrgExport org={org} />
          </> : wait}</TabPanel>
          {/* Kept while another tab shows: a deletion that is running goes on, and says where it is on return. */}
          <TabPanel id="status">{org ? <>
            {!deleting && <OrgManage key="status" part="status" org={org} members={NO_MEMBERS} onChanged={orgQ.reload} />}
            <OrgManage key="delete" part="delete" org={org} members={NO_MEMBERS} onChanged={orgQ.reload} />
          </> : wait}</TabPanel>
        </Tabs>
      </main>
    </>
  );
}
const NO_MEMBERS: Profile[] = [];

/** The members to read only (an organization that is gone, or being deleted): 100 rows, then "Show more". */
function MemberRows({ members }: { members: Profile[] }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(MEMBER_ROWS);
  if (!members.length) return <p className="muted">{t("adm.noPeople")}</p>;
  return (
    <>
      <PeopleTable rows={members.length > shown ? members.slice(0, shown) : members} to={(m) => `/super/people/${m.uid}`} />
      {members.length > shown && <div className="row-gap">
        <Button size="sm" variant="secondary" onClick={() => setShown(shown + MEMBER_ROWS)}>{t(k("og.showMore"))}</Button>
        <span className="muted small">{t(k("og.shownOf"), { shown, total: members.length })}</span>
      </div>}
    </>
  );
}

/** An organization's Overview tab. The platform's figures and the 30 days are read here, so only when this tab is opened. */
function OrgOverview({ orgId, members, orgLoading }: { orgId: string; /** The organization's own count of its members: the tile's figure until the platform's count is known. */ members?: number; orgLoading: boolean }) {
  const { t, num: fmt } = useI18n();
  const nav = useNavigate();
  const overview = useOverview();
  const days = useDays(DAYS);
  const s = overview.data?.orgs[orgId];
  const lessons = useMemo(() => series(days.data ?? [], ["org", orgId, "lessons"]), [days.data, orgId]);
  return (
    <>
      <section className="tiles">
        <div className="tile"><span>{t("an.members")}</span><strong>{s ? fmt(s.members) : orgLoading ? "…" : members == null ? "—" : fmt(members)}</strong><small>{s ? t("an.teachersStudents", { teachers: s.teachers ?? 0, students: s.students ?? 0 }) : ""}</small></div>
        <div className="tile"><span>{t("an.active")}</span><strong>{s ? fmt(s.active7) : "—"}</strong><small>{s ? t("an.activeMonth", { n: s.active30 }) : ""}</small></div>
        <div className="tile"><span>{t("an.lessons")}</span><strong>{s ? fmt(s.lessons) : "—"}</strong></div>
        <div className="tile"><span>{t("an.score")}</span><strong>{s?.avgAccuracy != null ? fmt(s.avgAccuracy, { style: "percent" }) : "—"}</strong></div>
      </section>
      <div><Button icon="chart" onClick={() => nav(`/super/orgs/${orgId}/report`)}>{t("or.open")}</Button></div>
      <section className="panel stack"><h3>{t("an.orgLessons30")}</h3><DayBars data={lessons} label={t("an.m.lessons")} loading={days.loading && !days.data} /></section>
    </>
  );
}
