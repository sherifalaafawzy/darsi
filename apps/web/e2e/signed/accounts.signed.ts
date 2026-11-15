import { authUser, expect, readDoc, S, test, usersWhere } from "./fixtures";

/** Sign-up and joining with an invite link, against the real functions and rules on the emulators. */

const unique = (what: string) => `${what}-${Date.now().toString(36)}@mail.e2e.test`;

test("sign-up creates the learner's profile", async ({ page }) => {
  const email = unique("newbie");
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Nour Newcomer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill("Newbie-pass-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  // The app moves on by itself once the account is published (SignedIn): onboarding for a new learner.
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 30_000 });
  const account = await authUser(email);
  expect(account, "the Auth account").not.toBeNull();
  await expect.poll(async () => readDoc(`users/${account!.localId}`), { timeout: 20_000 }).toMatchObject({ name: "Nour Newcomer", email, role: "learner", orgId: null });
});

test("an invite link makes a student of org1", async ({ page }) => {
  const org = S.orgs.org1;
  const email = unique("invited");
  await page.goto(`/signup?code=${encodeURIComponent(org.invites.student)}`);
  await expect(page.getByLabel("Invite code (optional)")).toHaveValue(org.invites.student);
  await page.getByLabel("Full name").fill("Hana Invited");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill("Invited-pass-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  // SignedIn sends the new account to /org with the code, which asks once ("Join this organization?") and joins only
  // on Join (joinOrg): then claims and profile both say so.
  await expect(page).toHaveURL(/\/org/, { timeout: 30_000 });
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Join this organization?");
  await ask.getByRole("button", { name: "Join" }).click();
  await expect.poll(async () => (await usersWhere("email", email))[0], { timeout: 45_000 }).toMatchObject({ role: "student", orgId: org.id });
  const claims = JSON.parse((await authUser(email))?.customAttributes ?? "{}");
  expect(claims).toMatchObject({ role: "student", orgId: org.id });
});
