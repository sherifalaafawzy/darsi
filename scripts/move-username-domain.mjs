#!/usr/bin/env node
/**
 * Moves username logins off the old hidden domain `users.darsi.app` (a domain Darsi doesn't own) to
 * `users.darsiai.org` (functions/src/usernameDomain.ts says why). Whoever owns darsi.app could receive the password
 * reset emails Firebase sends to `<username>@users.darsi.app` and open those accounts, so every one must move.
 *
 * For each Auth account at the old domain: the Auth email becomes `<username>@users.darsiai.org`, and the profile
 * (users/{uid}.email) follows when it held the old address. The person keeps their username, password and everything
 * else; they sign in exactly as before. Nothing else changes.
 *
 *   node scripts/move-username-domain.mjs                 dry run: lists what it would move (uids only)
 *   node scripts/move-username-domain.mjs --apply         moves them, and writes a `moveUsernameDomain` audit entry
 *   node scripts/move-username-domain.mjs --emulator      the local Emulator Suite (with or without --apply)
 *   node scripts/move-username-domain.mjs --project=my-id
 *
 * A username whose new address another account already holds is listed as a conflict and left where it is (none is
 * expected: createMembers refuses a username the old domain still holds). Running it again moves only what is left.
 * Exit code: 0 when nothing is left at the old domain (after --apply) or nothing would be refused, 1 when anything is
 * left or listed as a conflict, 2 when it could not run.
 *
 * Credentials (real project): as scripts/check-claims.mjs (a service-account key in GOOGLE_APPLICATION_CREDENTIALS, or
 * `gcloud auth application-default login`). It reads every Auth account (1,000 a page).
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const OLD = "users.darsi.app", NEW = "users.darsiai.org";
const args = process.argv.slice(2);
const emulator = args.includes("--emulator"), apply = args.includes("--apply");
const unknown = args.filter((a) => a !== "--emulator" && a !== "--apply" && !a.startsWith("--project="));
if (unknown.length) {
  console.error(`Unknown argument: ${unknown.join(" ")}\nUsage: node scripts/move-username-domain.mjs [--apply] [--emulator] [--project=<id>]`);
  process.exit(2);
}
const projectId = args.find((a) => a.startsWith("--project="))?.split("=")[1]
  ?? (emulator ? "demo-darsi" : JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default);
if (emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
} else {
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||= projectId;
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, "$1");
  if (key && !existsSync(key)) { console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${key}, but there is no file there.`); process.exit(2); }
  if (key) process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
}

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let sdk;
try {
  sdk = { app: require("firebase-admin/app"), auth: require("firebase-admin/auth"), firestore: require("firebase-admin/firestore") };
} catch { console.error("firebase-admin is missing. Run: npm ci --prefix functions"); process.exit(2); }
sdk.app.initializeApp(emulator ? { projectId } : { projectId, credential: sdk.app.applicationDefault() });
const auth = sdk.auth.getAuth(), db = sdk.firestore.getFirestore();
const { FieldValue } = sdk.firestore;

const found = [];
let page;
do {
  const r = await auth.listUsers(1000, page);
  for (const u of r.users) if (u.email?.toLowerCase().endsWith(`@${OLD}`)) found.push(u);
  page = r.pageToken;
} while (page);

console.log(`${projectId}: ${found.length} account(s) at @${OLD}${apply ? "" : " (dry run: nothing changed)"}`);
let moved = 0, conflicts = 0, failed = 0;
for (const u of found) {
  const name = u.email.toLowerCase().slice(0, -(OLD.length + 1));
  const next = `${name}@${NEW}`;
  const holder = await auth.getUserByEmail(next).catch(() => null);
  if (holder && holder.uid !== u.uid) { conflicts++; console.log(`  conflict ${u.uid}: the new address is held by ${holder.uid}; left as it is`); continue; }
  if (!apply) { console.log(`  would move ${u.uid}`); continue; }
  try {
    await auth.updateUser(u.uid, { email: next });
    const ref = db.doc(`users/${u.uid}`), p = await ref.get();
    if (p.exists && String(p.get("email") ?? "").toLowerCase() === u.email.toLowerCase()) await ref.update({ email: next });
    moved++;
    console.log(`  moved ${u.uid}`);
  } catch (e) {
    failed++;
    console.log(`  failed ${u.uid}: ${e?.code ?? e?.message ?? e}`);
  }
}
if (apply && found.length) {
  await db.collection("audit").add({ action: "moveUsernameDomain", by: "script", from: OLD, to: NEW, moved, conflicts, failed, at: FieldValue.serverTimestamp() });
}
console.log(apply ? `Moved ${moved}, conflicts ${conflicts}, failed ${failed}.` : `Would move ${found.length - conflicts}, conflicts ${conflicts}. Run again with --apply.`);
process.exit(conflicts || failed || (!apply && found.length) ? 1 : 0);
