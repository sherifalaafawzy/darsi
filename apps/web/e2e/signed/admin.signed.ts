import { authUser, expect, readDoc, S, signIn, test, usersWhere } from "./fixtures";

/**
 * An organization's admin at work, against the real functions and rules: adding people (createMembers), changing a
 * role (setRole), removing someone (removeMember), the first sign-in that must choose a password (passwordChanged),
 * another organization's admin kept out, and the dashboard's tabs in the address.
 */
test.describe.configure({ mode: "serial" });

const org1 = S.orgs.org1;
const stamp = Date.now().toString(36);
const karim = { name: "Karim Added", email: `karim-${stamp}@nile.e2e.test`, password: "" };
const laila = { name: "Laila Added", email: `laila-${stamp}@nile.e2e.test`, password: "" };
/** A person's link or row, by their address (names repeat across runs; addresses don't). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const claimsOf = async (email: string) => JSON.parse((await authUser(email))?.customAttributes ?? "{}") as Record<string, unknown>;

test("org1's admin adds two people, changes a role and removes one", async ({ page }) => {
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin?tab=people");
  await page.getByRole("button", { name: "Add people" }).click();
  await expect(page).toHaveURL(/\/admin\/add/);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(karim.name);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(karim.email);
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).nth(1).fill(laila.name);
  await page.getByRole("textbox", { name: "Email", exact: true }).nth(1).fill(laila.email);
  await page.getByRole("button", { name: "Create accounts" }).click();
  await expect(page.getByRole("heading", { name: "Accounts ready" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("2 created")).toBeVisible();
  // The passwords are shown once, in the results table: keep them for the first sign-in below.
  for (const p of [karim, laila]) {
    const row = page.getByRole("row", { name: new RegExp(esc(p.email)) });
    p.password = (await row.locator("code").innerText()).trim();
    expect(p.password.length).toBeGreaterThanOrEqual(10);
  }
  // Both are org1's students, made by its admin, and must choose their own password.
  for (const p of [karim, laila]) {
    await expect.poll(async () => (await usersWhere("email", p.email))[0]).toMatchObject({ role: "student", orgId: org1.id, mustChangePassword: true });
    expect(await claimsOf(p.email)).toMatchObject({ role: "student", orgId: org1.id });
  }

  // Karim becomes a teacher, from his page's Account tab.
  await page.goto("/admin?tab=people");
  await page.getByRole("link", { name: new RegExp(esc(karim.email)) }).click();
  await page.getByRole("tab", { name: "Account" }).click();
  await expect(page).toHaveURL(/[?&]tab=account/);
  await page.getByRole("combobox", { name: "Role" }).selectOption({ label: "Teacher" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Asked once, on the page: a role change signs the person out everywhere.
  await expect(page.getByRole("alertdialog")).toContainText("role to Teacher?");
  await page.getByRole("button", { name: "Yes, change the role" }).click();
  await expect.poll(() => claimsOf(karim.email), { timeout: 30_000 }).toMatchObject({ role: "teacher", orgId: org1.id });
  expect((await usersWhere("email", karim.email))[0]).toMatchObject({ role: "teacher", orgId: org1.id });

  // Laila is removed from the organization: she keeps her account, as a learner in none.
  await page.goto("/admin?tab=people");
  await page.getByRole("link", { name: new RegExp(esc(laila.email)) }).click();
  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Remove from organization" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "was removed from the organization" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\?tab=people/);
  await expect(page.getByRole("link", { name: new RegExp(esc(laila.email)) })).toHaveCount(0);
  await expect.poll(() => claimsOf(laila.email), { timeout: 30_000 }).not.toHaveProperty("orgId");
  const after = (await usersWhere("email", laila.email))[0];
  expect(after?.orgId ?? null).toBeNull();
  expect(after?.role).toBe("learner");
});

test("a new member must change the password at first sign-in", async ({ page }) => {
  test.skip(!karim.password, "needs the accounts the test before made");
  await page.goto("/signin");
  await page.getByLabel("Email or username").fill(karim.email);
  await page.getByLabel("Password", { exact: true }).fill(karim.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Nothing else opens until a password of their own is saved.
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/teach");
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible({ timeout: 30_000 });
  // The admin's password is refused as the new one.
  await page.getByLabel("New password").fill(karim.password);
  await page.getByLabel("Repeat password").fill(karim.password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const mine = "Karim-own-pass-2026";
  await page.getByLabel("New password").fill(mine);
  await page.getByLabel("Repeat password").fill(mine);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await usersWhere("email", karim.email))[0]?.mustChangePassword, { timeout: 30_000 }).toBe(false);
});

test("org2's admin is refused org1's person page", async ({ page }) => {
  const org2 = S.orgs.org2;
  const pupil = org1.students[0];
  await signIn(page, org2.admin.email, org2.admin.password);
  await page.goto(`/admin/people/${pupil.uid}`);
  await expect(page.getByRole("heading", { name: "This person isn't in your organization." })).toBeVisible();
  // Nothing of the person reaches the page.
  await expect(page.getByText(pupil.email)).toHaveCount(0);
  await expect(page.getByText(pupil.name)).toHaveCount(0);
  // Nor can the account change them, whatever the page shows (setRole checks the caller's organization).
  expect(await readDoc(`users/${pupil.uid}`)).toMatchObject({ orgId: org1.id, role: "student" });
});

test("the admin tabs keep ?tab in the address, and Back goes to the tab before", async ({ page }) => {
  await signIn(page, org1.admin.email, org1.admin.password);
  await page.goto("/admin");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page).toHaveURL(/\/admin\?tab=people$/);
  await expect(page.getByRole("tabpanel", { name: "People" })).toBeVisible();
  await page.getByRole("tab", { name: "Invite" }).click();
  await expect(page).toHaveURL(/\/admin\?tab=invite$/);
  // The invite codes are read when the tab first opens: org1's own.
  await expect(page.getByRole("tabpanel", { name: "Invite" })).toContainText(org1.invites.student);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\?tab=people$/);
  await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
  // A reload keeps the tab; an unknown one opens the default.
  await page.goto("/admin?tab=activity");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await page.goto("/admin?tab=nonsense");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});
