import type { ReactNode } from "react";
import { Button, Icon, Mark, ProgressBar, TrackChip, cx, type Track } from "./primitives";

export interface LessonCardProps { track: Track; title: string; meta?: string; progress?: number; offline?: boolean; offlineLabel?: string; trackLabel?: string; action?: ReactNode; }
export function LessonCard({ track, title, meta, progress, offline, offlineLabel = "Offline ready", trackLabel, action }: LessonCardProps) {
  return (
    <article className={cx("dr-card", `dr-card-${track}`)}>
      <div className="dr-card-top">
        <TrackChip track={track}>{trackLabel}</TrackChip>
        {offline && <span className="dr-card-offline"><Icon name="offline" size={18} />{offlineLabel}</span>}
      </div>
      <h3 className="dr-card-title">{title}</h3>
      {meta && <p className="dr-card-meta">{meta}</p>}
      {progress != null && <ProgressBar track={track} value={progress} ariaLabel={title} />}
      {action && <div className="dr-card-action">{action}</div>}
    </article>
  );
}

export interface LessonTopBarProps { value: number; track?: Track; valueText?: string; onClose: () => void; closeLabel?: string; onAudio?: () => void; audioLabel?: string; progressLabel?: string; }
export function LessonTopBar({ value, track, valueText, onClose, closeLabel = "Close lesson", onAudio, audioLabel = "Read aloud", progressLabel = "Lesson progress" }: LessonTopBarProps) {
  return (
    <div className="dr-lessonbar">
      <Button variant="ghost" iconOnly icon="close" onClick={onClose}>{closeLabel}</Button>
      <div className="dr-lessonbar-progress"><ProgressBar value={value} track={track} thick ariaLabel={progressLabel} valueText={valueText} /></div>
      {onAudio && <Button variant="ghost" iconOnly icon="audio" onClick={onAudio}>{audioLabel}</Button>}
    </div>
  );
}

export interface FeedbackSheetProps { result: "correct" | "wrong"; title: string; explanation?: string; answer?: string; answerLabel?: string; onContinue?: () => void; continueLabel?: string; floating?: boolean; }
export function FeedbackSheet({ result, title, explanation, answer, answerLabel = "Answer: ", onContinue, continueLabel = "Continue", floating = true }: FeedbackSheetProps) {
  const ok = result === "correct";
  return (
    <section className={cx("dr-sheet", ok ? "dr-sheet-correct" : "dr-sheet-wrong", floating && "dr-floating-bottom")} role="status" aria-live="polite">
      <div className="dr-sheet-head"><span className="dr-sheet-badge"><Icon name={ok ? "check" : "cross"} /></span><h2 className="dr-sheet-title">{title}</h2></div>
      {explanation && <p className="dr-sheet-body">{explanation}</p>}
      {answer && <p className="dr-sheet-answer"><strong>{answerLabel}</strong><bdi>{answer}</bdi></p>}
      <Button block variant={ok ? "primary" : "secondary"} onClick={onContinue} iconEnd="next">{continueLabel}</Button>
    </section>
  );
}

export interface PathNode { label: string; state?: "done" | "current" | "locked"; checkpoint?: boolean; callout?: string; stateLabel?: string; onClick?: () => void; }
export interface UnitPathProps { nodes: PathNode[]; track?: Track | "kola"; label?: string; }
const OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1];
/** Winding lesson map; the zigzag uses logical offsets so it mirrors in RTL. */
export function UnitPath({ nodes, track = "kola", label }: UnitPathProps) {
  return (
    <ol className={cx("dr-path", `dr-path-${track}`)} aria-label={label}>
      {nodes.map((n, i) => {
        const state = n.state ?? "locked";
        let icon: Parameters<typeof Icon>[0]["name"] = state === "done" ? "check" : state === "locked" ? "lock" : n.checkpoint ? "award" : track !== "kola" ? track : "next";
        if (state === "locked" && !n.checkpoint) icon = "lock";
        return (
          <li key={i} className={cx("dr-path-step", `is-${state}`, n.checkpoint && "is-checkpoint")} style={{ ["--dr-off" as string]: OFFSETS[i % OFFSETS.length] }}>
            {state === "current" && n.callout && <span className="dr-path-callout">{n.callout}</span>}
            <button type="button" className="dr-path-node" disabled={state === "locked"} onClick={n.onClick} aria-label={n.label + (n.stateLabel ? ` — ${n.stateLabel}` : "")} aria-current={state === "current" ? "step" : undefined}>
              <Icon name={icon} size={30} />
            </button>
            <span className="dr-path-label">{n.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface Stat { label: string; value: string; tone?: Track | "kola"; }
export interface LessonCompleteProps { title: string; subtitle?: string; stats?: Stat[]; tryTomorrow?: string; tryLabel?: string; actions?: ReactNode; }
export function LessonComplete({ title, subtitle, stats = [], tryTomorrow, tryLabel = "Try it in class tomorrow", actions }: LessonCompleteProps) {
  return (
    <section className="dr-complete">
      <div className="dr-complete-burst" aria-hidden><Mark size={72} /></div>
      <h2 className="dr-complete-title">{title}</h2>
      {subtitle && <p className="dr-complete-sub">{subtitle}</p>}
      <dl className="dr-complete-stats">
        {stats.map((s, i) => <div key={i} className={`dr-stat dr-stat-${s.tone ?? "kola"}`}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
      </dl>
      {tryTomorrow && <div className="dr-complete-try"><strong>{tryLabel}</strong><p>{tryTomorrow}</p></div>}
      <div className="dr-complete-actions">{actions}</div>
    </section>
  );
}

export interface CertificateCardProps { track: Track; name: string; title: string; date: string; code: string; kicker?: string; trackLabel?: string; action?: ReactNode; }
export function CertificateCard({ track, name, title, date, code, kicker = "Certificate of completion", trackLabel, action }: CertificateCardProps) {
  return (
    <article className={cx("dr-cert", `dr-cert-${track}`)}>
      <div className="dr-cert-band" aria-hidden />
      <div className="dr-cert-body">
        <div className="dr-cert-top"><Mark size={36} /><TrackChip track={track} solid>{trackLabel}</TrackChip></div>
        <p className="dr-cert-kicker">{kicker}</p>
        <h3 className="dr-cert-name"><bdi>{name}</bdi></h3>
        <p className="dr-cert-title">{title}</p>
        <div className="dr-cert-foot"><span>{date}</span><span className="dr-cert-code">{code}</span></div>
      </div>
      {action && <div className="dr-cert-action">{action}</div>}
    </article>
  );
}
