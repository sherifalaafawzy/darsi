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
