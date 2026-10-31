// Wraps inline code in the Arabic text of course files in left-to-right isolates, so "[14, 74]" or "check()" keeps its
// order on a right-to-left page (scripts/lib/isolates.mjs). With --fix it works every Arabic string out again with the
// current rules, mending isolates that older rules placed around half a piece of code; without it, it only lists what
// would change.
//   node scripts/isolate-code.mjs [--fix] [<unit id>…]   (default: every file in content/units)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { arabicStrings, isolatesPair, reisolate } from "./lib/isolates.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "content", "units");
const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const ids = args.filter((a) => !a.startsWith("--"));
const files = ids.length ? ids.map((id) => `${id}.json`) : readdirSync(DIR).filter((f) => f.endsWith(".json"));
const show = (s) => s.replace(/[⁦⁧⁨]/g, "[").replace(/⁩/g, "]");
let found = 0;
for (const f of files) {
  const file = join(DIR, f);
  const unit = JSON.parse(readFileSync(file, "utf8"));
  let changed = false;
  for (const [path, text, set] of arabicStrings(unit)) {
    if (!isolatesPair(text)) console.log(`${path}: isolates don't pair up`);
    const redo = reisolate(text);
    if (redo === text) continue;
    found++;
    console.log(`${path}:\n  ${show(text)}\n→ ${show(redo)}`);
    if (FIX) { set(redo); changed = true; }
  }
  if (changed) writeFileSync(file, JSON.stringify(unit, null, 2) + "\n");
}
console.log(FIX ? `${found} strings isolated again` : `${found} strings need isolates (run with --fix)`);
