import { expect, test, type Page } from "@playwright/test";
import { fakeStorage } from "./storage";

// The code steps in the real build: Python and SQL run on the phone in the sandbox (src/code/sandbox.ts), an endless
// loop is stopped without freezing the page, a program can't reach the network or storage, and guests still never
// download Firebase. The course is e2e/fixtures/code-e2e.json.
test.beforeEach(async ({ context }) => { await fakeStorage(context, ["code-e2e.json"]); });

async function onboard(page: Page) {
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
  // The test reloads next, and a reload can beat the store's async save: wait until IndexedDB has it.
  await page.waitForFunction(() => new Promise<boolean>((done) => {
    const open = indexedDB.open("keyval-store");
    open.onerror = () => done(false);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("keyval")) return (db.close(), done(false));
      const get = db.transaction("keyval").objectStore("keyval").get("darsi:state");
      get.onsuccess = () => (db.close(), done(get.result?.onboarded === true));
      get.onerror = () => (db.close(), done(false));
    };
  }));
}
const editor = (page: Page) => page.getByRole("textbox", { name: "Your code" });
const output = (page: Page) => page.getByRole("region", { name: "Output" });
async function runAndCheck(page: Page, code: string) {
  await editor(page).fill(code);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check" })).toBeEnabled();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Correct!")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
}

test("code steps run on the phone, safely: Python, an endless loop, the sandbox's walls, SQL", async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await onboard(page);
  await page.goto("/lesson/code-e2e/code-e2e-1");

  // Python: the starter prints 4; fixed, it passes its test.
  await expect(editor(page)).toHaveValue("print(2 + 2)");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(output(page).locator(".cd-out-text")).toHaveText("4");
  expect(requests.some((u) => u.endsWith("/lib/python/v1/micropython.wasm"))).toBe(true);
  await runAndCheck(page, "print(2 + 3)");

  // An endless loop: stopped at 3 seconds, while the page itself keeps answering at once.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  const t0 = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - t0).toBeLessThan(1000);
  await expect(page.getByText("Stopped after 3 seconds. Does a loop never end?")).toBeVisible({ timeout: 8000 });
  await runAndCheck(page, "n = 1\nwhile n <= 3:\n    print(n)\n    n += 1");

  // Inside the sandbox a program reaches nothing: no network, no storage, no page.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const seen = await output(page).locator(".cd-out-text").textContent();
  for (const name of ["fetch", "indexedDB", "XMLHttpRequest", "localStorage", "document"]) expect(seen).toMatch(new RegExp(`${name} (<undefined>|AttributeError)`));
  await runAndCheck(page, "print('ok')");

  // The virtual board: a loop that never ends stops at the board time, and the lamp's changes play back.
  await editor(page).fill("from machine import ADC, Pin\nimport time\nlight = ADC(26)\nlamp = Pin(15, Pin.OUT)\nwhile True:\n    lamp.value(light.read_u16() < 20000)\n    time.sleep(1)");
  await page.emulateMedia({ reducedMotion: "reduce" }); // the playback jumps to its end
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("Board time: 6 s of 6 s")).toBeVisible();
  await expect(page.locator(".cd-part").filter({ hasText: "Lamp" }).locator(".cd-part-state")).toHaveText("on");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Correct!")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Darsi's small OR-Tools, the same program as on the real one.
  await runAndCheck(page, "from ortools.sat.python import cp_model\nm = cp_model.CpModel()\na = m.new_int_var(1, 2, 'a')\nb = m.new_int_var(1, 2, 'b')\nm.add(a != b)\nm.add(a < b)\ns = cp_model.CpSolver()\nprint(s.status_name(s.solve(m)), s.value(a), s.value(b))");

  // SQL: the query's rows, in a table; graded against the solution's rows.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".cd-table tbody tr")).toHaveCount(3);
  await editor(page).fill("SELECT name FROM pupils WHERE class = '5B' ORDER BY name");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".cd-table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Correct!")).toBeVisible();

  expect(requests.filter((u) => /\/assets\/firebase-/.test(u))).toEqual([]);
  expect(requests.filter((u) => !u.startsWith("http://localhost") && !u.startsWith("https://firebasestorage.googleapis.com") && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
});
