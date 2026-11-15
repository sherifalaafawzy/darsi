import { Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, applyLocale, BrandProvider, Button, EmptyState, UpdateToast } from "@darsi/design-system";
import { AuthProvider, ENDED_NOTE, KEPT_KEY, useAuth } from "./auth/AuthProvider";
import { leftOrg } from "./auth/LeftOrg";
import { setSchoolChunks } from "./auth/sso";
import type { Role } from "./auth/types";
import { I18nProvider, useI18n } from "./i18n";
import { adoptsGuest, StoreProvider, useStore } from "./state/store";
import { useCloudSync, useLearningSync } from "./state/sync";
import { useOrgBrand } from "./state/orgBrand";
import { identityOf, useSite } from "./state/site";
import { useAnalytics } from "./analytics/useAnalytics";
import { configureContent, loadCatalog, loadUnit, setOrgReader, storageUrl, subscribeCatalog } from "./content/load";
import { SettingsProvider, useLanguageReady, useSuperOn } from "./content/settings";
import { call, loadFirebase } from "./fb";
import { usePushRefresh } from "./notify/usePushRefresh";
import { Layout, pageKey } from "./components/Layout";
import { Home } from "./screens/Home";
import { LessonPlayer, LessonScreen } from "./screens/LessonScreen";
import { canPlayLight, LightLesson, setLightPlayer } from "./lesson/LightLesson";
import { Onboarding } from "./screens/Onboarding";
import { Downloads, useOfflineRefresh } from "./screens/Downloads";
import { TutorFab } from "./tutor/Fab";
import { ReportBug } from "./bugs/Fab";
import { AppTour } from "./tour/Start";
import { AppBoundary, lazyRetry, RouteBoundary, useChunkCause, type Failure, type Reporter } from "./app/AppBoundary";
import { k } from "./app/strings";
import { reloadForUpdate } from "./pwa";

// Loaded on demand: learners never download or parse the landing page (after their first visit) or any staff screen.
// vite.config.ts keeps these chunks out of the precache; the service worker caches each one the first time it is used.
// lazyRetry, not React.lazy: a chunk that fails to load (a tab older than the last deploy, or offline before the screen
// was ever opened) shows its page's boundary with a Retry that asks again (app/AppBoundary.tsx).
const Landing = lazyRetry(() => import("./landing/Landing").then((m) => ({ default: m.Landing })));
const Licences = lazyRetry(() => import("./landing/Licences").then((m) => ({ default: m.Licences })));
/** The privacy notice and the terms, for anyone (guests too): their own small chunk, loaded when opened. */
const LegalPage = lazyRetry(() => import("./legal/Legal").then((m) => ({ default: m.LegalPage })));
// The pages that are not the first screen (account screens, Me, Kit, My tracks, Labs): one lazy chunk, precached, so
// they open offline as before. One chunk on purpose, with no import() of its own: screens/more.ts says why.
const more = () => import("./screens/more");
const SignIn = lazyRetry(() => more().then((m) => ({ default: m.SignIn })));
const SignUp = lazyRetry(() => more().then((m) => ({ default: m.SignUp })));
const Forgot = lazyRetry(() => more().then((m) => ({ default: m.Forgot })));
const SetPassword = lazyRetry(() => more().then((m) => ({ default: m.SetPassword })));
const NotConfigured = lazyRetry(() => more().then((m) => ({ default: m.NotConfigured })));
const Me = lazyRetry(() => more().then((m) => ({ default: m.Me })));
const Kit = lazyRetry(() => more().then((m) => ({ default: m.Kit })));
const MyTracks = lazyRetry(() => more().then((m) => ({ default: m.MyTracks })));
// The labs catalogue and a lab's page (each lab is its own chunk, labs/loader.tsx); their stylesheet stays global (main.tsx).
const Labs = lazyRetry(() => more().then((m) => ({ default: m.Labs })));
const LabApp = lazyRetry(() => more().then((m) => ({ default: m.LabApp })));
const OrgScreen = lazyRetry(() => import("./org/OrgScreen").then((m) => ({ default: m.OrgScreen })));
const AdminHome = lazyRetry(() => import("./admin/AdminHome").then((m) => ({ default: m.AdminHome })));
const PageBuilder = lazyRetry(() => import("./admin/PageBuilder").then((m) => ({ default: m.PageBuilder })));
const PersonDetail = lazyRetry(() => import("./admin/PersonDetail").then((m) => ({ default: m.PersonDetail })));
const AddPeople = lazyRetry(() => import("./admin/AddPeople").then((m) => ({ default: m.AddPeople })));
const ImportPeople = lazyRetry(() => import("./admin/AddPeople").then((m) => ({ default: m.ImportPeople })));
const Teach = lazyRetry(() => import("./admin/Teach").then((m) => ({ default: m.Teach })));
const TeachPerson = lazyRetry(() => import("./admin/Teach").then((m) => ({ default: m.TeachPerson })));
const CourseResults = lazyRetry(() => import("./results/CourseResults").then((m) => ({ default: m.CourseResults })));
const CourseAccess = lazyRetry(() => import("./results/CourseAccess").then((m) => ({ default: m.CourseAccess })));
/**
 * Course results and access get content loading from here (results/async.ts says why). `subscribe`: they read the
 * catalog again when content/load forgets it (back after a long while, or the editor published), as Home does.
 */
const CONTENT = { loadCatalog, loadUnit, subscribe: subscribeCatalog };
const SuperAdmin = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.SuperAdmin })));
const AnalyticsPage = lazyRetry(() => import("./admin/Analytics").then((m) => ({ default: m.AnalyticsPage })));
const PeoplePage = lazyRetry(() => import("./admin/Analytics").then((m) => ({ default: m.PeoplePage })));
const OrgAnalytics = lazyRetry(() => import("./admin/Analytics").then((m) => ({ default: m.OrgAnalytics })));
const OrgReport = lazyRetry(() => import("./admin/OrgReport").then((m) => ({ default: m.OrgReport })));
const OrgsAdmin = lazyRetry(() => import("./admin/OrgsAdmin").then((m) => ({ default: m.OrgsAdmin })));
/** Which courses the organization's teachers, students and classes see (org admins; platform admins on an org's page). */
const OrgCoursesPage = lazyRetry(() => import("./admin/OrgCourses").then((m) => ({ default: m.OrgCoursesPage })));
const PlansPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.PlansPage })));
const ProjectsPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.ProjectsPage })));
const CertificatesPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.CertificatesPage })));
const BugsPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.BugsPage })));
const FeedbackPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.FeedbackPage })));
const DomainsPage = lazyRetry(() => import("./admin/SuperAdmin").then((m) => ({ default: m.DomainsPage })));
const Upgrade = lazyRetry(() => import("./upgrade/Upgrade").then((m) => ({ default: m.Upgrade })));
const Tutor = lazyRetry(() => import("./tutor/Tutor").then((m) => ({ default: m.Tutor })));
const TutorPanel = lazyRetry(() => import("./tutor/Tutor").then((m) => ({ default: m.TutorPanel })));
// Course editor (platform and org admins): one "Cms" chunk, also kept out of the precache. It gets the lesson player
// (for its preview) as a prop: importing it there would pull the player's lazy SDK loads into a shared chunk and
// split the startup bundle. Org-only units are read through the SDK, which only signed-in members load.
const ContentList = lazyRetry(() => import("./cms/Cms").then((m) => ({ default: m.ContentList })));
const UnitEditor = lazyRetry(() => import("./cms/Cms").then((m) => ({ default: m.UnitEditor })));
const TracksPage = lazyRetry(() => import("./cms/Cms").then((m) => ({ default: m.TracksPage })));
const LanguagesPage = lazyRetry(() => import("./cms/Cms").then((m) => ({ default: m.LanguagesPage })));
const TranslatePage = lazyRetry(() => import("./cms/Cms").then((m) => ({ default: m.TranslatePage })));
/** A student's test of their school's sign-in comes back here (auth/sso.ts stashReturn): no account, no Firebase. */
const SchoolTestDone = lazyRetry(() => import("./auth/SchoolFinder").then((m) => ({ default: m.SchoolTestDone })));
// A return from a school's provider (#sso=…) left the address when auth/sso.ts loaded, above: before the router, and
// anything it renders, reads the address. A student's test moved to /sso-test there too.
// The school chunks for the sign-in screens and Me, imported here and not in their lazy chunks, where an import()
// splits the startup file (auth/sso.ts).
setSchoolChunks({ finder: () => import("./auth/SchoolFinder"), link: () => import("./auth/SchoolLink") });
setOrgReader((path) => loadFirebase().then((fb) => fb.storageJSON(path)));
setLightPlayer(() => import("./vendor/lessonstudio-player.js"));

/** The report sheet's chunk, for the card AppBoundary shows (the same chunk the Report button loads, bugs/Fab.tsx). */
const loadReport = () => import("./bugs/Report");

const Loading = () => <div className="loading" aria-busy="true" />;

/**
 * Role guard: roles come from the ID token claims, the same ones the security rules check. A slow start (AuthProvider
 * offlineUid) can apply this account's kept staff role before the SDK has published the user: the staff screens' reads
 * would hang, so they wait for the user behind the loading screen (it arrives when the connection lets it).
 */
function Allow({ roles }: { roles: Role[] }) {
  const { role, user, offlineUid } = useAuth();
  if (!roles.includes(role)) return <Navigate to="/learn" replace />;
  return !user && offlineUid ? <Loading /> : <Outlet />;
}

/**
 * Pages for any signed-in account that read its data through the SDK (Course results). Guests go to sign in without
 * loading the page, so they never download Firebase; an account whose SDK can't load (offline) goes to its lessons.
 * A slow start (AuthProvider offlineUid, with `connecting`) is neither: the account is on its way, so the page waits
 * for it behind the loading screen, as the staff pages do (Allow), instead of sending the person away for good.
 */
function SignedInOnly() {
  const { user, offlineUid, connecting } = useAuth();
  if (user) return <Outlet />;
  if (offlineUid && connecting) return <Loading />;
  return <Navigate to={offlineUid ? "/learn" : "/signin"} replace />;
}

/**
 * Learning screens need the onboarding answers (language, where you teach, tracks, level) first. Onboarding takes the
 * place of the page that was asked for, which shows at the same address once it is done (a lesson link, a project).
 * - Platform admins skip it: they see every course in every track, in the language they use (TECHNICAL.md "Tracks").
 * - Signed in on a new device, the answers come from the account (state/sync.ts useLearningSync), not asked again: a
 *   moment of loading while its profile is read and copied here.
 * - Teachers and org admins keep a way to their own pages while they go through it (no nav until it is done).
 */
function Onboarded() {
  const { state } = useStore();
  const { t } = useI18n();
  const { user, role, profile, profileReady } = useAuth();
  if (state.onboarded || role === "superadmin") return <Outlet />;
  if (user && (!profileReady || profile?.onboarded === true)) return <Loading />;
  const exit = role === "orgAdmin" ? { to: "/admin", label: t("org.openAdmin") } : role === "teacher" ? { to: "/teach", label: t("org.openTeach") } : undefined;
  return <Onboarding exit={exit} />;
}

/**
 * Where a sign-in or sign-up lands. The account screens never navigate after signing in: AuthProvider publishes the
 * account (claims first), the store swaps (key = uid) and remounts the router at the same address, and this sends
 * each role on: admins to their dashboard, everyone else to their lessons. An invite code (?code=, from sign-up, an
 * invite link or "I already have an account") goes to /org, which joins with it; "Register your organization" carries ?org=1.
 */
function SignedIn() {
  const [params] = useSearchParams();
  const { role } = useAuth();
  // An invite code from sign-up (or an invite link): /org joins with it and says how it went.
  const code = params.get("code");
  if (code) return <Navigate to={`/org?code=${encodeURIComponent(code)}`} replace />;
  return <Navigate to={params.get("org") === "1" ? "/org?request=1" : homeFor(role)} replace />;
}

/** Where each role starts: admins at their dashboards (no onboarding), everyone else at their lessons. */
const homeFor = (role: Role) => (role === "orgAdmin" ? "/admin" : role === "superadmin" ? "/super" : "/learn");

function Routed() {
  const { state, ready, dispatch } = useStore();
  // An organization's own web address shows its name and logo (state/site.ts): read before the first screen.
  const { ready: siteReady, site } = useSite();
  const brand = identityOf(state.org, site);
  const { user, profile, profileReady, role, orgId, configured, offlineUid, connecting, sso } = useAuth();
  const { dir } = useI18n();
  // Before any screen asks for the catalog: org members also see their org's published units.
  configureContent({ orgId: user ? orgId : null, signedIn: Boolean(user || offlineUid) });
  // An added language's direction is the one platform admins set. (The window title: PageTitle.)
  useEffect(() => { applyLocale(state.lang, state.theme, dir); }, [state.lang, state.theme, dir]);
  // Certificates use the local name; start it from the account name.
  useEffect(() => { if (ready && profile?.name && !state.name) dispatch({ type: "set", patch: { name: profile.name } }); }, [ready, profile?.name, state.name, dispatch]);
  // The learning profile (onboarding's answers, tracks, levels, where they teach or study) is the account's on every
  // device: copied from users/{uid} as AuthProvider reads it, and written back only when it changes here.
  useLearningSync(user?.uid, user ? (profile as Record<string, unknown> | null) : null, profileReady);
  useCloudSync(user?.uid);
  // The org's name, logo and the courses it lets this member see (their role, and their class from the profile).
  useOrgBrand(user?.uid, user ? orgId : null, { role, group: profileReady ? profile?.group ?? null : undefined });
  useAnalytics(); // a queue on the phone, sent in small batches (analytics/track.ts); no Firebase
  useOfflineRefresh(); // once per version: downloaded courses keep their code steps, labs and packs (screens/Downloads)
  usePushRefresh(); // signed in and opted in on this phone only; guests never load messaging
  const langReady = useLanguageReady();

  // An added language's strings are fetched when it is picked: until then the loading screen, not English.
  if (!ready || !langReady || !siteReady) return <Loading />;
  // "Choose your own password" is for accounts that sign in with one. An account that signs in with Google (or a
  // school's own sign-in) has no password to change, and the screen would lock it out. That includes a login the
  // organization made that the school's sign-in matched (it keeps mustChangePassword): its session is a school one.
  if (user && profile?.mustChangePassword && !sso && user.providerData?.some((p) => p.providerId === "password")) return <RouteBoundary><Suspense fallback={<Loading />}><SetPassword /></Suspense></RouteBoundary>;
  // Guests: chose "Continue without an account", or used Darsi on this device before accounts existed.
  const inApp = Boolean(user) || Boolean(offlineUid) || Boolean(state.guest) || state.onboarded;
  const account = (screen: ReactElement) => (user ? <SignedIn /> : configured ? screen : <NotConfigured />);

  return (
    <BrandProvider logo={brand.logo} name={brand.name} darsi={brand.darsi}>
    <PageTitle name={brand.name} darsi={brand.darsi} />
    {/* A page outside the layout that fails (a lesson, onboarding, the home page, the legal pages) fails alone: the
        report button and the notices below stay. Pages inside the layout have its boundary, which keeps the nav too. */}
    <RouteBoundary>
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route index element={inApp ? <Navigate to={homeFor(role)} replace /> : <Landing site={site} />} />
      <Route path="signin" element={account(<SignIn />)} />
      <Route path="signup" element={account(<SignUp />)} />
      <Route path="forgot" element={account(<Forgot />)} />
      <Route path="welcome" element={<Navigate to="/" replace />} />
      {/* Open-source licences: for anyone, from Me or the home page's footer (a lazy chunk, not precached). */}
      <Route path="licences" element={<Licences />} />
      {/* A student's test of a school's sign-in: for anyone, signed in or not (a lazy chunk, not precached). */}
      <Route path="sso-test" element={<SchoolTestDone />} />
      <Route path="privacy" element={<LegalPage doc="privacy" />} />
      <Route path="terms" element={<LegalPage doc="terms" />} />

      <Route element={inApp ? <Outlet /> : <Navigate to="/" replace />}>
        <Route element={<Onboarded />}>
          <Route path="lesson/:unitId/:lessonId" element={<LessonScreen />} />
          <Route element={<Layout />}>
            <Route path="learn" element={<Home />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="labs" element={<Labs />} />
            <Route path="labs/:id" element={<LabApp />} />
            {/* Old links (notifications already sent, bookmarks) still open Labs. */}
            <Route path="lab" element={<Navigate to="/labs" replace />} />
            <Route path="kit" element={<Kit />} />
            <Route path="tracks" element={<MyTracks />} />
          </Route>
        </Route>
        {/* Staff screens skip onboarding: an admin may never take a lesson on this device. Me does too: it holds the
            account section and Sign out, which a staff member on a phone (no nav rail) must always be able to reach. */}
        <Route element={<Layout />}>
          <Route path="me" element={<Me />} />
          {/* Signed out, /org only says to sign in: that needs no organization chunk, which reads through the SDK.
              On a slow start the account is on its way (`connecting`): the page waits for it, not "sign in first". */}
          <Route path="org" element={user ? <OrgScreen /> : offlineUid && connecting ? <Loading /> : <OrgGuest />} />
          <Route path="tutor" element={<Tutor relayUrl={import.meta.env.VITE_TUTOR_RELAY ?? ""} ask={call("tutorAsk")} status={call("tutorStatus")} Player={canPlayLight() ? LightLesson : null} />} />
          <Route path="upgrade" element={<UpgradeRoute />} />
          {/* University teachers: the courses a platform admin gave them (courseAccess/{uid}); the rules guard the data,
              and the page says so when there is no grant. Platform admins open it too. */}
          <Route element={<SignedInOnly />}>
            <Route path="results" element={<CourseResults content={CONTENT} />} />
          </Route>
          <Route element={<Allow roles={["orgAdmin"]} />}>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/page" element={<PageBuilder />} />
            <Route path="admin/people/:uid" element={<PersonDetail />} />
            <Route path="admin/analytics" element={<OrgReport />} />
            <Route path="admin/courses" element={<OrgCoursesPage />} />
            <Route path="admin/add" element={<AddPeople />} />
            <Route path="admin/import" element={<ImportPeople />} />
            <Route path="admin/content" element={<ContentList />} />
            <Route path="admin/content/:unitId" element={<UnitEditor Player={LessonPlayer} />} />
          </Route>
          <Route element={<Allow roles={["teacher", "orgAdmin"]} />}>
            <Route path="teach" element={<Teach />} />
            <Route path="teach/:uid" element={<TeachPerson />} />
            <Route path="teach/analytics" element={<OrgReport mode="teacher" />} />
          </Route>
          <Route element={<Allow roles={["superadmin"]} />}>
            <Route path="super" element={<SuperAdmin />} />
            <Route path="super/access" element={<CourseAccess content={CONTENT} />} />
            <Route path="super/analytics" element={<AnalyticsPage />} />
            <Route path="super/orgs" element={<OrgsAdmin />} />
            <Route path="super/plans" element={<PlansPage />} />
            <Route path="super/projects" element={<ProjectsPage />} />
            <Route path="super/certificates" element={<CertificatesPage />} />
            <Route path="super/bugs" element={<BugsPage />} />
            <Route path="super/feedback" element={<FeedbackPage />} />
            <Route path="super/domains" element={<DomainsPage />} />
            <Route path="super/orgs/:orgId" element={<OrgAnalytics />} />
            <Route path="super/orgs/:orgId/page" element={<PageBuilder />} />
            <Route path="super/orgs/:orgId/report" element={<OrgReport />} />
            <Route path="super/people" element={<PeoplePage />} />
            <Route path="super/people/:uid" element={<PersonDetail back="/super/people" />} />
            <Route path="super/content" element={<ContentList />} />
            <Route path="super/content/:unitId" element={<UnitEditor Player={LessonPlayer} />} />
            <Route path="super/tracks" element={<TracksPage />} />
            <Route path="super/languages" element={<LanguagesPage />} />
            <Route path="super/languages/:code" element={<TranslatePage />} />
          </Route>
          <Route path="*" element={<NotFound home={inApp ? homeFor(role) : "/"} />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
    </RouteBoundary>
    <LessonTutor />
    <ReportBug />
    <AppTour home={homeFor(role)} />
    <KeptNotice />
    </BrandProvider>
  );
}

/**
 * The window title names the page ("Labs — Darsi", «المختبرات — درسي»), so screen readers, the browser's tabs and its
 * history say where you are; an organization's members (and anyone on its own web address) see its name in place of
 * Darsi's. Pages without a name of their own (a lesson, the account screens) get Darsi's, or the organization's beside
 * it, or alone on a site without Darsi's identity. It comes before the routes and runs on every move, so a screen that
 * names itself more closely (a lesson's or a lab's title) in its own effect has the last word, and loses it when left.
 */
function PageTitle({ name, darsi }: { name: string | null; darsi: boolean }) {
  const { pathname } = useLocation();
  const { t, lang } = useI18n();
  const { user, role } = useAuth();
  const key = pageKey(pathname, role, Boolean(user));
  useEffect(() => {
    const own = t("app.name");
    document.title = key ? `${t(key)} — ${name || own}` : name ? (darsi ? `${name} — ${own}` : name) : lang === "ar" ? "درسي — Darsi" : "Darsi — درسي";
  }, [pathname, key, name, darsi, lang, t]);
  return null;
}

/**
 * /org for a guest: sign in first. Rendered here rather than in the lazy organization chunk, which reads through the
 * Firebase SDK that guests never download. An invite code in the address goes on to sign-in, which joins with it after.
 */
function OrgGuest() {
  const { t } = useI18n();
  const nav = useNavigate();
  const code = useSearchParams()[0].get("code");
  return (
    <>
      <AppBar title={t("org.title")} />
      <main className="screen narrow"><EmptyState icon="profile" title={t("org.signInFirst")}
        action={<Button onClick={() => nav(code ? `/signin?code=${encodeURIComponent(code)}` : "/signin")}>{t("auth.signIn")}</Button>} /></main>
    </>
  );
}

/** /upgrade, told whether Darsi Super is on (the chunk can't import content/settings without splitting startup). */
function UpgradeRoute() {
  return <Upgrade plansUrl={storageUrl("content/plans.json")} startCheckout={call("startCheckout")} setRenewal={call("setRenewal")} superOn={useSuperOn().on} />;
}

/**
 * The tutor on lesson screens: a floating button with the tutor's face, which opens the tutor beside the lesson. The
 * panel is the lazy tutor chunk, loaded on the first tap; moving to another lesson closes it (and any call).
 */
function LessonTutor() {
  const { t } = useI18n();
  const at = useMatch("/lesson/:unitId/:lessonId")?.params;
  const [open, setOpen] = useState(false);
  const superOn = useSuperOn().on;
  // A lesson link opened before onboarding shows onboarding, not a lesson (platform admins skip it).
  const { role } = useAuth();
  const onboarded = useStore().state.onboarded || role === "superadmin";
  useEffect(() => setOpen(false), [at?.lessonId]);
  const close = useCallback(() => setOpen(false), []);
  if (!at?.unitId || !at.lessonId || !superOn || !onboarded) return null;
  // The panel's chunk is not precached: if it can't load (offline, or a tab older than the last deploy), or the panel
  // breaks, the lesson carries on and the button comes back with a word about why.
  return open
    ? <RouteBoundary fallback={(failure) => <TutorMissing {...failure} close={close} />}>
        <Suspense fallback={<TutorFab label={t("lesson.askTutor")} onOpen={() => {}} busy />}><TutorPanel unitId={at.unitId} lessonId={at.lessonId} onClose={close} relayUrl={import.meta.env.VITE_TUTOR_RELAY ?? ""} ask={call("tutorAsk")} status={call("tutorStatus")} Player={canPlayLight() ? LightLesson : null} /></Suspense>
      </RouteBoundary>
    : <TutorFab label={t("lesson.askTutor")} onOpen={() => setOpen(true)} />;
}

/**
 * The tutor's panel didn't open. The button is back (a tap tries again), with a note that goes by itself: Darsi was
 * updated (Reload, when the learner chooses: never mid-lesson by itself), the tutor isn't on this phone yet, or it broke.
 */
function TutorMissing({ chunk, retry, close }: Failure & { close: () => void }) {
  const { t } = useI18n();
  const cause = useChunkCause(chunk);
  useEffect(() => { const id = setTimeout(close, 8000); return () => clearTimeout(id); }, [close]);
  return (
    <>
      <TutorFab label={t("lesson.askTutor")} onOpen={retry} busy={cause === null} />
      {cause === "outdated" ? <UpdateToast floating actionLabel={t("pwa.reload")} onAction={() => { void reloadForUpdate(); }}>{t(k("shell.outdated"))}</UpdateToast>
        : cause && <UpdateToast floating actionLabel={t("common.gotIt")} onAction={close}>{t(k(cause === "missing" ? "shell.notSaved" : "shell.tutorError"))}</UpdateToast>}
    </>
  );
}

/** On an organization's site without Darsi's identity, its name takes Darsi's place in every UI string (i18n rebrand). */
function WithI18n() {
  const { state } = useStore();
  const brand = identityOf(state.org, useSite().site);
  return <I18nProvider lang={state.lang} brand={brand.darsi ? null : brand.name}><SettingsProvider lang={state.lang}><BrowserRouter><Routed /></BrowserRouter></SettingsProvider></I18nProvider>;
}

/**
 * One local store per person on this device. An account created here a moment ago (sign-up or Google, by the person who
 * learned as a guest) takes over the guest's progress; accounts an organization made never do (adoptsGuest).
 */
function Scoped() {
  const { user, orgId, loading, offlineUid } = useAuth();
  if (loading) return <Loading />;
  // offlineUid: signed in on this device but offline before the SDK was cached; keep learning in their own store.
  const scope = user?.uid ?? offlineUid ?? "guest";
  return <StoreProvider key={scope} scope={scope} adoptGuest={adoptsGuest(user?.metadata, orgId)}><WithI18n /></StoreProvider>;
}

/**
 * Said once, on the page the person lands on after the restart:
 * - signing out with work not yet sent (offline, or a project typed and never sent): it stays on this device for the
 *   next sign-in here, when lessons and notes go up by themselves and the project is there to send;
 * - a session the server ended (AuthProvider sessionEnded): signed out, and whether unsent work was kept. Someone who
 *   ended it by leaving their organization is told by LeftOrgNote instead, unless work was kept.
 */
type Said = "kept" | "endedKept" | "ended" | null;
const NOTE: Record<Exclude<Said, null>, "auth.keptOnDevice" | "auth.endedKept" | "auth.ended"> = { kept: "auth.keptOnDevice", endedKept: "auth.endedKept", ended: "auth.ended" };
function KeptNotice() {
  const { t } = useI18n();
  const [show, setShow] = useState<Said>(() => {
    try {
      if (sessionStorage.getItem(KEPT_KEY) === "1") return "kept";
      const ended = sessionStorage.getItem(ENDED_NOTE);
      return ended === "kept" ? "endedKept" : ended === "out" && leftOrg.get() === null ? "ended" : null;
    } catch { return null; }
  });
  useEffect(() => { try { sessionStorage.removeItem(KEPT_KEY); sessionStorage.removeItem(ENDED_NOTE); } catch { /* private mode */ } }, []); // said once
  return show ? <UpdateToast floating actionLabel={t("common.gotIt")} onAction={() => setShow(null)}>{t(NOTE[show])}</UpdateToast> : null;
}

/**
 * AppBoundary: whatever no page boundary caught shows a calm card with Reload, never a blank page. Under the account,
 * the one provider left when the card shows, so a report sent from the card still says whose it is, as the app's own
 * "Report a problem" does (bugs/Fab.tsx).
 */
function Guarded() {
  const { user, profile, offlineUid } = useAuth();
  const name = profile?.name || user?.email || null;
  const who = useMemo<Reporter | null>(() => (user ? { uid: user.uid, name, getToken: () => user.getIdToken() }
    : offlineUid ? { uid: offlineUid, name: null, offline: true, getToken: null } : null), [user, name, offlineUid]);
  return <AppBoundary report={loadReport} who={who}><Scoped /></AppBoundary>;
}

export function App() {
  return <AuthProvider><Guarded /></AuthProvider>;
}

/** An unknown address: say so, and offer the way back to where this person starts. */
function NotFound({ home }: { home: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  return <main className="screen"><EmptyState title={t("err.notFound")} action={<Button onClick={() => nav(home)}>{t("err.goHome")}</Button>} /></main>;
}
