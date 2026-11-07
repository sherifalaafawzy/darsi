import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@darsi/design-system";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { useI18n } from "../i18n";
import { useAsync } from "../content/load";
import { useNames } from "./data";
import "./strings";

/**
 * /super's records for platform admins: the audit log (every privileged change the functions made: roles,
 * organizations, courses, Super and credits, refunds; functions/src/admin.ts audit) and the payments ledger
 * (billing.recordPayment). The rules let only platform admins read either. Nothing is read until a list is opened,
 * then 50 at a time, newest first, once (no listeners).
 */
const PAGE = 50;
type Row = Record<string, unknown> & { id: string; at?: { seconds: number } | null };
const readNewest = (name: "audit" | "payments", max: number) => async () =>
  (await getDocs(query(collection(db, name), orderBy("at", "desc"), limit(max)))).docs.map((d) => ({ ...d.data(), id: d.id }) as Row);
/** Account ids (Firebase Auth's) among the values: who acted and whom it was for, named from their profiles. */
const isUid = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9]{20,40}$/.test(x);

export function Ledger() {
  const { t } = useI18n();
  const [open, setOpen] = useState<"" | "audit" | "payments">("");
  const show = (k: "audit" | "payments") => setOpen(open === k ? "" : k);
  return (
    <section className="panel stack" aria-labelledby="led-h">
      <h3 id="led-h">{t("led.title")}</h3>
      <p className="muted small">{t("led.hint")}</p>
      <div className="row-gap" role="group" aria-label={t("led.title")}>
        <Button size="sm" variant={open === "audit" ? "primary" : "secondary"} aria-pressed={open === "audit"} onClick={() => show("audit")}>{t("led.audit")}</Button>
        <Button size="sm" variant={open === "payments" ? "primary" : "secondary"} aria-pressed={open === "payments"} onClick={() => show("payments")}>{t("led.payments")}</Button>
      </div>
      {open && <Records key={open} kind={open} />}
    </section>
  );
}

function Records({ kind }: { kind: "audit" | "payments" }) {
  const { t, locale, num } = useI18n();
  const [max, setMax] = useState(PAGE);
  const rows = useAsync(readNewest(kind, max), [kind, max]);
  const list = rows.data ?? [];
  const uids = useMemo(() => [...new Set(list.flatMap((r) => [r.by, r.uid].filter(isUid)))].sort(), [list]);
  const names = useNames(uids);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const who = (x: unknown) => (isUid(x) ? <Link className="person-link" to={`/super/people/${x}`}><bdi>{names.data?.[x] || x}</bdi></Link> : <code dir="ltr">{String(x ?? "—")}</code>);
  const date = (r: Row) => (r.at?.seconds ? when.format(new Date(r.at.seconds * 1000)) : "—");
  if (rows.error) return <p className="notice err" role="alert">{rows.error.message}</p>;
  if (!rows.data) return <div className="loading" aria-busy="true" />;
  if (!list.length) return <p className="muted">{t("led.none")}</p>;
  return (
    <div className="stack">
      <div className="table-wrap"><table className="data-table or-wide">
        {kind === "audit" ? <>
          <thead><tr><th>{t("led.when")}</th><th>{t("led.who")}</th><th>{t("led.what")}</th><th>{t("led.details")}</th></tr></thead>
          <tbody>{list.map((r) => {
            const { id: _id, at: _at, action, by, ...rest } = r;
            return (
              <tr key={r.id}>
                <td data-label={t("led.when")}>{date(r)}</td>
                <td data-label={t("led.who")}>{who(by)}</td>
                <td data-label={t("led.what")}><code dir="ltr">{String(action ?? "")}</code></td>
                <td data-label={t("led.details")}><code dir="ltr" className="small">{Object.entries(rest).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ") || "—"}</code></td>
              </tr>
            );
          })}</tbody>
        </> : <>
          <thead><tr><th>{t("led.when")}</th><th>{t("led.who")}</th><th>{t("led.what")}</th><th className="num">{t("led.amount")}</th><th>{t("led.status")}</th></tr></thead>
          <tbody>{list.map((r) => {
            const amount = typeof r.amount === "number" && typeof r.currency === "string"
              ? (() => { try { return new Intl.NumberFormat(locale, { style: "currency", currency: r.currency as string }).format(r.amount as number); } catch { return `${num(r.amount as number)} ${r.currency as string}`; } })() : "—";
            const status = r.status === "paid" || r.status === "refunded" || r.status === "unapplied" ? t(`led.st.${r.status}`) : String(r.status ?? "—");
            return (
              <tr key={r.id}>
                <td data-label={t("led.when")}>{date(r)}</td>
                <td data-label={t("led.who")}>{r.uid ? who(r.uid) : r.orgId ? <Link className="person-link" to={`/super/orgs/${String(r.orgId)}`} state={{ back: "/super" }}><code dir="ltr">{String(r.orgId)}</code></Link> : "—"}</td>
                <td data-label={t("led.what")}><code dir="ltr">{[r.kind, r.plan, r.seats ? `×${String(r.seats)}` : "", r.provider].filter(Boolean).map(String).join(" ")}</code></td>
                <td data-label={t("led.amount")} className="num">{amount}</td>
                <td data-label={t("led.status")}>{status}</td>
              </tr>
            );
          })}</tbody>
        </>}
      </table></div>
      {list.length === max && <div><Button size="sm" variant="secondary" onClick={() => setMax(max + PAGE)}>{t("an.showMore")}</Button></div>}
    </div>
  );
}
