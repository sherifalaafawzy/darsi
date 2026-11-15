import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/api";
import type { Org, Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { useMyOrgRequests, useOrg } from "../admin/data";
import { reasonOf } from "../admin/refusals";
import { useOrgText } from "../admin/SuperAdmin";
import { latinDigits, typedWhole } from "../admin/typedNumber";
import { k } from "../cms/entStrings";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";

const ORG_TYPES = ["school", "university", "ministry", "ngo"] as const;

/**
 * joinOrg's refusals that have words of their own (functions/src/index.ts: the code's limits, the organization's join
 * policy, a person it removed, an organization that is suspended or going). They share their SDK code with other
 * refusals ("permission-denied" is also the hand-made username below), so the reason is looked at first.
 */
const JOIN_REASONS = new Set(["code-expired", "code-used-up", "removed", "email-unverified", "email-domain", "org-suspended", "org-deleting", "org-inactive", "disabled", "try-again"]);

/**
 * Why joining or registering failed, always in the person's language: the refusal's own reason first, then the SDK
 * codes people can act on, then the staff kit's sentence for anything else (never the server's raw English).
 */
function errText(e: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const reason = reasonOf(e), code = String((e as { code?: string } | null)?.code ?? "");
  return reason === "in-org" ? t(k("ent.org.inOrg"))
    : JOIN_REASONS.has(reason) ? errorText(e, t)
    : code.endsWith("not-found") ? t("org.errCode")
    : code.endsWith("already-exists") ? t("org.errPending")
    : code.endsWith("resource-exhausted") ? t("org.errTries")
    // joinOrg and requestOrg refuse a username login nobody's organization made (functions/src/roles.ts handMadeUsername).
    : code.endsWith("permission-denied") ? t("org.errReserved")
    : code.endsWith("unavailable") || code.includes("network") ? t("auth.errNetwork")
    : errorText(e, t);
}

/**
 * Where an organization is: its city, and its country by name in the page's language (requests store a country as typed,
 * or as a two-letter code such as "EG", which Intl.DisplayNames names). "—" if neither is known.
 */
export function orgPlace(o: Pick<Org, "city" | "country">, locale: string, sep: string): string {
  let country = o.country?.trim() ?? "";
  if (/^[A-Za-z]{2}$/.test(country)) {
    try { country = new Intl.DisplayNames([locale], { type: "region" }).of(country.toUpperCase()) ?? country; } catch { /* an old browser: the code */ }
  }
  return [o.city?.trim(), country].filter(Boolean).join(sep) || "—";
}

/**
 * /org — join an organization with an invite code, ask to register one, or see the one you belong to. Signed in only:
 * App.tsx answers a guest itself, so this chunk (and the Firebase SDK it reads through) never loads for one.
 */
export function OrgScreen() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, role, orgId, refreshClaims } = useAuth();
  const { data: org } = useOrg(orgId);
  // Read once when the screen opens (no live listener), and again after sending a request.
  const { data: requests = [], reload: reloadRequests } = useMyOrgRequests(user && !orgId ? user.uid : undefined);
  const ot = useOrgText();
  const [joined, setJoined] = useState("");
  // Came here to register one (?request=1, from sign-up): its form comes first, and stays there while on this page.
  const [registering] = useState(() => params.get("request") === "1");

  // An approved request sets the claims server-side; refresh the token once so the member view appears.
  const approvedId = !orgId ? requests.find((r) => r.status === "active")?.id : undefined;
  useEffect(() => {
    if (approvedId) refreshClaims().catch(() => {});
    // refreshClaims changes identity on every claims update; depending on it would refresh in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedId]);

  const latest = [...requests].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const pending = latest.find((r) => r.status === "pending");
  const rejected = !pending ? latest.find((r) => r.status === "rejected") : undefined;

  return (
    <>
      <AppBar title={t("org.title")} />
      <main className="screen narrow stack-lg">
        {orgId ? (
          <section className="panel stack">
            {joined && <p className="notice ok" role="status">{joined}</p>}
            <h3><bdi>{org?.name ?? "…"}</bdi></h3>
            {org && <p>{t("org.member", { role: t(`role.${role}` as "role.student"), org: isolate(org.name) })}</p>}
            {org && <p className="muted">{ot.type(org)}{t("common.sep")}<bdi>{orgPlace(org, locale, t("common.sep"))}</bdi></p>}
            <div className="row-gap">
              {role === "orgAdmin" && <Button icon="settings" onClick={() => nav("/admin")}>{t("org.openAdmin")}</Button>}
              {(role === "teacher" || role === "orgAdmin") && <Button variant={role === "teacher" ? "primary" : "secondary"} icon="profile" onClick={() => nav("/teach")}>{t("org.openTeach")}</Button>}
              {role === "student" && <Button icon="learn" onClick={() => nav("/learn")}>{t("lesson.home")}</Button>}
            </div>
          </section>
        ) : role === "superadmin" ? (
          <section className="panel stack">
            <p>{t("org.super")}</p>
            <div className="row-gap"><Button icon="settings" onClick={() => nav("/super")}>{t("org.openSuper")}</Button></div>
          </section>
        ) : (
          <>
            {pending && <p className="notice" role="status">{t("org.pending", { org: isolate(pending.name) })}</p>}
            {rejected && (
              <div className="notice err stack-sm" role="status">
                <span>{t("org.rejected", { org: isolate(rejected.name) })}</span>
                {rejected.reviewNote && <span dir="auto">{t("org.reviewNote", { note: rejected.reviewNote })}</span>}
              </div>
            )}
            {!pending && registering && <RequestOrg onSent={reloadRequests} />}
            <JoinForm onJoined={(r) => setJoined(t("org.joined", { org: isolate(r.orgName), role: t(`role.${r.role}` as "role.student") }))} />
            {!pending && !registering && <RequestOrg onSent={reloadRequests} />}
          </>
        )}
      </main>
    </>
  );
}

/** How long an invite link waits for a brand-new account's profile before it asks to join anyway. */
export const PROFILE_WAIT_MS = 5000;

/**
 * Joining shows the organization's admins and the person's teacher everything they have done in Darsi, earlier work
 * included, so nothing joins without a "yes" to exactly that: typing a code and an invite link (/org?code=…, also where
 * sign-up with a code lands) both stop at one question on the page. "Not now" joins nothing and keeps the code in the
 * field. joinOrg is called from the question's Join button and nowhere else.
 */
function JoinForm({ onJoined }: { onJoined: (r: { orgName: string; role: Role }) => void }) {
  const { t } = useI18n();
  const { refreshClaims, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  // From sign-up or an invite link (/org?code=…): filled in, and asked about once by itself.
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** The question is on the page. Its answer is the only way in. */
  const [asking, setAsking] = useState(false);
  /** Goes up when the question closes without a join (Not now, or a refusal): the cursor returns to the code. */
  const [back, setBack] = useState(0);
  const valid = code.trim().length >= 4;
  const join = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.joinOrg({ code: code.trim() });
      onJoined(r);
      await refreshClaims();
    } catch (x) { setErr(errText(x, t)); setAsking(false); setBack((n) => n + 1); } finally { setBusy(false); }
  };
  const ask = () => { if (valid && !busy) { setErr(""); setAsking(true); } };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(); };
  // The question's buttons took the place of the form's: with them gone, the focus goes to the field the code is in
  // (and, after a refusal, to the field its message is about), not to the top of the page.
  useEffect(() => { if (back) document.getElementById("org-code")?.focus(); }, [back]);
  // Right after sign-up the app is still creating the account's profile: a join that lands first made a profile with
  // no name or email, and the app's own was then refused (ux-accounts-04). So an invite link waits for the profile,
  // or a few seconds at most (offline, or an older account without one), before it asks; the server fills the gaps
  // either way. The code leaves the address as the question appears, so a reload after "Not now" asks nothing and
  // joins nothing.
  const auto = useRef(params.get("code"));
  const hasProfile = Boolean(profile);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!auto.current || hasProfile) return;
    const id = setTimeout(() => setWaited(true), PROFILE_WAIT_MS);
    return () => clearTimeout(id);
  }, [hasProfile]);
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !auto.current || !(hasProfile || waited)) return;
    tried.current = true;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("code"); return n; }, { replace: true });
    ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile, waited]);
  return (
    <section className="panel">
      <form className="stack" onSubmit={submit}>
        <h3>{t("org.join")}</h3>
        {/* While the question is up the code can't change under it: what is asked about is what is sent. */}
        <TextField id="org-code" label={t("org.code")} hint={t("org.codeHint")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} readOnly={asking}
          dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required error={err || undefined} />
        {asking ? (
          <InlineConfirm title={t(k("ent.org.joinAsk"))} body={t(k("ent.org.joinBody"))} confirmLabel={t("org.joinBtn")} cancelLabel={t(k("ent.org.notNow"))} busy={busy}
            onConfirm={() => { void join(); }} onCancel={() => { setAsking(false); setBack((n) => n + 1); }} />
        ) : <div className="row-gap"><Button type="submit" disabled={!valid}>{t("org.joinBtn")}</Button></div>}
      </form>
    </section>
  );
}

/**
 * Register an organization. Opened by /org?request=1 (from sign-up) or the button; a super-admin reviews it. The
 * contact and reason go to a private part of the request that only platform admins (and later its admins) read.
 */
function RequestOrg({ onSent }: { onSent: () => void }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const open = params.get("request") === "1";
  const [f, setF] = useState({ name: "", type: "school", country: "", city: "", size: "", contact: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (on: boolean) => setParams(on ? { request: "1" } : {}, { replace: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    // The field holds digits only (any keyboard's, kept as 0-9); the server keeps at most 10,000,000 too.
    const size = typedWhole(f.size, 1, 99_999_999);
    try {
      await api.requestOrg({ name: f.name.trim(), type: f.type, country: f.country.trim(), city: f.city.trim(), size: size === null ? undefined : Math.min(size, 10_000_000), contact: f.contact.trim() || undefined, reason: f.reason.trim() || undefined });
      toggle(false);
      onSent(); // the request list, read again, shows "being reviewed" and hides this section
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };

  return (
    <section className="panel stack">
      <h3>{t("org.request")}</h3>
      <p className="muted">{t("org.requestBody")}</p>
      {!open ? <div className="row-gap"><Button variant="secondary" icon="edit" onClick={() => toggle(true)}>{t("org.request")}</Button></div> : (
        <form className="stack" onSubmit={submit}>
          <TextField id="org-name" label={t("org.name")} value={f.name} onChange={set("name")} required minLength={3} maxLength={120} autoComplete="organization" />
          <div className="dr-field">
            <label htmlFor="org-type" className="dr-field-label">{t("org.type")}</label>
            <select id="org-type" className="dr-field-input" value={f.type} onChange={set("type")}>
              {ORG_TYPES.map((ty) => <option key={ty} value={ty}>{t(`type.${ty}`)}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <TextField id="org-country" label={t("org.country")} value={f.country} onChange={set("country")} maxLength={80} autoComplete="country-name" />
            <TextField id="org-city" label={t("org.city")} value={f.city} onChange={set("city")} maxLength={80} autoComplete="address-level2" />
            {/* A text field with a numeric keyboard: type="number" refuses the digits an Arabic keyboard types (admin/typedNumber). */}
            <TextField id="org-size" label={t("org.size")} inputMode="numeric" dir="ltr" maxLength={8} autoComplete="off" value={f.size}
              onChange={(e) => setF({ ...f, size: latinDigits(e.target.value).replace(/\D/g, "") })} />
            <TextField id="org-contact" label={t("org.contact")} value={f.contact} onChange={set("contact")} maxLength={120} autoComplete="tel" />
          </div>
          <div className="dr-field">
            <label htmlFor="org-reason" className="dr-field-label">{t("org.reason")}</label>
            <textarea id="org-reason" className="dr-field-input" rows={3} dir="auto" maxLength={1000} value={f.reason} onChange={set("reason")} />
          </div>
          {err && <p className="notice err" role="alert">{err}</p>}
          <div className="row-gap">
            <Button type="submit" loading={busy} disabled={f.name.trim().length < 3}>{t("org.send")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => toggle(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
