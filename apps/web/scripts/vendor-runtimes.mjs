#!/usr/bin/env node
/**
 * Copies the code runtimes into public/lib/, where the app's darsi-lib cache serves them (cache-first, never
 * precached; TECHNICAL.md "Code on the phone"). Run it after changing either package's version, then bump the
 * folder (v1 → v2) in src/code/runtimes.ts so phones fetch the new files.
 *
 *   public/lib/python/v1/micropython.js, micropython.wasm   MicroPython (PyScript variant, settrace + ulab build)
 *   public/lib/sql/v1/sql-wasm.js, sql-wasm.wasm             sql.js (SQLite)
 *
 * MicroPython's loader is an ES module that fetches its wasm and may grow its heap to 2 GB. For the sandbox it becomes
 * a classic worker script (old phones' workers) that takes a compiled module (`instantiateWasm`, so the sandbox needs
 * no network) and stops growing at `globalThis.__mpHeapMax`, so a runaway program raises MemoryError. Each change
 * must apply exactly once, or the script stops: a new MicroPython version needs this checked again.
 *
 * Usage: node scripts/vendor-runtimes.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const mpDir = dirname(require.resolve("@micropython/micropython-webassembly-pyscript/package.json"));
const sqlDir = dirname(require.resolve("sql.js")); // its main file is dist/sql-wasm.js

let s = readFileSync(join(mpDir, "micropython.mjs"), "utf8");
const swap = (from, to, n = 1) => {
  const count = s.split(from).length - 1;
  if (count !== n) throw new Error(`micropython.mjs: expected ${n} × ${JSON.stringify(from.slice(0, 60))}, found ${count}`);
  s = s.split(from).join(to);
};
swap("if(requestedSize>2147483648)", "if(requestedSize>(globalThis.__mpHeapMax||2147483648))");
swap("Math.min(2147483648,", "Math.min(globalThis.__mpHeapMax||2147483648,");
swap("let Module={locateFile:(path,scriptDirectory)=>url||scriptDirectory+path};",
  "let Module={locateFile:(path,scriptDirectory)=>url||scriptDirectory+path,...(options.instantiateWasm?{instantiateWasm:options.instantiateWasm}:{})};");
swap("export default _createMicroPythonModule;", "");
swap("export async function loadMicroPython(", "async function loadMicroPython(");
swap("import.meta.url", "self.location.href", 4);
s = `/* MicroPython ${require(join(mpDir, "package.json")).version} (MIT), adapted by scripts/vendor-runtimes.mjs. */\n${s}\nself.loadMicroPython=loadMicroPython;\n`;

const py = join(ROOT, "public/lib/python/v1"), sql = join(ROOT, "public/lib/sql/v1");
mkdirSync(py, { recursive: true }); mkdirSync(sql, { recursive: true });
writeFileSync(join(py, "micropython.js"), s);
copyFileSync(join(mpDir, "micropython-settrace-ulab.wasm"), join(py, "micropython.wasm"));
copyFileSync(join(sqlDir, "sql-wasm.js"), join(sql, "sql-wasm.js"));
copyFileSync(join(sqlDir, "sql-wasm.wasm"), join(sql, "sql-wasm.wasm"));
const sqlVersion = JSON.parse(readFileSync(join(sqlDir, "../package.json"), "utf8")).version;
console.log(`MicroPython → ${py}\nsql.js ${sqlVersion} → ${sql}`);
