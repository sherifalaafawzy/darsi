#!/usr/bin/env node
/**
 * Moves each organization request's contact and reason from the org document, which every member reads (and each
 * member's phone caches at sign-in, pupils included), to orgs/{orgId}/private/request, which only the org's admins and
 * platform admins read. Since 2026-11 requestOrg writes them there; this moves the ones from before. Pending requests
 * are moved too, so their review cards on /super keep showing them.
 *
 *   node scripts/migrate-org-requests.mjs --emulator --dry-run   the local Emulator Suite, only say what would move
 *   node scripts/migrate-org-requests.mjs --emulator             the local Emulator Suite
 *   node scripts/migrate-org-requests.mjs                        the real project (credentials as for `npm run seed`)
 *
 * Safe to run again: an org with nothing left on its document is skipped, and what the private document already holds
 * (a request made after the change) is kept.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const emulator = args.includes("--emulator"), dry = args.includes("--dry-run");
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
else {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, "$1");
  if (key && !existsSync(key)) { console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${key}, but there is no file there.`); process.exit(1); }
  if (key) process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
}
process.env.GCLOUD_PROJECT = projectId;
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore();

const orgs = await db.collection("orgs").get();
let moved = 0;
for (const o of orgs.docs) {
  const contact = o.get("contact"), reason = o.get("reason");
  if (contact === undefined && reason === undefined) continue;
  moved++;
  if (dry) { console.log(`  would move ${o.id} (${o.get("status") ?? "?"}): contact ${contact ? "yes" : "empty"}, reason ${reason ? "yes" : "empty"}`); continue; }
  const priv = db.doc(`orgs/${o.id}/private/request`);
  const have = (await priv.get()).data() ?? {};
  const batch = db.batch();
  batch.set(priv, { contact: typeof contact === "string" ? contact : "", reason: typeof reason === "string" ? reason : "", ...have }, { merge: true });
  batch.update(o.ref, { contact: FieldValue.delete(), reason: FieldValue.delete() });
  await batch.commit();
}
console.log(`${dry ? "Would move" : "Moved"} the contact and reason of ${moved} of ${orgs.size} organizations in ${projectId} to their private document.`);
if (!dry && moved) console.log("Members' phones replace their cached copy of the org document at their next sign-in.");
process.exit(0);
