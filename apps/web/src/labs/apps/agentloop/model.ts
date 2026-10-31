/** "Inside an agent's loop": the example requests and where a conversation is in the loop. */
import type { Lang, Turn } from "../../../tinylm";

/** Requests Darsi Tiny handles well (training wordings), plus a two-step one and one no tool covers. */
export const EXAMPLES: Record<Lang, string[]> = {
  en: [
    "What's the weather in Kafi tomorrow?",
    "How far is it from Kafi to Dala?",
    "What is 17 times 23?",
    "What does algorithm mean?",
    "Find books on robots.",
    "I'm going from Kafi to Dala tomorrow. How far is it, and what's the weather there?",
    "Book a bus ticket to the city.",
  ],
  ar: [
    "ما حالة الطقس في كافي غدًا؟",
    "كم المسافة من كافي إلى دالا؟",
    "كم يساوي ١٧ × ٢٣؟",
    "ما معنى خوارزمية؟",
    "ابحث عن كتب حول الروبوتات.",
    "سأذهب من كافي إلى دالا غدًا. كم المسافة، وكيف الطقس هناك؟",
    "احجز تذكرة حافلة إلى المدينة.",
  ],
};

export type Stage = "request" | "plan" | "call" | "result" | "answer";
export const STAGES: Stage[] = ["request", "plan", "call", "result", "answer"];

/** The stages this turn has been through, and the one that comes next. */
export function stageOf(turns: readonly Turn[], then?: "call" | "answer" | null): { done: Set<Stage>; next: Stage | null } {
  const done = new Set<Stage>();
  for (const t of turns) done.add(t.role === "user" ? "request" : t.role);
  const last = turns[turns.length - 1];
  const next: Stage | null = !last ? "request" : last.role === "user" ? "plan" : last.role === "call" ? "result" : last.role === "answer" ? null
    : last.role === "plan" ? (then === "answer" ? "answer" : "call") : "answer";
  return { done, next };
}
