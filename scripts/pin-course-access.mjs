#!/usr/bin/env node
/**
 * Course-access grants (courseAccess/{uid}, /super/access) now read only the organizations stored with them
 * (functions/src/access.ts). A grant made before organizations were stored has none, and reads nothing until it is
 * saved again. This pins each such grant once to the teacher's organization as Auth holds it now ("none" for a
 * teacher in no organization): what those grants meant until this release.
 *
 * Run it once at the release that brings the new rules, then open /super/access and check the Organizations column:
 * it now names the real organization of every grant. A teacher who changed organization shortly before the release
 * is pinned to where they are now, so a name that surprises you there is worth a look.
 *
 *   npm run pin-course-access                    lists what it would write, and writes nothing
 *   npm run pin-course-access -- --apply         writes it (credentials as for `npm run seed`)
 *   npm run pin-course-access -- --emulator      the local Emulator Suite (add --apply to write)
 *
 * It prints account ids and organization ids only, never names or addresses. Each grant it changes gets an audit
 * entry (`pinCourseAccess`). Running it again changes nothing: a grant that stores its organizations is left alone.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const emulator = process.argv.includes("--emulator"), apply = process.argv.includes("--apply");
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) { process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080"; process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099"; }
process.env.GCLOUD_PROJECT = projectId;
// The Auth admin API with an application-default login needs a quota project (as scripts/demo-org.mjs sets).
if (!emulator) process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore(), auth = getAuth();

const NO_ORG = "none";
const grants = await db.collection("courseAccess").get();
let pinned = 0, kept = 0, skipped = 0;
for (const g of grants.docs) {
  const orgs = g.get("orgs");
  if (Array.isArray(orgs) && orgs.some((o) => typeof o === "string" && o)) { kept++; continue; }
  // Auth, not the profile: it is what the grant resolved against until now. No account: the grant opens nothing anyway.
  const account = await auth.getUser(g.id).catch((e) => (e?.code === "auth/user-not-found" ? null : Promise.reject(e)));
  if (!account) { skipped++; console.log(`  ${g.id}: no such account, left as it is (it reads nothing). Remove it on /super/access.`); continue; }
  const own = account.customClaims?.orgId;
  const org = typeof own === "string" && own ? own : NO_ORG;
  console.log(`  ${g.id}: ${org === NO_ORG ? "people in no organization" : `organization ${org}`}${apply ? "" : " (not written)"}`);
  if (apply) {
    await g.ref.update({ orgs: [org] });
    // No top-level `orgId`: that would put the entry in the organization's own log (functions/src/audit.ts orgAudit),
    // and a course-access grant is the platform's business (grantCourseAccess writes none either).
    await db.collection("audit").add({ action: "pinCourseAccess", by: "script", uid: g.id, orgs: [org], at: FieldValue.serverTimestamp() });
  }
  pinned++;
}
console.log(`${projectId}: ${grants.size} grants. ${kept} already store their organizations; ${pinned} ${apply ? "pinned" : "would be pinned (run again with --apply)"}; ${skipped} without an account.`);
process.exit(0);
