import { useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { SETUP_OS, type ProjectStep } from "../content/types";
import { starterUrl, type AiReview, type CapCheck } from "../content/capstone";
import { CT, fill } from "./capstoneText";

/** A capstone milestone's plan: hours, the starter repository and how to set up on Windows, Mac or Colab. */
function SetupBody({ text }: { text: string }) {
  return <div className="sub-text stack-sm" dir="auto">{text.split(/\n\n+/).map((para, i) => {
    const cleaned = para.trim().replace(/[\u2066-\u2069\u202A-\u202E]/g, "");
    const m = cleaned.match(/^!\[([^\]]*)\]\((\/media\/[^)\s]+)\)$/);
    if (m) return <figure key={i} className="reading-fig"><img src={m[2]} alt={m[1]} loading="lazy" /><figcaption>{m[1]}</figcaption></figure>;
    return <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{para}</p>;
  })}</div>;
}

export function CapstoneBrief({ step }: { step: ProjectStep }) {
  const { L } = useI18n();
  const tabs = SETUP_OS.filter((os) => step.setup?.some((x) => x.os === os));
  const [os, setOs] = useState(tabs[0]);
  const body = step.setup?.find((x) => x.os === os)?.body;
  return (
    <div className="stack-sm">
      {step.hours ? <p className="muted small"><Icon name="target" size={16} /> {fill(L(CT.hours), { n: step.hours })}</p> : null}
      {step.starterRepo && <p><strong>{L(CT.starter)}:</strong> <a href={starterUrl(step.starterRepo)} target="_blank" rel="noreferrer noopener" dir="ltr"><Icon name="link" size={16} /> {starterUrl(step.starterRepo).replace("https://", "")}</a><br /><span className="muted small">{L(CT.starterHint)}</span></p>}
      {tabs.length > 0 && <div className="stack-sm">
        <strong>{L(CT.setup)}</strong>
        <div className="row-gap" role="group" aria-label={L(CT.setup)}>
          {tabs.map((x) => <Button key={x} size="sm" variant={x === os ? "primary" : "ghost"} aria-pressed={x === os} onClick={() => setOs(x)}>{L(CT[x])}</Button>)}
        </div>
        {body && <SetupBody text={L(body)} />}
      </div>}
    </div>
  );
}

/** The automatic checks and the advisory AI review, for the learner after sending and for reviewers. */
export function CapstoneResult({ checks, review, rubric }: { checks?: CapCheck[]; review?: AiReview | null; rubric?: ProjectStep["rubric"] }) {
  const { L, lang } = useI18n();
  const say = (x: { en: string; ar?: string }) => (lang === "ar" && x.ar ? x.ar : x.en);
  return (
    <div className="stack-sm">
      {checks && checks.length > 0 && <div><strong>{L(CT.checks)}</strong> <span className="muted small">{fill(L(CT.passed), { n: checks.filter((c) => c.ok).length, m: checks.length })}</span>
        <ul>{checks.map((c) => <li key={c.id}><Icon name={c.ok ? "check" : "cross"} size={16} /> <span dir="auto">{say(c)}</span></li>)}</ul></div>}
      {review && (review.status === "done" ? <div className="notice">
        <strong>{L(CT.ai)}</strong>
        <ul>{review.scores.map((s) => <li key={s.criterion}><strong>{rubric?.[s.criterion] ? L(rubric[s.criterion].criterion) : `#${s.criterion + 1}`}</strong>: {fill(L(CT.score), { n: s.score })}. <span dir="auto">{say(s)}</span></li>)}</ul>
        <p dir="auto">{say(review.summary)}</p>
        {review.next.en && <p dir="auto"><strong>{L(CT.aiNext)}:</strong> {say(review.next)}</p>}
      </div> : <p className="muted small" dir="auto">{say(review.summary)}</p>)}
    </div>
  );
}
