import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROMIUM_PATH || undefined;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
  webServer: { command: "npm run build && npm run preview", url: "http://localhost:4173", reuseExistingServer: true, timeout: 180_000 },
});
