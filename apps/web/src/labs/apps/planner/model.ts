/**
 * "Plan in steps": goals that need two tools one after the other, the plan Darsi Tiny writes for them, and where each
 * word of the second call came from (the person's request or the first tool's result).
 */
import type { Lang, ToolCall, Turn } from "../../../tinylm";
import { key } from "../agentloop/agent";

export interface Goal { id: string; text: Record<Lang, string>; tools: string[]; fails?: boolean }

/** Two-step goals Darsi Tiny was trained on (and one-step ones to compare), plus two where the first step fails. */
export const GOALS: Goal[] = [
  { id: "trip", tools: ["route", "weather"], text: { en: "I'm going from Kafi to Dala tomorrow. How far is it, and what's the weather there?", ar: "سأذهب من كافي إلى دالا غدًا. كم المسافة، وكيف الطقس هناك؟" } },
  { id: "word", tools: ["glossary", "library"], text: { en: "What does encryption mean, and do we have books about it?", ar: "ما معنى التشفير؟ وهل لدينا كتب عنه؟" } },
  { id: "lesson", tools: ["timetable", "reminder"], text: { en: "What is 6B's first lesson tomorrow? Remind me tomorrow at 7:30 about it.", ar: "ما الحصة الأولى في جدول 6B غدًا؟ وذكّرني بها غدًا الساعة 7:30." } },
  { id: "one", tools: ["weather"], text: { en: "What's the weather in Dala tomorrow?", ar: "ما حالة الطقس في دالا غدًا؟" } },
  { id: "saturday", tools: ["timetable", "reminder"], fails: true, text: { en: "What is 6B's first lesson on Saturday? Remind me on Saturday at 7:30 about it.", ar: "ما الحصة الأولى في جدول 6B يوم السبت؟ وذكّرني بها يوم السبت الساعة 7:30." } },
  { id: "nowhere", tools: ["route", "weather"], fails: true, text: { en: "I'm going from Kafi to Moonvale tomorrow. How far is it, and what's the weather there?", ar: "سأذهب من كافي إلى وادي القمر غدًا. كم المسافة، وكيف الطقس هناك؟" } },
];

/** The tools called in a turn, in order. */
export const calledTools = (turns: readonly Turn[]) => turns.filter((t): t is { role: "call"; call: ToolCall } => t.role === "call").map((t) => t.call.tool);

/** Whether a guessed plan (tools in order) matches what the model did. */
export const samePlan = (guess: readonly string[], did: readonly string[]) => guess.length === did.length && guess.every((t, i) => t === did[i]);

export type From = "request" | "result" | "none";
/**
 * A value of a call cut into words, each marked with where it can be found: in the request, in an earlier tool
 * result, or nowhere. Separators (": ", spaces) stay as they are, unmarked.
 */
export function provenance(value: unknown, request: string, results: readonly unknown[]): { text: string; from?: From }[] {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  const req = new Set(key(request).match(/[\p{L}\p{N}]+/gu) ?? []);
  const res = new Set(results.flatMap((r) => key(JSON.stringify(r)).match(/[\p{L}\p{N}]+/gu) ?? []));
  const out: { text: string; from?: From }[] = [];
  for (const m of str.matchAll(/([\p{L}\p{N}]+)|([^\p{L}\p{N}]+)/gu)) {
    if (m[2]) { out.push({ text: m[2] }); continue; }
    const k = key(m[1]);
    out.push({ text: m[1], from: req.has(k) ? "request" : res.has(k) ? "result" : "none" });
  }
  return out;
}

/** A step whose result was an error, and the step after it that went ahead anyway. */
export function wentAheadAfterError(turns: readonly Turn[]): { failed: number; next: number } | null {
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === "result" && t.result && typeof (t.result as { error?: unknown }).error === "string") {
      const j = turns.findIndex((x, k) => k > i && x.role === "call");
      if (j > i) return { failed: i, next: j };
    }
  }
  return null;
}
