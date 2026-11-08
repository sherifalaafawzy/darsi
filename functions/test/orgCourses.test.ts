// Which courses an organization's members see (TECHNICAL.md "Course visibility in organizations"): the shared checks
// (shared/orgCourses.ts, the web app's own file), what one member sees, and setOrgCourses with an in-memory Firestore.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { checkOrgCourses, COURSE_ID, ORG_COURSES_MAX, readOrgCourses, sameSees, seesFor } from "../src/shared/orgCourses";
import { UNIT_ID } from "../src/shared/validate";

const audits = vi.hoisted(() => [] as { action: string; by: string; data: Record<string, unknown> }[]);
vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  // Like admin.ts: the claims Auth holds now, not the token's.
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, freshCaller,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { audits.push({ action, by, data }); },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});

const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const { setOrgCourses } = (await import("../src/orgCourses")) as unknown as { setOrgCourses: { run: (req: unknown) => Promise<{ courses: unknown }> } };
const as = (uid: string, data: Record<string, unknown>) => ({ auth: { uid, token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => `${e.code}:${e.details?.reason ?? "no reason"}`);
const ids = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

describe("checkOrgCourses", () => {
  it("keeps every course by default, and stores a choice sorted, without repeats or empty classes", () => {
    expect(checkOrgCourses({ mode: "all", teachers: ["x-1"] })).toEqual({ value: { mode: "all" } });
    expect(checkOrgCourses({ mode: "chosen", teachers: ["ai-4-1", "ai-2-1", "ai-4-1"], students: ["ai-s4"], groups: { "Grade 7B": ["cyber-s4", "ai-s3"], "Grade 7A": [], "": undefined } }))
      .toEqual({ problem: "courses-class" });
    expect(checkOrgCourses({ mode: "chosen", teachers: ["ai-4-1", "ai-2-1", "ai-4-1"], students: ["ai-s4"], groups: { "Grade 7B": ["cyber-s4", "ai-s3"], "Grade 7A": [] } }))
      .toEqual({ value: { mode: "chosen", teachers: ["ai-2-1", "ai-4-1"], students: ["ai-s4"], groups: { "Grade 7B": ["ai-s3", "cyber-s4"] } } });
    // Missing lists are empty: an organization can show its students nothing at all.
    expect(checkOrgCourses({ mode: "chosen" })).toEqual({ value: { mode: "chosen", teachers: [], students: [], groups: {} } });
    // Organization courses (u + 8 characters) and every public id are course ids.
    expect(checkOrgCourses({ mode: "chosen", students: ["uab12cd34", "ds-s4", "capstone-ai-3"] })).toMatchObject({ value: { students: ["capstone-ai-3", "ds-s4", "uab12cd34"] } });
  });

  it("refuses unknown modes and anything that isn't a list of course ids, with a reason code", () => {
    expect(checkOrgCourses(undefined)).toEqual({ problem: "courses-mode" });
    expect(checkOrgCourses({ mode: "some" })).toEqual({ problem: "courses-mode" });
    expect(checkOrgCourses(["all"])).toEqual({ problem: "courses-mode" });
    expect(checkOrgCourses({ mode: "chosen", teachers: "ai-4-1" })).toEqual({ problem: "courses-list" });
    expect(checkOrgCourses({ mode: "chosen", groups: ["7A"] })).toEqual({ problem: "courses-list" });
    expect(checkOrgCourses({ mode: "chosen", groups: { "7A": "ai-s1" } })).toEqual({ problem: "courses-list" });
    for (const bad of ["AI-1", "a", "-ai", "ai 1", "x".repeat(41), 7, null, { id: "ai-1" }]) {
      expect(checkOrgCourses({ mode: "chosen", students: [bad] }), String(bad)).toEqual({ problem: "courses-id" });
    }
  });

  it("refuses class names the people pages can't save, and Firestore's reserved names", () => {
    for (const name of [" 7A", "7A ", "x".repeat(ORG_COURSES_MAX.group + 1), "__name__"]) {
      expect(checkOrgCourses({ mode: "chosen", groups: { [name]: ["ai-s1"] } }), name).toEqual({ problem: "courses-class" });
    }
    expect(checkOrgCourses({ mode: "chosen", groups: { "الصف السابع (أ)": ["ai-s1"], ["x".repeat(60)]: ["ai-s1"], "Grade 7.A / B": ["ai-s1"] } })).toHaveProperty("value");
  });

  it("keeps the org document small: 300 courses a list, 60 classes, 2,000 choices in all", () => {
    expect(checkOrgCourses({ mode: "chosen", teachers: ids(300) })).toHaveProperty("value");
    expect(checkOrgCourses({ mode: "chosen", teachers: ids(301) })).toEqual({ problem: "courses-many" });
    expect(checkOrgCourses({ mode: "chosen", groups: { "7A": ids(301) } })).toEqual({ problem: "courses-many" });
    // Repeats don't count against the bound.
    expect(checkOrgCourses({ mode: "chosen", students: [...ids(300), ...ids(300)] })).toHaveProperty("value");
    const classes = (n: number, each: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`Class ${i}`, ids(each)]));
    expect(checkOrgCourses({ mode: "chosen", groups: classes(60, 1) })).toHaveProperty("value");
    expect(checkOrgCourses({ mode: "chosen", groups: classes(61, 1) })).toEqual({ problem: "courses-classes" });
    // Empty classes are dropped before counting.
    expect(checkOrgCourses({ mode: "chosen", groups: { ...classes(60, 1), ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Empty ${i}`, []])) } })).toHaveProperty("value");
    expect(checkOrgCourses({ mode: "chosen", teachers: ids(300), students: ids(300), groups: classes(14, 100) })).toHaveProperty("value"); // 2,000
    expect(checkOrgCourses({ mode: "chosen", teachers: ids(300), students: ids(300), groups: classes(15, 100) })).toEqual({ problem: "courses-total" });
  });

  it("uses the same course id rule as the course editor", () => {
    expect(String(COURSE_ID)).toBe(String(UNIT_ID));
  });
});

describe("what one member sees (seesFor)", () => {
  const courses = { mode: "chosen", teachers: ["ai-4-1", "ai-u1"], students: ["ai-s4"], groups: { "7A": ["cyber-s4", "ai-s4"], Staff: ["ai-2-1"] } };
  it("a teacher their role's list and their class's, a student theirs, sorted and without repeats", () => {
    expect(seesFor(courses, "teacher")).toEqual(["ai-4-1", "ai-u1"]);
    expect(seesFor(courses, "teacher", "Staff")).toEqual(["ai-2-1", "ai-4-1", "ai-u1"]);
    expect(seesFor(courses, "student", "7A")).toEqual(["ai-s4", "cyber-s4"]);
    expect(seesFor(courses, "student", "7B")).toEqual(["ai-s4"]);
    expect(seesFor(courses, "student", null)).toEqual(["ai-s4"]);
    // A class named like an object's own keys is just a class.
    expect(seesFor(courses, "student", "constructor")).toEqual(["ai-s4"]);
  });
  it("everything for admins, for anyone else, and when the organization hasn't chosen or the field is damaged", () => {
    expect(seesFor(courses, "orgAdmin", "7A")).toBeNull();
    expect(seesFor(courses, "superadmin")).toBeNull();
    expect(seesFor(courses, "learner")).toBeNull();
    expect(seesFor(courses, undefined)).toBeNull();
    expect(seesFor({ mode: "all" }, "student")).toBeNull();
    expect(seesFor(undefined, "student")).toBeNull();
    expect(seesFor({ mode: "chosen", students: "everything" }, "student")).toBeNull();
    expect(readOrgCourses({ mode: "chosen", students: [1] })).toEqual({ mode: "all" });
  });
  it("compares stored lists, with no list meaning every course", () => {
    expect(sameSees(undefined, null)).toBe(true);
    expect(sameSees(["a1", "b2"], ["a1", "b2"])).toBe(true);
    expect(sameSees(["a1"], ["a1", "b2"])).toBe(false);
    expect(sameSees([], null)).toBe(false);
  });
});

describe("setOrgCourses", () => {
  beforeEach(() => {
    db.docs.clear(); auth.users.clear(); audits.length = 0;
    auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
    auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1" } });
    auth.users.set("adm2", { uid: "adm2", customClaims: { role: "orgAdmin", orgId: "o2" } });
    auth.users.set("tch", { uid: "tch", customClaims: { role: "teacher", orgId: "o1" } });
    // A token that still says orgAdmin after a demotion: the claims Auth holds now decide.
    auth.users.set("was", { uid: "was", customClaims: { role: "teacher", orgId: "o1" } });
    db.docs.set("orgs/o1", { name: "Nile School", status: "active", brand: { logo: null, v: 2 } });
    db.docs.set("orgs/o2", { name: "Delta School", status: "active" });
  });
  const chosen = { mode: "chosen", teachers: ["ai-4-1"], students: ["ai-s4", "ai-s4"], groups: { "7A": ["cyber-s4"], "7B": [] } };

  it("lets the organization's admins save a choice, stored in its own form and audited with counts", async () => {
    const r = await setOrgCourses.run(as("adm", { orgId: "o1", courses: chosen }));
    const stored = { mode: "chosen", teachers: ["ai-4-1"], students: ["ai-s4"], groups: { "7A": ["cyber-s4"] } };
    expect(r).toEqual({ courses: stored });
    expect(db.docs.get("orgs/o1")).toMatchObject({ name: "Nile School", brand: { logo: null, v: 2 }, courses: stored });
    expect(audits).toEqual([{ action: "setOrgCourses", by: "adm", data: { orgId: "o1", mode: "chosen", teachers: 1, students: 1, groups: 1 } }]);
    // Back to every course.
    expect(await setOrgCourses.run(as("adm", { orgId: "o1", courses: { mode: "all" } }))).toEqual({ courses: { mode: "all" } });
    expect(db.docs.get("orgs/o1")?.courses).toEqual({ mode: "all" });
  });

  it("lets platform admins save for any organization", async () => {
    await setOrgCourses.run(as("root", { orgId: "o2", courses: chosen }));
    expect(db.docs.get("orgs/o2")?.courses).toMatchObject({ mode: "chosen", teachers: ["ai-4-1"] });
  });

  it("refuses everyone else, unknown modes, bad lists and missing organizations, with reason codes", async () => {
    expect(await refusal(setOrgCourses.run({ data: { orgId: "o1", courses: chosen } }))).toBe("unauthenticated:no reason");
    expect(await refusal(setOrgCourses.run(as("adm2", { orgId: "o1", courses: chosen })))).toBe("permission-denied:not-org-admin");
    expect(await refusal(setOrgCourses.run(as("tch", { orgId: "o1", courses: chosen })))).toBe("permission-denied:not-org-admin");
    expect(await refusal(setOrgCourses.run(as("was", { orgId: "o1", courses: chosen })))).toBe("permission-denied:not-org-admin");
    expect(await refusal(setOrgCourses.run(as("adm", { orgId: "o1", courses: { mode: "some" } })))).toBe("invalid-argument:courses-mode");
    expect(await refusal(setOrgCourses.run(as("adm", { orgId: "o1", courses: { mode: "chosen", students: ["<script>"] } })))).toBe("invalid-argument:courses-id");
    expect(await refusal(setOrgCourses.run(as("adm", { orgId: "o1", courses: { mode: "chosen", teachers: ids(301) } })))).toBe("invalid-argument:courses-many");
    expect(await refusal(setOrgCourses.run(as("adm", { orgId: "", courses: chosen })))).toBe("invalid-argument:no-org");
    expect(await refusal(setOrgCourses.run(as("root", { orgId: "gone", courses: chosen })))).toBe("not-found:no-org");
    expect(db.docs.get("orgs/o1")?.courses).toBeUndefined();
    expect(db.docs.has("orgs/gone")).toBe(false);
    expect(audits).toEqual([]);
  });
});
