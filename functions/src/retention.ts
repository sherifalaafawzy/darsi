/**
 * Retention (TECHNICAL.md): the daily clean-up of records nobody needs for ever, and the platform
 * admins' controls for it. How long each kind is kept is the owner's decision, stored in config/retention:
 *   {periods: {bugReportsClosedDays?, bugReportsAnyDays?, analyticsDevicesDays?, checkoutsOpenDays?, joinAttemptsDays?,
 *              auditDays?, orgExportsDays?}, updatedAt, updatedBy}
 * A category without a period is never touched, and with no document at all the job deletes nothing: that is the
 * default, and nothing in this file sets a period. Accounts, learning records, projects, payments, paid checkouts and
 * subscriptions are never read or deleted here (deleting an account is account.ts). The audit period keeps two kinds
 * of entry for ever (retentionCore auditKept): units' publishes, and payments that matched no checkout, which have no
 * payments/ document; those only lose the address and request id they were written from.
 * - saveRetention / previewRetention: platform admins set the periods and see what they would delete now.
 * - retentionJob: every night, at most MAX_PER_RUN records a category, inside BUDGET_MS; safe to run again.
 * - deleteBugReport: a platform admin removes one problem report and its screenshot by hand.
 * Queries filter on one field only (the automatic single-field indexes), and the rest is checked in code, so no
 * composite index is needed.
 */
import { FieldValue, Timestamp, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { audit, db, requireSuper, str } from "./admin.js";
import { bucket } from "./storage.js";
import { activePeriods, AUDIT_TRIMMED, auditKept, before, CATEGORIES, checkoutAbandoned, cutoffs, reportClosed, shotPath, validatePeriods, zeroCounts, type Category, type Counts, type Cutoffs } from "./retentionCore.js";

const CONFIG = "config/retention";
/** Where organizations' exported files wait to be downloaded; only their age decides here. */
const EXPORTS = "exports/";
/** One night's work per category: a first run after a period is set catches up over several nights, never in one burst. */
export const MAX_PER_RUN = 500;
/** The job's own limit, a minute inside the function's 540 s, so it always ends by writing what it did. */
export const BUDGET_MS = 480e3;
/** Documents read per page; also the size of one delete batch (Firestore allows 500 writes). */
const PAGE = 250;

type Doc = QueryDocumentSnapshot;
/**
 * One single-field query whose matches may go: `order` is the field its range filter is on (pages continue after the
 * last document read, so the field must be among `fields`), and `wanted` is what the index couldn't filter.
 * `trim`: its matches stay and only lose some fields (trimAudit); they are not counted as deleted, nor in a preview.
 */
interface Source { base: Query; order?: string; fields: string[]; wanted?: (d: Doc) => boolean; trim?: boolean }
type DocCategory = Exclude<Category, "orgExports">;

const ts = (ms: number) => Timestamp.fromMillis(ms);

function sources(c: Cutoffs): Record<DocCategory, Source[]> {
  const out: Record<DocCategory, Source[]> = { bugReports: [], analyticsDevices: [], checkouts: [], joinAttempts: [], audit: [] };
  // Any report this old, whatever its status.
  if (c.bugReportsAny !== undefined) out.bugReports.push({ base: db.collection("bugReports").where("createdAt", "<", ts(c.bugReportsAny)), order: "createdAt", fields: ["createdAt", "shot.path"] });
  // Reports marked fixed or closed that long ago (statusAt is when the status last changed). A reopened one has an
  // old statusAt and the status "new": it stays. One the first rule already covers isn't counted twice.
  if (c.bugReportsClosed !== undefined) out.bugReports.push({
    base: db.collection("bugReports").where("statusAt", "<", ts(c.bugReportsClosed)), order: "statusAt", fields: ["statusAt", "status", "createdAt", "shot.path"],
    wanted: (d) => reportClosed(d.get("status")) && !before(d.get("createdAt"), c.bugReportsAny),
  });
  if (c.analyticsDevices !== undefined) out.analyticsDevices.push({ base: db.collection("analyticsDevices").where("last", "<", c.analyticsDevices), order: "last", fields: ["last"] });
  // By status, not by age: paid checkouts are kept for ever, so a query by age would read every one of them again
  // each night. Unpaid ones are few (those inside the period), and their age is checked here.
  if (c.checkoutsOpen !== undefined) for (const status of ["open", "failed"]) out.checkouts.push({
    base: db.collection("checkouts").where("status", "==", status), fields: ["status", "createdAt"],
    wanted: (d) => checkoutAbandoned(d.get("status")) && before(d.get("createdAt"), c.checkoutsOpen),
  });
  if (c.joinAttempts !== undefined) out.joinAttempts.push({ base: db.collection("joinAttempts").where("since", "<", c.joinAttempts), order: "since", fields: ["since"] });
  // Every entry this old except the ones kept for ever (retentionCore auditKept): the publishes of units, which hold
  // the units' version counters, and the payments that matched no checkout, the only record of that money. The action
  // can't be filtered in the query without a composite index, so it is read with the time; the kept entries (one per
  // publish ever made) are read again each night, two small fields each.
  if (c.audit !== undefined) out.audit.push({
    base: db.collection("audit").where("at", "<", ts(c.audit)), order: "at", fields: ["at", "action"],
    wanted: (d) => !auditKept(d.get("action")),
  });
  // The kept entries this old stay without the address and request id of the call that wrote them (admin.ts audit):
  // what they are kept for is the version or the money, not where a publisher was. Once trimmed, an entry no longer
  // matches, so a later night writes nothing for it.
  if (c.audit !== undefined) out.audit.push({
    base: db.collection("audit").where("at", "<", ts(c.audit)), order: "at", fields: ["at", "action", ...AUDIT_TRIMMED],
    wanted: (d) => auditKept(d.get("action")) && AUDIT_TRIMMED.some((f) => d.get(f) !== undefined),
    trim: true,
  });
  return out;
}

/**
 * Pages through a source and hands each page's wanted documents to `act` (which answers how many it dealt with), until
 * `max` are done, the query ends, or the time is up (`timeUp`: the caller stops there and says so).
 */
async function scan(s: Source, max: number, deadline: number, act: (docs: Doc[]) => Promise<number>): Promise<{ n: number; timeUp: boolean }> {
  const q = (s.order ? s.base.orderBy(s.order) : s.base).select(...s.fields);
  let n = 0, after: Doc | undefined;
  while (n < max) {
    if (Date.now() >= deadline) return { n, timeUp: true };
    const page = await (after ? q.startAfter(after) : q).limit(PAGE).get();
    const hits = (s.wanted ? page.docs.filter(s.wanted) : page.docs).slice(0, max - n);
    if (hits.length) n += await act(hits);
    if (page.size < PAGE) break;
    after = page.docs[page.size - 1];
  }
  return { n, timeUp: false };
}

async function drop(docs: Doc[]): Promise<number> {
  const batch = db.batch();
  for (const d of docs) batch.delete(d.ref);
  await batch.commit();
  return docs.length;
}
/** Kept audit entries: only the address and request id go (retentionCore AUDIT_TRIMMED); everything else stays as written. */
async function trimAudit(docs: Doc[]): Promise<number> {
  const batch = db.batch();
  for (const d of docs) batch.update(d.ref, Object.fromEntries(AUDIT_TRIMMED.map((f) => [f, FieldValue.delete()])));
  await batch.commit();
  return docs.length;
}
/**
 * Problem reports go with their screenshots, the screenshot first: one that is already gone is fine, and if Storage
 * refuses for any other reason the report stays for the next run, rather than leave a picture nothing points at.
 */
async function dropReports(docs: Doc[]): Promise<number> {
  const gone: Doc[] = [];
  for (let i = 0; i < docs.length; i += 25) {
    await Promise.all(docs.slice(i, i + 25).map(async (d) => {
      const path = shotPath(d.get("shot.path"));
      try { if (path) await bucket().file(path).delete({ ignoreNotFound: true }); gone.push(d); }
      catch (e) { logger.warn("retention: a screenshot could not be deleted, so its report stays", { id: d.id, error: String(e) }); }
    }));
  }
  return gone.length ? drop(gone) : 0;
}

/** Exported files older than the cut-off, by the time Storage made them. `dry` only counts. */
async function sweepExports(cut: number, max: number, deadline: number, dry: boolean): Promise<{ n: number; timeUp: boolean }> {
  let n = 0, pageToken: string | undefined;
  do {
    if (Date.now() >= deadline) return { n, timeUp: true };
    const [files, next] = await bucket().getFiles({ prefix: EXPORTS, autoPaginate: false, maxResults: 500, pageToken });
    const old = files.filter((f) => before(f.metadata?.timeCreated, cut)).slice(0, max - n);
    if (dry) n += old.length;
    else {
      const done = await Promise.allSettled(old.map((f) => f.delete({ ignoreNotFound: true })));
      n += done.filter((r) => r.status === "fulfilled").length;
      const refused = done.find((r) => r.status === "rejected");
      if (refused) logger.warn("retention: some exported files could not be deleted", { error: String((refused as PromiseRejectedResult).reason) });
    }
    pageToken = (next as { pageToken?: string } | null)?.pageToken;
  } while (pageToken && n < max);
  return { n, timeUp: false };
}

/**
 * One run of the clean-up. Each category is on its own: one that fails (logged, listed in `failed`) doesn't stop the
 * others. Always ends by writing the heartbeat to stats/jobs, also when there was nothing to do or the time ran out
 * (`stopped`: the rest waits for the next night).
 */
export async function runRetention(opts: { now?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? BUDGET_MS);
  const deleted = zeroCounts(), failed: Category[] = [];
  let stopped = false, trimmed = 0;
  try {
    const cut = cutoffs(activePeriods((await db.doc(CONFIG).get()).get("periods")), opts.now ?? Date.now());
    const src = sources(cut);
    for (const cat of CATEGORIES) {
      try {
        if (cat === "orgExports") {
          if (cut.orgExports === undefined) continue;
          const r = await sweepExports(cut.orgExports, MAX_PER_RUN, deadline, false);
          deleted[cat] += r.n; stopped ||= r.timeUp;
        } else for (const s of src[cat]) {
          // Trimmed entries stay: they have their own nightly limit and never count as deleted.
          if (s.trim) { const r = await scan(s, MAX_PER_RUN, deadline, trimAudit); trimmed += r.n; stopped ||= r.timeUp; continue; }
          const r = await scan(s, MAX_PER_RUN - deleted[cat], deadline, cat === "bugReports" ? dropReports : drop);
          deleted[cat] += r.n; stopped ||= r.timeUp;
        }
      } catch (e) {
        failed.push(cat);
        logger.error("retention: a category failed", { category: cat, error: String(e) });
      }
    }
  } catch (e) {
    // The configuration itself couldn't be read: nothing was deleted, and the heartbeat says the run failed.
    failed.push(...CATEGORIES);
    logger.error("retention: the periods could not be read", { error: String(e) });
  }
  // Every key is written each time: merge keeps the other jobs' entries, and replaces this one's numbers.
  await db.doc("stats/jobs").set({ retentionJob: { at: Date.now(), ok: failed.length === 0, deleted, stopped, failed } }, { merge: true });
  if (Object.values(deleted).some((n) => n > 0)) await audit("retention", "retentionJob", { deleted });
  logger.info("retention: run", { deleted, trimmed, stopped, failed });
  return { deleted, stopped, failed };
}

export const retentionJob = onSchedule({ schedule: "10 3 * * *", timeZone: "UTC", timeoutSeconds: 540, retryCount: 0 }, async () => {
  await runRetention();
});

const badPeriods = () => new HttpsError("invalid-argument", "Each period is a whole number of days from 1 to 3650, or empty.", { reason: "bad-periods" });

/** The periods, set as a whole: a category left out or null is never cleaned up. The old and new ones go to the audit log. */
export const saveRetention = onCall(async (req) => {
  const c = await requireSuper(req);
  const periods = validatePeriods(req.data?.periods);
  if (!periods) throw badPeriods();
  const ref = db.doc(CONFIG);
  const old = activePeriods((await ref.get()).get("periods"));
  await ref.set({ periods, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
  await audit("saveRetention", c.uid, { was: old, periods });
  return { periods };
});

/**
 * How many records the given periods (or, with none given, the saved ones) would delete if the job ran now, with no
 * limit per run; deletes nothing. count() where one field decides; problem reports closed long ago, unpaid checkouts
 * and audit entries (the kept ones stay, retentionCore auditKept, and what they only lose is not counted) need a second
 * field, so those are read (a few small fields each) and counted here. `partial` when the time ran out before
 * everything was counted.
 */
export const previewRetention = onCall({ timeoutSeconds: 120 }, async (req) => {
  await requireSuper(req);
  const given = req.data?.periods;
  const periods = given === undefined || given === null ? activePeriods((await db.doc(CONFIG).get()).get("periods")) : validatePeriods(given);
  if (!periods) throw badPeriods();
  const cut = cutoffs(periods, Date.now()), deadline = Date.now() + 100e3, all = Number.MAX_SAFE_INTEGER;
  const counts: Counts = zeroCounts();
  let partial = false;
  const src = sources(cut);
  for (const cat of CATEGORIES) {
    if (cat === "orgExports") {
      if (cut.orgExports === undefined) continue;
      const r = await sweepExports(cut.orgExports, all, deadline, true);
      counts[cat] += r.n; partial ||= r.timeUp;
    } else for (const s of src[cat]) {
      if (s.trim) continue;
      if (!s.wanted) { counts[cat] += (await s.base.count().get()).data().count; continue; }
      const r = await scan(s, all, deadline, async (docs) => docs.length);
      counts[cat] += r.n; partial ||= r.timeUp;
    }
  }
  return { counts, partial };
});

/** One problem report and its screenshot, removed by a platform admin (a report with someone's private details in it). */
export const deleteBugReport = onCall(async (req) => {
  const c = await requireSuper(req);
  const none = () => new HttpsError("not-found", "That report is not there.", { reason: "no-report" });
  const id = str(req.data?.id, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw none();
  const ref = db.doc(`bugReports/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw none();
  // The screenshot first: if Storage refuses, the report is still there to try again.
  const path = shotPath(snap.get("shot.path"));
  if (path) await bucket().file(path).delete({ ignoreNotFound: true });
  await ref.delete();
  await audit("deleteBugReport", c.uid, { id, hadShot: Boolean(path) });
  return { ok: true };
});
