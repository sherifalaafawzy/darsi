/**
 * Rules tests for school sign-in (TECHNICAL.md "School sign-in", design §3), against the Firestore emulator:
 *   npm run test:rules -w @darsi/web
 * Everything school sign-in keeps is the functions' alone: no client reads or writes ssoIdentities, ssoUsed, ssoSlugs,
 * ssoTests, ssoSecrets, or an organization's private/sso and private/ssoHealth (platform admins and the organization's
 * own admins included: they read them through manageSso). Its other private documents (invites) stay readable by its
 * admins. No client writes the profile fields that say an account is the school's (sso, ssoEmail, managedBy,
 * ssoLinkedAt): not at sign-up, not on its own profile, not as an org admin or a platform admin.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const root = resolve(__dirname, "../../..");
const PROJECT = "demo-darsi-rules";

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync(resolve(root, "firebase/firestore.rules"), "utf8") } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users/boss"), { name: "Boss", role: "superadmin", orgId: null });
    await setDoc(doc(db, "users/adm"), { name: "Admin", role: "orgAdmin", orgId: "org1" });
    await setDoc(doc(db, "users/pupil"), { name: "Pupil", role: "student", orgId: "org1", managedBy: "org1", sso: true, createdBy: "sso", ssoEmail: "p@school.edu" });
    await setDoc(doc(db, "users/lea"), { name: "Lea", role: "learner", orgId: null, email: "lea@mail.example" });
    await setDoc(doc(db, "orgs/org1"), { name: "Nile School", status: "active", sso: { on: true, slug: "nile-abcd", listed: false } });
    await setDoc(doc(db, "orgs/org1/private/sso"), { status: "on", clientId: "c", issuer: "https://idp.school.edu" });
    await setDoc(doc(db, "orgs/org1/private/ssoHealth"), { problems: {} });
    await setDoc(doc(db, "orgs/org1/private/invites"), { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF" });
    await setDoc(doc(db, "ssoIdentities/i1"), { uid: "pupil", orgId: "org1", state: "active" });
    await setDoc(doc(db, "ssoUsed/s1"), { expireAt: new Date() });
    await setDoc(doc(db, "ssoSlugs/nile-abcd"), { orgId: "org1" });
    await setDoc(doc(db, "ssoTests/t1"), { orgId: "org1" });
    await setDoc(doc(db, "ssoSecrets/org1"), { live: { kid: "k1", iv: "x", ct: "y" } });
  });
});

const as = (uid: string, token: Record<string, unknown>) => env.authenticatedContext(uid, token).firestore();
const boss = () => as("boss", { role: "superadmin" });
const adm = () => as("adm", { role: "orgAdmin", orgId: "org1" });
const pupil = () => as("pupil", { role: "student", orgId: "org1", sso: "org1" });
const lea = () => as("lea", { role: "learner", email: "lea@mail.example" });
const guest = () => env.unauthenticatedContext().firestore();

describe("school sign-in's own collections are the functions' alone", () => {
  const SERVER_ONLY = ["ssoIdentities/i1", "ssoUsed/s1", "ssoSlugs/nile-abcd", "ssoTests/t1", "ssoSecrets/org1"];
  it("nobody reads, lists, writes or deletes them, platform admins included", async () => {
    for (const db of [boss(), adm(), pupil(), lea(), guest()]) {
      for (const path of SERVER_ONLY) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { orgId: "org1" }));
        await assertFails(deleteDoc(doc(db, path)));
        await assertFails(getDocs(collection(db, path.split("/")[0])));
      }
    }
  });
  it("an organization's sso configuration and health are closed even to its admins; its invites are not", async () => {
    for (const db of [boss(), adm(), pupil()]) {
      await assertFails(getDoc(doc(db, "orgs/org1/private/sso")));
      await assertFails(getDoc(doc(db, "orgs/org1/private/ssoHealth")));
      await assertFails(setDoc(doc(db, "orgs/org1/private/sso"), { status: "on" }));
    }
    await assertSucceeds(getDoc(doc(adm(), "orgs/org1/private/invites")));
    await assertSucceeds(getDoc(doc(boss(), "orgs/org1/private/invites")));
  });
  it("orgs/{id}.sso is the functions': an org admin's or platform admin's browser can't turn it on or list itself", async () => {
    await assertFails(updateDoc(doc(adm(), "orgs/org1"), { "sso.listed": true }));
    await assertFails(updateDoc(doc(boss(), "orgs/org1"), { sso: { on: false } }));
    await assertSucceeds(getDoc(doc(pupil(), "orgs/org1"))); // members still read their organization (name, logo, sso.on)
  });
});

describe("the profile fields that make an account the school's", () => {
  const FIELDS: Record<string, unknown> = { sso: true, ssoEmail: "x@school.edu", managedBy: "org1", ssoLinkedAt: 1 };
  it("can't be written at sign-up", async () => {
    for (const [k, v] of Object.entries(FIELDS)) {
      await assertFails(setDoc(doc(as("newbie", { email: "newbie@mail.example" }), "users/newbie"), {
        name: "New", email: "newbie@mail.example", role: "learner", orgId: null, createdAt: serverTimestamp(), [k]: v,
      }));
    }
    await assertSucceeds(setDoc(doc(as("newbie", { email: "newbie@mail.example" }), "users/newbie"), { name: "New", email: "newbie@mail.example", role: "learner", orgId: null, createdAt: serverTimestamp() }));
  });
  it("nor on one's own profile, nor by an org admin or a platform admin, nor taken away", async () => {
    // Each value differs from what users/pupil already holds: an update that writes a field's current value changes
    // nothing (no affected key), so the rules rightly allow it, and the test would prove nothing (managedBy "org1"
    // once made this case pass its write).
    const CHANGED: Record<string, unknown> = { sso: false, ssoEmail: "x@school.edu", managedBy: "org2", ssoLinkedAt: 1 };
    for (const [k, v] of Object.entries(FIELDS)) {
      await assertFails(updateDoc(doc(lea(), "users/lea"), { [k]: v }));
      await assertFails(updateDoc(doc(adm(), "users/pupil"), { [k]: CHANGED[k] }));
      await assertFails(updateDoc(doc(boss(), "users/pupil"), { [k]: CHANGED[k] }));
    }
    // Taking a field away is a change too.
    await assertFails(updateDoc(doc(adm(), "users/pupil"), { managedBy: deleteField() }));
    await assertFails(updateDoc(doc(boss(), "users/pupil"), { sso: deleteField() }));
    await assertFails(updateDoc(doc(pupil(), "users/pupil"), { sso: false }));
    await assertFails(updateDoc(doc(pupil(), "users/pupil"), { ssoEmail: "else@school.edu" }));
    // What they may change stays changeable.
    await assertSucceeds(updateDoc(doc(pupil(), "users/pupil"), { lang: "ar" }));
    await assertSucceeds(updateDoc(doc(adm(), "users/pupil"), { group: "5B" }));
  });
});
