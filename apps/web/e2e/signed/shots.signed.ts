import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { closeTour, expect, remapPorts, S, signIn, test, usersWhere } from "./fixtures";

/**
 * Screenshots for a visual pass over the staff screens' tabs and school sign-in (not a test of behaviour: the other
 * signed files are). Kept out of the normal run: it needs SHOTS=1, and writes full-page PNGs to SHOTS_DIR (default
 * test-results/shots) as <name>-<lang>-<width>.png, in English at 1280 px and Arabic at 375 px (the wizard also in
 * Arabic at 1280 px).
 *
 *   node scripts/e2e-signed.mjs --keep --no-tests          # the emulators, the app and the stand-in school
 *   cd apps/web && SHOTS=1 SHOTS_DIR=<folder> E2E_SIGNED_STATE=../../.emulator-tmp/e2e-signed/state.json \
 *     npx playwright test -c playwright.signed.config.ts shots
 *
 * Every run makes an organization of its own (and removes the one an earlier run made), so it can run again and again
 * on the same emulators, and it never touches the two organizations the other signed files use.
 */
const SHOTS = process.env.SHOTS === "1";
const OUT = resolve(process.env.SHOTS_DIR || join(process.cwd(), "test-results", "shots"));
const ROOT = resolve(process.cwd(), "../..");
const DAY = 86_400_000;

test.describe.configure({ mode: "serial" });
test.skip(!SHOTS, "screenshots only: run with SHOTS=1");
test.setTimeout(900_000);

/* ---------- words, to find buttons in either language ---------- */

type Lang = "en" | "ar";
const words = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), "src", file), "utf8")) as Record<string, string>;
const W: Record<Lang, Record<string, string>> = SHOTS ? {
  en: { ...words("i18n/en.json"), ...words("admin/strings/en.json"), ...words("admin/sso-strings/en.json"), ...words("auth/sso-strings/en.json") },
  ar: { ...words("i18n/ar.json"), ...words("admin/strings/ar.json"), ...words("admin/sso-strings/ar.json"), ...words("auth/sso-strings/ar.json") },
} : { en: {}, ar: {} };

/* ---------- the three windows ---------- */

interface V { key: string; lang: Lang; locale: string; width: number; height: number; mobile: boolean }
const EN: V = { key: "en-1280", lang: "en", locale: "en-US", width: 1280, height: 800, mobile: false };
const AR: V = { key: "ar-375", lang: "ar", locale: "ar-EG", width: 375, height: 800, mobile: true };
const ARW: V = { key: "ar-1280", lang: "ar", locale: "ar-EG", width: 1280, height: 800, mobile: false };
const BOTH = [EN, AR], WIZARD = [EN, AR, ARW];
const w = (v: V, key: string) => W[v.lang][key] ?? key;
const btn = (scope: Page | Locator, v: V, key: string) => scope.getByRole("button", { name: w(v, key), exact: true });

const contexts: BrowserContext[] = [];
const pages = new Map<string, Page>();
/** A window for one account (or nobody) in one language and size; kept for the whole run, so each signs in once. */
async function open(browser: Browser, v: V, who?: { email: string; password: string } | null, tag = ""): Promise<Page> {
  const key = `${v.key}|${who?.email ?? "guest"}|${tag}`;
  const had = pages.get(key);
  if (had) return had;
  const context = await browser.newContext({
    baseURL: S.web, serviceWorkers: "block", locale: v.locale, viewport: { width: v.width, height: v.height },
    ...(v.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  contexts.push(context);
  await remapPorts(context);
  const page = await context.newPage();
  await closeTour(page);
  if (who) await signIn(page, who.email, who.password);
  pages.set(key, page);
  return page;
}

/** Nothing still loading, fonts in, the pointer out of the way. */
async function ready(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(350);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => {});
  await page.mouse.move(0, 0).catch(() => {});
  // From the top: a full-page picture draws what sticks (the tab list, the rail, the bottom bar) where the page is scrolled to.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}
async function shot(page: Page, v: V, name: string) {
  await ready(page);
  await page.screenshot({ path: join(OUT, `${name}-${v.key}.png`), fullPage: true, animations: "disabled" });
}
/** Every tab of a page, each by a click on it (as a person does), named <name>-<tab id>. */
async function shootTabs(page: Page, v: V, path: string, name: string, each?: (id: string) => Promise<void>) {
  await page.goto(path);
  const list = page.getByRole("tablist").first();
  await expect(list).toBeVisible({ timeout: 30_000 });
  await ready(page);
  const ids = await list.getByRole("tab").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab") ?? ""));
  for (const id of ids) {
    await list.locator(`[data-tab="${id}"]`).click();
    await expect(list.locator(`[data-tab="${id}"]`)).toHaveAttribute("aria-selected", "true");
    await each?.(id);
    await shot(page, v, `${name}-${id}`);
  }
}

/* ---------- this run's organization ---------- */

interface Person { uid: string; email: string; name: string; password: string }
const stamp = Date.now().toString(36);
const ORG = { id: `shots-${stamp}`, name: "Nile Valley Language School" };
let admin: Person, teacher: Person, students: Person[] = [];
let slug = "";

function isoWeek(ms: number) {
  const d = new Date(ms), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7)).padStart(2, "0")}`;
}
/** A profile's summary as functions/src/summary.ts writes it: n lessons at an average score, the last one some days ago. */
function summary(n: number, acc: number, daysAgo: number) {
  const last = new Date(Date.now() - daysAgo * DAY).toISOString();
  const weeks: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const wk = isoWeek(Date.now() - (daysAgo + i * 4) * DAY); weeks[wk] = (weeks[wk] ?? 0) + 1; }
  const cyber = Math.min(5, n), ai = n - cyber, r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    lessonsDone: n, graded: n, xp: n * 60, avgAccuracy: acc, lastActive: last, lastLessonAt: last, seconds: n * 540, weeks,
    competencies: { "DC.4.2": n, "DC.1.2": Math.ceil(n / 2), "T.ET.C": Math.ceil(n / 3) },
    compAcc: { "DC.4.2": r3(n * acc), "DC.1.2": r3(Math.ceil(n / 2) * acc), "T.ET.C": r3(Math.ceil(n / 3) * acc) },
    units: { "cyber-s4": cyber, ...(ai ? { "ai-s4": ai } : {}) },
    tracks: { cyber: { n: cyber, acc: r3(cyber * acc), sec: cyber * 540, g: cyber }, ...(ai ? { ai: { n: ai, acc: r3(ai * acc), sec: ai * 540, g: ai } } : {}) },
  };
}

/** The platform admin's callables, as the app calls them. */
async function asBoss(fn: string, data: unknown) {
  const tok = await fetch(`http://127.0.0.1:${S.ports.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: S.boss.email, password: S.boss.password, returnSecureToken: true }),
  }).then((r) => r.json() as Promise<{ idToken: string }>);
  const r = await fetch(`${S.fn}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok.idToken}` }, body: JSON.stringify({ data }) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
}

/** The organization, through the Admin SDK as scripts/e2e-signed.mjs seeds its own (claims and profile agree). */
async function seed() {
  Object.assign(process.env, {
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${S.ports.auth}`, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${S.ports.firestore}`, GCLOUD_PROJECT: S.project,
  });
  const req = createRequire(join(ROOT, "functions", "package.json"));
  const { initializeApp, getApps } = req("firebase-admin/app"), { getAuth } = req("firebase-admin/auth"), { getFirestore, FieldValue } = req("firebase-admin/firestore");
  const app = getApps().find((a: { name: string }) => a.name === "shots") ?? initializeApp({ projectId: S.project }, "shots");
  const auth = getAuth(app), db = getFirestore(app);

  // An earlier run's organization goes first: the lists stay one school long however often this runs.
  for (const old of (await db.collection("orgs").get()).docs.filter((d: { id: string }) => d.id.startsWith("shots-"))) {
    for (const u of (await db.collection("users").where("orgId", "==", old.id).get()).docs) {
      await auth.deleteUser(u.id).catch(() => {});
      await db.recursiveDelete(u.ref);
    }
    for (const c of ["ssoIdentities", "ssoSlugs"]) for (const d of (await db.collection(c).where("orgId", "==", old.id).get()).docs) await d.ref.delete();
    await db.recursiveDelete(old.ref);
  }

  const person = async (email: string, name: string, role: string, extra: Record<string, unknown> = {}): Promise<Person> => {
    const u = await auth.createUser({ email, password: S.password, displayName: name, emailVerified: true });
    await auth.setCustomUserClaims(u.uid, { role, orgId: ORG.id });
    await db.doc(`users/${u.uid}`).set({ name, email, role, orgId: ORG.id, lang: "en", active: true, createdAt: FieldValue.serverTimestamp(), createdBy: "e2e-shots", ...extra });
    return { uid: u.uid, email, name, password: S.password };
  };
  const invites = { teacher: "TCHR-7KQ2-M9XA", student: "STDN-4HW8-P3LC" };
  await db.doc(`orgs/${ORG.id}`).set({ name: ORG.name, type: "school", country: "EG", city: "Cairo", status: "active", createdBy: S.boss.uid,
    createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), memberCount: 0 });
  await db.doc(`orgs/${ORG.id}/private/invites`).set(invites);
  const at = `${stamp}.shots.test`;
  admin = await person(`admin@${at}`, "Mona Farouk", "orgAdmin");
  teacher = await person(`teacher@${at}`, "Hany Lotfy", "teacher", { summary: summary(6, 0.91, 2) });
  const pupils: [string, string, ReturnType<typeof summary> | null][] = [
    ["Salma Adel", "5B", summary(9, 0.88, 1)], ["يوسف كمال", "5B", summary(7, 0.74, 3)], ["Mariam Hassan", "5B", summary(4, 0.52, 5)],
    ["Ahmed Abdel-Rahman Mostafa El-Sayed", "5B", summary(3, 0.81, 30)], ["نور الهدى عبد الله", "6A", summary(8, 0.93, 2)],
    ["Karim Nabil", "6A", summary(5, 0.67, 6)], ["Laila Mansour", "6A", null], ["Omar Tawfik", "6A", summary(2, 0.45, 9)],
  ];
  students = [];
  for (const [i, [name, group, s]] of pupils.entries()) students.push(await person(`student${i + 1}@${at}`, name, "student", { teacherId: teacher.uid, group, ...(s ? { summary: s } : {}) }));
  await db.doc(`orgs/${ORG.id}`).update({ memberCount: 2 + students.length });
  // A licence, so the dashboard has its "Super seats" tab, and two seats taken. (School sign-in may make members up
  // to 1.5 × the licence's seats: enough for the people who sign in below.)
  await asBoss("setOrgLicence", { orgId: ORG.id, seats: 40, days: 365 });
  for (const s of students.slice(0, 2)) await asBoss("setSeat", { orgId: ORG.id, uid: s.uid, on: true });
}

test.beforeAll(async () => {
  if (!SHOTS) return;
  mkdirSync(OUT, { recursive: true });
  await seed();
});
test.afterAll(async () => { for (const c of contexts) await c.close().catch(() => {}); });

/* ---------- the wizard, by its structure (the same in both languages) ---------- */

const sso = (page: Page) => page.locator("section.sso").first();
const stepButton = (page: Page, n: number) => sso(page).locator(".sso-step").nth(n - 1);
const next = (page: Page) => sso(page).locator(".sso-nav button").last();
async function toStep(page: Page, n: number) {
  const b = stepButton(page, n);
  await expect(b).toBeVisible({ timeout: 30_000 });
  if ((await b.getAttribute("aria-current")) !== "step") await b.click();
  await expect(b).toHaveAttribute("aria-current", "step");
}
async function wizard(page: Page) {
  await page.goto("/admin?tab=signin");
  await expect(stepButton(page, 1)).toBeVisible({ timeout: 30_000 });
  await ready(page);
}
/** The stand-in school's page: picks a person, and waits until Darsi has the page back. */
async function pickAtSchool(page: Page, who: string) {
  await page.waitForURL((u) => u.origin === S.oidc.issuer && u.pathname === "/authorize", { timeout: 30_000 });
  await page.getByRole("button", { name: new RegExp(`^${who}`) }).click();
  await page.waitForURL((u) => u.origin === S.web, { timeout: 30_000 });
}

/* ---------- the shots ---------- */

test("the organization's dashboard, a person's page and the report: every tab", async ({ browser }) => {
  for (const v of BOTH) {
    const page = await open(browser, v, admin);
    await shootTabs(page, v, "/admin", "admin", async (id) => { if (id === "signin") await expect(stepButton(page, 1)).toBeVisible({ timeout: 30_000 }); });
    await shootTabs(page, v, `/admin/people/${students[0].uid}`, "person");
    await shootTabs(page, v, "/admin/analytics", "report");
  }
});

test("the wizard: provider, connect (Google, Microsoft, another provider), who can sign in", async ({ browser }) => {
  for (const v of WIZARD) {
    const page = await open(browser, v, admin);
    await wizard(page);
    await toStep(page, 1);
    const radios = sso(page).locator(".sso-presets [role=radio]");
    await shot(page, v, "wizard-1-provider");
    for (const [i, name] of [[0, "google"], [1, "microsoft"]] as const) {
      await radios.nth(i).click();
      await next(page).click();
      await expect(stepButton(page, 2)).toHaveAttribute("aria-current", "step");
      await shot(page, v, `wizard-2-${name}`);
      await toStep(page, 1);
    }
    await radios.nth(4).click();
    await shot(page, v, "wizard-1-chosen");
    await next(page).click();
    await expect(stepButton(page, 2)).toHaveAttribute("aria-current", "step");
    // Next with something missing: the refusal at its field.
    await next(page).click();
    await shot(page, v, "wizard-2-oidc-missing");
    const inputs = sso(page).locator("input");
    await inputs.nth(0).fill(S.oidc.issuer);
    await inputs.nth(1).fill(S.oidc.clientId);
    await inputs.nth(2).fill(S.oidc.clientSecret);
    await btn(sso(page), v, "sa.c.check").click();
    await expect(sso(page).locator(".notice.ok")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "wizard-2-oidc");
    await next(page).click();
    await expect(stepButton(page, 3)).toHaveAttribute("aria-current", "step");
    await sso(page).locator("input").first().fill(`${S.oidc.domain}, students.${S.oidc.domain}`);
    const teachers = sso(page).locator("fieldset [role=switch]").first();
    if ((await teachers.getAttribute("aria-checked")) !== "true") await teachers.click();
    await sso(page).getByLabel(w(v, "sa.w.tValue"), { exact: true }).fill("teachers");
    await sso(page).getByLabel(w(v, "sa.f.classClaim"), { exact: true }).fill("class");
    await shot(page, v, "wizard-3-who");
  }
  // The English window saves the connection: the next test starts from a saved, untested one.
  const page = await open(browser, EN, admin);
  await next(page).click();
  await expect(stepButton(page, 4)).toHaveAttribute("aria-current", "step", { timeout: 30_000 });
});

test("the wizard: the test, its result, turning on, and the status card", async ({ browser }) => {
  for (const v of WIZARD) {
    const page = await open(browser, v, admin);
    await wizard(page);
    await toStep(page, 4);
    await shot(page, v, "wizard-4-test");
  }
  // The admin's own test, with the stand-in school's Amina.
  const en = await open(browser, EN, admin);
  await btn(sso(en), EN, "sa.t.mine").click();
  await pickAtSchool(en, "Amina Hassan");
  await expect(sso(en).locator(".sso-test")).toBeVisible({ timeout: 30_000 });
  for (const v of WIZARD) {
    const page = await open(browser, v, admin);
    if (v !== EN) await wizard(page);
    await toStep(page, 4);
    await btn(sso(page), v, "sa.t.student").click();
    await expect(sso(page).locator(".sso-copy")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "wizard-4-result");
    await toStep(page, 5);
    await shot(page, v, "wizard-5-turnon");
  }
  await btn(sso(en), EN, "sa.o.go").click();
  await expect(sso(en).locator(".sso-status")).toBeVisible({ timeout: 30_000 });
  await shot(en, EN, "signin-status-on");
  slug = new URL(await sso(en).locator(".sso-copy code").first().innerText()).searchParams.get("school") ?? "";
  expect(slug).toBeTruthy();
  for (const v of [AR, ARW]) {
    const page = await open(browser, v, admin);
    await page.goto("/admin?tab=signin");
    await expect(sso(page).locator(".sso-status")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-status-on");
  }
  for (const v of BOTH) {
    const page = await open(browser, v, admin);
    // Turning off asks first.
    await btn(sso(page), v, "sa.s.turnOff").click();
    await shot(page, v, "signin-status-off-ask");
    await btn(sso(page), v, "common.cancel").click();
    // Editing a live connection: the wizard on a copy.
    await btn(sso(page), v, "sa.s.edit").click();
    await expect(stepButton(page, 1)).toBeVisible();
    await shot(page, v, "signin-edit");
    await btn(sso(page), v, "sa.stopEdit").first().click();
  }
  // Asks to be listed in the school finder: the platform admin's /super/domains shows it below.
  await btn(sso(en), EN, "sa.l.ask").click();
  await expect(sso(en).getByText(w(EN, "sa.l.asked"))).toBeVisible({ timeout: 30_000 });
  await shot(en, EN, "signin-status-listing-asked");
});

test("Me: school sign-in not connected, the confirm page, connected", async ({ browser }) => {
  test.skip(!slug, "needs school sign-in on");
  // English: one student connects Omar's school account. Arabic: another connects Tarek's.
  for (const [v, member, who] of [[EN, students[2], "Omar Said"], [AR, students[4], "Tarek Nabil"]] as const) {
    const page = await open(browser, v, member);
    await page.goto("/me");
    const box = page.getByRole("region", { name: w(v, "ss.me.title") });
    await expect(btn(box, v, "ss.me.connect")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "me-school-off");
    await box.screenshot({ path: join(OUT, `me-school-off-row-${v.key}.png`), animations: "disabled" });
    await btn(box, v, "ss.me.connect").click();
    await pickAtSchool(page, who);
    await expect(box.getByRole("group")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "me-school-confirm");
    await box.screenshot({ path: join(OUT, `me-school-confirm-row-${v.key}.png`), animations: "disabled" });
    await btn(box, v, "ss.me.yes").click();
    await expect(box.getByRole("status").or(box.getByRole("alert")).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "me-school-connected");
    await box.screenshot({ path: join(OUT, `me-school-connected-row-${v.key}.png`), animations: "disabled" });
  }
});

/** The finder's list (content/sso.json), as a platform with several listed schools publishes it. */
const listed = () => ({ schools: [
  { slug, name: ORG.name, host: new URL(S.oidc.issuer).host, logo: null },
  { slug: "al-noor", name: "مدرسة النور الثانوية للبنات", host: "accounts.google.com", logo: null },
  { slug: "cairo-stem", name: "Cairo STEM School for Boys, 6th of October", host: "login.microsoftonline.com", logo: null },
  { slug: "delta-tech", name: "Delta Technical Institute", host: "delta-tech.okta.com", logo: null },
  { slug: "alex-uni", name: "جامعة الإسكندرية، كلية التربية", host: "sso.alexu.edu.eg", logo: null },
] });

test("signing in with a school: the button, the finder, the return, refusals", async ({ browser }) => {
  test.skip(!slug, "needs school sign-in on");
  for (const v of BOTH) {
    const page = await open(browser, v, null, "school");
    await page.route(/\/o\/content%2Fsso\.json/, (route) => route.fulfill({ json: listed(), headers: { "access-control-allow-origin": "*" } }));
    await page.goto("/signin");
    await expect(btn(page, v, "sso.yourSchool")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-plain");
    await btn(page, v, "sso.yourSchool").click();
    await expect(page.locator(".sf-list")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-finder");
    await page.locator(".sf-search input").fill(v.lang === "ar" ? "النور" : "stem");
    await shot(page, v, "signin-finder-search");
    await page.locator(".sf-search input").fill("zzz");
    await shot(page, v, "signin-finder-none");

    await page.goto("/signin?school=no-such-school");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-no-school");
    // A return this browser holds no record for (the link was opened in another browser).
    await page.goto("/signin#sso=abcdefgh&f=ijklmnop");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-refused-lost");

    await page.goto(`/signin?school=${slug}`);
    const school = page.getByRole("button", { name: w(v, "ss.signInWith").replace("{name}", "").trim(), exact: false });
    await expect(school).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-school");
    // The way back: finish is held until the picture is taken.
    let release = () => {};
    const held = new Promise<void>((ok) => { release = ok; });
    await page.route(/\/api\/sso\/finish/, async (route) => { await held; await route.fallback(); });
    await school.click();
    await pickAtSchool(page, "Amina Hassan");
    await expect(page.getByText(w(v, "sso.signingIn"))).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `signin-returning-${v.key}.png`), fullPage: true, animations: "disabled" });
    release();
    await expect(page).not.toHaveURL(/\/signin/, { timeout: 30_000 });

    // Someone the school's provider hasn't verified.
    const guest = await open(browser, v, null, "unverified");
    await guest.goto(`/signin?school=${slug}`);
    await guest.getByRole("button", { name: w(v, "ss.signInWith").replace("{name}", "").trim(), exact: false }).click();
    await pickAtSchool(guest, "Guest");
    await expect(guest.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await shot(guest, v, "signin-refused-unverified");
  }

  // The school removes Amina (her account was made by the sign-in above): her next sign-in is refused, in words.
  const amina = (await usersWhere("ssoEmail", "amina@school.test")).find((u) => u.orgId === ORG.id);
  expect(amina, "Amina's account").toBeTruthy();
  const en = await open(browser, EN, admin);
  await en.goto(`/admin/people/${amina!.uid}?tab=account`);
  await btn(en, EN, "p.remove").click();
  await shot(en, EN, "person-account-remove-ask");
  await btn(en, EN, "p.removeYes").click();
  await expect(en).toHaveURL(/\/admin\?tab=people/, { timeout: 30_000 });
  for (const v of BOTH) {
    const page = await open(browser, v, null, "removed");
    await page.goto(`/signin?school=${slug}`);
    await page.getByRole("button", { name: w(v, "ss.signInWith").replace("{name}", "").trim(), exact: false }).click();
    await pickAtSchool(page, "Amina Hassan");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "signin-refused-removed");
  }
});

test("the homepage builder: blocks in English and Arabic, the preview, a block open", async ({ browser }) => {
  const T = (en: string, ar: string) => ({ en, ar });
  await asBoss("manageOrgPage", { action: "publish", orgId: ORG.id, page: { v: 1, langs: ["en", "ar"], blocks: [
    { id: "intro1", kind: "text", heading: T("Welcome to our school", "أهلًا بكم في مدرستنا"), body: T("We teach AI, programming and cyber security to every class, from the first year.\n\nOur teachers use Darsi to prepare lessons and follow each pupil's progress.", "نعلّم الذكاء الاصطناعي والبرمجة والأمن السيبراني في كل فصل من السنة الأولى.\n\nيستخدم معلمونا «درسي» لتحضير الدروس ومتابعة تقدّم كل تلميذ.") },
    { id: "cards1", kind: "cards", heading: T("What we offer", "ما نقدّمه"), items: [
      { title: T("Short lessons", "دروس قصيرة"), text: T("Ten minutes a day, on any phone.", "عشر دقائق يوميًا على أي هاتف.") },
      { title: T("Hands-on labs", "مختبرات عملية"), text: T("Try ideas in the browser, even offline.", "جرّب الأفكار في المتصفح، حتى دون اتصال.") },
      { title: T("Certificates", "شهادات"), text: T("For every finished course.", "لكل دورة تُنهيها.") },
    ] },
    { id: "faq1", kind: "faq", heading: T("Questions", "أسئلة"), items: [{ q: T("Is it free for pupils?", "هل هو مجاني للتلاميذ؟"), a: T("Yes. The school covers it.", "نعم، تتحمّله المدرسة.") }] },
    { id: "contact1", kind: "contact", heading: T("Contact us", "تواصل معنا"), email: "info@nile.test", phone: "+20 100 555 0199", address: T("12 Nile Street, Cairo", "١٢ شارع النيل، القاهرة"), website: "https://nile.test" },
    { id: "button1", kind: "button", label: T("Visit our website", "زر موقعنا"), href: "https://nile.test" },
  ] } });
  for (const v of BOTH) {
    const page = await open(browser, v, admin);
    await page.goto("/admin/page");
    await expect(page.getByRole("group", { name: w(v, "pb.add") })).toBeVisible({ timeout: 30_000 });
    await shot(page, v, "pagebuilder-list");
    await page.locator(".pb-block-title").first().click();
    await shot(page, v, "pagebuilder-open");
    if (v.mobile) {
      await page.getByRole("tab", { name: w(v, "pb.preview"), exact: true }).click();
      await shot(page, v, "pagebuilder-preview");
    }
  }
});

test("the platform admin: /super, organizations, one organization, web addresses, plans", async ({ browser }) => {
  for (const v of BOTH) {
    const page = await open(browser, v, S.boss);
    await shootTabs(page, v, "/super", "super");
    await shootTabs(page, v, "/super/orgs", "super-orgs");
    await shootTabs(page, v, `/super/orgs/${ORG.id}`, "super-org", async (id) => { if (id === "signin") await expect(sso(page)).toBeVisible({ timeout: 30_000 }); });
    await shootTabs(page, v, "/super/domains", "super-domains", async (id) => {
      if (id === "sso" && slug) await expect(page.locator(".sso-listing").first()).toBeVisible({ timeout: 30_000 });
    });
    if (slug) {
      // Refusing a listing asks for a reason first.
      await page.locator(".sso-listing").first().getByRole("button", { name: w(v, "sa.ls.refuse"), exact: true }).click();
      await shot(page, v, "super-domains-sso-refuse-ask");
      await btn(page.locator(".sso-listing").first(), v, "common.cancel").click();
    }
    await shootTabs(page, v, "/super/plans", "super-plans");
  }
});
