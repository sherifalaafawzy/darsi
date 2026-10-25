// Copies CSS, tokens, fonts, icons, logos, app icons and PWA templates into dist/.
import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const r = (p) => new URL(`../${p}`, import.meta.url);
mkdirSync(r("dist"), { recursive: true });
const tokens = readFileSync(r("src/tokens/tokens.css"), "utf8");
const comps = readFileSync(r("src/styles/components.css"), "utf8");
writeFileSync(r("dist/tokens.css"), tokens);
writeFileSync(r("dist/components.css"), comps);
writeFileSync(r("dist/styles.css"), tokens + "\n" + comps);
cpSync(r("src/tokens/tokens.json"), r("dist/tokens.json"));
cpSync(r("src/tokens/tailwind-preset.cjs"), r("dist/tailwind-preset.cjs"));
for (const d of ["fonts", "icons", "logos", "app-icons"]) cpSync(r(`assets/${d}`), r(`dist/${d}`), { recursive: true });
cpSync(r("pwa"), r("dist/pwa"), { recursive: true });
console.log("assets copied to dist/");
