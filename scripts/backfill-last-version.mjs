#!/usr/bin/env node
/**
 * Writes each unit's version counter (units/{id}.lastVersion) where it is missing, while the record of it still exists.
 *
 * A published unit file is immutable (v<n>.json, cached for a year, and kept cache-first on phones), so a version number
 * must never be used twice. Since 2026-11 the functions keep the counter on the unit through an unpublish. A unit
 * unpublished before that has `published: null`, no counter and no files: the only record of its last version is the
 * audit log, where every publish wrote its version. The functions read it from there at the next publish
 * (functions/src/content.ts lastVersionOf), and the retention job keeps those entries (retentionCore auditKept), but one
 * record is one too few for something that can't be recovered: this copies it onto the unit, once.
 *
 * When: before anyone publishes or republishes a course after the release that brought `lastVersion` (docs/FIREBASE.md,
 * "Releasing the enterprise batch"). The deadline is the next publish, not an audit period. A unit that was
 * unpublished and published again by the code before that release went live again at v1 while the audit log records
 * its earlier v3 or v4, and the functions trust a live unit's own version without reading the audit log
 * (lastVersionOf returns as soon as `published.version` is there): until this has stamped the higher number, each
 * publish of such a unit reuses one that phones may still hold. It is safe to run before that release as well: the
 * older functions neither read `lastVersion` nor remove it (they update `published` only).
 *
 *   node scripts/backfill-last-version.mjs --dry-run              the real project (.firebaserc): only say what it would write
 *   node scripts/backfill-last-version.mjs                        the real project (credentials as for `npm run seed`)
 *   node scripts/backfill-last-version.mjs --emulator [--dry-run] the local Emulator Suite (Firestore and Storage)
 *
 * For each units/{id} it takes the highest version anything records: the live one (`published.version`), the audit
 * log's publishes of that unit by its owner, and, for a unit that says nothing itself, the versioned files Storage
 * still holds. It writes `lastVersion` only when that is above the counter the unit already has: it never lowers one,
 * touches nothing else on the unit, and running it again changes nothing. Everything is read before anything is
 * written, and if any read fails nothing is written (a counter that is too low is worse than none: the functions
 * stop looking once a unit has one).
 *
 * It prints unit ids and version numbers only. A line marked "(live)" is a unit that is published now: when its counter
 * is above the version it is live at, it was published again after an unpublish and its history is ahead of it (the
 * case above). "(not published now)" is a unit whose counter comes from the audit log or its files. Exit code: 0 done, 1 could not run, 2 bad arguments.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditVersions, counterFor, needsFiles, orphans } from "./lib/unit-versions.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const emulator = args.includes("--emulator"), dry = args.includes("--dry-run");
const unknown = args.filter((a) => a !== "--emulator" && a !== "--dry-run");
if (unknown.length) { console.error(`Unknown argument: ${unknown.join(" ")}\nUsage: node scripts/backfill-last-version.mjs [--emulator] [--dry-run]`); process.exit(2); }
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
} else {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, "$1");
  if (key && !existsSync(key)) { console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${key}, but there is no file there.`); process.exit(1); }
  if (key) process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
}
process.env.GCLOUD_PROJECT = projectId;
// The app's bucket, as scripts/seed-content.mjs and functions/src/storage.ts name it (never the project default).
const BUCKET = emulator ? `${projectId}.appspot.com` : (process.env.CONTENT_BUCKET || "darsi-f0685");
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
initializeApp({ projectId, storageBucket: BUCKET, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore(), bucket = getStorage().bucket(BUCKET);

/** Where a unit's published files are (functions/src/catalog.ts unitPrefix). */
const unitPrefix = (owner, unitId) => `${owner === "public" ? "content" : `orgs/${owner}`}/units/${unitId}/`;

let plan, units, lost;
try {
  const [unitDocs, published] = await Promise.all([
    db.collection("units").select("owner", "published.version", "lastVersion").get(),
    db.collection("audit").where("action", "==", "publishUnit").select("unitId", "owner", "version").get(),
  ]);
  const audited = auditVersions(published.docs.map((d) => d.data()));
  units = unitDocs.docs.map((d) => ({ id: d.id, ref: d.ref, owner: d.get("owner"), lastVersion: d.get("lastVersion"), publishedVersion: d.get("published.version") }));
  plan = [];
  for (const u of units) {
    if (typeof u.owner !== "string" || !u.owner) { console.log(`  skipped ${u.id}: it has no owner`); continue; }
    const files = needsFiles(u) ? (await bucket.getFiles({ prefix: unitPrefix(u.owner, u.id) }))[0].map((f) => f.name) : [];
    const to = counterFor({ ...u, audited: audited.get(`${u.owner}/${u.id}`), files });
    if (to) plan.push({ ...u, to });
  }
  lost = orphans(audited, units.filter((u) => typeof u.owner === "string").map((u) => `${u.owner}/${u.id}`)).map((k) => `${k} (v${audited.get(k)})`);
} catch (e) {
  console.error(`Could not read the units, the audit log or the bucket ${BUCKET}: ${e?.message ?? e}\nNothing was written.`);
  process.exit(1);
}

for (const u of plan) console.log(`  ${dry ? "would write" : "writing"} ${u.id}: lastVersion ${u.to}${Number(u.publishedVersion) > 0 ? " (live)" : " (not published now)"}`);
if (!dry) {
  // Only the one field, and only where it is still below: a publish that ran in between has already stamped more.
  for (const u of plan) {
    await db.runTransaction(async (tx) => {
      const now = Number((await tx.get(u.ref)).get("lastVersion")) || 0;
      if (now < u.to) tx.update(u.ref, { lastVersion: u.to });
    });
  }
}
console.log(`${dry ? "Would write" : "Wrote"} the version counter of ${plan.length} of ${units.length} units in ${projectId}.`);
if (lost.length) console.log(`The audit log also holds publishes of ${lost.length} unit id(s) that have no unit now (deleted). Nothing to stamp: the retention job keeps those entries, and a unit made again under one of these ids carries on from them:\n  ${lost.join("\n  ")}`);
process.exit(0);
