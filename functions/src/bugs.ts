/**
 * Problem reports (TECHNICAL.md "Problem reports"). The "Report a problem" button on every screen sends the person's
 * words, a screenshot and the details their phone gathered here: darsiai.org/api/bug, a Hosting rewrite, so guests
 * send it with a plain fetch and never load the Firebase SDK. Signed-in people add their ID token, and who sent a
 * report comes only from that verified token. Platform admins read the reports on /super/bugs.
 * - bugReports/{id}: the report; only platform admins read it (rules), and they change only its status.
 * - bugReports/{id}.{jpg|png|webp} in the app's bucket: the screenshot, for platform admins only (storage rules).
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "./admin.js";
import { clientIp } from "./analytics.js";
import { bucket } from "./storage.js";
import { limiter, MAX_BODY, parseReport } from "./bugsCore.js";

const tooMany = limiter();

export const reportBug = onRequest({ maxInstances: 2, memory: "256MiB", timeoutSeconds: 60, concurrency: 20 }, async (req, res) => {
  // Same origin through Hosting; the cloudfunctions.net address answers other origins too, for the emulators.
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "POST").set("Access-Control-Allow-Headers", "Content-Type, Authorization").status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }
  const raw = req.rawBody;
  if (!raw || raw.length > MAX_BODY) { res.status(413).end(); return; }

  let report;
  try { report = parseReport(JSON.parse(raw.toString("utf8"))); } catch { res.status(400).end(); return; }

  // Signed in: the token says who. A token that doesn't verify (forged, revoked) is refused rather than stored as a guest.
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const who = token ? await auth.verifyIdToken(token, true).catch(() => null) : null;
  if (token && !who) { res.status(401).end(); return; }
  if (tooMany(clientIp(req.headers, String(req.ip ?? "?")), who?.uid ?? null)) { res.status(429).end(); return; }

  try {
    const ref = db.collection("bugReports").doc();
    let user: Record<string, unknown> | null = null;
    if (who) {
      const p = (await db.doc(`users/${who.uid}`).get()).data() ?? {};
      user = {
        uid: who.uid, email: who.email ?? null, name: (typeof p.name === "string" && p.name) || who.name || null,
        role: (who.role as string | undefined) ?? "learner", orgId: (who.orgId as string | undefined) ?? null,
        plan: (who.plan as string | undefined) ?? null, provider: who.firebase?.sign_in_provider ?? null,
      };
    }
    let shot: Record<string, unknown> | null = null;
    if (report.shot) {
      const path = `bugReports/${ref.id}.${report.shot.ext}`;
      await bucket().file(path).save(report.shot.bytes, { resumable: false, contentType: report.shot.type, metadata: { cacheControl: "private, max-age=3600" } });
      shot = { path, bytes: report.shot.bytes.length, type: report.shot.type, w: report.shot.w, h: report.shot.h };
    }
    await ref.set({
      createdAt: FieldValue.serverTimestamp(), status: "new",
      text: report.text, url: report.url, path: report.path, user, shot, details: report.details,
      // What the server itself saw, which the phone can't make up.
      server: { ua: String(req.headers["user-agent"] ?? "").slice(0, 400), lang: String(req.headers["accept-language"] ?? "").slice(0, 100) },
    });
    logger.info("bugs: report", { id: ref.id, path: report.path, uid: who?.uid ?? null, shot: Boolean(shot) });
    res.status(201).json({ id: ref.id });
  } catch (e) {
    logger.error("bugs: report failed", e);
    res.status(500).end(); // the phone keeps the report and tries again
  }
});
