import { Fragment, useState, type ReactNode } from "react";
import { Button, Icon, cx, type IconName } from "./primitives";

export type QuestionType = "choice" | "multi" | "truefalse" | "image" | "match" | "order" | "fill" | "type" | "hotspot" | "scenario" | "reflect" | "video" | "listen";
type AnswerState = "idle" | "selected" | "correct" | "wrong";
const TYPE_ICON: Record<QuestionType, IconName> = { choice: "check", multi: "check", truefalse: "check", image: "image", match: "link", order: "up", fill: "edit", type: "edit", hotspot: "target", scenario: "chat", reflect: "idea", video: "video", listen: "audio" };
const resultIcon = (s: AnswerState) => (s === "correct" ? "check" : s === "wrong" ? "cross" : null);

export interface QuestionHeaderProps { type?: QuestionType; typeLabel: string; prompt: ReactNode; hint?: ReactNode; media?: ReactNode; icon?: IconName; onAudio?: () => void; audioLabel?: string; }
/** Every question starts here: how to answer (type label), then the prompt. */
export function QuestionHeader({ type = "choice", typeLabel, prompt, hint, media, icon, onAudio, audioLabel = "Read aloud" }: QuestionHeaderProps) {
  return (
    <header className="dr-qhead">
      <div className="dr-qhead-kicker">
        <Icon name={icon ?? TYPE_ICON[type]} size={18} /><span>{typeLabel}</span>
        {onAudio && <Button variant="ghost" size="sm" iconOnly icon="audio" onClick={onAudio}>{audioLabel}</Button>}
      </div>
      <h2 className="dr-qhead-prompt">{prompt}</h2>
      {hint && <p className="dr-qhead-hint">{hint}</p>}
      {media && <div className="dr-qhead-media">{media}</div>}
    </header>
  );
}

export interface QuizOptionProps { keyLabel?: string; state?: AnswerState; feedback?: ReactNode; multi?: boolean; onClick?: () => void; disabled?: boolean; children: ReactNode; }
/** One answer; `multi` = checkbox for "select all that apply". */
export function QuizOption({ keyLabel, state = "idle", feedback, multi, onClick, disabled, children }: QuizOptionProps) {
  const icon = resultIcon(state) ?? (multi && state === "selected" ? "check" : null);
  return (
    <button type="button" role={multi ? "checkbox" : undefined} aria-checked={multi ? state !== "idle" : undefined} aria-pressed={!multi && state === "selected" ? true : undefined}
      className={cx("dr-opt", `dr-opt-${state}`, multi && "dr-opt-multi")} onClick={onClick} disabled={disabled}>
      <span className="dr-opt-key" aria-hidden>{icon ? <Icon name={icon} size={20} /> : keyLabel}</span>
      <span className="dr-opt-text">{children}</span>
      {feedback && <span className="dr-opt-feedback">{feedback}</span>}
    </button>
  );
}

export interface TrueFalseProps { value?: boolean; result?: "correct" | "wrong"; onChange?: (v: boolean) => void; trueLabel?: string; falseLabel?: string; label?: string; }
export function TrueFalse({ value, result, onChange, trueLabel = "True", falseLabel = "False", label }: TrueFalseProps) {
  const btn = (v: boolean, text: string) => {
    const on = value === v, st: AnswerState = on ? result ?? "selected" : "idle", ic = resultIcon(st);
    return (
      <button type="button" role="radio" aria-checked={on} className={cx("dr-tf", `dr-opt-${st}`)} onClick={() => onChange?.(v)}>
        {ic && <Icon name={ic} />}<span>{text}</span>
      </button>
    );
  };
  return <div className="dr-tf-row" role="radiogroup" aria-label={label}>{btn(true, trueLabel)}{btn(false, falseLabel)}</div>;
}

export interface ImageOption { id: string; label: string; media: ReactNode; }
export interface ImageChoiceProps { options: ImageOption[]; value?: string; answer?: string; result?: "correct" | "wrong"; onChange?: (id: string) => void; label?: string; }
export function ImageChoice({ options, value, answer, result, onChange, label }: ImageChoiceProps) {
  return (
    <div className="dr-imgchoice" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.id === value, st: AnswerState = on ? result ?? "selected" : result && o.id === answer ? "correct" : "idle", ic = resultIcon(st);
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} className={cx("dr-imgopt", `dr-opt-${st}`)} onClick={() => onChange?.(o.id)}>
            <span className="dr-imgopt-media">{o.media}</span>
            <span className="dr-imgopt-label">{ic && <Icon name={ic} size={18} />}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface Item { id: string; label: ReactNode; }
const PAIR_TONES = ["kola", "lagoon", "sunbird", "hibiscus", "correct"] as const;
export interface MatchPairsProps { left: Item[]; right: Item[]; pairs?: Record<string, string>; answer?: Record<string, string>; result?: boolean; onChange?: (pairs: Record<string, string>) => void; }
/** Tap left, then right. Each pair gets a colour and a number. */
export function MatchPairs({ left, right, pairs: initial = {}, answer, result, onChange }: MatchPairsProps) {
  const [pairs, setPairs] = useState<Record<string, string>>(initial);
  const [active, setActive] = useState<string | null>(null);
  const order = Object.keys(pairs);
  const rightToLeft = Object.fromEntries(Object.entries(pairs).map(([l, r]) => [r, l]));
  const pickLeft = (id: string) => { if (pairs[id]) { const n = { ...pairs }; delete n[id]; setPairs(n); } setActive(id); };
  const pickRight = (id: string) => {
    if (!active) return;
    const n = Object.fromEntries(Object.entries(pairs).filter(([, r]) => r !== id));
    n[active] = id; setPairs(n); setActive(null); onChange?.(n);
  };
  const tile = (side: "l" | "r", it: Item) => {
    const leftId = side === "l" ? (pairs[it.id] ? it.id : undefined) : rightToLeft[it.id];
    const idx = leftId ? order.indexOf(leftId) : -1;
    const res = result && leftId ? (answer?.[leftId] === pairs[leftId] ? "correct" : "wrong") : null;
    return (
      <button key={it.id} type="button" aria-pressed={side === "l" ? active === it.id : undefined} onClick={() => (side === "l" ? pickLeft(it.id) : pickRight(it.id))}
        className={cx("dr-match-tile", idx >= 0 && `dr-tone-${PAIR_TONES[idx % PAIR_TONES.length]}`, side === "l" && active === it.id && "is-active", res && `is-${res}`)}>
        {idx >= 0 ? <span className="dr-match-badge">{res ? <Icon name={res === "correct" ? "check" : "cross"} size={16} /> : idx + 1}</span> : <span className="dr-match-badge is-empty" />}
        <span>{it.label}</span>
      </button>
    );
  };
  return (
    <div className="dr-match">
      <div className="dr-match-col">{left.map((it) => tile("l", it))}</div>
      <div className="dr-match-col">{right.map((it) => tile("r", it))}</div>
    </div>
  );
}

export interface OrderStepsProps { items: Item[]; answer?: string[]; result?: boolean; numerals?: string[]; upLabel?: string; downLabel?: string; label?: string; onChange?: (items: Item[]) => void; }
/** Reorder with up/down buttons — no drag needed, works with screen readers. */
export function OrderSteps({ items: initial, answer, result, numerals, upLabel = "Move up", downLabel = "Move down", label, onChange }: OrderStepsProps) {
  const [items, setItems] = useState(initial);
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const n = items.slice(); [n[i], n[j]] = [n[j], n[i]]; setItems(n); onChange?.(n);
  };
  return (
    <ol className="dr-order" aria-label={label}>
      {items.map((it, i) => {
        const res = result ? (answer?.[i] === it.id ? "correct" : "wrong") : null;
        const name = typeof it.label === "string" ? it.label : "";
        return (
          <li key={it.id} className={cx("dr-order-item", res && `is-${res}`)}>
            <span className="dr-order-num">{res ? <Icon name={res === "correct" ? "check" : "cross"} size={18} /> : numerals?.[i] ?? i + 1}</span>
            <span className="dr-order-text">{it.label}</span>
            <span className="dr-order-moves">
              <button type="button" className="dr-order-move" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${upLabel}: ${name}`}><Icon name="up" size={20} /></button>
              <button type="button" className="dr-order-move" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`${downLabel}: ${name}`}><Icon name="down" size={20} /></button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface FillBlankProps { parts: Array<string | { blank: number }>; bank: string[]; filled?: Record<number, string>; answer?: Record<number, string>; result?: boolean; onChange?: (f: Record<number, string>) => void; bankLabel?: string; blankLabel?: string; }
/** Sentence with gaps + word bank. Words are <bdi>-isolated for mixed-language sentences. */
export function FillBlank({ parts, bank, filled: initial = {}, answer, result, onChange, bankLabel = "Word bank", blankLabel = "Empty blank" }: FillBlankProps) {
  const [filled, setFilled] = useState<Record<number, string>>(initial);
  const blanks = parts.filter((p) => typeof p === "object").length;
  const used = Object.values(filled);
  const place = (w: string) => {
    for (let i = 0; i < blanks; i++) if (!filled[i]) { const n = { ...filled, [i]: w }; setFilled(n); onChange?.(n); return; }
  };
  const clear = (i: number) => { const n = { ...filled }; delete n[i]; setFilled(n); onChange?.(n); };
  return (
    <div className="dr-fill">
      <p className="dr-fill-sentence">
        {parts.map((p, i) => {
          if (typeof p === "string") return <Fragment key={i}>{p}</Fragment>;
          const w = filled[p.blank], res = result && w ? (answer?.[p.blank] === w ? "correct" : "wrong") : null;
          return <button key={i} type="button" className={cx("dr-blank", w && "is-filled", res && `is-${res}`)} onClick={() => w && clear(p.blank)} aria-label={w ?? blankLabel}>{w ? <bdi>{w}</bdi> : " "}</button>;
        })}
      </p>
      <div className="dr-bank" aria-label={bankLabel}>
        {bank.map((w) => <button key={w} type="button" className={cx("dr-bank-chip", used.includes(w) && "is-used")} disabled={used.includes(w)} onClick={() => place(w)}><bdi>{w}</bdi></button>)}
      </div>
    </div>
  );
}

export interface Spot { id: string; x: number; y: number; w: number; h: number; label: string; }
export interface HotspotImageProps { spots: Spot[]; found?: string[]; onChange?: (found: string[]) => void; counter?: (found: number, total: number) => string; spotLabel?: string; children: ReactNode; }
/** Tap areas of a picture. Positions are % of the picture and never mirror. */
export function HotspotImage({ spots, found: initial = [], onChange, counter, spotLabel = "Possible problem area", children }: HotspotImageProps) {
  const [found, setFound] = useState(initial);
  const hit = (id: string) => { if (found.includes(id)) return; const n = [...found, id]; setFound(n); onChange?.(n); };
  return (
    <div className="dr-hotspot">
      <div className="dr-hotspot-stage">
        {children}
        {spots.map((s) => {
          const on = found.includes(s.id);
          return (
            <button key={s.id} type="button" className={cx("dr-spot", on && "is-found")} style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} onClick={() => hit(s.id)} aria-label={on ? s.label : spotLabel}>
              {on && <span className="dr-spot-badge">{found.indexOf(s.id) + 1}</span>}
            </button>
          );
        })}
      </div>
      <div className="dr-hotspot-foot"><Icon name="target" size={18} /><span>{counter ? counter(found.length, spots.length) : `${found.length} of ${spots.length} found`}</span></div>
      {found.length > 0 && <ol className="dr-hotspot-notes">{found.map((id) => <li key={id}>{spots.find((s) => s.id === id)?.label}</li>)}</ol>}
    </div>
  );
}

export interface ScenarioChoice { id: string; label: ReactNode; tone: "good" | "consider"; toneLabel?: string; consequence: ReactNode; }
export interface ScenarioCardProps { who: string; initial?: string; situation: ReactNode; ask: ReactNode; choices: ScenarioChoice[]; chosen?: string; onChange?: (id: string) => void; }
/** "What would you do?" — better choices, not single right answers. */
export function ScenarioCard({ who, initial = "?", situation, ask, choices, chosen: init, onChange }: ScenarioCardProps) {
  const [chosen, setChosen] = useState(init);
  const pick = choices.find((c) => c.id === chosen);
  return (
    <section className="dr-scenario">
      <div className="dr-scenario-situation">
        <span className="dr-scenario-avatar" aria-hidden>{initial}</span>
        <div><strong className="dr-scenario-who">{who}</strong><p>{situation}</p></div>
      </div>
      <p className="dr-scenario-ask">{ask}</p>
      <div className="dr-scenario-choices">
        {choices.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === chosen} className={cx("dr-scenario-choice", c.id === chosen && "is-chosen")} onClick={() => { setChosen(c.id); onChange?.(c.id); }}>{c.label}</button>
        ))}
      </div>
      {pick && (
        <div className={cx("dr-scenario-outcome", `is-${pick.tone}`)} role="status">
          <Icon name={pick.tone === "good" ? "check" : "info"} />
          <div><strong>{pick.toneLabel ?? (pick.tone === "good" ? "Strong choice" : "Think again")}</strong><p>{pick.consequence}</p></div>
        </div>
      )}
    </section>
  );
}

export interface ReflectionProps { prompt: ReactNode; value?: string; placeholder?: string; onChange?: (v: string) => void; countText?: (words: number) => string; action?: ReactNode; feedback?: ReactNode; feedbackLabel?: string; feedbackNote?: string; id?: string; }
/** Ungraded open answer, saved to the teacher's notes. AI suggestions are always labelled. */
export function Reflection({ prompt, value = "", placeholder, onChange, countText, action, feedback, feedbackLabel = "Suggestion from Darsi AI", feedbackNote = "AI can be wrong — keep what fits your class.", id = "reflect" }: ReflectionProps) {
  const [v, setV] = useState(value);
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  return (
    <div className="dr-reflect">
      <label className="dr-reflect-label" htmlFor={id}>{prompt}</label>
      <textarea id={id} dir="auto" className="dr-reflect-input" rows={4} value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); onChange?.(e.target.value); }} />
      <div className="dr-reflect-foot"><span>{countText ? countText(words) : `${words} words`}</span>{action}</div>
      {feedback && (
        <aside className="dr-reflect-ai">
          <div className="dr-reflect-ai-head"><Icon name="ai" size={18} /><strong>{feedbackLabel}</strong></div>
          <p>{feedback}</p><span className="dr-reflect-ai-note">{feedbackNote}</span>
        </aside>
      )}
    </div>
  );
}
