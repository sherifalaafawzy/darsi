/* Darsi service worker template — offline-first.
 * - Precache the app shell, fonts and icons (edit SHELL to match your build output).
 * - Lessons/units are cached on demand when the teacher taps Download (see cacheUnit message).
 * - Never auto-activate: the page shows UpdateToast and posts {type:"SKIP_WAITING"} when the teacher chooses.
 * - Progress POSTs that fail offline are queued in IndexedDB-free fashion via Background Sync tag "darsi-progress"
 *   (the page re-sends its local queue when the sync event fires).
 */
const VERSION = "darsi-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/styles.css",
  "/fonts/baloo-2-latin-700-normal.woff2", "/fonts/baloo-2-latin-800-normal.woff2",
  "/fonts/noto-sans-latin-wght-normal.woff2", "/app-icons/app-icon-192.png"];
const ARABIC_FONTS = ["/fonts/baloo-bhaijaan-2-arabic-700-normal.woff2", "/fonts/baloo-bhaijaan-2-arabic-800-normal.woff2", "/fonts/noto-sans-arabic-arabic-wght-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(`${VERSION}-shell`).then((c) => c.addAll(SHELL)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "SKIP_WAITING") self.skipWaiting();
  if (msg.type === "PRECACHE_SCRIPT" && msg.script === "arabic") e.waitUntil(caches.open(`${VERSION}-shell`).then((c) => c.addAll(ARABIC_FONTS)));
  if (msg.type === "CACHE_UNIT" && Array.isArray(msg.urls)) e.waitUntil(caches.open(`${VERSION}-unit-${msg.unit}`).then((c) => c.addAll(msg.urls)));
  if (msg.type === "DELETE_UNIT") e.waitUntil(caches.delete(`${VERSION}-unit-${msg.unit}`));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // Network first, fall back to the last good answer.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(`${VERSION}-api`).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  // Cache first for static assets, lessons and media.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
self.addEventListener("sync", (e) => {
  if (e.tag === "darsi-progress") e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "FLUSH_PROGRESS" }))));
});
