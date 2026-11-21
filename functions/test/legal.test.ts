// The privacy notice and the terms (legal.ts; TECHNICAL.md): only platform admins save and publish,
// a publish numbers the version and rewrites the public file from both documents, and an account records only the
// version that is published now. The texts here are placeholders: the real wording is the owner's.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import { acceptedVersions, MAX_BYTES, MAX_TEXT, mergeDraft, nextVersion, publicFile, publishable, validateText } from "../src/legalCore";

const out = vi.hoisted(() => ({ audits: [] as Record<string, unknown>[], files: new Map<string, unknown>(), saves: 0, failFile: false }));

vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const caller = (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    return { uid: req.auth.uid, role: (req.auth.token.role as string) ?? "learner", orgId: req.auth.token.orgId as string | undefined };
  };
  return {
    db: new FakeDb(), caller,
    requireSuper: async (req: Req) => { const c = caller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    audit: async (action: string, by: string, data: Record<string, unknown>) => { out.audits.push({ action, by, ...data }); },
  };
});
vi.mock("../src/storage.js", () => ({
  savePublicJson: async (path: string, data: unknown, isPublic = true) => {
    if (out.failFile) throw new Error("503 Storage is away");
    expect(isPublic).toBe(true);
    out.saves++;
    out.files.set(path, JSON.parse(JSON.stringify(data)));
  },
}));

const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const legal = await import("../src/legal");
type Run = { run: (req: unknown) => Promise<unknown> };
const as = (role: string | null, uid = `${role}-1`) => (role ? { auth: { uid, token: { role } } } : {});
const save = (data: unknown, role: string | null = "superadmin") => (legal.saveLegal as unknown as Run).run({ data, ...as(role) }) as Promise<{ version: number | null }>;
const accept = (data: unknown, uid: string | null = "u1") => (legal.acceptTerms as unknown as Run).run({ data, ...(uid ? as("learner", uid) : {}) }) as Promise<{ ok: boolean; recorded: boolean }>;
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => e.details?.reason ?? e.code);
type Entry = { draft?: Record<string, string>; published?: { version: number; at: number; by: string }; lastVersion?: number };
const config = (doc: "privacy" | "terms") => (db.docs.get("config/legal") as Record<string, Entry> | undefined)?.[doc];
type PublicDoc = { version: number; at: string; text: Record<string, string> } | null;
const file = () => out.files.get("content/legal.json") as { v: number; privacy: PublicDoc; terms: PublicDoc } | undefined;

const EN = "Placeholder notice, version one.", AR = "نص تجريبي للإشعار.";

beforeEach(() => {
  db.docs.clear(); db.writes.length = 0;
  out.audits.length = 0; out.files.clear(); out.saves = 0; out.failFile = false;
  db.docs.set("users/u1", { name: "Mona", role: "learner" });
});

describe("the texts (legalCore)", () => {
  it("are a map of language code to plain text of at most 60,000 characters", () => {
    expect(validateText({ en: "a\r\nb", ar: AR, "pt-BR": "x", fil: "" })).toEqual({ en: "a\nb", ar: AR, "pt-BR": "x", fil: "" });
    expect(validateText(undefined)).toEqual({});
    expect(validateText({ en: "x".repeat(MAX_TEXT) })).not.toBeNull();
    for (const bad of [{ en: "x".repeat(MAX_TEXT + 1) }, { EN: "x" }, { english: "x" }, { "en_US": "x" }, { __proto__x: "x" }, { en: 4 }, { en: null }, { en: { html: "x" } }, ["x"], "x", 3]) {
      expect(validateText(bad)).toBeNull();
    }
  });
  it("a save changes the languages sent, removes one sent empty, keeps the rest, and refuses a whole that is too big", () => {
    expect(mergeDraft({ en: EN, ar: AR }, { ar: "جديد" })).toEqual({ en: EN, ar: "جديد" });
    expect(mergeDraft({ en: EN, ar: AR }, { ar: "  " })).toEqual({ en: EN });
    expect(mergeDraft(undefined, { en: EN })).toEqual({ en: EN });
    const big = "ش".repeat(MAX_TEXT); // 120,000 bytes each
    expect(mergeDraft({ en: big, ar: big, fa: big }, { ur: big })).toBeNull();
    expect(Buffer.byteLength(big) * 4).toBeGreaterThan(MAX_BYTES);
    expect(mergeDraft({ en: big, ar: big }, { fa: big })).not.toBeNull();
  });
  it("publishing needs English, and leaves out empty languages", () => {
    expect(publishable({ en: ` ${EN}\n`, ar: AR, fr: "  " })).toEqual({ en: EN, ar: AR });
    expect(publishable({ ar: AR })).toBeNull();
    expect(publishable({ en: " \n ", ar: AR })).toBeNull();
    expect(publishable({})).toBeNull();
  });
  it("a version number is never used twice, also after an unpublish", () => {
    expect(nextVersion(undefined)).toBe(1);
    expect(nextVersion({ published: { version: 3, at: 1, by: "x" } })).toBe(4);
    expect(nextVersion({ lastVersion: 5 })).toBe(6);
  });
  it("the public file lists each published document, or null", () => {
    expect(publicFile({})).toEqual({ v: 1, privacy: null, terms: null });
    expect(publicFile({ terms: { version: 2, at: Date.UTC(2026, 10, 11), text: { en: EN } }, privacy: { version: 1, text: {} } }))
      .toEqual({ v: 1, privacy: null, terms: { version: 2, at: "2026-11-11T00:00:00.000Z", text: { en: EN } } });
  });
  it("an acceptance names exactly the versions published now", () => {
    const now = { privacy: 3, terms: 1 };
    expect(acceptedVersions({ privacy: 3, terms: 1 }, now)).toEqual({ privacy: 3, terms: 1 });
    expect(acceptedVersions({ terms: 1 }, now)).toEqual({ terms: 1 });
    for (const bad of [{ privacy: 2 }, { privacy: 4 }, { privacy: 3, terms: 2 }, { privacy: "3" }, { privacy: 3.5 }, {}, null, { other: 1 }]) expect(acceptedVersions(bad, now)).toBeNull();
    expect(acceptedVersions({ terms: 1 }, { privacy: 3 })).toBeNull(); // not published
  });
});

describe("saveLegal", () => {
  it("is for platform admins only", async () => {
    for (const role of ["orgAdmin", "teacher", "student", "learner"]) {
      expect(await refusal(save({ doc: "privacy", text: { en: EN }, publish: true }, role))).toBe("permission-denied");
      expect(await refusal(save({ doc: "privacy", unpublish: true }, role))).toBe("permission-denied");
    }
    expect(await refusal(save({ doc: "privacy", text: { en: EN } }, null))).toBe("unauthenticated");
    expect(db.docs.has("config/legal")).toBe(false);
    expect(out.saves).toBe(0);
    expect(out.audits).toEqual([]);
  });
  it("refuses a document it doesn't know and text that isn't a map of languages", async () => {
    expect(await refusal(save({ doc: "cookies", text: { en: EN } }))).toBe("legal-doc");
    expect(await refusal(save({ text: { en: EN } }))).toBe("legal-doc");
    expect(await refusal(save({ doc: "terms", text: { en: "x".repeat(MAX_TEXT + 1) } }))).toBe("legal-text");
    expect(await refusal(save({ doc: "terms", text: { English: EN } }))).toBe("legal-text");
    expect(await refusal(save({ doc: "terms", text: "plain" }))).toBe("legal-text");
    expect(await refusal(save({ doc: "terms", publish: true, unpublish: true }))).toBe("legal-doc");
    expect(db.docs.has("config/legal")).toBe(false);
  });
  it("stores a draft without publishing anything, and audits it without the text", async () => {
    expect(await save({ doc: "privacy", text: { en: EN, ar: AR }, publish: false })).toEqual({ version: null });
    expect(config("privacy")).toEqual({ draft: { en: EN, ar: AR } });
    expect(db.docs.get("config/legal")).toMatchObject({ updatedBy: "superadmin-1" });
    expect(db.docs.has("config/legalPublished")).toBe(false);
    expect(out.saves).toBe(0);
    // One language at a time never wipes the others; a language sent empty is removed.
    await save({ doc: "privacy", text: { ar: "نص آخر" } });
    expect(config("privacy")!.draft).toEqual({ en: EN, ar: "نص آخر" });
    await save({ doc: "privacy", text: { ar: "" } });
    expect(config("privacy")!.draft).toEqual({ en: EN });
    expect(out.audits).toHaveLength(3);
    expect(out.audits[0]).toEqual({ action: "saveLegal", by: "superadmin-1", doc: "privacy", publish: false, version: null });
    expect(JSON.stringify(out.audits)).not.toContain("Placeholder");
  });
  it("refuses to publish without an English text, and publishes nothing", async () => {
    expect(await refusal(save({ doc: "terms", text: { ar: AR }, publish: true }))).toBe("legal-text");
    expect(await refusal(save({ doc: "terms", text: { en: "  \n", ar: AR }, publish: true }))).toBe("legal-text");
    expect(await refusal(save({ doc: "terms", publish: true }))).toBe("legal-text");
    expect(db.docs.has("config/legalPublished")).toBe(false);
    expect(config("terms")?.published).toBeUndefined();
    expect(out.saves).toBe(0);
    expect(out.audits).toEqual([]);
  });
  it("a publish bumps the version, stamps it, and writes the file with both documents", async () => {
    const t0 = Date.now();
    expect(await save({ doc: "privacy", text: { en: EN, ar: AR }, publish: true })).toEqual({ version: 1 });
    expect(file()).toEqual({ v: 1, privacy: { version: 1, at: expect.any(String), text: { en: EN, ar: AR } }, terms: null });
    expect(Date.parse(file()!.privacy!.at)).toBeGreaterThanOrEqual(t0);
    expect(config("privacy")).toMatchObject({ draft: { en: EN, ar: AR }, published: { version: 1, by: "superadmin-1" }, lastVersion: 1 });
    expect(new Date(config("privacy")!.published!.at).toISOString()).toBe(file()!.privacy!.at);

    expect(await save({ doc: "terms", text: { en: "Terms placeholder." }, publish: true })).toEqual({ version: 1 });
    expect(await save({ doc: "privacy", text: { en: "Placeholder notice, version two." }, publish: true })).toEqual({ version: 2 });
    expect(file()).toMatchObject({
      v: 1,
      privacy: { version: 2, text: { en: "Placeholder notice, version two.", ar: AR } }, // Arabic stayed in the draft
      terms: { version: 1, text: { en: "Terms placeholder." } },
    });
    expect(out.audits.map((a) => [a.doc, a.publish, a.version])).toEqual([["privacy", true, 1], ["terms", true, 1], ["privacy", true, 2]]);
    expect(JSON.stringify(out.audits)).not.toContain("laceholder");
  });
  it("keeps every published version word for word, also after a newer one and after an unpublish", async () => {
    await save({ doc: "privacy", text: { en: EN, ar: AR }, publish: true });
    await save({ doc: "privacy", text: { en: "Placeholder notice, version two." } }); // a draft is no version
    expect([...db.docs.keys()].filter((k) => k.startsWith("config/legal/versions/"))).toEqual(["config/legal/versions/privacy-1"]);
    await save({ doc: "privacy", publish: true });
    await save({ doc: "privacy", unpublish: true });
    await save({ doc: "terms", text: { en: "Terms placeholder." }, publish: true });
    // What someone who accepted privacy version 1 agreed to can still be shown, though the file no longer has it.
    expect(db.docs.get("config/legal/versions/privacy-1")).toEqual({ doc: "privacy", version: 1, at: expect.any(Number), by: "superadmin-1", text: { en: EN, ar: AR } });
    expect(db.docs.get("config/legal/versions/privacy-2")).toMatchObject({ doc: "privacy", version: 2, text: { en: "Placeholder notice, version two.", ar: AR } });
    expect(db.docs.get("config/legal/versions/terms-1")).toMatchObject({ doc: "terms", version: 1, text: { en: "Terms placeholder." } });
    expect(file()!.privacy).toBeNull();
    // A publish that is refused leaves no version behind.
    expect(await refusal(save({ doc: "terms", text: { en: " " }, publish: true }))).toBe("legal-text");
    expect(db.docs.has("config/legal/versions/terms-2")).toBe(false);
  });
  it("publishes the saved draft as it is when no text is sent", async () => {
    await save({ doc: "terms", text: { en: EN } });
    expect(await save({ doc: "terms", publish: true })).toEqual({ version: 1 });
    expect(file()!.terms).toMatchObject({ version: 1, text: { en: EN } });
  });
  it("a later draft changes nothing people see until it is published", async () => {
    await save({ doc: "privacy", text: { en: EN }, publish: true });
    const before = structuredClone(file()), saves = out.saves;
    expect(await save({ doc: "privacy", text: { en: "A new draft." } })).toEqual({ version: 1 }); // still the published version
    expect(file()).toEqual(before);
    expect(out.saves).toBe(saves);
    expect(config("privacy")).toMatchObject({ draft: { en: "A new draft." }, published: { version: 1 } });
  });
  it("unpublish removes one document from the file and keeps the other; a new publish gets a new number", async () => {
    await save({ doc: "privacy", text: { en: EN }, publish: true });
    await save({ doc: "privacy", text: { en: EN }, publish: true });
    await save({ doc: "terms", text: { en: "Terms placeholder." }, publish: true });
    expect(await save({ doc: "privacy", unpublish: true })).toEqual({ version: null });
    expect(file()).toMatchObject({ v: 1, privacy: null, terms: { version: 1, text: { en: "Terms placeholder." } } });
    expect(config("privacy")).toEqual({ draft: { en: EN }, lastVersion: 2 }); // the draft stays, the stamp goes
    expect(config("terms")!.published!.version).toBe(1);
    expect(out.audits.at(-1)).toEqual({ action: "saveLegal", by: "superadmin-1", doc: "privacy", publish: false, version: null, unpublish: true, was: 2 });
    // Nobody can accept what isn't published.
    expect(await refusal(accept({ privacy: 2 }))).toBe("legal-version");
    expect(await save({ doc: "privacy", publish: true })).toEqual({ version: 3 });
    expect(file()).toMatchObject({ privacy: { version: 3 }, terms: { version: 1 } });
    // Unpublishing what isn't published is harmless.
    await save({ doc: "privacy", unpublish: true });
    expect(await save({ doc: "privacy", unpublish: true })).toEqual({ version: null });
    expect(file()).toMatchObject({ privacy: null, terms: { version: 1 } });
  });
  it("says so when the public file can't be written, and publishing again writes it", async () => {
    out.failFile = true;
    expect(await refusal(save({ doc: "terms", text: { en: EN }, publish: true }))).toBe("legal-file");
    expect(file()).toBeUndefined();
    expect(config("terms")!.published!.version).toBe(1); // recorded and audited all the same
    expect(out.audits).toHaveLength(1);
    out.failFile = false;
    expect(await save({ doc: "terms", publish: true })).toEqual({ version: 2 });
    expect(file()!.terms).toMatchObject({ version: 2, text: { en: EN } });
    // An unpublish the file missed says what to do again (not "publish"), and doing it again takes the text down.
    out.failFile = true;
    const failed = await save({ doc: "terms", unpublish: true }).then(() => null, (e: { message: string; details?: { reason?: string } }) => e);
    expect(failed).toMatchObject({ details: { reason: "legal-file" } });
    expect(failed!.message).toContain("Unpublish again");
    expect(file()!.terms).not.toBeNull(); // still public: the admin was told
    out.failFile = false;
    await save({ doc: "terms", unpublish: true });
    expect(file()!.terms).toBeNull();
  });
});

describe("acceptTerms", () => {
  beforeEach(async () => {
    await save({ doc: "privacy", text: { en: EN }, publish: true });
    await save({ doc: "privacy", text: { en: EN }, publish: true }); // privacy v2
    await save({ doc: "terms", text: { en: "Terms placeholder." }, publish: true }); // terms v1
  });
  it("refuses a version that isn't the published one, and records nothing", async () => {
    for (const bad of [{ privacy: 1 }, { privacy: 3 }, { terms: 2 }, { privacy: 2, terms: 9 }, { privacy: "2" }, {}, undefined]) expect(await refusal(accept(bad))).toBe("legal-version");
    expect(db.docs.get("users/u1")).toEqual({ name: "Mona", role: "learner" });
  });
  it("needs a signed-in account", async () => {
    expect(await refusal(accept({ privacy: 2 }, null))).toBe("unauthenticated");
  });
  it("records the published version on the profile, and a later acceptance keeps the earlier one", async () => {
    expect(await accept({ privacy: 2 })).toEqual({ ok: true, recorded: true });
    expect(db.docs.get("users/u1")).toMatchObject({ name: "Mona", role: "learner", terms: { privacy: 2, at: expect.any(Number) } });
    expect(await accept({ terms: 1 })).toEqual({ ok: true, recorded: true });
    expect(db.docs.get("users/u1")!.terms).toMatchObject({ privacy: 2, terms: 1 });
    // A new version is published: the old acceptance stays on record until the person accepts the new one.
    await save({ doc: "privacy", publish: true });
    expect(await refusal(accept({ privacy: 2 }))).toBe("legal-version");
    expect(await accept({ privacy: 3, terms: 1 })).toEqual({ ok: true, recorded: true });
    expect(db.docs.get("users/u1")!.terms).toMatchObject({ privacy: 3, terms: 1 });
    expect(Object.keys(db.docs.get("users/u1")!).sort()).toEqual(["name", "role", "terms"]);
  });
  it("never creates a profile: an account without one yet gets ok and nothing is written", async () => {
    expect(await accept({ privacy: 2, terms: 1 }, "newcomer")).toEqual({ ok: true, recorded: false });
    expect(db.docs.has("users/newcomer")).toBe(false);
    // Nor when the profile goes between the read and the write (an account being deleted): Firestore's NOT_FOUND.
    const real = db.doc.bind(db);
    const spy = vi.spyOn(db, "doc").mockImplementation((path: string) => (path === "users/u1"
      ? { ...real(path), update: async () => { db.docs.delete(path); throw Object.assign(new Error("5 NOT_FOUND"), { code: 5 }); } }
      : real(path)));
    try { expect(await accept({ privacy: 2 })).toEqual({ ok: true, recorded: false }); } finally { spy.mockRestore(); }
    expect(db.docs.has("users/u1")).toBe(false);
  });
});
