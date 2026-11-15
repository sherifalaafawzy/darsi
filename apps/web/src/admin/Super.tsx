import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import type { Org, Profile } from "../auth/types";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote } from "../staff/LoadState";
import { patchMembers, useCredits, usePlansConfig, useSubscription } from "./data";
import { k } from "./formsStrings";
import { typedWhole } from "./typedNumber";
import "../styles/admin.css";
import "./strings";

/**
 * A whole number from a number field, within [min, max], or null while it is empty or out of range. The fields keep
 * what was typed: a cleared field used to read as 0, which took Super back or removed a licence (the buttons now wait).
 * They are text fields with a numeric keyboard, so the digits an Arabic keyboard types count too (admin/typedNumber.ts).
 */
const whole = typedWhole;

/**
 * Darsi Super for platform admins and org admins (docs/SUPER.md, TECHNICAL.md "Darsi Super"): complimentary Super and
 * credits, organizations' licences and seats. The plans page is ./Plans.
 * Payments themselves only ever come from the payment providers' verified webhooks.
 */
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
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sg-h"><h3 id="sg-h">{t("sp.superTitle")}</h3>
      <p className="muted">{has ? t("sp.hasSuper", { date: date.format(has.until), source: has.source }) : t("sp.noSuper")}</p>
      {sub.data && <p className="muted small">{t(live ? "sp.subLine" : "sp.subEnded", { plan: isolate(plan ? L(plan.name) : sub.data.plan), status: word(STATUS, sub.data.status), source: word(SOURCE, sub.data.source), date: date.format(sub.data.currentPeriodEnd) })}</p>}
      <div className="row-gap">
        <TextField label={t("sp.days")} inputMode="numeric" autoComplete="off" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        <Button size="sm" loading={busy} disabled={daysN === null} onClick={() => { void grant(false); }}>{t("sp.grant")}</Button>
        {/* It stays while the question is open (as on the other staff screens): Cancel gives it the focus back. */}
        {sub.data && sub.data.status !== "expired" && <Button size="sm" variant="ghost" icon="close" disabled={busy} aria-expanded={asking} onClick={() => { setMsg(null); setAsking(true); }}>{t("sp.revoke")}</Button>}
      </div>
      {/* Asked on the page (staff/InlineConfirm): Cancel has the focus, so Enter on a question that just appeared takes nothing back. */}
      {asking && <InlineConfirm danger title={t("sp.revokeConfirm")} body={paidBy ? t("sp.revokePaid", { provider: paidBy }) : undefined}
        confirmLabel={t("sp.revokeYes")} busy={busy} onConfirm={() => { void grant(true); }} onCancel={() => setAsking(false)} />}
      <p className="muted small">{t("sp.grantHint")}</p>
      {/* A balance that could not be read is not a balance of 0 (someone "topped up" a person who had plenty): say why,
          with Retry; until it is read, say that. No document at all is a real 0. */}
      {credits.error !== undefined && !credits.data ? <ErrorNote error={credits.error} reload={credits.reload} />
        : credits.loading && !credits.data ? <p className="muted" aria-busy="true">{t("adm.loading")}</p>
        : <p className="muted">{t("sp.balance", { plan: num(credits.data && credits.data.planUntil > Date.now() ? credits.data.plan : 0), packs: num(credits.data?.packs ?? 0) })}</p>}
      <div className="row-gap">
        <TextField label={t("sp.creditsField")} inputMode="numeric" autoComplete="off" value={extra} onChange={(e) => setExtra(e.target.value)} dir="ltr" />
        <Button size="sm" variant="secondary" loading={busy} disabled={extraN === null} onClick={() => { if (extraN === null) return; setBusy(true); setMsg(null); api.grantCredits({ uid: person.uid, credits: extraN }).then(() => { setMsg({ ok: true, text: t("sp.creditsGiven", { n: extraN }) }); credits.reload(); }, (e) => setMsg({ ok: false, text: errorText(e, t) })).finally(() => setBusy(false)); }}>{t("sp.giveCredits")}</Button>
      </div>
      <Note msg={msg} />
    </section>
  );
}

/** On a platform admin's org page: the organization's licence (plan, seats, how long). */
export function LicencePanel({ org, onChanged }: { org: Org; /** Reads the organization again. */ onChanged?: () => void }) {
  const { t, L, locale } = useI18n();
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
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="lc-h"><h3 id="lc-h">{t("sp.licenceTitle")}</h3>
      <p className="muted">{lic ? t("sp.licenceLine", { seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) }) : t("sp.noLicence")}</p>
      <div className="row-gap">
        {seatPlans.length > 0 && <label className="or-pick"><span>{t("sp.plan")}</span><select value={plan} onChange={(e) => setPlan(e.target.value)}>{seatPlans.map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}</select></label>}
        <TextField label={t("sp.seats")} inputMode="numeric" autoComplete="off" value={seats} onChange={(e) => setSeats(e.target.value)} dir="ltr" />
        <TextField label={t("sp.days")} inputMode="numeric" autoComplete="off" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        <Button size="sm" loading={busy} disabled={seatsN === null || daysN === null} onClick={() => { void save(false); }}>{t("sp.setLicence")}</Button>
        {lic && <Button size="sm" variant="ghost" icon="close" disabled={busy} aria-expanded={asking} onClick={() => { setMsg(null); setAsking(true); }}>{t("sp.removeLicence")}</Button>}
      </div>
      {asking && lic && <InlineConfirm danger title={t("sp.removeConfirm")} confirmLabel={t("sp.removeYes")} busy={busy}
        onConfirm={() => { void save(true); }} onCancel={() => setAsking(false)} />}
      <p className="muted small">{t("sp.licenceHint")}</p>
      {/* Until a seat brings credits of its own (docs/SUPER.md): remove this line then. */}
      <p className="muted small">{t("sp.seatNoCredits")}</p>
      <Note msg={msg} />
    </section>
  );
}

/** Members shown at first, and added by each "Show more", in the seats list. */
const SEAT_PAGE = 100;
/** fillSeats calls in a row before the screen stops asking for more (each runs up to four minutes on the server). */
const FILL_CALLS = 40;

/**
 * On the org dashboard (and a platform admin's org page): who has the licence's seats. An org admin also gets a link
 * to buy seats with the licence's own seat count filled in, and one to renew a licence that has ended.
 * Every member is listed, org admins too (they may hold a seat); a search finds a member by name, username or class, and
 * "Show more" goes past the first SEAT_PAGE (feat-org-seats-list).
 * One seat given or taken changes its own row here: the callable's answer is all there is to know, so the members are
 * not read again (it was one read per member per tap). The change is also put into the members the staff screens share
 * (admin/data.ts patchMembers), or a dashboard opened again within its ten minutes would show the seat as it was.
 * "Give the free seats" does read them again when it is done, since only the server knows who got one.
 */
export function SeatsPanel({ org, members, onChanged }: { org: Org; members: Profile[]; /** Reads the members again (after "Give the free seats"). */ onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(SEAT_PAGE);
  // Seats this screen gave or took since the members were last read, by uid; a new read is the truth again.
  const [mine, setMine] = useState<Record<string, boolean>>({});
  useEffect(() => { setMine((x) => (Object.keys(x).length ? {} : x)); }, [members]);
  const seated = (m: Profile) => mine[m.uid] ?? !!m.superSeat;
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
  const used = members.filter(seated).length;
  const toggle = async (m: Profile) => {
    const on = !seated(m);
    setBusy(m.uid); setMsg(null);
    try {
      await api.setSeat({ orgId: org.id, uid: m.uid, on });
      setMine((x) => ({ ...x, [m.uid]: on }));
      patchMembers(org.id, m.uid, { superSeat: on });
      setMsg({ ok: true, text: t(on ? "sp.seatOn" : "sp.seatOff", { name: isolate(m.name) }) });
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(""); }
  };
  /**
   * The server fills for up to four minutes a call and answers `more` when time ran out with seats still free and
   * people still waiting: call again until it is done, saying how many were given so far.
   */
  const fill = async () => {
    setBusy("fill"); setMsg(null);
    let given = 0, more = false;
    try {
      for (let call = 0; call < FILL_CALLS; call++) {
        const r = await api.fillSeats({ orgId: org.id });
        given += r?.given ?? 0;
        more = r?.more === true;
        // `more` with nothing given would never end: stop, and say what was done.
        if (!more || !r.given) break;
        setMsg({ ok: true, text: t(k("fm.fill.soFar"), { n: given }) });
      }
      // Still `more` after the last call allowed (FILL_CALLS): what was given is given, and pressing again goes on.
      setMsg({ ok: true, text: more && given ? t(k("fm.fill.more"), { n: given }) : given ? t(k("fm.fill.done"), { n: given }) : t(k("fm.fill.none")) });
    } catch (e) {
      // Seats given by the calls before the one that failed are given: say so beside the reason.
      setMsg({ ok: false, text: given ? `${t(k("fm.fill.stopped"), { n: given })} ${errorText(e, t)}` : errorText(e, t) });
    } finally { setBusy(""); if (given) onChanged?.(); }
  };
  return (
    <section className="panel stack" aria-labelledby="st-seats"><h3 id="st-seats">{t("sp.seatsTitle")}</h3>
      <p className="muted">{t("sp.seatsLine", { used, seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) })}</p>
      {/* Until a seat brings credits of its own (docs/SUPER.md): remove this line then. */}
      <p className="muted small">{t("sp.seatNoCredits")}</p>
      <div className="row-gap">
        <Button size="sm" loading={busy === "fill"} disabled={used >= lic.seats || (busy !== "" && busy !== "fill")} onClick={() => { void fill(); }}>{t("sp.fill")}</Button>
        {role === "orgAdmin" && buyLink(lic.seats, t("sp.buySeats"))}
      </div>
      {members.length > 0 && <TextField label={t("sp.seatSearch")} type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(SEAT_PAGE); }} dir="auto" />}
      {q.trim() !== "" && !found.length && <p className="muted" role="status">{t("sp.seatNone")}</p>}
      <ul className="po-found">{found.slice(0, shown).map((m) => (
        <li key={m.uid}>
          <span><strong><bdi>{m.name}</bdi></strong> <small className="muted">{t(`role.${m.role ?? "learner"}` as "role.student")}{m.group ? <>{t("common.sep")}<bdi>{m.group}</bdi></> : null}</small></span>
          <Button size="sm" variant={seated(m) ? "ghost" : "secondary"} loading={busy === m.uid} disabled={(!seated(m) && used >= lic.seats) || busy === "fill"}
            onClick={() => { void toggle(m); }}>
            {seated(m) ? t("sp.takeSeat") : t("sp.giveSeat")}
          </Button>
        </li>
      ))}</ul>
      {found.length > shown && <div><Button size="sm" variant="ghost" onClick={() => setShown((n) => n + SEAT_PAGE)}>{t("sp.seatMore")}</Button></div>}
      <Note msg={msg} />
    </section>
  );
}
