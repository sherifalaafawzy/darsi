import { Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { api, displayLogin } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import type { Org, Profile, Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote } from "../staff/LoadState";
import { findPeople, useAllOrgs, useOrgSuspension } from "./data";
import { k } from "./orgsStrings";
import { Tabs, TabPanel, type TabDef } from "./Tabs";
import { lazyRetry } from "../app/AppBoundary";
import "../styles/admin.css";
import "./strings";

/**
 * What only platform admins do (TECHNICAL.md "Platform administration"): organizations (create, edit, suspend and
 * resume, delete in steps) and anyone's role and organization. Every change goes through the platform functions, which
 * set the Auth claims.
 */
const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];
const TYPES = ["school", "university", "ministry", "ngo", "company", "other"] as const;

/** Members shown at first, and added by each "Show more": a table of thousands of rows is slow on an old laptop. */
const PAGE = 100;
type T = ReturnType<typeof useI18n>["t"];
/** An organization's status in words ("suspended" and "deleting" are worded in orgs-strings). */
export const orgStatusText = (s: Org["status"], t: T) => (s === "suspended" ? t(k("og.s.suspended")) : s === "deleting" ? t(k("og.s.deleting")) : t(`po.s.${s}`));
/** What deleteOrg does with the members: release everyone (the default), or delete the accounts the organization made. */
type DelChoice = "release" | "delete-managed";
/** What deleteOrg leaves on an organization it is part-way through (functions/src/platform.ts). */
type Deleting = { deletingMembers?: string; deletingReleased?: number; deletingQueued?: number };

/** An account found by exact email or username login (through Auth, findAccount) or by the start of its name (data.ts findPeople). */
type Found = Profile & { emailVerified?: boolean; claimed?: number };

/** /super/orgs: every organization (the default tab), and a new one (`?tab=new`). */
export function OrgsAdmin() {
  const { t } = useI18n();
  // What the page that sent us here did (an org deleted on its own page): said here, where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  const TABS: TabDef[] = [{ id: "all", label: t("tabs.allOrgs") }, { id: "new", label: t("tabs.newOrg") }];
  return (
    <>
      <AppBar title={t("po.title")} />
      <main className="screen wide stack-lg">
        {done && <p className="notice ok" role="status">{done}</p>}
        <Tabs label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="all"><AllOrgs /></TabPanel>
          {/* Kept while the list shows (the default): a half-filled form survives a look at the list. */}
          <TabPanel id="new"><NewOrg /></TabPanel>
        </Tabs>
      </main>
    </>
  );
}

/** The "All organizations" tab. The list is read here, so a page opened at `?tab=new` reads nothing until the list is opened. */
function AllOrgs() {
  const { t, num } = useI18n();
  const orgs = useAllOrgs();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (orgs.data ?? []).filter((o) => !s || [o.name, o.country, o.city].some((x) => x?.toLowerCase().includes(s)));
  }, [orgs.data, q]);
  return (
    <section className="panel stack">
      <div className="table-tools"><h3>{t("po.all")}</h3>
        {!!orgs.data?.length && <input type="search" placeholder={t("sup.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("sup.search")} />}
      </div>
      {/* Never the spinner under an error: the error says why, and Retry reads again. */}
      {orgs.error && <ErrorNote error={orgs.error} reload={orgs.reload} stale={!!orgs.data} />}
      {!orgs.data ? (orgs.error ? null : <div className="loading" aria-busy="true" />) : orgs.data.length === 0 ? <EmptyState icon="home" title={t("an.noOrgs")} /> : rows.length === 0 ? <p className="muted" role="status">{t("po.noMatch")}</p> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("col.name")}</th><th>{t("po.type")}</th><th>{t("po.status")}</th><th className="num">{t("an.members")}</th></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}>
              <td data-cell="main" data-label={t("col.name")}><Link to={`/super/orgs/${o.id}`} className="person-link"><span><strong><bdi>{o.name}</bdi></strong><small>{[o.city, o.country].filter(Boolean).join(t("common.sep"))}</small></span></Link></td>
              <td data-label={t("po.type")}>{TYPES.includes(o.type as (typeof TYPES)[number]) ? t(`po.t.${o.type as (typeof TYPES)[number]}`) : o.type}</td>
              <td data-label={t("po.status")}>{orgStatusText(o.status, t)}</td>
              <td data-label={t("an.members")} className="num">{num(o.memberCount ?? 0)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

/** The "New organization" tab: the form, and its first admin's checks. Creating one opens its page. */
function NewOrg() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const [f, setF] = useState({ name: "", type: "school", country: "", city: "", admin: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    // What the form itself refuses, in its own words (a failed call's words come from errorText).
    const no = (text: string) => setMsg({ ok: false, text });
    try {
      let adminUid: string | undefined;
      if (f.admin.trim()) {
        const found = await findPeople(f.admin);
        if (found.length === 1 && (found[0].claimed ?? 0) > 1) return no(t("acct.claimed"));
        if (found.length !== 1) return no(t("po.adminNotFound"));
        // Naming yourself would end your platform-admin role; another platform admin is demoted only on their own page
        // (the server refuses both too).
        if (found[0].uid === user?.uid) return no(t("po.adminSelf"));
        if (found[0].role === "superadmin") return no(t("po.adminIsSuper"));
        adminUid = found[0].uid;
      }
      const r = await api.createOrg({ name: f.name.trim(), type: f.type, country: f.country.trim(), city: f.city.trim(), ...(adminUid ? { adminUid } : {}) });
      nav(`/super/orgs/${r.orgId}`);
    } catch (x) { no(errorText(x, t, locale)); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="new-h"><h3 id="new-h">{t("po.new")}</h3>
      <form className="form-grid" onSubmit={create}>
        <TextField label={t("brand.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={120} />
        <label className="or-pick"><span>{t("po.type")}</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((x) => <option key={x} value={x}>{t(`po.t.${x}`)}</option>)}</select>
        </label>
        <TextField label={t("po.country")} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} maxLength={80} />
        <TextField label={t("po.city")} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={80} />
        <TextField label={t("po.adminField")} hint={t("po.adminHint")} value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })} dir="ltr" autoComplete="off" />
        {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="alert">{msg.text}</p>}
        <div><Button type="submit" icon="home" loading={busy}>{t("po.create")}</Button></div>
      </form>
    </section>
  );
}

/**
 * On a platform admin's org page: its details, its status (suspend and resume), adding people, members' roles, and
 * deleting it. `part` shows one of those jobs as a panel of its own, for the page's tabs ("people" is finding and
 * adding someone, then the members); without it, all of them in one panel. Each instance keeps its own message and
 * busy state.
 *
 * `members` is the complete list (never a part of it: the last-admin check counts admins in it). `onMember` hears of
 * one member's change (`null`: removed) so the page mends the list it holds instead of reading every member again;
 * without it, `onChanged` is called as after anything else.
 *
 * An organization that is being deleted (`status: "deleting"`, a deletion that stopped half-way or whose page was
 * closed) offers only to continue the deletion, behind its typed name like the start.
 */
export function OrgManage({ org, members, loading, loaded, failed, onChanged, onMember, part }: {
  org: Org; members: Profile[]; /** The members are still being read. */ loading?: boolean; /** How many have arrived so far, while loading. */ loaded?: number;
  /** The members could not be read: shown in place of the list (never "No people yet" under a failed read). */ failed?: ReactNode;
  onChanged: () => void; onMember?: (uid: string, change: Partial<Profile> | null) => void; part?: "details" | "status" | "people" | "delete";
}) {
  const { t, num, locale } = useI18n();
  const nav = useNavigate();
  const radios = useId();
  const [d, setD] = useState({ name: org.name, type: org.type, country: org.country ?? "", city: org.city ?? "" });
  // The organization read again with a saved field changed (Look saves the name from the same Settings panel): the
  // form follows that field, so its own Save never sends the older value back. What is typed in the other fields stays.
  // Not a key on the organization's fields: that would also drop this form's "Saved." after its own save.
  useEffect(() => { setD((x) => (x.name === org.name ? x : { ...x, name: org.name })); }, [org.name]);
  useEffect(() => { setD((x) => (x.type === org.type ? x : { ...x, type: org.type })); }, [org.type]);
  useEffect(() => { const v = org.country ?? ""; setD((x) => (x.country === v ? x : { ...x, country: v })); }, [org.country]);
  useEffect(() => { const v = org.city ?? ""; setD((x) => (x.city === v ? x : { ...x, city: v })); }, [org.city]);
  const [q, setQ] = useState(""); const [found, setFound] = useState<Found[] | null>(null);
  const [role, setRole] = useState<Role>("student");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  // `add`: it answers finding or adding someone; as a part, that panel says it, not the members' list under it.
  const [msg, setMsg] = useState<{ ok: boolean; text: string; add?: boolean } | null>(null);
  // A deletion's loop stops asking, and says nothing more, once the page is gone (the organization stays "deleting").
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string, after: () => void = onChanged) => {
    const add = key.startsWith("add:");
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok, add }); after(); } catch (x) { setMsg({ ok: false, text: errorText(x, t, locale), add }); } finally { setBusy(""); }
  };
  // Removing someone, or changing their role, signs them out everywhere (a removal and an admin's demotion also clear
  // their class and teacher; a student or teacher changing sides loses their teacher or students): every one of them
  // waits for a confirmation, as on the organization's own person page, and the organization's only admin stays until
  // someone else is made its admin.
  const [ask, setAsk] = useState<{ m: Profile; role: Role } | null>(null);
  const admins = useMemo(() => members.filter((x) => x.role === "orgAdmin").length, [members]);
  const lastAdmin = (m: Profile) => m.role === "orgAdmin" && admins <= 1;
  const change = (m: Profile, r: Role) => {
    setAsk(null);
    if (r === m.role) return;
    if (m.role === "orgAdmin" && r !== "orgAdmin" && lastAdmin(m)) return setMsg({ ok: false, text: t("po.lastAdmin") });
    setAsk({ m, role: r });
  };
  // One member changed: the page mends its own list (no second read of every member) when it gave us the way.
  const told = (uid: string, c: Partial<Profile> | null) => () => (onMember ? onMember(uid, c) : onChanged());
  const apply = (m: Profile, r: Role) => {
    setAsk(null);
    return r === "learner"
      ? act(`rm:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: "learner" }), t("po.removed", { name: m.name }), told(m.uid, null))
      : act(`role:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: r, orgId: org.id }), t("po.roleChanged", { name: m.name }), told(m.uid, { role: r }));
  };
  const note = (mine = true) => msg && mine && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>;

  /* ----- Status: suspend (asked first, with a reason) and resume ----- */
  const [askSuspend, setAskSuspend] = useState(false);
  const [reason, setReason] = useState("");
  // The answer counts the staff whose claims could not be refreshed (`failed`): said, since they keep access a while.
  const setStatus = async (status: "suspended" | "active", ok: string) => {
    const key = status === "suspended" ? "suspend" : "resume";
    setBusy(key); setMsg(null);
    try {
      const why = reason.trim();
      const r = await api.updateOrg({ orgId: org.id, status, ...(status === "suspended" && why ? { reason: why } : {}) }) as { ok: boolean; failed?: number } | undefined;
      setReason("");
      setMsg({ ok: true, text: r?.failed ? `${ok} ${t(k("og.staffFailed"), { n: r.failed })}` : ok });
      onChanged();
    } catch (x) { setMsg({ ok: false, text: errorText(x, t, locale) }); } finally { setBusy(""); setAskSuspend(false); }
  };
  // The reason is the platform's note (one read, only while suspended); an older suspension kept it on the document.
  const why = useOrgSuspension((!part || part === "status") && org.status === "suspended" ? org.id : null); // only the Status part shows it
  const whyText = why.data?.reason || org.suspended?.reason;
  const since = org.suspended?.at?.seconds ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(org.suspended.at.seconds * 1000)) : "";
  const status = () => (
      <div className="stack">
        {!part && <h4>{t("po.status")}</h4>}
        {org.status === "suspended" ? <>
          <p className="notice err">{[t(k("og.suspendedNow")), since && t(k("og.suspendedSince"), { date: since }), whyText && t(k("og.suspendedWhy"), { reason: isolate(whyText) })].filter(Boolean).join(" ")}</p>
          <p className="muted small">{t(k("og.resumeHint"))}</p>
          <div><Button loading={busy === "resume"} onClick={() => { void setStatus("active", t(k("og.resumed"))); }}>{t(k("og.resume"))}</Button></div>
        </> : org.status === "active" ? <>
          <p className="muted">{t(k("og.statusActive"))}</p>
          <p className="muted small">{t(k("og.suspendHint"))}</p>
          {/* The button stays while the question is open (as on the other staff screens): Cancel gives it the focus back. */}
          <div><Button variant="secondary" icon="lock" aria-expanded={askSuspend} onClick={() => { setMsg(null); setAskSuspend(true); }}>{t(k("og.suspend"))}</Button></div>
          {askSuspend && (
            <InlineConfirm danger title={t(k("og.suspendTitle"), { name: isolate(org.name) })} body={t(k("og.suspendBody"))} confirmLabel={t(k("og.suspend"))}
              busy={busy === "suspend"} onConfirm={() => { void setStatus("suspended", t(k("og.suspendedOk"))); }} onCancel={() => setAskSuspend(false)}>
              <TextField label={t("acc.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />
            </InlineConfirm>
          )}
        </> : <>
          {/* Waiting for approval, or rejected: a platform admin can make it active here. */}
          <p className="muted">{t(k("og.statusOther"), { status: orgStatusText(org.status, t) })}</p>
          <div><Button variant="secondary" loading={busy === "act"} onClick={() => { void act("act", () => api.updateOrg({ orgId: org.id, status: "active" }), t("po.activated")); }}>{t("po.activate")}</Button></div>
        </>}
      </div>
  );

  // Each job's heading: the panel's own (h3, below) when it is shown as a part, a smaller one inside the whole panel.
  const details = () => (
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void act("save", () => api.updateOrg({ orgId: org.id, ...d }), t("po.saved")); }}>
        {!part && <h4 className="span2">{t("po.details")}</h4>}
        <TextField label={t("brand.name")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required minLength={2} maxLength={120} />
        <label className="or-pick"><span>{t("po.type")}</span>
          <select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>{[...new Set([...TYPES, d.type])].map((x) => <option key={x} value={x}>{TYPES.includes(x as (typeof TYPES)[number]) ? t(`po.t.${x as (typeof TYPES)[number]}`) : x}</option>)}</select>
        </label>
        <TextField label={t("po.country")} value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })} maxLength={80} />
        <TextField label={t("po.city")} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} maxLength={80} />
        <div className="row-gap"><Button type="submit" loading={busy === "save"}>{t("po.save")}</Button></div>
      </form>
  );
  const add = () => (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); setBusy("find"); findPeople(q).then(setFound, (x) => setMsg({ ok: false, text: errorText(x, t, locale), add: true })).finally(() => setBusy("")); }}>
        {!part && <h4>{t("po.addPerson")}</h4>}
        <p className="muted small">{t("po.addHint")}</p>
        <div className="table-tools">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("po.findPlaceholder")} aria-label={t("po.findPlaceholder")} dir="auto" />
          <label className="or-pick"><span>{t("col.role")}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{IN_ORG.map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}</select>
          </label>
          <Button size="sm" variant="secondary" icon="search" type="submit" loading={busy === "find"}>{t("an.search")}</Button>
        </div>
        {found && (found.length === 0 ? <p className="muted">{t("an.noPeople")}</p> : (
          <ul className="po-found">{found.map((p) => (
            <li key={p.uid}>
              <span className="person-link"><span className="avatar sm" aria-hidden>{(p.name ?? "").slice(0, 1)}</span><span><strong><bdi>{p.name}</bdi></strong><small dir="ltr">{displayLogin(p.email ?? "")}</small></span></span>
              <span className="muted small">{p.orgId === org.id ? t("po.already") : p.orgId ? t("po.inOther") : t(`rn.${p.role ?? "learner"}` as "rn.student")}
                {p.emailVerified === false && !p.email?.endsWith("@users.darsi.app") && <>{t("common.sep")}{t("acct.unverified")}</>}
                {(p.claimed ?? 0) > 1 && <>{t("common.sep")}{t("acct.claimed")}</>}</span>
              <Button size="sm" disabled={p.orgId === org.id && p.role === role} loading={busy === `add:${p.uid}`}
                onClick={() => { const r = role; void act(`add:${p.uid}`, async () => { await api.setUserRole({ uid: p.uid, role: r, orgId: org.id }); setFound((f) => f?.map((x) => (x.uid === p.uid ? { ...x, orgId: org.id, role: r } : x)) ?? null); }, t("po.added", { name: p.name, role: t(`role.${r}` as "role.student") })); }}>{t("po.addAs", { role: t(`role.${role}` as "role.student") })}</Button>
            </li>
          ))}</ul>
        ))}
      </form>
  );

  /* ----- The members: the one list of them on the page, 100 rows at a time, searched once there are many ----- */
  const [mq, setMq] = useState("");
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => {
    const s = mq.trim().toLowerCase();
    return s ? members.filter((m) => [m.name, m.email, m.username, m.group].some((x) => x?.toLowerCase().includes(s))) : members;
  }, [members, mq]);
  const list = () => (
      <div className="stack">
        {!part && <h4>{t("po.members")}</h4>}
        {/* The staff kit's question: the focus opens on Cancel (never on the button that removes or demotes), Escape
            cancels, and the focus goes back to the select or Remove button that asked. A new question is a new one (key). */}
        {ask && (() => {
          const out = ask.role === "learner", demote = !out && ask.m.role === "orgAdmin", name = isolate(ask.m.name ?? ""), role = t(`role.${ask.role}` as "role.student");
          return (
            <InlineConfirm key={`${ask.m.uid}:${ask.role}`} danger={out || demote}
              title={out ? t("po.removeConfirm", { name }) : demote ? t("po.demoteConfirm", { name, role }) : t(k("og.roleAsk"), { name, role })}
              body={out || demote ? undefined : t(k("og.roleBody"))}
              confirmLabel={out ? t("po.remove") : t("po.changeRole")}
              onConfirm={() => { void apply(ask.m, ask.role); }} onCancel={() => setAsk(null)} />
          );
        })()}
        {/* Nothing is listed, and nobody counted as "the only admin", from a list that is still arriving. */}
        {failed ? failed : loading ? <p className="muted" role="status" aria-busy="true">{loaded ? t(k("og.loadedSoFar"), { n: loaded }) : t("adm.loading")}</p> : members.length === 0 ? <p className="muted">{t("adm.noPeople")}</p> : <>
          {members.length > 20 && <div className="table-tools"><input type="search" placeholder={t("adm.search")} aria-label={t("adm.search")} value={mq} onChange={(e) => { setMq(e.target.value); setShown(PAGE); }} /></div>}
          {rows.length === 0 ? <p className="muted" role="status">{t(k("og.noMatch"))}</p> : (
            <div className="table-wrap"><table className="data-table or-wide">
              <thead><tr><th>{t("col.name")}</th><th>{t("col.role")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th>{t("po.actions")}</th></tr></thead>
              <tbody>{rows.slice(0, shown).map((m) => (
                <tr key={m.uid}>
                  {/* The card on a phone (base.css .data-table): the person across its top, class and lessons as a pair, and
                      the two controls each on a line of their own (a role's name in a select can be wider than half a card). */}
                  <td data-cell="main" data-label={t("col.name")}><Link to={`/super/people/${m.uid}`} className="person-link"><span><strong><bdi>{m.name}</bdi></strong><small dir="ltr">{displayLogin(m.email ?? "")}</small></span></Link></td>
                  <td data-cell="row" data-label={t("col.role")}>
                    <select aria-label={t("col.role")} value={ask?.m.uid === m.uid && ask.role !== "learner" ? ask.role : m.role} disabled={busy === `role:${m.uid}`} onChange={(e) => change(m, e.target.value as Role)}>
                      {IN_ORG.map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}
                    </select>
                  </td>
                  <td data-label={t("col.group")}>{m.group ?? "—"}</td>
                  <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
                  <td data-cell="row" data-label={t("po.actions")}><Button size="sm" variant="ghost" icon="close" loading={busy === `rm:${m.uid}`} onClick={() => change(m, "learner")}>{t("po.remove")}</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {rows.length > shown && <div className="row-gap">
            <Button size="sm" variant="secondary" onClick={() => setShown(shown + PAGE)}>{t(k("og.showMore"))}</Button>
            <span className="muted small">{t(k("og.shownOf"), { shown, total: rows.length })}</span>
          </div>}
        </>}
      </div>
  );

  /* ----- Deleting it: in steps the server can resume (deleteOrg), behind the typed name every time ----- */
  const deleting = org.status === "deleting";
  const left = org as Org & Deleting;
  // What the platform admin agreed with the school. A deletion already under way keeps the choice it started with:
  // the organization's own record of it wins over this page's (one started on another screen while this one was open).
  const [picked, setChoice] = useState<DelChoice>("release");
  const choice: DelChoice = deleting && (left.deletingMembers === "release" || left.deletingMembers === "delete-managed") ? left.deletingMembers : picked;
  // People handled before this page opened (an earlier visit's steps), then this visit's own.
  const [before] = useState(() => (left.deletingReleased ?? 0) + (left.deletingQueued ?? 0));
  const [prog, setProg] = useState<{ n: number; cursor: string | null; stopped?: string } | null>(null);
  const runDelete = async () => {
    // Never without the typed name, a continuation included; and one run at a time (Enter in the field while it runs).
    if (confirm !== org.name || busy === "del") return;
    setBusy("del"); setMsg(null);
    let n = prog?.n ?? 0, cursor = prog?.cursor ?? null, stalled = 0;
    setProg({ n, cursor });
    try {
      for (;;) {
        const r = await api.deleteOrg({ orgId: org.id, confirm, members: choice, ...(cursor ? { cursor } : {}) });
        if (!live.current) return;
        n += r?.processed ?? 0;
        // `done` missing: a server from before the steps, which deleted it in this one call.
        if (r?.done !== false) break;
        // The server handles at least a page per call: the same place three times over is a fault, not progress.
        stalled = r.cursor === cursor && !r.processed ? stalled + 1 : 0;
        if (stalled >= 3) throw new Error("deleteOrg made no progress");
        cursor = r.cursor ?? null;
        setProg({ n, cursor });
      }
    } catch (x) {
      if (!live.current) return;
      // "delete-retry" names the place before the page that failed: the continuation starts there.
      const at = (x as { details?: { cursor?: unknown } } | null)?.details?.cursor;
      setProg({ n, cursor: typeof at === "string" ? at : at === null ? null : cursor, stopped: errorText(x, t, locale) });
      setBusy("");
      return;
    }
    // The page goes with the org: the list says it was deleted (no reload of what no longer exists).
    nav("/super/orgs", { replace: true, state: { done: t(choice === "delete-managed" ? k("og.deletedManaged") : "po.deletedOrg", { name: isolate(org.name) }) } });
  };
  const del = () => {
    const running = busy === "del", under = deleting || !!prog, soFar = before + (prog?.n ?? 0);
    return (
      // po-danger is the line that sets it apart inside the whole panel; a panel of its own needs none.
      <form className={part ? "stack" : "stack po-danger"} onSubmit={(e) => { e.preventDefault(); void runDelete(); }}>
        {!part && <h4>{t("po.delete")}</h4>}
        {deleting ? <p className="notice err"><strong>{t(k("og.deleting"))}</strong> {t(k("og.deletingBody"))}</p> : <p className="muted small">{t("po.deleteHint")}</p>}
        <div className="stack-sm" role="radiogroup" aria-labelledby={`${radios}-who`}>
          <strong id={`${radios}-who`}>{t(k("og.delWho"))}</strong>
          {(["release", "delete-managed"] as const).map((c) => (
            <label key={c} className="pick-cell">
              <input type="radio" name={radios} value={c} checked={choice === c} disabled={under} onChange={() => setChoice(c)} />
              <span><strong>{t(k(c === "release" ? "og.delRelease" : "og.delManaged"))}</strong><br />{t(k(c === "release" ? "og.delReleaseHint" : "og.delManagedHint"))}</span>
            </label>
          ))}
        </div>
        <TextField label={t("po.typeName", { name: org.name })} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" disabled={running} />
        {(running || soFar > 0) && <p className="muted" role="status" aria-busy={running || undefined}>{running && `${t(k("og.delRunning"))} `}{t(k("og.delProgress"), { n: soFar })}</p>}
        {prog?.stopped && !running && <div className="notice err stack-sm" role="alert"><span>{t(k("og.delStopped"))}</span><span>{prog.stopped}</span></div>}
        <div><Button type="submit" variant="secondary" icon="close" disabled={confirm !== org.name} loading={running}>{under ? t("common.continue") : t("po.deleteBtn")}</Button></div>
      </form>
    );
  };

  // Being deleted: nothing in it can be changed (the server refuses), so every part but the deletion says only that.
  const gone = <p className="notice err">{t(k("og.deleting"))}</p>;
  if (part === "details") return <section className="panel stack" aria-labelledby="mg-details-h"><h3 id="mg-details-h">{t("po.details")}</h3>{deleting ? gone : <>{note()}{details()}</>}</section>;
  if (part === "status") return <section className="panel stack" aria-labelledby="mg-status-h"><h3 id="mg-status-h">{t("po.status")}</h3>{deleting ? gone : <>{note()}{status()}</>}</section>;
  if (part === "delete") return <section className="panel stack" aria-labelledby="mg-delete-h"><h3 id="mg-delete-h">{t("po.delete")}</h3>{note()}{del()}</section>;
  if (part === "people") return deleting ? <section className="panel stack" aria-labelledby="mg-members-h"><h3 id="mg-members-h">{t("po.members")}</h3>{gone}</section> : (
    <>
      <section className="panel stack" aria-labelledby="mg-add-h"><h3 id="mg-add-h">{t("po.addPerson")}</h3>{note(!!msg?.add)}{add()}</section>
      <section className="panel stack" aria-labelledby="mg-members-h"><h3 id="mg-members-h">{t("po.members")}</h3>{note(!msg?.add)}{list()}</section>
    </>
  );
  return (
    <section className="panel stack" aria-labelledby="mg-h">
      <h3 id="mg-h">{t("po.manage")}</h3>
      {note()}
      {!deleting && <>{details()}{status()}{add()}{list()}</>}
      {del()}
    </section>
  );
}

/** School sign-in's wizard and status card: its own chunk, loaded when an organization's Sign-in tab first opens. */
const SsoSetup = lazyRetry(() => import("./SsoSetup").then((m) => ({ default: m.SsoSetup })));

/**
 * An organization's school sign-in on its page, for platform admins (/super/orgs/:id, the "signin" tab, where the
 * provider sends a platform admin's own test back: ?tab=signin#sso=…): the wizard or status card its admins have, plus
 * the members ceiling and the keys' health. Nothing to set up while the organization is being deleted.
 */
export function OrgSignIn({ org }: { org: Org }) {
  const { t } = useI18n();
  if (org.status === "deleting") return null;
  return <Suspense fallback={<p className="muted" aria-busy="true">{t("adm.loading")}</p>}><SsoSetup key={org.id} orgId={org.id} platform /></Suspense>;
}

/** On a person's page, for platform admins: any role, and the organization it belongs to. `onSaved` reads the person again. */
export function UserRolePanel({ person, onSaved }: { person: Profile; onSaved?: () => void }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const orgs = useAllOrgs();
  const [role, setRole] = useState<Role>(person.role ?? "learner");
  const [orgId, setOrgId] = useState(person.orgId ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const needsOrg = IN_ORG.includes(role);
  const self = user?.uid === person.uid;
  const changed = role !== (person.role ?? "learner") || (needsOrg && orgId !== (person.orgId ?? ""));
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api.setUserRole({ uid: person.uid, role, orgId: needsOrg ? orgId : null }); setMsg({ ok: true, text: t("po.roleSaved") }); onSaved?.(); }
    catch (x) { setRole(person.role ?? "learner"); setOrgId(person.orgId ?? ""); setMsg({ ok: false, text: errorText(x, t, locale) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="ur-h">
      <h3 id="ur-h">{t("po.roleTitle")}</h3>
      {self ? <p className="muted">{t("po.notSelf")}</p> : <>
        <label className="or-pick"><span>{t("col.role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}</select>
        </label>
        {needsOrg && <label className="or-pick"><span>{t("po.org")}</span>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">{t("po.chooseOrg")}</option>
            {(orgs.data ?? []).filter((o) => o.status === "active").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>}
        <p className="muted small">{t(role === "superadmin" ? "po.superHint" : needsOrg ? "po.orgHint" : "po.learnerHint")}</p>
        {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}
        <div><Button onClick={() => { void save(); }} loading={busy} disabled={!changed || (needsOrg && !orgId)}>{t("po.save")}</Button></div>
      </>}
    </section>
  );
}
