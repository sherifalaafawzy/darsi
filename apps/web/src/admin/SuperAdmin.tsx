import { useMemo, useState } from "react";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, type BroadcastAudience, type BroadcastLang } from "../auth/api";
import type { Org } from "../auth/types";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { useBroadcasts, useOrgsByStatus, usePerson, type Broadcast } from "./data";
import "../styles/admin.css";

/** Display helpers for an organization: localized type, "city، country" and a locale date. */
export function useOrgText() {
  const { t, locale } = useI18n();
  return {
    type: (o: Org) => (["school", "university", "ministry", "ngo"].includes(o.type) ? t(`type.${o.type}` as "type.school") : o.type),
    place: (o: Org) => [o.city, o.country].filter(Boolean).join(t("common.sep")) || "—",
    date: (ts?: { seconds: number } | null) => (ts ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ts.seconds * 1000)) : "—"),
  };
}

/** Platform admin: send announcements, review organization requests and see the active organizations. */
export function SuperAdmin() {
  const { t, num } = useI18n();
  const { role } = useAuth();
  const ot = useOrgText();
  const isSuper = role === "superadmin";
  const { data: pending = [], error: pendingErr } = useOrgsByStatus("pending", isSuper);
  const { data: active = [], error: activeErr } = useOrgsByStatus("active", isSuper);
  const sent = useBroadcasts(isSuper);
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

        <Announce orgs={active} onSent={sent.reload} />
        <RecentAnnouncements list={sent.data} error={sent.error} orgs={active} />

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

const MAX = { title: 60, body: 180 } as const;
const BLANK = { title: { en: "", ar: "" }, body: { en: "", ar: "" } };
type Kind = keyof typeof MAX;
type AudienceType = BroadcastAudience["type"];
type AudienceRole = Extract<BroadcastAudience, { type: "role" }>["role"];
const ROLES: { role: AudienceRole; key: MessageKey }[] = [{ role: "teacher", key: "bc.teachers" }, { role: "student", key: "bc.students" }, { role: "orgAdmin", key: "bc.orgAdmins" }];
const LINKS: { path: string; key: MessageKey }[] = [{ path: "/learn", key: "nav.learn" }, { path: "/labs", key: "nav.lab" }, { path: "/kit", key: "bc.linkKit" }, { path: "/org", key: "nav.org" }];
const LABEL: Record<Kind, Record<BroadcastLang, MessageKey>> = { title: { en: "bc.titleEn", ar: "bc.titleAr" }, body: { en: "bc.bodyEn", ar: "bc.bodyAr" } };

/** Who an announcement goes to, for the confirm dialog and the recent list. */
function useAudienceText(orgs: Org[]) {
  const { t } = useI18n();
  return (a?: { type: string; orgId?: string; role?: string }) => {
    if (a?.type === "org") return orgs.find((o) => o.id === a.orgId)?.name ?? a.orgId ?? "—";
    if (a?.type === "role") { const r = ROLES.find((x) => x.role === a.role); return r ? t(r.key) : a.role ?? "—"; }
    return t("bc.all");
  };
}

/**
 * The composer: English and Arabic text (each phone gets its owner's language), an audience and the screen a tap opens.
 * Only people who left Announcements on receive it; sendBroadcast logs every send in broadcasts/.
 */
function Announce({ orgs, onSent }: { orgs: Org[]; onSent: () => void }) {
  const { t } = useI18n();
  const audienceText = useAudienceText(orgs);
  const [text, setText] = useState(BLANK);
  const [aud, setAud] = useState<AudienceType>("all");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<AudienceRole>("teacher");
  const [link, setLink] = useState("/learn");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = (k: Kind, l: BroadcastLang) => { const n = text[k][l].trim().length; return n === 0 ? t("bc.required") : n > MAX[k] ? t("bc.tooLong", { max: MAX[k] }) : undefined; };
  const noOrg = aud === "org" && !orgs.some((o) => o.id === orgId);
  const valid = !noOrg && (["title", "body"] as const).every((k) => !problem(k, "en") && !problem(k, "ar"));
  const audience = (): BroadcastAudience => (aud === "org" ? { type: "org", orgId } : aud === "role" ? { type: "role", role } : { type: "all" });

  const send = async () => {
    setTried(true); setResult(null);
    if (!valid || !confirm(t("bc.confirm", { audience: isolate(audienceText(audience())) }))) return;
    setBusy(true);
    try {
      const trim = (o: Record<BroadcastLang, string>) => ({ en: o.en.trim(), ar: o.ar.trim() });
      const { results } = await api.sendBroadcast({ title: trim(text.title), body: trim(text.body), link, audience: audience() });
      const failed = (["en", "ar"] as const).filter((l) => !results?.[l]);
      if (failed.length === 2) setResult({ ok: false, text: t("bc.failed") });
      else {
        setResult(failed.length ? { ok: false, text: t("bc.sentPartial", { lang: t(failed[0] === "en" ? "bc.langEn" : "bc.langAr") }) } : { ok: true, text: t("bc.sent") });
        setText(BLANK); setTried(false); onSent();
      }
    } catch (e) { setResult({ ok: false, text: (e as Error).message || t("bc.failed") }); }
    finally { setBusy(false); }
  };

  const field = (k: Kind, l: BroadcastLang) => {
    const id = `bc-${k}-${l}`, value = text[k][l], error = tried ? problem(k, l) : undefined, count = t("bc.count", { n: value.length, max: MAX[k] });
    const props = { dir: l === "ar" ? "rtl" as const : "ltr" as const, lang: l, maxLength: MAX[k], value, onChange: (e: { target: { value: string } }) => setText((x) => ({ ...x, [k]: { ...x[k], [l]: e.target.value } })) };
    if (k === "title") return <TextField key={id} label={t(LABEL[k][l])} hint={count} error={error} {...props} />;
    return (
      <div key={id} className={error ? "dr-field has-error" : "dr-field"}>
        <label htmlFor={id} className="dr-field-label">{t(LABEL[k][l])}</label>
        <textarea id={id} className="dr-field-input" rows={3} aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`} {...props} />
        <span id={`${id}-hint`} className="dr-field-hint">{error ?? count}</span>
      </div>
    );
  };

  return (
    <section className="panel stack" aria-labelledby="bc-h">
      <h3 id="bc-h">{t("bc.title")}</h3>
      <p className="muted small">{t("bc.intro")}</p>
      <div className="form-grid">{field("title", "en")}{field("title", "ar")}{field("body", "en")}{field("body", "ar")}</div>
      <div className="form-grid">
        <div className="dr-field">
          <label htmlFor="bc-aud" className="dr-field-label">{t("bc.audience")}</label>
          <select id="bc-aud" className="dr-field-input" value={aud} onChange={(e) => setAud(e.target.value as AudienceType)}>
            <option value="all">{t("bc.all")}</option><option value="org">{t("bc.org")}</option><option value="role">{t("bc.role")}</option>
          </select>
        </div>
        {aud === "org" && (
          <div className={tried && noOrg ? "dr-field has-error" : "dr-field"}>
            <label htmlFor="bc-org" className="dr-field-label">{t("bc.pickOrg")}</label>
            <select id="bc-org" className="dr-field-input" value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-invalid={tried && noOrg ? true : undefined}>
              <option value="">{t("bc.chooseOrg")}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {tried && noOrg && <span className="dr-field-hint">{t("bc.chooseOrg")}</span>}
          </div>
        )}
        {aud === "role" && (
          <div className="dr-field">
            <label htmlFor="bc-role" className="dr-field-label">{t("bc.pickRole")}</label>
            <select id="bc-role" className="dr-field-input" value={role} onChange={(e) => setRole(e.target.value as AudienceRole)}>
              {ROLES.map((r) => <option key={r.role} value={r.role}>{t(r.key)}</option>)}
            </select>
          </div>
        )}
        <div className="dr-field">
          <label htmlFor="bc-link" className="dr-field-label">{t("bc.link")}</label>
          <select id="bc-link" className="dr-field-input" value={link} onChange={(e) => setLink(e.target.value)}>
            {LINKS.map((l) => <option key={l.path} value={l.path}>{`${t(l.key)} (${isolate(l.path)})`}</option>)}
          </select>
        </div>
      </div>
      <Button icon="share" loading={busy} onClick={() => { void send(); }}>{t("bc.send")}</Button>
      {result && <p className={result.ok ? "notice ok" : "notice err"} role={result.ok ? "status" : "alert"}>{result.text}</p>}
    </section>
  );
}

/** The last 20 sends, newest first: title (in the screen's language), audience and date. */
function RecentAnnouncements({ list, error, orgs }: { list?: Broadcast[]; error?: Error; orgs: Org[] }) {
  const { t, lang } = useI18n();
  const ot = useOrgText();
  const audienceText = useAudienceText(orgs);
  return (
    <section className="panel stack" aria-labelledby="bc-recent-h">
      <h3 id="bc-recent-h">{t("bc.recent")}</h3>
      {error ? <p className="muted small">{error.message}</p> : !list ? <div className="loading" aria-busy="true" /> : list.length === 0 ? <p className="muted">{t("bc.none")}</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t("bc.colTitle")}</th><th>{t("bc.colAudience")}</th><th>{t("bc.colDate")}</th></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.id}>
                <td data-label={t("bc.colTitle")}><strong><bdi>{b.title?.[lang as BroadcastLang] || b.title?.en || "—"}</bdi></strong></td>
                <td data-label={t("bc.colAudience")}><bdi>{audienceText(b.audience)}</bdi></td>
                <td data-label={t("bc.colDate")}>{ot.date(b.sentAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
