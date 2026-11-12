# Firebase: setup, deploy and local development

Darsi runs on the Firebase project **`darsi-f0685`** in region **`europe-west1`**:
- Hosting, two sites: the PWA (deploy target `app`, site `darsi-f0685`, https://darsiai.org) and school sign-in's callback (target `login`, site `darsi-login`, https://login.darsiai.org; see [10. School sign-in](#10-school-sign-in));
- Authentication (email/password, Google, username logins mapped to `<username>@users.darsi.app`, and custom tokens for school sign-in);
- Cloud Firestore and Cloud Storage;
- Cloud Functions (2nd gen, Node 22), with Cloud Scheduler for the hourly reminder run;
- Cloud Messaging (web push; see [6. Push notifications](#6-push-notifications)).

In the `gcloud` commands below, `<owner-account>` is the Google account that owns the project (the personal one the Firebase CLI is logged in with, never a work account that happens to be gcloud's active one). No address is written in the docs.

## 1. One-time setup in the Firebase console

1. **Blaze (pay-as-you-go) plan.** Cloud Functions (2nd gen) and new Cloud Storage buckets (`*.firebasestorage.app`) need it. There is a free tier; set a **budget alert** (Google Cloud console → Billing → Budgets) so a mistake can't surprise you.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
   - Under *Settings → Authorized domains*, add your custom domain if you use one (the live site uses `darsiai.org` and `www.darsiai.org`). `darsi-f0685.web.app` and `.firebaseapp.com` are there by default.
3. **Firestore Database → Create database** in production mode. Location: `europe-west1`, next to the functions, or `eur3` for multi-region. **The location can never be changed.**
4. **Storage → Get started**, and put the bucket in the same region as Firestore. The app stores files in **`darsi-f0685` (europe-west1)**.
   - The original default bucket `darsi-f0685.firebasestorage.app` landed in us-west1, and a bucket can't be moved. It was never used and was deleted on 2026-10-25 (`gcloud storage buckets delete`, which refuses a bucket that isn't empty).
   - `.firebaserc` maps the deploy target `main` → `darsi-f0685`, so `firebase deploy --only storage` puts `firebase/storage.rules` there. Keep the target: without one, the CLI aims at the project's default bucket, which no longer exists.
   - `VITE_FIREBASE_STORAGE_BUCKET=darsi-f0685` in `apps/web/.env.local` points the app at the right bucket.

## 2. Local configuration (already done in this repo)

- `apps/web/.env.local` holds the web config for `darsi-f0685`. It is gitignored. A Firebase web API key is a public project identifier, not a secret: the security rules protect the data. Keep it out of git anyway.
- `.firebaserc` sets the default project to `darsi-f0685`.
- `apps/web/.env.development` (committed: `!apps/web/.env.development` in `.gitignore`) points `npm run dev` at the Emulator Suite (project `demo-darsi`), so day-to-day development never touches live data. In development mode it outranks `.env.local`; builds and the unit tests still read `.env.local`. If it goes missing, `npm run dev` turns Firebase off instead of using the live project (`firebase-config.ts`; `VITE_ALLOW_LIVE_DEV=true` overrides that on purpose).

## 3. Build and deploy

```bash
npx -y npm@11.13.0 install          # workspace deps (also builds the design system)
npm ci --prefix functions           # Cloud Functions deps (separate lockfile)
npx firebase login                  # once per machine
npm run deploy -- functions hosting firestore storage          # check, build, print the commands; deploys nothing
npm run deploy -- functions hosting firestore storage --yes    # the same, then deploy
```

`npm run deploy` (`scripts/deploy.mjs`; docs/OPERATIONS.md §2 has every step) releases a commit: it refuses a tree with uncommitted changes, runs `npm run verify`, builds, and runs one `firebase deploy` per step in a fixed order, whatever order the targets were typed in:

1. **indexes** (`firestore:indexes`): `firebase/firestore.indexes.json` holds the composite indexes, the single-field indexes that are switched off (each costs a write per entry: collection group `private` field `rows`, and `users` `summary.competencies`, `summary.compAcc`, `summary.units`, `summary.tracks` and `summary.weeks`; a new query on one of them fails with "the query requires an index" until its override is removed), and the **TTL policies** (`ssoUsed.expireAt`, `ssoTests.expireAt`). Adding one breaks nothing, and they take minutes to build. Never deploy indexes with `--force`: the project has two older field overrides that are not in the file, and `--force` would delete them;
2. **functions**;
3. **Hosting**, both sites (`--only hosting` deploys every site in `firebase.json`; the script refuses when `.firebaserc` doesn't map `app` and `login` for the project);
4. **rules** (Firestore, then Storage), last: phones keep the previous app until they update, so rules that only the new app can live with go out after it.

A plain `npx firebase deploy --only …` still works, and `firebase.json` then runs the builds for you: Hosting's predeploy runs `npm run build` (design system + web), and Functions' predeploy builds `functions/` and runs its tests, so a failing test stops the deploy. It checks nothing else and picks its own order, so use it only for a single piece.

A production build of the app stops at once when a required setting is missing from `apps/web/.env.local` (`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_APP_ID`, `_VAPID_KEY`, `VITE_TUTOR_RELAY`; `apps/web/.env.example` lists them) or when `VITE_USE_EMULATORS` is `true`. A release of the functions needs `functions/.env.darsi-f0685` (`functions/.env.example` lists what it holds).

On the **first** functions deploy:
- the CLI asks to enable Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc and Cloud Scheduler (for `dailyNudges`); say yes;
- if `onProgressWrite` or another Firestore trigger fails with an Eventarc permission error, wait a few minutes and deploy again: Google needs time to provision the service agent.

Firestore builds the composite indexes in `firebase/firestore.indexes.json` after deploy. The console shows "Building", and admin lists stay empty until the build finishes.

Every functions deploy needs these secrets to exist (`npx firebase functions:secrets:set <NAME>`; `unset` is a valid value where a section says so): `PAYMOB_SECRET_KEY`, `PAYMOB_HMAC_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (§9 Payments), `GEMINI_API_KEY` (§9 The tutor), `GITHUB_TOKEN` (§9 Capstones) and `SSO_KEYS` (§10 School sign-in).

### Releasing the enterprise batch (2026-11)

The batch that brings member and organization lifecycle, the audit log's context, course access through callables, rules that follow the profile, retention, legal pages and school sign-in. Do it in this order, from the commit being released, with a clean tree. Every script below takes the credentials of `npm run seed` (§7: the personal application-default login, or a service-account key in `GOOGLE_APPLICATION_CREDENTIALS`) and prints ids only.

1. **Before anything: `node scripts/check-claims.mjs`** (read-only; credentials as for `npm run superadmin`, §4). The new rules need each staff account's profile (`users/{uid}.role`, and `orgId` for org admins and teachers) to equal its claims. A platform admin whose profile doesn't say `superadmin` would be locked out of every `/super` screen, and an org admin or teacher whose profile disagrees would see "permission denied". Fix every mismatch it lists (repeat the change in the app, or `npm run superadmin -- <email>`, which writes both) until it exits 0 (1 means it listed something, 2 that it could not run).
2. **School sign-in's one-time setup** (§10, the owner's): the secret `SSO_KEYS`, the service account `darsi-sso` and its grants, the three settings in `functions/.env.darsi-f0685`, and the Hosting site `darsi-login` with the `login.darsiai.org` record in Cloudflare. Every functions deploy from this batch on declares `SSO_KEYS`, and `--only hosting` deploys both sites, so both must exist first. `SSO_KEYS` may be `unset` (school sign-in then stays closed). The other secrets must exist too (§3, above).
3. **The triggers that changed, by hand, first.** From the commit being released (it builds and tests the functions itself):

   ```
   npx firebase deploy --only functions:onProgressWrite,functions:onSubscriptionWrite,functions:onAccountDeletion,functions:onOrgLicence,functions:onOrgSite --project darsi-f0685 --force
   ```

   `onProgressWrite`, `onSubscriptionWrite`, `onOrgLicence` and the new `onAccountDeletion` are retried when they fail (a failure policy), and `onOrgSite` now listens with the writer's identity (another event type). The Firebase CLI changes neither without being asked, and it can't ask when the release runs without a terminal or from an agent session. Without this step:
   - the release's functions step **stops whole**, before any function goes out, with "Pass the --force option to deploy functions with a failure policy". Running it again never passes;
   - once those are out, the CLI **leaves `onOrgSite` out with one warning line** ("Skipping updates for functions that may be unsafe to update") and reports success. The old `onOrgSite` would then rewrite `content/sites.json` without the schools' sign-in entries at the next rename, new logo or deletion of an organization with its own address.

   `--force` here confirms the new failure policies and the new event type and nothing else: with named functions it deletes none. Never add `--force` to a whole deploy, and never to indexes. `npm run deploy` checks for both cases, and for a person who answers No to the CLI's question at a terminal (every trigger the CLI lists as unsafely changing must also be reported as "Successful update operation"): it stops at the functions step, so neither the app nor the rules go out, makes no tag, and prints this command for exactly the functions the CLI named. If `onAccountDeletion`'s first deploy then fails on an Eventarc permission that is still spreading, wait a minute and run the command again. While `onOrgSite` is being replaced a rename or new logo may not be followed to `content/sites.json`; save the organization once more afterwards.
4. **Course access: `npm run pin-course-access`, then `npm run pin-course-access -- --apply`.** A grant now reads only the organizations stored with it, and grants made before this release store none, so after the release they read nothing until pinned. The dry run lists `uid → organization` for each grant it would pin; `--apply` pins each to the teacher's organization as Auth holds it now (`"none"` for a teacher in none) and writes a `pinCourseAccess` audit entry. Running it again changes nothing. Do it just before the release: the live functions and rules ignore the stored list, so no teacher is without their results in between. But the live app's `/super/access` writes a grant whole from the browser, without `orgs`, so a grant saved there after the pin and before the release loses it again: that is what the second dry run in step 9 is for.
5. **The units' version counters: `node scripts/backfill-last-version.mjs --dry-run`, then without `--dry-run`** (credentials as for `npm run seed`). Do it **before anyone publishes or republishes a course after the release**: right after the release at the latest, and it may just as well be run just before the release (the live functions ignore `lastVersion` and leave it on the unit). A published unit file is immutable and phones keep it for good, so a version number must never be used twice. The new functions keep the counter on the unit (`units/{id}.lastVersion`), but two kinds of course don't have it yet:
   - the courses unpublished before this release (the 54 of 2026-11-05) have neither a counter nor files: their last version is recorded only in the audit log's `publishUnit` entries. The new functions read it from there at the next publish;
   - a course that was unpublished and then published again by the live functions started again at v1, while the audit log records its earlier v3 or v4. The new functions trust the live version of a published course and never look at the audit log for it, so until the script has run, each publish of such a course gives out a number phones may already hold. **This is why the next publish is the deadline.** The dry run marks such a course "(live)" with a counter above its live version.

   The script writes the highest version anything records onto each unit (it never lowers a counter, writes nothing else, and is safe to run again). The audit period is not a deadline for it: the retention job keeps `publishUnit` entries whatever the period, also for a unit deleted and made again under its old id.
6. **Release:** `npm run deploy -- functions hosting firestore storage --yes`. It goes out as indexes, functions, Hosting, rules. The order matters here more than usual, because the new rules close things the previous app did from the browser: writing course-access grants and reading other people's results (`/results`, `/super/access`), saving the Google Analytics settings, and a platform admin's direct writes to `users` and `orgs`. The functions (`courseResults`, `grantCourseAccess`, `revokeCourseAccess`, `setGaConfig`, `updateMembers`…) and the new app replace them; a phone still on the previous app shows "permission denied" on those screens until it takes the update. Rules first would break them for everyone.
   This also deploys `sendFeedback`, `manageOrgPage` and `seoPage` (new). Hosting no longer uploads `index.html` or `robots.txt`: `/`, `/robots.txt`, `/sitemap.xml` and `/llms.txt` go to `seoPage`, every other page to `app.html` (TECHNICAL.md "Search and AI engines"). Functions go out before Hosting, so `seoPage` is there when the new rewrites are.
7. **New scheduled jobs:** `retentionJob` (daily 03:10 UTC) and `ssoJob` (daily 02:30 UTC) get their own Cloud Scheduler jobs. Nothing is deleted by `retentionJob` until a platform admin saves keeping periods.
8. **The voice relay** (§9, the owner's: `gcloud` with `--account=<owner-account>`): deploy it again from the same commit, with `RELAY_MAX_SOCKETS` and `RELAY_MAX_PENDING_PER_IP` as in §9's command.
9. **Afterwards:**
   - `npm run pin-course-access` once more (dry run): it must list nothing. A grant it lists was saved on the previous app after step 4: run `-- --apply` again. Then open `/super/access` and check the Organizations column, which now names every grant's real organization: a name that surprises you (a teacher who changed organization shortly before the release) is worth a look. Name others where a teacher should see more. A grant with none shows "None set" and must be saved again.
   - `curl -i https://darsiai.org/api/csp` answers 405; `curl -i "https://darsiai.org/api/sso/school?slug=nobody"` answers 404 (`sso-no-school`); `curl -i -X POST https://darsiai.org/api/sso/start -H "Content-Type: application/json" -d "{}"` answers 400 (`sso-fields`) with a working key ring and 503 (`sso-key`) while `SSO_KEYS` is `unset`; `https://login.darsiai.org/` shows "Darsi sign-in".
   - Firestore → `stats/jobs` gains `sitesJob` within 15 minutes, and the other jobs after their next run.
   - If someone is locked out: a platform admin with `npm run superadmin -- <email>`; anyone else, find the mismatch with `check-claims` and repeat the change with the callable that owns it. To go back, release the previous rules (docs/OPERATIONS.md §3).
   - `curl -s https://darsiai.org/ | grep -c application/ld+json` answers 1, and `curl -s https://darsiai.org/robots.txt`, `/sitemap.xml` and `/llms.txt` answer for darsiai.org; an organization's address answers with its own name and canonical. Then, the owner's: add each address to Google Search Console and submit its `sitemap.xml`.
   - Platform admins: open `/super` on each phone that should hear about new organization requests and tap "Turn on alerts on this phone".
   - Push the tag `npm run deploy` made (`git push origin <tag>`), and record the release.

### Once, after the next deploy of the 2026-11 fixes

Done on the live project with the release of 2026-11-08 (both scripts are safe to run again). Kept for a project set up afresh.

Deploy the Firestore rules (organization requests, certificates, element sizes, the username domain), the functions and Hosting together, then run these once against the live project (credentials as for `npm run seed`, §7; build the functions first):

```bash
npm run build --prefix functions
node scripts/migrate-org-requests.mjs --dry-run   # what would move
node scripts/migrate-org-requests.mjs             # contact and reason off every org document, into orgs/{id}/private/request
npm run resummarize                               # graded lessons only, and the projects waiting for review
```

- `migrate-org-requests` must run once: until it does, older organizations still carry the requester's contact and reason on the org document, which every member reads (the review cards on `/super` read `private/request` and fall back to the org document). It is safe to run again (`--emulator` for the local suite).
- `resummarize` rebuilds every summary with the same code as the trigger, so older lesson rows learn which lessons are ungraded (projects, capstone stages, readings) and every profile gets `projectsWaiting`.

## 4. Make yourself the platform admin

Roles live in Auth custom claims, which only the Admin SDK can set.

1. Open the deployed app and **sign up** with your own email.
2. Get credentials for the Admin SDK, either way:
   - **Service-account key:** Firebase console → Project settings → Service accounts → Generate new private key. Save it **outside the repo**, then
     `set GOOGLE_APPLICATION_CREDENTIALS=C:\keys\darsi-f0685.json` (PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\darsi-f0685.json"`).
   - **gcloud:** `gcloud auth application-default login` with an account that owns the project. The script bills the Auth API's quota to the project itself, so ignore gcloud's "Cannot find a quota project" warning.
     A `GOOGLE_APPLICATION_CREDENTIALS` that is set always wins over this login, so clear it first (`set GOOGLE_APPLICATION_CREDENTIALS=`; PowerShell: `Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS`).
3. Run: `npm run superadmin -- you@example.com`. Use `--revoke` to undo and `--emulator` for the local Emulator Suite.

The app picks up the role by itself: it refreshes claims when `users/{uid}` changes. You land on `/super` to approve organizations. An approved organization's requester becomes its admin and gets teacher and student invite codes.

## 5. Check before going live

- Sign up, sign out, sign in again; reset a password from "Forgot password?".
- As an independent learner: finish the first lesson of a live course, for example "Audit an AI tool" in Leading AI at school (`ai-4-1`). In Firestore, `users/{uid}/progress/ai-4-1-1` appears and `users/{uid}.summary` updates within seconds (that is the trigger). The live courses are the ones `content/catalog.json` in Storage lists, not every file in `content/units`.
- Request an organization from `/org?request=1`, approve it at `/super`, then join it with an invite code from a second account.
- In an org admin account: add two people, download the credentials, print the login slips. Pupils who name a teacher made in the same sheet get that teacher (teachers are made first); a name in Arabic gets a Latin login (`mna.abd.27561`).
- Data rights: in Me, **Your data → Download my data** gives a JSON file. With a throwaway account made by sign-up, **Delete my account and my data** (it asks for a recent sign-in) removes it from Authentication and Firestore. Platform admins have the same, plus Suspend, on a person's page (TECHNICAL.md "Accounts: data, deletion and suspension").
- On a cheap Android phone: install the PWA, go offline, and confirm a downloaded unit still opens.
- Notifications: see the checks at the end of [6. Push notifications](#6-push-notifications).
- Course editor: see the checks at the end of [7. Course editor](#7-course-editor).

## 6. Push notifications

Darsi sends web push through Firebase Cloud Messaging (FCM):
- **learning reminders**: opt-in, at most one a day, at the hour the person picks;
- **project feedback** for learners (a review, opening Me's "My projects"; the outcome of an organization request) and **staff alerts** (a project to review, a new organization request, a capstone milestone waiting for Darsi staff);
- **announcements** that platform admins send from `/super`.

Nothing is sent to a device until its owner turns notifications on in **Me**, and each category can be switched off there. Guests never load the messaging SDK. How it works is in [TECHNICAL.md](../TECHNICAL.md#push-notifications).

### Set up once

1. **Web Push key (VAPID).** Firebase console → Project settings → **Cloud Messaging** → *Web Push certificates* → **Generate key pair**. Copy the key pair's public key into `apps/web/.env.local`:
   ```
   VITE_FIREBASE_VAPID_KEY=B...
   ```
   - The key is public, not a secret, but Vite reads it at build time: rebuild and redeploy Hosting after setting or changing it.
   - Until it is set, Me says notifications aren't set up yet and the app never loads the messaging SDK.
   - On the same page, **Firebase Cloud Messaging API (V1)** should say *Enabled* (the default for new projects). The legacy API isn't used.
2. **Cloud Scheduler** is enabled by the first functions deploy that includes `dailyNudges` (say yes when the CLI asks). The CLI creates one job for it (Google Cloud console → Cloud Scheduler) that runs at the top of every hour (`0 * * * *`, UTC). Cloud Scheduler's free tier covers 3 jobs per billing account.
3. **Deploy** the rules, functions and app together: `npx firebase deploy --only firestore:rules,functions,hosting`. The new rules keep device tokens (`users/{uid}/devices`) away from every client, and let only platform admins read `broadcasts`.

### Phones and browsers

- **Android:** Chrome, Edge, Samsung Internet and Firefox, in a tab or the installed app.
- **iPhone and iPad:** web push works only in the installed app, on **iOS/iPadOS 16.4 or later**. In Safari: Share → **Add to Home Screen**, then open Darsi from the home screen and turn notifications on in Me. In a Safari tab, Me explains this instead of showing the switch.
- **Blocked permission:** a browser never asks twice. People allow it again in the site settings (Chrome: the icon next to the address → Permissions → Notifications → Allow); Me tells them how.
- **The Android and iOS apps (Capacitor)** don't register the web service worker, so web push doesn't run in them. Native push is not built yet.

### Send an announcement

1. Sign in as a platform admin and open `/super`.
2. Under **Send an announcement**, write a title (up to 60 characters) and a message (up to 180) in **both** English and Arabic. Each device gets its own language.
3. Choose the audience: everyone, one active organization, or one role (teachers, students or org admins). Choose the screen the notification opens: Learn, Labs, Classroom kit or Organization.
4. Tap **Send** and confirm. The notice shows the result for each language. **Recent announcements** lists the last 20; each send is also stored in `broadcasts` and written to `audit`.

It reaches every device where the person has notifications on and **Announcements** switched on. A phone that is offline gets it when it reconnects, if that is within 24 hours. An announcement can't be recalled, so try it on a test organization first.

### Check it works

FCM isn't part of the Emulator Suite, and `npm run dev` runs without a service worker. Test against the real project with `npm run build` and `npm run preview` (http://localhost:4173 counts as a secure origin), or on the deployed site:
- Sign in, turn notifications on in Me, and allow the prompt. `users/{uid}/devices/…` and `users/{uid}.notify` appear in Firestore.
- Send an announcement to a test organization you belong to. It arrives in your language, and tapping it opens the chosen screen.
- Pick the next reminder time on the list (07:00, 12:00, 16:00, 18:00 or 20:00) and wait for it. One reminder arrives in that hour, and none if you finish a lesson first that day.
- Turn notifications off in Me. The device disappears from Firestore.

## 7. Course editor

Platform admins publish units for everyone at `/super/content`; org admins publish units for their own members at `/admin/content`. Drafts live in Firestore. Publishing (the `publishUnit` function) writes the unit as a versioned JSON file to Storage, under `content/` (public) or `orgs/{orgId}/` (members only), plus a `catalog.json` the app reads its courses from. The app ships no courses, so publish the starting ones once (see "Publish the starting courses" below). How it works is in [TECHNICAL.md](../TECHNICAL.md#authored-content).

### Set up once

1. **Deploy** the new rules, index, functions and app:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
   ```
   The `units (owner, updatedAt)` index must finish building (Firestore console → Indexes) before the editor's list loads.
2. **Bucket CORS.** Browsers read published units straight from Storage (guests with a plain `fetch`, members through the SDK), which Storage allows only for the origins in `firebase/storage.cors.json`:
   ```bash
   gcloud storage buckets update gs://darsi-f0685 --cors-file=firebase/storage.cors.json --account=<owner-account>
   gcloud storage buckets describe gs://darsi-f0685 --format="default(cors_config)" --account=<owner-account>
   ```
   - The list holds the Hosting domains, the local dev and preview ports, and the Capacitor origins. Add a custom domain there when you get one.
   - Uploads from the editor don't need it; reading does. Without it, Home simply doesn't show published units.

### Publish the starting courses

The app ships no courses: every course comes from the editor. `content/units/` at the repo root holds every course source (96 on 2026-11-07, with their kits in `content/kits/` and their media in `content/media/`, which is gitignored). **What is live is `content/catalog.json` in Storage** (51 courses on 2026-11-07), not that folder: the primary and secondary courses were unpublished on 2026-11-05 and only their drafts remain. Publish by name:

```bash
npm run build --prefix functions
npm run seed -- <id> <id>…            # e.g. npm run seed -- ai-4-1
```

- It uses the same credentials as `npm run superadmin` (§4): a service-account key in `GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth application-default login` with your personal account.
- It uploads the kit and media files (and the pictures in the lesson text) to `content/media/<unit>/`, saves each unit as a platform draft and publishes it through the editor's own publish code. Unit and lesson ids stay the same, so learners keep their progress, notes and certificates. A unit whose pictures or media aren't on this computer keeps its app paths or isn't published (pictures), so seed from a checkout that has `content/media`.
- A unit that already has a draft is left alone (it may hold edits made in the editor); `npm run seed -- --replace <id>…` overwrites those drafts and publishes them. **Never run `--replace` without ids on the live project:** with no ids the seed takes every file in `content/units`, so it would republish all 96, including the courses deliberately kept off the site (and overwrite any editor edits). Without `--replace`, no ids only publishes sources that have never had a draft. `npm run seed -- --emulator` does the same against the emulators, where publishing everything is fine.
- `npm run seed -- --unpublish <id>…` takes units off the site, like the editor's Unpublish. The old `ai-1` was retired this way on 2026-10-28; its source is in `content/retired/`. Storage allows about one update a second to `content/catalog.json`, so unpublishing many at once can hit 429 "rate limit for object mutation": run the ones that failed again, a few at a time.
- **Do this before deploying a Hosting build without built-in courses** (since 2026-10-27): until the public catalog lists the units, learners see "No courses yet".
- Without a key: sign in on the live site as a platform admin, **Lesson editor → Import JSON** with a file from `content/units/`, upload each lesson's kit files (in `content/kits/`) in the lesson's **Classroom kit** and its videos (in `content/media/`), then **Publish**.

### Check it works

- As a platform admin, open **Lesson editor**, create a unit, fill in a lesson with one question, **Save draft**, then **Publish**. The checks panel must say "No errors" first.
- In a private window, without signing in: **Continue without an account**. The new unit is on Home, its lesson plays, and DevTools → Network shows no `firebase-*` file.
- As an org admin: publish a unit. A student of that organization sees it; an independent learner doesn't.
- Publish again: Storage holds `v2.json` and `v1.json`, and the catalog points at `v2`. **Unpublish** removes it from Home.

## 8. Organization branding and analytics

TECHNICAL.md "Organization branding" and "Analytics" have the design.

### Deploy

Deploy the Firestore and Storage rules, the functions (`collect`, `statsJob` and `refreshStats` are new) and then Hosting:

```bash
npm run build --prefix functions
npx firebase deploy --only firestore,storage,functions
npx firebase deploy --only hosting
```

The order matters. Hosting's `/api/collect` rewrite points at the `collect` function, and the deploy refuses a rewrite to a function that doesn't exist yet. Cloud Scheduler is already on (`dailyNudges`), so `statsJob` gets its own job: `firebase-schedule-statsJob-europe-west1`, daily at 02:30 UTC.

### Connect Google Analytics (once)

1. Firebase console → **Project settings → Integrations → Google Analytics** must be linked (the web app's config has a `measurementId`, `G-…`).
2. In Google Analytics: **Admin → Data streams →** the web stream **→ Measurement Protocol API secrets → Create**. Copy the secret.
3. On darsiai.org as a platform admin: **Analytics → Google Analytics**. The measurement ID is filled in from the app's config; paste the secret, **Save**. Batches go to Google Analytics within 10 minutes.

Darsi's own counts work without this step. Without it, nothing leaves Firebase.

### After deploying the learning report and the new invite codes (2026-11)

```bash
npm run build --prefix functions
npm run migrate-invites       # invite codes move off the org documents, which every member can read
npm run resummarize           # every summary gains time, tracks and scores per competency
npm run demo-org              # optional: "Nile Valley Demo School" with made-up people; --remove deletes it
```

The demo script writes the demo admin's, a teacher's and a student's logins to `.demo-org.local.json` (gitignored).

### Check it works

- **Analytics → Refresh now:** the tiles show the accounts and organizations, and "counted" shows the time.
- On a phone, use the app, then switch to another app. In Firestore, `analytics/<today>` grows and `analyticsDevices` has the phone. In Google Analytics, **Reports → Realtime** shows the events within a minute or two (once connected).
- As an org admin: **Admin → Your organization's look:** change the name, add a logo, **Save**. A member who opens Darsi sees the logo at the top of every screen and the name in the tab; their certificates show both.

## 8b. Organization sites (custom web addresses)

TECHNICAL.md "Organization sites (custom web addresses)" has the design. An organization can have its own address, such as learn.school.edu.eg: the same Hosting site and build answer there, and the app shows that organization's name and logo, with or without Darsi's identity.

### Deploy (once)

```bash
npm run build --prefix functions
npx firebase deploy --only firestore:rules
npx firebase deploy --only functions:manageSite,functions:setOrgSite,functions:onOrgSite,functions:sitesJob
npx firebase deploy --only hosting
```

Then the voice relay (section 9, "The tutor"), so it lets in approved addresses outside darsiai.org by itself; its `TUTOR_ORIGINS` stays `https://darsiai.org,https://*.darsiai.org`. Storage's rules don't change (`content/` is already public). `sitesJob` runs every 15 minutes (live addresses are checked hourly). To run it at once: `gcloud scheduler jobs run firebase-schedule-sitesJob-europe-west1 --location=europe-west1 --project=darsi-f0685 --account=<owner-account>`. Nothing is needed in Cloudflare: there is no wildcard record.

### Add a site

1. **The organization asks:** its admin opens Admin → **Web address**, types an address under its own domain (`learn.school.edu`, not `school.edu` itself) and taps **Ask for this address**. The panel then shows two DNS records to pass to whoever manages that domain's DNS: the ownership record (`_darsi.<address>`, TXT, `darsi-site=<token>`) and a CNAME to `darsi-f0685.web.app`. They can be added while the request waits.
2. **A platform admin approves:** Web addresses (`/super/domains`; Platform says how many wait) → **Approve and connect**, with **Show Darsi's identity** on (the organization's name and logo with "with Darsi") or off (no Darsi name or mark in the app). **Refuse** takes an optional reason the organization sees. Approving claims nothing by itself: Darsi adds the address to Hosting once the ownership record is there, and allows signing in there only while the CNAME points at Darsi.
3. **It turns live by itself**, usually within a few hours of the records being in place: `sitesJob` checks every 15 minutes, and **Check now** checks at once. Until the certificate is out, the address answers with a certificate error. If either record goes later, signing in there stops at the next hourly check. Renaming the organization or changing its logo republishes `content/sites.json` by itself (`onOrgSite`).

**An address under darsiai.org** is only a platform admin's to add (Web addresses → **Add an address**); it needs no ownership record, but its card shows the CNAME to add in Cloudflare (darsiai.org → DNS → Add record: CNAME, the address's name, target `darsi-f0685.web.app`, proxy status **DNS only**, since Hosting issues the certificate itself). Names such as login, support or api are kept for Darsi.

**Remove the address** (on its card) disconnects it: Hosting (kept there 30 days), the sign-in domain and CORS; DNS is left alone. Anything that couldn't be undone is listed; `sitesJob` tries it again.

`node scripts/connect-site.mjs <host>` still does the steps by hand as a fallback; the app no longer needs it, and the next check takes sign-in away again from an address that shouldn't have it.

### Check it works

- `https://<address>` shows the organization's landing page: its logo and name, Sign in, Create an account and Continue without an account (with "with Darsi" when Darsi's identity shows). The browser tab says the organization's name.
- Sign in there (email and Google): the account screens show the organization's logo and name. A member of that organization sees its look throughout, and certificates name it.
- Without Darsi's identity: no "Darsi" in the app's own words (the licences page and course content keep it), and the app bar shows the logo, or the name's first letter without one.
- On the local stack: `http://localhost:4173/?site=<address>` stands in for the address (until the tab closes; `?site=` stops it), reading the emulator's `content/sites.json`.

## 9. Darsi Super

docs/SUPER.md has the plan; TECHNICAL.md "Darsi Super" has the design. Phase 0 (deployed 2026-11-02) adds the plans, credits, licences and the revenue path. Phase 1 adds the Paymob and Stripe checkouts and webhooks; it charges nobody until their keys are set.

### Deploy

```bash
npm run build --prefix functions
npx firebase deploy --only firestore:rules,functions
npx firebase deploy --only hosting
```

The rules add `subscriptions`, `credits` and `payments` (no client writes). Of the functions, `savePlans`, `grantSuper`, `grantCredits`, `setOrgLicence`, `setSeat`, `fillSeats`, `checkRevenueEvent`, `onSubscriptionWrite` and `onOrgLicence` are new; `setRole`, `joinOrg`, the platform functions and the stats changed. Nothing needs migrating: existing claims gain `plan` only when someone gets Super.

### Set up once

1. As a platform admin, open **Plans** (/super/plans).
2. Under **Costs and margin**, enter what one tutor credit costs at the AI provider (USD) and the EGP rate. Until phase 2 measures Gemini Live's real cost, use an estimate; it can be changed later.
3. Add the plans: for example a monthly and a yearly plan for one person, a seat for organizations, and a pack of extra credits. Each needs names in English and Arabic, a price in EGP and/or USD, and credits. Each price shows its margin; one under 60% can't be saved.
4. **Save and publish.** The Super screen (`/upgrade`) shows the plans at once, to guests too.
5. **Check the revenue event** sends a sample purchase to Google Analytics' validation server. It needs the Measurement Protocol API secret (§8).

### Check it works

- `/upgrade` in English and Arabic lists the plans in EGP (Arabic or Egypt's time zone) or USD.
- On a person's page (/super/people/:uid), **Give Super** for 30 days: their Me shows Super, the credits show on the page, and `/upgrade` offers them packs.
- On an organization's page, set a licence; on that organization's dashboard, **Give the free seats** gives seats to teachers, then students.
- Analytics: the Super tile counts the grants; revenue stays at zero until phase 1 brings real payments.

### Payments (phase 1)

**Every functions deploy from phase 1 on needs these four secrets to exist.** They were created as `unset` on 2026-11-03, and the live settings file `functions/.env.darsi-f0685` was written then; a machine without that file must recreate it (step 2 below). Until you have the accounts, set them to `unset` (the checkout then says payments open soon):

```bash
npx firebase functions:secrets:set PAYMOB_SECRET_KEY
npx firebase functions:secrets:set PAYMOB_HMAC_SECRET
npx firebase functions:secrets:set STRIPE_SECRET_KEY
npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

**Paymob (EGP).** Start with the test mode.
1. In Paymob's dashboard, find the secret key, the public key and the HMAC secret (account settings), and the integration ids (payment integrations: card, and wallet if you want it).
2. Set `PAYMOB_SECRET_KEY` and `PAYMOB_HMAC_SECRET` as above. Put the public key and the ids in `functions/.env.darsi-f0685` (gitignored; it also holds `PAYMOB_BASE`, `STRIPE_BASE` and `SITE_URL`, which a non-interactive deploy needs even though they have defaults):
   ```
   PAYMOB_PUBLIC_KEY=egy_pk_test_…
   PAYMOB_INTEGRATIONS=1234567,7654321
   ```
3. For each integration, set the **Transaction processed callback** to `https://europe-west1-darsi-f0685.cloudfunctions.net/paymobWebhook`. Darsi also sends it with each payment, but Paymob honours that only for cards.

**Stripe (USD).** Start with the test mode.
1. **Developers → API keys:** the secret key goes in `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint:** `https://europe-west1-darsi-f0685.cloudfunctions.net/stripeWebhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `customer.subscription.updated` (a renewal cancelled or restored, here or in Stripe) and `customer.subscription.deleted`. Its signing secret goes in `STRIPE_WEBHOOK_SECRET`.

Then deploy the rules and functions (`npx firebase deploy --only firestore:rules,functions`) and Hosting.

**Check it works (test mode):** buy the monthly plan in EGP with Paymob's test card, and in USD with Stripe's (`4242 4242 4242 4242`). Each should bring you back to the Super screen with Super active, add a row to `payments`, raise today's revenue on Analytics, and show a `purchase` in Google Analytics' realtime view. A refund from either dashboard marks the payment refunded. Switch to the live keys only after that.

### The tutor (phase 2)

**Where it runs:** Vertex AI in darsi-f0685, as the project's default compute service account (it has Editor, which includes `aiplatform.endpoints.predict`). The Vertex AI API is on. Vertex bills the project's Cloud billing account, so **GCP credits pay for the tutor only if darsi-f0685 is linked to the billing account that holds them** (Billing → Account management → change billing for the project).

**The `GEMINI_API_KEY` secret** must exist for every functions deploy (`tutorAsk` and `checkCapstone` declare it, and the voice relay is deployed with it), but since 2026-11-03 it holds a **dead key**: the "Darsi tutor (Gemini)" API key was deleted then, because the tutor uses Vertex AI. So `config/tutor.backend = "gemini"` (the Gemini API, billed from AI Studio's prepaid balance) fails until a new key is made and stored:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY
```

**Never delete the API key "Browser key (auto created by Firebase)"** while cleaning up keys: it is the web app's `VITE_FIREBASE_API_KEY`, and without it nobody can sign in.

**The voice relay** runs on Cloud Run beside the functions, with the same code:

```bash
npm run build --prefix functions
gcloud run deploy darsi-tutor --source functions --region europe-west1 --project darsi-f0685 --account=<owner-account> --set-build-env-vars GOOGLE_ENTRYPOINT="node lib/relay.js" --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest --set-env-vars "^;^TUTOR_ORIGINS=https://darsiai.org,https://*.darsiai.org;GOOGLE_CLOUD_PROJECT=darsi-f0685;RELAY_MAX_SOCKETS=30;RELAY_MAX_PENDING_PER_IP=15" --allow-unauthenticated --timeout 900 --session-affinity --max-instances 3 --concurrency 40
```

The relay's own limits go with the service's:

| Variable | Default | Meaning |
|---|---|---|
| `RELAY_MAX_SOCKETS` | 300 | Phones one instance holds. Past it, a new socket is told `busy` ("The tutor is busy right now. Try again in a minute.") |
| `RELAY_MAX_PENDING_PER_IP` | 40 | Sockets from one public address that have not finished signing in. Once signed in they no longer count, so a class behind one address can talk; from then on the limit is one voice call per account |

- **Keep `RELAY_MAX_SOCKETS` about 10 under `--concurrency`.** Cloud Run counts every open WebSocket, and every `/warm` and `/health` request, as one concurrent request. With the relay's limit above it, Cloud Run refuses the extra phones itself and they see a failed connection, not "busy". With `--concurrency 40` that is 30.
- **Keep `RELAY_MAX_PENDING_PER_IP` at half of `RELAY_MAX_SOCKETS` or less** (15 here). It is the only thing that stops one address from filling an instance with sockets that never sign in.
- `--max-instances` and `--concurrency` are the owner's to size: at most `max-instances × RELAY_MAX_SOCKETS` learners talk at once, and nobody has load-tested an instance yet. Raise `--concurrency` in steps (40 → 80 → 160) while watching CPU and memory, and move the two variables with it. `--timeout 900` stays (a call lasts at most 14 minutes). `--min-instances 1` removes the first call's cold start and costs an idle instance.
- `GET /health` answers `{"ok": true, "sockets": n}` for a probe or an uptime check (`/healthz` is Cloud Run's own). On a stop (SIGTERM) the relay ends every call, settles its credits and exits within Cloud Run's 10 seconds.

`TUTOR_ORIGINS` lists the pages that may open the relay: exact origins, and `https://*.darsiai.org` for every organization site under darsiai.org (https only; `functions/src/origins.ts`). An organization address elsewhere (`learn.school.edu`) is added as its own `https://` entry. gcloud splits `--set-env-vars` on commas, hence the `^;^` (";" separates the variables instead). `functions/.gcloudignore` keeps the local test keys out of the upload. Put the address it prints, as a WebSocket, in `apps/web/.env.local` before building Hosting: `VITE_TUTOR_RELAY=wss://darsi-tutor-….run.app/live`. Without it the tutor offers typing only.

**The tutor agent** (`agent/`, Google ADK on Vertex AI Agent Runtime; TECHNICAL.md "Darsi Super"). It answers typed questions and makes explainers when `config/tutor.engine` is `"agent"`; the voice relay asks it for explainers too.

```bash
cd agent
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt pytest==8.4.2
.venv/Scripts/python -m pytest tests                      # no Google calls
.venv/Scripts/python deploy.py                            # first time: prints projects/…/reasoningEngines/<id>
.venv/Scripts/python deploy.py --update <id>              # later versions, same id and sessions
```

- `deploy.py` uses the staging bucket `gs://darsi-f0685-agent` (europe-west1) and runs the agent as the compute service account, so it needs no new IAM grant. That account also signs the agent's course searches.
- **Turning it on** (after the functions with `tutorSearch` are deployed): set `config/tutor` to `{engine: "agent", agentId: "<id>", agentLocation: "europe-west1", agentAccount: "836458657044-compute@developer.gserviceaccount.com"}`. `engine: "direct"` turns it off at once, with no deploy.
- **The explainer checker** (`functions/vendor/lessonstudio-spec.js`) comes from Lesson Studio. After changing Lesson Studio's spec, run `node scripts/darsi/vendor-spec.mjs` there, then rebuild and redeploy the functions and the relay.
- **Eval through the agent:** `node scripts/tutor-eval.mjs --engine agent --agent <id>`.

**Before launch:** run the eval (`node scripts/tutor-eval.mjs`, on Vertex with your application-default login, about $0.15) and check it passes; then talk to the tutor for a few minutes on a phone and compare `tutorUsage` with the Gemini bill, to confirm the cost per credit on /super/plans.

### Capstones: GitHub token and limits

**Every functions deploy from 2026-11-06 on needs the `GITHUB_TOKEN` secret to exist** (`checkCapstone` reads it; TECHNICAL.md "Capstones"). Create a fine-grained personal access token on GitHub with **Repository access: Public repositories (read-only)** and no other permission, then:

```bash
npx firebase functions:secrets:set GITHUB_TOKEN
```

With the token GitHub allows 5,000 requests an hour; set it to `unset` to run without one (60 an hour, shared by every function instance behind one address). Either way, a check GitHub doesn't answer is shown as "not checked", never as the learner's failure. For the emulators, `functions/.secret.local` holds `GITHUB_TOKEN=unset`.

**Limits:** `config/capstone` (defaults: `ai` true, `perDay` 5 AI reviews per learner, `maxPerDay` 300 for the whole platform, `callsPerDay` 20 sends per learner) is changed on **Plans** (/super/plans) under "AI reviews of capstone milestones", which calls `saveCapstoneConfig`. The day's use is in `analytics/{day}.capstone` and shows there. The AI review uses the tutor's text model (`config/tutor`, Vertex AI by default), so it needs no key of its own.

**Check it works:** as a student without a school, send milestone 1 of a live capstone (for example `ai-capstone`) with a public repository made from its starter repository (`STARTER_ORG` in `apps/web/src/content/capstone.ts`). The card shows the checks and the AI review, the project waits on /super/projects, and every platform admin gets a staff alert (when notifications are on).

## 10. School sign-in

TECHNICAL.md "School sign-in" has the design: an organization signs its people in with its own provider (Google Workspace, Microsoft Entra ID, Okta, Keycloak or any OpenID Connect provider). It stays closed until the steps below are done, and nothing here was tried on the live project yet: run each command, read its answer, and note what differs.

Every `gcloud` command takes `--project darsi-f0685 --account=<owner-account>` (left out below).

### Set up once

1. **The key ring: the secret `SSO_KEYS`.** JSON with the current key's name and every key, each exactly 32 random bytes in base64: `{"current":"k1","keys":{"k1":"…"}}`. Make it and store it in one line, so the key is never printed or left in a file:
   ```bash
   node -e "process.stdout.write(JSON.stringify({current:'k1',keys:{k1:require('crypto').randomBytes(32).toString('base64')}}))" | npx firebase functions:secrets:set SSO_KEYS --data-file - --project darsi-f0685
   ```
   - The value signs sign-in states and seals every school's client secret. Losing it means every school types its secret again; leaking it means rotating (docs/OPERATIONS.md "School sign-in").
   - `unset` is a valid value: any text that isn't such a key ring keeps school sign-in closed (`sso-key`), and the functions still deploy.
   - Keep a copy of the value outside the project (the backup section of docs/OPERATIONS.md), read with `gcloud secrets versions access latest --secret=SSO_KEYS` on a screen nobody else sees.
2. **The service account `darsi-sso`.** The four sign-in functions (`ssoEdge`, `ssoCallback`, `manageSso`, `ssoJob`) run as it, and nothing else does: it alone reads the key ring and signs sign-in tokens.
   ```bash
   gcloud iam service-accounts create darsi-sso --display-name "Darsi school sign-in"
   SA=darsi-sso@darsi-f0685.iam.gserviceaccount.com
   # Signing Firebase custom tokens: Token Creator on itself, and the API that does the signing.
   gcloud services enable iamcredentials.googleapis.com
   gcloud iam service-accounts add-iam-policy-binding $SA --member "serviceAccount:$SA" --role roles/iam.serviceAccountTokenCreator
   # The key ring, and only this secret.
   gcloud secrets add-iam-policy-binding SSO_KEYS --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
   # What the functions read and write: Firestore, Auth accounts and claims, the public files in the bucket, logs.
   gcloud projects add-iam-policy-binding darsi-f0685 --member "serviceAccount:$SA" --role roles/datastore.user
   gcloud projects add-iam-policy-binding darsi-f0685 --member "serviceAccount:$SA" --role roles/firebaseauth.admin
   gcloud storage buckets add-iam-policy-binding gs://darsi-f0685 --member "serviceAccount:$SA" --role roles/storage.objectAdmin
   gcloud projects add-iam-policy-binding darsi-f0685 --member "serviceAccount:$SA" --role roles/logging.logWriter
   # Staff alerts by push (ssoJob: a client secret about to expire, endpoints that moved, a full school).
   gcloud projects add-iam-policy-binding darsi-f0685 --member "serviceAccount:$SA" --role roles/firebasecloudmessaging.admin
   ```
   - These are grants of access, so they are the owner's to run. The code needs exactly these abilities: Firestore reads and writes, creating and updating Auth accounts and their claims, revoking sessions, signing custom tokens, sending push messages, and writing `content/sso.json`, `content/sites.json` and `content/settings.json`. If a function logs a permission error after the first deploy, the role it names is the one missing.
   - **The last grant is easy to miss, because nothing says when it is missing:** `ssoJob` sends its three staff alerts (`ssoSecretExpiring` and `ssoEndpointsMoved` to the organization's admins, `ssoFull` to platform admins; wording in `functions/src/messages.ts`) as this account, and an alert that could not be sent is dropped without a log line. The problem still shows on the organization's status card. The role name is from Google's documentation and was not tried on this project; after the first deploy, check that an admin with staff alerts on gets one.
   - The account that deploys must be allowed to deploy functions that run as it (an owner is; otherwise `roles/iam.serviceAccountUser` on `darsi-sso`).
   - After the deploy, a platform admin sees on an organization's page (`/super/orgs/<id>?tab=signin`) whether the key ring reads and the signer works (`sso-key`, `sso-signer` otherwise).
3. **The functions' settings**, in `functions/.env.darsi-f0685` (gitignored; `functions/.env.example` has the same lines):
   ```
   SSO_CALLBACK=https://login.darsiai.org/callback
   SSO_SERVICE_ACCOUNT=darsi-sso@darsi-f0685.iam.gserviceaccount.com
   SSO_CALLBACK_MIN_INSTANCES=0
   ```
   - `SSO_CALLBACK` is the base of the redirect address; each organization registers `<SSO_CALLBACK>/<its organization id>`.
   - `SSO_SERVICE_ACCOUNT` empty means the project's default account (what the emulators use). Live, set it.
   - `SSO_CALLBACK_MIN_INSTANCES` keeps that many callback instances warm for a school day's first sign-ins. 0 costs nothing while nobody signs in; 1 costs an idle instance.
   - A release that can't ask questions stops when any of the three has no value, defaults or not.
4. **The Hosting site `darsi-login` and `login.darsiai.org`.** The callback is served from its own site, with no app and no service worker; its only rule sends every path to `ssoCallback`.
   ```bash
   npx firebase hosting:sites:create darsi-login --project darsi-f0685
   ```
   - `.firebaserc` already maps the deploy targets: `app` → `darsi-f0685`, `login` → `darsi-login`. (`npx firebase target:apply hosting login darsi-login` writes the same.) `npm run deploy` refuses a Hosting release when either is unmapped.
   - Firebase console → Hosting → `darsi-login` → **Add custom domain** → `login.darsiai.org`. It shows the record to add.
   - Cloudflare → darsiai.org → DNS → Add record: the CNAME the console names (`login` → `darsi-login.web.app`), proxy status **DNS only**, since Hosting issues the certificate itself. Until the certificate is out, the address answers with a certificate error.
   - `login` and `sso` are kept names: no organization can take `login.darsiai.org` as its web address.
5. **Deploy**: indexes first (the TTL policies on `ssoUsed.expireAt` and `ssoTests.expireAt`, and two `ssoIdentities` indexes), then the functions, Hosting (both sites) and the rules: `npm run deploy -- functions hosting firestore storage --yes`. Firestore's TTL deletes a spent state or an old test link within about a day of its time; nothing depends on it being prompt.
6. **The switch** is on by default (`config/settings.ssoOn`). A platform admin turns school sign-in off for everyone on **Plans → Switches**: every start is then refused (`sso-off`) and every school button hidden, within a minute.

### What a school does

In Darsi, its admin opens **Admin → Sign-in & web address** and follows the five steps: provider, connect, who can sign in, test, turn on. At its provider it registers Darsi as a web application:

- **Redirect address:** exactly `https://login.darsiai.org/callback/<the organization's id>`, as the wizard shows it with Copy. One address, no wildcard.
- **A client ID and a client secret** (Darsi is a confidential client; the secret is typed once into the wizard and never shown again). Where the provider's secrets expire (Microsoft's do), the admin types the date, and the status card shows a warning from 30 days before and again from 7; the organization's admins who have staff alerts on also get a push at each (step 2's last grant).
- **Scopes:** `openid email profile` (and `groups` when a teacher rule reads it).
- **Google Workspace:** an OAuth client of type "Web application" in an Internal app; allowed email domains are required. **Microsoft Entra ID:** a single-tenant app, the Web platform, the secret's *Value*, the optional claim `email`, and app roles for teachers. **Okta, Keycloak, others:** an OpenID Connect web app; the wizard reads the provider's discovery document from Darsi's servers, so the issuer must be reachable from the internet over https.
- The provider must answer Darsi's servers (Google Cloud, europe-west1) at a public address: internal names and private addresses are refused.

A platform admin can also do the setup for an organization on its page (`/super/orgs/<id>`), approves requests to be listed in the school finder (**Web addresses → School sign-in**), and can set the most members school sign-in may bring an organization to (by default its licence seats × 1.5, or 2,000).

### Check it works

- On the local stack (`npm run local`): Admin → Sign-in & web address → **Another provider**, issuer `http://127.0.0.1:4797`, client `darsi-local`, secret `local-secret`; Check connection, Test with my account, Turn on. Then sign out and use the school's button on the sign-in page: a new person arrives as a student.
- `npm run e2e:signed -w @darsi/web` runs the same end to end (below).
- Live, with a test organization and a test tenant: the wizard's test shows which claims arrived and what the sign-in would do, before anything is turned on. After Turn on, `https://darsiai.org/signin?school=<slug>` shows the school's button; a first sign-in makes a student; the status card counts them.

## Tests that need the emulators

Both need **JDK 21 or newer** (firebase-tools 15 refuses older Java), on PATH or in the usual install folders; on this machine also `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Public` (below). Neither touches the live project or the usual emulator ports, so both can run beside `npm run local`.

- **Rules tests:** `npm run test:rules -w @darsi/web` (or `npm run verify -- --rules`). `firebase.rules-test.json` starts Firestore (8188) and Storage (9198) for project `demo-darsi-rules` and runs `apps/web/tests-rules/*.rules.test.ts` (four files: `security`, `access`, `tenancy`, `sso`; for the count, see the latest run). `npm run deploy` runs them by itself whenever rules go out; `--skip-rules-tests` is for a machine with no JDK 21, and belongs in the release notes.
- **The signed-in browser suite:** `npm run e2e:signed -w @darsi/web` (`scripts/e2e-signed.mjs`; `npm run verify -- --signed` runs the same as one more step). It builds the functions, starts the Emulator Suite on private ports (project `demo-darsi-e2e`: Auth 9199, Firestore 8185, Functions 5101, Storage 9299, hub 4499, logging 4599, Eventarc 9399, Tasks 9599; the app on 4181, the stand-in school provider on 4796), seeds a platform admin and two organizations, builds and serves the app, runs `apps/web/e2e/signed/*.signed.ts` (12 tests) and stops everything it started. A taken port stops the run before it starts.
  - `node scripts/e2e-signed.mjs --no-build` reuses the last app build; `--keep` leaves it up after the tests (Ctrl+C stops it, or a file named `stop` in the run folder); `--no-tests` only starts and seeds; anything after `--` goes to Playwright (`-- -g "school"`).
  - Its run folder is `.emulator-tmp/e2e-signed/` (gitignored; `E2E_RUN_DIR` and `E2E_BUILD_DIR` move it and the build). It is inside the checkout on purpose: the functions emulator joins the functions' folder to the config's, so the config must sit on the same drive, and the CLI refuses relative rules paths that leave the folder.
  - What it seeds, through the Admin SDK with claims and profiles in agreement: a platform admin and two organizations (`e2eNile`, `e2eDelta`), each with an admin, a teacher, two students and invite codes, all on one public test password. The stand-in provider's people each play one part (an admin's test and then a removed person; a new person twice; one connected from Me). The tour, which opens by itself for a new account, is closed by a locator handler. Console errors that mention permissions are printed with their test (`[rules] …`); the only one in a passing run is the expected refusal of the second organization's admin on the first's person page. The functions' settings for the run are written there, so `functions/.env.local` is not read. It adds a fresh `SSO_KEYS` to `functions/.secret.local` for the run and puts the file back as it was, also after a run that was killed.
  - It needs Chromium (`CHROMIUM_PATH`, or `npx playwright install chromium`).
  - The app's build knows only the Firestore port; the tests move its Auth, Functions and Storage requests from the usual ports (9099, 5001, 9199) to the run's own in the browser, and block service workers so nothing escapes that.
  - **Screenshots** (`apps/web/e2e/signed/shots.signed.ts`) are not part of the run: the file is skipped unless `SHOTS=1`. For a visual pass over the staff tabs and school sign-in, keep a stack up with `node scripts/e2e-signed.mjs --keep --no-tests`, then in `apps/web`: `SHOTS=1 SHOTS_DIR=<folder> E2E_SIGNED_STATE=../../.emulator-tmp/e2e-signed/state.json npx playwright test -c playwright.signed.config.ts shots`. It writes full-page PNGs (`<name>-<lang>-<width>.png`: English at 1280 px, Arabic at 375 px, the wizard also in Arabic at 1280 px) to `SHOTS_DIR` (default `apps/web/test-results/shots`), in an organization it makes for itself.
- The plain browser suite (`npm run e2e`) needs no emulators: it builds in mode `e2e` from the committed `apps/web/.env.e2e` (demo values) into `apps/web/dist-e2e`. Its WebKit tests need `npx playwright install webkit`; without it they are skipped, except on CI.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request, with no secrets, and deploys nothing:

| Job | Runs |
|---|---|
| `verify` | `npm run verify`: type-checks (the app, the design system, and the functions' tests, the e2e suite, the rules tests and the tool configs, which fail the run like the rest), the functions' build, all unit tests, the CSS rules, contrast |
| `bundle` | a build into a scratch folder (`DARSI_LOCAL_BUILD=1`, so it needs no project settings), then `node scripts/check-bundle.mjs`: the startup files and size against `scripts/bundle-budget.json`, no Firebase chunk at startup, nothing on-demand in the precache |
| `rules` | the rules tests on the emulators (it installs a JDK) |
| `audit` | `npm audit --omit=dev --audit-level=high` for the app and the functions; it reports and never blocks |
| `e2e` | the browser suite (`npx playwright install --with-deps chromium webkit`, then `npm run e2e`), keeping the traces of failed tests; skipped when `apps/web/.env.e2e` is not committed |
| `e2e-signed` | the signed-in suite (`node scripts/e2e-signed.mjs`: JDK 21, the emulators, the stand-in school provider, its own build), keeping the traces of failed tests. **Allowed to fail for now** (`continue-on-error`): it has only run on a maintainer's machine, never on a runner. Take that line out of the workflow once it has passed there a few times in a row |

To make it a gate, protect `main` on GitHub with the `verify` check required (the owner's setting). Until `e2e-signed` blocks, run the signed-in suite yourself before a release that touches sign-in, roles or the staff screens.

## Local development with the emulators

**Everything at once, to test: `npm run local -- you@gmail.com`** (`scripts/local.mjs`). It starts the emulators (data kept in `.emulator-data/`, saved on Ctrl+C), publishes the courses on the first run, and serves the app as it ships, with its service worker, on http://localhost:4173, so it also works offline once loaded. "Continue with Google" opens the emulator's account picker: pick the address you gave, which is a platform admin with a year of Darsi Super. It adds sample plans (/super/plans), the tutor's voice relay (ws://localhost:8091), and a stand-in for Paymob and Stripe on port 4799 (`scripts/local/payments.mjs`) whose Pay button sends the emulator's webhooks a properly signed callback, so a purchase runs end to end with no money. A stand-in school provider runs on http://127.0.0.1:4797 (`scripts/local/oidc.mjs`: issuer that address, client `darsi-local`, secret `local-secret`), with a key ring made once for this computer in `functions/.secret.local`, so school sign-in can be set up and used from the wizard (§10). The tutor answers for real through Vertex AI in darsi-f0685 (`config/tutor` in the emulator; set `engine` to `"agent"` there to try the agent), with your gcloud application-default login, billed to that project's billing account. When another program holds port 8080 (Laragon's nginx), Firestore moves to 8085 (`firebase.local.json`, gitignored). `--no-build` reuses the last build, `--fresh` starts from empty emulators. The emulator's own settings are `functions/.env.local` and `.secret.local` (test values only; created on the first run). A browser that ran an older local build shows the update toast once.

To run the pieces yourself instead: the Emulator Suite needs **JDK 21+**; firebase-tools 15 refuses older Java. Install a JDK 21 (a portable Temurin 21 JRE zip works: point `JAVA_HOME` and `PATH` at it for the one shell), then:

```bash
npm run build --prefix functions
npx firebase emulators:start --project demo-darsi --only auth,firestore,functions,storage
npm run dev                          # the web app talks to the emulators (.env.development)
```

- **Port 8080 taken** (Laragon's nginx on this machine): start the emulators with `--config firebase.local.json` (which `npm run local` writes, with Firestore on 8085), and put `VITE_FIRESTORE_EMULATOR_PORT=8085` in `apps/web/.env.development.local` (gitignored) so `npm run dev` finds Firestore there.

- **"Firestore Emulator has exited with code: 1"** and `Unable to establish loopback connection` in `firestore-debug.log`: Java 16+ opens its loopback pipe through a Unix-domain socket in the temp folder, which fails on this machine (a user folder with spaces). Point it at a short folder with no spaces:
  ```bash
  JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:\Users\Public" npx firebase emulators:start --project demo-darsi --only auth,firestore,functions,storage
  ```
- `npm run superadmin -- you@example.com --emulator` gives a local account the platform-admin role.
- `npm run seed -- --emulator` publishes the starting courses to the emulators (the app ships none, so Home is empty until then).

`.claude/launch.json` has the same `web` and `emulators` entries for Claude Code's preview.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Web app | Hosting | Precaches the learner app shell (about 1.3 MB, 418 KB gzipped, on 2026-11-07), plus the fonts for the teacher's language. The Firebase SDK loads only for signed-in people; staff screens and exceljs load only when used. |
| Data | Firestore | Rules in `firebase/firestore.rules` (tests: `npm run test:rules -w @darsi/web`). Learner progress syncs with one read per sign-in; the only live listener is a signed-in person's own profile (claims refresh). |
| Files | Storage | Project evidence (≤ 10 MB, images/PDF/mp4/audio). Media and kits are public read. Published units: `content/` is public, `orgs/{orgId}/` is for that org's members; the editor uploads videos (≤ 60 MB), captions and kit files there. Readable by browsers once the bucket CORS is applied (§7). |
| Course editor | Cloud Functions | `publishUnit`, `unpublishUnit` and `deleteUnit` write what learners read; drafts are in Firestore `units` and `unitDrafts`. |
| Roles, orgs, accounts | Cloud Functions | `europe-west1`, max 20 instances. Every role change is written to `audit`, with the caller's address and a request id. Staff rights in the rules need the claims and the profile to agree (`node scripts/check-claims.mjs`). |
| School sign-in | Cloud Functions + a second Hosting site | `ssoEdge` behind `/api/sso/**` on the app's site, `ssoCallback` at login.darsiai.org (site `darsi-login`), `manageSso`, `ssoJob`; all four as `darsi-sso`, with the secret `SSO_KEYS` (§10). |
| Scheduled jobs | Cloud Scheduler | `dailyNudges` (hourly), `statsJob` (02:30 UTC), `ssoJob` (02:30), `retentionJob` (03:10), `sitesJob` (every 15 minutes). Each leaves its last run in Firestore `stats/jobs` (docs/OPERATIONS.md §5). |
| Voice tutor | Cloud Run `darsi-tutor` | The relay (§9); `GET /health`; its limits are `RELAY_MAX_SOCKETS` and `RELAY_MAX_PENDING_PER_IP`. |
| Notifications | Cloud Functions + FCM | Device tokens in `users/{uid}/devices`; `dailyNudges` runs hourly on Cloud Scheduler; announcements are logged in `broadcasts`. The service worker's push handlers are `apps/web/public/push-sw.js`. |
