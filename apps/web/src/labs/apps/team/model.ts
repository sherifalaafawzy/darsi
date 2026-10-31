/**
 * "A planner and a checker": Darsi Tiny plans and proposes each tool call; a checker made of five rules in code reviews
 * the call before the app runs it. Only the planner is a model; the checker and the hand-offs are scripted.
 */
import type { Lang, ToolCall, Turn } from "../../../tinylm";
import { ACTS, approvedInCode, checkCall, classSaid, exprNumbers, specOf, unfound } from "../agentloop/agent";

export type Rule = "tool" | "shape" | "said" | "after" | "person";
export const RULES: Rule[] = ["tool", "shape", "said", "after", "person"];
export interface Check { rule: Rule; ok: boolean; detail?: string }
export type Verdict = "run" | "ask" | "stop";

/** The checker's review of a call, before anything runs. `allowedByYou`: you tapped Allow for this action. */
export function review(call: ToolCall, turns: readonly Turn[], toolsOn: readonly string[], allowedByYou: boolean): Check[] {
  const said = turns.filter((t) => t.role === "user").map((t) => (t as { text: string }).text);
  let start = turns.length - 1;
  while (start >= 0 && turns[start].role !== "user") start--;
  const results = turns.slice(0, turns.length).filter((t) => t.role === "result").map((t) => JSON.stringify((t as { result: unknown }).result));
  const spec = specOf(call.tool);

  const issues = checkCall(call, toolsOn);
  const off = issues.find((i) => i.kind === "off" || i.kind === "unknown-tool");
  const shape = issues.filter((i) => i.kind === "missing" || i.kind === "extra" || i.kind === "type");

  const notSaid: string[] = [];
  for (const [k, v] of Object.entries(call.args)) {
    const kind = spec?.args.find((a) => a.name === k)?.kind;
    if (kind === "class") { if (typeof v === "string" && !classSaid(v, said)) notSaid.push(v); }
    else if (kind === "text") notSaid.push(...unfound(v, [...said, ...results]));
    else if (kind === "number") notSaid.push(...unfound(v, said));
    else if (kind === "expr" && typeof v === "string") notSaid.push(...exprNumbers(v).flatMap((x) => unfound(x, said)));
  }

  const failed = turns.slice(start + 1).some((t) => t.role === "result" && typeof (t.result as { error?: unknown })?.error === "string");
  const acts = ACTS.has(call.tool);
  const person = !acts ? true : call.tool === "send_message" ? approvedInCode(call, turns).ok : allowedByYou;

  return [
    { rule: "tool", ok: !off, detail: off ? call.tool : undefined },
    { rule: "shape", ok: !shape.length, detail: shape.map((i) => ("arg" in i ? i.arg : "")).join(", ") || undefined },
    { rule: "said", ok: !notSaid.length, detail: notSaid.join(", ") || undefined },
    { rule: "after", ok: !failed },
    { rule: "person", ok: person, detail: acts ? call.tool : undefined },
  ];
}

/** Run it, ask a person (everything else is fine, only a person's OK is missing), or stop it. */
export function verdict(checks: readonly Check[]): Verdict {
  const bad = checks.filter((c) => !c.ok);
  if (!bad.length) return "run";
  return bad.length === 1 && bad[0].rule === "person" ? "ask" : "stop";
}

export interface Request { id: string; text: Record<Lang, string> }
/** Requests that show each rule at work (the Arabic ones fail in their own ways). */
export const REQUESTS: Request[] = [
  { id: "fine", text: { en: "What's the weather in Kafi tomorrow?", ar: "ما حالة الطقس في كافي غدًا؟" } },
  { id: "class", text: { en: "What does 9Z have tomorrow?", ar: "ماذا لدى 9Z غدًا؟" } },
  { id: "copy", text: { en: "Remind me to tidy the library tomorrow at 9:00.", ar: "اشرح مصطلح البرمجيات الخبيثة." } },
  { id: "time", text: { en: "Remind me tomorrow at 25:00 to collect the homework.", ar: "ذكّرني غدًا الساعة 25:00: جمع الواجبات." } },
  { id: "chain", text: { en: "What is 6B's first lesson on Saturday? Remind me on Saturday at 7:30 about it.", ar: "ما الحصة الأولى في جدول 6B يوم السبت؟ وذكّرني بها يوم السبت الساعة 7:30." } },
  { id: "remind", text: { en: "Remind me tomorrow at 8:00 to collect the homework.", ar: "ذكّرني غدًا الساعة 8:00: جمع الواجبات." } },
  { id: "message", text: { en: "Send a message to Mrs Mensah: The trip to the farm is cancelled.", ar: "أرسل رسالة إلى الأستاذة مينسا: أُلغيت الرحلة إلى المزرعة." } },
];
