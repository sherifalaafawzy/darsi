// Bulk accounts (createMembers): logins for names in any script, the order accounts are made in so pupils find a
// teacher from the same sheet, several at a time, and what a login that is already taken means. Plus who may name a
// first admin, and joining: a code's expiry and limit, an organization's join policy, its list of removed people.
import { describe, expect, it } from "vitest";
import { chunks, codeProblem, creationOrder, creationWaves, joinPolicyChange, MAX_DRAWS, missingBasics, onCreateError, passwordLength, policyProblem, pool, readJoinPolicy, teacherKeys, withRemoved } from "../src/membersCore";
import { isValidUsername, suggestUsername, transliterate, usernameToEmail } from "../src/passwords";
import { approveProblem, firstAdminProblem, handMadeUsername, stillTeaches } from "../src/roles";

const ARABIC_NAMES = ["منى عبد الرحمن", "أحمد علي", "يوسف محمود", "فاطمة الزهراء", "محمد أحمد", "نور حسين", "عمرو خالد", "إيمان سعيد", "مصطفى كمال", "سارة ناصر"];

describe("usernames from names (sec-functions-core-01)", () => {
  it("writes Arabic names in Latin letters, as Egyptians write names", () => {
    expect(transliterate("منى عبد الرحمن").trim().split(/\s+/)).toEqual(["mna", "abd", "alrhmn"]);
    expect(transliterate("محمود")).toBe("mhmod");
    expect(transliterate("وليد")).toBe("wlyd");
    expect(transliterate("فاطمة")).toBe("fatma");
    expect(transliterate("مُحَمَّد")).toBe("mhmd"); // harakat dropped
    expect(transliterate("ﻻ")).toBe("la"); // a presentation form
    expect(transliterate("گلی")).toBe("gly"); // Persian letters
    expect(transliterate("٤٢")).toBe("42");
  });
  it("an Arabic name's login is its first two parts and a 5-digit number, never 'user.'", () => {
    for (const n of ARABIC_NAMES) {
      const u = suggestUsername(n);
      expect(isValidUsername(u)).toBe(true);
      expect(u).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)?\.\d{5}$/);
      expect(u.startsWith("user.")).toBe(false);
    }
    expect(suggestUsername("منى عبد الرحمن")).toMatch(/^mna\.abd\.\d{5}$/);
    expect(suggestUsername("Amina Bello")).toMatch(/^amina\.bello\.\d{5}$/);
    expect(suggestUsername("José Ñúñez García")).toMatch(/^jose\.nunez\.\d{5}$/);
  });
  it("a name with nothing to write in Latin gets 'user.' and 6 digits", () => {
    expect(suggestUsername("王小明")).toMatch(/^user\.\d{6}$/);
    expect(suggestUsername("   ")).toMatch(/^user\.\d{6}$/);
  });
  it("500 Arabic-named pupils get 500 different logins (it was 9,000 for the whole platform)", () => {
    const logins = new Set(Array.from({ length: 500 }, (_, i) => suggestUsername(ARABIC_NAMES[i % ARABIC_NAMES.length])));
    // 50 pupils share each name; 90,000 numbers each make a clash rare, and createMembers draws again on one.
    expect(logins.size).toBeGreaterThanOrEqual(495);
  });
  it("a taken login is drawn again when it was made up, and reported when the admin typed it", () => {
    const code = "auth/email-already-exists";
    expect(onCreateError(code, { generated: true, typedEmail: false, draws: 1 })).toBe("retry");
    expect(onCreateError(code, { generated: true, typedEmail: false, draws: MAX_DRAWS })).toBe("taken");
    expect(onCreateError(code, { generated: false, typedEmail: false, draws: 1 })).toBe("taken");
    expect(onCreateError(code, { generated: false, typedEmail: true, draws: 1 })).toBe("exists");
    expect(onCreateError("auth/invalid-password", { generated: true, typedEmail: false, draws: 1 })).toBeNull();
  });
});

describe("teachers in the same sheet as their pupils (ux-orgadmin-import-teacher-link)", () => {
  it("makes teachers and admins first, in file order, then everyone else", () => {
    // The template's layout and the reverse: a teacher listed after her pupils is still made first.
    expect(creationOrder(["teacher", "student"])).toEqual([0, 1]);
    expect(creationOrder(["student", "student", "teacher", "orgAdmin", "student"])).toEqual([2, 3, 0, 1, 4]);
    expect(creationOrder([])).toEqual([]);
  });
  it("in two waves, so every teacher exists before any pupil is made", () => {
    expect(creationWaves(["student", "teacher", "student", "orgAdmin"])).toEqual([[1, 3], [0, 2]]);
    expect(creationWaves(["student"])).toEqual([[], [0]]);
    expect(creationWaves([])).toEqual([[], []]);
  });
  it("a new teacher can be named by email, by username, or by the username's login email", () => {
    expect(teacherKeys("Amina.Bello@School.org", null, usernameToEmail)).toEqual(["amina.bello@school.org"]);
    expect(teacherKeys(usernameToEmail("t.one"), "t.one", usernameToEmail).sort()).toEqual(["t.one", "t.one@users.darsiai.org"]);
  });
});

describe("a teacher who left (feat-org-leaver-teacher)", () => {
  it("gets no more project alerts from the organization's pupils: its admins do", () => {
    expect(stillTeaches({ role: "teacher", orgId: "org1" }, "org1")).toBe(true);
    expect(stillTeaches({ role: "orgAdmin", orgId: "org1" }, "org1")).toBe(true);
    expect(stillTeaches({ role: "learner", orgId: null }, "org1")).toBe(false); // removed from the organization
    expect(stillTeaches({ role: "student", orgId: "org1" }, "org1")).toBe(false); // made a student
    expect(stillTeaches({ role: "teacher", orgId: "org2" }, "org1")).toBe(false); // moved to another organization
    expect(stillTeaches(undefined, "org1")).toBe(false); // the account was deleted
    expect(stillTeaches({ role: "teacher", orgId: "org1" }, null)).toBe(false);
  });
});

describe("a new organization's first admin (sec-functions-core-03)", () => {
  const profile = (role?: string) => ({ exists: role !== undefined, get: (f: string) => (f === "role" ? role : undefined) });
  it("is never the platform admin creating it, nor another platform admin", () => {
    expect(firstAdminProblem("me", "me", profile("superadmin"))).toBe("self");
    expect(firstAdminProblem("sa2", "me", profile("superadmin"))).toBe("superadmin");
    expect(firstAdminProblem("ghost", "me", profile())).toBe("missing");
    expect(firstAdminProblem("t1", "me", profile("teacher"))).toBeNull();
    expect(firstAdminProblem("l1", "me", profile("learner"))).toBeNull();
  });
});

describe("a profile a server write reaches first (ux-accounts-04)", () => {
  const account = { email: "Mona.Ali@School.org", displayName: "  Mona Ali " };
  it("fills the email, name and creation time from Auth for a profile not made yet", () => {
    expect(missingBasics(undefined, account)).toEqual({ email: "mona.ali@school.org", name: "Mona Ali", createdAt: true });
    // A stub a join made before (role and org only): the same.
    expect(missingBasics({}, account)).toEqual({ email: "mona.ali@school.org", name: "Mona Ali", createdAt: true });
  });
  it("leaves every real profile alone (they all have their email), and needs an Auth account", () => {
    expect(missingBasics({ email: "mona.ali@school.org", name: "" }, account)).toEqual({});
    expect(missingBasics(undefined, null)).toEqual({});
    expect(missingBasics(undefined, undefined)).toEqual({});
  });
  it("keeps a name or creation time the stub has, and writes no empty name", () => {
    expect(missingBasics({ name: "Mona", createdAt: { seconds: 1 } }, account)).toEqual({ email: "mona.ali@school.org" });
    expect(missingBasics(undefined, { email: "x@y.org", displayName: "" })).toEqual({ email: "x@y.org", createdAt: true });
  });
});

describe("username logins someone signed up for by hand (sec-rules-05)", () => {
  it("are those on the reserved domain that no organization made", () => {
    expect(handMadeUsername("khaled.omar@users.darsiai.org", undefined)).toBe(true);
    expect(handMadeUsername("Khaled.Omar@USERS.darsiai.org", null)).toBe(true);
    expect(handMadeUsername("khaled.omar@users.darsiai.org", "admin1")).toBe(false); // createMembers made it
    expect(handMadeUsername("khaled@gmail.com", undefined)).toBe(false);
    // The old domain (not Darsi's, usernameDomain.ts) still counts until every account is moved off it.
    expect(handMadeUsername("khaled.omar@users.darsi.app", undefined)).toBe(true);
    expect(handMadeUsername("khaled.omar@users.darsi.app.example.org", undefined)).toBe(false);
    expect(handMadeUsername(undefined, undefined)).toBe(false);
  });
});

describe("approving an organization request (ux-accounts-10)", () => {
  it("never moves a requester out of another organization or demotes a platform admin", () => {
    expect(approveProblem({ role: "learner", orgId: null }, "o1")).toBeNull();
    expect(approveProblem(undefined, "o1")).toBeNull(); // no profile yet: setRole makes it
    expect(approveProblem({ role: "student", orgId: "o7" }, "o1")).toBe("requester-in-org");
    expect(approveProblem({ role: "orgAdmin", orgId: "o1" }, "o1")).toBeNull();
    expect(approveProblem({ role: "superadmin", orgId: null }, "o1")).toBe("requester-staff");
  });
});

describe("several accounts at a time (createMembers)", () => {
  it("runs every job, never more than the width at once, each started in list order", async () => {
    let running = 0, most = 0;
    const started: number[] = [], done: number[] = [];
    await pool([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, async (i) => {
      started.push(i); most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, i % 2 ? 1 : 4));
      running--; done.push(i);
    });
    expect(most).toBe(3);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...done].sort((a, b) => a - b)).toEqual(started);
  });
  it("copes with nothing to do, fewer items than the width, and a width that makes no sense", async () => {
    const seen: number[] = [];
    await pool([], 6, async (i: number) => { seen.push(i); });
    await pool([1, 2], 6, async (i) => { seen.push(i); });
    await pool([3, 4], 0, async (i) => { seen.push(i); });
    await pool([5], Number.NaN, async (i) => { seen.push(i); });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
  it("splits a list into groups", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 10)).toEqual([]);
  });
  it("keeps the chosen password length to 8–32, and 10 when none is chosen", () => {
    expect([passwordLength(undefined), passwordLength("x"), passwordLength(0), passwordLength(3), passwordLength(12.9), passwordLength("16"), passwordLength(99), passwordLength(-5)])
      .toEqual([10, 10, 10, 8, 12, 16, 32, 8]);
  });
});

describe("an invite code's expiry and limit (joinOrg)", () => {
  const now = 1_800_000_000_000;
  it("a code with neither never runs out, as before", () => {
    expect(codeProblem({}, now)).toBeNull();
    expect(codeProblem(undefined, now)).toBeNull();
    expect(codeProblem({ uses: 5000 }, now)).toBeNull();
    expect(codeProblem({ expiresAt: null, maxUses: null }, now)).toBeNull();
  });
  it("expires at its time, and stops at its last use", () => {
    expect(codeProblem({ expiresAt: now + 1 }, now)).toBeNull();
    expect(codeProblem({ expiresAt: now }, now)).toBe("code-expired");
    expect(codeProblem({ maxUses: 3, uses: 2 }, now)).toBeNull();
    expect(codeProblem({ maxUses: 3 }, now)).toBeNull();
    expect(codeProblem({ maxUses: 3, uses: 3 }, now)).toBe("code-used-up");
    expect(codeProblem({ expiresAt: now - 1, maxUses: 3, uses: 3 }, now)).toBe("code-expired");
  });
});

describe("who may join with a code (the organization's join policy)", () => {
  it("no policy lets anyone with a code in", () => {
    expect(policyProblem(undefined, { email: "a@gmail.com", email_verified: false })).toBeNull();
    expect(policyProblem({}, undefined)).toBeNull();
    expect(readJoinPolicy("nonsense")).toEqual({ requireVerifiedEmail: false, allowedDomains: [] });
  });
  it("can ask for a verified email", () => {
    const p = { requireVerifiedEmail: true };
    expect(policyProblem(p, { email: "a@gmail.com", email_verified: true })).toBeNull();
    expect(policyProblem(p, { email: "a@gmail.com", email_verified: false })).toBe("email-unverified");
    expect(policyProblem(p, { email: "a@gmail.com", email_verified: "true" })).toBe("email-unverified");
    expect(policyProblem(p, {})).toBe("email-unverified"); // a sign-in with no email at all
  });
  it("can keep to the organization's own domains, matched exactly and without regard to case", () => {
    const p = { allowedDomains: ["school.edu", "Staff.School.edu"] };
    expect(policyProblem(p, { email: "Mona@School.EDU" })).toBeNull();
    expect(policyProblem(p, { email: "t@staff.school.edu" })).toBeNull();
    expect(policyProblem(p, { email: "x@pupils.school.edu" })).toBe("email-domain");
    expect(policyProblem(p, { email: "x@notschool.edu" })).toBe("email-domain");
    expect(policyProblem(p, { email: "school.edu" })).toBe("email-domain");
    expect(policyProblem(p, { email: "school.edu@gmail.com" })).toBe("email-domain");
    expect(policyProblem(p, {})).toBe("email-domain");
    // Unverified is said first: confirming the address is the step the person can take.
    expect(policyProblem({ ...p, requireVerifiedEmail: true }, { email: "x@gmail.com", email_verified: false })).toBe("email-unverified");
  });
});

describe("what setJoinPolicy accepts", () => {
  const now = 1_800_000_000_000;
  it("only what was sent, cleaned: domains trimmed, lower-cased, without '@', each once", () => {
    expect(joinPolicyChange({ orgId: "o1" }, now)).toEqual({ policy: {}, codes: {} });
    expect(joinPolicyChange({ requireVerifiedEmail: false }, now)).toEqual({ policy: { requireVerifiedEmail: false }, codes: {} });
    expect(joinPolicyChange({ allowedDomains: [" School.EDU ", "@school.edu", "xn--mgbh0fb.xn--kgbechtv"] }, now)?.policy).toEqual({ allowedDomains: ["school.edu", "xn--mgbh0fb.xn--kgbechtv"] });
    expect(joinPolicyChange({ allowedDomains: [] }, now)?.policy).toEqual({ allowedDomains: [] });
  });
  it("limits per code: a time still to come, 1 or more uses, null to clear", () => {
    expect(joinPolicyChange({ codes: { teacher: { expiresAt: now + 1, maxUses: 1 }, student: { expiresAt: null, maxUses: null } } }, now)?.codes)
      .toEqual({ teacher: { expiresAt: now + 1, maxUses: 1 }, student: { expiresAt: null, maxUses: null } });
    expect(joinPolicyChange({ codes: { student: {} } }, now)?.codes).toEqual({ student: {} });
    expect(joinPolicyChange({ codes: {} }, now)?.codes).toEqual({});
  });
  it("refuses the whole change when any part is wrong", () => {
    const bad: unknown[] = [
      null, "x", [], { requireVerifiedEmail: 1 }, { allowedDomains: "school.edu" }, { allowedDomains: [42] }, { allowedDomains: ["school"] },
      { allowedDomains: ["sch ool.edu"] }, { allowedDomains: ["-school.edu"] }, { allowedDomains: ["a@b@school.edu"] }, { allowedDomains: [`${"a".repeat(64)}.edu`] },
      { allowedDomains: Array.from({ length: 21 }, (_, i) => `s${i}.edu`) }, { codes: "x" }, { codes: { teacher: 5 } }, { codes: { orgAdmin: {} } },
      { codes: { teacher: { expiresAt: now } } }, { codes: { teacher: { expiresAt: "2027-01-01" } } }, { codes: { teacher: { expiresAt: now + 0.5 } } },
      { codes: { student: { maxUses: 0 } } }, { codes: { student: { maxUses: -1 } } }, { codes: { student: { maxUses: 1.5 } } }, { codes: { student: { maxUses: 1_000_001 } } },
      { codes: { student: { maxUses: "5" } } }, { requireVerifiedEmail: true, codes: { student: { maxUses: 0 } } },
    ];
    for (const d of bad) expect(joinPolicyChange(d, now), JSON.stringify(d)).toBeNull();
    expect(joinPolicyChange({ allowedDomains: Array.from({ length: 20 }, (_, i) => `s${i}.edu`) }, now)?.policy.allowedDomains).toHaveLength(20);
  });
});

describe("the people an organization removed", () => {
  it("adds one, replaces an older entry for the same person, and changes nothing it was given", () => {
    const before = { a: { at: 1, name: "A" } };
    expect(withRemoved(before, "b", { at: 2, name: "B" })).toEqual({ a: { at: 1, name: "A" }, b: { at: 2, name: "B" } });
    expect(withRemoved(before, "a", { at: 9 })).toEqual({ a: { at: 9 } });
    expect(withRemoved(undefined, "a", { at: 1 })).toEqual({ a: { at: 1 } });
    expect(before).toEqual({ a: { at: 1, name: "A" } });
  });
  it("forgets the oldest beyond its size", () => {
    const full = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`u${i}`, { at: 1000 + i }]));
    const next = withRemoved(full, "new", { at: 9999 });
    expect(Object.keys(next)).toHaveLength(2000);
    expect(next.u0).toBeUndefined();
    expect(next.u1).toEqual({ at: 1001 });
    expect(next.new).toEqual({ at: 9999 });
    expect(Object.keys(withRemoved({ a: { at: 3 }, b: { at: 1 }, c: { at: 2 } }, "d", { at: 4 }, 2)).sort()).toEqual(["a", "d"]);
  });
});
