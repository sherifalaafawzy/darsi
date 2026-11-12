import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { User, UserCredential } from "firebase/auth";
import { BrandMark, Button, TextField, useBrand } from "@darsi/design-system";
import { call, loadFirebase } from "../fb";
import { isolate, useI18n } from "../i18n";
import { useStore } from "../state/store";
import { isNative } from "../platform";
import { api, loginToEmail } from "./api";
import { createLearnerProfile, useAuth } from "./AuthProvider";
import { LeftOrgNote } from "./LeftOrg";
import { track } from "../analytics/track";
import { LEGAL_DOCS, publishedVersions, useLegal, type LegalDoc, type LegalVersions } from "../legal/published";
import { k } from "../legal/strings";
import { useSite } from "../state/site";
import { useSsoOn } from "../content/settings";
import { loadSchoolFinder, RETURN, returnedTo, ssoNote } from "./sso";

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
/** Beside REDIRECT_KEY: the versions ticked on the sign-up screen before leaving for Google's page. */
const AGREED_KEY = "darsi:googleAgreed";

/**
 * The privacy notice and terms someone ticked on the sign-up screen, recorded on their new account (acceptTerms writes
 * users/{uid}.terms; the profile must exist, so this comes after createLearnerProfile). Never in the way of signing up:
 * the account exists by now, and a failure (the connection, a version published a minute ago) is not the person's to fix.
 */
const recordAgreed = (versions: LegalVersions | null) => {
  if (versions) void call<LegalVersions, { ok: boolean }>("acceptTerms")(versions).catch(() => {});
};
/** The versions kept across the trip to Google's page, read once. */
function takeAgreed(): LegalVersions | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(AGREED_KEY) ?? "null") as Record<string, unknown> | null;
    sessionStorage.removeItem(AGREED_KEY);
    const out: LegalVersions = {};
    for (const doc of LEGAL_DOCS) { const n = v?.[doc]; if (typeof n === "number" && Number.isInteger(n) && n > 0) out[doc] = n; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/**
 * A Google account signed in: a new one gets its learner profile (fields the security rules allow). A profile without an
 * email was started by a function (joining from an invite link, on a slow connection, can get there first), so it is
 * still new: createLearnerProfile adds the name and language to it. Answers whether the account is new.
 */
async function afterGoogle(user: User, lang: string) {
  const [{ db }, { doc, getDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
  const snap = await getDoc(doc(db, "users", user.uid));
  const isNew = !snap.exists() || !snap.get("email");
  if (isNew) await createLearnerProfile(user.uid, { name: user.displayName ?? "", email: (user.email ?? "").toLowerCase(), lang });
  track(isNew ? "sign_up" : "sign_in", { m: "google" });
  return isNew;
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { t } = useI18n();
  const brand = useBrand();
  const { ensureFirebase, configured } = useAuth();
  // Opening an account screen is the moment to fetch the SDK and start listening for sign-in.
  useEffect(() => { if (configured) ensureFirebase().catch(() => {}); }, [configured, ensureFirebase]);
  return (
    <main className="auth-shell">
      <div className="auth-card">
        {/* Darsi's mark, or an organization's logo on its own web address (App's BrandProvider). */}
        <Link to="/" className="auth-brand" aria-label={brand.name || t("app.name")}><BrandMark size={48} /></Link>
        {brand.name && <p className="auth-org"><bdi>{brand.name}</bdi></p>}
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {children}
      </div>
    </main>
  );
}
/**
 * `signUp`: creating an account. There "too many requests" is Firebase's limit on new accounts from one address, which
 * a whole school behind one connection reaches in a lesson: waiting a minute doesn't help, an hour or the admin does.
 */
const errText = (code: string, t: ReturnType<typeof useI18n>["t"], signUp = false) =>
  code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") ? t("auth.errCreds")
  : code.includes("email-already-in-use") ? t("auth.errExists")
  : code.includes("weak-password") ? t("auth.errWeak")
  : code.includes("network") || code.includes("fetch") ? t("auth.errNetwork") // "fetch": the SDK itself couldn't download
  : code.includes("too-many-requests") ? t(signUp ? k("auth.errTooManySignUp") : "auth.errTooMany")
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
  // School sign-in: this address's own school (its site lists it), or /signin?school=<slug>; a test link adds ?try=.
  const ssoOn = useSsoOn().on;
  const site = useSite().site;
  const slug = ssoOn ? params.get("school") : null, tryToken = params.get("try");
  const ownSchool = ssoOn ? site?.sso?.slug ?? null : null;
  // Back from the school's provider (#sso=… or #sso_error=…, which sso.ts took out of the address before the router
  // started and keeps for this page): "busy" until the account is published, or why not; "test" when it turns out to
  // be a student's test, which shows its result and signs nobody in.
  // Whatever the switch says: a return that lands after the platform switched school sign-in off (or before this
  // phone's settings arrived) is still answered (finish then refuses with sso-off).
  const { pathname, hash } = useLocation();
  const [back, setBack] = useState<"busy" | "test" | { code: string; detail?: string } | null>(() => (returnedTo(pathname) || RETURN.test(hash) ? "busy" : null));
  // Said once, after the page restarted: the school session ended, or someone signed out of one here.
  const [note] = useState(ssoNote.take);
  // The school chunk only when this page has something of a school's to show: nobody else downloads it.
  const [S, retrySchool] = useSchoolChunk(Boolean(back) || (ssoOn && Boolean(slug || ownSchool || note)));
  // Whether a school's button is on the page right now (SchoolOptions says): asked for is not shown. A school this
  // link names that Darsi doesn't know, or a chunk that couldn't load, leaves "Sign in" the page's one main button.
  const [schoolShown, setSchoolShown] = useState(false);
  // An organization's own address knows its school from the first render (its site entry), before the chunk with the
  // button has loaded: "Sign in" is the second choice from the start, not the main button for a moment. A chunk that
  // couldn't load leaves it the main one. A school a link names isn't known until the lookup answers: that case waits.
  const schoolSure = Boolean(ownSchool) && (!slug || slug === ownSchool) && S !== false;
  // The lookup answered that Darsi has no such school (SchoolOptions says): Darsi's own address offers the finder then.
  const [schoolNone, setSchoolNone] = useState(false);
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
  // Only "Signing you in…" until the account is published (SignedIn moves on) or the school part says why not.
  if (back === "busy" || back === "test") {
    return (
      <Shell title={t(back === "test" ? "sso.testTitle" : "auth.signInTitle")}>
        {/* The school chunk couldn't load (offline): the error, not "Signing you in…" beside it, and a way forward.
            The return is still held (auth/sso.ts keeps it until the chunk takes it), so Retry finishes the sign-in
            once the chunk loads; "Back to sign in" shows the plain form. (A reload starts a plain sign-in page: the
            return is no longer in the address.) */}
        {S ? (back === "test" ? <S.SchoolTestResult /> : <S.SchoolReturn onRefused={setBack} onTest={() => setBack("test")} ensureFirebase={ensureFirebase} />)
          : S === false ? <>
              <p className="notice err" role="alert">{t("auth.errNetwork")}</p>
              <Button block icon="sync" onClick={retrySchool}>{t("common.retry")}</Button>
              <Button block variant="ghost" onClick={() => setBack(null)}>{t("auth.backToSignIn")}</Button>
            </>
          : <p className="auth-busy" role="status" aria-busy="true"><span className="dr-spinner" aria-hidden="true" />{t("sso.signingIn")}</p>}
      </Shell>
    );
  }
  // A test link from the school's admin: only the test, which signs nobody in.
  if (tryToken && slug) return <Shell title={t("sso.testTitle")}>{S ? <S.SchoolOptions slug={slug} token={tryToken} /> : S === false && <>
    <p className="notice err" role="alert">{t("auth.errNetwork")}</p>
    <Button block icon="sync" onClick={retrySchool}>{t("common.retry")}</Button>
  </>}</Shell>;
  const school = slug ?? ownSchool;
  // A return this browser holds no record for (it started in another tab or browser, or the record was used): the
  // sentence says "start again here", so the way to start is right under it. An organization's address has its
  // school's button there anyway; Darsi's own address gets the finder (and not a second one below).
  const lostHere = ssoOn && !site && !school && back?.code === "lost";
  return (
    <Shell title={t("auth.signInTitle")} sub={t("auth.signInSub")}>
      {/* Signed out by leaving an organization (Me): why they are here. */}
      <LeftOrgNote />
      {S && note && <S.SchoolNote note={note} />}
      {S && back && <S.SsoProblem code={back.code} detail={back.detail} />}
      {lostHere && <FindSchool />}
      {code && <p className="notice">{t("auth.joinAfter", { code: isolate(code) })}</p>}
      {/* The school's own sign-in first, above the usual ways in. */}
      {S && school && <S.SchoolOptions slug={slug} onShown={setSchoolShown} onNone={setSchoolNone} />}
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.login")} hint={t("auth.loginHint")} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        <TextField label={t("auth.password")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <p className="notice err" role="alert">{err}</p>}
        {/* The school's button is the main one while it shows; without it, this is. */}
        <Button type="submit" block variant={schoolShown || schoolSure ? "secondary" : "primary"} loading={busy}>{t("auth.signIn")}</Button>
      </form>
      <GoogleButton />
      {/* Darsi's own address: the schools that asked to be listed. An organization's address has its own button.
          Also when the link named a school Darsi doesn't know: its sentence says to check the link, and this is the way
          to look for the school. Not while that lookup is on its way, nor when it failed on the connection. */}
      {ssoOn && !site && (!school || schoolNone) && !lostHere && <FindSchool />}
      <p className="auth-links"><Link to={school ? `/forgot?school=${encodeURIComponent(school)}` : "/forgot"}>{t("auth.forgot")}</Link> <Link to={raw ? `/signup?code=${encodeURIComponent(raw)}` : "/signup"}>{t("auth.noAccount")}</Link></p>
      <GuestButton />
    </Shell>
  );
}

/*
 * School sign-in (TECHNICAL.md "School sign-in"). Its screens (the school's button and lookup, the way back from the
 * provider, every refusal in words, the finder) are the lazy chunk auth/SchoolFinder.tsx, with auth/ssoFlow.ts: a
 * sign-in page with nothing of a school's on it never downloads them.
 */
type SchoolChunk = typeof import("./SchoolFinder");
let schoolChunk: Promise<SchoolChunk> | null = null;
// Registered by App (auth/sso.ts setSchoolChunks): an import() made in this lazy chunk splits the startup file.
const loadSchool = () => (schoolChunk ??= loadSchoolFinder().catch((e: unknown) => { schoolChunk = null; throw e; }));
/**
 * The school chunk once `want` is true: the module, null while it loads, false when it can't (offline); and a way to
 * ask for it again after that (a failure is tried once more by itself, then waits to be asked: no loop offline).
 */
function useSchoolChunk(want: boolean): readonly [SchoolChunk | null | false, () => void] {
  const [m, setM] = useState<SchoolChunk | null | false>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!want || m) return;
    let live = true;
    loadSchool().then((x) => { if (live) setM(x); }, () => { if (live) setM(false); });
    return () => { live = false; };
  }, [want, m, tries]);
  const retry = useCallback(() => { setM(null); setTries((n) => n + 1); }, []);
  return [want ? m : null, retry] as const;
}

/** "Sign in with your school" on Darsi's own address: the finder opens in the card. */
function FindSchool() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [S, retry] = useSchoolChunk(open);
  if (open && S) return <S.SchoolFinder onClose={() => setOpen(false)} />;
  return (
    <div className="stack-sm">
      {/* A second tap after the chunk couldn't load asks for it again. */}
      <Button block variant="ghost" icon="globe" loading={open && S === null} onClick={() => { if (open && S === false) retry(); else setOpen(true); }}>{t("sso.yourSchool")}</Button>
      {open && S === false && <p className="notice err" role="alert">{t("auth.errNetwork")}</p>}
    </div>
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
  // The privacy notice and terms, once a platform admin has published them (legal/published.ts): a box to tick before
  // an account is made, here or with Google. Nothing published (or the file hasn't answered): the form as it always was.
  const versions = publishedVersions(useLegal());
  const [agreed, setAgreed] = useState(false); const [unticked, setUnticked] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const agrees = () => {
    if (!versions || agreed) return true;
    setUnticked(true); box.current?.focus();
    return false;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agrees()) return; // the browser stops an unticked form first; this is for one that doesn't
    setBusy(true); setErr("");
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
      recordAgreed(versions);
    } catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t, true)); setBusy(false); }
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
        {/* Under the button, where it arrives without moving it (the file can answer after the form shows), and
            above Google's, which it also covers. */}
        {versions && <Agree docs={LEGAL_DOCS.filter((d) => d in versions)} checked={agreed} unticked={unticked && !agreed} box={box}
          onChange={(on) => { setAgreed(on); if (on) setUnticked(false); }} />}
      </form>
      <GoogleButton agree={versions ? { ok: agrees, versions } : undefined} />
      {/* An invite link's code goes along: signed in, SignedIn joins with it. */}
      <p className="auth-links"><Link to={code ? `/signin?code=${encodeURIComponent(code)}` : "/signin"}>{t("auth.haveAccount")}</Link></p>
      <p className="muted small">{t("auth.orgNote")}</p>
      {!wantsOrg && <GuestButton />}
    </Shell>
  );
}

/**
 * "I have read and agree to …", for the documents that are published, with their pages one tap away (in their own
 * tab, so what was typed in the form stays). The links are a row of their own under the sentence, full-height to tap,
 * and the box is described by them, so a screen reader says the sentence, that it is required, and the pages' names.
 */
function Agree({ docs, checked, unticked, onChange, box }: { docs: LegalDoc[]; checked: boolean; unticked: boolean; onChange: (on: boolean) => void; box: RefObject<HTMLInputElement | null> }) {
  const { t } = useI18n();
  const id = useId();
  const first = t(k("legal.agreeFirst"));
  // The browser's own "tick this box" comes in the browser's language: say it in the person's.
  useEffect(() => { box.current?.setCustomValidity(checked ? "" : first); }, [box, checked, first]);
  return (
    <div className="stack-sm">
      <label className="auth-agree">
        <input ref={box} type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={`${id}-pages`} aria-invalid={unticked || undefined} />
        {" "}{t(k(docs.length > 1 ? "legal.agreeBoth" : docs[0] === "privacy" ? "legal.agreePrivacy" : "legal.agreeTerms"))}
      </label>
      <p id={`${id}-pages`} className="auth-links">
        {docs.map((d) => <Link key={d} to={`/${d}`} target="_blank" rel="noopener">{t(k(d === "privacy" ? "legal.privacy" : "legal.terms"))}</Link>)}
      </p>
      {unticked && <p className="notice err" role="alert">{first}</p>}
    </div>
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
  const agreed = takeAgreed(); // read (and forgotten) either way: never kept for a later, unrelated sign-in
  if (!back) return null;
  comingBack = (async () => {
    await ensureFirebase(); // AuthProvider's listener publishes the account; the result here only finishes a new one
    const { auth, getRedirectResult } = await authSdk();
    const cred = await getRedirectResult(auth);
    // Auth can take the result in itself as it starts; the account is then already its current user.
    const user = cred?.user ?? auth.currentUser ?? null;
    if (user && await afterGoogle(user, lang)) recordAgreed(agreed); // keeps going after the app has moved on
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
 * `agree` (the sign-up screen, while a privacy notice or terms are published): Google starts only once the box is
 * ticked, and a new account records the versions ticked. Without it (sign-in; nothing published) nothing changes.
 */
function GoogleButton({ agree }: { agree?: { ok: () => boolean; versions: LegalVersions } }) {
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
        if (agree && !agree.ok()) return; // the sign-up screen shows what to tick
        if (!isNative() && inAppBrowser(navigator.userAgent)) { setElsewhere(true); return; }
        setBusy(true);
        try {
          const { auth, signInWithPopup, signInWithRedirect, GoogleAuthProvider } = await authSdk();
          let cred: UserCredential;
          try { cred = await signInWithPopup(auth, new GoogleAuthProvider()); }
          catch (x) {
            if (!noPopup(String((x as { code?: string }).code ?? x))) throw x;
            try {
              sessionStorage.setItem(REDIRECT_KEY, "1");
              if (agree) sessionStorage.setItem(AGREED_KEY, JSON.stringify(agree.versions));
            } catch { /* private mode: the account still arrives */ }
            return await signInWithRedirect(auth, new GoogleAuthProvider()); // leaves the page
          }
          if (await afterGoogle(cred.user, lang)) recordAgreed(agree?.versions ?? null);
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
  // On a page with a school button (an organization's address with school sign-in, or a school's sign-in link): a school
  // password is the school's to reset, and its button is the way in.
  const viaSchool = Boolean(useSite().site?.sso) || Boolean(useSearchParams()[0].get("school"));
  const ssoOn = useSsoOn().on;
  return (
    <Shell title={t("auth.forgotTitle")} sub={t("auth.forgotSub")}>
      {ssoOn && viaSchool && <p className="notice" role="note">{t("sso.forgot")}</p>}
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
