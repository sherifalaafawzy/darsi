import { Fragment, useEffect, useRef, useState } from "react";
import { AppBar, Button, ChoiceCard, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { isolate, useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { LoadState, useRead } from "../staff/LoadState";
import { k } from "../staff/strings";
import { useCatalog, type ContentLoader } from "./async";
import { allGrants, allOrgs, ClaimedEmail, ended, findUser, NO_ORG, removeGrant, saveGrant, type Grant } from "./data";
// A platform admin's page: the words admin/refusals.ts has for the older refusals staff/errors.ts doesn't word itself
// (it now words "not-super" and "no-account", and its words win), which it leaves to each admin screen to load.
import "../admin/strings";
import "../styles/admin.css";

/** The grant being written: `day` is the end date as the date field holds it ("" for none), in this device's time. */
type Editing = Grant & { teach?: string; emailVerified?: boolean; day: string };
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** The last millisecond of that day here: "until the 30th" includes the 30th. */
const endOfDay = (day: string) => { const [y, m, d] = day.split("-").map(Number); return y && m && d ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : null; };
/** More organizations than this, and the list gets a search field. */
const SEARCH_FROM = 8;

/**
 * /super/access: platform admins let a university teacher see chosen courses' student results and projects, read only.
 * Find the teacher by email, tick the courses, choose whose students (no choice: the server stores the teacher's own
 * organization as it is at that moment, and the list then names it) and, if wanted, a last day, then save. Grants are written and removed by audited callables (results/data.ts); removing
 * one ends the access at once.
 */
export function CourseAccess({ content }: { content: ContentLoader }) {
  const { t, L, locale } = useI18n();
  const { role } = useAuth();
  const isSuper = role === "superadmin";
  const grants = useRead(isSuper ? allGrants : null, [isSuper]);
  const orgs = useRead(isSuper ? allOrgs : null, [isSuper]);
  const catalog = useCatalog(content);
  const [email, setEmail] = useState("");
  const [edit, setEdit] = useState<Editing | null>(null);
  const [orgFind, setOrgFind] = useState("");
  const [busy, setBusy] = useState<"find" | "save" | "remove" | null>(null);
  // `focus`: said after something the person was looking at went away (a removed row), so the keyboard lands on the news.
  const [msg, setMsg] = useState<{ ok: boolean; text: string; focus?: boolean } | null>(null);
  const [asking, setAsking] = useState<Grant | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const note = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (msg?.focus) note.current?.focus(); }, [msg]);
  const titleOf = (id: string) => { const e = catalog.data?.units.find((u) => u.id === id); return e ? L(e.title) : id; };
  const orgName = (id: string) => (id === NO_ORG ? t(k("st.acc.noOrg")) : orgs.data?.find((o) => o.id === id)?.name ?? id);
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ms));
  if (!isSuper) return <><AppBar title={t("access.title")} /><main className="screen"><EmptyState title={t("access.onlySuper")} /></main></>;

  const find = async () => {
    if (!email.trim() || busy) return;
    setMsg(null); setBusy("find");
    try {
      const u = await findUser(email);
      if (!u) { setMsg({ ok: false, text: t("access.notFound") }); return; }
      const had = (grants.data ?? []).find((g) => g.uid === u.uid);
      setOrgFind("");
      setEdit({ uid: u.uid, name: u.name, email: u.email, units: had?.units ?? [], orgs: had?.orgs ?? [], until: had?.until ?? null, day: had?.until ? dayOf(had.until) : "", teach: u.teach, emailVerified: u.emailVerified });
    } catch (e) { setMsg({ ok: false, text: e instanceof ClaimedEmail ? t("access.claimed") : errorText(e, t) }); }
    finally { setBusy(null); }
  };
  const save = async () => {
    if (!edit || busy) return;
    setMsg(null); setBusy("save");
    try {
      // No course ticked is "no access": the grant goes, as it always did on this page.
      if (edit.units.length) await saveGrant({ uid: edit.uid, units: edit.units, orgs: edit.orgs, until: edit.day ? endOfDay(edit.day) : null });
      else await removeGrant(edit.uid);
      setMsg({ ok: true, text: t("access.saved") }); setEdit(null); grants.reload();
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); }
    finally { setBusy(null); }
  };
  const remove = async () => {
    if (!asking || busy) return;
    setRemoveErr(null); setBusy("remove");
    try {
      await removeGrant(asking.uid);
      setAsking(null); setMsg({ ok: true, text: t(k("st.acc.removed")), focus: true }); grants.reload();
    } catch (e) { setRemoveErr(errorText(e, t)); }
    finally { setBusy(null); }
  };
  const toggle = (key: "units" | "orgs", id: string) => edit && setEdit({ ...edit, [key]: (edit[key] ?? []).includes(id) ? (edit[key] ?? []).filter((x) => x !== id) : [...(edit[key] ?? []), id] });
  const picked = (id: string) => !!edit?.orgs?.includes(id);

  return (
    <>
      <AppBar title={t("access.title")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("access.intro")}</p>
        {msg && <p ref={note} tabIndex={-1} className={`notice ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <section className="stack" aria-labelledby="acc-find">
          <h2 id="acc-find" className="section-title">{t("access.find")}</h2>
          {/* A real form: Enter in the field finds, as people expect of a search. */}
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void find(); }}>
            <TextField label={t("access.email")} type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="row-gap"><Button type="submit" icon="search" loading={busy === "find"} disabled={!email.trim()}>{t("access.findBtn")}</Button></div>
          </form>
        </section>
        {edit && (
          <section className="stack" aria-labelledby="acc-edit">
            <h2 id="acc-edit" className="section-title"><bdi>{edit.name || edit.email}</bdi></h2>
            {edit.teach !== "university" && <p className="notice">{t("access.notUni")}</p>}
            {edit.emailVerified === false && <p className="notice">{t("access.unverified")} <bdi dir="ltr">{edit.email}</bdi></p>}
            <div className="stack-sm" role="group" aria-label={t("access.courses")}>
              {(catalog.data?.units ?? []).filter((u) => u.audience === "students").map((u) => (
                <ChoiceCard key={u.id} multi title={L(u.title)} description={u.id} selected={edit.units.includes(u.id)} onClick={() => toggle("units", u.id)} />
              ))}
            </div>
            <div className="stack-sm" role="group" aria-labelledby="acc-orgs" aria-describedby="acc-orgs-hint">
              <strong id="acc-orgs">{t(k("st.acc.orgs"))}</strong>
              <span id="acc-orgs-hint" className="muted small">{t(k("st.acc.orgsHint"))}</span>
              <LoadState q={orgs}>{(list) => {
                const q = orgFind.trim().toLowerCase();
                // An organization in the grant that the list no longer has (deleted since) still shows, so it can be unticked.
                const gone = (edit.orgs ?? []).filter((id) => id !== NO_ORG && !list.some((o) => o.id === id)).map((id) => ({ id, name: id }));
                return (
                  <>
                    {list.length > SEARCH_FROM && <TextField label={t(k("st.acc.orgsFind"))} type="search" dir="auto" value={orgFind} onChange={(e) => setOrgFind(e.target.value)} />}
                    <ChoiceCard multi title={t(k("st.acc.noOrg"))} selected={picked(NO_ORG)} onClick={() => toggle("orgs", NO_ORG)} />
                    {[...gone, ...list].filter((o) => !q || picked(o.id) || o.name.toLowerCase().includes(q)).map((o) => (
                      <ChoiceCard key={o.id} multi title={o.name} selected={picked(o.id)} onClick={() => toggle("orgs", o.id)} />
                    ))}
                  </>
                );
              }}</LoadState>
            </div>
            <TextField label={t(k("st.acc.until"))} hint={t(k("st.acc.untilHint"))} type="date" min={dayOf(Date.now())} value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} />
            <div className="row-gap">
              <Button icon="check" loading={busy === "save"} onClick={() => { void save(); }}>{t("access.save")}</Button>
              <Button variant="ghost" disabled={busy === "save"} onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
            </div>
          </section>
        )}
        <section className="stack" aria-labelledby="acc-list">
          <h2 id="acc-list" className="section-title">{t("access.current")}</h2>
          {asking && (
            <InlineConfirm key={asking.uid} danger title={t(k("st.acc.removeTitle"), { name: isolate(asking.name || asking.email || asking.uid) })} body={t(k("st.acc.removeBody"))}
              confirmLabel={t("access.remove")} busy={busy === "remove"} onConfirm={() => { void remove(); }} onCancel={() => { setAsking(null); setRemoveErr(null); }}>
              {removeErr && <span className="err-text" role="alert">{removeErr}</span>}
            </InlineConfirm>
          )}
          <LoadState q={grants} empty={<p className="muted">{t("access.noneYet")}</p>}>{(list) => (
            <div className="table-wrap"><table className="data-table">
              <thead><tr>
                <th>{t("access.teacher")}</th><th>{t("access.courses")}</th><th>{t(k("st.acc.orgsCol"))}</th><th>{t(k("st.acc.untilCol"))}</th>
                <th><span className="dr-video-sr">{t(k("st.acc.actions"))}</span></th>
              </tr></thead>
              <tbody>{list.map((g) => (
                <tr key={g.uid}>
                  {/* On a phone's card: the teacher across the top, the end date beside Remove, and the two lists (they can be long) a line each. */}
                  <td data-cell="main" data-label={t("access.teacher")}><strong id={`acc-who-${g.uid}`}><bdi>{g.name || g.email || g.uid}</bdi></strong></td>
                  <td data-cell="row" data-label={t("access.courses")}>{g.units.map(titleOf).join(t("common.sep"))}</td>
                  <td data-cell="row" data-label={t(k("st.acc.orgsCol"))}><span>{g.orgs?.length ? g.orgs.map((id, i) => <Fragment key={id}>{i > 0 && t("common.sep")}<bdi>{orgName(id)}</bdi></Fragment>) : t(k("st.acc.orgsUnset"))}</span></td>
                  <td data-label={t(k("st.acc.untilCol"))}>{g.until == null ? t(k("st.acc.noEnd")) : ended(g) ? t(k("st.acc.ended"), { date: date(g.until) }) : date(g.until)}</td>
                  <td><Button size="sm" variant="ghost" aria-describedby={`acc-who-${g.uid}`} aria-expanded={asking?.uid === g.uid} disabled={busy === "remove"} onClick={() => { setRemoveErr(null); setAsking(g); }}>{t("access.remove")}</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}</LoadState>
        </section>
      </main>
    </>
  );
}
