import { useEffect, useRef, type ReactNode } from "react";
import { BrandMark, Button, DecorMark, Icon, Mark, ProgressBar, TrackChip, cx, trackClass, useBrand, useTrackStyles, type Track } from "./primitives";

export interface LessonCardProps { track: Track; title: string; meta?: string; progress?: number; offline?: boolean; offlineLabel?: string; trackLabel?: string; action?: ReactNode; }
export function LessonCard({ track, title, meta, progress, offline, offlineLabel = "Offline ready", trackLabel, action }: LessonCardProps) {
  return (
    <article className="dr-card">
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

export interface FeedbackSheetProps {
  result: "correct" | "wrong"; title: string; explanation?: string; answer?: string; answerLabel?: string; onContinue?: () => void; continueLabel?: string; floating?: boolean;
  /** Move focus to the result's title when the sheet opens (default): the Check button it replaces is gone, and focus would drop to the page. */
  autoFocus?: boolean;
}
/**
 * A checked answer's result. It replaces the bar with Check, so it takes the focus (its title, which a screen reader
 * reads; Tab goes on to Continue). It isn't a live region: a page that wants the explanation read out announces it in a
 * live region that is already on the page (a region inserted already filled is often not read).
 */
export function FeedbackSheet({ result, title, explanation, answer, answerLabel = "Answer: ", onContinue, continueLabel = "Continue", floating = true, autoFocus = true }: FeedbackSheetProps) {
  const ok = result === "correct";
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (autoFocus) head.current?.focus({ preventScroll: true }); }, [autoFocus]);
  return (
    <section className={cx("dr-sheet", ok ? "dr-sheet-correct" : "dr-sheet-wrong", floating && "dr-floating-bottom")}>
      <div className="dr-sheet-head"><span className="dr-sheet-badge"><Icon name={ok ? "check" : "cross"} /></span><h2 ref={head} className="dr-sheet-title" tabIndex={-1}>{title}</h2></div>
      {explanation && <p className="dr-sheet-body">{explanation}</p>}
      {answer && <p className="dr-sheet-answer"><strong>{answerLabel}</strong><bdi>{answer}</bdi></p>}
      <Button block variant={ok ? "primary" : "secondary"} onClick={onContinue} iconEnd="next">{continueLabel}</Button>
    </section>
  );
}

export interface PathNode { label: string; state?: "done" | "current" | "locked"; checkpoint?: boolean; callout?: string; stateLabel?: string; onClick?: () => void;
  /** A locked node that can still be opened (it keeps its lock): for staff looking through a course. */
  open?: boolean; }
export interface UnitPathProps { nodes: PathNode[]; track?: Track | "kola"; label?: string; }
const OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1];
/** Winding lesson map; the zigzag uses logical offsets so it mirrors in RTL. */
export function UnitPath({ nodes, track = "kola", label }: UnitPathProps) {
  const style = useTrackStyles()(track);
  return (
    <ol className={cx("dr-path", track !== "kola" && trackClass(style))} aria-label={label}>
      {nodes.map((n, i) => {
        const state = n.state ?? "locked";
        let icon: Parameters<typeof Icon>[0]["name"] = state === "done" ? "check" : state === "locked" ? "lock" : n.checkpoint ? "award" : track !== "kola" ? style.icon : "next";
        if (state === "locked" && !n.checkpoint) icon = "lock";
        return (
          <li key={i} className={cx("dr-path-step", `is-${state}`, n.checkpoint && "is-checkpoint")} style={{ ["--dr-off" as string]: OFFSETS[i % OFFSETS.length] }}>
            {state === "current" && n.callout && <span className="dr-path-callout">{n.callout}</span>}
            <button type="button" className="dr-path-node" disabled={state === "locked" && !n.open} onClick={n.onClick} aria-label={n.label + (n.stateLabel ? ` — ${n.stateLabel}` : "")} aria-current={state === "current" ? "step" : undefined}>
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
  const styleOf = useTrackStyles();
  return (
    <section className="dr-complete">
      <div className="dr-complete-burst" aria-hidden><DecorMark size={72} /></div>
      {/* Focusable from a script: a lesson moves focus here when it ends. */}
      <h2 className="dr-complete-title" tabIndex={-1}>{title}</h2>
      {subtitle && <p className="dr-complete-sub">{subtitle}</p>}
      <dl className="dr-complete-stats">
        {stats.map((s, i) => <div key={i} className={cx("dr-stat", !s.tone || s.tone === "kola" ? "dr-stat-kola" : trackClass(styleOf(s.tone)))}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
      </dl>
      {tryTomorrow && <div className="dr-complete-try"><strong>{tryLabel}</strong><p>{tryTomorrow}</p></div>}
      <div className="dr-complete-actions">{actions}</div>
    </section>
  );
}

export interface CertificateCardProps { track: Track; name: string; title: string; date: string; code: string; kicker?: string; trackLabel?: string; action?: ReactNode; }
export function CertificateCard({ track, name, title, date, code, kicker = "Certificate of completion", trackLabel, action }: CertificateCardProps) {
  const style = useTrackStyles()(track);
  const brand = useBrand();
  return (
    <article className={cx("dr-cert", trackClass(style))}>
      <div className="dr-cert-band" aria-hidden />
      <div className="dr-cert-body">
        <div className="dr-cert-top">
          {/* An organization's certificate: its logo first, Darsi's mark beside it (not on a site without Darsi's identity),
              and its name as the issuer. */}
          <span className="dr-cert-marks"><BrandMark size={36} />{brand.logo && brand.darsi !== false && <Mark size={20} />}</span>
          <TrackChip track={track} solid>{trackLabel}</TrackChip>
        </div>
        <p className="dr-cert-kicker">{kicker}</p>
        <h3 className="dr-cert-name"><bdi>{name}</bdi></h3>
        <p className="dr-cert-title">{title}</p>
        {brand.name && <p className="dr-cert-issuer"><bdi>{brand.name}</bdi></p>}
        <div className="dr-cert-foot"><span>{date}</span><span className="dr-cert-code">{code}</span></div>
      </div>
      {action && <div className="dr-cert-action">{action}</div>}
    </article>
  );
}
