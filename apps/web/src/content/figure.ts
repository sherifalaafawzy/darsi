/**
 * Illustrations in a lesson's text: a paragraph that is only ![caption](src) shows as a figure (ReadingBody in
 * lesson/StepView.tsx, SetupBody in lesson/CapstoneParts.tsx) and is saved with a downloaded course (content/load.ts).
 * Arabic text may hold isolates inside the path, so they are read past. The source is an app path under /media/ (the dev
 * server serves content/media there), or this project's published course media in Storage, where `npm run seed` uploads
 * them and rewrites the links (scripts/lib/kits.mjs withKitUrls). Pictures from anywhere else are never loaded.
 * Pure, with no imports but the Firebase settings (no SDK), so the startup bundle may use it.
 */
import { firebaseConfig } from "../firebase-config";

const MARKS = /[⁦-⁩‪-‮]/g;
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/** Whether a lesson may show this picture: an app /media/ path, or the bucket's published course media. */
export function figureSrcOk(src: string, bucket: string | undefined = firebaseConfig.storageBucket): boolean {
  if (/^\/media\/[^\s?#]+$/.test(src) && !src.includes("..")) return true;
  if (!bucket) return false;
  const path = `/v0/b/${bucket}/o/content%2Fmedia%2F`;
  return ["https://firebasestorage.googleapis.com", "http://127.0.0.1:9199", "http://localhost:9199"].some((host) => src.startsWith(host + path));
}

/** A lone picture paragraph's caption and source; null for any other paragraph. */
export function figureOf(paragraph: string, bucket: string | undefined = firebaseConfig.storageBucket): { alt: string; src: string } | null {
  const m = paragraph.trim().replace(MARKS, "").match(FIGURE);
  return m && figureSrcOk(m[2], bucket) ? { alt: m[1], src: m[2] } : null;
}
