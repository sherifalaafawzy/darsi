// An organization's homepage (orgPage.ts manageOrgPage, shared/page.ts checkPage): who may change it, a draft with
// problems is kept but never published, publishing writes the public file, unpublishing removes it, all audited.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import { checkPage, safeHref, textIn } from "../src/shared/page";

const m = vi.hoisted(() => ({
  audits: [] as { action: string; by: string; data: Record<string, unknown> }[],
  files: new Map<string, { body: string; cache: string }>(),
  deleted: [] as string[],
  caller: { uid: "a1", role: "orgAdmin", orgId: "o1" } as { uid: string; role: string; orgId: string | null },
}));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  return { db: new FakeDb(), audit: async (action: string, by: string, data: Record<string, unknown>) => { m.audits.push({ action, by, data }); } };
});
vi.mock("../src/orgMembers.js", async () => {
  const { HttpsError } = await import("firebase-functions/v2/https");
  return {
    orgAdmin: async (req: { auth?: unknown }, orgId: string) => {
      if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.", { reason: "signed-out" });
      const c = m.caller;
      if (c.role !== "superadmin" && (c.role !== "orgAdmin" || c.orgId !== orgId)) throw new HttpsError("permission-denied", "No.", { reason: "not-org-admin" });
      return c;
    },
  };
});
vi.mock("../src/storage.js", () => ({
  saveJson: async (path: string, body: string, cache: string) => { m.files.set(path, { body, cache }); },
  bucket: () => ({ file: (p: string) => ({ delete: async () => { m.deleted.push(p); m.files.delete(p); } }) }),
}));
const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { manageOrgPage } = await import("../src/orgPage");
const run = (data: Record<string, unknown>) => (manageOrgPage as unknown as { run: (r: unknown) => Promise<Record<string, unknown>> }).run({ auth: { uid: m.caller.uid, token: {} }, data });
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e: { details?: { reason?: string } }) => e.details?.reason ?? String(e));

const PAGE = {
  v: 1, langs: ["en", "ar"],
  blocks: [
    { id: "aaaa1", kind: "text", heading: { en: "Welcome", ar: "أهلًا" }, body: { en: "We teach AI.", ar: "نعلّم الذكاء الاصطناعي." } },
    { id: "aaaa2", kind: "button", label: { en: "Visit us" }, href: "https://school.edu/visit" },
    { id: "aaaa3", kind: "contact", heading: {}, email: "info@school.edu", phone: "+20 100 555 0199", address: {}, website: "" },
  ],
};

beforeEach(() => { db.docs.clear(); m.audits = []; m.files.clear(); m.deleted = []; m.caller = { uid: "a1", role: "orgAdmin", orgId: "o1" }; });

describe("checkPage", () => {
  it("keeps a good page, trimmed, and drops languages and keys it doesn't know", () => {
    const { page, problems } = checkPage({ ...PAGE, langs: ["en", "ar", "<x>"], blocks: [{ ...PAGE.blocks[0], body: { en: "  We teach AI.  ", xx: "no" }, extra: 1 }] }, "o1");
    expect(problems).toEqual([]);
    expect(page!.langs).toEqual(["en", "ar"]);
    expect(page!.blocks[0]).toEqual({ id: "aaaa1", kind: "text", heading: { en: "Welcome", ar: "أهلًا" }, body: { en: "We teach AI." } });
  });
  it("marks what a block needs, bad links, addresses and pictures, and too much", () => {
    const { problems } = checkPage({ v: 1, langs: ["en"], blocks: [
      { id: "b1aa", kind: "text", heading: {}, body: {} },
      { id: "b2aa", kind: "button", label: { en: "Go" }, href: "javascript:alert(1)" },
      { id: "b3aa", kind: "contact", heading: {}, email: "not-an-email", phone: "call me", address: {}, website: "http://plain.example" },
      { id: "b4aa", kind: "image", src: "content/pages/OTHER/img-abcdef.webp", alt: { en: "x" }, caption: {} },
      { id: "b5aa", kind: "faq", heading: {}, items: [] },
      { id: "b6aa", kind: "html", body: "<script>" },
    ] }, "o1");
    expect(problems.map((p) => `${p.block}:${p.field}:${p.code}`)).toEqual([
      "0:body:missing", "1:href:bad-link", "2:email:bad-email", "2:phone:bad-phone", "2:website:bad-link", "3:src:bad-image", "4:items:missing", "5:kind:bad",
    ]);
    expect(checkPage({ v: 1, langs: ["en"], blocks: Array.from({ length: 31 }, (_, i) => ({ id: `t${i}aaa`, kind: "text", body: { en: "x" } })) }, "o1").problems[0]).toMatchObject({ field: "blocks", code: "too-many" });
  });
  it("only https links, and mailto/tel only on a button; a language left empty falls back to the page's first", () => {
    expect(safeHref("https://school.edu/a")).toBe("https://school.edu/a");
    for (const bad of ["http://school.edu", "javascript:x", "data:text/html,x", "https://user:pw@school.edu", "mailto:a@b.co"]) expect(safeHref(bad)).toBeNull();
    expect(safeHref("mailto:info@school.edu", true)).toBe("mailto:info@school.edu");
    expect(safeHref("tel:+201005550199", true)).toBe("tel:+201005550199");
    expect(textIn({ en: "Hello", ar: "" }, "ar", ["en", "ar"])).toBe("Hello");
    expect(textIn({ ar: "أهلًا" }, "fr", ["en", "ar"])).toBe("أهلًا");
  });
});

describe("manageOrgPage", () => {
  it("only this organization's admins (and platform admins) change its page", async () => {
    m.caller = { uid: "x1", role: "orgAdmin", orgId: "o2" };
    expect(await reason(run({ action: "save", orgId: "o1", page: PAGE }))).toBe("not-org-admin");
    m.caller = { uid: "s1", role: "student", orgId: "o1" };
    expect(await reason(run({ action: "publish", orgId: "o1", page: PAGE }))).toBe("not-org-admin");
    m.caller = { uid: "boss", role: "superadmin", orgId: null };
    expect(await reason(run({ action: "save", orgId: "o1", page: PAGE }))).toBe("ok");
    expect(db.docs.size).toBe(1);
  });

  it("saves a draft with its problems, never publishes it, and a save that changes nothing writes nothing", async () => {
    const bad = { ...PAGE, blocks: [...PAGE.blocks, { id: "bad01", kind: "button", label: { en: "x" }, href: "ftp://x" }] };
    expect(await run({ action: "save", orgId: "o1", page: bad })).toMatchObject({ rev: 1, problems: [expect.objectContaining({ block: 3, code: "bad-link" })] });
    expect(await reason(run({ action: "publish", orgId: "o1", page: bad }))).toBe("page-problems");
    expect(m.files.size).toBe(0);
    expect(await run({ action: "save", orgId: "o1", page: bad })).toMatchObject({ rev: 1 });
    expect(m.audits.map((a) => a.action)).toEqual(["saveOrgPage"]);
  });

  it("publishes the checked page for everyone, five minutes in caches, and unpublishes it; the draft stays", async () => {
    const out = await run({ action: "publish", orgId: "o1", page: PAGE });
    expect(out).toMatchObject({ ok: true, rev: 1 });
    const file = m.files.get("content/pages/o1/page.json")!;
    expect(file.cache).toBe("public, max-age=300");
    expect(JSON.parse(file.body)).toEqual(checkPage(PAGE, "o1").page);
    expect(db.docs.get("orgs/o1/private/page")).toMatchObject({ rev: 1, publishedRev: 1, updatedBy: "a1" });
    expect(await run({ action: "get", orgId: "o1" })).toMatchObject({ rev: 1, publishedRev: 1, page: { langs: ["en", "ar"] } });
    await run({ action: "unpublish", orgId: "o1" });
    expect(m.deleted).toEqual(["content/pages/o1/page.json"]);
    expect(db.docs.get("orgs/o1/private/page")).toMatchObject({ rev: 1, publishedRev: null });
    expect(m.audits.map((a) => a.action)).toEqual(["saveOrgPage", "publishOrgPage", "unpublishOrgPage"]);
  });

  it("refuses something that isn't a page, a page too long, and an unknown action", async () => {
    expect(await reason(run({ action: "save", orgId: "o1", page: "<html>" }))).toBe("bad-page");
    const long = { v: 1, langs: ["en"], blocks: Array.from({ length: 30 }, (_, i) => ({ id: `t${i}aaa`, kind: "text", body: { en: "x".repeat(3999) } })) };
    expect(await reason(run({ action: "save", orgId: "o1", page: long }))).toBe("page-too-long");
    expect(await reason(run({ action: "delete", orgId: "o1" }))).toBe("bad-action");
  });
});
