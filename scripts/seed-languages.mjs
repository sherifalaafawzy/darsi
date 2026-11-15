#!/usr/bin/env node
/**
 * The languages beyond English and Arabic, kept in the repository as content/i18n/<code>.json
 * ({code, native, english, dir, numerals, messages}), loaded into Firestore the way the Languages page saves them
 * (translations/{code}, a draft with a rev) and, with --publish, published through the same code as the page's Publish
 * (publishLanguageDraft in functions/src/languages.ts: the pack content/i18n/{code}/v{n}.json and the settings).
 *
 *   npm run languages -- --emulator                 the local Emulator Suite (demo-darsi): save every pack as a draft
 *   npm run languages -- fr ur                      only these languages
 *   npm run languages -- --publish                  save, then publish (the real project: only with the user's yes)
 *   npm run languages -- --replace                  overwrite a draft that differs from the file (it may hold edits
 *                                                   made on /super/languages, so it is left alone by default)
 *   npm run languages -- --pull fr                  write the draft in Firestore back to content/i18n/fr.json
 *                                                   (after someone fixed strings on the Languages page)
 *   npm run languages -- --unpublish fr             take a language off the pickers (the draft stays)
 *
 * Build the functions first (npm run build --prefix functions): this reuses their code. Credentials as for
 * `npm run seed` (a service-account key in GOOGLE_APPLICATION_CREDENTIALS, or application-default login).
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "content/i18n");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const emulator = flag("--emulator");
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
if (!existsSync(join(lib, "languages.js"))) { console.error("Build the functions first: npm run build --prefix functions"); process.exit(1); }
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
initializeApp({ projectId, storageBucket: BUCKET, ...(emulator ? {} : { credential: applicationDefault() }) });
const { publishLanguageDraft, unpublishLanguageDraft } = await import(pathToFileURL(join(lib, "languages.js")).href);
const { checkTranslation, cleanMessages, validateLanguage } = await import(pathToFileURL(join(lib, "shared/languages.js")).href);
const { db } = await import(pathToFileURL(join(lib, "admin.js")).href);
const { FieldValue } = require("firebase-admin/firestore");

/** The strings a pack translates: the same files as PACK_SOURCES in apps/web/src/i18n/translatable.ts. */
const SOURCES = ["i18n", "tour/strings", "bugs/strings", "tutor/strings", "upgrade/strings"];
const en = Object.assign({}, ...SOURCES.map((s) => JSON.parse(readFileSync(join(ROOT, "apps/web/src", s, "en.json"), "utf8"))));
const BY = "seed";
const where = emulator ? "the emulators" : projectId;
let failed = 0;

if (flag("--unpublish") || flag("--pull")) {
  if (!only.length) { console.error("Name the languages: npm run languages -- --unpublish <code>…"); process.exit(1); }
  for (const code of only) {
    try {
      if (flag("--unpublish")) { await unpublishLanguageDraft(code, BY); console.log(`  ${code}: unpublished in ${where}`); continue; }
      const snap = await db.doc(`translations/${code}`).get();
      if (!snap.exists) throw new Error("no draft in Firestore");
      const d = snap.data();
      const out = { code, native: d.native, english: d.english, dir: d.dir, numerals: d.numerals,
        messages: Object.fromEntries(Object.keys(en).filter((k) => d.messages?.[k]).map((k) => [k, d.messages[k]])) };
      writeFileSync(join(DIR, `${code}.json`), JSON.stringify(out, null, 1) + "\n");
      console.log(`  ${code}: draft rev ${d.rev} written to content/i18n/${code}.json`);
    } catch (e) { failed++; console.error(`  ${code}: ${e.message}`); }
  }
  process.exit(failed ? 1 : 0);
}

const codes = only.length ? only : readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
console.log(`Languages ${codes.join(", ")} → ${where}${flag("--publish") ? ", then publish" : " (drafts only)"}`);
const same = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());

for (const code of codes) {
  try {
    const file = JSON.parse(readFileSync(join(DIR, `${code}.json`), "utf8"));
    if (file.code !== code) throw new Error(`the file says code "${file.code}"`);
    const check = checkTranslation(file.messages, en);
    if (check.placeholders.length) throw new Error(`placeholders differ from the English: ${check.placeholders.join(", ")}`);
    const messages = cleanMessages(file.messages, en);
    const def = { code, native: file.native, english: file.english, dir: file.dir, numerals: file.numerals };
    const problems = validateLanguage(def, messages);
    if (problems.length) throw new Error(`problems: ${problems.join(", ")}`);

    const ref = db.doc(`translations/${code}`);
    const old = await ref.get();
    const o = old.data();
    const unchanged = old.exists && same(o.messages, messages) && ["native", "english", "dir", "numerals"].every((k) => o[k] === def[k]);
    if (old.exists && !unchanged && !flag("--replace")) {
      console.log(`  ${code}: the draft in Firestore (rev ${o.rev}) differs from the file; left alone (--replace overwrites it, --pull keeps it)`);
    } else if (!unchanged) {
      const rev = (Number(o?.rev) || 0) + 1;
      await ref.set({ ...def, messages, rev, updatedAt: FieldValue.serverTimestamp(), updatedBy: BY }, { merge: true });
      console.log(`  ${code}: draft saved as rev ${rev} (${check.done}/${check.total} strings${check.missing.length ? `, ${check.missing.length} show in English` : ""})`);
    } else console.log(`  ${code}: draft already matches the file (rev ${o.rev})`);

    if (flag("--publish")) {
      const live = (await ref.get()).data();
      if (live.published && live.published.rev === live.rev) { console.log(`  ${code}: already published (v${live.published.version})`); continue; }
      const r = await publishLanguageDraft(code, BY);
      console.log(`  ${code}: published as v${r.version}`);
    }
  } catch (e) { failed++; console.error(`  ${code}: not done. ${e.message}`); }
}
console.log(failed ? `${failed} language(s) failed.` : "Done.");
process.exit(failed ? 1 : 0);
