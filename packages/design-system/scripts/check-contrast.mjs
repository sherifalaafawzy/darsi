// WCAG contrast check for the text/background pairs the brand book promises. Exits 1 on any failure.
import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync(new URL("../src/tokens/tokens.json", import.meta.url), "utf8"));
const m = Object.fromEntries(t.color.tokens.map((x) => [x.name, x]));
const val = (n, th) => { const v = typeof m[n].value === "string" ? m[n].value : m[n].value[th] ?? m[n].value.light; return v.startsWith("{") ? val(v.slice(1, -1), th) : v; };
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const text = (fg, bgs) => bgs.split(" ").map((bg) => [fg, bg, 4.5]);
const pairs = [
  ...text("ink", "paper surface surface-sunk kola-soft sunbird-soft lagoon-soft hibiscus-soft correct-soft wrong-soft kola sunbird lagoon hibiscus"),
  ...text("ink-muted", "paper surface surface-sunk"), ...text("kola-deep", "paper surface kola-soft"),
  ...text("sunbird-ink", "sunbird-soft surface paper"), ...text("lagoon-ink", "lagoon-soft surface paper"), ...text("hibiscus-ink", "hibiscus-soft surface paper"),
  ...text("correct", "surface paper correct-soft"), ...text("wrong", "surface paper wrong-soft"), ["ink-inverse", "ink", 4.5],
  ...["paper", "surface", "surface-sunk"].map((b) => ["line-strong", b, 3]), ...["paper", "surface", "kola-soft", "sunbird-soft", "lagoon-soft", "hibiscus-soft"].map((b) => ["focus", b, 3]),
];
let fail = 0;
for (const th of t.color.themes.map((x) => x.id)) for (const [a, b, min] of pairs) {
  const need = th === "sunlight" && min === 4.5 ? 7 : min, r = ratio(val(a, th), val(b, th));
  if (r < need) { fail++; console.log(`FAIL ${th}: ${a} on ${b} = ${r.toFixed(2)} (needs ${need})`); }
}
console.log(fail ? `${fail} failing pairs` : `All ${pairs.length * t.color.themes.length} pairs pass (4.5:1 Day, 7:1 Sunlight, 3:1 borders/focus).`);
process.exit(fail ? 1 : 0);
