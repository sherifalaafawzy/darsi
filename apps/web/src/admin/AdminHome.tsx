import { Fragment, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { doc, writeBatch } from "firebase/firestore";
import { AppBar, Button, EmptyState, Icon } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin } from "../auth/api";
import { scoredOf, type Profile, type Role } from "../auth/types";
import { useI18n } from "../i18n";
import { COMPETENCIES, competency } from "../content/competencies";
import { byName, cleanGroup, daysSince, useInvites, useMembers, useOrg } from "./data";
import { lastActiveText } from "./PersonDetail";
import { byWaiting, waitingOf, waitingTotals } from "./review";
import { downloadBlob, plainText } from "./importer";
import { OrgBranding } from "./OrgBranding";
import { Note, SeatsPanel, type Msg } from "./Super";
import { refusalText } from "./refusals";
import "./strings";
import "../styles/admin.css";

/** Several people's class or teacher at once: batches of at most 500 writes (Firestore's limit), which the rules allow org admins. */
async function updateMembers(uids: string[], patch: Record<string, unknown>) {
  for (let i = 0; i < uids.length; i += 500) {
    const batch = writeBatch(db);
    for (const uid of uids.slice(i, i + 500)) batch.update(doc(db, "users", uid), patch);
    await batch.commit();
  }
}

/** Organization dashboard: stats, invite codes, capability coverage and the people table. */
export function AdminHome() {
  const { t, num, L } = useI18n();
  const nav = useNavigate();
  const { orgId } = useAuth();
  const orgQ = useOrg(orgId);
  const { data: org } = orgQ;
  const membersQ = useMembers(orgId);
  const { data: members = [], error } = membersQ;
  // Until the first read answers, nothing here says "0" or "No people yet" (which invited importing everyone again).
  const loading = membersQ.loading && !membersQ.data;
  // What the page that sent us here did (a person removed or deleted on their own page), said where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  const invites = useInvites(orgId);
  const [q, setQ] = useState(""); const [roleF, setRoleF] = useState<Role | "">(""); const [sort, setSort] = useState<"review" | "name" | "lessons" | "last">("review");
  const [copied, setCopied] = useState("");
  const [confirmNew, setConfirmNew] = useState<"teacher" | "student" | null>(null);
  const [codeBusy, setCodeBusy] = useState("");
  const [codeMsg, setCodeMsg] = useState<Msg>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cls, setCls] = useState(""); const [tch, setTch] = useState("");
  const [bulkBusy, setBulkBusy] = useState("");
  const [bulkMsg, setBulkMsg] = useState<Msg>(null);
  const refresh = () => { orgQ.reload(); membersQ.reload(); invites.reload(); };

  const stats = useMemo(() => {
    const by = (r: Role) => members.filter((m) => m.role === r).length;
    const done = members.reduce((a, m) => a + (m.summary?.lessonsDone ?? 0), 0);
    const withAcc = members.filter((m) => scoredOf(m.summary)); // people with a graded lesson (a project lesson is no score)
    return { teachers: by("teacher"), students: by("student"), admins: by("orgAdmin"), active: members.filter((m) => daysSince(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive) < 7).length, done,
      acc: withAcc.length ? withAcc.reduce((a, m) => a + (m.summary?.avgAccuracy ?? 0), 0) / withAcc.length : null };
  }, [members]);
  // The competencies at least one member has evidence for, in the catalogue's order, from the summaries already loaded:
  // no course files are downloaded for this (every published course is about 6 MB).
  const coverage = useMemo(() => {
    const has = (m: Profile, c: string) => (m.summary?.competencies?.[c] ?? 0) > 0;
    return COMPETENCIES.filter((c) => members.some((m) => has(m, c.code))).map((c) => ({ code: c.code, share: members.filter((m) => has(m, c.code)).length / members.length }));
  }, [members]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members.filter((m) => (!roleF || m.role === roleF) && (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => sort === "review" ? byWaiting(a, b) : sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0) : sort === "last" ? daysSince(a.summary?.lastActive) - daysSince(b.summary?.lastActive) : byName(a, b));
  }, [members, q, roleF, sort]);
  // Projects waiting for a review, from the counts on the profiles already loaded (no extra reads).
  const waiting = useMemo(() => waitingTotals(members), [members]);
  const classes = useMemo(() => [...new Set(members.map((m) => m.group).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b)), [members]);
  const staff = useMemo(() => members.filter((m) => m.role === "teacher" || m.role === "orgAdmin"), [members]);
  const allShown = rows.length > 0 && rows.every((m) => sel.has(m.uid));
  const pick = {
    selected: sel,
    toggle: (uid: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(uid); else n.delete(uid); return n; }),
  };
  const showAll = (on: boolean) => setSel((s) => { const n = new Set(s); rows.forEach((m) => (on ? n.add(m.uid) : n.delete(m.uid))); return n; });
  const bulk = async (kind: "class" | "teacher") => {
    const chosen = members.filter((m) => sel.has(m.uid));
    // Only students have a teacher; a class can be anyone's.
    const targets = kind === "teacher" ? chosen.filter((m) => m.role === "student") : chosen;
    if (!targets.length) return setBulkMsg({ ok: false, text: t("adm.bulkNoStudents") });
    setBulkBusy(kind); setBulkMsg(null);
    try {
      await updateMembers(targets.map((m) => m.uid), kind === "class" ? { group: cleanGroup(cls) } : { teacherId: tch || null });
      setBulkMsg({ ok: true, text: t("adm.bulkDone", { n: targets.length }) });
      setSel(new Set()); setCls("");
      membersQ.reload();
    } catch (e) { setBulkMsg({ ok: false, text: refusalText(e, t) }); } finally { setBulkBusy(""); }
  };
  const newCode = async (r: "teacher" | "student") => {
    if (!org) return;
    setCodeBusy(r); setCodeMsg(null);
    try { await api.regenerateInviteCode({ orgId: org.id, role: r }); invites.reload(); setCodeMsg({ ok: true, text: t("inv.newDone") }); }
    catch (e) { setCodeMsg({ ok: false, text: refusalText(e, t) }); }
    finally { setCodeBusy(""); setConfirmNew(null); }
  };

  const exportCsv = () => {
    const head = [t("col.name"), t("col.login"), t("col.role"), t("col.group"), t("col.lessons"), t("col.xp"), t("col.accuracy"), t("col.last")];
    // A cell starting with = + - @ (or a tab or return) would run as a formula in Excel: a leading ' keeps it text (L1).
    const esc = (v: unknown) => { const s = String(plainText(v) ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
    const lines = [head, ...rows.map((m) => [m.name, displayLogin(m.email ?? ""), m.role ? t(`rn.${m.role}` as "rn.student") : "", m.group ?? "", m.summary?.lessonsDone ?? 0, m.summary?.xp ?? 0, scoredOf(m.summary) ? Math.round(m.summary!.avgAccuracy * 100) + "%" : "", m.summary?.lastActive ?? ""])].map((r) => r.map(esc).join(","));
    downloadBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `darsi-${(org?.name ?? "org").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-people.csv`);
  };
  const copy = async (code: string) => { await navigator.clipboard?.writeText(code).catch(() => {}); setCopied(code); setTimeout(() => setCopied(""), 1500); };

  return (
    <>
      <AppBar title={org?.name ?? t("adm.title")} />
      <main className="screen wide stack-lg">
        {done && <p className="notice ok" role="status">{done}</p>}
        {error && <p className="notice err">{refusalText(error, t)}</p>}
        <section className="tiles" aria-busy={loading || undefined}>
          <div className="tile"><span>{t("adm.members")}</span><strong>{loading ? "…" : num(members.length)}</strong>{!loading && <small>{[`${t("or.aud.teachers")}: ${num(stats.teachers)}`, `${t("or.aud.students")}: ${num(stats.students)}`, `${t("adm.admins")}: ${num(stats.admins)}`].join(t("common.sep"))}</small>}</div>
          <div className="tile"><span>{t("adm.active7")}</span><strong>{loading ? "…" : num(stats.active)}</strong><small>{members.length ? num(stats.active / members.length, { style: "percent" }) : loading ? "" : "—"}</small></div>
          <div className="tile"><span>{t("adm.lessons")}</span><strong>{loading ? "…" : num(stats.done)}</strong></div>
          <div className="tile"><span>{t("adm.accuracy")}</span><strong>{loading ? "…" : stats.acc == null ? "—" : num(stats.acc, { style: "percent" })}</strong></div>
          <div className="tile"><span>{t("teach.toReview")}</span><strong>{loading ? "…" : num(waiting.projects)}</strong>{waiting.people > 0 && <small>{`${t("adm.people")}: ${num(waiting.people)}`}</small>}</div>
        </section>

        <section className="panel stack"><h3>{t("or.open")}</h3><p className="muted small">{t("or.openHint")}</p>
          <div><Button icon="chart" onClick={() => nav("/admin/analytics")}>{t("or.open")}</Button></div></section>

        <div className="admin-cols">
          <section className="panel"><h3>{t("adm.codes")}</h3>
            {/* Only admins can read the codes. A link opens sign-up with the code filled in. */}
            {org && invites.data ? (["teacher", "student"] as const).map((r) => {
              const code = invites.data?.[r];
              if (!code) return null;
              const link = `${location.origin}/signup?code=${code}`;
              return (
                <Fragment key={r}>
                  <div className="code-row">
                    <span>{r === "teacher" ? t("adm.teacherCode") : t("adm.studentCode")}</span>
                    <code dir="ltr">{code}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(code)}>{copied === code ? t("adm.copied") : t("adm.copy")}</Button>
                    <Button size="sm" variant="ghost" icon="link" onClick={() => copy(link)}>{copied === link ? t("adm.copied") : t("inv.copyLink")}</Button>
                    {/* A new code replaces this one at once: printed codes and shared links stop working, so ask first. */}
                    <Button size="sm" variant="ghost" icon="sync" loading={codeBusy === r} aria-expanded={confirmNew === r} onClick={() => { setCodeMsg(null); setConfirmNew(r); }}>{t("adm.newCode")}</Button>
                  </div>
                  {confirmNew === r && (
                    <div className="notice stack-sm" role="alert">
                      <p>{t(r === "teacher" ? "inv.newConfirmTeacher" : "inv.newConfirmStudent")}</p>
                      <div className="row-gap">
                        <Button size="sm" icon="sync" loading={codeBusy === r} onClick={() => { void newCode(r); }}>{t("inv.newYes")}</Button>
                        <Button size="sm" variant="ghost" disabled={codeBusy === r} onClick={() => setConfirmNew(null)}>{t("common.cancel")}</Button>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            }) : <p className="muted">{invites.error ? refusalText(invites.error, t) : "…"}</p>}
            <Note msg={codeMsg} />
            {invites.data && [invites.data.teacher, invites.data.student].some((c) => c && c.length < 14) && <p className="muted small">{t("inv.shortCode")}</p>}
            <p className="muted small">{t("inv.teacherWarn")}</p>
          </section>
          <section className="panel"><h3>{t("adm.coverage")}</h3><p className="muted small">{t("adm.coverageHint")}</p>
            {loading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : coverage.length === 0 && <p className="muted">{t("adm.noCoverage")}</p>}
            {coverage.map((c) => (
              <div key={c.code} className="cov-row"><span className="cap-code" dir="ltr">{c.code}</span><span className="cap-label">{L(competency(c.code)?.label)}</span>
                <span className="cov-bar" aria-hidden><i style={{ inlineSize: `${Math.round(c.share * 100)}%` }} /></span><span className="small">{num(c.share, { style: "percent" })}</span></div>
            ))}
          </section>
        </div>

        {org && membersQ.data && <SeatsPanel org={org} members={members} onChanged={membersQ.reload} />}
        {org && <OrgBranding org={org} onSaved={orgQ.reload} />}

        <section className="panel">
          <div className="table-tools">
            <h3>{t("adm.people")}</h3>
            {/* Here rather than in the app bar: on a phone the bar has no room left for the organization's name. */}
            <Button size="sm" icon="profile" onClick={() => nav("/admin/add")}>{t("adm.add")}</Button>
            <Button size="sm" variant="secondary" icon="install" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>
            <input type="search" placeholder={t("adm.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adm.search")} />
            <select value={roleF} onChange={(e) => setRoleF(e.target.value as Role)} aria-label={t("col.role")}>
              <option value="">{t("adm.allRoles")}</option>{(["teacher", "student", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
              <option value="review">{t("col.toReview")}</option><option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="last">{t("col.last")}</option>
            </select>
            {/* It exports the rows shown: with a search or a role picked, the button says how many. */}
            <Button size="sm" variant="ghost" icon="file" disabled={!rows.length} onClick={exportCsv}>{rows.length < members.length ? t("adm.exportShown", { n: rows.length }) : t("adm.exportCsv")}</Button>
            {/* The list is read when the page opens, not kept live (no listeners): this reads it again. */}
            <Button size="sm" variant="ghost" icon="sync" onClick={refresh}>{t("adm.refresh")}</Button>
          </div>
          {loading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : !membersQ.data ? null : members.length === 0 ? <EmptyState icon="profile" title={t("adm.noPeople")} body={t("adm.noPeopleBody")} action={<Button size="sm" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>} /> : <>
            {/* Several people's class or teacher at once (pupils who joined with the student code, a class's new teacher). */}
            <p className="muted small">{t("adm.bulkHint")}</p>
            <label className="pick-cell"><input type="checkbox" checked={allShown} onChange={(e) => showAll(e.target.checked)} />{t("adm.selectAll")}</label>
            {sel.size > 0 && (
              <div className="table-tools" role="group" aria-label={t("adm.selected", { n: sel.size })}>
                <strong>{t("adm.selected", { n: sel.size })}</strong>
                <input list="adm-classes" value={cls} maxLength={60} dir="auto" onChange={(e) => setCls(e.target.value)} placeholder={t("adm.classPlaceholder")} aria-label={t("col.group")} />
                <datalist id="adm-classes">{classes.map((g) => <option key={g} value={g} />)}</datalist>
                <Button size="sm" variant="secondary" disabled={!cleanGroup(cls)} loading={bulkBusy === "class"} onClick={() => { void bulk("class"); }}>{t("adm.setClass")}</Button>
                <select value={tch} onChange={(e) => setTch(e.target.value)} aria-label={t("col.teacher")}>
                  <option value="">{t("adm.noTeacher")}</option>{staff.map((s) => <option key={s.uid} value={s.uid}>{s.name || displayLogin(s.email ?? "")}</option>)}
                </select>
                <Button size="sm" variant="secondary" loading={bulkBusy === "teacher"} onClick={() => { void bulk("teacher"); }}>{t("adm.setTeacher")}</Button>
                <Button size="sm" variant="ghost" icon="close" onClick={() => setSel(new Set())}>{t("adm.clearSel")}</Button>
              </div>
            )}
            <Note msg={bulkMsg} />
            <PeopleTable rows={rows} to={(m) => `/admin/people/${m.uid}`} review pick={pick} />
          </>}
        </section>
      </main>
    </>
  );
}

/**
 * `review`: a column of each person's projects waiting for a review (review.ts), empty (hidden on phones) when none.
 * `pick`: a first column of checkboxes, for changing several people at once (the org dashboard).
 */
export function PeopleTable({ rows, to, review, pick }: { rows: Profile[]; to: (m: Profile) => string; review?: boolean;
  pick?: { selected: Set<string>; toggle: (uid: string, on: boolean) => void } }) {
  const { t, num } = useI18n();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{pick && <th>{t("adm.select")}</th>}<th>{t("col.name")}</th>{review && <th className="num">{t("col.toReview")}</th>}<th>{t("col.role")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th>{t("col.last")}</th></tr></thead>
        <tbody>{rows.map((m) => (
          <tr key={m.uid}>
            {pick && <td data-label={t("adm.select")}><label className="pick-cell"><input type="checkbox" checked={pick.selected.has(m.uid)} onChange={(e) => pick.toggle(m.uid, e.target.checked)} aria-label={t("adm.selectOne", { name: m.name || displayLogin(m.email ?? "") })} /></label></td>}
            <td data-label={t("col.name")}><Link to={to(m)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name || "?").slice(0, 1)}</span><span><strong>{m.name || "—"}</strong><small dir="ltr">{displayLogin(m.email ?? "")}</small></span></Link>{m.mustChangePassword && <span className="pill-warn" role="img" aria-label={t("adm.firstSignIn")} title={t("adm.firstSignIn")}><Icon name="lock" size={14} /></span>}</td>
            {review && <td data-label={t("col.toReview")} className="num">{waitingOf(m) > 0 ? <span className="status status-submitted">{num(waitingOf(m))}</span> : null}</td>}
            <td data-label={t("col.role")}>{m.role ? t(`rn.${m.role}` as "rn.student") : "—"}</td>
            <td data-label={t("col.group")}>{m.group ?? "—"}</td>
            <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
            <td data-label={t("col.accuracy")} className="num">{scoredOf(m.summary) ? num(m.summary!.avgAccuracy, { style: "percent" }) : "—"}</td>
            <td data-label={t("col.last")}>{lastActiveText(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive, t)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
