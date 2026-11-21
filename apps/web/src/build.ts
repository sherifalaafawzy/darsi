/**
 * Which build of the app this is, as vite.config.ts names it (`define: { __DARSI_BUILD__ }`): usage batches carry it
 * (analytics/track.ts, so errors are counted per build) and so do problem reports (bugs/Report.tsx). Startup code: it
 * imports nothing. Tests, the dev server and a config that doesn't define the constant all read "dev" (the `typeof`
 * check: an undefined global would otherwise throw).
 */
declare const __DARSI_BUILD__: string | undefined;
export const BUILD: string = typeof __DARSI_BUILD__ === "string" && __DARSI_BUILD__ ? __DARSI_BUILD__ : "dev";
