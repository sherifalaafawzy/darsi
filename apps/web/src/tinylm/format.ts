/**
 * The plain-text conversation format Darsi Tiny reads and writes (tools/tinylm/FORMAT.md has the full description):
 *
 *   <|tools|>calculator weather route …                      the tools that are on, separated by spaces
 *   <|user|>What's the weather in Kafi tomorrow?
 *   <|plan|>I'll check the weather.                           every assistant turn starts with a short plan
 *   <|call|>weather{"place":"Kafi","day":"tomorrow"}          tool name, then its arguments as compact JSON
 *   <|result|>{"sky":"sunny","high":31,"low":22,"rain":10}    written by the app, never by the model
 *   <|answer|>Tomorrow in Kafi: sunny, high 31°C …
 *   <|end|>
 *
 * The model stops after a call (it writes <|result|>) and after an answer (<|end|>). Markers are single tokens; text
 * from people or tools is encoded as plain text, so typing "<|call|>" into a request can never make a marker.
 */
import { MARK, SPECIALS, type Marker, type Tokenizer } from "./tokenizer";

export interface ToolCall { tool: string; args: Record<string, unknown> }

export type Turn =
  | { role: "user"; text: string }
  | { role: "plan"; text: string }
  | { role: "call"; call: ToolCall }
  | { role: "result"; result: unknown }
  | { role: "answer"; text: string };

export interface Conversation { tools: readonly string[]; turns: readonly Turn[] }

/** The ten tools Darsi Tiny was trained on, in their usual order. */
export const TOOLS = ["calculator", "timetable", "weather", "library", "attendance", "glossary", "reminder", "convert", "route", "send_message"] as const;
export type ToolName = (typeof TOOLS)[number];

const segments = (c: Conversation): [Marker, string][] => {
  const out: [Marker, string][] = [["tools", c.tools.join(" ")]];
  for (const t of c.turns) {
    if (t.role === "user") out.push(["user", t.text]);
    else if (t.role === "plan") out.push(["plan", t.text]);
    else if (t.role === "call") out.push(["call", t.call.tool + JSON.stringify(t.call.args)]);
    else if (t.role === "result") out.push(["result", JSON.stringify(t.result)]);
    else out.push(["answer", t.text], ["end", ""]);
  }
  return out;
};

/**
 * The prompt for the model's next move. After a person's message it ends with <|plan|> (a new assistant turn); after a
 * tool result it ends with the result, and the model goes on with another call or the answer.
 */
export function buildPrompt(tok: Tokenizer, c: Conversation): number[] {
  const ids: number[] = [];
  for (const [m, text] of segments(c)) {
    ids.push(MARK[m]);
    if (text) for (const id of tok.encode(text)) ids.push(id);
  }
  const last = c.turns[c.turns.length - 1];
  if (last?.role === "user") ids.push(MARK.plan);
  return ids;
}

/** The same prompt as readable text, markers included (what the Labs show). */
export function renderPrompt(c: Conversation): string {
  const s = segments(c).map(([m, text]) => SPECIALS[MARK[m]] + text).join("");
  return c.turns[c.turns.length - 1]?.role === "user" ? s + SPECIALS[MARK.plan] : s;
}

/** "tool{json}" → the call, or null if it isn't one. tools/tinylm/evaluate.py parse_call does the same. */
export function parseCall(text: string): ToolCall | null {
  const i = text.indexOf("{");
  if (i <= 0) return null;
  let args: unknown;
  try {
    args = JSON.parse(text.slice(i));
  } catch {
    return null;
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  return { tool: text.slice(0, i).trim(), args: args as Record<string, unknown> };
}

/** What one generation said: the plan, a call (the app runs it and adds the result), or the answer. */
export interface Step {
  plan?: string;
  call?: ToolCall;
  /** Set when the model wrote <|call|> but what follows is not "tool{json}". */
  badCall?: string;
  answer?: string;
  /** Turns to add to the conversation: the plan, then the call or the answer. */
  turns: Turn[];
}

/** Splits generated ids at the markers. `opened` is the marker the prompt ended with (plan after a person's message). */
export function readStep(tok: Tokenizer, ids: readonly number[], opened: Marker | null): Step {
  const step: Step = { turns: [] };
  let kind: Marker | null = opened, buf: number[] = [];
  const close = () => {
    if (!kind) return;
    const text = tok.decode(buf);
    if (kind === "plan") { step.plan = text; step.turns.push({ role: "plan", text }); }
    else if (kind === "call") {
      const call = parseCall(text);
      if (call) { step.call = call; step.turns.push({ role: "call", call }); }
      else step.badCall = text;
    } else if (kind === "answer") { step.answer = text; step.turns.push({ role: "answer", text }); }
  };
  for (const id of ids) {
    if (id < SPECIALS.length) {
      close();
      kind = (SPECIALS[id].slice(2, -2) as Marker);
      buf = [];
      if (kind === "result" || kind === "end") kind = null;
    } else buf.push(id);
  }
  close();
  return step;
}

/** The marker a prompt ends with, if it opened a segment for the model to fill. */
export function openedBy(prompt: readonly number[]): Marker | null {
  return prompt[prompt.length - 1] === MARK.plan ? "plan" : null;
}
