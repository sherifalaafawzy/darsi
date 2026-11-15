import { describe, expect, it } from "vitest";
import { atDomain, isUsernameEmail, LEGACY_USERNAME_DOMAINS, USERNAME_DOMAIN } from "../src/usernameDomain";
import { legacyEmails, usernameToEmail } from "../src/passwords";
import { managedAccount } from "../src/roles";
import { orgMadeLinkable } from "../src/ssoCore";

// Username logins live at a domain Darsi owns (darsiai.org): whoever receives mail for the domain could take every
// username account over with "Forgot password". The old domain (users.darsi.app, not Darsi's) still counts until
// scripts/move-username-domain.mjs has moved every account off it.
describe("the username login domain", () => {
  it("is a subdomain of darsiai.org, and new usernames are made there", () => {
    expect(USERNAME_DOMAIN).toBe("users.darsiai.org");
    expect(usernameToEmail(" Amina.B ")).toBe("amina.b@users.darsiai.org");
    expect(LEGACY_USERNAME_DOMAINS).toEqual(["users.darsi.app"]);
  });
  it("recognises both domains, whatever the case, and nothing that only looks like them", () => {
    for (const e of ["a@users.darsiai.org", "A@USERS.DARSIAI.ORG", "a@users.darsi.app"]) expect(isUsernameEmail(e)).toBe(true);
    for (const e of ["a@darsiai.org", "a@users.darsiai.org.evil.com", "a@users.darsi.app.example.org", "a@xusers.darsi.app", null, 3]) expect(isUsernameEmail(e)).toBe(false);
    expect(atDomain("a@users.darsi.app", "users.darsiai.org")).toBe(false);
  });
  it("names the old address a username may still be held at", () => {
    expect(legacyEmails("amina@users.darsiai.org")).toEqual(["amina@users.darsi.app"]);
    expect(legacyEmails("amina@school.org")).toEqual([]);
  });
  it("treats an account still at the old domain as the organization's", () => {
    expect(managedAccount({ email: "amina@users.darsi.app" }).managed).toBe(true);
    expect(managedAccount({ email: "amina@users.darsiai.org" }).managed).toBe(true);
    expect(managedAccount({ email: "amina@gmail.com" }).managed).toBe(false);
  });
  it("never links a school identity to a username login at either domain", () => {
    for (const authEmail of ["amina@users.darsiai.org", "amina@users.darsi.app"]) {
      const facts = {
        uid: "u1", authExists: true, disabled: false, hasIdentity: false, authEmail, claims: { role: "student", orgId: "o1" },
        profile: { orgId: "o1", createdBy: "a1", role: "student", mustChangePassword: true },
      } as unknown as Parameters<typeof orgMadeLinkable>[0];
      expect(orgMadeLinkable(facts, "o1", { email: authEmail, emailVerified: true } as Parameters<typeof orgMadeLinkable>[2])).toBe(false);
    }
  });
});
