#!/usr/bin/env node
/**
 * A demo organization full of made-up people, to try the organization screens (the dashboard, the learning report
 * with its standards, the person pages) and the platform analytics with realistic data. Nothing here is a real person.
 *
 *   npm run demo-org -- --emulator          the local Emulator Suite (demo-darsi)
 *   npm run demo-org                        the real project (.firebaserc)
 *   npm run demo-org -- --remove            delete the demo organization and every demo account (add --emulator locally)
 *
 * What it makes (the same every time: a seeded random generator; running it again replaces it):
 * - orgs/demo-school, "Nile Valley Demo School" (`demo: true`), with invite codes (orgs/demo-school/private/invites)
 *   and its request's contact and reason (orgs/demo-school/private/request).
 * - An org admin, 4 teachers and 48 students in 4 classes. Accounts are `demo-…` uids with username logins
 *   (`demo.<name>@users.darsi.app`, docs/FIREBASE.md); students and teachers get random passwords nobody knows.
 * - Lessons finished over the last 12 weeks, from the real courses in content/units (their competencies, so the
 *   UNESCO, DigComp, ISTE and CSTA views fill in): strong, steady, struggling, inactive and new learners.
 * - The summaries the onProgressWrite trigger would write (the trigger recomputes them the same way).
 * The admin's, one teacher's and one student's logins and passwords go to .demo-org.local.json (gitignored), not
 * to the console.
 *
 * Credentials (real project): as for `npm run seed`, a service-account key in GOOGLE_APPLICATION_CREDENTIALS or
 * `gcloud auth application-default login`. Build the functions first (npm run build --prefix functions).
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const emulator = args.includes("--emulator");
const projectId = emulator ? "demo-darsi" : JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
}
process.env.GCLOUD_PROJECT = projectId;
// The Auth admin API, called with a person's own login (application-default credentials), needs a quota project.
if (!emulator) process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
initializeApp({ projectId, storageBucket: emulator ? `${projectId}.appspot.com` : "darsi-f0685", ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore(), auth = getAuth();
const { summarize } = await import(pathToFileURL(join(ROOT, "functions/lib/summary.js")).href);
const { GRADED } = await import(pathToFileURL(join(ROOT, "functions/lib/shared/types.js")).href);

const ORG = "demo-school";
const DAY = 864e5, NOW = Date.now();

/** Every account the demo made: its uids start with "demo-", or it belongs to the demo organization. */
async function remove() {
  const uids = new Set((await db.collection("users").where("orgId", "==", ORG).select().get()).docs.map((d) => d.id));
  let page;
  do {
    page = await auth.listUsers(1000, page?.pageToken);
    for (const u of page.users) if (u.uid.startsWith("demo-")) uids.add(u.uid);
  } while (page.pageToken);
  for (const uid of uids) await db.recursiveDelete(db.doc(`users/${uid}`));
  const list = [...uids];
  for (let i = 0; i < list.length; i += 1000) await auth.deleteUsers(list.slice(i, i + 1000));
  const codes = await db.collection("inviteCodes").where("orgId", "==", ORG).get();
  await Promise.all(codes.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(db.doc(`orgs/${ORG}`)); // with its private invite codes
  await getStorage().bucket().deleteFiles({ prefix: `orgs/${ORG}/` }).catch(() => {});
  return list.length;
}

if (args.includes("--remove")) {
  console.log(`Removed the demo organization and ${await remove()} demo accounts from ${projectId}.`);
  process.exit(0);
}

/* ---------- A seeded random generator, so every run makes the same school ---------- */
let seed = 20261102;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const shuffle = (xs) => xs.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/* ---------- Courses from content/units, in lesson order ---------- */
const units = readdirSync(join(ROOT, "content/units")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(ROOT, "content/units", f), "utf8")));
const lessonsOf = (u) => u.lessons.map((l) => ({ id: l.id, unitId: u.id, track: u.track, competencies: l.competencies ?? [] }));
/** Lessons with nothing marked right or wrong (projects, capstone stages): the summary doesn't score them (summary.ts). */
const ungraded = new Set(units.flatMap((u) => u.lessons.filter((l) => !(l.steps ?? []).some((s) => GRADED.has(s.type))).map((l) => l.id)));
const studentCourse = (track, level) => units.find((u) => u.track === track && u.audience === "students" && u.level === level);
const teacherCourse = (track, level) => units.find((u) => u.track === track && !u.audience && !u.teach && u.level === level);

/* ---------- People ---------- */
const NAMES = [
  "Amina Bello", "Chinedu Okeke", "Fatima Yusuf", "Kwame Mensah", "Wanjiru Kamau", "Tunde Adeyemi", "Zainab Ibrahim", "Kofi Asante",
  "Nia Otieno", "Ibrahim Musa", "Adaeze Nwosu", "Juma Mwangi", "Halima Abdi", "Emeka Eze", "Akosua Boateng", "Baraka Ochieng",
  "Hauwa Sani", "Yaw Owusu", "Achieng Odhiambo", "Segun Bakare", "Mariam Diallo", "Moussa Traoré", "Aisha Kanu", "Kipchoge Rotich",
  "Salma Hassan", "Omar Farouk", "Layla Mahmoud", "Youssef Adel", "Nour El-Din", "Hana Mostafa", "Karim Saleh", "Dina Fathy",
];
const ARABIC = ["منى عبد الرحمن", "أحمد سامي", "ياسمين خالد", "محمد إبراهيم", "سلمى حسن", "عمر فاروق", "ليلى محمود", "يوسف عادل", "نور الدين علي", "هند مصطفى", "كريم صالح", "دينا فتحي", "مريم عثمان", "طارق جمال", "رنا سعيد", "خالد منصور"];
const TEACHERS = [
  { key: "t1", name: "Grace Adeyemi", group: "Grade 5 A" }, { key: "t2", name: "Samuel Kariuki", group: "Grade 5 B" },
  { key: "t3", name: "هبة عبد الله", group: "Grade 7 A" }, { key: "t4", name: "Joseph Mensah", group: "Grade 8 A" },
];
// Grades 5 are at primary school (level 1 courses), grades 7 and 8 at lower secondary (level 2).
const CLASSES = [
  { group: "Grade 5 A", teacher: "t1", level: 1, names: NAMES.slice(0, 12) },
  { group: "Grade 5 B", teacher: "t2", level: 1, names: NAMES.slice(12, 24) },
  { group: "Grade 7 A", teacher: "t3", level: 2, names: ARABIC.slice(0, 12) },
  { group: "Grade 8 A", teacher: "t4", level: 2, names: [...NAMES.slice(24, 32), ...ARABIC.slice(12, 16)] },
];
/** How a learner behaves: how many lessons, how well, and when they last came. */
const KINDS = [
  { kind: "strong", w: 0.2, lessons: [10, 18], acc: [0.85, 1], lastDays: [0, 3], span: 84 },
  { kind: "steady", w: 0.35, lessons: [6, 12], acc: [0.65, 0.88], lastDays: [0, 6], span: 70 },
  { kind: "struggling", w: 0.15, lessons: [3, 8], acc: [0.3, 0.58], lastDays: [1, 10], span: 56 },
  { kind: "inactive", w: 0.15, lessons: [2, 6], acc: [0.55, 0.85], lastDays: [18, 50], span: 40 },
  { kind: "new", w: 0.15, lessons: [0, 1], acc: [0.6, 0.9], lastDays: [0, 4], span: 4 },
];
const kindOf = () => { let r = rnd(); for (const k of KINDS) { if ((r -= k.w) < 0) return k; } return KINDS[1]; };
const slug = (name, i) => `${name.toLowerCase().normalize("NFKD").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "") || "learner"}${i}`;
const password = () => randomBytes(9).toString("base64url");

/** Lessons finished: the courses in order, spread from `span` days ago to the last visit, a little noise each time. */
function progressFor(courses, k) {
  const lessons = courses.flatMap(lessonsOf);
  const n = Math.min(lessons.length, int(k.lessons[0], k.lessons[1]));
  const last = NOW - between(k.lastDays[0], k.lastDays[1]) * DAY;
  const first = last - k.span * DAY;
  const base = between(k.acc[0], k.acc[1]);
  return lessons.slice(0, n).map((l, i) => {
    const accuracy = Math.round(Math.min(1, Math.max(0, base + between(-0.12, 0.12))) * 100) / 100;
    const at = n === 1 ? last : first + ((last - first) * i) / (n - 1);
    return {
      lessonId: l.id, unitId: l.unitId, track: l.track, accuracy, xp: 10 + Math.round(accuracy * 20), seconds: int(240, 1500),
      completedAt: new Date(at).toISOString(), competencies: l.competencies, attempts: accuracy < 0.6 ? int(1, 3) : 1,
    };
  });
}

async function account(uid, { name, login, role, group, teacherId, lastActive, createdDaysAgo, extra = {} }) {
  const email = `${login}@users.darsi.app`, pw = password();
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email, password: pw, displayName: name });
  await auth.setCustomUserClaims(uid, { role, orgId: ORG });
  await db.doc(`users/${uid}`).set({
    name, email, username: login, role, orgId: ORG, lang: /[؀-ۿ]/.test(name) ? "ar" : "en", demo: true, active: true,
    ...(group ? { group } : {}), ...(teacherId ? { teacherId } : {}),
    createdAt: Timestamp.fromMillis(NOW - createdDaysAgo * DAY), createdBy: "demo-org", lastActive, mustChangePassword: false, ...extra,
  });
  return { login, password: pw };
}

async function writeProgress(uid, rows) {
  const batch = db.batch();
  for (const p of rows) batch.set(db.doc(`users/${uid}/progress/${p.lessonId}`), p);
  // The summary the trigger would write; it recomputes the same thing when it sees the progress docs.
  batch.set(db.doc(`users/${uid}`), { summary: summarize(rows.map((p) => (ungraded.has(p.lessonId) ? { ...p, graded: false } : p)), NOW) }, { merge: true });
  await batch.commit();
}

const removed = await remove();
// Invite codes as joinOrg expects them (functions/src/passwords.ts): 12 characters with no look-alikes, in groups of 4.
const SET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(randomBytes(12), (b) => SET[b % SET.length]).join("").replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
const codes = { teacher: code(), student: code() };
await db.doc(`orgs/${ORG}`).set({
  name: "Nile Valley Demo School", type: "school", country: "EG", city: "Aswan", size: 52, status: "active", demo: true,
  createdBy: "demo-admin", memberCount: 53, createdAt: Timestamp.fromMillis(NOW - 100 * DAY), reviewedAt: Timestamp.fromMillis(NOW - 99 * DAY),
});
await db.doc(`orgs/${ORG}/private/invites`).set(codes);
// The request's contact and reason are private, as requestOrg stores them: every member reads the org document.
await db.doc(`orgs/${ORG}/private/request`).set({ contact: "Demo data, not a real school", reason: "Made by scripts/demo-org.mjs for testing" });
await Promise.all(Object.entries(codes).map(([role, c]) => db.doc(`inviteCodes/${c}`).set({ orgId: ORG, role })));

const logins = {};
logins.admin = await account("demo-admin", { name: "Demo Admin", login: "demo.admin", role: "orgAdmin", lastActive: new Date(NOW).toISOString(), createdDaysAgo: 100 });
const tracks = ["ai", "cyber", "iot", "code", "data"];
let people = 1;
for (const t of TEACHERS) {
  // Teachers learn too: two tracks of teacher courses, at their own pace.
  const k = pick([KINDS[0], KINDS[1], KINDS[1], KINDS[3]]);
  const mine = shuffle(tracks).slice(0, 2);
  const rows = progressFor(mine.flatMap((tr) => [teacherCourse(tr, 1), teacherCourse(tr, 2)]).filter(Boolean), k);
  const last = rows.at(-1)?.completedAt ?? new Date(NOW - 5 * DAY).toISOString();
  const l = await account(`demo-${t.key}`, { name: t.name, login: `demo.${t.key}`, role: "teacher", group: t.group, lastActive: last, createdDaysAgo: 95, extra: { teach: "primary", tracks: mine } });
  if (t.key === "t1") logins.teacher = l;
  await writeProgress(`demo-${t.key}`, rows);
  people++;
}
let i = 0;
for (const c of CLASSES) {
  for (const name of c.names) {
    i++;
    const k = kindOf();
    const mine = shuffle(tracks).slice(0, int(1, 3));
    const rows = progressFor(mine.map((tr) => studentCourse(tr, c.level)).filter(Boolean), k);
    const last = rows.at(-1)?.completedAt ?? new Date(NOW - between(k.lastDays[0], k.lastDays[1]) * DAY).toISOString();
    const uid = `demo-s${String(i).padStart(2, "0")}`;
    const l = await account(uid, { name, login: `demo.${slug(name, i)}`, role: "student", group: c.group, teacherId: `demo-${c.teacher}`, lastActive: last, createdDaysAgo: k.kind === "new" ? 3 : 90, extra: { tracks: mine } });
    if (i === 1) logins.student = l;
    await writeProgress(uid, rows);
    people++;
  }
}

writeFileSync(join(ROOT, ".demo-org.local.json"), JSON.stringify({ project: projectId, site: emulator ? "http://localhost:5173" : "https://darsiai.org", note: "Demo accounts made by scripts/demo-org.mjs. Remove them with npm run demo-org -- --remove.", ...logins }, null, 2) + "\n");
console.log(`${removed ? `Replaced the demo organization (${removed} old accounts). ` : ""}Made "Nile Valley Demo School" in ${projectId}: ${people} accounts (1 admin, ${TEACHERS.length} teachers, ${i} students in ${CLASSES.length} classes).`);
console.log("Logins for the admin, a teacher and a student are in .demo-org.local.json.");
process.exit(0);
