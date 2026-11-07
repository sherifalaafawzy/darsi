import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, applyLocale, BrandProvider, Button, EmptyState, UpdateToast } from "@darsi/design-system";
import { AuthProvider, KEPT_KEY, useAuth } from "./auth/AuthProvider";
import { Forgot, NotConfigured, SetPassword, SignIn, SignUp } from "./auth/AuthScreens";
import type { Role } from "./auth/types";
import { I18nProvider, useI18n } from "./i18n";
import { adoptsGuest, StoreProvider, useStore } from "./state/store";
import { useCloudSync, useLearningSync } from "./state/sync";
import { useOrgBrand } from "./state/orgBrand";
import { useAnalytics } from "./analytics/useAnalytics";
import { configureContent, loadCatalog, loadUnit, setOrgReader, storageUrl } from "./content/load";
import { SettingsProvider, useLanguageReady, useSuperOn } from "./content/settings";
import { call, loadFirebase } from "./fb";
import { usePushRefresh } from "./notify/usePushRefresh";
import { Layout, pageKey } from "./components/Layout";
import { Home } from "./screens/Home";
import { LessonPlayer, LessonScreen } from "./screens/LessonScreen";
import { canPlayLight, LightLesson, setLightPlayer } from "./lesson/LightLesson";
import { Onboarding } from "./screens/Onboarding";
import { Kit } from "./screens/Kit";
import { Downloads, useOfflineRefresh } from "./screens/Downloads";
import { MyTracks } from "./screens/MyTracks";
import { LabApp, Labs } from "./screens/Labs";
import { Me } from "./screens/Me";
import { TutorFab } from "./tutor/Fab";
import { ReportBug } from "./bugs/Fab";
import { AppTour } from "./tour/Start";

// Loaded on demand: learners never download or parse the landing page (after their first visit) or any staff screen.
// vite.config.ts keeps these chunks out of the precache; the service worker caches each one the first time it is used.
const Landing = lazy(() => import("./landing/Landing").then((m) => ({ default: m.Landing })));
const Licences = lazy(() => import("./landing/Licences").then((m) => ({ default: m.Licences })));
const OrgScreen = lazy(() => import("./org/OrgScreen").then((m) => ({ default: m.OrgScreen })));
const AdminHome = lazy(() => import("./admin/AdminHome").then((m) => ({ default: m.AdminHome })));
const PersonDetail = lazy(() => import("./admin/PersonDetail").then((m) => ({ default: m.PersonDetail })));
const AddPeople = lazy(() => import("./admin/AddPeople").then((m) => ({ default: m.AddPeople })));
const ImportPeople = lazy(() => import("./admin/AddPeople").then((m) => ({ default: m.ImportPeople })));
const Teach = lazy(() => import("./admin/Teach").then((m) => ({ default: m.Teach })));
const TeachPerson = lazy(() => import("./admin/Teach").then((m) => ({ default: m.TeachPerson })));
const CourseResults = lazy(() => import("./results/CourseResults").then((m) => ({ default: m.CourseResults })));
const CourseAccess = lazy(() => import("./results/CourseAccess").then((m) => ({ default: m.CourseAccess })));
/** Course results and access get content loading from here (results/async.ts says why). */
const CONTENT = { loadCatalog, loadUnit };
const SuperAdmin = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.SuperAdmin })));
const AnalyticsPage = lazy(() => import("./admin/Analytics").then((m) => ({ default: m.AnalyticsPage })));
const PeoplePage = lazy(() => import("./admin/Analytics").then((m) => ({ default: m.PeoplePage })));
const OrgAnalytics = lazy(() => import("./admin/Analytics").then((m) => ({ default: m.OrgAnalytics })));
const OrgReport = lazy(() => import("./admin/OrgReport").then((m) => ({ default: m.OrgReport })));
const OrgsAdmin = lazy(() => import("./admin/OrgsAdmin").then((m) => ({ default: m.OrgsAdmin })));
const PlansPage = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.PlansPage })));
const ProjectsPage = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.ProjectsPage })));
const CertificatesPage = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.CertificatesPage })));
const BugsPage = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.BugsPage })));
const Upgrade = lazy(() => import("./upgrade/Upgrade").then((m) => ({ default: m.Upgrade })));
const Tutor = lazy(() => import("./tutor/Tutor").then((m) => ({ default: m.Tutor })));
const TutorPanel = lazy(() => import("./tutor/Tutor").then((m) => ({ default: m.TutorPanel })));
// Course editor (platform and org admins): one "Cms" chunk, also kept out of the precache. It gets the lesson player
// (for its preview) as a prop: importing it there would pull the player's lazy SDK loads into a shared chunk and
// split the startup bundle. Org-only units are read through the SDK, which only signed-in members load.
const ContentList = lazy(() => import("./cms/Cms").then((m) => ({ default: m.ContentList })));
const UnitEditor = lazy(() => import("./cms/Cms").then((m) => ({ default: m.UnitEditor })));
const TracksPage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.TracksPage })));
const LanguagesPage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.LanguagesPage })));
const TranslatePage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.TranslatePage })));
setOrgReader((path) => loadFirebase().then((fb) => fb.storageJSON(path)));
setLightPlayer(() => import("./vendor/lessonstudio-player.js"));

const Loading = () => <div className="loading" aria-busy="true" />;

/** Role guard: roles come from the ID token claims, the same ones the security rules check. */
function Allow({ roles }: { roles: Role[] }) {
  const { role } = useAuth();
  return roles.includes(role) ? <Outlet /> : <Navigate to="/learn" replace />;
}

/**
 * Pages for any signed-in account that read its data through the SDK (Course results). Guests go to sign in without
 * loading the page, so they never download Firebase; an account whose SDK can't load yet (offline) goes to its lessons.
 */
function SignedInOnly() {
  const { user, offlineUid } = useAuth();
  return user ? <Outlet /> : <Navigate to={offlineUid ? "/learn" : "/signin"} replace />;
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
  const { user, profile, profileReady, role, orgId, configured, offlineUid } = useAuth();
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
  useOrgBrand(user?.uid, user ? orgId : null);
  useAnalytics(); // a queue on the phone, sent in small batches (analytics/track.ts); no Firebase
  useOfflineRefresh(); // once per version: downloaded courses keep their code steps, labs and packs (screens/Downloads)
  usePushRefresh(); // signed in and opted in on this phone only; guests never load messaging
  const langReady = useLanguageReady();

  // An added language's strings are fetched when it is picked: until then the loading screen, not English.
  if (!ready || !langReady) return <Loading />;
  if (user && profile?.mustChangePassword) return <SetPassword />;
  // Guests: chose "Continue without an account", or used Darsi on this device before accounts existed.
  const inApp = Boolean(user) || Boolean(offlineUid) || Boolean(state.guest) || state.onboarded;
  const account = (screen: ReactElement) => (user ? <SignedIn /> : configured ? screen : <NotConfigured />);

  return (
    <BrandProvider logo={state.org?.logo} name={state.org?.name}>
    <PageTitle />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route index element={inApp ? <Navigate to={homeFor(role)} replace /> : <Landing />} />
      <Route path="signin" element={account(<SignIn />)} />
      <Route path="signup" element={account(<SignUp />)} />
      <Route path="forgot" element={account(<Forgot />)} />
      <Route path="welcome" element={<Navigate to="/" replace />} />
      {/* Open-source licences: for anyone, from Me or the home page's footer (a lazy chunk, not precached). */}
      <Route path="licences" element={<Licences />} />

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
          {/* Signed out, /org only says to sign in: that needs no organization chunk, which reads through the SDK. */}
          <Route path="org" element={user ? <OrgScreen /> : <OrgGuest />} />
          <Route path="tutor" element={<Tutor relayUrl={import.meta.env.VITE_TUTOR_RELAY ?? ""} ask={call("tutorAsk")} status={call("tutorStatus")} Player={canPlayLight() ? LightLesson : null} />} />
          <Route path="upgrade" element={<UpgradeRoute />} />
          {/* University teachers: the courses a platform admin gave them (courseAccess/{uid}); the rules guard the data,
              and the page says so when there is no grant. Platform admins open it too. */}
          <Route element={<SignedInOnly />}>
            <Route path="results" element={<CourseResults content={CONTENT} />} />
          </Route>
          <Route element={<Allow roles={["orgAdmin"]} />}>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/people/:uid" element={<PersonDetail />} />
            <Route path="admin/analytics" element={<OrgReport />} />
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
            <Route path="super/orgs/:orgId" element={<OrgAnalytics />} />
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
    <LessonTutor />
    <ReportBug />
    <AppTour home={homeFor(role)} />
    <KeptNotice />
    </BrandProvider>
  );
}

/**
 * The window title names the page ("Labs — Darsi", «المختبرات — درسي»), so screen readers, the browser's tabs and its
 * history say where you are; an organization's members see its name in place of Darsi's. Pages without a name of their
 * own (a lesson, the account screens) get Darsi's. It comes before the routes and runs on every move, so a screen that
 * names itself more closely (a lesson's or a lab's title) in its own effect has the last word, and loses it when left.
 */
function PageTitle() {
  const { pathname } = useLocation();
  const { t, lang } = useI18n();
  const { user, role } = useAuth();
  const org = useStore().state.org?.name;
  const key = pageKey(pathname, role, Boolean(user));
  useEffect(() => {
    const darsi = t("app.name");
    document.title = key ? `${t(key)} — ${org || darsi}` : org ? `${org} — ${darsi}` : lang === "ar" ? "درسي — Darsi" : "Darsi — درسي";
  }, [pathname, key, org, lang, t]);
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
  if (!at?.unitId || !at.lessonId || !superOn || !onboarded) return null;
  return open
    ? <Suspense fallback={<TutorFab label={t("lesson.askTutor")} onOpen={() => {}} busy />}><TutorPanel unitId={at.unitId} lessonId={at.lessonId} onClose={() => setOpen(false)} relayUrl={import.meta.env.VITE_TUTOR_RELAY ?? ""} ask={call("tutorAsk")} status={call("tutorStatus")} Player={canPlayLight() ? LightLesson : null} /></Suspense>
    : <TutorFab label={t("lesson.askTutor")} onOpen={() => setOpen(true)} />;
}

function WithI18n() {
  const { state } = useStore();
  return <I18nProvider lang={state.lang}><SettingsProvider lang={state.lang}><BrowserRouter><Routed /></BrowserRouter></SettingsProvider></I18nProvider>;
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

/** After signing out with work not yet sent (offline): it stays on this device and goes up at the next sign-in here. */
function KeptNotice() {
  const { t } = useI18n();
  const [show, setShow] = useState(() => { try { return sessionStorage.getItem(KEPT_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { sessionStorage.removeItem(KEPT_KEY); } catch { /* private mode */ } }, []); // said once
  return show ? <UpdateToast floating actionLabel={t("common.gotIt")} onAction={() => setShow(false)}>{t("auth.keptOnDevice")}</UpdateToast> : null;
}

export function App() {
  return <AuthProvider><Scoped /></AuthProvider>;
}

/** An unknown address: say so, and offer the way back to where this person starts. */
function NotFound({ home }: { home: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  return <main className="screen"><EmptyState title={t("err.notFound")} action={<Button onClick={() => nav(home)}>{t("err.goHome")}</Button>} /></main>;
}
