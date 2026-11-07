// @vitest-environment node
// What the phone saved for offline stays there, on the worker's side: its runtime caches (vite.config.ts) and its update
// step (public/offline-sw.js), run here against a fake worker, Cache Storage and network.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeCaches, json } from "./stubs/caches";

describe("the service worker's update step (public/offline-sw.js)", () => {
  const ORIGIN = "https://darsiai.org";
  const SW = readFileSync(join(__dirname, "../public/offline-sw.js"), "utf8");
  const MANIFEST = { v: 1, groups: {
    code: ["assets/CodeSteps-NEW00001.js", "assets/CodeSteps-NEW00002.css", "assets/sandbox-NEW00003.js"],
    "lab:bias": ["assets/lab-bias-NEW00004.js"],
    "lab:minilm": ["assets/lab-minilm-NEW00005.js"],
    "pack:code": ["assets/lessonstudio-pack-code-NEW00006.js"],
  } };
  type Group = keyof typeof MANIFEST.groups;
  function worker(net: Record<string, unknown>, offline = false) {
    const cs = fakeCaches(ORIGIN);
    const on: Record<string, (e: { waitUntil: (p: Promise<unknown>) => void }) => void> = {};
    const fetched: string[] = [];
    const fetch = async (u: string) => {
      fetched.push(u);
      if (offline) throw new TypeError("Failed to fetch");
      return u in net ? (net[u] instanceof Response ? (net[u] as Response).clone() : typeof net[u] === "string" ? new Response(net[u] as string) : json(net[u])) : new Response("", { status: 404 });
    };
    const self = { location: { origin: ORIGIN }, addEventListener: (type: string, f: (typeof on)[string]) => { on[type] = f; } };
    new Function("self", "caches", "fetch", "Response", "URL", SW)(self, cs, fetch, Response, URL);
    const fire = (type: string) => { let p: Promise<unknown> = Promise.resolve(); on[type]({ waitUntil: (x) => { p = x; } }); return p; };
    const pin = async (groups: string[]) => { await (await cs.open("darsi-saved")).put("/__darsi/pins.json", json({ v: 1, groups })); };
    return { cs, fetched, fire, pin };
  }
  const files = (...groups: Group[]) => groups.flatMap((g) => MANIFEST.groups[g].map((f) => `/${f}`)).sort();
  const served = Object.fromEntries(Object.values(MANIFEST.groups).flat().map((f) => [`/${f}`, "new"]));
  const assets = (paths: string[]) => paths.filter((p) => p.startsWith("/assets/"));

  it("fetches the new version's files for every pinned group before it takes over, then drops the old ones", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served });
    w.cs.seed("darsi-saved", ["/assets/CodeSteps-OLD00001.js", "/assets/lab-bias-OLD00004.js"]);
    await w.pin(["code", "lab:bias"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual([...files("code", "lab:bias"), "/assets/CodeSteps-OLD00001.js", "/assets/lab-bias-OLD00004.js"].sort());
    await w.fire("activate");
    expect(w.cs.paths("darsi-saved")).toEqual(["/__darsi/keep.json", "/__darsi/pins.json", ...files("code", "lab:bias")].sort());
  });

  it("\"labs\" carries every lab over", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served });
    await w.pin(["labs"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(files("lab:bias", "lab:minilm"));
  });

  it("without a connection the install fails, so the old version keeps working and keeps its files", async () => {
    const w = worker({}, true);
    w.cs.seed("darsi-saved", ["/assets/CodeSteps-OLD00001.js"]);
    await w.pin(["code"]);
    await expect(w.fire("install")).rejects.toThrow();
    expect(w.cs.paths("darsi-saved")).toEqual(["/__darsi/pins.json", "/assets/CodeSteps-OLD00001.js"]);
  });

  it("before pins existed, carries over the code steps and packs a download had cached, not every lab ever opened", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served });
    w.cs.seed("darsi-chunks", ["/assets/CodeSteps-OLD00001.js", "/assets/lessonstudio-pack-code-OLD00006.js"]);
    w.cs.seed("darsi-labs", ["/assets/lab-bias-OLD00004.js"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(files("code", "pack:code"));
    expect(await (await (await w.cs.open("darsi-saved")).match("/__darsi/pins.json"))!.json()).toEqual({ v: 1, groups: ["code", "pack:code"] });
  });

  it("does nothing on a phone that saved nothing", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST });
    await w.fire("install");
    await w.fire("activate");
    expect(w.fetched).toEqual([]);
    expect(await w.cs.has("darsi-saved")).toBe(false);
  });

  it("skips a file the server doesn't have, instead of failing every update", async () => {
    const { "/assets/sandbox-NEW00003.js": _gone, ...rest } = served;
    const w = worker({ "/offline-manifest.json": MANIFEST, ...rest });
    await w.pin(["code"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/CodeSteps-NEW00001.js", "/assets/CodeSteps-NEW00002.css"]);
  });

  it("a full phone never stops the update: it goes ahead with what fitted", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served });
    w.cs.seed("darsi-saved", ["/assets/CodeSteps-OLD00001.js"]);
    await w.pin(["code"]);
    const saved = await w.cs.open("darsi-saved");
    let room = 1;
    const open = w.cs.open;
    w.cs.open = async (n: string) => (n === "darsi-saved"
      ? { ...saved, put: async (k: string, r: Response) => { if (k.startsWith("/assets/") && room-- <= 0) throw new DOMException("full", "QuotaExceededError"); await saved.put(k, r); } }
      : open(n)) as never;
    await expect(w.fire("install")).resolves.toBeUndefined();
    w.cs.open = open;
    await w.fire("activate");
    // The new version keeps the file that fitted; the old one, useless now, leaves.
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/CodeSteps-NEW00001.js"]);
  });

  it("a list from an earlier update never decides what this one's activation deletes", async () => {
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served });
    w.cs.seed("darsi-saved", ["/assets/CodeSteps-OLD00001.js"]);
    await w.pin(["code"]);
    const saved = await w.cs.open("darsi-saved");
    await saved.put("/__darsi/keep.json", json(["/assets/lab-bias-OLD00004.js"]));
    // Nothing fits this time, not even this update's own list.
    const open = w.cs.open;
    w.cs.open = async (n: string) => (n === "darsi-saved" ? { ...saved, put: async () => { throw new DOMException("full", "QuotaExceededError"); } } : open(n)) as never;
    await w.fire("install");
    w.cs.open = open;
    await w.fire("activate");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/CodeSteps-OLD00001.js"]);
  });

  it("a list it can't read (a Wi-Fi sign-in page answering) never lets the activation delete what the phone saved", async () => {
    const w = worker({ "/offline-manifest.json": "<html>Sign in to the Wi-Fi</html>", ...served });
    w.cs.seed("darsi-saved", ["/assets/CodeSteps-OLD00001.js"]);
    await w.pin(["code"]);
    await w.fire("install");
    await w.fire("activate");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/CodeSteps-OLD00001.js"]);
  });

  it("never keeps a web page as a built file", async () => {
    const page = () => new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    const w = worker({ "/offline-manifest.json": MANIFEST, ...served, "/assets/sandbox-NEW00003.js": page() });
    await w.pin(["code"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/CodeSteps-NEW00001.js", "/assets/CodeSteps-NEW00002.css"]);
  });

  it("old phones keep every file of the Chrome 61 build they used", async () => {
    const legacy = ["assets/index-legacy-NEW00007.js", "assets/lab-bias-legacy-NEW00008.js", "assets/Plot-legacy-NEW00009.js"];
    const w = worker({ "/offline-legacy.json": { v: 1, files: legacy }, ...Object.fromEntries(legacy.map((f) => [`/${f}`, "old phone"])) });
    w.cs.seed("darsi-chunks", ["/assets/index-legacy-OLD00007.js"]);
    w.cs.seed("darsi-labs", ["/assets/lab-bias-legacy-OLD00008.js"]);
    await w.fire("install");
    expect(assets(w.cs.paths("darsi-saved"))).toEqual(["/assets/index-legacy-NEW00007.js", "/assets/lab-bias-legacy-NEW00008.js"]);
  });
});

describe("the runtime caches (vite.config.ts)", () => {
  type Hooks = { cacheWillUpdate?: (a: unknown) => Promise<Response | null>; cachedResponseWillBeUsed?: (a: unknown) => Promise<Response | null> };
  const config = () => import("../vite.config");
  const routes = async (cache: string) => (await config()).runtimeCaching.filter((r) => (r.options as { cacheName?: string } | undefined)?.cacheName === cache);
  afterEach(() => vi.unstubAllGlobals());

  it("never caps the media a download saved, and never stores media itself (streaming, a kit opened without a download)", async () => {
    const media = await routes("darsi-media");
    expect(media).toHaveLength(2);
    for (const r of media) {
      expect(r.options?.expiration).toBeUndefined();
      const [hooks] = r.options!.plugins as Hooks[];
      expect(await hooks.cacheWillUpdate!({ request: { cache: "default" }, response: new Response("x") })).toBeNull();
    }
  });

  it("serves saved media from Cloud Storage and from the local stack's emulator alike, but never unit JSON or the app's own files", async () => {
    const [, storage] = await routes("darsi-media");
    const match = (u: string) => (storage.urlPattern as (o: { url: URL }) => boolean)({ url: new URL(u) });
    expect(match("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fmedia%2Fai-d1%2Fh%2Faudio%2Fen.opus?alt=media")).toBe(true);
    expect(match("http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/content%2Fmedia%2Fai-d1%2Fh%2Faudio%2Fen.opus?alt=media")).toBe(true);
    expect(match("http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/content%2Funits%2Fai-d1%2Fv1.json?alt=media")).toBe(false);
    expect(match("https://darsiai.org/assets/index-AbCd1234.js")).toBe(false);
  });

  it("chunk caches fall back to the copies pinned in darsi-saved, after their own expiry, and don't store pinning requests twice", async () => {
    const saved = new Response("pinned");
    vi.stubGlobal("caches", { match: vi.fn(async (_r: unknown, o: { cacheName?: string; ignoreVary?: boolean }) => (o.cacheName === "darsi-saved" && o.ignoreVary ? saved : undefined)) });
    for (const name of ["darsi-labs", "darsi-chunks"]) {
      const [r] = await routes(name);
      // Workbox runs the hooks in this order: the expiry's first, so an aged-out entry still finds the pinned copy.
      expect(Object.keys(r.options!)).toEqual(["cacheName", "expiration", "plugins"]);
      const [hooks] = r.options!.plugins as Hooks[];
      const own = new Response("own");
      expect(await hooks.cachedResponseWillBeUsed!({ request: { url: "/assets/lab-bias-x.js" }, cachedResponse: own })).toBe(own);
      expect(await hooks.cachedResponseWillBeUsed!({ request: { url: "/assets/lab-bias-x.js" }, cachedResponse: null })).toBe(saved);
      expect(await hooks.cacheWillUpdate!({ request: { cache: "no-store" }, response: new Response("x") })).toBeNull();
      expect(await hooks.cacheWillUpdate!({ request: { cache: "default" }, response: new Response("x", { status: 404 }) })).toBeNull();
      expect(await hooks.cacheWillUpdate!({ request: { cache: "default" }, response: own })).toBe(own);
    }
  });

  it("its hooks still work as text, which is how workbox-build copies them into sw.js", async () => {
    const hooks = [...(await routes("darsi-labs")), ...(await routes("darsi-media"))].flatMap((r) => r.options!.plugins as Hooks[]);
    for (const h of hooks) for (const f of Object.values(h)) {
      const src = String(f);
      expect(src.startsWith("async (")).toBe(true); // an arrow function: a method would not survive `key: <text>`
      expect(typeof new Function(`return (${src});`)()).toBe("function");
    }
  });

  it("knows which built files the precache leaves out", async () => {
    const { ON_DEMAND } = await config();
    const out = (f: string) => ON_DEMAND.some((p) => p.re.test(f));
    for (const f of ["assets/lab-bias-AbCd1234.js", "assets/CodeSteps-AbCd1234.js", "assets/CodeSteps-AbCd1234.css", "assets/sandbox-AbCd1234.js", "assets/tinylm-worker-AbCd1234.js",
      "assets/lessonstudio-pack-code-AbCd1234.js", "assets/index-legacy-AbCd1234.js", "assets/polyfills-legacy-AbCd1234.js", "assets/Landing-AbCd1234.js", "assets/firebase-AbCd1234.js", "assets/firebase-extra-AbCd1234.js"]) expect(out(f)).toBe(true);
    // A startup chunk that happens to start with "firebase-" (src/firebase-config.ts) must still be precached.
    for (const f of ["assets/index-AbCd1234.js", "assets/index-AbCd1234.css", "assets/LabShell-AbCd1234.js", "assets/lessonstudio-player-AbCd1234.js", "assets/Plot-AbCd1234.js", "assets/firebase-config-AbCd1234.js"]) expect(out(f)).toBe(false);
  });

  it("leaves staff-only chunks out of the precache, whatever the bundler named them, but never one that startup loads", async () => {
    const { staffOnly } = await config();
    const src = "H:/x/apps/web/src";
    const chunk = (fileName: string, moduleIds: string[], o: { imports?: string[]; isEntry?: boolean; css?: string[] } = {}) =>
      [fileName, { type: "chunk", fileName, moduleIds, imports: o.imports ?? [], isEntry: !!o.isEntry, code: "", viteMetadata: { importedCss: new Set(o.css ?? []) } }];
    const bundle = Object.fromEntries([
      chunk("assets/index-AAAAAAAA.js", [`${src}/main.tsx`], { isEntry: true, imports: ["assets/i18n-BBBBBBBB.js", "assets/strings-STARTUP0.js"] }),
      chunk("assets/i18n-BBBBBBBB.js", [`${src}/i18n/index.tsx`]),
      // admin code that startup imports (it shouldn't, but then it must stay precached)
      chunk("assets/strings-STARTUP0.js", [`${src}/admin/strings.ts`]),
      chunk("assets/strings-CCCCCCCC.js", [`${src}/admin/data.ts`, `${src}/admin/strings.ts`, " vite/preload-helper", "H:/x/node_modules/react/index.js"]),
      chunk("assets/person-DDDDDDDD.js", [`${src}/admin/SubmissionCard.tsx`], { css: ["assets/person-EEEEEEEE.css"] }),
      chunk("assets/CourseResults-FFFFFFFF.js", [`${src}/results/CourseResults.tsx`]),
      chunk("assets/data-GGGGGGGG.js", [`${src}/results/data.ts`]),
      chunk("assets/model-HHHHHHHH.js", [`${src}/labs/apps/inject/model.ts`]),
      chunk("assets/mixed-IIIIIIII.js", [`${src}/admin/strings.ts`, `${src}/content/types.ts`], { css: ["assets/shared-JJJJJJJJ.css"] }),
      chunk("assets/Cms-KKKKKKKK.js", [`${src}/cms/Cms.tsx`], { css: ["assets/shared-JJJJJJJJ.css"] }),
      ["assets/person-EEEEEEEE.css", { type: "asset", fileName: "assets/person-EEEEEEEE.css", source: "" }],
      ["assets/shared-JJJJJJJJ.css", { type: "asset", fileName: "assets/shared-JJJJJJJJ.css", source: "" }],
    ]);
    expect([...staffOnly(bundle as never)].sort()).toEqual([
      "assets/Cms-KKKKKKKK.js", "assets/CourseResults-FFFFFFFF.js", "assets/data-GGGGGGGG.js", "assets/person-DDDDDDDD.js", "assets/person-EEEEEEEE.css", "assets/strings-CCCCCCCC.js",
    ]);
  });

  it("counts what “Save all labs” downloads: every lab's on-demand files once, compressed", async () => {
    const { labSizes } = await config();
    const big = "x".repeat(20000) + Math.random();
    const chunk = (fileName: string, facadeModuleId: string | null, imports: string[] = [], code = big) =>
      [fileName, { type: "chunk", fileName, facadeModuleId, moduleIds: [], imports, isEntry: false, code, viteMetadata: { importedCss: new Set() } }];
    const bundle = Object.fromEntries([
      chunk("assets/lab-bias-AAAAAAAA.js", "H:/x/src/labs/apps/bias/index.tsx", ["assets/Plot-BBBBBBBB.js", "assets/tinylm-CCCCCCCC.js"]),
      chunk("assets/lab-evals-DDDDDDDD.js", "H:/x/src/labs/apps/evals/index.tsx", ["assets/tinylm-CCCCCCCC.js"]),
      chunk("assets/Plot-BBBBBBBB.js", null), // precached: already on the phone
      chunk("assets/tinylm-CCCCCCCC.js", null),
    ]);
    const { total, labs } = labSizes(bundle as never);
    const one = (await import("node:zlib")).gzipSync(big).length;
    expect(labs).toEqual({ bias: 2 * one, evals: 2 * one });
    expect(total).toBe(3 * one); // the shared Darsi Tiny chunk once; far less than the 60 KB of raw code
  });

  it("no longer ships the dev catalog or the cache-clearing page", () => {
    expect(existsSync(join(__dirname, "../public/content/dev-catalog.json"))).toBe(false);
    expect(existsSync(join(__dirname, "../public/clear-sw.html"))).toBe(false);
  });
});
