#!/usr/bin/env node
/**
 * The startup-bundle rules, checked on a built app (CLAUDE.md, "Keep the startup bundle in one file"):
 *
 *   node scripts/check-bundle.mjs [build dir]     default apps/web/dist
 *     --has <text>      also fail unless a startup file contains this text (a release passes the Firebase project id)
 *     --budget <file>   default scripts/bundle-budget.json
 *     --json            print the measurements as JSON (to set a new budget from)
 *
 * It reads index.html, follows the static imports from the entry script, gzips each startup file, and fails when
 * - there are more startup files, or more KB gzipped, than scripts/bundle-budget.json allows;
 * - a startup file is one of the Firebase SDK's chunks ("firebase-…"): guests never load the SDK;
 * - sw.js precaches a file that should load on demand (a lab, the course editor, the code steps, Darsi Tiny, a staff
 *   screen from LAZY_SCREENS in apps/web/vite.config.ts…).
 * It builds nothing. To raise the budget, change the JSON file in the commit that grows startup, and say why there.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KB, checkBundle, lazyScreens } from "./lib/bundle.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; const [, v] = args.splice(i, 2); if (v === undefined) fail(`${flag} needs a value`); return v; };
function fail(msg) { console.error(msg); process.exit(2); }

const has = take("--has"), budgetFile = resolve(take("--budget") ?? join(ROOT, "scripts/bundle-budget.json"));
const json = args.includes("--json");
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? join(ROOT, "apps/web/dist"));
if (!existsSync(join(dir, "index.html")) || !existsSync(join(dir, "sw.js"))) fail(`${dir} is not a built app (no index.html or sw.js). Build first: npm run build`);

const budget = JSON.parse(readFileSync(budgetFile, "utf8"));
const screens = lazyScreens(readFileSync(join(ROOT, "apps/web/vite.config.ts"), "utf8"));
const r = checkBundle(dir, budget, { screens, has });
const kb = (n) => (n / KB).toFixed(1).padStart(7);

if (json) console.log(JSON.stringify({ files: r.startup.files.length, gzipKB: Number(r.kb.toFixed(1)), entry: r.startup.entry, startup: r.startup.files, precache: r.precache.length }, null, 2));
else {
  console.log(`Startup of ${relative(ROOT, dir) || "."}: ${r.startup.files.length} files, ${r.kb.toFixed(1)} KB gzipped (budget: ${budget.maxFiles} files, ${budget.maxGzipKB} KB)`);
  for (const f of r.startup.files) console.log(`  ${kb(f.gzip)} KB  ${f.file}${f.file === r.startup.entry ? "  (entry)" : ""}`);
  for (const f of r.startup.scripts) console.log(`  ${kb(f.gzip)} KB  ${f.file}  (plain script in index.html, not in the budget)`);
  for (const f of r.startup.css) console.log(`  ${kb(f.gzip)} KB  ${f.file}  (stylesheet, not in the budget)`);
  console.log(`Precache (sw.js): ${r.precache.length} files`);
}
if (r.problems.length) {
  for (const p of r.problems) console.error(`FAIL: ${p}`);
  process.exit(1);
}
if (!json) console.log("Bundle check passed.");
