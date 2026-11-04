/**
 * users/{uid}.summary, kept up to date as lesson results arrive (TECHNICAL.md "Organization analytics" and "Security").
 *
 * Each write costs a fixed few reads, however many results the person has (H2 in the security review): the counted
 * rows live in users/{uid}/private/summaryRows (one map, lessonId → row; no client reads or writes it), the trigger
 * changes the one row, and the summary is computed from the rows with the same `summarize` as before, so its fields
 * and meaning are unchanged. A row counts only for a published lesson the person can see, with that lesson's unit,
 * track and competencies (M1); results for anything else are left out.
 */
import { db } from "./admin.js";
import { lessonMeta, type LessonMeta } from "./courses.js";
import { cleanRow, sameRow, summarize, type ProgressRow } from "./summary.js";
import { FieldPath, type Transaction } from "firebase-admin/firestore";

/** Lesson ids as units have them (the unit id, a dash, more): anything else is never a lesson. */
export const LESSON_ID = /^[a-z0-9][a-z0-9-]{1,99}$/;
/** Results read when an account's rows are first built (once per account): more than any course list holds. */
const BOOTSTRAP_MAX = 1000;

const rowsRef = (uid: string) => db.doc(`users/${uid}/private/summaryRows`);
type Rows = Record<string, ProgressRow>;
const metaOf = (r: ProgressRow): LessonMeta => ({ unitId: String(r.unitId ?? ""), track: String(r.track ?? ""), competencies: Array.isArray(r.competencies) ? (r.competencies as string[]) : [] });

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

function writeSummary(tx: Transaction, uid: string, rows: Rows) {
  const summary = summarize(Object.values(rows));
  tx.set(rowsRef(uid), { rows, at: Date.now() });
  // mergeFields replaces each summary field whole, so weeks older than 12 are dropped instead of merged back in.
  tx.set(db.doc(`users/${uid}`), { summary }, { mergeFields: Object.keys(summary).map((k) => `summary.${k}`) });
}

/** A progress doc was written (or deleted): its row changes, and the summary with it. */
export async function progressChanged(uid: string, lessonId: string) {
  if (!LESSON_ID.test(lessonId)) return "not a lesson id";
  const orgId = ((await db.doc(`users/${uid}`).get()).get("orgId") as string | null | undefined) ?? null;
  const meta = await lessonMeta(lessonId, orgId);
  if (!meta) {
    // Not a lesson this person can see. Only a row counted before (a course since unpublished) is still followed.
    const had = (await rowsRef(uid).get()).get(new FieldPath("rows", lessonId)) as ProgressRow | undefined;
    if (!had) return "unknown lesson";
  }
  return db.runTransaction(async (tx) => {
    const [state, doc] = await Promise.all([tx.get(rowsRef(uid)), tx.get(db.doc(`users/${uid}/progress/${lessonId}`))]);
    const stored = state.get("rows") as Rows | undefined;
    const rows: Rows = stored ? { ...stored } : await buildRows(uid, orgId, tx);
    const had = rows[lessonId] ?? stored?.[lessonId];
    const keep = meta ?? (had ? metaOf(had) : null);
    const next = doc.exists && keep ? cleanRow(doc.data(), keep) : null;
    if (stored && sameRow(stored[lessonId], next)) return "unchanged";
    if (next) rows[lessonId] = next; else delete rows[lessonId];
    writeSummary(tx, uid, rows);
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
