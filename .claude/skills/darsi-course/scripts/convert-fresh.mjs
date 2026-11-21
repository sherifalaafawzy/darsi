#!/usr/bin/env node
/**
 * Checks a Darsi storyboard with Lesson Studio's converter as if it had never been narrated, and writes nothing.
 *
 * After a rewrite, `node scripts/darsi/convert.ts <ID>` keeps the old narration and reports "timingStale" for every
 * word, and it prints only the first 12 issues, so real errors hide behind them. This runs the same build and the
 * same checks on estimated timings, and prints every error and warning (not counting the expected longLesson and
 * heavyLesson).
 *
 *   node .claude/skills/darsi-course/scripts/convert-fresh.mjs <ID>… [--only ar-EG] [--studio <Lesson Studio folder>]
 *
 * It needs the Node that Lesson Studio uses (one that runs .ts files directly).
 */
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const STUDIO = resolve(flag("--studio") ?? join(ROOT, "..", "lessonstudio"));
// --only ar-EG checks English plus just those languages (a rewrite leaves the other translations stale until they
// are translated again).
const only = flag("--only")?.split(",");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--studio" && args[i - 1] !== "--only");
if (!ids.length) { console.error("Usage: node .claude/skills/darsi-course/scripts/convert-fresh.mjs <ID>…"); process.exit(2); }

const { build, EXPECTED } = await import(pathToFileURL(join(STUDIO, "scripts", "darsi", "convert.ts")).href);
const { check } = await import(pathToFileURL(join(STUDIO, "packages", "ops", "src", "index.ts")).href);

let bad = 0;
for (const id of ids) {
  try {
    const lesson = build(id.toUpperCase(), false, only);
    const r = check(lesson, {});
    const issues = [...r.errors, ...r.warnings.filter((w) => !EXPECTED.has(w.code))];
    console.log(`${id.toUpperCase()}: ${lesson.scenes.scenes.length} scenes, ${r.errors.length} errors, ${issues.length - r.errors.length} warnings`);
    for (const e of issues) console.log(`   ${e.code} ${e.path}${e.detail ? ` (${e.detail})` : ""}`);
    if (issues.length) bad++;
  } catch (e) {
    console.log(`${id.toUpperCase()}: ${e.message}`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
