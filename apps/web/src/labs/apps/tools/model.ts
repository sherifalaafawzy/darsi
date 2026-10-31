/**
 * "How an agent picks a tool": the ten tools in words, example requests that show each way a turn can go, and what
 * happened in a turn (a tool was used, a tool was off, no tool fits, a detail was missing, the details were wrong).
 */
import type { Lang, ToolCall, ToolName, Turn } from "../../../tinylm";
import { checkCall, classSaid, unfound, type Issue } from "../agentloop/agent";

/** What each tool does and what it needs, for people (FORMAT.md has the exact arguments). */
export const TOOL_TEXT: Record<ToolName, { en: string; ar: string; args: string }> = {
  calculator: { en: "does sums", ar: "يجري الحسابات", args: "expr" },
  timetable: { en: "reads a class's timetable", ar: "يقرأ جدول حصص الصف", args: "class, day, period?" },
  weather: { en: "gives a village's weather", ar: "يعطي طقس قرية", args: "place, day?" },
  library: { en: "finds library books", ar: "يجد كتب المكتبة", args: "query" },
  attendance: { en: "reads a pupil's attendance", ar: "يقرأ حضور تلميذ", args: "student, range?" },
  glossary: { en: "explains a school word", ar: "يشرح كلمة مدرسية", args: "term" },
  reminder: { en: "sets a reminder", ar: "يضبط تذكيرًا", args: "text, when" },
  convert: { en: "converts units", ar: "يحوّل الوحدات", args: "value, from, to" },
  route: { en: "finds the road between villages", ar: "يجد الطريق بين قريتين", args: "from, to" },
  send_message: { en: "sends a message (after your yes)", ar: "يرسل رسالة (بعد موافقتك)", args: "to, text" },
};

export type Kind = "used" | "off" | "cant" | "ask" | "wrong" | "error" | "other";
/** An example request: the group it shows, a reply for the ones where Darsi Tiny asks back, and a note for after. */
export interface Example { text: string; group: "use" | "none" | "ask" | "wrong" | "self"; reply?: string; note?: "france" | "ninez" | "copy" | "self" }
export const GROUP_ORDER = ["use", "none", "ask", "wrong", "self"] as const;

/** Requests that show each way a turn can go. Switch a tool off and ask for it to see "off". */
export const EXAMPLES: Record<Lang, Example[]> = {
  en: [
    { text: "What's the weather in Kafi tomorrow?", group: "use" },
    { text: "Convert 5 km to miles.", group: "use" },
    { text: "Book a bus ticket to the city.", group: "none" },
    { text: "What's the capital of France?", group: "none" },
    { text: "What is the capital of France?", group: "none", note: "france" },
    { text: "What's the weather tomorrow?", group: "ask", reply: "Dala" },
    { text: "Remind me to collect the homework.", group: "ask", reply: "tomorrow at 8:00" },
    { text: "What does 9Z have tomorrow?", group: "wrong", note: "ninez" },
    { text: "Explain the term malware.", group: "wrong", note: "copy" },
    { text: "What's the weather in Paris tomorrow?", group: "wrong" },
    { text: "What can you do?", group: "self", note: "self" },
  ],
  ar: [
    { text: "ما حالة الطقس في كافي غدًا؟", group: "use" },
    { text: "حوّل 5 كيلومتر إلى ميل.", group: "use" },
    { text: "احجز تذكرة حافلة إلى المدينة.", group: "none" },
    { text: "ما عاصمة فرنسا؟", group: "none" },
    { text: "كيف الطقس غدًا؟", group: "ask", reply: "دالا" },
    { text: "ذكّرني بموضوع: جمع الواجبات.", group: "ask", reply: "غدًا الساعة 8:00" },
    { text: "ماذا لدى 9Z غدًا؟", group: "wrong", note: "ninez" },
    { text: "اشرح مصطلح البرمجيات الخبيثة.", group: "wrong", note: "copy" },
    { text: "ما حالة الطقس في باريس غدًا؟", group: "wrong" },
    { text: "ماذا تستطيع أن تفعل؟", group: "self", note: "self" },
  ],
};

/** Darsi Tiny's plans are fixed sentences (tools/tinylm/gen_data.py), so the plan says which way the turn went. */
const OFF = /turned off|متوقفة/;
const CANT = /None of my tools|لا توجد لدي أداة/;
const ASK = /missing|so I'll ask|don't know|غير محدد|سأسأل|لا أعرف/;

export interface Outcome { kind: Kind; call?: ToolCall; issues: Issue[]; ungrounded: string[]; error?: string }

/** What happened in the latest turn: from the person's last message to the end. */
export function outcome(turns: readonly Turn[], toolsOn: readonly string[]): Outcome | null {
  let i = turns.length - 1;
  while (i >= 0 && turns[i].role !== "user") i--;
  if (i < 0) return null;
  const turn = turns.slice(i);
  const said = turn.filter((t) => t.role === "user").map((t) => (t as { text: string }).text);
  const before = turns.slice(0, i).filter((t) => t.role === "user").map((t) => (t as { text: string }).text);
  const plan = turn.find((t) => t.role === "plan") as { text: string } | undefined;
  const call = turn.find((t) => t.role === "call") as { call: ToolCall } | undefined;
  const result = turn.find((t) => t.role === "result") as { result: Record<string, unknown> } | undefined;
  const answered = turn.some((t) => t.role === "answer");
  if (call) {
    const issues = checkCall(call.call, toolsOn);
    const ungrounded = notSaid(call.call, [...said, ...before]);
    const error = result && typeof result.result.error === "string" ? result.result.error : undefined;
    return { kind: issues.length || ungrounded.length ? "wrong" : error ? "error" : "used", call: call.call, issues, ungrounded, error };
  }
  if (!answered && !plan) return null;
  const p = plan?.text ?? "";
  return { kind: OFF.test(p) ? "off" : CANT.test(p) ? "cant" : ASK.test(p) ? "ask" : "other", issues: [], ungrounded: [] };
}

/** Names in a call that the person never wrote (a class, a village, a pupil, a word, a topic): copied wrongly or made up. */
export function notSaid(call: ToolCall, said: readonly string[]): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(call.args)) {
    if (k === "class") { if (typeof v === "string" && !classSaid(v, said)) out.push(v); continue; }
    const named = k === "place" || k === "student" || k === "term" || k === "query" || (call.tool === "route" && (k === "from" || k === "to"));
    if (named && unfound(v, said).length) out.push(String(v));
  }
  return out;
}
