#!/usr/bin/env node
/**
 * Writes apps/web/src/admin/courseTitles.json: every course in content/units and content/retired (repo root) by id,
 * with its title in English and Arabic, its track and its level. Staff screens name a course that is no longer
 * published from it (the catalog lists only published ones, and 54 were unpublished live), instead of its raw id.
 * Only the staff chunks import it, never startup code. tests/course-titles.test.ts fails when it no longer matches the
 * course sources: run this again after adding, renaming or retiring a course.
 *
 * Usage:  node apps/web/scripts/course-titles.mjs           (write)
 *         node apps/web/scripts/course-titles.mjs --check   (exit 1 if the file is out of date)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(root, "apps/web/src/admin/courseTitles.json");

/** id → { title: { en, ar? }, track, level }, sorted by id; a published source wins over a retired one with the same id. */
export function courseTitles(dirs = [join(root, "content/units"), join(root, "content/retired")]) {
  const out = {};
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const u = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (!u?.id || out[u.id]) continue;
      const title = { en: String(u.title?.en ?? u.id) };
      if (u.title?.ar) title.ar = String(u.title.ar);
      out[u.id] = { title, track: String(u.track ?? ""), level: Number(u.level) || 1 };
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** One course per line, so a renamed course is a one-line change. */
export const render = (map) => `{\n${Object.entries(map).map(([id, v]) => `${JSON.stringify(id)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(courseTitles());
  if (process.argv.includes("--check")) {
    const now = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (now !== text) { console.error("apps/web/src/admin/courseTitles.json is out of date: run node apps/web/scripts/course-titles.mjs"); process.exit(1); }
    console.log("courseTitles.json is up to date.");
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${Object.keys(JSON.parse(text)).length} courses to apps/web/src/admin/courseTitles.json`);
  }
}
