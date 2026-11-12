/**
 * Rules tests for tenancy (the enterprise review, TECHNICAL.md), against the Firestore and Storage emulators:
 *   npm run test:rules -w @darsi/web
 * One organization never reaches another's people, results or files, and staff are staff only while the server-written
 * profile agrees with the token: an ID token lives for up to an hour after a demotion, a removal or a suspension.
 *   (a) a staff token whose profile disagrees, or that is frozen or suspended (in the token, or only on the
 *       profile), is refused                                                    (b) org files and the logo
 *   (c) the staff screens' list queries (admin/data.ts)                          (d) profiles, notes, sign-up, progress
 *   (e) course access: no collection-group reads; files by `orgs` and `until`    (f) a platform admin's direct writes
 *   (g) self-review and suspended accounts                                       (h) files follow membership now
 *   (i) every server-only collection, actor by actor
 * Learner documents are built with state/sync.ts (progressDoc, certDoc), as the app writes them; attack cases are
 * hand-written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { certDoc, progressDoc } from "../src/state/sync";

let env: RulesTestEnvironment;
const root = resolve(__dirname, "../../..");
const PROJECT = "demo-darsi-rules";

/** uid → the token's claims and the profile the functions wrote (null: no profile at all). They agree unless a test is about that. */
type Actor = { token: Record<string, unknown>; profile: Record<string, unknown> | null };
const actor = (role: string, orgId: string | null, extra: Record<string, unknown> = {}): Actor =>
  ({ token: { role, ...(orgId ? { orgId } : {}) }, profile: { role, orgId, ...extra } });
const ACTORS: Record<string, Actor> = {
  lea: actor("learner", null), // an individual learner, in no organization
  pupil: actor("student", "org1", { teacherId: "teach" }),
  pupil2: actor("student", "org1", { teacherId: "icedT", group: "7B" }),
  other: actor("student", "org2", { teacherId: "teachB" }),
  teach: actor("teacher", "org1"),
  teach2: actor("teacher", "org1"),
  teachB: actor("teacher", "org2"),
  adm: actor("orgAdmin", "org1"),
  adm2: actor("orgAdmin", "org2"),
  admA: actor("orgAdmin", "orgA"), // the school `pupil` left
  boss: actor("superadmin", null),
  // Tokens that outlived a change: the profile is what the server says now.
  exadm: { token: { role: "orgAdmin", orgId: "org1" }, profile: { role: "learner", orgId: null } }, // removed from org1
  moved: { token: { role: "orgAdmin", orgId: "org1" }, profile: { role: "orgAdmin", orgId: "org2" } }, // now org2's admin
  demoted: { token: { role: "orgAdmin", orgId: "org1" }, profile: { role: "teacher", orgId: "org1" } },
  ghost: { token: { role: "orgAdmin", orgId: "org1" }, profile: null }, // a staff token with no profile
  iced: { token: { role: "orgAdmin", orgId: "org1", frozen: true }, profile: { role: "orgAdmin", orgId: "org1" } }, // org1 suspended
  icedT: { token: { role: "teacher", orgId: "org1", frozen: true }, profile: { role: "teacher", orgId: "org1" } },
  exteach: { token: { role: "teacher", orgId: "org1" }, profile: { role: "student", orgId: "org1" } },
  exboss: { token: { role: "superadmin" }, profile: { role: "learner", orgId: null } },
  // Tokens minted before a suspension: nothing in them says so, and role and orgId on the profile still agree. Only the
  // profile's own marks can stop them: `suspended` (setAccountSuspended, an organization's suspend) and `frozen`
  // (writeClaims mirrors the claim of a suspended organization's staff onto the profile).
  susAdm: { token: { role: "orgAdmin", orgId: "org1" }, profile: { role: "orgAdmin", orgId: "org1", suspended: { at: 1762500000000, by: "boss", reason: "abuse" } } },
  susT: { token: { role: "teacher", orgId: "org1" }, profile: { role: "teacher", orgId: "org1", suspended: { at: 1762500000000, by: "adm", reason: "left", byOrg: "org1" } } },
  coldAdm: { token: { role: "orgAdmin", orgId: "org1" }, profile: { role: "orgAdmin", orgId: "org1", frozen: true } },
  coldT: { token: { role: "teacher", orgId: "org1" }, profile: { role: "teacher", orgId: "org1", frozen: true } },
  susBoss: { token: { role: "superadmin" }, profile: { role: "superadmin", orgId: null, suspended: { at: 1762500000000, by: "boss", reason: "abuse" } } },
  // Course access (e): a university teacher in org1, and one in no organization.
  uni: actor("teacher", "org1"),
  solo: actor("learner", null),
};
const as = (uid: string): RulesTestContext => env.authenticatedContext(uid, { email: `${uid}@school.org`, ...ACTORS[uid].token });
const fs = (uid: string) => as(uid).firestore();
const st = (uid: string) => as(uid).storage();
const anon = () => env.unauthenticatedContext();

const DONE = { done: true as const, accuracy: 0.8, xp: 26, seconds: 300, completedAt: "2026-11-04T10:00:00.000Z", unitId: "ai-s4", track: "ai" as const, competencies: ["T.1"] };
const CERT = { title: { en: "AI for university", ar: "الذكاء الاصطناعي للجامعة" }, track: "ai" as const, at: "2026-11-04T10:00:00.000Z", code: "DRS-AI-S4-7KQ2-M9XD" };
const jpg = { contentType: "image/jpeg" };
const one = new Uint8Array([1]);
const fileUrl = (uid: string, org: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2F${org}%2F${uid}%2Fai-s4%2Fai-s4-cap-1730000000000-photo.jpg?alt=media&token=abc`;
/** A project as lesson/ProjectView.tsx sends it. */
const project = (uid: string, orgId: string | null) => ({
  lessonId: "ai-s4-cap", unitId: "ai-s4", stepId: "project", orgId, text: "What we did", fileUrl: fileUrl(uid, orgId ?? "none"), fileName: "photo.jpg",
  files: [{ url: fileUrl(uid, orgId ?? "none"), name: "photo.jpg", type: "image/jpeg" }], status: "submitted", createdAt: serverTimestamp(),
});
const review = (by: string) => ({ status: "approved", feedback: "Well done", reviewedBy: by, reviewedAt: serverTimestamp() });
const grant = (uid: string, g: Record<string, unknown>) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `courseAccess/${uid}`), { name: uid, grantedBy: "boss", ...g }));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(root, "firebase/firestore.rules"), "utf8") },
    storage: { rules: readFileSync(resolve(root, "firebase/storage.rules"), "utf8") },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await env.clearStorage();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore(), files = c.storage();
    for (const [uid, a] of Object.entries(ACTORS)) if (a.profile) await setDoc(doc(db, `users/${uid}`), { name: uid, email: `${uid}@school.org`, createdBy: "adm", ...a.profile });
    for (const id of ["org1", "org2"]) {
      await setDoc(doc(db, `orgs/${id}`), { name: `School ${id}`, type: "school", country: "Egypt", city: "Cairo", status: "active", createdBy: "someone", memberCount: 3 });
      await setDoc(doc(db, `orgs/${id}/private/invites`), { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF" });
    }
    // The pupil's learning, as the app writes it.
    await setDoc(doc(db, "users/pupil/progress/ai-s4-1"), progressDoc("ai-s4-1", DONE));
    await setDoc(doc(db, "users/pupil/certs/ai-s4"), certDoc("ai-s4", CERT)!);
    await setDoc(doc(db, "users/pupil/notes/ai-s4-1"), { text: "my note", updatedAt: 1762500000000 });
    await setDoc(doc(db, "users/pupil/submissions/s1"), { lessonId: "ai-s4-cap", unitId: "ai-s4", orgId: "org1", text: "work", status: "submitted" });
    await setDoc(doc(db, "users/other/progress/ai-s4-1"), progressDoc("ai-s4-1", DONE));
    await setDoc(doc(db, "users/other/submissions/s2"), { lessonId: "ai-s4-cap", unitId: "ai-s4", orgId: "org2", text: "work", status: "submitted" });
    // Files: an org1 unit, project files in each organization's folder (and one the pupil sent from the school they
    // left, orgA, in both layouts), and an export.
    await uploadBytes(ref(files, "orgs/org1/units/uabcdefgh/v1.json"), new Uint8Array([123, 125]), { contentType: "application/json" });
    await uploadBytes(ref(files, "submissions/org1/pupil/ai-s4/a.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/org1/pupil2/ai-s4/a.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/orgA/pupil/ai-s4/old.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/orgA/pupil/legacy.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/org2/other/ai-s4/b.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/none/lea/ai-s4/c.jpg"), one, jpg);
    await uploadBytes(ref(files, "submissions/org1/pupil/code-s4/d.jpg"), one, jpg);
    await uploadBytes(ref(files, "exports/org1/e1/people.csv"), one, { contentType: "text/csv" });
    // A published course's video, and a draft of org1 that was never published.
    await uploadBytes(ref(files, "orgs/org1/media/uabcdefgh/video-ar.mp4"), one, { contentType: "video/mp4" });
    await setDoc(doc(db, "units/uabcdefgh"), { owner: "org1", title: { en: "Ours" }, rev: 1, updatedBy: "adm", published: null });
    await setDoc(doc(db, "unitDrafts/uabcdefgh"), { owner: "org1", rev: 1, unit: { id: "uabcdefgh" } });
  });
});

/** The four things an org1 admin does, each as a promise for the given actor. */
const adminReads = (uid: string): Record<string, () => Promise<unknown>> => ({
  members: () => getDocs(query(collection(fs(uid), "users"), where("orgId", "==", "org1"))),
  invites: () => getDoc(doc(fs(uid), "orgs/org1/private/invites")),
  progress: () => getDocs(collection(fs(uid), "users/pupil/progress")),
  logo: () => uploadBytes(ref(st(uid), "orgs/org1/brand/logo-abc123def.webp"), one, { contentType: "image/webp" }),
});

describe("(a) staff access follows the profile, not the token alone", () => {
  it("an org admin whose token and profile agree does all four", async () => {
    for (const run of Object.values(adminReads("adm"))) await assertSucceeds(run());
  });
  it.each(["exadm", "moved", "demoted", "ghost", "iced", "susAdm", "coldAdm"])("%s: an org1 admin token is refused the members, the invite codes, a member's lessons and the logo", async (uid) => {
    for (const run of Object.values(adminReads(uid))) await assertFails(run());
    // And everything else an admin's token opened.
    await assertFails(getDoc(doc(fs(uid), "users/pupil")));
    await assertFails(getDoc(doc(fs(uid), "users/pupil/certs/ai-s4")));
    await assertFails(getDoc(doc(fs(uid), "users/pupil/submissions/s1")));
    await assertFails(updateDoc(doc(fs(uid), "users/pupil"), { group: "7A" }));
    await assertFails(updateDoc(doc(fs(uid), "users/pupil/submissions/s1"), review(uid)));
    await assertFails(updateDoc(doc(fs(uid), "orgs/org1"), { name: "Taken over", brand: { logo: null, v: 9 } }));
    await assertFails(setDoc(doc(fs(uid), "units/u12345678"), { owner: "org1", title: { en: "Mine" }, rev: 1, updatedBy: uid, published: null }));
    await assertFails(uploadBytes(ref(st(uid), "orgs/org1/media/uabcdefgh/video-en.mp4"), one, { contentType: "video/mp4" }));
    await assertFails(getBytes(ref(st(uid), "submissions/org1/pupil/ai-s4/a.jpg")));
    await assertFails(getBytes(ref(st(uid), "exports/org1/e1/people.csv")));
    // Nor what an admin's token could destroy: a published course's video, a draft, the organization's logo.
    await assertFails(deleteObject(ref(st(uid), "orgs/org1/media/uabcdefgh/video-ar.mp4")));
    await assertFails(deleteObject(ref(st(uid), "orgs/org1/brand/logo-abc123def.webp")));
    await assertFails(getDoc(doc(fs(uid), "units/uabcdefgh")));
    await assertFails(deleteDoc(doc(fs(uid), "unitDrafts/uabcdefgh")));
    await assertFails(deleteDoc(doc(fs(uid), "units/uabcdefgh")));
    await assertFails(getDoc(doc(fs(uid), "orgs/org1/private/request")));
  });
  it("an admin in good standing still deletes a draft and a course's video: the refusals above are the suspension's", async () => {
    await assertSucceeds(deleteObject(ref(st("adm"), "orgs/org1/media/uabcdefgh/video-ar.mp4")));
    await assertSucceeds(deleteDoc(doc(fs("adm"), "unitDrafts/uabcdefgh")));
    await assertSucceeds(deleteDoc(doc(fs("adm"), "units/uabcdefgh")));
  });
  it("a suspension on the profile alone stops staff access, and is nobody's to lift from a client", async () => {
    // Each reads their own profile, as anyone does, and none clears the mark that stops them.
    for (const uid of ["susAdm", "coldAdm", "susT", "coldT"]) await assertSucceeds(getDoc(doc(fs(uid), `users/${uid}`)));
    for (const uid of ["coldAdm", "coldT"]) {
      await assertFails(updateDoc(doc(fs(uid), `users/${uid}`), { frozen: false }));
      await assertFails(updateDoc(doc(fs(uid), `users/${uid}`), { frozen: deleteField() }));
      // A frozen member is still a member: their own profile's ordinary fields are theirs to change.
      await assertSucceeds(updateDoc(doc(fs(uid), `users/${uid}`), { lastActive: "2026-11-05T10:00:00.000Z" }));
    }
    await assertFails(updateDoc(doc(fs("susAdm"), "users/susAdm"), { suspended: deleteField() }));
    // Another admin of the same organization changes a member's class and name, never these marks; nor does a platform
    // admin's browser (the callables do, audited).
    // (Each patch names a mark its target really carries: deleting a field that isn't there changes nothing, and a
    // write that changes nothing is allowed.)
    for (const patch of [{ frozen: false }, { frozen: deleteField() }, { name: "x", frozen: false }, { name: "x", frozen: deleteField() }]) {
      await assertFails(updateDoc(doc(fs("adm"), "users/coldAdm"), patch));
      await assertFails(updateDoc(doc(fs("boss"), "users/coldAdm"), patch));
    }
    for (const patch of [{ suspended: deleteField() }, { name: "x", suspended: deleteField() }, { frozen: false }, { frozen: true }]) {
      await assertFails(updateDoc(doc(fs("adm"), "users/susT"), patch));
      await assertFails(updateDoc(doc(fs("boss"), "users/susT"), patch));
    }
    // Lifted by the server (the organization resumed, the account restored): the same token works again.
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), "users/coldAdm"), { frozen: deleteField() });
      await updateDoc(doc(c.firestore(), "users/susAdm"), { suspended: deleteField() });
    });
    for (const uid of ["coldAdm", "susAdm"]) {
      for (const run of Object.values(adminReads(uid))) await assertSucceeds(run());
      await assertSucceeds(getBytes(ref(st(uid), "exports/org1/e1/people.csv")));
    }
  });
  it("a member's token still reads the organization and its unit files without a lookup, frozen or not", async () => {
    // inOrg / inOrgS stay token-only: the phone of every member reads these at sign-in.
    for (const uid of ["pupil", "teach", "iced", "exadm", "coldAdm", "susT"]) {
      await assertSucceeds(getDoc(doc(fs(uid), "orgs/org1")));
      await assertSucceeds(getBytes(ref(st(uid), "orgs/org1/units/uabcdefgh/v1.json")));
    }
  });
  it("who suspended an organization and why is the platform's note: no member, teacher or admin of it reads that", async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "orgs/org1/private/suspension"), { at: 1, by: "boss", reason: "Fees unpaid" }));
    for (const uid of ["pupil", "teach", "adm"]) await assertFails(getDoc(doc(fs(uid), "orgs/org1/private/suspension")));
    await assertSucceeds(getDoc(doc(fs("boss"), "orgs/org1/private/suspension")));
    await assertFails(setDoc(doc(fs("boss"), "orgs/org1/private/suspension"), { reason: "x" }));
    // Its own admins still read the organization's other private documents (the invite codes).
    await assertSucceeds(getDoc(doc(fs("adm"), "orgs/org1/private/invites")));
  });
  it("homepage pictures: its own admins and platform admins put them in its folder, anyone reads them, and nobody writes the page itself", async () => {
    const img = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
    const webp = { contentType: "image/webp" };
    await assertSucceeds(uploadBytes(ref(st("adm"), "content/pages/org1/img-abcdef12.webp"), img, webp));
    await assertSucceeds(uploadBytes(ref(st("boss"), "content/pages/org1/img-abcdef34.webp"), img, webp));
    await assertFails(uploadBytes(ref(st("pupil"), "content/pages/org1/img-abcdef56.webp"), img, webp));
    await assertFails(uploadBytes(ref(st("teach"), "content/pages/org1/img-abcdef56.webp"), img, webp));
    await assertFails(uploadBytes(ref(st("adm"), "content/pages/org2/img-abcdef12.webp"), img, webp));
    await assertFails(uploadBytes(ref(st("adm"), "content/pages/org1/page.json"), new Uint8Array([123, 125]), { contentType: "application/json" }));
    await assertFails(uploadBytes(ref(st("adm"), "content/pages/org1/img-abcdef78.svg"), img, { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(st("adm"), "content/pages/org1/img-abcdef90.webp"), new Uint8Array(401 * 1024), webp));
    await assertSucceeds(getBytes(ref(st("pupil"), "content/pages/org1/img-abcdef12.webp")));
    await assertSucceeds(deleteObject(ref(st("adm"), "content/pages/org1/img-abcdef12.webp")));
  });
  it("feedback is read by platform admins only, who change its status and nothing else; nobody writes one from a browser", async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "feedback/f1"), { rating: 2, text: "Too hard", status: "new", user: { uid: "pupil" } }));
    for (const uid of ["pupil", "teach", "adm"]) await assertFails(getDoc(doc(fs(uid), "feedback/f1")));
    await assertSucceeds(getDoc(doc(fs("boss"), "feedback/f1")));
    await assertSucceeds(updateDoc(doc(fs("boss"), "feedback/f1"), { status: "read", statusBy: "boss", statusAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fs("boss"), "feedback/f1"), { rating: 5, status: "read", statusBy: "boss", statusAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fs("boss"), "feedback/f1"), { status: "hidden", statusBy: "boss", statusAt: serverTimestamp() }));
    await assertFails(setDoc(doc(fs("pupil"), "feedback/f2"), { rating: 5, text: "", status: "new" }));
    await assertFails(deleteDoc(doc(fs("boss"), "feedback/f1")));
  });
  it("a teacher's token is refused once the profile says otherwise, or the organization is frozen", async () => {
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "users/pupil2"), { teacherId: "exteach" }));
    await assertFails(getDoc(doc(fs("exteach"), "users/pupil2")));
    await assertFails(getDocs(query(collection(fs("exteach"), "users"), where("orgId", "==", "org1"), where("teacherId", "==", "exteach"))));
    await assertFails(getBytes(ref(st("exteach"), "submissions/org1/pupil2/ai-s4/a.jpg")));
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "users/pupil2"), { teacherId: "icedT" }));
    await assertFails(getDoc(doc(fs("icedT"), "users/pupil2")));
    await assertFails(getDocs(collection(fs("icedT"), "users/pupil2/progress")));
    await assertFails(getBytes(ref(st("icedT"), "submissions/org1/pupil2/ai-s4/a.jpg")));
    // A teacher whose account was suspended, or whose organization was, after their token was minted.
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "users/pupil2/submissions/w1"), { lessonId: "ai-s4-cap", unitId: "ai-s4", orgId: "org1", text: "work", status: "submitted" }));
    for (const uid of ["susT", "coldT"]) {
      await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "users/pupil2"), { teacherId: uid }));
      await assertFails(getDoc(doc(fs(uid), "users/pupil2")));
      await assertFails(getDocs(collection(fs(uid), "users/pupil2/progress")));
      await assertFails(getDocs(query(collection(fs(uid), "users"), where("orgId", "==", "org1"), where("teacherId", "==", uid))));
      await assertFails(getBytes(ref(st(uid), "submissions/org1/pupil2/ai-s4/a.jpg")));
      await assertFails(getDoc(doc(fs(uid), "users/pupil2/submissions/w1")));
      await assertFails(updateDoc(doc(fs(uid), "users/pupil2/submissions/w1"), review(uid)));
    }
    // The same pupil with a teacher in good standing.
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "users/pupil2"), { teacherId: "teach2" }));
    await assertSucceeds(getDoc(doc(fs("teach2"), "users/pupil2")));
    await assertSucceeds(getBytes(ref(st("teach2"), "submissions/org1/pupil2/ai-s4/a.jpg")));
    await assertSucceeds(updateDoc(doc(fs("teach2"), "users/pupil2/submissions/w1"), review("teach2")));
  });
  it("a platform admin's token is refused once the profile says otherwise", async () => {
    await assertSucceeds(getDocs(collection(fs("boss"), "users")));
    await assertFails(getDocs(collection(fs("exboss"), "users")));
    await assertFails(getDoc(doc(fs("exboss"), "users/pupil")));
    await assertFails(getDoc(doc(fs("exboss"), "orgs/org1/private/invites")));
    await assertFails(getDocs(collectionGroup(fs("exboss"), "submissions")));
    await assertFails(getDoc(doc(fs("exboss"), "config/settings")));
    await assertFails(updateDoc(doc(fs("exboss"), "orgs/org1"), { name: "Taken over", brand: { logo: null, v: 9 } }));
    await assertFails(uploadBytes(ref(st("exboss"), "content/media/ai-s4/video-en.mp4"), one, { contentType: "video/mp4" }));
    await assertFails(getBytes(ref(st("exboss"), "submissions/org1/pupil/ai-s4/a.jpg")));
    await assertFails(getBytes(ref(st("exboss"), "orgs/org1/units/uabcdefgh/v1.json")));
    // And one whose account was suspended after the token was minted.
    await assertFails(getDocs(collection(fs("susBoss"), "users")));
    await assertFails(getDoc(doc(fs("susBoss"), "orgs/org1/private/invites")));
    await assertFails(getDoc(doc(fs("susBoss"), "config/settings")));
    await assertFails(uploadBytes(ref(st("susBoss"), "content/media/ai-s4/video-en.mp4"), one, { contentType: "video/mp4" }));
    await assertFails(getBytes(ref(st("susBoss"), "submissions/org1/pupil/ai-s4/a.jpg")));
  });
});

describe("(b) an organization's files", () => {
  it("a unit of org1 is read by its members and platform admins, never by org2 or without an account", async () => {
    const f = "orgs/org1/units/uabcdefgh/v1.json";
    for (const uid of ["pupil", "teach", "adm", "boss"]) await assertSucceeds(getBytes(ref(st(uid), f)));
    for (const uid of ["other", "teachB", "adm2", "lea"]) await assertFails(getBytes(ref(st(uid), f)));
    await assertFails(getBytes(ref(anon().storage(), f)));
    // Only the functions write one.
    for (const uid of ["adm", "boss"]) await assertFails(uploadBytes(ref(st(uid), f), one, { contentType: "application/json" }));
  });
  it("the logo: org1's admin uploads and removes it; org2's admin, a student, an SVG and more than 100 KB are refused", async () => {
    const logo = "orgs/org1/brand/logo-abc123def.webp", webp = { contentType: "image/webp" };
    await assertSucceeds(uploadBytes(ref(st("adm"), logo), one, webp));
    await assertSucceeds(uploadBytes(ref(st("boss"), "orgs/org1/brand/logo-zzz999zzz.png"), one, { contentType: "image/png" }));
    for (const uid of ["adm2", "pupil", "teach", "lea"]) await assertFails(uploadBytes(ref(st(uid), logo), one, webp));
    await assertFails(uploadBytes(ref(anon().storage(), logo), one, webp));
    await assertFails(uploadBytes(ref(st("adm"), "orgs/org1/brand/logo-abc123def.svg"), one, { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(st("adm"), logo), one, { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(st("adm"), logo), new Uint8Array(100 * 1024 + 1), webp));
    await assertFails(uploadBytes(ref(st("adm"), "orgs/org1/brand/anything.webp"), one, webp));
    for (const uid of ["adm2", "pupil"]) await assertFails(deleteObject(ref(st(uid), logo)));
    await assertSucceeds(deleteObject(ref(st("adm"), logo)));
  });
  it("lesson media: org1's admin uploads into org1 only", async () => {
    const mp4 = { contentType: "video/mp4" };
    await assertSucceeds(uploadBytes(ref(st("adm"), "orgs/org1/media/uabcdefgh/video-en.mp4"), one, mp4));
    await assertFails(uploadBytes(ref(st("adm"), "orgs/org2/media/uabcdefgh/video-en.mp4"), one, mp4));
    await assertFails(uploadBytes(ref(st("adm2"), "orgs/org1/media/uabcdefgh/video-en.mp4"), one, mp4));
    await assertFails(uploadBytes(ref(st("teach"), "orgs/org1/media/uabcdefgh/video-en.mp4"), one, mp4));
    await assertFails(uploadBytes(ref(st("adm"), "content/media/ai-s4/video-en.mp4"), one, mp4));
    await assertSucceeds(uploadBytes(ref(st("boss"), "content/media/ai-s4/video-en.mp4"), one, mp4));
  });
  it("an export is downloaded by the organization's admins and platform admins; nobody uploads one", async () => {
    const f = "exports/org1/e1/people.csv";
    for (const uid of ["adm", "boss"]) await assertSucceeds(getBytes(ref(st(uid), f)));
    for (const uid of ["adm2", "teach", "pupil", "lea"]) await assertFails(getBytes(ref(st(uid), f)));
    await assertFails(getBytes(ref(anon().storage(), f)));
    for (const uid of ["adm", "boss"]) {
      await assertFails(uploadBytes(ref(st(uid), "exports/org1/e2/people.csv"), one, { contentType: "text/csv" }));
      await assertFails(deleteObject(ref(st(uid), f)));
    }
  });
});

describe("(c) the staff screens' list queries (admin/data.ts) and the bulk member change (AdminHome)", () => {
  const users = (uid: string) => collection(fs(uid), "users");
  it("useMembers: an organization's people, for its admins only", async () => {
    const got = await assertSucceeds(getDocs(query(users("adm"), where("orgId", "==", "org1"))));
    expect(got.docs.map((d) => d.id)).toEqual(expect.arrayContaining(["pupil", "pupil2", "teach", "adm"]));
    expect(got.docs.some((d) => d.data().orgId !== "org1")).toBe(false);
    for (const uid of ["adm2", "teachB", "teach", "pupil", "lea"]) await assertFails(getDocs(query(users(uid), where("orgId", "==", "org1"))));
    await assertSucceeds(getDocs(query(users("adm2"), where("orgId", "==", "org2"))));
    // Never the whole collection, nor people in no organization.
    await assertFails(getDocs(users("adm")));
    await assertFails(getDocs(query(users("adm"), where("orgId", "==", null))));
  });
  it("useMyStudents: a teacher's own students", async () => {
    const mine = (uid: string, teacher: string, org = "org1") => getDocs(query(users(uid), where("orgId", "==", org), where("teacherId", "==", teacher)));
    const got = await assertSucceeds(mine("teach", "teach"));
    expect(got.docs.map((d) => d.id)).toEqual(["pupil"]);
    await assertSucceeds(mine("adm", "teach"));
    await assertFails(mine("teach2", "teach")); // another teacher's class
    for (const uid of ["adm2", "teachB", "pupil"]) await assertFails(mine(uid, "teach"));
    await assertFails(mine("teachB", "teachB", "org1")); // their own id, someone else's organization
    await assertSucceeds(mine("teachB", "teachB", "org2"));
  });
  it("useOrgStaff: an organization's teachers and admins", async () => {
    const staffOf = (uid: string) => getDocs(query(users(uid), where("orgId", "==", "org1"), where("role", "in", ["teacher", "orgAdmin"])));
    const got = await assertSucceeds(staffOf("adm"));
    expect(got.docs.map((d) => d.id)).toEqual(expect.arrayContaining(["teach", "teach2", "adm"]));
    for (const uid of ["adm2", "teachB", "pupil"]) await assertFails(staffOf(uid));
  });
  it("madeSince: the accounts an admin made in their organization", async () => {
    const made = (uid: string) => getDocs(query(users(uid), where("orgId", "==", "org1"), where("createdBy", "==", "adm")));
    await assertSucceeds(made("adm"));
    for (const uid of ["adm2", "teachB", "pupil"]) await assertFails(made(uid));
  });
  // AdminHome's updateMembers: one batch of up to 500 member updates. Every write now looks the admin's profile up, and
  // a batch may make 20 lookups in all: it is the same document each time, which counts once. More than 20 writes here,
  // so a count per write would refuse it.
  it("an admin's bulk class change is one batch of many members: the profile lookup counts once", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `bulk${i}`);
    await env.withSecurityRulesDisabled(async (c) => {
      const b = writeBatch(c.firestore());
      for (const id of ids) b.set(doc(c.firestore(), `users/${id}`), { name: id, email: `${id}@users.darsi.app`, role: "student", orgId: "org1" });
      await b.commit();
    });
    const change = (uid: string, people: string[], group: string) => {
      const db = fs(uid), b = writeBatch(db);
      for (const id of people) b.update(doc(db, `users/${id}`), { group, teacherId: "teach" });
      return b.commit();
    };
    await assertSucceeds(change("adm", ids, "7A"));
    // One person of another organization in the batch refuses all of it; so does a token the profile no longer backs.
    await assertFails(change("adm", ["bulk0", "other"], "7B"));
    for (const uid of ["adm2", "exadm", "iced", "susAdm", "coldAdm", "teach"]) await assertFails(change(uid, ids.slice(0, 3), "7B"));
  });
});

describe("(d) one person's records", () => {
  it("a profile is read by its owner, their teacher, their organization's admins and platform admins", async () => {
    for (const uid of ["pupil", "teach", "adm", "boss"]) await assertSucceeds(getDoc(doc(fs(uid), "users/pupil")));
    for (const uid of ["adm2", "teach2", "teachB", "pupil2", "other", "lea"]) await assertFails(getDoc(doc(fs(uid), "users/pupil")));
    await assertFails(getDoc(doc(anon().firestore(), "users/pupil")));
    // A learner in no organization is nobody's member.
    for (const uid of ["adm", "teach", "adm2"]) await assertFails(getDoc(doc(fs(uid), "users/lea")));
  });
  it("lessons, certificates and projects follow the profile; another organization reads none", async () => {
    for (const path of ["users/pupil/progress/ai-s4-1", "users/pupil/certs/ai-s4", "users/pupil/submissions/s1"]) {
      for (const uid of ["pupil", "teach", "adm", "boss"]) await assertSucceeds(getDoc(doc(fs(uid), path)));
      for (const uid of ["adm2", "teach2", "teachB", "other", "lea"]) await assertFails(getDoc(doc(fs(uid), path)));
    }
    await assertFails(getDocs(collection(fs("adm2"), "users/pupil/progress")));
    await assertFails(getDocs(collection(fs("adm"), "users/other/progress")));
  });
  it("notes are their owner's alone: no teacher, admin or platform admin reads them", async () => {
    await assertSucceeds(getDoc(doc(fs("pupil"), "users/pupil/notes/ai-s4-1")));
    for (const uid of ["teach", "adm", "adm2", "boss"]) {
      await assertFails(getDoc(doc(fs(uid), "users/pupil/notes/ai-s4-1")));
      await assertFails(getDocs(collection(fs(uid), "users/pupil/notes")));
      await assertFails(setDoc(doc(fs(uid), "users/pupil/notes/ai-s4-1"), { text: "rewritten", updatedAt: 1 }));
    }
  });
  it("nobody gives themselves a role or an organization at sign-up, or afterwards", async () => {
    const me = env.authenticatedContext("new1", { email: "new1@gmail.com" }).firestore();
    const profile = { name: "New", email: "new1@gmail.com", lang: "en", role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive: "2026-11-04T10:00:00.000Z" };
    for (const role of ["student", "teacher", "orgAdmin", "superadmin"]) await assertFails(setDoc(doc(me, "users/new1"), { ...profile, role }));
    await assertFails(setDoc(doc(me, "users/new1"), { ...profile, orgId: "org1" }));
    await assertFails(setDoc(doc(me, "users/new1"), { ...profile, teacherId: "teach" }));
    await assertFails(setDoc(doc(me, "users/new1"), { ...profile, suspended: null }));
    await assertFails(setDoc(doc(me, "users/new1"), { ...profile, frozen: false }));
    await assertSucceeds(setDoc(doc(me, "users/new1"), profile));
    // Each patch changes something on both profiles (a patch that changes nothing is no write at all).
    for (const patch of [{ role: "orgAdmin" }, { orgId: "org2" }, { teacherId: "teach2" }, { superSeat: true }, { plan: "super" }, { summary: { lessonsDone: 99 } }, { frozen: false }, { frozen: true }]) {
      await assertFails(updateDoc(doc(me, "users/new1"), patch));
      await assertFails(updateDoc(doc(fs("pupil"), "users/pupil"), patch));
    }
  });
  it("a lesson result is written by its owner as sync builds it, and deleted by nobody", async () => {
    await assertSucceeds(setDoc(doc(fs("pupil"), "users/pupil/progress/ai-s4-2"), progressDoc("ai-s4-2", DONE)));
    await assertSucceeds(setDoc(doc(fs("pupil"), "users/pupil/certs/code-s4"), certDoc("code-s4", { ...CERT, track: "code", code: "DRS-CODE-S4-7KQ2-M9XD" })!));
    for (const uid of ["teach", "adm", "adm2", "boss"]) {
      await assertFails(setDoc(doc(fs(uid), "users/pupil/progress/ai-s4-3"), progressDoc("ai-s4-3", DONE)));
      await assertFails(updateDoc(doc(fs(uid), "users/pupil/progress/ai-s4-1"), { accuracy: 1 }));
    }
    for (const uid of ["pupil", "teach", "adm", "adm2", "boss"]) {
      await assertFails(deleteDoc(doc(fs(uid), "users/pupil/progress/ai-s4-1")));
      await assertFails(deleteDoc(doc(fs(uid), "users/pupil/certs/ai-s4")));
    }
  });
});

describe("(e) course access: the grant opens files of its own organizations, and no collection-group read", () => {
  const org1File = "submissions/org1/pupil/ai-s4/a.jpg", org2File = "submissions/org2/other/ai-s4/b.jpg", noneFile = "submissions/none/lea/ai-s4/c.jpg";
  const read = (uid: string, f: string) => getBytes(ref(st(uid), f));
  it("a granted teacher no longer runs the collection-group queries, nor reads a result or a project directly", async () => {
    await grant("uni", { units: ["ai-s4"], orgs: ["org1", "org2"] });
    const db = fs("uni");
    await assertFails(getDocs(query(collectionGroup(db, "progress"), where("unitId", "==", "ai-s4"))));
    await assertFails(getDocs(query(collectionGroup(db, "submissions"), where("unitId", "==", "ai-s4"))));
    await assertFails(getDoc(doc(db, "users/pupil/progress/ai-s4-1")));
    await assertFails(getDoc(doc(db, "users/other/progress/ai-s4-1")));
    await assertFails(getDoc(doc(db, "users/other/submissions/s2")));
    await assertFails(getDoc(doc(db, "users/other")));
    // Their own grant is still theirs to read, and nobody's to write from a client.
    await assertSucceeds(getDoc(doc(db, "courseAccess/uni")));
    await assertFails(getDoc(doc(fs("solo"), "courseAccess/uni")));
    await assertFails(updateDoc(doc(db, "courseAccess/uni"), { orgs: ["org1", "org2", "org3"] }));
    await assertFails(updateDoc(doc(db, "courseAccess/uni"), { until: null }));
  });
  it("a file is read only in the organizations the grant names", async () => {
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"] });
    await assertSucceeds(read("uni", org1File));
    await assertFails(read("uni", org2File));
    await assertFails(read("uni", noneFile));
    await assertFails(read("uni", "submissions/org1/pupil/code-s4/d.jpg")); // a course the grant doesn't name
    // Named explicitly, another organization's files open, and people in no organization are "none".
    await grant("uni", { units: ["ai-s4"], orgs: ["org2", "none"] });
    await assertSucceeds(read("uni", org2File));
    await assertSucceeds(read("uni", noneFile));
    await assertFails(read("uni", org1File));
    await grant("uni", { units: ["ai-s4"], orgs: [] });
    for (const f of [org1File, org2File, noneFile]) await assertFails(read("uni", f));
  });
  // The organizations are fixed when the grant is made (grantCourseAccess stores the teacher's own of that moment when
  // the admin names none). The rules once fell back to the token's organization, which the teacher changes alone: by
  // leaving (every independent learner's files) or by joining another school with its student code (that school's).
  it("a grant stored without organizations opens no file, wherever the teacher's token says they are", async () => {
    await grant("uni", { units: ["ai-s4"] });
    for (const f of [org1File, org2File, noneFile]) await assertFails(read("uni", f));
    await grant("solo", { units: ["ai-s4"] });
    for (const f of [org1File, org2File, noneFile]) await assertFails(read("solo", f));
    // The same account with the token of another school it joined as a student.
    const joined = env.authenticatedContext("solo", { email: "solo@school.org", role: "student", orgId: "org2" }).storage();
    for (const f of [org1File, org2File, noneFile]) await assertFails(getBytes(ref(joined, f)));
  });
  it("a grant keeps to the organizations stored with it when the teacher leaves, or joins another school", async () => {
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"] }); // pinned to org1 when it was made
    const left = env.authenticatedContext("uni", { email: "uni@school.org", role: "learner" }).storage();
    const joined = env.authenticatedContext("uni", { email: "uni@school.org", role: "student", orgId: "org2" }).storage();
    for (const files of [left, joined]) {
      await assertSucceeds(getBytes(ref(files, org1File)));
      await assertFails(getBytes(ref(files, org2File)));
      await assertFails(getBytes(ref(files, noneFile)));
    }
    await grant("solo", { units: ["ai-s4"], orgs: ["none"] }); // a teacher in no organization, pinned to "none"
    const soloJoined = env.authenticatedContext("solo", { email: "solo@school.org", role: "student", orgId: "org2" }).storage();
    await assertSucceeds(getBytes(ref(soloJoined, noneFile)));
    await assertFails(getBytes(ref(soloJoined, org2File)));
    await assertFails(getBytes(ref(soloJoined, org1File)));
  });
  // courseResults lists a student by the organization their profile names now (functions/src/access.ts), and the
  // screen then opens each file through the SDK. The rule once went by the folder (the organization the file was sent
  // from), so a student who joined the granted school after sending work was listed with files that would not open,
  // and one who had left it kept opening.
  it("a file opens by the organization its owner is in now, as courseResults lists it", async () => {
    const early = "submissions/none/pupil/ai-s4/early.jpg"; // sent before pupil joined org1
    const moved = "submissions/org1/other/ai-s4/moved.jpg"; // sent from org1; other is in org2 now
    const left = "submissions/org1/lea/ai-s4/left.jpg"; // sent from org1; lea is in no organization now
    const nobody = "submissions/org1/nobody/ai-s4/x.jpg"; // an account with no profile
    await env.withSecurityRulesDisabled(async (c) => { for (const f of [early, moved, left, nobody]) await uploadBytes(ref(c.storage(), f), one, jpg); });
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"] });
    await assertSucceeds(read("uni", early));
    await assertFails(read("uni", moved));
    await assertFails(read("uni", left));
    await assertFails(read("uni", nobody));
    await grant("uni", { units: ["ai-s4"], orgs: ["none"] });
    await assertSucceeds(read("uni", left));
    await assertFails(read("uni", early));
    await assertFails(read("uni", nobody)); // no profile is not "no organization"
    await grant("uni", { units: ["ai-s4"], orgs: ["org2"] });
    await assertSucceeds(read("uni", moved));
    await assertFails(read("uni", early));
    // A grantee with a learner's token (no staff lookup at all) is answered the same.
    await grant("solo", { units: ["ai-s4"], orgs: ["org1"] });
    await assertSucceeds(read("solo", early));
    await assertFails(read("solo", moved));
    await assertFails(read("solo", nobody));
    // Their own files are theirs whatever the folder, as before.
    await assertSucceeds(read("pupil", early));
    await assertSucceeds(read("lea", left));
  });
  it("an expired grant opens nothing; one with time left, or no end, does", async () => {
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"], until: Date.now() - 60_000 });
    await assertFails(read("uni", org1File));
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"], until: Date.now() + 3_600_000 });
    await assertSucceeds(read("uni", org1File));
    await grant("uni", { units: ["ai-s4"], orgs: ["org1"], until: null });
    await assertSucceeds(read("uni", org1File));
  });
  it("it never opens the older, course-less folders, an upload or a delete; no grant, no file", async () => {
    await grant("uni", { units: ["ai-s4"], orgs: ["org1", "orgA"] });
    await assertSucceeds(read("uni", "submissions/orgA/pupil/ai-s4/old.jpg"));
    await assertFails(read("uni", "submissions/orgA/pupil/legacy.jpg"));
    await assertFails(uploadBytes(ref(st("uni"), "submissions/org1/pupil/ai-s4/ai-s4-cap-1730000000000-x.jpg"), one, jpg));
    await assertFails(deleteObject(ref(st("uni"), org1File)));
    await assertFails(read("teach2", org1File));
    await assertFails(read("solo", noneFile));
  });
});

describe("(f) a platform admin's browser writes little; the callables do the rest (audited)", () => {
  it("deletes no account and no organization", async () => {
    await assertFails(deleteDoc(doc(fs("boss"), "users/pupil")));
    await assertFails(deleteDoc(doc(fs("boss"), "users/lea")));
    await assertFails(deleteDoc(doc(fs("boss"), "orgs/org1")));
    await assertFails(deleteDoc(doc(fs("boss"), "orgs/org1/private/invites")));
  });
  it("changes a person's class, teacher, active flag and name, and nothing else", async () => {
    const db = fs("boss");
    await assertSucceeds(updateDoc(doc(db, "users/pupil"), { group: "7B", teacherId: "teach2", active: false, name: "Pupil One" }));
    await assertSucceeds(updateDoc(doc(db, "users/pupil"), { group: null, teacherId: null }));
    await assertFails(updateDoc(doc(db, "users/pupil"), { group: { x: 1 } }));
    for (const patch of [{ role: "orgAdmin" }, { role: "superadmin" }, { orgId: "org2" }, { orgId: null }, { createdBy: "boss" }, { email: "x@y.z" },
      { suspended: { at: 1, by: "boss" } }, { superSeat: true }, { plan: "super" }, { mustChangePassword: false }, { summary: { lessonsDone: 99 } }]) {
      await assertFails(updateDoc(doc(db, "users/pupil"), patch));
      await assertFails(updateDoc(doc(db, "users/pupil"), { name: "Pupil One", ...patch }));
    }
    await assertFails(updateDoc(doc(db, "users/boss"), { role: "superadmin", orgId: "org1" }));
    await assertFails(setDoc(doc(db, "users/made-up"), { name: "x", email: "x@y.z", role: "superadmin", orgId: null }));
  });
  it("changes an organization's name and logo, and nothing else", async () => {
    const db = fs("boss");
    await assertSucceeds(updateDoc(doc(db, "orgs/org1"), { name: "Nile Valley School", brand: { logo: "orgs/org1/brand/logo-abc123def.webp", v: 1 } }));
    await assertFails(updateDoc(doc(db, "orgs/org1"), { name: "x".repeat(81) }));
    await assertFails(updateDoc(doc(db, "orgs/org1"), { brand: { logo: "orgs/org2/brand/logo-abc123def.webp", v: 2 } }));
    for (const patch of [{ status: "suspended" }, { status: "rejected" }, { licence: { seats: 500, until: "2030-01-01" } }, { createdBy: "boss" }, { memberCount: 0 },
      { country: "Nowhere" }, { city: "Nowhere" }, { type: "university" }, { courses: { mode: "all" } }, { site: { host: "x.darsiai.org" } }, { sso: { issuer: "https://evil.example" } }]) {
      await assertFails(updateDoc(doc(db, "orgs/org1"), patch));
      await assertFails(updateDoc(doc(db, "orgs/org1"), { name: "Nile Valley School", ...patch }));
    }
    await assertFails(setDoc(doc(db, "orgs/org3"), { name: "Made up", status: "active", createdBy: "boss" }));
  });
  it("writes neither the Google Analytics settings nor a course-access grant", async () => {
    const db = fs("boss");
    await assertFails(setDoc(doc(db, "config/analytics"), { measurementId: "G-ABCD1234", apiSecret: "secret", updatedAt: serverTimestamp(), updatedBy: "boss" }));
    await assertSucceeds(getDoc(doc(db, "config/analytics")));
    await assertFails(setDoc(doc(db, "courseAccess/uni"), { units: ["ai-s4"], name: "Dr", email: "dr@x.org", grantedBy: "boss", updatedAt: serverTimestamp() }));
    await grant("uni", { units: ["ai-s4"] });
    await assertFails(updateDoc(doc(db, "courseAccess/uni"), { units: ["ai-s4", "code-s4"] }));
    await assertFails(deleteDoc(doc(db, "courseAccess/uni")));
    await assertSucceeds(getDocs(collection(db, "courseAccess")));
  });
});

describe("(g) reviews and suspended accounts", () => {
  it("nobody reviews their own project, whatever their role", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await updateDoc(doc(db, "users/teach2"), { teacherId: "teach2" }); // a teacher set as their own teacher
      for (const uid of ["adm", "teach2", "boss"]) await setDoc(doc(db, `users/${uid}/submissions/own`), { lessonId: "ai-s4-cap", unitId: "ai-s4", orgId: ACTORS[uid].profile!.orgId, text: "mine", status: "submitted" });
    });
    for (const uid of ["adm", "teach2", "boss"]) {
      await assertFails(updateDoc(doc(fs(uid), `users/${uid}/submissions/own`), review(uid)));
      await assertSucceeds(getDoc(doc(fs(uid), `users/${uid}/submissions/own`)));
    }
    // Someone else with the right still does: the admin reviews the teacher's, a platform admin the admin's.
    await assertSucceeds(updateDoc(doc(fs("adm"), "users/teach2/submissions/own"), review("adm")));
    await assertSucceeds(updateDoc(doc(fs("boss"), "users/adm/submissions/own"), review("boss")));
    await assertSucceeds(updateDoc(doc(fs("teach"), "users/pupil/submissions/s1"), review("teach")));
    // And never across organizations, or by a teacher who isn't the person's own.
    await assertFails(updateDoc(doc(fs("adm2"), "users/pupil/submissions/s1"), review("adm2")));
    await assertFails(updateDoc(doc(fs("teach2"), "users/pupil/submissions/s1"), review("teach2")));
    await assertFails(updateDoc(doc(fs("pupil"), "users/pupil/submissions/s1"), review("pupil")));
  });
  it("a suspended account sends no project and changes nothing on its profile; a new account with no profile yet still sends one", async () => {
    await assertSucceeds(setDoc(doc(fs("lea"), "users/lea/submissions/p1"), project("lea", null)));
    await assertSucceeds(setDoc(doc(fs("pupil"), "users/pupil/submissions/p1"), project("pupil", "org1")));
    await assertSucceeds(updateDoc(doc(fs("lea"), "users/lea"), { lastActive: "2026-11-04T10:00:00.000Z" }));
    // As setAccountSuspended writes it; the token is still good for up to an hour.
    await env.withSecurityRulesDisabled(async (c) => {
      for (const uid of ["lea", "pupil"]) await updateDoc(doc(c.firestore(), `users/${uid}`), { suspended: { at: 1762500000000, by: "boss", reason: "abuse" } });
    });
    await assertFails(setDoc(doc(fs("lea"), "users/lea/submissions/p2"), project("lea", null)));
    await assertFails(setDoc(doc(fs("pupil"), "users/pupil/submissions/p2"), project("pupil", "org1")));
    await assertFails(updateDoc(doc(fs("lea"), "users/lea"), { lastActive: "2026-11-05T10:00:00.000Z" }));
    await assertFails(updateDoc(doc(fs("lea"), "users/lea"), { name: "Someone else" }));
    await assertFails(updateDoc(doc(fs("lea"), "users/lea"), { suspended: null }));
    const fresh = env.authenticatedContext("fresh", { email: "fresh@gmail.com" }).firestore();
    await assertSucceeds(setDoc(doc(fresh, "users/fresh/submissions/p1"), project("fresh", null)));
  });
});

describe("(h) project files follow the person's membership now, not the folder they were sent into", () => {
  const old = "submissions/orgA/pupil/ai-s4/old.jpg", legacy = "submissions/orgA/pupil/legacy.jpg", now = "submissions/org1/pupil/ai-s4/a.jpg";
  it("the former organization's admin reads none of a departed member's files; the new organization's admin reads them all", async () => {
    for (const f of [old, legacy, now]) {
      await assertFails(getBytes(ref(st("admA"), f)));
      await assertSucceeds(getBytes(ref(st("adm"), f)));
      await assertSucceeds(getBytes(ref(st("pupil"), f)));
      await assertSucceeds(getBytes(ref(st("boss"), f)));
    }
  });
  it("the person's own teacher reads them; another teacher, another organization and other students don't", async () => {
    for (const f of [old, legacy, now]) {
      await assertSucceeds(getBytes(ref(st("teach"), f)));
      for (const uid of ["teach2", "teachB", "adm2", "pupil2", "other", "lea"]) await assertFails(getBytes(ref(st(uid), f)));
      await assertFails(getBytes(ref(anon().storage(), f)));
    }
  });
  it("once the member leaves org1, its admins and teacher lose the files, the folder name notwithstanding", async () => {
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "users/pupil"), { orgId: null, teacherId: null, role: "learner" }));
    for (const uid of ["adm", "teach"]) for (const f of [old, legacy, now]) await assertFails(getBytes(ref(st(uid), f)));
    // And an admin never reads the files of someone in no organization, whatever the folder.
    await assertFails(getBytes(ref(st("adm"), "submissions/none/lea/ai-s4/c.jpg")));
  });
  it("a person still uploads only into their own folder of their own organization, and deletes only their own", async () => {
    await assertSucceeds(uploadBytes(ref(st("pupil"), "submissions/org1/pupil/ai-s4/ai-s4-cap-1730000000000-x.jpg"), one, jpg));
    await assertFails(uploadBytes(ref(st("pupil"), "submissions/org2/pupil/ai-s4/ai-s4-cap-1730000000000-x.jpg"), one, jpg));
    await assertFails(uploadBytes(ref(st("pupil"), "submissions/org1/pupil2/ai-s4/ai-s4-cap-1730000000000-x.jpg"), one, jpg));
    for (const uid of ["adm", "teach", "boss"]) {
      await assertFails(uploadBytes(ref(st(uid), "submissions/org1/pupil/ai-s4/ai-s4-cap-1730000000000-y.jpg"), one, jpg));
      await assertFails(deleteObject(ref(st(uid), now)));
    }
    await assertSucceeds(deleteObject(ref(st("pupil"), now)));
  });
});

describe("(i) what only the functions touch, actor by actor", () => {
  // The seven kinds of caller; `pupil` is the student the owner-readable documents below belong to.
  const WHO: Record<string, () => RulesTestContext> = {
    anonymous: anon, learner: () => as("lea"), student: () => as("pupil"), teacher: () => as("teach"),
    orgAdmin: () => as("adm"), otherOrgAdmin: () => as("adm2"), superadmin: () => as("boss"),
  };
  // path, and who reads it (nobody writes any of them from a client).
  const OWNER = ["student", "superadmin"], SUPER = ["superadmin"], NOBODY: string[] = [];
  const TABLE: [string, string[]][] = [
    ["credits/pupil", OWNER], ["subscriptions/pupil", OWNER],
    ["payments/p1", SUPER], ["checkouts/c1", SUPER], ["stripeSubs/sub_1", NOBODY],
    ["inviteCodes/AAAA-BBBB-CCCC", NOBODY], ["joinAttempts/pupil", NOBODY], ["pushTokens/d1", NOBODY],
    ["audit/a1", SUPER], ["broadcasts/b1", SUPER],
    ["stats/overview", SUPER], ["analytics/2026-11-01", SUPER], ["analyticsDevices/d1", SUPER],
    ["config/settings", SUPER], ["config/plans", SUPER], ["config/tutor", SUPER], ["config/analytics", SUPER], ["config/sites", SUPER],
    ["users/pupil/devices/d1", NOBODY],
    ["accountDeletions/pupil", NOBODY],
    ["vault/x", NOBODY], // a path no rule names
    ["orgs/org1/private/invites/deeper/x", NOBODY],
  ];
  it.each(TABLE)("%s", async (path, readers) => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), { orgId: "org1", uid: "pupil", at: 1762500000000, value: "server-written" }));
    for (const [who, ctx] of Object.entries(WHO)) {
      const db = ctx().firestore();
      await (readers.includes(who) ? assertSucceeds : assertFails)(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { value: "client-written" }));
      await assertFails(setDoc(doc(db, path), { value: "client-written" }, { merge: true }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });
  it("and the lists: only a platform admin reads the audit log, the announcements and the payments", async () => {
    for (const name of ["audit", "broadcasts", "payments", "checkouts", "analytics"]) {
      await assertSucceeds(getDocs(collection(fs("boss"), name)));
      for (const uid of ["adm", "teach", "pupil", "lea"]) await assertFails(getDocs(collection(fs(uid), name)));
      await assertFails(getDocs(collection(anon().firestore(), name)));
    }
    // An org admin's own slice of the audit log comes through a callable, never a query here.
    await assertFails(getDocs(query(collection(fs("adm"), "audit"), where("orgId", "==", "org1"))));
  });
});
