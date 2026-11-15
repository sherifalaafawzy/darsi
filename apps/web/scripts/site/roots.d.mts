// Types for roots.mjs (vite.config.ts and tests/site.test.ts import it).
export const SITE_URL: string;
/** First path segments of every public page: the English sections, and "ar" for every Arabic page. */
export const PAGE_ROOTS: string[];
/** Files the generator writes at the top of the build folder. */
export const ROOT_FILES: string[];
/** A path the service worker leaves to the network. */
export const PAGE_PATH: RegExp;
