import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROMIUM_PATH || undefined;
// Its own port, and never a server that is already there: `npm run local`, `npm run preview` and other sessions serve on
// 4173, and reusing one of them would test that build instead of this tree. A busy port fails the run instead
// (--strictPort, reuseExistingServer false); E2E_PORT picks another.
const port = Number(process.env.E2E_PORT || 4180);
const url = `http://localhost:${port}`;
// Its own build, of this tree: mode "e2e" reads the committed .env.e2e (public demo values), so the suite needs no
// .env.local and never tests the live project's settings, and dist-e2e leaves apps/web/dist (what a deploy uploads, and
// what other sessions are serving) alone. tsc first, as `npm run build` does.
const build = "npx tsc --noEmit && npx vite build --mode e2e --outDir dist-e2e --emptyOutDir";
// The phones' browser: the same Chromium for both projects (CHROMIUM_PATH, when Playwright's own build isn't downloaded).
const chromium = { launchOptions: { executablePath } };
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // CI: a test.only left in by mistake fails the run instead of quietly skipping the rest, and a test gets one more
  // try (the trace of the first failure is kept).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [
    // smoke.spec.ts repeats four of app.spec.ts's tests for WebKit: Chromium runs the originals.
    { name: "desktop", testIgnore: "**/smoke.spec.ts", use: { ...devices["Desktop Chrome"], ...chromium } },
    { name: "phone", testIgnore: "**/smoke.spec.ts", use: { ...devices["Pixel 7"], ...chromium } },
    // iPhones (Safari's engine): only the tests tagged @smoke. Where WebKit isn't downloaded (npx playwright install
    // webkit), they are skipped outside CI (e2e/smoke.spec.ts).
    { name: "webkit-phone", grep: /@smoke/, use: { ...devices["iPhone 13"] } },
  ],
  webServer: { command: `${build} && npx vite preview --outDir dist-e2e --port ${port} --strictPort`, url, reuseExistingServer: false, timeout: 420_000 },
});
