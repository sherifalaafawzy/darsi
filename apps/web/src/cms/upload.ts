/**
 * Media uploads for authored lessons (Storage rules: firebase/storage.rules, "Course editor"). Files go under the unit's
 * media folder with a unique suffix: replacing a file never changes the link a published version already points to.
 * The returned download URL is what goes into the lesson (videos play from it without headers).
 */
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../firebase";

export type MediaKind = "video" | "captions" | "pdf" | "pptx";
/** Limits match the Storage rules. */
export const MEDIA: Record<MediaKind, { accept: string; type: string; maxMB: number; ext: string }> = {
  video: { accept: "video/mp4,.mp4", type: "video/mp4", maxMB: 60, ext: "mp4" },
  captions: { accept: "text/vtt,.vtt", type: "text/vtt", maxMB: 0.5, ext: "vtt" },
  pdf: { accept: "application/pdf,.pdf", type: "application/pdf", maxMB: 20, ext: "pdf" },
  pptx: { accept: "application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxMB: 20, ext: "pptx" },
};

export const mediaPath = (owner: string, unitId: string, name: string) => `${owner === "public" ? "content" : `orgs/${owner}`}/media/${unitId}/${name}`;
/** The file's kind from its name when the browser reports no type (common for .vtt and on some Android phones). */
export const fits = (file: File, kind: MediaKind) => file.type === MEDIA[kind].type || file.name.toLowerCase().endsWith(`.${MEDIA[kind].ext}`);

export function uploadMedia(owner: string, unitId: string, base: string, kind: MediaKind, file: File, onProgress: (pct: number) => void) {
  const name = `${base.replace(/[^\w-]/g, "_")}_${Date.now().toString(36)}.${MEDIA[kind].ext}`;
  let cancel = () => {};
  const done = (async () => {
    const r = ref(await storage(), mediaPath(owner, unitId, name));
    const task = uploadBytesResumable(r, file, { contentType: MEDIA[kind].type });
    cancel = () => task.cancel();
    await new Promise<void>((resolve, reject) => task.on("state_changed", (s) => onProgress(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)), reject, () => resolve()));
    return { url: await getDownloadURL(r), bytes: file.size };
  })();
  return { done, cancel: () => cancel() };
}
