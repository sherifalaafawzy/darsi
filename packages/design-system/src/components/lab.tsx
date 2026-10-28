import { Fragment, useState, type ReactNode } from "react";
import { Button, Icon, ProgressBar, TextField, cx, type IconName, type Tone } from "./primitives";

/** `num` formats numbers for the page's language (Arabic-Indic digits in Arabic); plain digits without it. */
export interface LabProps { title: string; kicker?: string; takeaway?: ReactNode; num?: (n: number, opts?: Intl.NumberFormatOptions) => string }
const plainNum = (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat("en", o).format(n);
export function LabFrame({ title, kicker = "AI lab", takeaway, icon = "ai", children }: LabProps & { icon?: IconName; children: ReactNode }) {
  return (
    <section className="dr-lab">
      <header className="dr-lab-head"><span className="dr-lab-icon"><Icon name={icon} /></span><div><span className="dr-lab-kicker">{kicker}</span><h3>{title}</h3></div></header>
      {children}
      {takeaway && <p className="dr-lab-takeaway"><Icon name="idea" size={18} /><span>{takeaway}</span></p>}
    </section>
  );
}

export interface Ingredient { key: string; label: string; text: string; on?: boolean; }
export interface PromptBuilderProps extends LabProps {
  ingredients: Ingredient[];
  /** Example answers indexed by number of active ingredients (offline, pre-reviewed). */
  outputs: string[];
  ran?: boolean;
  strengthLabel?: string; strengthText?: (on: number, total: number) => string; runLabel?: string; outputLabel?: string; emptyText?: string;
}
export function PromptBuilder({ ingredients, outputs, ran: initRan, strengthLabel = "Prompt strength", strengthText, runLabel = "Ask the AI", outputLabel = "Example answer", emptyText = "Tap ingredients to build a prompt", ...lab }: PromptBuilderProps) {
  const [on, setOn] = useState(ingredients.filter((x) => x.on).map((x) => x.key));
  const [ran, setRan] = useState(!!initRan);
  const flip = (k: string) => { setOn(on.includes(k) ? on.filter((x) => x !== k) : [...on, k]); setRan(false); };
  const prompt = ingredients.filter((x) => on.includes(x.key)).map((x) => x.text).join(" ");
  const out = outputs[Math.min(on.length, outputs.length - 1)];
  return (
    <LabFrame {...lab} icon="chat">
      <div className="dr-pb-ings">
        {ingredients.map((x) => {
          const a = on.includes(x.key);
          return <button key={x.key} type="button" aria-pressed={a} className={cx("dr-pb-ing", a && "is-on")} onClick={() => flip(x.key)}>{a ? <Icon name="check" size={16} /> : <span className="dr-pb-plus">+</span>}{x.label}</button>;
        })}
      </div>
      <div className="dr-pb-prompt" dir="auto">{prompt || <span className="dr-muted">{emptyText}</span>}</div>
      <ProgressBar value={(on.length / Math.max(1, ingredients.length)) * 100} label={strengthLabel} valueText={strengthText ? strengthText(on.length, ingredients.length) : `${on.length} of ${ingredients.length}`} />
      <Button block icon="play" disabled={!on.length} onClick={() => setRan(true)}>{runLabel}</Button>
      {ran && out && <div className="dr-pb-out" dir="auto"><span className="dr-pb-out-tag"><Icon name="ai" size={16} />{outputLabel}</span><p>{out}</p></div>}
    </LabFrame>
  );
}

/** Teaching approximation of tokenisation: words/punctuation, long words split into 4-letter pieces. */
export function approximateTokens(text: string): string[] {
  const parts = text.match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) ?? [];
  return parts.flatMap((w) => (w.length <= 5 ? [w] : Array.from({ length: Math.ceil(w.length / 4) }, (_, i) => w.slice(i * 4, i * 4 + 4))));
}
export interface TokenViewerProps extends LabProps { text: string; inputLabel?: string; tokensLabel?: string; charsLabel?: string; }
export function TokenViewer({ text, inputLabel = "Text to split into tokens", tokensLabel = "tokens", charsLabel = "characters", num = plainNum, ...lab }: TokenViewerProps) {
  const [t, setT] = useState(text);
  const toks = approximateTokens(t);
  return (
    <LabFrame {...lab} icon="grip">
      <textarea className="dr-reflect-input" dir="auto" rows={2} value={t} onChange={(e) => setT(e.target.value)} aria-label={inputLabel} />
      <div className="dr-tokens" dir="auto">{toks.map((k, i) => <span key={i} className={`dr-token dr-token-${i % 4}`}>{k}</span>)}</div>
      <div className="dr-lab-stats"><span><strong>{num(toks.length)}</strong> {tokensLabel}</span><span><strong>{num(t.length)}</strong> {charsLabel}</span></div>
    </LabFrame>
  );
}

/** Applies temperature to probabilities: p^(1/T), renormalised. */
export function withTemperature(cands: { word: string; p: number }[], temp: number) {
  const w = cands.map((c) => Math.pow(c.p, 1 / Math.max(0.1, temp)));
  const sum = w.reduce((a, b) => a + b, 0);
  return cands.map((c, i) => ({ word: c.word, p: w[i] / sum }));
}
export interface NextWordLabProps extends LabProps { context: string; candidates: { word: string; p: number }[]; temperature?: number; generated?: string; tempLabel?: string; lowLabel?: string; highLabel?: string; generateLabel?: string; }
export function NextWordLab({ context, candidates, temperature = 1, generated = "", tempLabel = "Temperature", lowLabel = "Predictable", highLabel = "Creative", generateLabel = "Pick the next word", num = plainNum, ...lab }: NextWordLabProps) {
  const [temp, setTemp] = useState(temperature);
  const [gen, setGen] = useState(generated);
  const probs = withTemperature(candidates, temp);
  const sample = () => { let r = Math.random(), acc = 0; for (const c of probs) { acc += c.p; if (r <= acc) { setGen(c.word); return; } } };
  return (
    <LabFrame {...lab} icon="ai">
      <p className="dr-nw-context" dir="auto">{context} <span className={cx("dr-blank", gen && "is-filled")}>{gen ? <bdi>{gen}</bdi> : " "}</span></p>
      <ul className="dr-nw-bars">
        {probs.map((c) => <li key={c.word}><bdi className="dr-nw-word">{c.word}</bdi><span className="dr-nw-track"><span className="dr-nw-fill" style={{ inlineSize: `${Math.round(c.p * 100)}%` }} /></span><span className="dr-nw-pct">{num(c.p, { style: "percent", maximumFractionDigits: 0 })}</span></li>)}
      </ul>
      <label className="dr-nw-temp">
        <span>{tempLabel}: <strong>{num(temp, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong></span>
        <input type="range" min={0.2} max={2} step={0.1} value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} />
        <span className="dr-nw-ends"><span>{lowLabel}</span><span>{highLabel}</span></span>
      </label>
      <Button block variant="secondary" icon="ai" onClick={sample}>{generateLabel}</Button>
    </LabFrame>
  );
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean); // \p{M}: Arabic vowel marks stay inside their word
/** Transparent word-overlap "model": score = shared words + 0.5 smoothing. */
export function classify(text: string, classes: { examples: string[] }[]) {
  const scores = classes.map((c) => { const bag = new Set(c.examples.flatMap(words)); return words(text).filter((w) => bag.has(w)).length + 0.5; });
  const total = scores.reduce((a, b) => a + b, 0), best = scores.indexOf(Math.max(...scores));
  return { best, confidence: scores[best] / total };
}
export interface ClassDef { id: string; label: string; tone?: Tone; examples: string[]; }
export interface TrainClassifierProps extends LabProps { classes: ClassDef[]; test?: string; addLabel?: string; draftLabel?: string; testLabel?: string; guessLabel?: string; confidenceLabel?: string; }
export function TrainClassifier({ classes: init, test: initTest = "", addLabel = "Add example", draftLabel = "New example", testLabel = "Test the model", guessLabel = "The model thinks:", confidenceLabel = "Confidence", ...lab }: TrainClassifierProps) {
  const [classes, setClasses] = useState(init);
  const [draft, setDraft] = useState("");
  const [test, setTest] = useState(initTest);
  const tones: Tone[] = ["kola", "lagoon", "sunbird", "hibiscus"];
  const add = (i: number) => { if (!draft.trim()) return; setClasses(classes.map((c, j) => (j === i ? { ...c, examples: [...c.examples, draft.trim()] } : c))); setDraft(""); };
  const res = test.trim() && classes.length ? classify(test, classes) : null;
  return (
    <LabFrame {...lab} icon="target">
      <div className="dr-tc-classes">
        {classes.map((c, i) => (
          <div key={c.id} className={`dr-tc-class dr-tone-${c.tone ?? tones[i % 4]}`}>
            <div className="dr-tc-class-head"><strong>{c.label}</strong><span>{c.examples.length}</span></div>
            <ul>{c.examples.map((e, k) => <li key={k} dir="auto">{e}</li>)}</ul>
            <button type="button" className="dr-tc-add" disabled={!draft.trim()} onClick={() => add(i)}>+ {addLabel}</button>
          </div>
        ))}
      </div>
      <TextField label={draftLabel} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="dr-tc-test">
        <TextField label={testLabel} value={test} onChange={(e) => setTest(e.target.value)} />
        {res && <div className="dr-tc-result" role="status"><span>{guessLabel}</span><strong>{classes[res.best].label}</strong><ProgressBar value={Math.round(res.confidence * 100)} label={confidenceLabel} /></div>}
      </div>
    </LabFrame>
  );
}

export type Verdict = "true" | "false" | "unsure";
export interface FactCheckProps extends LabProps {
  answer: { text: string; claim?: { id: string; verdict: Verdict; note: string } }[];
  verdicts?: Record<string, Verdict>; open?: string;
  labels?: Record<Verdict, string>; answerLabel?: string; checkedLabel?: string; checkedText?: (done: number, total: number) => string;
}
export function FactCheck({ answer, verdicts: initV = {}, open: initOpen, labels = { true: "Correct", false: "Wrong", unsure: "Check a source" }, answerLabel = "AI answer", checkedLabel = "claims checked", checkedText, ...lab }: FactCheckProps) {
  const [v, setV] = useState<Record<string, Verdict>>(initV);
  const [open, setOpen] = useState<string | undefined>(initOpen);
  const claims = answer.flatMap((x) => (x.claim ? [x.claim] : []));
  const done = claims.filter((c) => v[c.id]).length;
  const cur = claims.find((c) => c.id === open);
  return (
    <LabFrame {...lab} icon="search">
      <div className="dr-fc-answer" dir="auto">
        <span className="dr-pb-out-tag"><Icon name="ai" size={16} />{answerLabel}</span>
        <p>{answer.map((x, i) => {
          if (!x.claim) return <Fragment key={i}>{x.text}</Fragment>;
          const c = x.claim, mine = v[c.id];
          return <button key={i} type="button" onClick={() => setOpen(c.id)} className={cx("dr-fc-claim", mine && (mine === c.verdict ? "is-right" : "is-missed"), open === c.id && "is-open")}>{x.text}</button>;
        })}</p>
      </div>
      {cur && (
        <div className="dr-fc-panel">
          <div className="dr-fc-verdicts">
            {(["true", "false", "unsure"] as Verdict[]).map((k) => <button key={k} type="button" aria-pressed={v[cur.id] === k} className={cx("dr-fc-verdict", v[cur.id] === k && "is-on")} onClick={() => setV({ ...v, [cur.id]: k })}>{labels[k]}</button>)}
          </div>
          {v[cur.id] && <p className={cx("dr-fc-note", v[cur.id] === cur.verdict ? "is-right" : "is-missed")}><Icon name={v[cur.id] === cur.verdict ? "check" : "info"} size={18} /><span>{cur.note}</span></p>}
        </div>
      )}
      <div className="dr-lab-stats"><span>{checkedText ? checkedText(done, claims.length) : <><strong>{done} of {claims.length}</strong> {checkedLabel}</>}</span></div>
    </LabFrame>
  );
}
