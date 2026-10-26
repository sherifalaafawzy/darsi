// Generates src/tokens/tokens.css, src/tokens/index.ts and tailwind-preset.cjs from src/tokens/tokens.json.
// tokens.json is the single source of truth — edit it (or the Darsi design-system page) and re-run `npm run tokens`.
import { readFileSync, writeFileSync } from "node:fs";
const t = JSON.parse(readFileSync(new URL("../src/tokens/tokens.json", import.meta.url), "utf8"));
const themes = t.color.themes.map((x) => x.id);
const first = themes[0];
const colorMap = Object.fromEntries(t.color.tokens.map((x) => [x.name, x]));
const raw = (tok, th) => (typeof tok.value === "string" ? tok.value : tok.value[th] ?? tok.value[first]);
const resolve = (tok, th, depth = 0) => {
  const v = raw(tok, th);
  if (v.startsWith("{") && depth < 16) return resolve(colorMap[v.slice(1, -1)], th, depth + 1);
  return v;
};
const cssVal = (tok, th) => { const v = raw(tok, th); return v.startsWith("{") ? `var(--${v.slice(1, -1)})` : v; };
const other = ["spacing", "radius", "size", "zIndex"].filter((k) => t[k]);
const L = [`/* ${t.name} — generated from tokens.json. Do not edit by hand: run \`npm run tokens\`. */`];
// unicode-range is the font file's subset: the Google Fonts ranges they were cut with, plus the accents and "⁴" the Latin
// files also carry (Latin is always loaded, so they never cost a download). The Arabic subset leaves out U+2010/2011 and
// U+204F: Latin's range claims them but its files lack them, so a pasted hyphen would fetch Arabic on an English page.
// Without unicode-range the browser downloads
// every face in a stack to learn what it covers: one "→" or Arabic word on an English page would fetch the Arabic fonts.
for (const f of t.type.fonts) {
  const file = f.file.replace(/^fonts\//, "");
  const range = t.type.subsets?.[f.subset];
  L.push(`@font-face { font-family: "${f.family}"; src: url("./fonts/${file}") format("woff2"); font-weight: ${f.weight}; font-style: normal; font-display: swap;${range ? ` unicode-range: ${range};` : ""} }`);
}
themes.forEach((th, i) => {
  L.push(`${i === 0 ? `:root, [data-theme="${th}"]` : `[data-theme="${th}"]`} {`);
  for (const x of t.color.tokens) L.push(`  --${x.name}: ${cssVal(x, th)};${i === 0 ? ` /* ${x.usage} */` : ""}`);
  for (const x of t.shadow?.tokens ?? []) L.push(`  --${x.name}: ${cssVal(x, th)};`);
  L.push("}");
});
L.push(":root {");
for (const k of other) for (const x of t[k].tokens) L.push(`  --${x.name}: ${x.value}; /* ${x.usage} */`);
for (const [k, v] of Object.entries(t.type.families)) L.push(`  --font-${k}: ${v};`);
for (const g of t.type.groups) for (const s of g.styles) L.push(`  --text-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${g.family});`);
L.push("}");
for (const g of t.type.groups) for (const s of g.styles)
  L.push(`.${s.name} { font-family: var(--font-${g.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};${s.letterSpacing && s.letterSpacing !== "0" ? ` letter-spacing: ${s.letterSpacing};` : ""} }`);
writeFileSync(new URL("../src/tokens/tokens.css", import.meta.url), L.join("\n") + "\n");

const colors = Object.fromEntries(themes.map((th) => [th, Object.fromEntries(t.color.tokens.map((x) => [x.name, resolve(x, th)]))]));
const shadows = Object.fromEntries(themes.map((th) => [th, Object.fromEntries((t.shadow?.tokens ?? []).map((x) => [x.name, raw(x, th)]))]));
const flat = (k) => Object.fromEntries((t[k]?.tokens ?? []).map((x) => [x.name, x.value]));
const typeStyles = Object.fromEntries(t.type.groups.flatMap((g) => g.styles.map((s) => [s.name, { fontFamily: t.type.families[g.family], fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: Number(s.fontWeight) }])));
const ts = `// Generated from tokens.json — run \`npm run tokens\`.
export const themes = ${JSON.stringify(themes)} as const;
export type ThemeId = (typeof themes)[number];
export const colors = ${JSON.stringify(colors, null, 2)} as const;
export type ColorToken = keyof (typeof colors)["${first}"];
export const shadows = ${JSON.stringify(shadows, null, 2)} as const;
export const spacing = ${JSON.stringify(flat("spacing"), null, 2)} as const;
export const radius = ${JSON.stringify(flat("radius"), null, 2)} as const;
export const size = ${JSON.stringify(flat("size"), null, 2)} as const;
export const zIndex = ${JSON.stringify(flat("zIndex"), null, 2)} as const;
export const fontFamilies = ${JSON.stringify(t.type.families, null, 2)} as const;
export const typography = ${JSON.stringify(typeStyles, null, 2)} as const;
/** CSS custom-property reference for a token, e.g. cssVar("kola") → "var(--kola)". */
export const cssVar = (name: string) => \`var(--\${name})\`;
`;
writeFileSync(new URL("../src/tokens/index.ts", import.meta.url), ts);

const tw = `// Tailwind preset generated from tokens.json. Colours point at CSS variables so themes switch at runtime.
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(Object.fromEntries(t.color.tokens.map((x) => [x.name, `var(--${x.name})`])), null, 2)},
      spacing: ${JSON.stringify(Object.fromEntries(t.spacing.tokens.map((x) => [x.name.replace("space-", ""), `var(--${x.name})`])), null, 2)},
      borderRadius: ${JSON.stringify(Object.fromEntries(t.radius.tokens.map((x) => [x.name.replace("radius-", ""), `var(--${x.name})`])), null, 2)},
      boxShadow: ${JSON.stringify(Object.fromEntries((t.shadow?.tokens ?? []).map((x) => [x.name.replace("shadow-", ""), `var(--${x.name})`])), null, 2)},
      fontFamily: { display: ["var(--font-display)"], sans: ["var(--font-sans)"] },
      zIndex: ${JSON.stringify(Object.fromEntries((t.zIndex?.tokens ?? []).map((x) => [x.name.replace("z-", ""), x.value])), null, 2)},
    },
  },
};
`;
writeFileSync(new URL("../src/tokens/tailwind-preset.cjs", import.meta.url), tw);
console.log(`tokens: ${t.color.tokens.length} colours × ${themes.length} themes, ${t.type.fonts.length} font files, ${other.map((k) => t[k].tokens.length).reduce((a, b) => a + b, 0)} other tokens`);
