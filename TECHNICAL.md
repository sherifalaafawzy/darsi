# Darsi: technical overview

This document explains how Darsi is built. For what Darsi is and why it exists, see the [README](README.md). Deployment steps are in [docs/FIREBASE.md](docs/FIREBASE.md), lesson authoring in [docs/CONTENT.md](docs/CONTENT.md), native apps in [docs/NATIVE.md](docs/NATIVE.md).

- [Constraints that shape everything](#constraints-that-shape-everything)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Commands](#commands)
- [App architecture](#app-architecture)
- [Offline and caching](#offline-and-caching)
- [Cloud sync](#cloud-sync)
- [Push notifications](#push-notifications)
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
├─ content/                      the starting courses, not shipped with the app: units/*.json (en + ar), the
│                                generated kits/ (PDF + PPTX, committed) and media/ (videos and light lessons,
│                                gitignored); `npm run seed` publishes them to Storage. retired/ holds courses taken
│                                off the site (ai-1, still the test course)
├─ scripts/seed-content.mjs      publishes content/ like the course editor (kits and media uploaded, then publishDraft)
├─ scripts/import-packs.mjs      turns the course packs and their Lesson Studio videos into content/units, kits and media
├─ apps/web/                     the PWA
│  ├─ public/content/            placement.json (the onboarding check) only: the app ships no courses
│  ├─ public/push-sw.js          the service worker's push and notification-click handlers (imported into sw.js)
│  ├─ scripts/build-kits.mjs     generates the kits from content/units into content/kits
│  ├─ src/
│  │  ├─ App.tsx                 providers, routes, role guards, lazy staff chunks
│  │  ├─ firebase-config.ts      Firebase settings from env (no SDK; safe on the startup path)
│  │  ├─ fb.ts                   the only way startup code reaches Firebase: loadFirebase(), call(), storedSession()
│  │  ├─ firebase.ts             the SDK (Auth, Firestore; Functions and Storage on first use); loaded via fb.ts
│  │  ├─ auth/                   AuthProvider (user + custom claims), sign-in screens, callable API
│  │  ├─ state/                  local store (IndexedDB) and cloud sync
│  │  ├─ screens/                learner screens: Home, Lesson, Kit, Downloads, Labs, Me, Onboarding
│  │  ├─ labs/                   Labs: catalogue, loader, kit (shared lab parts) and apps/<id>/ (one folder per lab)
│  │  ├─ lesson/                 lesson engine, step views, project submission, read-aloud
│  │  ├─ admin/                  org dashboard, people, import, person page, teacher and platform admin
│  │  ├─ cms/                    course editor (lazy "Cms" chunk): unit list, editor, step forms, uploads, its own strings
│  │  ├─ notify/                 push notifications: push.ts (token, permission, register) and the panel in Me
│  │  ├─ org/                    join or register an organization
│  │  ├─ landing/                public home page
│  │  ├─ content/                content types, loader (built-in + published units), validator, competency frameworks
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
| `npm run kits` | Regenerates the classroom kits in `content/kits` from `content/units` |
| `node scripts/import-packs.mjs --packs <dir> --studio ../lessonstudio` | Imports the unzipped course packs as units (English), with their videos and light lessons from Lesson Studio in `content/media`. An existing unit file is left alone unless `--force`; `--media-only` refreshes only the video fields and files |
| `npm run seed -- --emulator` | Publishes the starting courses (`content/`) to the emulators; without `--emulator`, to the real project (Application Default Credentials, as for `superadmin`). An existing draft is left alone unless `--replace`. `--unpublish <id>` takes a unit off the site |
| `npm run superadmin -- <email>` | Makes an account a platform admin (`--revoke`, `--emulator`) |
| `npm --prefix functions run build` / `test` | Builds or tests the Cloud Functions |
| `npm run cap:android` / `cap:ios` | Creates and opens the native projects |

## App architecture

### Provider tree

```
AuthProvider            Firebase user + custom claims {role, orgId}; claims are read before the user is published
└─ StoreProvider        local state, keyed by uid (or "guest"); switching accounts remounts everything below
   └─ I18nProvider      language from the store
      └─ SettingsProvider   tracks and languages platform admins set up (built-ins first, then content/settings.json);
         │                 fetches the picked language's strings (App waits for them)
         └─ BrowserRouter
            └─ Routed   routes, guards, useCloudSync(uid)
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
| `/learn`, `/lesson/:unit/:lesson`, `/downloads`, `/labs`, `/labs/:id`, `/kit`, `/tracks`, `/me` | signed in or guest | Behind the onboarding gate (language, "Who are you?" (teacher or student), where a teacher teaches or a student studies, tracks, weekly goal, placement). `/tracks` is My tracks. `/lab` (the old AI lab, linked from sent notifications) redirects to `/labs` |
| `/org` | signed in | Join with an invite code, or request a new organization (`?request=1`) |
| `/admin`, `/admin/people/:uid`, `/admin/add`, `/admin/import` | `orgAdmin` | Organization dashboard, person page, add people, Excel/CSV import |
| `/teach`, `/teach/:uid` | `teacher`, `orgAdmin` | The teacher's assigned students |
| `/super` | `superadmin` | Send announcements; approve or reject organization requests |
| `/super/content`, `/super/content/:unitId` | `superadmin` | Course editor: units published for everyone (see [Authored content](#authored-content)) |
| `/admin/content`, `/admin/content/:unitId` | `orgAdmin` | Course editor: units published for this organization's members only |
| `/super/tracks` | `superadmin` | Tracks and levels for every unit (see [Tracks and levels](#tracks-and-levels)) |
| `/super/languages`, `/super/languages/:code` | `superadmin` | Languages beyond English and Arabic: add, translate, publish (see [Languages and right-to-left](#languages-and-right-to-left)) |

Roles are `learner` (independent), `student`, `teacher`, `orgAdmin` and `superadmin`. They live in **Auth custom claims**, which only Cloud Functions set, and are mirrored to `users/{uid}` for the UI. When `users/{uid}` changes role or organization, AuthProvider refreshes the token so the security rules see the new claims.

After sign-in, `homeFor(role)` sends org admins to `/admin` and platform admins to `/super`; everyone else goes to `/learn`. Staff routes skip the onboarding gate. Accounts created by an admin with `mustChangePassword` see the set-password screen before anything else.

### Layout

At 900 px and wider, a nav rail shows the five learner tabs plus the role's staff links. On phones, the design system's bottom nav keeps five tabs (Learn, Downloads, Labs, Kit, Me), and the staff links live in Me's account section. Students have no Kit tab: the classroom kits are for teaching. Staff screens and the landing page are **lazy chunks** (`React.lazy`), so a learner's phone never downloads or parses them.

## Offline and caching

The service worker (Workbox `generateSW`) installs when a person enters the app. Visitors who only read the landing page never download the offline bundle.

| What | Strategy |
|---|---|
| App shell, learner screens, icons, lesson JSON | **Precached** (~640 KB) |
| Fonts | **Not precached.** Every face has a `unicode-range` (`tokens.json` `type.subsets`), so a page downloads only the scripts it shows. `darsi-fonts` keeps them: cache-first, `ignoreVary`, and only `font/woff2` responses, because Hosting answers a missing path with `index.html`. `platform/fonts.ts` fills it with the page language's faces after load, on every language change and on reconnect: Latin (~76 KB) for English, plus Arabic (~131 KB) for Arabic. Arabic words on a page in another language, such as the language picker or the Arabic brand name, use the phone's own font (`.dr-lang-native`, `.dr-other-script`), so English pages never download Arabic fonts |
| The Firebase SDK (`firebase-*`, including `firebase-extra`: Functions, Storage, Messaging), staff chunks, landing page, exceljs, and their CSS | **Not precached**; `darsi-chunks` caches them cache-first on first use (hashed file names) |
| Lab apps (`lab-<id>-[hash].js`, 48 chunks, ~320 KB in all) | **Not precached**; `darsi-labs` caches each cache-first when it is first opened, and "Save all labs" on the Labs screen fetches them all (its size comes from `labs-manifest.json`, written at build time). The labs kit (shared chunks such as `LabShell`, `Plot`, `controls`) and its stylesheet are small and precached. See [Labs](#labs) |
| `push-sw.js` (push handlers, ~3 KB) | **Imported** into `sw.js` with `importScripts`, so the browser stores it with the worker; not precached. Its URL carries a content hash (`?v=…`), so changing it changes `sw.js` and triggers the normal update prompt |
| `/content/placement.json` | Stale-while-revalidate (`darsi-content`) |
| `/kits/*` | Cache-first (`darsi-kits`). No longer shipped: only phones that downloaded the old built-in kits still have entries, which "Remove" clears |
| `/media/*` | Cache-first with range requests (`darsi-media`) |
| `/lib/*` (Lesson Studio's shared library for light lessons: the cast, extra icons, the mark; ~56 KB before compression) | **Not precached**; cache-first in `darsi-lib` when a light lesson first plays or a unit with one is downloaded. Versioned (`/lib/v1/`), immutable on Hosting, and "Remove" leaves it for the other units |
| `/lib/python/v1/`, `/lib/sql/v1/` and Darsi Tiny (`/lib/tinylm/app/{en,ar}/v2/`, `/lib/tinylm/scene/{en,ar}/v2/`; `/lib/tinylm/v1/` fallback) | **Not precached**; cache-first in `darsi-lib` on first use. A phone fetches only the job and language it opens (~2.8 MB compressed weights, once). Versioned and immutable; none of the four models is in the install bundle |
| Courses (Cloud Storage `…/catalog.json`, `…/units/{id}/v{n}.json`) | Kept by `content/load.ts` itself in `darsi-content`, not by a service-worker rule: catalogs network-first with the last copy as the offline fallback; unit files cache-first (a version's path never changes). See [Authored content](#authored-content) |
| Uploaded media (Cloud Storage videos, captions, kit files, light-lesson audio) | Cache-first with range requests (`darsi-media`) once a unit is downloaded; only `200` responses are kept, so streaming without a download (opaque responses) is never stored. A light lesson's JSON (manifest, scenes, timing) is kept by `loadStoredJSON` in `darsi-content`, cache-first |
| Firestore data | The SDK's persistent IndexedDB cache, capped at **10 MB** (the default is 40 MB) |

- **Updates** use prompt mode: a "Reload" toast appears on app screens, never in the middle of a lesson.
- **`/__/` is Hosting's own** (`navigateFallbackDenylist`). The auth domain is the site's own address, so Google sign-in opens `/__/auth/handler` in its popup; answering that with the app made the popup show "Page not found" and sign-in never finished (fixed 2026-10-28; the e2e test "the service worker leaves Firebase's own pages" guards it). Phones still running an older worker get the fix once they take the update.
- **Hosting headers:** `sw.js` and `index.html` are `no-cache`; hashed assets are cached for a year.
- **The MP4 player** (design system `VideoPlayer`): custom controls drawn on the picture, in the shape people know from YouTube and in Darsi's colours. A thin progress bar thickens on hover and shows the buffered range, chapter ticks, question marks and a time preview. Under it: play, a volume slider that slides out, and the clock; on the other side, captions, a settings menu (playback speed and the caption language, taken from the VTT tracks) and full screen. A large play button sits in the middle until the video is playing, and a spinner shows while it buffers. The controls hide after about three seconds of playback and come back on hover, tap or keyboard focus. Keys: Space and K play or pause, J and L jump 10 seconds, the arrows jump 5 seconds or change the volume, F is full screen, C captions, M mute, and 0–9 jump through the video. On a phone, a double tap on the left or right of the picture does the 10-second jump. The timeline and the clock stay left to right in Arabic; the buttons follow the page. Captions are drawn by the player so they sit above the controls while those are visible. Full screen uses the Fullscreen API on the player, so the question and the captions stay on top. iPhone Chrome has no such API on elements: the video's `webkitEnterFullscreen()` opens the system player instead (`playsinline` keeps ordinary playback inline), and `webkitbeginfullscreen` / `webkitendfullscreen` keep the button in step. With neither API, the player is fixed to the viewport (`100dvh`, safe-area insets, the page stops scrolling) and turned sideways when the phone is upright (Escape or the button leaves). A checkpoint question pauses the video, also when the learner seeks past it, and the video plays on once it is answered.
- **Lesson videos are optional.** If a video can't load (not produced yet, offline, not downloaded), the step switches to the transcript, and the checkpoint question sits under it. Opening the transcript to read instead of streaming does the same. A missing video never blocks a lesson.

## Cloud sync

`src/state/sync.ts` (`useCloudSync`) keeps a signed-in person's progress and notes in Firestore, where teachers and admins read them.

- **Reads:** both collections are read once per sign-in, and once more on the `online` event if that first read only reached the offline cache. There are no listeners and no polling.
- **Merge** (`mergeRemote` in `store.tsx`): the newer copy wins. Lessons compare `completedAt`; notes compare their local edit time with `updatedAt`. A lesson first seen from the cloud counts toward the teaching week it was completed in, which keeps streaks correct.
- **Writes** (`toPush`): only entries the cloud lacks or has an older copy of. Until a read has reached the server, only work finished in this session is written, so a stale phone can never overwrite newer work from another device. Firestore's offline queue carries writes made without a signal.
- **Uploads:** project photos are scaled to at most 1280 px and re-encoded as JPEG on the phone before upload (`ProjectView.shrinkImage`). PDFs and anything the browser can't decode go up unchanged.

## Push notifications

Opt-in web push through Firebase Cloud Messaging (FCM). The tone follows the brand rule "Encourage, never punish": no guilt, no threats about losing a streak, no emoji. Setup, browser support and how to send an announcement are in [docs/FIREBASE.md](docs/FIREBASE.md#6-push-notifications).

### Turning it on, per device

The panel in Me (`src/notify/NotificationsPanel.tsx`) is shown to signed-in people only. Guests never touch messaging.

1. **`pushSupport()`** (`src/notify/push.ts`) picks what the panel shows:
   - `unconfigured`: the build has no `VITE_FIREBASE_VAPID_KEY`;
   - `unsupported`: no service worker, `PushManager` or `Notification`;
   - `ios-install`: an iPhone or iPad in a Safari tab (web push needs Add to Home Screen, iOS 16.4+);
   - a permission the person denied: how to allow it in the browser's site settings.
2. **`enablePush(prefs)`:**
   1. `Notification.requestPermission()`;
   2. `getToken()` with the VAPID key and the app's own Workbox service worker registration (there is no `firebase-messaging-sw.js`);
   3. the `registerDevice` callable, with the language, the IANA time zone, the reminder hour, the categories and the weekly goal;
   4. `darsi:push` in localStorage remembers `{ token, on: true, uid }` (the uid keeps a shared phone from refreshing one account's token into another's).
3. **`registerDevice`** stores `users/{uid}/devices/{id}` (`id` = the first 40 hex characters of sha256(token)), sets `users/{uid}.notify`, and subscribes the token to its FCM topics while Announcements are on: `all`, `lang-<code>` (the phone's language: `en`, `ar`, or one platform admins added), `role-<role>`, and `org-<orgId>` in an organization.
4. **On each app start**, `usePushRefresh()` calls `registerDevice` again if `darsi:push.on` and permission is still granted. Tokens can rotate, and this also refreshes `lastSeen`. Changing a preference calls `updateNotifyPrefs`; turning it off calls `unregisterDevice` and deletes the token. Signing out (any Sign out button: `AuthProvider.signOut`) does the same first, so on a shared phone the next person never sees the previous account's notifications; `registerDevice` also moves a token to whoever registers it last (`pushTokens/{deviceId}` records the owner).
5. **Topics follow the person.** When their role, organization or language changes, `onUserTopicsChanged` re-subscribes all their devices.

### What is sent

Each category can be switched off in Me (`notify.cats`).

| Category | Trigger | Who gets it |
|---|---|---|
| Learning reminders (`reminders`) | `dailyNudges`, at the top of every UTC hour (`0 * * * *`): people whose reminder hour (`notify.hourUtc`) is now. `pickNudge` (`functions/src/nudge.ts`) sends at most one a day (see below) | the person |
| Project feedback (`reviews`) | `onSubmissionUpdated`: a submission goes from `submitted` to `approved` or `revise` | the person who submitted it |
| Staff alerts (`staff`) | `onSubmissionCreated`: a project is submitted. `requestOrg`: a new organization request | the assigned teacher, or else the org admins; platform admins for requests |
| Announcements (`news`) | `sendBroadcast` from `/super` | everyone, one organization or one role, through topics |

**`pickNudge(input, now)`** is pure and unit-tested. "Today" is the person's local day in their time zone. The rules apply in order:
1. Nothing if a reminder was already sent today, or if they finished a lesson today.
2. After 7 days without a lesson: one "we saved your place" message. After 21 days: one last message, then silence until they come back.
3. On Saturday or Sunday (UTC), with lessons left for the weekly goal: how many are left.
4. With a streak of 2+ weeks (the app's `streakWeeks` rule) and this week's goal not met yet: the streak.
5. Otherwise, one of three daily messages, rotating by day.

`dailyNudges` also fixes daylight-saving drift: if the person's local hour no longer matches, it rewrites `hourUtc` and waits for the right hour.

### The message and the service worker

- **Payload:** data-only web push with `TTL: 86400` (an offline phone gets it within a day) and `Urgency: normal`. The data is `{ title, body, link, tag, lang, dir }`: in Arabic for Arabic phones, in English for every other language (`wordingFor`); there is no wording in the languages platform admins add.
  - The wording lives in `functions/src/messages.ts`. Names are wrapped in Unicode isolates, and numbers use the language's numerals.
  - Announcements are written in English and Arabic and go out once each: the Arabic text to `'lang-ar' in topics`, the English text to `'all' in topics && !('lang-ar' in topics)` (English phones and every added language), each with the audience's topic added (`&& 'org-<id>' in topics`).
  - Personal messages use `sendEachForMulticast` on the person's devices, grouped by language. Tokens that FCM reports as unregistered or invalid are deleted on the spot.
- **`public/push-sw.js`:** plain JavaScript with no imports and no SDK, loaded into Workbox's `sw.js` (`workbox.importScripts` in `vite.config.ts`).
  - `push`: reads `payload.data` and calls `showNotification` with the Darsi icon, the monochrome badge, `lang` and `dir`.
  - Tags: a new reminder replaces the previous one (`darsi-nudge`); reviews, staff alerts and announcements each have their own tag.
  - `notificationclick`: focuses an open Darsi window and navigates it to the link, or opens a new window. Only paths inside the app are followed; anything else opens `/learn`.
- **Data and battery:** the messaging SDK sits in the lazy `firebase-extra` chunk, so signing in alone never downloads it. It loads when someone turns notifications on, or when the app refreshes an enabled token at start. A push is a few hundred bytes. There are no listeners and no polling.

## Backend: Firebase

Project **`darsi-f0685`**. Firestore, Cloud Functions and the Storage bucket the app uses (`darsi-f0685`) are all in **europe-west1**. Hosting serves the public address **https://darsiai.org** (a custom domain; www.darsiai.org redirects to it). The site's own address, https://darsi-f0685.web.app, still works but is never linked.

Firebase's original default bucket, `darsi-f0685.firebasestorage.app`, was created in us-west1, and a bucket's location can't change. The app points at the europe-west1 bucket through `VITE_FIREBASE_STORAGE_BUCKET`, and the US bucket was never used and was deleted on 2026-10-25.

`firebase.json` deploys the Storage rules through the deploy target `main`. `.firebaserc` maps it to `darsi-f0685`, and to `demo-darsi.appspot.com` for the emulators. Keep the target: without one, `firebase deploy --only storage` aims at the project's default bucket, which no longer exists.

### Data model (Firestore)

```
users/{uid}                 name, email, username, role, orgId, group, teacherId, lang, teach, tracks,
│                           weeklyLessons, levels, mustChangePassword, active, lastActive, createdAt,
│                           summary {lessonsDone, xp, avgAccuracy, lastActive, competencies, units,
│                                    weeks {"2026-W43": n, … the last 12 ISO weeks, UTC}, lastLessonAt}   ← written by onProgressWrite
│                           notify {on, hourLocal 0–23, hourUtc 0–23, tz (IANA), cats {reminders, reviews, staff, news},
│                                   weeklyGoal 1–14, lastAutoAt?, comeback7At?, comeback21At?}         ← notification functions only
├─ progress/{lessonId}      lessonId, unitId, track, accuracy (0–1), xp (int 0–100), seconds, completedAt (ISO), competencies[]
├─ notes/{lessonId}         text, updatedAt (ms)
├─ submissions/{id}         lessonId, unitId, stepId, orgId, text, fileUrl, fileName,
│                           status (submitted | approved | revise), feedback, score, reviewedBy, reviewedAt, createdAt
└─ devices/{deviceId}       token, lang (any language code), platform ("web"), createdAt, lastSeen, topics[]   ← Cloud Functions only
                            deviceId = the first 40 hex characters of sha256(token)
pushTokens/{deviceId}       uid (the account the token belongs to now), at   ← Cloud Functions only
orgs/{orgId}                name, type, country, city, size, contact, reason, status (pending | active | rejected),
                            createdBy, inviteCodes {teacher, student}, memberCount, reviewNote, createdAt, reviewedAt
inviteCodes/{code}          orgId, role                      ← Cloud Functions only
units/{unitId}              owner ("public" | orgId), title {en, ar}, track, level, lessonCount, lessons [{id, title}],
                            rev (int, +1 per save), updatedAt, updatedBy,
                            published {version, rev, at, by, entry (its catalog.json entry)} | null   ← published: functions only
unitDrafts/{unitId}         owner, rev, unit (the whole draft Unit, ≤ 600 KB)   ← the course editor; lists never read it
config/settings             tracks [TrackDef], rev, updatedAt, updatedBy   ← saveSettings
                            languages [LanguageDef: code, native, english, dir, numerals, version]   ← publishLanguage
                                                                 (each writer merges its own part; platform admins read)
translations/{code}         code, native, english, dir, numerals, messages {key: text}, rev (+1 per save), updatedAt,
                            updatedBy, published {version, rev, at, by} | null   ← the Languages page; published: functions only
broadcasts/{id}             title {en, ar}, body {en, ar}, link, audience {type: all | org | role, orgId?, role?},
                            sentBy, sentAt, results {en, ar} (FCM message id, or null on error)   ← sendBroadcast; platform admins read
audit/{id}                  action, by, …, at                ← Cloud Functions write; platform admins read
```

`notify.hourUtc` is the UTC hour that equals `hourLocal` in `tz` today. `registerDevice` and `updateNotifyPrefs` recompute it, and `dailyNudges` rewrites it when daylight saving moves it. The notification queries are equality-only (`notify.on` + `notify.hourUtc`; `orgId` + `role`), so they need no composite index.

Username logins (for people without email) map to `<username>@users.darsi.app`. The mapping lives in two places, `apps/web/src/auth/api.ts` and `functions/src/passwords.ts`, which must stay in sync.

### Security rules

**Firestore** (`firebase/firestore.rules`):
- **`users/{uid}`:**
  - *Read:* the person, a platform admin, their organization's admins, and their assigned teacher.
  - *Self-registration:* only as an independent `learner`, with a fixed list of fields.
  - *Self-edits:* never role, organization, teacher, summary or `notify` (the notification settings go through the callables).
  - *Org admins:* may change only group, teacher, active flag and name.
- **`progress`:** written only by its owner. Only the listed keys are accepted, `accuracy` must be 0–1, and `xp` must be an integer 0–100. Nobody can delete it.
- **`submissions`:** created by the owner with status `submitted`. Reviewed by the assigned teacher, the org admin or a platform admin, who can change only status, score, feedback and reviewer fields.
- **`notes`:** the owner only.
- **`devices`** (push tokens) and **`pushTokens`** (their owners): no client access at all, not even the owner's.
- **`orgs`:** readable by members, the requester and platform admins. Created only through `requestOrg`.
- **`broadcasts`:** readable by platform admins; written only by `sendBroadcast`.
- **`inviteCodes`:** no client access at all.
- **`units` and `unitDrafts`** (course editor): `canEdit(owner)` is a platform admin, or that organization's admin for an org `owner`.
  - *Create:* `idFits`: org units need a generated id (`u` + 8 characters, `[a-z0-9]`), so they can never shadow a built-in or public unit; `rev` starts at 1 and `published` must be null.
  - *Update:* `nextRev`: every save sets `rev` to exactly the stored `rev + 1`, so a second editor with a stale copy is refused instead of silently overwriting; `owner` and `published` can't change.
  - *Delete:* only while unpublished; `deleteUnit` handles published units.
  - Students and teachers never read drafts; learners get published units from Storage.
- **`config/{doc}`** (platform settings): platform admins read; nobody writes from a client (`saveSettings` and `publishLanguage` do). Everyone else reads the published copy, `content/settings.json`.
- **`translations/{code}`** (languages being added): platform admins only. The id must equal `code`, every save sets `rev` to exactly `rev + 1`, `published` is never written from a client, and a draft can be deleted only while unpublished.

**Storage** (`firebase/storage.rules` on `darsi-f0685`):
- `media/` and `kits/` are publicly readable and never writable from the client.
- `submissions/{orgId|none}/{uid}/{file}` is created only by its owner: under 10 MB, images, PDF, mp4 or audio. It can be read by the owner, a platform admin, or that organization's admins and teachers.
- `content/**` (public authored units) is readable by anyone, guests included. `orgs/{orgId}/**` is readable only by that organization's members and platform admins.
- Media uploads go to `content/media/{unitId}/` (platform admins) and `orgs/{orgId}/media/{unitId}/` (that org's admins, platform admins): MP4 ≤ 60 MB, VTT ≤ 512 KB, PDF or PPTX ≤ 20 MB. No client ever writes the unit JSON or `catalog.json`; the functions do.

### Cloud Functions (europe-west1)

| Function | Type | What it does |
|---|---|---|
| `requestOrg` | callable | A signed-in person asks to register an organization (one pending request at a time). Platform admins get a staff alert; a failed alert never fails the request |
| `reviewOrg` | callable | Platform admin approves (creates invite codes; the requester becomes its admin) or rejects with a note |
| `joinOrg` | callable | Join an active organization with a teacher or student invite code |
| `regenerateInviteCode` | callable | Org admin replaces a code; the old one stops working |
| `createMembers` | callable | Bulk accounts (up to 500 per call): random passwords with no look-alike characters, usernames for people without email, teacher assignment |
| `setMemberRole` | callable | Org admin changes a member's role (never their own admin role) |
| `resetMemberPassword` | callable | New random password; the person must choose their own at next sign-in |
| `removeMember` | callable | Back to an independent learner; their learning record stays with them |
| `passwordChanged` | callable | Clears the first-sign-in flag after the person picks a password |
| `onProgressWrite` | Firestore trigger | Recomputes `users/{uid}.summary` (lessons, XP, accuracy, competencies, units, last activity, lessons per ISO week for the last 12 weeks, `lastLessonAt`) |
| `registerDevice` | callable | Stores or refreshes this device's push token, sets `notify` (on, reminder hour, time zone, categories, weekly goal) and subscribes the token to its topics |
| `unregisterDevice` | callable | Unsubscribes and deletes the device; with no devices left, `notify.on` becomes false |
| `updateNotifyPrefs` | callable | Changes the reminder hour, time zone, categories or weekly goal, and re-applies topics on every device (the Announcements switch) |
| `sendBroadcast` | callable | Platform admin only: an announcement in English and Arabic to everyone, one organization or one role. One FCM send per language; logged in `broadcasts` and `audit` |
| `onSubmissionCreated` | Firestore trigger | A project was submitted: a staff alert to the assigned teacher, or else the organization's admins |
| `onSubmissionUpdated` | Firestore trigger | A review moved a submission to `approved` or `revise`: the person who submitted it is told |
| `onUserTopicsChanged` | Firestore trigger | Role, organization or language changed: re-subscribes every device's topics |
| `dailyNudges` | scheduled, hourly (Cloud Scheduler) | Sends at most one learning reminder per person per local day, at the hour they chose (see [Push notifications](#push-notifications)) |
| `publishUnit` | callable | Course editor: validates the saved draft (the same validator as the editor, with the saved tracks and their levels), writes `…/units/{id}/v{n+1}.json`, rebuilds that owner's `catalog.json` in the saved track order, keeps the previous version and deletes older ones |
| `unpublishUnit` | callable | Takes a unit away from learners: catalog entry and JSON versions go; the draft, uploaded media and learners' progress stay (`unpublishDraft`, which `npm run seed -- --unpublish` also uses) |
| `deleteUnit` | callable | Deletes a unit everywhere: catalog entry, JSON versions, media and both Firestore documents. Media that another draft of the same owner links to (a duplicated unit or a copied lesson) stay |
| `saveSettings` | callable | Platform admin only: saves the tracks list (see [Tracks and levels](#tracks-and-levels)) to `config/settings` and publishes `content/settings.json` |
| `publishLanguage` | callable | Platform admin only: checks a saved language draft (`validateLanguage`), writes `content/i18n/{code}/v{n+1}.json`, lists the language in `config/settings` and `content/settings.json`, keeps the previous pack and deletes older ones |
| `unpublishLanguage` | callable | Platform admin only: takes a language off the pickers and deletes its packs; people who chose it see English. The draft stays |

Every role or organization change goes through these functions, which set the claims and write an `audit` entry. Clients can never grant themselves access. `functions/src/admin.ts` initializes the Admin SDK once and sets the region and instance cap for every function.

## Content, lessons and kits

- **Content is data, and the app ships none.** Every course a learner sees is published with the course editor to Cloud Storage (see [Authored content](#authored-content)); units are typed by `src/content/types.ts`. Every learner-facing string is `{ "en": …, "ar": … }` (or more languages), with English as the fallback.
- **The starting courses** are sources in `content/units/` at the repo root, with their kits in `content/kits/` and their media in `content/media/`. There are 24: per track (AI, IoT, Cyber security), one course per level (Beginner to Advanced) for teachers and one for students (docs/CURRICULUM.md has the framework and the ids; `docs/curriculum/<track>.md` each track's plan). The teachers' Beginner courses are the three imported from the course packs, `ai-1-1` (AI basics), `cyber-1-1` (Passwords and phishing) and `iot-1-2` (Sensors). The other 21 were written in English and Arabic with their videos in Lesson Studio (2026-10-28): teachers `<track>-<level>-1` (`ai-2-1` … `iot-4-1`), students `<track>-s<level>` (`ai-s1` … `cyber-s4`, `audience: "students"`). `npm run seed` publishes them through the editor's own publish code (`publishDraft`), uploading the kits and media, so they are ordinary published units that platform admins can edit. Their ids are kept, so progress, notes and certificates still match.
  - Courses quote numbers from the Labs apps they use, so after changing a lab's model, search `content/units` for its id.
- **Retired courses** are in `content/retired/`. `ai-1` ("AI basics for teachers", the first starting course) was taken off the site on 2026-10-28 with `npm run seed -- --unpublish ai-1`. The unit tests and the e2e suite still use it, and its draft stays in the editor. Its learners keep their progress, but Me shows certificates only for courses in the catalog.
  - **Media** (`content/media/<lesson>/`, gitignored, about 15 MB per course) comes from the Lesson Studio repository: the 240p MP4 and captions per language, and the light lesson. `scripts/import-packs.mjs` made it for the three pack courses; `scripts/import-media.mjs <unit>…` does it for every other course, filling each video step from the Lesson Studio lesson with the same id (docs/CURRICULUM.md has the whole pipeline). The seed uploads each file to `content/media/<unit>/<content hash>/…` with a one-year immutable cache, so a re-seed sends only what changed. Media that isn't on the computer keeps its app path.
  - **Kits** that exist only in English (the packs' own lesson plans, worksheets and answer keys) are uploaded in English only; `kitUrl` falls back to English.
  - `tests/units.test.ts` checks every starting course: no errors and no warnings (Arabic included), the content rules in docs/CONTENT.md, the published form (Storage URLs) and no "·" in Arabic.
- **Light lessons.** A video step may carry `light`: the same lesson as a Lesson Studio package (manifest, scenes, per-language timing and narration), which the phone draws itself. It's about 380 KB per language with the narration, against about 1.1 MB for the 240p MP4, and stays sharp on any screen.
  - `lesson/LightLesson.tsx` plays it with the vendored Lesson Studio player (`src/vendor/lessonstudio-player.js`, an ES module of `createPlayer`, about 24 KB gzipped, precached so downloaded lessons play offline; refresh it with `node scripts/darsi/vendor-player.mjs` in the Lesson Studio repository, which also copies its `public/lib` here). The player's `resolve` maps package paths to `light.files` URLs; `library` points at `/lib/`.
  - **Science kit** (since 2026-10-28): videos can draw equations, plots, neural networks trained for real, model architectures and tables (Lesson Studio `docs/science.md`). They come in technology packs (Lesson Studio `docs/packs.md`): science, code, data, iot, network and opt. Each is its own file, `src/vendor/lessonstudio-pack-<id>.js` (science ~14 KB gzipped), loaded only for lessons that use it. Packs aren't precached (`globIgnores`). Downloads saves the ones a course's light lessons need (`prefetchLightPacks`, using the vendored `packsUsed` and `prefetchPacks`). The vendored files are `lessonstudio-player.js`, the packs and `lessonstudio-chunk-*.js` (shared code); startup stays 4 files.
  - **Bundle:** the player is a lazy chunk that App registers with `setLightPlayer(() => import(…))`, and it imports nothing. A lazy `LightLesson` component (sharing React and `content/load` with startup code) split the startup bundle into six files, and moving its `import()` into App didn't help; only a chunk with no shared imports keeps startup at four.
  - `StepView` shows the light lesson first when it has the teacher's language (`lightLang`: `light.langs`, e.g. `ar` → `ar-EG`, else English), with "Watch as a video file (1.1 MB)" to switch to the MP4 and "Light version" to switch back. The player asks its own quick checks, so the step's checkpoint question is for the MP4 and the transcript. Each check has `explain` (shown after a right answer) and `explainWrong` (after a wrong one; the converter takes it from the storyboard's `feedback_wrong`), because the right-answer text opens with "Correct —". The step can continue once a check is answered or the lesson ends, as with the video.
  - Each language is narrated separately, so chapter and checkpoint times can differ: `atBy[lang]` holds that language's own time, read with `timeIn()`.
  - Downloading a unit stores the light lesson (its JSON, the narration in Opus or, where the phone can't play Opus, AAC, and the library) instead of the MP4.
  - **Its controls fit the lesson column** (Lesson Studio player, 2026-10-28): under 720 px the floating bar drops the volume slider and the time; under 480 px (phones) play, time and seek share one row and the other buttons a second, with "Made with AI help" as a badge on the picture. A quick check or the end screen in a small player sits under the picture (on phones, in its place), so its Continue button is never cut off. Full screen falls back to stretching over the page where the Fullscreen API on elements is missing (iPhone), and the pause icon is a filled shape (it was invisible). On upright phones `LightLesson` sizes the stage itself (`fitStage`): it measures the room between the player's top and the bottom of the screen (titles take one line or three), keeps 15.5rem for the player's controls (up to three rows at these widths) and the Continue bar, and makes the portrait (9:16) stage as wide as fits. Where that would be under 12rem (short phones) it asks the player for the 16:9 stage at full width instead (`orient`), and it measures again when the phone turns. Checked at 360×640 to 412×915 in English and Arabic.
- **Lesson shape:** video (with a checkpoint question) → reading with key terms → mixed questions (some lessons add a `lab` step that embeds any Labs app) → classroom project → reflection → "Try it in class tomorrow".
- **Step types:** `video`, `read`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `lab`, `project`, `reflect`, and the code steps `code`, `parsons`, `codefill`, `bug` and `blocks` (see "Code on the phone"). Any question may show a `snippet` of code.
- **Engine** (`src/lesson/engine.ts`): pure, unit-tested grading. Answers that ignore case and Arabic diacritics are accepted. A wrong answer comes back once at the end of the lesson. XP is `10 + round(accuracy × 20)`.
- **Placement:** `placement.json` (v2) has, per built-in track and per audience, three questions for each of the four levels (72, en + ar), each testing that level's content (docs/CURRICULUM.md). See "Tracks and levels" for how the check runs.
- **Competencies:** each lesson lists codes from the UNESCO AI Competency Framework for Teachers (`T.*`), the one for Students, DigComp 2.2 (`DC.*`) and Darsi IoT. They feed the capability views for admins.
- **Classroom kits:** `npm run kits` reads each lesson's `slides` and steps and writes, per language:
  - `slides-<lang>.pptx`: editable PowerPoint via pptxgenjs (RTL for Arabic, Arial so it renders on any school PC);
  - `slides-<lang>.pdf`: the same slides with the brand fonts embedded (headless Chromium);
  - `lesson-plan-<lang>.pdf`: an A4 lesson plan and pupil worksheet built from the lesson's questions. For students' courses (`audience: "students"`) it's "Lesson notes · for you" and a worksheet, with "Check yourself" and "Try it this week" (`STUDENT_UI`); their kit items are titled for students ("Slides to revise", "Activity sheet"). The builder doesn't count pages: each kit item's `pages` is set in the course file.

  The files are committed to `content/kits/`, so seeding doesn't need Chromium. Regenerate them after editing a starting course, then seed it again with `--replace`.
  - The lesson plan lists the lesson's `materials` (else "board, chalk, paper"), the activity's real length (the sum of its "(N min)" steps, else 45) and, when the activity slide has `details`, every step in full; the slide keeps its one-line bullets.
  - Long activity slides get smaller type (`fit()` in build-kits) so the steps and the preparation note stay on the slide; Arabic kits use «،» as the separator, never "·".
- **Captions from Storage** need `crossorigin="anonymous"` on the video (a cross-origin `<track>` loads only then). `StepView` sets it when the video or its captions come from another origin; Storage answers with CORS headers.

## Code on the phone

Lessons can teach code: `code` (write and run Python or SQL, graded by tests), `parsons` (order and indent lines), `codefill` (gaps), `bug` (find the line) and `blocks` (a robot programmed with command cards, for young learners), plus `snippet` on any question. docs/CONTENT.md says how to write them.

- **Runtimes** (`public/lib/python/v1`, `public/lib/sql/v1`; `scripts/vendor-runtimes.mjs` copies them from the pinned npm packages):
  - MicroPython 1.29.0-6, the PyScript variant's `settrace-ulab` build: real Python 3 syntax, `ulab` (numpy-style arrays), `sys.settrace`. About 0.29 MB gzipped.
  - sql.js 1.14.2 (SQLite 3.49.1): about 0.34 MB gzipped.
  - Each is downloaded the first time a lesson needs it (its size shown first), cached in `darsi-lib` (kept when a unit is removed) and never precached. `content/runtimes.ts` lists the files and sizes; a downloaded unit includes its runtimes, and the catalog's size counts them.
  - The vendoring step adapts MicroPython's loader, and stops if any change doesn't apply exactly once (check it on a version bump): the heap may grow only to 48 MB (`globalThis.__mpHeapMax`), it takes a compiled module (`instantiateWasm`) instead of fetching, and it is a classic worker script rather than an ES module.
- **The sandbox** (`src/code/sandbox.ts`):
  - A hidden `<iframe sandbox="allow-scripts" srcdoc>` has an opaque origin: no cookies, storage or IndexedDB (so no sign-in tokens), and no access to the page. Its CSP is `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'none'` (`'unsafe-eval'` for Chrome before 97). **Any CSP added to the app later must still allow this iframe.**
  - Inside, one blob worker per language. It deletes `fetch`, XHR, WebSocket, IndexedDB, `caches`, `navigator` and `importScripts` before the runtime starts; MicroPython's `js`/`jsffi` modules are set to `None` as well.
  - The iframe compiles each runtime's wasm once and hands the module to every new worker.
  - The page enforces a 3 s limit (`TIME_LIMIT`): it ends the worker and starts a fresh one (15–50 ms). Stop does the same. After a minute without a run, everything is removed (battery and memory).
  - Checked in Chromium 153, Firefox 157 and WebKit 27: storage and the parent are blocked, `fetch` is refused, an endless loop stops on time.
- **The harness** (`src/code/harness.ts`), shared by the sandbox and the Node tests so a solution is graded the same way everywhere:
  - Python: `_darsi_run(json)` runs the program once per test with fresh variables, its own `print` (captured; output and graded text capped at 20 KB) and `input` (the test's answers), a virtual clock (`time.sleep` returns at once), then the test's `check`. Tests compare only printed output. Any exception, `MemoryError` included, is caught in Python; the program's objects are freed before the traceback is formatted (with the learner's line, long ones shortened). It also provides a small `csv` module.
  - MicroPython keeps every interned string (`str(i)` makes one) for good, so after a run that leaves more than 8 MB in use the interpreter is started afresh (`HEAP.restart`). A program that makes millions of small objects near the cap slows the GC to a crawl; the time limit ends it.
  - SQL: `runSql` runs the query on fresh tables and compares its rows with the solution's (`sameRows`). The worker carries `runSql`, `sameRows` and `isOrdered` as source (`toString()`), so they must stay self-contained.
- **The Python library** (`src/code/pylib/*.py`, imported as raw strings by `pylib.ts`, written to MicroPython's `/lib` when it starts):
  - `csv`.
  - **Darsi's small OR-Tools**, in Python, shaped like Google's so programs run unchanged on the real thing:
    - `ortools.sat.python.cp_model`: integer domains, linear constraints, all-different (over expressions too, through helper variables), bool_or and implications, a linear objective; depth-first search with bounds propagation, branch and bound, solution callbacks and enumeration; a node limit.
    - `ortools.linear_solver.pywraplp`: a two-phase simplex with Bland's rule for LP, and branch and bound for whole numbers.
    - Pure Python rather than TypeScript behind a JavaScript bridge: nothing more to ship into the worker as source, the same in the Node tests, and readable by learners. The Labs apps keep their own TypeScript models.
    - `tests/code/ortools.test.ts` runs Google's guide examples (the first CP-SAT model; the optimisation example, 35; SEND+MORE=MONEY; eight queens' 92 solutions; the first LP, 4; the LP example, 34; the MIP example, 23; the assignment example, 265) in under a second.
  - **`machine`, the virtual board** for IoT: `Pin`, `ADC`, `PWM` on board time. The harness's sleep raises `_TimeUp` past the step's `seconds`, which ends the run without an error; every pin change is recorded (at most 2,000) and returned as `board` with the run, and `BoardView` (CodeSteps) plays it back at 4× (at once with reduced motion). `utime` is mapped to the harness's `time` (MicroPython's own `utime` keeps the real clock).
- **Chunks:** the five step views are the lazy `CodeSteps` chunk (`src/code/loader.tsx`; strings inside it, en/ar) and the sandbox is the `sandbox` chunk (shared with the editor). Both are left out of the precache; downloading a unit with code fetches `CodeSteps` too. `CodeBlock` and the highlighter are startup code (questions' snippets).
  - **Bundle rule, again:** `content/runtimes.ts` is used by startup code and the lazy chunks, so it has type-only imports. When it imported a value from `content/types.ts`, Rolldown moved React, the design system and i18n out of the entry (5 startup files).
- **Robot:** `content/robot.ts` (pure, copied to the functions) runs a program for the engine and the view and finds the fewest cards for the validator.
- **Editor:** `cms/codeForms.tsx`, with "Run the tests" (the solution must pass, the starter must not) in the same sandbox.
- **Tests:** `tests/code/harness.test.ts` (the harness in the real runtimes, via `tests/code/node.ts`, which hides `process.argv[1]` while importing MicroPython's loader or it starts a REPL on stdin), `steps.test.ts` (grading, validation, robot, colouring), `views.test.tsx` (each view, sandbox mocked), `tests/units.test.ts` (every course's code steps), and `e2e/code.spec.ts` (the real sandbox in the built app).

## Darsi Tiny (an agent model on the phone)

Four models, each 2.94 M parameters and about 3 MB. Two are for the labs and two are for live teaching. One of each job is English and one is Arabic, so a phone downloads only the language on screen.

- **Apps** (`/lib/tinylm/app/en/v2/`, `/lib/tinylm/app/ar/v2/`): text and tool calls. A request, a plan, one school tool, the result, an answer. They go into the agent and security labs after a held-out eval scored per language. The shipped bilingual model at `/lib/tinylm/v1/` is the fallback.
- **Teaching** (`/lib/tinylm/scene/en/v2/`, `/lib/tinylm/scene/ar/v2/`): the tutor only. The model writes a compact scene (a few names and numbers), reads the result computed by the phone, then explains it. The phone expands the JSON into a Lesson Studio pack and the player draws every frame from the clock, so a new question is a new animation and no video is downloaded. `apps/web/src/labs/apps/tutor/expand.ts` is that expansion.

**Shared v2 architecture.** Every model has 2,937,792 parameters: language-specific byte BPE (3,000 tokens), tied embedding/output head, width 192, six pre-norm decoder blocks, six 32-dimensional query heads with two shared K/V heads (3:1 GQA), RoPE, and a 512-wide SwiGLU FFN. Weights are row-wise int8; activations and norms are float32. The runtime has a real token-by-token KV cache, reuses a prompt's shared prefix after every tool result, fuses SwiGLU's two input projections, streams in batches, and ends its worker when idle. GQA reduces the full 384-token cache from 3.375 MiB to 1.125 MiB. The v1 MHA + GELU format remains readable.

The architecture was selected by equal-size ablation, not by fashion: 7×192 GQA and 8×160 MQA candidates were trained and compared with the 6×192 GQA candidate. The six-layer candidate had the best validation/eval result and the best slow-CPU latency. Browser measurements compare fixed prompt/decode work and PyTorch token parity. This is Darsi's best measured 3 M-parameter configuration; “global SOTA” is not claimed without a public benchmark at this unusually small scale. BitNet was rejected because ternary speed depends on specialized native kernels and is not a browser win.

For the AI agents and AI security lessons the shipped model is a 2.94 M-parameter decoder-only transformer, int8, with a 3,000-token byte-level BPE for English and Arabic and a 384-token context, trained on this PC from synthetic bilingual agent episodes. It reads a request, writes a short plan, calls one of ten simulated school tools, reads the result and answers; it asks when something is missing, asks for approval before sending a message, refuses, says "I can't" for anything its tools don't cover, and ignores instructions inside tool results. It is not generally smart: the lessons use that to show why large models are large and how to evaluate and guard an agent. `tools/tinylm/README.md` has the commands, `MODEL_CARD.md` the data, evaluation and limits, `FORMAT.md` the format.

- **V2 gates** (2026-10-31): app models, right tool and exact arguments on held-out names 100.0% English and 98.4% Arabic; OOD rewordings 84.8% / 79.6%; later-written fresh wordings 64.0% / 56.3%; blind wordings 44.3% / 55.9% (the honest limit). The teaching suite has 600 cases per language. The deterministic validator/course-pack router passes 600/600 each; raw int8 teaching models achieve **100.0% / 100.0%** valid scene JSON or refusal, **96.8% / 97.8%** exact scene parameters, **100.0% / 98.8%** plain explanations, and **96.8% / 97.7%** all checks (100% on parameterized, pack concepts, follow-ups, and refusals) while using ~50% fewer tokens per turn (`<|plan|><kind>` + 1-sentence explanations). Fixed-work Chromium: 76 tok/s median and 73 slowest at 6× CPU throttle, 679 tok/s unthrottled, 429 tok/s through the real worker. The same tokens as PyTorch on 12 v2 prompts, logits within 1e-4; v2 fine-tuning gradients match within 1e-3. `MODEL_CARD.md` holds the full tables and caveats.
- **On the phone:** `src/tinylm/` (plain TypeScript, no libraries; only a lab chunk may import it, through `index.ts`): `TinyLM` with `load()`, `generate(conversation, { onToken })`, `stop()`, `finetune(examples, { steps, blocks, replay })` and `useFineTune(saved)`; `fetchManifest()` gives the download size first; `runTool(world, tool, args, lang)` runs the simulated tools over `world.json`. It runs in a Web Worker that starts on the first call and ends after 5 s without work. The files are in `public/lib/tinylm/v1/` (2.75 MB gzipped), kept by `darsi-lib` once used; a new model goes in `v2/`.
- **Fine-tuning in the browser:** only the top one or two blocks and the final norm train (the rest stays int8). Without replay it forgets everything else (97% → 14%), so `finetune` mixes in ordinary conversations from `replay.json` (48 keep 95%). About 0.7 s per example per step on a 6×-slow phone: keep a lab to about 16 examples × 15 steps. The `teach` lab does exactly that: on a PC it takes 38 s with no replay and 2 min 16 s with 48 (about 11 minutes estimated on an old phone), and replay 48 keeps every old skill (8/8) where none keeps 1/8.

## Labs

Labs (`/labs`) is a catalogue of 96 hands-on apps on 23 shelves across the eight tracks. Everything is computed on the phone, with no AI libraries and no network: tiny neural networks really train, the TOTP codes are real (RFC 6238 via WebCrypto), SHA-256 and RSA are real. "The AI ladder" orders 20 of them from one neuron to LLMs and decision models.

| Track | Shelves (category ids) and apps |
|---|---|
| AI | Neurons and learning (`ai-learning`): neuron, activation, perceptron, gradient. Neural networks (`ai-networks`): playground, backprop, overfit. Computer vision (`ai-vision`): pixels, convolution, shapes. Language and LLMs (`ai-language`): tokens, embeddings, nextword, minilm, attention, llm, rag. Decisions and agents (`ai-decisions`): classifier, tree, knn, kmeans, rl, threshold, decision. Using AI well (`ai-use`): prompt, bias, factcheck |
| IoT | Sensors and data: sensor, adc, datalog. Electronics and logic: circuit, logic, binary. Automation and networks: rules, battery, mesh, board (a virtual Pico running MicroPython on board time, through the code sandbox) |
| Cyber | Passwords and accounts: password, twofactor, breach. Threats and scams: phishing, malware, social. Cryptography: caesar, hash, publickey. Privacy and networks: wifi, permissions, footprint |
| Programming | Code basics (`code-basics`): robot (command cards; `content/robot.ts`), trace (step through Python, with the variables), bugs. Algorithms (`code-algorithms`): search, stack, sorting, bigo, recursion |
| Data engineering | Tables and clean data (`data-tables`): table, sqlplay (real SQLite in the sandbox), clean, join, schema, index. Pipelines and quality (`data-pipelines`): formats, pipeline, quality, stream |
| Optimization | Models and choices (`opt-models`): lp, diet, knapsack, assign, modeller (CP-SAT in Python, Darsi's small OR-Tools). Routes, schedules and search (`opt-search`): timetable, sudoku, routes, shortest, colouring, anneal. Each has its own TypeScript solver, tested against known optima |
| AI agents | How agents work (`agents-how`): agentloop, tools, planner, memory. Agents in practice (`agents-practice`): approve, teach (fine-tunes Darsi Tiny on the phone), evals, team, costs. All run Darsi Tiny |
| AI security | Attacks on AI apps (`aisec-apps`): inject, guardrails, privilege, redteam (on Darsi Tiny). Protecting models and data (`aisec-models`): poison, adversarial, leak, watermark, supplychain (small models and WebCrypto, no download) |

- **One folder per app:** `src/labs/apps/<id>/` holds `meta.ts` (`LabMeta`: id, category, level 1–3, minutes, order on its shelf, optional `ladder` position, en/ar title and summary), `index.tsx` (the component, with its own en/ar strings via `useS`) and usually a pure `model.ts` that the tests exercise. Apps are discovered with `import.meta.glob`, so adding one touches no shared file.
- **Catalogue and loading:** `labs/catalog.ts` (eager metas, `LADDER`, `nextLab`) and `labs/categories.ts` are safe anywhere. `labs/loader.tsx` (lazy app imports, `LabEmbed`, `LabBoundary`, `saveAllLabs`) is imported only by startup modules (the Labs screens and `StepView`), never by a lab chunk.
- **The kit** (`labs/kit/`): `LabShell` (frame, track colour, intro, "Try this" (`tries`: one to three things to do and what to notice), takeaway, Reset; `TryThis` alone for the five original apps, which keep their design-system frame), `controls` (Slider, Segmented, RunBar, Stats), `Plot` (SVG chart: lines, dots, heatmap, separate `xFmt`/`yFmt`, `spreadLabels` for crowded labels), `PixelGrid` (drawing grid that fills gaps in quick strokes), `Formula` (a left-to-right maths line), `useLoop`, `nn` (dense network with backprop), `vectors` (PPMI, cosine, PCA), `text` (en/ar matching), `plural` (`usePlural`, Intl plural rules), `rng`, `math`, `raster`, `strings` (`useS`, shared `KIT` words).
- **Battery-safe animation:** `useLoop` runs only after the learner presses Run, a few milliseconds per animation frame, and stops by itself (converged, step cap, page hidden, lab closed). Anything paced for people to watch (the LLM writing, k-means steps, the robot walking) uses time, not frame counts, so it runs at the same speed on a 60 Hz phone and a throttled tab. The two-step sign-in clock ticks once a second only while visible.
- **Lessons and the editor:** a lesson's `lab` step takes any app id (the validator checks the id's shape only; the editor flags ids it doesn't know). The lab picker lists the catalogue as "Shelf: Title". Finishing an app marks it done in the local store (`labsDone`).
- **On phones** (checked at 360 px in English and Arabic, 2026-10-28): no app scrolls the page sideways (wide tables scroll inside their own box); controls are at least 44 px (segmented buttons and compact chips), the binary app's bits are two rows of four below 600 px, and small links such as the decision tree's counts have 40 px hit areas.
- **Bundle:** each app is its own chunk `lab-<id>-[hash].js`, kept out of the precache (see [Offline and caching](#offline-and-caching)). App styles are in `styles/lab-kit.css`, imported by `LabShell`, so they load with the first lab; `styles/labs.css` holds only the catalogue. Lab chunks import the design system and i18n, which splits the startup bundle into four small files (entry, `dist`, `preload-helper`, `rolldown-runtime`); the total size is unchanged, and this was accepted.
- **Right to left:** charts, grids, circuits and maths stay left to right, like a textbook. Arabic-Indic digits separated by spaces or operators reorder inside a left-to-right line, so every number and operator gets its own `<bdi>` (use `Formula`). An isolate with no letters (a phone number) falls back to right to left: give Latin-only strings `dir="ltr"`. Counted Arabic words use `usePlural` (one, two, 3–10, 11–99, 100+).
- **Content rules:** made-up people, schools and companies only; links use the reserved `.example` domain; nothing typed into a lab leaves the phone.
- **Code in labs:** `trace`, `bugs`, `board`, `sqlplay` and `modeller` run code through the sandbox (`src/code/sandbox.ts`), sharing its chunk. Two limits of MicroPython's step-through: inside a function only the program's variables show (no locals), and when an if/else is the last thing in a loop the `else` line shows after the `if` branch (put a line after the if/else). A missing indent is a `SyntaxError`, not an `IndentationError`. "Save all labs" saves the lab chunks and the sandbox, not the Python or SQLite runtimes: those need one run while online.
- **Darsi Tiny in labs:** the agents labs share `agentloop/agent.ts` (the step machine, argument checks, scoring as `evaluate.py` does, the approval check in code) and `agentloop/lab-agents.tsx`; the AI security labs share `inject/lab-agent.ts` (the loop with least privilege enforced in code) and `inject/lab-tiny.tsx`. Both are named `lab-*`, so their chunks stay out of the precache, like the page side of `src/tinylm` (`tinylm-*.js`). They show the 2.8 MB download (model, tokenizer, world) before fetching it on a button press; "Save all labs" doesn't save the model. Approval and tool permissions are always enforced in code, never left to the model.
- **For course writers:** what each new app teaches, what counts as finishing it and the numbers it shows: AI agents and AI security in [docs/curriculum/labs-agents-aisec.md](docs/curriculum/labs-agents-aisec.md); programming, data and optimization in the hand-over notes of the sessions that built them.

## Authored content

The course editor lets **platform admins publish units for everyone** (guests included) and **org admins publish units for their own organization's members**. It edits full units: every step type, slides, competencies and uploaded media (an MP4 and VTT captions per language, plus kit PDF/PPTX files). It is the only way courses reach learners: the app ships none.

**Flow.** Drafts live in Firestore (`units/{id}` holds the light record lists read; `unitDrafts/{id}` holds the content), saved explicitly with "Save draft" (no autosave timer). "Publish" saves, then calls `publishUnit`. Only the functions write what learners read.

**Ids.**
- New units: `u` + 8 random characters (`[a-z0-9]`). Org units must use this form (`idFits` in the rules, `idAllowed` in `functions/src/catalog.ts`).
- A platform admin's import keeps the unit's id (`ai-1.json` stays `ai-1`), so a unit exported from the editor comes back as itself with its learners' progress. `npm run seed` keeps the starting courses' ids the same way.
- Lesson ids are `<unitId>-` + 4 random characters and are never reused. Progress, notes and kit anchors are keyed by lesson id, so deleting a lesson and adding another can't hand someone's old progress to the new one.
- Step ids (`choice1`, `video2`, …) only need to be unique within a lesson.

**Validation** (`apps/web/src/content/validate.ts`): pure, dependency-free, and takes `unknown`, so pasted JSON can't crash it.
- **Errors** block publishing. They are everything that would crash a lesson or leave it stuck: an answer missing from the options, fill-in blanks that aren't numbered 0…n-1 or whose answers aren't each once in the word bank, hotspots outside the stage, unsafe media links (only `https:`, `/media/` and `/kits/`), duplicate ids, a lesson over 300 KB or a unit over 600 KB.
- **Warnings** don't block: a missing translation (`missingLang`, for Arabic or the languages the editor shows), unknown competency codes, no slides.
- **Track and level:** with the `tracks` option (track id → number of levels), the track must be one platform admins set up and the level must be one it has. Without it, any well-formed id (`[a-z][a-z0-9-]{1,23}`) and levels 1–12 pass. The editor and `publishUnit` both pass the saved tracks.
- `functions/scripts/copy-shared.mjs` (npm `prebuild` in `functions/`) copies `validate.ts`, `types.ts` and `tracks.ts` into `functions/src/shared/`. The copies are committed, and a functions test fails if they drift from the web source.

**Storage layout** (`functions/src/catalog.ts`, pure and unit-tested):

```
content/settings.json                  tracks and languages: { version, tracks, languages }, max-age=60 (saveSettings, publishLanguage)
content/i18n/{code}/v{n}.json          a published language's UI strings: { code, version, messages }, immutable
content/catalog.json                   public units: { version, units: CatalogEntry[] }, max-age=60
content/units/{id}/v{n}.json           one file per published version, immutable (the current and previous version are kept)
content/media/{id}/…                   uploaded videos, captions and kit files
orgs/{orgId}/catalog.json              the same for one organization, readable by its members only
orgs/{orgId}/units/{id}/v{n}.json
orgs/{orgId}/media/{id}/…
```

Each catalog entry carries `src` (the JSON's Storage path), `version`, `owner` and `sizeMB` (the JSON plus one language's videos). Media links in a lesson are Storage download URLs, so `<video src>` plays without headers. For org media they are bearer links: anyone given the link can open the file. Uploaded files get a unique suffix, so replacing a file never breaks the link inside an already-published version.

**Loading** (`apps/web/src/content/load.ts`):
- `loadCatalog()` merges two catalogs:
  1. the public catalog, fetched with **plain `fetch`** from the Storage REST URL, so guests never load the SDK;
  2. for org members, the org catalog.
- `mergeCatalog`: public entries first, then the org's; an org entry never replaces a public one.
- Nothing published yet (a 404) is an empty catalog, and Home says "No courses yet". No answer and no copy from an earlier visit (a first visit offline) is an error, and Home offers Retry. A unit missing from the catalog can't be loaded: there are no built-in files to fall back on.
- **Caching.** Catalogs are network-first with the last copy as the offline fallback. Unit files are cache-first by their versioned path. Both live in `darsi-content`, managed here rather than by a service-worker rule (a stale-while-revalidate rule would serve old catalogs and store everything twice).
- **Org files** go through the SDK (`storageJSON()` in `firebase.ts`). App hands load.ts the reader with `setOrgReader` (see "The bundle rule" below).
- **Scope.** App calls `configureContent({ orgId, signedIn })` on every render. A change re-reads the catalog. Signing out deletes every cached org file (shared phones): a `darsi:orgFiles` flag in localStorage says whether there are any.
- **Downloads:** `unitAssetUrls(unit, lang, entry)` leaves an authored unit's JSON out (loadUnit already cached it), and adds its uploaded kit files, video and captions. `cacheNameFor` routes Storage JSON to `darsi-content` and other Storage files to `darsi-media`.
- `videoSrc(step, lang)` and `kitUrl(file, lang, fmt)` in `content/types.ts` resolve uploaded files (`sources[lang]`, `urls[lang][fmt]`, falling back to English, then to any language) and the older `{lang}` templates.

**The editor UI** (`apps/web/src/cms/`) is one lazy chunk, `Cms` (entry `cms/Cms.tsx`), left out of the precache with its CSS (`styles/editor.css`).
- **Strings:** the editor's ~320 strings live in `cms/strings/{en,ar}.json` and are registered with `addMessages()` when the chunk loads, so learners never download them. Their keys are still type-checked: `MessageKey` includes them through a type-only import.
- **Screens and forms:**
  - `ContentList`: one-shot list, grouped by track (in the platform's order), then level and title. Filters for track, level and status, and a search over unit and lesson titles. The lesson titles come from the `lessons` summary on `units/{id}`; units saved before it existed show it after their next save. Each card has Open, Duplicate (a new draft with new unit and lesson ids, "(copy)" added to the title) and Delete (asks inline first). New unit (track cards and level buttons) and Import JSON.
  - `UnitEditor`: an **outline** (unit details, lessons, the open lesson's steps, slides and kit, checks) beside the **form** for whatever is picked. Side by side from 900px; below that, the outline first and then the form, with a breadcrumb and an "Outline" button. Lessons and steps are picked by id, so moving or undoing keeps the selection.
    - "+" rows between lessons and between steps insert one right there. A new step starts from a chooser of every step type, each with a line on what it is for.
    - A lesson can be duplicated (new lesson id, "(copy)"), moved, deleted, or copied into another unit of the same owner (`copyLessonTo`: appended to that unit's draft under a new id, as a normal save of it). A step can be duplicated (new step id), moved or deleted.
    - **Undo and redo** (`cms/history.ts`): the last 50 changes, with buttons and Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z). Typing in one item within a second counts as one change. Deleting a lesson or step happens at once and shows "Deleted" with Undo; deleting or unpublishing the unit, and leaving with unsaved changes, ask inline (no browser dialogs).
    - Unit actions (duplicate, export, unpublish, delete) are under the unit details; the bar keeps undo, redo, save, publish and a link to the checks.
  - `pickers.tsx`: the track picker (cards with each track's icon and colour, hidden tracks marked, an unknown track shown as such) and the level picker (one button per level of the chosen track, with its name when it has one). Changing the track keeps the level if the new track has it, or takes its top level.
  - `TracksPage`: see [Tracks and levels](#tracks-and-levels).
  - `fields.tsx`: English/Arabic field pairs, lists and uploads. Pairs sit side by side only when the form column has room for both (`auto-fit`), since the outline takes part of wide screens.
  - `steps.tsx`: one form per step type. Fill-the-gaps is written as `A sensor turns [heat] into a [number].`
- **Preview** plays the unsaved lesson with `LessonPlayer`'s `preview` mode: nothing is recorded, synced or submitted. It has an EN/AR switch.
- **Concurrency:** saves bump `rev`. A save refused because someone else saved first says so ("Export JSON, reload and bring your changes back in").

**The bundle rule (learned the hard way).** A module shared between the startup bundle and lazy chunks (`content/load.ts`, the lesson player…) must not import the Firebase SDK or anything that lazy-loads it, **not even dynamically**. Otherwise Rolldown splits the startup bundle into several files: 7 instead of 2 when this was measured, with more requests on a first visit. That is why:
- App passes the org reader in (`setOrgReader`);
- App passes the lesson player in (`<UnitEditor Player={LessonPlayer} />`) instead of the editor importing it;
- the editor has a single lazy entry module (`cms/Cms.tsx`);
- App registers the light-lesson player (`setLightPlayer`), a lazy chunk that imports nothing. A new lazy chunk that imports React or `content/load` can split startup too (six files when measured on 2026-10-27), so measure every new one.

Manual `codeSplitting` groups capture their dependencies recursively (a `src/cms` group once pulled React, the router and the design system into the editor chunk and loaded it at startup), so never add one for app code. To check, build into a separate folder and follow the entry chunk's static imports: they should stay at `index` + `rolldown-runtime`. Measured on 2026-10-26 with the Labs apps in the tree, the entry also imports `dist` (`@capacitor/core`, 7.8 KB) and `preload-helper`: 4 files, 152 KB gzipped (155 KB on 2026-10-27, with languages and light lessons). Builds without Labs stay at 2 files, so the split came in with Labs. It is accepted for now: the total size is the same, and it must not grow past these four.

**Old Android phones (Chrome 61+).** `@vitejs/plugin-legacy` keeps that modern build for browsers with `import.meta.resolve` (Chrome 105 and newer) and writes a second set of chunks, transpiled to Chrome 61 and polyfilled, for the rest. The legacy files are not precached (`*-legacy*` in `globIgnores`); `darsi-chunks` stores them when an old phone asks. The modern entry must still be four files: the plugin's guard is text inside the entry, not another file, and `modernPolyfills` stays off. `index.html` registers `/sw.js` as the page is parsed (the update toast still loads `workbox-window` later, with `immediate: true`) and shows a light, bilingual "please update your browser" note only if `#root` is still empty after 15 seconds. MicroPython and sql.js ship a `.legacy.js` beside the original, because those files are classic scripts the legacy build does not see; the sandbox and downloads pick it when `?.` fails to parse. The video bar and the app bar use margins rather than flex `gap` (Chrome 84), and the app-bar title sets `min-width: 0` as well as `min-inline-size: 0` (Chrome 83). The manifest has no `purpose: "monochrome"` icon: older Chrome rejects it and will not install. CSS stays targeted at Chrome 111. Lowering it to Chrome 61 rewrote logical margins into a broken language hack, and Chrome 69 already understands the logical properties these styles use.

## Tracks and levels

Every unit belongs to one **track** (AI, IoT, Cyber security, or one a platform admin added) and one **level** of that track. Platform admins manage the tracks at `/super/tracks`; every unit uses the same list, org units included.

**Model** (`content/types.ts`, `content/tracks.ts`): `TrackDef { id, name, summary?, icon, tone, levels (1–12), levelNames?, order, hidden? }`.
- Eight tracks are **built in** (`BUILTIN_TRACKS`): `ai`, `iot`, `cyber`, and since 2026-10-28 `code` (Programming), `data` (Data engineering), `agents` (AI agents), `opt` (Optimization) and `aisec` (AI security), each with its own tone (the eight tones) and icon (`code`, `chart`, `agent`, `peak`, `aisec`). Tracks admins add share the tones. They can be renamed, hidden or given more levels, but never removed or recoloured: Labs, placement and the shipped units use them. Labs has shelves for each (`labs/categories.ts`); a shelf or a track chip shows once it has apps. `mergeTracks()` applies that rule wherever a saved list is read (the app, the editor and the functions).
- `tone` is one of 8 brand colour families. `sunbird`, `lagoon` and `hibiscus` belong to the built-ins; `leaf`, `lilac`, `clay`, `sky` and `slate` were added for new tracks. Each has a solid, `-soft` and `-ink` token in both themes, and `check-contrast.mjs` checks them (ink on solid and on soft, `-ink` on soft, surface and paper). `icon` is any design-system icon; the Tracks page offers 18 subject icons.

**Where it lives.** `config/settings` in Firestore is the source of truth, and `saveSettings` alone writes it.
- `saveSettings` is for platform admins only. It validates the list (`validateTracks`: ids, names, colours, icons, 1–12 levels, built-ins present).
- It refuses a save from an older `rev` (`aborted`), so two admins can't overwrite each other.
- It refuses changes that would strand a unit (`failed-precondition`, with `conflicts`): removing a track that any unit uses, or lowering a track's levels below a level in use. Drafts and org units count (`trackConflicts` in `functions/src/trackRules.ts`).
- It then writes `content/settings.json` (public, `max-age=60`).

**In the app** (`content/settings.tsx`):
- `SettingsProvider` sits inside `I18nProvider`. It starts from the built-in tracks, so nothing waits or flashes, and switches to `content/settings.json` when it arrives. The file is read once per app start by `loadSettings()` with a plain `fetch` (network-first, last copy offline, like the catalogs), so guests never load the SDK.
- It also gives the design system each track's tone and icon (`TrackStylesProvider`).
- `useTracks()` returns `all`, `visible` (not hidden), `of(id)`, `name(id)`, `levelName(id, n)` and `order(id)`. A track nobody set up (deleted, or content from elsewhere) shows neutrally under its id, in slate with the `learn` icon.
- **Design system:** a track's colours come from `dr-tr dr-tr-<tone>`, which sets `--tr`, `--tr-soft` and `--tr-ink`. Chips, progress bars, the unit path, certificates, placement results, page previews and download rows read those variables. Components still take a `track` id and resolve it through the provider (`useTrackStyles`, `trackClass`).
- **Where tracks show up:**
  - **Onboarding** offers the visible tracks, then the placement check (`PlacementQuiz` in `screens/Onboarding.tsx`) for the learner's tracks and audience only. Per track it asks two questions per level (picked at random from three); both right passes a level, and a wrong answer or "I don't know yet" misses it (`placementNext`). It starts at the learner's school stage (where a teacher teaches, or where a student studies). From there a pass moves up until a level is missed (the learner starts there) or the top is passed, and a miss at the start moves down until a level is passed (the learner starts one above it) or Beginner is missed. A track without questions starts where the learner starts.
  - **Stages:** levels are school stages: Beginner is primary school (ages 9–12), Elementary lower secondary (12–15), Intermediate upper secondary (15–18) and Advanced university. Onboarding asks students "Where do you study?" (school accounts too), saved as `state.stage`. It asks every teacher, including a school's teacher accounts, "Where do you teach?" (primary, lower secondary, upper secondary, or university). That is saved as `state.teach` (the same four values; the old `secondary` answer is read as lower secondary) and changeable in Me ("Where I teach"). `useMine()` gives `startLevel`, `levelOf` (the level, else the start) and `levelName`, which adds the stage for students on built-in tracks ("Intermediate · Upper secondary"). Home starts a teacher at that level and folds earlier courses under "Earlier levels"; courses tagged `teach: "university"` stay visible only to university teachers, pinned first. Tracks are not hidden: every track has a teacher course at each level. Guests keep `teach` in local storage. Signed-in teachers also store it on `users/{uid}.teach`, which the Firestore rules already allow with no value check, so this field needs no rules deploy. The copy runs from `App.tsx` through `updateProfile`, which loads Firestore only when there is a user.
  - `tests/placement.test.ts` checks `placement.json`: every track it covers has three questions per audience and level, in English and Arabic, with no "·".
  - **Levels have names:** the built-in tracks' `levelNames` are Beginner, Elementary, Intermediate and Advanced (`LEVEL_NAMES` in `content/tracks.ts`); `mergeTracks` keeps them for a built-in track saved without names.
  - **My tracks** shows each track's level with "Check my level" (the same check for that track only), and offers it when a track is added.
  - **Home** starts at the learner's level (`startAt` in `screens/Home.tsx`): the course at their level first ("Your level: …"), the levels above in order, and the earlier ones folded under "Earlier levels" (open, with a note, when nothing exists yet at or above their level). Finishing the course at your level moves `state.levels[track]` up one.
  - **Home** shows **one of the learner's tracks at a time** (`content/mine.ts`: `useMine`, `myTracks`, `activeTrack`). The current track is a switcher in the app bar (`components/TrackSwitch.tsx`); its menu lists the learner's tracks and "Add or remove tracks". Ready units first, then by level. A track with nothing for the learner says so, with a link to My tracks.
  - **My tracks** (`/tracks`, `screens/MyTracks.tsx`): every visible track as a choice card with its number of courses for the learner's audience. Adding a track makes it the current one; removing one keeps its progress; at least one stays. `state.tracks` holds the choice (none chosen means every visible track) and `state.track` the current one.
  - **Kit and Downloads** list the learner's courses: their audience, in any of their tracks.
  - **Me** shows "My tracks" (with "Add or remove tracks"), "I am" (a teacher or a student; not for school accounts), "Where I teach" or "Where I study", and "My levels" out of each track's own number of levels, with level names when set.

**Courses for teachers or for students.** Every unit has an audience: `audience: "students"`, or none for teachers (every course before audiences existed). Students see only courses for students and teachers only courses for teachers, in the same tracks.
- **Who is who:** school accounts follow their role (`student` → students, `teacher` → teachers); everyone else answers "Who are you?" in onboarding (a teacher or a student) and can change it in Me (`audienceFor` in `content/mine.ts`). A teacher then chooses where they teach; that choice is what `startLevel` uses.
- **Editor:** "Who is it for?" (Teachers / Students) in a unit's details; the list marks courses for students. `units/{id}` keeps `audience` for the list (rules allow the field).
- **Published:** `catalogEntry` adds `audience: "students"` to the catalog for courses for students only; the validator accepts `teachers` or `students`.
- No courses for students exist yet: a student's track says "Courses for students in … are on their way".
- **Order:** `publishUnit` writes catalogs in the saved track order (`buildCatalog(entries, order)`; unknown tracks last).

**The Tracks page** (`cms/TracksPage.tsx`, in the `Cms` chunk). It reads `config/settings`, plus every unit's track and level, once.
- One card per track, in order, with up and down buttons. Each card has the name and description per language, the colour (labelled swatches, saying which track already uses a colour) and the icon. Built-ins keep theirs.
- Levels have a stepper (1–12) that can't go below the highest level units use, and optional level names. A "Hide from learners" switch hides a track.
- Delete is offered only for an added track that no unit uses.
- New tracks get an id suggested from the English name (`slugOf`), editable until the first save.
- "Save tracks" sends the whole list. Refusals are explained: someone saved meanwhile, or which units still use what changed.
- After a save, the provider switches to the new list at once (`apply`).

## Languages and right-to-left

- **UI strings:** `src/i18n/en.json` and `ar.json` ship with the app. `t(key, vars)` interpolates `{var}` and formats numbers with the language's numerals (Arabic-Indic for `ar`). A key a language lacks shows in English. `useI18n()` also gives `dir` and `locale` (for `Intl` dates and numbers).
- **Names inside sentences:** wrap user and organization names with `isolate()`, the plain-text `<bdi>`, so a Latin name can't reorder an Arabic sentence.
- **Arabic wording in courses:** `docs/curriculum/ar-lingo.md` is the glossary (one word per concept, the same in the Egyptian narration and the MSA course text) and the register rules. Apply a new term there first, then in the units and storyboards.
- **Separators:** never use "·" in Arabic text (it reads as Arabic zero). Use `t("common.sep")`, which is " · " in English and "، " in Arabic.
- **Codes, logins and URLs** always render left-to-right (`dir="ltr"`). Inputs use `dir="auto"`.
- **Code inside Arabic course text** (`[14, 74]`, `print("SENT")`, `{"day":"monday"}`, `=SUM(B2:B9)`, `V = I × R`) sits in invisible left-to-right isolates (U+2066 … U+2069), or it reads in the wrong order. They are stored in the unit files: `node scripts/isolate-code.mjs --fix [<unit>…]` works them out (`scripts/lib/isolates.mjs`), and `tests/units.test.ts` fails on a piece without one or on isolates that don't pair up.
  - **Runs:** Latin words, numbers and operators joined by spaces, with quoted strings (spaces inside kept), `_`, `|`, `==`/`!=`/`>=`, and an operator or `.` glued to a word (`=SUM`, `.get`). After the first word an empty `()`, `[]` or `{}` continues the run, so `TOOLS.get(agent, [])` is one piece. A number joined to a word (`2-opt`, `24-hour`) needs one too: after Arabic it would show as "opt-2".
  - **Left with the sentence:** ending punctuation, and brackets and quotes without a partner, as in «(… x = 1)».
  - **Whole strings:** an Arabic field with no Arabic letters that holds code (an option such as `sum(marks) / len(marks)` or `29 / 32`) is isolated whole. Media paths and links are left alone.
  - **Re-runs:** `--fix` works every string out afresh. It mends isolates that older rules put around half a piece of code, and keeps hand-placed ones that don't overlap a new piece («⁦What is your PIN?⁩», `⁦( [ {⁩`). First-strong (U+2068) and right-to-left (U+2067) isolates are never touched.
  - **Answers:** the lesson engine drops isolates and direction marks before comparing a typed answer.

### Languages platform admins add

English and Arabic are built in (`BUILTIN_LANGUAGES` in `content/languages.ts`). Platform admins add more at `/super/languages`, with no deploy:
- **Add:** pick from common languages (names prefilled, direction from the code) or type a code. Each language has its own name, English name, writing direction and number locale, with a live sample.
- **Translate** (`/super/languages/:code`): one card per UI string with the English and Arabic for reference. Search; filters for "Not translated" and "To fix" (placeholders that differ from the English, which block publishing); a progress bar. Drafts are saved in `translations/{code}` with a `rev` check.
- **Spreadsheets:** download `.xlsx` or `.csv` (key, English, Arabic, the language), translate anywhere, import it back (`cms/sheets.ts`). The text column is the one headed with the code or name; empty cells are skipped, and keys the app doesn't have are reported and left out.
- **Publish** (`publishLanguage`): the page first saves the draft with only the keys the app has, trimmed; the function writes the immutable pack `content/i18n/{code}/v{n}.json` and lists the language in the settings. **Unpublish** takes it off the pickers. A draft can be deleted while unpublished.
- Only the main UI strings are translated: the course editor's own strings stay English and Arabic, and so do Labs and the landing page's marketing copy (they fall back to English).

**At run time** (`i18n/index.tsx`, `content/settings.tsx`):
- `SettingsProvider` reads the published languages with the tracks (`content/settings.json`) and registers them (`setLanguages`). `useLanguages()` feeds every picker: Onboarding, Me, the landing page (a menu once there are more than two), the lesson preview.
- **Packs load when someone picks the language**, never for everyone: cache-first by versioned path (`loadLanguagePack` in `load.ts`, a plain `fetch`, so guests still never load the SDK). Until it arrives, App shows its loading screen instead of a flash of English, for at most 6 seconds; after that English shows and the strings switch in when they come.
- The last version used is remembered (`darsi:langPacks` in localStorage), so the next start reads the pack from the cache at once instead of waiting for the settings over the network. A language that is no longer published shows English.
- **Direction has one source:** the language's `dir`. `applyLocale(lang, theme, dir)` sets `<html dir>`; before the settings arrive, `dirFor(code)` guesses from the code.
- **Fonts:** an added Latin-script language caches the Latin fonts plus the extended-Latin headings; an Arabic-script one (`fa`, `ur`, `ps`…) the Arabic fonts; other scripts use the phone's fonts (`familiesFor` in `platform/fonts.ts`). A language's own name in a picker always uses the phone's font (`.dr-lang-native`, `.dr-other-script`), so no page downloads a script's web fonts for one word.
- **Files:** built-in kits and media exist in English and Arabic only, so `kitUrl` and `videoSrc` use the English file for any other language (Hosting would otherwise answer a missing file with the app's HTML). `captionsFor` gives the language's captions, else the English ones. Read-aloud asks the phone for a voice in the language's own code.
- **Push:** a phone registers with its real language (`lang-<code>` topic). Notifications are worded in Arabic for Arabic and in English for every other language (see [Push notifications](#push-notifications)).

**Lessons in any language:** content is `LocalText` keyed by language code already. The lesson editor shows English plus the languages the author picks ("Languages" in the outline, remembered per browser; a unit's existing languages are always added). Every text, list, fill-in sentence, video, captions and kit file then has a field per language, in that language's direction. `validateUnit(u, { langs })` warns about missing translations (`missingLang`, with the language) for the shown languages, and the checks fold them into one group per language ("Français: 206 texts not translated").

## Design system and CSS

- **`@darsi/design-system`** turns `tokens.json` into CSS variables and TypeScript, and provides the components (buttons, fields, the question types, video player, lesson complete, classroom kit, and more), icons, logos and self-hosted fonts:
  - Baloo 2 / Baloo Bhaijaan 2 for display;
  - Noto Sans / Noto Sans Arabic for body text.

  There are two themes: the default light theme and **Sunlight**, a high-contrast theme for outdoor use. There is deliberately no dark mode. Reduced motion is handled globally.
- **App styles** live in `apps/web/src/styles/`, one file per area, and every class has exactly one owning file (`OWNERS` in `scripts/check-css.mjs`):
  - `base` (panels, tables, forms, pills), `layout` (rail, bottom nav), `auth` and `lesson` load globally;
  - `admin`, `person`, `people` and `landing` load with their lazy chunks;
  - `labs` (the catalogue) loads globally, and `lab-kit` (everything inside the lab apps, `lb-` classes) loads with the first lab.
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
| Unit (web) | `apps/web/tests/` | Lesson engine and content integrity; the staff screens rendered with mocked data hooks and callables; cloud-sync merge and push rules, plus the sync hook with Firestore mocked; the notifications panel's states and the announcement composer (`notify.test.tsx`) |
| Unit (design system) | `packages/design-system` | Component and token tests |
| Unit (functions) | `functions/test/` | Generated passwords (character classes, no look-alikes), invite-code format, usernames from any script; `pickNudge` rules across time zones and daylight saving; every message in both languages, with no "·" in Arabic; the course editor's Storage layout, permission matrix and catalog, and that the shared validator copies match the web source; tracks (`mergeTracks`, `validateTracks`, units against a tracks list, `trackConflicts`, media kept for other drafts, catalog order) |
| Unit (course editor) | `apps/web/tests/validate.test.ts`, `content.test.ts`, `cms.test.tsx`, `tracks.test.tsx` | The validator (ai-1 passes with no issues; one broken copy per error rule; track and level against the saved tracks); catalog merge, offline fallbacks, cache-first units and the sign-out purge; the editor screens (list grouping, filters and search, duplicate and delete, new unit with the track and level pickers, org import with fresh ids, publish blocked by errors, save conflict, inserting a step between two, duplicating a lesson, delete then Undo, Ctrl+Z and Ctrl+Y, copying a lesson to another unit, leaving with unsaved changes, preview, en/ar string parity); the Tracks page (add with a suggested id, levels and delete guarded by units in use, refused saves explained); `mergeTracks`, `useTracks`, the design-system colours from settings, `placementNext` (the stopping rule) and the undo history; `tests/mine.test.tsx`: audience and tracks, Home's track switcher, the placement check (audience, chosen tracks, stopping), Home's order from your level and the level-up |
| Unit (languages) | `apps/web/tests/languages.test.tsx`, `cms.test.tsx`, `functions/test/languages.test.ts`, `messages.test.ts` | The language rules (merge, translation check, placeholders, publish problems); packs at run time (loading screen, English fallback, the remembered version, an unpublished language, right-to-left for Persian); English files and captions for added languages; fonts per script; spreadsheets (rows, the language's column, CSV with a byte-order mark); the Languages page (list, add Persian right to left, the To fix filter blocking publishing, publishing, spreadsheet import); the editor's language choice and grouped checks; push topics and wording for added languages |
| Unit (Labs) | `apps/web/tests/labs/` | The kit (network gradients against numeric ones, softmax, plots); the catalogue (every folder's meta is valid, ids unique, en+ar text, ladder positions); render tests of the Labs screen and `LabEmbed`; and every app's model, in `models.test.ts` and `b1`–`b4.test.ts` (for example: the perceptron converges but never on XOR, ID3 picks the textbook split, Q-learning finds the 10-step route, TOTP matches the RFC 6238 vectors, SHA-256 and RSA round trips in English and Arabic) |
| End-to-end | `apps/web/e2e/` (`storage.ts` stands in for Cloud Storage and serves the retired `ai-1` from `content/retired/` as `npm run seed` publishes a unit, since the app ships none) | Desktop Chrome and Pixel 7: guest onboarding, the Arabic RTL switch, a full lesson through to the kit download, the video fallback, Labs (cards open apps, the playground trains then pauses, labs aren't precached and "Save all labs" works offline), offline after the first visit |
| CSS lint | `scripts/check-css.mjs` | Brand, RTL and old-WebView rules |

The Firebase Emulator Suite needs **JDK 21+** (on this Windows machine also `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Public`; see docs/FIREBASE.md). The course editor's backend was checked end to end against the emulators on 2026-10-26: 42 checks covering the rules, publish, versions, org-only reads, media upload limits, unpublish and delete. Tracks and levels add 24 more: who may save, the public settings file, stale saves, validation, a level-5 unit in an added track, refusals that would strand units, and removal once no unit uses a track. Languages add 26: draft rules, who may publish, problems refused, the public pack, settings keeping tracks and languages side by side, versions, no client uploads, unpublish and delete. Rules tests with `@firebase/rules-unit-testing` are planned.

## Performance budget

| Measure | Now | Target (brand book) |
|---|---|---|
| Precache on install | ~974 KB, 44 files, ~363 KB gzipped (measured 2026-10-28, with 96 labs, the code steps and Darsi Tiny, none of them precached) | ≤ 2 MB including fonts |
| Fonts, kept per language | ~76 KB (English) or ~207 KB (Arabic, which needs Latin too); every script was precached before (~237 KB) | |
| Startup JS | ~171 KB gzipped in four files (entry ~167 KB; no Firebase; measured 2026-10-28) | |
| Firebase SDK, signed-in only | ~210 KB gzipped (`firebase`), plus ~21 KB (`firebase-extra`: Functions, Storage, Messaging + Installations) for admin actions, uploads and notifications | |
| Push handlers in the service worker | ~1.4 KB gzipped (`push-sw.js`, no SDK) | |
| Course editor, staff only | ~22 KB gzipped JS (`Cms`, with its strings) + ~1 KB CSS, not precached | |
| Labs | 96 app chunks (~4–15 KB each), not precached; the kit's shared chunks and the lab CSS are precached. The catalogue's metadata (titles and summaries, en and ar) is in the startup bundle | |
| Code runtimes, first lesson with code | Python 0.29 MB or SQLite 0.34 MB gzipped, once, cached in `darsi-lib` | |
| Darsi Tiny, first app/tutor in one language | ~2.75–2.77 MB gzipped model, once per job/language, cached in `darsi-lib`; the worker/page chunks are shared and not precached | ≤ 3 MB per model |
| Main CSS | ~12.5 KB gzipped | |
| One lesson | ~19 KB of JSON (both languages); kits and media download on demand | ≤ 300 KB |

Measure with `npx vite build` in `apps/web` and read the chunk table and the `precache` line.

## Known gaps and roadmap

- **Videos** come from Lesson Studio (docs/CURRICULUM.md). Open there: its `convert.ts` knows only the 12 pack lessons' order, so newer videos end without a "Next: …" card; the students' videos use the narrator style written for teachers; arrow icons don't flip in Arabic; a seek past a quick check in the light player skips it (the MP4 player stops).
- **Security review:** a static review of the rules, functions and client, plus rules unit tests and a scan of the deployed site, is planned before wider rollout.
- **Content and languages:** five more tracks (programming, data engineering, AI agents, optimization, AI security) with code exercises run on the phone, and students' courses fitted to school stages; French, Swahili, Urdu and Hausa. Answer options show in the order authored (the courses balance where the right one sits).
- **Native apps:** Android and iOS through Capacitor (see docs/NATIVE.md). The native shells don't register the web service worker, so they need native push (FCM through a Capacitor plugin) for reminders.
