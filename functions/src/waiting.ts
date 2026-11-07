/**
 * How many of a person's projects wait for a review, kept on their profile as `projectsWaiting` (TECHNICAL.md
 * "Reviewing projects"). The staff lists already read their people's profiles once (/teach, /admin), so they show who
 * has work waiting, and sort those people first, with no extra reads: teachers can't query submissions across their
 * students (firebase/firestore.rules), and one query per student on every open would cost a read each.
 *
 * Called by the submission triggers (notify.ts): when a project is sent, and when a review changes its status. It counts
 * rather than adds or subtracts one, because a reviewer may set a project back to "submitted", and a missed or repeated
 * trigger then can't leave the number wrong for good. update(), never set(): a deleted account's profile is not brought
 * back. Learners and org admins can't write the field (it is in neither of the rules' update lists).
 */
import { logger } from "firebase-functions/v2";
import { db } from "./admin.js";

export async function recountWaiting(uid: string): Promise<number | null> {
  try {
    const n = (await db.collection(`users/${uid}/submissions`).where("status", "==", "submitted").count().get()).data().count;
    await db.doc(`users/${uid}`).update({ projectsWaiting: n });
    return n;
  } catch (e) {
    // NOT_FOUND: the profile is gone (a deleted account). Anything else: the next send or review counts again.
    if ((e as { code?: number }).code !== 5) logger.warn("projectsWaiting not counted", { uid, error: String(e) });
    return null;
  }
}
