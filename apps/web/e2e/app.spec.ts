import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page, lang: "English" | "العربية" = "English") {
  await page.goto("/");
  await page.getByRole("button", { name: /Continue without an account|المتابعة دون حساب/ }).click();
  await page.getByRole("radio", { name: new RegExp(lang) }).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();
  await page.getByRole("button", { name: /Start from the beginning|ابدأ من البداية/ }).click();
}

test("onboarding → home shows the AI unit", async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

const firebaseChunks = (page: Page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\/assets\/firebase-/.test(n)));

test("guests never download the Firebase SDK", async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).first().click();
  await expect(page.getByRole("button", { name: "Transcript" })).toBeVisible();
  expect(await firebaseChunks(page)).toEqual([]);
});

test("the sign-in screen loads Firebase on demand", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  // The Google button waits for the SDK (a sign-in popup must open straight from the tap).
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  expect((await firebaseChunks(page)).length).toBeGreaterThan(0);
});

test("Arabic switches the whole app to RTL", async ({ page }) => {
  await onboard(page, "العربية");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "أساسيات الذكاء الاصطناعي للمعلمين" })).toBeVisible();
});

test("a full lesson can be completed and unlocks the classroom kit", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Start" }).first().click();
  // Video step: read the transcript instead of streaming (low data), answer the checkpoint under it, then continue.
  await page.getByRole("button", { name: "Transcript" }).click();
  await page.getByRole("radio", { name: "False" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).first().click();
  await page.locator(".lesson-bar").getByRole("button", { name: "Continue" }).click();
  // Walk the rest: answer whatever is asked, accept feedback, until done.
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole("heading", { name: "Lesson done!" }).isVisible()) break;
    const check = page.locator(".lesson-bar").getByRole("button", { name: "Check" });
    const cont = page.locator(".lesson-bar").getByRole("button", { name: "Continue" });
    // Project step: a guest can't submit for review, so take the "do it in class" path.
    const later = page.getByRole("button", { name: "I’ll do it in class and submit later" });
    if (await later.isVisible()) {
      await expect(page.getByText("To send your work to a teacher for review, sign in")).toBeVisible();
      await later.click();
    }
    if (await check.isVisible()) {
      const opts = page.locator(".dr-opt, .dr-tf, .dr-imgopt");
      if (await opts.count()) await opts.first().click();
      const left = page.locator(".dr-match-col").first().locator(".dr-match-tile");
      const right = page.locator(".dr-match-col").nth(1).locator(".dr-match-tile");
      for (let k = 0; k < (await left.count()); k++) { await left.nth(k).click(); await right.nth(k).click(); }
      const bank = page.locator(".dr-bank-chip:not([disabled])");
      while (await bank.count()) await bank.first().click();
      const tf = page.getByLabel("Type your answer");
      if (await tf.isVisible()) await tf.fill("token");
      await check.click();
      await page.locator(".dr-sheet").getByRole("button").click();
    } else if (await cont.isEnabled()) {
      await cont.click();
    }
  }
  await expect(page.getByRole("heading", { name: "Lesson done!" })).toBeVisible();
  await page.getByRole("button", { name: "Open classroom kit" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PowerPoint" }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/slides-en\.pptx$/);
});

test("a video that cannot load falls back to the transcript instead of blocking the lesson", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Start" }).first().click();
  // No video file is published yet (and offline phones may not have it): tapping play must not leave Continue disabled forever.
  await page.locator(".dr-video-bigplay").click();
  await expect(page.getByText("Video in production — read the transcript below.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "False" })).toBeVisible();
});

test("AI lab tools respond", async ({ page }) => {
  await onboard(page);
  await page.getByRole("link", { name: "AI lab" }).click();
  await expect(page.getByRole("heading", { name: "Build a better prompt" })).toBeVisible();
  await page.getByRole("button", { name: "Ask the AI" }).click();
  await expect(page.getByText("Example answer")).toBeVisible();
});

test("works offline after the first visit", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await expect(page.getByText("You’re offline")).toBeVisible();
});
