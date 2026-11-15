/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** @vitejs/plugin-legacy: true in the Chrome 61 build's chunks, false in the modern build (undefined in tests). */
  readonly LEGACY?: boolean;
}

/**
 * Which build this is, e.g. "4245d198-20261111": vite.config.ts stamps it in (`define`; buildStamp()). Read it through
 * src/build.ts, which answers "dev" where nothing defines it (the unit tests: vitest.config.ts has no `define`).
 */
declare const __DARSI_BUILD__: string | undefined;

/** vite.config.ts transpiles the phone runtimes. @babel/core ships no types this tsconfig can see. */
declare module "@babel/core" {
  export function transformAsync(code: string, opts: object): Promise<{ code: string | null } | null>;
}
