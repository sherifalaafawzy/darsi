import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROMIUM_PATH || undefined;
// Its own port, and never a server that is already there: `npm run local`, `npm run preview` and other sessions serve on
// 4173, and reusing one of them would test that build instead of this tree. A busy port fails the run instead
// (--strictPort, reuseExistingServer false); E2E_PORT picks another.
const port = Number(process.env.E2E_PORT || 4180);
const url = `http://localhost:${port}`;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: url, trace: "retain-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
  webServer: { command: `npm run build && npx vite preview --port ${port} --strictPort`, url, reuseExistingServer: false, timeout: 300_000 },
});
