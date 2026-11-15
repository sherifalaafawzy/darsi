import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { allFigureUrls, buildCatalog, canManage, catalogEntry, catalogPath, figurePath, figureUrls, idAllowed, isOwner, mediaPrefix, sizeByLang, sizeMB, staleVersions, unitPath, unitPrefix, versionOf } from "../src/catalog";
// The build script is plain JavaScript; scripts/copy-shared.d.mts types its exports.
import { FILES, transform } from "../scripts/copy-shared.mjs";
import type { Unit } from "../src/shared/types";
import { errorsOf, validateUnit } from "../src/shared/validate";

// For the callables at the end (publishUnit, unpublishUnit, deleteUnit): an in-memory Firestore, and the bucket itself
// as the stand-in, so storage.ts runs as it is (its saves wait out Storage's "too soon" answers). `refuse`: the paths
// whose every save gets a 429; `fail429`: how many of the next saves get one.
const audits = vi.hoisted(() => [] as { action: string; by: string; data: Record<string, unknown> }[]);
const store = vi.hoisted(() => ({ files: new Map<string, { body: string; cacheControl?: string }>(), refuse: new Set<string>(), fail429: 0, tries: 0 }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  const freshCaller = async (req: { auth?: { uid: string } }) => {
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
vi.mock("firebase-admin/storage", () => {
  const file = (path: string) => ({
    name: path,
    save: async (body: string, o: { metadata?: { cacheControl?: string } }) => {
      store.tries++;
      if (store.refuse.has(path) || (store.fail429 > 0 && store.fail429-- > 0)) throw Object.assign(new Error("The rate limit for object mutation has been exceeded"), { code: 429 });
      store.files.set(path, { body: String(body), cacheControl: o.metadata?.cacheControl });
    },
    delete: async () => { store.files.delete(path); },
    getMetadata: async () => { throw Object.assign(new Error("No such object"), { code: 404 }); },
  });
  return { getStorage: () => ({ bucket: () => ({ name: "darsi-f0685", file, getFiles: async ({ prefix }: { prefix: string }) => [[...store.files.keys()].filter((k) => k.startsWith(prefix)).map(file)] }) }) };
});
vi.mock("firebase-functions/v2", async (orig) => ({ ...(await orig<object>()), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.useFakeTimers({ toFake: ["setTimeout"] });

const root = join(__dirname, "..");
const ai1 = JSON.parse(readFileSync(join(root, "../content/retired/ai-1.json"), "utf8")) as Unit;

describe("shared copies", () => {
  it("match the web app's content types and validator", () => {
    for (const f of FILES) {
      const web = readFileSync(join(root, "../apps/web/src/content", f), "utf8");
      expect(readFileSync(join(root, "src/shared", f), "utf8"), `${f} is stale: run npm run build --prefix functions`).toBe(transform(web));
    }
  });
  it("validate the shipped unit the same way as the web app", () => {
    expect(errorsOf(validateUnit(ai1))).toEqual([]);
  });
});

describe("who may manage a unit", () => {
  const sup = { uid: "s", role: "superadmin" };
  const adminA = { uid: "a", role: "orgAdmin", orgId: "orgA" };
  const teacherA = { uid: "t", role: "teacher", orgId: "orgA" };
  const learner = { uid: "l", role: "learner" };
  it.each([
    [sup, "public", true], [sup, "orgA", true],
    [adminA, "orgA", true], [adminA, "orgB", false], [adminA, "public", false],
    [teacherA, "orgA", false], [learner, "public", false], [learner, "orgA", false],
  ])("%o on %s → %s", (c, owner, ok) => expect(canManage(c, owner)).toBe(ok));

  it("gives org units generated ids only", () => {
    expect(idAllowed("public", "ai-1")).toBe(true);
    expect(idAllowed("orgA", "uab12cd34")).toBe(true);
    expect(idAllowed("orgA", "ai-1")).toBe(false);
  });

  it("only accepts safe owner strings", () => {
    expect(isOwner("public")).toBe(true);
    expect(isOwner("Xy7_aB-9")).toBe(true);
    for (const bad of ["", "../x", "a/b", "a b", 3, null]) expect(isOwner(bad)).toBe(false);
  });
});

describe("Storage layout", () => {
  it("puts public units under content/ and org units under orgs/{orgId}/", () => {
    expect(catalogPath("public")).toBe("content/catalog.json");
    expect(unitPath("public", "u1", 3)).toBe("content/units/u1/v3.json");
    expect(catalogPath("orgA")).toBe("orgs/orgA/catalog.json");
    expect(unitPath("orgA", "u1", 1)).toBe("orgs/orgA/units/u1/v1.json");
    expect(unitPrefix("orgA", "u1")).toBe("orgs/orgA/units/u1/");
    expect(mediaPrefix("public", "u1")).toBe("content/media/u1/");
  });
  it("keeps the current and previous versions only", () => {
    const paths = [1, 2, 3, 4].map((v) => unitPath("public", "u1", v));
    expect(versionOf(paths[2])).toBe(3);
    expect(staleVersions(paths, 4)).toEqual(paths.slice(0, 2));
    expect(staleVersions(paths.slice(0, 1), 1)).toEqual([]);
  });
});

describe("catalog", () => {
  it("builds an entry the app can list and download", () => {
    const e = catalogEntry(ai1, "public", 2, 59_325);
    expect(e).toMatchObject({ id: "ai-1", track: "ai", level: 1, lessons: 3, available: true, src: "content/units/ai-1/v2.json", version: 2, owner: "public" });
    expect(e.sizeMB).toBe(sizeMB(ai1, 59_325));
    expect(e.sizeMB).toBeCloseTo(0.1 + 2.8 + 2.4 + 2.9, 5); // the JSON plus one language's videos
    expect(e).not.toHaveProperty("audience"); // a course for teachers
  });
  it("marks a course for students", () => {
    expect(catalogEntry({ ...ai1, audience: "students" }, "public", 1, 1000).audience).toBe("students");
    expect(catalogEntry({ ...ai1, audience: "teachers" }, "public", 1, 1000)).not.toHaveProperty("audience");
  });
  it("counts a light lesson instead of its MP4, since that's what a download stores", () => {
    const light = structuredClone(ai1);
    const v = light.lessons[0].steps.find((s) => s.type === "video")!;
    if (v.type === "video") v.light = { files: {}, langs: { en: "en", ar: "ar-EG" }, sizeKB: { en: 383, ar: 410 } };
    expect(sizeMB(light, 59_325)).toBeCloseTo(0.1 + 0.4 + 2.4 + 2.9, 5); // 410 KB, the larger language
  });
  it("counts each language's own kits and light lessons, and lists the largest for older phones", () => {
    const u = structuredClone(ai1);
    for (const l of u.lessons) {
      for (const s of l.steps) if (s.type === "video") { s.light = { files: {}, langs: { en: "en", ar: "ar-EG" }, sizeKB: { en: 512, ar: 512 } }; }
      l.kit = [
        { kind: "slides", title: { en: "Slides" }, pages: 1, formats: ["pdf", "pptx"], urls: {}, sizeKB: { en: { pdf: 100, pptx: 130 }, ar: { pdf: 300, pptx: 130 } } },
        { kind: "lesson-plan", title: { en: "Plan" }, pages: 1, formats: ["pdf"], urls: {}, sizeKB: { en: { pdf: 130 } } }, // Arabic falls back to English
        { kind: "video", title: { en: "Video" }, pages: 0, formats: ["mp4"], urls: {}, sizeKB: { en: { mp4: 5000 } } }, // never downloaded
      ];
    }
    const videos = u.lessons.reduce((a, l) => a + l.steps.filter((s) => s.type === "video").length, 0);
    const n = u.lessons.length;
    const by = sizeByLang(u, 100_000);
    expect(by.en).toBeCloseTo(Math.round((0.1 + videos * 0.5 + n * 360 / 1024) * 10) / 10, 5);
    expect(by.ar).toBeCloseTo(Math.round((0.1 + videos * 0.5 + n * 560 / 1024) * 10) / 10, 5);
    const e = catalogEntry(u, "public", 1, 100_000);
    expect(e.sizeByLang).toEqual(by);
    expect(e.sizeMB).toBe(by.ar);
  });
  it("counts the pictures in the text that each language downloads (the capstones' screenshots)", () => {
    const u = structuredClone(ai1);
    const shot = (name: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fmedia%2Fcapstone-shared%2F${name}.jpg?alt=media`;
    const read = u.lessons[0].steps.find((s) => s.type === "read");
    if (read?.type !== "read") throw new Error("ai-1 has a reading");
    // English shows one picture twice; Arabic a different one, with isolate marks in its path (read past, as the app does).
    read.body = {
      en: `Open the repository.\n\n![The green Code button](${shot("code")})\n\nThen again:\n\n![The green Code button](${shot("code")})\n\n![An app path](/media/x.jpg)`,
      ar: `افتح المستودع.\n\n![زر Code الأخضر](\u2066${shot("code-ar")}\u2069)`,
    };
    expect(figureUrls(u, "en")).toEqual([shot("code")]);
    expect(figureUrls(u, "ar")).toEqual([shot("code-ar")]);
    expect(figureUrls(u, "fr")).toEqual([shot("code")]); // no French text: the English pictures
    expect(allFigureUrls(u).sort()).toEqual([shot("code"), shot("code-ar")].sort());
    const kb = { [shot("code")]: 512, [shot("code-ar")]: 1024 };
    const without = sizeByLang(u, 100_000), withPics = sizeByLang(u, 100_000, kb);
    expect(withPics.en).toBeCloseTo(without.en + 0.5, 5);
    expect(catalogEntry(u, "public", 1, 100_000, kb).sizeByLang).toEqual(withPics);
    // Only this bucket's published course media is sized; the path is decoded and checked.
    expect(figurePath(shot("code"), "darsi-f0685")).toBe("content/media/capstone-shared/code.jpg");
    expect(figurePath(`http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/content%2Fmedia%2Fx%2Fa.jpg?alt=media`, "demo-darsi.appspot.com")).toBe("content/media/x/a.jpg");
    expect(figurePath(shot("code"), "another-bucket")).toBeNull();
    expect(figurePath("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Fx%2Fy.jpg", "darsi-f0685")).toBeNull();
    expect(figurePath("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fmedia%2F..%2Fsecret.json", "darsi-f0685")).toBeNull();
  });
  it("orders units by track, then level, then title", () => {
    const u = (id: string, track: Unit["track"], level: number, title: string) => catalogEntry({ ...ai1, id, track, level, title: { en: title } }, "public", 1, 1000);
    const cat = buildCatalog([u("c", "cyber", 1, "A"), u("b", "ai", 2, "A"), u("a", "ai", 1, "Z"), u("d", "ai", 1, "B")]);
    expect(cat.units.map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
    expect(cat.version).toBe(1);
  });
});

// publishUnit, unpublishUnit and deleteUnit: each changes Firestore first and then writes the owner's catalog.json.
// Storage refuses a second write to one object within about a second, so the write is tried again (storage.ts); if it
// still fails, the owner is marked for sitesJob to mend and the admin is told it is on its way (catalog-pending).
describe("the course editor's callables", async () => {
  const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
  const content = await import("../src/content");
  type Run = { run: (req: unknown) => Promise<unknown> };
  const call = (fn: unknown, uid: string | null, data: Record<string, unknown>) => (fn as Run).run({ ...(uid ? { auth: { uid, token: {} } } : {}), data });
  /** The call's outcome once every wait between tries has passed: its answer, or "code:reason". */
  async function outcome(p: Promise<unknown>): Promise<unknown> {
    const out = p.then((v) => v, (e: { code?: string; details?: { reason?: string } }) => `${e.code}:${e.details?.reason ?? "no reason"}`);
    await vi.runAllTimersAsync();
    return out;
  }
  const CATALOG = "content/catalog.json";
  const catalog = (path = CATALOG) => (JSON.parse(store.files.get(path)!.body) as { units: { id: string; version: number; src: string }[] }).units.map((u) => `${u.id}@${u.version}`);
  const dirty = () => (db.docs.get(content.CATALOGS_DOC)?.dirty ?? {}) as Record<string, number>;
  const published = (id = "ai-1") => db.docs.get(`units/${id}`)?.published as { version: number; rev: number } | null | undefined;
  /** A valid unit under another id (its lessons and files renamed with it). */
  const renamed = (id: string) => JSON.parse(JSON.stringify(ai1).replaceAll("ai-1", id)) as Unit;

  beforeEach(() => {
    db.docs.clear(); db.failOn = null; auth.users.clear(); audits.length = 0;
    store.files.clear(); store.refuse.clear(); store.fail429 = 0; store.tries = 0;
    auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
    auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1" } });
    auth.users.set("tea", { uid: "tea", customClaims: { role: "teacher", orgId: "o1" } });
    db.docs.set("units/ai-1", { owner: "public" });
    db.docs.set("unitDrafts/ai-1", { owner: "public", rev: 4, unit: ai1 });
  });

  it("publishes a draft: the versioned file, then the catalog, then the audit entry", async () => {
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 4 }))).toEqual({ version: 1 });
    expect(store.files.get("content/units/ai-1/v1.json")).toEqual({ body: JSON.stringify(ai1), cacheControl: "public, max-age=31536000, immutable" });
    expect(store.files.get(CATALOG)?.cacheControl).toBe("public, max-age=60");
    expect(catalog()).toEqual(["ai-1@1"]);
    expect(published()).toMatchObject({ version: 1, rev: 4, by: "root" });
    expect(audits).toEqual([{ action: "publishUnit", by: "root", data: { unitId: "ai-1", owner: "public", version: 1 } }]);
    expect(dirty()).toEqual({});
    // Again: version 2 is listed, and both files are kept (the current and the previous one).
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 2 });
    expect(catalog()).toEqual(["ai-1@2"]);
    expect([...store.files.keys()].sort()).toEqual([CATALOG, "content/units/ai-1/v1.json", "content/units/ai-1/v2.json"]);
  });

  it("waits out Storage's \"too soon\" answers, so two publishes into one catalog a moment apart both land", async () => {
    store.fail429 = 3;
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 4 }))).toEqual({ version: 1 });
    expect(catalog()).toEqual(["ai-1@1"]);
    expect(dirty()).toEqual({});
    expect(audits.map((a) => [a.action, a.data.catalog])).toEqual([["publishUnit", undefined]]);
  });

  it("marks the owner and answers catalog-pending when the catalog still can't be written, and the mended catalog lists the unit", async () => {
    store.refuse.add(CATALOG);
    const before = Date.now();
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 4 }))).toBe("unavailable:catalog-pending");
    // Firestore already says published, and the unit's file is there; only the list learners read is behind.
    expect(published()).toMatchObject({ version: 1, rev: 4 });
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(true);
    expect(store.files.has(CATALOG)).toBe(false);
    expect(Object.keys(dirty())).toEqual(["public"]);
    expect(dirty().public).toBeGreaterThanOrEqual(before);
    // In the audit trail as pending, not as nothing.
    expect(audits).toEqual([{ action: "publishUnit", by: "root", data: { unitId: "ai-1", owner: "public", version: 1, catalog: "pending" } }]);
    // What sitesJob does within 15 minutes (sites.ts mendCatalogs; its clearing of the mark is tested there).
    store.refuse.clear();
    await content.writeCatalog("public");
    expect(catalog()).toEqual(["ai-1@1"]);
  });

  it("does the same for unpublish, and leaves the unit's files until the catalog no longer lists it", async () => {
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    audits.length = 0;
    store.refuse.add(CATALOG);
    expect(await outcome(call(content.unpublishUnit, "root", { unitId: "ai-1" }))).toBe("unavailable:catalog-pending");
    expect(published()).toBeNull();
    expect(Object.keys(dirty())).toEqual(["public"]);
    // Phones still read the old catalog, so the file it points at must still answer.
    expect(catalog()).toEqual(["ai-1@1"]);
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(true);
    expect(audits).toEqual([{ action: "unpublishUnit", by: "root", data: { unitId: "ai-1", owner: "public", catalog: "pending" } }]);
    // Unpublish again once Storage answers: the catalog is written and the files go.
    store.refuse.clear();
    expect(await outcome(call(content.unpublishUnit, "root", { unitId: "ai-1" }))).toEqual({ ok: true });
    expect(catalog()).toEqual([]);
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(false);
  });

  it("stops a delete whose catalog can't be written, with the unit and its files still there", async () => {
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    store.files.set("content/media/ai-1/abc/video-en.mp4", { body: "mp4" });
    store.refuse.add(CATALOG);
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toBe("unavailable:catalog-pending");
    expect(db.docs.has("units/ai-1")).toBe(true);
    expect(db.docs.has("unitDrafts/ai-1")).toBe(true);
    expect(published()).toBeNull();
    expect(Object.keys(dirty())).toEqual(["public"]);
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(true);
    expect(store.files.has("content/media/ai-1/abc/video-en.mp4")).toBe(true);
    // Delete pressed again at once: the unit is already unpublished, but the catalog phones read still lists it (the
    // owner is marked), so its files stay until the catalog can be written.
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toBe("unavailable:catalog-pending");
    expect(catalog()).toEqual(["ai-1@1"]);
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(true);
    expect(db.docs.has("units/ai-1")).toBe(true);
    // Storage answers again: the catalog is written without the course, then everything goes.
    store.refuse.clear();
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toEqual({ ok: true });
    expect(catalog()).toEqual([]);
    expect([...store.files.keys()]).toEqual([CATALOG]);
    expect(db.docs.has("units/ai-1") || db.docs.has("unitDrafts/ai-1")).toBe(false);
  });

  it("never publishes an old version number again after an unpublish: v1, v2, unpublished, then v3", async () => {
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    expect(await outcome(call(content.unpublishUnit, "root", { unitId: "ai-1" }))).toEqual({ ok: true });
    expect(db.docs.get("units/ai-1")).toMatchObject({ published: null, lastVersion: 2 });
    expect([...store.files.keys()]).toEqual([CATALOG]); // the files went with it
    // Before, the counter went with `published`: this wrote v1.json again, a path phones keep forever.
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 3 });
    expect(store.files.has("content/units/ai-1/v3.json")).toBe(true);
    expect(store.files.has("content/units/ai-1/v1.json")).toBe(false);
    expect(catalog()).toEqual(["ai-1@3"]);
    expect(db.docs.get("units/ai-1")).toMatchObject({ published: { version: 3 }, lastVersion: 3 });
    // Unpublished twice in a row (a retry): the counter stays.
    await outcome(call(content.unpublishUnit, "root", { unitId: "ai-1" }));
    await outcome(call(content.unpublishUnit, "root", { unitId: "ai-1" }));
    expect(db.docs.get("units/ai-1")).toMatchObject({ published: null, lastVersion: 3 });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 4 });
  });

  it("keeps the counter when a delete stops at the catalog, so the unit left behind never goes back to v1", async () => {
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    store.refuse.add(CATALOG);
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toBe("unavailable:catalog-pending");
    expect(db.docs.get("units/ai-1")).toMatchObject({ published: null, lastVersion: 1 });
    store.refuse.clear();
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 2 });
  });

  it("recovers the counter of a unit unpublished before it was kept: from the audit log's publishes", async () => {
    // As an unpublish left it until now: no published entry, no lastVersion, and no files.
    db.docs.set("units/ai-1", { owner: "public", published: null });
    db.docs.set("audit/p1", { action: "publishUnit", by: "root", unitId: "ai-1", owner: "public", version: 4 });
    db.docs.set("audit/p2", { action: "publishUnit", by: "root", unitId: "ai-1", owner: "public", version: 6, catalog: "pending" });
    db.docs.set("audit/p3", { action: "publishUnit", by: "adm", unitId: "ai-1", owner: "o1", version: 40 }); // another owner's
    db.docs.set("audit/p4", { action: "publishUnit", by: "root", unitId: "ai-2", owner: "public", version: 50 }); // another unit
    db.docs.set("audit/p5", { action: "unpublishUnit", by: "root", unitId: "ai-1", owner: "public", version: 60 });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 7 });
    expect(db.docs.get("units/ai-1")).toMatchObject({ lastVersion: 7 });
  });

  it("recovers it from the unit's files when they are still there (an unpublish whose catalog was pending)", async () => {
    db.docs.set("units/ai-1", { owner: "public", published: null });
    store.files.set("content/units/ai-1/v5.json", { body: "{}" });
    store.files.set("content/units/ai-1/v4.json", { body: "{}" });
    store.files.set("content/units/ai-10/v9.json", { body: "{}" }); // another unit whose id starts the same: not under ai-1/
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }))).toEqual({ version: 6 });
    // A unit nothing records starts at v1, as before.
    db.docs.set("units/ai-2", { owner: "public" });
    db.docs.set("unitDrafts/ai-2", { owner: "public", rev: 1, unit: renamed("ai-2") });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-2" }))).toEqual({ version: 1 });
  });

  it("gives publish and unpublish 120 s (the catalog's waits for Storage can take most of a minute)", () => {
    for (const fn of [content.publishUnit, content.unpublishUnit]) expect((fn as unknown as { __endpoint: { timeoutSeconds?: number } }).__endpoint.timeoutSeconds).toBe(120);
  });

  it("deletes a draft that was never published without touching the catalog", async () => {
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toEqual({ ok: true });
    expect(store.tries).toBe(0);
    expect(db.docs.has("units/ai-1") || db.docs.has("unitDrafts/ai-1")).toBe(false);
  });

  it("deletes a published unit everywhere once the catalog no longer lists it", async () => {
    await outcome(call(content.publishUnit, "root", { unitId: "ai-1" }));
    store.files.set("content/media/ai-1/abc/video-en.mp4", { body: "mp4" });
    audits.length = 0;
    expect(await outcome(call(content.deleteUnit, "root", { unitId: "ai-1" }))).toEqual({ ok: true });
    expect(catalog()).toEqual([]);
    expect([...store.files.keys()]).toEqual([CATALOG]);
    expect(db.docs.has("units/ai-1") || db.docs.has("unitDrafts/ai-1")).toBe(false);
    expect(audits).toEqual([{ action: "deleteUnit", by: "root", data: { unitId: "ai-1", owner: "public" } }]);
    expect(dirty()).toEqual({});
  });

  it("marks an organization's own catalog under its id", async () => {
    db.docs.set("units/uab12cd34", { owner: "o1" });
    db.docs.set("unitDrafts/uab12cd34", { owner: "o1", rev: 1, unit: renamed("uab12cd34") });
    store.refuse.add("orgs/o1/catalog.json");
    expect(await outcome(call(content.publishUnit, "adm", { unitId: "uab12cd34", rev: 1 }))).toBe("unavailable:catalog-pending");
    expect(Object.keys(dirty())).toEqual(["o1"]);
    store.refuse.clear();
    await content.writeCatalog("o1");
    expect(catalog("orgs/o1/catalog.json")).toEqual(["uab12cd34@1"]);
    expect(store.files.get("orgs/o1/catalog.json")?.cacheControl).toBe("private, max-age=60");
  });

  // The admin of a suspended organization keeps the role in their claims (frozen): the role and the owner alone let
  // them delete, unpublish and publish its courses for as long as the suspension lasted.
  it("refuses an organization's own admin while it is suspended or being deleted; a platform admin still acts", async () => {
    db.docs.set("units/uab12cd34", { owner: "o1" });
    db.docs.set("unitDrafts/uab12cd34", { owner: "o1", rev: 1, unit: renamed("uab12cd34") });
    db.docs.set("orgs/o1", { name: "School", status: "active" });
    expect(await outcome(call(content.publishUnit, "adm", { unitId: "uab12cd34", rev: 1 }))).toMatchObject({ version: 1 });
    const files = [...store.files.keys()].sort(), unit = JSON.stringify(db.docs.get("units/uab12cd34"));
    audits.length = 0;
    for (const [status, reason] of [["suspended", "org-suspended"], ["deleting", "org-deleting"]] as const) {
      db.docs.set("orgs/o1", { name: "School", status });
      auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1", frozen: true } });
      for (const fn of [content.publishUnit, content.unpublishUnit, content.deleteUnit]) {
        expect(await outcome(call(fn, "adm", { unitId: "uab12cd34", rev: 1 }))).toBe(`permission-denied:${reason}`);
      }
      // A claim that lags behind the status (refreshStaff could not reach the account) changes nothing: the status decides.
      auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1" } });
      expect(await outcome(call(content.deleteUnit, "adm", { unitId: "uab12cd34" }))).toBe(`permission-denied:${reason}`);
    }
    expect([...store.files.keys()].sort()).toEqual(files);
    expect(JSON.stringify(db.docs.get("units/uab12cd34"))).toBe(unit);
    expect(db.docs.has("unitDrafts/uab12cd34")).toBe(true);
    expect(audits).toEqual([]);
    // Platform admins sort a closed organization out, and its public courses were never in question.
    expect(await outcome(call(content.unpublishUnit, "root", { unitId: "uab12cd34" }))).toMatchObject({ ok: true });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 4 }))).toMatchObject({ version: 1 });
  });

  it("says why it refused, with a code the editor can put into the admin's language", async () => {
    expect(await outcome(call(content.publishUnit, null, { unitId: "ai-1" }))).toBe("unauthenticated:no reason");
    for (const fn of [content.publishUnit, content.unpublishUnit, content.deleteUnit]) {
      expect(await outcome(call(fn, "root", {}))).toBe("invalid-argument:bad-unit-id");
      expect(await outcome(call(fn, "root", { unitId: "Not An Id" }))).toBe("invalid-argument:bad-unit-id");
      expect(await outcome(call(fn, "root", { unitId: "ai-9" }))).toBe("not-found:no-unit");
      // Platform courses are platform admins' only; an organization's are its own admins'.
      expect(await outcome(call(fn, "adm", { unitId: "ai-1" }))).toBe("permission-denied:not-unit-admin");
      expect(await outcome(call(fn, "tea", { unitId: "ai-1" }))).toBe("permission-denied:not-unit-admin");
    }
    db.docs.set("units/odd", { owner: "../x" });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "odd" }))).toBe("failed-precondition:no-owner");
    // Someone saved the draft after this screen read it.
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 3 }))).toBe("aborted:changed");
    // A draft with errors comes back with them, beside the code.
    db.docs.set("unitDrafts/ai-1", { owner: "public", rev: 5, unit: { ...ai1, title: { en: "" } } });
    const invalid = await call(content.publishUnit, "root", { unitId: "ai-1", rev: 5 }).then(() => null, (e: { code: string; message: string; details: { reason: string; issues: unknown[] } }) => e);
    expect(invalid).toMatchObject({ code: "invalid-argument", message: "The unit has errors. Fix them in the editor first.", details: { reason: "draft-invalid" } });
    expect(invalid!.details.issues.length).toBeGreaterThan(0);
    // A valid draft that is another unit's.
    db.docs.set("unitDrafts/ai-1", { owner: "public", rev: 6, unit: renamed("ai-7") });
    expect(await outcome(call(content.publishUnit, "root", { unitId: "ai-1", rev: 6 }))).toBe("failed-precondition:draft-id");
    // Nothing was published or marked by any of these.
    expect(store.files.size).toBe(0);
    expect(dirty()).toEqual({});
    expect(audits).toEqual([]);
  });
});
