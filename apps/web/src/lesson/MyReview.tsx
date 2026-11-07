import { useEffect } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../i18n";
import type { ProjectStep } from "../content/types";
import { forgetMyWork, latestFor, useMyWork } from "../state/myWork";
import { CapstoneResult } from "./CapstoneParts";
import { CT } from "./capstoneText";

/**
 * On a project step, for a signed-in learner: what became of what they last sent for it. Its status, the reviewer's
 * feedback, and for a capstone milestone still in review the automatic checks and the AI review. One read of their own
 * projects for this lesson when the step opens, never a listener; nothing shows until there is something to show.
 * Hidden while ProjectView shows its own "Sent" message, and sending makes every later read fresh (Home's capstone check).
 */
export function MyReview({ uid, lessonId, step, sent }: { uid: string; lessonId: string; step: ProjectStep; sent: boolean }) {
  const { t, L, locale } = useI18n();
  useEffect(() => { if (sent) forgetMyWork(); }, [sent]);
  const { data } = useMyWork(sent ? undefined : uid, { lessonId });
  const last = data ? latestFor(data.list, lessonId, step.id) : undefined;
  if (sent || !last) return null;
  const tone = last.status === "approved" ? " ok" : last.status === "revise" ? " err" : "";
  const date = last.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(last.createdAt)) : "";
  return (
    <div className={`notice stack-sm${tone}`}>
      <div>
        <Icon name={last.status === "approved" ? "check" : last.status === "revise" ? "edit" : "info"} size={18} /> <strong>{t(`p.status.${last.status}`)}</strong>
        {date && <span className="muted">{t("common.sep")}{t("project.sentOn", { date })}</span>}
      </div>
      {last.feedback && <div><strong>{t("p.feedback")}:</strong> <span dir="auto">{last.feedback}</span></div>}
      {last.status === "revise" && <div>{last.capstone ? L(CT.sendAgain) : t("project.reviseHint")}</div>}
      {last.capstone && last.status !== "approved" && (last.checks?.length || last.aiReview) ? <CapstoneResult checks={last.checks} review={last.aiReview} rubric={step.rubric} /> : null}
    </div>
  );
}
