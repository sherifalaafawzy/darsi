/**
 * Me's "School sign-in" (a lazy chunk, loaded only for members of an organization; TECHNICAL.md "School sign-in"):
 * - an account with its own login connects the school's sign-in to itself (link mode): a recent sign-in first (the
 *   server wants one within 10 minutes; the password or Google again, here), the school's provider, then a page that
 *   asks before anything is connected; once connected, since when, and Disconnect.
 * - an account the school's sign-in made (no email, no password) adds an email login, so the person keeps their
 *   learning if they leave the school: the address is confirmed by a link first, then a password.
 * One read of the organization (whether its school sign-in is on), once per organization and page.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, TextField } from "@darsi/design-system";
import type { User } from "firebase/auth";
import { isolate, useI18n } from "../i18n";
import { call, loadFirebase } from "../fb";
import { useAuth } from "./AuthProvider";
import { codeOf, finishFlow, releaseReturn, startFlow, takeReturn } from "./ssoFlow";
import { k, type SsoWordKey } from "./ssoWords";
import { SsoProblem } from "./SchoolFinder";

/** The server wants a sign-in within 10 minutes for a link; a minute's margin for the trip to the provider. */
export const RECENT_MS = 9 * 60_000;

const ssoOf = new Map<string, Promise<{ on: boolean; slug: string | null }>>();
/** orgs/{orgId}.sso, read once per organization and page (one-shot; no listener). */
function orgSso(orgId: string) {
  if (!ssoOf.has(orgId)) {
    ssoOf.set(orgId, (async () => {
      const [{ db }, { doc, getDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      const s = (await getDoc(doc(db, "orgs", orgId))).get("sso") as { on?: unknown; slug?: unknown } | undefined;
      return { on: s?.on === true, slug: typeof s?.slug === "string" ? s.slug : null };
    })().catch((e: unknown) => { ssoOf.delete(orgId); throw e; }));
  }
  return ssoOf.get(orgId)!;
}
const unlink = call<{ action: "unlink"; orgId: string; uid: string }, { unlinked: number }>("manageSso");
const authCode = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
/**
 * Why manageSso refused, for Disconnect: school sign-in's own refusal (details.reason "sso-…", worded by SsoProblem),
 * or the general words for the callable's error: the connection, an account that may not (its role or organization
 * changed, or its session ended), or "that didn't work". Never "signing in through your school didn't work": nobody
 * was signing in.
 */
export function unlinkProblem(e: unknown): { sso: string } | { key: SsoWordKey } {
  const reason = String((e as { details?: { reason?: unknown } } | null)?.details?.reason ?? "");
  if (reason.startsWith("sso-")) return { sso: reason };
  const code = authCode(e);
  if (/permission-denied|unauthenticated/.test(code)) return { key: "ss.me.notAllowed" };
  if (/unavailable|deadline-exceeded|network/.test(code) || (typeof navigator !== "undefined" && navigator.onLine === false)) return { key: "ss.rf.network" };
  return { key: "ss.me.fail" };
}

/** finish's first answer for a link: who it is, to confirm; or already connected. */
type LinkAnswer = { confirm?: { email?: string | null; school?: string | null }; linked?: boolean; email?: string | null };
const asking = new Map<string, Promise<LinkAnswer>>();
/** A link's return, finished as far as the confirmation page, whose answer needs the same ticket and verifier again. */
type Back = { busy: true } | { code: string; detail?: string } | { ask: { email: string | null; school: string | null }; ticket: string; verifier: string } | { linked: string | null };

export function SchoolLink() {
  const { t } = useI18n();
  const { user, profile, orgId, sso } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [org, setOrg] = useState<{ on: boolean; slug: string | null } | null>(null);
  const [back, setBack] = useState<Back | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    orgSso(orgId).then((o) => { if (live) setOrg(o); }, () => {});
    return () => { live = false; };
  }, [orgId]);

  // Back from the school's provider (/me#sso=…&f=…): the fragment goes first, then finish asks who it is for.
  useEffect(() => {
    const r = takeReturn(loc.hash);
    if (loc.hash) nav({ pathname: loc.pathname, search: loc.search }, { replace: true, state: loc.state });
    if (!r || !user) return;
    if ("lost" in r) { releaseReturn(); if (r.mode === "link") setBack({ code: "lost" }); return; }
    if ("error" in r) { if (r.record && r.record.mode !== "link") return; releaseReturn(); setBack({ code: r.error, ...(r.detail ? { detail: r.detail } : {}) }); return; }
    if (r.record.mode !== "link") return;
    let live = true;
    setBack({ busy: true });
    // Once per ticket, however often the row mounts (StrictMode mounts twice).
    if (!asking.has(r.ticket)) asking.set(r.ticket, user.getIdToken().then((idToken) => finishFlow<LinkAnswer>(r.ticket, r.record.verifier, { idToken })).finally(releaseReturn));
    asking.get(r.ticket)!.then(
      (a) => { if (live) setBack(a.confirm ? { ask: { email: a.confirm.email ?? null, school: a.confirm.school ?? null }, ticket: r.ticket, verifier: r.record.verifier } : { linked: a.email ?? null }); },
      (e: unknown) => { if (live) setBack({ code: codeOf(e) }); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !orgId) return null;
  const made = profile?.sso === true; // the school's sign-in made this account: it has no other way in yet
  const linkedAt = typeof profile?.ssoLinkedAt === "number" ? profile.ssoLinkedAt : null;
  if (!back && !made && !linkedAt && !org?.on) return null;
  return (
    <section className="stack-sm" aria-labelledby="ssome-h">
      <h3 id="ssome-h">{t(k("ss.me.title"))}</h3>
      {/* A personal account opened by the school's sign-in: the account's own login stays the way to change it. */}
      {sso && !made && <p className="muted small">{t(k("ss.me.viaSchool"))}</p>}
      {back && "busy" in back && <p className="muted" role="status" aria-busy="true">{t(k("ss.me.working"))}</p>}
      {back && "code" in back && <SsoProblem code={back.code} detail={back.detail} />}
      {back && "ask" in back ? <ConfirmLink user={user} ask={back} onDone={setBack} />
        // Just connected: said with the address, above the usual row (the profile's ssoLinkedAt arrives a moment later).
        : back && "linked" in back ? <>
          {back.linked && <p className="notice ok" role="status">{t(k("ss.me.connectedAs"), { email: isolate(back.linked) })}</p>}
          <Connected user={user} orgId={orgId} at={linkedAt ?? Date.now()} />
        </>
        : made ? <EmailLogin user={user} />
        : linkedAt ? <Connected user={user} orgId={orgId} at={linkedAt} />
        : org?.on ? <Connect user={user} orgId={orgId} />
        : null}
    </section>
  );
}

/** "Connect … to this Darsi account?": nothing is connected until the person says so (finish with confirm). */
function ConfirmLink({ user, ask, onDone }: { user: User; ask: Extract<Back, { ask: unknown }>; onDone: (b: Back | null) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const yes = async () => {
    setBusy(true);
    try {
      const a = await finishFlow<{ linked?: boolean; email?: string | null }>(ask.ticket, ask.verifier, { idToken: await user.getIdToken(), confirm: true });
      onDone({ linked: a.email ?? ask.ask.email });
    } catch (e) { onDone({ code: codeOf(e) }); }
  };
  return (
    <div ref={box} tabIndex={-1} role="group" aria-labelledby="ssome-ask" className="notice stack auth-ask">
      <strong id="ssome-ask">{ask.ask.email ? t(k("ss.me.ask"), { email: isolate(ask.ask.email) }) : t(k("ss.me.askNoEmail"))}</strong>
      {ask.ask.school && <span>{t(k("ss.me.askSchool"), { school: isolate(ask.ask.school) })}</span>}
      <span>{t(k("ss.me.askBody"))}</span>
      <div className="row-gap">
        <Button loading={busy} onClick={() => { void yes(); }}>{t(k("ss.me.yes"))}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDone(null)}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}

/**
 * Connect: a sign-in within the last few minutes first (the server checks auth_time), asked for here with the
 * account's own way in (its password, or Google); an account with neither signs out and in again.
 */
function Connect({ user, orgId }: { user: User; orgId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reauth, setReauth] = useState(false);
  const [pw, setPw] = useState("");
  const providers = user.providerData.map((p) => p.providerId);
  const go = async (fresh = false) => {
    setBusy(true); setErr("");
    try {
      const r = await user.getIdTokenResult(fresh);
      if (Date.now() - Date.parse(r.authTime) > RECENT_MS) { setReauth(true); setBusy(false); return; }
      const url = await startFlow({ orgId, mode: "link", idToken: r.token, next: "/me" });
      location.assign(url); // leaves the page: still busy on purpose
    } catch (e) {
      const c = codeOf(e);
      if (c === "sso-recent") setReauth(true); else setErr(c);
      setBusy(false);
    }
  };
  const withPassword = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const { EmailAuthProvider, reauthenticateWithCredential } = await import("firebase/auth");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", pw));
      setPw(""); setReauth(false);
      await go(true);
    } catch (x) { setErr(/wrong-password|invalid-credential/.test(authCode(x)) ? "wrong-password" : authCode(x).includes("network") ? "network" : "other"); setBusy(false); }
  };
  const withGoogle = async () => {
    setBusy(true); setErr("");
    try {
      const { GoogleAuthProvider, reauthenticateWithPopup } = await import("firebase/auth");
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      setReauth(false);
      await go(true);
    } catch (x) { if (!/popup-closed|cancelled-popup/.test(authCode(x))) setErr(authCode(x).includes("network") ? "network" : "other"); setBusy(false); }
  };
  return (
    <div className="stack">
      <p className="muted small">{t(k("ss.me.intro"))}</p>
      {!reauth ? <div><Button variant="secondary" icon="link" loading={busy} onClick={() => { void go(); }}>{t(k("ss.me.connect"))}</Button></div>
        : <div className="notice stack auth-ask" role="group" aria-labelledby="ssome-re">
          <strong id="ssome-re">{t(k("ss.me.confirmFirst"))}</strong>
          {providers.includes("password") && user.email && (
            <form className="stack-sm" onSubmit={(e) => { void withPassword(e); }}>
              <TextField label={t(k("ss.me.password"))} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
              <div><Button type="submit" loading={busy}>{t(k("ss.me.confirm"))}</Button></div>
            </form>
          )}
          {providers.includes("google.com") && <div><Button variant="secondary" loading={busy} onClick={() => { void withGoogle(); }}>{t(k("ss.me.withGoogle"))}</Button></div>}
          {!providers.includes("password") && !providers.includes("google.com") && <span>{t(k("ss.me.signAgain"))}</span>}
          <div><Button variant="ghost" disabled={busy} onClick={() => { setReauth(false); setErr(""); }}>{t("common.cancel")}</Button></div>
        </div>}
      {err === "wrong-password" ? <p className="notice err" role="alert">{t(k("ss.me.wrongPw"))}</p> : err && <SsoProblem code={err} />}
    </div>
  );
}

/** Connected since …, with Disconnect (asked first). The server refuses when it would leave no way in. */
function Connected({ user, orgId, at }: { user: User; orgId: string; at: number }) {
  const { t, locale } = useI18n();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<"done" | ReturnType<typeof unlinkProblem> | null>(null);
  const off = async () => {
    setBusy(true); setMsg(null);
    try { await unlink({ action: "unlink", orgId, uid: user.uid }); setMsg("done"); setAsk(false); }
    catch (e) { setMsg(unlinkProblem(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack-sm">
      <p>{t(k("ss.me.since"), { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(at) })}</p>
      {!ask ? <div><Button variant="ghost" icon="close" onClick={() => { setMsg(null); setAsk(true); }}>{t(k("ss.me.disconnect"))}</Button></div>
        : <div className="notice stack auth-ask" role="group" aria-labelledby="ssome-off">
          <strong id="ssome-off">{t(k("ss.me.disconnectAsk"))}</strong>
          <span>{t(k("ss.me.disconnectBody"))}</span>
          <div className="row-gap">
            <Button loading={busy} onClick={() => { void off(); }}>{t(k("ss.me.disconnect"))}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAsk(false)}>{t("common.cancel")}</Button>
          </div>
        </div>}
      {msg === "done" ? <p className="notice ok" role="status">{t(k("ss.me.disconnected"))}</p>
        : msg && ("sso" in msg ? <SsoProblem code={msg.sso} /> : <p className="notice err" role="alert">{t(k(msg.key))}</p>)}
    </div>
  );
}

/**
 * Add an email login, for an account only the school's sign-in opens: the address is confirmed by Firebase's link
 * (verifyBeforeUpdateEmail sets it only once opened), then a password is added to it (linkWithCredential). Either
 * step may ask for a recent sign-in: the school's button again, then back here, where it carries on from what is done.
 */
function EmailLogin({ user }: { user: User }) {
  const { t, lang, num } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, redraw] = useState(0);
  const has = user.providerData.some((p) => p.providerId === "password");
  const fail = (x: unknown) => {
    const c = authCode(x);
    setErr(c.includes("requires-recent-login") ? t(k("ss.me.recent")) : c.includes("email-already-in-use") ? t(k("ss.me.emailUsed"))
      : c.includes("invalid-email") ? t(k("ss.me.emailBad")) : c.includes("weak-password") ? t("auth.errWeak") : c.includes("network") ? t("auth.errNetwork") : t(k("ss.me.fail")));
    setBusy(false);
  };
  const send = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const [{ auth }, { verifyBeforeUpdateEmail }] = await Promise.all([loadFirebase(), import("firebase/auth")]);
      auth.languageCode = lang;
      await verifyBeforeUpdateEmail(user, email.trim());
      setSent(email.trim()); setBusy(false);
    } catch (x) { fail(x); }
  };
  const opened = async () => {
    setBusy(true); setErr("");
    try { await user.reload(); if (!user.email) setErr(t(k("ss.me.notYet"))); redraw((n) => n + 1); setBusy(false); } catch (x) { fail(x); }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr(t("auth.errWeak"));
    if (pw !== pw2) return setErr(t("auth.errMatch"));
    setBusy(true);
    try {
      const { EmailAuthProvider, linkWithCredential } = await import("firebase/auth");
      await linkWithCredential(user, EmailAuthProvider.credential(user.email!, pw));
      setPw(""); setPw2(""); setBusy(false); redraw((n) => n + 1);
    } catch (x) { fail(x); }
  };
  if (has && user.email) return <p className="notice ok" role="status">{t(k("ss.me.done"), { email: isolate(user.email) })}</p>;
  return (
    <div className="stack-sm">
      <strong>{t(k("ss.me.emailTitle"))}</strong>
      <p className="muted small">{t(k("ss.me.emailIntro"))}</p>
      {!user.email ? (sent
        ? <div className="stack-sm"><p className="notice" role="status">{t(k("ss.me.sent"), { email: isolate(sent) })}</p>
            <div className="row-gap"><Button variant="secondary" loading={busy} onClick={() => { void opened(); }}>{t(k("ss.me.opened"))}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSent("")}>{t("common.cancel")}</Button></div></div>
        : <form className="stack-sm" onSubmit={(e) => { void send(e); }}>
            <TextField label={t(k("ss.me.step1"), { n: num(1), m: num(2) })} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required dir="ltr" />
            <div><Button type="submit" variant="secondary" loading={busy}>{t(k("ss.me.send"))}</Button></div>
          </form>)
        : <form className="stack-sm" onSubmit={(e) => { void save(e); }}>
            <p className="small">{t(k("ss.me.step2"), { n: num(2), m: num(2) })}</p>
            <TextField label={t("auth.newPassword")} hint={t("auth.pwHint")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
            <TextField label={t("auth.repeatPassword")} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            <div><Button type="submit" loading={busy}>{t(k("ss.me.save"))}</Button></div>
          </form>}
      {err && <p className="notice err" role="alert">{err}</p>}
    </div>
  );
}
