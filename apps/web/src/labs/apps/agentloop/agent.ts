/**
 * The agent loop shared by the AI agents labs (agentloop, tools, planner, memory, approve, teach, evals, team, costs):
 * one step at a time, around Darsi Tiny. Pure: the model is passed in as `Gen`, so the phone runs it through the TinyLM
 * worker and the tests run the same steps in Node (tests/labs/agents.test.ts).
 *
 * A turn goes: the person's request → the model's plan → a tool call or the answer → (the app runs the tool and adds
 * the result) → another call or the answer. tools/tinylm/FORMAT.md has the format.
 */
import { MARK, type Conversation, type Lang, type Result, type ToolCall, type ToolName, type Turn } from "../../../tinylm";

/** Marker ids (tools/tinylm/FORMAT.md: one token each). */
export { MARK };
/** Where "Teach the agent a new tool" keeps its fine-tune on the phone (IndexedDB); "Test an agent" can test it too. */
export const FINETUNE_KEY = "labs:agents:finetune";
/** Darsi Tiny's context window, in tokens. */
export const CTX = 384;
/** Stop after the plan, before the call or the answer, so a lab can show one step at a time. */
export const PLAN_STOPS = [MARK.call, MARK.answer, MARK.result, MARK.end];

/** The model's next move: what the worker's generate() resolves to (Result), as far as the labs use it. */
export type GenResult = Pick<Result, "ids" | "text" | "stoppedBy" | "promptTokens" | "reused" | "prefillMs" | "decodeMs" | "step">;
export type Gen = (c: Conversation, opts: { stop?: number[]; maxTokens?: number }) => Promise<GenResult>;

/** What happens next in a conversation. */
export type Next = "plan" | "act" | "tool" | "done";
export function nextOf(turns: readonly Turn[]): Next {
  const last = turns[turns.length - 1];
  if (!last) return "done";
  if (last.role === "user") return "plan";
  if (last.role === "plan" || last.role === "result") return "act";
  if (last.role === "call") return "tool";
  return "done";
}

/** The conversation's language: that of the person's latest message (tools answer in it). */
export function langOfTurns(turns: readonly Turn[]): Lang {
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "user") return /[؀-ۿ]/.test(t.text) ? "ar" : "en"; }
  return "en";
}

/** One step's outcome, for the lab to show. */
export type StepOut =
  | { kind: "plan"; text: string; then: "call" | "answer" | null; gen: GenResult }
  | { kind: "call"; call: ToolCall; gen: GenResult }
  | { kind: "answer"; text: string; cut: boolean; gen: GenResult }
  | { kind: "bad"; text: string; gen: GenResult }
  | { kind: "result"; result: Record<string, unknown> }
  | { kind: "blocked"; call: ToolCall; reason: string }
  | { kind: "stopped"; gen: GenResult };

/** A check a lab can run on a call before the tool runs (approval, permissions, a checker). */
export type Guard = (call: ToolCall, turns: readonly Turn[]) => { ok: true } | { ok: false; reason: string };

/**
 * Takes one step and returns the turns to add. Each model step is one generation: the plan, then the call or the
 * answer. The tool step is the app's: the guard may block it; otherwise runTool's result is added. `room`: tokens the
 * model may write at most (what is left of its window).
 */
export async function advance(c: Conversation, gen: Gen, run: (call: ToolCall, lang: Lang) => Record<string, unknown>, guard?: Guard, room = Infinity): Promise<{ out: StepOut; add: Turn[] }> {
  const next = nextOf(c.turns);
  if (next === "plan") {
    const g = await gen(c, { stop: PLAN_STOPS, maxTokens: Math.max(1, Math.min(48, room)) });
    if (g.stoppedBy === "stopped") return { out: { kind: "stopped", gen: g }, add: [] };
    const text = (g.step.plan ?? "").trim();
    const then = g.stoppedBy === "call" ? "call" : g.stoppedBy === "answer" ? "answer" : null;
    return { out: { kind: "plan", text, then, gen: g }, add: [{ role: "plan", text }] };
  }
  if (next === "act") {
    const g = await gen(c, { maxTokens: Math.max(1, Math.min(120, room)) });
    if (g.stoppedBy === "stopped") return { out: { kind: "stopped", gen: g }, add: [] };
    if (g.step.call) return { out: { kind: "call", call: g.step.call, gen: g }, add: [{ role: "call", call: g.step.call }] };
    if (g.step.answer !== undefined) {
      const text = g.step.answer.trim();
      return { out: { kind: "answer", text, cut: g.stoppedBy !== "end", gen: g }, add: [{ role: "answer", text }] };
    }
    return { out: { kind: "bad", text: g.step.badCall ?? g.text, gen: g }, add: [] };
  }
  if (next === "tool") {
    const last = c.turns[c.turns.length - 1];
    if (last?.role !== "call") throw new Error("agents: no call to run");
    const verdict = guard?.(last.call, c.turns) ?? { ok: true };
    if (!verdict.ok) return { out: { kind: "blocked", call: last.call, reason: verdict.reason }, add: [] };
    const result = run(last.call, langOfTurns(c.turns));
    return { out: { kind: "result", result }, add: [{ role: "result", result }] };
  }
  throw new Error("agents: the turn is over");
}

/** Runs steps until the answer (or `maxSteps`, a blocked call, a broken call or Stop). */
export async function runTurn(c: Conversation, gen: Gen, run: (call: ToolCall, lang: Lang) => Record<string, unknown>, opts: { guard?: Guard; maxSteps?: number; onStep?: (o: StepOut, turns: Turn[]) => void; stopped?: () => boolean } = {}): Promise<{ turns: Turn[]; outs: StepOut[] }> {
  const turns = [...c.turns];
  const outs: StepOut[] = [];
  for (let i = 0; i < (opts.maxSteps ?? 8) && nextOf(turns) !== "done" && !opts.stopped?.(); i++) {
    const { out, add } = await advance({ tools: c.tools, turns }, gen, run, opts.guard);
    turns.push(...add);
    outs.push(out);
    opts.onStep?.(out, turns);
    if (out.kind === "blocked" || out.kind === "bad" || out.kind === "stopped") break;
  }
  return { turns, outs };
}

// ---- the ten tools: what each takes ---------------------------------------------------------------------------------

export type ArgKind = "text" | "number" | "expr" | "day" | "when" | "class" | "range" | "unit" | "period";
export interface ArgSpec { name: string; kind: ArgKind; required: boolean }
export interface ToolSpec { tool: ToolName; acts: boolean; args: ArgSpec[] }
const a = (name: string, kind: ArgKind, required = true): ArgSpec => ({ name, kind, required });
/** FORMAT.md's table. `acts`: it changes something (a reminder, a message) rather than only reading. */
export const TOOL_SPECS: ToolSpec[] = [
  { tool: "calculator", acts: false, args: [a("expr", "expr")] },
  { tool: "timetable", acts: false, args: [a("class", "class"), a("day", "day"), a("period", "period", false)] },
  { tool: "weather", acts: false, args: [a("place", "text"), a("day", "day", false)] },
  { tool: "library", acts: false, args: [a("query", "text")] },
  { tool: "attendance", acts: false, args: [a("student", "text"), a("range", "range", false)] },
  { tool: "glossary", acts: false, args: [a("term", "text")] },
  { tool: "reminder", acts: true, args: [a("text", "text"), a("when", "when")] },
  { tool: "convert", acts: false, args: [a("value", "number"), a("from", "unit"), a("to", "unit")] },
  { tool: "route", acts: false, args: [a("from", "text"), a("to", "text")] },
  { tool: "send_message", acts: true, args: [a("to", "text"), a("text", "text")] },
];
export const specOf = (tool: string) => TOOL_SPECS.find((s) => s.tool === tool);
export const ACTS = new Set(TOOL_SPECS.filter((s) => s.acts).map((s) => s.tool as string));

const DAYS = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const UNITS = ["km", "mi", "m", "ft", "cm", "in", "kg", "lb", "g", "oz", "l", "gal", "c", "f"];
const WHEN = /^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday) ([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type Issue =
  | { kind: "unknown-tool"; tool: string }
  | { kind: "off"; tool: string }
  | { kind: "missing"; arg: string }
  | { kind: "extra"; arg: string }
  | { kind: "type"; arg: string; want: ArgKind };

/** Is a value the right kind for its argument (the shape the tool expects; whether the thing exists is the tool's job)? */
export function fits(kind: ArgKind, v: unknown): boolean {
  switch (kind) {
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "period": return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
    case "expr": return typeof v === "string" && /^[0-9+\-*/(). ]+$/.test(v) && /[0-9]/.test(v);
    case "day": return typeof v === "string" && DAYS.includes(v);
    case "when": return typeof v === "string" && WHEN.test(v);
    case "class": return typeof v === "string" && /^[0-9][A-Z]$/.test(v);
    case "range": return v === "today" || v === "week" || v === "month";
    case "unit": return typeof v === "string" && UNITS.includes(v);
    default: return typeof v === "string" && v.trim() !== "";
  }
}

/** A call checked against the tools list and the tool's arguments: missing, unexpected and wrong-shaped ones. */
export function checkCall(call: ToolCall, toolsOn: readonly string[]): Issue[] {
  const spec = specOf(call.tool);
  if (!spec) return [{ kind: "unknown-tool", tool: call.tool }];
  const out: Issue[] = [];
  if (!toolsOn.includes(call.tool)) out.push({ kind: "off", tool: call.tool });
  for (const s of spec.args) {
    if (!(s.name in call.args)) { if (s.required) out.push({ kind: "missing", arg: s.name }); }
    else if (!fits(s.kind, call.args[s.name])) out.push({ kind: "type", arg: s.name, want: s.kind });
  }
  for (const k of Object.keys(call.args)) if (!spec.args.some((s) => s.name === k)) out.push({ kind: "extra", arg: k });
  return out;
}

// ---- scoring a call, as tools/tinylm/evaluate.py does ----------------------------------------------------------------

/** The calculator's value of an expression, or null (via the tool itself). */
export type Calc = (expr: string) => number | null;

/** Right tool, and right arguments: the calculator by value, numbers by value, everything else as exact text (spaces trimmed). */
export function sameCall(want: ToolCall, got: ToolCall | undefined, calc: Calc): { tool: boolean; args: boolean } {
  if (!got || got.tool !== want.tool) return { tool: false, args: false };
  if (want.tool === "calculator") {
    const x = calc(String(want.args.expr)), y = calc(String(got.args.expr ?? ""));
    return { tool: true, args: x !== null && y !== null && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) && Object.keys(got.args).join() === "expr" };
  }
  const wk = Object.keys(want.args).sort(), gk = Object.keys(got.args).sort();
  if (wk.join() !== gk.join()) return { tool: true, args: false };
  const squash = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
  for (const k of wk) {
    const v = want.args[k], g = got.args[k];
    if (typeof v === "number") { if (typeof g !== "number" || g !== v) return { tool: true, args: false }; }
    else if (typeof g !== "string" || squash(g) !== squash(String(v))) return { tool: true, args: false };
  }
  return { tool: true, args: true };
}

/** A call as the model writes it: tool{"key":value} with compact JSON. */
export const callText = (c: ToolCall) => c.tool + JSON.stringify(c.args);

// ---- approval -------------------------------------------------------------------------------------------------------

const YES = ["yes", "yes please", "yes, send it", "ok", "okay", "ok, go ahead", "sure", "yes, that's right", "go ahead", "send it",
  "نعم", "نعم، أرسلها", "موافق", "تفضل، أرسلها", "أجل", "نعم من فضلك", "أرسلها"];
const clean = (s: string) => s.trim().toLowerCase().replace(/[.!؟?]+$/u, "").replace(/\s+/g, " ");
/** A short yes, in English or Arabic. */
export const isYes = (text: string) => YES.includes(clean(text));

/** The message an answer asked approval for, read from the model's fixed wording (FORMAT.md, "Approval for messages"). */
export function askedApproval(answer: string): { to: string; text: string } | null {
  const en = /^Shall I send this message to (.+?): "(.*)"\? Please reply yes or no\.$/s.exec(answer.trim());
  if (en) return { to: en[1], text: en[2] };
  const ar = /^هل أرسل هذه الرسالة إلى (.+?): «(.*)»؟ أجب بنعم أو لا\.$/su.exec(answer.trim());
  return ar ? { to: ar[1], text: ar[2] } : null;
}

/**
 * The approval check, in code: a send_message call runs only if the model's previous answer asked about exactly this
 * message and the person's reply since then is a yes. The model learned to ask; this makes sure it did.
 */
export function approvedInCode(call: ToolCall, turns: readonly Turn[]): { ok: true } | { ok: false; why: "no-question" | "no-yes" | "changed" } {
  if (call.tool !== "send_message") return { ok: true };
  let i = turns.length - 1;
  while (i >= 0 && turns[i].role !== "user") i--;
  const reply = turns[i];
  let j = i - 1;
  while (j >= 0 && turns[j].role !== "answer" && turns[j].role !== "user") j--;
  const prev = turns[j];
  const asked = prev?.role === "answer" ? askedApproval(prev.text) : null;
  if (!asked) return { ok: false, why: "no-question" };
  if (reply?.role !== "user" || !isYes(reply.text)) return { ok: false, why: "no-yes" };
  if (String(call.args.to ?? "").trim() !== asked.to.trim() || String(call.args.text ?? "").trim() !== asked.text.trim()) return { ok: false, why: "changed" };
  return { ok: true };
}

// ---- grounding: where each value in a call came from -----------------------------------------------------------------

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** For comparing words: lower case, no Arabic diacritics or tatweel, one alef/yaa/taa marbuta, ASCII digits. */
export const key = (s: string) => s.normalize("NFKC").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/\s+/g, " ").trim();

const WORD = /[\p{L}\p{N}]+(?:\.[0-9]+)?/gu;
/**
 * The words (and numbers) of a value in a call that appear neither in what the person said nor in an earlier tool
 * result. A checker uses this to catch a model that copied a name wrongly ("9Z" → "9C", "tidy" → "tisums") or made
 * one up. Empty: everything came from somewhere.
 */
export function unfound(value: unknown, sources: readonly string[]): string[] {
  const words = new Set(sources.flatMap((x) => key(x).match(WORD) ?? []));
  const pool = key(sources.join(" \n "));
  const seen = (w: string) => words.has(w) || (/[؀-ۿ]/.test(w) && w.length >= 3 && pool.includes(w));
  if (typeof value === "number") return seen(String(value)) ? [] : [String(value)];
  if (typeof value !== "string") return [];
  return (key(value).match(WORD) ?? []).filter((w) => !seen(w));
}

const ORD_AR = ["", "الاول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
const SEC_AR: Record<string, string> = { A: "ا", B: "ب", C: "ج" };
/** Whether the person named this class ("6B", "class 6b", «6ب», «الصف السادس ب»). */
export function classSaid(cls: string, sources: readonly string[]): boolean {
  const m = /^([0-9])([A-Z])$/.exec(cls);
  if (!m) return false;
  const pool = key(sources.join(" \n ")), [, g, sec] = m, sa = SEC_AR[sec];
  if (new RegExp(`(^|[^0-9a-z])${g}${sec.toLowerCase()}([^a-z]|$)`).test(pool)) return true;
  if (!sa) return false;
  return pool.includes(`${g}${sa}`) || (!!ORD_AR[+g] && new RegExp(`${ORD_AR[+g]} \\(?${sa}\\)?(?!\\p{L})`, "u").test(pool));
}

/** Every number in a calculator expression, each of which should come from the request. */
export const exprNumbers = (expr: string) => (expr.match(/[0-9]+(?:\.[0-9]+)?/g) ?? []).map(Number);
