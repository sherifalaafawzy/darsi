import { expect, test } from "@playwright/test";
import { fakeStorage } from "./storage";

// Old phones (Chrome 61 to 104) get a second, transpiled build (vite.config.ts, plugin-legacy), which no other test
// loads: both Chromium projects are current browsers and take the modern one. This runs the old phones' path in a
// current Chromium. It checks that the legacy build is produced, loads and renders; it cannot check that Chrome 61
// parses it (only that browser can).
//
// How an old phone gets there: the page's first inline module script (plugin-legacy's) fails on syntax the phone lacks,
// so window.__vite_is_modern_browser is never set, and the second one then loads polyfills-legacy and the legacy entry
// through SystemJS. Here the flag is made impossible to set, which takes the same branch, and every modern chunk is
// answered with an empty file, as if the phone had failed to parse it: what renders is the legacy build alone.
test.use({ serviceWorkers: "block" }); // a worker would answer for the chunks before the routes below see them

test.beforeEach(async ({ context }) => { await fakeStorage(context); });

test("the build for old phones runs: onboarding, then a lesson step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => { Object.defineProperty(window, "__vite_is_modern_browser", { get: () => false, set: () => {} }); });
  const legacy: string[] = [];
  await page.route(/\/assets\/[^/?]+\.js(?:\?.*)?$/, (route) => {
    const file = new URL(route.request().url()).pathname.split("/").pop()!;
    if (!file.includes("-legacy")) return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    legacy.push(file);
    return route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Continue without an account/ }).click();
  await page.getByRole("radio", { name: /English/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio").first().click(); // a teacher
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio").first().click(); // teaching at a primary school
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Skip the check/ }).click();
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).first().click();
  await expect(page.getByRole("button", { name: "Transcript" })).toBeVisible();

  // It was the legacy build that drew all this: SystemJS is on the page (polyfills-legacy brings it), the legacy entry
  // was fetched, and the "update your browser" card stayed away.
  expect(await page.evaluate(() => "System" in window)).toBe(true);
  expect(legacy.some((f) => /^polyfills-legacy-/.test(f))).toBe(true);
  expect(legacy.some((f) => /^index-legacy-/.test(f))).toBe(true);
  await expect(page.locator("#boot-fallback")).toBeHidden();
  expect(errors).toEqual([]);
});

// The report-only Content-Security-Policy (firebase.json) allows scripts from the site, not inline ones. Ours all live
// in files now (public/boot.js); what is left inline is plugin-legacy's own: the modern-browser check and its fallback,
// the old-Safari nomodule fix, and the SystemJS call for the legacy entry.
test("the built page has no inline script of our own, and boot.js registers the service worker", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('<script src="/boot.js" data-sw="/sw.js"></script>');
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc\s*=/.test(m[1]) || m[2].trim()).map((m) => m[2].trim());
  expect(inline.length).toBeGreaterThan(0); // plugin-legacy's: if it ever ships none, this list and the docs note want updating
  for (const code of inline) expect(code).toMatch(/__vite_is_modern_browser|vite-legacy-entry|"noModule"in/);
  expect(html).not.toContain("serviceWorker.register(");
  expect(html).not.toContain("darsi-f0685");
  const boot = await request.get("/boot.js");
  expect(boot.headers()["content-type"]).toContain("javascript");
  expect(await boot.text()).toContain("serviceWorker.register(sw)");
});
