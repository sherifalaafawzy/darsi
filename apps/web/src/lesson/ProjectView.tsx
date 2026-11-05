import { useEffect, useState } from "react";
import { Button, ChoiceCard, Icon, QuestionHeader } from "@darsi/design-system";
import { call, loadFirebase } from "../fb";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { ProjectStep } from "../content/types";
import { GITHUB_REPO, MAX_LINKS, type CapResult } from "../content/capstone";
import { CapstoneBrief, CapstoneResult } from "./CapstoneParts";
import { CT } from "./capstoneText";

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

/** A draft kept on this phone, so work typed offline (or before a refresh) isn't lost. Files are picked again. */
interface Draft { text: string; explain: string; ai: "" | "none" | "some"; aiHow: string; repo: string; links: string; check: string }
const EMPTY: Draft = { text: "", explain: "", ai: "", aiHow: "", repo: "", links: "", check: "" };
const draftKey = (lessonId: string, stepId: string) => `darsi-project-draft:${lessonId}:${stepId}`;
export function readDraft(lessonId: string, stepId: string): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(draftKey(lessonId, stepId)) ?? "{}") }; } catch { return EMPTY; }
}
const writeDraft = (lessonId: string, stepId: string, d: Draft | null) => {
  try { if (d) localStorage.setItem(draftKey(lessonId, stepId), JSON.stringify(d)); else localStorage.removeItem(draftKey(lessonId, stepId)); } catch { /* storage full or blocked */ }
};
/** A final project takes up to this many files: photos, PDFs or voice notes. */
export const MAX_FILES = 4;

/**
 * A real classroom task. Evidence (text + optional photos, PDFs or voice notes) goes to Firestore/Storage, where the
 * student's teacher, and university teachers a platform admin gave access to the course, can see it. A track's final
 * project (`final`) also asks the student to explain how it works in their own words and to say whether they used AI.
 * Nothing here is graded.
 *
 * A capstone milestone (step.evidence) also takes a GitHub repository, links and the starter's darsi-check.json, and is
 * sent through the checkCapstone function, which checks them, adds an advisory AI review and writes the submission
 * (learners can't write those fields themselves). Nothing the learner built is run by Darsi.
 */
export function ProjectView({ step, lessonId, unitId, onReady, preview }: { step: ProjectStep; lessonId: string; unitId: string; onReady: (r: boolean) => void; preview?: boolean }) {
  const { t, L } = useI18n();
  const { user, profile, orgId } = useAuth();
  const [d, setD] = useState<Draft>(() => readDraft(lessonId, step.id));
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "later" | "offline">("idle");
  useEffect(() => { onReady(state === "sent" || state === "later"); }, [state, onReady]);
  const edit = (patch: Partial<Draft>) => setD((x) => { const n = { ...x, ...patch }; writeDraft(lessonId, step.id, n); return n; });
  const final = !!step.final;
  const ev = new Set((step.evidence ?? []).map((e) => e.kind)), cap = ev.size > 0;
  // Capstone milestones ask what a final project asks: an explanation in the learner's own words and any AI use.
  const asks = final || cap;
  const [result, setResult] = useState<CapResult | null>(null);
  const links = d.links.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const repoOk = !ev.has("repo") || GITHUB_REPO.test(d.repo.trim());
  const linksOk = links.length <= MAX_LINKS && links.every((l) => /^https:\/\/\S+$/.test(l)) && (!ev.has("url") || links.length > 0);
  let checkOk = true;
  if (d.check) { try { JSON.parse(d.check); } catch { checkOk = false; } }
  const capReady = !cap || (repoOk && linksOk && checkOk && (!(ev.has("check") || ev.has("scan")) || !!d.check));
  const ready = !!d.text.trim() && capReady && (!asks || (!!d.explain.trim() && (d.ai === "none" || (d.ai === "some" && !!d.aiHow.trim()))));
  const submit = async () => {
    if (!user) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setState("offline"); return; }
    setState("sending");
    try {
      const sent: { url: string; name: string; type: string }[] = [];
      if (files.length) {
        const [{ getDownloadURL, ref, uploadBytes }, s] = await Promise.all([import("firebase/storage"), loadFirebase().then((fb) => fb.storage())]);
        for (const file of files) {
          const body = await shrinkImage(file);
          const safe = file.name.replace(/[^\w.-]/g, "_"), jpeg = body !== file;
          // One folder per course, so access to a course's projects can be granted (firebase/storage.rules).
          const r = ref(s, `submissions/${orgId ?? "none"}/${user.uid}/${unitId}/${lessonId}-${Date.now()}-${jpeg ? safe.replace(/\.\w+$/, "") + ".jpg" : safe}`);
          const type = jpeg ? "image/jpeg" : file.type;
          await uploadBytes(r, body, { contentType: type });
          sent.push({ url: await getDownloadURL(r), name: file.name, type });
        }
      }
      if (cap) {
        const r = await call<Record<string, unknown>, CapResult>("checkCapstone")({
          unitId, lessonId, stepId: step.id, text: d.text, explain: d.explain, aiUse: d.ai === "some" ? d.aiHow : "none", name: profile?.name ?? user.displayName ?? "",
          repo: d.repo.trim(), links, check: d.check || null, files: sent,
        });
        setResult(r);
        writeDraft(lessonId, step.id, { ...d, check: "" });
        setState("sent");
        return;
      }
      const [{ db }, { addDoc, collection, serverTimestamp }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      await addDoc(collection(db, "users", user.uid, "submissions"), {
        lessonId, unitId, stepId: step.id, orgId: orgId ?? null, text: d.text, fileUrl: sent[0]?.url ?? null, fileName: sent[0]?.name ?? null,
        ...(sent.length ? { files: sent } : {}), ...(final ? { final: true, explain: d.explain, aiUse: d.ai === "some" ? d.aiHow : "none", name: profile?.name ?? user.displayName ?? "" } : {}),
        status: "submitted", createdAt: serverTimestamp(),
      });
      writeDraft(lessonId, step.id, null);
      setState("sent");
    } catch { setState("error"); }
  };
  const many = final || cap;
  const pick = (list: FileList | null) => setFiles((x) => [...x, ...Array.from(list ?? [])].slice(0, many ? MAX_FILES : 1));
  const pickCheck = async (list: FileList | null) => { const f = list?.[0]; if (f) edit({ check: (await f.text()).slice(0, 100_000) }); };
  return (
    <div className="stack">
      <QuestionHeader type="reflect" icon="target" typeLabel={cap ? L(CT.kicker) : t(final ? "project.finalKicker" : "project.kicker")} prompt={L(step.prompt)} />
      <div className="project-card">
        <p>{L(step.task)}</p>
        {cap && <CapstoneBrief step={step} />}
        <p><strong>{t("project.deliver")}</strong> {L(step.deliverable)}</p>
        <div><strong>{t(final ? "project.checklist" : "project.rubric")}</strong><ul>{step.rubric.map((r, i) => <li key={i}>{L(r.criterion)}</li>)}</ul></div>
      </div>
      {state === "sent" && result ? <div className="stack-sm">
        <p className="notice ok"><Icon name="check" size={18} /> {L(result.queue === "staff" ? CT.sentStaff : CT.sentTeacher)}</p>
        <CapstoneResult checks={result.checks} review={result.aiReview} rubric={step.rubric} />
        <div><Button size="sm" variant="secondary" onClick={() => { setResult(null); setState("idle"); }}>{L(CT.sendAgain)}</Button></div>
      </div> : state === "sent" ? <p className="notice ok"><Icon name="check" size={18} /> {t(final ? "project.finalSent" : "project.sent")}</p> : <>
        <label className="dr-field-label" htmlFor={`evidence-${step.id}`}>{t("project.evidence")}</label>
        <textarea id={`evidence-${step.id}`} className="dr-reflect-input" dir="auto" rows={5} value={d.text} onChange={(e) => edit({ text: e.target.value })} placeholder={t("project.placeholder")} />
        {cap && <fieldset className="stack-sm">
          <legend className="dr-field-label">{L(CT.send)}</legend>
          {ev.has("repo") && <>
            <label className="dr-field-label" htmlFor={`repo-${step.id}`}>{L(CT.repo)}</label>
            <input id={`repo-${step.id}`} className="dr-reflect-input" dir="ltr" inputMode="url" value={d.repo} onChange={(e) => edit({ repo: e.target.value })} placeholder="https://github.com/you/your-project" />
            <p className="muted small">{L(d.repo && !repoOk ? CT.repoBad : CT.repoHint)}</p>
          </>}
          {ev.has("release") && <p className="muted small">{L(CT.release)}</p>}
          {ev.has("scan") && <p className="notice">{L(CT.scan)}</p>}
          <label className="dr-field-label" htmlFor={`links-${step.id}`}>{L(CT.links)}</label>
          <textarea id={`links-${step.id}`} className="dr-reflect-input" dir="ltr" rows={2} value={d.links} onChange={(e) => edit({ links: e.target.value })} />
          {!linksOk && d.links && <p className="notice err">{L(CT.linksBad)}</p>}
          {(ev.has("check") || ev.has("scan")) && <>
            <span className="dr-field-label">{L(CT.check)}</span>
            <label className="file-pick"><Icon name="file" size={20} /><span>{d.check ? "darsi-check.json ✓" : L(CT.checkPick)}</span>
              <input type="file" accept="application/json,.json" onChange={(e) => pickCheck(e.target.files)} /></label>
            <p className="muted small">{L(checkOk ? CT.checkHint : CT.checkBad)}</p>
          </>}
        </fieldset>}
        {asks && <>
          <label className="dr-field-label" htmlFor={`explain-${step.id}`}>{t("project.explain")}</label>
          <textarea id={`explain-${step.id}`} className="dr-reflect-input" dir="auto" rows={5} value={d.explain} onChange={(e) => edit({ explain: e.target.value })} placeholder={t("project.explainHint")} />
          <fieldset className="stack-sm project-ai">
            <legend className="dr-field-label">{t("project.ai")}</legend>
            <div role="radiogroup" className="stack-sm">
              <ChoiceCard title={t("project.aiNone")} selected={d.ai === "none"} onClick={() => edit({ ai: "none" })} />
              <ChoiceCard title={t("project.aiSome")} selected={d.ai === "some"} onClick={() => edit({ ai: "some" })} />
            </div>
            {d.ai === "some" && <textarea aria-label={t("project.aiHow")} className="dr-reflect-input" dir="auto" rows={3} value={d.aiHow} onChange={(e) => edit({ aiHow: e.target.value })} placeholder={t("project.aiHow")} />}
          </fieldset>
        </>}
        <label className="file-pick"><Icon name="image" size={20} /><span>{files.length ? files.map((f) => f.name).join(t("common.sep")) : t(many ? "project.attachMany" : "project.attach")}</span>
          <input type="file" multiple={many} accept={many ? "image/*,application/pdf,audio/*" : "image/*,application/pdf"} onChange={(e) => pick(e.target.files)} /></label>
        {files.length > 0 && <Button size="sm" variant="ghost" onClick={() => setFiles([])}>{t("project.clearFiles")}</Button>}
        {asks && <p className="muted small">{t("project.draftKept")}</p>}
        {state === "sending" && cap && <p className="muted small">{L(CT.checking)}</p>}
        {state === "error" && <p className="notice err">{t("project.error")}</p>}
        {state === "offline" && <p className="notice">{t("project.offline")}</p>}
        <div className="row-gap">
          <Button icon="check" disabled={!ready || state === "sending" || !user || preview} loading={state === "sending"} onClick={submit}>{cap ? L(CT.sendBtn) : t(final ? "project.finalSubmit" : "project.submit")}</Button>
          <Button variant="ghost" onClick={() => setState("later")}>{t("project.later")}</Button>
        </div>
        {!user && <p className="muted small">{t("project.guest")}</p>}
      </>}
    </div>
  );
}
