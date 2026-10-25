# Firebase: setup, deploy and local development

Darsi runs on the Firebase project **`darsi-f0685`** in region **`europe-west1`**:
- Hosting (the PWA);
- Authentication (email/password, Google, and username logins mapped to `<username>@users.darsi.app`);
- Cloud Firestore and Cloud Storage;
- Cloud Functions (2nd gen, Node 22).

## 1. One-time setup in the Firebase console

1. **Blaze (pay-as-you-go) plan.** Cloud Functions (2nd gen) and new Cloud Storage buckets (`*.firebasestorage.app`) need it. There is a free tier; set a **budget alert** (Google Cloud console → Billing → Budgets) so a mistake can't surprise you.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
   - Under *Settings → Authorized domains*, add your custom domain if you use one. `darsi-f0685.web.app` and `.firebaseapp.com` are there by default.
3. **Firestore Database → Create database** in production mode. Location: `europe-west1`, next to the functions, or `eur3` for multi-region. **The location can never be changed.**
4. **Storage → Get started.** The default bucket is `darsi-f0685.firebasestorage.app`.

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
- the CLI asks to enable Cloud Functions, Cloud Build, Artifact Registry, Cloud Run and Eventarc; say yes;
- if `onProgressWrite` (the Firestore trigger) fails with an Eventarc permission error, wait a few minutes and deploy again: Google needs time to provision the service agent.

Firestore builds the composite indexes in `firebase/firestore.indexes.json` after deploy. The console shows "Building", and admin lists stay empty until the build finishes.

## 4. Make yourself the platform admin

Roles live in Auth custom claims, which only the Admin SDK can set.

1. Open the deployed app and **sign up** with your own email.
2. Get credentials for the Admin SDK, either way:
   - **Service-account key:** Firebase console → Project settings → Service accounts → Generate new private key. Save it **outside the repo**, then
     `set GOOGLE_APPLICATION_CREDENTIALS=C:\keys\darsi-f0685.json` (PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\darsi-f0685.json"`).
   - **gcloud:** `gcloud auth application-default login` with an account that owns the project.
3. Run: `npm run superadmin -- you@example.com`. Use `--revoke` to undo and `--emulator` for the local Emulator Suite.

The app picks up the role by itself: it refreshes claims when `users/{uid}` changes. You land on `/super` to approve organizations. An approved organization's requester becomes its admin and gets teacher and student invite codes.

## 5. Check before going live

- Sign up, sign out, sign in again; reset a password from "Forgot password?".
- As an independent learner: finish lesson 1. In Firestore, `users/{uid}/progress/ai-1-1` appears and `users/{uid}.summary` updates within seconds (that is the trigger).
- Request an organization from `/org?request=1`, approve it at `/super`, then join it with an invite code from a second account.
- In an org admin account: add two people, download the credentials, print the login slips.
- On a cheap Android phone: install the PWA, go offline, and confirm a downloaded unit still opens.

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
| Web app | Hosting | Precaches the learner app shell (~1.5 MB). Staff screens and exceljs load only when used. |
| Data | Firestore | Rules in `firebase/firestore.rules`. Learner progress syncs with one read per sign-in, with no live listeners. |
| Files | Storage | Project evidence (≤ 10 MB, images/PDF/mp4/audio). Media and kits are public read. |
| Roles, orgs, accounts | Cloud Functions | `europe-west1`, max 20 instances. Every role change is written to `audit`. |
