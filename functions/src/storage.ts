import { getStorage } from "firebase-admin/storage";

/**
 * The app's bucket. Never the project default: darsi-f0685's default bucket was deleted (CLAUDE.md, Firebase project).
 * In the emulator it is the demo project's default bucket, which is what the web app's .env.development uses.
 */
const BUCKET = process.env.CONTENT_BUCKET || (process.env.FUNCTIONS_EMULATOR === "true" ? `${process.env.GCLOUD_PROJECT}.appspot.com` : "darsi-f0685");
export const bucket = () => getStorage().bucket(BUCKET);

/** A small public JSON file that phones re-check at most once a minute (catalogs, settings). */
export const savePublicJson = (path: string, data: unknown, isPublic = true) => bucket().file(path).save(JSON.stringify(data), {
  resumable: false, contentType: "application/json; charset=utf-8",
  metadata: { cacheControl: `${isPublic ? "public" : "private"}, max-age=60` },
});
