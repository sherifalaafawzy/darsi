/**
 * Rules tests for the security review's fixes (TECHNICAL.md "Security"), against the Firestore and Storage emulators:
 *   npm run test:rules -w @darsi/web
 * Each attack the review describes must now be refused, and each write the app really makes must still pass:
 * the profile at sign-up (email and Google), its later edits, progress sync, notes, projects with their files, a
 * teacher's review, the course editor's batch and an org logo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let env: RulesTestEnvironment;
const root = resolve(__dirname, "../../..");
const PROJECT = "demo-darsi-rules";

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
    const db = c.firestore();
    await setDoc(doc(db, "users/amina"), { name: "Amina", email: "amina@school.org", role: "learner", orgId: null, lastActive: "2026-11-01T00:00:00.000Z" });
    await setDoc(doc(db, "users/pupil"), { name: "Pupil", email: "pupil@users.darsi.app", role: "student", orgId: "org1", teacherId: "teach", mustChangePassword: true });
    await setDoc(doc(db, "users/pupil/submissions/s1"), { lessonId: "ai-s1-1", unitId: "ai-s1", orgId: "org1", text: "work", status: "submitted" });
    await setDoc(doc(db, "units/uabcdefgh"), { owner: "org2", title: { en: "Theirs" }, rev: 1, updatedBy: "other", published: null });
  });
});

const learner = (uid: string, email: string) => env.authenticatedContext(uid, { email, role: "learner" });
const prog = (lessonId: string, extra: Record<string, unknown> = {}) => ({ lessonId, accuracy: 0.8, xp: 26, seconds: 300, completedAt: "2026-11-04T10:00:00.000Z", unitId: "ai-1-1", track: "ai", competencies: ["T.1"], ...extra });
const fileUrl = (uid: string, org = "none") => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2F${org}%2F${uid}%2Fai-1-1%2Fai-1-1-4-1730000000000-photo.jpg?alt=media&token=abc`;
// Like ProjectView's addDoc; an `undefined` in extra leaves that field out, as the app does.
const project = (uid: string, extra: Record<string, unknown> = {}) => Object.fromEntries(Object.entries({
  lessonId: "ai-1-1-4", unitId: "ai-1-1", stepId: "project", orgId: null, text: "What we did", fileUrl: fileUrl(uid), fileName: "photo.jpg",
  files: [{ url: fileUrl(uid), name: "photo.jpg", type: "image/jpeg" }], status: "submitted", createdAt: serverTimestamp(), ...extra,
}).filter(([, v]) => v !== undefined));

describe("profiles (H1, L1, I1)", () => {
  it("a new account's profile carries its own email, from sign-up by email or by Google", async () => {
    const me = learner("new1", "new1@gmail.com");
    await assertSucceeds(setDoc(doc(me.firestore(), "users/new1"), { name: "New", email: "new1@gmail.com", lang: "en", role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive: "2026-11-04T10:00:00.000Z" }));
    // Google can hand over an address with capitals; the app stores it in lower case, as the rule compares it.
    const g = learner("new2", "Dr.Bello@Gmail.com");
    await assertSucceeds(setDoc(doc(g.firestore(), "users/new2"), { name: "", email: "dr.bello@gmail.com", lang: "ar", role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive: "2026-11-04T10:00:00.000Z" }));
  });
  it("but never someone else's address, a username, or the first-login flag", async () => {
    const me = learner("evil", "evil@x.org");
    await assertFails(setDoc(doc(me.firestore(), "users/evil"), { name: "Dr. Amina Bello", email: "amina.bello@univ.edu", lang: "en", role: "learner", orgId: null }));
    await assertFails(setDoc(doc(me.firestore(), "users/evil"), { name: "x", email: "evil@x.org", username: "amina.bello", role: "learner", orgId: null }));
    await assertFails(setDoc(doc(me.firestore(), "users/evil"), { name: "x", email: "evil@x.org", role: "learner", orgId: null, mustChangePassword: true }));
    await assertFails(setDoc(doc(env.authenticatedContext("noemail", {}).firestore(), "users/noemail"), { name: "x", email: "a@b.c", role: "learner", orgId: null }));
  });
  it("its owner edits it with the right types, and can't change the email", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    await assertSucceeds(updateDoc(doc(db, "users/amina"), { lastActive: "2026-11-04T10:00:00.000Z" }));
    await assertSucceeds(setDoc(doc(db, "users/amina"), { teach: "secondary" }, { merge: true }));
    await assertSucceeds(updateDoc(doc(db, "users/amina"), { name: "Amina B.", tracks: ["ai", "iot"], weeklyLessons: 4, levels: { ai: 2 }, lang: "ar" }));
    await assertFails(updateDoc(doc(db, "users/amina"), { email: "someone@else.org" }));
    await assertFails(updateDoc(doc(db, "users/amina"), { name: 123 }));
    await assertFails(updateDoc(doc(db, "users/amina"), { name: "x".repeat(121) }));
    await assertFails(updateDoc(doc(db, "users/amina"), { tracks: "ai" }));
    await assertFails(updateDoc(doc(db, "users/amina"), { lastActive: { big: true } }));
  });
  it("a member can't clear the first-login flag without changing the password (passwordChanged does it)", async () => {
    const db = env.authenticatedContext("pupil", { email: "pupil@users.darsi.app", role: "student", orgId: "org1" }).firestore();
    await assertFails(updateDoc(doc(db, "users/pupil"), { mustChangePassword: false }));
    await assertSucceeds(updateDoc(doc(db, "users/pupil"), { lastActive: "2026-11-04T10:00:00.000Z" }));
  });
  it("an org admin still organises members, with the right types", async () => {
    const db = env.authenticatedContext("adm", { role: "orgAdmin", orgId: "org1" }).firestore();
    await assertSucceeds(updateDoc(doc(db, "users/pupil"), { group: "7B", teacherId: "teach2", active: true }));
    await assertSucceeds(updateDoc(doc(db, "users/pupil"), { group: null }));
    await assertFails(updateDoc(doc(db, "users/pupil"), { group: { x: 1 } }));
    await assertFails(updateDoc(doc(db, "users/pupil"), { email: "x@y.z" }));
  });
});

describe("progress (H2)", () => {
  it("sync's own writes pass", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    await assertSucceeds(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1")));
    await assertSucceeds(setDoc(doc(db, "users/amina/progress/ai-1-1-2"), { lessonId: "ai-1-1-2", accuracy: 1, xp: 0, seconds: 0, completedAt: "2026-11-04T10:00:00.000Z" }));
  });
  it("anything untyped, oversized, or under another id is refused", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-2")));
    await assertFails(setDoc(doc(db, "users/amina/progress/NOT_A_LESSON"), prog("NOT_A_LESSON")));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { seconds: "lots" })));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { seconds: 9e12 })));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { completedAt: 12 })));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { competencies: Array.from({ length: 31 }, (_, i) => `C${i}`) })));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { unitId: "x".repeat(65) })));
    await assertFails(setDoc(doc(db, "users/amina/progress/ai-1-1-1"), prog("ai-1-1-1", { extra: 1 })));
  });
});

describe("notes", () => {
  it("sync writes {text, updatedAt}; nothing else", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    await assertSucceeds(setDoc(doc(db, "users/amina/notes/ai-1-1-1"), { text: "my note", updatedAt: Date.now() }));
    await assertFails(setDoc(doc(db, "users/amina/notes/ai-1-1-1"), { text: "x", junk: "y".repeat(10) }));
  });
});

describe("projects (M8)", () => {
  it("ProjectView's submission passes, with or without files, and a final project's fields", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    await assertSucceeds(setDoc(doc(db, "users/amina/submissions/a1"), project("amina")));
    await assertSucceeds(setDoc(doc(db, "users/amina/submissions/a2"), project("amina", { fileUrl: null, fileName: null, files: undefined })));
    await assertSucceeds(setDoc(doc(db, "users/amina/submissions/a3"), { ...project("amina"), final: true, explain: "How", aiUse: "none", name: "Amina" }));
    const member = env.authenticatedContext("pupil", { email: "pupil@users.darsi.app", role: "student", orgId: "org1" }).firestore();
    await assertSucceeds(setDoc(doc(member, "users/pupil/submissions/p1"), project("pupil", { orgId: "org1", fileUrl: fileUrl("pupil", "org1"), files: [{ url: fileUrl("pupil", "org1"), name: "p.jpg", type: "image/jpeg" }] })));
    // The Storage emulator's links (npm run local).
    await assertSucceeds(setDoc(doc(db, "users/amina/submissions/a4"), project("amina", { fileUrl: "http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/submissions%2Fnone%2Famina%2Fai-1-1%2Fx.jpg?alt=media&token=t", files: undefined })));
  });
  it("a link anywhere else, another person's folder, a made-up organization or a review is refused", async () => {
    const db = learner("amina", "amina@school.org").firestore();
    const without = (k: string) => { const p: Record<string, unknown> = project("amina"); delete p[k]; return p; };
    await assertFails(setDoc(doc(db, "users/amina/submissions/x1"), project("amina", { fileUrl: "https://darsi-signin.example/login", files: undefined })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x2"), project("amina", { fileUrl: fileUrl("someoneelse"), files: undefined })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x3"), project("amina", { fileUrl: "https://firebasestorage.googleapis.com/v0/b/attacker/o/submissions%2Fnone%2Famina%2Fx.html", files: undefined })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x4"), project("amina", { files: [{ url: "https://evil.example/x", name: "photo.jpg", type: "image/jpeg" }] })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x5"), project("amina", { orgId: "org1" })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x6"), project("amina", { score: 10, feedback: "Great", reviewedBy: "amina" })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x7"), project("amina", { status: "approved" })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x8"), project("amina", { createdAt: new Date("2020-01-01") })));
    await assertFails(setDoc(doc(db, "users/amina/submissions/x9"), without("createdAt")));
  });
  it("the student's teacher still reviews it; nobody signs a review as someone else", async () => {
    const db = env.authenticatedContext("teach", { role: "teacher", orgId: "org1" }).firestore();
    await assertSucceeds(updateDoc(doc(db, "users/pupil/submissions/s1"), { status: "approved", feedback: "Well done", reviewedBy: "teach", reviewedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "users/pupil/submissions/s1"), { status: "revise", feedback: "x", reviewedBy: "someone-else" }));
    await assertFails(updateDoc(doc(db, "users/pupil/submissions/s1"), { status: "hacked" }));
  });
});

describe("the course editor (L12)", () => {
  it("still creates a unit and its draft in one batch", async () => {
    const db = env.authenticatedContext("adm", { role: "orgAdmin", orgId: "org1" }).firestore();
    const b = writeBatch(db);
    b.set(doc(db, "units/u12345678"), { owner: "org1", title: { en: "Mine" }, track: "ai", level: 1, lessonCount: 0, lessons: [], rev: 1, updatedAt: serverTimestamp(), updatedBy: "adm", published: null });
    b.set(doc(db, "unitDrafts/u12345678"), { owner: "org1", rev: 1, unit: { id: "u12345678" } });
    await assertSucceeds(b.commit());
  });
  it("never a draft beside another owner's unit, nor a unit over another owner's draft", async () => {
    const db = env.authenticatedContext("adm", { role: "orgAdmin", orgId: "org1" }).firestore();
    await assertFails(setDoc(doc(db, "unitDrafts/uabcdefgh"), { owner: "org1", rev: 1, unit: { id: "uabcdefgh" } }));
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "unitDrafts/uzzzzzzzz"), { owner: "org2", rev: 1, unit: { id: "uzzzzzzzz" } }); });
    await assertFails(setDoc(doc(db, "units/uzzzzzzzz"), { owner: "org1", title: { en: "x" }, rev: 1, updatedBy: "adm", published: null }));
  });
});

describe("Storage: project files (L2) and logos", () => {
  const me = () => env.authenticatedContext("amina", { role: "learner" }).storage();
  const name = (f: string) => `submissions/none/amina/ai-1-1/ai-1-1-4-1730000000000-${f}`;
  it("photos, PDFs and voice notes named as the app names them pass", async () => {
    await assertSucceeds(uploadBytes(ref(me(), name("photo.jpg")), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(me(), name("plan.pdf")), new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(me(), name("note.m4a")), new Uint8Array([1]), { contentType: "audio/mp4" }));
    await assertSucceeds(uploadBytes(ref(me(), name("IMG_2041.HEIC")), new Uint8Array([1]), { contentType: "image/heic" }));
    const pupil = env.authenticatedContext("pupil", { role: "student", orgId: "org1" }).storage();
    await assertSucceeds(uploadBytes(ref(pupil, "submissions/org1/pupil/ai-s1/ai-s1-1-1730000000000-x.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
  });
  it("SVG, web pages, odd names and other folders are refused", async () => {
    await assertFails(uploadBytes(ref(me(), name("x.svg")), new Uint8Array([1]), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(me(), name("x.html")), new Uint8Array([1]), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(me(), "submissions/none/amina/ai-1-1/../../x.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(me(), "submissions/none/amina/ai-1-1/whatever.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(me(), "submissions/org1/amina/ai-1-1/ai-1-1-4-1730000000000-x.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(me(), name("big.jpg")), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "image/jpeg" }));
  });
  it("an org admin still uploads the org's logo", async () => {
    const adm = env.authenticatedContext("adm", { role: "orgAdmin", orgId: "org1" }).storage();
    await assertSucceeds(uploadBytes(ref(adm, "orgs/org1/brand/logo-abc123def.webp"), new Uint8Array([1]), { contentType: "image/webp" }));
  });
});

describe("problem reports", () => {
  const seed = () => env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "bugReports/b1"), { status: "new", text: "It broke", user: { uid: "amina" }, details: {} });
    await uploadBytes(ref(c.storage(), "bugReports/b1.jpg"), new Uint8Array([0xff, 0xd8, 0xff]), { contentType: "image/jpeg" });
  });
  const admin = () => env.authenticatedContext("boss", { role: "superadmin" });
  it("only platform admins read them and their screenshots, even the person who sent one", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(admin().firestore(), "bugReports/b1")));
    await assertSucceeds(getBytes(ref(admin().storage(), "bugReports/b1.jpg")));
    for (const c of [learner("amina", "amina@school.org"), env.authenticatedContext("oa", { role: "orgAdmin", orgId: "org1" }), env.unauthenticatedContext()]) {
      await assertFails(getDoc(doc(c.firestore(), "bugReports/b1")));
      await assertFails(getBytes(ref(c.storage(), "bugReports/b1.jpg")));
    }
  });
  it("a platform admin changes the status, signed as themselves; nothing else", async () => {
    await seed();
    const db = admin().firestore();
    await assertSucceeds(updateDoc(doc(db, "bugReports/b1"), { status: "fixed", statusBy: "boss", statusAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "bugReports/b1"), { status: "fixed", statusBy: "someone", statusAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "bugReports/b1"), { status: "gone", statusBy: "boss", statusAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "bugReports/b1"), { text: "Edited", status: "closed", statusBy: "boss", statusAt: serverTimestamp() }));
  });
  it("nobody writes one or a screenshot directly: only the function does", async () => {
    for (const c of [admin(), learner("amina", "amina@school.org"), env.unauthenticatedContext()]) {
      await assertFails(setDoc(doc(c.firestore(), "bugReports/new1"), { status: "new", text: "Spam" }));
      await assertFails(uploadBytes(ref(c.storage(), "bugReports/new1.jpg"), new Uint8Array([0xff, 0xd8, 0xff]), { contentType: "image/jpeg" }));
    }
    await seed();
    await assertFails(deleteDoc(doc(admin().firestore(), "bugReports/b1")));
  });
});
