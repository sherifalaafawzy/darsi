#!/usr/bin/env node
/**
 * Writes src/landing/licences.json: the third-party components that reach phones, with their licences and copyright
 * lines, and the licence texts. The /licences page (src/landing/Licences.tsx, a lazy chunk) shows it.
 *
 *   node scripts/licences.mjs          (from apps/web; run it after adding or updating a dependency that ships)
 *
 * The list below is what a build ships, read from the build's source maps (every node_modules package in
 * dist/assets/*.js.map, sw.js and workbox-*.js) plus the files that aren't bundled: the fonts, the code runtimes in
 * public/lib, and the icons in Lesson Studio's library (public/lib/v1/icons.json). tests/licences.test.ts fails
 * when a dependency in package.json has no entry here.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

/** A package's folder, wherever npm put it (this workspace's node_modules, else the root's). */
function dir(pkg) {
  const found = [join(WEB, "node_modules", pkg), join(WEB, "../../node_modules", pkg)].find((d) => existsSync(join(d, "package.json")));
  if (!found) throw new Error(`${pkg} is not installed`);
  return found;
}
const meta = (pkg) => JSON.parse(readFileSync(join(dir(pkg), "package.json"), "utf8"));
/** The copyright lines at the head of a package's licence file (none: `fallback`); licence boilerplate is skipped. */
function copyright(pkg, fallback) {
  const d = dir(pkg);
  const file = readdirSync(d).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const head = file ? readFileSync(join(d, file), "utf8").split(/\r?\n/).slice(0, 20).map((l) => l.trim()) : [];
  const lines = head.filter((l) => /^copyright\b/i.test(l) && !/notice|holders? be liable|free software foundation|on the program/i.test(l));
  if (lines.length) return lines;
  if (!fallback) throw new Error(`${pkg}: no copyright line in its licence file; give one in licences.mjs`);
  return fallback;
}
const licenceOf = (pkg) => { const l = meta(pkg).license; return typeof l === "string" ? l : l?.type; };

/**
 * group: where it ships. app = every phone (or a staff screen); code = code exercises; fonts; icons;
 * old = only phones older than Chrome 105 (the legacy build).
 */
const COMPONENTS = [
  { group: "app", name: "React", pkgs: ["react", "react-dom", "scheduler"] },
  { group: "app", name: "React Router", pkgs: ["react-router", "react-router-dom"] },
  { group: "app", name: "Firebase JavaScript SDK", pkgs: ["firebase"], fallback: ["Copyright Google LLC"] },
  { group: "app", name: "idb", pkgs: ["idb"] },
  { group: "app", name: "RE2JS", pkgs: ["re2js"] },
  { group: "app", name: "idb-keyval", pkgs: ["idb-keyval"] },
  { group: "app", name: "Capacitor", pkgs: ["@capacitor/core", "@capacitor/filesystem", "@capacitor/share", "@capacitor/synapse"] },
  { group: "app", name: "Workbox", pkgs: ["workbox-window", "workbox-core"] },
  { group: "app", name: "vite-plugin-pwa", pkgs: ["vite-plugin-pwa"] },
  { group: "app", name: "Driver.js", pkgs: ["driver.js"] },
  { group: "app", name: "modern-screenshot", pkgs: ["modern-screenshot"] },
  // Its browser build bundles these (and Node's stream and buffer modules).
  { group: "app", name: "ExcelJS", pkgs: ["exceljs"], includes: ["jszip", "pako", "readable-stream", "buffer", "events", "saxes", "dayjs", "fast-csv", "uuid"] },
  { group: "code", name: "MicroPython", pkgs: ["@micropython/micropython-webassembly-pyscript"], fallback: ["Copyright (c) 2013-2025 Damien P. George and MicroPython contributors"] },
  { group: "code", name: "sql.js", pkgs: ["sql.js"] },
  { group: "code", name: "SQLite", licence: "Public domain", copyright: ["The authors of SQLite have dedicated it to the public domain (https://sqlite.org/copyright.html)."] },
  { group: "fonts", name: "Noto Sans, Noto Sans Arabic", licence: "OFL-1.1", copyright: ["Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)"] },
  { group: "fonts", name: "Baloo 2, Baloo Bhaijaan 2", licence: "OFL-1.1", copyright: ["Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)"] },
  { group: "icons", name: "Lucide", licence: "ISC", copyright: ["Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022."] },
  { group: "icons", name: "Tabler Icons", licence: "MIT", copyright: ["Copyright (c) 2020-2024 Paweł Kuna"] },
  { group: "old", name: "core-js", pkgs: ["core-js"] },
  { group: "old", name: "SystemJS", pkgs: ["systemjs"] },
];

/** Copyright lines a licence file leaves out: pako is a port of zlib, whose authors keep theirs. */
const EXTRA = { pako: ["Copyright (C) 1995-2013 Jean-loup Gailly and Mark Adler (zlib)"] };
const entry = (c) => {
  const pkgs = c.pkgs ?? [];
  const licence = c.licence ?? licenceOf(pkgs[0]);
  const lines = c.copyright ?? [...new Set(pkgs.flatMap((p) => copyright(p, c.fallback)))];
  const includes = (c.includes ?? []).map((p) => ({ name: p, licence: licenceOf(p), copyright: [...copyright(p, [`Copyright the ${p} authors`]), ...(EXTRA[p] ?? [])] }));
  return { group: c.group, name: c.name, packages: pkgs, licence, copyright: lines, ...(includes.length ? { includes } : {}) };
};

/** Licence texts, from copies shipped in node_modules and the design system. */
const read = (pkg, file) => readFileSync(join(dir(pkg), file), "utf8").replace(/\r\n/g, "\n");
const body = (text) => text.split("\n").filter((l) => !/^\s*(copyright\b|\(the mit license\)|mit license|isc license)/i.test(l)).join("\n").trim();
const apache = read("aria-query", "LICENSE");
const zlib = read("pako", "lib/zlib/deflate.js").split("\n").slice(0, 25).filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).filter((l) => !/^\(C\)/.test(l)).join("\n").trim();
const ofl = readFileSync(join(WEB, "../../packages/design-system/assets/fonts/OFL.txt"), "utf8").replace(/\r\n/g, "\n");
const TEXTS = {
  MIT: body(read("react", "LICENSE")),
  ISC: body(read("idb", "LICENSE")),
  "Apache-2.0": apache.slice(0, apache.indexOf("END OF TERMS AND CONDITIONS") + "END OF TERMS AND CONDITIONS".length).trim(),
  // OFL.txt holds the licence once per font family: one copy is enough here.
  "OFL-1.1": ofl.slice(ofl.indexOf("SIL OPEN FONT LICENSE Version 1.1"), ofl.indexOf("\n", ofl.indexOf("OTHER DEALINGS IN THE FONT SOFTWARE."))).trim(),
  Zlib: zlib,
};

const components = COMPONENTS.map(entry);
for (const c of components) for (const l of [c.licence, ...(c.includes ?? []).map((i) => i.licence)]) {
  for (const id of l.replace(/[()]/g, "").split(/\s+(?:OR|AND)\s+/)) if (!(id in TEXTS) && id !== "Public domain" && !id.startsWith("GPL")) throw new Error(`No text for licence ${id} (${c.name})`);
}
const out = join(WEB, "src/landing/licences.json");
writeFileSync(out, `${JSON.stringify({ components, texts: TEXTS }, null, 1)}\n`);
console.log(`Wrote ${out}: ${components.length} components, ${Object.keys(TEXTS).length} licence texts.`);
if (!existsSync(out)) process.exit(1);
