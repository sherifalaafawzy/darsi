/**
 * Runs learners' code on the phone, safely. TECHNICAL.md "Code on the phone" has the design; in short:
 * - A hidden iframe with sandbox="allow-scripts" and srcdoc has an opaque origin: no cookies, storage or IndexedDB,
 *   so no sign-in tokens, and it can't reach the page. Its CSP blocks every network request.
 * - Inside it, one worker per language runs the runtime (public/lib, scripts/vendor-runtimes.mjs) after removing the
 *   network and storage APIs. The iframe compiles each runtime's wasm once and hands the module to every new worker.
 * - The page enforces the time limit: a program still running is stopped by ending its worker; a fresh one is ready
 *   in tens of milliseconds. Stop does the same.
 * - Nothing runs until Run. After a minute without a run everything is torn down (battery, memory).
 *
 * This module is only reached through the lazy code chunk (lesson steps with code, the course editor).
 */
import type { CodeLang } from "../content/types";
import { HEAP, OUTPUT_CAP, PYTHON_HARNESS, isOrdered, runSql, sameRows, type PythonReply, type RunRequest, type RunResult } from "./harness";
import { RUNTIMES, runtimeScript } from "../content/runtimes";
import { PY_LIB } from "./pylib";

/** A program may run this long (ms) before it is stopped. */
export const TIME_LIMIT = 3000;
const IDLE_MS = 60_000;

// The worker, after the runtime's own script. Apart from the runtime, it has only what it is given here.
const WORKER = `
if (typeof globalThis === "undefined") self.globalThis = self;
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "indexedDB", "caches", "BroadcastChannel", "Request", "Response", "Headers", "navigator", "importScripts"]) {
  try { delete self[k]; } catch (e) {}
  try { Object.defineProperty(self, k, { value: undefined, configurable: false }); } catch (e) {}
}
${sameRows.toString()}
${isOrdered.toString()}
const runSql = ${runSql.toString()};
let rt = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    const instantiateWasm = (imports, done) => { WebAssembly.instantiate(m.module, imports).then((inst) => done(inst)); return {}; };
    if (m.lang === "python") {
      self.__mpHeapMax = m.heapMax;
      rt = await loadMicroPython({ heapsize: m.heapStart, linebuffer: true, stdout: () => {}, stderr: () => {}, instantiateWasm });
      for (const [path, text] of Object.entries(m.lib)) { rt.FS.mkdirTree(path.slice(0, path.lastIndexOf("/"))); rt.FS.writeFile(path, text); }
      rt.runPython(m.harness);
    } else rt = await initSqlJs({ instantiateWasm });
    postMessage({ type: "ready" });
  } else if (m.type === "run") {
    const t0 = performance.now();
    let reply;
    try {
      if (m.lang === "python") { rt.globals.set("_req", m.req); rt.runPython("_res = _darsi_run(_req)"); reply = JSON.parse(String(rt.globals.get("_res"))); }
      else reply = { runs: [runSql(rt, JSON.parse(m.req))], heap: 0 };
    } catch (err) { reply = { runs: [], heap: Infinity, failed: String((err && err.message) || err) }; }
    postMessage({ type: "done", id: m.id, reply, ms: performance.now() - t0 });
  }
};
`;

const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'none'";
// The iframe: keeps each language's compiled module and source, and starts (or restarts) its worker on request.
const FRAME = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><script>
const langs = {};
function start(lang) {
  const L = langs[lang];
  if (L.w) { L.w.terminate(); URL.revokeObjectURL(L.url); }
  L.url = URL.createObjectURL(new Blob([L.source], { type: "text/javascript" }));
  L.w = new Worker(L.url);
  L.w.onmessage = (e) => parent.postMessage(Object.assign({}, e.data, { lang }), "*");
  L.w.onerror = (e) => parent.postMessage({ type: "error", lang, message: e.message || "worker" }, "*");
  L.w.postMessage(Object.assign({ type: "init", lang, module: L.module }, L.init));
}
onmessage = async (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m.type === "load") {
    try { langs[m.lang] = { module: await WebAssembly.compile(m.wasm), source: m.source, init: m.init }; start(m.lang); }
    catch (err) { parent.postMessage({ type: "error", lang: m.lang, message: String(err) }, "*"); }
  } else if (m.type === "run") langs[m.lang].w.postMessage(m);
  else if (m.type === "restart") start(m.lang);
};
parent.postMessage({ type: "boot" }, "*");
<\/script>`;

type Msg = { type: string; lang?: CodeLang; id?: number; reply?: PythonReply & { failed?: string }; ms?: number; message?: string };

class Sandbox {
  private frame = document.createElement("iframe");
  private waiters = new Map<string, (m: Msg) => void>();
  private booted: Promise<void>;
  private ready = new Map<CodeLang, Promise<void>>();
  private running = new Map<CodeLang, number>();
  private next = 1;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private listener = (e: MessageEvent<Msg>) => {
    if (e.source !== this.frame.contentWindow) return;
    const m = e.data;
    const key = m.type === "done" ? `done${m.id}` : `${m.type}${m.lang ?? ""}`;
    const w = this.waiters.get(key) ?? (m.type === "error" ? this.waiters.get(`ready${m.lang}`) : undefined);
    if (w) { this.waiters.delete(key); w(m); }
  };
  constructor() {
    this.frame.sandbox.add("allow-scripts");
    this.frame.hidden = true;
    this.frame.title = "code";
    addEventListener("message", this.listener);
    this.booted = this.wait("boot").then(() => {});
    this.frame.srcdoc = FRAME;
    document.body.append(this.frame);
  }
  private wait(key: string) { return new Promise<Msg>((resolve) => this.waiters.set(key, resolve)); }
  private post(m: object, transfer: Transferable[] = []) { this.frame.contentWindow?.postMessage(m, "*", transfer); }

  /** Downloads (or reads from the phone's cache) the language's runtime and starts its worker. */
  private load(lang: CodeLang): Promise<void> {
    let p = this.ready.get(lang);
    if (!p) {
      p = (async () => {
        await this.booted;
        const [script, wasm] = RUNTIMES[lang].files;
        const scriptUrl = runtimeScript(script);
        const [source, bytes] = await Promise.all([
          fetch(scriptUrl).then((r) => { if (!r.ok) throw new Error("offline"); return r.text(); }),
          fetch(wasm).then((r) => { if (!r.ok) throw new Error("offline"); return r.arrayBuffer(); }),
        ]);
        const ready = this.wait(`ready${lang}`);
        const init = lang === "python" ? { harness: PYTHON_HARNESS, lib: PY_LIB, heapStart: HEAP.start, heapMax: HEAP.max } : {};
        this.post({ type: "load", lang, wasm: bytes, source: `${source}\n${WORKER}`, init }, [bytes]);
        const m = await ready;
        if (m.type === "error") throw new Error(m.message);
      })();
      p.catch(() => this.ready.delete(lang));
      this.ready.set(lang, p);
    }
    return p;
  }
  /** Ends the language's worker and starts a fresh one. */
  private restart(lang: CodeLang) {
    const ready = this.wait(`ready${lang}`);
    this.ready.set(lang, ready.then((m) => { if (m.type === "error") throw new Error(m.message); }));
    this.post({ type: "restart", lang });
  }

  /** Gets the language ready (downloading its runtime the first time). Rejects with "offline" when it can't. */
  prepare(lang: CodeLang): Promise<void> { clearTimeout(this.idle); return this.load(lang); }
  /** Runs a program (or its tests). Rejects with "offline" when the runtime was never downloaded and there is no connection. */
  async run(req: RunRequest, limit = TIME_LIMIT): Promise<RunResult> {
    clearTimeout(this.idle);
    await this.load(req.lang);
    const id = this.next++;
    this.running.set(req.lang, id);
    const done = this.wait(`done${id}`);
    const t0 = performance.now();
    this.post({ type: "run", id, lang: req.lang, req: JSON.stringify({ ...req, cap: OUTPUT_CAP }) });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const over = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), limit); });
    const r = await Promise.race([done, over]);
    clearTimeout(timer);
    this.idle = setTimeout(disposeSandbox, IDLE_MS);
    if (this.running.get(req.lang) !== id) return { runs: [], ms: performance.now() - t0, stopped: true };
    this.running.delete(req.lang);
    if (r === "timeout") {
      this.waiters.delete(`done${id}`);
      this.restart(req.lang);
      return { runs: [], ms: performance.now() - t0, timeout: true };
    }
    const reply = r.reply!;
    if (reply.heap > HEAP.restart) this.restart(req.lang);
    return { runs: reply.runs, ms: r.ms ?? performance.now() - t0, ...(reply.failed ? { failed: reply.failed } : {}) };
  }
  /** Stops whatever is running (the learner pressed Stop). */
  stop() {
    for (const [lang, id] of this.running) {
      this.running.delete(lang);
      this.waiters.get(`done${id}`)?.({ type: "stopped" });
      this.waiters.delete(`done${id}`);
      this.restart(lang);
    }
  }
  dispose() {
    clearTimeout(this.idle);
    removeEventListener("message", this.listener);
    this.frame.remove();
  }
}

let current: Sandbox | null = null;
/** The page's sandbox, made on first use. */
export const sandbox = () => (current ??= new Sandbox());
/** Ends every worker and removes the iframe (after a minute idle, or when the code screen goes away). */
export function disposeSandbox() { current?.dispose(); current = null; }
