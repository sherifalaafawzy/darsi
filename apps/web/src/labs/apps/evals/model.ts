/**
 * The test set for "Test an agent": 32 requests, 8 per group (English or Arabic × wordings Darsi Tiny was trained on or
 * new ones), each with the call a correct agent makes. The new wordings are templates tools/tinylm/gen_data.py held
 * out of training (every fifth one), so the model has never seen them; the trained ones are templates it saw, with
 * names in new combinations. Scoring follows tools/tinylm/evaluate.py (agent.ts sameCall).
 */
import type { ToolCall } from "../../../tinylm";
import { sameCall, type Calc } from "../agentloop/agent";

export type Group = "en-trained" | "en-new" | "ar-trained" | "ar-new";
export const GROUPS: Group[] = ["en-trained", "en-new", "ar-trained", "ar-new"];
export interface Case { id: string; group: Group; text: string; want: ToolCall }

const c = (group: Group, n: number, text: string, tool: string, args: Record<string, unknown>): Case => ({ id: `${group}-${n}`, group, text, want: { tool, args } });

export const CASES: Case[] = [
  c("en-trained", 1, "What's the weather in Tanko tomorrow?", "weather", { place: "Tanko", day: "tomorrow" }),
  c("en-trained", 2, "How far is it from Sabo to Kuru?", "route", { from: "Sabo", to: "Kuru" }),
  c("en-trained", 3, "What lessons does 4A have on Monday?", "timetable", { class: "4A", day: "monday" }),
  c("en-trained", 4, "Was Hassan Banda at school today?", "attendance", { student: "Hassan Banda", range: "today" }),
  c("en-trained", 5, "What does phishing mean?", "glossary", { term: "phishing" }),
  c("en-trained", 6, "Do we have any books about plants?", "library", { query: "plants" }),
  c("en-trained", 7, "What is 48 times 12?", "calculator", { expr: "48*12" }),
  c("en-trained", 8, "Convert 20 kg to pounds.", "convert", { value: 20, from: "kg", to: "lb" }),

  c("en-new", 1, "Do I need an umbrella in Mbari tomorrow?", "weather", { place: "Mbari", day: "tomorrow" }),
  c("en-new", 2, "From Zango, how do I get to Bara?", "route", { from: "Zango", to: "Bara" }),
  c("en-new", 3, "What does 5C have on Friday?", "timetable", { class: "5C", day: "friday" }),
  c("en-new", 4, "Was Joy Saleh late this week?", "attendance", { student: "Joy Saleh", range: "week" }),
  c("en-new", 5, "Explain the term battery.", "glossary", { term: "battery" }),
  c("en-new", 6, "Get me a book about electricity.", "library", { query: "electricity" }),
  c("en-new", 7, "What's 350 take away 75?", "calculator", { expr: "350-75" }),
  c("en-new", 8, "What's 12 miles in km?", "convert", { value: 12, from: "mi", to: "km" }),

  c("ar-trained", 1, "ما حالة الطقس في تانكو غدًا؟", "weather", { place: "تانكو", day: "tomorrow" }),
  c("ar-trained", 2, "كم المسافة من سابو إلى كورو؟", "route", { from: "سابو", to: "كورو" }),
  c("ar-trained", 3, "ما حصص الصف الرابع أ يوم الاثنين؟", "timetable", { class: "4A", day: "monday" }),
  c("ar-trained", 4, "ما حالة حضور حسن باندا اليوم؟", "attendance", { student: "حسن باندا", range: "today" }),
  c("ar-trained", 5, "ما معنى التصيّد الاحتيالي؟", "glossary", { term: "التصيّد الاحتيالي" }),
  c("ar-trained", 6, "هل لدينا كتب عن النباتات؟", "library", { query: "النباتات" }),
  c("ar-trained", 7, "كم يساوي 48 × 12؟", "calculator", { expr: "48*12" }),
  c("ar-trained", 8, "حوّل 20 كيلوغرام إلى رطل.", "convert", { value: 20, from: "kg", to: "lb" }),

  c("ar-new", 1, "هل أحتاج إلى مظلة في مباري غدًا؟", "weather", { place: "مباري", day: "tomorrow" }),
  c("ar-new", 2, "انطلاقًا من زانغو، كيف أصل إلى بارا؟", "route", { from: "زانغو", to: "بارا" }),
  c("ar-new", 3, "راجع جدول الصف الخامس ج يوم الجمعة.", "timetable", { class: "5C", day: "friday" }),
  c("ar-new", 4, "هل سُجّل حضور جوي صالح اليوم؟", "attendance", { student: "جوي صالح", range: "today" }),
  c("ar-new", 5, "وضّح معنى البطارية.", "glossary", { term: "البطارية" }),
  c("ar-new", 6, "أحضر لي كتابًا عن الكهرباء.", "library", { query: "الكهرباء" }),
  c("ar-new", 7, "كم ناتج 350 * 75؟", "calculator", { expr: "350*75" }),
  c("ar-new", 8, "كم كيلومتر تساوي 12 ميل؟", "convert", { value: 12, from: "mi", to: "km" }),
];

export interface Scored { id: string; group: Group; text: string; want: ToolCall; got?: ToolCall; said?: string; tool: boolean; args: boolean; ms: number }

/** Scores one case from the model's first step (its call, or what it said instead). */
export function score(cs: Case, got: ToolCall | undefined, said: string | undefined, ms: number, calc: Calc): Scored {
  const r = sameCall(cs.want, got, calc);
  return { id: cs.id, group: cs.group, text: cs.text, want: cs.want, got, said, ...r, ms };
}

export interface Tally { n: number; tool: number; args: number }
/** Totals per group, per language and overall. */
export function tally(rows: readonly Scored[]): Record<Group | "en" | "ar" | "trained" | "new" | "all", Tally> {
  const t = (f: (r: Scored) => boolean): Tally => { const x = rows.filter(f); return { n: x.length, tool: x.filter((r) => r.tool).length, args: x.filter((r) => r.args).length }; };
  return {
    "en-trained": t((r) => r.group === "en-trained"), "en-new": t((r) => r.group === "en-new"),
    "ar-trained": t((r) => r.group === "ar-trained"), "ar-new": t((r) => r.group === "ar-new"),
    en: t((r) => r.group.startsWith("en")), ar: t((r) => r.group.startsWith("ar")),
    trained: t((r) => r.group.endsWith("trained")), new: t((r) => r.group.endsWith("new")), all: t(() => true),
  };
}

/** A share as a whole percentage (0 when nothing was scored). */
export const pct = (k: number, n: number) => (n ? Math.round((100 * k) / n) : 0);
