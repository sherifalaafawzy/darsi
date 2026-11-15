/**
 * School sign-in's screens for people who aren't signed in yet (a lazy chunk, not precached): the school's button on
 * the sign-in screen (this address's school, or /signin?school=<slug> looked up), the way back from the school's
 * provider, every refusal said in full, the notes after an ended or signed-out school session, the school finder on
 * darsiai.org, and the page a student's test comes back to. The sign-in screen (AuthScreens.tsx) loads this only when
 * its page has something of a school's to show. No Firebase until a return from the school needs it to sign in.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BrandMark, Button, Icon } from "@darsi/design-system";
import { isolate, useI18n } from "../i18n";
import { storageUrl } from "../content/load";
import { loadFirebase } from "../fb";
import { useSite } from "../state/site";
import { track } from "../analytics/track";
import { lastSchool, signedOutHere, type School } from "./sso";
import { codeOf, finishFlow, releaseReturn, schoolInfo, SsoError, startFlow, takeReturn, type SsoReturn } from "./ssoFlow";
import { k, refusalText, type SsoWordKey } from "./ssoWords";
import "../styles/school.css";

/**
 * The school's button: this address's school (content/sites.json lists its sign-in while it is on: no request), or
 * the one `slug` names (one lookup). "Sign in with <school>", and where the person will continue, before anything
 * leaves Darsi. `token`: a test link's (the school's admin asked a student to try it; it signs nobody in).
 * `onShown`: told whether the button is on the page (not while a lookup is on its way, nor for a school Darsi doesn't
 * know), so the sign-in screen makes its own "Sign in" the second choice only beside a school's button.
 * `onNone`: told when the lookup answered that Darsi has no such school (not while it is on its way, and not when it
 * failed on the connection), so Darsi's own sign-in page can offer the school finder under that sentence.
 */
export function SchoolOptions({ slug, token, onShown, onNone }: { slug: string | null; token?: string | null; onShown?: (shown: boolean) => void; onNone?: (none: boolean) => void }) {
  const { t } = useI18n();
  const site = useSite().site;
  const own: School | null = site?.sso && (!slug || slug === site.sso.slug) ? { orgId: site.orgId, slug: site.sso.slug, name: site.name, host: site.sso.host } : null;
  const ask = slug && !own ? slug : null;
  const [got, setGot] = useState<{ slug: string; school: School | null; code?: string } | null>(null);
  useEffect(() => {
    if (!ask) return;
    let live = true;
    // A test link's token goes with the lookup: the school it tests may not have its sign-in on yet.
    schoolInfo(ask, token).then((s) => { if (live) setGot({ slug: ask, school: s, ...(s ? {} : { code: "sso-no-school" }) }); },
      (e: unknown) => { if (live) setGot({ slug: ask, school: null, code: codeOf(e) }); });
    return () => { live = false; };
  }, [ask, token]);
  const school = own ?? (got?.slug === ask ? got.school : null);
  const code = !own && got?.slug === ask ? got.code : undefined;
  const shown = Boolean(school);
  // Before the paint: the page never shows two main buttons, not even for a frame.
  useLayoutEffect(() => {
    if (!onShown || !shown) return;
    onShown(true);
    return () => onShown(false); // the button went (another school asked for, or this left the page)
  }, [shown, onShown]);
  const none = code === "sso-no-school";
  useEffect(() => {
    if (!onNone || !none) return;
    onNone(true);
    return () => onNone(false); // another school asked for, or this left the page
  }, [none, onNone]);
  if (!school) return code ? <SsoProblem code={code} test={!!token} /> : null;
  return (
    <>
      {token && <p className="muted">{t(k("ss.testSub"))}</p>}
      <SchoolButton school={school} token={token} />
      {/* The sign-in screen's usual ways in follow: "or" on a line, so the two don't read as two steps of one. */}
      {!token && <p className="auth-or">{t(k("ss.or"))}</p>}
    </>
  );
}

function SchoolButton({ school, token }: { school: School; token?: string | null }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const url = await startFlow({ ...(school.orgId ? { orgId: school.orgId } : { slug: school.slug }), mode: token ? "test" : "signin", ...(token ? { testToken: token } : {}), next: location.pathname + location.search, school });
      location.assign(url); // leaves the page: still busy on purpose, so a second tap starts nothing
    } catch (e) { setErr(codeOf(e)); setBusy(false); }
  };
  return (
    <div className="stack-sm">
      <Button block loading={busy} onClick={() => { void go(); }}>{t(k(token ? "ss.testWith" : "ss.signInWith"), { name: isolate(school.name) })}</Button>
      <p className="muted small auth-host">{t(k("ss.continueAt"), { host: isolate(school.host) })}</p>
      {err && <SsoProblem code={err} test={!!token} />}
    </div>
  );
}

/** Said once on the sign-in page after a school session ended ("again"), or after Sign out of one ("out"). */
export function SchoolNote({ note }: { note: "again" | "out" }) {
  const { t } = useI18n();
  if (note === "again") return <p className="notice" role="status">{t(k("ss.again"))}</p>;
  const s = lastSchool.get();
  if (!s) return null;
  let end: URL | null = null;
  try { end = s.endSession ? new URL(s.endSession) : null; } catch { end = null; }
  return (
    <div className="notice stack-sm" role="status">
      <span>{t(k("ss.stillIn"), { school: isolate(s.name) })}</span>
      {end?.protocol === "https:" && <a href={end.href} rel="noopener noreferrer" target="_blank">{t(k("ss.endThere"), { host: isolate(end.host) })}</a>}
    </div>
  );
}

/** Coming back from the school: one sign-in per page, however often the screen mounts (StrictMode mounts twice). */
let schoolBack: Promise<void> | null = null;
const authSdk = async () => { const [fb, a] = await Promise.all([loadFirebase(), import("firebase/auth")]); return { ...a, auth: fb.auth }; };

/**
 * The way back from the school's provider to /signin (`#sso=…&f=…` or `#sso_error=…`, which left the address before
 * the router started: sso.ts stashReturn): finish turns the ticket into a Firebase token, which signs in through the
 * lazy SDK. The account is then published by AuthProvider and SignedIn moves on, as after any sign-in: meanwhile
 * "Signing you in…". A refusal, or a return this page holds no record for (another tab or browser), goes back to the
 * sign-in page with its words (`onRefused`). A student's test that came back here is never a sign-in: `onTest`, and
 * the sign-in screen shows its result (SchoolTestResult). `ensureFirebase` comes from the sign-in screen: importing
 * AuthProvider here split the startup bundle into 8 files (measured), so this chunk is handed what it needs instead.
 */
export function SchoolReturn({ onRefused, onTest, ensureFirebase }: { onRefused: (p: { code: string; detail?: string }) => void; onTest: () => void; ensureFirebase: () => Promise<void> }) {
  const { t, lang } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const r = takeReturn(loc.hash);
    // A fragment the router itself still shows (never after a page load): it forgets it too.
    if (loc.hash) nav({ pathname: loc.pathname, search: loc.search }, { replace: true, state: loc.state });
    if (!r) return;
    // A test link's return (the address's own detour takes it to its page first, sso.ts): held for SchoolTestResult.
    if (!("lost" in r) && r.record?.mode === "test" && r.record.token) { onTest(); return; }
    if ("lost" in r) { releaseReturn(); onRefused({ code: "lost" }); return; }
    if ("error" in r) { releaseReturn(); onRefused({ code: r.error, ...(r.detail ? { detail: r.detail } : {}) }); return; }
    if (r.record.mode !== "signin") { releaseReturn(); onRefused({ code: "lost" }); return; }
    let live = true;
    schoolBack ??= (async () => {
      const { token } = await finishFlow<{ token?: unknown }>(r.ticket, r.record.verifier);
      if (typeof token !== "string") throw new SsoError("sso-state");
      await ensureFirebase(); // listening, so the account is published the moment it signs in
      const { auth, signInWithCustomToken } = await authSdk();
      auth.languageCode = lang;
      await signInWithCustomToken(auth, token);
      // The school this device signs in through: an ended school session comes back to it, and Sign out names it.
      if (r.record.school?.orgId) lastSchool.set({ ...r.record.school, orgId: r.record.school.orgId });
      signedOutHere.set(false);
      track("sign_in", { m: "sso" });
    })().finally(() => { releaseReturn(); schoolBack = null; });
    schoolBack.catch((e: unknown) => {
      // A refusal from finish says its own code; the SDK's failures are the connection, or something to start again.
      if (live) onRefused({ code: e instanceof SsoError ? e.code : String((e as { code?: string } | null)?.code ?? "").includes("network") ? "network" : "other" });
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Busy as the buttons of these screens are (the design system's spinner), not a notice: nothing here is to be read twice.
  return <p className="auth-busy" role="status" aria-busy="true"><span className="dr-spinner" aria-hidden="true" />{t("sso.signingIn")}</p>;
}

/**
 * A refusal in full: what happened and what to do, with the provider's own code when it sent one.
 * `test`: a student's test link's lookup or start (not its return). There `sso-state` means the link was used or has
 * expired (sso.ts answers it for any `try` that isn't a good link), and "Start again" would send the student round in
 * a circle: only the school's admin can make a new link.
 */
export function SsoProblem({ code, detail, test }: { code: string; detail?: string; test?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="notice err stack-sm" role="alert">
      <span>{code === "lost" ? t(k("ss.lost")) : test && code === "sso-state" ? t(k("ss.testSpent")) : refusalText(code, t)}</span>
      {detail && <small>{t(k("ss.detail"), { code: isolate(detail) })}</small>}
    </div>
  );
}

/** content/sso.json, checked entry by entry: only what the platform approved, in the shape it publishes. */
export function readSchools(file: unknown): School[] {
  const list = (file as { schools?: unknown } | null)?.schools;
  if (!Array.isArray(list)) return [];
  const out: School[] = [];
  for (const s of list.slice(0, 5000) as Record<string, unknown>[]) {
    if (!s || typeof s.slug !== "string" || !/^[a-z0-9-]{1,60}$/.test(s.slug) || typeof s.name !== "string" || !s.name.trim()) continue;
    if (typeof s.host !== "string" || !/^[a-z0-9.-]{1,253}(?::\d{1,5})?$/.test(s.host)) continue;
    const logo = typeof s.logo === "string" && /^data:image\/(?:png|webp|jpeg);base64,/.test(s.logo) && s.logo.length < 200_000 ? s.logo : null;
    out.push({ slug: s.slug, name: s.name.trim().slice(0, 120), host: s.host, logo });
  }
  return out;
}
/** Search folds case, accents and Arabic's marks and alef forms, so "ecole" finds "École" and «احمد» finds «أحمد». */
const fold = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٰٟ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();

let listing: Promise<School[]> | null = null;
const loadSchools = () => (listing ??= fetch(storageUrl("content/sso.json"), { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : r.status === 404 ? { schools: [] } : Promise.reject(new Error(String(r.status)))))
  .then(readSchools)
  .catch((e: unknown) => { listing = null; throw e; }));

/**
 * "Sign in with your school" on darsiai.org: the schools a platform admin approved for the finder (content/sso.json,
 * one fetch), searched by name. Choosing one opens the sign-in screen for it (/signin?school=<slug>), which shows the
 * school's button and where the person will continue, before anything leaves Darsi.
 */
export function SchoolFinder({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const id = useId();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    loadSchools().then((s) => { if (live) setSchools(s); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [n]);
  const shown = useMemo(() => {
    const f = fold(q);
    return (schools ?? []).filter((s) => !f || fold(s.name).includes(f)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  }, [schools, q]);
  return (
    <section className="sf stack-sm" aria-labelledby={`${id}-h`}>
      <div className="sf-head">
        <h2 id={`${id}-h`}>{t(k("ss.fd.title"))}</h2>
        <Button size="sm" variant="ghost" icon="close" onClick={onClose}>{t(k("ss.fd.close"))}</Button>
      </div>
      {failed ? <div className="notice err stack-sm" role="alert"><span>{t(k("ss.fd.failed"))}</span>
        <div><Button size="sm" variant="secondary" icon="sync" onClick={() => setN((x) => x + 1)}>{t(k("ss.fd.retry"))}</Button></div></div>
        : !schools ? <p className="muted" role="status" aria-busy="true">{t(k("ss.fd.loading"))}</p>
        : !schools.length ? <p className="muted">{t(k("ss.fd.empty"))}</p>
        : <>
          <label className="sf-search"><span>{t(k("ss.fd.search"))}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" dir="auto" autoFocus /></label>
          {/* No live region on the list itself: a screen reader would read up to 50 schools on every key. The "no school
              matches" line below is the one said aloud. */}
          <ul className="sf-list">
            {shown.map((s) => (
              <li key={s.slug}>
                <button type="button" className="sf-pick" onClick={() => nav(`/signin?school=${encodeURIComponent(s.slug)}`)}>
                  {s.logo ? <img src={s.logo} alt="" width={36} height={36} /> : <Icon name="globe" size={24} />}
                  <span><strong><bdi>{s.name}</bdi></strong><small>{t(k("ss.fd.at"), { host: isolate(s.host) })}</small></span>
                </button>
              </li>
            ))}
          </ul>
          {!shown.length && <p className="muted" role="status">{t(k("ss.fd.none"))}</p>}
        </>}
    </section>
  );
}

/**
 * How a student's test ended: what Darsi would do with them (`would`: the sentence's key), that it would refuse them
 * (`refuse`: the refusal's code), or that the test itself didn't get through (`code`).
 */
type TestEnd = { would: SsoWordKey } | { refuse: string } | { code: string; detail?: string };
/** finish's dry-run decision (functions/src/ssoCore.ts testOutcome) as the sentence the student reads. */
const WOULD: Record<string, SsoWordKey> = {
  "create-student": "ss.td.student", "create-teacher": "ss.td.teacher", signin: "ss.td.signin", "signin-raise": "ss.td.signin", "link-org-made": "ss.td.signin",
};
async function endTest(r: SsoReturn): Promise<TestEnd> {
  if ("lost" in r) return { code: "lost" };
  if ("error" in r) return { code: r.error, ...(r.detail ? { detail: r.detail } : {}) };
  if (r.record.mode !== "test") return { code: "lost" };
  try {
    const { tested } = await finishFlow<{ tested?: unknown }>(r.ticket, r.record.verifier);
    const d = typeof tested === "string" ? tested : "";
    // A decision this app has no sentence for yet (a newer server): the test still reached the admin.
    return d.startsWith("refuse:") ? { refuse: d.slice(7) } : { would: WOULD[d] ?? "ss.td.ok" };
  } catch (e) { return { code: codeOf(e) }; }
}
/** One answer per return, however often the card mounts (StrictMode mounts twice): a ticket is finished once. */
const tests = new WeakMap<SsoReturn, Promise<TestEnd>>();
/** The page's last test, for a card that mounts again after its return was dealt with. */
let lastTest: Promise<TestEnd> | null = null;

/**
 * The result of a student's test of their school's sign-in (a test link), for whoever is or isn't signed in: finish
 * needs no account for a test link (the link is the permission, and finish spends it). Nothing is created and nobody
 * is signed in: the card says what Darsi would do with them ("you would join as a student"), or why it would refuse
 * them, and the organization's admin sees the same on their own page.
 */
export function SchoolTestResult() {
  const { t } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const [state, setState] = useState<"busy" | TestEnd>("busy");
  useEffect(() => {
    const r = takeReturn(loc.hash);
    if (loc.hash) nav({ pathname: loc.pathname, search: loc.search }, { replace: true });
    let end = r ? tests.get(r) : lastTest;
    if (r && !end) { end = endTest(r).finally(releaseReturn); tests.set(r, end); lastTest = end; }
    if (!end) { setState({ code: "lost" }); return; }
    let live = true;
    void end.then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {state === "busy" ? <p className="muted" role="status" aria-busy="true">{t(k("ss.td.busy"))}</p>
        : "would" in state ? <><p className="notice ok" role="status">{t(k(state.would))}</p>{state.would !== "ss.td.ok" && <p className="muted small">{t(k("ss.td.seen"))}</p>}</>
        : "refuse" in state ? <><div className="notice err stack-sm" role="alert"><span>{t(k("ss.td.refused"))}</span><span>{refusalText(state.refuse, t)}</span></div><p className="muted small">{t(k("ss.td.seen"))}</p></>
        // A return this browser has no record for reached nobody: there is nothing for the admin to see.
        : <><SsoProblem code={state.code} detail={state.detail} />{state.code !== "lost" && <p className="muted small">{t(k("ss.td.failed"))}</p>}</>}
      <Button block variant="secondary" onClick={() => nav("/")}>{t(k("ss.td.home"))}</Button>
    </>
  );
}

/** /sso-test: the page a student's test comes back to (sso.ts stashReturn moves it here from /signin or /admin). */
export function SchoolTestDone() {
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <span className="auth-brand" aria-hidden><BrandMark size={48} /></span>
        <h1>{t(k("ss.td.title"))}</h1>
        <SchoolTestResult />
      </div>
    </main>
  );
}
