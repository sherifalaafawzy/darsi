import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { api } from "../auth/api";
import { isolate, useI18n } from "../i18n";
import { ErrorNote, LoadState } from "../staff/LoadState";
import { AUDIT_SINCE, PAGE, actionLabel, actionWords, detailText, downloadCsv, isUid, usePages } from "./auditLog";
import { k } from "./governanceStrings";
import "./strings";

/**
 * An organization's own activity log, for its admins and for platform admins: the privileged changes the functions
 * made in it (roles, passwords, removals, classes, codes, join rules, seats, exports, deletions, suspensions, course
 * access), newest first. Read through the orgAudit callable (functions/src/audit.ts), since the `audit` collection is
 * closed to everyone but platform admins: 50 at a time, the next page from the answer's `next`, once (no listeners).
 * The action and person filters are the callable's own, so they reach the whole log and not only what is on screen.
 * The callable takes the address (ip) out for an organization's admin; nothing here puts one back.
 */
type Entry = Record<string, unknown> & { id: string; action: string; by: string; byName: string; at: number };
/** What the row already says elsewhere (or is the same on every row): left out of the details. */
const SHOWN = new Set(["id", "at", "action", "by", "byName", "orgId"]);
const rest = (e: Entry) => Object.fromEntries(Object.entries(e).filter(([key]) => !SHOWN.has(key)));
const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

export function OrgActivity({ orgId }: { orgId: string }) {
  const { t, locale } = useI18n();
  const id = useId();
  const [filter, setFilter] = useState({ orgId, action: "", uid: "" });
  // Another organization (the platform admin went from one to the next): its own filters, from nothing.
  const f = filter.orgId === orgId ? filter : { orgId, action: "", uid: "" };
  const pages = usePages<Entry, number>(async (before) => {
    const got = await api.orgAudit({ orgId, limit: PAGE, ...(before !== null ? { before } : {}), ...(f.action ? { action: f.action } : {}), ...(f.uid ? { uid: f.uid } : {}) });
    return { rows: got.entries as Entry[], next: got.next };
  }, [orgId, f.action, f.uid]);
  const rows = pages.q.data;

  // The actions and people seen so far in this organization's log. Kept across filters: with "Role changed" chosen
  // the list holds nothing else, and the other choices must not vanish from the menus.
  const [seen, setSeen] = useState<{ orgId: string; actions: string[]; people: Record<string, string> }>({ orgId, actions: [], people: {} });
  useEffect(() => {
    if (!rows) return;
    setSeen((s) => {
      const base = s.orgId === orgId ? s : { orgId, actions: [], people: {} };
      const actions = new Set(base.actions), people = { ...base.people };
      let changed = base !== s;
      for (const e of rows) {
        if (e.action && !actions.has(e.action)) { actions.add(e.action); changed = true; }
        // A name once known stays: a later entry by the same account may come without one (the account was deleted).
        if (e.by && (!has(people, e.by) || (e.byName && people[e.by] !== e.byName))) { people[e.by] = e.byName || people[e.by] || ""; changed = true; }
      }
      return changed ? { orgId, actions: [...actions], people } : s;
    });
  }, [rows, orgId]);
  const known = seen.orgId === orgId ? seen : { orgId, actions: [], people: {} as Record<string, string> };

  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const who = (uid: string, name?: string) => name || (has(known.people, uid) ? known.people[uid] : "") || (isUid(uid) || !uid ? "" : t(k("gv.log.system")));
  const actions = useMemo(() => [...new Set([...known.actions, ...(f.action ? [f.action] : [])])].map((a) => ({ id: a, label: actionLabel(a, t) })).sort((a, b) => a.label.localeCompare(b.label, locale)), [known.actions, f.action, t, locale]);
  // In the menu a job or a webhook also says which one it is: two choices both reading "Darsi (automatic)" can't be told apart.
  const people = [...new Set([...Object.keys(known.people), ...(f.uid ? [f.uid] : [])])].map((uid) => ({ uid, label: (has(known.people, uid) && known.people[uid]) || (isUid(uid) ? uid : `${t(k("gv.log.system"))} (${isolate(uid)})`) })).sort((a, b) => a.label.localeCompare(b.label, locale));
  const filtered = !!(f.action || f.uid);
  const since = AUDIT_SINCE ? t(k("gv.log.since"), { date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(AUDIT_SINCE)) }) : t(k("gv.log.sinceNoDate"));

  const csv = () => {
    const head = [t(k("gv.csv.when")), t(k("gv.csv.who")), t(k("gv.csv.whoId")), t(k("gv.csv.action")), t(k("gv.csv.actionId")), t(k("gv.csv.details"))];
    // What is on the screen and nothing more: the entries as the callable gave them (for an org admin, without `ip`).
    downloadCsv(`darsi-activity-${orgId}.csv`, [head, ...(rows ?? []).map((e) => [new Date(e.at).toISOString(), who(e.by, e.byName), e.by, actionLabel(e.action, t), e.action, detailText(rest(e), Infinity)])]);
  };

  return (
    <section className="panel stack" aria-labelledby={`${id}-h`}>
      <div className="table-tools">
        <h3 id={`${id}-h`}>{t(k("gv.log.title"))}</h3>
        <select aria-label={t(k("gv.log.action"))} value={f.action} onChange={(e) => setFilter({ ...f, action: e.target.value })}>
          <option value="">{t(k("gv.log.allActions"))}</option>
          {actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select aria-label={t(k("gv.log.person"))} value={f.uid} onChange={(e) => setFilter({ ...f, uid: e.target.value })}>
          <option value="">{t(k("gv.log.everyone"))}</option>
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.label}</option>)}
        </select>
        <Button size="sm" variant="ghost" icon="sync" onClick={pages.q.reload}>{t(k("gv.refresh"))}</Button>
        <Button size="sm" variant="secondary" icon="file" disabled={!rows?.length} onClick={csv}>{t(k("gv.log.csv"))}</Button>
      </div>
      <p className="muted small">{t(k("gv.log.intro"))} {since}</p>
      <LoadState q={pages.q} empty={<p className="muted">{t(k(pages.hasMore ? "gv.log.noneSoFar" : filtered ? "gv.log.noneMatch" : "gv.log.none"))}</p>}>
        {(list) => (
          <>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t("led.when")}</th><th>{t("led.who")}</th><th>{t("led.what")}</th><th>{t("led.details")}</th></tr></thead>
              <tbody>{list.map((e) => {
                const name = who(e.by, e.byName), words = actionWords(e.action, t), details = detailText(rest(e));
                return (
                  <tr key={e.id}>
                    <td data-label={t("led.when")}>{when.format(new Date(e.at))}</td>
                    <td data-label={t("led.who")}>{name ? <bdi>{name}</bdi> : <code dir="ltr">{e.by || "—"}</code>}</td>
                    <td data-label={t("led.what")}>{words ? <span title={e.action}>{words}</span> : <code dir="ltr">{e.action}</code>}</td>
                    <td data-label={t("led.details")}>{details ? <code dir="ltr" className="small">{details}</code> : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <p className="muted small" role="status">{t(k("gv.log.shown"), { n: list.length })}</p>
          </>
        )}
      </LoadState>
      {pages.moreError !== undefined && <ErrorNote error={pages.moreError} />}
      {pages.hasMore && <div><Button size="sm" variant="secondary" loading={pages.moreBusy} onClick={pages.more}>{t(k("gv.log.more"))}</Button></div>}
    </section>
  );
}
