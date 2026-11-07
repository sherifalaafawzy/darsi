import { useEffect, useRef, useState } from "react";
import type { StorageReference } from "firebase/storage";
import { Link, useInRouterContext } from "react-router-dom";
import { Button, ChoiceCard, Icon, QuestionHeader } from "@darsi/design-system";
import { call, loadFirebase } from "../fb";
import { useAuth } from "../auth/AuthProvider";
import { isolate, useI18n } from "../i18n";
import type { ProjectStep } from "../content/types";
import { GITHUB_REPO, MAX_LINKS, type CapResult } from "../content/capstone";
import { CapstoneBrief, CapstoneResult } from "./CapstoneParts";
import { CT, refusal } from "./capstoneText";
import { MyReview } from "./MyReview";

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

/**
 * A draft kept on this phone, so work typed offline (or before a refresh) isn't lost. Files are picked again. A capstone
 * milestone also remembers its last successful send (`sentAt`, ms, the submission's id, and the account that sent it):
 * coming back, that account sees when it was sent and can go on, and the lesson opens at the first milestone it hasn't
 * sent yet (LessonScreen). On a shared phone, another account never takes someone else's send for its own.
 */
interface Draft { text: string; explain: string; ai: "" | "none" | "some"; aiHow: string; repo: string; links: string; check: string; sentAt?: number; sentId?: string; sentBy?: string }
const EMPTY: Draft = { text: "", explain: "", ai: "", aiHow: "", repo: "", links: "", check: "" };
const draftKey = (lessonId: string, stepId: string) => `darsi-project-draft:${lessonId}:${stepId}`;
export function readDraft(lessonId: string, stepId: string): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(draftKey(lessonId, stepId)) ?? "{}") }; } catch { return EMPTY; }
}
const writeDraft = (lessonId: string, stepId: string, d: Draft | null) => {
  try { if (d) localStorage.setItem(draftKey(lessonId, stepId), JSON.stringify(d)); else localStorage.removeItem(draftKey(lessonId, stepId)); } catch { /* storage full or blocked */ }
};
/** When this account last sent a capstone milestone from this phone (ms), if it has. */
const sentAtBy = (d: Draft, uid: string | null | undefined): number | undefined =>
  uid && d.sentBy === uid && typeof d.sentAt === "number" && d.sentAt > 0 ? d.sentAt : undefined;
export const milestoneSentAt = (lessonId: string, stepId: string, uid: string | null | undefined): number | undefined =>
  sentAtBy(readDraft(lessonId, stepId), uid);
/** A capstone milestone: a project step that takes evidence (a repository, links, darsi-check.json…). */
export const isMilestone = (s: { type: string; evidence?: unknown[] }) => s.type === "project" && !!s.evidence?.length;
/** A final project takes up to this many files: photos, PDFs or voice notes. */
export const MAX_FILES = 4;
/** The most firestore.rules (and checkCapstone) take: the evidence and the explanation, how AI was used, and a file. */
export const MAX_TEXT = 20_000, MAX_AI_USE = 5_000, MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Refused by the rules (Firestore, Storage or a function), not by the connection: sending it again as it is won't help. */
const deniedError = (e: unknown) => /permission-denied|unauthorized|unauthenticated/.test(String((e as { code?: unknown } | null)?.code ?? ""));

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
export function ProjectView({ step, lessonId, unitId, onReady, preview, announce, student }: {
  step: ProjectStep; lessonId: string; unitId: string; onReady: (r: boolean) => void; preview?: boolean;
  /** The lesson's live region: says when sending failed, or waits for a connection. */
  announce?: (text: string) => void;
  /** A students' course, or a student: "later" doesn't say "in class". */
  student?: boolean;
}) {
  const { t, L, locale } = useI18n();
  const { user, profile, orgId, offlineUid } = useAuth();
  const inRouter = useInRouterContext();
  const [d, setD] = useState<Draft>(() => readDraft(lessonId, step.id));
  const [files, setFiles] = useState<File[]>([]);
  const final = !!step.final;
  const ev = new Set((step.evidence ?? []).map((e) => e.kind)), cap = ev.size > 0;
  // A milestone this account already sent from this phone opens as sent: it goes on, or improves it and sends it again.
  // "wait", "limit", "closed" and "invalid": checkCapstone refused the send (capstoneText.ts refusal); the draft stays.
  // "denied": the rules refused it (sending it again as it is won't help); "tooBig": a file is over Storage's limit.
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "later" | "offline" | "wait" | "limit" | "closed" | "invalid" | "denied" | "tooBig">(
    () => (cap && sentAtBy(d, user?.uid ?? offlineUid) ? "sent" : "idle"));
  const refused = state === "wait" || state === "limit" || state === "closed" || state === "invalid";
  const [bigFile, setBigFile] = useState("");
  useEffect(() => { onReady(state === "sent" || state === "later"); }, [state, onReady]);
  // Sending replaces the form (and its button) with the sent notice: the focus goes to the notice, which reads it out.
  const sentNote = useRef<HTMLParagraphElement>(null);
  const wasSending = useRef(false);
  useEffect(() => {
    if (state === "sent" && wasSending.current) sentNote.current?.focus();
    if (state === "error") announce?.(t("project.error"));
    if (state === "offline") announce?.(t("project.offline"));
    if (state === "denied") announce?.(t("project.denied"));
    if (state === "tooBig") announce?.(t("project.tooBig", { name: isolate(bigFile), max: 10 }));
    if (refused) announce?.(L(CT[state]));
    wasSending.current = state === "sending";
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (patch: Partial<Draft>) => setD((x) => { const n = { ...x, ...patch }; writeDraft(lessonId, step.id, n); return n; });
  // Capstone milestones ask what a final project asks: an explanation in the learner's own words and any AI use.
  const asks = final || cap;
  const [result, setResult] = useState<CapResult | null>(null);
  const links = d.links.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const repoOk = !ev.has("repo") || GITHUB_REPO.test(d.repo.trim());
  const linksOk = links.length <= MAX_LINKS && links.every((l) => /^https:\/\/\S+$/.test(l)) && (!ev.has("url") || links.length > 0);
  let checkOk = true;
  if (d.check) { try { JSON.parse(d.check); } catch { checkOk = false; } }
  const capReady = !cap || (repoOk && linksOk && checkOk && (!(ev.has("check") || ev.has("scan")) || !!d.check));
  // The rules take no more than this; typing stops there (maxLength), and a longer draft from before has to be shortened.
  const tooLong = d.text.length > MAX_TEXT || d.explain.length > MAX_TEXT || d.aiHow.length > MAX_AI_USE;
  const ready = !tooLong && !!d.text.trim() && capReady && (!asks || (!!d.explain.trim() && (d.ai === "none" || (d.ai === "some" && !!d.aiHow.trim()))));
  // Files an earlier try put up before it failed (a dropped connection): trying again sends the same ones, without
  // spending the data a second time. Files of a send checkCapstone refused are deleted (below), and leave this list.
  const putUp = useRef(new Map<File, { ref: StorageReference; file: { url: string; name: string; type: string } }>());
  const submit = async () => {
    if (!user || tooLong) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setState("offline"); return; }
    setState("sending");
    // What this send put up in Storage, for a refused capstone send (below).
    const uploaded: StorageReference[] = [];
    try {
      const sent: { url: string; name: string; type: string }[] = [];
      // Each new file as it will go up (photos shrunk), and none over Storage's limit, before anything is uploaded.
      const bodies = await Promise.all(files.map((file) => (putUp.current.has(file) ? null : shrinkImage(file))));
      const big = files.find((_, i) => (bodies[i]?.size ?? 0) > MAX_FILE_BYTES);
      if (big) { setBigFile(big.name); setState("tooBig"); return; }
      if (bodies.some(Boolean)) {
        const [{ ref, uploadBytes }, s] = await Promise.all([import("firebase/storage"), loadFirebase().then((fb) => fb.storage())]);
        for (const [i, file] of files.entries()) {
          const body = bodies[i];
          if (!body) continue;
          const safe = file.name.replace(/[^\w.-]/g, "_"), jpeg = body !== file;
          // One folder per course, so access to a course's projects can be granted (firebase/storage.rules).
          const r = ref(s, `submissions/${orgId ?? "none"}/${user.uid}/${unitId}/${lessonId}-${Date.now()}-${jpeg ? safe.replace(/\.\w+$/, "") + ".jpg" : safe}`);
          const type = jpeg ? "image/jpeg" : file.type;
          await uploadBytes(r, body, { contentType: type });
          uploaded.push(r);
          // The file's address without a download token (a token link works for whoever holds it, forever): reviewers'
          // screens read it through the SDK with their own sign-in, so the Storage rules decide (admin/WorkBody.tsx).
          putUp.current.set(file, { ref: r, file: { url: `https://firebasestorage.googleapis.com/v0/b/${r.bucket}/o/${encodeURIComponent(r.fullPath)}`, name: file.name, type } });
        }
      }
      for (const file of files) sent.push(putUp.current.get(file)!.file);
      if (cap) {
        const r = await call<Record<string, unknown>, CapResult>("checkCapstone")({
          unitId, lessonId, stepId: step.id, text: d.text, explain: d.explain, aiUse: d.ai === "some" ? d.aiHow : "none", name: profile?.name ?? user.displayName ?? "",
          repo: d.repo.trim(), links, check: d.check || null, files: sent,
        });
        setResult(r);
        // The check file is chosen again for the next send; the time (and id) of this one is kept, for coming back.
        const sentAt = Date.now(), sentBy = user.uid;
        writeDraft(lessonId, step.id, { ...d, check: "", sentAt, sentId: r?.id, sentBy });
        setD((x) => ({ ...x, sentAt, sentId: r?.id, sentBy }));
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
    } catch (e) {
      const why = cap ? refusal(e) : null;
      // checkCapstone refused before writing anything, so the files just put up would never be used: delete them, best
      // effort (the owner may; firebase/storage.rules). Any other error can come after the submission was written (a
      // timeout), so its files stay.
      if (why && uploaded.length) {
        for (const [file, x] of putUp.current) if (uploaded.includes(x.ref)) putUp.current.delete(file);
        void import("firebase/storage").then(({ deleteObject }) => Promise.all(uploaded.map((x) => deleteObject(x).catch(() => undefined)))).catch(() => undefined);
      }
      // Refused by the rules (an answer too long, a file they don't take): "check your connection" would be wrong.
      setState(why || (deniedError(e) ? "denied" : "error"));
    }
  };
  const many = final || cap;
  // Who reviews what was sent (firestore.rules users/{uid}/submissions): the learner's teacher or their organization's
  // admins; without an organization, Darsi's platform admins (/super/projects), as checkCapstone's "staff" queue says.
  const sentKey = orgId ? (final ? "project.finalSent" : "project.sent") : final ? "project.finalSentDarsi" : "project.sentDarsi";
  const pick = (list: FileList | null) => setFiles((x) => [...x, ...Array.from(list ?? [])].slice(0, many ? MAX_FILES : 1));
  const pickCheck = async (list: FileList | null) => { const f = list?.[0]; if (f) edit({ check: (await f.text()).slice(0, 100_000) }); };
  // How much room an answer has used, once it is nearly full; over it (a draft from before), why Send waits.
  const roomId = (k: string) => `room-${k}-${step.id}`;
  const near = (len: number, max: number) => len > max * 0.9;
  const room = (k: string, len: number, max: number) => near(len, max)
    ? <p id={roomId(k)} className={len > max ? "notice err" : "muted small"}>{t(len > max ? "project.tooLong" : "project.chars", { n: len, max })}</p> : null;
  return (
    <div className="stack">
      {/* A milestone's prompt is "Milestone N: title", then its task and "Hand in: …", which the card below shows: the heading is the title. */}
      <QuestionHeader type="reflect" icon="target" typeLabel={cap ? L(CT.kicker) : t(final ? "project.finalKicker" : "project.kicker")} prompt={cap ? L(step.prompt).split(/\n\s*\n/)[0].trim() : L(step.prompt)} />
      <div className="project-card">
        <p>{L(step.task)}</p>
        {cap && <CapstoneBrief step={step} />}
        <p><strong>{t("project.deliver")}</strong> {L(step.deliverable)}</p>
        <div><strong>{t(final ? "project.checklist" : "project.rubric")}</strong><ul>{step.rubric.map((r, i) => <li key={i}>{L(r.criterion)}</li>)}</ul></div>
      </div>
      {/* What became of what they sent before: status and the reviewer's feedback (lesson/MyReview.tsx). */}
      {user && !preview && <MyReview uid={user.uid} lessonId={lessonId} step={step} sent={state === "sent" && (!cap || !!result)} />}
      {state === "sent" && result ? <div className="stack-sm">
        <p ref={sentNote} tabIndex={-1} className="notice ok"><Icon name="check" size={18} /> {L(result.queue === "staff" ? CT.sentStaff : CT.sentTeacher)}</p>
        <CapstoneResult checks={result.checks} review={result.aiReview} rubric={step.rubric} />
        <div><Button size="sm" variant="secondary" onClick={() => { setResult(null); setState("idle"); }}>{L(CT.sendAgain)}</Button></div>
      </div> : state === "sent" && cap ? <div className="stack-sm">
        {/* Sent from this phone on an earlier visit (its review, when there is one, shows above). */}
        <p className="muted small"><Icon name="check" size={18} /> {t("project.sentOn", { date: d.sentAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d.sentAt) : "" })}</p>
        <div><Button size="sm" variant="secondary" onClick={() => setState("idle")}>{L(CT.sendAgain)}</Button></div>
      </div> : state === "sent" ? <p ref={sentNote} tabIndex={-1} className="notice ok"><Icon name="check" size={18} /> {t(sentKey)}</p> : <>
        {/* A guest can't send: say so, and how to, before they type (what they type stays on this phone as a draft). */}
        {!user && !offlineUid && <div className="notice stack-sm">
          <div>{t(cap ? "project.guestCap" : student ? "project.guestStudent" : "project.guest")}</div>
          {inRouter && !preview && <div><Link className="dr-btn dr-btn-secondary dr-btn-sm" to="/signup">{t("auth.noAccount")}</Link></div>}
        </div>}
        <label className="dr-field-label" htmlFor={`evidence-${step.id}`}>{t("project.evidence")}</label>
        <textarea id={`evidence-${step.id}`} className="dr-reflect-input" dir="auto" rows={5} value={d.text} onChange={(e) => edit({ text: e.target.value })} placeholder={t("project.placeholder")}
          maxLength={MAX_TEXT} aria-describedby={near(d.text.length, MAX_TEXT) ? roomId("text") : undefined} />
        {room("text", d.text.length, MAX_TEXT)}
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
          {/* Some milestones need a link (a demo, a dashboard): Send waits for one, so say so while the box is empty. */}
          <textarea id={`links-${step.id}`} className="dr-reflect-input" dir="ltr" rows={2} value={d.links} onChange={(e) => edit({ links: e.target.value })}
            aria-required={ev.has("url") || undefined} aria-describedby={ev.has("url") && !links.length ? `links-need-${step.id}` : undefined} />
          {ev.has("url") && !links.length && <p id={`links-need-${step.id}`} className="muted small">{t("project.linksNeeded")}</p>}
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
          <textarea id={`explain-${step.id}`} className="dr-reflect-input" dir="auto" rows={5} value={d.explain} onChange={(e) => edit({ explain: e.target.value })} placeholder={t("project.explainHint")}
            maxLength={MAX_TEXT} aria-describedby={near(d.explain.length, MAX_TEXT) ? roomId("explain") : undefined} />
          {room("explain", d.explain.length, MAX_TEXT)}
          <fieldset className="stack-sm project-ai">
            <legend className="dr-field-label">{t("project.ai")}</legend>
            <div role="radiogroup" className="stack-sm">
              <ChoiceCard title={t("project.aiNone")} selected={d.ai === "none"} onClick={() => edit({ ai: "none" })} />
              <ChoiceCard title={t("project.aiSome")} selected={d.ai === "some"} onClick={() => edit({ ai: "some" })} />
            </div>
            {d.ai === "some" && <textarea aria-label={t("project.aiHow")} className="dr-reflect-input" dir="auto" rows={3} value={d.aiHow} onChange={(e) => edit({ aiHow: e.target.value })} placeholder={t("project.aiHow")}
              maxLength={MAX_AI_USE} aria-describedby={near(d.aiHow.length, MAX_AI_USE) ? roomId("ai") : undefined} />}
            {d.ai === "some" && room("ai", d.aiHow.length, MAX_AI_USE)}
          </fieldset>
        </>}
        <label className="file-pick"><Icon name="image" size={20} /><span>{files.length ? files.map((f) => f.name).join(t("common.sep")) : t(many ? "project.attachMany" : "project.attach")}</span>
          <input type="file" multiple={many} accept={many ? "image/*,application/pdf,audio/*" : "image/*,application/pdf"} onChange={(e) => pick(e.target.files)} /></label>
        {files.length > 0 && <Button size="sm" variant="ghost" onClick={() => setFiles([])}>{t("project.clearFiles")}</Button>}
        {asks && <p className="muted small">{t("project.draftKept")}</p>}
        {state === "sending" && cap && <p className="muted small">{L(CT.checking)}</p>}
        {state === "error" && <p className="notice err">{t("project.error")}</p>}
        {state === "offline" && <p className="notice">{t("project.offline")}</p>}
        {state === "denied" && <p className="notice err">{t("project.denied")}</p>}
        {state === "tooBig" && <p className="notice err">{t("project.tooBig", { name: isolate(bigFile), max: 10 })}</p>}
        {refused && <p className="notice">{L(CT[state])}</p>}
        <div className="row-gap">
          <Button icon="check" disabled={!ready || state === "sending" || !user || preview} loading={state === "sending"} onClick={submit}>{cap ? L(CT.sendBtn) : t(final ? "project.finalSubmit" : "project.submit")}</Button>
          {/* A milestone is hours of work on the learner's own computer; a students' project isn't done "in class". */}
          <Button variant="ghost" onClick={() => setState("later")}>{t(cap ? "project.laterCap" : student ? "project.laterStudent" : "project.later")}</Button>
        </div>
        {/* Why Send waits: signed in but offline before Firebase was on this phone (a guest's note is at the top). */}
        {!user && offlineUid && <p className="muted small">{t("project.offline")}</p>}
      </>}
    </div>
  );
}
