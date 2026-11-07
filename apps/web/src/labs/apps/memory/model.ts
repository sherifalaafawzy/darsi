/**
 * "An agent's memory": Darsi Tiny's context window. Every turn costs tokens (its marker plus its text); the window
 * holds the tools line, the turns that still fit, and room for the model to write. When it fills, the app chooses what
 * to send: everything (until it can't), the newest turns only (the oldest fall out), or notes (finished requests keep
 * only what was asked and answered, without the plan, the call and the result).
 */
import type { Lang, Turn } from "../../../tinylm";

export type Strategy = "all" | "drop" | "notes";
/** Tokens kept free for Darsi Tiny to write its next step (the longest step in the script is about 60). */
export const RESERVE = 64;

/** The text a turn adds to the prompt (FORMAT.md): its marker is one more token, and an answer is closed by <|end|>. */
export function turnText(t: Turn): string {
  if (t.role === "call") return t.call.tool + JSON.stringify(t.call.args);
  if (t.role === "result") return JSON.stringify(t.result);
  return t.text;
}
export const turnCost = (t: Turn, textTokens: number) => 1 + textTokens + (t.role === "answer" ? 1 : 0);
/** The tools line: <|tools|> plus the names. */
export const toolsCost = (textTokens: number) => 1 + textTokens;

export type Fate = "kept" | "out" | "noted";
export interface Window { fate: Fate[]; used: number; full: boolean }

/**
 * Which turns go into the prompt for the turn that starts at the person's latest message. `cost[i]` is turn i's tokens;
 * `head` the tools line. The current turn (from the latest message on) always stays. Used includes the <|plan|> that
 * opens the model's turn when the prompt ends with the person's message (buildPrompt adds it).
 */
export function fit(turns: readonly Turn[], cost: readonly number[], head: number, size: number, strategy: Strategy, reserve = RESERVE): Window {
  let cur = turns.length - 1;
  while (cur > 0 && turns[cur].role !== "user") cur--;
  const fate: Fate[] = turns.map((t, i) => (strategy === "notes" && i < cur && (t.role === "call" || t.role === "result") ? "noted" : "kept"));
  const open = turns[turns.length - 1]?.role === "user" ? 1 : 0;
  const used = () => head + open + fate.reduce((a, f, i) => a + (f === "kept" ? cost[i] : 0), 0);
  if (strategy !== "all") for (let i = 0; i < cur && used() + reserve > size; i++) if (fate[i] === "kept") fate[i] = "out";
  const u = used();
  return { fate, used: u, full: u + reserve > size };
}

/** The turns the model sees. */
export const visible = (turns: readonly Turn[], fate: readonly Fate[]) => turns.filter((_, i) => fate[i] === "kept");

/** "A busy morning", then a question back: the messages to send, one after another. */
export const SCRIPT: Record<Lang, string[]> = {
  en: [
    "What lessons does 6B have tomorrow?",
    "What's the weather in Kafi tomorrow?",
    "How far is it from Kafi to Dala?",
    "Send a message to Mr Okafor: The staff meeting is at 3:00 tomorrow.",
    "yes",
    "What's the weather tomorrow?",
    "Dala",
  ],
  ar: [
    "ما حصص الصف السادس ب غدًا؟",
    "ما حالة الطقس في كافي غدًا؟",
    "كم المسافة من كافي إلى دالا؟",
    // A little longer than a plain translation, so the Arabic run shows what the English one does
    // (the fourth answer is cut off; with 128 tokens "غدًا" falls out before the call).
    "أرسل رسالة إلى الأستاذ أوكافور: اجتماع المعلمين غدًا الساعة 3:00 في المكتبة.",
    "نعم",
    "من فضلك، ما حالة الطقس غدًا؟",
    "دالا",
  ],
};

/** Typical context windows of large cloud models in 2026, in tokens (they vary by model). */
export const BIG_WINDOW = 128_000;
