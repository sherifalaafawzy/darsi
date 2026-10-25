#!/usr/bin/env node
/**
 * Darsi CSS lint: `npm run lint:css` checks every app stylesheet; `node scripts/check-css.mjs <file.css> [--own a,b] [--prefix x-]` checks one.
 * Enforces the brand book and old-phone rules (Darsi runs on cheap Android phones, in Arabic and English):
 *  - one owner per class (OWNERS below) and every owned class has a rule
 *  - logical properties only (RTL): no physical left/right anywhere
 *  - colours only from design tokens (no hex, rgb/hsl, named colours, color-mix or gradients); every var(--x) must exist
 *  - depth only from var(--shadow-*); no blur filters or backdrop-filter (expensive on old phones)
 *  - light theme only (no dark mode); no letter-spacing or uppercase (they break Arabic)
 *  - nothing Chrome 87 WebViews lack: CSS nesting, :has(), container queries, @layer, subgrid
 *  - no bare element selectors (they leak into design-system components); no fonts under 12px
 * Reduced motion is global: the design system sets animation/transition: none under prefers-reduced-motion: reduce.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = path.join(ROOT, "apps/web/src/styles");
const APP_CSS = path.join(ROOT, "apps/web/src/app.css");
const DS_CSS = path.join(ROOT, "packages/design-system/dist/styles.css");

/** Which stylesheet owns which classes. Add a class here when you add it to a screen. */
export const OWNERS = {
  base: { own: ["panel", "tiles", "tile", "ok", "err", "err-text", "row-gap", "form-grid", "span2", "file-pick", "avatar", "sm", "person-link", "pill", "pill-warn", "wide", "table-tools", "table-wrap", "data-table", "num", "no-print", "cap-code", "cap-label"] },
  layout: { own: ["app-shell", "app-main", "app-float", "nav-rail", "rail-brand", "rail-item", "is-active", "rail-sep", "nav-bottom"] },
  admin: { own: ["admin-cols", "code-row", "cov-row", "cov-bar", "req", "req-facts"] },
  person: { own: ["person", "person-head", "person-stats", "person-cols", "cap-groups", "cap-group", "cap-row", "cap-meter", "cap-word", "course", "course-head", "done", "submission", "sub-text", "badge-ok", "status"], prefix: ["is-", "status-"] },
  people: { own: ["add-rows", "add-row", "map-grid", "map-row", "row-err", "slips", "slip"] },
  auth: { own: ["auth-shell", "auth-card", "auth-brand", "auth-links"] },
  landing: { own: ["landing", "lp-actions", "lp-band", "lp-brand", "lp-checks", "lp-cta", "lp-ctas", "lp-faq", "lp-feature", "lp-float-card", "lp-footer", "lp-grid2", "lp-grid3", "lp-h2-sm", "lp-hero", "lp-hero-art", "lp-hero-text", "lp-kicker", "lp-lang", "lp-lead", "lp-levels", "lp-links", "lp-nav", "lp-note", "lp-phone", "lp-phone-body", "lp-phone-top", "lp-proof", "lp-section", "lp-split", "lp-stat", "lp-stats", "lp-std", "lp-step-n", "lp-steps", "lp-track", "lp-tracks", "lp-why"], prefix: ["lp-track-"] },
  lesson: { own: ["reading", "key-terms", "project-card", "onb"] },
};

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const esc = (c) => c.replace(/[-]/g, "\\-");
const appSheets = () => [...(fs.existsSync(STYLES) ? fs.readdirSync(STYLES).filter((f) => f.endsWith(".css")).map((f) => path.join(STYLES, f)) : []), APP_CSS].filter((f) => fs.existsSync(f));

export function check(file, own = [], prefixes = []) {
  const css = strip(fs.readFileSync(file, "utf8"));
  const problems = [];
  const lineOf = (i) => css.slice(0, i).split("\n").length;
  const flag = (re, msg) => { for (const m of css.matchAll(re)) problems.push(`L${lineOf(m.index)}: ${msg}: ${m[0].trim().slice(0, 60)}`); };

  flag(/(?:^|[;{\s])(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)(?:-[a-z]+)?\s*:/gm, "physical left/right property (use *-inline-start/end)");
  flag(/(?:^|[;{\s])(?:left|right)\s*:/gm, "physical left/right offset (use inset-inline-start/end)");
  flag(/text-align\s*:\s*(?:left|right)\b/g, "text-align left/right (use start/end)");
  flag(/float\s*:\s*(?:left|right)\b/g, "float left/right (use inline-start/end)");
  flag(/border-(?:top|bottom)-(?:left|right)-radius/g, "physical corner radius (use border-start-start-radius …)");
  flag(/#[0-9a-fA-F]{3,8}\b/g, "hex colour (use a design token)");
  flag(/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/g, "raw colour function (use a design token)");
  flag(/color-mix\(/g, "color-mix() (unsupported on old WebViews; use a -soft token)");
  flag(/:\s*(?:white|black|red|blue|green|orange|yellow|gray|grey|pink|purple)\b/g, "named colour (use a design token)");
  flag(/box-shadow\s*:(?!\s*(?:none|var\(--shadow-[a-z-]+\))\s*(?:!important)?\s*[;}])[^;}]+/g, "box-shadow must be none or var(--shadow-*) (hard offset only, no blur)");
  flag(/(?:backdrop-)?filter\s*:[^;}]*blur\(/g, "blur filter (expensive on old phones; brand: no blur)");
  flag(/backdrop-filter\s*:/g, "backdrop-filter (expensive on old phones)");
  flag(/prefers-color-scheme\s*:\s*dark/g, "dark mode (the app is light theme only)");
  flag(/letter-spacing\s*:\s*(?!0\b|normal\b)[^;}]+/g, "letter-spacing (breaks Arabic joining)");
  flag(/text-transform\s*:\s*uppercase/g, "uppercase (sentence case everywhere; Arabic has no case)");
  flag(/:has\(/g, ":has() (unsupported on old WebViews)");
  flag(/@container\b|\bcq[whib]\b|container-type\s*:/g, "container queries (unsupported on old WebViews)");
  flag(/@layer\b/g, "@layer (unsupported on old WebViews)");
  flag(/\bsubgrid\b/g, "subgrid (unsupported on old WebViews)");
  flag(/gradient\(/g, "gradient (brand: no gradients)");
  flag(/font-size\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?px/g, "font-size under 12px");

  // Nesting and bare element selectors.
  const stack = []; const re = /([^{};]*)\{|\}/g; let m;
  while ((m = re.exec(css))) {
    if (m[0] === "}") { stack.pop(); continue; }
    const head = m[1].trim(), parent = stack[stack.length - 1];
    if (parent && !parent.startsWith("@")) problems.push(`L${lineOf(m.index)}: nested rule inside "${parent.slice(0, 30)}" (native CSS nesting is unsupported on old WebViews)`);
    const inFrames = stack.some((h) => /^@(?:keyframes|font-face|page)/.test(h));
    if (!head.startsWith("@") && !inFrames)
      for (const part of head.split(",").map((p) => p.trim()).filter(Boolean))
        if (!/[.[]/.test(part) && !/^(?:html|body|#root|:root)\b/.test(part) && !/^(?:from|to|\d+%)$/.test(part))
          problems.push(`L${lineOf(m.index)}: bare element selector "${part.slice(0, 40)}" (scope it under one of your classes)`);
    stack.push(head);
  }

  // Every var(--x) must exist in the design system or an app stylesheet.
  const pool = [fs.existsSync(DS_CSS) ? fs.readFileSync(DS_CSS, "utf8") : "", ...appSheets().map((f) => fs.readFileSync(f, "utf8"))];
  const known = new Set(pool.flatMap((t) => [...t.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((x) => x[1])));
  if (fs.existsSync(DS_CSS)) for (const x of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) if (!known.has(x[1])) problems.push(`L${lineOf(x.index)}: unknown token var(${x[1]})`);

  // Ownership.
  for (const c of own) if (!new RegExp(`\\.${esc(c)}(?![\\w-])`).test(css)) problems.push(`missing rule for owned class .${c}`);
  for (const p of prefixes) if (!new RegExp(`\\.${esc(p)}[a-z]`).test(css)) problems.push(`missing rules for prefix .${p}*`);
  for (const s of appSheets().filter((f) => path.resolve(f) !== path.resolve(file))) {
    const other = strip(fs.readFileSync(s, "utf8"));
    for (const c of own) if (new RegExp(`(?:^|[,{}]\\s*)\\.${esc(c)}(?![\\w-])[^,{}]*[,{]`, "m").test(other)) problems.push(`.${c} is also defined in ${path.basename(s)} (one owner per class: ${path.basename(file)})`);
  }
  return problems;
}

const report = (file, problems, owned) => {
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  if (problems.length) { console.log(`✗ ${path.relative(ROOT, file)} (${kb} KB): ${problems.length} problem(s)`); problems.forEach((p) => console.log("  - " + p)); return false; }
  console.log(`✓ ${path.relative(ROOT, file)} (${kb} KB)${owned ? `, ${owned} owned classes` : ""}`);
  return true;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, ...rest] = process.argv.slice(2);
  const arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? (rest[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean) : []; };
  let ok = true;
  if (file) ok = report(file, check(file, arg("--own"), arg("--prefix")), arg("--own").length);
  else for (const f of appSheets()) {
    const o = OWNERS[path.basename(f, ".css")];
    ok = report(f, check(f, o?.own ?? [], o?.prefix ?? []), o?.own.length) && ok;
  }
  process.exit(ok ? 0 : 1);
}
