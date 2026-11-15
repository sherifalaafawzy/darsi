// Wraps inline code and formulas in the Arabic text of course files in left-to-right isolates, so "[14, 74]", "check()"
// or "θ = 3" keeps its order on a right-to-left page (scripts/lib/isolates.mjs). With --fix it works every Arabic string
// out again with the current rules, mending isolates that older rules placed around half a piece of code or across a
// line break; without it, it only lists what would change. Course packs (content/packs, printed in the course-pack PDF)
// are course files too.
//   node scripts/isolate-code.mjs [--fix] [<unit id>…]   (default: every file in content/units and content/packs; an id
//                                                          names that unit and its course pack, if it has one)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arabicStrings, isolatesPair, reisolate } from "./lib/isolates.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = { units: join(ROOT, "content", "units"), packs: join(ROOT, "content", "packs") };
const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const ids = args.filter((a) => !a.startsWith("--"));
const unknown = ids.filter((id) => !existsSync(join(DIRS.units, `${id}.json`)) && !existsSync(join(DIRS.packs, `${id}.json`)));
if (unknown.length) { console.error(`No unit or course pack called ${unknown.join(", ")} in content/units or content/packs.`); process.exit(1); }
const show = (s) => s.replace(/[⁦⁧⁨]/g, "[").replace(/⁩/g, "]").replace(/\n/g, "⏎");
let found = 0;
const per = [];
for (const [kind, dir] of Object.entries(DIRS)) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && (!ids.length || ids.includes(basename(f, ".json"))))) {
    const file = join(dir, f);
    const data = JSON.parse(readFileSync(file, "utf8"));
    let changed = 0;
    for (const [path, text, set] of arabicStrings(data, kind === "packs" ? `pack ${basename(f, ".json")}` : undefined)) {
      if (!isolatesPair(text)) console.log(`${path}: isolates don't pair up`);
      const redo = reisolate(text);
      if (redo === text) continue;
      found++;
      changed++;
      console.log(`${path}:\n  ${show(text)}\n→ ${show(redo)}`);
      if (FIX) set(redo);
    }
    if (changed) per.push(`${kind}/${f}: ${changed}`);
    if (FIX && changed) writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}
if (per.length) console.log(`\n${per.join("\n")}`);
console.log(FIX ? `${found} strings isolated again` : `${found} strings need isolates (run with --fix)`);
