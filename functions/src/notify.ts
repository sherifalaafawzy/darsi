/**
 * Push notifications: device registration, preferences, announcements, staff and review alerts, daily nudges.
 * Opt-in only: nothing is sent unless the person turned notifications on for a device (notify.on) and kept the category on.
 * Payloads are data-only web push (see messages.ts) and are shown by apps/web/public/push-sw.js.
 */
import { createHash } from "node:crypto";
import { FieldValue, type DocumentData, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { audit, caller, db, messaging, str } from "./admin.js";
import {
  broadcastCondition, isTopicPart, linkFor, message, tagFor, topicLang, topicsFor, webpush, wordingFor,
  type Audience, type Cat, type Kind, type Lang, type MessageVars,
} from "./messages.js";
import { isValidTz, parseTime, pickNudge, utcHourFor } from "./nudge.js";
import { LANG_CODE } from "./shared/languages.js";

interface Cats { reminders: boolean; reviews: boolean; staff: boolean; news: boolean }
interface Notify {
  on?: boolean; hourLocal?: number; hourUtc?: number; tz?: string; cats?: Partial<Cats>; weeklyGoal?: number;
  lastAutoAt?: string; comeback7At?: string; comeback21At?: string;
}
const CAT_KEYS: (keyof Cats)[] = ["reminders", "reviews", "staff", "news"];
/** Announcements are written in these two; phones in other languages get the English one. */
const LANGS = ["en", "ar"] as const;
/** FCM errors that mean the token will never work again: the device is forgotten. */
const STALE = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

/* ---------- Validation ---------- */

const bad = (msg: string) => new HttpsError("invalid-argument", msg);
function vToken(v: unknown): string {
  if (typeof v !== "string" || v.length < 20 || v.length > 4096) throw bad("token must be a string of 20 to 4096 characters.");
  return v;
}
function vLang(v: unknown): Lang {
  if (typeof v !== "string" || !LANG_CODE.test(v)) throw bad("lang must be a language code such as en, ar or fr.");
  return v;
}
function vTz(v: unknown): string {
  if (!isValidTz(v)) throw bad("tz must be a valid IANA time zone.");
  return v;
}
function vHour(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 23) throw bad("hourLocal must be an integer from 0 to 23.");
  return v;
}
function vGoal(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 14) throw bad("weeklyGoal must be an integer from 1 to 14.");
  return v;
}
/** Every category sent must be a boolean. One left out keeps its saved value (on, the first time). */
function vCats(v: unknown, prev: Partial<Cats> = {}): Cats {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw bad("cats must be an object of booleans.");
  const o = v as Record<string, unknown>;
  const out = {} as Cats;
  for (const k of CAT_KEYS) {
    if (k in o && typeof o[k] !== "boolean") throw bad(`cats.${k} must be a boolean.`);
    out[k] = typeof o[k] === "boolean" ? (o[k] as boolean) : prev[k] ?? true;
  }
  return out;
}
function vText(v: unknown, max: number, what: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  const n = Array.from(s).length;
  if (n < 1 || n > max) throw bad(`${what} needs 1 to ${max} characters.`);
  return s;
}
/** An app path. "//host" would leave the app, so it is refused. */
function vLink(v: unknown): string {
  if (v === undefined || v === null || v === "") return "/learn";
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 200) throw bad("link must be an app path starting with /.");
  return v;
}
async function vAudience(v: unknown): Promise<Audience> {
  const a = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  if (a.type === "all") return { type: "all" };
  if (a.type === "org") {
    const orgId = str(a.orgId, 128);
    if (!orgId || !isTopicPart(orgId)) throw bad("audience.orgId is required.");
    if (!(await db.doc(`orgs/${orgId}`).get()).exists) throw new HttpsError("not-found", "No such organization.");
    return { type: "org", orgId };
  }
  if (a.type === "role") {
    if (a.role !== "student" && a.role !== "teacher" && a.role !== "orgAdmin") throw bad("audience.role must be student, teacher or orgAdmin.");
    return { type: "role", role: a.role };
  }
  throw bad("audience.type must be all, org or role.");
}

/* ---------- Devices and topics ---------- */

const deviceIdOf = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 40);
const langOf = (v: unknown): Lang => topicLang(typeof v === "string" ? v.toLowerCase() : v);
const topicsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []);
const userTopics = (u: DocumentData | undefined, lang: Lang, news: boolean) => topicsFor(lang, u?.role, u?.orgId ?? null, news);

/** Moves one token from the topics it has to the ones it should have. Returns the topics it is now in. */
async function applyTopics(token: string, had: string[], want: string[]): Promise<string[]> {
  const now = new Set(had);
  const change = async (topic: string, add: boolean) => {
    try {
      const r = add ? await messaging.subscribeToTopic(token, topic) : await messaging.unsubscribeFromTopic(token, topic);
      if (r.failureCount === 0) { if (add) now.add(topic); else now.delete(topic); }
      else logger.warn("topic change failed", { topic, add, error: r.errors[0]?.error?.code });
    } catch (e) {
      logger.warn("topic change failed", { topic, add, error: String(e) });
    }
  };
  await Promise.all([
    ...had.filter((t) => !want.includes(t)).map((t) => change(t, false)),
    ...want.filter((t) => !had.includes(t)).map((t) => change(t, true)),
  ]);
  return [...now].sort();
}

/** Re-applies topics on every device of a person (news toggle, role, organization or language change). */
async function reapplyTopics(uid: string, user: DocumentData | undefined, news: boolean, lang?: Lang) {
  const devs = await db.collection(`users/${uid}/devices`).get();
  await Promise.all(devs.docs.map(async (d) => {
    const token = d.get("token");
    if (typeof token !== "string") return;
    const devLang = lang ?? langOf(d.get("lang"));
    const had = topicsOf(d.get("topics"));
    const topics = await applyTopics(token, had, userTopics(user, devLang, news));
    if (topics.join() !== [...had].sort().join() || devLang !== d.get("lang")) await d.ref.update({ topics, lang: devLang });
  }));
}

/** With no device left, the scheduler stops looking at this person. */
async function turnOffIfNoDevices(uid: string) {
  const left = await db.collection(`users/${uid}/devices`).limit(1).get();
  if (!left.empty) return;
  await db.doc(`users/${uid}`).update({ "notify.on": false }).catch((e) => logger.warn("notify.on not cleared", { uid, error: String(e) }));
}

/** Forgets a device: its doc and, if it still points here, the token's owner record. */
async function forgetDevice(uid: string, ref: DocumentReference) {
  const owner = db.doc(`pushTokens/${ref.id}`);
  await ref.delete();
  const o = await owner.get();
  if (o.get("uid") === uid) await owner.delete();
}

/* ---------- Sending ---------- */

/** Sends one kind to all of a person's devices, each in its own language. Returns how many devices accepted it. */
async function deliver(uid: string, kind: Kind, vars: MessageVars, link: string, tag: string): Promise<number> {
  const devs = await db.collection(`users/${uid}/devices`).get();
  const byLang = new Map<Lang, QueryDocumentSnapshot[]>();
  for (const d of devs.docs) {
    if (typeof d.get("token") !== "string") continue;
    const lang = wordingFor(langOf(d.get("lang")));
    byLang.set(lang, [...(byLang.get(lang) ?? []), d]);
  }
  let ok = 0;
  const stale: QueryDocumentSnapshot[] = [];
  for (const [lang, list] of byLang) {
    const payload = webpush(message(kind, lang, vars), lang, link, tag);
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({ tokens: chunk.map((d) => d.get("token") as string), webpush: payload });
      ok += res.successCount;
      res.responses.forEach((r, j) => { if (!r.success && STALE.has(r.error?.code ?? "")) stale.push(chunk[j]); });
    }
  }
  if (stale.length) {
    await Promise.all(stale.map((d) => forgetDevice(uid, d.ref)));
    await turnOffIfNoDevices(uid);
  }
  return ok;
}

/**
 * The shared sender. Does nothing unless the person has notifications on and this category switched on.
 * `user` skips the read when the caller already has the users/{uid} data.
 */
export async function sendToUser(uid: string, cat: Cat, kind: Kind, vars: MessageVars = {}, link?: string, tag?: string, user?: DocumentData): Promise<number> {
  const u = user ?? (await db.doc(`users/${uid}`).get()).data();
  const n = u?.notify as Notify | undefined;
  if (n?.on !== true || n.cats?.[cat] !== true) return 0;
  return deliver(uid, kind, vars, link ?? linkFor(kind, vars), tag ?? tagFor(kind));
}

/** One failed recipient never stops the others, or the request that caused the alert. */
const quietly = (p: Promise<unknown>, what: string) => p.catch((e) => logger.warn(`${what} not sent`, { error: String(e) }));

/** A new organization request: every platform admin hears about it. Called by requestOrg. */
export async function alertOrgRequest(orgId: string, orgName: string) {
  const admins = await db.collection("users").where("role", "==", "superadmin").limit(50).get();
  await Promise.all(admins.docs.map((a) =>
    quietly(sendToUser(a.id, "staff", "staffOrgRequest", { org: orgName }, "/super", `darsi-staff-${orgId}`, a.data()), "staffOrgRequest")));
}

/* ---------- Callables ---------- */

/** Turns notifications on for this device, or refreshes its preferences and lastSeen. */
export const registerDevice = onCall(async (req) => {
  const c = caller(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const token = vToken(d.token), lang = vLang(d.lang), tz = vTz(d.tz), hourLocal = vHour(d.hourLocal), weeklyGoal = vGoal(d.weeklyGoal);
  const userRef = db.doc(`users/${c.uid}`);
  const user = await userRef.get();
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish setting up your account first.");
  const cats = vCats(d.cats, (user.get("notify") as Notify | undefined)?.cats);

  const id = deviceIdOf(token);
  const devRef = userRef.collection("devices").doc(id);
  const ownerRef = db.doc(`pushTokens/${id}`);
  const [dev, owner] = await Promise.all([devRef.get(), ownerRef.get()]);
  let had = dev.exists ? topicsOf(dev.get("topics")) : [];
  // Shared phones: the token now belongs to whoever signed in, so the previous person's alerts stop reaching it.
  const prevUid = owner.get("uid") as string | undefined;
  if (prevUid && prevUid !== c.uid) {
    const prevRef = db.doc(`users/${prevUid}/devices/${id}`);
    const prev = await prevRef.get();
    if (prev.exists) {
      had = [...new Set([...had, ...topicsOf(prev.get("topics"))])];
      await prevRef.delete();
      await turnOffIfNoDevices(prevUid);
    }
  }
  const topics = await applyTopics(token, had, userTopics(user.data(), lang, cats.news));
  await devRef.set({
    token, lang, platform: "web", topics, lastSeen: FieldValue.serverTimestamp(),
    ...(dev.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  await ownerRef.set({ uid: c.uid, at: FieldValue.serverTimestamp() });
  await userRef.set({ notify: { on: true, hourLocal, hourUtc: utcHourFor(hourLocal, tz), tz, cats, weeklyGoal } }, { merge: true });
  return { ok: true };
});

/** Turns notifications off for this device. With no device left, the person is off entirely. */
export const unregisterDevice = onCall(async (req) => {
  const c = caller(req);
  const token = vToken(req.data?.token);
  const ref = db.doc(`users/${c.uid}/devices/${deviceIdOf(token)}`);
  const dev = await ref.get();
  if (dev.exists) {
    await applyTopics(token, topicsOf(dev.get("topics")), []);
    await forgetDevice(c.uid, ref);
  }
  await turnOffIfNoDevices(c.uid);
  return { ok: true };
});

/** Reminder time, categories and weekly goal, for all of a person's devices. */
export const updateNotifyPrefs = onCall(async (req) => {
  const c = caller(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tz = vTz(d.tz), hourLocal = vHour(d.hourLocal), weeklyGoal = vGoal(d.weeklyGoal);
  const userRef = db.doc(`users/${c.uid}`);
  const user = await userRef.get();
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish setting up your account first.");
  const cats = vCats(d.cats, (user.get("notify") as Notify | undefined)?.cats);
  await userRef.set({ notify: { hourLocal, hourUtc: utcHourFor(hourLocal, tz), tz, cats, weeklyGoal } }, { merge: true });
  await reapplyTopics(c.uid, user.data(), cats.news);
  return { ok: true };
});

/** A platform admin's announcement, sent once per language to a topic condition, and logged. */
export const sendBroadcast = onCall(async (req) => {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Super-admins only.");
  const d = (req.data ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const title = { en: vText(d.title?.en, 60, "The English title"), ar: vText(d.title?.ar, 60, "The Arabic title") };
  const body = { en: vText(d.body?.en, 180, "The English text"), ar: vText(d.body?.ar, 180, "The Arabic text") };
  const link = vLink(d.link);
  const audience = await vAudience(d.audience);
  const ref = db.collection("broadcasts").doc();
  const results: Record<(typeof LANGS)[number], string | null> = { en: null, ar: null };
  await Promise.all(LANGS.map(async (lang) => {
    try {
      results[lang] = await messaging.send({
        condition: broadcastCondition(lang, audience),
        webpush: webpush({ title: title[lang], body: body[lang] }, lang, link, `darsi-news-${ref.id}`),
      });
    } catch (e) {
      logger.error("broadcast not sent", { id: ref.id, lang, error: String(e) });
    }
  }));
  await ref.set({ title, body, link, audience, sentBy: c.uid, sentAt: FieldValue.serverTimestamp(), results });
  await audit("sendBroadcast", c.uid, { broadcastId: ref.id, audience, results });
  return { id: ref.id, results };
});

/* ---------- Triggers ---------- */

/** A project was submitted: the student's teacher hears about it, or the organization's admins when there is no teacher. */
export const onSubmissionCreated = onDocumentCreated("users/{uid}/submissions/{id}", async (event) => {
  const { uid, id } = event.params;
  const student = await db.doc(`users/${uid}`).get();
  if (!student.exists) return;
  const vars = { name: str(student.get("name"), 120) || str(student.get("username"), 40), uid };
  const tag = `darsi-staff-${id}`;
  const teacherId = str(student.get("teacherId"), 128);
  if (teacherId && teacherId !== uid) {
    await quietly(sendToUser(teacherId, "staff", "staffSubmission", vars, `/teach/${encodeURIComponent(uid)}`, tag), "staffSubmission");
    return;
  }
  const orgId = str(student.get("orgId"), 128);
  if (!orgId) return;
  const admins = await db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").limit(50).get();
  await Promise.all(admins.docs.filter((a) => a.id !== uid).map((a) =>
    quietly(sendToUser(a.id, "staff", "staffSubmission", vars, `/admin/people/${encodeURIComponent(uid)}`, tag, a.data()), "staffSubmission")));
});

/** A project was reviewed: the person who sent it gets the result and the feedback. */
export const onSubmissionUpdated = onDocumentUpdated("users/{uid}/submissions/{id}", async (event) => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || before.status !== "submitted") return;
  const kind: Kind | null = after.status === "approved" ? "reviewApproved" : after.status === "revise" ? "reviewRevise" : null;
  if (!kind) return;
  const { uid, id } = event.params;
  await quietly(sendToUser(uid, "reviews", kind, { feedback: after.feedback }, "/learn", `darsi-review-${id}`), kind);
});

/** Role, organization or language changed: every device moves to the matching announcement topics. */
export const onUserTopicsChanged = onDocumentUpdated("users/{uid}", async (event) => {
  const b = event.data?.before.data() ?? {}, a = event.data?.after.data() ?? {};
  const langChanged = (b.lang ?? null) !== (a.lang ?? null);
  if (b.role === a.role && (b.orgId ?? null) === (a.orgId ?? null) && !langChanged) return;
  const n = a.notify as Notify | undefined;
  if (!n) return;
  await reapplyTopics(event.params.uid, a, n.cats?.news === true, langChanged && typeof a.lang === "string" ? langOf(a.lang) : undefined);
});

/* ---------- Daily nudges ---------- */

const PAGE = 300;
const PARALLEL = 25;

function isoOf(v: unknown): string | null {
  if (typeof v === "string") return parseTime(v) === null ? null : v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString();
  if (v && typeof (v as { seconds?: unknown }).seconds === "number") return new Date((v as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

/** One person's nudge for this hour. Returns true when one was sent. */
async function nudgeOne(doc: QueryDocumentSnapshot, nowMs: number, hour: number): Promise<boolean> {
  const u = doc.data();
  const n = (u.notify ?? {}) as Notify;
  if (u.active === false || n.cats?.reminders !== true) return false;
  if (!isValidTz(n.tz) || typeof n.hourLocal !== "number") return false;
  // DST moved the person's hour: store the new UTC hour and wait for it.
  const expected = utcHourFor(n.hourLocal, n.tz, nowMs);
  if (expected !== hour) { await doc.ref.update({ "notify.hourUtc": expected }); return false; }
  const summary = (u.summary ?? {}) as Record<string, unknown>;
  const pick = pickNudge({
    tz: n.tz,
    lastLessonAt: isoOf(summary.lastLessonAt) ?? isoOf(summary.lastActive),
    createdAt: isoOf(u.createdAt),
    weeks: (summary.weeks ?? {}) as Record<string, number>,
    weeklyGoal: typeof n.weeklyGoal === "number" ? n.weeklyGoal : 4,
    lastAutoAt: n.lastAutoAt, comeback7At: n.comeback7At, comeback21At: n.comeback21At,
  }, nowMs);
  if (!pick) return false;
  const sent = await deliver(doc.id, pick.kind, { n: pick.n }, linkFor(pick.kind), tagFor(pick.kind));
  if (!sent) return false;
  const at = new Date(nowMs).toISOString();
  await doc.ref.update({
    "notify.lastAutoAt": at,
    ...(pick.kind === "comeback7" ? { "notify.comeback7At": at } : {}),
    ...(pick.kind === "comeback21" ? { "notify.comeback21At": at } : {}),
  });
  return true;
}

/**
 * At the top of every UTC hour: the people whose reminder hour this is get at most one encouraging nudge for their day.
 * A cron schedule, not "every 60 minutes": in App Engine cron syntax that interval counts from the end of the previous
 * run, so it drifts past :00 and can eventually skip an hour (everyone whose hourUtc it is would miss that day's nudge).
 */
export const dailyNudges = onSchedule({ schedule: "0 * * * *", timeZone: "UTC", timeoutSeconds: 540, retryCount: 0 }, async () => {
  const nowMs = Date.now();
  const hour = new Date(nowMs).getUTCHours();
  let last: QueryDocumentSnapshot | undefined;
  let seen = 0, sent = 0, failed = 0;
  for (;;) {
    let q = db.collection("users").where("notify.on", "==", true).where("notify.hourUtc", "==", hour).limit(PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    seen += page.size;
    for (let i = 0; i < page.docs.length; i += PARALLEL) {
      const results = await Promise.allSettled(page.docs.slice(i, i + PARALLEL).map((d) => nudgeOne(d, nowMs, hour)));
      for (const r of results) {
        if (r.status === "fulfilled") { if (r.value) sent++; }
        else { failed++; logger.warn("nudge failed", { error: String(r.reason) }); }
      }
    }
    if (page.size < PAGE) break;
    last = page.docs[page.docs.length - 1];
  }
  logger.info("dailyNudges", { hour, seen, sent, failed });
});
