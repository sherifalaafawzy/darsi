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
   - Under *Settings → Authorized domains*, add your custom domain if you use one. `darsi-f0685.web.app` and `.firebaseapp.com` are there by default.
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
- As an independent learner: finish lesson 1. In Firestore, `users/{uid}/progress/ai-1-1` appears and `users/{uid}.summary` updates within seconds (that is the trigger).
- Request an organization from `/org?request=1`, approve it at `/super`, then join it with an invite code from a second account.
- In an org admin account: add two people, download the credentials, print the login slips.
- On a cheap Android phone: install the PWA, go offline, and confirm a downloaded unit still opens.
- Notifications: see the checks at the end of [6. Push notifications](#6-push-notifications).

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
3. Choose the audience: everyone, one active organization, or one role (teachers, students or org admins). Choose the screen the notification opens: Learn, AI lab, Classroom kit or Organization.
4. Tap **Send** and confirm. The notice shows the result for each language. **Recent announcements** lists the last 20; each send is also stored in `broadcasts` and written to `audit`.

It reaches every device where the person has notifications on and **Announcements** switched on. A phone that is offline gets it when it reconnects, if that is within 24 hours. An announcement can't be recalled, so try it on a test organization first.

### Check it works

FCM isn't part of the Emulator Suite, and `npm run dev` runs without a service worker. Test against the real project with `npm run build` and `npm run preview` (http://localhost:4173 counts as a secure origin), or on the deployed site:
- Sign in, turn notifications on in Me, and allow the prompt. `users/{uid}/devices/…` and `users/{uid}.notify` appear in Firestore.
- Send an announcement to a test organization you belong to. It arrives in your language, and tapping it opens the chosen screen.
- Pick the next reminder time on the list (07:00, 12:00, 16:00, 18:00 or 20:00) and wait for it. One reminder arrives in that hour, and none if you finish a lesson first that day.
- Turn notifications off in Me. The device disappears from Firestore.

## Local development with the emulators

The Emulator Suite needs **JDK 21+**; firebase-tools 15 refuses older Java. Install a JDK 21, then:

```bash
npm run build --prefix functions
npx firebase emulators:start --project demo-darsi --only auth,firestore,functions,storage
npm run dev                          # the web app talks to the emulators (.env.development)
```

`.claude/launch.json` has the same `web` and `emulators` entries for Claude Code's preview.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Web app | Hosting | Precaches the learner app shell (~640 KB), plus the fonts for the teacher's language. The Firebase SDK loads only for signed-in people; staff screens and exceljs load only when used. |
| Data | Firestore | Rules in `firebase/firestore.rules`. Learner progress syncs with one read per sign-in, with no live listeners. |
| Files | Storage | Project evidence (≤ 10 MB, images/PDF/mp4/audio). Media and kits are public read. |
| Roles, orgs, accounts | Cloud Functions | `europe-west1`, max 20 instances. Every role change is written to `audit`. |
| Notifications | Cloud Functions + FCM | Device tokens in `users/{uid}/devices`; `dailyNudges` runs hourly on Cloud Scheduler; announcements are logged in `broadcasts`. The service worker's push handlers are `apps/web/public/push-sw.js`. |
