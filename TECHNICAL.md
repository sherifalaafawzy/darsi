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
├─ content/                      the starting courses, not shipped with the app: units/*.json (en + ar) and the
│                                generated kits/ (PDF + PPTX, committed); `npm run seed` publishes them to Storage
├─ scripts/seed-content.mjs      publishes content/ like the course editor (kits uploaded, then publishDraft)
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
| `npm run seed -- --emulator` | Publishes the starting courses (`content/`) to the emulators; without `--emulator`, to the real project (Application Default Credentials, as for `superadmin`). An existing draft is left alone unless `--replace` |
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
| `/learn`, `/lesson/:unit/:lesson`, `/downloads`, `/labs`, `/labs/:id`, `/kit`, `/me` | signed in or guest | Behind the onboarding gate (language, school level, tracks, weekly goal, placement). `/lab` (the old AI lab, linked from sent notifications) redirects to `/labs` |
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

At 900 px and wider, a nav rail shows the five learner tabs plus the role's staff links. On phones, the design system's bottom nav keeps five tabs (Learn, Downloads, Labs, Kit, Me), and the staff links live in Me's account section. Staff screens and the landing page are **lazy chunks** (`React.lazy`), so a learner's phone never downloads or parses them.

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
| Courses (Cloud Storage `…/catalog.json`, `…/units/{id}/v{n}.json`) | Kept by `content/load.ts` itself in `darsi-content`, not by a service-worker rule: catalogs network-first with the last copy as the offline fallback; unit files cache-first (a version's path never changes). See [Authored content](#authored-content) |
| Uploaded media (Cloud Storage videos, captions, kit files) | Cache-first with range requests (`darsi-media`) once a unit is downloaded; only `200` responses are kept, so streaming without a download (opaque responses) is never stored |
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
| `unpublishUnit` | callable | Takes a unit away from learners: catalog entry and JSON versions go, uploaded media stay |
| `deleteUnit` | callable | Deletes a unit everywhere: catalog entry, JSON versions, media and both Firestore documents. Media that another draft of the same owner links to (a duplicated unit or a copied lesson) stay |
| `saveSettings` | callable | Platform admin only: saves the tracks list (see [Tracks and levels](#tracks-and-levels)) to `config/settings` and publishes `content/settings.json` |
| `publishLanguage` | callable | Platform admin only: checks a saved language draft (`validateLanguage`), writes `content/i18n/{code}/v{n+1}.json`, lists the language in `config/settings` and `content/settings.json`, keeps the previous pack and deletes older ones |
| `unpublishLanguage` | callable | Platform admin only: takes a language off the pickers and deletes its packs; people who chose it see English. The draft stays |

Every role or organization change goes through these functions, which set the claims and write an `audit` entry. Clients can never grant themselves access. `functions/src/admin.ts` initializes the Admin SDK once and sets the region and instance cap for every function.

## Content, lessons and kits

- **Content is data, and the app ships none.** Every course a learner sees is published with the course editor to Cloud Storage (see [Authored content](#authored-content)); units are typed by `src/content/types.ts`. Every learner-facing string is `{ "en": …, "ar": … }` (or more languages), with English as the fallback.
- **The starting courses** (`ai-1` today) are sources in `content/units/` at the repo root, with their kits in `content/kits/`. `npm run seed` publishes them through the editor's own publish code (`publishDraft`), uploading the kits as media, so they are ordinary published units that platform admins can edit. Their ids are kept, so progress, notes and certificates still match.
- **Lesson shape:** video (with a checkpoint question) → reading with key terms → mixed questions (some lessons add a `lab` step that embeds any Labs app) → classroom project → reflection → "Try it in class tomorrow".
- **Step types:** `video`, `read`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `lab`, `project`, `reflect`.
- **Engine** (`src/lesson/engine.ts`): pure, unit-tested grading. Answers that ignore case and Arabic diacritics are accepted. A wrong answer comes back once at the end of the lesson. XP is `10 + round(accuracy × 20)`.
- **Placement:** nine questions (`placement.json`) suggest a level per track, and the teacher can change it any time.
- **Competencies:** each lesson lists codes from the UNESCO AI Competency Framework for Teachers (`T.*`), the one for Students, DigComp 2.2 (`DC.*`) and Darsi IoT. They feed the capability views for admins.
- **Classroom kits:** `npm run kits` reads each lesson's `slides` and steps and writes, per language:
  - `slides-<lang>.pptx`: editable PowerPoint via pptxgenjs (RTL for Arabic, Arial so it renders on any school PC);
  - `slides-<lang>.pdf`: the same slides with the brand fonts embedded (headless Chromium);
  - `lesson-plan-<lang>.pdf`: an A4 lesson plan and pupil worksheet built from the lesson's questions.

  The files are committed to `content/kits/`, so seeding doesn't need Chromium. Regenerate them after editing a starting course, then seed it again with `--replace`.

## Labs

Labs (`/labs`) is a catalogue of 48 hands-on apps on 13 shelves across the three tracks. Everything is computed on the phone, with no AI libraries and no network: tiny neural networks really train, the TOTP codes are real (RFC 6238 via WebCrypto), SHA-256 and RSA are real. "The AI ladder" orders 20 of them from one neuron to LLMs and decision models.

| Track | Shelves (category ids) and apps |
|---|---|
| AI | Neurons and learning (`ai-learning`): neuron, activation, perceptron, gradient. Neural networks (`ai-networks`): playground, backprop, overfit. Computer vision (`ai-vision`): pixels, convolution, shapes. Language and LLMs (`ai-language`): tokens, embeddings, nextword, minilm, attention, llm, rag. Decisions and agents (`ai-decisions`): classifier, tree, knn, kmeans, rl, threshold, decision. Using AI well (`ai-use`): prompt, bias, factcheck |
| IoT | Sensors and data: sensor, adc, datalog. Electronics and logic: circuit, logic, binary. Automation and networks: rules, battery, mesh |
| Cyber | Passwords and accounts: password, twofactor, breach. Threats and scams: phishing, malware, social. Cryptography: caesar, hash, publickey. Privacy and networks: wifi, permissions, footprint |

- **One folder per app:** `src/labs/apps/<id>/` holds `meta.ts` (`LabMeta`: id, category, level 1–3, minutes, order on its shelf, optional `ladder` position, en/ar title and summary), `index.tsx` (the component, with its own en/ar strings via `useS`) and usually a pure `model.ts` that the tests exercise. Apps are discovered with `import.meta.glob`, so adding one touches no shared file.
- **Catalogue and loading:** `labs/catalog.ts` (eager metas, `LADDER`, `nextLab`) and `labs/categories.ts` are safe anywhere. `labs/loader.tsx` (lazy app imports, `LabEmbed`, `LabBoundary`, `saveAllLabs`) is imported only by startup modules (the Labs screens and `StepView`), never by a lab chunk.
- **The kit** (`labs/kit/`): `LabShell` (frame, track colour, intro, takeaway, Reset), `controls` (Slider, Segmented, RunBar, Stats), `Plot` (SVG chart: lines, dots, heatmap, separate `xFmt`/`yFmt`, `spreadLabels` for crowded labels), `PixelGrid` (drawing grid that fills gaps in quick strokes), `Formula` (a left-to-right maths line), `useLoop`, `nn` (dense network with backprop), `vectors` (PPMI, cosine, PCA), `text` (en/ar matching), `plural` (`usePlural`, Intl plural rules), `rng`, `math`, `raster`, `strings` (`useS`, shared `KIT` words).
- **Battery-safe animation:** `useLoop` runs only after the learner presses Run, a few milliseconds per animation frame, and stops by itself (converged, step cap, page hidden, lab closed). Anything paced for people to watch (the LLM writing, k-means steps, the robot walking) uses time, not frame counts, so it runs at the same speed on a 60 Hz phone and a throttled tab. The two-step sign-in clock ticks once a second only while visible.
- **Lessons and the editor:** a lesson's `lab` step takes any app id (the validator checks the id's shape only; the editor flags ids it doesn't know). The lab picker lists the catalogue as "Shelf: Title". Finishing an app marks it done in the local store (`labsDone`).
- **Bundle:** each app is its own chunk `lab-<id>-[hash].js`, kept out of the precache (see [Offline and caching](#offline-and-caching)). App styles are in `styles/lab-kit.css`, imported by `LabShell`, so they load with the first lab; `styles/labs.css` holds only the catalogue. Lab chunks import the design system and i18n, which splits the startup bundle into four small files (entry, `dist`, `preload-helper`, `rolldown-runtime`); the total size is unchanged, and this was accepted.
- **Right to left:** charts, grids, circuits and maths stay left to right, like a textbook. Arabic-Indic digits separated by spaces or operators reorder inside a left-to-right line, so every number and operator gets its own `<bdi>` (use `Formula`). An isolate with no letters (a phone number) falls back to right to left: give Latin-only strings `dir="ltr"`. Counted Arabic words use `usePlural` (one, two, 3–10, 11–99, 100+).
- **Content rules:** made-up people, schools and companies only; links use the reserved `.example` domain; nothing typed into a lab leaves the phone.

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
- the editor has a single lazy entry module (`cms/Cms.tsx`).

Manual `codeSplitting` groups capture their dependencies recursively (a `src/cms` group once pulled React, the router and the design system into the editor chunk and loaded it at startup), so never add one for app code. To check, build into a separate folder and follow the entry chunk's static imports: they should stay at `index` + `rolldown-runtime`. Measured on 2026-10-26 with the Labs apps in the tree, the entry also imports `dist` (`@capacitor/core`, 7.8 KB) and `preload-helper`: 4 files, 152 KB gzipped. Builds without Labs stay at 2 files, so the split came in with Labs. It is accepted for now: the total size is the same, and it must not grow past these four.

## Tracks and levels

Every unit belongs to one **track** (AI, IoT, Cyber security, or one a platform admin added) and one **level** of that track. Platform admins manage the tracks at `/super/tracks`; every unit uses the same list, org units included.

**Model** (`content/types.ts`, `content/tracks.ts`): `TrackDef { id, name, summary?, icon, tone, levels (1–12), levelNames?, order, hidden? }`.
- `ai`, `iot` and `cyber` are **built in** (`BUILTIN_TRACKS`). They can be renamed, hidden or given more levels, but never removed or recoloured: Labs, placement and the shipped units use them. `mergeTracks()` applies that rule wherever a saved list is read (the app, the editor and the functions).
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
  - **Onboarding** offers the visible tracks. Placement spreads each score over all of a track's levels (`placementLevel`: all right reaches the top level). A track with no placement questions starts at level 1.
  - **Home** leaves out units of hidden tracks, then sorts ready units first, the learner's tracks next, then by track order and level.
  - **Me** shows "My levels" out of each track's own number of levels, with level names when set.
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
- **Separators:** never use "·" in Arabic text (it reads as Arabic zero). Use `t("common.sep")`, which is " · " in English and "، " in Arabic.
- **Codes, logins and URLs** always render left-to-right (`dir="ltr"`). Inputs use `dir="auto"`.

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
| Unit (course editor) | `apps/web/tests/validate.test.ts`, `content.test.ts`, `cms.test.tsx`, `tracks.test.tsx` | The validator (ai-1 passes with no issues; one broken copy per error rule; track and level against the saved tracks); catalog merge, offline fallbacks, cache-first units and the sign-out purge; the editor screens (list grouping, filters and search, duplicate and delete, new unit with the track and level pickers, org import with fresh ids, publish blocked by errors, save conflict, inserting a step between two, duplicating a lesson, delete then Undo, Ctrl+Z and Ctrl+Y, copying a lesson to another unit, leaving with unsaved changes, preview, en/ar string parity); the Tracks page (add with a suggested id, levels and delete guarded by units in use, refused saves explained); `mergeTracks`, `useTracks`, the design-system colours from settings, `placementLevel` and the undo history |
| Unit (languages) | `apps/web/tests/languages.test.tsx`, `cms.test.tsx`, `functions/test/languages.test.ts`, `messages.test.ts` | The language rules (merge, translation check, placeholders, publish problems); packs at run time (loading screen, English fallback, the remembered version, an unpublished language, right-to-left for Persian); English files and captions for added languages; fonts per script; spreadsheets (rows, the language's column, CSV with a byte-order mark); the Languages page (list, add Persian right to left, the To fix filter blocking publishing, publishing, spreadsheet import); the editor's language choice and grouped checks; push topics and wording for added languages |
| Unit (Labs) | `apps/web/tests/labs/` | The kit (network gradients against numeric ones, softmax, plots); the catalogue (every folder's meta is valid, ids unique, en+ar text, ladder positions); render tests of the Labs screen and `LabEmbed`; and every app's model, in `models.test.ts` and `b1`–`b4.test.ts` (for example: the perceptron converges but never on XOR, ID3 picks the textbook split, Q-learning finds the 10-step route, TOTP matches the RFC 6238 vectors, SHA-256 and RSA round trips in English and Arabic) |
| End-to-end | `apps/web/e2e/` (`storage.ts` stands in for Cloud Storage and serves the starting course as `npm run seed` publishes it, since the app ships none) | Desktop Chrome and Pixel 7: guest onboarding, the Arabic RTL switch, a full lesson through to the kit download, the video fallback, Labs (cards open apps, the playground trains then pauses, labs aren't precached and "Save all labs" works offline), offline after the first visit |
| CSS lint | `scripts/check-css.mjs` | Brand, RTL and old-WebView rules |

The Firebase Emulator Suite needs **JDK 21+** (on this Windows machine also `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Public`; see docs/FIREBASE.md). The course editor's backend was checked end to end against the emulators on 2026-10-26: 42 checks covering the rules, publish, versions, org-only reads, media upload limits, unpublish and delete. Tracks and levels add 24 more: who may save, the public settings file, stale saves, validation, a level-5 unit in an added track, refusals that would strand units, and removal once no unit uses a track. Languages add 26: draft rules, who may publish, problems refused, the public pack, settings keeping tracks and languages side by side, versions, no client uploads, unpublish and delete. Rules tests with `@firebase/rules-unit-testing` are planned.

## Performance budget

| Measure | Now | Target (brand book) |
|---|---|---|
| Precache on install | ~726 KB (measured 2026-10-26, with Labs) | ≤ 2 MB including fonts |
| Fonts, kept per language | ~76 KB (English) or ~207 KB (Arabic, which needs Latin too); every script was precached before (~237 KB) | |
| Startup JS | ~152 KB gzipped in four files (entry ~147 KB; no Firebase) | |
| Firebase SDK, signed-in only | ~210 KB gzipped (`firebase`), plus ~21 KB (`firebase-extra`: Functions, Storage, Messaging + Installations) for admin actions, uploads and notifications | |
| Push handlers in the service worker | ~1.4 KB gzipped (`push-sw.js`, no SDK) | |
| Course editor, staff only | ~22 KB gzipped JS (`Cms`, with its strings) + ~1 KB CSS, not precached | |
| Labs | 48 app chunks, ~320 KB in all (~5–9 KB each), not precached; the kit's shared chunks and ~5 KB gzipped CSS are precached | |
| Main CSS | ~12.5 KB gzipped | |
| One lesson | ~19 KB of JSON (both languages); kits and media download on demand | ≤ 300 KB |

Measure with `npx vite build` in `apps/web` and read the chunk table and the `precache` line.

## Known gaps and roadmap

- **Videos:** the narrated video pipeline (Playwright slide renders, TTS in each language, ffmpeg, VTT captions) is designed but not built. Lessons use transcripts until then.
- **Security review:** a static review of the rules, functions and client, plus rules unit tests and a scan of the deployed site, is planned before wider rollout.
- **Content and languages:** the IoT and cyber-security units; French, Swahili, Urdu and Hausa.
- **Native apps:** Android and iOS through Capacitor (see docs/NATIVE.md). The native shells don't register the web service worker, so they need native push (FCM through a Capacitor plugin) for reminders.
