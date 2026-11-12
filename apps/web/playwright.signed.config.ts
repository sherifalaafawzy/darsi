import { defineConfig, devices } from "@playwright/test";

/**
 * The signed-in browser suite (e2e/signed/*.signed.ts), against the Emulator Suite on private ports. Run it through
 * scripts/e2e-signed.mjs (`npm run e2e:signed -w @darsi/web`), which starts the emulators, seeds two organizations,
 * builds and serves the app and passes E2E_SIGNED_STATE (the seeded people and addresses). No webServer here: the
 * runner owns every process. The files are named *.signed.ts so the plain suite (playwright.config.ts, *.spec.ts) never
 * picks them up without emulators.
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;
export default defineConfig({
  testDir: "e2e/signed",
  testMatch: /\.signed\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One browser at a time, in file order: the tests share one seeded world and some change it (a removal, school
  // sign-in turned on), each with its own people.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_SIGNED_WEB || "http://localhost:4181",
    trace: "retain-on-failure",
    // The service worker would answer pages and fetches itself, out of reach of the port remapping (e2e/signed/fixtures.ts).
    serviceWorkers: "block",
    launchOptions: { executablePath },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
});
