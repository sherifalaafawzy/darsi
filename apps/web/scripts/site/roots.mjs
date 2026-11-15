/**
 * The public pages' addresses (TECHNICAL.md "Public pages"). Every static page lives under one of these first path
 * segments: the English pages under their own section name, every Arabic page under /ar/. One list, read by:
 * - the generator (build.mjs refuses to write a page anywhere else),
 * - vite.config.ts (the service worker never answers these with the app, and never precaches them),
 * - firebase.json's catch-all rewrite, which leaves them out so a page that doesn't exist is a real 404
 *   (tests/site.test.ts keeps the two in step).
 * Never add a name the app uses as a route (App.tsx): "tracks", "labs", "learn", "me"…
 */
export const SITE_URL = "https://darsiai.org";
export const PAGE_ROOTS = ["courses", "features", "why-darsi", "ar"];
/** Files the generator writes at the top of the site. */
export const ROOT_FILES = ["sitemap-pages.xml", "site-pages.json", "404.html"];
/** A path the service worker must leave to the network: /courses, /courses/…, /ar/… */
export const PAGE_PATH = new RegExp(`^/(?:${PAGE_ROOTS.join("|")})(?:/|$)`);
