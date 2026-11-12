#!/usr/bin/env node
/**
 * Checks that every staff account's role and organization agree in the two places Darsi keeps them: the Auth custom
 * claims (what the security rules and every callable go by) and users/{uid} (what the screens and lists show).
 * A role change is two writes (functions/src/index.ts setRole, platform.ts assign), so one that failed between them
 * leaves the two apart: a removed teacher who still has access, or an admin on the lists who can do nothing.
 *
 * Read-only: it lists what it finds and changes nothing. To mend an account, repeat the change in the app (remove the
 * person again, set their role again, approve the organization again); the callables finish a half-done change.
 *
 *   node scripts/check-claims.mjs                    the project in .firebaserc
 *   node scripts/check-claims.mjs --emulator         the local Emulator Suite
 *   node scripts/check-claims.mjs --project=my-id
 *   node scripts/check-claims.mjs --json             the findings as JSON (for a scheduled check)
 *
 * Lists:
 * - accounts whose claims {role, orgId} differ from users/{uid} {role, orgId}, when either side is a teacher, an org
 *   admin or a platform admin (learners and students can't do more than learn, so a difference there costs nothing);
 * - platform admins (by their claims) with no profile;
 * - profiles that say teacher, org admin or platform admin with no Auth account behind them.
 * Exit code: 0 when everything agrees, 1 when anything is listed, 2 when the check itself could not run.
 *
 * Credentials (real project): as scripts/set-superadmin.mjs. Application Default Credentials: a service-account key in
 * GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`. It reads every Auth account (1,000 a
 * page) and their profiles (one read each, 300 a request), so on a large project it costs that many reads.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const emulator = args.includes("--emulator");
const json = args.includes("--json");
const unknown = args.filter((a) => a !== "--emulator" && a !== "--json" && !a.startsWith("--project="));
if (unknown.length) {
  console.error(`Unknown argument: ${unknown.join(" ")}\nUsage: node scripts/check-claims.mjs [--emulator] [--project=<id>] [--json]`);
  process.exit(2);
}
const projectId = args.find((a) => a.startsWith("--project="))?.split("=")[1]
  ?? (emulator ? "demo-darsi" : JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default);
if (emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
} else {
  // A gcloud login (user credentials) is refused by the Auth API without a quota project; use this project.
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||= projectId;
  // cmd.exe keeps the quotes in `set VAR="C:\path"`, and a missing key file would otherwise read as "no credentials".
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, "$1");
  if (key && !existsSync(key)) {
    console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${key}, but there is no file there.
Save the service-account key at that path, or clear the variable to use your gcloud login instead:
  cmd:        set GOOGLE_APPLICATION_CREDENTIALS=
  PowerShell: Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS`);
    process.exit(2);
  }
  if (key) process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
}

// firebase-admin is installed with the Cloud Functions (npm ci --prefix functions).
const require = createRequire(new URL("../functions/package.json", import.meta.url));
let admin;
try {
  admin = { app: require("firebase-admin/app"), auth: require("firebase-admin/auth"), firestore: require("firebase-admin/firestore") };
} catch {
  console.error("firebase-admin is missing. Run: npm ci --prefix functions");
  process.exit(2);
}
const { initializeApp, applicationDefault } = admin.app;
const { getAuth } = admin.auth;
const { getFirestore } = admin.firestore;

initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth(), db = getFirestore();

/** Roles that can do more than learn: only a difference that touches one of them matters. */
const STAFF = ["teacher", "orgAdmin", "superadmin"];
/** {role, orgId} as both sides mean them: no role is a learner, no organization is null. */
const held = (o) => ({ role: typeof o?.role === "string" && o.role ? o.role : "learner", orgId: typeof o?.orgId === "string" && o.orgId ? o.orgId : null });
const say = (h) => `${h.role}${h.orgId ? ` of ${h.orgId}` : ""}`;

try {
  const findings = [];
  const seen = new Set();
  let accounts = 0, pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    pageToken = page.pageToken;
    accounts += page.users.length;
    // Every account's profile is read, 300 a request (only its role and organization): a profile can say "teacher"
    // while the claims say nothing, so accounts can't be picked by their claims alone.
    for (let i = 0; i < page.users.length; i += 300) {
      const group = page.users.slice(i, i + 300);
      const profiles = await db.getAll(...group.map((u) => db.doc(`users/${u.uid}`)), { fieldMask: ["role", "orgId"] });
      for (const [j, u] of group.entries()) {
        seen.add(u.uid);
        const profile = profiles[j];
        const claims = held(u.customClaims), doc = held(profile.exists ? profile.data() : undefined);
        const who = { uid: u.uid, login: u.email ?? u.phoneNumber ?? "", ...(u.disabled ? { disabled: true } : {}) };
        if (!profile.exists) {
          if (claims.role === "superadmin") findings.push({ kind: "platform-admin-without-profile", ...who, claims });
          else if (STAFF.includes(claims.role)) findings.push({ kind: "differs", ...who, claims, profile: null });
          continue;
        }
        if ((STAFF.includes(claims.role) || STAFF.includes(doc.role)) && (claims.role !== doc.role || claims.orgId !== doc.orgId)) {
          findings.push({ kind: "differs", ...who, claims, profile: doc });
        }
      }
    }
  } while (pageToken);

  // Staff profiles with no account behind them (an account deleted in the console, a profile written by hand).
  const staffProfiles = await db.collection("users").where("role", "in", STAFF).select("role", "orgId", "email").get();
  for (const p of staffProfiles.docs) {
    if (!seen.has(p.id)) findings.push({ kind: "profile-without-account", uid: p.id, login: String(p.get("email") ?? ""), profile: held(p.data()) });
  }

  if (json) {
    console.log(JSON.stringify({ project: projectId, emulator, accounts, findings }, null, 2));
  } else {
    for (const f of findings) {
      const login = f.login ? ` (${f.login})` : "";
      if (f.kind === "platform-admin-without-profile") console.log(`${f.uid}${login}: a platform admin by its claims, with no profile`);
      else if (f.kind === "profile-without-account") console.log(`${f.uid}${login}: the profile says ${say(f.profile)}, but there is no such account`);
      else console.log(`${f.uid}${login}${f.disabled ? " [disabled]" : ""}: claims say ${say(f.claims)}, the profile ${f.profile ? `says ${say(f.profile)}` : "is missing"}`);
    }
    console.log(findings.length
      ? `\n${findings.length} of ${accounts} accounts in ${projectId}${emulator ? " (emulator)" : ""} need a look. Nothing was changed: repeat the role change in the app to mend one.`
      : `All ${accounts} accounts in ${projectId}${emulator ? " (emulator)" : ""} agree: claims and profiles say the same for every teacher, org admin and platform admin.`);
  }
  process.exit(findings.length ? 1 : 0);
} catch (e) {
  // firebase-admin cuts Google's own error text short; the full reason is in the HTTP response.
  const msg = String(e?.errorInfo?.httpResponse?.data?.error?.message ?? e?.message ?? e);
  if (/credential/i.test(msg)) console.error(`${msg}\nSet GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or run \`gcloud auth application-default login\`.`);
  else console.error(msg);
  process.exit(2);
}
