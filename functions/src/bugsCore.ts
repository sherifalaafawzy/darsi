/**
 * Problem reports (TECHNICAL.md "Problem reports"): the pure parts of reportBug (bugs.ts), tested in test/bugs.test.ts.
 * A report is the person's own words, the page, a screenshot of their screen, and details the phone gathered (device,
 * connection, app, recent errors and pages). Anyone can send one, guests included, so everything is checked and cut
 * to size here; who sent it comes only from a verified ID token, never from the body.
 */

/** The whole request: a screenshot of up to MAX_SHOT bytes is about 1.37 times that as base64, plus the details. */
export const MAX_BODY = 1_700_000;
export const MAX_SHOT = 1_200_000;
export const MAX_TEXT = 4000;
/** The details as stored, after clean(): JSON size. */
export const MAX_DETAILS = 48 * 1024;

export type ShotType = "image/jpeg" | "image/png" | "image/webp";
export interface Shot { bytes: Buffer; type: ShotType; ext: "jpg" | "png" | "webp"; w: number | null; h: number | null }
export interface Report { text: string; url: string; path: string; details: Record<string, unknown>; shot: Shot | null }

/**
 * Copies plain data only: strings cut to 2,000 characters, at most 80 keys an object and 60 items a list, 6 levels
 * deep. Keys must look like names (Firestore reserves `__…__`), and functions, undefined and the like are dropped.
 */
export function clean(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v.slice(0, 2000);
  if (depth >= 6 || typeof v !== "object") return undefined;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => clean(x, depth + 1) ?? null);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
    if (!/^[A-Za-z0-9][\w.:-]{0,59}$/.test(k)) continue;
    const c = clean(x, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/** Query values that may be secrets (invite codes, reset links, tokens) never reach the database. */
const SECRET = /code|token|key|secret|pass|oob|session|auth|sig/i;
export function redactUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const u = new URL(raw.slice(0, 2000));
    for (const k of [...u.searchParams.keys()]) if (SECRET.test(k)) u.searchParams.set(k, "…");
    u.hash = u.hash && SECRET.test(u.hash) ? "#…" : u.hash;
    u.username = ""; u.password = "";
    return u.toString().slice(0, 600);
  } catch { return ""; }
}

/** The image's own first bytes decide what it is, whatever the data: URL claims. */
export function sniff(b: Buffer): ShotType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
const EXT: Record<ShotType, Shot["ext"]> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const dim = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 20000 ? Math.round(v) : null);

export function parseShot(v: unknown, w?: unknown, h?: unknown): Shot | null {
  if (v == null || v === "") return null;
  const m = typeof v === "string" ? /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v) : null;
  if (!m) throw new Error("bad screenshot");
  const bytes = Buffer.from(m[1], "base64");
  if (!bytes.length || bytes.length > MAX_SHOT) throw new Error("screenshot too big");
  const type = sniff(bytes);
  if (!type) throw new Error("not an image");
  return { bytes, type, ext: EXT[type], w: dim(w), h: dim(h) };
}

/** The request body, checked. Throws on anything malformed (the function answers 400). */
export function parseReport(body: unknown): Report {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";
  if (text.length < 3) throw new Error("say what went wrong");
  const url = redactUrl(b.url);
  let path = "";
  try { path = url ? new URL(url).pathname.slice(0, 300) : ""; } catch { /* no page */ }
  const details = (clean(b.details && typeof b.details === "object" && !Array.isArray(b.details) ? b.details : {}) ?? {}) as Record<string, unknown>;
  if (JSON.stringify(details).length > MAX_DETAILS) throw new Error("details too big");
  return { text, url, path, details, shot: parseShot(b.shot, b.shotW, b.shotH) };
}

/**
 * Reports allowed per window, per instance: per address (a school's phones share one), per account, and for the
 * whole instance, the brake that holds even when someone makes up addresses (the function's own URL takes any headers).
 */
export const BUG_LIMITS = { address: { n: 8, ms: 10 * 60e3 }, account: { n: 10, ms: 60 * 60e3 }, instance: { n: 120, ms: 60 * 60e3 } };
export function limiter() {
  const seen = new Map<string, { at: number; n: number }>();
  const over = (key: string, lim: { n: number; ms: number }, now: number) => {
    const s = seen.get(key);
    if (!s || now - s.at > lim.ms) { if (seen.size > 20000) seen.clear(); seen.set(key, { at: now, n: 1 }); return false; }
    return ++s.n > lim.n;
  };
  return (ip: string, uid: string | null, now = Date.now()) =>
    over("*", BUG_LIMITS.instance, now) || over(`a:${ip}`, BUG_LIMITS.address, now) || (uid != null && over(`u:${uid}`, BUG_LIMITS.account, now));
}
