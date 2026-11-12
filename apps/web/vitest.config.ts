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
  // setupFiles: longer waits for findBy… and waitFor (tests/setup.ts). retry: on CI a failed test runs once more, so one
  // slow moment on a shared runner does not fail the pipeline; locally a flaky test still shows itself the first time.
  // testTimeout: a test gets longer than one wait does (the default is 5 s, the same as the wait). With the two equal,
  // a findBy… that never passes ended as "Test timed out in 5000ms", without Testing Library's own message and the
  // page it prints, and a test with two slow waits still failed.
  test: { environment: "jsdom", globals: true, include: ["tests/**/*.test.{ts,tsx}"], setupFiles: ["tests/setup.ts"], testTimeout: 15_000, retry: process.env.CI ? 1 : 0 },
});
