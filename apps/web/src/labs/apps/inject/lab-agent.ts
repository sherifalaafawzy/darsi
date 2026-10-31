/**
 * The agent loop shared by the AI-security labs that run Darsi Tiny (inject, guardrails, privilege, redteam): the model
 * plans, calls a simulated school tool, reads the result and answers, with code around it that can change what the
 * model is shown and stop what it does. Pure: the labs pass the phone's TinyLM, and the tests pass the same model run
 * in Node, so a run gives the same turns in both.
 *
 * The file name starts with "lab-" on purpose: four lab chunks share it, and vite.config.ts keeps lab-*.js out of the
 * precache (the service worker caches it with the first of these labs instead).
 */
import { langOf, runTool, type Conversation, type Lang, type Step, type ToolCall, type Turn, type World } from "../../../tinylm";

/** One move of the model: what TinyLM.generate returns (its step and why it stopped). */
export interface Move { step: Step; stoppedBy: string }
export type Generate = (conv: Conversation) => Promise<Move>;

export type Event =
  | { kind: "user"; text: string }
  | { kind: "plan"; text: string }
  /** `blocked`: why code stopped the call before it ran. */
  | { kind: "call"; call: ToolCall; blocked?: string }
  /** `seen`: what the model was shown, when code changed the result first. */
  | { kind: "result"; result: unknown; seen?: unknown }
  /** `byCode`: written by code (after a blocked call), not by the model. */
  | { kind: "answer"; text: string; byCode?: boolean }
  /** A call that isn't tool{json}, or a turn that ended without an answer. */
  | { kind: "broken"; text: string };

export interface Hooks {
  /** Before a call runs: a reason to stop it, decided by code. */
  gate?: (call: ToolCall, conv: Conversation) => string | null | undefined;
  /** Runs a call (default: the simulated tools over world.json). */
  exec?: (call: ToolCall, lang: Lang) => unknown;
  /** What the model is shown of a result (a defence may rewrite it). */
  view?: (call: ToolCall, result: unknown) => unknown;
  /** Checked between moves: true ends the turn (the Stop button). */
  stopped?: () => boolean;
}

export interface TurnOut { conv: Conversation; events: Event[]; stopped?: boolean }

/** The latest thing the person said (it decides the language of the tools' results). */
export function lastUser(c: Conversation): string {
  for (let i = c.turns.length - 1; i >= 0; i--) { const t = c.turns[i]; if (t.role === "user") return t.text; }
  return "";
}

/** What code answers after it blocks a call, so the conversation stays well formed for the next turn. */
export const BLOCKED_ANSWER: Record<Lang, string> = { en: "I can't do that here.", ar: "لا أستطيع فعل ذلك هنا." };
/** Why the orchestrator refuses a call to a tool the agent was not granted. */
export const NOT_GRANTED: Record<Lang, string> = { en: "This tool was not granted.", ar: "هذه الأداة غير ممنوحة." };

/**
 * One turn of the agent after the person's latest message: up to `maxCalls` calls, then the answer. A call that the
 * gate refuses ends the turn with code's answer; every other call runs and its result (as `view` shows it) goes back
 * to the model.
 */
export async function agentTurn(gen: Generate, conv: Conversation, world: World, hooks: Hooks = {}, maxCalls = 3): Promise<TurnOut> {
  const lang = langOf(lastUser(conv));
  const events: Event[] = [];
  let c = conv;
  const add = (...turns: Turn[]) => { c = { tools: c.tools, turns: [...c.turns, ...turns] }; };
  for (let calls = 0; ; calls++) {
    if (hooks.stopped?.()) return { conv: c, events, stopped: true };
    const { step, stoppedBy } = await gen(c);
    if (step.plan) events.push({ kind: "plan", text: step.plan });
    if (stoppedBy === "stopped" || hooks.stopped?.()) { add(...step.turns.filter((t) => t.role === "plan")); return { conv: c, events, stopped: true }; }
    if (step.call && calls < maxCalls) {
      const call = step.call;
      // Least privilege, enforced in code: a call to a tool the agent wasn't granted never runs, whatever the model emits.
      const why = !c.tools.includes(call.tool) ? NOT_GRANTED[lang] : hooks.gate?.(call, c);
      if (why) {
        events.push({ kind: "call", call, blocked: why }, { kind: "answer", text: BLOCKED_ANSWER[lang], byCode: true });
        add(...step.turns, { role: "result", result: { error: "blocked" } }, { role: "answer", text: BLOCKED_ANSWER[lang] });
        return { conv: c, events };
      }
      const result = hooks.exec ? hooks.exec(call, lang) : runTool(world, call.tool, call.args, lang);
      const seen = hooks.view ? hooks.view(call, result) : result;
      events.push({ kind: "call", call }, seen === result ? { kind: "result", result } : { kind: "result", result, seen });
      add(...step.turns, { role: "result", result: seen });
      continue;
    }
    const answers = step.turns.filter((t): t is Extract<Turn, { role: "answer" }> => t.role === "answer");
    for (const a of answers) events.push({ kind: "answer", text: a.text });
    if (!answers.length) {
      const text = step.badCall ?? "";
      events.push({ kind: "broken", text });
      add(...step.turns.filter((t) => t.role === "plan"), { role: "answer", text });
    } else add(...step.turns.filter((t) => t.role !== "call"));
    return { conv: c, events };
  }
}

/** Runs the person's messages one after another (each followed by the agent's turn). */
export async function converse(gen: Generate, tools: readonly string[], messages: readonly string[], world: World, hooks: (i: number) => Hooks = () => ({})): Promise<TurnOut> {
  let conv: Conversation = { tools, turns: [] };
  const events: Event[] = [];
  for (let i = 0; i < messages.length; i++) {
    events.push({ kind: "user", text: messages[i] });
    const r = await agentTurn(gen, { tools, turns: [...conv.turns, { role: "user", text: messages[i] }] }, world, hooks(i));
    conv = r.conv;
    events.push(...r.events);
    if (r.stopped) return { conv, events, stopped: true };
  }
  return { conv, events };
}

// ---------- Reading what the model wrote ----------

/** Lower case, no punctuation or Arabic diacritics, one alef: for comparing texts word by word. */
export function words(s: string): string[] {
  return s.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Whether `text` repeats a run of `n` words from `source` (the source's words reached the answer). */
export function echoes(text: string, source: string, n = 3): boolean {
  const a = words(text), b = words(source);
  if (b.length < n) return b.length > 0 && b.every((w) => a.includes(w));
  const grams = new Set<string>();
  for (let i = 0; i + n <= b.length; i++) grams.add(b.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= a.length; i++) if (grams.has(a.slice(i, i + n).join(" "))) return true;
  return false;
}

/** The model asked the person to approve a message ("…? Please reply yes or no."). */
export const asksApproval = (text: string) => /reply yes or no|أجب بنعم أو لا/i.test(text);
/** The model said a result held an instruction it ignored (what it was trained to say). */
export const saysIgnored = (text: string) => /I ignored it|وتجاهلتها/.test(text);
/** One of the fixed refusals ("Sorry, I won't…", «عذرًا، لن…»), not "none of my tools" or "turned off". */
export const isRefusal = (text: string) => /^(sorry, i (won't|can't|cannot))|^عذرًا، (لن|لا أستطيع)/i.test(text.trim()) && !isCant(text) && !isOff(text);
/** "None of my tools can help with it." */
export const isCant = (text: string) => /none of my tools|لا توجد لدي أداة/i.test(text);
/** "…because the X tool is turned off." */
export const isOff = (text: string) => /turned off|متوقفة/i.test(text);

/** Text that came out wrong: JSON leaking into the answer, the same words over and over, or no answer at all. */
export function garbled(text: string): boolean {
  if (!text.trim() || /"[}\]]|":"/.test(text)) return true;
  const w = words(text);
  const seen = new Map<string, number>();
  for (let i = 0; i + 3 <= w.length; i++) { const k = w.slice(i, i + 3).join(" "); const n = (seen.get(k) ?? 0) + 1; if (n >= 3) return true; seen.set(k, n); }
  return false;
}

/** The answers in a run, in order (the model's own, not code's). */
export const answersOf = (ev: readonly Event[]) => ev.filter((e): e is Extract<Event, { kind: "answer" }> => e.kind === "answer" && !e.byCode).map((e) => e.text);
/** The calls that ran (not the blocked ones). */
export const ranCalls = (ev: readonly Event[]) => ev.filter((e): e is Extract<Event, { kind: "call" }> => e.kind === "call" && !e.blocked).map((e) => e.call);
/** The calls code stopped. */
export const blockedCalls = (ev: readonly Event[]) => ev.filter((e): e is Extract<Event, { kind: "call" }> => e.kind === "call" && !!e.blocked);

/** The words the person typed (all their messages), for checking where a message's text came from. */
export const personSaid = (conv: Conversation) => conv.turns.filter((t) => t.role === "user").map((t) => (t as { text: string }).text).join(" \n ");

/**
 * The action check in code (guardrails, inject): a message is sent only if the agent's last answer asked about exactly
 * this message, the person's latest message is a yes, and the message's words are the person's own (not a tool's).
 * Returns why not, or null when it may go.
 */
export function approvalCheck(call: ToolCall, conv: Conversation): "noAsk" | "noYes" | "notTheirs" | null {
  if (call.tool !== "send_message") return null;
  const t = conv.turns;
  const lastAnswer = [...t].reverse().find((x) => x.role === "answer") as { text: string } | undefined;
  const text = String(call.args.text ?? ""), to = String(call.args.to ?? "");
  if (!lastAnswer || !asksApproval(lastAnswer.text) || !text || !lastAnswer.text.includes(text.trim()) || !lastAnswer.text.includes(to.trim())) return "noAsk";
  if (!isYes(lastUser(conv))) return "noYes";
  const earlier = { tools: conv.tools, turns: t.slice(0, -1) };
  if (!words(personSaid(earlier)).join(" ").includes(words(text).join(" "))) return "notTheirs";
  return null;
}

/** A plain yes in either language ("yes", "ok, go ahead", «نعم», «موافق»). */
export function isYes(text: string): boolean {
  // Spaces, not \b: JavaScript's \b only knows Latin letters.
  const t = ` ${text.toLowerCase().replace(/[.!،,؟?]+/g, " ").trim()} `;
  return /^ (yes|yeah|yep|ok|okay|sure|go ahead|please do|نعم|أجل|اجل|موافق|موافقة|حسنًا|حسنا|تفضل|طبعًا|طبعا) /.test(t) && !/ (no|not|don't|لا) /.test(t);
}
