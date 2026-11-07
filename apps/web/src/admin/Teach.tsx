import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { scoredOf, type Profile } from "../auth/types";
import { useI18n } from "../i18n";
import { PeopleTable } from "./AdminHome";
import { byName, daysSince, useMyStudents } from "./data";
import { PersonDetail } from "./PersonDetail";
import { statusOf } from "./orgStats";
import { byWaiting, waitingOf, waitingTotals } from "./review";
import "./strings";

const lastActive = (m: Profile) => m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive;

/** A teacher's students (assigned by the org admin), with the same table and person page admins use. */
export function Teach() {
  const { t, num } = useI18n();
  const nav = useNavigate();
  const { user, orgId } = useAuth();
  const studentsQ = useMyStudents(orgId, user?.uid);
  const { data: students, error } = studentsQ;
  // Students with projects waiting come first by default (review.ts: counts kept on their profiles, no extra reads).
  const [q, setQ] = useState(""); const [sort, setSort] = useState<"review" | "name" | "lessons" | "last">("review");
  const [only, setOnly] = useState<"" | "review" | "support">("");

  const stats = useMemo(() => {
    const list = students ?? [];
    const withAcc = list.filter((m) => scoredOf(m.summary)); // people with a graded lesson (a project lesson is no score)
    return { active: list.filter((m) => daysSince(lastActive(m)) < 7).length, done: list.reduce((a, m) => a + (m.summary?.lessonsDone ?? 0), 0),
      acc: withAcc.length ? withAcc.reduce((a, m) => a + (m.summary?.avgAccuracy ?? 0), 0) / withAcc.length : null,
      waiting: waitingTotals(list), support: list.filter((m) => statusOf(m) === "support").length };
  }, [students]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (students ?? []).filter((m) => (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s)))
      && (only !== "review" || waitingOf(m) > 0) && (only !== "support" || statusOf(m) === "support"))
      .sort((a, b) => sort === "review" ? byWaiting(a, b) : sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0) : sort === "last" ? daysSince(lastActive(a)) - daysSince(lastActive(b)) : byName(a, b));
  }, [students, q, sort, only]);
  const toggle = (k: "review" | "support") => setOnly(only === k ? "" : k);

  const loading = Boolean(orgId && user) && !students && !error;
  return (
    <>
      <AppBar title={t("teach.title")} />
      <main className="screen wide stack-lg">
        {error && <p className="notice err">{error.message}</p>}
        {loading ? <div className="loading" aria-busy="true" /> : !students?.length ? <EmptyState icon="profile" title={t("teach.empty")} body={t("teach.none")} /> : <>
          <section className="tiles">
            <div className="tile"><span>{t("teach.students")}</span><strong>{num(students.length)}</strong></div>
            <div className="tile"><span>{t("adm.active7")}</span><strong>{num(stats.active)}</strong><small>{num(stats.active / students.length, { style: "percent" })}</small></div>
            <div className="tile"><span>{t("adm.lessons")}</span><strong>{num(stats.done)}</strong></div>
            <div className="tile"><span>{t("adm.accuracy")}</span><strong>{stats.acc == null ? "—" : num(stats.acc, { style: "percent" })}</strong></div>
            <div className="tile"><span>{t("teach.toReview")}</span><strong>{num(stats.waiting.projects)}</strong>{stats.waiting.people > 0 && <small>{`${t("teach.students")}: ${num(stats.waiting.people)}`}</small>}</div>
            <div className="tile"><span>{t("or.st.support")}</span><strong>{num(stats.support)}</strong></div>
          </section>
          <div><Button icon="chart" onClick={() => nav("/teach/analytics")}>{t("or.openTeach")}</Button></div>
          <section className="panel">
            <div className="table-tools">
              <h3>{t("teach.students")}</h3>
              <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adm.search")} />
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
                <option value="review">{t("col.toReview")}</option><option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="last">{t("col.last")}</option>
              </select>
              {/* Show only the students to act on: projects waiting for a review, or scores that need support. */}
              {(stats.waiting.projects > 0 || only === "review") && <Button size="sm" variant={only === "review" ? "primary" : "secondary"} aria-pressed={only === "review"} onClick={() => toggle("review")}>{`${t("teach.toReview")}: ${num(stats.waiting.projects)}`}</Button>}
              {(stats.support > 0 || only === "support") && <Button size="sm" variant={only === "support" ? "primary" : "secondary"} aria-pressed={only === "support"} onClick={() => toggle("support")}>{`${t("or.st.support")}: ${num(stats.support)}`}</Button>}
              {/* The list is read when the page opens, not kept live (no listeners): this reads it again. */}
              <Button size="sm" variant="ghost" icon="sync" onClick={studentsQ.reload}>{t("adm.refresh")}</Button>
            </div>
            <PeopleTable rows={rows} to={(m) => `/teach/${m.uid}`} review />
          </section>
        </>}
      </main>
    </>
  );
}

/** /teach/:uid — the person page, read-only for teachers apart from project review. */
export const TeachPerson = () => <PersonDetail back="/teach" />;
