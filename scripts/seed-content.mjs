#!/usr/bin/env node
/**
 * Publishes the starting courses, content/units/*.json (with their kits in content/kits), the way the course editor
 * does: uploads the kit files to Storage, saves the unit as a platform draft (units/{id}, unitDrafts/{id}) and publishes
 * it through the same code as the editor's Publish (publishDraft in functions/src/content.ts: checks, versioned JSON,
 * content/catalog.json). The app ships no courses of its own, so a new project shows none until this has run.
 *
 *   npm run seed -- --emulator          the local Emulator Suite (demo-darsi)
 *   npm run seed                        the real project (.firebaserc)
 *   npm run seed -- --project=<id>      another project (set CONTENT_BUCKET to its Storage bucket)
 *   npm run seed -- ai-1                only these units
 *   npm run seed -- --replace           overwrite a draft that already exists (it is left alone by default: it may hold
 *                                       edits made in the editor), then publish it
 *
 * Unit and lesson ids are kept, so learners' progress, notes and certificates still match.
 * Build the functions first (npm run build --prefix functions): this reuses their code.
 * Credentials (real project): as for `npm run superadmin`, either a service-account key in GOOGLE_APPLICATION_CREDENTIALS
 * or `gcloud auth application-default login` with an account that can manage the project.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contentTypeOf, kitFiles, withKitUrls } from "./lib/kits.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const emulator = args.includes("--emulator");
const replace = args.includes("--replace");
const only = args.filter((a) => !a.startsWith("--"));
const projectId = args.find((a) => a.startsWith("--project="))?.split("=")[1]
  ?? (emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default);

if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  process.env.FUNCTIONS_EMULATOR = "true"; // functions/src/storage.ts: the demo project's bucket
} else {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, "$1");
  if (key && !existsSync(key)) { console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${key}, but there is no file there.`); process.exit(1); }
  if (key) process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
}
process.env.GCLOUD_PROJECT = projectId;
const BUCKET = emulator ? `${projectId}.appspot.com` : (process.env.CONTENT_BUCKET || "darsi-f0685");
process.env.CONTENT_BUCKET = BUCKET;

const lib = join(ROOT, "functions/lib");
if (!existsSync(join(lib, "content.js"))) { console.error("Build the functions first: npm run build --prefix functions"); process.exit(1); }
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
initializeApp({ projectId, storageBucket: BUCKET, ...(emulator ? {} : { credential: applicationDefault() }) });
// After initializeApp: the functions' own admin.ts reuses this app instead of starting one without credentials.
const { publishDraft } = await import(pathToFileURL(join(lib, "content.js")).href);
const { bucket } = await import(pathToFileURL(join(lib, "storage.js")).href);
const { db } = await import(pathToFileURL(join(lib, "admin.js")).href);
const { FieldValue } = require("firebase-admin/firestore");

const urlOf = (path) => `${emulator ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com"}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
const files = readdirSync(join(ROOT, "content/units")).filter((f) => f.endsWith(".json") && (!only.length || only.includes(basename(f, ".json"))));
if (!files.length) { console.error(`No units to seed${only.length ? ` among: ${only.join(", ")}` : ""}.`); process.exit(1); }

console.log(`Seeding ${files.length} unit(s) into ${emulator ? "the emulators" : projectId} (bucket ${BUCKET})`);
let failed = 0;
for (const f of files) {
  const source = JSON.parse(readFileSync(join(ROOT, "content/units", f), "utf8"));
  const id = source.id;
  try {
    const meta = await db.doc(`units/${id}`).get();
    if (meta.exists && !replace) {
      console.log(`  ${id}: a draft already exists (rev ${meta.get("rev")}, ${meta.get("published") ? `v${meta.get("published.version")} live` : "not published"}), left alone. Use --replace to overwrite it.`);
      continue;
    }
    if (meta.exists && meta.get("owner") !== "public") throw new Error(`units/${id} belongs to ${meta.get("owner")}`);
    for (const k of kitFiles(source)) {
      const local = join(ROOT, "content/kits", k.file);
      if (!existsSync(local)) throw new Error(`${k.file} is missing: build the kits (npm run kits -w @darsi/web)`);
      await bucket().upload(local, { destination: k.path, resumable: false, metadata: { contentType: contentTypeOf(k.fmt), cacheControl: "public, max-age=86400" } });
    }
    const unit = withKitUrls(source, urlOf);
    const rev = (Number(meta.get("rev")) || 0) + 1;
    const batch = db.batch();
    // The same light record the editor writes (apps/web/src/cms/data.ts metaOf); `published` stays as it is.
    batch.set(db.doc(`units/${id}`), {
      owner: "public", title: unit.title, track: unit.track, level: unit.level, lessonCount: unit.lessons.length,
      lessons: unit.lessons.map((l) => ({ id: l.id, title: l.title })), rev, updatedAt: FieldValue.serverTimestamp(), updatedBy: "seed",
      ...(meta.exists ? {} : { published: null }),
    }, { merge: true });
    batch.set(db.doc(`unitDrafts/${id}`), { owner: "public", rev, unit });
    await batch.commit();
    const { version } = await publishDraft("public", id, "seed");
    console.log(`  ${id}: ${kitFiles(source).length} kit files uploaded, published as v${version}`);
  } catch (e) {
    failed++;
    console.error(`  ${id}: not published. ${e.message}${e.details?.issues ? ` ${JSON.stringify(e.details.issues.slice(0, 5))}` : ""}`);
  }
}
console.log(failed ? `${failed} unit(s) failed.` : `Done. Learners see them on their next visit: ${urlOf("content/catalog.json")}`);
process.exit(failed ? 1 : 0);
