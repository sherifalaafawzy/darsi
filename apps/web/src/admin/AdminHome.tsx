import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, type BulkResult } from "../auth/api";
import { scoredOf, type Org, type Profile, type Role } from "../auth/types";
import { useI18n } from "../i18n";
import { COMPETENCIES, competency } from "../content/competencies";
import { errorText, reasonText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote, LoadState } from "../staff/LoadState";
import { byName, cleanGroup, daysSince, useInvites, useMembers, useOrg, type MembersQ } from "./data";
import { byWaiting, waitingTotals } from "./review";
import { downloadBlob, plainText } from "./importer";
import type { ResultRow } from "./AddPeople";
import { OrgActivity } from "./OrgActivity";
import { OrgBranding } from "./OrgBranding";
import { OrgPolicy, type RenewedCode } from "./OrgPolicy";
import { OrgSitePanel } from "./Domains";
import { PeopleTable } from "./PeopleTable";
import { Note, SeatsPanel, type Msg } from "./Super";
import { readOrgCourses } from "../content/orgCourses";
import { TabPanel, Tabs, useTab, type TabDef } from "./Tabs";
import { lazyRetry } from "../app/AppBoundary";
import { k } from "./peopleStrings";
import "./strings";
import "../styles/admin.css";

// The table moved to its own file (the teacher's list uses it without the dashboard); other screens import it from here.
export { PeopleTable } from "./PeopleTable";

/**
 * School sign-in's wizard and status card (admin/SsoSetup.tsx): its own chunk with the providers' console steps, loaded
 * when the Sign-in tab first opens. A chunk that fails shows the page's boundary with Retry, as a route's does.
 */
const SsoSetup = lazyRetry(() => import("./SsoSetup").then((m) => ({ default: m.SsoSetup })));

/** No members read yet: one array, so the panels' sums aren't worked out again on every render while it loads. */
const NOBODY: Profile[] = [];
/** updateMembers and bulkMembers take at most this many people a call (functions/src/orgMembersCore.ts): more go in turns. */
export const BULK_MAX = 200;
/** Above about this many, a cohort is imported: sign-ups with a code from one network are limited each hour (joinOrg). */
const INVITE_COHORT = 100;
/** The teacher picker's "No teacher": a choice of its own, never what the picker says before anything is chosen. */
const NO_TEACHER = "-";
const nameOf = (m?: Profile) => m?.name || displayLogin(m?.email ?? "") || "—";
/**
 * The results table and login slips of Add people (its chunk, with the spreadsheet code), fetched the first time
 * passwords are reset here and before the reset is sent: the dashboard doesn't download it for nothing, and new
 * passwords, shown once, never wait on a download that could fail.
 */
let Slips: typeof import("./AddPeople").Results | null = null;

/**
 * The members read, said the same way wherever the dashboard shows them: while pages still arrive, how far it is;
 * a read that failed with nothing to show, the reason and Retry (staff/LoadState), never "0" or "No people yet";
 * then the children, with the whole list only.
 */
function MembersState({ q, empty, children }: { q: MembersQ; empty?: ReactNode; children: (members: Profile[]) => ReactNode }) {
  const { t } = useI18n();
  if (!q.data && q.loading) return <p className="muted" role="status" aria-busy="true">{q.loaded ? t(k("pp.loadedSoFar"), { n: q.loaded }) : t("adm.loading")}</p>;
  return <LoadState q={q} empty={empty}>{children}</LoadState>;
}

/**
 * Organization dashboard, in tabs (admin/Tabs.tsx; the open one is `?tab=` in the address): Overview (numbers, the
 * report and courses links, capability coverage), People, Invite, Super seats (only with a licence), Look,
 * "Sign-in & web address" and Activity. The page reads the organization once, and its members through useMembers: in
 * pages, shared with the other staff screens, and changed in place after this page's own actions (TECHNICAL.md
 * "Members"). Invite, Sign-in and Activity read their own data when first opened.
 */
export function AdminHome() {
  const { t } = useI18n();
  const { orgId } = useAuth();
  const orgQ = useOrg(orgId);
  const { data: org } = orgQ;
  const membersQ = useMembers(orgId);
  // What the page that sent us here did (a person removed or deleted on their own page), said where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  // The Invite panel leaves its reload here while it is on the page: Refresh reads the codes and the join rules (with
  // the people who were removed) again only if they were read. "rules": only the rules, after people were removed on
  // the People tab (the codes didn't change), so the panel's "People who were removed" has them without a Refresh.
  const invitesReload = useRef<((what?: "rules") => void) | null>(null);
  // A list an earlier screen read can miss people made since (Add people, an import, a join by code). The organization,
  // read now, counts its members: when the two differ, the list is read once more. Once per read of the organization,
  // and never for a list read after this page opened (so a count that is itself off can't make it read for ever).
  const opened = useRef(Date.now()), compared = useRef<Org | null>(null);
  const { data: all, at, refreshing, reload: reloadMembers } = membersQ;
  useEffect(() => {
    if (!org || !all || refreshing || compared.current === org) return;
    compared.current = org;
    if (typeof org.memberCount === "number" && at < opened.current && org.memberCount !== all.length) reloadMembers();
  }, [org, all, at, refreshing, reloadMembers]);
  const TABS: TabDef[] = [
    { id: "overview", label: t("tabs.overview") },
    { id: "people", label: t("tabs.people") },
    { id: "invite", label: t("tabs.invite") },
    // SeatsPanel has nothing to show an organization that never had a licence.
    { id: "seats", label: t("tabs.seats"), hidden: !org?.licence },
    { id: "look", label: t("tabs.look") },
    { id: "signin", label: t("tabs.signin") },
    { id: "activity", label: t(k("pp.tabActivity")) },
  ];
  const st = useTab(TABS);
  const refresh = () => { orgQ.reload(); membersQ.reload(); invitesReload.current?.(); };
  // Only while the organization's first read is out: one that failed is said above the tabs, and a panel that can't be
  // shown then stays empty rather than "Loading…" for ever.
  const wait = orgQ.loading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : null;

  return (
    <>
      <AppBar title={org?.name ?? t("adm.title")} />
      <main className="screen wide stack-lg">
        {done && <p className="notice ok" role="status">{done}</p>}
        {/* The organization's own read can fail too (Look, Super seats and the page's name wait for it). The members'
            failure is said where they are shown, with its own Retry. */}
        {orgQ.error !== undefined && <ErrorNote error={orgQ.error} reload={orgQ.reload} stale={!!org} />}
        {/* Nothing is read live (no listeners): Refresh reads the organization and its people again, whatever the tab.
            At the end of the tab row (on a phone, its icon alone), not on a line of its own above it. */}
        <Tabs label={t("tabs.sections")} tabs={TABS}
          action={<Button size="sm" variant="ghost" icon="sync" title={t("adm.refresh")} loading={!!membersQ.refreshing} onClick={refresh}>{t("adm.refresh")}</Button>}>
          <TabPanel id="overview"><Overview org={org} q={membersQ} reviewSearch={st.search("people")} onReview={() => st.show("people")} /></TabPanel>
          <TabPanel id="people"><PeoplePanel org={org} orgId={orgId} q={membersQ} onRemoved={() => invitesReload.current?.("rules")} /></TabPanel>
          <TabPanel id="invite"><InvitePanel orgId={orgId} reloadRef={invitesReload} /></TabPanel>
          {/* A seat given or taken is read again by the panel's own ask (it keeps what is shown meanwhile). */}
          <TabPanel id="seats">{org ? <MembersState q={membersQ}>{(members) => <SeatsPanel org={org} members={members} onChanged={membersQ.reload} />}</MembersState> : wait}</TabPanel>
          <TabPanel id="look">{org ? <OrgBranding org={org} onSaved={orgQ.reload} /> : wait}</TabPanel>
          <TabPanel id="signin">
            {/* The school's own sign-in (its OpenID Connect provider): the wizard until it is on, then its status. The
                provider sends the admin's test back to this tab (?tab=signin#sso=…), which SsoSetup finishes. */}
            {orgId && <Suspense fallback={<p className="muted" aria-busy="true">{t("adm.loading")}</p>}><SsoSetup orgId={orgId} /></Suspense>}
            {/* Its own web address: asked for here, approved and connected by a platform admin (TECHNICAL.md "Organization sites"). */}
            {orgId && <OrgSitePanel orgId={orgId} />}
          </TabPanel>
          {/* Who did what in the organization (its own audit log), read when the tab is first opened. */}
          <TabPanel id="activity">{orgId && <OrgActivity orgId={orgId} />}</TabPanel>
        </Tabs>
      </main>
    </>
  );
}

/**
 * Overview: the numbers, the ways to the report and the courses, and capability coverage. The numbers and the coverage
 * are worked out from the whole member list only: while its pages still arrive, the tiles say how far it is.
 */
function Overview({ org, q, reviewSearch, onReview }: { org?: Org | null; q: MembersQ; /** The People tab's query string (the tile's real address). */ reviewSearch: string;
  /** Opens People, which lists who has projects waiting first. */ onReview: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  return (
    <>
      <MembersState q={q}>{(members) => <Tiles members={members} reviewSearch={reviewSearch} onReview={onReview} />}</MembersState>

      <section className="panel stack"><h3>{t("or.open")}</h3><p className="muted small">{t("or.openHint")}</p>
        <div><Button icon="chart" onClick={() => nav("/admin/analytics")}>{t("or.open")}</Button></div></section>
      {/* Which courses its teachers, students and classes see (admin/OrgCourses.tsx), with what holds now. */}
      <section className="panel stack"><h3>{t("oc.title")}</h3><p className="muted small">{t("oc.openHint")}</p>
        {org && <p className="small">{t(readOrgCourses(org.courses).mode === "chosen" ? "oc.nowChosen" : "oc.nowAll")}</p>}
        <div><Button icon="book" variant="secondary" onClick={() => nav("/admin/courses")}>{t("oc.open")}</Button></div></section>

      {/* Its loading and its failure are said once, above. */}
      {q.data && <Coverage members={q.data} />}
    </>
  );
}

function Tiles({ members, reviewSearch, onReview }: { members: Profile[]; reviewSearch: string; onReview: () => void }) {
  const { t, num } = useI18n();
  const stats = useMemo(() => {
    const by = (r: Role) => members.filter((m) => m.role === r).length;
    const done = members.reduce((a, m) => a + (m.summary?.lessonsDone ?? 0), 0);
    const withAcc = members.filter((m) => scoredOf(m.summary)); // people with a graded lesson (a project lesson is no score)
    return { teachers: by("teacher"), students: by("student"), admins: by("orgAdmin"), active: members.filter((m) => daysSince(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive) < 7).length, done,
      acc: withAcc.length ? withAcc.reduce((a, m) => a + (m.summary?.avgAccuracy ?? 0), 0) / withAcc.length : null };
  }, [members]);
  // Projects waiting for a review, from the counts on the rows already read (no extra reads).
  const waiting = useMemo(() => waitingTotals(members), [members]);
  // With projects waiting, the tile is a real link to People (sorted by who is waiting): the keyboard reaches it, Enter
  // opens it, and a new browser tab opens the same view. A plain click opens the tab in place (hash and state kept).
  const toPeople = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onReview();
  };
  const review = <><span>{t("teach.toReview")}</span><strong>{num(waiting.projects)}</strong>{waiting.people > 0 && <small>{`${t("adm.people")}: ${num(waiting.people)}`}</small>}</>;
  return (
    <section className="tiles">
      <div className="tile"><span>{t("adm.members")}</span><strong>{num(members.length)}</strong>
        {/* One item per role: a role's name never parts from its number, and no separator is needed in any language. */}
        <ul className="tile-parts">{([["or.aud.teachers", stats.teachers], ["or.aud.students", stats.students], ["adm.admins", stats.admins]] as const).map(([key, n]) => <li key={key}>{`${t(key)}: ${num(n)}`}</li>)}</ul></div>
      <div className="tile"><span>{t("adm.active7")}</span><strong>{num(stats.active)}</strong><small>{members.length ? num(stats.active / members.length, { style: "percent" }) : "—"}</small></div>
      <div className="tile"><span>{t("adm.lessons")}</span><strong>{num(stats.done)}</strong></div>
      <div className="tile"><span>{t("adm.accuracy")}</span><strong>{stats.acc == null ? "—" : num(stats.acc, { style: "percent" })}</strong></div>
      {waiting.projects > 0 ? <Link className="tile tile-link" to={{ search: reviewSearch }} onClick={toPeople}>{review}</Link> : <div className="tile">{review}</div>}
    </section>
  );
}

/**
 * The competencies at least one member has evidence for, in the catalogue's order, from the rows already read (a list
 * row says which competencies a person has evidence for, not how much): no course files are downloaded for this.
 */
function Coverage({ members }: { members: Profile[] }) {
  const { t, num, L } = useI18n();
  const coverage = useMemo(() => {
    const has = (m: Profile, c: string) => (m.summary?.competencies?.[c] ?? 0) > 0;
    return COMPETENCIES.filter((c) => members.some((m) => has(m, c.code))).map((c) => ({ code: c.code, share: members.filter((m) => has(m, c.code)).length / members.length }));
  }, [members]);
  return (
    <section className="panel"><h3>{t("adm.coverage")}</h3><p className="muted small">{t("adm.coverageHint")}</p>
      {coverage.length === 0 && <p className="muted">{t("adm.noCoverage")}</p>}
      {coverage.map((c) => (
        <div key={c.code} className="cov-row"><span className="cap-code" dir="ltr">{c.code}</span><span className="cap-label">{L(competency(c.code)?.label)}</span>
          <span className="cov-bar" aria-hidden><i style={{ inlineSize: `${Math.round(c.share * 100)}%` }} /></span><span className="small">{num(c.share, { style: "percent" })}</span></div>
      ))}
    </section>
  );
}

/** Add people one by one, or from a spreadsheet: on People and on Invite. */
function AddButtons() {
  const { t } = useI18n();
  const nav = useNavigate();
  return (
    <>
      <Button size="sm" icon="profile" onClick={() => nav("/admin/add")}>{t("adm.add")}</Button>
      <Button size="sm" variant="secondary" icon="install" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>
    </>
  );
}

type BulkKind = "class" | "teacher" | "remove" | "suspend" | "restore" | "resetPassword";
/** The actions that go through bulkMembers, each asked about first. */
const ASKS = {
  remove: { title: "pp.removeAsk", body: "pp.removeBody", yes: "p.removeYes", danger: true },
  suspend: { title: "pp.suspendAsk", body: "pp.suspendBody", yes: "pp.suspend", danger: true },
  restore: { title: "pp.restoreAsk", body: "pp.restoreBody", yes: "pp.restore", danger: false },
  resetPassword: { title: "pp.resetAsk", body: "pp.resetBody", yes: "pp.resetYes", danger: true },
} as const;

/**
 * People: the table with its search, role, sort and export, and what can be done to several people at once (class,
 * teacher, suspend, restore, new passwords, removal). What is typed and ticked here is this panel's own, so it is
 * still there after a look at another tab (the panel is kept). While the list's pages still arrive, the rows so far
 * can be looked at and searched; the export and every action wait for the whole list. After an action the rows are
 * changed in place (q.patch, q.remove): nothing is read again.
 */
function PeoplePanel({ org, orgId, q, onRemoved }: { org?: Org | null; orgId: string | null; q: MembersQ; /** People were removed from the organization here. */ onRemoved?: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const members = q.data;
  const soFar = q.data ?? q.partial ?? NOBODY;
  const [search, setSearch] = useState(""); const [roleF, setRoleF] = useState<Role | "">(""); const [sort, setSort] = useState<"review" | "name" | "lessons" | "last">("review");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cls, setCls] = useState(""); const [tch, setTch] = useState("");
  const [ask, setAsk] = useState<"noTeacher" | keyof typeof ASKS | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<BulkKind | "">("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkMsg, setBulkMsg] = useState<Msg>(null);
  // Who an action didn't work for, each with the server's reason in the admin's language.
  const [refused, setRefused] = useState<Array<{ uid: string; name: string; why: string }>>([]);
  // New passwords, shown once: until the admin says they are saved, they replace the table. Leaving the page before
  // they were downloaded or printed is asked about by the results themselves (AddPeople's Results holds links and
  // Back until then); a second guard here asked the same question twice. Another tab of the page loses nothing: this
  // panel is kept while hidden.
  const [slips, setSlips] = useState<ResultRow[] | null>(null);
  // A second tap while a call is out sends nothing (state alone is a render late).
  const sending = useRef(false);
  // Nobody ticked any more: a question about "the people selected" has nobody to ask about, and must not come back by
  // itself when someone is ticked later.
  const none = sel.size === 0;
  useEffect(() => { if (none) setAsk(null); }, [none]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return soFar.filter((m) => (!roleF || m.role === roleF) && (!s || [m.name, m.email, m.group].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => sort === "review" ? byWaiting(a, b) : sort === "lessons" ? (b.summary?.lessonsDone ?? 0) - (a.summary?.lessonsDone ?? 0) : sort === "last" ? daysSince(a.summary?.lastActive) - daysSince(b.summary?.lastActive) : byName(a, b));
  }, [soFar, search, roleF, sort]);
  const classes = useMemo(() => [...new Set((members ?? NOBODY).map((m) => m.group).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b)), [members]);
  const staff = useMemo(() => (members ?? NOBODY).filter((m) => m.role === "teacher" || m.role === "orgAdmin"), [members]);
  const chosen = useMemo(() => (members ?? NOBODY).filter((m) => sel.has(m.uid)), [members, sel]);
  // Only students have a teacher; a class can be anyone's.
  const students = useMemo(() => chosen.filter((m) => m.role === "student"), [chosen]);
  const allShown = rows.length > 0 && rows.every((m) => sel.has(m.uid));
  const pick = {
    selected: sel,
    toggle: (uid: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(uid); else n.delete(uid); return n; }),
  };
  const showAll = (on: boolean) => setSel((s) => { const n = new Set(s); rows.forEach((m) => (on ? n.add(m.uid) : n.delete(m.uid))); return n; });

  /** `send` for at most BULK_MAX people a call, one call after another, saying how far it is when there are several. */
  const inTurns = async (uids: string[], send: (part: string[]) => Promise<void>) => {
    for (let i = 0; i < uids.length; i += BULK_MAX) {
      if (uids.length > BULK_MAX) setProgress({ done: i, total: uids.length });
      await send(uids.slice(i, i + BULK_MAX));
    }
  };
  const begin = (kind: BulkKind) => {
    if (sending.current || !orgId) return false;
    sending.current = true;
    setBusy(kind); setBulkMsg(null); setRefused([]);
    return true;
  };
  const end = () => { sending.current = false; setBusy(""); setProgress(null); setAsk(null); };

  /** A class or a teacher for the people ticked, through updateMembers (checked and audited on the server). */
  const edit = async (kind: "class" | "teacher") => {
    const targets = kind === "teacher" ? students : chosen;
    if (!targets.length) { setAsk(null); return setBulkMsg({ ok: false, text: t("adm.bulkNoStudents") }); }
    if (!begin(kind)) return;
    const patch = kind === "class" ? { group: cleanGroup(cls) } : { teacherId: tch === NO_TEACHER ? null : tch };
    let sent = 0, updated = 0;
    try {
      await inTurns(targets.map((m) => m.uid), async (part) => {
        updated += (await api.updateMembers({ orgId: orgId!, uids: part, patch })).updated;
        sent += part.length;
        q.patch?.(part, patch);
      });
      setBulkMsg({ ok: true, text: t("adm.bulkDone", { n: updated }) });
      setSel(new Set()); setCls(""); setTch("");
    } catch (e) {
      setBulkMsg({ ok: false, text: `${sent ? `${t(k("pp.stopped"), { done: sent, total: targets.length })} ` : ""}${errorText(e, t)}` });
    } finally { end(); }
  };

  /** Remove, suspend, restore or new passwords for the people ticked: each person's own outcome comes back (bulkMembers). */
  const act = async (action: keyof typeof ASKS) => {
    const targets = chosen;
    if (!targets.length || !begin(action)) return;
    const results: BulkResult[] = [];
    let failed: unknown, stopped = false;
    try {
      if (action === "resetPassword") Slips ??= (await import("./AddPeople")).Results;
      await inTurns(targets.map((m) => m.uid), async (part) => {
        const r = await api.bulkMembers({ orgId: orgId!, uids: part, action, ...(action === "suspend" && reason.trim() ? { reason: reason.trim() } : {}) });
        results.push(...r.results);
        const ok = r.results.filter((x) => x.ok).map((x) => x.uid);
        if (!ok.length) return;
        if (action === "remove") q.remove?.(ok);
        else q.patch?.(ok, action === "resetPassword" ? { mustChangePassword: true } : { suspended: action === "suspend" });
      });
    } catch (e) { failed = e; stopped = true; }
    const who = new Map(targets.map((m) => [m.uid, m]));
    const bad = results.filter((r) => !r.ok);
    const okN = results.length - bad.length;
    // Elsewhere "own-login" is about a password: for a suspension it is why the login can't be locked, and what to do instead.
    const whyNot = (r: BulkResult) => (action === "suspend" && r.reason === "own-login" ? t(k("pp.suspendOwnLogin")) : reasonText(r.reason, t));
    setRefused(bad.map((r) => ({ uid: r.uid, name: nameOf(who.get(r.uid)), why: whyNot(r) })));
    const said = `${t(k(`pp.done.${action}`), { n: okN })}${bad.length ? ` ${t(k("pp.refusedN"), { n: bad.length })}` : ""}`;
    setBulkMsg(!stopped ? { ok: bad.length === 0, text: said }
      : { ok: false, text: `${results.length ? `${said} ` : ""}${t(k("pp.stopped"), { done: results.length, total: targets.length })} ${errorText(failed, t)}` });
    // Still ticked: the people it didn't work for and the ones never sent, to try again.
    const done = new Set(results.filter((r) => r.ok).map((r) => r.uid));
    // The server put them on the organization's list of removed people: the Invite tab, if it was opened, reads it again.
    if (action === "remove" && done.size) onRemoved?.();
    setSel(new Set(targets.filter((m) => !done.has(m.uid)).map((m) => m.uid)));
    if (action === "resetPassword" && okN) {
      setSlips(results.map((r, i): ResultRow => {
        const m = who.get(r.uid);
        return { row: i + 1, name: nameOf(m), login: r.login ?? m?.email ?? "", password: r.password, uid: r.uid, status: r.ok ? "created" : "error", ...(r.ok ? {} : { error: whyNot(r) }), role: m?.role, group: m?.group ?? undefined };
      }));
    }
    setReason("");
    end();
  };

  const setTeacher = () => {
    if (tch !== NO_TEACHER) return void edit("teacher");
    // "No teacher" takes a teacher away: asked first, with how many students it is for.
    if (!students.length) return setBulkMsg({ ok: false, text: t("adm.bulkNoStudents") });
    setBulkMsg(null); setAsk("noTeacher");
  };
  const exportCsv = () => {
    const head = [t("col.name"), t("col.login"), t("col.role"), t("col.group"), t("col.lessons"), t("col.xp"), t("col.accuracy"), t("col.last")];
    // A cell starting with = + - @ (or a tab or return) would run as a formula in Excel: a leading ' keeps it text (L1).
    const esc = (v: unknown) => { const s = String(plainText(v) ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
    const lines = [head, ...rows.map((m) => [m.name, displayLogin(m.email ?? ""), m.role ? t(`rn.${m.role}` as "rn.student") : "", m.group ?? "", m.summary?.lessonsDone ?? 0, m.summary?.xp ?? 0, scoredOf(m.summary) ? Math.round(m.summary!.avgAccuracy * 100) + "%" : "", m.summary?.lastActive ?? ""])].map((r) => r.map(esc).join(","));
    // The byte-order mark first: Excel reads the file as UTF-8 (Arabic names) only with it.
    downloadBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `darsi-${(org?.name ?? "org").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-people.csv`);
  };

  const asked = ask && ask !== "noTeacher" ? ASKS[ask] : null;
  const table = <PeopleTable rows={rows} to={(m) => `/admin/people/${m.uid}`} review pick={members ? pick : undefined} paged resetOn={`${search}\n${roleF}\n${sort}`} />;
  const outcome = (
    <>
      <Note msg={bulkMsg} />
      {refused.length > 0 && <ul className="small" aria-label={t(k("pp.refusedTitle"))}>{refused.map((r) => <li key={r.uid}><bdi>{r.name}</bdi>{": "}{r.why}</li>)}</ul>}
    </>
  );

  // New passwords: only they are on the panel until the admin has them (printing prints the slips, as after an import).
  if (slips) {
    return (
      <div className="stack-lg">
        {/* The heading and "shown only once" are the results' own, said as a reset. Here: what the action did, who it
            didn't work for, and how to pass the passwords on. */}
        <div className="stack no-print">{outcome}<p className="muted small">{t(k("pp.slipsHint"))}</p></div>
        {/* Passwords of accounts people already have: said as resets ("New passwords", "Password reset"), never "created". */}
        {Slips && <Slips results={slips} reset />}
        <div className="row-gap no-print"><Button size="sm" variant="secondary" icon="check" onClick={() => setSlips(null)}>{t(k("pp.slipsDone"))}</Button></div>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="table-tools">
        <h3>{t("adm.people")}</h3>
        {/* Here rather than in the app bar: on a phone the bar has no room left for the organization's name. */}
        <AddButtons />
        <input type="search" placeholder={t("adm.search")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("adm.search")} />
        <select value={roleF} onChange={(e) => setRoleF(e.target.value as Role)} aria-label={t("col.role")}>
          <option value="">{t("adm.allRoles")}</option>{(["teacher", "student", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("adm.sort")}>
          <option value="review">{t("col.toReview")}</option><option value="name">{t("col.name")}</option><option value="lessons">{t("col.lessons")}</option><option value="last">{t("col.last")}</option>
        </select>
        {/* It exports the rows shown: with a search or a role picked, the button says how many. Never part of a list still arriving. */}
        <Button size="sm" variant="ghost" icon="file" disabled={!members || !rows.length} onClick={exportCsv}>{members && rows.length < members.length ? t("adm.exportShown", { n: rows.length }) : t("adm.exportCsv")}</Button>
        {/* Refresh is at the end of the tab row: it reads the list again whichever tab is open. */}
      </div>
      <MembersState q={q} empty={<EmptyState icon="profile" title={t("adm.noPeople")} body={t("adm.noPeopleBody")} action={<Button size="sm" onClick={() => nav("/admin/import")}>{t("adm.import")}</Button>} />}>{() => <>
        {/* Several people at once (pupils who joined with the student code, a class's new teacher, a year that left). */}
        <p className="muted small">{t("adm.bulkHint")}</p>
        <label className="pick-cell"><input type="checkbox" checked={allShown} onChange={(e) => showAll(e.target.checked)} />{t("adm.selectAll")}</label>
        {sel.size > 0 && (
          <div className="table-tools" role="group" aria-label={t("adm.selected", { n: sel.size })}>
            <strong>{t("adm.selected", { n: sel.size })}</strong>
            <input list="adm-classes" value={cls} maxLength={60} dir="auto" onChange={(e) => setCls(e.target.value)} placeholder={t("adm.classPlaceholder")} aria-label={t("col.group")} />
            <datalist id="adm-classes">{classes.map((g) => <option key={g} value={g} />)}</datalist>
            <Button size="sm" variant="secondary" disabled={!cleanGroup(cls) || !!busy} loading={busy === "class"} onClick={() => { void edit("class"); }}>{t("adm.setClass")}</Button>
            {/* Nothing is chosen until the admin chooses: "No teacher" is a choice of its own, asked about before it is saved. */}
            <select value={tch} onChange={(e) => { setTch(e.target.value); if (ask === "noTeacher") setAsk(null); }} aria-label={t("col.teacher")}>
              <option value="">{t(k("pp.chooseTeacher"))}</option><option value={NO_TEACHER}>{t("adm.noTeacher")}</option>
              {staff.map((s) => <option key={s.uid} value={s.uid}>{s.name || displayLogin(s.email ?? "")}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={!tch || !!busy} loading={busy === "teacher"} aria-expanded={tch === NO_TEACHER ? ask === "noTeacher" : undefined} onClick={setTeacher}>{t("adm.setTeacher")}</Button>
            <Button size="sm" variant="ghost" icon="close" disabled={!!busy} onClick={() => setSel(new Set())}>{t("adm.clearSel")}</Button>
          </div>
        )}
        {sel.size > 0 && (
          <div className="table-tools" role="group" aria-label={t(k("pp.bulkMore"))}>
            <Button size="sm" variant="secondary" icon="lock" disabled={!!busy} loading={busy === "suspend"} aria-expanded={ask === "suspend"} onClick={() => { setBulkMsg(null); setAsk("suspend"); }}>{t(k("pp.suspend"))}</Button>
            <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "restore"} aria-expanded={ask === "restore"} onClick={() => { setBulkMsg(null); setAsk("restore"); }}>{t(k("pp.restore"))}</Button>
            <Button size="sm" variant="secondary" icon="sync" disabled={!!busy} loading={busy === "resetPassword"} aria-expanded={ask === "resetPassword"} onClick={() => { setBulkMsg(null); setAsk("resetPassword"); }}>{t(k("pp.reset"))}</Button>
            <Button size="sm" variant="ghost" icon="close" disabled={!!busy} loading={busy === "remove"} aria-expanded={ask === "remove"} onClick={() => { setBulkMsg(null); setAsk("remove"); }}>{t(k("pp.remove"))}</Button>
          </div>
        )}
        {ask === "noTeacher" && <InlineConfirm danger title={t(k("pp.noTeacherAsk"), { n: students.length })} body={t(k("pp.noTeacherBody"))} confirmLabel={t(k("pp.noTeacherYes"))} busy={busy === "teacher"}
          onConfirm={() => { void edit("teacher"); }} onCancel={() => setAsk(null)} />}
        {/* Keyed by the action: asking about another one is another question (its focus and its reason start again). */}
        {asked && ask && sel.size > 0 && (
          <InlineConfirm key={ask} danger={asked.danger} title={t(k(asked.title), { n: sel.size })} body={t(k(asked.body))} confirmLabel={asked.yes === "p.removeYes" ? t(asked.yes) : t(k(asked.yes))} busy={busy === ask}
            onConfirm={() => { void act(ask as keyof typeof ASKS); }} onCancel={() => setAsk(null)}>
            {/* Why, kept in the record: asked where the suspension is confirmed. */}
            {ask === "suspend" && <TextField id="adm-suspend-reason" label={t("acc.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />}
          </InlineConfirm>
        )}
        {progress && <p className="notice" role="status">{t(k("pp.progress"), { done: progress.done, total: progress.total })}</p>}
        {outcome}
        {table}
      </>}</MembersState>
      {/* Pages still arriving: the rows so far, to look at and search. Nothing can be ticked or counted yet. */}
      {!members && q.loading && soFar.length > 0 && table}
    </section>
  );
}

/**
 * Invite: the codes people join with, who may use them (OrgPolicy), and the two ways to make accounts instead. The
 * codes are read here, so only when this tab is first opened (orgs/{orgId}/private/invites: one read that most visits
 * to the dashboard don't need).
 */
function InvitePanel({ orgId, reloadRef }: { orgId: string | null; /** Where the page's Refresh finds this panel's reload while it is mounted ("rules": not the codes). */ reloadRef: RefObject<((what?: "rules") => void) | null> }) {
  const { t } = useI18n();
  const invites = useInvites(orgId);
  const [copied, setCopied] = useState("");
  // What couldn't be put on the clipboard (no permission, an old browser): shown and selected, to copy by hand.
  const [manual, setManual] = useState("");
  const manualEl = useRef<HTMLElement>(null);
  const [confirmNew, setConfirmNew] = useState<"teacher" | "student" | null>(null);
  const [codeBusy, setCodeBusy] = useState("");
  const [codeMsg, setCodeMsg] = useState<Msg>(null);
  // The code just made new, for the rules below: the server starts it with no expiry, no limit and no uses, and the
  // rules' form (its own one-off read) would go on showing the old code's as if they still applied.
  const [renewed, setRenewed] = useState<RenewedCode | null>(null);
  const { reload } = invites;
  // The join rules below are their own one-off read (OrgPolicy): this count going up has them read again. What is
  // typed there and not saved stays.
  const [policyRev, setPolicyRev] = useState(0);
  useEffect(() => {
    reloadRef.current = (what) => { if (what !== "rules") reload(); setPolicyRev((x) => x + 1); };
    return () => { reloadRef.current = null; };
  }, [reload, reloadRef]);
  useEffect(() => {
    const el = manualEl.current, pick = typeof getSelection === "function" ? getSelection() : null;
    if (!manual || !el || !pick) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    pick.removeAllRanges(); pick.addRange(range);
  }, [manual]);
  const newCode = async (r: "teacher" | "student") => {
    if (!orgId || codeBusy) return;
    setCodeBusy(r); setCodeMsg(null);
    try { await api.regenerateInviteCode({ orgId, role: r }); reload(); setRenewed((p) => ({ role: r, n: (p?.n ?? 0) + 1 })); setCodeMsg({ ok: true, text: t("inv.newDone") }); }
    catch (e) { setCodeMsg({ ok: false, text: errorText(e, t) }); }
    finally { setCodeBusy(""); setConfirmNew(null); }
  };
  // "Copied" only once the clipboard has it: a write that is refused (or a browser without one) said so all the same.
  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setManual(""); setCopied(text); setTimeout(() => setCopied(""), 1500);
    } catch { setCopied(""); setManual(text); }
  };

  return (
    <>
      <section className="panel"><h3>{t("adm.codes")}</h3>
        {/* Only admins can read the codes. A link opens sign-up with the code filled in. A read that failed says why, with Retry. */}
        <LoadState q={invites}>{(codes) => (["teacher", "student"] as const).map((r) => {
          const code = codes[r];
          if (!code) return null;
          const link = `${location.origin}/signup?code=${code}`;
          return (
            <Fragment key={r}>
              <div className="code-row">
                <span>{r === "teacher" ? t("adm.teacherCode") : t("adm.studentCode")}</span>
                <code dir="ltr">{code}</code>
                <Button size="sm" variant="ghost" onClick={() => { void copy(code); }}>{copied === code ? t("adm.copied") : t("adm.copy")}</Button>
                <Button size="sm" variant="ghost" icon="link" onClick={() => { void copy(link); }}>{copied === link ? t("adm.copied") : t("inv.copyLink")}</Button>
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
        })}</LoadState>
        {manual && <p className="notice stack-sm" role="status"><span>{t(k("pp.copyManual"))}</span><code ref={manualEl} dir="ltr">{manual}</code></p>}
        <Note msg={codeMsg} />
        {invites.data && [invites.data.teacher, invites.data.student].some((c) => c && c.length < 14) && <p className="muted small">{t("inv.shortCode")}</p>}
        <p className="muted small">{t("inv.teacherWarn")}</p>
        {/* A year group joining by code from the school's network would meet the hourly limit: say so before it does. */}
        <p className="muted small">{t(k("pp.inviteLimit"), { n: INVITE_COHORT })}</p>
      </section>
      {/* Who may join with the codes (verified email, the organization's own domains) and each code's limits. */}
      {orgId && <OrgPolicy orgId={orgId} renewed={renewed} refresh={policyRev} />}
      {/* The other way in: accounts the organization makes itself (the same two buttons as on People). */}
      <div className="row-gap"><AddButtons /></div>
    </>
  );
}
