import { useState, type ReactNode } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Button } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/api";
import { useI18n } from "../i18n";
import type { ProjectStep } from "../content/types";
import type { Submission } from "./data";
import { stepName, WorkBody, type WorkFields } from "./WorkBody";
import { CT } from "../lesson/capstoneText";
import { refusalText } from "./refusals";
import "./strings";

export { projectStep } from "./WorkBody";

/**
 * A project and, for teachers and admins, its review (feedback, approve or ask for changes). Everything the learner
 * sent is shown (WorkBody). A capstone milestone also names its milestone, and its advisory AI review the rubric's
 * criteria, when the caller passes the step: `projectStep(lesson, sub.stepId)`.
 */
export function SubmissionCard({ uid, sub, lessonTitle, step, who, onReviewed }: { uid: string; sub: Submission; lessonTitle: string;
  /** The project step the submission answers, once its unit is loaded. */
  step?: ProjectStep;
  /** Whose project it is, on lists of everyone's projects. */
  who?: ReactNode;
  /** After a review is saved (lists read once, not live, reload). */
  onReviewed?: () => void;
}) {
  const { t, L } = useI18n();
  const work = sub as Submission & WorkFields;
  const { user, role } = useAuth();
  const [fb, setFb] = useState(sub.feedback ?? "");
  const canReview = role === "teacher" || role === "orgAdmin" || role === "superadmin";
  // The review being saved, and a refusal (not their student any more, the rules' limits) said in words, not swallowed.
  const [saving, setSaving] = useState<"" | "approved" | "revise">("");
  const [reviewErr, setReviewErr] = useState(false);
  const review = (status: "approved" | "revise") => {
    setSaving(status); setReviewErr(false);
    return updateDoc(doc(db, "users", uid, "submissions", sub.id), { status, feedback: fb, reviewedBy: user?.uid, reviewedAt: serverTimestamp() })
      .then(() => onReviewed?.(), () => setReviewErr(true)).finally(() => setSaving(""));
  };
  // A capstone lesson holds five milestones, all under one lesson title: name the one this is.
  const milestone = work.capstone ? stepName(step, L) : "";
  // A milestone is titled by its own name ("Milestone 2: A baseline…"), not its lesson's ("3. Project submission").
  const title = milestone || lessonTitle;
  // Platform admins remove abusive content (functions/src/account.ts moderateSubmission): text, links and files go.
  const [ask, setAsk] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [modErr, setModErr] = useState("");
  const moderated = removed || Boolean((sub as { moderated?: unknown }).moderated);
  const moderate = () => api.moderateSubmission({ uid, id: sub.id }).then(() => { setRemoved(true); setAsk(false); onReviewed?.(); }, (e: unknown) => setModErr(refusalText(e, t)));
  return (
    <article className={`submission is-${sub.status}`}>
      {who}
      {/* Platform admins open the lesson at the step this project answers. */}
      <header><strong>{role === "superadmin" && sub.unitId ? <Link to={`/lesson/${sub.unitId}/${sub.lessonId}?step=${encodeURIComponent(work.stepId || "project")}`}>{title}</Link> : title}</strong><span className={`status status-${sub.status}`}>{t(`p.status.${sub.status}` as "p.status.submitted")}</span></header>
      {work.capstone && <p className="muted small"><span className={`pill${work.queue === "staff" ? " pill-warn" : ""}`}>{L(work.queue === "staff" ? CT.queueStaff : CT.queueTeacher)}</span></p>}
      {moderated ? <p className="muted"><em>{t("mod.removed")}</em></p> : <WorkBody work={work} rubric={step?.rubric} />}
      {role === "superadmin" && !moderated && (ask ? (
        <div className="notice err stack-sm" role="alert">
          <span>{t("mod.confirm")}</span>
          <div className="row-gap"><Button size="sm" icon="close" autoFocus onClick={() => { void moderate(); }}>{t("mod.remove")}</Button><Button size="sm" variant="ghost" onClick={() => setAsk(false)}>{t("common.cancel")}</Button></div>
          {modErr && <span>{modErr}</span>}
        </div>
      ) : <div><Button size="sm" variant="ghost" icon="warning" onClick={() => setAsk(true)}>{t("mod.remove")}</Button></div>)}
      {canReview ? (
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor={`fb-${sub.id}`}>{t("p.feedback")}</label>
          {/* The rules take feedback of up to 5,000 characters. */}
          <textarea id={`fb-${sub.id}`} className="dr-reflect-input" rows={2} dir="auto" maxLength={5000} value={fb} onChange={(e) => setFb(e.target.value)} />
          <div className="row-gap"><Button size="sm" icon="check" loading={saving === "approved"} disabled={!!saving} onClick={() => { void review("approved"); }}>{t("p.approve")}</Button><Button size="sm" variant="secondary" loading={saving === "revise"} disabled={!!saving} onClick={() => { void review("revise"); }}>{t("p.revise")}</Button></div>
          {reviewErr && <p className="notice err" role="alert">{t("p.reviewFailed")}</p>}
        </div>
      ) : sub.feedback ? <p className="notice" dir="auto">{sub.feedback}</p> : null}
    </article>
  );
}
