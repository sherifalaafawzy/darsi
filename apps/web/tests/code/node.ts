/**
 * Runs learners' code in Node with the same runtimes and harness as the phone's sandbox (src/code/harness.ts): the
 * MicroPython and sql.js npm packages that scripts/vendor-runtimes.mjs copies into public/lib. Used by the course tests
 * (every code step's solution must pass, its starter must not) and the harness tests.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { HEAP, OUTPUT_CAP, PYTHON_HARNESS, runSql, type PythonReply, type RunOne, type RunRequest } from "../../src/code/harness";
import { PY_LIB } from "../../src/code/pylib";

const require = createRequire(join(__dirname, "../../package.json"));
type MicroPython = { runPython(code: string): unknown; globals: { get(k: string): unknown; set(k: string, v: unknown): void }; FS: { mkdirTree(p: string): void; writeFile(p: string, s: string): void } };
let python: Promise<MicroPython> | null = null;
let sql: Promise<Parameters<typeof runSql>[0]> | null = null;

function loadPython(): Promise<MicroPython> {
  return (python ??= (async () => {
    const dir = dirname(require.resolve("@micropython/micropython-webassembly-pyscript/package.json"));
    // The phone's copy stops growing its heap at HEAP.max (scripts/vendor-runtimes.mjs); this one must too, or a runaway
    // program fills 2 GB before its MemoryError.
    let src = readFileSync(join(dir, "micropython.mjs"), "utf8");
    for (const [from, to] of [["if(requestedSize>2147483648)", "if(requestedSize>(globalThis.__mpHeapMax||2147483648))"], ["Math.min(2147483648,", "Math.min(globalThis.__mpHeapMax||2147483648,"]]) {
      if (src.split(from).length !== 2) throw new Error(`micropython.mjs changed: ${from}`);
      src = src.replace(from, to);
    }
    const capped = join(tmpdir(), "darsi-micropython-capped.mjs");
    writeFileSync(capped, src);
    (globalThis as { __mpHeapMax?: number }).__mpHeapMax = HEAP.max;
    // The loader starts its own REPL (reading stdin, so it hangs) when its path contains process.argv[1], which a test
    // runner's argv can: hide it while importing.
    const argv1 = process.argv[1];
    process.argv[1] = "<darsi tests>";
    const { loadMicroPython } = await import(pathToFileURL(capped).href).finally(() => { process.argv[1] = argv1; });
    const mp: MicroPython = await loadMicroPython({ url: join(dir, "micropython-settrace-ulab.wasm"), heapsize: HEAP.start, linebuffer: true, stdout: () => {}, stderr: () => {} });
    for (const [path, text] of Object.entries(PY_LIB)) { mp.FS.mkdirTree(path.slice(0, path.lastIndexOf("/"))); mp.FS.writeFile(path, text); }
    mp.runPython(PYTHON_HARNESS);
    return mp;
  })());
}
function loadSql() {
  return (sql ??= (async () => {
    const main = require.resolve("sql.js");
    const initSqlJs = require(main) as (o: { wasmBinary: Uint8Array }) => Promise<Parameters<typeof runSql>[0]>;
    return initSqlJs({ wasmBinary: readFileSync(join(dirname(main), "sql-wasm.wasm")) });
  })());
}

/** One result per test (or one run): what the phone would show. */
export async function runInNode(req: RunRequest): Promise<RunOne[]> {
  if (req.lang === "sql") return [runSql(await loadSql(), req)];
  const mp = await loadPython();
  mp.globals.set("_req", JSON.stringify({ ...req, cap: OUTPUT_CAP }));
  mp.runPython("_res = _darsi_run(_req)");
  const reply = JSON.parse(String(mp.globals.get("_res"))) as PythonReply;
  if (reply.heap > HEAP.restart) python = null; // as the phone does: a fresh interpreter next time
  return reply.runs;
}
