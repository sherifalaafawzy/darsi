/**
 * The pure parts of talking to the tutor agent on Agent Runtime (agent.ts does the calls): reading a turn's stream, and
 * what the turn cost. The agent writes its answer, its explainer and its token count into session state
 * (agent/darsi_tutor/tools.py), so they come back as state deltas on the stream's events.
 */
import type { Explainer } from "./explainer.js";

export interface AgentReply { inScope: boolean; answer: string; sources: string[] }
export interface AgentUsage { in: number; cached: number; out: number; calls: number }
export interface AgentTurn { reply: AgentReply | null; explainer: Explainer | null; usage: AgentUsage | null; error: string | null }

type Ev = { actions?: { state_delta?: Record<string, unknown>; stateDelta?: Record<string, unknown> }; error_message?: string; errorMessage?: string; error?: { message?: string } | string };

/** Events from a :streamQuery body: server-sent events ("data: {…}"), JSON lines or one JSON array, whichever comes. */
export function parseEvents(body: string): Ev[] {
  const t = body.trim();
  if (t.startsWith("[")) { try { return JSON.parse(t) as Ev[]; } catch { /* fall through to lines */ } }
  const out: Ev[] = [];
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/^data:\s?/, "").trim();
    if (!line || line.startsWith(":") || line.startsWith("event:")) continue;
    try { out.push(JSON.parse(line) as Ev); } catch { /* a partial line or keep-alive */ }
  }
  return out;
}

/** What one turn left in state: the last value of each key wins (a repaired explainer replaces the first). */
export function readTurn(events: Ev[]): AgentTurn {
  const turn: AgentTurn = { reply: null, explainer: null, usage: null, error: null };
  for (const e of events) {
    const d = e.actions?.state_delta ?? e.actions?.stateDelta;
    if (d?.reply && typeof d.reply === "object") { const r = d.reply as Partial<AgentReply>; turn.reply = { inScope: r.inScope === true, answer: String(r.answer ?? ""), sources: Array.isArray(r.sources) ? r.sources.map(String) : [] }; }
    if (d?.explainer && typeof d.explainer === "object") turn.explainer = d.explainer as Explainer;
    if (d?.usage && typeof d.usage === "object") turn.usage = d.usage as AgentUsage;
    const err = e.error_message ?? e.errorMessage ?? (typeof e.error === "string" ? e.error : e.error?.message);
    if (err) turn.error = String(err);
  }
  return turn;
}

/** USD per million tokens for the agent's model (3.8 Flash on the global endpoint), and Agent Runtime's compute per second. */
export interface AgentPrices { textIn: number; textOut: number; runtimePerSec: number }
// 3.8 Flash's introductory price runs to 31 Dec 2026; from 1 Jan 2027 it is $1.50 / $7.50 (config/tutor.agentPrices).
// Runtime: 4 vCPU × $0.085 and 8 GiB × $0.009 per hour, while a turn runs.
export const AGENT_PRICES: AgentPrices = { textIn: 0.75, textOut: 3.75, runtimePerSec: (4 * 0.085 + 8 * 0.009) / 3600 };
export const PRICES_2027: Pick<AgentPrices, "textIn" | "textOut"> = { textIn: 1.5, textOut: 7.5 };

/** What a turn cost Darsi: every model call's tokens (thinking counted as output by the agent), plus the runtime's seconds. */
export function turnCost(u: AgentUsage | null, seconds: number, p: AgentPrices): number {
  const tokens = u ? (u.in * p.textIn + u.out * p.textOut) / 1e6 : 0;
  return tokens + Math.max(0, seconds) * p.runtimePerSec;
}

/** The learner's message: the question, with the sections the course search found for it (as the direct engine gives them). */
export function agentMessage(question: string, found: string, show: boolean): string {
  return [
    show ? "The learner asked to see this explained: call make_explainer for it, then reply." : "",
    question,
    found ? `SECTIONS THAT MAY HELP:\n${found}` : "",
  ].filter(Boolean).join("\n\n");
}

/** One repair turn when Lesson Studio rejected the explainer: the problems, in the agent's terms. */
export const repairMessage = (problems: string[]) =>
  `The explainer you made can't be played: ${problems.slice(0, 8).join("; ")}. Call make_explainer again with the same topic, avoiding these problems, then reply.`;
