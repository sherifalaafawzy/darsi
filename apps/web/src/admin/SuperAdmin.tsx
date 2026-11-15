import { useEffect, useMemo, useState } from "react";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, type BroadcastAudience, type BroadcastLang } from "../auth/api";
import type { Org } from "../auth/types";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { useBroadcasts, useOrgRequest, useOrgsByStatus, usePerson, type Broadcast } from "./data";
import { Ledger } from "./Ledger";
import "../styles/admin.css";
import "./strings";
import { DomainsWaiting } from "./Domains";
import { StaffAlerts } from "./StaffAlerts";
import { Tabs, TabPanel, useTab, type TabDef } from "./Tabs";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote, LoadState } from "../staff/LoadState";
import { LeaveQuestion, useFormGuard } from "./formGuard";
import { k } from "./formsStrings";

/** Display helpers for an organization: localized type, "city، country" and a locale date. */
export function useOrgText() {
  const { t, locale } = useI18n();
  return {
    // The request form's four types, then the two platform admins can also give (OrgsAdmin: company, other).
    type: (o: Org) => (["school", "university", "ministry", "ngo"].includes(o.type) ? t(`type.${o.type}` as "type.school")
      : o.type === "company" || o.type === "other" ? t(`po.t.${o.type}`) : o.type),
    place: (o: Org) => [o.city, o.country].filter(Boolean).join(t("common.sep")) || "—",
    date: (ts?: { seconds: number } | null) => (ts ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ts.seconds * 1000)) : "—"),
  };
}

/**
 * Platform admin: review organization requests, send announcements and see the active organizations, one tab each
 * (`/super`, `?tab=announce`, `?tab=orgs`, `?tab=records`).
 */
export function SuperAdmin() {
  const { t, num } = useI18n();
  const { role } = useAuth();
  const isSuper = role === "superadmin";
  // Both lists are read with the page: the tiles, the Requests count and the composer's audience list need them.
  // Everything else is read by its own tab's component, when that tab is first opened.
  const pendingQ = useOrgsByStatus("pending", isSuper);
  const activeQ = useOrgsByStatus("active", isSuper);
  const pending = pendingQ.data ?? [], active = activeQ.data ?? [];
  const [msg, setMsg] = useState("");
  // A list that could not be read is not an empty one: its tiles show a dash, never 0, and its panel says why with
  // Retry, never "Nothing waiting" (LoadState). Until it is read, "…".
  const tile = <T,>(q: { data?: T; error?: unknown; loading?: boolean }, count: (data: T) => number) => (q.data !== undefined ? num(count(q.data)) : q.loading ? "…" : "—");
  const TABS: TabDef[] = [
    { id: "requests", label: t("tabs.requests"), badge: pending.length },
    { id: "announce", label: t("tabs.announcements") },
    { id: "orgs", label: t("tabs.orgs") },
    { id: "records", label: t("tabs.records"), hidden: !isSuper },
  ];
  const st = useTab(TABS);
  // A half-written announcement lives in its (kept) tab's panel: leaving the page with one asks first, here above the
  // tabs, where it is seen whichever tab is open. Stay opens the announcement again.
  const [draft, setDraft] = useState(false);
  const guard = useFormGuard(draft);

  return (
    <>
      <AppBar title={t("sup.title")} />
      <main className="screen wide stack-lg">
        {/* The active organizations feed three tabs (the tiles, the composer's audience, the table): said once, here. */}
        {activeQ.error !== undefined && !activeQ.data && <ErrorNote error={activeQ.error} reload={activeQ.reload} />}
        {/* Above the tabs: what the last review did is seen whatever tab is open. */}
        {msg && <p className="notice ok" role="status">{msg}</p>}
        <LeaveQuestion guard={guard} title={t(k("fm.ann.leaveTitle"))} body={t(k("fm.ann.leaveBody"))} onStay={() => st.show("announce")} />
        <Tabs label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="requests">
            <StaffAlerts />
            <section className="tiles">
              <div className="tile"><span>{t("sup.pending")}</span><strong>{tile(pendingQ, (d) => d.length)}</strong></div>
              <div className="tile"><span>{t("sup.active")}</span><strong>{tile(activeQ, (d) => d.length)}</strong></div>
              <div className="tile"><span>{t("adm.members")}</span><strong>{tile(activeQ, (d) => d.reduce((a, o) => a + (o.memberCount ?? 0), 0))}</strong></div>
            </section>
            <DomainsWaiting />
            <section className="panel stack">
              <h3>{t("sup.pending")}</h3>
              <LoadState q={pendingQ} empty={<p className="muted">{t("sup.none")}</p>}>
                {(list) => list.map((o) => <OrgRequest key={o.id} org={o} onDone={(m) => { setMsg(m); pendingQ.reload(); activeQ.reload(); }} />)}
              </LoadState>
            </section>
          </TabPanel>
          {/* Kept while another tab shows (the default): a half-written announcement survives a look elsewhere. */}
          <TabPanel id="announce"><Announcements orgs={active} enabled={isSuper} onDraft={setDraft} /></TabPanel>
          <TabPanel id="orgs"><ActiveOrgs active={active} loading={!!activeQ.loading && !activeQ.data} failed={activeQ.error !== undefined && !activeQ.data} /></TabPanel>
          {/* The ledger reads nothing until one of its two lists is opened. */}
          <TabPanel id="records"><Ledger /></TabPanel>
        </Tabs>
      </main>
    </>
  );
}

/** The Announcements tab. The last sends (20 documents) are read here, so only once the tab is first opened. */
function Announcements({ orgs, enabled, onDraft }: { orgs: Org[]; enabled: boolean; /** Whether something is written and not sent (the page asks before leaving). */ onDraft?: (draft: boolean) => void }) {
  const sent = useBroadcasts(enabled);
  return (
    <>
      <Announce orgs={orgs} onSent={sent.reload} onDraft={onDraft} />
      <RecentAnnouncements list={sent.data} error={sent.error} reload={sent.reload} orgs={orgs} />
    </>
  );
}

/** The Organizations tab: the active organizations, with a search that stays as typed while another tab shows. */
function ActiveOrgs({ active, loading, failed }: { active: Org[]; loading: boolean; /** The read failed (the page says why above the tabs): no table, and never "No active organizations yet". */ failed?: boolean }) {
  const { t, num } = useI18n();
  const ot = useOrgText();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active.filter((o) => !s || [o.name, o.country, o.city].some((x) => x?.toLowerCase().includes(s)));
  }, [active, q]);
  return (
    <section className="panel">
      <div className="table-tools">
        <h3>{t("sup.active")}</h3>
        <input type="search" placeholder={t("sup.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("sup.search")} />
      </div>
      {failed ? null : loading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : active.length === 0 ? <EmptyState icon="home" title={t("sup.noActive")} /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t("sup.org")}</th><th>{t("org.type")}</th><th>{t("sup.place")}</th><th className="num">{t("adm.members")}</th><th>{t("sup.since")}</th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td data-cell="main" data-label={t("sup.org")}><strong><bdi>{o.name}</bdi></strong></td>
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
  );
}

/** One pending request: what the requester told us, plus approve or reject (with an optional note they will see). */
function OrgRequest({ org, onDone }: { org: Org; onDone: (msg: string) => void }) {
  const { t, num } = useI18n();
  const ot = useOrgText();
  const { data: by } = usePerson(org.createdBy);
  // The contact and reason are private (orgs/{id}/private/request); older requests kept them on the org document.
  const { data: priv } = useOrgRequest(org.id);
  const contact = priv?.contact || org.contact, reason = priv?.reason || org.reason;
  // Whether the requester had confirmed their email when they asked (requestOrg writes it beside the contact). Shown
  // only when the request's document carries it: nothing is said about older requests.
  const verified = (priv as { emailVerified?: unknown } | undefined)?.emailVerified;
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const review = async (approve: boolean) => {
    setBusy(true); setErr("");
    try {
      await api.reviewOrg({ orgId: org.id, approve, note: approve ? undefined : note.trim() || undefined });
      onDone(t(approve ? "sup.approved" : "sup.rejectedMsg", { org: isolate(org.name) }));
    } catch (e) {
      // reviewOrg's reason: someone reviewed it meanwhile (the lists are read again, so the card goes), or the requester
      // can't be made its admin now.
      const why = String((e as { details?: { reason?: string } }).details?.reason ?? "");
      if (why === "reviewed") { onDone(t("sup.errReviewed", { org: isolate(org.name) })); return; }
      setErr(why === "requester-in-org" ? t("sup.errInOrg") : why === "requester-staff" ? t("sup.errStaff") : errorText(e, t)); setBusy(false);
    }
  };

  return (
    <article className="req">
      <header><strong><bdi>{org.name}</bdi></strong><span className="muted small">{ot.date(org.createdAt)}</span></header>
      <dl className="req-facts">
        <div><dt>{t("org.type")}</dt><dd>{ot.type(org)}</dd></div>
        <div><dt>{t("sup.place")}</dt><dd><bdi>{ot.place(org)}</bdi></dd></div>
        {org.size ? <div><dt>{t("org.size")}</dt><dd>{num(org.size)}</dd></div> : null}
        <div><dt>{t("sup.requestedBy")}</dt><dd>{by ? <><bdi>{by.name}</bdi> <small dir="ltr">{displayLogin(by.email)}</small></> : "—"}
          {typeof verified === "boolean" && <>{" "}<small className={verified ? "muted" : "err-text"}>({t(k(verified ? "fm.req.verified" : "fm.req.unverified"))})</small></>}</dd></div>
        {contact && <div><dt>{t("org.contact")}</dt><dd dir="auto">{contact}</dd></div>}
        {reason && <div className="span2"><dt>{t("org.reason")}</dt><dd dir="auto">{reason}</dd></div>}
      </dl>
      {by?.orgId && by.orgId !== org.id && <p className="notice">{t("sup.inOtherOrg")}</p>}
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

/** Who an announcement goes to, for the question before sending and the recent list. */
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
function Announce({ orgs, onSent, onDraft }: { orgs: Org[]; onSent: () => void; onDraft?: (draft: boolean) => void }) {
  const { t } = useI18n();
  const audienceText = useAudienceText(orgs);
  const [text, setText] = useState(BLANK);
  const [aud, setAud] = useState<AudienceType>("all");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<AudienceRole>("teacher");
  const [link, setLink] = useState("/learn");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Anything typed in one of the four fields is a draft the page must not lose silently.
  const draft = (["title", "body"] as const).some((x) => text[x].en.trim() !== "" || text[x].ar.trim() !== "");
  useEffect(() => { onDraft?.(draft); }, [draft, onDraft]);
  const problem = (k: Kind, l: BroadcastLang) => { const n = text[k][l].trim().length; return n === 0 ? t("bc.required") : n > MAX[k] ? t("bc.tooLong", { max: MAX[k] }) : undefined; };
  const noOrg = aud === "org" && !orgs.some((o) => o.id === orgId);
  const valid = !noOrg && (["title", "body"] as const).every((k) => !problem(k, "en") && !problem(k, "ar"));
  const audience = (): BroadcastAudience => (aud === "org" ? { type: "org", orgId } : aud === "role" ? { type: "role", role } : { type: "all" });

  /** Send: checks the fields, then asks on the page, naming who gets it (a browser confirm() may not show in an installed app). */
  const ask = () => { setTried(true); setResult(null); if (valid) setAsking(true); };
  const send = async () => {
    if (!valid) { setAsking(false); return; } // edited into something that can't be sent while the question was up
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
    } catch (e) { setResult({ ok: false, text: errorText(e, t) }); }
    finally { setBusy(false); setAsking(false); }
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
      {asking && <InlineConfirm title={t(k("fm.ann.sendTitle"), { audience: isolate(audienceText(audience())) })} body={t(k("fm.ann.sendBody"))} confirmLabel={t(k("fm.ann.sendYes"))} busy={busy}
        onConfirm={() => { void send(); }} onCancel={() => setAsking(false)} />}
      {/* The button stays (and stays enabled: pressing it again only asks again, it never sends) while the question is
          up, so Cancel can give the keyboard focus back to it. */}
      <Button icon="share" loading={busy && !asking} onClick={ask}>{t("bc.send")}</Button>
      {result && <p className={result.ok ? "notice ok" : "notice err"} role={result.ok ? "status" : "alert"}>{result.text}</p>}
    </section>
  );
}

/** The last 20 sends, newest first: title (in the screen's language), audience and date. */
function RecentAnnouncements({ list, error, reload, orgs }: { list?: Broadcast[]; error?: Error; reload?: () => void; orgs: Org[] }) {
  const { t, lang } = useI18n();
  const ot = useOrgText();
  const audienceText = useAudienceText(orgs);
  return (
    <section className="panel stack" aria-labelledby="bc-recent-h">
      <h3 id="bc-recent-h">{t("bc.recent")}</h3>
      {error && !list ? <ErrorNote error={error} reload={reload} /> : !list ? <div className="loading" aria-busy="true" /> : list.length === 0 ? <p className="muted">{t("bc.none")}</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t("bc.colTitle")}</th><th>{t("bc.colAudience")}</th><th>{t("bc.colDate")}</th></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.id}>
                <td data-cell="main" data-label={t("bc.colTitle")}><strong><bdi>{b.title?.[lang as BroadcastLang] || b.title?.en || "—"}</bdi></strong></td>
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

// /super/plans loads with this chunk: as a lazy route of its own it split the startup bundle (CLAUDE.md "Keep the startup bundle in one file").
export { PlansPage } from "./Plans";
export { CertificatesPage, ProjectsPage } from "./AllWork";
export { BugsPage } from "./Bugs";
export { FeedbackPage } from "./Feedback";
export { DomainsPage } from "./Domains";
