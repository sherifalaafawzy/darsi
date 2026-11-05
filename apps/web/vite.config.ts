import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";

/** labs/apps/<id>/index.tsx → its own chunk "lab-<id>-<hash>.js" (src/labs/loader.tsx), cached when opened. */
const LAB_ENTRY = /labs[\\/]apps[\\/]([\w-]+)[\\/]index\.tsx$/;
/**
 * labs-manifest.json: the download size of every lab, so "Save all labs for offline" can show MB before downloading
 * (brand book). It is tiny and precached; the lab chunks themselves are not.
 */
const labsManifest = (): Plugin => ({
  name: "darsi-labs-manifest",
  apply: "build",
  generateBundle(_, bundle) {
    const labs: Record<string, number> = {};
    for (const f of Object.values(bundle)) {
      const id = f.type === "chunk" && f.facadeModuleId ? LAB_ENTRY.exec(f.facadeModuleId)?.[1] : undefined;
      if (id && f.type === "chunk") labs[id] = Buffer.byteLength(f.code);
    }
    // plugin-legacy builds a second output. Emit the manifest once, from the modern one: the legacy pass
    // would try to write the same file name again.
    if (Object.values(bundle).some((f) => f.type === "chunk" && f.fileName.includes("-legacy"))) return;
    this.emitFile({ type: "asset", fileName: "labs-manifest.json", source: JSON.stringify({ total: Object.values(labs).reduce((a, b) => a + b, 0), labs }) });
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

// The service worker answers every page from its precached index.html, with the headers Hosting sent when it was cached
// (Permissions-Policy decides whether the tutor may use the microphone). Hosting's headers go into index.html's revision,
// so changing them alone is a new version that installed phones fetch, even when the build is otherwise the same.
const hostHeaders = createHash("sha256").update(JSON.stringify(JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8")).hosting.headers)).digest("hex").slice(0, 10);

/** Dev only: serve content/units/*.json at /content/dev/<id>.json so new courses can be read before they are published. */
function devUnits(): Plugin {
  const units = fileURLToPath(new URL("../../content/units", import.meta.url));
  return {
    name: "dev-units",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
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
function devMedia(): Plugin {
  const root = resolve(fileURLToPath(new URL("../../content/media", import.meta.url)));
  const types: Record<string, string> = { ".mp4": "video/mp4", ".vtt": "text/vtt; charset=utf-8", ".json": "application/json", ".opus": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav" };
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
    labsManifest(),
    VitePWA({
      registerType: "prompt", // new versions wait for the teacher to tap Reload (UpdateToast)
      injectRegister: false,
      includeAssets: ["favicon.svg", "app-icons/*.png"],
      manifest: {
        name: "Darsi — درسي",
        short_name: "Darsi",
        description: "Five-minute lessons in AI, IoT and cyber security for teachers — in your own language, offline.",
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
        // so push-sw.js is not precached as well.
        importScripts: [pushSw],
        // App shell, icons and lesson JSON are precached; kits and media are cached on demand. Fonts are not (every script
        // is ~240 KB): "darsi-fonts" below holds the faces pages use, and platform/fonts.ts fills it for the page language.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,json}"],
        // Lesson content is tiny and precached; kits are cached when a unit is downloaded. Staff-only and first-visit
        // chunks (and exceljs, ~930 KB) are not precached, so a learner's install stays small; "darsi-chunks" caches them on first use.
        // firebase-* covers firebase-extra (Functions, Storage, Messaging) too.
        globIgnores: ["kits/**", "lib/**", "push-sw.js", "**/exceljs*.js", "**/{Landing,OrgScreen,AdminHome,PersonDetail,AddPeople,importer,Teach,SuperAdmin,admin,firebase,Cms,competencies,Analytics,OrgReport,OrgsAdmin,Super,Plans,Upgrade,Tutor,Report}-*.{js,css}",
          // Each lab app (~5–20 KB) is cached when first opened, or all at once with "Save all labs for offline".
          "**/lab-*.js",
          // The code steps and their sandbox load with the first lesson that has code (or when such a unit is downloaded).
          "**/{CodeSteps,sandbox}-*.{js,css}",
          // Darsi Tiny: the page side that labs share, and its worker; the model (lib/tinylm) is fetched on first use.
          "**/tinylm-*.js",
          // The light player's technology packs (equations and networks, code, circuits…): with the first lesson that
          // draws one, or when a course that has one is downloaded (Downloads, prefetchLightPacks).
          "**/lessonstudio-pack-*.js",
          // The Chrome 61 build. Modern phones never request it; darsi-chunks keeps a copy once an old phone does.
          "**/*-legacy*"],
        navigateFallback: "/index.html",
        manifestTransforms: [async (entries) => ({ manifest: entries.map((e) => (e.url === "index.html" ? { ...e, revision: `${e.revision}-${hostHeaders}` } : e)), warnings: [] })],
        // /__/ is Firebase Hosting's own (the sign-in helper page /__/auth/handler opens in the Google popup, since the
        // auth domain is the site's own). Answering it with the app made Google sign-in hang.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          // Lab apps have their own cache, so 48 of them never push other chunks out of "darsi-chunks" (40 entries).
          { urlPattern: ({ url }) => url.pathname.startsWith("/assets/lab-") && url.pathname.endsWith(".js"), handler: "CacheFirst", options: { cacheName: "darsi-labs", expiration: { maxEntries: 150, maxAgeSeconds: 120 * 864e2 } } },
          // Hashed file names never change content, so cache-first is safe; old versions age out.
          { urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "darsi-chunks", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 864e2 } } },
          // ignoreVary: the page itself stores fonts here (platform/fonts.ts), and a CSS font request differs from its fetch()
          // in headers a server may Vary on (Origin); font files are hashed and immutable, so any copy is the right one.
          // Only real fonts are cached: Hosting answers a font path that no longer exists with index.html and a 200.
          { urlPattern: ({ url }) => url.pathname.endsWith(".woff2"), handler: "CacheFirst", options: { cacheName: "darsi-fonts", matchOptions: { ignoreVary: true }, cacheableResponse: { statuses: [200], headers: { "content-type": "font/woff2" } }, expiration: { maxEntries: 20 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/content/"), handler: "StaleWhileRevalidate", options: { cacheName: "darsi-content" } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/kits/"), handler: "CacheFirst", options: { cacheName: "darsi-kits", expiration: { maxEntries: 200 } } },
          // Lesson Studio's shared library (cast, icons) for light lessons: a few small, versioned files kept for good.
          { urlPattern: ({ url }) => url.pathname.startsWith("/lib/"), handler: "CacheFirst", options: { cacheName: "darsi-lib", cacheableResponse: { statuses: [200] } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/media/"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, expiration: { maxEntries: 60 } } },
          // Videos, captions and kits uploaded in the course editor (Cloud Storage): served from darsi-media once the unit is
          // downloaded (platform cacheUrls). Streaming without a download is never stored: those responses are opaque
          // (status 0), and only 200s are cached. Authored unit JSON is handled by content/load.ts, not here.
          { urlPattern: ({ url }) => url.hostname === "firebasestorage.googleapis.com" && !url.pathname.endsWith(".json"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 60 } } },
        ],
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
        chunkFileNames: (chunk) => { const id = chunk.facadeModuleId ? LAB_ENTRY.exec(chunk.facadeModuleId)?.[1] : undefined; return id ? `assets/lab-${id}-[hash].js` : "assets/[name]-[hash].js"; },
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
