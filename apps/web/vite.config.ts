import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { transformAsync } from "@babel/core";
import { defineConfig, type Plugin, type Rolldown } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

/** labs/apps/<id>/index.tsx → its own chunk "lab-<id>-<hash>.js" (src/labs/loader.tsx), cached when opened. */
const LAB_ENTRY = /labs[\\/]apps[\\/]([\w-]+)[\\/]index\.tsx$/;

/**
 * Chunks the precache leaves out (globIgnores is made from this list): each is fetched the first time it is needed and
 * kept by a runtime cache, or saved with a downloaded course (offline-manifest.json below). `re` matches the same files.
 */
// WorkBody: the project card's body and its styles, shared by the staff screens and /results (admin/WorkBody.tsx).
const LAZY_SCREENS = ["Landing", "OrgScreen", "AdminHome", "PersonDetail", "AddPeople", "importer", "Teach", "SuperAdmin", "admin", "Cms", "competencies", "Analytics", "OrgReport", "OrgsAdmin", "Super", "Plans", "Upgrade", "Tutor", "Report", "Tour", "Licences", "WorkBody"];
export const ON_DEMAND: { glob: string; re: RegExp }[] = [
  { glob: "**/exceljs*.js", re: /(?:^|\/)exceljs[^/]*\.js$/ },
  // The Firebase SDK (firebase, firebase-extra: Functions, Storage, Messaging) and src/firebase.ts: "firebase-" and the
  // 8-character hash only, so a startup chunk that happens to be named firebase-config is still precached.
  { glob: "**/firebase-{????????,extra-????????}.{js,css}", re: /(?:^|\/)firebase-(?:extra-)?[\w-]{8}\.(?:js|css)$/ },
  // Staff-only and first-visit screens.
  { glob: `**/{${LAZY_SCREENS.join(",")}}-*.{js,css}`, re: new RegExp(`(?:^|/)(?:${LAZY_SCREENS.join("|")})-[^/]*\\.(?:js|css)$`) },
  // Each lab app (~5–20 KB) is cached when first opened, or all at once with "Save all labs for offline".
  { glob: "**/lab-*.js", re: /(?:^|\/)lab-[^/]*\.js$/ },
  // The code steps and their sandbox load with the first lesson that has code (or when such a unit is downloaded).
  { glob: "**/{CodeSteps,sandbox}-*.{js,css}", re: /(?:^|\/)(?:CodeSteps|sandbox)-[^/]*\.(?:js|css)$/ },
  // Darsi Tiny: the page side that labs share, and its worker; the model (lib/tinylm) is fetched on first use.
  { glob: "**/tinylm-*.js", re: /(?:^|\/)tinylm-[^/]*\.js$/ },
  // The light player's technology packs (equations and networks, code, circuits…): with the first lesson that
  // draws one, or when a course that has one is downloaded (Downloads).
  { glob: "**/lessonstudio-pack-*.js", re: /(?:^|\/)lessonstudio-pack-[^/]*\.js$/ },
  // The Chrome 61 build. Modern phones never request it; darsi-chunks keeps a copy once an old phone does.
  { glob: "**/*-legacy*", re: /-legacy/ },
];

type Out = Rolldown.OutputBundle;
/** Staff code: the admin, results, course editor and organization screens, which learners never open. */
const STAFF_SRC = /[\\/]src[\\/](?:admin|results|cms|org)[\\/]/;
/**
 * The built files that hold nothing but staff code and that startup never loads (they are not statically reachable from
 * the entry), with the CSS that only they use. The bundler names a shared chunk after one of its modules ("strings",
 * "data", "person"…), so LAZY_SCREENS can't list them by name; the precache leaves these out as well (manifestTransforms).
 */
export function staffOnly(bundle: Out): Set<string> {
  const chunks = Object.values(bundle).filter((f): f is Rolldown.OutputChunk => f.type === "chunk");
  const startup = new Set<string>();
  const walk = (file: string) => {
    if (startup.has(file)) return;
    startup.add(file);
    const f = bundle[file];
    if (f?.type === "chunk") f.imports.forEach(walk);
  };
  for (const c of chunks) if (c.isEntry) walk(c.fileName);
  const out = new Set<string>();
  for (const c of chunks) {
    if (startup.has(c.fileName)) continue;
    const own = c.moduleIds.filter((id) => !id.startsWith("\0") && !/[\\/]node_modules[\\/]/.test(id));
    if (own.length && own.every((id) => STAFF_SRC.test(id))) out.add(c.fileName);
  }
  const users = new Map<string, string[]>();
  for (const c of chunks) {
    const css = (c as { viteMetadata?: { importedCss?: Iterable<string> } }).viteMetadata?.importedCss ?? [];
    for (const f of css) users.set(f, [...(users.get(f) ?? []), c.fileName]);
  }
  for (const [css, by] of users) if (!startup.has(css) && by.every((f) => out.has(f))) out.add(css);
  return out;
}
/** plugin-legacy's second output, the Chrome 61 build (on demand as a whole: "-legacy" above). */
const isLegacyBundle = (bundle: Out) => Object.values(bundle).some((f) => f.type === "chunk" && f.isEntry && f.fileName.includes("-legacy"));
/** This build's staff-only files (filled by staffFiles(), before the manifests below and the service worker use them). */
let staff = new Set<string>();
const staffFiles = (): Plugin => ({
  name: "darsi-staff-files",
  apply: "build",
  generateBundle(_, bundle) { if (!isLegacyBundle(bundle)) staff = staffOnly(bundle); },
});
const onDemand = (file: string) => staff.has(file) || ON_DEMAND.some((p) => p.re.test(file));
/** The offline group a chunk starts: the code steps, one lab, or one light-lesson technology pack. */
function groupOf(c: Rolldown.OutputChunk): string | undefined {
  const id = c.facadeModuleId ?? "";
  const lab = LAB_ENTRY.exec(id)?.[1];
  if (lab) return `lab:${lab}`;
  if (/[\\/]src[\\/]code[\\/]CodeSteps\.tsx$/.test(id)) return "code";
  const pack = /lessonstudio-pack-([a-z]+)\.js$/.exec(id)?.[1];
  return pack ? `pack:${pack}` : undefined;
}
/**
 * Every on-demand file a group needs: its chunk, the chunks it imports, their CSS and the files named in their code (the
 * Darsi Tiny worker), leaving out what the precache already has. Its own chunk first. The app's entry (and so the
 * startup files) is never followed: it is in the precache, and it names every lazy chunk.
 */
function closure(bundle: Out, start: string): string[] {
  const seen = new Set<string>(), out = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const f = bundle[file];
    if (!f || (f.type === "chunk" && f.isEntry)) return;
    if (onDemand(file)) out.add(file);
    if (f.type !== "chunk") return;
    const meta = (f as { viteMetadata?: { importedCss?: Iterable<string>; importedAssets?: Iterable<string> } }).viteMetadata;
    for (const x of [...(meta?.importedCss ?? []), ...(meta?.importedAssets ?? [])]) if (bundle[x] && onDemand(x)) out.add(x);
    for (const m of f.code.matchAll(/assets\/[\w.-]+\.(?:js|css)/g)) if (bundle[m[0]]?.type === "asset") visit(m[0]);
    for (const i of f.imports) visit(i);
  };
  visit(start);
  return [start, ...[...out].filter((f) => f !== start).sort()];
}
/**
 * offline-manifest.json (precached, a few KB): the files of each offline group of this build, so a downloaded course and
 * "Save all labs" keep exactly what they need in "darsi-saved" (platform/offline.ts), and a new version fetches its
 * own copies before it takes over (public/offline-sw.js). offline-legacy.json (not precached; only old phones read it):
 * every file of the Chrome 61 build, which those phones keep as they use it.
 */
const offlineManifest = (): Plugin => {
  let legacyFiles: string[] = [];
  const isLegacy = isLegacyBundle;
  return {
    name: "darsi-offline-manifest",
    apply: "build",
    // plugin-legacy writes the legacy output first (and drops other assets from it): note its files once they are final.
    writeBundle(_, bundle) { if (isLegacy(bundle)) legacyFiles = Object.keys(bundle).filter((f) => f.startsWith("assets/") && !f.endsWith(".map")).sort(); },
    generateBundle(_, bundle) {
      if (isLegacy(bundle)) return;
      const groups: Record<string, string[]> = {};
      for (const f of Object.values(bundle)) {
        const g = f.type === "chunk" ? groupOf(f) : undefined;
        if (g) groups[g] = closure(bundle, f.fileName);
      }
      this.emitFile({ type: "asset", fileName: "offline-manifest.json", source: JSON.stringify({ v: 1, groups }) });
      if (legacyFiles.length) this.emitFile({ type: "asset", fileName: "offline-legacy.json", source: JSON.stringify({ v: 1, files: legacyFiles }) });
    },
  };
};
/**
 * labs-manifest.json: what "Save all labs for offline" downloads, in bytes over the wire, so the button can show MB
 * before downloading (brand book). It is tiny and precached; the lab chunks themselves are not.
 */
export function labSizes(bundle: Out): { total: number; labs: Record<string, number> } {
  // What each lab adds to the phone: its own chunk and the on-demand files it needs (closure: the shared lab files, the
  // sandbox, Darsi Tiny's code…), each counted once in the total, gzipped (Hosting's brotli is a little smaller still).
  const gz = new Map<string, number>();
  const size = (file: string) => {
    let n = gz.get(file);
    if (n === undefined) {
      const f = bundle[file];
      n = f ? gzipSync(f.type === "chunk" ? f.code : f.source).length : 0;
      gz.set(file, n);
    }
    return n;
  };
  const labs: Record<string, number> = {}, all = new Set<string>();
  for (const f of Object.values(bundle)) {
    const id = f.type === "chunk" && f.facadeModuleId ? LAB_ENTRY.exec(f.facadeModuleId)?.[1] : undefined;
    if (!id) continue;
    const files = closure(bundle, f.fileName);
    labs[id] = files.reduce((s, x) => s + size(x), 0);
    for (const x of files) all.add(x);
  }
  return { total: [...all].reduce((s, x) => s + size(x), 0), labs };
}
const labsManifest = (): Plugin => ({
  name: "darsi-labs-manifest",
  apply: "build",
  generateBundle(_, bundle) {
    // plugin-legacy builds a second output. Emit the manifest once, from the modern one: the legacy pass
    // would try to write the same file name again.
    if (isLegacyBundle(bundle)) return;
    this.emitFile({ type: "asset", fileName: "labs-manifest.json", source: JSON.stringify(labSizes(bundle)) });
  },
});

/**
 * MicroPython and sql.js in public/lib are classic scripts, so the legacy build does not rewrite them.
 * Chrome 61–79 cannot parse their ?. and ??. This writes a Chrome 61 copy next to each one.
 */
const RUNTIME_SOURCES = ["lib/python/v1/micropython.js", "lib/sql/v1/sql-wasm.js"];
const RUNTIME_SHIM = 'if(typeof globalThis==="undefined"){self.globalThis=self;}\n';
const legacyRuntimes = (): Plugin => {
  const cache = new Map<string, Promise<string>>();
  let outDir = "";
  let wrote = false;
  const render = (rel: string) => {
    let hit = cache.get(rel);
    if (!hit) {
      hit = (async () => {
        const code = readFileSync(fileURLToPath(new URL(`./public/${rel}`, import.meta.url)), "utf8");
        const out = await transformAsync(code, {
          babelrc: false,
          configFile: false,
          browserslistConfigFile: false,
          sourceType: "script",
          compact: true,
          presets: [["@babel/preset-env", { targets: { chrome: "61" }, modules: false, bugfixes: true }]],
        });
        if (!out?.code) throw new Error(`Could not transpile ${rel} for Chrome 61`);
        return RUNTIME_SHIM + out.code;
      })();
      cache.set(rel, hit);
    }
    return hit;
  };
  return {
    name: "darsi-legacy-runtimes",
    configResolved(config) { outDir = config.build.outDir; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        const rel = path.startsWith("/") ? path.slice(1) : path;
        const source = RUNTIME_SOURCES.find((f) => rel === f.replace(/\.js$/, ".legacy.js"));
        if (!source) return next();
        try {
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.end(await render(source));
        } catch (err) { next(err instanceof Error ? err : new Error(String(err))); }
      });
    },
    // Write beside the public copies. emitFile during the legacy output did not land in outDir.
    async closeBundle() {
      if (wrote || !outDir) return;
      wrote = true;
      for (const rel of RUNTIME_SOURCES) {
        const dest = join(outDir, rel.replace(/\.js$/, ".legacy.js"));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, await render(rel));
      }
    },
  };
};

/** Register the service worker as soon as the page is parsed. workbox-window stays a later dynamic import (the update toast). */
const earlySw = (): Plugin => ({
  name: "darsi-early-sw",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      if (html.includes('serviceWorker.register("/sw.js")')) return html;
      return html.replace("</body>", '<script>if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js")</script></body>');
    },
  },
});

// The push handlers (public/push-sw.js, ~3 KB, no imports) run inside Workbox's sw.js through importScripts. The content
// hash in the URL changes sw.js whenever they change, so browsers install the update and never reuse a stale HTTP-cached copy.
const pushSw = `push-sw.js?v=${createHash("sha256").update(readFileSync(new URL("./public/push-sw.js", import.meta.url))).digest("hex").slice(0, 10)}`;
// The same for public/offline-sw.js: a new version fetches its own copies of what the phone saved before it takes over.
const offlineSw = `offline-sw.js?v=${createHash("sha256").update(readFileSync(new URL("./public/offline-sw.js", import.meta.url))).digest("hex").slice(0, 10)}`;

/**
 * Workbox plugin hooks for the chunk caches. They are copied into sw.js as text, so they may use only the worker's own
 * globals. A copy pinned in "darsi-saved" (what a downloaded course or "Save all labs" needs; platform/offline.ts)
 * answers when the cache itself has none, or only one past its age; and the page's own pinning requests
 * (cache: "no-store") are not stored a second time here.
 */
const savedCopies = {
  cachedResponseWillBeUsed: async ({ request, cachedResponse }: { request: Request; cachedResponse?: Response | null }) =>
    cachedResponse || (await caches.match(request, { cacheName: "darsi-saved", ignoreVary: true })) || null,
  cacheWillUpdate: async ({ request, response }: { request: Request; response: Response }) =>
    (request.cache === "no-store" || response.status !== 200 ? null : response),
};
/** Media and kits: only a download (platform cacheUrls) stores them, and only Remove deletes them. */
const downloadsOnly = { cacheWillUpdate: async () => null };

/** The service worker's runtime caches (exported for tests/offline-sw.test.ts). */
export const runtimeCaching: NonNullable<NonNullable<VitePWAOptions["workbox"]>["runtimeCaching"]> = [
  // Lab apps have their own cache, so 48 of them never push other chunks out of "darsi-chunks" (40 entries).
  // `expiration` before `plugins`: a saved copy (savedCopies) also answers for an entry that has aged out.
  { urlPattern: ({ url }) => url.pathname.startsWith("/assets/lab-") && url.pathname.endsWith(".js"), handler: "CacheFirst", options: { cacheName: "darsi-labs", expiration: { maxEntries: 150, maxAgeSeconds: 120 * 864e2 }, plugins: [savedCopies] } },
  // Hashed file names never change content, so cache-first is safe; old versions age out. What a downloaded
  // course needs is pinned in "darsi-saved" instead, which nothing ages out (platform/offline.ts).
  { urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "darsi-chunks", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 864e2 }, plugins: [savedCopies] } },
  // ignoreVary: the page itself stores fonts here (platform/fonts.ts), and a CSS font request differs from its fetch()
  // in headers a server may Vary on (Origin); font files are hashed and immutable, so any copy is the right one.
  // Only real fonts are cached: Hosting answers a font path that no longer exists with index.html and a 200.
  { urlPattern: ({ url }) => url.pathname.endsWith(".woff2"), handler: "CacheFirst", options: { cacheName: "darsi-fonts", matchOptions: { ignoreVary: true }, cacheableResponse: { statuses: [200], headers: { "content-type": "font/woff2" } }, expiration: { maxEntries: 20 } } },
  { urlPattern: ({ url }) => url.pathname.startsWith("/content/"), handler: "StaleWhileRevalidate", options: { cacheName: "darsi-content" } },
  { urlPattern: ({ url }) => url.pathname.startsWith("/kits/"), handler: "CacheFirst", options: { cacheName: "darsi-kits", expiration: { maxEntries: 200 } } },
  // Lesson Studio's shared library (cast, icons) for light lessons: a few small, versioned files kept for good.
  { urlPattern: ({ url }) => url.pathname.startsWith("/lib/"), handler: "CacheFirst", options: { cacheName: "darsi-lib", cacheableResponse: { statuses: [200] } } },
  // Videos, captions, light lessons and kits (Cloud Storage, or /media/): served from darsi-media once the unit is
  // downloaded. Only the download stores them (platform cacheUrls) and only Remove deletes them: no entry cap and
  // no writes from here, so a fourth course never pushes out the first one's files, and streaming or opening a kit
  // without a download stores nothing. Authored unit JSON is handled by content/load.ts, not here.
  { urlPattern: ({ url }) => url.pathname.startsWith("/media/"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, plugins: [downloadsOnly] } },
  // Storage objects by their path (/v0/b/<bucket>/o/…), whatever the host: firebasestorage.googleapis.com, and the
  // emulator on the local stack (npm run local), so offline media can be checked there too.
  { urlPattern: ({ url }) => /^\/v0\/b\/[^/]+\/o\//.test(url.pathname) && !url.pathname.endsWith(".json"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, plugins: [downloadsOnly] } },
];

// The service worker answers every page from its precached index.html, with the headers Hosting sent when it was cached
// (Permissions-Policy decides whether the tutor may use the microphone). Hosting's headers go into index.html's revision,
// so changing them alone is a new version that installed phones fetch, even when the build is otherwise the same.
const hostHeaders = createHash("sha256").update(JSON.stringify(JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8")).hosting.headers)).digest("hex").slice(0, 10);

/**
 * Dev only: serve content/units/*.json at /content/dev/<id>.json so new courses can be read before they are published,
 * and the list of them, content/dev-catalog.json, at /content/dev-catalog.json (it is never shipped or precached).
 */
function devUnits(): Plugin {
  const units = fileURLToPath(new URL("../../content/units", import.meta.url));
  const catalog = fileURLToPath(new URL("../../content/dev-catalog.json", import.meta.url));
  return {
    name: "dev-units",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (url === "/content/dev-catalog.json" && existsSync(catalog)) {
          res.setHeader("Content-Type", "application/json");
          return res.end(readFileSync(catalog));
        }
        const m = url.match(/^\/content\/dev\/([a-z0-9-]+)\.json$/);
        if (!m) return next();
        const file = join(units, `${m[1]}.json`);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(file));
      });
    },
  };
}

/** Dev only: serve content/media at /media/ so a lesson's light video and MP4 play before they are published. */
/** Dev only: serve content/kits at /kits/ so classroom kits download before publish. */
function devKits(): Plugin {
  const root = resolve(fileURLToPath(new URL("../../content/kits", import.meta.url)));
  const types: Record<string, string> = { ".pdf": "application/pdf", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".mp4": "video/mp4" };
  return {
    name: "dev-kits",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        if (!url.startsWith("/kits/")) return next();
        const rel = url.slice("/kits/".length);
        if (!rel || rel.includes("..")) return next();
        const file = resolve(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        res.setHeader("Content-Length", statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
  };
}
function devMedia(): Plugin {
  const root = resolve(fileURLToPath(new URL("../../content/media", import.meta.url)));
  const types: Record<string, string> = { ".mp4": "video/mp4", ".vtt": "text/vtt; charset=utf-8", ".json": "application/json", ".opus": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif" };
  return {
    name: "dev-media",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        if (!url.startsWith("/media/")) return next();
        const rel = url.slice("/media/".length);
        if (!rel || rel.includes("..")) return next();
        const file = resolve(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        const stat = statSync(file);
        const type = types[extname(file)] ?? "application/octet-stream";
        res.setHeader("Content-Type", type);
        res.setHeader("Accept-Ranges", "bytes");
        const range = req.headers.range;
        const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
        if (!m) {
          res.setHeader("Content-Length", stat.size);
          createReadStream(file).pipe(res);
          return;
        }
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        if (start > end || end >= stat.size) { res.statusCode = 416; res.end(); return; }
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        res.setHeader("Content-Length", end - start + 1);
        createReadStream(file, { start, end }).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    staffFiles(), // before the two manifests and the service worker, which use what it finds
    labsManifest(),
    offlineManifest(),
    VitePWA({
      registerType: "prompt", // new versions wait for the teacher to tap Reload (UpdateToast)
      injectRegister: false,
      includeAssets: ["favicon.svg", "app-icons/*.png"],
      manifest: {
        name: "Darsi — درسي",
        short_name: "Darsi",
        description: "Practical training in AI, programming, data, IoT and cyber security for teachers and their students: short lessons and classroom kits in English and Arabic, even offline.",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        lang: "en",
        theme_color: "#f2f2f2",
        background_color: "#f2f2f2",
        categories: ["education"],
        icons: [
          { src: "/app-icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/app-icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/app-icons/app-icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/app-icons/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          // No "monochrome" purpose: Chrome before 96 rejects that token with "found icon with no valid purpose"
          // and then refuses to install. Themed icons can come back when the oldest phones we support know it.
        ],
        shortcuts: [
          { name: "Continue learning", url: "/?source=shortcut" },
          { name: "Downloads", url: "/downloads?source=shortcut" },
        ],
      },
      workbox: {
        // Web push: the `push` and `notificationclick` handlers. The browser stores imported scripts with the worker,
        // so push-sw.js is not precached as well. offline-sw.js: what the phone saved for offline survives updates.
        importScripts: [pushSw, offlineSw],
        // App shell, icons and lesson JSON are precached; kits and media are cached on demand. Fonts are not (every script
        // is ~240 KB): "darsi-fonts" below holds the faces pages use, and platform/fonts.ts fills it for the page language.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,json}"],
        // Lesson content is tiny and precached; kits are cached when a unit is downloaded. Staff-only and first-visit
        // chunks (and exceljs, ~930 KB), labs, code steps, Darsi Tiny, the light packs and the Chrome 61 build are not
        // precached (ON_DEMAND above), so a learner's install stays small; the runtime caches below keep them on first use.
        globIgnores: ["kits/**", "lib/**", "push-sw.js", "offline-sw.js", ...ON_DEMAND.map((p) => p.glob)],
        navigateFallback: "/index.html",
        // Staff-only shared chunks, which no name pattern can catch (staffOnly), leave the precache here.
        manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !staff.has(e.url)).map((e) => (e.url === "index.html" ? { ...e, revision: `${e.revision}-${hostHeaders}` } : e)), warnings: [] })],
        // /__/ is Firebase Hosting's own (the sign-in helper page /__/auth/handler opens in the Google popup, since the
        // auth domain is the site's own). Answering it with the app made Google sign-in hang.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching,
      },
      devOptions: { enabled: false },
    }),
    // Modern phones (Chrome 105+, which has import.meta.resolve) keep the es2020 build. Older ones, down to Chrome 61,
    // load the transpiled chunks and the polyfill file. modernPolyfills stays off so the modern startup graph does not grow.
    legacy({
      targets: ["chrome >= 61", "firefox >= 60", "safari >= 11.1", "ios >= 11.3", "edge >= 79"],
      modernPolyfills: false,
      polyfills: true,
      additionalLegacyPolyfills: [fileURLToPath(new URL("./src/polyfills/legacy.js", import.meta.url)).replace(/\\/g, "/")],
    }),
    legacyRuntimes(),
    earlySw(),
    devUnits(),
    devMedia(),

    devKits(),
  ],
  server: { port: 5173, host: true },
  build: {
    // No JS target here: plugin-legacy sets the modern one (es2020 and Chrome 105+).
    // cssTarget must be set, or the plugin lowers CSS to Chrome 61 and corrupts unicode-range (U+0000-00FF
    // becomes U+??) and rewrites logical margins into a broken :lang() hack. Chrome 69+ already understands
    // the logical properties the styles use.
    cssTarget: "chrome111",
    sourcemap: true,
    rolldownOptions: {
      output: {
        // "firebase-" names only the SDK's chunks (the e2e guard for guests looks for them): src/firebase-config.ts, plain
        // settings that startup shares with lazy chunks, gets a name of its own when the bundler splits it out.
        chunkFileNames: (chunk) => {
          const id = chunk.facadeModuleId ? LAB_ENTRY.exec(chunk.facadeModuleId)?.[1] : undefined;
          if (id) return `assets/lab-${id}-[hash].js`;
          return chunk.name === "firebase-config" ? "assets/app-config-[hash].js" : "assets/[name]-[hash].js";
        },
        // The Firebase SDK in named chunks that load only at sign-in (src/fb.ts); globIgnores keeps them out of the
        // precache, so guests never download them. Functions, Storage and Messaging (+ Installations, which only
        // Messaging uses) are separate: only admin actions, uploads and turning notifications on need them, so signing in
        // never downloads them.
        codeSplitting: {
          groups: [
            // Core first, so shared internals (@firebase/app, util, component, idb…) land here and not in the extra chunk.
            { name: "firebase", test: /node_modules[\\/](?:@firebase[\\/](?!functions|storage|messaging|installations)|firebase[\\/](?!functions|storage|messaging|installations)|re2js[\\/]|idb[\\/])/, priority: 2 },
            { name: "firebase-extra", test: /node_modules[\\/](?:@firebase|firebase)[\\/](?:functions|storage|messaging|installations)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
