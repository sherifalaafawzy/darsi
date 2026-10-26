import { createContext, useContext, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import paths from "../icons/paths.json";

/** A track id. "ai", "iot" and "cyber" are built in; platform admins can add more (see TrackStylesProvider). */
export type Track = string;
export type Tone = "kola" | "lagoon" | "sunbird" | "hibiscus";
export type IconName = keyof typeof paths;
export const ICON_NAMES = Object.keys(paths) as IconName[];

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
/** English names of the built-in tracks, the last fallback when no name is passed. */
export const TRACK_NAMES: Record<string, string> = { ai: "AI", iot: "IoT", cyber: "Cyber security" };

/** The colour families a track can use (tokens.json): the three built-in tracks', then five for tracks added later. */
export const TRACK_TONES = ["sunbird", "lagoon", "hibiscus", "leaf", "lilac", "clay", "sky", "slate"] as const;
export type TrackTone = (typeof TRACK_TONES)[number];
export interface TrackStyle { tone: TrackTone; icon: IconName }
export const BUILTIN_TRACK_STYLES: Record<string, TrackStyle> = {
  ai: { tone: "sunbird", icon: "ai" }, iot: { tone: "lagoon", icon: "iot" }, cyber: { tone: "hibiscus", icon: "cyber" },
};
const UNKNOWN_TRACK: TrackStyle = { tone: "slate", icon: "learn" };
const TrackStyles = createContext<Record<string, TrackStyle>>(BUILTIN_TRACK_STYLES);
/** Gives every track-aware component each track's colour and icon. Without it, only the built-in tracks are known. */
export function TrackStylesProvider({ styles, children }: { styles: Record<string, TrackStyle>; children: ReactNode }) {
  return <TrackStyles.Provider value={styles}>{children}</TrackStyles.Provider>;
}
/** Resolves a track id to its style; an unknown id gets a neutral slate colour and the "learn" icon. */
export function useTrackStyles(): (track?: Track) => TrackStyle {
  const styles = useContext(TrackStyles);
  return (track) => (track ? styles[track] ?? BUILTIN_TRACK_STYLES[track] : undefined) ?? UNKNOWN_TRACK;
}
/** The classes that set a track's --tr, --tr-soft and --tr-ink (components.css). */
export const trackClass = (style: TrackStyle) => `dr-tr dr-tr-${style.tone}`;
const MIRROR: Partial<Record<IconName, true>> = { back: true, next: true, undo: true, redo: true };

export interface IconProps {
  name: IconName;
  size?: number;
  /** Accessible label — only when the icon stands alone and carries meaning. */
  label?: string;
  className?: string;
}
/** Darsi icon set: 24px grid, 2px round strokes, currentColor. `back`/`next` and `undo`/`redo` mirror in RTL. */
export function Icon({ name, size = 24, label, className }: IconProps) {
  return (
    <svg
      className={cx("dr-icon", MIRROR[name] && "dr-icon-mirror", className)}
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}
    >
      {(paths[name] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** The Darsi mark, token-coloured. Never mirrored. */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="dr-mark">
      <path d="M14 4h36a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10H26l-12 9v-9a10 10 0 0 1-10-10V14A10 10 0 0 1 14 4z" fill="var(--kola)" />
      <path d="M32 13c1.6 7.4 4.6 10.4 12 12-7.4 1.6-10.4 4.6-12 12-1.6-7.4-4.6-10.4-12-12 7.4-1.6 10.4-4.6 12-12z" fill="var(--sunbird)" />
      <circle cx={46} cy={40} r={4} fill="var(--ink)" />
    </svg>
  );
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** primary = the one action the screen is for; secondary = alternatives; ghost = skip / cancel. */
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Square icon button; `children` becomes its aria-label. */
  iconOnly?: boolean;
  children: ReactNode;
}
export function Button({ variant = "primary", size = "md", block, icon, iconEnd, loading, iconOnly, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button" {...rest}
      className={cx("dr-btn", `dr-btn-${variant}`, `dr-btn-${size}`, block && "dr-btn-block", iconOnly && "dr-btn-icon", loading && "is-loading", className)}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? String(children) : rest["aria-label"]}
      disabled={disabled || loading}
    >
      {loading ? <span className="dr-spinner" aria-hidden /> : icon && <Icon name={icon} />}
      {!iconOnly && <span className="dr-btn-label">{children}</span>}
      {!loading && iconEnd && <Icon name={iconEnd} />}
    </button>
  );
}

export interface TrackChipProps { track: Track; solid?: boolean; children?: ReactNode; }
/** Track label — icon + word, never colour alone. */
export function TrackChip({ track, solid, children }: TrackChipProps) {
  const style = useTrackStyles()(track);
  return (
    <span className={cx("dr-chip", trackClass(style), solid && "dr-chip-solid")}>
      <Icon name={style.icon} size={18} />
      <span>{children ?? TRACK_NAMES[track] ?? track}</span>
    </span>
  );
}

export interface ProgressBarProps { value: number; label?: string; valueText?: string; ariaLabel?: string; track?: Track | "kola"; thick?: boolean; }
/** Fills from inline-start, so it runs right-to-left in RTL automatically. */
export function ProgressBar({ value, label, valueText, ariaLabel, track = "kola", thick }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, value || 0));
  const style = useTrackStyles()(track);
  return (
    <div className={cx("dr-progress", track !== "kola" && trackClass(style), thick && "dr-progress-thick")}>
      {label && <div className="dr-progress-head"><span>{label}</span><span>{valueText ?? `${v}%`}</span></div>}
      <div className="dr-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={valueText} aria-label={label ?? ariaLabel}>
        <div className="dr-progress-fill" style={{ inlineSize: `${v}%` }} />
      </div>
    </div>
  );
}

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string; hint?: string; error?: string; }
/** Single-line input with dir="auto" so mixed-language input reads correctly. */
export function TextField({ label, hint, error, id, ...rest }: TextFieldProps) {
  // useId, not the label: "\W" turns every Arabic label into the same id, which breaks label/hint association.
  const auto = useId();
  const fid = id ?? `tf${auto}`;
  return (
    <div className={cx("dr-field", error && "has-error")}>
      <label htmlFor={fid} className="dr-field-label">{label}</label>
      <input id={fid} dir="auto" className="dr-field-input" aria-invalid={error ? true : undefined} aria-describedby={`${fid}-hint`} {...rest} />
      {(error || hint) && <span id={`${fid}-hint`} className="dr-field-hint">{error && <Icon name="cross" size={16} />}{error ?? hint}</span>}
    </div>
  );
}

export interface SwitchProps { label: string; description?: string; checked: boolean; onChange?: (next: boolean) => void; id?: string; }
export function Switch({ label, description, checked, onChange, id }: SwitchProps) {
  const auto = useId();
  const sid = id ?? `sw${auto}`;
  return (
    <div className="dr-switch-row">
      <label htmlFor={sid} className="dr-switch-text"><strong>{label}</strong>{description && <span>{description}</span>}</label>
      <button id={sid} type="button" role="switch" aria-checked={checked} className={cx("dr-switch", checked && "is-on")} onClick={() => onChange?.(!checked)}>
        <span className="dr-switch-thumb" />
      </button>
    </div>
  );
}

export interface ChoiceCardProps { title: string; description?: string; icon?: IconName; selected?: boolean; multi?: boolean; onClick?: () => void; }
export function ChoiceCard({ title, description, icon, selected, multi, onClick }: ChoiceCardProps) {
  return (
    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={!!selected} className={cx("dr-choice", selected && "is-selected", multi && "is-multi")} onClick={onClick}>
      {icon && <span className="dr-choice-icon"><Icon name={icon} /></span>}
      <span className="dr-choice-text"><strong>{title}</strong>{description && <span>{description}</span>}</span>
      <span className="dr-choice-check" aria-hidden>{selected && <Icon name="check" size={18} />}</span>
    </button>
  );
}
