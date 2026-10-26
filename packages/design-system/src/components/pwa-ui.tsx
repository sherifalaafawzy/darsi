import type { ReactNode } from "react";
import { Button, Icon, Mark, ProgressBar, cx, trackClass, useTrackStyles, type Track } from "./primitives";

export interface ConnectionStatusProps { state: "offline" | "syncing" | "synced"; children: ReactNode; action?: ReactNode; floating?: boolean; }
/** Tells the truth about the network. Offline is calm, not an error. */
export function ConnectionStatus({ state, children, action, floating }: ConnectionStatusProps) {
  const icon = state === "offline" ? "wifi-off" : state === "syncing" ? "sync" : "check";
  return (
    <div className={cx("dr-conn", `dr-conn-${state}`, floating && "dr-floating-top")} role="status" aria-live="polite">
      <Icon name={icon} size={20} className={state === "syncing" ? "dr-spin" : undefined} />
      <span>{children}</span>{action}
    </div>
  );
}

export interface InstallPromptProps { title: string; body: string; onInstall?: () => void; onDismiss?: () => void; installLabel?: string; dismissLabel?: string; floating?: boolean; }
/** Show after the first completed lesson; wait 14 days after "Not now". */
export function InstallPrompt({ title, body, onInstall, onDismiss, installLabel = "Install", dismissLabel = "Not now", floating }: InstallPromptProps) {
  return (
    <aside className={cx("dr-install", floating && "dr-floating-bottom")} aria-label={title}>
      <span className="dr-install-icon"><Mark size={40} /></span>
      <div className="dr-install-text"><strong>{title}</strong><p>{body}</p></div>
      <div className="dr-install-actions">
        <Button size="sm" icon="install" onClick={onInstall}>{installLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>{dismissLabel}</Button>
      </div>
    </aside>
  );
}

export interface UpdateToastProps { children: ReactNode; actionLabel?: string; onAction?: () => void; floating?: boolean; }
/** A waiting service-worker update. Never reload during a lesson. */
export function UpdateToast({ children, actionLabel = "Reload", onAction, floating }: UpdateToastProps) {
  return (
    <div className={cx("dr-toast", floating && "dr-floating-bottom")} role="status">
      <Icon name="sync" size={20} /><span className="dr-toast-text">{children}</span>
      <button type="button" className="dr-toast-action" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

export interface DownloadRowProps {
  track?: Track; title: string; meta?: string; state?: "idle" | "downloading" | "done" | "error"; progress?: number;
  onDownload?: () => void; onCancel?: () => void; downloadLabel?: string; cancelLabel?: string; doneLabel?: string; retryLabel?: string; errorText?: string;
}
/** A downloadable unit — always show the size before downloading. */
export function DownloadRow({ track = "ai", title, meta, state = "idle", progress = 0, onDownload, onCancel, downloadLabel = "Download", cancelLabel = "Cancel", doneLabel = "Saved", retryLabel = "Retry", errorText = "Download stopped — check your connection" }: DownloadRowProps) {
  const style = useTrackStyles()(track);
  const right = state === "done" ? <span className="dr-dl-done"><Icon name="check" size={20} />{doneLabel}</span>
    : state === "downloading" ? <Button size="sm" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
    : <Button size="sm" variant="secondary" icon={state === "error" ? "sync" : "offline"} onClick={onDownload}>{state === "error" ? retryLabel : downloadLabel}</Button>;
  return (
    <div className={cx("dr-dl", `is-${state}`)}>
      <span className={cx("dr-dl-icon", trackClass(style))}><Icon name={style.icon} /></span>
      <div className="dr-dl-main">
        <strong>{title}</strong>
        <span className="dr-dl-meta">{state === "error" ? errorText : meta}</span>
        {state === "downloading" && <ProgressBar value={progress} track={track} ariaLabel={title} />}
      </div>
      {right}
    </div>
  );
}

export interface Language { code: string; native: string; english: string; dir?: "ltr" | "rtl"; }
export interface LanguagePickerProps { languages: Language[]; value: string; onChange?: (code: string) => void; label: string; }
/** Languages by native name in their own script — never flags. */
export function LanguagePicker({ languages, value, onChange, label }: LanguagePickerProps) {
  return (
    <div className="dr-langs" role="radiogroup" aria-label={label}>
      {languages.map((l) => {
        const on = l.code === value;
        return (
          <button key={l.code} type="button" role="radio" aria-checked={on} className={cx("dr-lang", on && "is-selected")} onClick={() => onChange?.(l.code)}>
            <span className="dr-lang-native" lang={l.code} dir={l.dir ?? "ltr"}>{l.native}</span>
            <span className="dr-lang-english">{l.english}</span>
            <span className="dr-lang-check" aria-hidden>{on && <Icon name="check" size={20} />}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface EmptyStateProps { title: string; body?: string; icon?: Parameters<typeof Icon>[0]["name"]; tone?: "neutral" | "offline" | "error"; action?: ReactNode; secondary?: ReactNode; }
/** Always offer a next step; errors say progress is safe. */
export function EmptyState({ title, body, icon, tone = "neutral", action, secondary }: EmptyStateProps) {
  return (
    <section className={cx("dr-empty", `dr-empty-${tone}`)} role={tone === "error" ? "alert" : undefined}>
      <span className="dr-empty-icon"><Icon name={icon ?? (tone === "offline" ? "wifi-off" : tone === "error" ? "warning" : "search")} size={32} /></span>
      <h3>{title}</h3>{body && <p>{body}</p>}
      <div className="dr-empty-actions">{action}{secondary}</div>
    </section>
  );
}
