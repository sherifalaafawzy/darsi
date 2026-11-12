import { existsSync } from "node:fs";
import { expect, test, webkit, type Page } from "@playwright/test";
import { fakeStorage } from "./storage";

// iPhones: every browser on one is Safari's engine, and the rest of the suite runs in Chromium only. These four repeat
// app.spec.ts's onboarding, lesson, Arabic and sign-in tests for the "webkit-phone" project (playwright.config.ts runs
// only tests tagged @smoke there, and keeps this file out of the Chromium projects, which run the originals).
// Change a flow in app.spec.ts and here together.

// Before the hook below (which opens the browser): a machine without WebKit skips these instead of failing. CI never
// skips them: it installs the browsers, and a missing one there is a broken pipeline, not a reason to pass.
test.skip(({ browserName }) => browserName === "webkit" && !process.env.CI && !existsSync(webkit.executablePath()),
  "WebKit is not downloaded on this machine: npx playwright install webkit");

test.beforeEach(async ({ context }) => { await fakeStorage(context); });

async function onboard(page: Page, lang: "English" | "العربية" = "English") {
  await page.goto("/");
  await page.getByRole("button", { name: /Continue without an account|المتابعة دون حساب/ }).click();
  await page.getByRole("radio", { name: new RegExp(lang) }).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("radio").first().click(); // a teacher
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("radio").first().click(); // teaching at a primary school
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("button", { name: /Skip the check|تخطَّ الاختبار/ }).click();
}
/** Uncaught errors on the page: Safari is where a syntax or API the others have goes missing. */
function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test("onboarding → home shows the published AI unit @smoke", async ({ page }) => {
  const errors = pageErrors(page);
  await onboard(page);
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("#boot-fallback")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a lesson opens, and its first step can be answered from the transcript @smoke", async ({ page }) => {
  const errors = pageErrors(page);
  await onboard(page);
  await page.getByRole("button", { name: "Start" }).first().click();
  // The test course's video file is not published. WebKit finds that out as the step opens, and the lesson shows the
  // transcript and its question by itself (the fallback app.spec.ts reaches by tapping play); Chromium waits for a tap,
  // so where the question has not come after a few seconds the transcript is opened by hand, as a learner would.
  const question = page.getByRole("radio", { name: "False" });
  const byItself = await question.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
  if (!byItself) await page.getByRole("button", { name: "Transcript" }).click();
  await question.click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).first().click();
  await expect(page.locator(".lesson-bar").getByRole("button", { name: "Continue" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("Arabic switches the whole app to RTL @smoke", async ({ page }) => {
  const errors = pageErrors(page);
  await onboard(page, "العربية");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "أساسيات الذكاء الاصطناعي للمعلمين" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the sign-in screen loads Firebase on demand @smoke", async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  // The Google button waits for the SDK (a sign-in popup must open straight from the tap).
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/assets\/firebase-/.test(e.name)))).toBe(true);
  expect(errors).toEqual([]);
});
