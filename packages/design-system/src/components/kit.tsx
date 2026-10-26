import type { ReactNode } from "react";
import { Button, Icon, TrackChip, cx, trackClass, useTrackStyles, type IconName, type Track } from "./primitives";

export type ResourceKind = "lesson-plan" | "worksheet" | "poster" | "slides" | "answer-key" | "certificate";
const KIND_ICON: Record<ResourceKind, IconName> = { "lesson-plan": "file", worksheet: "edit", poster: "image", slides: "video", "answer-key": "check", certificate: "award" };

/** CSS-drawn A4 thumbnail — no image download. */
export function PagePreview({ track = "ai", kind = "worksheet" }: { track?: Track; kind?: ResourceKind }) {
  const style = useTrackStyles()(track);
  return (
    <span className={cx("dr-page", trackClass(style), `dr-page-${kind}`)} aria-hidden>
      <i className="dr-page-band" /><i className="dr-page-h" /><i className="dr-page-l" /><i className="dr-page-l s" /><i className="dr-page-box" /><i className="dr-page-l" /><i className="dr-page-l s" />
    </span>
  );
}

export interface ResourceCardProps { /** Replaces the default PDF/Print buttons (e.g. PDF + PowerPoint). */ actions?: ReactNode; locked?: boolean; kind: ResourceKind; kindLabel: string; title: string; meta?: string; tags?: string[]; track?: Track; onDownload?: () => void; onPrint?: () => void; downloadLabel?: string; printLabel?: string; }
export function ResourceCard({ actions, locked, kind, kindLabel, title, meta, tags, track, onDownload, onPrint, downloadLabel = "PDF", printLabel = "Print" }: ResourceCardProps) {
  return (
    <article className={cx("dr-res", locked && "is-locked")}>
      <PagePreview track={track} kind={kind} />
      <div className="dr-res-main">
        <span className="dr-res-kind"><Icon name={KIND_ICON[kind]} size={16} />{kindLabel}</span>
        <strong className="dr-res-title">{title}</strong>
        {meta && <span className="dr-res-meta">{meta}</span>}
        {tags && <span className="dr-res-tags">{tags.map((t, i) => <span key={i} className="dr-res-tag">{t}</span>)}</span>}
        {!locked && <div className="dr-res-actions">
          {actions ?? <>
            <Button size="sm" variant="secondary" icon="offline" onClick={onDownload}>{downloadLabel}</Button>
            <Button size="sm" variant="ghost" icon="print" onClick={onPrint}>{printLabel}</Button>
          </>}
        </div>}
      </div>
    </article>
  );
}

export interface ClassroomKitProps { track: Track; title: string; subtitle?: string; kicker?: string; items: Omit<ResourceCardProps, "track">[]; action?: ReactNode; }
/** Printable PDFs unlocked after a lesson or unit. */
export function ClassroomKit({ track, title, subtitle, kicker = "Your classroom kit", items, action }: ClassroomKitProps) {
  return (
    <section className="dr-kit">
      <header className="dr-kit-head">
        <span className="dr-kit-badge"><Icon name="award" /></span>
        <div><span className="dr-lab-kicker">{kicker}</span><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      </header>
      <div className="dr-kit-list">{items.map((it, i) => <ResourceCard key={i} track={track} {...it} />)}</div>
      {action && <div className="dr-kit-foot">{action}</div>}
    </section>
  );
}

export interface OnboardingStepProps { step: number; total: number; title: string; body?: string; art?: ReactNode; primary?: ReactNode; secondary?: ReactNode; progressLabel?: string; children?: ReactNode; }
export function OnboardingStep({ step, total, title, body, art, primary, secondary, progressLabel = "Setup progress", children }: OnboardingStepProps) {
  return (
    <section className="dr-onb">
      <div className="dr-onb-dots" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={progressLabel}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < step ? "on" : ""} />)}
      </div>
      {art && <div className="dr-onb-art" aria-hidden>{art}</div>}
      <h2 className="dr-onb-title">{title}</h2>
      {body && <p className="dr-onb-body">{body}</p>}
      {children && <div className="dr-onb-choices">{children}</div>}
      <div className="dr-onb-actions">{primary}{secondary}</div>
    </section>
  );
}

export interface PlacementLevel { track: Track; trackLabel?: string; level: number; of?: number; label: string; }
export interface PlacementResultProps { title: string; summary?: string; levels: PlacementLevel[]; actions?: ReactNode; }
export function PlacementResult({ title, summary, levels, actions }: PlacementResultProps) {
  const styleOf = useTrackStyles();
  return (
    <section className="dr-place">
      <h2 className="dr-onb-title">{title}</h2>
      {summary && <p className="dr-onb-body">{summary}</p>}
      <ul className="dr-place-list">
        {levels.map((l) => (
          <li key={l.track} className={cx("dr-place-row", trackClass(styleOf(l.track)))}>
            <TrackChip track={l.track} solid>{l.trackLabel}</TrackChip>
            <span className="dr-place-meter" role="img" aria-label={l.label}>{Array.from({ length: l.of ?? 4 }, (_, i) => <i key={i} className={i < l.level ? "on" : ""} />)}</span>
            <span className="dr-place-label">{l.label}</span>
          </li>
        ))}
      </ul>
      <div className="dr-onb-actions">{actions}</div>
    </section>
  );
}
