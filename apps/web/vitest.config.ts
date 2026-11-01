import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Typecheck and tests read the design-system source. The package's dist is a build artefact (postinstall),
// so a checkout that has not rebuilt it would typecheck and test the previous player.
const designSystem = fileURLToPath(new URL("../../packages/design-system/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: [
    { find: /^@darsi\/design-system$/, replacement: designSystem },
    { find: "virtual:pwa-register", replacement: fileURLToPath(new URL("./tests/stubs/pwa-register.ts", import.meta.url)) },
  ] },
  test: { environment: "jsdom", globals: true, include: ["tests/**/*.test.{ts,tsx}"] },
});
