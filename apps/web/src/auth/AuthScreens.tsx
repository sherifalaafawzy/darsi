import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { User, UserCredential } from "firebase/auth";
import { Button, Mark, TextField } from "@darsi/design-system";
import { loadFirebase } from "../fb";
import { isolate, useI18n } from "../i18n";
import { useStore } from "../state/store";
import { isNative } from "../platform";
import { api, loginToEmail } from "./api";
import { createLearnerProfile, useAuth } from "./AuthProvider";
import { track } from "../analytics/track";

/*
 * After a sign-in or sign-up these screens never navigate. AuthProvider publishes the account (its claims first), the
 * app remounts in that account's store at the same address, and SignedIn (App.tsx) sends each role on from there: org
 * and platform admins to their dashboards, an invite code (?code=) to /org. A nav() here would run before that and land
 * everyone, admins included, in the learner's onboarding.
 */

/** The SDK pieces these screens use, loaded on demand: the form shows at once, the SDK arrives while people type. */
const authSdk = async () => {
  const [fb, a] = await Promise.all([loadFirebase(), import("firebase/auth")]);
  return { ...a, auth: fb.auth, db: fb.db };
};

/** An invite code as the server reads it (functions/src/passwords.ts normalizeCode), or null when it isn't one. */
export function inviteCode(raw: string | null): string | null {
  const s = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : null;
}

/**
 * Apps that open links in their own browser (Facebook, Instagram, WhatsApp, Telegram, LINE, WeChat…; Android WebViews).
 * Google refuses to sign in there, so the Google button explains how to open Darsi in the phone's browser instead.
 * Darsi's own app (Capacitor) is a WebView too, but it signs in its own way.
 */
export const inAppBrowser = (ua: string) => /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Telegram|\bLine\/|MicroMessenger|Snapchat|musical_ly|BytedanceWebview|; wv\)/i.test(ua);
/** Set before leaving for Google's page, so the button finishes the sign-in when the page comes back. */
const REDIRECT_KEY = "darsi:googleRedirect";
/** The popup can't open here: go to Google's page instead, and come back to this address (with its ?code= or ?org=1). */
const noPopup = (code: string) => code.includes("popup-blocked") || code.includes("operation-not-supported-in-this-environment");
/** Neither the popup nor the redirect can work in this browser (in-app browsers, storage switched off). */
const noGoogleHere = (code: string) => code.includes("web-storage-unsupported") || code.includes("operation-not-supported-in-this-environment");

/**
 * A Google account signed in: a new one gets its learner profile (fields the security rules allow). A profile without an
 * email was started by a function (joining from an invite link, on a slow connection, can get there first), so it is
 * still new: createLearnerProfile adds the name and language to it.
 */
async function afterGoogle(user: User, lang: string) {
  const [{ db }, { doc, getDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
  const snap = await getDoc(doc(db, "users", user.uid));
  const isNew = !snap.exists() || !snap.get("email");
  if (isNew) await createLearnerProfile(user.uid, { name: user.displayName ?? "", email: (user.email ?? "").toLowerCase(), lang });
  track(isNew ? "sign_up" : "sign_in", { m: "google" });
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { t } = useI18n();
  const { ensureFirebase, configured } = useAuth();
  // Opening an account screen is the moment to fetch the SDK and start listening for sign-in.
  useEffect(() => { if (configured) ensureFirebase().catch(() => {}); }, [configured, ensureFirebase]);
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link to="/" className="auth-brand" aria-label={t("app.name")}><Mark size={48} /></Link>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {children}
      </div>
    </main>
  );
}
const errText = (code: string, t: ReturnType<typeof useI18n>["t"]) =>
  code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") ? t("auth.errCreds")
  : code.includes("email-already-in-use") ? t("auth.errExists")
  : code.includes("weak-password") ? t("auth.errWeak")
  : code.includes("network") || code.includes("fetch") ? t("auth.errNetwork") // "fetch": the SDK itself couldn't download
  : code.includes("too-many-requests") ? t("auth.errTooMany")
  : code.includes("popup-blocked") ? t("auth.errPopup")
  : code.includes("user-disabled") ? t("auth.errDisabled") // a platform admin suspended it (functions/src/account.ts)
  : code.includes("invalid-email") ? t("auth.errEmail") // "amina@": the login field takes anything with an @ as an email
  : t("auth.errGeneric");
/** Closing the Google window (or tapping twice) is a choice, not an error. */
const quiet = (code: string) => code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request") || code.includes("user-cancelled");

export function SignIn() {
  const { t } = useI18n();
  const { ensureFirebase } = useAuth();
  // From an invite link's "I already have an account": SignedIn joins with it once this account is signed in.
  const [params] = useSearchParams();
  const raw = params.get("code");
  const code = inviteCode(raw);
  const [login, setLogin] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await ensureFirebase(); // listening, so the account is published the moment it signs in
      const { auth, signInWithEmailAndPassword } = await authSdk();
      await signInWithEmailAndPassword(auth, loginToEmail(login), pw);
      track("sign_in", { m: login.includes("@") ? "email" : "username" });
      // Still busy on purpose: the app moves on by itself (SignedIn), and a second tap must not sign in twice.
    } catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); setBusy(false); }
  };
  return (
    <Shell title={t("auth.signInTitle")} sub={t("auth.signInSub")}>
      {code && <p className="notice">{t("auth.joinAfter", { code: isolate(code) })}</p>}
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.login")} hint={t("auth.loginHint")} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        <TextField label={t("auth.password")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <p className="notice err" role="alert">{err}</p>}
        <Button type="submit" block loading={busy}>{t("auth.signIn")}</Button>
      </form>
      <GoogleButton />
      <p className="auth-links"><Link to="/forgot">{t("auth.forgot")}</Link> <Link to={raw ? `/signup?code=${encodeURIComponent(raw)}` : "/signup"}>{t("auth.noAccount")}</Link></p>
      <GuestButton />
    </Shell>
  );
}

export function SignUp() {
  const { t, lang } = useI18n();
  const { ensureFirebase } = useAuth();
  const [params, setParams] = useSearchParams();
  const wantsOrg = params.get("org") === "1";
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  // An invite code (typed, or from an invite link: /signup?code=…) stays in the address: signing up remounts the app,
  // and SignedIn (App.tsx) then sends the new account to /org, which joins the organization with it.
  const code = params.get("code") ?? "";
  const setCode = (v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v.trim()) n.set("code", v.toUpperCase()); else n.delete("code"); return n; }, { replace: true });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await ensureFirebase(); // listening, so the new account is published the moment it exists
      const { auth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile: fbUpdateProfile } = await authSdk();
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      // The app has usually moved on by now (SignedIn: /learn, /org?code=… or /org?request=1); this finishes regardless.
      await fbUpdateProfile(cred.user, { displayName: name.trim() });
      // Admins see whether an account's email is verified before they give it access (H1); a failed send never blocks sign-up.
      auth.languageCode = lang;
      void sendEmailVerification(cred.user).catch(() => {});
      await createLearnerProfile(cred.user.uid, { name: name.trim(), email: email.trim().toLowerCase(), lang });
      track("sign_up", { m: "email" });
    } catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); setBusy(false); }
  };
  return (
    <Shell title={wantsOrg ? t("auth.signUpOrgTitle") : t("auth.signUpTitle")} sub={wantsOrg ? t("auth.signUpOrgSub") : t("auth.signUpSub")}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
        <TextField label={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <TextField label={t("auth.password")} hint={t("auth.pwHint")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={8} />
        {!wantsOrg && <TextField label={t("auth.inviteCode")} hint={t("auth.inviteCodeHint")} value={code} onChange={(e) => setCode(e.target.value)}
          dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} />}
        {err && <p className="notice err" role="alert">{err}</p>}
        <Button type="submit" block loading={busy}>{t("auth.create")}</Button>
      </form>
      <GoogleButton />
      {/* An invite link's code goes along: signed in, SignedIn joins with it. */}
      <p className="auth-links"><Link to={code ? `/signin?code=${encodeURIComponent(code)}` : "/signin"}>{t("auth.haveAccount")}</Link></p>
      <p className="muted small">{t("auth.orgNote")}</p>
      {!wantsOrg && <GuestButton />}
    </Shell>
  );
}

/** Guest mode: learn on this device without an account (progress moves into an account created later). */
export function GuestButton() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { dispatch } = useStore();
  return (
    <div className="stack-sm">
      <Button block variant="ghost" onClick={() => { dispatch({ type: "set", patch: { guest: true } }); nav("/learn"); }}>{t("guest.cta")}</Button>
      <p className="muted small">{t("guest.note")}</p>
    </div>
  );
}

/** Shown on the account screens while apps/web/.env.local has no Firebase config: guest use still works. */
export function NotConfigured() {
  const { t } = useI18n();
  return (
    <Shell title={t("app.name")}>
      <p className="notice">{t("auth.notConfigured")}</p>
      <GuestButton />
    </Shell>
  );
}

/** Coming back from Google's page: one answer for the page, however often the button mounts (StrictMode mounts twice). */
let comingBack: Promise<User | null> | null = null;
function backFromGoogle(ensureFirebase: () => Promise<void>, lang: string): Promise<User | null> | null {
  if (comingBack) return comingBack;
  let back = false;
  try { back = sessionStorage.getItem(REDIRECT_KEY) === "1"; sessionStorage.removeItem(REDIRECT_KEY); } catch { /* private mode */ }
  if (!back) return null;
  comingBack = (async () => {
    await ensureFirebase(); // AuthProvider's listener publishes the account; the result here only finishes a new one
    const { auth, getRedirectResult } = await authSdk();
    const cred = await getRedirectResult(auth);
    // Auth can take the result in itself as it starts; the account is then already its current user.
    const user = cred?.user ?? auth.currentUser ?? null;
    if (user) await afterGoogle(user, lang); // keeps going after the app has moved on
    return user;
  })();
  void comingBack.catch(() => {}).finally(() => { comingBack = null; });
  return comingBack;
}

/**
 * Google sign-in: a popup, or, where the popup can't open, a trip to Google's page that comes back to this address
 * (with its ?code= or ?org=1). Either way the account is published through AuthProvider and SignedIn moves on; this
 * only makes a new account's profile. In-app browsers can do neither (Google refuses them), so it says how to open
 * Darsi in the phone's browser instead.
 */
function GoogleButton() {
  const { t, lang } = useI18n();
  const { ensureFirebase } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [elsewhere, setElsewhere] = useState(false); // explain: open Darsi in the phone's browser
  // Browsers only allow the sign-in popup straight from the tap, so wait until the SDK is here before enabling it.
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; ensureFirebase().then(() => live && setReady(true)).catch(() => {}); return () => { live = false; }; }, [ensureFirebase]);
  const fail = (x: unknown) => {
    const code = String((x as { code?: string }).code ?? x);
    if (noGoogleHere(code)) setElsewhere(true); else if (!quiet(code)) setErr(errText(code, t));
    setBusy(false);
  };
  useEffect(() => {
    const back = backFromGoogle(ensureFirebase, lang);
    if (!back) return;
    let live = true;
    setBusy(true);
    back.then((user) => { if (live && !user) setBusy(false); }, (x) => { if (live) fail(x); }); // nobody: came back without signing in
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack-sm">
      <Button block variant="secondary" loading={busy || !ready} onClick={async () => {
        setErr("");
        if (!isNative() && inAppBrowser(navigator.userAgent)) { setElsewhere(true); return; }
        setBusy(true);
        try {
          const { auth, signInWithPopup, signInWithRedirect, GoogleAuthProvider } = await authSdk();
          let cred: UserCredential;
          try { cred = await signInWithPopup(auth, new GoogleAuthProvider()); }
          catch (x) {
            if (!noPopup(String((x as { code?: string }).code ?? x))) throw x;
            try { sessionStorage.setItem(REDIRECT_KEY, "1"); } catch { /* private mode: the account still arrives */ }
            return await signInWithRedirect(auth, new GoogleAuthProvider()); // leaves the page
          }
          await afterGoogle(cred.user, lang);
          // Still busy on purpose: the app moves on by itself (SignedIn), and a second tap must not sign in twice.
        } catch (x) { fail(x); }
      }}>{t("auth.google")}</Button>
      {err && <p className="notice err" role="alert">{err}</p>}
      {elsewhere && <OpenInBrowser />}
    </div>
  );
}

/** In an app's own browser: how to open this page (and its invite code) in the phone's browser, with the link to copy. */
function OpenInBrowser() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = typeof location !== "undefined" ? location.href : "";
  return (
    <div className="notice stack-sm" role="alert">
      <p className="auth-url">{t("auth.inApp")}</p>
      <p className="auth-url small" dir="ltr" translate="no">{link}</p>
      <div><Button size="sm" variant="secondary" icon="link" onClick={() => {
        void navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false));
      }}>{t("auth.copyLink")}</Button></div>
      {/* Always in the page, so screen readers hear it when it fills. */}
      <p className="auth-url small" role="status">{copied ? t("auth.copied") : ""}</p>
    </div>
  );
}

export function Forgot() {
  const { t, lang } = useI18n();
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false);
  return (
    <Shell title={t("auth.forgotTitle")} sub={t("auth.forgotSub")}>
      {sent ? <p className="notice ok">{t("auth.forgotSent")}</p> : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          // The email comes in the person's language (Firebase's own wording; English for a language it doesn't have).
          try { const { auth, sendPasswordResetEmail } = await authSdk(); auth.languageCode = lang; await sendPasswordResetEmail(auth, email.trim()); } catch { /* do not reveal */ }
          setSent(true); setBusy(false);
        }}>
          <TextField label={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <Button type="submit" block loading={busy}>{t("auth.sendLink")}</Button>
          <p className="muted small">{t("auth.forgotUsername")}</p>
        </form>
      )}
      <p className="auth-links"><Link to="/signin">{t("auth.backToSignIn")}</Link></p>
    </Shell>
  );
}

/** Accounts created by an admin must choose their own password at first sign-in. */
export function SetPassword() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr(t("auth.errWeak"));
    if (pw !== pw2) return setErr(t("auth.errMatch"));
    setBusy(true);
    try {
      const { updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import("firebase/auth");
      // The password the organization gave out (on the printed login slip) must not stay in use. Signing in again with
      // the new one tells: it works only if it is the same. (passwordChanged on the server can't compare passwords.)
      const same = user!.email ? await reauthenticateWithCredential(user!, EmailAuthProvider.credential(user!.email, pw)).then(() => true, (x) => {
        const code = String((x as { code?: string }).code ?? x);
        if (code.includes("invalid-credential") || code.includes("wrong-password")) return false;
        throw x;
      }) : false;
      if (same) return setErr(t("auth.errSamePw"));
      await updatePassword(user!, pw); await api.passwordChanged({});
    } catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); } finally { setBusy(false); }
  };
  return (
    <Shell title={t("auth.setPwTitle")} sub={t("auth.setPwSub")}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.newPassword")} hint={t("auth.pwHint")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
        <TextField label={t("auth.repeatPassword")} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
        {err && <p className="notice err" role="alert">{err}</p>}
        <Button type="submit" block loading={busy}>{t("auth.savePassword")}</Button>
        <Button block variant="ghost" onClick={() => signOut()}>{t("auth.signOut")}</Button>
      </form>
    </Shell>
  );
}
