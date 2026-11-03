# Firebase: setup, deploy and local development

Darsi runs on the Firebase project **`darsi-f0685`** in region **`europe-west1`**:
- Hosting (the PWA);
- Authentication (email/password, Google, and username logins mapped to `<username>@users.darsi.app`);
- Cloud Firestore and Cloud Storage;
- Cloud Functions (2nd gen, Node 22), with Cloud Scheduler for the hourly reminder run;
- Cloud Messaging (web push; see [6. Push notifications](#6-push-notifications)).

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
- `apps/web/.env.development` points `npm run dev` at the Emulator Suite (project `demo-darsi`), so day-to-day development never touches live data.

## 3. Build and deploy

```bash
npx -y npm@11.13.0 install          # workspace deps (also builds the design system)
npm ci --prefix functions           # Cloud Functions deps (separate lockfile)
npx firebase login                  # once per machine
npx firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

`firebase.json` runs the builds for you: Hosting's predeploy runs `npm run build` (design system + web), and Functions' predeploy runs `npm run build` in `functions/`.

On the **first** functions deploy:
- the CLI asks to enable Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc and Cloud Scheduler (for `dailyNudges`); say yes;
- if `onProgressWrite` or another Firestore trigger fails with an Eventarc permission error, wait a few minutes and deploy again: Google needs time to provision the service agent.

Firestore builds the composite indexes in `firebase/firestore.indexes.json` after deploy. The console shows "Building", and admin lists stay empty until the build finishes.

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
- As an independent learner: finish lesson 1. In Firestore, `users/{uid}/progress/ai-1-1-1` appears and `users/{uid}.summary` updates within seconds (that is the trigger).
- Request an organization from `/org?request=1`, approve it at `/super`, then join it with an invite code from a second account.
- In an org admin account: add two people, download the credentials, print the login slips.
- On a cheap Android phone: install the PWA, go offline, and confirm a downloaded unit still opens.
- Notifications: see the checks at the end of [6. Push notifications](#6-push-notifications).
- Course editor: see the checks at the end of [7. Course editor](#7-course-editor).

## 6. Push notifications

Darsi sends web push through Firebase Cloud Messaging (FCM):
- **learning reminders**: opt-in, at most one a day, at the hour the person picks;
- **project feedback** for learners and **staff alerts** (a project to review, a new organization request);
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
   gcloud storage buckets update gs://darsi-f0685 --cors-file=firebase/storage.cors.json --account=sherifalaafawzy@gmail.com
   gcloud storage buckets describe gs://darsi-f0685 --format="default(cors_config)" --account=sherifalaafawzy@gmail.com
   ```
   - The list holds the Hosting domains, the local dev and preview ports, and the Capacitor origins. Add a custom domain there when you get one.
   - Uploads from the editor don't need it; reading does. Without it, Home simply doesn't show published units.

### Publish the starting courses

The app ships no courses: every course comes from the editor. The starting ones (AI basics `ai-1-1`, Passwords and phishing `cyber-1-1` and Sensors `iot-1-2`, with their kits and media) are files in `content/` at the repo root, published once with:

```bash
npm run build --prefix functions
npm run seed
```

- It uses the same credentials as `npm run superadmin` (§4): a service-account key in `GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth application-default login` with your personal account.
- It uploads the kit and media files to `content/media/<unit>/`, saves each unit as a platform draft and publishes it through the editor's own publish code. Unit and lesson ids stay the same, so learners keep their progress, notes and certificates.
- A unit that already has a draft is left alone (it may hold edits made in the editor); `--replace` overwrites it. `npm run seed -- --emulator` does the same against the emulators.
- `npm run seed -- --unpublish <id>` takes a unit off the site, like the editor's Unpublish. The old `ai-1` was retired this way on 2026-10-28; its source is in `content/retired/`.
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
2. **Developers → Webhooks → Add endpoint:** `https://europe-west1-darsi-f0685.cloudfunctions.net/stripeWebhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded` and `customer.subscription.deleted`. Its signing secret goes in `STRIPE_WEBHOOK_SECRET`.

Then deploy the rules and functions (`npx firebase deploy --only firestore:rules,functions`) and Hosting.

**Check it works (test mode):** buy the monthly plan in EGP with Paymob's test card, and in USD with Stripe's (`4242 4242 4242 4242`). Each should bring you back to the Super screen with Super active, add a row to `payments`, raise today's revenue on Analytics, and show a `purchase` in Google Analytics' realtime view. A refund from either dashboard marks the payment refunded. Switch to the live keys only after that.

### The tutor (phase 2)

**Where it runs:** Vertex AI in darsi-f0685, as the project's default compute service account (it has Editor, which includes `aiplatform.endpoints.predict`). The Vertex AI API is on. Vertex bills the project's Cloud billing account, so **GCP credits pay for the tutor only if darsi-f0685 is linked to the billing account that holds them** (Billing → Account management → change billing for the project).

**The Gemini API key** (`GEMINI_API_KEY`, "Darsi tutor (Gemini)", restricted to the Generative Language API) exists only as a fallback (`config/tutor.backend = "gemini"`), billed from AI Studio's prepaid balance, which is empty. Every functions deploy still needs the secret to exist:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY
```

**The voice relay** runs on Cloud Run beside the functions, with the same code:

```bash
npm run build --prefix functions
gcloud run deploy darsi-tutor --source functions --region europe-west1 --project darsi-f0685 --account=sherifalaafawzy@gmail.com --set-build-env-vars GOOGLE_ENTRYPOINT="node lib/relay.js" --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest --set-env-vars TUTOR_ORIGINS=https://darsiai.org,GOOGLE_CLOUD_PROJECT=darsi-f0685 --allow-unauthenticated --timeout 900 --session-affinity --max-instances 3 --concurrency 40
```

`functions/.gcloudignore` keeps the local test keys out of the upload. Put the address it prints, as a WebSocket, in `apps/web/.env.local` before building Hosting: `VITE_TUTOR_RELAY=wss://darsi-tutor-….run.app/live`. Without it the tutor offers typing only.

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

## Local development with the emulators

**Everything at once, to test: `npm run local -- you@gmail.com`** (`scripts/local.mjs`). It starts the emulators (data kept in `.emulator-data/`, saved on Ctrl+C), publishes the courses on the first run, and serves the app as it ships, with its service worker, on http://localhost:4173, so it also works offline once loaded. "Continue with Google" opens the emulator's account picker: pick the address you gave, which is a platform admin with a year of Darsi Super. It adds sample plans (/super/plans), the tutor's voice relay (ws://localhost:8091), and a stand-in for Paymob and Stripe on port 4799 (`scripts/local/payments.mjs`) whose Pay button sends the emulator's webhooks a properly signed callback, so a purchase runs end to end with no money. The tutor answers for real through Vertex AI in darsi-f0685 (`config/tutor` in the emulator; set `engine` to `"agent"` there to try the agent), with your gcloud application-default login, billed to that project's billing account. When another program holds port 8080 (Laragon's nginx), Firestore moves to 8085 (`firebase.local.json`, gitignored). `--no-build` reuses the last build, `--fresh` starts from empty emulators. The emulator's own settings are `functions/.env.local` and `.secret.local` (test values only; created on the first run). A browser that ran an older local build shows the update toast once.

To run the pieces yourself instead: the Emulator Suite needs **JDK 21+**; firebase-tools 15 refuses older Java. Install a JDK 21 (a portable Temurin 21 JRE zip works: point `JAVA_HOME` and `PATH` at it for the one shell), then:

```bash
npm run build --prefix functions
npx firebase emulators:start --project demo-darsi --only auth,firestore,functions,storage
npm run dev                          # the web app talks to the emulators (.env.development)
```

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
| Web app | Hosting | Precaches the learner app shell (~640 KB), plus the fonts for the teacher's language. The Firebase SDK loads only for signed-in people; staff screens and exceljs load only when used. |
| Data | Firestore | Rules in `firebase/firestore.rules`. Learner progress syncs with one read per sign-in, with no live listeners. |
| Files | Storage | Project evidence (≤ 10 MB, images/PDF/mp4/audio). Media and kits are public read. Published units: `content/` is public, `orgs/{orgId}/` is for that org's members; the editor uploads videos (≤ 60 MB), captions and kit files there. Readable by browsers once the bucket CORS is applied (§7). |
| Course editor | Cloud Functions | `publishUnit`, `unpublishUnit` and `deleteUnit` write what learners read; drafts are in Firestore `units` and `unitDrafts`. |
| Roles, orgs, accounts | Cloud Functions | `europe-west1`, max 20 instances. Every role change is written to `audit`. |
| Notifications | Cloud Functions + FCM | Device tokens in `users/{uid}/devices`; `dailyNudges` runs hourly on Cloud Scheduler; announcements are logged in `broadcasts`. The service worker's push handlers are `apps/web/public/push-sw.js`. |
