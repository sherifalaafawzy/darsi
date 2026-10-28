#!/usr/bin/env node
/**
 * Publishes the starting courses, content/units/*.json (with their kits in content/kits and their media in content/media),
 * the way the course editor does: uploads the kit and media files to Storage, saves the unit as a platform draft
 * (units/{id}, unitDrafts/{id}) and publishes it through the same code as the editor's Publish (publishDraft in
 * functions/src/content.ts: checks, versioned JSON, content/catalog.json). The app ships no courses of its own, so a new
 * project shows none until this has run.
 *
 * Media (narrated videos, captions and light lessons) is gitignored: scripts/import-packs.mjs makes it from the course
 * packs and Lesson Studio. Each file goes to a folder named by its content, so phones cache it for good and a re-seed
 * uploads only what changed. A unit's media that isn't on this computer keeps its app path (and video kits are left out).
 *
 *   npm run seed -- --emulator          the local Emulator Suite (demo-darsi)
 *   npm run seed                        the real project (.firebaserc)
 *   npm run seed -- --project=<id>      another project (set CONTENT_BUCKET to its Storage bucket)
 *   npm run seed -- ai-1                only these units
 *   npm run seed -- --replace           overwrite a draft that already exists (it is left alone by default: it may hold
 *                                       edits made in the editor), then publish it
 *   npm run seed -- --unpublish ai-1    take these units away from learners, like the editor's Unpublish (the draft,
 *                                       the media and learners' progress stay). Retired courses live in content/retired.
 *
 * Unit and lesson ids are kept, so learners' progress, notes and certificates still match.
 * Build the functions first (npm run build --prefix functions): this reuses their code.
 * Credentials (real project): as for `npm run superadmin`, either a service-account key in GOOGLE_APPLICATION_CREDENTIALS
 * or `gcloud auth application-default login` with an account that can manage the project.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contentTypeOf, kitFiles, mediaPathOf, mediaPaths, withKitUrls } from "./lib/kits.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const emulator = args.includes("--emulator");
const replace = args.includes("--replace");
const unpublish = args.includes("--unpublish");
const only = args.filter((a) => !a.startsWith("--"));
if (unpublish && !only.length) { console.error("Name the units to unpublish: npm run seed -- --unpublish <id>…"); process.exit(1); }
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
const { publishDraft, unpublishDraft } = await import(pathToFileURL(join(lib, "content.js")).href);
const { bucket } = await import(pathToFileURL(join(lib, "storage.js")).href);
const { db } = await import(pathToFileURL(join(lib, "admin.js")).href);
const { FieldValue } = require("firebase-admin/firestore");

const urlOf = (path) => `${emulator ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com"}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;

if (unpublish) {
  console.log(`Unpublishing ${only.join(", ")} in ${emulator ? "the emulators" : projectId}`);
  let failed = 0;
  for (const id of only) {
    try { await unpublishDraft("public", id, "seed"); console.log(`  ${id}: unpublished`); }
    catch (e) { failed++; console.error(`  ${id}: not unpublished. ${e.message}`); }
  }
  console.log(failed ? `${failed} unit(s) failed.` : `Done. The catalog: ${urlOf("content/catalog.json")}`);
  process.exit(failed ? 1 : 0);
}

const files = readdirSync(join(ROOT, "content/units")).filter((f) => f.endsWith(".json") && (!only.length || only.includes(basename(f, ".json"))));
if (!files.length) { console.error(`No units to seed${only.length ? ` among: ${only.join(", ")}` : ""}.`); process.exit(1); }

const hasKit = (file) => existsSync(join(ROOT, "content/kits", file));

/** Uploads the unit's media that is on this computer; returns app path → download URL, and how many files were missing. */
async function uploadMedia(unitId, paths) {
  const media = new Map();
  let missing = 0, sent = 0;
  const todo = paths.filter((p) => existsSync(join(ROOT, "content", p)) || (missing++, false));
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async (p) => {
    const body = readFileSync(join(ROOT, "content", p));
    const dest = mediaPathOf(unitId, p, createHash("sha256").update(body).digest("hex").slice(0, 12));
    const file = bucket().file(dest);
    if (!(await file.exists())[0]) {
      await file.save(body, { resumable: false, metadata: { contentType: contentTypeOf(extname(p).slice(1)), cacheControl: "public, max-age=31536000, immutable" } });
      sent++;
    }
    media.set(p, urlOf(dest));
  }));
  return { media, missing, sent };
}

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
    const kits = kitFiles(source, hasKit);
    for (const k of kits) {
      const local = join(ROOT, "content/kits", k.file);
      if (!existsSync(local)) throw new Error(`${k.file} is missing: build the kits (npm run kits -w @darsi/web)`);
      await bucket().upload(local, { destination: k.path, resumable: false, metadata: { contentType: contentTypeOf(k.fmt), cacheControl: "public, max-age=86400" } });
    }
    const { media, missing, sent } = await uploadMedia(id, mediaPaths(source));
    const unit = withKitUrls(source, urlOf, { has: hasKit, media });
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
    console.log(`  ${id}: ${kits.length} kit files and ${media.size} media files (${sent} new) uploaded, published as v${version}`
      + (missing ? `. ${missing} media file(s) aren't on this computer and keep their app paths.` : ""));
  } catch (e) {
    failed++;
    console.error(`  ${id}: not published. ${e.message}${e.details?.issues ? ` ${JSON.stringify(e.details.issues.slice(0, 5))}` : ""}`);
  }
}
console.log(failed ? `${failed} unit(s) failed.` : `Done. Learners see them on their next visit: ${urlOf("content/catalog.json")}`);
process.exit(failed ? 1 : 0);
