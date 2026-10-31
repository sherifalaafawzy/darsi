/**
 * "Teach the agent a new tool": a bus timetable tool Darsi Tiny has never seen, taught from 16 example conversations
 * (8 English, 8 Arabic) by fine-tuning its top block on the phone, then tested on villages the examples never name,
 * and on its old skills. tools/tinylm/finetune.py has the same tool (its demo) and MODEL_CARD.md the numbers.
 */
import { TOOLS, type Conversation, type Lang, type ToolCall } from "../../../tinylm";

export const BUS_TOOLS: string[] = [...TOOLS, "bus"];
/** The recipe: 16 examples × 15 steps, top block only, learning rate 2e-3. */
export const STEPS = 15, BLOCKS = 1, LR = 2e-3;
/** Ordinary conversations to mix in (replay.json): 0 shows forgetting, 48 keeps the old skills. */
export const REPLAYS = [0, 16, 48] as const;
/** Seconds per example per step on an old phone (MODEL_CARD.md: Chromium with the CPU slowed 6×, one block). */
export const OLD_PHONE_S = 0.7;
/** Where a fine-tune is kept on the phone (the evals lab can test it too). */
export { FINETUNE_KEY as SAVE_KEY } from "../agentloop/agent";

export interface Village { en: string; ar: string }
const v = (en: string, ar: string): Village => ({ en, ar });
const TRAIN_EN = [v("Kafi", "كافي"), v("Dala", "دالا"), v("Riverbend", "منعطف النهر"), v("Tanko", "تانكو"), v("Mbari", "مباري"), v("Sabo", "سابو"), v("Palm Hill", "تل النخيل"), v("Stone Bridge", "الجسر الحجري")];
const TRAIN_AR = [v("Lafiya", "لافيا"), v("Zango", "زانغو"), v("Kuru", "كورو"), v("Nyota", "نيوتا"), v("Kisima", "كيسيما"), v("Bara", "بارا"), v("Green Valley", "الوادي الأخضر"), v("Oasis Springs", "عين الواحة")];

/** Ways to ask; the first eight are taught, the last four are new wordings for the test. */
export const ASK: Record<Lang, string[]> = {
  en: ["When is the next bus from {p}?", "Bus times from {p}, please.", "What time does the bus leave {p}?", "Is there a bus from {p} soon?",
    "When does the next bus go from {p}?", "Check the bus from {p}.", "I need the next bus out of {p}.", "How often do buses leave {p}?",
    "What's the bus timetable for {p}?", "Any buses from {p} this morning?", "Next bus at {p}?", "Can you look up buses from {p}?"],
  ar: ["متى الحافلة القادمة من {p}؟", "مواعيد الحافلات من {p} من فضلك.", "متى تنطلق الحافلة من {p}؟", "هل توجد حافلة من {p} قريبًا؟",
    "متى تغادر الحافلة التالية من {p}؟", "تحقق من الحافلة من {p}.", "أحتاج الحافلة القادمة من {p}.", "كل كم دقيقة تنطلق الحافلات من {p}؟",
    "ما جدول الحافلات في {p}؟", "هل من حافلات من {p} هذا الصباح؟", "الحافلة التالية في {p}؟", "ابحث لي عن حافلات من {p}."],
};

/** The bus tool's (simulated) answer for a village: the next bus and how often, as finetune.py's bus_conv. */
export function busResult(village: Village): { next: string; every: number } {
  const h = [...village.en].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { next: `${String(6 + (h % 3)).padStart(2, "0")}:${String((h * 7) % 60).padStart(2, "0")}`, every: [15, 20, 30, 45][h % 4] };
}
/** The tool itself, for the lab's runs: the village by either name. */
export function runBus(args: Record<string, unknown>): Record<string, unknown> {
  const all = [...TRAIN_EN, ...TRAIN_AR, ...TEST_VILLAGES];
  const name = typeof args.from === "string" ? args.from.trim() : "";
  const vil = all.find((x) => x.en.toLowerCase() === name.toLowerCase() || x.ar === name);
  return vil ? busResult(vil) : { error: "unknown place" };
}

/** One finished example conversation: the request, the plan, the call, the result and the answer. */
export function busExample(lang: Lang, template: string, village: Village): Conversation {
  const p = village[lang], r = busResult(village);
  return {
    tools: BUS_TOOLS,
    turns: [
      { role: "user", text: template.replace("{p}", p) },
      { role: "plan", text: lang === "en" ? "I'll check the bus times." : "سأتحقق من مواعيد الحافلات." },
      { role: "call", call: { tool: "bus", args: { from: p } } },
      { role: "result", result: r },
      { role: "answer", text: lang === "en" ? `The next bus from ${p} leaves at ${r.next}, then every ${r.every} minutes.` : `تنطلق الحافلة القادمة من ${p} الساعة ${r.next}، ثم كل ${r.every} دقيقة.` },
    ],
  };
}

/** The 16 examples: each taught wording once per language, each with its own village. */
export const EXAMPLES: Conversation[] = [
  ...ASK.en.slice(0, 8).map((t, i) => busExample("en", t, TRAIN_EN[i])),
  ...ASK.ar.slice(0, 8).map((t, i) => busExample("ar", t, TRAIN_AR[i])),
];

export const TEST_VILLAGES = [v("Two Rivers", "ملتقى النهرين"), v("Ganda", "غاندا"), v("Moyo", "مويو"), v("Tamaru", "تمارو"), v("Ewa", "إيوا"), v("Kibo", "كيبو"), v("Sunrise", "الشروق"), v("Fig Tree", "شجرة التين")];

export interface Test { text: string; want: ToolCall; kind: "new" | "old"; lang: Lang; wording: "taught" | "new" }
const bus = (lang: Lang, i: number, village: Village, wording: "taught" | "new"): Test =>
  ({ text: ASK[lang][i].replace("{p}", village[lang]), want: { tool: "bus", args: { from: village[lang] } }, kind: "new", lang, wording });
const old = (lang: Lang, text: string, tool: string, args: Record<string, unknown>): Test => ({ text, want: { tool, args }, kind: "old", lang, wording: "taught" });

/** The test: the new tool on villages the examples never name (3 taught wordings and 1 new per language), and 8 old skills. */
export const TESTS: Test[] = [
  bus("en", 0, TEST_VILLAGES[0], "taught"), bus("en", 2, TEST_VILLAGES[1], "taught"), bus("en", 5, TEST_VILLAGES[2], "taught"), bus("en", 8, TEST_VILLAGES[3], "new"),
  bus("ar", 0, TEST_VILLAGES[4], "taught"), bus("ar", 2, TEST_VILLAGES[5], "taught"), bus("ar", 5, TEST_VILLAGES[6], "taught"), bus("ar", 8, TEST_VILLAGES[7], "new"),
  old("en", "What's the weather in Kafi tomorrow?", "weather", { place: "Kafi", day: "tomorrow" }),
  old("en", "How far is it from Sabo to Kuru?", "route", { from: "Sabo", to: "Kuru" }),
  old("en", "What is 48 times 12?", "calculator", { expr: "48*12" }),
  old("en", "What does phishing mean?", "glossary", { term: "phishing" }),
  old("ar", "ما حالة الطقس في كافي غدًا؟", "weather", { place: "كافي", day: "tomorrow" }),
  old("ar", "كم المسافة من سابو إلى كورو؟", "route", { from: "سابو", to: "كورو" }),
  old("ar", "كم يساوي 48 × 12؟", "calculator", { expr: "48*12" }),
  old("ar", "ما معنى التصيّد الاحتيالي؟", "glossary", { term: "التصيّد الاحتيالي" }),
];

/** Minutes the whole run would take on an old phone, from the model card's per-example time. */
export const oldPhoneMinutes = (examples: number, steps = STEPS) => (examples * steps * OLD_PHONE_S) / 60;
