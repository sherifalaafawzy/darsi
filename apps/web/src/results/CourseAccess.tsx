import { useState } from "react";
import { AppBar, Button, ChoiceCard, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { useLoad, type ContentLoader } from "./async";
import { allGrants, ClaimedEmail, findUser, removeGrant, saveGrant, type Grant } from "./data";
import "../styles/admin.css";

/**
 * /super/access: platform admins let a university teacher see chosen courses' student results and projects, read only.
 * Find the teacher by email, tick the courses, save. Removing the grant ends the access at once (the rules read it).
 */
export function CourseAccess({ content }: { content: ContentLoader }) {
  const { t, L } = useI18n();
  const { user, role } = useAuth();
  const isSuper = role === "superadmin";
  const [n, setN] = useState(0);
  const grants = useLoad(() => (isSuper ? allGrants() : Promise.resolve([])), [isSuper, n]);
  const catalog = useLoad(() => content.loadCatalog(), []);
  const [email, setEmail] = useState("");
  const [edit, setEdit] = useState<(Grant & { teach?: string; emailVerified?: boolean }) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const titleOf = (id: string) => { const e = catalog.data?.units.find((u) => u.id === id); return e ? L(e.title) : id; };
  if (!isSuper) return <><AppBar title={t("access.title")} /><main className="screen"><EmptyState title={t("access.onlySuper")} /></main></>;

  const find = async () => {
    setMsg(null);
    try {
      const u = await findUser(email);
      if (!u) { setMsg({ ok: false, text: t("access.notFound") }); return; }
      const had = (grants.data ?? []).find((g) => g.uid === u.uid);
      setEdit({ uid: u.uid, name: u.name, email: u.email, units: had?.units ?? [], teach: u.teach, emailVerified: u.emailVerified });
    } catch (e) { setMsg({ ok: false, text: e instanceof ClaimedEmail ? t("access.claimed") : (e as Error).message }); }
  };
  const save = async () => {
    if (!edit || !user) return;
    try {
      if (edit.units.length) await saveGrant(edit, user.uid); else await removeGrant(edit.uid);
      setMsg({ ok: true, text: t("access.saved") }); setEdit(null); setN((x) => x + 1);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const toggle = (id: string) => edit && setEdit({ ...edit, units: edit.units.includes(id) ? edit.units.filter((x) => x !== id) : [...edit.units, id] });

  return (
    <>
      <AppBar title={t("access.title")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("access.intro")}</p>
        {msg && <p className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
        <section className="stack" aria-labelledby="acc-find">
          <h2 id="acc-find" className="section-title">{t("access.find")}</h2>
          <TextField label={t("access.email")} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="row-gap"><Button icon="search" disabled={!email.trim()} onClick={() => { void find(); }}>{t("access.findBtn")}</Button></div>
        </section>
        {edit && (
          <section className="stack" aria-labelledby="acc-edit">
            <h2 id="acc-edit" className="section-title"><bdi>{edit.name || edit.email}</bdi></h2>
            {edit.teach !== "university" && <p className="notice">{t("access.notUni")}</p>}
            {edit.emailVerified === false && <p className="notice">{t("access.unverified")} <bdi dir="ltr">{edit.email}</bdi></p>}
            <div className="stack-sm">
              {(catalog.data?.units ?? []).filter((u) => u.audience === "students").map((u) => (
                <ChoiceCard key={u.id} multi title={L(u.title)} description={u.id} selected={edit.units.includes(u.id)} onClick={() => toggle(u.id)} />
              ))}
            </div>
            <div className="row-gap">
              <Button icon="check" onClick={() => { void save(); }}>{t("access.save")}</Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
            </div>
          </section>
        )}
        <section className="stack" aria-labelledby="acc-list">
          <h2 id="acc-list" className="section-title">{t("access.current")}</h2>
          {grants.loading ? <div className="loading" aria-busy="true" /> : grants.error ? <p className="notice err">{grants.error.message}</p>
            : !grants.data?.length ? <p className="muted">{t("access.noneYet")}</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t("access.teacher")}</th><th>{t("access.courses")}</th><th /></tr></thead>
              <tbody>{grants.data.map((g) => (
                <tr key={g.uid}>
                  <td data-label={t("access.teacher")}><strong><bdi>{g.name || g.email || g.uid}</bdi></strong></td>
                  <td data-label={t("access.courses")}>{g.units.map(titleOf).join(t("common.sep"))}</td>
                  <td><Button size="sm" variant="ghost" onClick={() => { void removeGrant(g.uid).then(() => setN((x) => x + 1)); }}>{t("access.remove")}</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </main>
    </>
  );
}
