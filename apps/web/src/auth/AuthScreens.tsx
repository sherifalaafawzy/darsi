import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Mark, TextField } from "@darsi/design-system";
import { loadFirebase } from "../fb";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { api, loginToEmail } from "./api";
import { createLearnerProfile, useAuth } from "./AuthProvider";

/** The SDK pieces these screens use, loaded on demand: the form shows at once, the SDK arrives while people type. */
const authSdk = async () => {
  const [fb, a] = await Promise.all([loadFirebase(), import("firebase/auth")]);
  return { ...a, auth: fb.auth, db: fb.db };
};

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { ensureFirebase, configured } = useAuth();
  // Opening an account screen is the moment to fetch the SDK and start listening for sign-in.
  useEffect(() => { if (configured) ensureFirebase().catch(() => {}); }, [configured, ensureFirebase]);
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link to="/" className="auth-brand" aria-label="Darsi"><Mark size={48} /></Link>
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
  : t("auth.errGeneric");

export function SignIn() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [login, setLogin] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const { auth, signInWithEmailAndPassword } = await authSdk(); await signInWithEmailAndPassword(auth, loginToEmail(login), pw); nav("/learn", { replace: true }); }
    catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); } finally { setBusy(false); }
  };
  return (
    <Shell title={t("auth.signInTitle")} sub={t("auth.signInSub")}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.login")} hint={t("auth.loginHint")} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        <TextField label={t("auth.password")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <p className="notice err" role="alert">{err}</p>}
        <Button type="submit" block loading={busy}>{t("auth.signIn")}</Button>
      </form>
      <GoogleButton />
      <p className="auth-links"><Link to="/forgot">{t("auth.forgot")}</Link> <Link to="/signup">{t("auth.noAccount")}</Link></p>
      <GuestButton />
    </Shell>
  );
}

export function SignUp() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const wantsOrg = params.get("org") === "1";
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const { auth, createUserWithEmailAndPassword, updateProfile: fbUpdateProfile } = await authSdk();
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await fbUpdateProfile(cred.user, { displayName: name.trim() });
      await createLearnerProfile(cred.user.uid, { name: name.trim(), email: email.trim().toLowerCase(), lang });
      nav(wantsOrg ? "/org?request=1" : "/learn", { replace: true });
    } catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); } finally { setBusy(false); }
  };
  return (
    <Shell title={wantsOrg ? t("auth.signUpOrgTitle") : t("auth.signUpTitle")} sub={wantsOrg ? t("auth.signUpOrgSub") : t("auth.signUpSub")}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
        <TextField label={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <TextField label={t("auth.password")} hint={t("auth.pwHint")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={8} />
        {err && <p className="notice err" role="alert">{err}</p>}
        <Button type="submit" block loading={busy}>{t("auth.create")}</Button>
      </form>
      <GoogleButton next={wantsOrg ? "/org?request=1" : "/learn"} />
      <p className="auth-links"><Link to="/signin">{t("auth.haveAccount")}</Link></p>
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

function GoogleButton({ next = "/learn" }: { next?: string }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const { ensureFirebase } = useAuth();
  const [busy, setBusy] = useState(false);
  // Browsers only allow the sign-in popup straight from the tap, so wait until the SDK is here before enabling it.
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; ensureFirebase().then(() => live && setReady(true)).catch(() => {}); return () => { live = false; }; }, [ensureFirebase]);
  return (
    <Button block variant="secondary" loading={busy || !ready} onClick={async () => {
      setBusy(true);
      try {
        const { auth, db, signInWithPopup, GoogleAuthProvider } = await authSdk();
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        const { doc, getDoc } = await import("firebase/firestore");
        if (!(await getDoc(doc(db, "users", cred.user.uid))).exists()) await createLearnerProfile(cred.user.uid, { name: cred.user.displayName ?? "", email: (cred.user.email ?? "").toLowerCase(), lang });
        nav(next, { replace: true });
      } catch { /* closed popup */ } finally { setBusy(false); }
    }}>{t("auth.google")}</Button>
  );
}

export function Forgot() {
  const { t } = useI18n();
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false);
  return (
    <Shell title={t("auth.forgotTitle")} sub={t("auth.forgotSub")}>
      {sent ? <p className="notice ok">{t("auth.forgotSent")}</p> : (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const { auth, sendPasswordResetEmail } = await authSdk(); await sendPasswordResetEmail(auth, email.trim()); } catch { /* do not reveal */ } setSent(true); setBusy(false); }}>
          <TextField label={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
    try { const { updatePassword } = await import("firebase/auth"); await updatePassword(user!, pw); await api.passwordChanged({}); }
    catch (x) { setErr(errText(String((x as { code?: string }).code ?? x), t)); } finally { setBusy(false); }
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
