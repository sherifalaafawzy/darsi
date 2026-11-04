/**
 * Rules tests for course access (out/project-work/PLAN.md v1), against the Firestore and Storage emulators:
 *   npm run test:rules -w @darsi/web   (emulators on their own ports, firebase.rules-test.json, so a running dev suite is untouched)
 * A platform admin grants a university teacher read-only access to chosen courses; the teacher can read those courses'
 * progress and submissions across students, nothing else, and can never write them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collectionGroup, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from "firebase/firestore";
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
    await setDoc(doc(db, "courseAccess/doc1"), { units: ["ai-s3"], name: "Dr", email: "dr@x.org", grantedBy: "super" });
    for (const [uid, unit, lesson] of [["s1", "ai-s3", "ai-s3-1"], ["s2", "ai-s3", "ai-s3-2"], ["s3", "code-s3", "code-s3-1"]]) {
      await setDoc(doc(db, `users/${uid}`), { name: uid, role: "learner", orgId: null });
      await setDoc(doc(db, `users/${uid}/progress/${lesson}`), { lessonId: lesson, unitId: unit, track: "x", accuracy: 0.5, xp: 10, seconds: 60, completedAt: "2026-11-01" });
      await setDoc(doc(db, `users/${uid}/submissions/sub-${uid}`), { lessonId: lesson, unitId: unit, text: "work", status: "submitted", orgId: null });
    }
    const st = c.storage();
    await uploadBytes(ref(st, "submissions/none/s1/ai-s3/a.jpg"), new Uint8Array([1, 2]), { contentType: "image/jpeg" });
    await uploadBytes(ref(st, "submissions/none/s3/code-s3/b.jpg"), new Uint8Array([1, 2]), { contentType: "image/jpeg" });
  });
});

const doctor = () => env.authenticatedContext("doc1", { role: "learner" });
const stranger = () => env.authenticatedContext("doc2", { role: "learner" });
const superAdmin = () => env.authenticatedContext("boss", { role: "superadmin" });

describe("course access grants", () => {
  it("only platform admins write grants; the teacher reads their own", async () => {
    await assertSucceeds(setDoc(doc(superAdmin().firestore(), "courseAccess/doc2"), { units: ["ai-s3"], grantedBy: "boss" }));
    await assertFails(setDoc(doc(superAdmin().firestore(), "courseAccess/doc3"), { units: ["ai-s3"], grantedBy: "someone-else" }));
    await assertFails(setDoc(doc(doctor().firestore(), "courseAccess/doc1"), { units: ["ai-s3", "code-s3"], grantedBy: "doc1" }));
    await assertFails(setDoc(doc(stranger().firestore(), "courseAccess/doc2"), { units: ["ai-s3"], grantedBy: "doc2" }));
    await assertFails(setDoc(doc(env.authenticatedContext("orgboss", { role: "orgAdmin", orgId: "o1" }).firestore(), "courseAccess/doc2"), { units: ["ai-s3"], grantedBy: "orgboss" }));
    await assertSucceeds(getDoc(doc(doctor().firestore(), "courseAccess/doc1")));
    await assertFails(getDoc(doc(stranger().firestore(), "courseAccess/doc1")));
  });
});

describe("a granted university teacher", () => {
  it("reads progress and submissions of the granted course across students", async () => {
    const db = doctor().firestore();
    const p = await assertSucceeds(getDocs(query(collectionGroup(db, "progress"), where("unitId", "==", "ai-s3"))));
    expect(p.size).toBe(2);
    const s = await assertSucceeds(getDocs(query(collectionGroup(db, "submissions"), where("unitId", "==", "ai-s3"))));
    expect(s.size).toBe(2);
    await assertSucceeds(getDoc(doc(db, "users/s1/progress/ai-s3-1")));
  });
  it("can't read other courses, unfiltered lists, or the students' profiles", async () => {
    const db = doctor().firestore();
    await assertFails(getDocs(query(collectionGroup(db, "progress"), where("unitId", "==", "code-s3"))));
    await assertFails(getDocs(collectionGroup(db, "submissions")));
    await assertFails(getDoc(doc(db, "users/s3/progress/code-s3-1")));
    await assertFails(getDoc(doc(db, "users/s1")));
  });
  it("never writes them", async () => {
    const db = doctor().firestore();
    await assertFails(updateDoc(doc(db, "users/s1/submissions/sub-s1"), { status: "approved", feedback: "ok" }));
    await assertFails(updateDoc(doc(db, "users/s1/progress/ai-s3-1"), { accuracy: 1 }));
    await assertFails(deleteDoc(doc(db, "users/s1/submissions/sub-s1")));
    await assertFails(setDoc(doc(db, "users/s1/submissions/new"), { unitId: "ai-s3", text: "x", status: "submitted" }));
  });
  it("reads project files of the granted course only, and can't upload or delete", async () => {
    const st = doctor().storage();
    await assertSucceeds(getBytes(ref(st, "submissions/none/s1/ai-s3/a.jpg")));
    await assertFails(getBytes(ref(st, "submissions/none/s3/code-s3/b.jpg")));
    await assertFails(uploadBytes(ref(st, "submissions/none/s1/ai-s3/c.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
  });
  it("loses access as soon as the grant is removed", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), "courseAccess/doc1")); });
    await assertFails(getDocs(query(collectionGroup(doctor().firestore(), "progress"), where("unitId", "==", "ai-s3"))));
    await assertFails(getBytes(ref(doctor().storage(), "submissions/none/s1/ai-s3/a.jpg")));
  });
});

describe("without a grant", () => {
  it("another teacher reads nothing", async () => {
    const db = stranger().firestore();
    await assertFails(getDocs(query(collectionGroup(db, "progress"), where("unitId", "==", "ai-s3"))));
    await assertFails(getBytes(ref(stranger().storage(), "submissions/none/s1/ai-s3/a.jpg")));
  });
  it("students still send their own work into the course folder", async () => {
    const me = env.authenticatedContext("s1", { role: "learner" });
    await assertSucceeds(uploadBytes(ref(me.storage(), "submissions/none/s1/ai-s3/new.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(me.storage(), "submissions/none/s2/ai-s3/new.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertSucceeds(setDoc(doc(me.firestore(), "users/s1/submissions/new"), { unitId: "ai-s3", lessonId: "ai-s3-cap", text: "x", status: "submitted", final: true }));
  });
});
