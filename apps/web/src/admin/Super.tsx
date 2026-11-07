import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import type { Org, Profile } from "../auth/types";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { useCredits, usePlansConfig, useSubscription } from "./data";
import "../styles/admin.css";
import "./strings";

/**
 * A whole number from a number field, within [min, max], or null while it is empty or out of range. The fields keep
 * what was typed: a cleared field used to read as 0, which took Super back or removed a licence (the buttons now wait).
 */
const whole = (v: string, min: number, max: number) => { const n = Number(v); return v.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null; };

/**
 * Darsi Super for platform admins and org admins (docs/SUPER.md, TECHNICAL.md "Darsi Super"): complimentary Super and
 * credits, organizations' licences and seats. The plans page is ./Plans.
 * Payments themselves only ever come from the payment providers' verified webhooks.
 */
// The server's own words, without a "FirebaseError: " prefix or the SDK's " [400]" (they may contain ": ").
export const message = (e: unknown) => String((e as { message?: string }).message ?? e).replace(/^Firebase(?:Error)?:\s*/, "").replace(/\s*\[\d{3}\]$/, "");
export type Msg = { ok: boolean; text: string } | null;
export const Note = ({ msg }: { msg: Msg }) => (msg ? <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p> : null);

/** A subscription's status and source in words ("renewal cancelled", "given by Darsi"); anything else as stored. */
const STATUS: Record<string, MessageKey> = { active: "sp.st.active", canceled: "sp.st.canceled", past_due: "sp.st.pastDue" };
const SOURCE: Record<string, MessageKey> = { grant: "sp.src.grant", paymob: "sp.src.paymob", stripe: "sp.src.stripe" };

/** On a person's page (platform admins): their Darsi Super, and complimentary days. */
export function SuperGrantPanel({ person, onChanged }: { person: Profile; /** Reads the person again (staff screens read once, no listeners). */ onChanged?: () => void }) {
  const { t, L, locale, num } = useI18n();
  const sub = useSubscription(person.uid);
  const credits = useCredits(person.uid);
  const plans = usePlansConfig();
  const [days, setDays] = useState("30");
  const [extra, setExtra] = useState("100");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const now = Date.now();
  // The subscription just read decides the person's own Super. The profile's copy (planUntil, planSource) is written by
  // a trigger after each change (billing.writeClaims), so right after Give Super or Take back it may still say the
  // opposite ("No Darsi Super." beside an active plan); it still tells an organization's seat.
  const live = sub.data ? sub.data.status !== "expired" && sub.data.currentPeriodEnd > now : false;
  const own = sub.data === undefined ? (person.planSource !== "org" && person.planUntil && person.planUntil > now ? person.planUntil : null) : live ? sub.data!.currentPeriodEnd : null;
  const org = person.planSource === "org" && person.planUntil && person.planUntil > now ? person.planUntil : null;
  const has = own && (!org || own >= org) ? { until: own, source: t("sp.fromOwn") } : org ? { until: org, source: t("sp.fromOrg") } : null;
  const plan = sub.data && plans.data?.plans.find((p) => p.id === sub.data!.plan);
  const word = (map: Record<string, MessageKey>, v: string) => (map[v] ? t(map[v]) : isolate(v));
  const daysN = whole(days, 1, 3660), extraN = whole(extra, 1, 100000);
  // Taking back a paid subscription neither refunds it nor stops the provider charging: the confirmation says so.
  const paidBy = sub.data?.source === "stripe" ? "Stripe" : sub.data?.source === "paymob" ? "Paymob" : null;
  const grant = async (revoke: boolean) => {
    if (!revoke && daysN === null) return;
    setBusy(true); setMsg(null); setAsking(false);
    try {
      await api.grantSuper(revoke ? { uid: person.uid, days: 0, revoke: true } : { uid: person.uid, days: daysN! });
      setMsg({ ok: true, text: revoke ? t("sp.revoked") : t("sp.granted", { days: daysN! }) }); sub.reload(); credits.reload(); onChanged?.();
    } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sg-h"><h3 id="sg-h">{t("sp.superTitle")}</h3>
      <p className="muted">{has ? t("sp.hasSuper", { date: date.format(has.until), source: has.source }) : t("sp.noSuper")}</p>
      {sub.data && <p className="muted small">{t(live ? "sp.subLine" : "sp.subEnded", { plan: isolate(plan ? L(plan.name) : sub.data.plan), status: word(STATUS, sub.data.status), source: word(SOURCE, sub.data.source), date: date.format(sub.data.currentPeriodEnd) })}</p>}
      <div className="row-gap">
        <TextField label={t("sp.days")} type="number" min={1} max={3660} value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        <Button size="sm" loading={busy} disabled={daysN === null} onClick={() => { void grant(false); }}>{t("sp.grant")}</Button>
        {sub.data && sub.data.status !== "expired" && !asking && <Button size="sm" variant="ghost" icon="close" disabled={busy} onClick={() => { setMsg(null); setAsking(true); }}>{t("sp.revoke")}</Button>}
      </div>
      {asking && <div className="notice stack-sm" role="alert">
        <p>{t("sp.revokeConfirm")}{paidBy ? ` ${t("sp.revokePaid", { provider: paidBy })}` : ""}</p>
        <div className="row-gap">
          <Button size="sm" autoFocus loading={busy} onClick={() => { void grant(true); }}>{t("sp.revokeYes")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
        </div>
      </div>}
      <p className="muted small">{t("sp.grantHint")}</p>
      <p className="muted">{t("sp.balance", { plan: num(credits.data && credits.data.planUntil > Date.now() ? credits.data.plan : 0), packs: num(credits.data?.packs ?? 0) })}</p>
      <div className="row-gap">
        <TextField label={t("sp.creditsField")} type="number" min={1} max={100000} value={extra} onChange={(e) => setExtra(e.target.value)} dir="ltr" />
        <Button size="sm" variant="secondary" loading={busy} disabled={extraN === null} onClick={() => { if (extraN === null) return; setBusy(true); setMsg(null); api.grantCredits({ uid: person.uid, credits: extraN }).then(() => { setMsg({ ok: true, text: t("sp.creditsGiven", { n: extraN }) }); credits.reload(); }, (e) => setMsg({ ok: false, text: message(e) })).finally(() => setBusy(false)); }}>{t("sp.giveCredits")}</Button>
      </div>
      <Note msg={msg} />
    </section>
  );
}

/** On a platform admin's org page: the organization's licence (plan, seats, how long). */
export function LicencePanel({ org, onChanged }: { org: Org; /** Reads the organization again. */ onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const plans = usePlansConfig();
  const lic = org.licence && org.licence.until > Date.now() ? org.licence : null;
  const [seats, setSeats] = useState(String(lic?.seats ?? 30)); const [days, setDays] = useState("365"); const [plan, setPlan] = useState(lic?.plan ?? "");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const seatPlans = (plans.data?.plans ?? []).filter((p) => p.kind === "seat");
  const seatsN = whole(seats, 1, 100000), daysN = whole(days, 1, 36600);
  const save = async (remove: boolean) => {
    if (!remove && (seatsN === null || daysN === null)) return;
    setBusy(true); setMsg(null); setAsking(false);
    try {
      await api.setOrgLicence(remove ? { orgId: org.id, seats: 0, remove: true } : { orgId: org.id, seats: seatsN!, days: daysN!, plan: plan || seatPlans[0]?.id });
      setMsg({ ok: true, text: remove ? t("sp.licenceRemoved") : t("sp.licenceSaved") }); onChanged?.();
    } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="lc-h"><h3 id="lc-h">{t("sp.licenceTitle")}</h3>
      <p className="muted">{lic ? t("sp.licenceLine", { seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) }) : t("sp.noLicence")}</p>
      <div className="row-gap">
        {seatPlans.length > 0 && <label className="or-pick"><span>{t("sp.plan")}</span><select value={plan} onChange={(e) => setPlan(e.target.value)}>{seatPlans.map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}</select></label>}
        <TextField label={t("sp.seats")} type="number" min={1} max={100000} value={seats} onChange={(e) => setSeats(e.target.value)} dir="ltr" />
        <TextField label={t("sp.days")} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        <Button size="sm" loading={busy} disabled={seatsN === null || daysN === null} onClick={() => { void save(false); }}>{t("sp.setLicence")}</Button>
        {lic && !asking && <Button size="sm" variant="ghost" icon="close" disabled={busy} onClick={() => { setMsg(null); setAsking(true); }}>{t("sp.removeLicence")}</Button>}
      </div>
      {asking && <div className="notice stack-sm" role="alert">
        <p>{t("sp.removeConfirm")}</p>
        <div className="row-gap">
          <Button size="sm" autoFocus loading={busy} onClick={() => { void save(true); }}>{t("sp.removeYes")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
        </div>
      </div>}
      <p className="muted small">{t("sp.licenceHint")}</p>
      <Note msg={msg} />
    </section>
  );
}

/** Members shown at first, and added by each "Show more", in the seats list. */
const SEAT_PAGE = 100;

/**
 * On the org dashboard (and a platform admin's org page): who has the licence's seats. An org admin also gets a link
 * to buy seats with the licence's own seat count filled in, and one to renew a licence that has ended.
 * Every member is listed, org admins too (they may hold a seat); a search finds a member by name, username or class, and
 * "Show more" goes past the first SEAT_PAGE (feat-org-seats-list).
 */
export function SeatsPanel({ org, members, onChanged }: { org: Org; members: Profile[]; /** Reads the members again. */ onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(SEAT_PAGE);
  const found = useMemo(() => {
    const s = q.trim().toLocaleLowerCase();
    return s ? members.filter((m) => [m.name, m.username, m.email, m.group].some((x) => x?.toLocaleLowerCase().includes(s))) : members;
  }, [members, q]);
  const lic = org.licence && org.licence.until > Date.now() ? org.licence : null;
  const buyLink = (seats: number, label: string) => <Link className="dr-btn dr-btn-secondary dr-btn-sm" to={`/upgrade?seats=${seats}&from=seats`}>{label}</Link>;
  if (!lic) {
    return role === "orgAdmin" && org.licence ? (
      <section className="panel stack" aria-labelledby="st-seats"><h3 id="st-seats">{t("sp.seatsTitle")}</h3>
        <p className="muted">{t("sp.licenceEnded", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(org.licence.until) })}</p>
        <div>{buyLink(org.licence.seats, t("sp.renewSeats"))}</div>
      </section>
    ) : null;
  }
  const used = members.filter((m) => m.superSeat).length;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); onChanged?.(); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(""); }
  };
  return (
    <section className="panel stack" aria-labelledby="st-seats"><h3 id="st-seats">{t("sp.seatsTitle")}</h3>
      <p className="muted">{t("sp.seatsLine", { used, seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) })}</p>
      <div className="row-gap">
        <Button size="sm" loading={busy === "fill"} disabled={used >= lic.seats} onClick={() => { void act("fill", async () => { const r = await api.fillSeats({ orgId: org.id }); return r; }, t("sp.filled")); }}>{t("sp.fill")}</Button>
        {role === "orgAdmin" && buyLink(lic.seats, t("sp.buySeats"))}
      </div>
      {members.length > 0 && <TextField label={t("sp.seatSearch")} type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(SEAT_PAGE); }} dir="auto" />}
      {q.trim() !== "" && !found.length && <p className="muted" role="status">{t("sp.seatNone")}</p>}
      <ul className="po-found">{found.slice(0, shown).map((m) => (
        <li key={m.uid}>
          <span><strong><bdi>{m.name}</bdi></strong> <small className="muted">{t(`role.${m.role ?? "learner"}` as "role.student")}{m.group ? <>{t("common.sep")}<bdi>{m.group}</bdi></> : null}</small></span>
          <Button size="sm" variant={m.superSeat ? "ghost" : "secondary"} loading={busy === m.uid} disabled={!m.superSeat && used >= lic.seats}
            onClick={() => { void act(m.uid, () => api.setSeat({ orgId: org.id, uid: m.uid, on: !m.superSeat }), m.superSeat ? t("sp.seatOff", { name: isolate(m.name) }) : t("sp.seatOn", { name: isolate(m.name) })); }}>
            {m.superSeat ? t("sp.takeSeat") : t("sp.giveSeat")}
          </Button>
        </li>
      ))}</ul>
      {found.length > shown && <div><Button size="sm" variant="ghost" onClick={() => setShown((n) => n + SEAT_PAGE)}>{t("sp.seatMore")}</Button></div>}
      <Note msg={msg} />
    </section>
  );
}
