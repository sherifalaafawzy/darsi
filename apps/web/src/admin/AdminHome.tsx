import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin } from "../auth/api";
import type { Profile, Role } from "../auth/types";
import { useI18n } from "../i18n";
import { competency } from "../content/competencies";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { daysSince, useMembers, useOrg } from "./data";
import { lastActiveText } from "./PersonDetail";
import { downloadBlob } from "./importer";
import "../styles/admin.css";

/** Organization dashboard: stats, invite codes, capability coverage and the people table. */
export function AdminHome() {
  const { t, num, L } = useI18n();
  const nav = useNavigate();
  const { orgId } = useAuth();
  const { data: org } = useOrg(orgId);
  const { data: members = [], error } = useMembers(orgId);
  const [q, setQ] = useState(""); const [roleF, setRoleF] = useState<Role | "">(""); const [sort, setSort] = useState<"name" | "lessons" | "last">("name");
  const [copied, setCopied] = useState("");
  const { data: units = [] } = useAsync(async () => { const c = await loadCatalog(); return Promise.all(c.units.filter((u) => u.available).map((u) => loadUnit(u.id))); }, []);
  const lessonComps = useMemo(() => [...new Set(units.flatMap((u) => u.lessons.flatMap((l) => l.competencies ?? [])))], [units]);

  const stats = useMemo(() => {
    const by = (r: Role) => members.filter((m) => m.role === r).length;
    const done = members.reduce((a, m) => a + (m.summary?.lessonsDone ?? 0), 0);
    const withAcc = members.filter((m) => m.summary?.lessonsDone);
    return { teachers: by("teacher"), students: by("student"), admins: by("orgAdmin"), active: members.filter((m) => daysSince(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive) < 7).length, done,
      acc: withAcc.length ? withAcc.reduce((a, m) => a + (m.summary?.avgAccuracy ?? 0), 0) / withAcc.length : null };
  }, [members]);
  const coverage = useMemo(() => lessonComps.map((c) => ({ code: c, share: members.length ? members.filter((m) => (m.summary?.competencies?.[c] ?? 0) > 0).length / members.length : 0 })), [lessonComps, members]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members.filter((m) => (!roleF || m.role === roleF) && (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0) : sort === "last" ? daysSince(a.summary?.lastActive) - daysSince(b.summary?.lastActive) : a.name.localeCompare(b.name));
  }, [members, q, roleF, sort]);

  const exportCsv = () => {
    const head = [t("col.name"), t("col.login"), t("col.role"), t("col.group"), t("col.lessons"), t("col.xp"), t("col.accuracy"), t("col.last")];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head, ...rows.map((m) => [m.name, displayLogin(m.email), m.role, m.group ?? "", m.summary?.lessonsDone ?? 0, m.summary?.xp ?? 0, m.summary?.avgAccuracy != null ? Math.round(m.summary.avgAccuracy * 100) + "%" : "", m.summary?.lastActive ?? ""])].map((r) => r.map(esc).join(","));
    downloadBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `darsi-${(org?.name ?? "org").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-people.csv`);
  };
  const copy = async (code: string) => { await navigator.clipboard?.writeText(code).catch(() => {}); setCopied(code); setTimeout(() => setCopied(""), 1500); };

  return (
    <>
      <AppBar title={org?.name ?? t("adm.title")} />
      <main className="screen wide stack-lg">
        {error && <p className="notice err">{error.message}</p>}
        <section className="tiles">
          <div className="tile"><span>{t("adm.members")}</span><strong>{num(members.length)}</strong><small>{[`${t("role.teacher")}: ${num(stats.teachers)}`, `${t("role.student")}: ${num(stats.students)}`, `${t("role.orgAdmin")}: ${num(stats.admins)}`].join(t("common.sep"))}</small></div>
          <div className="tile"><span>{t("adm.active7")}</span><strong>{num(stats.active)}</strong><small>{members.length ? num(stats.active / members.length, { style: "percent" }) : "—"}</small></div>
          <div className="tile"><span>{t("adm.lessons")}</span><strong>{num(stats.done)}</strong></div>
          <div className="tile"><span>{t("adm.accuracy")}</span><strong>{stats.acc == null ? "—" : num(stats.acc, { style: "percent" })}</strong></div>
        </section>

        <div className="admin-cols">
          <section className="panel"><h3>{t("adm.codes")}</h3>
            {org?.inviteCodes ? (["teacher", "student"] as const).map((r) => (
              <div key={r} className="code-row">
                <span>{r === "teacher" ? t("adm.teacherCode") : t("adm.studentCode")}</span>
                <code dir="ltr">{org.inviteCodes![r]}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(org.inviteCodes![r])}>{copied === org.inviteCodes![r] ? t("adm.copied") : t("adm.copy")}</Button>
                <Button size="sm" variant="ghost" icon="sync" onClick={() => api.regenerateInviteCode({ orgId: org.id, role: r })}>{t("adm.newCode")}</Button>
              </div>
            )) : <p className="muted">—</p>}
          </section>
          <section className="panel"><h3>{t("adm.coverage")}</h3><p className="muted small">{t("adm.coverageHint")}</p>
            {coverage.map((c) => (
              <div key={c.code} className="cov-row"><span className="cap-code" dir="ltr">{c.code}</span><span className="cap-label">{L(competency(c.code)?.label)}</span>
                <span className="cov-bar" aria-hidden><i style={{ inlineSize: `${Math.round(c.share * 100)}%` }} /></span><span className="small">{num(c.share, { style: "percent" })}</span></div>
            ))}
          </section>
        </div>

        <section className="panel">
          <div className="table-tools">
            <h3>{t("adm.people")}</h3>
            {/* Here rather than in the app bar: on a phone the bar has no room left for the organization's name. */}
            <Button size="sm" icon="profile" onClick={() => nav("/admin/add")}>{t("adm.add")}</Button>
            <Button size="sm" variant="secondary" icon="install" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>
            <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adm.search")} />
            <select value={roleF} onChange={(e) => setRoleF(e.target.value as Role)} aria-label={t("col.role")}>
              <option value="">{t("adm.allRoles")}</option>{(["teacher", "student", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
              <option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="last">{t("col.last")}</option>
            </select>
            <Button size="sm" variant="ghost" icon="file" onClick={exportCsv}>{t("adm.exportCsv")}</Button>
          </div>
          {members.length === 0 ? <EmptyState icon="profile" title={t("adm.noPeople")} body={t("adm.noPeopleBody")} action={<Button size="sm" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>} /> : (
            <PeopleTable rows={rows} to={(m) => `/admin/people/${m.uid}`} />
          )}
        </section>
      </main>
    </>
  );
}

export function PeopleTable({ rows, to }: { rows: Profile[]; to: (m: Profile) => string }) {
  const { t, num } = useI18n();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>{t("col.name")}</th><th>{t("col.role")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th>{t("col.last")}</th></tr></thead>
        <tbody>{rows.map((m) => (
          <tr key={m.uid}>
            <td data-label={t("col.name")}><Link to={to(m)} className="person-link"><span className="avatar sm" aria-hidden>{m.name.slice(0, 1)}</span><span><strong>{m.name}</strong><small dir="ltr">{displayLogin(m.email)}</small></span></Link>{m.mustChangePassword && <span className="pill-warn" role="img" aria-label={t("adm.firstSignIn")} title={t("adm.firstSignIn")}><Icon name="lock" size={14} /></span>}</td>
            <td data-label={t("col.role")}>{t(`role.${m.role}` as "role.student")}</td>
            <td data-label={t("col.group")}>{m.group ?? "—"}</td>
            <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
            <td data-label={t("col.accuracy")} className="num">{m.summary?.lessonsDone ? num(m.summary.avgAccuracy, { style: "percent" }) : "—"}</td>
            <td data-label={t("col.last")}>{lastActiveText(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive, t)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
