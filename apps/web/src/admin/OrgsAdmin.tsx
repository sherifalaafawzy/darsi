import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { api, displayLogin } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import type { Org, Profile, Role } from "../auth/types";
import { useI18n } from "../i18n";
import { findByEmail, findByName, useAllOrgs } from "./data";
import "../styles/admin.css";
import "./strings";

/**
 * What only platform admins do (TECHNICAL.md "Platform administration"): organizations (create, edit, delete) and
 * anyone's role and organization. Every change goes through the platform functions, which set the Auth claims.
 */
const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];
const TYPES = ["school", "university", "ministry", "ngo", "company", "other"] as const;
// The server's own words, without a "FirebaseError: " prefix or the SDK's " [400]" (they may contain ": ").
const message = (e: unknown) => String((e as { message?: string }).message ?? e).replace(/^Firebase(?:Error)?:\s*/, "").replace(/\s*\[\d{3}\]$/, "");

/** Find accounts by exact email (or username login) or by the start of their name. */
async function findPeople(q: string): Promise<Profile[]> {
  const s = q.trim();
  if (!s) return [];
  if (s.includes("@")) return findByEmail(s);
  const byLogin = /^[a-z0-9._-]{3,}$/i.test(s) ? await findByEmail(`${s}@users.darsi.app`) : [];
  return byLogin.length ? byLogin : findByName(s);
}

/** /super/orgs: every organization, and a new one. */
export function OrgsAdmin() {
  const { t, num } = useI18n();
  const nav = useNavigate();
  const orgs = useAllOrgs();
  const [f, setF] = useState({ name: "", type: "school", country: "", city: "", admin: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      let adminUid: string | undefined;
      if (f.admin.trim()) {
        const found = await findPeople(f.admin);
        if (found.length !== 1) throw new Error(t("po.adminNotFound"));
        adminUid = found[0].uid;
      }
      const r = await api.createOrg({ name: f.name.trim(), type: f.type, country: f.country.trim(), city: f.city.trim(), ...(adminUid ? { adminUid } : {}) });
      nav(`/super/orgs/${r.orgId}`);
    } catch (x) { setMsg({ ok: false, text: message(x) }); } finally { setBusy(false); }
  };
  return (
    <>
      <AppBar title={t("po.title")} />
      <main className="screen wide stack-lg">
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
          {orgs.error && <p className="notice err">{orgs.error.message}</p>}
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
export function OrgManage({ org, members, onChanged }: { org: Org; members: Profile[]; onChanged: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [d, setD] = useState({ name: org.name, type: org.type, country: org.country ?? "", city: org.city ?? "" });
  const [q, setQ] = useState(""); const [found, setFound] = useState<Profile[] | null>(null);
  const [role, setRole] = useState<Role>("student");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); onChanged(); } catch (x) { setMsg({ ok: false, text: message(x) }); } finally { setBusy(""); }
  };
  return (
    <section className="panel stack" aria-labelledby="mg-h">
      <h3 id="mg-h">{t("po.manage")}</h3>
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}

      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void act("save", () => api.updateOrg({ orgId: org.id, ...d }), t("po.saved")); }}>
        <h4>{t("po.details")}</h4>
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

      <form className="stack" onSubmit={(e) => { e.preventDefault(); setBusy("find"); findPeople(q).then(setFound, (x) => setMsg({ ok: false, text: message(x) })).finally(() => setBusy("")); }}>
        <h4>{t("po.addPerson")}</h4>
        <p className="muted small">{t("po.addHint")}</p>
        <div className="table-tools">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("po.findPlaceholder")} aria-label={t("po.findPlaceholder")} dir="auto" />
          <label className="or-pick"><span>{t("col.role")}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{IN_ORG.map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}</select>
          </label>
          <Button size="sm" variant="secondary" icon="search" type="submit" loading={busy === "find"}>{t("an.search")}</Button>
        </div>
        {found && (found.length === 0 ? <p className="muted">{t("an.noPeople")}</p> : (
          <ul className="po-found">{found.map((p) => (
            <li key={p.uid}>
              <span className="person-link"><span className="avatar sm" aria-hidden>{(p.name ?? "").slice(0, 1)}</span><span><strong><bdi>{p.name}</bdi></strong><small dir="ltr">{displayLogin(p.email ?? "")}</small></span></span>
              <span className="muted small">{p.orgId === org.id ? t("po.already") : p.orgId ? t("po.inOther") : t(`role.${p.role ?? "learner"}` as "role.student")}</span>
              <Button size="sm" disabled={p.orgId === org.id && p.role === role} loading={busy === `add:${p.uid}`}
                onClick={() => { void act(`add:${p.uid}`, () => api.setUserRole({ uid: p.uid, role, orgId: org.id }), t("po.added", { name: p.name, role: t(`role.${role}` as "role.student") })); }}>{t("po.addAs", { role: t(`role.${role}` as "role.student") })}</Button>
            </li>
          ))}</ul>
        ))}
      </form>

      <div className="stack">
        <h4>{t("po.members")}</h4>
        {members.length === 0 ? <p className="muted">{t("adm.noPeople")}</p> : (
          <div className="table-wrap"><table className="data-table or-wide">
            <thead><tr><th>{t("col.name")}</th><th>{t("col.role")}</th><th>{t("po.actions")}</th></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.uid}>
                <td data-label={t("col.name")}><Link to={`/super/people/${m.uid}`} className="person-link"><span><strong><bdi>{m.name}</bdi></strong><small dir="ltr">{displayLogin(m.email ?? "")}</small></span></Link></td>
                <td data-label={t("col.role")}>
                  <select aria-label={t("col.role")} value={m.role} disabled={busy === `role:${m.uid}`} onChange={(e) => { const r = e.target.value as Role; void act(`role:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: r, orgId: org.id }), t("po.roleChanged", { name: m.name })); }}>
                    {IN_ORG.map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}
                  </select>
                </td>
                <td data-label={t("po.actions")}><Button size="sm" variant="ghost" icon="close" loading={busy === `rm:${m.uid}`} onClick={() => { void act(`rm:${m.uid}`, () => api.setUserRole({ uid: m.uid, role: "learner" }), t("po.removed", { name: m.name })); }}>{t("po.remove")}</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <form className="stack po-danger" onSubmit={(e) => { e.preventDefault(); void act("del", async () => { await api.deleteOrg({ orgId: org.id, confirm }); nav("/super/orgs"); }, t("po.deleted")); }}>
        <h4>{t("po.delete")}</h4>
        <p className="muted small">{t("po.deleteHint")}</p>
        <TextField label={t("po.typeName", { name: org.name })} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        <div><Button type="submit" variant="secondary" icon="close" disabled={confirm !== org.name} loading={busy === "del"}>{t("po.deleteBtn")}</Button></div>
      </form>
    </section>
  );
}

/** On a person's page, for platform admins: any role, and the organization it belongs to. */
export function UserRolePanel({ person }: { person: Profile }) {
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
    try { await api.setUserRole({ uid: person.uid, role, orgId: needsOrg ? orgId : null }); setMsg({ ok: true, text: t("po.roleSaved") }); }
    catch (x) { setMsg({ ok: false, text: message(x) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="ur-h">
      <h3 id="ur-h">{t("po.roleTitle")}</h3>
      {self ? <p className="muted">{t("po.notSelf")}</p> : <>
        <label className="or-pick"><span>{t("col.role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}</select>
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
