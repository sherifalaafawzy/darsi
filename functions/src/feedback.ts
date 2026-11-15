/**
 * Feedback (TECHNICAL.md "Feedback"). "Share feedback" (the button on every screen, or the question under a finished
 * course on Home) sends a rating of 1 to 5 stars, an optional topic and an optional comment: darsiai.org/api/feedback,
 * a Hosting rewrite, so guests send it with a plain fetch and never load the Firebase SDK. Signed-in people add their
 * ID token, and who sent it comes only from that verified token. Platform admins read it on /super/feedback.
 * - feedback/{id}: only platform admins read it (rules), and they change only its status.
 * No screenshot and none of the phone's details: the page (a path), the course when it was about one, and the language.
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "./admin.js";
import { limiter } from "./bugsCore.js";
import { clientIp } from "./clientIp.js";
import { FEEDBACK_LIMITS, MAX_FEEDBACK_BODY, parseFeedback } from "./feedbackCore.js";

const tooMany = limiter(FEEDBACK_LIMITS);

export const sendFeedback = onRequest({ maxInstances: 2, memory: "256MiB", timeoutSeconds: 30, concurrency: 40 }, async (req, res) => {
  // Same origin through Hosting; the cloudfunctions.net address answers other origins too, for the emulators.
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "POST").set("Access-Control-Allow-Headers", "Content-Type, Authorization").status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }
  const raw = req.rawBody;
  if (!raw || raw.length > MAX_FEEDBACK_BODY) { res.status(413).end(); return; }

  let fb;
  try { fb = parseFeedback(JSON.parse(raw.toString("utf8"))); } catch { res.status(400).end(); return; }

  // Signed in: the token says who. A token that doesn't verify (forged, revoked) is refused rather than stored as a guest.
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const who = token ? await auth.verifyIdToken(token, true).catch(() => null) : null;
  if (token && !who) { res.status(401).end(); return; }
  if (tooMany(clientIp(req.headers, String(req.ip ?? "?")), who?.uid ?? null)) { res.status(429).end(); return; }

  try {
    let user: Record<string, unknown> | null = null;
    if (who) {
      const p = (await db.doc(`users/${who.uid}`).get()).data() ?? {};
      user = {
        uid: who.uid, email: who.email ?? null, name: (typeof p.name === "string" && p.name) || who.name || null,
        role: (who.role as string | undefined) ?? "learner", orgId: (who.orgId as string | undefined) ?? null,
      };
    }
    const ref = db.collection("feedback").doc();
    await ref.set({
      createdAt: FieldValue.serverTimestamp(), status: "new",
      rating: fb.rating, text: fb.text, topic: fb.topic, path: fb.path, unitId: fb.unitId, source: fb.source, lang: fb.lang,
      ...(fb.queuedAt ? { queuedAt: fb.queuedAt } : {}), user,
      server: { ua: String(req.headers["user-agent"] ?? "").slice(0, 300) },
    });
    logger.info("feedback: sent", { id: ref.id, rating: fb.rating, source: fb.source, uid: who?.uid ?? null });
    res.status(201).json({ id: ref.id });
  } catch (e) {
    logger.error("feedback: failed", e);
    res.status(500).end(); // the phone keeps it and tries again
  }
});
