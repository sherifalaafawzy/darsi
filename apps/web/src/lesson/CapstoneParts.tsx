import { useState } from "react";
import { Button, Icon, type IconName } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { SETUP_OS, type LocalText, type ProjectStep } from "../content/types";
import { starterUrl, type AiReview, type CapCheck } from "../content/capstone";
import { counted, CT, fill, HOURS, setupTabLabel } from "./capstoneText";
import { ReadingParagraphs } from "./readingText";

/** A check's mark and what it means: passed, not passed, or not checked (GitHub couldn't be reached). */
const mark = (ok: boolean | null): [IconName, LocalText] => (ok === true ? ["check", CT.checkOk] : ok === false ? ["cross", CT.checkFail] : ["info", CT.checkSkip]);

/** The setup tabs are shared by a capstone's milestones and say "check.py --milestone <mN>": this card knows which one. */
const forMilestone = (text: string, id: string | undefined) => (id ? text.split("<mN>").join(id) : text);

/** A capstone milestone's plan: hours, the starter repository and how to set up on Windows, Mac or Colab. */
function SetupBody({ text }: { text: string }) {
  // As a reading (lesson/readingText.tsx): a line per click or command, links tappable, a bare command left to right on
  // an Arabic page, and the same pictures (content/figure.ts).
  // .setup-body (lesson.css): its long example addresses break anywhere, so they never widen a phone's page.
  return <div className="setup-body stack-sm" dir="auto"><ReadingParagraphs text={text} paragraph={(content, key) => <p key={key} style={{ margin: 0 }}>{content}</p>} /></div>;
}

export function CapstoneBrief({ step }: { step: ProjectStep }) {
  const { L, lang, num } = useI18n();
  const tabs = SETUP_OS.filter((os) => step.setup?.some((x) => x.os === os));
  const [os, setOs] = useState(tabs[0]);
  const body = step.setup?.find((x) => x.os === os)?.body;
  return (
    <div className="stack-sm">
      {step.hours ? <p className="muted small"><Icon name="target" size={16} /> {counted(HOURS, lang, step.hours, num)}</p> : null}
      {step.starterRepo && <p><strong>{L(CT.starter)}:</strong> <a href={starterUrl(step.starterRepo)} target="_blank" rel="noreferrer noopener" dir="ltr"><Icon name="link" size={16} /> {starterUrl(step.starterRepo).replace("https://", "")}</a><br /><span className="muted small">{L(CT.starterHint)}</span></p>}
      {tabs.length > 0 && <div className="stack-sm">
        <strong>{L(CT.setup)}</strong>
        <div className="row-gap" role="group" aria-label={L(CT.setup)}>
          {tabs.map((x) => <Button key={x} size="sm" variant={x === os ? "primary" : "ghost"} aria-pressed={x === os} onClick={() => setOs(x)}>{L(setupTabLabel(x, step.setup?.find((t) => t.os === x)?.body))}</Button>)}
        </div>
        {body && <SetupBody text={forMilestone(L(body), step.milestone)} />}
      </div>}
    </div>
  );
}

/** The automatic checks and the advisory AI review, for the learner after sending and for reviewers. */
export function CapstoneResult({ checks, review, rubric }: { checks?: CapCheck[]; review?: AiReview | null; rubric?: ProjectStep["rubric"] }) {
  const { L, lang, num } = useI18n();
  const say = (x: { en: string; ar?: string }) => (lang === "ar" && x.ar ? x.ar : x.en);
  // "n of m passed" counts only the checks that ran; one GitHub couldn't reach is listed as not checked.
  const ran = (checks ?? []).filter((c) => c.ok !== null);
  return (
    <div className="stack-sm">
      {checks && checks.length > 0 && <div><strong>{L(CT.checks)}</strong> {ran.length > 0 && <span className="muted small">{fill(L(CT.passed), { n: ran.filter((c) => c.ok).length, m: ran.length }, num)}</span>}
        <ul>{checks.map((c) => { const [icon, means] = mark(c.ok); return <li key={c.id}><Icon name={icon} size={16} label={L(means)} /> <span dir="auto">{say(c)}</span></li>; })}</ul></div>}
      {review && (review.status === "done" ? <div className="notice">
        <strong>{L(CT.ai)}</strong>
        <ul>{review.scores.map((s) => <li key={s.criterion}><strong>{rubric?.[s.criterion] ? L(rubric[s.criterion].criterion) : fill(L(CT.criterion), { n: s.criterion + 1 }, num)}</strong>: {fill(L(CT.score), { n: s.score, m: 3 }, num)}. <span dir="auto">{say(s)}</span></li>)}</ul>
        {review.capped && <p className="small">{fill(L(CT.capped), { n: 1 }, num)}</p>}
        <p dir="auto">{say(review.summary)}</p>
        {review.next.en && <p dir="auto"><strong>{L(CT.aiNext)}:</strong> {say(review.next)}</p>}
      </div> : <p className="muted small" dir="auto">{say(review.summary)}</p>)}
    </div>
  );
}
