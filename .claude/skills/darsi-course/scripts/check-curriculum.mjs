#!/usr/bin/env node
// Check a track's curriculum plan (docs/curriculum/<track>.md) against the format and the rules in
// references/curriculum.md. It reads files only; it costs nothing and changes nothing.
//
//   node .claude/skills/darsi-course/scripts/check-curriculum.mjs agents
//   node .claude/skills/darsi-course/scripts/check-curriculum.mjs --all
//
// Exit code 1 when any plan has a problem. Notes are things to look at, not failures.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOCS = join(ROOT, "docs/curriculum");
const UNITS = join(ROOT, "content/units");
const LABS = join(ROOT, "apps/web/src/labs/apps");
const TRACKS = ["ai", "cyber", "iot", "code", "data", "data-science", "agents", "aisec", "opt"];
const HEADINGS = ["The track in one look", "The paths", "What changes, and why", "The ledger", "The courses", "How today's courses map", "Work, in order", "Decisions for the user"];
const STATUS = ["keep", "revise", "rewrite", "new", "move"];
const WORK = ["D", "S", "R", "N", "T"];
const WEAK = /^(to\s+)?(understand|know|learn|be aware|appreciate|be familiar|have an understanding)\b/i;

const args = process.argv.slice(2);
const which = args.includes("--all") ? TRACKS : args.filter((a) => !a.startsWith("--"));
if (!which.length) { console.error("Usage: check-curriculum.mjs <track>… | --all"); process.exit(2); }

const unitsByTrack = new Map();
const unitIds = new Set();
for (const f of readdirSync(UNITS).filter((f) => f.endsWith(".json"))) {
  const u = JSON.parse(readFileSync(join(UNITS, f), "utf8"));
  unitIds.add(u.id);
  if (!unitsByTrack.has(u.track)) unitsByTrack.set(u.track, []);
  unitsByTrack.get(u.track).push(u);
}
const labIds = new Set(existsSync(LABS) ? readdirSync(LABS) : []);

/** Course ids that have a section in any plan: a "Before this" may name a course that is still only planned. */
const planned = new Set();
for (const t of TRACKS) {
  const p = join(DOCS, `${t}.md`);
  if (existsSync(p)) for (const m of readFileSync(p, "utf8").matchAll(/^### `([a-z0-9-]+)`/gm)) planned.add(m[1]);
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean);
const sentences = (s) => s.trim().split(/(?<=[.!?…؟]["”’»]?)\s+/).filter(Boolean);
const strip = (s) => s.trim().replace(/^[“"«]+|[”"»]+$/g, "").trim();
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
const cells = (row) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((c) => c.trim());

function section(text, title) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n");
}

function check(track) {
  const file = join(DOCS, `${track}.md`);
  const problems = [], notes = [];
  const P = (where, msg) => problems.push(`${where}: ${msg}`);
  const N = (where, msg) => notes.push(`${where}: ${msg}`);
  if (!existsSync(file)) return { problems: [`docs/curriculum/${track}.md does not exist`], notes, tally: {} };
  const text = readFileSync(file, "utf8");

  for (const h of HEADINGS) if (section(text, h) === null) P("plan", `the heading "## ${h}" is missing`);
  const look = section(text, "The track in one look") ?? "";
  const en = look.match(/\*\*Track line \(en\):\*\*\s*(.+)/), ar = look.match(/\*\*Track line \(ar\):\*\*\s*(.+)/);
  if (!en) P("plan", "no **Track line (en):**");
  if (!ar) P("plan", "no **Track line (ar):**");
  else { if (ar[1].includes("·")) P("plan", "the Arabic track line uses “·”"); if (!/[؀-ۿ]/.test(ar[1])) P("plan", "the Arabic track line has no Arabic"); }
  if (en && words(en[1]).length > 30) N("plan", `the English track line is ${words(en[1]).length} words; a track card has room for about 30`);

  const courses = section(text, "The courses") ?? "";
  const parts = courses.split(/^(?=### `)/m).filter((p) => p.startsWith("### `"));
  const seen = new Set();
  const tally = Object.fromEntries(WORK.map((w) => [w, 0]));
  let lessons = 0;
  for (const part of parts) {
    const id = part.match(/^### `([a-z0-9-]+)`/)[1];
    seen.add(id);
    const get = (label) => (part.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, "m")) || [])[1]?.trim();
    const who = get("For"), status = get("Status"), after = get("After it, you can"), before = get("Before this"), python = get("Python"), path = get("The path");
    const capstone = /capstone/i.test(who ?? "") || /-capstone$/.test(id);
    for (const [label, v] of [["For", who], ["Status", status], ["After it, you can", after], ["Before this", before], ["Python", python]]) if (!v) P(id, `no "- **${label}:**" line`);
    if (!capstone && !path) P(id, 'no "- **The path:**" line');
    if (status && !STATUS.includes(status.split(/[\s.,(:;]/)[0])) P(id, `status "${status}" is not one of ${STATUS.join(", ")}`);
    if (after && WEAK.test(after)) P(id, `the course outcome starts with "${after.split(" ")[0]}": say what a person can be seen doing`);
    if (status && !/^new\b/.test(status) && !unitIds.has(id)) P(id, `there is no content/units/${id}.json, but the status is not "new"`);
    // A new course gets its file when it is written; by then every lesson is D (done).
    const works = [...part.matchAll(/^\|\s*\d+\s*\|.*\|\s*([A-Z])\s*\|\s*$/gm)].map((m) => m[1]);
    if (status && /^new\b/.test(status) && unitIds.has(id) && !(works.length && works.every((w) => w === "D")))
      P(id, "the status is new and the course file exists: mark its lessons D once they are written");

    if (before) {
      const zero = /^No experience needed/i.test(before);
      const named = [...before.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
      if (!zero && !named.length) P(id, 'its "Before this" names no course: give each course id in backticks, or say "No experience needed."');
      for (const n of named) if (!unitIds.has(n) && !planned.has(n)) P(id, `"Before this" names \`${n}\`, which is neither a course file nor a course in any plan`);
      const students = /^students/i.test(who ?? ""), teachers = /^teachers/i.test(who ?? "");
      const starting = (teachers && /level 1\b/i.test(who)) || (students && /-s[123]$|-s4-0$|-m1$/.test(id));
      if (starting && track !== "code" && !zero && named.some((n) => !n.startsWith("code-"))) P(id, "a starting course may expect only school knowledge and a Programming course: teach the rest in lesson 1");
      if (teachers && /level 1\b/i.test(who) && !zero) P(id, 'a Beginner course says "No experience needed."');
      if (python && /rung\s*[123]/i.test(python) && !/taught (here|in (this|the) course)/i.test(python) && track !== "code" && !named.some((n) => n.startsWith("code-")))
        P(id, `it writes Python (${python}) but its "Before this" names no Programming course`);
      if (python && /rung\s*[123]/i.test(python) && students && /-s1$/.test(id)) P(id, "nothing is typed at primary");
    }

    if (capstone) continue;
    const lines = part.split(/\r?\n/);
    const head = lines.findIndex((l) => /^\|\s*#\s*\|\s*Lesson\s*\|/i.test(l));
    if (head < 0) { P(id, 'no lesson table ("| # | Lesson | After it, you can | Hook | New terms | Lab | Work |")'); continue; }
    const rows = [];
    for (let i = head + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
    if (rows.length !== 4) P(id, `${rows.length} lessons in the table; a course has 4`);
    const hooks = [];
    for (const r of rows) {
      const where = `${id} lesson ${r[0]}`;
      if (r.length !== 7) { P(where, `${r.length} columns in its row; there are 7 (is there a "|" inside a cell?)`); continue; }
      const [, title, out, hookRaw, termsRaw, lab, work] = r;
      lessons++;
      if (!title) P(where, "no title");
      if (!out) P(where, "no outcome"); else if (WEAK.test(out)) P(where, `the outcome starts with "${out.split(" ")[0]}": say what a person can be seen doing`);
      if (!WORK.includes(work)) P(where, `work code "${work}" is not one of ${WORK.join(", ")}`); else tally[work]++;
      const terms = /^[—–-]?$/.test(termsRaw) ? [] : termsRaw.split(/\s*;\s*/).filter(Boolean);
      if (terms.length > 4) P(where, `${terms.length} new terms (4 at most)`);
      const hook = strip(hookRaw);
      if (!hook) { P(where, "no hook"); continue; }
      hooks.push(norm(hook));
      const ss = sentences(hook), w = words(hook).length;
      if (w > 40) P(where, `the hook is ${w} words (40 at most)`);
      if (ss.length > 4) P(where, `the hook is ${ss.length} sentences (4 at most)`);
      if (words(ss[0]).length > 12) P(where, `the hook's first sentence is ${words(ss[0]).length} words (12 at most: it is the speech bubble)`);
      if (!/[?؟]["”’»]?$/.test(hook)) P(where, "the hook doesn't end on a question: leave the gap open");
      for (const t of terms) {
        const n = norm(t.replace(/\(.*?\)/g, ""));
        if (n && new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?( |$)`).test(norm(hook))) P(where, `the hook uses the lesson's own new term "${t}"`);
      }
      if (lab && !/^[—–-]$/.test(lab) && !/^new\b/i.test(lab)) for (const l of lab.split(/\s*[,;]\s*/)) if (!labIds.has(l.replace(/`/g, ""))) N(where, `lab "${l}" is not an app in apps/web/src/labs/apps`);
    }
    const openings = hooks.map((h) => h.split(" ").slice(0, 3).join(" "));
    for (const o of new Set(openings)) if (openings.filter((x) => x === o).length > 2) N(id, `${openings.filter((x) => x === o).length} hooks open with "${o}…": vary how the course's lessons start`);
  }

  const map = section(text, "How today's courses map") ?? "";
  for (const u of unitsByTrack.get(track) ?? []) {
    if (!map.includes("`" + u.id + "`")) P("map", `\`${u.id}\` is a course file of this track but is not in "How today's courses map"`);
    if (!seen.has(u.id)) N("courses", `\`${u.id}\` has no section under "The courses"`);
  }
  return { problems, notes, tally, courses: parts.length, lessons };
}

let failed = 0;
for (const t of which) {
  const r = check(t);
  const cost = r.tally ? (r.tally.S || 0) * 0.02 + ((r.tally.R || 0) + (r.tally.N || 0)) * 0.04 : 0;
  console.log(`\n${t}: ${r.courses ?? 0} courses, ${r.lessons ?? 0} lessons, ${r.problems.length} problem(s), ${r.notes.length} note(s)` +
    (r.lessons ? ` | work ${WORK.map((w) => `${w} ${r.tally[w]}`).join(", ")} | narration about $${cost.toFixed(2)}` : ""));
  for (const p of r.problems) console.log(`  ✗ ${p}`);
  for (const n of r.notes) console.log(`  · ${n}`);
  if (r.problems.length) failed++;
}
process.exit(failed ? 1 : 0);
