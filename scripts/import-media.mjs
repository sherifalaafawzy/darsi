#!/usr/bin/env node
/**
 * Fills the video steps of courses written as files (content/units/<unit>.json) from Lesson Studio, where each lesson's
 * storyboard became a narrated lesson in English and Egyptian Arabic (docs/CURRICULUM.md has the whole pipeline). For
 * every lesson with a video step, the Lesson Studio lesson with the same id gives:
 *   - the 240p MP4s, captions and light lesson, copied into content/media/<lesson>/ (gitignored; `npm run seed` uploads them);
 *   - sources, captions, light, duration and sizeMB;
 *   - each chapter's and the checkpoint's time in each language's video (the labels and the question stay as written);
 *   - the transcript, from the narration itself, so it always matches what is said;
 *   - the lesson's video kit item.
 * The three courses from the zip packs use scripts/import-packs.mjs instead.
 *
 *   node scripts/import-media.mjs <unit>… [--studio <Lesson Studio repository>]
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, sceneTimes, storyboard, studioMedia } from "./lib/studio-media.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const STUDIO = resolve(flag("--studio") ?? join(ROOT, "..", "lessonstudio"));
const units = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--studio");
if (!units.length) { console.error("Usage: node scripts/import-media.mjs <unit>… [--studio <Lesson Studio repository>]"); process.exit(1); }

const plain = (s) => String(s ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s+/g, " ").trim();
const KIT_TITLE = {
  teachers: { en: "The lesson video (240p, for class or WhatsApp)", ar: "فيديو الدرس (بدقة 240p، للصف أو لواتساب)" },
  students: { en: "The lesson video (240p, to watch again or share)", ar: "فيديو الدرس (بدقة 240p، لتشاهده مجددًا أو تشاركه)" },
};

/** Fills one lesson's video step; returns what it could not do, as messages. */
function fill(unit, lesson) {
  const step = lesson.steps.find((s) => s.type === "video");
  if (!step) return [];
  const studioId = lesson.id.toLowerCase();
  if (!existsSync(join(STUDIO, "content", "darsi", "lessons", studioId, "scenes.json"))) return [`${lesson.id}: no Lesson Studio lesson yet (node scripts/darsi/convert.ts ${lesson.id.toUpperCase()} there)`];
  const m = studioMedia(ROOT, STUDIO, studioId, lesson.id);
  const { story, arabic } = storyboard(STUDIO, studioId);
  const at = sceneTimes(STUDIO, studioId);
  const problems = [];
  // Chapters: the storyboard's, timed in each language; their labels are the ones written in the unit (en + ar).
  const sceneOf = (mmss) => Math.max(0, story.scenes.findIndex((s) => s.start === mmss));
  if (step.chapters?.length && step.chapters.length !== story.chapters.length) problems.push(`${lesson.id}: ${step.chapters.length} chapter labels in the unit, ${story.chapters.length} chapters in the storyboard`);
  step.chapters = story.chapters.map((c, k) => {
    const i = sceneOf(c.at);
    return { at: at.en[i], atBy: { en: at.en[i], ar: at.ar[i] }, label: step.chapters?.[k]?.label ?? { en: plain(c.label) } };
  });
  // The checkpoint inside the video is the storyboard's first quick check; its question is the one written in the unit.
  const checks = { en: m.info.en.checks ?? [], ar: m.info.ar.checks ?? [] };
  if (story.checkpoints?.length && checks.en.length && checks.ar.length) {
    if (!step.checkpoint?.question) problems.push(`${lesson.id}: write the checkpoint question (en + ar) in the unit; the storyboard's first check is "${plain(story.checkpoints[0].prompt)}"`);
    else Object.assign(step.checkpoint, { at: checks.en[0].at, atBy: { en: checks.en[0].at, ar: checks.ar[0].at } });
  }
  step.transcript = { en: story.scenes.map((s) => plain(s.narration)).join(" "), ar: story.scenes.map((s) => plain(arabic.scenes[String(s.n)]?.narration)).join(" ") };
  Object.assign(step, { src: null, sources: m.sources, captions: m.captions, duration: m.duration, sizeMB: m.sizeMB, light: m.light });
  const kit = { kind: "video", title: KIT_TITLE[unit.audience === "students" ? "students" : "teachers"], pages: 0, formats: ["mp4"], path: `/media/${lesson.id}/video-{lang}` };
  const i = lesson.kit.findIndex((k) => k.kind === "video");
  if (i >= 0) lesson.kit[i] = kit; else lesson.kit.push(kit);
  return problems;
}

let failed = 0;
for (const id of units) {
  const file = join(ROOT, "content", "units", `${id}.json`);
  if (!existsSync(file)) { console.error(`${id}: no content/units/${id}.json`); failed++; continue; }
  const unit = readJson(file);
  const problems = [];
  let filled = 0;
  for (const lesson of unit.lessons) {
    try {
      const p = fill(unit, lesson);
      problems.push(...p);
      if (!p.length && lesson.steps.some((s) => s.type === "video")) filled++;
    } catch (e) { problems.push(`${lesson.id}: ${e.message}`); }
  }
  writeFileSync(file, `${JSON.stringify(unit, null, 2)}\n`);
  console.log(`${id}: ${filled} video step(s) filled${problems.length ? `; ${problems.length} problem(s):\n  ${problems.join("\n  ")}` : ""}`);
  if (problems.length) failed++;
}
process.exit(failed ? 1 : 0);
