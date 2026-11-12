import type { Locator, Page } from "@playwright/test";
import { authUser, expect, noSidewaysScroll, otherDevice, readDoc, S, signIn, test, usersWhere } from "./fixtures";

/**
 * School sign-in end to end (TECHNICAL.md "School sign-in"): org1's admin connects the stand-in school provider
 * (scripts/local/oidc.mjs, "Another provider") with the wizard and tests it with their own school account, a student
 * tests it with the admin's one-time link (nothing is created, nobody is signed in, the admin sees the result), and the
 * admin turns it on; then people of the stand-in school sign in with the school's button (ssoEdge start → the provider
 * → ssoCallback → finish → a custom token), a removed person is refused until the admin lets her back in from the
 * removed list, and a member connects their own account from Me.
 *
 * The stand-in's people: Amina, Omar and Tarek (all verified at school.test). Each plays one part, in this order:
 * Amina is the admin's test and then a person the school removes and lets back in; Omar is the student who tests the
 * link (which makes him nothing) and then a new person who signs in twice; Tarek is connected to org1's second student
 * from Me before he ever signs in (a first sign-in would make him an account).
 */
test.describe.configure({ mode: "serial" });

const org1 = S.orgs.org1;
let slug = "";
/**
 * The seeded world starts with school sign-in off everywhere; it is on here only when an earlier pass over the same
 * emulators (scripts/e2e-signed.mjs --keep, then one file again) turned it on. Then the wizard's three tests (connect,
 * a student's test, turn on) are skipped and the others use the slug it made.
 */
let wasOn = false;
test.beforeAll(async () => {
  const sso = (await readDoc(`orgs/${org1.id}`))?.sso as { on?: boolean; slug?: string } | undefined;
  wasOn = sso?.on === true;
  if (wasOn) slug = sso?.slug ?? "";
});

/** The provider's page (the stand-in's "who is signing in?"): picks a person, and waits until Darsi has the page back. */
async function pickAtSchool(page: Page, who: string) {
  await page.waitForURL((u) => u.origin === S.oidc.issuer && u.pathname === "/authorize", { timeout: 30_000 });
  await page.getByRole("button", { name: new RegExp(`^${who}`) }).click();
  await page.waitForURL((u) => u.origin === S.web, { timeout: 30_000 });
}
/** The school's button on its sign-in link, then the provider. */
async function schoolSignIn(page: Page, who: string) {
  await page.goto(`/signin?school=${slug}`);
  await page.getByRole("button", { name: new RegExp(`^Sign in with .*${org1.name}`) }).click();
  await pickAtSchool(page, who);
}
/** The account this browser is signed into, from Firebase Auth's own record (what fb.ts storedSession reads). */
const signedInUid = (page: Page) => page.evaluate(() => new Promise<string | null>((resolve) => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  req.onerror = () => resolve(null);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("firebaseLocalStorage")) return resolve(null);
    const all = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => resolve((all.result as Array<{ value?: { uid?: string } }>).map((r) => r.value?.uid).find(Boolean) ?? null);
    all.onerror = () => resolve(null);
  };
}));
/** Profiles the school's sign-in made or connected for this address in org1 (other runs' and organizations' left out). */
const ofOrg1 = async (email: string) => (await usersWhere("ssoEmail", email)).filter((u) => u.orgId === org1.id || u.managedBy === org1.id);
/** This organization's school identities (ssoIdentities), as the server holds them: what a sign-in or a link leaves. */
async function identitiesOfOrg1(): Promise<Array<Record<string, string | undefined>>> {
  const r = await fetch(`http://127.0.0.1:${S.ports.firestore}/v1/projects/${S.project}/databases/(default)/documents:runQuery`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "ssoIdentities" }], where: { fieldFilter: { field: { fieldPath: "orgId" }, op: "EQUAL", value: { stringValue: org1.id } } } } }),
  });
  const rows = (await r.json()) as Array<{ document?: { fields?: Record<string, { stringValue?: string }> } }>;
  return rows.filter((x) => x.document).map((x) => Object.fromEntries(Object.entries(x.document!.fields ?? {}).map(([k, v]) => [k, v.stringValue])));
}
/** The wizard's step `n` of 5, by its button in the stepper (a saved connection opens on Test or Turn on by itself). */
const toStep = (box: Locator, n: number) => box.getByRole("button", { name: new RegExp(`^Step ${n} of 5:`) }).click();
/** Waits until the app has signed someone in on this page (the account record exists) and says who. */
async function waitSignedIn(page: Page) {
  await expect.poll(() => signedInUid(page), { timeout: 30_000 }).not.toBeNull();
  return (await signedInUid(page))!;
}

test("org1's admin connects the school and tests it with their own account", async ({ page }) => {
  test.skip(wasOn, "school sign-in is already on in these emulators: a fresh run tests the wizard");
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin?tab=signin");
  const box = page.getByRole("region", { name: "School sign-in" });
  // 1 Provider: the generic OpenID Connect one (the stand-in is google-like: discovery, PKCE S256, iss in the answer).
  await box.getByRole("radio", { name: /^Another provider/ }).click();
  await box.getByRole("button", { name: "Next", exact: true }).click();
  // 2 Connect: the redirect URI to give the provider is this organization's callback.
  await expect(box.locator("code").filter({ hasText: "/ssoCallback/callback/" })).toHaveText(`${S.fn}/ssoCallback/callback/${org1.id}`);
  await box.getByLabel("Issuer URL").fill(S.oidc.issuer);
  await box.getByLabel("Client ID").fill(S.oidc.clientId);
  await box.getByLabel("Client secret").fill(S.oidc.clientSecret);
  await box.getByRole("button", { name: "Check connection" }).click();
  await expect(box.getByRole("status")).toContainText("It supports PKCE");
  await box.getByRole("button", { name: "Next", exact: true }).click();
  // 3 Who can sign in: the school's domain; everyone joins as a student.
  await box.getByLabel("Allowed email domains").fill(S.oidc.domain);
  await box.getByRole("button", { name: "Save and test" }).click();
  // 4 Test with the admin's own school account: nothing is created.
  await expect(box.getByRole("heading", { name: "Test before anyone uses it" })).toBeVisible();
  await box.getByRole("button", { name: "Test with my account" }).click();
  await pickAtSchool(page, "Amina Hassan");
  await expect(page).toHaveURL(/\/admin\?tab=signin$/); // the fragment with the ticket is gone
  // By its words: while the return is finished and the settings are read again the box holds two other notes that
  // are statuses too ("Signing you in…", "Loading school sign-in…"), and a locator that meets two elements fails at once.
  await expect(box.getByRole("status").filter({ hasText: "The test passed for these settings." })).toBeVisible({ timeout: 30_000 });
  await expect(box.getByRole("region", { name: "Last test" })).toContainText("create a new student account");
  expect(await ofOrg1("amina@school.test")).toHaveLength(0);
});

test("a student tests the school's link: Darsi says what it would do and makes nothing, and the admin sees the result", async ({ page, browser }) => {
  test.skip(wasOn, "school sign-in is already on in these emulators: a fresh run tests the student's link");
  // The admin, back on the wizard (a tested connection opens on Turn on): step 4 makes a one-time link for a student.
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin?tab=signin");
  const box = page.getByRole("region", { name: "School sign-in" });
  await toStep(box, 4);
  await expect(box.getByRole("heading", { name: "Test before anyone uses it" })).toBeVisible();
  await box.getByRole("button", { name: "Test as a student" }).click();
  const link = new URL(await box.locator("code").filter({ hasText: "&try=" }).innerText());
  expect(link.origin).toBe(S.web);
  expect(link.pathname).toBe("/signin");
  expect(link.searchParams.get("try")).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  const before = await identitiesOfOrg1();

  // The student: somebody who isn't signed in to Darsi at all, on their own device, opens the link. School sign-in is
  // not on yet, and the link still names the school and where they will continue.
  const student = await otherDevice(browser);
  const sp = student.page;
  await sp.goto(link.pathname + link.search);
  await expect(sp.getByRole("heading", { name: "Test your school’s sign-in" })).toBeVisible();
  const tryIt = sp.getByRole("button", { name: new RegExp(`^Test with .*${org1.name}`) });
  await expect(tryIt).toBeVisible();
  await expect(sp.getByLabel(/^Password$/)).toHaveCount(0); // only the test: no password form beside it
  await tryIt.click();
  await pickAtSchool(sp, "Omar Said");
  // Back on the result page, with the ticket out of the address: what Darsi would do with him, in words.
  await expect(sp).toHaveURL(/\/sso-test$/, { timeout: 30_000 });
  await expect(sp.getByRole("heading", { name: "Testing your school’s sign-in" })).toBeVisible();
  await expect(sp.getByRole("status").filter({ hasText: "The test worked: you would join as a student." })).toBeVisible({ timeout: 30_000 });
  await expect(sp.getByText("Nothing was created and you weren’t signed in.")).toBeVisible();
  // Nothing was created and nobody was signed in: no session on his device, no account, no profile, no school identity.
  expect(await signedInUid(sp)).toBeNull();
  expect(await authUser("omar@school.test")).toBeNull();
  expect(await ofOrg1("omar@school.test")).toHaveLength(0);
  expect(await identitiesOfOrg1()).toHaveLength(before.length);
  expect((await readDoc(`orgs/${org1.id}`))?.sso ?? {}).not.toMatchObject({ on: true });
  // The link worked once: opened again, the page says it was used and offers no second test.
  await sp.goto(link.pathname + link.search);
  await expect(sp.getByRole("alert")).toContainText("This test link was already used or has expired.", { timeout: 30_000 });
  await expect(tryIt).toHaveCount(0);
  await student.close();

  // The admin reads the settings again: the Test step shows the student's result.
  await page.reload();
  await toStep(box, 4);
  const last = box.getByRole("region", { name: "Last test" });
  await expect(last).toContainText("With a student’s test link.", { timeout: 30_000 });
  await expect(last).toContainText("omar@school.test");
  await expect(last).toContainText("create a new student account");
  await expect(box.getByRole("status").filter({ hasText: "The test passed for these settings." })).toBeVisible();
});

test("org1's admin turns the school's sign-in on", async ({ page }) => {
  test.skip(wasOn, "school sign-in is already on in these emulators: a fresh run turns it on");
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin?tab=signin");
  const box = page.getByRole("region", { name: "School sign-in" });
  // 5 Turn on (where a tested connection opens; by the stepper all the same).
  await toStep(box, 5);
  await box.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(box.getByRole("status")).toContainText("School sign-in is on.", { timeout: 30_000 });
  const link = await box.locator("code").filter({ hasText: "/signin?school=" }).innerText();
  slug = new URL(link).searchParams.get("school") ?? "";
  expect(slug).toBeTruthy();
  expect(await readDoc(`orgs/${org1.id}`)).toMatchObject({ sso: { on: true, slug } });
});

test("a new person signs in with the school's button and lands as a student of org1", async ({ page }) => {
  test.skip(!slug, "needs school sign-in on");
  await schoolSignIn(page, "Omar Said");
  const uid = await waitSignedIn(page);
  await expect(page).not.toHaveURL(/\/signin|#sso/);
  expect(await readDoc(`users/${uid}`)).toMatchObject({ role: "student", orgId: org1.id, sso: true, ssoEmail: "omar@school.test" });
  // A new student lands in the learner's first steps, under the school's name.
  await expect(page.getByText(org1.name).first()).toBeVisible();
});

test("the same person signs in again into the same account", async ({ page }) => {
  test.skip(!slug, "needs school sign-in on");
  const before = await ofOrg1("omar@school.test");
  expect(before).toHaveLength(1);
  await schoolSignIn(page, "Omar Said");
  expect(await waitSignedIn(page)).toBe(before[0].uid);
  expect(await ofOrg1("omar@school.test")).toHaveLength(1);
});

test("a person the school removed is refused", async ({ page, browser }) => {
  test.skip(!slug, "needs school sign-in on");
  // Amina signs in once (her account is made), and org1's admin removes her.
  await schoolSignIn(page, "Amina Hassan");
  const uid = await waitSignedIn(page);
  expect(await readDoc(`users/${uid}`)).toMatchObject({ orgId: org1.id });
  const admin = await otherDevice(browser);
  const adminPage = admin.page;
  await signIn(adminPage, org1.admin.email, org1.admin.password);
  await adminPage.goto(`/admin/people/${uid}?tab=account`);
  await adminPage.getByRole("button", { name: "Remove from organization" }).click();
  await adminPage.getByRole("button", { name: "Yes, remove" }).click();
  await expect(adminPage.getByRole("status").filter({ hasText: "was removed from the organization" })).toBeVisible();
  await admin.close();

  // Her next school sign-in, on a fresh device, is refused in words.
  const fresh = await otherDevice(browser);
  const again = fresh.page;
  await again.goto(`/signin?school=${slug}`);
  await again.getByRole("button", { name: new RegExp(`^Sign in with .*${org1.name}`) }).click();
  await pickAtSchool(again, "Amina Hassan");
  await expect(again.getByRole("alert")).toContainText("Your school removed you from Darsi.", { timeout: 30_000 });
  expect(await signedInUid(again)).toBeNull();
  await fresh.close();
});

test("the admin lets her back in from the removed list, and the school's sign-in opens her account again", async ({ page, browser }) => {
  test.skip(!slug, "needs school sign-in on");
  // Amina, as the last test left her: the account the school's sign-in made, on org1's removed list.
  const listed = ((await readDoc(`orgs/${org1.id}/private/removed`))?.uids ?? {}) as Record<string, unknown>;
  const amina = (await usersWhere("ssoEmail", "amina@school.test")).find((u) => u.uid in listed);
  expect(amina, "Amina is on org1's removed list").toBeTruthy();
  const uid = amina!.uid;
  expect((await readDoc(`users/${uid}`))?.orgId ?? null).not.toBe(org1.id);

  // The admin's Invite tab lists the people who were removed: "Let back in" on her row.
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin?tab=invite");
  const gone = page.getByRole("region", { name: "People who were removed" });
  await expect(gone.getByRole("row").filter({ hasText: "Amina Hassan" })).toBeVisible({ timeout: 30_000 });
  await gone.getByRole("button", { name: /^Let .*Amina Hassan.* back in$/ }).click();
  // An account the school's sign-in made goes straight back in as a student, and off the list.
  await expect(gone.getByRole("status")).toContainText("is back in the organization as a student", { timeout: 30_000 });
  await expect(gone.getByRole("row").filter({ hasText: "Amina Hassan" })).toHaveCount(0);
  expect(await readDoc(`users/${uid}`)).toMatchObject({ role: "student", orgId: org1.id });
  expect(uid in (((await readDoc(`orgs/${org1.id}/private/removed`))?.uids ?? {}) as Record<string, unknown>)).toBe(false);

  // Her next school sign-in, on a fresh device, opens that same account (no second one is made).
  const fresh = await otherDevice(browser);
  const again = fresh.page;
  await again.goto(`/signin?school=${slug}`);
  await again.getByRole("button", { name: new RegExp(`^Sign in with .*${org1.name}`) }).click();
  await pickAtSchool(again, "Amina Hassan");
  await expect.poll(() => signedInUid(again), { timeout: 30_000 }).toBe(uid);
  await expect(again).not.toHaveURL(/\/signin|#sso/);
  const hers = await ofOrg1("amina@school.test");
  expect(hers.map((u) => u.uid)).toEqual([uid]);
  expect(hers[0]).toMatchObject({ role: "student", orgId: org1.id, sso: true });
  await fresh.close();
});

test("a member connects their own account from Me, and the school's sign-in then opens it", async ({ page, browser }) => {
  test.skip(!slug, "needs school sign-in on");
  const member = org1.students[1];
  await signIn(page, member.email, member.password);
  await page.goto("/me");
  const box = page.getByRole("region", { name: "School sign-in" });
  // Just signed in, so no second password is asked for (the server allows a sign-in up to 10 minutes old).
  await box.getByRole("button", { name: "Connect school sign-in" }).click();
  await pickAtSchool(page, "Tarek Nabil");
  await expect(page).toHaveURL(/\/me$/);
  await expect(box.getByRole("group")).toContainText("tarek@school.test");
  await box.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(box.getByRole("status")).toContainText("Connected as", { timeout: 30_000 });
  await expect.poll(async () => (await readDoc(`users/${member.uid}`))?.ssoLinkedAt, { timeout: 20_000 }).toBeTruthy();

  // Tarek's school sign-in, on another device, opens the member's own account (no new one is made).
  const other = await otherDevice(browser);
  const p2 = other.page;
  await p2.goto(`/signin?school=${slug}`);
  await p2.getByRole("button", { name: new RegExp(`^Sign in with .*${org1.name}`) }).click();
  await pickAtSchool(p2, "Tarek Nabil");
  await expect.poll(() => signedInUid(p2), { timeout: 30_000 }).toBe(member.uid);
  expect(await ofOrg1("tarek@school.test")).toHaveLength(0);
  await other.close();
});

test.describe("in Arabic on a 375 px phone", () => {
  test.use({ locale: "ar-EG", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the school's sign-in page and the wizard never scroll sideways", async ({ page }) => {
    test.skip(!slug, "needs school sign-in on");
    // The sign-in page with the school's button, right to left.
    await page.goto(`/signin?school=${slug}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: /^تسجيل الدخول عبر / })).toBeVisible();
    await noSidewaysScroll(page);

    // org2's admin, whose school sign-in isn't set up: the wizard's first three steps.
    const org2 = S.orgs.org2;
    await page.goto("/signin");
    await page.getByLabel(/^البريد الإلكتروني أو اسم المستخدم/).fill(org2.admin.email);
    await page.getByLabel(/^كلمة المرور$/).fill(org2.admin.password);
    await page.getByRole("button", { name: /^تسجيل الدخول$/ }).click();
    await expect(page).not.toHaveURL(/\/signin/, { timeout: 30_000 });
    await page.goto("/admin?tab=signin");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const next = page.getByRole("button", { name: "التالي", exact: true });
    await expect(page.getByRole("radio").first()).toBeVisible({ timeout: 30_000 });
    await noSidewaysScroll(page);
    await page.getByRole("radio", { name: /^مزوّد آخر/ }).click();
    await next.click();
    // The redirect URI is a long unbroken address: it must wrap or scroll inside its own box, not the page.
    await expect(page.locator("code").filter({ hasText: "/ssoCallback/callback/" })).toBeVisible();
    await noSidewaysScroll(page);
    await page.getByLabel(/^عنوان المُصدِر/).fill(S.oidc.issuer);
    await page.getByLabel(/^معرّف العميل/).fill(S.oidc.clientId);
    await page.getByLabel(/^سر العميل/).fill(S.oidc.clientSecret);
    await page.getByRole("button", { name: "التحقق من الاتصال" }).click();
    await expect(page.getByRole("status").filter({ hasText: "127.0.0.1" })).toBeVisible({ timeout: 30_000 });
    await noSidewaysScroll(page);
    await next.click();
    await expect(page.getByLabel(/^نطاقات البريد الإلكتروني المسموح بها/)).toBeVisible();
    await noSidewaysScroll(page);
  });
});
