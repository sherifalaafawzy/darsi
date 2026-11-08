import { getStorage } from "firebase-admin/storage";

/**
 * The app's bucket. Never the project default: darsi-f0685's default bucket was deleted (CLAUDE.md, Firebase project).
 * In the emulator it is the demo project's default bucket, which is what the web app's .env.development uses.
 */
const BUCKET = process.env.CONTENT_BUCKET || (process.env.FUNCTIONS_EMULATOR === "true" ? `${process.env.GCLOUD_PROJECT}.appspot.com` : "darsi-f0685");
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
export const saveJson = (path: string, body: string, cacheControl: string) => bucket().file(path).save(body, {
  resumable: false, gzip: true, contentType: "application/json; charset=utf-8", metadata: { cacheControl },
});

/** A small public JSON file that phones re-check at most once a minute (catalogs, settings). */
export const savePublicJson = (path: string, data: unknown, isPublic = true) =>
  saveJson(path, JSON.stringify(data), `${isPublic ? "public" : "private"}, max-age=60`);
