import { lazy, Suspense, useEffect, type ReactElement } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useSearchParams } from "react-router-dom";
import { applyLocale, EmptyState } from "@darsi/design-system";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Forgot, NotConfigured, SetPassword, SignIn, SignUp } from "./auth/AuthScreens";
import type { Role } from "./auth/types";
import { I18nProvider, useI18n } from "./i18n";
import { StoreProvider, useStore } from "./state/store";
import { useCloudSync } from "./state/sync";
import { configureContent, setOrgReader } from "./content/load";
import { SettingsProvider, useLanguageReady } from "./content/settings";
import { loadFirebase } from "./fb";
import { usePushRefresh } from "./notify/usePushRefresh";
import { Layout } from "./components/Layout";
import { Home } from "./screens/Home";
import { LessonPlayer, LessonScreen } from "./screens/LessonScreen";
import { Onboarding } from "./screens/Onboarding";
import { Kit } from "./screens/Kit";
import { Downloads } from "./screens/Downloads";
import { LabApp, Labs } from "./screens/Labs";
import { Me } from "./screens/Me";

// Loaded on demand: learners never download or parse the landing page (after their first visit) or any staff screen.
// vite.config.ts keeps these chunks out of the precache; the service worker caches each one the first time it is used.
const Landing = lazy(() => import("./landing/Landing").then((m) => ({ default: m.Landing })));
const OrgScreen = lazy(() => import("./org/OrgScreen").then((m) => ({ default: m.OrgScreen })));
const AdminHome = lazy(() => import("./admin/AdminHome").then((m) => ({ default: m.AdminHome })));
const PersonDetail = lazy(() => import("./admin/PersonDetail").then((m) => ({ default: m.PersonDetail })));
const AddPeople = lazy(() => import("./admin/AddPeople").then((m) => ({ default: m.AddPeople })));
const ImportPeople = lazy(() => import("./admin/AddPeople").then((m) => ({ default: m.ImportPeople })));
const Teach = lazy(() => import("./admin/Teach").then((m) => ({ default: m.Teach })));
const TeachPerson = lazy(() => import("./admin/Teach").then((m) => ({ default: m.TeachPerson })));
const SuperAdmin = lazy(() => import("./admin/SuperAdmin").then((m) => ({ default: m.SuperAdmin })));
// Course editor (platform and org admins): one "Cms" chunk, also kept out of the precache. It gets the lesson player
// (for its preview) as a prop: importing it there would pull the player's lazy SDK loads into a shared chunk and
// split the startup bundle. Org-only units are read through the SDK, which only signed-in members load.
const ContentList = lazy(() => import("./cms/Cms").then((m) => ({ default: m.ContentList })));
const UnitEditor = lazy(() => import("./cms/Cms").then((m) => ({ default: m.UnitEditor })));
const TracksPage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.TracksPage })));
const LanguagesPage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.LanguagesPage })));
const TranslatePage = lazy(() => import("./cms/Cms").then((m) => ({ default: m.TranslatePage })));
setOrgReader((path) => loadFirebase().then((fb) => fb.storageJSON(path)));

const Loading = () => <div className="loading" aria-busy="true" />;

/** Role guard: roles come from the ID token claims, the same ones the security rules check. */
function Allow({ roles }: { roles: Role[] }) {
  const { role } = useAuth();
  return roles.includes(role) ? <Outlet /> : <Navigate to="/learn" replace />;
}

/** Learning screens need the onboarding answers (language, where you teach, tracks, level) first. */
function Onboarded() {
  const { state } = useStore();
  return state.onboarded ? <Outlet /> : <Onboarding />;
}

/**
 * Signing in swaps the store (key = uid), which remounts the router, so the account screens' own nav() after
 * sign-in never runs; this sends people on instead. Sign-up from "Register your organization" carries ?org=1.
 */
function SignedIn() {
  const [params] = useSearchParams();
  const { role } = useAuth();
  return <Navigate to={params.get("org") === "1" ? "/org?request=1" : homeFor(role)} replace />;
}

/** Where each role starts: admins at their dashboards (no onboarding), everyone else at their lessons. */
const homeFor = (role: Role) => (role === "orgAdmin" ? "/admin" : role === "superadmin" ? "/super" : "/learn");

function Routed() {
  const { state, ready, dispatch } = useStore();
  const { user, profile, role, orgId, configured, offlineUid } = useAuth();
  const { t, dir } = useI18n();
  // Before any screen asks for the catalog: org members also see their org's published units.
  configureContent({ orgId: user ? orgId : null, signedIn: Boolean(user || offlineUid) });
  useEffect(() => {
    applyLocale(state.lang, state.theme, dir); // an added language's direction is the one platform admins set
    document.title = state.lang === "ar" ? "درسي — Darsi" : "Darsi — درسي";
  }, [state.lang, state.theme, dir]);
  // Certificates use the local name; start it from the account name.
  useEffect(() => { if (ready && profile?.name && !state.name) dispatch({ type: "set", patch: { name: profile.name } }); }, [ready, profile?.name, state.name, dispatch]);
  useCloudSync(user?.uid);
  usePushRefresh(); // signed in and opted in on this phone only; guests never load messaging
  const langReady = useLanguageReady();

  // An added language's strings are fetched when it is picked: until then the loading screen, not English.
  if (!ready || !langReady) return <Loading />;
  if (user && profile?.mustChangePassword) return <SetPassword />;
  // Guests: chose "Continue without an account", or used Darsi on this device before accounts existed.
  const inApp = Boolean(user) || Boolean(offlineUid) || Boolean(state.guest) || state.onboarded;
  const account = (screen: ReactElement) => (user ? <SignedIn /> : configured ? screen : <NotConfigured />);

  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route index element={inApp ? <Navigate to={homeFor(role)} replace /> : <Landing />} />
      <Route path="signin" element={account(<SignIn />)} />
      <Route path="signup" element={account(<SignUp />)} />
      <Route path="forgot" element={account(<Forgot />)} />
      <Route path="welcome" element={<Navigate to="/" replace />} />

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
          </Route>
        </Route>
        {/* Staff screens skip onboarding: an admin may never take a lesson on this device. Me does too: it holds the
            account section and Sign out, which a staff member on a phone (no nav rail) must always be able to reach. */}
        <Route element={<Layout />}>
          <Route path="me" element={<Me />} />
          <Route path="org" element={<OrgScreen />} />
          <Route element={<Allow roles={["orgAdmin"]} />}>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/people/:uid" element={<PersonDetail />} />
            <Route path="admin/add" element={<AddPeople />} />
            <Route path="admin/import" element={<ImportPeople />} />
            <Route path="admin/content" element={<ContentList />} />
            <Route path="admin/content/:unitId" element={<UnitEditor Player={LessonPlayer} />} />
          </Route>
          <Route element={<Allow roles={["teacher", "orgAdmin"]} />}>
            <Route path="teach" element={<Teach />} />
            <Route path="teach/:uid" element={<TeachPerson />} />
          </Route>
          <Route element={<Allow roles={["superadmin"]} />}>
            <Route path="super" element={<SuperAdmin />} />
            <Route path="super/content" element={<ContentList />} />
            <Route path="super/content/:unitId" element={<UnitEditor Player={LessonPlayer} />} />
            <Route path="super/tracks" element={<TracksPage />} />
            <Route path="super/languages" element={<LanguagesPage />} />
            <Route path="super/languages/:code" element={<TranslatePage />} />
          </Route>
          <Route path="*" element={<main className="screen"><EmptyState title={t("err.notFound")} /></main>} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}

function WithI18n() {
  const { state } = useStore();
  return <I18nProvider lang={state.lang}><SettingsProvider lang={state.lang}><BrowserRouter><Routed /></BrowserRouter></SettingsProvider></I18nProvider>;
}

/** One local store per person on this device; a just-created account takes over the guest's progress. */
function Scoped() {
  const { user, loading, offlineUid } = useAuth();
  if (loading) return <Loading />;
  const created = user?.metadata.creationTime ? Date.parse(user.metadata.creationTime) : 0;
  // offlineUid: signed in on this device but offline before the SDK was cached; keep learning in their own store.
  const scope = user?.uid ?? offlineUid ?? "guest";
  return <StoreProvider key={scope} scope={scope} adoptGuest={Date.now() - created < 10 * 60e3}><WithI18n /></StoreProvider>;
}

export function App() {
  return <AuthProvider><Scoped /></AuthProvider>;
}
