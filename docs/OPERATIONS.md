# Operating Darsi

How to check a change, release it, undo a release, switch things off in a hurry, and tell that the scheduled jobs still
run. Setting the project up for the first time is in `docs/FIREBASE.md`; how the system is built is in `TECHNICAL.md`.

Live project: `darsi-f0685` (europe-west1). Site: https://darsiai.org. In the `gcloud` commands, `<owner-account>` is
the Google account that owns the project (the personal one the Firebase CLI is logged in with, never a work account
that happens to be gcloud's active one); no address is written here.

## 1. Check a change: `npm run verify`

One command runs every check, in this order, and stops at the first that fails:

1. the design system's type-check;
2. the web app's type-check (`tsc --noEmit`; never `tsc -b`, which writes `.js` files beside the sources);
3. the functions' build (`functions/lib`, which also refreshes the shared copies in `functions/src/shared`);
4. the unit tests of the web app, the design system and the functions;
5. the CSS rules (`npm run lint:css`);
6. the design system's contrast check;
7. two more type-checks, for what the builds and the unit tests leave out: the functions' tests
   (`functions/tsconfig.test.json`), then the web app's e2e suite, rules tests and tool configs
   (`apps/web/tsconfig.tools.json`). They fail the run like every other step (they only reported until both were
   clean).

It ends with one line per step (`ok`, `FAILED`, or `not run` for what came after a failure). It needs `npm ci` and `npm ci --prefix functions`, and nothing else: no
`apps/web/.env.local`, no Java, no browser.

| Flag | Adds | Needs |
|---|---|---|
| `npm run verify -- --rules` | the Firestore and Storage rules tests, against the emulators | JDK 21 or newer, on PATH or in the usual install folders |
| `npm run verify -- --e2e` | the browser suite, desktop and phone (it builds the app itself) | Chromium (`CHROMIUM_PATH`, or `npx playwright install chromium`) |
| `npm run verify -- --signed` | the signed-in browser suite (`scripts/e2e-signed.mjs`: the real functions on the emulators, a stand-in school provider, its own build of the app). Off unless asked for | JDK 21 or newer, Chromium |
| `npm run verify -- --bundle <dir>` | the startup-bundle check on an app already built into `<dir>` | a build |

A step that needs a JDK and finds none fails with a sentence saying so, before it starts anything. `npm run deploy`
passes on `--rules` and `--e2e` only: run `--signed` yourself before a release that touches sign-in, roles or the
staff screens.

CI (`.github/workflows/ci.yml`) runs on every push to `main` and on every pull request, in six jobs: `npm run verify`;
the startup budget on a build of its own (`bundle`); the rules tests; `npm audit` (it reports and never blocks); the
browser suite once `apps/web/.env.e2e` is committed; and the signed-in suite (`e2e-signed`), which is allowed to fail
for now because it has never run on a runner. CI has no secrets and deploys nothing.

### The startup budget

`node scripts/check-bundle.mjs [build dir]` (default `apps/web/dist`) reads a built app and fails when

- the entry script and what it imports statically are more files, or more KB gzipped, than `scripts/bundle-budget.json`
  allows (KB = 1024 bytes, the unit of the startup figures in `CLAUDE.md`);
- one of those startup files is a Firebase SDK chunk (`firebase-…`): guests never load the SDK;
- `sw.js` precaches a file that should load on demand: a lab, the course editor, the code steps, Darsi Tiny, a staff
  screen (`LAZY_SCREENS` in `apps/web/vite.config.ts`), the SDK, exceljs, a light-lesson pack, the Chrome 61 build.

To measure without touching `apps/web/dist`:
`cd apps/web && DARSI_LOCAL_BUILD=1 npx vite build --outDir <scratch dir> --emptyOutDir`, then
`npm run verify -- --bundle <scratch dir>`.

The report also lists, without counting them, the stylesheet and index.html's plain scripts (`/boot.js`): every phone
loads those first as well, so keep them tiny. Nothing fails when they grow.

The budget is the measured startup plus 1.5 KB: 224.4 KB in 6 files measured on 2026-11-11, 225.9 KB and 8 files
allowed. A new lazy page that shares app code with startup goes into the one `screens/more.ts` chunk, never into a
chunk of its own, and no `import()` goes inside that chunk (TECHNICAL.md "Build, checks and release"): either mistake
splits startup into many files. When a change has to grow startup, raise the two numbers in the same
commit and say why in its message; `node scripts/check-bundle.mjs <dir> --json` prints the new measurement.

## 2. Release: `npm run deploy`

```
npm run deploy -- hosting                       check, build, print the command; deploy nothing
npm run deploy -- hosting --yes                 the same, then deploy
npm run deploy -- functions hosting firestore storage --yes
npm run deploy -- functions:tutorAsk,functions:tutorStatus --yes
```

Targets: `hosting` (both sites: the app, and `login.darsiai.org` for school sign-in), `functions` (or
`functions:<name>`), `firestore` (or `firestore:rules`, `firestore:indexes`), `storage`. A deploy goes out only when
the user has said so, as always.

**Before a release that carries rules:** `node scripts/check-claims.mjs` (read-only) must exit 0. The rules give staff
rights only where an account's claims and its profile agree, so an admin whose two copies differ would be locked out.
Mend what it lists by repeating the change in the app (`npm run superadmin -- <email>` for a platform admin).

What the script does:

1. **Refuses** a tree with anything uncommitted or untracked: a release is a commit. Refuses a missing
   `apps/web/.env.local` (when hosting goes out) or `functions/.env.darsi-f0685` (when functions go out;
   `functions/.env.example` lists what it holds), and a Hosting release when `.firebaserc` doesn't map both sites
   (`app`, `login`) for the project.
2. Runs `npm run verify`. When rules go out it adds `--rules` by itself; `--skip-rules-tests` is for a machine with no
   JDK 21, and belongs in the release notes. `--e2e` adds the browser suite.
3. For hosting: builds the app with `DARSI_BUILD=<short commit>-<yyyymmdd>` in the environment, which
   `apps/web/vite.config.ts` stamps into the app (usage batches and problem reports carry it, so a report names the
   release it came from); checks the startup budget; and refuses a build whose startup files do not hold the project
   id from `.firebaserc` (a build made with another project's settings). The build itself refuses missing settings or
   `VITE_USE_EMULATORS=true` (`checkBuildEnv` in `vite.config.ts`).
4. Refuses if checking and building changed a tracked file (a generated copy that was never committed).
5. Prints the exact `firebase deploy --only … --project … --config firebase.deploy.json` commands. Without `--yes`
   it stops here.
6. With `--yes`, runs them one at a time and stops at the first that fails. `firebase.deploy.json` is `firebase.json`
   without its rebuild hooks, written for the length of the release (gitignored): what goes out is the build that was
   just checked, not a second one.
7. When everything went out: tags the commit `live-YYYYMMDD-n` (annotated, **not pushed**: `git push origin <tag>`)
   and writes `apps/web/dist/release.json` with `{commit, build, at, targets, tag, project}` (`at`: when the last
   command finished; the file is a local record and is not uploaded). The day in the tag and in the build stamp is
   UTC's, taken when the release started, as in the stamp a plain `npm run build` makes.

### The order

Whatever order the targets are given in, they go out as:

1. **indexes**: they take minutes to build, and adding one breaks nothing;
2. **functions**: the server learns the new calls while the old app is still the one in use;
3. **hosting**: the new app, which each phone takes at its next update;
4. **rules** (Firestore, then Storage): last.

So a release that changes rules is **functions, then hosting, then rules**. Two things follow from phones keeping the
previous app until they update:

- rules must still let the previous app work. A rule that only the new app can live with waits for a later release;
- when the new app needs a rule the old rules refuse (a new collection), release the rules first, on their own
  (`npm run deploy -- firestore:rules --yes`), then the rest. Loosening first is safe; tightening last is safe.

### What the script does not release

- **The tutor's voice relay** (Cloud Run, `darsi-tutor`) and **the tutor agent** (Agent Runtime, `agent/deploy.py`):
  `docs/FIREBASE.md` §9.
- **Courses**: `npm run seed` (`docs/CONTENT.md`). A Hosting release needs the live catalog to already list them.
- **Secrets**: Secret Manager (`docs/FIREBASE.md` §9, and §10 for `SSO_KEYS`). Every functions release needs all of
  them to exist.
- **School sign-in's one-time setup**: the service account `darsi-sso` and its roles, and the Hosting site
  `darsi-login` with `login.darsiai.org` (`docs/FIREBASE.md` §10). A Hosting release needs the site to exist.
- **Scripts that mend data** (`npm run resummarize`, `npm run migrate-invites`): by hand, when a release says so.
- **The enterprise batch's one-off steps** (`docs/FIREBASE.md` "Releasing the enterprise batch", in order): the
  triggers that need `--force` by hand before the release; `npm run pin-course-access` (dry run, then `-- --apply`)
  just before it and a second dry run after it; `node scripts/backfill-last-version.mjs --dry-run`, then without
  `--dry-run`, before anyone publishes a course after it; the voice relay; and the owner's setup for school sign-in
  (secret `SSO_KEYS`, service account `darsi-sso`, Hosting site `darsi-login`, the `login.darsiai.org` record, the
  three `SSO_*` settings).

### After a release

- Open https://darsiai.org in a private window: the app loads, and the Network panel shows no `firebase-…` file for a
  guest.
- A returning visitor gets the update toast, and Reload moves them to the new build.
- Call something that changed. A callable answers "Sign in first" (401) to an anonymous call; a rule answers 403.
- Look at the functions' logs for errors in the first minutes (section 5).
- Push the tag, and note the release in `CLAUDE.md` ("Firebase project"): the tag, what went out, what was checked
  live and what was not.

### When a release stops halfway

The script says which steps went out and which did not, and makes no tag. Fix the cause and release only what is left,
from the same commit (`npm run deploy -- hosting firestore:rules --yes`). Functions that went out stay compatible with
the old app by the order above, so there is no hurry to undo them. A first deploy of a new trigger can fail on an
Eventarc permission that is still spreading: wait a minute and run it again.

The functions step also stops when the Firebase CLI would need `--force` and cannot ask (no terminal, or an agent
session): a trigger that newly has a failure policy makes it refuse the whole step, and a trigger whose event type
changed is left out with one warning line while the CLI still reports success. The script counts both as a stopped
release and prints the command for exactly those functions (`npx firebase deploy --only functions:<name>,… --force`).
A person at a terminal is asked instead, and a No there leaves the trigger out the same way: the script also counts
a trigger the CLI listed as unsafely changing and did not report as "Successful update operation". Run the printed
command from the same commit, then release again. `--force` with named functions deletes nothing; never use it on a
whole deploy or on indexes. The script reads the CLI's own words, and `apps/web/tests/release.test.ts` checks them
against the installed firebase-tools, so a CLI upgrade that rewords them fails a test rather than go unseen.

## 3. Undo a release

**Hosting** keeps its earlier releases, and going back takes seconds:

- Firebase console → Hosting → the `darsi-f0685` site → Release history → the release before → **Roll back**; or
- `npx firebase hosting:clone darsi-f0685:@<version id> darsi-f0685:live --project darsi-f0685`, with the version id
  from that same list. (The CLI's documented form; it has not been tried on this project yet. Try it on a preview
  channel first: `… darsi-f0685:rollback-test`.)

Phones that already took the bad build get the update toast for the older one like for any new version. Then find the
commit that is live again (`git tag --list "live-*"`, the release before the bad one) and fix forward from there.
The app itself says which build it is: its stamp (`DARSI_BUILD`, `<commit>-<yyyymmdd>`) travels with usage batches
and problem reports.

A Hosting rollback does not take back functions, rules or indexes that went out with the same release. They were
written to keep the previous app working (the order in section 2), so they can usually stay.

**Functions and rules** have no quick way back: release the previous tag again.

```
git switch --detach live-YYYYMMDD-n        # the release before the bad one
npm ci && npm ci --prefix functions
npm run deploy -- functions --yes           # or firestore:rules, storage
git switch main
```

For rules alone, the console also keeps their history (Firestore → Rules → an earlier version → Publish).

**Data** is not undone by any of this. See section 7.

## 4. Switches

Ways to stop something without a release. Those made in the app are recorded in the audit log (`audit` collection);
a change made in the Firestore console is not, so note it in `CLAUDE.md`.

| What | Where | What it does |
|---|---|---|
| **Darsi Super, for everyone** | `/super/plans` → "Darsi Super for everyone" (`setSuperOn`; `config/settings.superOn`) | Hides the tutor, the Me card and everything for sale. The tutor and checkout refuse on the server (`tutor-closed`, `super-off`). Subscriptions, credits and payment webhooks carry on untouched. Phones see it within a minute. |
| **The tutor's agent** | Firestore console → `config/tutor` → `engine: "direct"` | Typed questions stop going through the agent on Agent Runtime and are answered directly, at once. `"agent"` turns it back on. |
| **The tutor, alone** | Firestore console → `config/tutor` → `on: false` | The tutor refuses (typed and voice); the rest of Super stays. |
| **One account** | The person's page → "Suspend account" (`setAccountSuspended`, platform admins) | They cannot sign in and their sessions end at once. The same button allows them back. |
| **One login an organization manages** | The organization's own admin: People → the person, or several at once (`setMemberSuspended`, `bulkMembers`) | The same, for a login the organization made. Only that organization (or a platform admin) lifts it. |
| **One organization** | `/super/orgs/:id` → Status → Suspend (`updateOrg` with `status: "suspended"`, platform admins), with a reason (kept in `orgs/<id>/private/suspension`, which only platform admins read; the members see only since when) | Its teachers and admins lose their staff rights (the `frozen` claim; their sessions end once) and nobody new joins or is added. Its members keep learning, and its courses and web address keep serving. Resume undoes it. The answer says how many staff accounts could not be refreshed; press Suspend again to retry those. Seats can't be given, filled or bought while it lasts; a platform admin can still take one back. |
| **School sign-in, for everyone** | `/super/plans` → Switches → school sign-in (`manageSso setSwitch`; `config/settings.ssoOn`) | Every school sign-in start is refused (`sso-off`) and every school button hidden, within a minute. Sessions already open carry on. |
| **School sign-in, one organization** | The organization's Sign-in tab (`/admin?tab=signin`, or `/super/orgs/:id?tab=signin`) → Turn off | Nobody signs in through that school. People whose only way in it was are not signed out while it is off. |
| **Payments** | Secret Manager: set a provider's secret to `unset`, then release `functions:startCheckout` | That provider's checkout answers "closed". Turning Super off (first row) is quicker when everything for sale should stop. |

## 5. Watching

### The heartbeat: `stats/jobs`

Every scheduled job writes its last run into one Firestore document, `stats/jobs`, as `{at, ok, …}` (`at` in
milliseconds). A job whose `at` is older than its schedule allows, or whose `ok` is false, needs a look.

| Field | Job | Runs (UTC) | Stale after | Also says |
|---|---|---|---|---|
| `statsJob` | the platform figures in `stats/overview` | daily, 02:30 | 26 hours | `users`; `error` after a failed run |
| `dailyNudges` | the day's push nudges | hourly, at :00 | 2 hours | `hour`, `seen`, `sent`, `failed`, `complete` (false: people of that hour got no nudge) |
| `retentionJob` | deleting what has passed its keeping time | daily, 03:10 | 26 hours | `deleted`, `stopped`, `failed` (the categories that failed) |
| `sitesJob` | organizations' web addresses: DNS, sign-in, CORS; and catalogs that could not be written | every 15 minutes | 30 minutes | `checked`, `live` |
| `ssoJob` | school sign-in: sessions that ran out, keys, moved endpoints, expiring client secrets, schools that were full (the last three also as push alerts to admins) | daily, 02:30 | 26 hours | `sessions`, `revoked`, `resealed`, `moved`, `kids` (the key ids still in use); `error` after a run in which a step failed: the first step's name and the error's kind |

`/super` → Records → **Status** shows all five with these limits (a missing heartbeat, `ok: false` with its `error`,
and `complete: false` are marked too), this build, the app's errors by build for today and yesterday, the audit
entries that need attention and the CSP reports. It reads once when opened and again on Refresh.

Cloud Scheduler lists the same jobs with their last result
(`gcloud scheduler jobs list --location=europe-west1 --project=darsi-f0685 --account=<owner-account>`).
To run one now: `gcloud scheduler jobs run firebase-schedule-<job>-europe-west1 --location=europe-west1 --project=darsi-f0685 --account=<owner-account>`.

Two more documents say when something is behind:

- `stats/catalogs.dirty`: owners (`public`, or an organization id) whose course list is behind Firestore. Empty is
  normal; an entry older than 30 minutes is not (section 6, "A course list that is behind").
- `stats/csp`: what the report-only Content-Security-Policy would have blocked, by directive, since counting began.
  Delete the document to start a new count.

### Log lines worth an alert

All are written at severity ERROR by the functions. In Logs Explorer, or as the filter of a log-based alert:

| Text or field | Written by | It means |
|---|---|---|
| `a payment could not be applied` | `billing.ts` | A provider confirmed a payment and Darsi could not give what was paid for. Someone paid and got nothing: act the same day. |
| `payment amount differs` | `payments.ts` | A webhook's amount or currency is not the checkout's. Nothing was given. Either a price changed mid-checkout or someone is trying something. |
| `gave up` | `billing.ts` (`onSubscriptionWrite`, `onOrgLicence`), `account.ts` (`onAccountDeletion`), `index.ts` (`onProgressWrite`) | A trigger retried for hours and stopped. A plan or a licence was not applied, an account's deletion is unfinished (its queue document is kept), or a person's summary misses a lesson (`npm run resummarize` mends it). |
| `dailyNudges incomplete` | `notify.ts` | The hourly run ran out of time; some people got no nudge. Seen again and again, the hour needs splitting over several runs. |
| `jsonPayload.event="site-lost"` | `sites.ts` | An organization's web address stopped being live: its people cannot sign in there. Check its DNS before anything else (dropped record, or someone else now holds the name). Section 6. |
| `onAccountDeletion: held` | `account.ts` | An account queued by an organization's deletion has a Stripe subscription that renews by itself. It waits for a platform admin. Section 6. |
| `deleteAccount: tutor conversations left and not queued` | `account.ts` | An erasure finished except the tutor's conversations, and they could not be queued for a retry. Section 6. |
| `jsonPayload.event="catalog-pending"`, `catalog still not written` | `content.ts`, `sites.ts` | A course list could not be written after a publish, unpublish or delete; the second line means the job's retry failed too. Section 6. |
| `deleteOrg: member not handled`, `deleteOrg: files not deleted` | `platform.ts` | An organization's deletion stopped at a member, or finished with files left in the bucket. Section 6. |
| `jsonPayload.event="sites-job-failed"`, `"sso-job-failed"`, `retention: a category failed` | `sites.ts`, `sso.ts`, `retention.ts` | A step of a scheduled job threw; the job's heartbeat says `ok: false`. |
| `jsonPayload.event="audit-failed"` | `sites.ts` | A change to a web address was made and its audit entry could not be written; the line holds what the entry would have said. |
| `tutor: call not settled` | `tutor.ts` | A tutor answer was given and its credits could not be settled. The learner was charged nothing; seen often, credits are being given away. |
| `sso: custom token not made (signer)` (`event="sso-signer"`) | `sso.ts` | School sign-in verified someone and could not sign them in: the service account can no longer sign tokens. Nobody gets in through any school. Section 6. |
| `sso: client secret binding mismatch` (`event="sso-secret-mismatch"`) | `sso.ts` | A school's stored secret does not belong to the provider about to be called. Nothing was sent, and that school's connection went back to draft. Section 6. |
| `relay: uncaught exception`, `relay: charge failed`, `relay: hold not released` | the voice relay (Cloud Run `darsi-tutor`; `jsonPayload.message`) | The relay restarted, or a voice call's credits were not charged or given back. |

Written as warnings, worth a second, quieter alert:

| Text or field | It means |
|---|---|
| `jsonPayload.event="org-rebrand"` | An organization with its own web address changed its name or logo. Its sign-in page shows the change within a minute and nobody else is told: check it is not someone posing as another school. |
| `jsonPayload.event="sso-endpoints-moved"` | A school's provider now names other endpoints than the ones that were tested. They are not applied; the school's admin has to test again. Its admins are also told by push (`ssoEndpointsMoved`), once a day, when they have staff alerts on. |
| `jsonPayload.event="sso-unlisted"` | An organization listed in the school finder changed its name or logo: the listing went back to "requested" and is out of the finder until a platform admin approves it again (`/super/domains` → School sign-in). |
| `relay: refused` with `jsonPayload.reason="instance-full"` | Learners are being told the tutor is busy: the relay's limits or `--max-instances` are too small. |
| `jsonPayload.event="sites-job-slow"`, `"sites-job-errors"`, `"sso-job-errors"` | A job ran out of time for some of its work, or part of it failed. |
| `csp` | A browser reported something the full Content-Security-Policy would block (`directive`, `blocked`, `page`). Counted in `stats/csp`. |

One filter for the errors:

```
severity>=ERROR
(resource.type="cloud_run_revision" OR resource.type="cloud_function")
(textPayload:("a payment could not be applied" OR "payment amount differs" OR "gave up" OR "dailyNudges incomplete"
   OR "onAccountDeletion: held" OR "tutor conversations left and not queued" OR "catalog still not written"
   OR "deleteOrg: member not handled" OR "deleteOrg: files not deleted" OR "retention: a category failed"
   OR "tutor: call not settled" OR "custom token not made" OR "client secret binding mismatch")
 OR jsonPayload.message:("a payment could not be applied" OR "payment amount differs" OR "gave up" OR "dailyNudges incomplete"
   OR "onAccountDeletion: held" OR "tutor conversations left and not queued" OR "catalog still not written"
   OR "deleteOrg: member not handled" OR "deleteOrg: files not deleted" OR "retention: a category failed"
   OR "tutor: call not settled" OR "custom token not made" OR "client secret binding mismatch"
   OR "relay: uncaught exception" OR "relay: charge failed" OR "relay: hold not released")
 OR jsonPayload.event=("site-lost" OR "catalog-pending" OR "sites-job-failed" OR "sso-job-failed" OR "audit-failed"))
```

And for the warnings:

```
severity=WARNING
(jsonPayload.event=("org-rebrand" OR "sso-endpoints-moved" OR "sso-unlisted")
 OR (jsonPayload.message="relay: refused" AND jsonPayload.reason="instance-full"))
```

The functions' own lines are written with `firebase-functions`' logger, which puts the text in `jsonPayload.message`
and the fields beside it; the filters also name `textPayload` for lines that arrive as plain text. Try each filter in
Logs Explorer before making an alert of it.

### Alerts to create

None is set up yet. Each is a console step for the owner, with the personal account (Monitoring → Alerting, with an
email notification channel made first).

| Alert | On |
|---|---|
| Errors that need a person | A log-based alert on the errors filter above. Someone who paid and got nothing is in it: the same day. |
| Things to look at | A log-based alert on the warnings filter, to a quieter channel. |
| A scheduled job failed or did not run | A log-based alert on `resource.type="cloud_scheduler_job" severity>=ERROR` (Cloud Scheduler logs every run that failed). A job that runs and finishes badly says so only in `stats/jobs` (`ok: false`, `complete: false`) and in its own error line above, so keep both. Nothing reads `stats/jobs` for you: look at the Status panel, or at the document, at least weekly. |
| Function errors in general | Monitoring → a metric alert on Cloud Run's request count with `response_code_class="5xx"` for the functions' services, and on Cloud Functions' execution count with `status!="ok"`. |
| The site is up | Uptime checks: `https://darsiai.org/` (200); `https://darsiai.org/api/collect` (405 to a GET means the function answers); the relay's `https://darsi-tutor-836458657044.europe-west1.run.app/health` (200, `"ok":true`); and, once school sign-in is set up, `https://login.darsiai.org/` (200). |
| Spending | Billing → Budgets & alerts: a budget on the GAP CLOUD billing account for project `darsi-f0685`, with alerts at 50%, 90% and 100%. Course media is served straight from the bucket (about 4–5 MB a course), so include Cloud Storage. |

### Where else to look

- `/super/analytics`: usage, and whether `stats/overview` is fresh.
- `/super/bugs`: problem reports from people, with their last errors.
- `/super` → Records → Status: the jobs, this build and the app's errors by build (a bad release shows as its build's
  count climbing), the audit entries that need attention, the CSP reports.
- The audit log (`/super` → Records → Activity log; the `audit` collection): who changed a role, a plan, an
  organization, a switch, with the caller's address and a request id (`rid`). Search Cloud Logging for that `rid` to
  find the rest of the request. An organization's own admins see their entries on their Activity tab.
- The voice relay: `GET /health` on the Cloud Run service says how many phones an instance holds. Its log lines are
  one JSON object each (`jsonPayload.message`, with `uid` and `call` where known; never a token, audio or what anyone
  said): `relay: listening` (start, with the limits in force), `relay: refused` (`reason`: `address-pending`,
  `instance-full` or `stopping`), `relay: hello failed` (one learner's call ended with `tutor-gone`),
  `relay: gemini closed` / `relay: gemini error`, `relay: explain failed`, `relay: google token`,
  `relay: unhandled rejection` (it kept running), `relay: stopping`, and the three in the errors table above.

## 6. When something is stuck

Every `gcloud` command here takes `--project=darsi-f0685 --account=<owner-account>`.

### An account deletion that is held or gave up

Deleting an organization with "delete the accounts it made" puts each of those accounts in `accountDeletions/{uid}`
(`{orgId, by, at}`), and a worker (`onAccountDeletion`) erases them one by one, retrying for six hours. A direct
"Delete account" whose tutor conversations could not be erased leaves an entry there too (`wiped: true`,
`via: "deleteAccount"`). If the account already had an entry that no worker was behind any more (held, given up, or
queued over six hours ago), that entry is deleted and created again, with `replaced: "held" | "gave-up" | "expired"`
saying why the old one had stopped: a worker only starts on an entry's creation, and the new one gets a fresh six
hours. A finished deletion removes its document, so **anything still in that collection a day later needs a person**. Look at it in the Firestore console; platform admins have no screen for it.

| The document has | It means | Do |
|---|---|---|
| `held: "renewing"` (log: `onAccountDeletion: held`) | The account has a Stripe subscription that renews by itself. Deleting it would leave a card being charged with nobody to manage it. Nothing was deleted. | Turn the renewal off (Stripe dashboard → the customer → the subscription → cancel at period end; `subscriptions/{uid}` then stops saying it renews). Open `/super/people/<uid>` → Account → **Delete account and data**. Then delete the queue document by hand, if it is still there. |
| `gaveUpAt`, with `startedAt` and no `wiped` (log: `gave up on an account after 6 hours`) | The erasure started and kept failing. The profile is usually gone already, so the person page won't open. | Read the function's errors for that uid in the six hours before `gaveUpAt` and fix the cause. Then start it again: delete the document and add it again under the same id with `orgId`, `by`, `at` and `startedAt` as they were, without `gaveUpAt` (a new document is what wakes the worker; with `startedAt` it finishes without asking again). |
| `gaveUpAt` and `wiped: true` | Everything is erased but the tutor's conversations on Agent Runtime (down, or out of its quota of about 30 queries a minute). | `node scripts/purge-agent-sessions.mjs --uid <uid> --days 0` to see them, the same with `--apply` to delete them (add `--agent <id>` for an older agent), then delete the queue document. |
| `gaveUpAt` and neither `startedAt` nor `wiped` | It never got to start (Auth or Firestore failing for six hours). | Delete the document and add it again with `orgId`, `by` and `at`. |
| nothing but `orgId`, `by`, `at`, and it is recent | It is waiting its turn (at most five at a time). | Nothing. |

The audit log has one `deleteAccount` entry per erased account (`via: "deleteOrg"` for the queue's). In it,
`sessionsFailed: true` with `sessionsQueued: true` means the conversations are in the queue above;
`leftoversChecked: false` means the last look through the bucket for stray files did not finish (everything else is
gone): `gcloud storage ls "gs://darsi-f0685/submissions/**/<uid>/**"` shows what is left, and
`gcloud storage rm` removes it.

### An organization whose deletion stopped

An organization being deleted has `status: "deleting"` (with `deletingBy`, `deletingAt`, `deletingMembers` and the
counts so far). It cannot be made active again. Its staff are frozen, nobody joins it, and its own admins can do
nothing; a platform admin finishes it.

1. Open `/super/orgs/<id>` → **Status**. The page says a deletion is under way and with which choice for the members.
   Type the name and continue: it carries on from where it stopped (every call is safe to repeat), and the page keeps
   calling until it is done.
2. **"Some members could not be handled" (`delete-retry`)**: the log line `deleteOrg: member not handled` names the
   uid and the error. The usual causes pass by themselves (Auth busy); press again. A member that fails every time:
   look at that account in the Firebase console (Authentication, and `users/<uid>`); an account Auth no longer has is
   released anyway, so a profile left in a strange state is the thing to mend.
3. **"This deletion was started with the other choice" (`delete-option`)**: a deletion keeps the choice of its first
   call. Continue with that one.
4. **It finished, and the audit entry `deleteOrg` has `filesLeft: true`** (log: `deleteOrg: files not deleted`, with the
   prefix): the organization is gone and some of its files are not.
   `gcloud storage rm -r gs://darsi-f0685/orgs/<orgId>/` and `gcloud storage rm -r gs://darsi-f0685/exports/<orgId>/`.
5. With "delete the accounts it made", the accounts are erased after the organization is gone, through the queue
   above. Check that queue the next day.

Before deleting a real organization, export it (`/super/orgs/<id>` → Records → Export): the deletion removes its
exports with the rest. Once an organization is suspended or being deleted, only a platform admin can export it (its
own admins are frozen and get `org-suspended`). A new export starts at most once per organization every 10 minutes
(`export-wait`); a first call that failed before it wrote a file gives its turn back, so pressing again works at once.

### A course list that is behind (`catalog-pending`)

A publish, unpublish or delete changed Firestore, and the owner's `catalog.json` in Storage could not be written
(Storage allows about one change a second to one object, and refuses the rest). The editor said "Saved, but the
course list could not be updated just now. It will follow by itself within 15 minutes." Phones keep the list they
have until then.

1. Look at `stats/catalogs.dirty` in the Firestore console: the owners still waiting (`public`, or an organization
   id), each with the time it was marked.
2. `sitesJob` writes them again every 15 minutes and clears the mark. To do it now:
   `gcloud scheduler jobs run firebase-schedule-sitesJob-europe-west1 --location=europe-west1`. The log says
   `catalog-mended` for each one written.
3. An entry older than 30 minutes, with `catalog still not written` in the log, means Storage keeps refusing. Read
   the error on that line. Nothing else has to be done first: once the cause is gone, the job mends it. Publishing or
   unpublishing any course of that owner in the editor also writes the list again.
4. Don't publish or unpublish many courses in one go: `npm run seed` with a few ids at a time, and a pause between
   unpublishes.

A course that was unpublished while its list was pending may leave its last `v<n>.json` in Storage. Nothing lists it,
and the next publish writes a new version number, never that one.

### An organization's web address stopped working (`site-lost`)

The log line and the audit entry `siteLost` name the address, its new status and what was found. While an address is
not live, signing in there is switched off (a page on a name Darsi no longer controls must not be trusted for
sign-in); the organization's people can still use https://darsiai.org.

1. Check the two DNS records the address needs:
   `nslookup -type=CNAME <address>` must answer `darsi-f0685.web.app`, and `nslookup -type=TXT _darsi.<address>` must
   hold the `darsi-site=<token>` shown on the address's card (addresses under darsiai.org need only the CNAME, in
   Cloudflare, **DNS only**).
2. Tell the organization's admin which record is missing. They are the only ones who can put it back.
3. When the records are back: `/super/domains` → the address → **Check now**, or wait for `sitesJob` (every 15
   minutes). The log and the audit entry `siteLive` say when it is live again; the certificate can take a few hours
   after a long gap.
4. If someone else now holds the name, or the organization no longer wants it: **Remove the address** on its card.
   That disconnects it from Hosting, from the sign-in domains and from CORS.
5. `orgRebrand` in the audit log (an organization with an address changed its name or logo) is not a failure, but
   look at it: the sign-in page at that address now shows the new name.

### School sign-in is failing

Start at the organization's status card: `/super/orgs/<id>?tab=signin` (its own admin sees the same at
`/admin?tab=signin`). It shows the problems recorded in `orgs/<id>/private/ssoHealth`, each with how often, when it
was last seen and a hint, and for platform admins whether the key ring reads and the token signer works.

| The card or the person says | It means | Do |
|---|---|---|
| `discovery` (name not found, certificate chain incomplete, refused or timed out, issuer mismatch) | Darsi's servers cannot read the provider's discovery document, or it names another issuer. | The school's side: the provider must be reachable from the internet over https with a complete certificate chain, at a public address. "Check connection" in the wizard repeats the test and shows both issuer strings when they differ. |
| `endpoints-moved` | The provider now names other endpoints than the tested ones. They are not applied. | The school's admin opens Edit, checks the connection and tests again; the live connection keeps serving with the old endpoints meanwhile. If the provider really moved, sign-ins fail until the new test passes. |
| `secret-expiring` | The client secret's expiry date (typed by the admin) is within 30 or 7 days. | The school makes a new secret at its provider and types it in Edit → Connect, with the new date, then tests. Its admins are told by push at 30 days and again at 7 (`ssoSecretExpiring`), but only those with staff alerts on, and an alert that could not be sent leaves no log line: when a date is close, tell them yourself. |
| `secret-mismatch`, and the connection is back to draft | The stored secret was sealed for another issuer, token host or client id than the one about to be called. Nothing was sent. | The school's admin types the secret again, tests, and turns it on. If nobody changed the connection, treat it as tampering: read the audit log for that organization (`sso.*` actions) first. (An edit that was just promoted is not a cause: a sign-in that started before it answers `sso-state` and changes nothing.) |
| `secret-key`, or people see `sso-key` | The key ring in `SSO_KEYS` does not parse, or a secret was sealed with a key that is no longer in it. | `gcloud secrets versions list SSO_KEYS`: was a version added? Put back a ring that still holds every key in `stats/jobs.ssoJob.kids` (below), and release the four functions. A school whose key is truly lost types its secret again. |
| `sso-signer` (also an error in the log) | The service account cannot sign custom tokens. Nobody gets in through any school. | `darsi-sso` needs Token Creator on itself and the IAM Credentials API on (docs/FIREBASE.md §10, step 2). Check that `SSO_SERVICE_ACCOUNT` in `functions/.env.darsi-f0685` still names it. |
| `full`, or people see `sso-full` | The organization reached its hourly allowance of new accounts (200, or a quarter of its members) or its ceiling (licence seats × 1.5, or 2,000). | If the school is really that big, raise the ceiling on its Sign-in tab (platform admins). If not, its provider lets too many people in: check the allowed domains with its admin. |
| `sso-removed` for someone who should get in | The person is on the organization's removed list, or their school identity is marked removed. | The organization's admin: Invite tab → "People who were removed" → **Let back in**, which does both halves (the school's sign-in through `manageSso allowBack`, then the codes) and says which happened. A platform admin can do the same from the person's page (`/super/people/<uid>` → Account → School sign-in). An account the school's sign-in made, or a login the organization manages, returns as a student; a person's own account (also one an admin once made with the person's own email) is only allowed to join again. Someone who left by themself is not refused this way: only people on the removed list, and logins the organization manages. |
| `sso-disabled` | The person's school sign-in is blocked: by an admin (the person's page → Account → School sign-in → Block), or with a suspension of the account. | Unblock on the same panel for an admin's block; restore the account for a suspension's (lifting a suspension never undoes an admin's own block). |
| `sso-connect-first` | Another member of that organization already has this address. | The person signs in the way they usually do, then Me → School sign-in → Connect. |
| `sso-state` after a long wait, or in another tab | The sign-in took over 60 minutes, was finished twice, or came back to a browser that did not start it. On a student's test link: the link was used or has expired. | Start again from the school's button; for a test link, the admin makes a new one. |
| `sso-provider` with `busy` | The provider's calls for that school are all in use, or the callbacks that proved nothing used up their places (per CDN node and per address, for a minute; TECHNICAL.md "The flow"). The state is not spent. | Wait a minute and press the school's button again. If it lasts, look for junk callbacks in the log by `orgId`: the limits are ceilings per hop, and a flood from many addresses needs a limit in front of the functions (the owner's). |
| `sso-off` | The platform switch is off. | `/super/plans` → Switches. |

Everything about one request is found by the organization's id in the logs (`jsonPayload.orgId`); the lines hold
codes only, never a token, a code, a secret or a provider's answer.

**Rotating the key ring** (once a year, when someone who could read it leaves, or at once if it leaked). The ring
names the current key and keeps the older ones, so nothing breaks while it turns:

1. Add a new key and make it current, without printing either:
   ```bash
   gcloud secrets versions access latest --secret=SSO_KEYS --project=darsi-f0685 --account=<owner-account> | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const id='k'+(Object.keys(r.keys).length+1)+'-'+new Date().toISOString().slice(0,10);r.keys[id]=require('crypto').randomBytes(32).toString('base64');r.current=id;process.stdout.write(JSON.stringify(r))})" | npx firebase functions:secrets:set SSO_KEYS --data-file - --project darsi-f0685
   ```
2. Release the four functions, so they read the new version:
   `npm run deploy -- functions:ssoEdge,functions:ssoCallback,functions:manageSso,functions:ssoJob --yes`.
   New states and tickets are made with the new key from then on; ones made just before still verify, because the
   old key is still in the ring.
3. Run the job: `gcloud scheduler jobs run firebase-schedule-ssoJob-europe-west1 --location=europe-west1`. It seals
   every school's client secret again with the current key.
4. Read `stats/jobs.ssoJob.kids`. When it lists only the new key, and an hour has passed since step 2 (a state lasts
   60 minutes), the old key may go: repeat step 1's command with a script that deletes that key from `keys` instead of
   adding one, and release the four functions again. **Never remove a key `kids` still lists**: the secrets sealed
   with it could not be opened, and those schools would have to type theirs again.
5. If the ring leaked, do steps 1 to 4 the same day, and tell every school to make a new client secret at its
   provider: the old ring could open the secrets stored until then.

Keep a copy of the current ring outside the project (section 7). Without it, a lost secret means every school types
its client secret again; nobody's account is lost.

## 7. Backup and restore

> **TODO for the owner. None of this is on yet, and nothing below has been run.**
>
> Today a deleted or damaged document, file or account cannot be brought back. Turn these on, try one restore, and
> then replace this box with what is true: what is on, the recovery point and recovery time you can promise, who may
> restore, and how long it took when it was tried.

Every command takes `--project=darsi-f0685 --account=<owner-account>`.

**Firestore: point-in-time recovery** (any moment of the last 7 days, to the minute):

```bash
gcloud firestore databases update --database="(default)" --enable-pitr
gcloud firestore databases describe --database="(default)" --format="value(pointInTimeRecoveryEnablement,earliestVersionTime)"
```

**Firestore: a daily backup**, kept as long as you choose (here 14 days; 14 weeks is the longest):

```bash
gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=14d
gcloud firestore backups schedules list --database="(default)"
gcloud firestore backups list --format="table(name,database,state,snapshotTime,expireTime)"
```

**Restoring** always goes into a **new** database, never over the live one. Try it once and time it:

```bash
# From a backup (the name from the list above):
gcloud firestore databases restore --source-backup=projects/darsi-f0685/locations/europe-west1/backups/<backup id> --destination-database=restore-test
# Or from a moment within the last 7 days (PITR), whole minutes, UTC:
gcloud firestore databases clone --source-database="projects/darsi-f0685/databases/(default)" --snapshot-time="2026-11-11T09:00:00Z" --destination-database=restore-test
# Look at it in the console, copy back what is needed, then:
gcloud firestore databases delete --database=restore-test
```

Check each flag against `gcloud firestore … --help` before the first run: they are written from the documentation,
not from a run on this project. Both cost storage (PITR keeps seven days of changes; each backup is a full copy).

**To decide and write down here as well:**

- **Cloud Storage** (`gs://darsi-f0685`: published courses, media, project files, logos, exports): soft delete
  (`gcloud storage buckets update gs://darsi-f0685 --soft-delete-duration=14d`) or object versioning
  (`--versioning`), and how an object is brought back (`gcloud storage restore`, or copying an older generation).
- **Authentication**: accounts are not in Firestore. `npx firebase auth:export accounts.json --project darsi-f0685`
  gives a file with password hashes: how often, and where it is kept (encrypted, outside the repository).
- **Secrets**: where a copy of each Secret Manager value lives outside the project (`SSO_KEYS` above all: section 6).
- **Erasure and backups**: a deleted account is still in the backups until they expire. Say so in the privacy notice,
  with the retention chosen above.
- **Who** may restore, and **how long** it took when it was tried.

## 8. What a release machine needs

- Node 22 (`.nvmrc`) and npm 11; `npm ci` and `npm ci --prefix functions`.
- The Firebase CLI from the repository (`npx firebase`, pinned in `package.json`), logged in with the personal
  account. Every `gcloud` command for this project takes `--account=<owner-account>`.
- `apps/web/.env.local` (the live web settings; `apps/web/.env.example`) and `functions/.env.darsi-f0685`
  (`functions/.env.example`). Neither is in git, and neither holds a secret that Secret Manager should hold.
- JDK 21 or newer for the rules tests; Chromium for the browser suite.
