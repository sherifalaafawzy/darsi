// Bulk accounts (createMembers): logins for names in any script, the order accounts are made in so pupils find a
// teacher from the same sheet, and what a login that is already taken means. Plus who may name a first admin.
import { describe, expect, it } from "vitest";
import { creationOrder, MAX_DRAWS, missingBasics, onCreateError, teacherKeys } from "../src/membersCore";
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
  it("a new teacher can be named by email, by username, or by the username's login email", () => {
    expect(teacherKeys("Amina.Bello@School.org", null, usernameToEmail)).toEqual(["amina.bello@school.org"]);
    expect(teacherKeys(usernameToEmail("t.one"), "t.one", usernameToEmail).sort()).toEqual(["t.one", "t.one@users.darsi.app"]);
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
    expect(handMadeUsername("khaled.omar@users.darsi.app", undefined)).toBe(true);
    expect(handMadeUsername("Khaled.Omar@USERS.darsi.app", null)).toBe(true);
    expect(handMadeUsername("khaled.omar@users.darsi.app", "admin1")).toBe(false); // createMembers made it
    expect(handMadeUsername("khaled@gmail.com", undefined)).toBe(false);
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
