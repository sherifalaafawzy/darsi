/**
 * What the validator's field paths ("tryTomorrow.en", "pairs.1.left.ar", "steps") are called in the editor's own
 * forms, in the author's language: the checks say "Try it in class tomorrow (English): Required." instead of the
 * path, and following one can find the field by its label and focus it.
 */
import type { LocalText, Step, Unit } from "../content/types";
import type { Issue } from "../content/validate";
import { CT } from "../lesson/capstoneText";
import { useI18n, type MessageKey } from "../i18n";
import { EVIDENCE_LABEL } from "./steps";

/**
 * A field as the form shows it: its label ("" for a whole item), the numbered item it is in ("Option B", "Pair 2"),
 * its language, and the form it sits in when that isn't the step's own (a video's pause question).
 */
export interface FieldName { label: string; item?: { name: string; index: number }; lang?: string; within?: string }

type Words = MessageKey | LocalText;
/**
 * `item`: the list the path's number counts in, named like the form's items ("Pair 1"). A path ending in its number
 * ("pairs.#") is the item itself.
 */
interface Spec { label: Words; item?: Words }
type Ctx = "unit" | "lesson" | "slide" | "kit" | Step["type"];

const S = (label: Words, item?: Words): Spec => ({ label, item });
const STEP: Record<string, Spec> = {
  prompt: S("cms.prompt"), explain: S("cms.explain"), type: S("cms.stepType"),
  snippet: S("cms.snippetCode"), "snippet.text": S("cms.snippetCode"), "snippet.lang": S("cms.codeLang"),
};
// A text inside an item (an option's text, a pair's left side, a key term) comes from the validator without the item's
// number ("text.en"): it is named by the field alone, and the cursor goes to the first such field left empty.
const OPTIONS: Record<string, Spec> = {
  text: S("cms.optionText"), label: S("cms.label"),
  options: S("cms.field.options"), "options.#": S("cms.option"), "options.#.text": S("cms.optionText", "cms.option"), "options.#.label": S("cms.label", "cms.option"),
  "options.#.art": S("cms.picture", "cms.option"), "options.#.id": S("cms.tracks.id", "cms.option"), answer: S("cms.answer"), answers: S("cms.answer"),
};
const BY: Partial<Record<Ctx, Record<string, Spec>>> = {
  unit: { title: S("cms.title"), summary: S("cms.summary"), track: S("cms.track"), level: S("cms.level"), audience: S("cms.audience"), kind: S("cms.field.capstone"),
    teach: S("cms.audience"), lessons: S("cms.lessons"), "lessons.#.id": S("cms.tracks.id", "cms.field.lesson"), id: S("cms.tracks.id") },
  lesson: { title: S("cms.title"), tryTomorrow: S("lesson.try"), materials: S("cms.materials"), minutes: S("cms.minutes"), steps: S("cms.steps"),
    "steps.#.id": S("cms.tracks.id", "cms.step"), slides: S("kit.slides"), competencies: S("p.capabilities"), id: S("cms.tracks.id") },
  slide: { layout: S("cms.layout"), title: S("cms.title"), bullets: S("cms.bullets"), note: S("cms.note"), narration: S("cms.narration"), details: S("cms.details") },
  kit: { kind: S("cms.field.kind"), title: S("cms.title"), pages: S("cms.pages"), formats: S("cms.field.formats"), urls: S("cms.field.files"), "urls.#": S("cms.field.files"),
    path: S("cms.field.files"), base: S("cms.field.files"), sizeKB: S("cms.field.files") },
  choice: OPTIONS, multi: OPTIONS, image: OPTIONS,
  match: { left: S("cms.left"), right: S("cms.right"), pairs: S("cms.field.pairs"), "pairs.#": S("cms.pair"), "pairs.#.left": S("cms.left", "cms.pair"), "pairs.#.right": S("cms.right", "cms.pair") },
  order: { steps: S("cms.field.items"), "steps.#": S("cms.item") },
  fill: { sentence: S("cms.sentence"), answers: S("cms.sentence"), bank: S("cms.extraWords") },
  type: { accept: S("cms.accept"), placeholder: S("cms.placeholder") },
  hotspot: { label: S("cms.spotLabel"), mock: S("cms.mockBody"), "mock.from": S("cms.mockFrom"), "mock.body": S("cms.mockBody"), "mock.link": S("cms.mockLink"), spots: S("cms.field.spots"),
    "spots.#": S("cms.spot"), "spots.#.id": S("cms.tracks.id", "cms.spot"), "spots.#.label": S("cms.spotLabel", "cms.spot"), "spots.#.line": S("cms.spot.where", "cms.spot"),
    "spots.#.x": S("cms.spot.x", "cms.spot"), "spots.#.y": S("cms.spot.y", "cms.spot"), "spots.#.w": S("cms.spot.w", "cms.spot"), "spots.#.h": S("cms.spot.h", "cms.spot") },
  scenario: { label: S("cms.optionText"), consequence: S("cms.consequence"), who: S("cms.who"), initial: S("cms.initial"), situation: S("cms.situation"), choices: S("cms.field.options"), "choices.#": S("cms.option"),
    "choices.#.id": S("cms.tracks.id", "cms.option"), "choices.#.label": S("cms.optionText", "cms.option"), "choices.#.consequence": S("cms.consequence", "cms.option"),
    "choices.#.tone": S("cms.tone", "cms.option") },
  reflect: { placeholder: S("cms.placeholder") },
  lab: { prompt: S("cms.instruction"), tool: S("cms.tool") },
  read: { term: S("cms.term"), def: S("cms.def"), prompt: S("cms.instruction"), title: S("cms.title"), body: S("cms.body"), "keyTerms.#": S("lesson.keyTerms"), "keyTerms.#.term": S("cms.term", "lesson.keyTerms"), "keyTerms.#.def": S("cms.def", "lesson.keyTerms") },
  project: { criterion: S("cms.criterion"), body: S(CT.setup), label: S(CT.kicker), task: S("cms.task"), deliverable: S("cms.deliverable"), rubric: S("cms.field.rubric"), "rubric.#": S("cms.criterion"), "rubric.#.criterion": S("cms.criterion", "cms.criterion"),
    final: S("cms.field.rubric"), evidence: S(CT.kicker), "evidence.#": S(CT.kicker), "evidence.#.label": S(CT.kicker), setup: S(CT.setup), "setup.#": S(CT.setup),
    "setup.#.body": S(CT.setup), starterRepo: S(CT.starter), hours: S(EVIDENCE_LABEL.hours), milestone: S(EVIDENCE_LABEL.milestone) },
  video: { label: S("cms.label"), prompt: S("cms.instruction"), title: S("cms.title"), transcript: S("lesson.transcript"), duration: S("cms.duration"), sizeMB: S("cms.sizeMB"), src: S("cms.videoPath"), sources: S("cms.videoFile"),
    captions: S("cms.captions"), light: S("cms.field.light"), "light.files": S("cms.field.light"), "light.langs": S("cms.field.light"),
    "chapters.#": S("cms.chapter"), "chapters.#.label": S("cms.label", "cms.chapter"), "chapters.#.at": S("cms.at", "cms.chapter"), "chapters.#.atBy": S("cms.at", "cms.chapter"),
    checkpoint: S("cms.checkpoint"), "checkpoint.at": S("cms.at"), "checkpoint.atBy": S("cms.at") },
  code: { hint: S("cms.testHint"), lang: S("cms.codeLang"), starter: S("cms.starter"), solution: S("cms.solution"), setup: S("cms.setup"), tests: S("cms.field.tests"), "tests.#": S("cms.test"),
    "tests.#.input": S("cms.testInput", "cms.test"), "tests.#.hint": S("cms.testHint", "cms.test"), "files.#": S("cms.file"), "hints.#": S("cms.hint"), board: S("cms.board") },
  parsons: { lang: S("cms.codeLang"), lines: S("cms.parsonsLines"), "lines.#": S("cms.parsonsLines"), "distractors.#": S("cms.distractors") },
  codefill: { lang: S("cms.codeLang"), code: S("cms.fillCode"), "code.#": S("cms.fillCode"), answers: S("cms.fillCode"), "distractors.#": S("cms.distractors") },
  bug: { lang: S("cms.codeLang"), code: S("cms.bugCode"), line: S("cms.bugLine"), fix: S("cms.bugFix") },
  blocks: { world: S("cms.field.world"), "world.cols": S("cms.cols"), "world.rows": S("cms.rows"), "world.start": S("cms.startX"), "world.start.dir": S("cms.startDir"),
    "world.goal": S("cms.goalX"), "world.walls": S("cms.walls"), "world.walls.#": S("cms.walls"), commands: S("cms.field.commands"), maxBlocks: S("cms.maxBlocks") },
};
/** Paths whose last part is a language (LocalText, LocalList and per-language maps). */
const LANG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;

/** The step a path inside a video's pause question refers to, and the path inside it. */
function inner(field: string, s: Step | undefined): { ctx: Ctx; path: string } | null {
  if (!field.startsWith("checkpoint.question.") || s?.type !== "video" || !s.checkpoint) return null;
  return { ctx: s.checkpoint.question.type, path: field.slice("checkpoint.question.".length) };
}

export function useFieldName(unit: Unit | null) {
  const { t, L } = useI18n();
  const words = (w: Words) => (typeof w === "string" ? t(w) : L(w));
  return (i: Issue): FieldName | null => {
    if (!unit || !i.at.field) return null;
    const lesson = i.at.lesson !== undefined ? unit.lessons[i.at.lesson] : undefined;
    const step = i.at.step !== undefined ? lesson?.steps[i.at.step] : undefined;
    let ctx: Ctx = i.at.slide !== undefined ? "slide" : i.at.kit !== undefined ? "kit" : i.at.step !== undefined ? (step?.type ?? "choice") : i.at.lesson !== undefined ? "lesson" : "unit";
    let field = i.at.field, within: string | undefined;
    const q = inner(field, step);
    const own = q && step?.type === "video" ? step.checkpoint?.question : step;
    if (q) { ctx = q.ctx; field = q.path; within = t("cms.checkpoint"); }
    const parts = field.split(".");
    const keyOf = (ps: string[]) => ps.map((p) => (/^\d+$/.test(p) ? "#" : p)).join(".");
    const table = { ...(ctx !== "unit" && ctx !== "lesson" && ctx !== "slide" && ctx !== "kit" ? STEP : {}), ...BY[ctx] };
    let key = keyOf(parts), lang: string | undefined;
    if (!table[key] && parts.length > 1 && LANG.test(parts[parts.length - 1])) { lang = parts[parts.length - 1]; key = keyOf(parts.slice(0, -1)); }
    // Per-language maps whose language comes in the middle ("urls.ar.pdf").
    if (!table[key] && parts.length > 2 && LANG.test(parts[1])) { lang = parts[1]; key = parts[0]; }
    // Else what the path is inside of ("board.leds.0.pin" is in the virtual board).
    if (!table[key] && table[parts[0]]) { lang = undefined; key = parts[0]; }
    const spec = table[key];
    if (!spec) return null;
    const index = parts.find((p) => /^\d+$/.test(p));
    const n = index === undefined ? undefined : Number(index);
    // Options are named by their letter, as the form names them ("Option B"); other items by their number.
    const letter = n !== undefined && own && "options" in own && Array.isArray(own.options) ? own.options[n]?.id : undefined;
    const itemName = (w: Words) => `${words(w)} ${letter && (ctx === "choice" || ctx === "multi" || ctx === "image") ? letter.toUpperCase() : (n ?? 0) + 1}`;
    if (key.endsWith("#") && n !== undefined) return { label: "", item: { name: itemName(spec.label), index: n }, lang, within };
    return { label: words(spec.label), item: spec.item && n !== undefined ? { name: itemName(spec.item), index: n } : undefined, lang, within };
  };
}

/** The field's name in words: "Option B › Text", "Pause with a question › Correct answer" (the language goes beside it). */
export const fieldText = (f: FieldName) => [f.within, f.item?.name, f.label].filter(Boolean).join(" › ");

/** The lesson fields kept in "More about this lesson…" (closed until opened). */
export const MORE_FIELDS = /^(?:tryTomorrow|materials|competencies)(?:\.|$)/;
