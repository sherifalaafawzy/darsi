import { useId, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useKit } from "./strings";

/** A labelled range with its value shown. Mirrors in Arabic like every other control. */
export function Slider({ label, value, min, max, step = 1, onChange, format = String, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="lb-slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input id={id} className="lb-range" type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/** One choice out of a few (a radio group that looks like buttons). */
export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="lb-seg" role="radiogroup" aria-label={label}>
      <span className="lb-seg-label">{label}</span>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** Run/Pause, One step and Start again, the same in every lab. */
export function RunBar({ running, onToggle, onStep, onReset, runLabel, children }: { running: boolean; onToggle: () => void; onStep?: () => void; onReset?: () => void; runLabel?: string; children?: ReactNode }) {
  const k = useKit();
  return (
    <div className="lb-runbar">
      <Button size="sm" icon={running ? "pause" : "play"} onClick={onToggle}>{running ? k.pause : runLabel ?? k.run}</Button>
      {onStep && <Button size="sm" variant="secondary" icon="next" disabled={running} onClick={onStep}>{k.step}</Button>}
      {onReset && <Button size="sm" variant="ghost" icon="sync" onClick={onReset}>{k.reset}</Button>}
      {children}
    </div>
  );
}

/** A few headline numbers (error, accuracy, round). */
export function Stats({ items }: { items: { label: string; value: string }[] }) {
  return <dl className="lb-stats">{items.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>;
}
