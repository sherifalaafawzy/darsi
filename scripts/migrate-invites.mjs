#!/usr/bin/env node
/**
 * Moves each organization's invite codes from the org document (which every member can read, so a student could see
 * the teacher code) to orgs/{orgId}/private/invites (its admins and platform admins only). The codes stay the same,
 * so codes already shared keep working; admins can make new, longer ones from their dashboard.
 *
 *   npm run migrate-invites -- --emulator     the local Emulator Suite
 *   npm run migrate-invites                   the real project (credentials as for `npm run seed`)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const emulator = process.argv.includes("--emulator");
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore();

const orgs = await db.collection("orgs").get();
let moved = 0;
for (const o of orgs.docs) {
  const codes = o.get("inviteCodes");
  if (!codes) continue;
  const priv = db.doc(`orgs/${o.id}/private/invites`);
  const have = (await priv.get()).data() ?? {};
  // A code already in the private doc (made after the change) wins over the old copy.
  await priv.set({ ...codes, ...have });
  await o.ref.update({ inviteCodes: FieldValue.delete() });
  moved++;
}
console.log(`Moved the invite codes of ${moved} of ${orgs.size} organizations in ${projectId} to their private document.`);
process.exit(0);
