/**
 * The code runtimes in public/lib (scripts/vendor-runtimes.mjs) and what each downloads, once, the first time a lesson
 * needs it. Served cache-first from darsi-lib and never precached. A new runtime version goes in a new folder
 * (v1 → v2), so phones fetch it. Copied to functions/src/shared/ (a unit's download size counts its runtimes).
 *
 * Type-only imports, on purpose: startup code (content/load.ts) and the lazy code chunk both use this, and a value
 * imported from content/types.ts here made Rolldown split the startup bundle (TECHNICAL.md "The bundle rule").
 */
import type { CodeLang, Step } from "./types";

export const RUNTIMES: Record<CodeLang, { files: [script: string, wasm: string]; sizeMB: number }> = {
  python: { files: ["/lib/python/v1/micropython.js", "/lib/python/v1/micropython.wasm"], sizeMB: 0.29 },
  sql: { files: ["/lib/sql/v1/sql-wasm.js", "/lib/sql/v1/sql-wasm.wasm"], sizeMB: 0.34 },
};

/**
 * The runtime scripts are classic files, not part of the app bundle, and they use optional chaining and nullish
 * coalescing. Chrome 61–79 parse modules but not that syntax, so they load the transpiled copy (vite.config.ts writes it).
 * The probe is built at run time so this file, and the legacy bundle made from it, never contains those tokens.
 */
const legacyProbe = "return (1" + String.fromCharCode(63, 63) + "0)===1&&({a:1})" + String.fromCharCode(63, 46) + "a===1";
export const needsLegacySyntax = (): boolean => {
  try { return new Function(legacyProbe)() !== true; }
  catch { return true; }
};
/** The script URL this phone can parse. The wasm file is the same either way. */
export const runtimeScript = (url: string): string => (needsLegacySyntax() ? url.replace(/\.js(?=$|\?)/, ".legacy.js") : url);

/** The runtimes a lesson's steps run code in. */
export const runtimesOf = (steps: Step[]): CodeLang[] => [...new Set(steps.flatMap((s) => (s.type === "code" ? [s.lang] : [])))];
