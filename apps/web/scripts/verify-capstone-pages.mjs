import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173';
const tracks = ['data', 'ds', 'ai', 'agents', 'aisec', 'cyber', 'code', 'iot'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function onboard() {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue without an account/ }).click();
  await page.getByRole('radio', { name: /English/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  // who are you - first radio (teacher)
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  // teaching context
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  // tracks - select all checkboxes
  const boxes = page.getByRole('checkbox');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i);
    if (!(await b.isChecked())) await b.check();
  }
  await page.getByRole('button', { name: /Continue/ }).click();
  // reminder prefs
  await page.getByRole('radio').nth(1).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  // placement
  const begin = page.getByRole('button', { name: /Start from the beginning/ });
  if (await begin.isVisible({ timeout: 5000 }).catch(() => false)) await begin.click();
  await page.waitForURL(/learn|tracks|\//, { timeout: 15000 }).catch(() => {});
}

await onboard();
const out = [];
for (const t of tracks) {
  const unit = `${t}-capstone`;
  const lesson = `${unit}-description`;
  const url = `${base}/lesson/${unit}/${lesson}`;
  try {
    const [jsonResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/content/dev/${unit}.json`) && r.ok(), { timeout: 15000 }).catch(() => null),
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const title = await page.locator('h1, h2, .lesson-title, [class*=\"title\"]').first().innerText().catch(() => '');
    const hasDesc = /Project description|Why this capstone|What you build|Hours|Tools overview|Milestones/i.test(body);
    const hasQuizChoice = await page.locator('.dr-opt, .dr-tf, .dr-match-tile').count();
    const notFound = /not found|No published unit|Couldn.t find/i.test(body);
    out.push({
      track: t,
      url,
      jsonOk: !!jsonResp,
      hasDesc,
      quizWidgets: hasQuizChoice,
      notFound,
      title: title.slice(0, 80),
      snippet: body.replace(/\s+/g, ' ').slice(0, 220),
    });
  } catch (e) {
    out.push({ track: t, url, error: String(e).slice(0, 200) });
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
const pass = out.filter((r) => r.hasDesc && r.quizWidgets === 0 && !r.notFound && !r.error);
console.log('PASS', pass.length, '/', out.length);
