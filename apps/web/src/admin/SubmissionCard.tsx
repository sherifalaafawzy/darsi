import { useState, type ReactNode } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Button, Icon } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Submission } from "./data";
import { isEvidenceUrl } from "./evidence";
import type { CapFields } from "../content/capstone";
import { CapstoneResult } from "../lesson/CapstoneParts";
import { CT } from "../lesson/capstoneText";

/**
 * A project and, for teachers and admins, its review (feedback, approve or ask for changes). A capstone milestone also
 * shows its repository and links, the automatic checks and the advisory AI review, which only checkCapstone writes.
 */
export function SubmissionCard({ uid, sub, lessonTitle, who, onReviewed }: { uid: string; sub: Submission; lessonTitle: string;
  /** Whose project it is, on lists of everyone's projects. */
  who?: ReactNode;
  /** After a review is saved (lists read once, not live, reload). */
  onReviewed?: () => void;
}) {
  const { t, L } = useI18n();
  const cap = sub as Submission & CapFields;
  const { user, role } = useAuth();
  const [fb, setFb] = useState(sub.feedback ?? "");
  const canReview = role === "teacher" || role === "orgAdmin" || role === "superadmin";
  const review = (status: "approved" | "revise") => updateDoc(doc(db, "users", uid, "submissions", sub.id), { status, feedback: fb, reviewedBy: user?.uid, reviewedAt: serverTimestamp() }).then(() => onReviewed?.());
  return (
    <article className={`submission is-${sub.status}`}>
      {who}
      {/* Platform admins open the lesson at its project step. */}
      <header><strong>{role === "superadmin" && sub.unitId ? <Link to={`/lesson/${sub.unitId}/${sub.lessonId}?step=project`}>{lessonTitle}</Link> : lessonTitle}</strong><span className={`status status-${sub.status}`}>{t(`p.status.${sub.status}` as "p.status.submitted")}</span></header>
      {cap.capstone && <p className="muted small"><span className={`pill${cap.queue === "staff" ? " pill-warn" : ""}`}>{L(cap.queue === "staff" ? CT.queueStaff : CT.queueTeacher)}</span></p>}
      <p dir="auto" className="sub-text">{sub.text}</p>
      {cap.capstone && <>
        {[cap.repo, ...(cap.links ?? [])].filter((u): u is string => !!u && /^https:\/\//.test(u)).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" dir="ltr"><Icon name="link" size={16} /> {u.replace("https://", "")}</a>)}
        <CapstoneResult checks={cap.checks} review={cap.aiReview} />
      </>}
      {sub.fileUrl && isEvidenceUrl(sub.fileUrl) && <a href={sub.fileUrl} target="_blank" rel="noreferrer noopener"><Icon name="file" size={16} /> {sub.fileName ?? t("p.attachment")}</a>}
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
