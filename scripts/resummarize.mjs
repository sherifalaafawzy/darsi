#!/usr/bin/env node
/**
 * Rebuilds every account's users/{uid}.summary from its progress docs, with the same code as the onProgressWrite
 * trigger (functions/src/progress.ts), and the rows the trigger keeps (users/{uid}/private/summaryRows). Run it once after the summary gains fields (2026-11: time, tracks and scores
 * per competency), so people who haven't finished a lesson since still show full figures in the reports.
 *
 *   npm run resummarize -- --emulator     the local Emulator Suite
 *   npm run resummarize                   the real project (credentials as for `npm run seed`)
 *
 * Build the functions first (npm run build --prefix functions).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const emulator = process.argv.includes("--emulator");
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore();
// The trigger's own code (functions/src/progress.ts): only published lessons count, with their unit's competencies, and
// the counted rows are stored for the trigger to keep up to date.
if (emulator) { process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199"; process.env.CONTENT_BUCKET ??= `${projectId}.appspot.com`; }
const { rebuildSummary } = await import(pathToFileURL(join(ROOT, "functions/lib/progress.js")).href);

const users = await db.collection("users").select().get();
let done = 0, withLessons = 0;
for (const u of users.docs) {
  if (await rebuildSummary(u.id)) withLessons++;
  done++;
}
console.log(`Rebuilt ${done} summaries in ${projectId} (${withLessons} with lessons).`);
process.exit(0);
