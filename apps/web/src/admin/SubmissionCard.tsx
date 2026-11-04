import { useState, type ReactNode } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Button, Icon } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Submission } from "./data";

/** A project and, for teachers and admins, its review (feedback, approve or ask for changes). */
export function SubmissionCard({ uid, sub, lessonTitle, who, onReviewed }: { uid: string; sub: Submission; lessonTitle: string;
  /** Whose project it is, on lists of everyone's projects. */
  who?: ReactNode;
  /** After a review is saved (lists read once, not live, reload). */
  onReviewed?: () => void;
}) {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const [fb, setFb] = useState(sub.feedback ?? "");
  const canReview = role === "teacher" || role === "orgAdmin" || role === "superadmin";
  const review = (status: "approved" | "revise") => updateDoc(doc(db, "users", uid, "submissions", sub.id), { status, feedback: fb, reviewedBy: user?.uid, reviewedAt: serverTimestamp() }).then(() => onReviewed?.());
  return (
    <article className={`submission is-${sub.status}`}>
      {who}
      {/* Platform admins open the lesson at its project step. */}
      <header><strong>{role === "superadmin" && sub.unitId ? <Link to={`/lesson/${sub.unitId}/${sub.lessonId}?step=project`}>{lessonTitle}</Link> : lessonTitle}</strong><span className={`status status-${sub.status}`}>{t(`p.status.${sub.status}` as "p.status.submitted")}</span></header>
      <p dir="auto" className="sub-text">{sub.text}</p>
      {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noreferrer noopener"><Icon name="file" size={16} /> {sub.fileName ?? t("p.attachment")}</a>}
      {canReview ? (
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor={`fb-${sub.id}`}>{t("p.feedback")}</label>
          <textarea id={`fb-${sub.id}`} className="dr-reflect-input" rows={2} dir="auto" value={fb} onChange={(e) => setFb(e.target.value)} />
          <div className="row-gap"><Button size="sm" icon="check" onClick={() => review("approved")}>{t("p.approve")}</Button><Button size="sm" variant="secondary" onClick={() => review("revise")}>{t("p.revise")}</Button></div>
        </div>
      ) : sub.feedback ? <p className="notice" dir="auto">{sub.feedback}</p> : null}
    </article>
  );
}
