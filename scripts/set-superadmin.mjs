#!/usr/bin/env node
/**
 * Make an existing account a Darsi platform admin (role "superadmin"), or take the role away.
 * Roles live in Auth custom claims, which only the Admin SDK can set, so this runs on your machine, never in the app.
 *
 *   npm run superadmin -- you@example.com              promote (project from .firebaserc)
 *   npm run superadmin -- you@example.com --revoke     back to an independent learner
 *   npm run superadmin -- you@example.com --emulator   against the local Emulator Suite
 *   npm run superadmin -- you@example.com --project=my-project-id
 *
 * The account must already exist: sign up in the app first.
 * Credentials (real project): Application Default Credentials, either
 *   - a service-account key: Firebase console → Project settings → Service accounts → Generate new private key,
 *     then set GOOGLE_APPLICATION_CREDENTIALS to the downloaded file (keep it out of the repo), or
 *   - `gcloud auth application-default login` with an account that can manage the project.
 * The person picks up the new role automatically (the app refreshes claims when users/{uid} changes).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const revoke = args.includes("--revoke");
const emulator = args.includes("--emulator");
if (!email || !email.includes("@")) {
  console.error("Usage: npm run superadmin -- <email> [--revoke] [--emulator] [--project=<id>]");
  process.exit(1);
}
const projectId = args.find((a) => a.startsWith("--project="))?.split("=")[1]
  ?? (emulator ? "demo-darsi" : JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default);
if (emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
}

// firebase-admin is installed with the Cloud Functions (npm ci --prefix functions).
const require = createRequire(new URL("../functions/package.json", import.meta.url));
let admin;
try {
  admin = { app: require("firebase-admin/app"), auth: require("firebase-admin/auth"), firestore: require("firebase-admin/firestore") };
} catch {
  console.error("firebase-admin is missing. Run: npm ci --prefix functions");
  process.exit(1);
}
const { initializeApp, applicationDefault } = admin.app;
const { getAuth } = admin.auth;
const { getFirestore, FieldValue } = admin.firestore;

initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth(), db = getFirestore();

try {
  const user = await auth.getUserByEmail(email);
  const role = revoke ? "learner" : "superadmin";
  // Same shape as setRole() in functions/src/index.ts: claims for the security rules, users/{uid} for the UI.
  await auth.setCustomUserClaims(user.uid, { role });
  const ref = db.doc(`users/${user.uid}`);
  const existing = await ref.get();
  await ref.set({
    ...(existing.exists ? {} : { name: user.displayName || email.split("@")[0], email, lang: "en", createdAt: FieldValue.serverTimestamp() }),
    role, orgId: null, claimsUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection("audit").add({ action: revoke ? "revokeSuperadmin" : "setSuperadmin", by: "script", uid: user.uid, at: FieldValue.serverTimestamp() });
  console.log(`${email} (${user.uid}) is now ${revoke ? "an independent learner" : "a platform admin"} in ${projectId}${emulator ? " (emulator)" : ""}.`);
} catch (e) {
  const code = e?.errorInfo?.code ?? e?.code ?? "";
  if (code === "auth/user-not-found") console.error(`No account for ${email} in ${projectId}. Sign up in the app first.`);
  else if (/credential|default credentials/i.test(String(e?.message))) console.error("No credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or run `gcloud auth application-default login`.");
  else console.error(e?.message ?? e);
  process.exit(1);
}
