import { accountLinks } from "../src/components/Layout";

describe("account links", () => {
  it("give platform admins All users, and no one else", () => {
    expect(accountLinks("superadmin", true).map((l) => l.path)).toContain("/super/people");
    for (const role of ["learner", "student", "teacher", "orgAdmin"] as const) expect(accountLinks(role, true).map((l) => l.path)).not.toContain("/super/people");
    expect(accountLinks("superadmin", false)).toEqual([]);
  });
});
