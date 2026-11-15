import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { errorText } from "../staff/errors";
import { ErrorNote } from "../staff/LoadState";
import { useAuth } from "../auth/AuthProvider";
import { displayLogin } from "../auth/api";
import { scoredOf, type Profile } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { loadCatalog, useAsync } from "../content/load";
import { useTracks } from "../content/settings";
import { framework, FRAMEWORKS, type Framework } from "../content/standards";
import { useMembers, useMyStudents, useOrg, usePerson } from "./data";
import { byCourse, byGroup, byTeacher, byTrack, filterPeople, itemEvidence, lastSeen, standardsReport, statusOf, totals, weekly, type Filter, type Status } from "./orgStats";
import { lastActiveText } from "./PersonDetail";
import { emptyCell, LoginText } from "./PeopleTable";
import { Bars, useDuration } from "./charts";
import { bestFramework, FrameworkPicker, PersonStandards, StandardsTable } from "./Standards";
import { cleanBook, downloadBlob, sheetName } from "./importer";
import { courseTitle } from "./courseTitles";
import { k } from "./orgsStrings";
import { TabPanel, Tabs, useTab, type TabDef } from "./Tabs";
import "../styles/admin.css";
import "./strings";

const STATUSES: Status[] = ["onTrack", "support", "inactive", "notStarted"];
const UNESCO_T = framework("unesco-t")!;
type Sort = "name" | "lessons" | "score" | "last";
type PersonLink = (uid: string) => string;
/** Rows of the people table shown at first, and added by each "Show more": thousands of rows are slow on an old laptop. */
const PAGE = 100;
/**
 * The day an ISO week ("2026-W46", as summaries count lessons) starts, short and in the page's language: "Nov 9",
 * «٩ نوفمبر». The chart's ends are said with it: "W46" is no word in Arabic and tells few people much in English.
 * A key it can't read, or a locale the browser doesn't know, keeps the week's number.
 */
export function weekLabel(week: string, locale: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return week;
  // 4 January is always in week 1; weeks start on Monday.
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const monday = jan4 + ((Number(m[2]) - 1) * 7 - ((new Date(jan4).getUTCDay() + 6) % 7)) * 864e5;
  try { return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(monday); }
  catch { return week.slice(5); }
}
/** A score as a percentage in the page's numerals, or a dash when there is none. */
const usePct = () => { const { num } = useI18n(); return (x: number | null) => (x === null ? "—" : num(x, { style: "percent" })); };

/**
 * An organization's full report on its students and teachers (TECHNICAL.md "Organization analytics"): activity,
 * standards (UNESCO, DigComp, ISTE, CSTA), tracks, courses, classes and every person, with an Excel export.
 * Org admins see their own organization (/admin/analytics); platform admins any (/super/orgs/:orgId/report).
 * `mode="teacher"` (/teach/analytics): a teacher's own students (the rules let teachers read only those) and their
 * own learning against the teachers' frameworks.
 *
 * The filters (who, class, teacher), Export and Refresh sit above tabs (admin/Tabs.tsx, `?tab=`): overview, standards,
 * tracks and courses, classes (and teachers), people, and in teacher mode their own learning. Every tab is worked out
 * from the one read of the people, so tabs defer no read here: what they save is the sums and the tables, which each
 * panel below works out for itself, so a tab nobody opens costs nothing. What the person chose (framework, status,
 * search, sort) lives in the page, so it survives a change of tab.
 *
 * An organization's people come through admin/data.ts useMembers (view "report": pages of rows with their whole
 * summaries, shared with the dashboard). Nothing is counted, shown or exported from a list that is still arriving:
 * until it is whole the page says how many people have loaded. Every sum is memoised on the list, so typing in the
 * search box or changing tab works none of them out again, and the people table shows 100 rows at a time.
 */
export function OrgReport({ mode = "org" }: { mode?: "org" | "teacher" }) {
  const { orgId: param } = useParams();
  const { orgId: mine, role, user } = useAuth();
  const orgId = param ?? mine;
  const sup = role === "superadmin";
  const teach = mode === "teacher";
  const { t, L, locale, dir } = useI18n();
  const nav = useNavigate();
  const tracks = useTracks();
  const { data: org } = useOrg(orgId);
  const org$ = useMembers(teach ? null : orgId, "report");
  const mine$ = useMyStudents(teach ? orgId : null, user?.uid);
  const me$ = usePerson(teach ? user?.uid : undefined);
  const me = me$.data;
  // Read when the report opens, not kept live (no listeners): Refresh reads the people again.
  const refresh = () => { org$.reload(); mine$.reload(); me$.reload(); };
  // A teacher's report waits for their own profile too: the tabs then list "My learning" from their first render, so
  // /teach/analytics?tab=me opens there instead of working out the overview first. The list is the same one for as
  // long as the reads stand, so the panels' sums are worked out once, not on every keystroke in the search box.
  const own = mine$.data, waitMe = teach && me$.loading;
  const members = useMemo(() => (teach ? (waitMe ? undefined : own && me ? [me, ...own] : own) : org$.data), [teach, waitMe, own, me, org$.data]);
  const error = teach ? mine$.error : org$.error;
  // Their own learning: the framework they picked (none yet: MyLearning opens on the one where their lessons count most).
  const [myFw, setMyFw] = useState<string | null>(null);
  const { data: catalog } = useAsync(loadCatalog, []);
  const [filter, setFilter] = useState<Filter>({ audience: "students" });
  const [fwId, setFwId] = useState("unesco-s");
  const [statusF, setStatusF] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const all = useMemo(() => members ?? [], [members]);
  const people = useMemo(() => filterPeople(all, filter), [all, filter]);
  const teachers = useMemo(() => all.filter((m) => m.role === "teacher"), [all]);
  const groups = useMemo(() => [...new Set(all.filter((m) => m.role === "student" || m.role === "teacher").map((m) => m.group ?? "").filter(Boolean))].sort(), [all]);
  const fw = framework(fwId) ?? FRAMEWORKS[0];
  // The standards rows are worked out inside the table (admin/Standards.tsx): the same element for the same people
  // and framework, so a render of the page for anything else (a keystroke in the search) leaves it alone.
  const standards = useMemo(() => <StandardsTable people={people} fw={fw} />, [people, fw]);
  // A course unpublished since keeps its title (courseTitles.json), said to be no longer offered; an unknown one its id.
  const courseName = (id: string) => { const c = courseTitle(id, catalog?.units, L); return c.gone ? t("or.retired", { id: c.known ? c.text : isolate(id) }) : c.text; };
  const personLink: PersonLink = (uid) => (teach ? `/teach/${uid}` : sup ? `/super/people/${uid}` : `/admin/people/${uid}`);

  // The teachers' table is the organization's (a teacher reads only their own students); a tab with nothing under it
  // is left out, and "My learning" is the teacher's own.
  const TABS: TabDef[] = [
    { id: "overview", label: t("tabs.overview") },
    { id: "standards", label: t("tabs.standards") },
    { id: "courses", label: t("tabs.tracksCourses") },
    { id: "classes", label: t(teach ? "tabs.classes" : "tabs.classesTeachers"), hidden: !groups.length && (teach || !teachers.length) },
    { id: "people", label: t("tabs.people") },
    { id: "me", label: t("tabs.myLearning"), hidden: !teach || !me },
  ];
  const tab = useTab(TABS);

  const setAudience = (audience: Filter["audience"]) => {
    setFilter((f) => ({ ...f, audience }));
    setFwId(audience === "teachers" ? "unesco-t" : "unesco-s");
  };
  // The table a status filters is under People now: choosing one opens it there; un-choosing only clears the filter.
  const pickStatus = (s: Status) => {
    if (statusF === s) { setStatusF(""); return; }
    setStatusF(s);
    // The chip pressed leaves the page with its panel, and focus would be left on nothing: it goes to the People tab,
    // so a keyboard carries on from there and a screen reader says where the page went.
    document.querySelector<HTMLElement>('[role="tab"][data-tab="people"]')?.focus({ preventScroll: true });
    tab.show("people");
  };

  const exportXlsx = async () => {
    // Only ever from the whole list: `members` is unset while it is still arriving, and the button is off.
    if (!members) return;
    setBusy(true); setExportErr("");
    try {
      // A teacher's export is their own students': it says so in its name and on its first line.
      const blob = await reportXlsx({ people, all, fw, t, L, tracks: (id) => tracks.name(id), courseName, courses: coursesOf(people, catalog?.units), orgName: org?.name ?? "", locale, dir,
        teacherName: teach ? me?.name || displayLogin(me?.email ?? "") : undefined });
      const slug = (x: string) => x.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      downloadBlob(blob, teach ? `darsi-${slug(me?.name || "teacher") || "teacher"}-students.xlsx` : `darsi-${slug(org?.name ?? "org") || "org"}-report.xlsx`);
    } catch (e) {
      // The spreadsheet library is a lazy chunk (it can fail to load offline), and writing the file can fail too.
      setExportErr(`${t(k("og.xlsxFailed"))} ${errorText(e, t)}`);
    } finally { setBusy(false); }
  };

  // The bar says what the page is, short enough for a phone in any language ("Nile Valley Language School: learning
  // report" was cut in the middle of a word). Whose report it is stands on the page for a platform admin, who reads
  // many organizations'; an organization's own admin has one.
  const bar = <AppBar title={t(teach ? "or.teacherTitle" : "or.title")} onBack={() => nav(teach ? "/teach" : sup ? `/super/orgs/${orgId}` : "/admin")} backLabel={t("common.back")} />;
  // Nothing to show: the way back stays, with the reason and Retry. (A refresh that failed keeps the report: below.)
  if (error && !members) return <>{bar}<main className="screen wide stack-lg"><ErrorNote error={error} reload={refresh} /></main></>;
  return (
    <>
      {bar}
      <main className="screen wide stack-lg">
        {sup && org && <p><strong><bdi>{org.name}</bdi></strong></p>}
        <section className="panel or-filters" aria-label={t("or.filters")}>
          {!teach && <div className="row-gap" role="group" aria-label={t("or.who")}>
            {(["students", "teachers", "all"] as const).map((a) => <Button key={a} size="sm" variant={filter.audience === a ? "primary" : "ghost"} aria-pressed={filter.audience === a} onClick={() => setAudience(a)}>{t(`or.aud.${a}`)}</Button>)}
          </div>}
          <label className="or-pick"><span>{t("col.group")}</span>
            <select value={filter.group ?? ""} onChange={(e) => setFilter((f) => ({ ...f, group: e.target.value || undefined }))}>
              <option value="">{t("or.allGroups")}</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {!teach && <label className="or-pick"><span>{t("or.teacher")}</span>
            <select value={filter.teacher ?? ""} onChange={(e) => setFilter((f) => ({ ...f, teacher: e.target.value || undefined }))}>
              <option value="">{t("or.allTeachers")}</option>{teachers.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </label>}
          <Button size="sm" variant="secondary" icon="file" loading={busy} disabled={!people.length} onClick={() => { void exportXlsx(); }}>{t("or.export")}</Button>
          <Button size="sm" variant="ghost" icon="sync" loading={!teach && org$.refreshing} onClick={refresh}>{t("adm.refresh")}</Button>
        </section>
        {exportErr && <p className="notice err" role="alert">{exportErr}</p>}
        {error && <ErrorNote error={error} reload={refresh} stale />}

        {!members ? <>
          <div className="loading" aria-busy="true" />
          {/* A long list arrives in pages: how far it is, and no figure until all of it is here. */}
          {!teach && org$.loaded > 0 && <p className="muted" role="status">{t(k("og.loadedSoFar"), { n: org$.loaded })}</p>}
        </> : people.length === 0 ? <EmptyState icon="profile" title={t("or.nobody")} /> : (
          <Tabs label={t("tabs.sections")} tabs={TABS}>
            <TabPanel id="overview"><Overview people={people} audience={filter.audience} statusF={statusF} onStatus={pickStatus} /></TabPanel>
            <TabPanel id="standards">
              <section className="panel stack" aria-labelledby="std-h"><h3 id="std-h">{t("or.standards")}</h3>
                <FrameworkPicker value={fw.id} onChange={setFwId} />
                {standards}
              </section>
            </TabPanel>
            <TabPanel id="courses"><TracksCourses people={people} units={catalog?.units} courseName={courseName} /></TabPanel>
            <TabPanel id="classes"><Classes all={all} people={people} teachers={!teach && teachers.length > 0} classes={groups.length > 0} personLink={personLink} /></TabPanel>
            {/* Not kept while closed: it only shows the page's own people in a long table, and its search, sort and
                status live in the page, so coming back is a render, not a read, and a phone holds less in between. */}
            <TabPanel id="people" keep={false}>
              <People people={people} fw={fw} statusF={statusF} onStatus={setStatusF} q={q} onQ={setQ} sort={sort} onSort={setSort} personLink={personLink} />
            </TabPanel>
            {teach && me && <TabPanel id="me"><MyLearning me={me} fwId={myFw} onFw={setMyFw} /></TabPanel>}
          </Tabs>
        )}
      </main>
    </>
  );
}

/** Per course people have lessons in: the Courses table and the Excel export both ask, and neither before it is needed. */
const coursesOf = (people: Profile[], units?: ReadonlyArray<{ id: string; lessons: number }>) => byCourse(people, (units ?? []).map((u) => ({ id: u.id, lessons: u.lessons })));

/** Overview: the four totals, who needs attention (a status opens People with that filter) and the lessons per week. */
function Overview({ people, audience, statusF, onStatus }: { people: Profile[]; audience: Filter["audience"]; statusF: Status | ""; onStatus: (s: Status) => void }) {
  const { t, num, locale } = useI18n();
  const dur = useDuration();
  const pct = usePct();
  const tot = useMemo(() => totals(people), [people]);
  // Each bar is named by the day its week starts (the chart's two ends show it, and every bar says it with its count).
  const weeks = useMemo(() => weekly(people).map((w) => ({ key: w.week, label: weekLabel(w.week, locale), v: w.v })), [people, locale]);
  return (
    <>
      <section className="tiles">
        <div className="tile"><span>{t(`or.aud.${audience}`)}</span><strong>{num(tot.people)}</strong><small>{t("or.activeWeekMonth", { week: tot.active7, month: tot.active30 })}</small></div>
        <div className="tile"><span>{t("an.lessons")}</span><strong>{num(tot.lessons)}</strong><small>{t("or.perPerson", { n: num(Math.round((tot.lessons / tot.people) * 10) / 10) })}</small></div>
        <div className="tile"><span>{t("an.score")}</span><strong>{pct(tot.avgAccuracy)}</strong></div>
        <div className="tile"><span>{t("or.time")}</span><strong>{dur(tot.seconds)}</strong></div>
      </section>

      <section className="panel stack" aria-labelledby="st-h"><h3 id="st-h">{t("or.statusTitle")}</h3>
        <div className="row-gap">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={`or-chip or-st-${s}`} aria-pressed={statusF === s} onClick={() => onStatus(s)}>
              {t(`or.st.${s}`)} <strong>{num(tot.status[s])}</strong>
            </button>
          ))}
        </div>
        <p className="muted small">{t("or.statusHint")}</p>
      </section>

      <section className="panel stack"><h3>{t("or.weekly")}</h3>
        <Bars data={weeks} label={t("an.m.lessons")} per="week" empty={t("or.noWeekly")} />
      </section>
    </>
  );
}

/** Tracks and courses: what people learn, and how far they got. */
function TracksCourses({ people, units, courseName }: { people: Profile[]; units?: ReadonlyArray<{ id: string; lessons: number }>; courseName: (id: string) => string }) {
  const { t, num } = useI18n();
  const tracks = useTracks();
  const dur = useDuration();
  const pct = usePct();
  const courses = useMemo(() => coursesOf(people, units), [people, units]);
  const byTr = useMemo(() => byTrack(people), [people]);
  return (
    <div className="admin-cols">
      <section className="panel stack"><h3>{t("or.tracks")}</h3>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("or.track")}</th><th className="num">{t("or.people")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.time")}</th></tr></thead>
          <tbody>{byTr.map((x) => (
            <tr key={x.track}><td data-cell="main" data-label={t("or.track")}>{tracks.name(x.track)}</td><td data-label={t("or.people")} className="num">{num(x.people)}</td><td data-label={t("col.lessons")} className="num">{num(x.lessons)}</td><td data-label={t("col.accuracy")} className="num">{pct(x.avgAccuracy)}</td><td data-label={t("or.time")} className="num">{dur(x.seconds)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="panel stack"><h3>{t("or.courses")}</h3>
        {courses.length === 0 ? <p className="muted">{t("or.noCourses")}</p> : <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("or.course")}</th><th className="num">{t("or.started")}</th><th className="num">{t("or.completed")}</th></tr></thead>
          <tbody>{courses.map((c) => <tr key={c.id}><td data-cell="main" data-label={t("or.course")}>{courseName(c.id)}</td><td data-label={t("or.started")} className="num">{num(c.started)}</td><td data-label={t("or.completed")} className="num">{c.completed == null ? "—" : num(c.completed)}</td></tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  );
}

/**
 * Classes, and for an organization its teachers: each teacher's own learning beside their students' (from every
 * member, whatever the filters say), then the filtered people per class.
 */
function Classes({ all, people, teachers, classes, personLink }: { all: Profile[]; people: Profile[]; teachers: boolean; classes: boolean; personLink: PersonLink }) {
  const { t, num } = useI18n();
  const pct = usePct();
  // Worked out once per list, and only for what is shown: not on every render of the page.
  const perTeacher = useMemo(() => (teachers ? byTeacher(all, UNESCO_T) : []), [teachers, all]);
  const perGroup = useMemo(() => (classes ? byGroup(people) : []), [classes, people]);
  return (
    <>
      {teachers && <section className="panel stack" aria-labelledby="tch-h"><h3 id="tch-h">{t("or.teachers")}</h3>
        <p className="muted small">{t("or.teachersHint")}</p>
        <div className="table-wrap"><table className="data-table or-wide">
          <thead><tr><th>{t("or.teacher")}</th><th className="num">{t("or.ownLessons")}</th><th className="num">{t("or.ownScore")}</th><th className="num">{t("or.ownSecure")}</th><th className="num">{t("or.students")}</th><th className="num">{t("an.active")}</th><th className="num">{t("or.studentsScore")}</th><th className="num">{t("or.st.support")}</th></tr></thead>
          <tbody>{perTeacher.map(({ teacher: m, own, students: st }) => (
            <tr key={m.uid}>
              <td data-cell="main" data-label={t("or.teacher")}><Link to={personLink(m.uid)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name ?? "").slice(0, 1)}</span><span><strong><bdi>{m.name}</bdi></strong><small>{lastActiveText(own.last, t)}</small></span></Link></td>
              <td data-label={t("or.ownLessons")} className="num">{num(own.lessons)}</td>
              <td data-label={t("or.ownScore")} className="num" {...emptyCell(own.avgAccuracy === null)}>{pct(own.avgAccuracy)}</td>
              <td data-label={t("or.ownSecure")} className="num">{t("or.ofItems", { n: own.secure, of: UNESCO_T.items.length })}</td>
              <td data-label={t("or.students")} className="num">{num(st.people)}</td>
              <td data-label={t("an.active")} className="num">{num(st.active7)}</td>
              <td data-label={t("or.studentsScore")} className="num" {...emptyCell(st.avgAccuracy === null)}>{pct(st.avgAccuracy)}</td>
              <td data-label={t("or.st.support")} className="num">{num(st.status.support)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>}

      {classes && <section className="panel stack"><h3>{t("or.groups")}</h3>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("col.group")}</th><th className="num">{t("or.people")}</th><th className="num">{t("an.active")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.st.support")}</th><th className="num">{t("or.st.inactive")}</th></tr></thead>
          <tbody>{perGroup.map((g) => (
            <tr key={g.group}><td data-label={t("col.group")}>{g.group || "—"}</td><td data-label={t("or.people")} className="num">{num(g.people)}</td><td data-label={t("an.active")} className="num">{num(g.active7)}</td><td data-label={t("col.lessons")} className="num">{num(g.lessons)}</td><td data-label={t("col.accuracy")} className="num">{pct(g.avgAccuracy)}</td><td data-label={t("or.st.support")} className="num">{num(g.status.support)}</td><td data-label={t("or.st.inactive")} className="num">{num(g.status.inactive)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>}
    </>
  );
}

/** Every person the filters leave, to search, sort and narrow to one status (chosen here or on the overview). */
function People({ people, fw, statusF, onStatus, q, onQ, sort, onSort, personLink }: {
  people: Profile[]; fw: Framework; statusF: Status | ""; onStatus: (s: Status | "") => void;
  q: string; onQ: (q: string) => void; sort: Sort; onSort: (s: Sort) => void; personLink: PersonLink;
}) {
  const { t, num } = useI18n();
  const dur = useDuration();
  const pct = usePct();
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((m) => (!statusF || statusOf(m) === statusF) && (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0)
        : sort === "score" ? (b.summary?.avgAccuracy ?? -1) - (a.summary?.avgAccuracy ?? -1)
        : sort === "last" ? (lastSeen(b) ?? "").localeCompare(lastSeen(a) ?? "") : (a.name ?? "").localeCompare(b.name ?? ""));
  }, [people, statusF, q, sort]);
  // 100 rows, then "Show more"; a new search, status or order starts from the top again.
  const [shown, setShown] = useState(PAGE);
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) { setSeen(rows); setShown(PAGE); }
  const visible = rows.length > shown ? rows.slice(0, shown) : rows;
  // How many of the framework's items a person is secure in, worked out only for the rows on screen (a school of 5,000
  // shows 100: every item of every member was a few hundred thousand checks on each search or framework change), and
  // kept per list and framework, so a keystroke, a re-sort or "Show more" counts only rows not counted before.
  const secureCache = useMemo(() => new Map<string, number>(), [people, fw]);
  const secureOf = (m: Profile) => {
    let n = secureCache.get(m.uid);
    if (n === undefined) { n = fw.items.filter((it) => itemEvidence(m, it).level === 3).length; secureCache.set(m.uid, n); }
    return n;
  };
  return (
    <section className="panel stack">
      <div className="table-tools"><h3>{t("or.peopleTitle")}</h3>
        <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => onQ(e.target.value)} aria-label={t("adm.search")} />
        <select value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label={t("adm.sort")}>
          <option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="score">{t("col.accuracy")}</option><option value="last">{t("col.last")}</option>
        </select>
        {statusF && <Button size="sm" variant="ghost" icon="close" onClick={() => onStatus("")}>{t(`or.st.${statusF}`)}</Button>}
      </div>
      <div className="table-wrap"><table className="data-table or-wide">
        <thead><tr><th>{t("col.name")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.time")}</th><th className="num">{t("or.secure")}</th><th>{t("col.last")}</th><th>{t("or.status")}</th></tr></thead>
        <tbody>{visible.map((m) => {
          const st = statusOf(m);
          const secure = secureOf(m);
          return (
            <tr key={m.uid}>
              <td data-cell="main" data-label={t("col.name")}><Link to={personLink(m.uid)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name ?? "").slice(0, 1)}</span><span><strong>{m.name}</strong><small dir="ltr"><LoginText value={displayLogin(m.email ?? "")} /></small></span></Link></td>
              <td data-label={t("col.group")} {...emptyCell(m.group == null)}>{m.group ?? "—"}</td>
              <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
              <td data-label={t("col.accuracy")} className="num" {...emptyCell(!scoredOf(m.summary))}>{scoredOf(m.summary) ? pct(m.summary!.avgAccuracy) : "—"}</td>
              <td data-label={t("or.time")} className="num" {...emptyCell(!m.summary?.seconds)}>{m.summary?.seconds ? dur(m.summary.seconds) : "—"}</td>
              <td data-label={t("or.secure")} className="num">{t("or.ofItems", { n: secure, of: fw.items.length })}</td>
              <td data-label={t("col.last")}>{lastActiveText(lastSeen(m), t)}</td>
              <td data-label={t("or.status")}><span className={`or-chip or-st-${st}`}>{t(`or.st.${st}`)}</span></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {rows.length > shown && <div className="row-gap">
        <Button size="sm" variant="secondary" onClick={() => setShown(shown + PAGE)}>{t(k("og.showMore"))}</Button>
        <span className="muted small">{t(k("og.shownOf"), { shown, total: rows.length })}</span>
      </div>}
    </section>
  );
}

/**
 * A teacher's own learning against a framework: the one they picked, or until they do, the one where their lessons
 * count most (as the person page opens).
 */
function MyLearning({ me, fwId, onFw }: { me: Profile; fwId: string | null; onFw: (id: string) => void }) {
  const { t } = useI18n();
  const dur = useDuration();
  const pct = usePct();
  const best = useMemo(() => bestFramework(me, "unesco-t"), [me]);
  const shown = fwId ?? best;
  return (
    <section className="panel stack" aria-labelledby="me-h"><h3 id="me-h">{t("or.myLearning")}</h3>
      <p className="muted">{t("or.myLearningLine", { lessons: me.summary?.lessonsDone ?? 0, score: pct(scoredOf(me.summary) ? me.summary!.avgAccuracy : null), time: dur(me.summary?.seconds ?? 0) })}</p>
      <FrameworkPicker value={shown} onChange={onFw} />
      <PersonStandards person={me} fw={framework(shown) ?? FRAMEWORKS[1]} />
    </section>
  );
}

/**
 * The report as an Excel workbook for ministries, donors and school leaders: the summary, every person (with their
 * strength on each item of the chosen framework), the framework's items, and the classes.
 */
async function reportXlsx(o: {
  people: Profile[]; all: Profile[]; fw: Framework; orgName: string; locale: string; dir: "ltr" | "rtl";
  /** A teacher's export of their own students: their name goes on the first line. */
  teacherName?: string;
  t: ReturnType<typeof useI18n>["t"]; L: ReturnType<typeof useI18n>["L"]; tracks: (id: string) => string; courseName: (id: string) => string;
  courses: ReturnType<typeof byCourse>;
}) {
  const { people, all, fw, t, L } = o;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "Darsi";
  // Sheets read right to left in a right-to-left language; scores are shown as percentages (stored as 0–1).
  const rtl = o.dir === "rtl";
  const bold = (ws: import("exceljs").Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1, rightToLeft: rtl }]; };
  const percent = (ws: import("exceljs").Worksheet, key: string) => { ws.getColumn(key).numFmt = "0%"; };
  // One look-up table for the "Teacher" column: a find() per row was members times members on a large school.
  // The first member with an id wins, as find() chose.
  const names = new Map<string, string>();
  for (const m of all) if (!names.has(m.uid)) names.set(m.uid, m.name ?? "");
  const teacher = (id?: string | null) => (id ? names.get(id) ?? "" : "");
  const level = (n: number) => t((["or.lv0", "or.lv1", "or.lv2", "or.lv3"] as const)[n]);
  const tot = totals(people);

  const sum = wb.addWorksheet(sheetName(t("or.xSummary")));
  sum.addRows([
    o.teacherName !== undefined ? [t("or.teacherTitle"), `${o.orgName} — ${o.teacherName}`] : [t("or.title"), o.orgName],
    [t("or.xDate"), new Date().toISOString().slice(0, 10)], [t("or.framework"), `${L(fw.name)} (${fw.source})`],
    [t("or.people"), tot.people], [t("or.activeWeek"), tot.active7], [t("an.lessons"), tot.lessons],
    [t("an.score"), tot.avgAccuracy === null ? "" : Math.round(tot.avgAccuracy * 100) / 100], [t("or.xMinutes"), Math.round(tot.seconds / 60)],
    ...STATUSES.map((s) => [t(`or.st.${s}`), tot.status[s]]),
  ]);
  sum.getColumn(1).width = 30; sum.getColumn(1).font = { bold: true }; sum.getColumn(2).width = 50;
  sum.getCell("B7").numFmt = "0%"; // the score row
  sum.views = [{ rightToLeft: rtl }];

  const ppl = wb.addWorksheet(sheetName(t("or.peopleTitle")));
  ppl.columns = [
    { header: t("col.name"), key: "name", width: 28 }, { header: t("col.login"), key: "login", width: 30 }, { header: t("col.role"), key: "role", width: 12 },
    { header: t("col.group"), key: "group", width: 14 }, { header: t("or.teacher"), key: "teacher", width: 24 }, { header: t("col.lessons"), key: "lessons", width: 10 },
    { header: t("col.accuracy"), key: "score", width: 10 }, { header: t("or.xMinutes"), key: "minutes", width: 10 }, { header: t("col.last"), key: "last", width: 14 },
    { header: t("or.status"), key: "status", width: 16 },
    ...fw.items.map((it) => ({ header: `${it.id} ${L(it.label)}${it.level ? ` (${L(it.level)})` : ""}`, key: `i:${it.id}`, width: 18 })),
  ];
  for (const m of people) ppl.addRow({
    name: m.name, login: displayLogin(m.email ?? ""), role: m.role ? t(`rn.${m.role}` as "rn.student") : "", group: m.group ?? "", teacher: teacher(m.teacherId),
    lessons: m.summary?.lessonsDone ?? 0, score: scoredOf(m.summary) ? Math.round((m.summary!.avgAccuracy ?? 0) * 100) / 100 : "",
    minutes: Math.round((m.summary?.seconds ?? 0) / 60), last: (lastSeen(m) ?? "").slice(0, 10), status: t(`or.st.${statusOf(m)}`),
    ...Object.fromEntries(fw.items.map((it) => [`i:${it.id}`, level(itemEvidence(m, it).level)])),
  });
  bold(ppl); percent(ppl, "score");

  const std = wb.addWorksheet(sheetName(t("or.standards")));
  std.columns = [{ header: t("or.item"), key: "id", width: 10 }, { header: t("or.xLabel"), key: "label", width: 44 }, { header: t("or.reached"), key: "reached", width: 12 },
    ...[0, 1, 2, 3].map((i) => ({ header: level(i), key: `l${i}`, width: 12 })), { header: t("col.accuracy"), key: "score", width: 10 }, { header: t("or.xCodes"), key: "codes", width: 40 }];
  for (const p of standardsReport(people, fw)) std.addRow({
    id: p.item.id, label: `${L(p.item.label)}${p.item.level ? ` (${L(p.item.level)})` : ""}`, reached: p.reached,
    l0: p.levels[0], l1: p.levels[1], l2: p.levels[2], l3: p.levels[3], score: p.avgAccuracy === null ? "" : Math.round(p.avgAccuracy * 100) / 100, codes: p.item.codes.join(", "),
  });
  bold(std); percent(std, "score");

  const grp = wb.addWorksheet(sheetName(t("or.groups")));
  grp.columns = [{ header: t("col.group"), key: "g", width: 16 }, { header: t("or.people"), key: "n", width: 10 }, { header: t("an.active"), key: "a", width: 12 }, { header: t("col.lessons"), key: "l", width: 10 },
    { header: t("col.accuracy"), key: "s", width: 10 }, ...STATUSES.map((s) => ({ header: t(`or.st.${s}`), key: s, width: 14 }))];
  for (const g of byGroup(people)) grp.addRow({ g: g.group || "—", n: g.people, a: g.active7, l: g.lessons, s: g.avgAccuracy === null ? "" : Math.round(g.avgAccuracy * 100) / 100, ...g.status });
  bold(grp); percent(grp, "s");

  const crs = wb.addWorksheet(sheetName(t("or.courses")));
  crs.columns = [{ header: t("or.course"), key: "c", width: 44 }, { header: t("or.started"), key: "s", width: 12 }, { header: t("or.completed"), key: "d", width: 12 }];
  for (const c of o.courses) crs.addRow({ c: o.courseName(c.id), s: c.started, d: c.completed ?? "—" });
  bold(crs);

  // Names and ids are isolated on screen (invisible U+2066–U+2069 marks): none of that goes into the file.
  cleanBook(wb);
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
