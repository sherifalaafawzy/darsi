import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
        // App shell, fonts (all scripts, ~230 KB), icons and lesson JSON are precached; kits and media are cached on demand.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2,json}"],
        // Lesson content is tiny and precached; kits are cached when a unit is downloaded. Staff-only and first-visit
        // chunks (and exceljs, ~930 KB) are not precached, so a learner's install stays small; "darsi-chunks" caches them on first use.
        globIgnores: ["kits/**", "**/exceljs*.js", "**/{Landing,OrgScreen,AdminHome,PersonDetail,AddPeople,importer,Teach,SuperAdmin,admin}-*.{js,css}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          // Hashed file names never change content, so cache-first is safe; old versions age out.
          { urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "darsi-chunks", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 864e2 } } },
          { urlPattern: ({ url }) => url.pathname.endsWith(".woff2"), handler: "CacheFirst", options: { cacheName: "darsi-fonts", expiration: { maxEntries: 20 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/content/"), handler: "StaleWhileRevalidate", options: { cacheName: "darsi-content" } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/kits/"), handler: "CacheFirst", options: { cacheName: "darsi-kits", expiration: { maxEntries: 200 } } },
          { urlPattern: ({ url }) => url.pathname.startsWith("/media/"), handler: "CacheFirst", options: { cacheName: "darsi-media", rangeRequests: true, expiration: { maxEntries: 60 } } },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
  build: { target: "es2020", sourcemap: true },
});
