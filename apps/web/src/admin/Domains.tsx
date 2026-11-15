/**
 * Organizations' own web addresses (TECHNICAL.md "Organization sites (custom web addresses)"), in three places:
 * - OrgSitePanel, on /admin (org admins): ask for an address under their own domain by typing it, and see where each
 *   one stands. Nothing else is theirs to do but the two DNS records it shows (an ownership record and a CNAME).
 * - DomainsPage, /super/domains (platform admins), in tabs: the requests to approve or refuse; every address with
 *   each step of its connection, Check now, Darsi's identity and Remove; an address added for an organization
 *   directly (under darsiai.org only they can); and the requests that were refused.
 * - OrgSiteSummary, on /super/orgs/:id: the organization's addresses at a glance, linking to /super/domains.
 * Every change goes through manageSite (functions/src/sites.ts), which connects an approved address by itself; the
 * screens read sites/{host} once, and again after each change.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, Switch, TextField, type IconName } from "@darsi/design-system";
import { api, type SiteAction } from "../auth/api";
import type { Org } from "../auth/types";
import { APPROVED, checkSiteHost, inDarsiZone, STEPS, type DnsRecord, type SiteDoc, type SiteProblem, type SiteStatus, type StepState } from "../content/sites";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { useAllOrgs, useSites } from "./data";
import { reasonOf } from "./refusals";
import { errorText } from "../staff/errors";
import { ErrorNote } from "../staff/LoadState";
import { TabPanel, Tabs, type TabDef } from "./Tabs";
import { lazyRetry } from "../app/AppBoundary";
import "../styles/admin.css";
import "./strings";

/** As functions/src/sites.ts MAX_SITES: addresses an organization may hold, asked for or connected. */
const MAX_SITES = 3;
const PROBLEM: Record<SiteProblem, MessageKey> = { "site-host": "site.rf.host", "site-reserved": "site.rf.reserved", "site-taken": "site.rf.taken" };
const STATUS: Record<SiteStatus, MessageKey> = {
  requested: "site.st.requested", refused: "site.st.refused", connecting: "site.st.connecting", live: "site.st.live", problem: "site.st.problem",
};
const STATE_ICON: Record<StepState, IconName> = { ok: "check", wait: "sync", todo: "info", error: "warning" };
/** Problems first, then what is still connecting, then live; by address within each. */
const ORDER: Record<SiteStatus, number> = { problem: 0, connecting: 1, live: 2, requested: 3, refused: 4 };
const byState = (a: SiteDoc, b: SiteDoc) => ORDER[a.status] - ORDER[b.status] || a.host.localeCompare(b.host);

/** What an admin may paste, as a host: "https://CIS.darsiai.org/learn" is "cis.darsiai.org". */
export const typedHost = (v: string) => v.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
/** Whose DNS an address is in, for "ask whoever manages the DNS of …": learn.school.edu → school.edu. */
const domainOf = (host: string) => { const l = host.split("."); return l.length > 2 ? l.slice(1).join(".") : host; };
/** DNS records still to add (or remove) for an address that isn't live: outside darsiai.org, the organization's. */
const needsDns = (s: SiteDoc) => !inDarsiZone(s.host) && s.status !== "live" && Boolean(s.records?.length);

/**
 * Why manageSite refused, in words. An address that is another organization's is one sentence whichever check found it:
 * `site-taken`, and `not-yours` from a server that still says so (admin/refusals.ts words that code for accounts:
 * "…the organization that manages the account", which is not what happened to an address). Anything else through
 * staff/errors.ts, so a failure with no refusal code is a sentence in the admin's language, never the SDK's English.
 * It logs the raw error: call it where the failure is caught, not while rendering.
 */
export function siteRefusal(e: unknown, t: (key: MessageKey) => string): string {
  const reason = reasonOf(e);
  return reason === "site-taken" || reason === "not-yours" ? t("site.rf.taken") : errorText(e, t);
}

type Msg = { ok: boolean; text: string; list?: string[] } | null;
/** Runs one manageSite action at a time, keeping which one is busy and what to tell the admin. */
function useActions(reload: () => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (key: string, a: SiteAction, done?: (r: Awaited<ReturnType<typeof api.manageSite>>) => Msg) => {
    setBusy(key); setMsg(null);
    try { const r = await api.manageSite(a); setMsg(done?.(r) ?? null); reload(); return r; }
    catch (e) { setMsg({ ok: false, text: siteRefusal(e, t) }); return null; }
    finally { setBusy(null); }
  };
  return { busy, msg, setMsg, run };
}

function useWhen() {
  const { locale } = useI18n();
  return (ms: number | null | undefined) => (ms ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ms) : "—");
}

function StatusPill({ status }: { status: SiteStatus }) {
  const { t } = useI18n();
  return <span className={`pill site-pill site-pill-${status}`}>{t(STATUS[status])}</span>;
}

function HostTitle({ s }: { s: SiteDoc }) {
  return (
    <header className="site-head">
      {s.status === "live"
        ? <a href={`https://${s.host}`} target="_blank" rel="noreferrer noopener" dir="ltr">{s.host}</a>
        : <strong dir="ltr">{s.host}</strong>}
      <StatusPill status={s.status} />
    </header>
  );
}

/** Each step of the connection: done, waiting, not started or failed. */
function Steps({ s }: { s: SiteDoc }) {
  const { t } = useI18n();
  return (
    <ul className="site-steps" aria-label={t("site.steps")}>
      {STEPS.map((k) => {
        const state = s.steps?.[k] ?? "todo";
        return (
          <li key={k} data-state={state}>
            <Icon name={STATE_ICON[state]} size={20} />
            <span>{t(`site.step.${k}` as MessageKey)}</span>
            <b>{t(`site.state.${state}` as MessageKey)}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** The DNS records an address's owner must add (or remove), as Hosting asks for them, each value with a Copy button. */
function DnsChanges({ records }: { records: DnsRecord[] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<number | null>(null);
  const copy = (i: number, v: string) => navigator.clipboard?.writeText(v).then(() => { setCopied(i); setTimeout(() => setCopied(null), 2000); }, () => {});
  return (
    <div className="stack-sm" role="group" aria-label={t("site.dns.title")}>
      {records.map((r, i) => (
        <dl key={i} className="site-dns">
          <dt>{t("site.dns.type")}</dt><dd><span className="pill">{t(r.action === "add" ? "site.dns.add" : "site.dns.remove")}</span> <code dir="ltr">{r.type}</code></dd>
          <dt>{t("site.dns.name")}</dt><dd><code dir="ltr">{r.name}</code></dd>
          <dt>{t("site.dns.value")}</dt>
          <dd><code dir="ltr">{r.value}</code> <Button size="sm" variant="ghost" icon={copied === i ? "check" : "file"} onClick={() => void copy(i, r.value)}>{t(copied === i ? "site.copied" : "site.copy")}</Button></dd>
        </dl>
      ))}
    </div>
  );
}

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={msg.ok ? "notice ok" : "notice err"} role="status">
      <p>{msg.text}</p>
      {msg.list?.length ? <ul dir="ltr">{msg.list.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
    </div>
  );
}

/* ---------- Org admins: /admin ---------- */

/** Asking for an address and seeing where it stands, on the organization's admin page. */
export function OrgSitePanel({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const q = useSites(orgId);
  const { busy, msg, setMsg, run } = useActions(q.reload);
  const [host, setHost] = useState("");
  const list = [...(q.data ?? [])].sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0));
  const held = list.filter((s) => s.status !== "refused").length;
  const ask = () => {
    const checked = checkSiteHost(typedHost(host));
    if ("problem" in checked) { setMsg({ ok: false, text: t(PROBLEM[checked.problem]) }); return; }
    if (!checked.host) return;
    if (inDarsiZone(checked.host)) { setMsg({ ok: false, text: t("site.rf.zone") }); return; }
    void run("ask", { action: "request", host: checked.host }, () => { setHost(""); return { ok: true, text: t("site.asked") }; });
  };
  return (
    <section className="panel stack" aria-labelledby="site-h">
      <h3 id="site-h">{t("site.title")}</h3>
      <p className="muted small">{t("site.askHint")}</p>
      {q.error && <ErrorNote error={q.error} />}
      {q.loading && <p className="muted small" aria-busy="true">…</p>}
      {q.data && !list.length && <p className="small">{t("site.none")}</p>}
      {list.map((s) => <OrgSiteCard key={s.host} s={s} busy={busy} run={run} />)}
      {q.data && (held < MAX_SITES ? (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <TextField label={t("site.host")} hint={t("site.hostHint")} value={host} dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="learn.yourschool.edu" maxLength={260} onChange={(e) => { setHost(e.target.value); setMsg(null); }} />
          <div><Button type="submit" loading={busy === "ask"} disabled={!typedHost(host) || Boolean(busy)}>{t("site.ask")}</Button></div>
        </form>
      ) : <p className="muted small">{t("site.full", { n: MAX_SITES })}</p>)}
      <Notice msg={msg} />
    </section>
  );
}

type Run = ReturnType<typeof useActions>["run"];
function OrgSiteCard({ s, busy, run }: { s: SiteDoc; busy: string | null; run: Run }) {
  const { t } = useI18n();
  const when = useWhen();
  const key = (a: string) => `${a}:${s.host}`;
  return (
    <article className="site-card stack-sm">
      <HostTitle s={s} />
      {s.status === "requested" && <>
        {needsDns(s) ? <><p className="small">{t("site.waitDns", { domain: isolate(domainOf(s.host)) })}</p><DnsChanges records={s.records!} /></>
          : <p className="small">{t("site.waitHint")}</p>}
        <div><Button size="sm" variant="ghost" loading={busy === key("cancel")} disabled={Boolean(busy)} onClick={() => void run(key("cancel"), { action: "cancel", host: s.host })}>{t("site.takeBack")}</Button></div>
      </>}
      {s.status === "refused" && <>
        {s.refusedReason && <p className="small">{t("site.refusedWhy", { reason: isolate(s.refusedReason) })}</p>}
        <div><Button size="sm" variant="ghost" loading={busy === key("cancel")} disabled={Boolean(busy)} onClick={() => void run(key("cancel"), { action: "cancel", host: s.host })}>{t("site.dismiss")}</Button></div>
      </>}
      {s.status === "live" && <p className="small">{t("site.liveSince", { date: when(s.liveAt) })}</p>}
      {(s.status === "connecting" || s.status === "problem") && <>
        {s.status === "problem" ? <p className="small">{t("site.problemHint")}</p>
          : needsDns(s) ? <p className="small">{t("site.dnsHint", { domain: isolate(domainOf(s.host)) })}</p>
          : <p className="small">{t("site.zoneHint")}</p>}
        {needsDns(s) && <DnsChanges records={s.records!} />}
        <Steps s={s} />
        <p className="muted small">{t("site.checked", { when: when(s.checkedAt) })}</p>
        <div><Button size="sm" variant="secondary" icon="sync" loading={busy === key("check")} disabled={Boolean(busy)} onClick={() => void run(key("check"), { action: "check", host: s.host })}>{t("site.check")}</Button></div>
      </>}
    </article>
  );
}

/* ---------- Platform admins: /super/domains ---------- */

/** Schools asking to be listed in the school finder (admin/SsoSetup.tsx): its own chunk, loaded when that tab opens. */
const SsoListings = lazyRetry(() => import("./SsoSetup").then((m) => ({ default: m.SsoListings })));
/** The "School sign-in" tab: the organizations are read here, only once it is opened (each is then asked about its request). */
function SsoListingsTab() {
  const orgs = useAllOrgs();
  if (orgs.error) return <ErrorNote error={orgs.error} />;
  if (!orgs.data) return <div className="loading" aria-busy="true" />;
  return <Suspense fallback={<div className="loading" aria-busy="true" />}><SsoListings orgs={orgs.data} /></Suspense>;
}

/**
 * Tabs under what every one of them needs (two sentences of what the page is for, with how a connection works behind
 * "How it works", and what the last action did: approving moves an address from Requests to Addresses, so "approved,
 * now connecting" has to stay in view). Read again is at the end of the tab row (admin/Tabs.tsx `action`). sites is
 * read once for the page, since every tab and its count come from it; the organizations are read only when Add is opened.
 */
export function DomainsPage() {
  const { t } = useI18n();
  const q = useSites();
  const [params, setParams] = useSearchParams();
  const { busy, msg, setMsg, run } = useActions(q.reload);
  const all = q.data ?? [];
  const requests = all.filter((s) => s.status === "requested").sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0));
  const approved = all.filter((s) => APPROVED.includes(s.status)).sort(byState);
  const refused = all.filter((s) => s.status === "refused").sort(byState);
  const approvedMsg = (r: { site: SiteDoc | null }) => (r.site ? { ok: r.site.status !== "problem", text: t("site.approved", { host: isolate(r.site.host), status: t(STATUS[r.site.status]) }) } : null);
  // Where the page opens: what waits for an answer, else the list. Decided once, when the list is first read: the
  // default tab is the one with no ?tab=, so deciding again after the last request is approved would move the admin
  // to Addresses under their hands.
  const start = useRef<"requests" | "addresses" | null>(null);
  if (q.data && !start.current) start.current = requests.length ? "requests" : "addresses";
  // ?tab=refused with nothing refused (the last one was just dismissed, or an old link): the default tab shows, and the
  // parameter is taken out of the address. Left there, the next refusal would bring the tab back and move the admin to it.
  const gone = Boolean(q.data) && params.get("tab") === "refused" && !refused.length;
  useEffect(() => {
    if (gone) setParams((p) => { const next = new URLSearchParams(p); next.delete("tab"); return next; }, { replace: true });
  }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps
  // ?org=<id> is the link on an organization's page (OrgSiteSummary): the Add form, with that organization chosen.
  const preset = params.get("org") ?? "";
  const tabs: TabDef[] = [
    { id: "requests", label: t("tabs.requests"), badge: requests.length },
    { id: "addresses", label: t("tabs.addresses"), badge: approved.length },
    { id: "add", label: t("tabs.addAddress") },
    { id: "refused", label: t("tabs.refused"), badge: refused.length, hidden: !refused.length },
    // School sign-in's listing requests: the school finder on darsiai.org names only what a platform admin approved.
    { id: "sso", label: t("tabs.ssoListings") },
  ];
  // Nothing is read live: this reads the addresses again, whichever tab is open.
  const again = <Button size="sm" variant="ghost" icon="sync" title={t("site.refresh")} onClick={() => { setMsg(null); q.reload(); }}>{t("site.refresh")}</Button>;
  return (
    <>
      <AppBar title={t("nav.domains")} />
      <main className="screen wide stack-lg">
        <div className="stack-sm">
          <p className="muted">{t("site.intro")}</p>
          {/* The rest of what the page used to open with (90 words above the tabs), for whoever wants it. The summary
              borrows the look of the problem reports' "More details": a full-height row, bold, a pointer. */}
          <details>
            <summary className="bug-report-more row-gap"><Icon name="info" size={20} />{t("site.how")}</summary>
            <ul className="small">{(["site.how1", "site.how2", "site.how3", "site.how4"] as const).map((key) => <li key={key}>{t(key)}</li>)}</ul>
          </details>
        </div>
        <Notice msg={msg} />
        {q.error && <ErrorNote error={q.error} />}
        {/* Nothing was read: the way to try again stands alone. Once there are tabs it is at the end of their row. */}
        {!q.data && q.error ? <div className="row-gap">{again}</div> : null}
        {!q.data && !q.error && <div className="loading" aria-busy="true" />}
        {q.data && (
          <Tabs label={t("tabs.sections")} tabs={tabs} defaultTab={preset ? "add" : start.current ?? undefined} action={again}>
            {/* Kept while another tab shows: a reason being typed for a refusal stays. */}
            <TabPanel id="requests">
              <section className="stack" aria-labelledby="site-wait-h">
                <h2 id="site-wait-h">{t("site.waiting", { n: requests.length })}</h2>
                {requests.length ? requests.map((s) => <RequestCard key={s.host} s={s} busy={busy} run={run} approvedMsg={approvedMsg} />)
                  : <p className="muted">{t("site.noRequests")}</p>}
              </section>
            </TabPanel>
            {/* Not kept: the longest list here, drawn from what the page already read, and a "Remove it?" left open
                shouldn't wait behind another tab. */}
            <TabPanel id="addresses" keep={false}>
              <section className="stack" aria-labelledby="site-list-h">
                <h2 id="site-list-h">{t("site.list", { n: approved.length })}</h2>
                {approved.length ? approved.map((s) => <SiteCard key={s.host} s={s} busy={busy} run={run} />) : <EmptyState icon="globe" title={t("site.noneYet")} />}
              </section>
            </TabPanel>
            <TabPanel id="add"><AddPanel preset={preset} busy={busy} run={run} approvedMsg={approvedMsg} /></TabPanel>
            <TabPanel id="refused" keep={false}>
              <section className="stack" aria-labelledby="site-refused-h">
                <h2 id="site-refused-h">{t("site.refusedList", { n: refused.length })}</h2>
                {refused.map((s) => <RefusedCard key={s.host} s={s} busy={busy} run={run} />)}
              </section>
            </TabPanel>
            <TabPanel id="sso"><SsoListingsTab /></TabPanel>
          </Tabs>
        )}
      </main>
    </>
  );
}

type Approved = (r: { site: SiteDoc | null }) => Msg;
function OrgLine({ s }: { s: SiteDoc }) {
  return <p className="small"><Link className="person-link" to={`/super/orgs/${s.orgId}`}><bdi>{s.orgName}</bdi></Link></p>;
}

function RequestCard({ s, busy, run, approvedMsg }: { s: SiteDoc; busy: string | null; run: Run; approvedMsg: Approved }) {
  const { t } = useI18n();
  const when = useWhen();
  const [darsi, setDarsi] = useState(true);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const key = (a: string) => `${a}:${s.host}`;
  return (
    <article className="panel stack">
      <HostTitle s={s} />
      <OrgLine s={s} />
      <p className="muted small">{t("site.askedOn", { when: when(s.requestedAt) })}</p>
      <p className="small">{t("site.approveHint")}</p>
      <Switch label={t("site.darsi")} description={t(darsi ? "site.darsiOn" : "site.darsiOff")} checked={darsi} onChange={setDarsi} />
      <div className="row-gap">
        <Button loading={busy === key("approve")} disabled={Boolean(busy)} onClick={() => void run(key("approve"), { action: "approve", host: s.host, darsi }, approvedMsg)}>{t("site.approve")}</Button>
        {!refusing && <Button variant="ghost" icon="close" disabled={Boolean(busy)} onClick={() => setRefusing(true)}>{t("site.refuse")}</Button>}
      </div>
      {refusing && (
        <div className="notice stack-sm" role="group" aria-label={t("site.refuse")}>
          <TextField label={t("site.refuseReason")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="row-gap">
            <Button variant="secondary" loading={busy === key("refuse")} disabled={Boolean(busy)}
              onClick={() => void run(key("refuse"), { action: "refuse", host: s.host, reason: reason.trim() || undefined }, () => ({ ok: true, text: t("site.refused") }))}>{t("site.refuseYes")}</Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setRefusing(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </article>
  );
}

/** The Add tab. Every organization is read here, not in the page: only this form's list needs them, and only once the tab is opened. */
function AddPanel(p: { preset: string; busy: string | null; run: Run; approvedMsg: Approved }) {
  const orgs = useAllOrgs();
  return (
    <>
      {orgs.error && <ErrorNote error={orgs.error} />}
      <AddSite orgs={(orgs.data ?? []).filter((o) => o.status === "active")} {...p} />
    </>
  );
}

function AddSite({ orgs, preset, busy, run, approvedMsg }: { orgs: Org[]; preset: string; busy: string | null; run: Run; approvedMsg: Approved }) {
  const { t } = useI18n();
  const [orgId, setOrgId] = useState(preset);
  const [host, setHost] = useState("");
  const [darsi, setDarsi] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const checked = checkSiteHost(typedHost(host));
    if ("problem" in checked) { setProblem(t(PROBLEM[checked.problem])); return; }
    if (!checked.host || !orgId) return;
    void run("add", { action: "approve", host: checked.host, orgId, darsi }, (r) => { setHost(""); return approvedMsg(r); });
  };
  return (
    <section className="panel stack" aria-labelledby="site-add-h">
      <h2 id="site-add-h">{t("site.add")}</h2>
      <p className="muted small">{t("site.addHint")}</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="site-select">{t("site.org")}
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">{t("site.pickOrg")}</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <TextField label={t("site.host")} hint={t("site.hostHint")} error={problem ?? undefined} value={host} dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="learn.yourschool.edu" maxLength={260} onChange={(e) => { setHost(e.target.value); setProblem(null); }} />
        <Switch label={t("site.darsi")} description={t(darsi ? "site.darsiOn" : "site.darsiOff")} checked={darsi} onChange={setDarsi} />
        <div><Button type="submit" loading={busy === "add"} disabled={!orgId || !typedHost(host) || Boolean(busy)}>{t("site.addGo")}</Button></div>
      </form>
    </section>
  );
}

function SiteCard({ s, busy, run }: { s: SiteDoc; busy: string | null; run: Run }) {
  const { t } = useI18n();
  const when = useWhen();
  const [confirm, setConfirm] = useState(false);
  const key = (a: string) => `${a}:${s.host}`;
  const zone = inDarsiZone(s.host);
  const records = s.status !== "live" && s.records?.length ? s.records : null;
  return (
    <article className="panel stack">
      <HostTitle s={s} />
      <OrgLine s={s} />
      <Steps s={s} />
      {records && <><p className="small">{t(zone ? "site.zoneWait" : "site.orgSees")}</p><DnsChanges records={records} /></>}
      {s.issues?.length ? <div className="small"><b>{t("site.issues")}</b><ul dir="ltr">{s.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
      {s.error && <div className="small"><b>{t("site.error")}</b><pre className="bug-report-json" dir="ltr">{s.error}</pre></div>}
      <p className="muted small">{s.status === "live" ? `${t("site.liveSince", { date: when(s.liveAt) })} ` : ""}{t("site.checked", { when: when(s.checkedAt) })}</p>
      <Switch label={t("site.darsi")} description={t(s.darsi ? "site.darsiOn" : "site.darsiOff")} checked={s.darsi}
        onChange={(darsi) => { if (!busy) void run(key("identity"), { action: "identity", host: s.host, darsi }, () => ({ ok: true, text: t("site.identitySaved") })); }} />
      <div className="row-gap">
        <Button size="sm" variant="secondary" icon="sync" loading={busy === key("check")} disabled={Boolean(busy)} onClick={() => void run(key("check"), { action: "check", host: s.host })}>{t("site.check")}</Button>
        {!confirm && <Button size="sm" variant="ghost" icon="close" disabled={Boolean(busy)} onClick={() => setConfirm(true)}>{t("site.remove")}</Button>}
      </div>
      {confirm && (
        <div className="notice stack-sm" role="group" aria-label={t("site.remove")}>
          <p>{t("site.removeConfirm", { host: isolate(s.host) })}</p>
          <div className="row-gap">
            <Button variant="secondary" loading={busy === key("remove")} disabled={Boolean(busy)}
              onClick={() => void run(key("remove"), { action: "remove", host: s.host }, (r) => (r.warnings?.length
                ? { ok: false, text: t("site.removedWarn", { host: isolate(s.host) }), list: r.warnings }
                : { ok: true, text: t("site.removed", { host: isolate(s.host) }) }))}>{t("site.removeYes")}</Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </article>
  );
}

function RefusedCard({ s, busy, run }: { s: SiteDoc; busy: string | null; run: Run }) {
  const { t } = useI18n();
  const key = `cancel:${s.host}`;
  return (
    <article className="panel stack-sm">
      <HostTitle s={s} />
      <OrgLine s={s} />
      {s.refusedReason && <p className="small">{t("site.refusedWhy", { reason: isolate(s.refusedReason) })}</p>}
      <div><Button size="sm" variant="ghost" loading={busy === key} disabled={Boolean(busy)} onClick={() => void run(key, { action: "cancel", host: s.host })}>{t("site.dismiss")}</Button></div>
    </article>
  );
}

/* ---------- Platform admins: /super/orgs/:id ---------- */

/** The organization's addresses at a glance, with the way to /super/domains (prefilled with this organization). */
export function OrgSiteSummary({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const q = useSites(orgId);
  const list = [...(q.data ?? [])].sort(byState);
  return (
    <section className="panel stack" aria-labelledby="site-sum-h">
      <h3 id="site-sum-h">{t("site.title")}</h3>
      {q.error && <ErrorNote error={q.error} />}
      {q.data && !list.length && <p className="small">{t("site.none")}</p>}
      {list.map((s) => <HostTitle key={s.host} s={s} />)}
      <div><Link className="dr-btn dr-btn-secondary dr-btn-sm" to={`/super/domains?org=${encodeURIComponent(orgId)}`}><Icon name="globe" size={20} />{t("site.manage")}</Link></div>
    </section>
  );
}

/** For /super: how many addresses wait for approval, with the way there (nothing when none wait). */
export function DomainsWaiting() {
  const { t } = useI18n();
  const q = useSites();
  const n = (q.data ?? []).filter((s) => s.status === "requested").length;
  if (!n) return null;
  return <p className="notice"><Icon name="globe" size={20} /> <Link to="/super/domains">{t("site.pending", { n })}</Link></p>;
}
