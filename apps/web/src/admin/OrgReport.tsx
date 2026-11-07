import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
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
import { Bars, useDuration } from "./charts";
import { bestFramework, FrameworkPicker, PersonStandards, StandardsTable } from "./Standards";
import { cleanBook, downloadBlob, sheetName } from "./importer";
import { courseTitle } from "./courseTitles";
import { refusalText } from "./refusals";
import "../styles/admin.css";
import "./strings";

const STATUSES: Status[] = ["onTrack", "support", "inactive", "notStarted"];
const UNESCO_T = framework("unesco-t")!;

/**
 * An organization's full report on its students and teachers (TECHNICAL.md "Organization analytics"): activity,
 * standards (UNESCO, DigComp, ISTE, CSTA), tracks, courses, classes and every person, with an Excel export.
 * Org admins see their own organization (/admin/analytics); platform admins any (/super/orgs/:orgId/report).
 * `mode="teacher"` (/teach/analytics): a teacher's own students (the rules let teachers read only those) and their
 * own learning against the teachers' frameworks.
 */
export function OrgReport({ mode = "org" }: { mode?: "org" | "teacher" }) {
  const { orgId: param } = useParams();
  const { orgId: mine, role, user } = useAuth();
  const orgId = param ?? mine;
  const sup = role === "superadmin";
  const teach = mode === "teacher";
  const { t, L, num, locale, dir } = useI18n();
  const nav = useNavigate();
  const tracks = useTracks();
  const dur = useDuration();
  const { data: org } = useOrg(orgId);
  const org$ = useMembers(teach ? null : orgId);
  const mine$ = useMyStudents(teach ? orgId : null, user?.uid);
  const me$ = usePerson(teach ? user?.uid : undefined);
  const me = me$.data;
  // Read when the report opens, not kept live (no listeners): Refresh reads the people again.
  const refresh = () => { org$.reload(); mine$.reload(); me$.reload(); };
  const members = teach ? (mine$.data && me ? [me, ...mine$.data] : mine$.data) : org$.data;
  const error = teach ? mine$.error : org$.error;
  // Their own learning opens on the framework where their lessons count most (as the person page does).
  const [myFw, setMyFw] = useState<string | null>(null);
  const shownMy = myFw ?? (me ? bestFramework(me, "unesco-t") : "unesco-t");
  const { data: catalog } = useAsync(loadCatalog, []);
  const [filter, setFilter] = useState<Filter>({ audience: "students" });
  const [fwId, setFwId] = useState("unesco-s");
  const [statusF, setStatusF] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "lessons" | "score" | "last">("name");
  const [busy, setBusy] = useState(false);

  const all = members ?? [];
  const people = useMemo(() => filterPeople(all, filter), [all, filter]);
  const teachers = all.filter((m) => m.role === "teacher");
  const groups = [...new Set(all.filter((m) => m.role === "student" || m.role === "teacher").map((m) => m.group ?? "").filter(Boolean))].sort();
  const tot = useMemo(() => totals(people), [people]);
  const fw = framework(fwId) ?? FRAMEWORKS[0];
  // A course unpublished since keeps its title (courseTitles.json), said to be no longer offered; an unknown one its id.
  const courseName = (id: string) => { const c = courseTitle(id, catalog?.units, L); return c.gone ? t("or.retired", { id: c.known ? c.text : isolate(id) }) : c.text; };
  const courses = useMemo(() => byCourse(people, (catalog?.units ?? []).map((u) => ({ id: u.id, lessons: u.lessons }))), [people, catalog]);
  const pct = (x: number | null) => (x === null ? "—" : num(x, { style: "percent" }));
  const personLink = (uid: string) => (teach ? `/teach/${uid}` : sup ? `/super/people/${uid}` : `/admin/people/${uid}`);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((m) => (!statusF || statusOf(m) === statusF) && (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0)
        : sort === "score" ? (b.summary?.avgAccuracy ?? -1) - (a.summary?.avgAccuracy ?? -1)
        : sort === "last" ? (lastSeen(b) ?? "").localeCompare(lastSeen(a) ?? "") : (a.name ?? "").localeCompare(b.name ?? ""));
  }, [people, statusF, q, sort]);

  const setAudience = (audience: Filter["audience"]) => {
    setFilter((f) => ({ ...f, audience }));
    setFwId(audience === "teachers" ? "unesco-t" : "unesco-s");
  };

  const exportXlsx = async () => {
    setBusy(true);
    try {
      // A teacher's export is their own students': it says so in its name and on its first line.
      const blob = await reportXlsx({ people, all, fw, t, L, tracks: (id) => tracks.name(id), courseName, courses, orgName: org?.name ?? "", locale, dir,
        teacherName: teach ? me?.name || displayLogin(me?.email ?? "") : undefined });
      const slug = (x: string) => x.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      downloadBlob(blob, teach ? `darsi-${slug(me?.name || "teacher") || "teacher"}-students.xlsx` : `darsi-${slug(org?.name ?? "org") || "org"}-report.xlsx`);
    } finally { setBusy(false); }
  };

  if (error) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={refusalText(error, t)} /></main>;
  return (
    <>
      <AppBar title={teach ? t("or.teacherTitle") : org ? t("or.titleOf", { org: org.name }) : t("or.title")} onBack={() => nav(teach ? "/teach" : sup ? `/super/orgs/${orgId}` : "/admin")} backLabel={t("common.back")} />
      <main className="screen wide stack-lg">
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
          <Button size="sm" variant="ghost" icon="sync" onClick={refresh}>{t("adm.refresh")}</Button>
        </section>

        {!members ? <div className="loading" aria-busy="true" /> : people.length === 0 ? <EmptyState icon="profile" title={t("or.nobody")} /> : <>
          <section className="tiles">
            <div className="tile"><span>{t(`or.aud.${filter.audience}`)}</span><strong>{num(tot.people)}</strong><small>{t("or.activeWeekMonth", { week: tot.active7, month: tot.active30 })}</small></div>
            <div className="tile"><span>{t("an.lessons")}</span><strong>{num(tot.lessons)}</strong><small>{t("or.perPerson", { n: num(Math.round((tot.lessons / tot.people) * 10) / 10) })}</small></div>
            <div className="tile"><span>{t("an.score")}</span><strong>{pct(tot.avgAccuracy)}</strong></div>
            <div className="tile"><span>{t("or.time")}</span><strong>{dur(tot.seconds)}</strong></div>
          </section>

          <section className="panel stack" aria-labelledby="st-h"><h3 id="st-h">{t("or.statusTitle")}</h3>
            <div className="row-gap">
              {STATUSES.map((s) => (
                <button key={s} type="button" className={`or-chip or-st-${s}`} aria-pressed={statusF === s} onClick={() => setStatusF(statusF === s ? "" : s)}>
                  {t(`or.st.${s}`)} <strong>{num(tot.status[s])}</strong>
                </button>
              ))}
            </div>
            <p className="muted small">{t("or.statusHint")}</p>
          </section>

          <section className="panel stack"><h3>{t("or.weekly")}</h3>
            <Bars data={weekly(people).map((w) => ({ key: w.week, label: w.week.slice(5), v: w.v }))} label={t("an.m.lessons")} per="week" empty={t("or.noWeekly")} />
          </section>

          <section className="panel stack" aria-labelledby="std-h"><h3 id="std-h">{t("or.standards")}</h3>
            <FrameworkPicker value={fw.id} onChange={setFwId} />
            <StandardsTable people={people} fw={fw} />
          </section>

          {teach && me && <section className="panel stack" aria-labelledby="me-h"><h3 id="me-h">{t("or.myLearning")}</h3>
            <p className="muted">{t("or.myLearningLine", { lessons: me.summary?.lessonsDone ?? 0, score: pct(scoredOf(me.summary) ? me.summary!.avgAccuracy : null), time: dur(me.summary?.seconds ?? 0) })}</p>
            <FrameworkPicker value={shownMy} onChange={setMyFw} />
            <PersonStandards person={me} fw={framework(shownMy) ?? FRAMEWORKS[1]} />
          </section>}

          {!teach && teachers.length > 0 && <section className="panel stack" aria-labelledby="tch-h"><h3 id="tch-h">{t("or.teachers")}</h3>
            <p className="muted small">{t("or.teachersHint")}</p>
            <div className="table-wrap"><table className="data-table or-wide">
              <thead><tr><th>{t("or.teacher")}</th><th className="num">{t("or.ownLessons")}</th><th className="num">{t("or.ownScore")}</th><th className="num">{t("or.ownSecure")}</th><th className="num">{t("or.students")}</th><th className="num">{t("an.active")}</th><th className="num">{t("or.studentsScore")}</th><th className="num">{t("or.st.support")}</th></tr></thead>
              <tbody>{byTeacher(all, UNESCO_T).map(({ teacher: m, own, students: st }) => (
                <tr key={m.uid}>
                  <td data-label={t("or.teacher")}><Link to={personLink(m.uid)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name ?? "").slice(0, 1)}</span><span><strong><bdi>{m.name}</bdi></strong><small>{lastActiveText(own.last, t)}</small></span></Link></td>
                  <td data-label={t("or.ownLessons")} className="num">{num(own.lessons)}</td>
                  <td data-label={t("or.ownScore")} className="num">{pct(own.avgAccuracy)}</td>
                  <td data-label={t("or.ownSecure")} className="num">{t("or.ofItems", { n: own.secure, of: UNESCO_T.items.length })}</td>
                  <td data-label={t("or.students")} className="num">{num(st.people)}</td>
                  <td data-label={t("an.active")} className="num">{num(st.active7)}</td>
                  <td data-label={t("or.studentsScore")} className="num">{pct(st.avgAccuracy)}</td>
                  <td data-label={t("or.st.support")} className="num">{num(st.status.support)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>}

          <div className="admin-cols">
            <section className="panel stack"><h3>{t("or.tracks")}</h3>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>{t("or.track")}</th><th className="num">{t("or.people")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.time")}</th></tr></thead>
                <tbody>{byTrack(people).map((x) => (
                  <tr key={x.track}><td data-label={t("or.track")}>{tracks.name(x.track)}</td><td data-label={t("or.people")} className="num">{num(x.people)}</td><td data-label={t("col.lessons")} className="num">{num(x.lessons)}</td><td data-label={t("col.accuracy")} className="num">{pct(x.avgAccuracy)}</td><td data-label={t("or.time")} className="num">{dur(x.seconds)}</td></tr>
                ))}</tbody>
              </table></div>
            </section>
            <section className="panel stack"><h3>{t("or.courses")}</h3>
              {courses.length === 0 ? <p className="muted">{t("or.noCourses")}</p> : <div className="table-wrap"><table className="data-table">
                <thead><tr><th>{t("or.course")}</th><th className="num">{t("or.started")}</th><th className="num">{t("or.completed")}</th></tr></thead>
                <tbody>{courses.map((c) => <tr key={c.id}><td data-label={t("or.course")}>{courseName(c.id)}</td><td data-label={t("or.started")} className="num">{num(c.started)}</td><td data-label={t("or.completed")} className="num">{c.completed == null ? "—" : num(c.completed)}</td></tr>)}</tbody>
              </table></div>}
            </section>
          </div>

          {groups.length > 0 && <section className="panel stack"><h3>{t("or.groups")}</h3>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t("col.group")}</th><th className="num">{t("or.people")}</th><th className="num">{t("an.active")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.st.support")}</th><th className="num">{t("or.st.inactive")}</th></tr></thead>
              <tbody>{byGroup(people).map((g) => (
                <tr key={g.group}><td data-label={t("col.group")}>{g.group || "—"}</td><td data-label={t("or.people")} className="num">{num(g.people)}</td><td data-label={t("an.active")} className="num">{num(g.active7)}</td><td data-label={t("col.lessons")} className="num">{num(g.lessons)}</td><td data-label={t("col.accuracy")} className="num">{pct(g.avgAccuracy)}</td><td data-label={t("or.st.support")} className="num">{num(g.status.support)}</td><td data-label={t("or.st.inactive")} className="num">{num(g.status.inactive)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>}

          <section className="panel stack">
            <div className="table-tools"><h3>{t("or.peopleTitle")}</h3>
              <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adm.search")} />
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
                <option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="score">{t("col.accuracy")}</option><option value="last">{t("col.last")}</option>
              </select>
              {statusF && <Button size="sm" variant="ghost" icon="close" onClick={() => setStatusF("")}>{t(`or.st.${statusF}`)}</Button>}
            </div>
            <div className="table-wrap"><table className="data-table or-wide">
              <thead><tr><th>{t("col.name")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th className="num">{t("or.time")}</th><th className="num">{t("or.secure")}</th><th>{t("col.last")}</th><th>{t("or.status")}</th></tr></thead>
              <tbody>{rows.map((m) => {
                const st = statusOf(m);
                const secure = fw.items.filter((it) => itemEvidence(m, it).level === 3).length;
                return (
                  <tr key={m.uid}>
                    <td data-label={t("col.name")}><Link to={personLink(m.uid)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name ?? "").slice(0, 1)}</span><span><strong>{m.name}</strong><small dir="ltr">{displayLogin(m.email ?? "")}</small></span></Link></td>
                    <td data-label={t("col.group")}>{m.group ?? "—"}</td>
                    <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
                    <td data-label={t("col.accuracy")} className="num">{scoredOf(m.summary) ? pct(m.summary!.avgAccuracy) : "—"}</td>
                    <td data-label={t("or.time")} className="num">{m.summary?.seconds ? dur(m.summary.seconds) : "—"}</td>
                    <td data-label={t("or.secure")} className="num">{t("or.ofItems", { n: secure, of: fw.items.length })}</td>
                    <td data-label={t("col.last")}>{lastActiveText(lastSeen(m), t)}</td>
                    <td data-label={t("or.status")}><span className={`or-chip or-st-${st}`}>{t(`or.st.${st}`)}</span></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </section>
        </>}
      </main>
    </>
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
  const teacher = (id?: string | null) => all.find((m) => m.uid === id)?.name ?? "";
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
