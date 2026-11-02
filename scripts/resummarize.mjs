#!/usr/bin/env node
/**
 * Rebuilds every account's users/{uid}.summary from its progress docs, with the same code as the onProgressWrite
 * trigger (functions/src/summary.ts). Run it once after the summary gains fields (2026-11: time, tracks and scores
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
const { summarize } = await import(pathToFileURL(join(ROOT, "functions/lib/summary.js")).href);

const users = await db.collection("users").select().get();
let done = 0, withLessons = 0;
for (const u of users.docs) {
  const progress = await u.ref.collection("progress").get();
  const summary = summarize(progress.docs.map((d) => d.data()));
  // As the trigger does: each summary field replaced whole.
  await u.ref.set({ summary }, { mergeFields: Object.keys(summary).map((k) => `summary.${k}`) });
  done++; if (progress.size) withLessons++;
}
console.log(`Rebuilt ${done} summaries in ${projectId} (${withLessons} with lessons).`);
process.exit(0);
