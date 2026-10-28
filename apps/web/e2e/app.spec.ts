import { expect, test, type Page } from "@playwright/test";
import { fakeStorage } from "./storage";

// The app ships no courses: every test reads the starting course from (a stand-in for) Cloud Storage.
test.beforeEach(async ({ context }) => { await fakeStorage(context); });

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

test("onboarding → home shows the published AI unit", async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

const firebaseChunks = (page: Page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\/assets\/firebase-/.test(n)));

test("guests never download the Firebase SDK", async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole("heading", { name: "AI basics for teachers" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).first().click();
  await expect(page.getByRole("button", { name: "Transcript" })).toBeVisible();
  // Me holds the notifications panel: for a guest it explains accounts and still loads no Firebase.
  await page.goto("/me");
  await expect(page.getByText("Create an account or sign in to get friendly reminders")).toBeVisible();
  expect(await firebaseChunks(page)).toEqual([]);
});

test("Me opens without onboarding (account and sign-out always reachable on a phone)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Continue without an account/ }).click();
  await expect(page.getByRole("heading", { name: "Choose your language" })).toBeVisible();
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
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

test("Labs: cards open labs that respond", async ({ page }) => {
  await onboard(page);
  await page.getByRole("link", { name: "Labs" }).first().click();
  await expect(page.getByRole("heading", { name: "The AI ladder" })).toBeVisible();
  await page.getByRole("link", { name: /Build a better prompt/ }).first().click();
  await expect(page.getByRole("heading", { name: "Build a better prompt" })).toBeVisible();
  await page.getByRole("button", { name: "Ask the AI" }).click();
  await expect(page.getByText("Example answer")).toBeVisible();
});

test("Labs: the network playground really trains, then pauses", async ({ page }) => {
  await onboard(page);
  // Navigate inside the app: a full reload straight after onboarding can beat the store's (async) save.
  await page.getByRole("link", { name: "Labs" }).first().click();
  await page.getByRole("link", { name: /Network playground/ }).first().click();
  const round = page.locator(".lb-stats div").filter({ hasText: "Round" }).locator("dd");
  await page.getByRole("button", { name: "One step" }).click();
  await expect(round).toHaveText("1");
  await page.getByRole("button", { name: "Train" }).click();
  await expect.poll(async () => Number(await round.textContent())).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Pause" }).click();
  const stopped = await round.textContent();
  await page.waitForTimeout(500);
  await expect(round).toHaveText(stopped ?? "");
});

test("Labs: labs are not in the install, and \"Save all labs\" makes them work offline", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const labChunks = (cache: string) => page.evaluate(async (cache) => {
    const names = (await caches.keys()).filter((k) => (cache === "precache" ? k.includes("precache") : k === cache));
    return (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat().filter((u) => /\/assets\/lab-[\w-]+\.js$/.test(u)).length;
  }, cache);
  expect(await labChunks("precache")).toBe(0);
  await page.goto("/labs");
  await page.getByRole("button", { name: /Save all labs for offline \([\d.]+ MB\)/ }).click();
  await expect(page.getByText("All labs are saved on this phone")).toBeVisible();
  expect(await labChunks("darsi-labs")).toBeGreaterThanOrEqual(8);
  await context.setOffline(true);
  await page.goto("/labs/minilm");
  await expect(page.getByRole("heading", { name: "Build a tiny language model" })).toBeVisible();
  await page.getByRole("button", { name: "Write a sentence" }).click();
  await expect(page.getByText(/copied from the training text|not in the training text/)).toBeVisible();
});

// Fonts are not precached: each language keeps its own faces in "darsi-fonts" (platform/fonts.ts). Arabic needs Latin too.
const FONTS = {
  en: { families: ["Noto Sans", "Baloo 2"], files: ["baloo-2-latin-700-normal", "baloo-2-latin-800-normal", "noto-sans-latin-wght-normal"] },
  ar: {
    families: ["Noto Sans", "Baloo 2", "Noto Sans Arabic", "Baloo Bhaijaan 2"],
    files: ["baloo-2-latin-700-normal", "baloo-2-latin-800-normal", "baloo-bhaijaan-2-arabic-700-normal", "baloo-bhaijaan-2-arabic-800-normal", "noto-sans-arabic-arabic-wght-normal", "noto-sans-latin-wght-normal"],
  },
};
/** Font files (without Vite's 8-character hash) in the fonts cache or in Workbox's precache. */
const cachedFonts = (page: Page, which: "darsi-fonts" | "precache") => page.evaluate(async (which) => {
  const names = (await caches.keys()).filter((k) => (which === "precache" ? k.includes("precache") : k === which));
  const urls = (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat();
  return urls.filter((u) => u.endsWith(".woff2")).map((u) => u.split("/").pop()!.replace(/-[\w-]{8}\.woff2$/, "")).sort();
}, which);

for (const [lang, label, heading, offline] of [
  ["en", "English", "AI basics for teachers", "You’re offline"],
  ["ar", "العربية", "أساسيات الذكاء الاصطناعي للمعلمين", "أنت غير متصل"],
] as const) {
  test(`works offline after the first visit, with its own fonts (${lang})`, async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium");
    await onboard(page, label);
    await page.evaluate(() => navigator.serviceWorker.ready);
    expect(await cachedFonts(page, "precache")).toEqual([]);
    await expect.poll(() => cachedFonts(page, "darsi-fonts")).toEqual(FONTS[lang].files);
    // Again from an empty cache, with the page already in its language when it loads (onboarding started in English).
    await page.evaluate(() => caches.delete("darsi-fonts"));
    await page.reload();
    await expect.poll(() => cachedFonts(page, "darsi-fonts")).toEqual(FONTS[lang].files);
    // A font path that no longer exists gets index.html with a 200 (Hosting and vite preview alike): never cache it as a font.
    expect(await page.evaluate(() => fetch("/assets/gone-ABCDEFGH.woff2").then((r) => r.headers.get("content-type")))).toContain("text/html");
    expect(await cachedFonts(page, "darsi-fonts")).toEqual(FONTS[lang].files);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(offline)).toBeVisible();
    // Offline, every face of this language still loads (from the cache), and no other font was cached along the way.
    const loaded = await page.evaluate(async (families) => {
      const faces: FontFace[] = [];
      document.fonts.forEach((f) => { if (families.includes(f.family.replace(/["']/g, ""))) faces.push(f); });
      return Promise.all(faces.map((f) => f.load().then(() => "ok", () => `${f.family} ${f.weight} failed`)));
    }, [...FONTS[lang].families]);
    expect(loaded).toEqual(FONTS[lang].files.map(() => "ok"));
    expect(await cachedFonts(page, "darsi-fonts")).toEqual(FONTS[lang].files);
  });
}

// The auth domain is the site's own, so Google sign-in opens /__/auth/handler here: the service worker must leave it
// to Hosting (it used to answer with the app, and the sign-in popup never finished).
test("the service worker leaves Firebase's own pages (/__/) to the server", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect((await page.goto("/learn"))!.fromServiceWorker()).toBe(true);
  expect((await page.goto("/__/auth/handler?apiKey=x&authType=signInViaPopup"))!.fromServiceWorker()).toBe(false);
});

test("an English page never downloads the Arabic or extended-Latin fonts", async ({ page }) => {
  // The landing page and the language picker show "العربية"; Me shows the picker again and "درسي" in its footer.
  await onboard(page);
  await page.getByRole("link", { name: "Me" }).first().click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  // Punctuation pasted into English lessons that the Latin files lack (U+2010/2011 hyphens, U+204F), plus invisible
  // direction and joining marks: none of them may pull in an Arabic face. Both stacks, every weight in use.
  await page.evaluate(async () => {
    for (const [family, weight] of [["var(--font-sans)", "400"], ["var(--font-display)", "700"], ["var(--font-display)", "800"]]) {
      const p = document.createElement("p");
      Object.assign(p.style, { fontFamily: family, fontWeight: weight });
      p.textContent = "AI\u2011powered, self\u2010paced \u204F Mona\u200E and\u200C\u200D tools";
      document.body.appendChild(p);
    }
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".woff2")).map((n) => n.split("/").pop()));
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.filter((f) => /arabic|latin-ext/.test(f!))).toEqual([]);
});
