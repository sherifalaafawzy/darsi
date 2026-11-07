import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { api, displayLogin } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import type { Org, Profile, Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { findPeople, useAllOrgs } from "./data";
import { refusalText } from "./refusals";
import "../styles/admin.css";
import "./strings";

/**
 * What only platform admins do (TECHNICAL.md "Platform administration"): organizations (create, edit, delete) and
 * anyone's role and organization. Every change goes through the platform functions, which set the Auth claims.
 */
const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];
const TYPES = ["school", "university", "ministry", "ngo", "company", "other"] as const;

/** An account found by exact email or username login (through Auth, findAccount) or by the start of its name (data.ts findPeople). */
type Found = Profile & { emailVerified?: boolean; claimed?: number };

/** /super/orgs: every organization, and a new one. */
export function OrgsAdmin() {
  const { t, num } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const orgs = useAllOrgs();
  const [f, setF] = useState({ name: "", type: "school", country: "", city: "", admin: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // What the page that sent us here did (an org deleted on its own page): said here, where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      let adminUid: string | undefined;
      if (f.admin.trim()) {
        const found = await findPeople(f.admin);
        if (found.length === 1 && (found[0].claimed ?? 0) > 1) throw new Error(t("acct.claimed"));
        if (found.length !== 1) throw new Error(t("po.adminNotFound"));
        // Naming yourself would end your platform-admin role; another platform admin is demoted only on their own page
        // (the server refuses both too).
        if (found[0].uid === user?.uid) throw new Error(t("po.adminSelf"));
        if (found[0].role === "superadmin") throw new Error(t("po.adminIsSuper"));
        adminUid = found[0].uid;
      }
      const r = await api.createOrg({ name: f.name.trim(), type: f.type, country: f.country.trim(), city: f.city.trim(), ...(adminUid ? { adminUid } : {}) });
      nav(`/super/orgs/${r.orgId}`);
    } catch (x) { setMsg({ ok: false, text: refusalText(x, t) }); } finally { setBusy(false); }
  };
  return (
    <>
      <AppBar title={t("po.title")} />
      <main className="screen wide stack-lg">
        {done && <p className="notice ok" role="status">{done}</p>}
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

        <section className="panel stack"><h3>{t("po.all")}</h3>
          {orgs.error && <p className="notice err">{refusalText(orgs.error, t)}</p>}
          {!orgs.data ? <div className="loading" aria-busy="true" /> : orgs.data.length === 0 ? <EmptyState icon="home" title={t("an.noOrgs")} /> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t("col.name")}</th><th>{t("po.type")}</th><th>{t("po.status")}</th><th className="num">{t("an.members")}</th></tr></thead>
              <tbody>{orgs.data.map((o) => (
                <tr key={o.id}>
                  <td data-label={t("col.name")}><Link to={`/super/orgs/${o.id}`} className="person-link"><span><strong><bdi>{o.name}</bdi></strong><small>{[o.city, o.country].filter(Boolean).join(t("common.sep"))}</small></span></Link></td>
                  <td data-label={t("po.type")}>{TYPES.includes(o.type as (typeof TYPES)[number]) ? t(`po.t.${o.type as (typeof TYPES)[number]}`) : o.type}</td>
                  <td data-label={t("po.status")}>{t(`po.s.${o.status}`)}</td>
                  <td data-label={t("an.members")} className="num">{num(o.memberCount ?? 0)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </main>
    </>
  );
}

/** On a platform admin's org page: its details, adding people, members' roles, and deleting it. */
export function OrgManage({ org, members, loading, onChanged }: { org: Org; members: Profile[]; /** The members are still being read. */ loading?: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [d, setD] = useState({ name: org.name, type: org.type, country: org.country ?? "", city: org.city ?? "" });
  const [q, setQ] = useState(""); const [found, setFound] = useState<Found[] | null>(null);
  const [role, setRole] = useState<Role>("student");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); onChanged(); } catch (x) { setMsg({ ok: false, text: refusalText(x, t) }); } finally { setBusy(""); }
  };
  // Removing someone, or taking an admin's role away, signs them out everywhere and clears their class and teacher:
  // it waits for a confirmation, and the organization's only admin stays until someone else is made its admin.
  const [ask, setAsk] = useState<{ m: Profile; role: Role } | null>(null);
  const lastAdmin = (m: Profile) => m.role === "orgAdmin" && members.filter((x) => x.role === "orgAdmin").length <= 1;
  const change = (m: Profile, r: Role) => {
    setAsk(null);
    if (m.role === "orgAdmin" && r !== "orgAdmin" && lastAdmin(m)) return setMsg({ ok: false, text: t("po.lastAdmin") });
    if (r === "learner" || m.role === "orgAdmin") return setAsk({ m, role: r });
    void apply(m, r);
  };
  const apply = (m: Profile, r: Role) => {
    setAsk(null);
    return r === "learner"
      ? act(`rm:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: "learner" }), t("po.removed", { name: m.name }))
      : act(`role:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: r, orgId: org.id }), t("po.roleChanged", { name: m.name }));
  };
  return (
    <section className="panel stack" aria-labelledby="mg-h">
      <h3 id="mg-h">{t("po.manage")}</h3>
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}

      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void act("save", () => api.updateOrg({ orgId: org.id, ...d }), t("po.saved")); }}>
        <h4 className="span2">{t("po.details")}</h4>
        <TextField label={t("brand.name")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required minLength={2} maxLength={120} />
        <label className="or-pick"><span>{t("po.type")}</span>
          <select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>{[...new Set([...TYPES, d.type])].map((x) => <option key={x} value={x}>{TYPES.includes(x as (typeof TYPES)[number]) ? t(`po.t.${x as (typeof TYPES)[number]}`) : x}</option>)}</select>
        </label>
        <TextField label={t("po.country")} value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })} maxLength={80} />
        <TextField label={t("po.city")} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} maxLength={80} />
        <div className="row-gap">
          <Button type="submit" loading={busy === "save"}>{t("po.save")}</Button>
          {org.status !== "active" && <Button variant="secondary" loading={busy === "act"} onClick={() => { void act("act", () => api.updateOrg({ orgId: org.id, status: "active" }), t("po.activated")); }}>{t("po.activate")}</Button>}
        </div>
      </form>

      <form className="stack" onSubmit={(e) => { e.preventDefault(); setBusy("find"); findPeople(q).then(setFound, (x) => setMsg({ ok: false, text: refusalText(x, t) })).finally(() => setBusy("")); }}>
        <h4>{t("po.addPerson")}</h4>
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

      <div className="stack">
        <h4>{t("po.members")}</h4>
        {ask && (
          <div className="notice err stack-sm" role="alert">
            <span>{ask.role === "learner" ? t("po.removeConfirm", { name: isolate(ask.m.name ?? "") }) : t("po.demoteConfirm", { name: isolate(ask.m.name ?? ""), role: t(`role.${ask.role}` as "role.student") })}</span>
            <div className="row-gap">
              <Button size="sm" autoFocus icon={ask.role === "learner" ? "close" : undefined} onClick={() => { void apply(ask.m, ask.role); }}>{ask.role === "learner" ? t("po.remove") : t("po.changeRole")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsk(null)}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}
        {loading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : members.length === 0 ? <p className="muted">{t("adm.noPeople")}</p> : (
          <div className="table-wrap"><table className="data-table or-wide">
            <thead><tr><th>{t("col.name")}</th><th>{t("col.role")}</th><th>{t("po.actions")}</th></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.uid}>
                <td data-label={t("col.name")}><Link to={`/super/people/${m.uid}`} className="person-link"><span><strong><bdi>{m.name}</bdi></strong><small dir="ltr">{displayLogin(m.email ?? "")}</small></span></Link></td>
                <td data-label={t("col.role")}>
                  <select aria-label={t("col.role")} value={ask?.m.uid === m.uid && ask.role !== "learner" ? ask.role : m.role} disabled={busy === `role:${m.uid}`} onChange={(e) => change(m, e.target.value as Role)}>
                    {IN_ORG.map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}
                  </select>
                </td>
                <td data-label={t("po.actions")}><Button size="sm" variant="ghost" icon="close" loading={busy === `rm:${m.uid}`} onClick={() => change(m, "learner")}>{t("po.remove")}</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <form className="stack po-danger" onSubmit={(e) => { e.preventDefault(); setBusy("del"); setMsg(null);
        // The page goes with the org: the list says it was deleted (no reload of what no longer exists).
        api.deleteOrg({ orgId: org.id, confirm }).then(() => nav("/super/orgs", { replace: true, state: { done: t("po.deletedOrg", { name: isolate(org.name) }) } }),
          (x) => { setMsg({ ok: false, text: refusalText(x, t) }); setBusy(""); }); }}>
        <h4>{t("po.delete")}</h4>
        <p className="muted small">{t("po.deleteHint")}</p>
        <TextField label={t("po.typeName", { name: org.name })} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        <div><Button type="submit" variant="secondary" icon="close" disabled={confirm !== org.name} loading={busy === "del"}>{t("po.deleteBtn")}</Button></div>
      </form>
    </section>
  );
}

/** On a person's page, for platform admins: any role, and the organization it belongs to. `onSaved` reads the person again. */
export function UserRolePanel({ person, onSaved }: { person: Profile; onSaved?: () => void }) {
  const { t } = useI18n();
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
    catch (x) { setRole(person.role ?? "learner"); setOrgId(person.orgId ?? ""); setMsg({ ok: false, text: refusalText(x, t) }); } finally { setBusy(false); }
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
