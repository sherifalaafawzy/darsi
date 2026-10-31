/**
 * Editor forms for the code steps (code, parsons, codefill, bug, blocks) and for the code shown with a question.
 * Code is typed left to right in a monospace box. "Run the tests" runs the solution and the starter in the same
 * sandbox learners use: the solution must pass every test and the starter must not (tests/units.test.ts checks the
 * starting courses the same way).
 */
import { useId, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n, type MessageKey } from "../i18n";
import type { BlocksStep, Board, BugStep, CodeFillStep, CodeLang, CodeSnippet, CodeStep, LocalText, ParsonsStep, RobotCommand, RobotDir, Step } from "../content/types";
import { fewestBlocks } from "../content/robot";
import { ROBOT_COMMANDS } from "../content/validate";
import { sandbox } from "../code/sandbox";
import { Check, Field, Items, LText, Num, Sel, Text } from "./fields";

const LT = (): LocalText => ({ en: "", ar: "" });
const LANGS = [["python", "Python"], ["sql", "SQL"]] as const;

/** A box for code: monospace, left to right, no spelling help. */
export function CodeField({ label, value, onChange, hint, rows = 6 }: { label: string; value?: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint}>
      <textarea id={id} className="dr-field-input ed-json" dir="ltr" rows={rows} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" translate="no"
        value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
const LangSel = ({ value, onChange }: { value: CodeLang; onChange: (v: CodeLang) => void }) => {
  const { t } = useI18n();
  return <Sel label={t("cms.codeLang")} value={value} onChange={onChange} options={LANGS} />;
};

/** The code a question shows above its answers, if any. */
export function SnippetForm({ value, onChange }: { value?: CodeSnippet; onChange: (v: CodeSnippet | undefined) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Check label={t("cms.snippet")} checked={!!value} onChange={(on) => onChange(on ? { lang: "python", text: "" } : undefined)} />
      {value && <>
        <LangSel value={value.lang} onChange={(lang) => onChange({ ...value, lang })} />
        <CodeField label={t("cms.snippetCode")} hint={t("cms.snippetHint")} value={value.text} onChange={(text) => onChange({ ...value, text })} rows={4} />
      </>}
    </>
  );
}

export function CodeForm({ step: s, onChange }: { step: CodeStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  const py = s.lang === "python";
  return (
    <>
      <LangSel value={s.lang} onChange={(lang) => onChange({ ...s, lang })} />
      <CodeField label={t("cms.starter")} hint={t("cms.starterHint")} value={s.starter} onChange={(starter) => onChange({ ...s, starter })} />
      <CodeField label={t("cms.solution")} value={s.solution} onChange={(solution) => onChange({ ...s, solution })} />
      {py ? <>
        <p className="muted small">{t("cms.testsHint")}</p>
        <Items items={s.tests ?? []} min={1} itemLabel={(i) => `${t("cms.test")} ${i + 1}`} addLabel={t("cms.addTest")} onChange={(tests) => onChange({ ...s, tests })} add={() => ({ output: "" })}
          render={(x, set) => (
            <div className="stack">
              <CodeField label={t("cms.testInput")} hint={t("cms.testInputHint")} rows={2} value={(x.input ?? []).join("\n")}
                onChange={(v) => { const { input: _, ...rest } = x; set(v ? { ...rest, input: v.split("\n") } : rest); }} />
              <CodeField label={t("cms.testOutput")} hint={t("cms.testOutputHint")} rows={3} value={x.output}
                onChange={(v) => { const { output: _, ...rest } = x; set(v || !x.check ? { ...rest, output: v } : rest); }} />
              <CodeField label={t("cms.testCheck")} hint={t("cms.testCheckHint")} rows={2} value={x.check}
                onChange={(v) => { const { check: _, ...rest } = x; set(v ? { ...rest, check: v } : rest); }} />
              <LText label={t("cms.testHint")} value={x.hint} onChange={(hint) => set({ ...x, hint })} />
            </div>
          )} />
        <Items items={s.files ?? []} itemLabel={(i) => `${t("cms.file")} ${i + 1}`} addLabel={t("cms.addFile")} onChange={(files) => onChange({ ...s, files })} add={() => ({ name: "data.csv", text: "" })}
          render={(f, set) => <div className="stack"><Text label={t("cms.fileName")} dir="ltr" value={f.name} onChange={(name) => set({ ...f, name })} /><CodeField label={t("cms.fileText")} value={f.text} onChange={(text) => set({ ...f, text })} /></div>} />
        <BoardField value={s.board} onChange={(b) => { const { board: _, ...rest } = s; onChange(b ? { ...rest, board: b } : rest); }} />
      </> : <CodeField label={t("cms.setup")} hint={t("cms.setupHint")} rows={8} value={s.setup} onChange={(setup) => onChange({ ...s, setup })} />}
      <Items items={s.hints ?? []} itemLabel={(i) => `${t("cms.hint")} ${i + 1}`} addLabel={t("cms.addHint")} onChange={(hints) => onChange({ ...s, hints })} add={LT}
        render={(h, set) => <LText label={t("cms.hint")} value={h} onChange={set} />} />
      <TryTests step={s} />
    </>
  );
}

/** The virtual board for IoT code, as JSON (LEDs, buzzer, buttons and sensors by pin): rare enough not to need a form. */
function BoardField({ value, onChange }: { value?: Board; onChange: (b: Board | undefined) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(() => (value ? JSON.stringify(value, null, 2) : ""));
  const [bad, setBad] = useState(false);
  return <CodeField label={t("cms.board")} hint={bad ? t("cms.boardBad") : t("cms.boardHint")} rows={6} value={text}
    onChange={(v) => {
      setText(v);
      if (!v.trim()) { setBad(false); onChange(undefined); return; }
      try { onChange(JSON.parse(v) as Board); setBad(false); } catch { setBad(true); }
    }} />;
}

/** Runs the solution and the starter against the tests, here in the editor. */
function TryTests({ step: s }: { step: CodeStep }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setSay(null);
    try {
      const sb = sandbox();
      const req = (code: string) => (s.lang === "sql" ? { lang: s.lang, code, setup: s.setup, solution: s.solution } : { lang: s.lang, code, tests: s.tests, files: s.files });
      const sol = await sb.run(req(s.solution));
      const bad = sol.timeout ? -1 : sol.runs.findIndex((r) => !r.passed);
      if (sol.failed || bad !== -1 || !sol.runs.length) {
        const r = bad >= 0 ? sol.runs[bad] : undefined;
        setSay(t("cms.testsSolutionFails", { n: bad + 1, why: sol.failed ?? r?.error ?? r?.message ?? (sol.timeout ? t("cms.testsTimeout") : r?.out ?? "") }));
        return;
      }
      const start = await sb.run(req(s.starter));
      setSay(!start.timeout && start.runs.length && start.runs.every((r) => r.passed) ? t("cms.testsStarterPasses") : t("cms.testsOk"));
    } catch (e) { setSay(String((e as Error).message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div><Button size="sm" variant="secondary" icon="play" loading={busy} onClick={go}>{t("cms.runTests")}</Button></div>
      {say && <p className="notice" role="status" dir="auto">{say}</p>}
    </div>
  );
}

export function ParsonsForm({ step: s, onChange }: { step: ParsonsStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  return (
    <>
      <LangSel value={s.lang} onChange={(lang) => onChange({ ...s, lang })} />
      <CodeField label={t("cms.parsonsLines")} hint={t("cms.parsonsLinesHint")} value={s.lines.join("\n")} onChange={(v) => onChange({ ...s, lines: v.split("\n") })} />
      <CodeField label={t("cms.distractors")} hint={t("cms.distractorsHint")} rows={3} value={(s.distractors ?? []).join("\n")}
        onChange={(v) => { const { distractors: _, ...rest } = s; onChange(v.trim() ? { ...rest, distractors: v.split("\n") } : rest); }} />
    </>
  );
}

/** Code with [[gaps]]: "for i in [[range]](3):" becomes the code with a gap and its answer. */
export const toGaps = (text: string): Pick<CodeFillStep, "code" | "answers"> => {
  const code: CodeFillStep["code"] = [], answers: string[] = [];
  text.split(/(\[\[[^\]]*\]\])/).forEach((part) => {
    const m = /^\[\[([^\]]*)\]\]$/.exec(part);
    if (m) { code.push({ blank: answers.length }); answers.push(m[1]); } else if (part) code.push(part);
  });
  return { code, answers };
};
export const fromGaps = (s: Pick<CodeFillStep, "code" | "answers">) => s.code.map((p) => (typeof p === "string" ? p : `[[${s.answers[p.blank] ?? ""}]]`)).join("");

export function CodeFillForm({ step: s, onChange }: { step: CodeFillStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  return (
    <>
      <LangSel value={s.lang} onChange={(lang) => onChange({ ...s, lang })} />
      <CodeField label={t("cms.fillCode")} hint={t("cms.fillCodeHint")} value={fromGaps(s)} onChange={(v) => onChange({ ...s, ...toGaps(v) })} />
      <CodeField label={t("cms.distractors")} hint={t("cms.tokensHint")} rows={3} value={(s.distractors ?? []).join("\n")}
        onChange={(v) => { const { distractors: _, ...rest } = s; onChange(v.trim() ? { ...rest, distractors: v.split("\n").filter((x) => x.trim()) } : rest); }} />
    </>
  );
}

export function BugForm({ step: s, onChange }: { step: BugStep; onChange: (s: Step) => void }) {
  const { t } = useI18n();
  return (
    <>
      <LangSel value={s.lang} onChange={(lang) => onChange({ ...s, lang })} />
      <CodeField label={t("cms.bugCode")} value={s.code} onChange={(code) => onChange({ ...s, code })} />
      <Num label={t("cms.bugLine")} min={1} value={s.line} onChange={(line) => onChange({ ...s, line })} />
      <Text label={t("cms.bugFix")} dir="ltr" value={s.fix} onChange={(fix) => onChange({ ...s, fix })} />
    </>
  );
}

const DIRS: RobotDir[] = ["N", "E", "S", "W"];
export function BlocksForm({ step: s, onChange }: { step: BlocksStep; onChange: (s: Step) => void }) {
  const { t, num } = useI18n();
  const w = s.world;
  const world = (patch: Partial<BlocksStep["world"]>) => onChange({ ...s, world: { ...w, ...patch } });
  const walls = (w.walls ?? []).map((p) => `${p.x},${p.y}`).join(" ");
  const n = fewestBlocks(w, s.commands);
  return (
    <>
      <div className="ed-grid4">
        <Num label={t("cms.cols")} min={2} max={8} value={w.cols} onChange={(cols) => world({ cols })} />
        <Num label={t("cms.rows")} min={2} max={8} value={w.rows} onChange={(rows) => world({ rows })} />
        <Num label={t("cms.maxBlocks")} min={1} max={20} value={s.maxBlocks} onChange={(maxBlocks) => onChange({ ...s, maxBlocks })} />
      </div>
      <div className="ed-grid4">
        <Num label={t("cms.startX")} min={0} value={w.start.x} onChange={(x) => world({ start: { ...w.start, x } })} />
        <Num label={t("cms.startY")} min={0} value={w.start.y} onChange={(y) => world({ start: { ...w.start, y } })} />
        <Sel label={t("cms.startDir")} value={w.start.dir} onChange={(dir) => world({ start: { ...w.start, dir } })} options={DIRS.map((d) => [d, t(`cms.dir.${d}` as MessageKey)] as const)} />
      </div>
      <div className="ed-grid4">
        <Num label={t("cms.goalX")} min={0} value={w.goal.x} onChange={(x) => world({ goal: { ...w.goal, x } })} />
        <Num label={t("cms.goalY")} min={0} value={w.goal.y} onChange={(y) => world({ goal: { ...w.goal, y } })} />
      </div>
      <Text label={t("cms.walls")} hint={t("cms.wallsHint")} dir="ltr" value={walls}
        onChange={(v) => world({ walls: v.split(/\s+/).filter(Boolean).map((p) => { const [x, y] = p.split(",").map(Number); return { x, y }; }).filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y)) })} />
      {ROBOT_COMMANDS.map((c: RobotCommand) => <Check key={c} label={t(`cms.cmd.${c}` as MessageKey)} checked={s.commands.includes(c)}
        onChange={(on) => onChange({ ...s, commands: on ? ROBOT_COMMANDS.filter((x) => x === c || s.commands.includes(x)) : s.commands.filter((x) => x !== c) })} />)}
      <p className="muted small" role="status">{n === null ? t("cms.unsolvableNow") : t("cms.solvable", { n: num(n) })}</p>
    </>
  );
}
