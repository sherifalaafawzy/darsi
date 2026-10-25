import { useMemo, useState } from "react";
import { AppBar, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../auth/types";
import { useI18n } from "../i18n";
import { PeopleTable } from "./AdminHome";
import { daysSince, useMyStudents } from "./data";
import { PersonDetail } from "./PersonDetail";

const lastActive = (m: Profile) => m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive;

/** A teacher's students (assigned by the org admin), with the same table and person page admins use. */
export function Teach() {
  const { t, num } = useI18n();
  const { user, orgId } = useAuth();
  const { data: students, error } = useMyStudents(orgId, user?.uid);
  const [q, setQ] = useState(""); const [sort, setSort] = useState<"name" | "lessons" | "last">("name");

  const stats = useMemo(() => {
    const list = students ?? [];
    const withAcc = list.filter((m) => m.summary?.lessonsDone);
    return { active: list.filter((m) => daysSince(lastActive(m)) < 7).length, done: list.reduce((a, m) => a + (m.summary?.lessonsDone ?? 0), 0),
      acc: withAcc.length ? withAcc.reduce((a, m) => a + (m.summary?.avgAccuracy ?? 0), 0) / withAcc.length : null };
  }, [students]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (students ?? []).filter((m) => !s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0) : sort === "last" ? daysSince(lastActive(a)) - daysSince(lastActive(b)) : a.name.localeCompare(b.name));
  }, [students, q, sort]);

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
          </section>
          <section className="panel">
            <div className="table-tools">
              <h3>{t("teach.students")}</h3>
              <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adm.search")} />
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
                <option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="last">{t("col.last")}</option>
              </select>
            </div>
            <PeopleTable rows={rows} to={(m) => `/teach/${m.uid}`} />
          </section>
        </>}
      </main>
    </>
  );
}

/** /teach/:uid — the person page, read-only for teachers apart from project review. */
export const TeachPerson = () => <PersonDetail back="/teach" />;
