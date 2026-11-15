/**
 * School sign-in for an organization (TECHNICAL.md "School sign-in"; the server is functions/src/sso.ts manageSso): a
 * lazy staff chunk, shown on the organization's "Sign-in & web address" tab (AdminHome) and on its page for platform
 * admins (OrgsAdmin OrgSignIn, `platform`).
 *
 * Until it is on, a wizard in five steps: the provider, connecting it (the console's steps for that provider, with the
 * redirect URI to copy, and "Check connection", which runs discovery on the server), who can sign in, a test (with the
 * admin's own account and with a student's one-time link: the result card says what Darsi would do and which claims
 * arrived), and turning it on. Each step can be revisited; steps 1 and 2 are kept on the server as typed (manageSso
 * save partial, never the secret), step 3 saves the connection itself (discovery again, on the server; the secret is
 * write-only). Once it is on, a status card: who is connected, problems, the link to share, the school finder, turning
 * it off, and Edit, which works on a copy (`next`) while the live connection keeps serving until the copy's test passes.
 *
 * Every read is one manageSso get, when the tab opens and after an action (no listener). The provider sends the
 * admin's test back to this tab (#sso=…): the return is finished here (finish needs this admin's ID token).
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, ChoiceCard, Icon, Switch, TextField, type IconName } from "@darsi/design-system";
import { api, type SsoConfig, type SsoConn, type SsoDiscovered, type SsoFields, type SsoLastTest, type SsoPreset, type SsoState } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import { isolate, useI18n } from "../i18n";
import { codeOf, finishFlow, hasReturn, releaseReturn, startFlow, takeReturn } from "../auth/ssoFlow";
import { k as wk, refusalText } from "../auth/ssoWords";
import { InlineConfirm } from "../staff/InlineConfirm";
import { errorText } from "../staff/errors";
import { LeaveQuestion, useFormGuard } from "./formGuard";
import { isSsoKey, k, type SsoKey } from "./ssoStrings";
import { latinDigits, typedWhole } from "./typedNumber";
import "../styles/sso.css";

type T = ReturnType<typeof useI18n>["t"];
type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null);

export const PRESETS: readonly SsoPreset[] = ["google", "microsoft", "okta", "keycloak", "oidc"];
const PRESET_ICON: Record<SsoPreset, IconName> = { google: "globe", microsoft: "settings", okta: "lock", keycloak: "code", oidc: "link" };
/** The console steps per provider, in order (functions/src/ssoProviders.ts PRESET_INFO.steps: the same ids). */
export const CONSOLE: Record<SsoPreset, readonly string[]> = {
  google: ["google-client-web", "google-internal", "google-cloud-access", "google-under18", "google-redirect", "google-copy-secret"],
  microsoft: ["ms-register-single-tenant", "ms-web-platform", "ms-redirect", "ms-secret-value", "ms-optional-email", "ms-app-roles", "ms-admin-consent"],
  okta: ["okta-oidc-web", "okta-redirect", "okta-assign-groups", "okta-custom-server", "okta-groups-claim"],
  keycloak: ["kc-realm", "kc-client", "kc-redirect", "kc-client-auth", "kc-groups-mapper"],
  oidc: ["oidc-register", "oidc-redirect", "oidc-confidential", "oidc-email-claims"],
};
const REDIRECT_STEP = /-redirect$/;
/** Which step a refused field is on (validateConfig's field names). */
const FIELD_STEP: Record<string, number> = {
  preset: 1, tenant: 2, domain: 2, oktaServer: 2, realm: 2, issuer: 2, clientId: 2, authMethod: 2, secret: 2, secretExpiresOn: 2,
  scopes: 3, allowedDomains: 3, openToAll: 3, emailsVerifiedBySchool: 3, teacherRule: 3, classClaim: 3, maxSessionDays: 3, personalDevices: 3,
};
/** The fields that show their own refusal (beside the input, or in their step's group). */
const SHOWN = new Set(["preset", "tenant", "domain", "oktaServer", "realm", "issuer", "clientId", "secret", "secretExpiresOn", "allowedDomains", "openToAll", "teacherRule", "classClaim", "maxSessionDays"]);
const STEP_KEYS: SsoKey[] = ["sa.step.provider", "sa.step.connect", "sa.step.who", "sa.step.test", "sa.step.on"];
/** Microsoft's Entra hosts, as the server reads an issuer (ssoCore rulesFor): a preset "Other" pointed at one counts too. */
const MS_HOSTS = /^(?:login\.microsoftonline\.com|sts\.windows\.net|login\.windows\.net|login\.microsoft\.com|login\.microsoftonline\.us|login\.partner\.microsoftonline\.cn|sts\.chinacloudapi\.cn)$/;
/** Google or Microsoft (whose turnOn wants a student's test) or another provider, by the issuer as the server judges it. */
export function providerKind(c: { preset: SsoPreset; issuer?: string | null }): "google" | "microsoft" | "other" {
  let host = "";
  try { host = c.issuer ? new URL(c.issuer).hostname : ""; } catch { host = ""; }
  if (host === "accounts.google.com" || c.issuer === "accounts.google.com" || (!host && c.preset === "google")) return "google";
  if (MS_HOSTS.test(host) || (!host && c.preset === "microsoft")) return "microsoft";
  return "other";
}

/* ---------- the form: what the admin types, and the connection it becomes ---------- */

/** The wizard's fields as typed (strings for lists and numbers), kept on the server between steps 1 and 3. */
export interface Form {
  preset: SsoPreset | ""; tenant: string; domain: string; oktaServer: string; realm: string; issuer: string; clientId: string; secretExpiresOn: string;
  domains: string; openToAll: boolean; emailsVerifiedBySchool: boolean;
  teacherOn: boolean; tDomains: string; tEmails: string; tKind: "role" | "group"; tValue: string; tClaim: string;
  classClaim: string; maxSessionDays: string; personalDevices: boolean;
}
export const EMPTY: Form = {
  preset: "", tenant: "", domain: "", oktaServer: "", realm: "", issuer: "", clientId: "", secretExpiresOn: "",
  domains: "", openToAll: false, emailsVerifiedBySchool: false,
  teacherOn: false, tDomains: "", tEmails: "", tKind: "role", tValue: "Teacher", tClaim: "groups",
  classClaim: "", maxSessionDays: "30", personalDevices: false,
};
const list = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** A saved connection as the form shows it. */
export function formOf(c: Partial<SsoConn> | null | undefined): Form {
  if (!c?.preset) return { ...EMPTY };
  const r = c.teacherRule ?? null;
  return {
    ...EMPTY, preset: c.preset, tenant: c.tenant ?? "", domain: c.domain ?? "", oktaServer: c.oktaServer ?? "", realm: c.realm ?? "",
    issuer: c.preset === "oidc" ? c.issuer ?? "" : "", clientId: c.clientId ?? "", secretExpiresOn: c.secretExpiresOn ?? "",
    domains: (c.allowedDomains ?? []).join(", "), openToAll: !!c.openToAll, emailsVerifiedBySchool: !!c.emailsVerifiedBySchool,
    teacherOn: !!r, tDomains: r?.kind === "email" ? r.domains.join(", ") : "", tEmails: r?.kind === "email" ? r.emails.join("\n") : "",
    tKind: r?.kind === "group" ? "group" : "role", tValue: r && r.kind !== "email" ? r.value : EMPTY.tValue, tClaim: r?.kind === "claim" ? r.claim : EMPTY.tClaim,
    classClaim: c.classClaim ?? "", maxSessionDays: String(c.maxSessionDays ?? 30), personalDevices: !!c.personalDevices,
  };
}
/** The work in progress the server kept (save partial), checked field by field: only strings and booleans of the form. */
function wipOf(w: SsoState["wip"]): { form: Form; step: number } | null {
  const f = (w?.config?.form ?? null) as Record<string, unknown> | null;
  if (!f || typeof f !== "object") return null;
  const form = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof Form)[]) {
    const v = f[key];
    if (typeof v === typeof EMPTY[key]) (form as Record<string, unknown>)[key] = v;
  }
  if (form.preset && !PRESETS.includes(form.preset)) form.preset = "";
  const step = Number(w?.config?.step);
  return { form, step: Number.isInteger(step) && step >= 1 && step <= 3 ? step : 1 };
}
/** What manageSso save checks (ssoCore validateConfig): only the provider's own fields, lists split, numbers read. */
export function fieldsOf(f: Form): SsoFields {
  const p = f.preset as SsoPreset;
  const rule = !f.teacherOn ? null
    : p === "google" ? { kind: "email" as const, domains: list(f.tDomains), emails: list(f.tEmails) }
    : p === "microsoft" ? { kind: f.tKind, value: f.tValue.trim() }
    : { kind: "claim" as const, claim: f.tClaim.trim(), value: f.tValue.trim() };
  return {
    preset: p,
    ...(p === "microsoft" ? { tenant: f.tenant.trim().toLowerCase() } : {}),
    ...(p === "okta" || p === "keycloak" ? { domain: f.domain.trim().toLowerCase() } : {}),
    ...(p === "okta" && f.oktaServer.trim() ? { oktaServer: f.oktaServer.trim() } : {}),
    ...(p === "keycloak" ? { realm: f.realm.trim() } : {}),
    ...(p === "oidc" ? { issuer: f.issuer.trim() } : {}),
    clientId: f.clientId.trim(),
    allowedDomains: list(f.domains),
    openToAll: f.openToAll && !list(f.domains).length,
    emailsVerifiedBySchool: f.emailsVerifiedBySchool,
    teacherRule: rule,
    classClaim: p === "google" ? null : f.classClaim.trim() || null,
    // A whole number from 1 to 90, in any digits; anything else goes as 0, which the server refuses at this field
    // (never NaN, which a callable can't send, nor "1e1" read as 10).
    maxSessionDays: typedWhole(f.maxSessionDays, 1, 90) ?? 0,
    personalDevices: f.personalDevices,
    secretExpiresOn: f.secretExpiresOn || null,
  };
}
/** The fields that say where the provider is: a change means a new "Check connection". */
const whereOf = (f: Form) => [f.preset, f.tenant, f.domain, f.oktaServer, f.realm, f.issuer].join("\n");

/* ---------- refusals ---------- */

const details = (e: unknown) => ((e as { details?: Record<string, unknown> } | null)?.details ?? {}) as { reason?: string; field?: string; hint?: string; got?: string; want?: string; connected?: number; issuerChanged?: boolean };
/** A discovery hint in words ("name not found", "the certificate chain is incomplete", "issuer mismatch: both strings"). */
function hintText(d: { hint?: string; got?: string; want?: string }, t: T): string {
  const key = `sa.h.${d.hint ?? ""}`;
  return isSsoKey(key) ? t(k(key), { got: isolate(d.got ?? "?"), want: isolate(d.want ?? "?") }) : t(k("sa.rf.sso-discovery"));
}
/** Why manageSso refused, said for an admin: the wizard's own words first, then school sign-in's, then the staff screens'. */
export function whyText(e: unknown, t: T): string {
  const d = details(e);
  const reason = d.reason ?? "";
  if (reason === "sso-discovery" && d.hint) return `${t(k("sa.rf.sso-discovery"))} ${hintText(d, t)}`;
  if (isSsoKey(`sa.rf.${reason}`)) return t(k(`sa.rf.${reason}` as SsoKey));
  if (reason.startsWith("sso-")) return refusalText(reason, t);
  return errorText(e, t);
}
const fieldLabel = (field: string, t: T) => (isSsoKey(`sa.f.${field}`) ? t(k(`sa.f.${field}` as SsoKey)) : field);
/**
 * The day a client secret runs out, as the server takes it (functions/src/ssoCore.ts validDay): a real calendar day
 * from 2020 to three years from now. Checked here first so the admin reads why at the field, in their language.
 */
export function dayOk(d: string, now = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(at);
  if (back.getUTCFullYear() !== Number(m[1]) || back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return false;
  return at >= Date.UTC(2020, 0, 1) && at <= now + 3 * 366 * 86_400_000;
}

/* ---------- small pieces ---------- */

/** A value to copy into a console (the redirect URI, the sign-in link), with Copy; when the clipboard refuses, selectable. */
function CopyLine({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"" | "copied" | "manual">("");
  const copy = async () => {
    try { if (!navigator.clipboard) throw new Error("no clipboard"); await navigator.clipboard.writeText(value); setState("copied"); setTimeout(() => setState(""), 1500); }
    catch { setState("manual"); }
  };
  return (
    <div className="sso-copy">
      <span className="sso-copy-label">{label}</span>
      <code dir="ltr" translate="no">{value}</code>
      <div><Button size="sm" variant="secondary" icon="link" onClick={() => { void copy(); }}>{state === "copied" ? t(k("sa.c.copied")) : t(k("sa.c.copy"))}</Button></div>
      {hint && <small className="muted">{hint}</small>}
      {state === "manual" && <small role="status">{t(k("sa.c.copyManual"))}</small>}
    </div>
  );
}

const dateOf = (ms: number | null | undefined, locale: string, time = false) => (ms ? new Intl.DateTimeFormat(locale, time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(ms) : "");
const dayOf = (ymd: string, locale: string) => { const [y, m, d] = ymd.split("-").map(Number); return y ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d)) : ymd; };

/* ---------- the page part ---------- */

/** One manageSso get: when the tab opens, and again after each action. */
function useSso(orgId: string) {
  const [n, setN] = useState(0);
  const [s, setS] = useState<{ data?: SsoState; error?: unknown; at: number }>({ at: -1 });
  useEffect(() => {
    let live = true;
    api.manageSso({ action: "get", orgId }).then((d) => { if (live) setS({ data: d as unknown as SsoState, at: n }); }, (error: unknown) => { if (live) setS((p) => ({ ...p, error, at: n })); });
    return () => { live = false; };
  }, [orgId, n]);
  return { ...s, loading: s.at !== n, reload: () => setN((x) => x + 1) };
}

/** finish's answer for a test (functions/src/sso.ts finishTest). */
interface Tested { tested: string; ok: boolean; promoted: boolean }
const testing = new Map<string, Promise<Tested>>();

/**
 * The admin's own test coming back (#sso=…&f=… on this tab, or #sso_error=…): the fragment leaves the address, then
 * finish (once per ticket) records the result on the server, which the next read shows. A refusal at the provider was
 * recorded by the callback already: the read shows it too.
 */
function useTestReturn(reload: () => void): { busy?: boolean; code?: string; detail?: string; promoted?: boolean } | null {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<{ busy?: boolean; code?: string; detail?: string; promoted?: boolean } | null>(() => (hasReturn(loc.hash) ? { busy: true } : null));
  useEffect(() => {
    const r = takeReturn(loc.hash);
    if (loc.hash) nav({ pathname: loc.pathname, search: loc.search }, { replace: true, state: loc.state });
    // Nothing (left) to take: only "Reading the test's result…" goes. What an earlier run of this effect already said stays (React
    // runs it twice in development, StrictMode: the second run finds the return let go of, and used to wipe "start
    // again" or the refusal off the page).
    if (!r) { setState((s) => (s?.busy ? null : s)); return; }
    // Whatever came back to this tab is dealt with here, and let go of (releaseReturn): nothing else on the page takes
    // it, and one left held would keep hasReturn() true, so the panel would say "Reading the test's result…" for good.
    // A return this browser has no record for (the test began in another tab, or a sign-in begun since replaced it):
    if ("lost" in r) { releaseReturn(); setState({ code: "lost" }); return; }
    // Another flow's return (a sign-in's, a connection's from Me) isn't a test's result: nothing to finish or to say here.
    const other = r.record ? r.record.mode !== "test" : false;
    if ("error" in r) { releaseReturn(); if (other) { setState(null); return; } setState({ code: r.error, ...(r.detail ? { detail: r.detail } : {}) }); reload(); return; }
    if (other) { releaseReturn(); setState(null); return; }
    // A test's ticket with nobody signed in to finish it (the session ended at the provider's page): start again.
    if (!user) { releaseReturn(); setState({ code: "lost" }); return; }
    let live = true;
    if (!testing.has(r.ticket)) testing.set(r.ticket, user.getIdToken().then((idToken) => finishFlow<Tested>(r.ticket, r.record.verifier, { idToken })).finally(releaseReturn));
    testing.get(r.ticket)!.then((a) => { if (live) { setState({ promoted: !!a.promoted }); reload(); } }, (e: unknown) => { if (live) setState({ code: codeOf(e) }); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/**
 * School sign-in for one organization: the wizard until it is on, then the status card. `platform`: a platform admin
 * on the organization's page (the members ceiling and the keys' health too).
 */
export function SsoSetup({ orgId, platform = false }: { orgId: string; platform?: boolean }) {
  const { t } = useI18n();
  const q = useSso(orgId);
  const back = useTestReturn(q.reload);
  const [wizard, setWizard] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // The wizard saved the connection and is about to be replaced by a new instance (its key follows the saved
  // revision): the new one opens saying "Saved", with the focus on its step, then clears this.
  const [justSaved, setJustSaved] = useState(false);
  const data = q.data;
  const cfg = data?.config ?? null;
  const live = cfg?.status === "on" || cfg?.status === "off";
  return (
    <section className="panel stack sso" aria-labelledby="sso-h">
      <h3 id="sso-h">{t(k("sa.title"))}</h3>
      <p className="muted small">{t(k("sa.intro"))}</p>
      {/* A wait, shown as the sign-in screens show theirs (auth.css is global): a still grey box read as a finished message. */}
      {back?.busy && <p className="auth-busy" role="status" aria-busy="true"><span className="dr-spinner" aria-hidden="true" />{t(k("sa.testBack"))}</p>}
      {back?.code && <p className="notice err" role="alert">{back.code === "lost" ? t(wk("ss.lost")) : refusalText(back.code, t)}{back.detail ? ` (${isolate(back.detail)})` : ""}</p>}
      {back?.promoted && <p className="notice ok" role="status">{t(k("sa.s.promoted"))}</p>}
      <Note msg={msg} />
      {!data ? (q.error !== undefined && !q.loading
        ? <div className="notice err stack-sm" role="alert"><span>{whyText(q.error, t)}</span><div><Button size="sm" variant="secondary" icon="sync" onClick={q.reload}>{t(k("sa.retry"))}</Button></div></div>
        : <p className="muted" role="status" aria-busy="true">{t(k("sa.loading"))}</p>)
        : <>
          {!data.switchOn && <p className="notice">{t(k("sa.switchOff"))}</p>}
          {!data.keyOk && <p className="notice err">{t(k("sa.keyOff"))}</p>}
          {live && !wizard
            ? <StatusCard orgId={orgId} data={data} cfg={cfg!} onEdit={() => { setMsg(null); setJustSaved(false); setWizard(true); }} onChanged={q.reload} say={setMsg} />
            : <Wizard key={`${cfg?.configRev ?? 0}-${cfg?.next?.configRev ?? 0}-${cfg?.status ?? "new"}`} orgId={orgId} data={data} returned={!!back && !back.busy}
                saved={justSaved} onSaved={() => setJustSaved(true)} onSavedShown={() => setJustSaved(false)}
                onReload={q.reload} onClose={live ? () => setWizard(false) : undefined} onOn={() => { setWizard(false); setMsg({ ok: true, text: t(k("sa.o.done")) }); q.reload(); }} />}
          {platform && <PlatformPart orgId={orgId} data={data} onChanged={q.reload} />}
        </>}
    </section>
  );
}

/* ---------- the wizard ---------- */

function Wizard({ orgId, data, returned, saved, onSaved, onSavedShown, onReload, onClose, onOn }: {
  orgId: string; data: SsoState; /** A test just came back: open on the Test step. */ returned: boolean;
  /** The instance before this one saved the connection: this one opens saying so, with the focus on its step. */ saved: boolean;
  /** This instance saved the connection (the next read replaces it). */ onSaved: () => void; /** "Saved" was taken over by this instance. */ onSavedShown: () => void;
  onReload: () => void; /** Editing a live connection: back to the status card. */ onClose?: () => void; onOn: () => void;
}) {
  const { t, num } = useI18n();
  const id = useId();
  const cfg = data.config;
  const editing = cfg?.status === "on";
  // The connection this wizard edits: the copy under test while one is live, else the connection itself.
  const slot = editing ? cfg!.next : cfg;
  const wip = wipOf(data.wip);
  const [form, setForm] = useState<Form>(() => wip?.form ?? formOf(slot ?? (editing ? cfg : null)));
  // Where it opens: a test that just came back, or the copy under test, on Test; the work in progress where it was left;
  // a saved connection on what it needs next (its secret, a test, turning on); a connection that was turned off on Connect.
  const tested = !!cfg && !editing && cfg.testedRev === cfg.configRev;
  // (An edit with no copy yet has nothing to test, also on a page a test came back to earlier: it opens on Connect.)
  const first = editing ? (slot ? 4 : 2)
    : returned && cfg ? 4
    : wip ? wip.step
    : !cfg ? 1
    : cfg.status === "off" || !cfg.hasSecret ? 2
    : tested ? 5 : 4;
  const [step, setStep] = useState(first);
  // How far the stepper lets the admin jump: a saved connection can be tested, a tested one turned on.
  const [furthest, setFurthest] = useState(Math.max(first, editing ? (slot ? 4 : 3) : cfg ? (tested ? 5 : 4) : 1));
  const [secret, setSecret] = useState("");
  // The form as the server has it: as it was read, then what Next kept (steps 1 and 2) or step 3 saved. Typed past
  // that, or with a secret typed (never kept as typed), the fields live only on this page: a nav link, the app bar's
  // Back, a reload or closing the tab asks first. The page's own tabs don't (formGuard): the panel is kept behind them.
  const [held, setHeld] = useState(form);
  const unsaved = !!secret || (form !== held && JSON.stringify(form) !== JSON.stringify(held));
  const guard = useFormGuard(unsaved);
  const [busy, setBusy] = useState("");
  // `saved` as it was when this instance was made: the one that did the saving was made with false, and is on its way out.
  const [arrived] = useState(saved);
  const [msg, setMsg] = useState<Msg>(() => (arrived ? { ok: true, text: t(k("sa.saved")) } : null));
  useEffect(() => { if (arrived) onSavedShown(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [bad, setBad] = useState<{ field: string; text: string } | null>(null);
  const [checked, setChecked] = useState<{ where: string; d: SsoDiscovered } | null>(null);
  const [migrate, setMigrate] = useState<{ connected: number; issuerChanged: boolean } | null>(null);
  const [migration, setMigration] = useState<"same" | "new" | "">("");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(arrived);
  // A new step takes the focus to its heading (not on the first render, unless a save just brought the admin to it:
  // the button that had the focus went with the instance that saved): a screen reader says where the admin is.
  useEffect(() => { if (moved.current) heading.current?.focus(); moved.current = true; }, [step]);
  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setBad(null); };
  const go = (n: number) => { setMsg(null); setBad(null); setStep(n); setFurthest((x) => Math.max(x, n)); };
  const p = form.preset;
  const fresh = checked && checked.where === whereOf(form) ? checked.d : null;
  // The provider as the form names it now: what Check connection just found, else the saved connection's issuer
  // while the form still points at it, else the preset (a saved issuer says nothing about a provider chosen since)
  // with, for "Other", the issuer as typed: the server judges an "Other" by that address (ssoCore validateConfig), so
  // one pointed at Microsoft Entra is Microsoft on a draft reopened with no check on this page too.
  const base = slot ?? (editing ? cfg : null);
  const kind = providerKind({ preset: (p || "oidc") as SsoPreset, issuer: fresh?.issuer ?? (base && whereOf(form) === whereOf(formOf(base)) ? base.issuer : p === "oidc" ? form.issuer.trim() : null) });
  // The Test and Turn on steps act on the connection as it is saved, whatever the form says since.
  const savedKind = slot ? providerKind(slot) : kind;
  const secretKnown = Boolean(slot?.hasSecret || (editing && cfg?.hasSecret));

  /** Refused: the reason, at its field when it names one (and that field's step). */
  const refused = (e: unknown) => {
    const d = details(e);
    if (d.reason === "sso-migrate") { setMigrate({ connected: Number(d.connected) || 0, issuerChanged: !!d.issuerChanged }); setMigration(d.issuerChanged ? "new" : ""); return; }
    if (d.field) {
      // The expiry date has a sentence of its own: its label is not an "sa.f.<field>" key, and "Check …" would not say what is wrong with a date.
      const text = d.reason === "sso-issuer" ? t(k("sa.rf.sso-issuer")) : d.field === "secretExpiresOn" ? t(k("sa.f.secretExpiresBad")) : t(k("sa.fieldBad"), { field: fieldLabel(d.field, t) });
      setBad({ field: d.field, text });
      if (FIELD_STEP[d.field] && FIELD_STEP[d.field] !== step) setStep(FIELD_STEP[d.field]);
      return;
    }
    setMsg({ ok: false, text: whyText(e, t) });
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { refused(e); } finally { setBusy(""); }
  };
  /** Steps 1 and 2 are kept on the server as typed (never the secret), so the admin can come back to them. */
  const keep = async (next: number) => { const sent = form; await api.manageSso({ action: "save", orgId, partial: true, config: { form: sent, step: next } }); setHeld(sent); };
  const discover = async () => {
    const f = fieldsOf(form);
    const d = (await api.manageSso({ action: "discover", orgId, preset: f.preset, tenant: f.tenant, domain: f.domain, oktaServer: f.oktaServer, realm: f.realm, issuer: f.issuer })) as unknown as SsoDiscovered;
    setChecked({ where: whereOf(form), d });
    return d;
  };

  /** What the browser can tell before asking the server, per step: the field and its words. */
  const missing = (n: number): { field: string; text: string } | null => {
    const f = fieldsOf(form);
    if (n === 1 && !p) return { field: "preset", text: t(k("sa.p.choose")) };
    if (n === 2) {
      const need = (field: string, v: string | null | undefined) => (!v ? { field, text: t(k("sa.fieldEmpty"), { field: fieldLabel(field, t) }) } : null);
      return (p === "microsoft" && need("tenant", f.tenant)) || ((p === "okta" || p === "keycloak") && need("domain", f.domain)) || (p === "keycloak" && need("realm", f.realm))
        || (p === "oidc" && need("issuer", f.issuer)) || need("clientId", f.clientId) || (!secretKnown && !secret.trim() ? { field: "secret", text: t(k("sa.f.secretNeeded")) } : null)
        || (f.secretExpiresOn && !dayOk(f.secretExpiresOn) ? { field: "secretExpiresOn", text: t(k("sa.f.secretExpiresBad")) } : null);
    }
    if (n === 3) {
      if (kind === "google" && !f.allowedDomains.length) return { field: "allowedDomains", text: t(k("sa.w.domainsGoogle")) };
      if (kind === "other" && !f.allowedDomains.length && !f.openToAll) return { field: "allowedDomains", text: t(k("sa.w.needOne")) };
      if (f.teacherRule?.kind === "email" && !f.teacherRule.domains.length && !f.teacherRule.emails.length) return { field: "teacherRule", text: t(k("sa.w.tGoogleNeed")) };
      if (f.teacherRule && f.teacherRule.kind !== "email" && !f.teacherRule.value) return { field: "teacherRule", text: t(k("sa.fieldEmpty"), { field: t(k(f.teacherRule.kind === "group" ? "sa.w.tValueGroup" : f.teacherRule.kind === "role" ? "sa.w.tValueRole" : "sa.w.tValue")) }) };
      if (typedWhole(form.maxSessionDays, 1, 90) === null) return { field: "maxSessionDays", text: t(k("sa.w.sessionHint")) };
    }
    return null;
  };
  const next = () => {
    const m = missing(step);
    if (m) { setBad(m); return; }
    if (step === 1) return run("next", async () => { await keep(2); go(2); });
    // Unchecked, or checked for other values: discovery first (a refusal stays here with its hint).
    if (step === 2) return run("next", async () => { if (!fresh && whereOf(form) !== whereOf(formOf(slot))) await discover(); await keep(3); go(3); });
    if (step === 3) return run("save", save);
    if (step === 4) go(5);
  };
  /** The connection itself (step 3): discovery runs again on the server; the secret goes once, write-only. */
  const save = async () => {
    const sent = form;
    const r = (await api.manageSso({ action: "save", orgId, config: fieldsOf(sent), ...(secret.trim() ? { secret: secret.trim() } : {}), ...(migration ? { migration } : {}) })) as { saved?: string; hasSecret?: boolean };
    setHeld(sent); setSecret(""); setMigrate(null); setMigration("");
    if (r.hasSecret === false) { setStep(2); setBad({ field: "secret", text: t(k("sa.f.secretNeeded")) }); onReload(); return; }
    // A real save has a new revision, so the read that follows replaces this instance: the next one says "Saved" and
    // takes the focus. Nothing changed: this instance stays and moves on to the test itself (go() clears the message).
    if (r.saved === "unchanged") { go(4); setMsg({ ok: true, text: t(k("sa.saved")) }); onReload(); return; }
    setMsg({ ok: true, text: t(k("sa.saved")) });
    onSaved();
    onReload();
  };
  const fieldErr = (field: string) => (bad?.field === field ? bad.text : undefined);

  return (
    <div className="stack sso-body">
      <LeaveQuestion guard={guard} />
      {editing && <div className="notice stack-sm"><span>{t(k("sa.editing"))}</span>{onClose && <div><Button size="sm" variant="ghost" icon="close" onClick={onClose}>{t(k("sa.stopEdit"))}</Button></div>}</div>}
      {!editing && onClose && <div><Button size="sm" variant="ghost" icon="back" onClick={onClose}>{t(k("sa.stopEdit"))}</Button></div>}
      <nav aria-label={t(k("sa.steps"))}>
        <ol className="sso-steps">
          {STEP_KEYS.map((key, i) => {
            const n = i + 1;
            if (editing && n === 5) return null; // a live connection's edit goes live when its test passes
            const here = n === step;
            return (
              <li key={key} className={here ? "is-here" : n < step ? "is-done" : undefined}>
                <button type="button" className="sso-step" aria-current={here ? "step" : undefined} disabled={n > furthest || !!busy} onClick={() => go(n)}
                  aria-label={`${t(k("sa.stepOf"), { n: num(n), m: num(editing ? 4 : 5) })}: ${t(k(key))}`}>
                  <span className="sso-step-n" aria-hidden>{n < step ? <Icon name="check" size={16} /> : num(n)}</span>
                  <span className="sso-step-name">{t(k(key))}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="sso-head">
        <p className="muted small">{t(k("sa.stepOf"), { n: num(step), m: num(editing ? 4 : 5) })}</p>
        <h4 ref={heading} tabIndex={-1} id={`${id}-h`}>{step === 1 ? t(k("sa.p.title")) : step === 2 ? (!p || p === "oidc" ? t(k("sa.c.titleOidc")) : t(k("sa.c.title"), { provider: t(k(`sa.p.${p}` as SsoKey)) })) : step === 3 ? t(k("sa.w.title")) : step === 4 ? t(k("sa.t.title")) : t(k("sa.o.title"))}</h4>
      </div>

      {step === 1 && (
        <div role="radiogroup" aria-labelledby={`${id}-h`} className="sso-presets">
          {PRESETS.map((x) => <ChoiceCard key={x} icon={PRESET_ICON[x]} title={t(k(`sa.p.${x}` as SsoKey))} description={t(k(`sa.p.${x}D` as SsoKey))} selected={p === x}
            onClick={() => set({ preset: x, ...(x === "microsoft" && !form.secretExpiresOn ? { secretExpiresOn: inMonths(6) } : {}) })} />)}
          {bad?.field === "preset" && <p className="notice err" role="alert">{bad.text}</p>}
        </div>
      )}

      {step === 2 && p && (
        <div className="stack">
          <section className="stack-sm" aria-labelledby={`${id}-cs`}>
            <h5 id={`${id}-cs`}>{t(k("sa.c.steps"))}</h5>
            <ol className="sso-console">
              {CONSOLE[p].map((s) => (
                <li key={s}>
                  <span>{isSsoKey(`sa.cs.${s}`) ? t(k(`sa.cs.${s}` as SsoKey)) : s}</span>
                  {REDIRECT_STEP.test(s) && <CopyLine label={t(k("sa.c.redirect"))} value={data.callbackUrl} hint={t(k("sa.c.redirectHint"))} />}
                </li>
              ))}
            </ol>
            {data.signinUrl && <CopyLine label={t(k("sa.c.signinLink"))} value={data.signinUrl} hint={t(k("sa.c.signinLinkHint"))} />}
          </section>
          <section className="sso-fields" aria-labelledby={`${id}-f`}>
            <h5 id={`${id}-f`}>{t(k("sa.c.fields"))}</h5>
            {p === "microsoft" && <TextField label={t(k("sa.f.tenant"))} hint={t(k("sa.f.tenantHint"))} error={fieldErr("tenant")} value={form.tenant} onChange={(e) => set({ tenant: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />}
            {(p === "okta" || p === "keycloak") && <TextField label={t(k("sa.f.domain"))} hint={t(k(p === "okta" ? "sa.f.domainOkta" : "sa.f.domainKc"))} error={fieldErr("domain")} value={form.domain} onChange={(e) => set({ domain: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />}
            {p === "okta" && <TextField label={t(k("sa.f.oktaServer"))} hint={t(k("sa.f.oktaServerHint"))} error={fieldErr("oktaServer")} value={form.oktaServer} onChange={(e) => set({ oktaServer: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />}
            {p === "keycloak" && <TextField label={t(k("sa.f.realm"))} hint={t(k("sa.f.realmHint"))} error={fieldErr("realm")} value={form.realm} onChange={(e) => set({ realm: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />}
            {p === "oidc" && <TextField label={t(k("sa.f.issuer"))} hint={t(k("sa.f.issuerHint"))} error={fieldErr("issuer")} value={form.issuer} onChange={(e) => set({ issuer: e.target.value })} type="url" dir="ltr" autoComplete="off" spellCheck={false} />}
            <TextField label={t(k("sa.f.clientId"))} hint={p === "google" ? t(k("sa.f.clientIdGoogle")) : p === "microsoft" ? t(k("sa.f.clientIdMs")) : undefined} error={fieldErr("clientId")}
              value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
            {/* Write-only: typed here, sent once with the save (step 3), never shown again, never kept as typed. */}
            <TextField label={t(k(p === "microsoft" ? "sa.f.secretMs" : "sa.f.secret"))} hint={t(k(secretKnown ? "sa.f.secretSaved" : "sa.f.secretHint"))}
              error={fieldErr("secret")} type="password" value={secret} onChange={(e) => { setSecret(e.target.value); setBad(null); }} autoComplete="off" dir="ltr" />
            <TextField label={t(k("sa.f.secretExpires"))} hint={t(k("sa.f.secretExpiresHint"))} error={fieldErr("secretExpiresOn")} type="date" value={form.secretExpiresOn} onChange={(e) => set({ secretExpiresOn: e.target.value })} dir="ltr" />
          </section>
          <div className="row-gap"><Button variant="secondary" icon="sync" loading={busy === "check"} onClick={() => {
            const m = missing(2);
            if (m && m.field !== "secret" && m.field !== "clientId" && m.field !== "secretExpiresOn") { setBad(m); return; }
            void run("check", async () => { await discover(); });
          }}>{t(k("sa.c.check"))}</Button></div>
          {fresh && (
            <div className="notice ok stack-sm" role="status">
              <span><Icon name="check" size={16} /> {t(k("sa.c.ok"), { host: isolate(fresh.host) })}</span>
              <span>{t(k(fresh.pkce === "s256" ? "sa.c.okPkce" : "sa.c.okNoPkce"))}</span>
              {fresh.endSession && <span>{t(k("sa.c.okEnd"))}</span>}
            </div>
          )}
        </div>
      )}

      {step === 3 && p && <WhoStep form={form} set={set} kind={kind} fieldErr={fieldErr} seen={data.config?.lastTest?.ruleValues ?? []} />}

      {step === 3 && migrate && (
        <fieldset className="notice stack-sm sso-fieldset">
          <legend>{t(k("sa.m.title"), { n: migrate.connected })}</legend>
          <span>{migrate.issuerChanged ? t(k("sa.m.issuerChanged")) : t(k("sa.m.body"))}</span>
          {!migrate.issuerChanged && <label className="sso-radio"><input type="radio" name={`${id}-mig`} checked={migration === "same"} onChange={() => setMigration("same")} /><span><strong>{t(k("sa.m.same"))}</strong><small>{t(k("sa.m.sameD"))}</small></span></label>}
          <label className="sso-radio"><input type="radio" name={`${id}-mig`} checked={migration === "new"} onChange={() => setMigration("new")} /><span><strong>{t(k("sa.m.new"))}</strong><small>{t(k("sa.m.newD"))}</small></span></label>
          {/* The fields above can be edited while this asks: check them as Next does before saving. */}
          <div><Button disabled={!migration} loading={busy === "save"} onClick={() => { const m = missing(3); if (m) { setBad(m); return; } void run("save", save); }}>{t(k("sa.m.go"))}</Button></div>
        </fieldset>
      )}

      {step === 4 && <TestStep orgId={orgId} cfg={cfg} slot={slot} editing={editing} kind={savedKind} unsaved={unsaved} />}
      {step === 5 && cfg && !editing && <TurnOnStep orgId={orgId} data={data} cfg={cfg} kind={savedKind} onOn={onOn} onTest={() => go(4)} onBack={() => go(4)} />}

      {/* A refused field with no input of its own on the page (scopes, how the secret is sent…): said here. */}
      {bad && !SHOWN.has(bad.field) && <p className="notice err" role="alert">{bad.text}</p>}
      <Note msg={msg} />
      {step < 5 && <div className="row-gap sso-nav">
        {step > 1 && <Button variant="ghost" icon="back" disabled={!!busy} onClick={() => go(step - 1)}>{t(k("sa.back"))}</Button>}
        {step < 3 && <Button iconEnd="next" loading={busy === "next"} onClick={next}>{t(k("sa.next"))}</Button>}
        {step === 3 && !migrate && <Button iconEnd="next" loading={busy === "save"} onClick={next}>{t(k("sa.w.save"))}</Button>}
        {step === 4 && !editing && cfg && cfg.testedRev === cfg.configRev && <Button iconEnd="next" onClick={next}>{t(k("sa.next"))}</Button>}
      </div>}
    </div>
  );
}

/** Six months from today ("YYYY-MM-DD"): Entra's default client secret lifetime, prefilled for Microsoft. */
const inMonths = (m: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };

/** Step 3: allowed domains, the explicit "everyone", the teacher rule per provider (with the values a test saw), class, session, devices. */
function WhoStep({ form, set, kind, fieldErr, seen }: { form: Form; set: (p: Partial<Form>) => void; kind: "google" | "microsoft" | "other"; fieldErr: (f: string) => string | undefined; seen: string[] }) {
  const { t } = useI18n();
  const id = useId();
  const p = form.preset;
  const generic = kind === "other";
  return (
    <div className="sso-fields">
      <TextField label={t(k("sa.f.allowedDomains"))} hint={`${kind === "google" ? `${t(k("sa.w.domainsGoogle"))} ` : ""}${t(k("sa.w.domainsHint"))}`} error={fieldErr("allowedDomains")}
        value={form.domains} onChange={(e) => set({ domains: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
      {generic && <Switch label={t(k("sa.f.openToAll"))} description={t(k("sa.w.openToAllD"))} checked={form.openToAll && !list(form.domains).length} onChange={(on) => set({ openToAll: on })} />}
      {generic && fieldErr("openToAll") && <p className="notice err" role="alert">{fieldErr("openToAll")}</p>}
      {generic && <Switch label={t(k("sa.w.verified"))} description={t(k("sa.w.verifiedD"))} checked={form.emailsVerifiedBySchool} onChange={(on) => set({ emailsVerifiedBySchool: on })} />}

      <fieldset className="sso-fields sso-fieldset">
        <legend>{t(k("sa.f.teacherRule"))}</legend>
        <Switch label={t(k("sa.w.teacherOn"))} description={form.teacherOn ? undefined : t(k("sa.w.teacherOff"))} checked={form.teacherOn} onChange={(on) => set({ teacherOn: on })} />
        {form.teacherOn && p === "google" && <>
          <TextField label={t(k("sa.w.tDomains"))} hint={t(k("sa.w.tDomainsHint"))} value={form.tDomains} onChange={(e) => set({ tDomains: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
          <label className="sso-area"><span>{t(k("sa.w.tEmails"))}</span>
            <textarea rows={4} value={form.tEmails} onChange={(e) => set({ tEmails: e.target.value })} dir="ltr" spellCheck={false} aria-describedby={`${id}-te`} /></label>
          <small id={`${id}-te`} className="muted">{t(k("sa.w.tEmailsHint"))}</small>
        </>}
        {form.teacherOn && p === "microsoft" && <>
          <div role="radiogroup" aria-label={t(k("sa.f.teacherRule"))} className="stack-sm">
            <ChoiceCard title={t(k("sa.w.tRole"))} description={t(k("sa.w.tRoleD"))} selected={form.tKind === "role"} onClick={() => set({ tKind: "role", tValue: form.tKind === "role" ? form.tValue : "Teacher" })} />
            <ChoiceCard title={t(k("sa.w.tGroup"))} description={t(k("sa.w.tGroupD"))} selected={form.tKind === "group"} onClick={() => set({ tKind: "group", tValue: form.tKind === "group" ? form.tValue : "" })} />
          </div>
          <TextField label={t(k(form.tKind === "group" ? "sa.w.tValueGroup" : "sa.w.tValueRole"))} value={form.tValue} onChange={(e) => set({ tValue: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
        </>}
        {form.teacherOn && p !== "google" && p !== "microsoft" && <>
          <TextField label={t(k("sa.w.tClaim"))} hint={t(k("sa.w.tClaimHint"))} value={form.tClaim} onChange={(e) => set({ tClaim: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
          <TextField label={t(k("sa.w.tValue"))} value={form.tValue} onChange={(e) => set({ tValue: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />
        </>}
        {/* The values the last test saw, offered one tap away (the rule needs the provider's exact string). */}
        {form.teacherOn && p !== "google" && seen.length > 0 && (
          <div className="stack-sm"><small>{t(k("sa.w.tSeen"))}</small>
            <div className="row-gap">{seen.slice(0, 20).map((v) => <Button key={v} size="sm" variant={form.tValue === v ? "primary" : "secondary"} onClick={() => set({ tValue: v })}><bdi dir="ltr">{t(k("sa.w.use"), { value: v })}</bdi></Button>)}</div>
          </div>
        )}
        {fieldErr("teacherRule") && <p className="notice err" role="alert">{fieldErr("teacherRule")}</p>}
      </fieldset>

      <fieldset className="sso-fields sso-fieldset">
        <legend>{t(k("sa.w.more"))}</legend>
        {p !== "google" && <TextField label={t(k("sa.f.classClaim"))} hint={t(k("sa.w.classHint"))} error={fieldErr("classClaim")} value={form.classClaim} onChange={(e) => set({ classClaim: e.target.value })} dir="ltr" autoComplete="off" spellCheck={false} />}
        <TextField label={t(k("sa.f.maxSessionDays"))} hint={t(k("sa.w.sessionHint"))} error={fieldErr("maxSessionDays")} inputMode="numeric" dir="ltr" maxLength={3} value={form.maxSessionDays} onChange={(e) => set({ maxSessionDays: latinDigits(e.target.value) })} />
        <Switch label={t(k("sa.f.personalDevices"))} description={t(k("sa.w.personalD"))} checked={form.personalDevices} onChange={(on) => set({ personalDevices: on })} />
      </fieldset>
    </div>
  );
}

/** How long after the browser's "Leave site?" was answered the admin's own test stops waiting, if the page is still here. */
const STAYED_MS = 800;

/**
 * Step 4: test with the admin's own account (the provider, then back to this tab) or a student's one-time link; the last result.
 * `unsaved`: fields of an earlier step were changed and not saved (the stepper came here without saving). The admin's
 * own test leaves the page, which would lose them (and the browser's "Leave site?" would leave the button waiting for
 * good on Stay), and it tests what is saved, not what is typed: it waits for a save, and the page says so.
 */
function TestStep({ orgId, cfg, slot, editing, kind, unsaved }: { orgId: string; cfg: SsoConfig | null; slot: SsoConn | null; editing: boolean; kind: "google" | "microsoft" | "other"; unsaved: boolean }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  if (!cfg || !slot || !slot.hasSecret) return <p className="notice err" role="alert">{t(k("sa.t.needSecret"))}</p>;
  const mine = async () => {
    if (!user || unsaved) return;
    setBusy("mine"); setMsg(null);
    try {
      const url = await startFlow({ orgId, mode: "test", idToken: await user.getIdToken(), next: location.pathname + location.search });
      // Another form of the page with changes not saved (the name or logo, kept behind its own tab) makes the browser
      // ask "Leave site?" now. On Stay this page goes on, so the button stops waiting a moment after the answer (on
      // Leave the page is on its way out by then). Its guard was added before this listener, so it has answered first.
      addEventListener("beforeunload", (e) => {
        if (e.defaultPrevented) setTimeout(() => setTimeout(() => setBusy((b) => (b === "mine" ? "" : b)), STAYED_MS), 0);
      }, { once: true });
      location.assign(url); // leaves the page: still busy on purpose
    } catch (e) { setMsg({ ok: false, text: refusalText(codeOf(e), t) }); setBusy(""); }
  };
  const student = async () => {
    setBusy("link"); setMsg(null);
    try { setLink((await api.manageSso({ action: "testLink", orgId })) as unknown as { url: string; expiresAt: number }); }
    catch (e) { setMsg({ ok: false, text: whyText(e, t) }); }
    finally { setBusy(""); }
  };
  const test = cfg.lastTest;
  const current = !!test && test.rev === slot.configRev;
  const passed = !editing && cfg.testedRev === cfg.configRev;
  return (
    <div className="stack">
      <p>{t(k("sa.t.intro"))}</p>
      {unsaved && <p className="notice" role="status">{t(k("sa.t.unsaved"))}</p>}
      <div className="row-gap">
        <Button icon="profile" loading={busy === "mine"} disabled={unsaved || (!!busy && busy !== "mine")} onClick={() => { void mine(); }}>{t(k("sa.t.mine"))}</Button>
        <Button variant="secondary" icon="link" loading={busy === "link"} disabled={!!busy && busy !== "link"} onClick={() => { void student(); }}>{t(k("sa.t.student"))}</Button>
      </div>
      <p className="muted small">{t(k("sa.t.studentD"))}</p>
      {link && <CopyLine label={t(k("sa.t.link"))} value={link.url} hint={t(k("sa.t.until"), { date: dateOf(link.expiresAt, locale, true) })} />}
      <Note msg={msg} />
      {passed && (current && test?.ok && (test.decision ?? "").startsWith("refuse:")
        ? <p className="notice" role="status">{t(k("sa.t.passedRefused"))}</p>
        : <p className="notice ok" role="status"><Icon name="check" size={16} /> {t(k("sa.t.passed"))}</p>)}
      {test ? <TestCard test={test} current={current} preset={slot.preset} rule={slot.teacherRule} classClaim={slot.classClaim} /> : <p className="muted">{t(k("sa.t.none"))}</p>}
      {kind !== "other" && !editing && cfg.studentTestOk && <p className="small"><Icon name="check" size={16} /> {t(k("sa.t.studentOk"))}</p>}
    </div>
  );
}

/** Which claims a provider's tokens carry that Darsi reads, in the order the card lists them. */
const CLAIMS: Record<"google" | "microsoft" | "other", string[]> = {
  google: ["email", "email_verified", "name", "hd"],
  microsoft: ["email", "preferred_username", "upn", "name", "tid", "oid", "xms_edov", "roles", "groups"],
  other: ["email", "email_verified", "name", "groups", "roles"],
};

/** The last test: what Darsi would do, in words, and which claims arrived and what each is for. */
export function TestCard({ test, current, preset, rule, classClaim }: { test: SsoLastTest; current: boolean; preset: SsoPreset; rule: SsoConn["teacherRule"]; classClaim: string | null }) {
  const { t, locale } = useI18n();
  const d = test.decision ?? "";
  const refusal = d.startsWith("refuse:") ? d.slice(7) : null;
  const words = !test.ok ? t(k("sa.d.failed"), { why: refusalText(refusal ?? test.error ?? "other", t) })
    : refusal ? `${t(k("sa.r.would"))} ${t(k("sa.d.refuse"), { why: refusalText(refusal, t) })}`
    : isSsoKey(`sa.d.${d}`) ? `${t(k("sa.r.would"))} ${t(k(`sa.d.${d}` as SsoKey))}` : d;
  const kind = providerKind({ preset });
  const own = [rule?.kind === "claim" ? rule.claim : null, classClaim].filter((x): x is string => !!x);
  const names = [...new Set([...CLAIMS[kind], ...own, ...test.claimsSeen.filter((c) => !CLAIMS[kind].includes(c))])];
  const ok = test.ok && !refusal;
  return (
    <section className={`sso-test ${ok ? "is-ok" : "is-bad"}`} aria-labelledby="sso-test-h">
      <h5 id="sso-test-h">{t(k("sa.r.title"))}</h5>
      {!current && <p className="notice" role="note">{t(k("sa.t.old"))}</p>}
      <p className="small muted">{[t(k("sa.r.when"), { date: dateOf(test.at, locale, true) }), test.asStudent ? t(k("sa.r.asStudent")) : ""].filter(Boolean).join(" ")}</p>
      {(test.email || test.name) && <p className="small">{t(k("sa.r.who"), { who: isolate(test.name && test.email ? `${test.name} (${test.email})` : test.name || test.email || "") })}</p>}
      <p className={ok ? "notice ok" : "notice err"}><Icon name={ok ? "check" : "warning"} size={16} /> {words}</p>
      {test.email && !test.emailVerified && test.ok && <p className="small">{t(k("sa.r.unverified"))}</p>}
      {test.teacher !== null && rule && <p className="small">{t(k(test.teacher ? "sa.r.teacherYes" : "sa.r.teacherNo"))}</p>}
      {test.cls && <p className="small">{t(k("sa.r.class"), { cls: isolate(test.cls) })}</p>}
      {test.ok && (
        <div className="stack-sm">
          <h6 id="sso-claims-h">{t(k("sa.r.claims"))}</h6>
          <ul className="sso-claims" aria-labelledby="sso-claims-h">
            {names.map((c) => {
              const sent = test.claimsSeen.includes(c);
              return (
                <li key={c}>
                  <code dir="ltr" translate="no">{c}</code>
                  <span className={sent ? "sso-pill is-ok" : "sso-pill"}>{t(k(sent ? "sa.r.sent" : "sa.r.missing"))}</span>
                  <span className="small">{t(k(isSsoKey(`sa.cl.${c}`) ? `sa.cl.${c}` as SsoKey : "sa.cl.other"))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Step 5: what will be on, who is matched, and Turn on (with Google and Microsoft: a student's test, or the admin's word). */
function TurnOnStep({ orgId, data, cfg, kind, onOn, onTest, onBack }: { orgId: string; data: SsoState; cfg: SsoConfig; kind: "google" | "microsoft" | "other"; onOn: () => void; onTest: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const id = useId();
  const tested = cfg.testedRev === cfg.configRev;
  const needStudent = kind !== "other" && !cfg.studentTestOk;
  const on = async () => {
    setBusy(true); setMsg(null);
    try { await api.manageSso({ action: "turnOn", orgId, ...(needStudent && checked ? { studentChecked: true } : {}) }); onOn(); }
    catch (e) { setMsg({ ok: false, text: whyText(e, t) }); }
    finally { setBusy(false); }
  };
  const rows: [string, ReactNode][] = [
    [t(k("sa.o.provider")), t(k(`sa.p.${cfg.preset}` as SsoKey))],
    [t(k("sa.o.host")), <bdi key="h" dir="ltr">{cfg.host}</bdi>],
    [t(k("sa.o.domains")), cfg.allowedDomains.length ? <bdi key="d" dir="ltr">{cfg.allowedDomains.join(", ")}</bdi> : cfg.openToAll ? t(k("sa.o.anyone")) : "—"],
    [t(k("sa.o.teachers")), cfg.teacherRule ? t(k("sa.o.byRule")) : t(k("sa.o.noTeachers"))],
    [t(k("sa.o.session")), t(k("sa.o.days"), { n: cfg.maxSessionDays })],
    [t(k("sa.o.devices")), t(k(cfg.personalDevices ? "sa.o.yes" : "sa.o.no"))],
  ];
  return (
    <div className="stack">
      <dl className="sso-summary">{rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
      <p>{data.orgMadeToMatch > 0 ? t(k("sa.o.match"), { n: data.orgMadeToMatch }) : t(k("sa.o.matchNone"))}</p>
      {!tested && <div className="notice stack-sm"><span>{t(k("sa.o.needTest"))}</span><div><Button size="sm" variant="secondary" onClick={onTest}>{t(k("sa.step.test"))}</Button></div></div>}
      {tested && needStudent && (
        <div className="stack-sm">
          <span>{t(k("sa.t.studentNeeded"))}</span>
          <label className="sso-check" htmlFor={`${id}-st`}><input id={`${id}-st`} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />{t(k("sa.t.studentChecked"))}</label>
        </div>
      )}
      <Note msg={msg} />
      <div className="row-gap sso-nav">
        <Button variant="ghost" icon="back" disabled={busy} onClick={onBack}>{t(k("sa.back"))}</Button>
        <Button icon="check" loading={busy} disabled={!tested || (needStudent && !checked)} onClick={() => { void on(); }}>{t(k("sa.o.go"))}</Button>
      </div>
    </div>
  );
}

/* ---------- once it is on (or was) ---------- */

/** A problem's words: the reason (a code from functions/src/ssoStore.ts noteProblem) with its hint. */
function problemText(reason: string, hint: string | null, t: T, num: (n: number) => string): string {
  const h = hint && isSsoKey(`sa.h.${hint}`) ? hintText({ hint }, t) : hint && /^\d+$/.test(hint) ? num(Number(hint)) : hint ?? "";
  const key = reason.startsWith("id-token-") ? "sa.pb.id-token" : reason.startsWith("token-") ? "sa.pb.token" : `sa.pb.${reason}`;
  const shown = reason.startsWith("id-token-") ? reason.slice(9) : reason.startsWith("token-") ? (hint ?? reason.slice(6)) : h;
  return isSsoKey(key) ? t(k(key as SsoKey), { hint: isolate(String(shown || "—")) }) : t(k("sa.pb.other"), { reason: isolate(reason), hint: isolate(h || "—") });
}

function StatusCard({ orgId, data, cfg, onEdit, onChanged, say }: { orgId: string; data: SsoState; cfg: SsoConfig; onEdit: () => void; onChanged: () => void; say: (m: Msg) => void }) {
  const { t, num, locale } = useI18n();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const on = cfg.status === "on";
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key); setMsg(null); say(null);
    try { await fn(); setAsk(false); say({ ok: true, text: done }); onChanged(); } catch (e) { setMsg({ ok: false, text: whyText(e, t) }); } finally { setBusy(""); }
  };
  const problems = Object.entries(data.health?.problems ?? {}).sort(([, a], [, b]) => b.lastAt - a.lastAt);
  const expiry = cfg.secretExpiresOn;
  const soon = expiry ? Date.parse(`${expiry}T00:00:00Z`) - Date.now() < 30 * 86_400_000 : false;
  return (
    <div className="stack sso-body">
      <div className="sso-status">
        <span className={on ? "sso-pill is-ok" : "sso-pill"}>{t(k(on ? "sa.s.on" : "sa.s.off"))}</span>
        <span>{!on ? t(k("sa.s.offD")) : cfg.preset === "oidc" ? t(k("sa.s.onDHost"), { host: isolate(cfg.host) }) : t(k("sa.s.onD"), { provider: t(k(`sa.p.${cfg.preset}` as SsoKey)) })}</span>
      </div>
      <div className="tiles">
        <div className="tile"><span>{t(k("sa.s.connected"))}</span><strong>{num(data.connected)}</strong></div>
        <div className="tile"><span>{t(k("sa.s.last"))}</span><strong className="sso-tile-text">{data.lastSignIn ? dateOf(data.lastSignIn, locale) : t(k("sa.s.never"))}</strong></div>
      </div>
      {/* The generic provider's line above names the host already. */}
      {(cfg.preset !== "oidc" || !on) && <p className="small">{t(k("sa.o.host"))}: <bdi dir="ltr">{cfg.host}</bdi></p>}
      {expiry && <p className={soon ? "notice" : "small muted"}>{t(k(soon ? "sa.s.expiresSoon" : "sa.s.expires"), { date: dayOf(expiry, locale) })}</p>}

      <section className="stack-sm" aria-labelledby="sso-pb-h">
        <h5 id="sso-pb-h">{t(k("sa.s.problems"))}</h5>
        {problems.length ? <ul className="sso-problems">{problems.map(([reason, p]) => (
          <li key={reason}><span>{problemText(reason, p.hint, t, (n) => num(n))}</span><small className="muted">{t(k("sa.s.count"), { n: p.n, date: dateOf(p.lastAt, locale, true) })}</small></li>
        ))}</ul> : <p className="muted small">{t(k("sa.s.noProblems"))}</p>}
      </section>

      {data.signinUrl && <CopyLine label={t(k("sa.s.share"))} value={data.signinUrl} hint={t(k("sa.s.shareHint"))} />}
      {on && <ListingPart orgId={orgId} cfg={cfg} onChanged={onChanged} />}

      <Note msg={msg} />
      <div className="row-gap sso-actions">
        <Button variant="secondary" icon="edit" disabled={!!busy} onClick={onEdit}>{t(k(on && cfg.next ? "sa.s.editNext" : "sa.s.edit"))}</Button>
        {on ? <Button variant="ghost" icon="close" aria-expanded={ask} disabled={!!busy} onClick={() => { setMsg(null); setAsk(true); }}>{t(k("sa.s.turnOff"))}</Button>
          : <Button icon="check" loading={busy === "on"} onClick={() => { void act("on", () => api.manageSso({ action: "turnOn", orgId }), t(k("sa.o.done"))); }}>{t(k("sa.s.turnOnAgain"))}</Button>}
      </div>
      {ask && <InlineConfirm danger title={t(k("sa.s.offAsk"))} body={t(k("sa.s.offBody"), { n: data.ssoOnly })} confirmLabel={t(k("sa.s.turnOff"))} busy={busy === "off"}
        onConfirm={() => { void act("off", () => api.manageSso({ action: "turnOff", orgId }), t(k("sa.s.offDone"))); }} onCancel={() => setAsk(false)} />}
    </div>
  );
}

/** The school finder on darsiai.org: ask to be listed (a platform admin approves the name, logo and provider host). */
function ListingPart({ orgId, cfg, onChanged }: { orgId: string; cfg: SsoConfig; onChanged: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const l = cfg.listing;
  const name = isolate(l.name ?? "");
  const ask = async () => {
    setBusy(true); setMsg(null);
    try { await api.manageSso({ action: "requestListing", orgId }); setMsg({ ok: true, text: t(k("sa.l.asked")) }); onChanged(); }
    catch (e) { setMsg({ ok: false, text: whyText(e, t) }); }
    finally { setBusy(false); }
  };
  return (
    <section className="stack-sm" aria-labelledby="sso-l-h">
      <h5 id="sso-l-h">{t(k("sa.l.title"))}</h5>
      <p className="small">{l.state === "requested" ? t(k("sa.l.requested"), { name }) : l.state === "approved" ? t(k("sa.l.approved"), { name })
        : l.state === "refused" ? (l.reason ? t(k("sa.l.refused"), { reason: isolate(l.reason) }) : t(k("sa.l.refusedNoReason"))) : t(k("sa.l.none"))}</p>
      {(l.state === "none" || l.state === "refused") && <div><Button size="sm" variant="secondary" icon="globe" loading={busy} onClick={() => { void ask(); }}>{t(k(l.state === "refused" ? "sa.l.again" : "sa.l.ask"))}</Button></div>}
      <Note msg={msg} />
    </section>
  );
}

/** Platform admins: the most members school sign-in may make for this organization, and whether the keys and signer work. */
function PlatformPart({ orgId, data, onChanged }: { orgId: string; data: SsoState; onChanged: () => void }) {
  const { t, num } = useI18n();
  const [value, setValue] = useState(data.ceiling.value === null ? "" : String(data.ceiling.value));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // Checked here, in the admin's language (no min/max on the input: the browser would refuse in its own words first).
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const empty = value.trim() === "", v = empty ? null : typedWhole(value, 1, 10_000_000);
    if (!empty && v === null) return setMsg({ ok: false, text: t(k("sa.x.ceilingBad")) });
    setBusy(true); setMsg(null);
    try { await api.manageSso({ action: "setCeiling", orgId, ceiling: v }); setMsg({ ok: true, text: t(k("sa.x.saved")) }); onChanged(); }
    catch (x) { setMsg({ ok: false, text: whyText(x, t) }); }
    finally { setBusy(false); }
  };
  const health = (ok: boolean | null | undefined) => <span className={ok ? "sso-pill is-ok" : "sso-pill"}>{t(k(ok ? "sa.x.ok" : "sa.x.bad"))}</span>;
  return (
    <section className="stack-sm sso-platform" aria-labelledby="sso-x-h">
      <h5 id="sso-x-h">{t(k("sa.x.title"))}</h5>
      <form className="stack-sm" onSubmit={(e) => { void save(e); }}>
        <TextField label={t(k("sa.x.ceiling"))} hint={t(k("sa.x.ceilingHint"), { n: num(data.ceiling.default) })} inputMode="numeric" dir="ltr" maxLength={10}
          value={value} onChange={(e) => setValue(latinDigits(e.target.value))} />
        <div><Button type="submit" size="sm" variant="secondary" loading={busy}>{t(k("sa.x.save"))}</Button></div>
      </form>
      <p className="small">{t(k("sa.x.keys"))}: {health(data.keyOk && data.keyCanary !== false)} {t(k("sa.x.signer"))}: {health(data.signerOk)}</p>
      <Note msg={msg} />
    </section>
  );
}

/* ---------- /super/domains: schools asking to be listed in the finder ---------- */

interface Asking { org: { id: string; name: string }; listing: SsoConfig["listing"] }

/**
 * Platform admins: the organizations whose school sign-in is on and not listed, each asked (manageSso get, four at a
 * time) whether it has a listing request, shown with the name, logo and provider host the school's admin sent, to
 * approve (content/sso.json is published again) or refuse with a reason the school's admin sees. Read when the tab
 * first opens; nothing is read live.
 */
export function SsoListings({ orgs }: { orgs: { id: string; name: string; sso?: { on?: boolean; listed?: boolean } | null }[] }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Asking[] | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const [n, setN] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState("");
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const want = orgs.filter((o) => o.sso?.on === true && o.sso.listed !== true);
  const key = want.map((o) => o.id).join(",");
  useEffect(() => {
    let live = true;
    setList(null); setFailed(null);
    (async () => {
      const out: Asking[] = [];
      for (let i = 0; i < want.length; i += 4) {
        const got = await Promise.all(want.slice(i, i + 4).map(async (o) => ({ o, s: (await api.manageSso({ action: "get", orgId: o.id })) as unknown as SsoState })));
        for (const { o, s } of got) if (s.config?.listing.state === "requested") out.push({ org: { id: o.id, name: o.name }, listing: s.config.listing });
      }
      return out.sort((a, b) => (a.listing.at ?? 0) - (b.listing.at ?? 0));
    })().then((x) => { if (live) setList(x); }, (e: unknown) => { if (live) setFailed(e); });
    return () => { live = false; };
  }, [key, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (a: Asking, approve: boolean) => {
    setBusy(a.org.id); setMsg(null);
    try {
      await api.manageSso({ action: "listing", orgId: a.org.id, approve, ...(!approve && reason.trim() ? { reason: reason.trim() } : {}) });
      setMsg({ ok: true, text: approve ? t(k("sa.ls.approved"), { name: isolate(a.listing.name ?? a.org.name) }) : t(k("sa.ls.refused")) });
      setList((l) => (l ?? []).filter((x) => x.org.id !== a.org.id));
      setRefusing(null); setReason("");
    } catch (e) { setMsg({ ok: false, text: whyText(e, t) }); }
    finally { setBusy(""); }
  };
  return (
    <section className="stack sso" aria-labelledby="sso-ls-h">
      <h2 id="sso-ls-h">{t(k("sa.ls.title"), { n: list ? list.length : "…" })}</h2>
      <p className="muted">{t(k("sa.ls.intro"))}</p>
      <Note msg={msg} />
      {failed ? <div className="notice err stack-sm" role="alert"><span>{whyText(failed, t)}</span><div><Button size="sm" variant="secondary" icon="sync" onClick={() => setN((x) => x + 1)}>{t(k("sa.retry"))}</Button></div></div>
        : !list ? <p className="muted" role="status" aria-busy="true">{t(k("sa.ls.loading"))}</p>
        : !list.length ? <p className="muted">{t(k("sa.ls.none"))}</p>
        : list.map((a) => (
          <article key={a.org.id} className="sso-listing" aria-labelledby={`sso-ls-${a.org.id}`}>
            <div className="sso-listing-head">
              {a.listing.logo && /^data:image\/(?:png|webp|jpeg);base64,/.test(a.listing.logo) ? <img src={a.listing.logo} alt="" /> : <span className="sso-listing-logo" title={t(k("sa.ls.noLogo"))}><Icon name="image" /></span>}
              <strong id={`sso-ls-${a.org.id}`}><bdi>{a.listing.name ?? a.org.name}</bdi></strong>
            </div>
            <dl className="sso-summary">
              <div><dt>{t(k("sa.ls.name"))}</dt><dd><bdi>{a.listing.name ?? "—"}</bdi></dd></div>
              <div><dt>{t(k("sa.ls.host"))}</dt><dd><bdi dir="ltr">{a.listing.host ?? "—"}</bdi></dd></div>
              {/* The organization's own name (the listed one can differ), labelled: beside the date it read as the sentence's subject.
                  In <strong>, as every other .person-link's name is: that is what shows it can be tapped (bold, underlined under the pointer). */}
              <div><dt>{t(k("sa.ls.org"))}</dt><dd><Link className="person-link" to={`/super/orgs/${encodeURIComponent(a.org.id)}?tab=signin`}><strong><bdi>{a.org.name}</bdi></strong></Link></dd></div>
            </dl>
            {a.listing.at ? <p className="small muted">{t(k("sa.ls.asked"), { date: dateOf(a.listing.at, locale) })}</p> : null}
            <div className="row-gap">
              <Button size="sm" icon="check" loading={busy === a.org.id && refusing !== a.org.id} disabled={!!busy} onClick={() => { void decide(a, true); }}>{t(k("sa.ls.approve"))}</Button>
              <Button size="sm" variant="ghost" icon="close" disabled={!!busy} aria-expanded={refusing === a.org.id} onClick={() => { setReason(""); setRefusing(a.org.id); }}>{t(k("sa.ls.refuse"))}</Button>
            </div>
            {refusing === a.org.id && (
              <InlineConfirm danger title={t(k("sa.ls.refuse"))} confirmLabel={t(k("sa.ls.refuse"))} busy={busy === a.org.id} onConfirm={() => { void decide(a, false); }} onCancel={() => setRefusing(null)}>
                <TextField label={t(k("sa.ls.reason"))} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} dir="auto" />
              </InlineConfirm>
            )}
          </article>
        ))}
    </section>
  );
}

/* ---------- /super/plans, Switches: school sign-in for everyone ---------- */

/**
 * The platform's switch (manageSso setSwitch; content/settings.json `sso`): off hides every school button and refuses
 * every start. Turning it off asks first (people who sign in only that way are locked out meanwhile); every school's
 * settings stay. `on`/`apply` are the app's settings (content/settings.tsx useSsoOn), passed in by the page.
 */
export function SsoSwitch({ on, apply }: { on: boolean; apply: (on: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const flip = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = (await api.manageSso({ action: "setSwitch", on: !on })) as { on?: boolean };
      const now = r.on === true;
      apply(now); setMsg({ ok: true, text: t(k(now ? "sa.sw.turnedOn" : "sa.sw.turnedOff")) });
    } catch (e) { setMsg({ ok: false, text: whyText(e, t) }); }
    finally { setBusy(false); setAsking(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sso-sw-h"><h3 id="sso-sw-h">{t(k("sa.sw.title"))}</h3>
      <p className={on ? "notice ok" : "notice"} role="status">{t(k(on ? "sa.sw.on" : "sa.sw.off"))}</p>
      {asking && <InlineConfirm danger title={t(k("sa.sw.offAsk"))} body={t(k("sa.sw.offBody"))} confirmLabel={t(k("sa.sw.turnOff"))} busy={busy} onConfirm={() => { void flip(); }} onCancel={() => setAsking(false)} />}
      <div><Button variant={on ? "secondary" : "primary"} icon={on ? "close" : "check"} loading={busy && !asking} onClick={() => { setMsg(null); if (on) setAsking(true); else void flip(); }}>{t(k(on ? "sa.sw.turnOff" : "sa.sw.turnOn"))}</Button></div>
      <Note msg={msg} />
    </section>
  );
}
