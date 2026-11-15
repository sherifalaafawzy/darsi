import { readFileSync } from "node:fs";
import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * What scripts/e2e-signed.mjs seeded and where everything listens (E2E_SIGNED_STATE): the platform admin, two
 * organizations with an admin, a teacher and two students each (one password for all), and the stand-in school provider.
 */
export interface Person { uid: string; email: string; name: string; password: string }
export interface Org { id: string; name: string; invites: { teacher: string; student: string }; admin: Person; teacher: Person; students: Person[] }
export interface State {
  web: string; fn: string; project: string; password: string;
  ports: { auth: number; firestore: number; functions: number; storage: number; oidc: number; web: number };
  oidc: { issuer: string; clientId: string; clientSecret: string; domain: string };
  boss: Person; orgs: { org1: Org; org2: Org };
}
const file = process.env.E2E_SIGNED_STATE;
if (!file) throw new Error("E2E_SIGNED_STATE is not set: run the signed-in suite with `node scripts/e2e-signed.mjs`.");
export const S: State = JSON.parse(readFileSync(file, "utf8"));

/**
 * The app's build knows only the Firestore port; it asks for Auth, Functions and Storage on the usual 9099, 5001 and
 * 9199 (src/firebase.ts, auth/ssoFlow.ts, analytics/track.ts…). This run's emulators listen elsewhere, so each request
 * is answered from the right one here, in the browser, and nothing has to listen on the usual ports (`npm run local`
 * may be using them). Top-level navigations to the provider and to the callback use their real ports and are not touched.
 */
export async function remapPorts(context: BrowserContext) {
  const to = { 9099: S.ports.auth, 5001: S.ports.functions, 9199: S.ports.storage } as const;
  for (const [from, port] of Object.entries(to)) {
    await context.route(new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${from}/`), async (route) => {
      const url = route.request().url().replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+\//, `http://127.0.0.1:${port}/`);
      try {
        const res = await route.fetch({ url });
        await route.fulfill({ response: res });
      } catch { await route.abort("connectionrefused").catch(() => {}); }
    });
  }
}

/**
 * The tour (tour/Start.tsx) opens by itself the first time each account reaches the app's navigation on a device, and
 * every test starts on a fresh device, so it covers whatever a test clicks next. Closed with its own close button
 * whenever it shows (its tests are tests/tour.test.tsx and the plain suite).
 */
export async function closeTour(page: Page) {
  await page.addLocatorHandler(page.locator(".driver-popover"), async () => {
    await page.locator(".driver-popover-close-btn").click().catch(() => {});
  });
}

/** A second device in the same test (an admin beside a learner, a phone after a laptop): its own empty storage. */
export async function otherDevice(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: S.web, serviceWorkers: "block" });
  await remapPorts(context);
  const page = await context.newPage();
  await closeTour(page);
  return { page, close: () => context.close() };
}

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => { await remapPorts(context); await use(context); },
  page: async ({ page }, use, info) => {
    await closeTour(page);
    // A rule that refuses what the app itself asks for shows only as a console error: each is printed with its test, so
    // a run says which screen met which rule (some are expected: another organization's person page, for one).
    page.on("console", (m) => { if (m.type() === "error" && /permission|insufficient/i.test(m.text())) console.log(`  [rules] ${info.title}: ${m.text().replace(/\s+/g, " ").slice(0, 300)}`); });
    await use(page);
  },
});
export { expect };

/* ---------- The emulators, read and written as the server (rules bypassed) ---------- */

type FsValue = { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; nullValue?: null; mapValue?: { fields?: Record<string, FsValue> }; arrayValue?: { values?: FsValue[] }; timestampValue?: string };
const plain = (v: FsValue): unknown => v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : undefined) ?? v.doubleValue ?? v.timestampValue
  ?? (v.mapValue ? fromFields(v.mapValue.fields ?? {}) : v.arrayValue ? (v.arrayValue.values ?? []).map(plain) : null);
const fromFields = (f: Record<string, FsValue>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plain(v)]));
const FS = () => `http://127.0.0.1:${S.ports.firestore}/v1/projects/${S.project}/databases/(default)/documents`;
/** A document as the server sees it (the emulator's "owner" token skips the rules), or null. */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${FS()}/${path}`, { headers: { Authorization: "Bearer owner" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`read ${path}: ${r.status}`);
  return fromFields(((await r.json()) as { fields?: Record<string, FsValue> }).fields ?? {});
}
/** Profiles whose field equals a string value. */
export async function usersWhere(field: string, value: string): Promise<Array<{ uid: string } & Record<string, unknown>>> {
  const r = await fetch(`${FS()}:runQuery`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "users" }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } } } }),
  });
  const rows = (await r.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
  return rows.filter((x) => x.document).map((x) => ({ uid: x.document!.name.split("/").pop()!, ...fromFields(x.document!.fields ?? {}) }));
}
/** The Auth emulator's account for an address, or null. */
export async function authUser(email: string): Promise<{ localId: string; customAttributes?: string; disabled?: boolean } | null> {
  const r = await fetch(`http://127.0.0.1:${S.ports.auth}/identitytoolkit.googleapis.com/v1/projects/${S.project}/accounts:lookup`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ email: [email] }),
  });
  const j = (await r.json()) as { users?: Array<{ localId: string; customAttributes?: string; disabled?: boolean }> };
  return j.users?.[0] ?? null;
}

/* ---------- In the app ---------- */

/** Signs in with an email (or username) and password on /signin and waits until the app has moved on. */
export async function signIn(page: Page, login: string, password: string, path = "/signin") {
  await page.goto(path);
  await page.getByLabel(/^(Email or username|البريد الإلكتروني أو اسم المستخدم)/).fill(login);
  await page.getByLabel(/^(Password|كلمة المرور)$/).fill(password);
  await page.getByRole("button", { name: /^(Sign in|تسجيل الدخول)$/ }).click();
  await expect(page).not.toHaveURL(/\/signin/, { timeout: 30_000 });
}

/** No sideways scroll: the page is no wider than the window. */
export async function noSidewaysScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, "the page scrolls sideways").toBeLessThanOrEqual(cw);
}
