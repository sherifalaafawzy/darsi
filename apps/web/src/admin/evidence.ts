import { firebaseConfig } from "../firebase-config";

/**
 * Whether a project's attachment link is a file in Darsi's own Storage, under the projects folder (M8 in the security
 * review). The rules accept nothing else since 2026-11, but older projects could hold any link a learner typed, and a
 * link that looks like an attachment but opens a copy of the sign-in page is phishing: such links are not shown.
 */
export function isEvidenceUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2000) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const bucket = firebaseConfig.storageBucket ?? "";
  const storage = u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com";
  // The Storage emulator (npm run local, the e2e suite), only on this computer.
  const emulator = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.port === "9199";
  return (storage || emulator) && !!bucket && u.pathname.startsWith(`/v0/b/${bucket}/o/submissions%2F`) && !u.username && !u.password;
}

/**
 * The Storage path of a project's attachment ("submissions/…"), from its link. Reviewers' screens read the file through
 * the SDK with their own sign-in, so the Storage rules decide who sees it. Projects sent before 2026-11 hold download
 * links with a token that works for whoever has it; the token is ignored here, and new projects store links without one.
 */
export function evidencePath(url: unknown): string | null {
  if (!isEvidenceUrl(url)) return null;
  const p = new URL(url).pathname;
  let path: string;
  try { path = decodeURIComponent(p.slice(p.indexOf("/o/") + 3)); } catch { return null; }
  return path.startsWith("submissions/") && !path.split("/").some((s) => !s || s === "." || s === "..") ? path : null;
}

/** What a browser may show inside the card: photos, voice notes and short videos. Never SVG or HTML, whose scripts would run. */
const SHOWN = /^(image\/(jpeg|png|webp|gif)|audio\/[a-z0-9.+-]{1,40}|video\/mp4)$/;
const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", pdf: "application/pdf",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm",
};
/**
 * How to show an attachment once read: a type the card can show, "application/pdf", or "application/octet-stream" (only
 * saved, never opened as a page). The Storage emulator answers octet-stream, so the type the project stored and then the
 * file's extension are tried after the type Storage sent.
 */
export function shownType(blobType: string | undefined, storedType: string | undefined, name: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  for (const t of [blobType, storedType, ext ? BY_EXT[ext] : undefined]) {
    const x = (t ?? "").split(";")[0].trim().toLowerCase();
    if (SHOWN.test(x) || x === "application/pdf") return x;
  }
  return "application/octet-stream";
}
