import { getStorage } from "firebase-admin/storage";

/**
 * The app's bucket. Never the project default: darsi-f0685's default bucket was deleted (CLAUDE.md, Firebase project).
 * In the emulator it is the demo project's default bucket, which is what the web app's .env.development uses.
 */
export const BUCKET = process.env.CONTENT_BUCKET || (process.env.FUNCTIONS_EMULATOR === "true" ? `${process.env.GCLOUD_PROJECT}.appspot.com` : "darsi-f0685");
export const bucket = () => getStorage().bucket(BUCKET);
/**
 * The address anyone fetches a public file at (content/…, which the Storage rules let everyone read), as the app builds
 * it (content/load.ts storageUrl): Firebase Storage's REST endpoint, which answers every origin, or the emulator's.
 */
export const publicFileUrl = (path: string) => {
  const emu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  return `${emu ? `http://${emu.replace(/^https?:\/\//, "")}` : "https://firebasestorage.googleapis.com"}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
};

/**
 * A JSON file phones read (catalogs, units, settings, language packs), stored gzipped (Content-Encoding: gzip): a
 * browser asks for gzip and gets about a quarter of the bytes, and unpacks it itself, so `fetch().json()` and the
 * Storage SDK read it unchanged; a client that doesn't ask gets it unpacked by Storage, and the Admin SDK's
 * download() unpacks it too. JSON shrinks 3 to 8 times, and learners pay for every byte.
 */
export async function saveJson(path: string, body: string, cacheControl: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await bucket().file(path).save(body, { resumable: false, gzip: true, contentType: "application/json; charset=utf-8", metadata: { cacheControl } });
      return;
    } catch (e) {
      if (i >= SAVE_TRIES - 1 || !isBusy(e)) throw e;
      await new Promise((ok) => setTimeout(ok, SAVE_WAIT_MS * 2 ** i));
    }
  }
}
/**
 * Storage refuses a second change to one object within about a second (429 "rate limit for object mutation"): two
 * admins saving at once, or a script publishing course after course into one catalog.json. Every caller has already
 * committed to Firestore when it writes its file (publish, unpublish, settings, plans, languages, sites), so a write
 * that gave up there left the editor and what phones read disagreeing. saveJson therefore waits and tries again itself:
 * 5 tries, 1.2 s, 2.4 s, 4.8 s and 9.6 s apart (18 s at most, inside every caller's time limit). Only "busy" answers
 * are tried again (429, 503); a refusal (403, 404, a bad request) is thrown at once.
 */
export const SAVE_TRIES = 5;
const SAVE_WAIT_MS = 1200;
function isBusy(e: unknown): boolean {
  const code = Number((e as { code?: unknown } | null)?.code);
  return code === 429 || code === 503 || /rate limit/i.test(String((e as { message?: unknown } | null)?.message ?? e));
}

/** A small public JSON file that phones re-check at most once a minute (catalogs, settings). */
export const savePublicJson = (path: string, data: unknown, isPublic = true) =>
  saveJson(path, JSON.stringify(data), `${isPublic ? "public" : "private"}, max-age=60`);
/** savePublicJson under the name that says what callers rely on: it waits out Storage's "too soon" answers (saveJson). */
export const saveRetrying = (path: string, data: unknown, isPublic = true) => savePublicJson(path, data, isPublic);
