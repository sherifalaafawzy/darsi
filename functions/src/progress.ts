/**
 * users/{uid}.summary, kept up to date as lesson results arrive (TECHNICAL.md "Organization analytics" and "Security").
 *
 * Each write costs a fixed few reads, however many results the person has (H2 in the security review): the counted
 * rows live in users/{uid}/private/summaryRows (one map, lessonId → row; no client reads or writes it), the trigger
 * changes the one row, and the summary is computed from the rows with the same `summarize` as before, so its fields
 * and meaning are unchanged. A row counts only for a published lesson the person can see, with that lesson's unit,
 * track and competencies (M1); results for anything else are left out.
 */
import { auth, db } from "./admin.js";
import { lessonMeta, type LessonMeta } from "./courses.js";
import { missingBasics } from "./membersCore.js";
import { handMadeUsername } from "./roles.js";
import { cleanRow, sameRow, summarize, type ProgressRow } from "./summary.js";
import { FieldPath, FieldValue, type Transaction } from "firebase-admin/firestore";

/** Lesson ids as units have them (the unit id, a dash, more): anything else is never a lesson. */
export const LESSON_ID = /^[a-z0-9][a-z0-9-]{1,99}$/;
/** Results read when an account's rows are first built (once per account): more than any course list holds. */
const BOOTSTRAP_MAX = 1000;

const rowsRef = (uid: string) => db.doc(`users/${uid}/private/summaryRows`);
type Rows = Record<string, ProgressRow>;
const metaOf = (r: ProgressRow): LessonMeta => ({
  unitId: String(r.unitId ?? ""), track: String(r.track ?? ""), competencies: Array.isArray(r.competencies) ? (r.competencies as string[]) : [],
  ...(r.graded === false ? { graded: false } : {}),
});

/** Every counted row, from the progress docs (the first time an account's rows are needed, and `npm run resummarize`). */
async function buildRows(uid: string, orgId: string | null, tx?: Transaction): Promise<Rows> {
  const q = db.collection(`users/${uid}/progress`).limit(BOOTSTRAP_MAX);
  const docs = (tx ? await tx.get(q) : await q.get()).docs;
  const rows: Rows = {};
  for (const d of docs) {
    if (!LESSON_ID.test(d.id)) continue;
    const meta = await lessonMeta(d.id, orgId);
    const row = meta ? cleanRow(d.data(), meta) : null;
    if (row) rows[d.id] = row;
  }
  return rows;
}

/** `profile`: fields for a profile this write creates (see progressChanged), merged beside the summary. */
function writeSummary(tx: Transaction, uid: string, rows: Rows, profile: Record<string, unknown> = {}) {
  const summary = summarize(Object.values(rows));
  tx.set(rowsRef(uid), { rows, at: Date.now() });
  // mergeFields replaces each summary field whole, so weeks older than 12 are dropped instead of merged back in.
  tx.set(db.doc(`users/${uid}`), { ...profile, summary }, { mergeFields: [...Object.keys(profile), ...Object.keys(summary).map((k) => `summary.${k}`)] });
}

type Account = { email?: string; displayName?: string };
/** The Auth account: null when Auth has none, undefined when Auth couldn't say (a hiccup: nothing is lost on it). */
const accountOf = (uid: string): Promise<Account | null | undefined> =>
  auth.getUser(uid).then((a) => a as Account, (e: { code?: string }) => (e?.code === "auth/user-not-found" ? null : undefined));

/**
 * The profile a new account's first result creates, when it arrives before the account's app has created one (a
 * guest's lessons synced at sign-up): a learner with no organization, with the email, name and creation time from Auth.
 * The app's own create is refused once the document exists (the rules allow only a create), so a summary written alone
 * would leave a profile with no name, email or role, missing from staff lists (ux-accounts-04).
 */
function newProfile(account: Account | null | undefined): Record<string, unknown> {
  const { createdAt, ...basics } = missingBasics(undefined, account);
  return { role: "learner", orgId: null, ...basics, ...(createdAt ? { createdAt: FieldValue.serverTimestamp() } : {}) };
}

/**
 * A progress doc was written (or deleted): its row changes, and the summary with it. A deletion for an account whose
 * profile is gone (the account was deleted with all its data) changes nothing: writing the summary would bring back an
 * empty profile and its private rows. A new account's first results can still arrive before its profile; a result
 * that arrives for an account that no longer exists in Auth (a phone still holding a session when it was deleted) is
 * removed. The profile is read again inside the transaction, so a deletion that starts meanwhile is never undone.
 */
export async function progressChanged(uid: string, lessonId: string) {
  if (!LESSON_ID.test(lessonId)) return "not a lesson id";
  const profile = await db.doc(`users/${uid}`).get();
  const progressRef = db.doc(`users/${uid}/progress/${lessonId}`);
  let account: Account | null | undefined;
  if (!profile.exists) {
    if (!(await progressRef.get()).exists) return "account gone";
    account = await accountOf(uid);
    if (account === null) { await progressRef.delete().catch(() => {}); return "account gone"; }
    // A username login gets its profile from the organization that makes it (createMembers); one someone signed up for
    // by hand gets none, from the rules or from here (sec-rules-05).
    if (account && handMadeUsername(account.email, undefined)) return "no profile";
  }
  const orgId = (profile.get("orgId") as string | null | undefined) ?? null;
  const meta = await lessonMeta(lessonId, orgId);
  if (!meta) {
    // Not a lesson this person can see. Only a row counted before (a course since unpublished) is still followed.
    const had = (await rowsRef(uid).get()).get(new FieldPath("rows", lessonId)) as ProgressRow | undefined;
    if (!had) return "unknown lesson";
  }
  return db.runTransaction(async (tx) => {
    const [state, doc, now] = await Promise.all([tx.get(rowsRef(uid)), tx.get(progressRef), tx.get(db.doc(`users/${uid}`))]);
    // The profile is gone now: deleted while this ran, or a deleted result for an account without one.
    if (!now.exists && (profile.exists || !doc.exists)) return "account gone";
    const stored = state.get("rows") as Rows | undefined;
    const rows: Rows = stored ? { ...stored } : await buildRows(uid, orgId, tx);
    const had = rows[lessonId] ?? stored?.[lessonId];
    const keep = meta ?? (had ? metaOf(had) : null);
    const next = doc.exists && keep ? cleanRow(doc.data(), keep) : null;
    if (stored && sameRow(stored[lessonId], next)) return "unchanged";
    if (next) rows[lessonId] = next; else delete rows[lessonId];
    writeSummary(tx, uid, rows, now.exists ? {} : newProfile(account));
    return "updated";
  }, { maxAttempts: 10 });
}

/** Rebuilds one account's rows and summary from all its progress docs (scripts/resummarize.mjs). */
export async function rebuildSummary(uid: string) {
  const orgId = ((await db.doc(`users/${uid}`).get()).get("orgId") as string | null | undefined) ?? null;
  const rows = await buildRows(uid, orgId);
  await db.runTransaction(async (tx) => { writeSummary(tx, uid, rows); });
  return Object.keys(rows).length;
}
