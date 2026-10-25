import { useMemo, useState } from "react";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin } from "../auth/api";
import type { Org } from "../auth/types";
import { isolate, LANGUAGES, useI18n } from "../i18n";
import { useOrgsByStatus, usePerson } from "./data";
import "../styles/admin.css";

/** Display helpers for an organization: localized type, "city، country" and a locale date. */
export function useOrgText() {
  const { t, lang } = useI18n();
  const locale = LANGUAGES.find((l) => l.code === lang)?.numerals ?? lang;
  return {
    type: (o: Org) => (["school", "university", "ministry", "ngo"].includes(o.type) ? t(`type.${o.type}` as "type.school") : o.type),
    place: (o: Org) => [o.city, o.country].filter(Boolean).join(t("common.sep")) || "—",
    date: (ts?: { seconds: number } | null) => (ts ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ts.seconds * 1000)) : "—"),
  };
}

/** Platform admin: review organization requests and see the active organizations. */
export function SuperAdmin() {
  const { t, num } = useI18n();
  const { role } = useAuth();
  const ot = useOrgText();
  const isSuper = role === "superadmin";
  const { data: pending = [], error: pendingErr } = useOrgsByStatus("pending", isSuper);
  const { data: active = [], error: activeErr } = useOrgsByStatus("active", isSuper);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active.filter((o) => !s || [o.name, o.country, o.city].some((x) => x?.toLowerCase().includes(s)));
  }, [active, q]);
  const error = pendingErr ?? activeErr;

  return (
    <>
      <AppBar title={t("sup.title")} />
      <main className="screen wide stack-lg">
        {error && <p className="notice err">{error.message}</p>}
        <section className="tiles">
          <div className="tile"><span>{t("sup.pending")}</span><strong>{num(pending.length)}</strong></div>
          <div className="tile"><span>{t("sup.active")}</span><strong>{num(active.length)}</strong></div>
          <div className="tile"><span>{t("adm.members")}</span><strong>{num(active.reduce((a, o) => a + (o.memberCount ?? 0), 0))}</strong></div>
        </section>

        <section className="panel stack">
          <h3>{t("sup.pending")}</h3>
          {msg && <p className="notice ok" role="status">{msg}</p>}
          {pending.length === 0 ? <p className="muted">{t("sup.none")}</p> : pending.map((o) => <OrgRequest key={o.id} org={o} onDone={setMsg} />)}
        </section>

        <section className="panel">
          <div className="table-tools">
            <h3>{t("sup.active")}</h3>
            <input type="search" placeholder={t("sup.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("sup.search")} />
          </div>
          {active.length === 0 ? <EmptyState icon="home" title={t("sup.noActive")} /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>{t("sup.org")}</th><th>{t("org.type")}</th><th>{t("sup.place")}</th><th className="num">{t("adm.members")}</th><th>{t("sup.since")}</th></tr></thead>
                <tbody>{rows.map((o) => (
                  <tr key={o.id}>
                    <td data-label={t("sup.org")}><strong><bdi>{o.name}</bdi></strong></td>
                    <td data-label={t("org.type")}>{ot.type(o)}</td>
                    <td data-label={t("sup.place")}><bdi>{ot.place(o)}</bdi></td>
                    <td data-label={t("adm.members")} className="num">{num(o.memberCount ?? 0)}</td>
                    <td data-label={t("sup.since")}>{ot.date(o.reviewedAt ?? o.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/** One pending request: what the requester told us, plus approve or reject (with an optional note they will see). */
function OrgRequest({ org, onDone }: { org: Org; onDone: (msg: string) => void }) {
  const { t, num } = useI18n();
  const ot = useOrgText();
  const { data: by } = usePerson(org.createdBy);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const review = async (approve: boolean) => {
    setBusy(true); setErr("");
    try {
      await api.reviewOrg({ orgId: org.id, approve, note: approve ? undefined : note.trim() || undefined });
      onDone(t(approve ? "sup.approved" : "sup.rejectedMsg", { org: isolate(org.name) }));
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <article className="req">
      <header><strong><bdi>{org.name}</bdi></strong><span className="muted small">{ot.date(org.createdAt)}</span></header>
      <dl className="req-facts">
        <div><dt>{t("org.type")}</dt><dd>{ot.type(org)}</dd></div>
        <div><dt>{t("sup.place")}</dt><dd><bdi>{ot.place(org)}</bdi></dd></div>
        {org.size ? <div><dt>{t("org.size")}</dt><dd>{num(org.size)}</dd></div> : null}
        <div><dt>{t("sup.requestedBy")}</dt><dd>{by ? <><bdi>{by.name}</bdi> <small dir="ltr">{displayLogin(by.email)}</small></> : "—"}</dd></div>
        {org.contact && <div><dt>{t("org.contact")}</dt><dd dir="auto">{org.contact}</dd></div>}
        {org.reason && <div className="span2"><dt>{t("org.reason")}</dt><dd dir="auto">{org.reason}</dd></div>}
      </dl>
      {rejecting ? (
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor={`note-${org.id}`}>{t("sup.rejectNote")}</label>
          <textarea id={`note-${org.id}`} className="dr-reflect-input" rows={2} dir="auto" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row-gap">
            <Button size="sm" variant="secondary" icon="cross" loading={busy} onClick={() => review(false)}>{t("sup.confirmReject")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="row-gap">
          <Button size="sm" icon="check" loading={busy} onClick={() => review(true)}>{t("sup.approve")}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>{t("sup.reject")}</Button>
        </div>
      )}
      {err && <p className="notice err" role="alert">{err}</p>}
    </article>
  );
}
