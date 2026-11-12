import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@darsi/design-system";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useI18n, type MessageKey } from "../i18n";
import { useAsync } from "../content/load";
import { ErrorNote, LoadState } from "../staff/LoadState";
import { useNames } from "./data";
import { PAGE, actionLabel, actionWords, detailText, downloadCsv, isUid, usePages } from "./auditLog";
import { k } from "./governanceStrings";
import { LegalAdmin } from "./LegalAdmin";
import { PlatformStatus } from "./PlatformStatus";
import { RetentionAdmin } from "./RetentionAdmin";
import "./strings";

/**
 * /super's records for platform admins, one at a time behind a switch:
 * - the audit log (every privileged change the functions made: functions/src/admin.ts audit), with filters and a CSV;
 * - the payments ledger (billing.recordPayment);
 * - the legal pages (admin/LegalAdmin), the retention periods (admin/RetentionAdmin) and the platform's status
 *   (admin/PlatformStatus).
 * The rules let only platform admins read any of it. Nothing is read until a section is opened, then once (no
 * listeners); the lists come 50 at a time, newest first. The two editors stay mounted, hidden, once opened, so text
 * typed in one survives a look at another section; the lists read again each time they are opened.
 */
type Kind = "audit" | "payments" | "legal" | "retention" | "status";
const KINDS: { id: Kind; label: MessageKey }[] = [
  { id: "audit", label: "led.audit" }, { id: "payments", label: "led.payments" },
  { id: "legal", label: k("gv.led.legal") }, { id: "retention", label: k("gv.led.retention") }, { id: "status", label: k("gv.led.status") },
];
const EDITORS: Kind[] = ["legal", "retention"];
type Row = Record<string, unknown> & { id: string; at?: { seconds: number } | null };
const readNewest = (name: "payments", max: number) => async () =>
  (await getDocs(query(collection(db, name), orderBy("at", "desc"), limit(max)))).docs.map((d) => ({ ...d.data(), id: d.id }) as Row);
const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

export function Ledger() {
  const { t } = useI18n();
  const [open, setOpen] = useState<"" | Kind>("");
  const [kept, setKept] = useState<Kind[]>([]);
  const show = (kind: Kind) => {
    setOpen(open === kind ? "" : kind);
    if (EDITORS.includes(kind) && !kept.includes(kind)) setKept([...kept, kind]);
  };
  return (
    <section className="panel stack" aria-labelledby="led-h">
      <h3 id="led-h">{t("led.title")}</h3>
      <p className="muted small">{t("led.hint")}</p>
      <div className="row-gap" role="group" aria-label={t("led.title")}>
        {KINDS.map((x) => <Button key={x.id} size="sm" variant={open === x.id ? "primary" : "secondary"} aria-pressed={open === x.id} onClick={() => show(x.id)}>{t(x.label)}</Button>)}
      </div>
      {open === "audit" && <AuditLog />}
      {open === "payments" && <Records />}
      {/* Unsaved legal text and someone on their way out: the question is asked in the section, so it is shown again. */}
      {kept.includes("legal") && <div hidden={open !== "legal"}><LegalAdmin onAsk={() => setOpen("legal")} /></div>}
      {/* The same for unsaved periods: without it a hidden section let the tap through (nobody would see its question). */}
      {kept.includes("retention") && <div hidden={open !== "retention"}><RetentionAdmin onAsk={() => setOpen("retention")} /></div>}
      {open === "status" && <PlatformStatus />}
    </section>
  );
}

/** Organizations' names for the ids seen in the log, each read once (a deleted one has none, and shows as its id). */
function useOrgNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const key = ids.join(",");
  useEffect(() => {
    const missing = ids.filter((id) => !asked.current.has(id));
    if (!missing.length) return;
    for (const id of missing) asked.current.add(id);
    // Inside the promise: a path that throws while it is built names nothing, instead of breaking the screen.
    void Promise.all(missing.map((id) => Promise.resolve().then(() => getDoc(doc(db, "orgs", id))).then((d) => [id, String(d.get("name") ?? "")] as const, () => [id, ""] as const)))
      .then((got) => { if (live.current) setNames((n) => ({ ...n, ...Object.fromEntries(got) })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

/**
 * The audit log. The organization filter is part of the query (the audit orgId/at index); action and person have no
 * index, so they filter the entries already read, and "Show more" reads on from the last one (a cursor).
 */
function AuditLog() {
  const { t, locale } = useI18n();
  const [org, setOrg] = useState("");
  const [typed, setTyped] = useState("");
  const [action, setAction] = useState("");
  const [person, setPerson] = useState("");
  const pages = usePages<Row, QueryDocumentSnapshot>(async (cursor) => {
    const parts: QueryConstraint[] = [...(org ? [where("orgId", "==", org)] : []), orderBy("at", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE)];
    const got = await getDocs(query(collection(db, "audit"), ...parts));
    return { rows: got.docs.map((d) => ({ ...d.data(), id: d.id }) as Row), next: got.docs.length === PAGE ? got.docs[got.docs.length - 1] : null };
  }, [org]);
  const list = useMemo(() => pages.q.data ?? [], [pages.q.data]);

  const uids = useMemo(() => [...new Set(list.flatMap((r) => [r.by, r.uid].filter(isUid)))].sort(), [list]);
  const names = useNames(uids);
  // The organizations seen so far, kept while one is chosen: the list then holds only that one's entries.
  const [orgsSeen, setOrgsSeen] = useState<string[]>([]);
  useEffect(() => {
    setOrgsSeen((seen) => {
      const more = [...new Set(list.map((r) => r.orgId).filter((x): x is string => typeof x === "string" && !!x && !seen.includes(x)))];
      return more.length ? [...seen, ...more] : seen;
    });
  }, [list]);
  const orgIds = useMemo(() => [...new Set([...orgsSeen, ...(org ? [org] : [])])], [orgsSeen, org]);
  const orgNames = useOrgNames(orgIds);
  const orgLabel = (id: string) => (has(orgNames, id) && orgNames[id]) || id;
  const label = (uid: string) => (isUid(uid) ? names.data?.[uid] || uid : uid);

  const actions = useMemo(() => [...new Set([...list.map((r) => String(r.action ?? "")).filter(Boolean), ...(action ? [action] : [])])].map((a) => ({ id: a, label: actionLabel(a, t) })).sort((a, b) => a.label.localeCompare(b.label, locale)), [list, action, t, locale]);
  const people = [...new Set([...list.flatMap((r) => [r.by, r.uid]).filter((x): x is string => typeof x === "string" && !!x), ...(person ? [person] : [])])].map((uid) => ({ uid, label: label(uid) })).sort((a, b) => a.label.localeCompare(b.label, locale));
  const shown = list.filter((r) => (!action || r.action === action) && (!person || r.by === person || r.uid === person));
  const pickOrg = (id: string) => { setOrg(id.trim().slice(0, 128)); setTyped(""); };

  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const who = (x: unknown) => (isUid(x) ? <Link className="person-link" to={`/super/people/${x}`}><bdi>{names.data?.[x] || x}</bdi></Link> : <code dir="ltr">{String(x ?? "—")}</code>);
  const date = (r: Row) => (r.at?.seconds ? when.format(new Date(r.at.seconds * 1000)) : "—");
  const csv = () => {
    const head = [t(k("gv.csv.when")), t(k("gv.csv.who")), t(k("gv.csv.whoId")), t(k("gv.csv.action")), t(k("gv.csv.actionId")), t(k("gv.csv.org")), t(k("gv.csv.details"))];
    downloadCsv(`darsi-activity${org ? `-${org}` : ""}.csv`, [head, ...shown.map((r) => {
      const { id: _id, at: _at, action: a, by, orgId, ...rest } = r;
      return [r.at?.seconds ? new Date(r.at.seconds * 1000).toISOString() : "", isUid(by) ? names.data?.[by] ?? "" : "", String(by ?? ""), actionLabel(String(a ?? ""), t), String(a ?? ""), String(orgId ?? ""), detailText(rest, Infinity)];
    })]);
  };

  return (
    <div className="stack">
      <div className="table-tools">
        <select aria-label={t(k("gv.log.org"))} value={org} onChange={(e) => pickOrg(e.target.value)}>
          <option value="">{t(k("gv.log.allOrgs"))}</option>
          {orgIds.map((id) => <option key={id} value={id}>{orgLabel(id)}</option>)}
        </select>
        <input type="search" dir="ltr" aria-label={t(k("gv.log.orgId"))} placeholder={t(k("gv.log.orgIdHint"))} maxLength={128} value={typed}
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { e.preventDefault(); pickOrg(typed); } }} />
        <select aria-label={t(k("gv.log.action"))} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">{t(k("gv.log.allActions"))}</option>
          {actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select aria-label={t(k("gv.log.person"))} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">{t(k("gv.log.everyone"))}</option>
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.label}</option>)}
        </select>
        <Button size="sm" variant="ghost" icon="sync" onClick={pages.q.reload}>{t(k("gv.refresh"))}</Button>
        <Button size="sm" variant="secondary" icon="file" disabled={!shown.length} onClick={csv}>{t(k("gv.log.csv"))}</Button>
      </div>
      <p className="muted small">{t(k("gv.log.loadedOnly"))}</p>
      <LoadState q={pages.q} empty={<p className="muted">{org ? t(k("gv.log.noneMatch")) : t("led.none")}</p>}>
        {() => (shown.length ? (
          <>
            <div className="table-wrap"><table className="data-table or-wide">
              <thead><tr><th>{t("led.when")}</th><th>{t("led.who")}</th><th>{t("led.what")}</th><th>{t("led.details")}</th></tr></thead>
              <tbody>{shown.map((r) => {
                const { id: _id, at: _at, action: a, by, ...rest } = r;
                const words = actionWords(String(a ?? ""), t);
                return (
                  <tr key={r.id}>
                    <td data-label={t("led.when")}>{date(r)}</td>
                    <td data-label={t("led.who")}>{who(by)}</td>
                    <td data-label={t("led.what")}>{words ? <span title={String(a)}>{words}</span> : <code dir="ltr">{String(a ?? "")}</code>}</td>
                    <td data-label={t("led.details")}><code dir="ltr" className="small">{detailText(rest) || "—"}</code></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <p className="muted small" role="status">{t(k("gv.log.shown"), { n: shown.length })}</p>
          </>
        ) : <p className="muted">{t(k(pages.hasMore ? "gv.log.noneSoFar" : "gv.log.noneMatch"))}</p>)}
      </LoadState>
      {pages.moreError !== undefined && <ErrorNote error={pages.moreError} />}
      {pages.hasMore && <div><Button size="sm" variant="secondary" loading={pages.moreBusy} onClick={pages.more}>{t(k("gv.log.more"))}</Button></div>}
    </div>
  );
}

/** The payments ledger: the newest 50, and 50 more each time it is asked. */
function Records() {
  const { t, locale, num } = useI18n();
  const [max, setMax] = useState(PAGE);
  const rows = useAsync(readNewest("payments", max), [max]);
  const list = rows.data ?? [];
  const uids = useMemo(() => [...new Set(list.flatMap((r) => [r.by, r.uid].filter(isUid)))].sort(), [list]);
  const names = useNames(uids);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const who = (x: unknown) => (isUid(x) ? <Link className="person-link" to={`/super/people/${x}`}><bdi>{names.data?.[x] || x}</bdi></Link> : <code dir="ltr">{String(x ?? "—")}</code>);
  const date = (r: Row) => (r.at?.seconds ? when.format(new Date(r.at.seconds * 1000)) : "—");
  if (rows.error) return <ErrorNote error={rows.error} reload={rows.retry} />;
  if (!rows.data) return <div className="loading" aria-busy="true" />;
  if (!list.length) return <p className="muted">{t("led.none")}</p>;
  return (
    <div className="stack">
      <div className="table-wrap"><table className="data-table or-wide">
        <thead><tr><th>{t("led.when")}</th><th>{t("led.who")}</th><th>{t("led.what")}</th><th className="num">{t("led.amount")}</th><th>{t("led.status")}</th></tr></thead>
        <tbody>{list.map((r) => {
          const amount = typeof r.amount === "number" && typeof r.currency === "string"
            ? (() => { try { return new Intl.NumberFormat(locale, { style: "currency", currency: r.currency as string }).format(r.amount as number); } catch { return `${num(r.amount as number)} ${r.currency as string}`; } })() : "—";
          const status = r.status === "paid" || r.status === "refunded" || r.status === "unapplied" ? t(`led.st.${r.status}`) : String(r.status ?? "—");
          return (
            <tr key={r.id}>
              <td data-label={t("led.when")}>{date(r)}</td>
              <td data-label={t("led.who")}>{r.uid ? who(r.uid) : r.orgId ? <Link className="person-link" to={`/super/orgs/${String(r.orgId)}`} state={{ back: "/super?tab=records" }}><code dir="ltr">{String(r.orgId)}</code></Link> : "—"}</td>
              <td data-label={t("led.what")}><code dir="ltr">{[r.kind, r.plan, r.seats ? `×${String(r.seats)}` : "", r.provider].filter(Boolean).map(String).join(" ")}</code></td>
              <td data-label={t("led.amount")} className="num">{amount}</td>
              <td data-label={t("led.status")}>{status}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {list.length === max && <div><Button size="sm" variant="secondary" onClick={() => setMax(max + PAGE)}>{t("an.showMore")}</Button></div>}
    </div>
  );
}
