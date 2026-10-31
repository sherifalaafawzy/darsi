/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** vite.config.ts transpiles the phone runtimes. @babel/core ships no types this tsconfig can see. */
declare module "@babel/core" {
  export function transformAsync(code: string, opts: object): Promise<{ code: string | null } | null>;
}
