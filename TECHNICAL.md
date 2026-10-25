# Darsi: technical overview

This document explains how Darsi is built. For what Darsi is and why it exists, see the [README](README.md). Deployment steps are in [docs/FIREBASE.md](docs/FIREBASE.md), lesson authoring in [docs/CONTENT.md](docs/CONTENT.md), native apps in [docs/NATIVE.md](docs/NATIVE.md).

- [Constraints that shape everything](#constraints-that-shape-everything)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Commands](#commands)
- [App architecture](#app-architecture)
- [Offline and caching](#offline-and-caching)
- [Cloud sync](#cloud-sync)
- [Backend: Firebase](#backend-firebase)
- [Content, lessons and kits](#content-lessons-and-kits)
- [Languages and right-to-left](#languages-and-right-to-left)
- [Design system and CSS](#design-system-and-css)
- [Testing](#testing)
- [Performance budget](#performance-budget)
- [Known gaps and roadmap](#known-gaps-and-roadmap)

---

## Constraints that shape everything

Darsi's users are teachers on low-cost Android phones, often shared, with expensive and patchy mobile data, limited battery and little free storage. Most technical choices below follow from four rules:

1. **Offline is normal.** The app must open and teach with no signal. The network is an optimisation, never a requirement.
2. **Light on data and battery.** There are no live Firestore listeners and no polling. The app does one read per sign-in and writes only what changed. Heavy code is lazy-loaded, sizes are shown before downloads, and nothing autoplays.
3. **Every language is a first language.** Arabic (RTL) and English are both first-class. Layout uses logical CSS properties only, and numbers follow the locale.
4. **One codebase, three targets.** The PWA is the app. Capacitor wraps the same build for Android and iOS. Only `src/platform/` knows whether it runs in a browser or a native shell.

## Stack

| Area | Choice |
|---|---|
| App | React 19.3, TypeScript 6.0, react-router 7.18, Vite 8.3 |
| PWA | vite-plugin-pwa 2.0 (Workbox `generateSW`, prompt-to-update) |
| Backend | Firebase 12.19: Auth, Cloud Firestore (persistent offline cache), Cloud Functions 2nd gen (Node 22, firebase-functions 7.4, firebase-admin 14.5), Cloud Storage, Hosting |
| Design system | `@darsi/design-system`: tokens, fonts, icons, 45 RTL-aware React components, built with tsup |
| Native | Capacitor 8.5 (`app.darsi.teachers`) |
| Admin tooling | exceljs 4.4 (lazy-loaded) for Excel/CSV import and credential sheets |
| Kits | pptxgenjs 4.0 and headless Chromium, at build time only |
| Tests | Vitest 5 (jsdom), Playwright 1.64 (desktop and Pixel 7 profiles) |

## Repository layout

```
darsi/
├─ apps/web/                     the PWA
│  ├─ public/content/            lesson content as JSON (en + ar): the single source for the app and the kits
│  ├─ public/kits/               generated classroom kits (PDF + PPTX), committed
│  ├─ scripts/build-kits.mjs     generates the kits from the content
│  ├─ src/
│  │  ├─ App.tsx                 providers, routes, role guards, lazy staff chunks
│  │  ├─ firebase-config.ts      Firebase settings from env (no SDK; safe on the startup path)
│  │  ├─ fb.ts                   the only way startup code reaches Firebase: loadFirebase(), call(), storedSession()
│  │  ├─ firebase.ts             the SDK (Auth, Firestore; Functions and Storage on first use); loaded via fb.ts
│  │  ├─ auth/                   AuthProvider (user + custom claims), sign-in screens, callable API
│  │  ├─ state/                  local store (IndexedDB) and cloud sync
│  │  ├─ screens/                learner screens: Home, Lesson, Kit, Downloads, Lab, Me, Onboarding
│  │  ├─ lesson/                 lesson engine, step views, project submission, read-aloud
│  │  ├─ admin/                  org dashboard, people, import, person page, teacher and platform admin
│  │  ├─ org/                    join or register an organization
│  │  ├─ landing/                public home page
│  │  ├─ content/                content types, loader, competency frameworks
│  │  ├─ i18n/                   UI strings (en.json, ar.json) and the provider
│  │  ├─ styles/                 one stylesheet per screen area (see Design system and CSS)
│  │  └─ platform/               the only web/native-aware code: storage, file save, share
│  ├─ e2e/, tests/               Playwright end-to-end, Vitest unit tests
│  └─ capacitor.config.ts
├─ packages/design-system/       @darsi/design-system (tokens.json → CSS/TS, components, logos, fonts)
├─ functions/                    Cloud Functions (own package and lockfile)
├─ firebase/                     firestore.rules, storage.rules, firestore.indexes.json
├─ scripts/                      set-superadmin.mjs, check-css.mjs
├─ docs/                         FIREBASE, CONTENT, NATIVE, design-system PDF
└─ firebase.json, .firebaserc    hosting (headers, SPA rewrite), emulators, deploy targets
```

## Commands

Run from the repository root. Node 22 is recommended and npm 11 is expected (`npx -y npm@11.13.0 install` if npm 10 fails).

| Command | What it does |
|---|---|
| `npm install` | Installs the workspaces and builds the design system |
| `npm run dev` | Dev server at http://localhost:5173, talking to the Emulator Suite (`.env.development`) |
| `npm run build` | Builds the design system and the PWA into `apps/web/dist` (uses `.env.local`, the real project) |
| `npm run preview` | Serves the production build at http://localhost:4173 with the service worker on |
| `npm test` | Unit tests (design system + app) |
| `npm run e2e` | Playwright on desktop and phone. It runs `npm run build` first; set `CHROMIUM_PATH` if Playwright's own Chromium isn't installed |
| `npm run typecheck` | TypeScript across the workspace |
| `npm run lint:css` | Checks every app stylesheet against the RTL, token and old-WebView rules |
| `npm run kits` | Regenerates the classroom kits from the content |
| `npm run superadmin -- <email>` | Makes an account a platform admin (`--revoke`, `--emulator`) |
| `npm --prefix functions run build` / `test` | Builds or tests the Cloud Functions |
| `npm run cap:android` / `cap:ios` | Creates and opens the native projects |

## App architecture

### Provider tree

```
AuthProvider            Firebase user + custom claims {role, orgId}; claims are read before the user is published
└─ StoreProvider        local state, keyed by uid (or "guest"); switching accounts remounts everything below
   └─ I18nProvider      language from the store
      └─ BrowserRouter
         └─ Routed      routes, guards, useCloudSync(uid)
```

- **Firebase loads only when needed.** At startup, `storedSession()` (`fb.ts`) reads Firebase Auth's own persisted session from IndexedDB (or localStorage) without the SDK:
  - **A session is stored:** AuthProvider loads the SDK at once and subscribes to auth state.
  - **None is stored (a guest or new visitor):** nothing loads.
  - **The account screens** call `ensureFirebase()` when they open: the form shows immediately and the SDK arrives while people type. The Google button waits for it, because browsers only allow the sign-in popup straight from a tap.
  - **The SDK can't load** (offline, and its chunk isn't cached yet): AuthProvider sets `offlineUid` from the stored session. That person keeps learning in their own local store and reconnects on the next `online` event.
  - **The rule for new code:** never import `firebase/*` or `./firebase` statically on the guest path. Go through `loadFirebase()`, or keep the module in a lazy chunk. The e2e test "guests never download the Firebase SDK" guards this.
- **One local store per person on the device.** The keys are `darsi:state:<uid>` for accounts and `darsi:state` for guests.
  - An account used on this device for the first time starts from the guest's settings.
  - An account created in the last 10 minutes takes over the guest's learning, so "your progress stays on this device until you create an account" holds true.
- **Guests:** anyone who chose "Continue without an account", or who used Darsi before accounts existed. Guests get the whole learning experience; only cloud features need an account.

### Routes and roles

| Path | Who | Notes |
|---|---|---|
| `/` | everyone | Landing page for new visitors; otherwise redirects to the role's home |
| `/signin`, `/signup`, `/forgot` | signed out | A "not configured" notice when the build has no Firebase config |
| `/learn`, `/lesson/:unit/:lesson`, `/downloads`, `/lab`, `/kit`, `/me` | signed in or guest | Behind the onboarding gate (language, school level, tracks, weekly goal, placement) |
| `/org` | signed in | Join with an invite code, or request a new organization (`?request=1`) |
| `/admin`, `/admin/people/:uid`, `/admin/add`, `/admin/import` | `orgAdmin` | Organization dashboard, person page, add people, Excel/CSV import |
| `/teach`, `/teach/:uid` | `teacher`, `orgAdmin` | The teacher's assigned students |
| `/super` | `superadmin` | Approve or reject organization requests |

Roles are `learner` (independent), `student`, `teacher`, `orgAdmin` and `superadmin`. They live in **Auth custom claims**, which only Cloud Functions set, and are mirrored to `users/{uid}` for the UI. When `users/{uid}` changes role or organization, AuthProvider refreshes the token so the security rules see the new claims.

After sign-in, `homeFor(role)` sends org admins to `/admin` and platform admins to `/super`; everyone else goes to `/learn`. Staff routes skip the onboarding gate. Accounts created by an admin with `mustChangePassword` see the set-password screen before anything else.

### Layout

At 900 px and wider, a nav rail shows the five learner tabs plus the role's staff links. On phones, the design system's bottom nav keeps five tabs (Learn, Downloads, AI lab, Kit, Me), and the staff links live in Me's account section. Staff screens and the landing page are **lazy chunks** (`React.lazy`), so a learner's phone never downloads or parses them.

## Offline and caching

The service worker (Workbox `generateSW`) installs when a person enters the app. Visitors who only read the landing page never download the offline bundle.

| What | Strategy |
|---|---|
| App shell, learner screens, fonts, icons, lesson JSON | **Precached** (~850 KB) |
| The Firebase SDK (`firebase-*`), staff chunks, landing page, exceljs, and their CSS | **Not precached**; `darsi-chunks` caches them cache-first on first use (hashed file names) |
| `/content/*` | Stale-while-revalidate (`darsi-content`) |
| `/kits/*` | Cache-first (`darsi-kits`), filled per unit when the teacher taps Download |
| `/media/*` | Cache-first with range requests (`darsi-media`) |
| Firestore data | The SDK's persistent IndexedDB cache, capped at **10 MB** (the default is 40 MB) |

- **Updates** use prompt mode: a "Reload" toast appears on app screens, never in the middle of a lesson.
- **Hosting headers:** `sw.js` and `index.html` are `no-cache`; hashed assets are cached for a year.
- **Lesson videos are optional.** If a video can't load (not produced yet, offline, not downloaded), the step switches to the transcript, and the checkpoint question sits under it. Opening the transcript to read instead of streaming does the same. A missing video never blocks a lesson.

## Cloud sync

`src/state/sync.ts` (`useCloudSync`) keeps a signed-in person's progress and notes in Firestore, where teachers and admins read them.

- **Reads:** both collections are read once per sign-in, and once more on the `online` event if that first read only reached the offline cache. There are no listeners and no polling.
- **Merge** (`mergeRemote` in `store.tsx`): the newer copy wins. Lessons compare `completedAt`; notes compare their local edit time with `updatedAt`. A lesson first seen from the cloud counts toward the teaching week it was completed in, which keeps streaks correct.
- **Writes** (`toPush`): only entries the cloud lacks or has an older copy of. Until a read has reached the server, only work finished in this session is written, so a stale phone can never overwrite newer work from another device. Firestore's offline queue carries writes made without a signal.
- **Uploads:** project photos are scaled to at most 1280 px and re-encoded as JPEG on the phone before upload (`ProjectView.shrinkImage`). PDFs and anything the browser can't decode go up unchanged.

## Backend: Firebase

Project **`darsi-f0685`**. Firestore, Cloud Functions and the Storage bucket the app uses (`darsi-f0685`) are all in **europe-west1**. Hosting is at https://darsi-f0685.web.app.

Firebase's original default bucket, `darsi-f0685.firebasestorage.app`, was created in us-west1, and a bucket's location can't change. The app points at the europe-west1 bucket through `VITE_FIREBASE_STORAGE_BUCKET`, and the US bucket was never used and was deleted on 2026-10-25.

`firebase.json` deploys the Storage rules through the deploy target `main`. `.firebaserc` maps it to `darsi-f0685`, and to `demo-darsi.appspot.com` for the emulators. Keep the target: without one, `firebase deploy --only storage` aims at the project's default bucket, which no longer exists.

### Data model (Firestore)

```
users/{uid}                 name, email, username, role, orgId, group, teacherId, lang, teach, tracks,
│                           weeklyLessons, levels, mustChangePassword, active, lastActive, createdAt,
│                           summary {lessonsDone, xp, avgAccuracy, lastActive, competencies, units}   ← written by onProgressWrite
├─ progress/{lessonId}      lessonId, unitId, track, accuracy (0–1), xp (int 0–100), seconds, completedAt (ISO), competencies[]
├─ notes/{lessonId}         text, updatedAt (ms)
└─ submissions/{id}         lessonId, unitId, stepId, orgId, text, fileUrl, fileName,
                            status (submitted | approved | revise), feedback, score, reviewedBy, reviewedAt, createdAt
orgs/{orgId}                name, type, country, city, size, contact, reason, status (pending | active | rejected),
                            createdBy, inviteCodes {teacher, student}, memberCount, reviewNote, createdAt, reviewedAt
inviteCodes/{code}          orgId, role                      ← Cloud Functions only
audit/{id}                  action, by, …, at                ← Cloud Functions write; platform admins read
```

Username logins (for people without email) map to `<username>@users.darsi.app`. The mapping lives in two places, `apps/web/src/auth/api.ts` and `functions/src/passwords.ts`, which must stay in sync.

### Security rules

**Firestore** (`firebase/firestore.rules`):
- **`users/{uid}`:**
  - *Read:* the person, a platform admin, their organization's admins, and their assigned teacher.
  - *Self-registration:* only as an independent `learner`, with a fixed list of fields.
  - *Self-edits:* never role, organization, teacher or summary.
  - *Org admins:* may change only group, teacher, active flag and name.
- **`progress`:** written only by its owner. Only the listed keys are accepted, `accuracy` must be 0–1, and `xp` must be an integer 0–100. Nobody can delete it.
- **`submissions`:** created by the owner with status `submitted`. Reviewed by the assigned teacher, the org admin or a platform admin, who can change only status, score, feedback and reviewer fields.
- **`notes`:** the owner only.
- **`orgs`:** readable by members, the requester and platform admins. Created only through `requestOrg`.
- **`inviteCodes`:** no client access at all.

**Storage** (`firebase/storage.rules` on `darsi-f0685`):
- `media/` and `kits/` are publicly readable and never writable from the client.
- `submissions/{orgId|none}/{uid}/{file}` is created only by its owner: under 10 MB, images, PDF, mp4 or audio. It can be read by the owner, a platform admin, or that organization's admins and teachers.

### Cloud Functions (europe-west1)

| Function | Type | What it does |
|---|---|---|
| `requestOrg` | callable | A signed-in person asks to register an organization (one pending request at a time) |
| `reviewOrg` | callable | Platform admin approves (creates invite codes; the requester becomes its admin) or rejects with a note |
| `joinOrg` | callable | Join an active organization with a teacher or student invite code |
| `regenerateInviteCode` | callable | Org admin replaces a code; the old one stops working |
| `createMembers` | callable | Bulk accounts (up to 500 per call): random passwords with no look-alike characters, usernames for people without email, teacher assignment |
| `setMemberRole` | callable | Org admin changes a member's role (never their own admin role) |
| `resetMemberPassword` | callable | New random password; the person must choose their own at next sign-in |
| `removeMember` | callable | Back to an independent learner; their learning record stays with them |
| `passwordChanged` | callable | Clears the first-sign-in flag after the person picks a password |
| `onProgressWrite` | Firestore trigger | Recomputes `users/{uid}.summary` (lessons, XP, accuracy, competencies, units, last activity) |

Every role or organization change goes through these functions, which set the claims and write an `audit` entry. Clients can never grant themselves access.

## Content, lessons and kits

- **Content is data.** Units are JSON in `apps/web/public/content/units/`, listed in `catalog.json` and typed by `src/content/types.ts`. Every learner-facing string is `{ "en": …, "ar": … }`, with English as the fallback. Today `ai-1` is live; `iot-1` and `cyber-1` are marked "coming soon".
- **Lesson shape:** video (with a checkpoint question) → reading with key terms → mixed questions (some lessons add an AI-lab step) → classroom project → reflection → "Try it in class tomorrow".
- **Step types:** `video`, `read`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `lab`, `project`, `reflect`.
- **Engine** (`src/lesson/engine.ts`): pure, unit-tested grading. Answers that ignore case and Arabic diacritics are accepted. A wrong answer comes back once at the end of the lesson. XP is `10 + round(accuracy × 20)`.
- **Placement:** nine questions (`placement.json`) suggest a level per track, and the teacher can change it any time.
- **Competencies:** each lesson lists codes from the UNESCO AI Competency Framework for Teachers (`T.*`), the one for Students, DigComp 2.2 (`DC.*`) and Darsi IoT. They feed the capability views for admins.
- **Classroom kits:** `npm run kits` reads each lesson's `slides` and steps and writes, per language:
  - `slides-<lang>.pptx`: editable PowerPoint via pptxgenjs (RTL for Arabic, Arial so it renders on any school PC);
  - `slides-<lang>.pdf`: the same slides with the brand fonts embedded (headless Chromium);
  - `lesson-plan-<lang>.pdf`: an A4 lesson plan and pupil worksheet built from the lesson's questions.

  The files are committed to `public/kits/`, so builds don't need Chromium. Regenerate them after editing content.

## Languages and right-to-left

- **UI strings:** `src/i18n/en.json` and `ar.json`. `t(key, vars)` interpolates `{var}` and formats numbers with the language's numerals (Arabic-Indic for `ar`).
- **Names inside sentences:** wrap user and organization names with `isolate()`, the plain-text `<bdi>`, so a Latin name can't reorder an Arabic sentence.
- **Separators:** never use "·" in Arabic text (it reads as Arabic zero). Use `t("common.sep")`, which is " · " in English and "، " in Arabic.
- **Codes, logins and URLs** always render left-to-right (`dir="ltr"`). Inputs use `dir="auto"`.
- **To add a language:** add `src/i18n/<code>.json`, register it in `LANGUAGES` (code, native name, direction, numerals), and add `<code>` strings to the content.

## Design system and CSS

- **`@darsi/design-system`** turns `tokens.json` into CSS variables and TypeScript, and provides the components (buttons, fields, the question types, video player, lesson complete, classroom kit, and more), icons, logos and self-hosted fonts:
  - Baloo 2 / Baloo Bhaijaan 2 for display;
  - Noto Sans / Noto Sans Arabic for body text.

  There are two themes: the default light theme and **Sunlight**, a high-contrast theme for outdoor use. There is deliberately no dark mode. Reduced motion is handled globally.
- **App styles** live in `apps/web/src/styles/`, one file per area, and every class has exactly one owning file (`OWNERS` in `scripts/check-css.mjs`):
  - `base` (panels, tables, forms, pills), `layout` (rail, bottom nav), `auth` and `lesson` load globally;
  - `admin`, `person`, `people` and `landing` load with their lazy chunks.
- **`npm run lint:css`** enforces:
  - logical properties only (RTL);
  - design-token colours only, and every `var(--…)` must exist;
  - hard offset shadows only, with no blur or backdrop-filter;
  - no dark mode, letter-spacing or uppercase (both break Arabic);
  - nothing Chrome 87 WebViews lack: nesting, `:has()`, container queries, `@layer`;
  - no bare element selectors.
- **Breakpoints:** 600 px and 900 px only. Mobile-first. Tap targets are at least 48 px.

## Testing

| Suite | Where | What |
|---|---|---|
| Unit (web) | `apps/web/tests/` | Lesson engine and content integrity; the staff screens rendered with mocked data hooks and callables; cloud-sync merge and push rules, plus the sync hook with Firestore mocked |
| Unit (design system) | `packages/design-system` | Component and token tests |
| Unit (functions) | `functions/test/` | Generated passwords (character classes, no look-alikes), invite-code format, usernames from any script |
| End-to-end | `apps/web/e2e/` | Desktop Chrome and Pixel 7: guest onboarding, the Arabic RTL switch, a full lesson through to the kit download, the video fallback, the AI lab, offline after the first visit |
| CSS lint | `scripts/check-css.mjs` | Brand, RTL and old-WebView rules |

The Firebase Emulator Suite needs **JDK 21+**. Rules tests with `@firebase/rules-unit-testing` are planned and need it too.

## Performance budget

| Measure | Now | Target (brand book) |
|---|---|---|
| Precache on install | ~850 KB | ≤ 2 MB including fonts |
| Main JS chunk | ~133 KB gzipped (no Firebase) | |
| Firebase SDK, signed-in only | ~210 KB gzipped (`firebase`), plus ~14 KB (`firebase-extra`: Functions + Storage) for admins and uploads | |
| Main CSS | ~11 KB gzipped | |
| One lesson | ~19 KB of JSON (both languages); kits and media download on demand | ≤ 300 KB |

Measure with `npx vite build` in `apps/web` and read the chunk table and the `precache` line.

## Known gaps and roadmap

- **Fonts:** both scripts are precached (Arabic 131 KB, Latin 106 KB); precaching only the teacher's language would save 105–130 KB per install.
- **Videos:** the narrated video pipeline (Playwright slide renders, TTS in each language, ffmpeg, VTT captions) is designed but not built. Lessons use transcripts until then.
- **Security review:** a static review of the rules, functions and client, plus rules unit tests and a scan of the deployed site, is planned before wider rollout.
- **Content and languages:** the IoT and cyber-security units; French, Swahili, Urdu and Hausa.
- **Native apps:** Android and iOS through Capacitor (see docs/NATIVE.md), with an opt-in weekly reminder.
