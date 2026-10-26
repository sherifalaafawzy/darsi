import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The push handlers (public/push-sw.js, ~3 KB, no imports) run inside Workbox's sw.js through importScripts. The content
// hash in the URL changes sw.js whenever they change, so browsers install the update and never reuse a stale HTTP-cached copy.
const pushSw = `push-sw.js?v=${createHash("sha256").update(readFileSync(new URL("./public/push-sw.js", import.meta.url))).digest("hex").slice(0, 10)}`;

export default defineConfig({
  plugins: [
    react(),
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
          { src: "/app-icons/app-icon-monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
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
        globIgnores: ["kits/**", "push-sw.js", "**/exceljs*.js", "**/{Landing,OrgScreen,AdminHome,PersonDetail,AddPeople,importer,Teach,SuperAdmin,admin,firebase}-*.{js,css}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          // Hashed file names never change content, so cache-first is safe; old versions age out.
          { urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "darsi-chunks", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 864e2 } } },
          // ignoreVary: the page itself stores fonts here (platform/fonts.ts), and a CSS font request differs from its fetch()
          // in headers a server may Vary on (Origin); font files are hashed and immutable, so any copy is the right one.
          // Only real fonts are cached: Hosting answers a font path that no longer exists with index.html and a 200.
          { urlPattern: ({ url }) => url.pathname.endsWith(".woff2"), handler: "CacheFirst", options: { cacheName: "darsi-fonts", matchOptions: { ignoreVary: true }, cacheableResponse: { statuses: [200], headers: { "content-type": "font/woff2" } }, expiration: { maxEntries: 20 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/content/"), handler: "StaleWhileRevalidate", options: { cacheName: "darsi-content" } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/kits/"), handler: "CacheFirst", options: { cacheName: "darsi-kits", expiration: { maxEntries: 200 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/media/"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, expiration: { maxEntries: 60 } } },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
  build: {
    target: "es2020",
    sourcemap: true,
    rolldownOptions: {
      output: {
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
