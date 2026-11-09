/**
 * Organizations' own web addresses (TECHNICAL.md "Organization sites (custom web addresses)"), in three places:
 * - OrgSitePanel, on /admin (org admins): ask for an address by typing it, and see where each one stands. Nothing
 *   else is theirs to do, except the DNS change an address outside darsiai.org needs, which it shows.
 * - DomainsPage, /super/domains (platform admins): the requests to approve or refuse, an address added for an
 *   organization directly, and every address with each step of its connection, Check now, Darsi's identity and Remove.
 * - OrgSiteSummary, on /super/orgs/:id: the organization's addresses at a glance, linking to /super/domains.
 * Every change goes through manageSite (functions/src/sites.ts), which connects an approved address by itself; the
 * screens read sites/{host} once, and again after each change.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, Switch, TextField, type IconName } from "@darsi/design-system";
import { api, type SiteAction } from "../auth/api";
import type { Org } from "../auth/types";
import { APPROVED, checkSiteHost, inDarsiZone, STEPS, type DnsRecord, type SiteDoc, type SiteProblem, type SiteStatus, type StepState } from "../content/sites";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { useAllOrgs, useSites } from "./data";
import { refusalText } from "./refusals";
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
/** A step that still waits on DNS outside darsiai.org: the records to add are the owner's. */
const needsDns = (s: SiteDoc) => !inDarsiZone(s.host) && s.steps?.dns !== "ok" && Boolean(s.records?.length);

type Msg = { ok: boolean; text: string; list?: string[] } | null;
/** Runs one manageSite action at a time, keeping which one is busy and what to tell the admin. */
function useActions(reload: () => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (key: string, a: SiteAction, done?: (r: Awaited<ReturnType<typeof api.manageSite>>) => Msg) => {
    setBusy(key); setMsg(null);
    try { const r = await api.manageSite(a); setMsg(done?.(r) ?? null); reload(); return r; }
    catch (e) { setMsg({ ok: false, text: refusalText(e, t) }); return null; }
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
    void run("ask", { action: "request", host: checked.host }, () => { setHost(""); return { ok: true, text: t("site.asked") }; });
  };
  return (
    <section className="panel stack" aria-labelledby="site-h">
      <h3 id="site-h">{t("site.title")}</h3>
      <p className="muted small">{t("site.askHint")}</p>
      {q.error && <p className="notice err">{refusalText(q.error, t)}</p>}
      {q.loading && <p className="muted small" aria-busy="true">…</p>}
      {q.data && !list.length && <p className="small">{t("site.none")}</p>}
      {list.map((s) => <OrgSiteCard key={s.host} s={s} busy={busy} run={run} />)}
      {q.data && (held < MAX_SITES ? (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <TextField label={t("site.host")} hint={t("site.hostHint")} value={host} dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="yourschool.darsiai.org" maxLength={260} onChange={(e) => { setHost(e.target.value); setMsg(null); }} />
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
        <p className="small">{t("site.waitHint")}</p>
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
        {s.status === "connecting" && needsDns(s) && <DnsChanges records={s.records!} />}
        <Steps s={s} />
        <p className="muted small">{t("site.checked", { when: when(s.checkedAt) })}</p>
        <div><Button size="sm" variant="secondary" icon="sync" loading={busy === key("check")} disabled={Boolean(busy)} onClick={() => void run(key("check"), { action: "check", host: s.host })}>{t("site.check")}</Button></div>
      </>}
    </article>
  );
}

/* ---------- Platform admins: /super/domains ---------- */

export function DomainsPage() {
  const { t } = useI18n();
  const q = useSites();
  const orgs = useAllOrgs();
  const [params] = useSearchParams();
  const { busy, msg, setMsg, run } = useActions(q.reload);
  const all = q.data ?? [];
  const requests = all.filter((s) => s.status === "requested").sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0));
  const approved = all.filter((s) => APPROVED.includes(s.status)).sort(byState);
  const refused = all.filter((s) => s.status === "refused").sort(byState);
  const approvedMsg = (r: { site: SiteDoc | null }) => (r.site ? { ok: r.site.status !== "problem", text: t("site.approved", { host: isolate(r.site.host), status: t(STATUS[r.site.status]) }) } : null);
  return (
    <>
      <AppBar title={t("nav.domains")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("site.intro")}</p>
        <div className="row-gap"><Button size="sm" variant="ghost" icon="sync" onClick={() => { setMsg(null); q.reload(); }}>{t("site.refresh")}</Button></div>
        <Notice msg={msg} />
        {q.error && <p className="notice err">{refusalText(q.error, t)}</p>}
        {!q.data && !q.error && <div className="loading" aria-busy="true" />}
        {q.data && <>
          <section className="stack" aria-labelledby="site-wait-h">
            <h2 id="site-wait-h">{t("site.waiting", { n: requests.length })}</h2>
            {requests.length ? requests.map((s) => <RequestCard key={s.host} s={s} busy={busy} run={run} approvedMsg={approvedMsg} />)
              : <p className="muted">{t("site.noRequests")}</p>}
          </section>
          <AddSite orgs={(orgs.data ?? []).filter((o) => o.status === "active")} preset={params.get("org") ?? ""} busy={busy} run={run} approvedMsg={approvedMsg} />
          <section className="stack" aria-labelledby="site-list-h">
            <h2 id="site-list-h">{t("site.list", { n: approved.length })}</h2>
            {approved.length ? approved.map((s) => <SiteCard key={s.host} s={s} busy={busy} run={run} />) : <EmptyState icon="globe" title={t("site.noneYet")} />}
          </section>
          {refused.length > 0 && (
            <details>
              <summary className="bug-report-more">{t("site.refusedList", { n: refused.length })}</summary>
              <div className="stack">{refused.map((s) => <RefusedCard key={s.host} s={s} busy={busy} run={run} />)}</div>
            </details>
          )}
        </>}
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
          placeholder="school.darsiai.org" maxLength={260} onChange={(e) => { setHost(e.target.value); setProblem(null); }} />
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
  const zoneWait = inDarsiZone(s.host) && s.steps?.dns === "wait";
  return (
    <article className="panel stack">
      <HostTitle s={s} />
      <OrgLine s={s} />
      <Steps s={s} />
      {needsDns(s) && <><p className="small">{t("site.orgSees")}</p><DnsChanges records={s.records!} /></>}
      {zoneWait && <p className="muted small">{t("site.zoneWait")}</p>}
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
      {q.error && <p className="notice err">{refusalText(q.error, t)}</p>}
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
