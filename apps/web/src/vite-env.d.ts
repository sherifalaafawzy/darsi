/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** @vitejs/plugin-legacy: true in the Chrome 61 build's chunks, false in the modern build (undefined in tests). */
  readonly LEGACY?: boolean;
}

/** vite.config.ts transpiles the phone runtimes. @babel/core ships no types this tsconfig can see. */
declare module "@babel/core" {
  export function transformAsync(code: string, opts: object): Promise<{ code: string | null } | null>;
}
