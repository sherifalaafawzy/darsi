import { useEffect, useState } from "react";
import { Button, Icon, QuestionHeader } from "@darsi/design-system";
import { loadFirebase } from "../fb";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { ProjectStep } from "../content/types";

/**
 * Phone photos are 2–5 MB and teachers often pay per MB: shrink photos to at most 1280 px and re-encode them as JPEG
 * (a few hundred KB) before upload. PDFs, HEIC and anything the browser can't decode go up unchanged.
 */
async function shrinkImage(file: File, max = 1280): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400_000) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs would turn black in JPEG
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height); bmp.close();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.72));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

/** A real classroom task. Evidence (text + optional photo/PDF) goes to Firestore/Storage for teacher review. */
export function ProjectView({ step, lessonId, unitId, onReady, preview }: { step: ProjectStep; lessonId: string; unitId: string; onReady: (r: boolean) => void; preview?: boolean }) {
  const { t, L } = useI18n();
  const { user, orgId } = useAuth();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "later">("idle");
  useEffect(() => { onReady(state === "sent" || state === "later"); }, [state, onReady]);
  const submit = async () => {
    if (!user) return;
    setState("sending");
    try {
      let fileUrl: string | null = null, fileName: string | null = null;
      if (file) {
        const [{ getDownloadURL, ref, uploadBytes }, s, body] = await Promise.all([import("firebase/storage"), loadFirebase().then((fb) => fb.storage()), shrinkImage(file)]);
        const safe = file.name.replace(/[^\w.-]/g, "_"), jpeg = body !== file;
        const r = ref(s, `submissions/${orgId ?? "none"}/${user.uid}/${lessonId}-${Date.now()}-${jpeg ? safe.replace(/\.\w+$/, "") + ".jpg" : safe}`);
        await uploadBytes(r, body, { contentType: jpeg ? "image/jpeg" : file.type });
        fileUrl = await getDownloadURL(r); fileName = file.name;
      }
      const [{ db }, { addDoc, collection, serverTimestamp }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      await addDoc(collection(db, "users", user.uid, "submissions"), { lessonId, unitId, stepId: step.id, orgId: orgId ?? null, text, fileUrl, fileName, status: "submitted", createdAt: serverTimestamp() });
      setState("sent");
    } catch { setState("error"); }
  };
  return (
    <div className="stack">
      <QuestionHeader type="reflect" icon="target" typeLabel={t("project.kicker")} prompt={L(step.prompt)} />
      <div className="project-card">
        <p>{L(step.task)}</p>
        <p><strong>{t("project.deliver")}</strong> {L(step.deliverable)}</p>
        <div><strong>{t("project.rubric")}</strong><ul>{step.rubric.map((r, i) => <li key={i}>{L(r.criterion)}</li>)}</ul></div>
      </div>
      {state === "sent" ? <p className="notice ok"><Icon name="check" size={18} /> {t("project.sent")}</p> : <>
        <label className="dr-field-label" htmlFor="evidence">{t("project.evidence")}</label>
        <textarea id="evidence" className="dr-reflect-input" dir="auto" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("project.placeholder")} />
        <label className="file-pick"><Icon name="image" size={20} /><span>{file ? file.name : t("project.attach")}</span>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {state === "error" && <p className="notice err">{t("project.error")}</p>}
        <div className="row-gap">
          <Button icon="check" disabled={!text.trim() || state === "sending" || !user || preview} loading={state === "sending"} onClick={submit}>{t("project.submit")}</Button>
          <Button variant="ghost" onClick={() => setState("later")}>{t("project.later")}</Button>
        </div>
        {!user && <p className="muted small">{t("project.guest")}</p>}
      </>}
    </div>
  );
}
