/**
 * Feedback (TECHNICAL.md "Feedback"): the pure parts of sendFeedback (feedback.ts), tested in test/feedback.test.ts.
 * Feedback is a rating of 1 to 5 stars, with an optional topic and comment, sent from the "Share feedback" sheet (the
 * button on every screen, or the question under a finished course on Home). Anyone can send it, guests included, so
 * everything is checked and cut to size here; who sent it comes only from a verified ID token, never from the body.
 */

export const TOPICS = ["lessons", "videos", "labs", "app", "other"] as const;
export type Topic = (typeof TOPICS)[number];
export type Source = "button" | "course";
/** The request: a comment of up to MAX_COMMENT characters (up to 4 bytes each in UTF-8) and a few short fields. */
export const MAX_FEEDBACK_BODY = 12_000;
export const MAX_COMMENT = 2000;

export interface Feedback {
  rating: 1 | 2 | 3 | 4 | 5; text: string; topic: Topic | null; path: string; unitId: string | null;
  source: Source; lang: string | null; queuedAt: string | null;
}

const UNIT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/**
 * The page the person was on, as a path only: no query or fragment (they can hold invite codes, sign-in returns or
 * tokens), no host. Anything that doesn't look like a path is dropped.
 */
export function cleanPath(v: unknown): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return "";
  const p = v.split(/[?#]/, 1)[0].slice(0, 200);
  return /^[\w\-./%~:@]*$/.test(p) ? p : "";
}

/** The request body, checked. Throws on anything malformed (the function answers 400). */
export function parseFeedback(body: unknown): Feedback {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  const b = body as Record<string, unknown>;
  const rating = b.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("a rating of 1 to 5");
  const text = typeof b.text === "string" ? b.text.trim().slice(0, MAX_COMMENT) : "";
  const topic = typeof b.topic === "string" && (TOPICS as readonly string[]).includes(b.topic) ? (b.topic as Topic) : null;
  const unitId = typeof b.unitId === "string" && UNIT.test(b.unitId) ? b.unitId : null;
  const source: Source = b.source === "course" && unitId ? "course" : "button";
  const lang = typeof b.lang === "string" && LANG.test(b.lang) ? b.lang : null;
  const queued = typeof b.queuedAt === "string" ? Date.parse(b.queuedAt) : NaN;
  return {
    rating: rating as Feedback["rating"], text, topic, path: cleanPath(b.path), unitId, source, lang,
    queuedAt: Number.isFinite(queued) ? new Date(queued).toISOString() : null,
  };
}

/**
 * Feedback allowed per window, per instance (bugsCore.limiter): per address (a school's phones share one, and a class
 * may rate a course together), per account, and for the whole instance.
 */
export const FEEDBACK_LIMITS = { address: { n: 40, ms: 10 * 60e3 }, account: { n: 10, ms: 60 * 60e3 }, instance: { n: 600, ms: 60 * 60e3 } };
