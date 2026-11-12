/**
 * Content-Security-Policy reports (darsiai.org/api/csp, a Hosting rewrite; firebase.json's report-only policy names it
 * in `report-uri`). The full policy is only reported, not enforced, until it is known to break nothing: browsers post
 * here what it would have blocked, so that can be read from real phones instead of guessed (the first check by hand
 * found the page's own inline scripts). Each report becomes one log line (`csp`) and a count in stats/csp, which is
 * what says when the policy is quiet enough to enforce.
 *
 * Anyone can post here, so it keeps almost nothing and trusts nothing: POST only, at most 8 KB, the two report formats
 * browsers send (application/csp-report: `{ "csp-report": { … } }`; application/reports+json: `[{ type:
 * "csp-violation", body: { … } }]`), a few requests a minute per address and for the whole instance (one instance at
 * most), and of each report only the directive (from a fixed list, so made-up names can't grow the counts document),
 * what was blocked (origin and path) and the page's path. No query strings: an invite link carries its code there. A
 * POST that fits is always answered 204, read or not: a browser does nothing with the answer, and a refusal would only
 * tell a prober what is checked.
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { clientIp } from "./clientIp.js";

/** { <directive>: count, at }: what the report-only policy would have blocked, by directive. Platform admins read stats/*. */
export const CSP_DOC = "stats/csp";
/**
 * address / instance: requests a minute. bytes: the largest body. reports: how many of one body's reports are kept (the
 * Reporting API batches them). flushMs: the counts are added to CSP_DOC at most this often per instance, summed in
 * memory in between (a page that breaks a rule can send dozens of reports at once; one document takes about a write a
 * second).
 */
export const LIMITS = { address: 20, instance: 600, bytes: 8 * 1024, reports: 10, flushMs: 5000 };

const DIRECTIVE = /^[a-z-]{1,40}$/;
/** The directives browsers report. Anything else that looks like one is counted as "other". */
const KNOWN = new Set(["default-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-elem", "style-src-attr", "img-src",
  "media-src", "font-src", "connect-src", "frame-src", "child-src", "worker-src", "manifest-src", "object-src", "base-uri", "form-action",
  "frame-ancestors", "prefetch-src", "require-trusted-types-for", "trusted-types", "upgrade-insecure-requests", "sandbox"]);

export interface Violation { directive: string; blocked: string; page: string }

/** "script-src-elem" from "script-src-elem" or from the older "script-src 'self' https://…"; "" when there is none. */
function directiveOf(v: unknown): string {
  const d = (typeof v === "string" ? v : "").trim().split(/\s+/)[0].toLowerCase();
  if (!d) return "";
  return DIRECTIVE.test(d) && KNOWN.has(d) ? d : "other";
}
/** What was blocked: a keyword as it is (inline, eval, data), a web address as origin and path, another scheme alone. */
function blockedOf(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^[a-z-]{1,30}$/.test(s)) return s;
  try {
    const u = new URL(s);
    return /^(https?|wss?):$/.test(u.protocol) ? `${u.origin}${u.pathname}`.slice(0, 300) : u.protocol.slice(0, 30);
  } catch { return ""; }
}
/** The page's path, without its host (it is ours, or an organization's own address) or its query. */
function pageOf(v: unknown): string {
  try { return new URL(String(v ?? "")).pathname.slice(0, 200); } catch { return ""; }
}

/** The violations in a report body, cleaned; none for another content type, a body that isn't JSON, or other reports. */
export function readReports(contentType: string, text: string): Violation[] {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type !== "application/csp-report" && type !== "application/reports+json") return [];
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  type Fields = Record<string, unknown>;
  const found: Fields[] = [];
  if (type === "application/csp-report") {
    const r = (data as Fields | null)?.["csp-report"];
    if (r && typeof r === "object") found.push({ directive: (r as Fields)["effective-directive"] || (r as Fields)["violated-directive"], blocked: (r as Fields)["blocked-uri"], page: (r as Fields)["document-uri"] });
  } else {
    for (const item of (Array.isArray(data) ? data : [data]) as (Fields | null)[]) {
      const b = item?.body as Fields | null | undefined;
      if (item?.type === "csp-violation" && b && typeof b === "object") found.push({ directive: b.effectiveDirective, blocked: b.blockedURL, page: b.documentURL ?? item.url });
    }
  }
  return found.slice(0, LIMITS.reports)
    .map((f) => ({ directive: directiveOf(f.directive), blocked: blockedOf(f.blocked), page: pageOf(f.page) }))
    .filter((v) => v.directive);
}

/** Requests per minute, per instance: per address, and for the whole instance (analytics.ts has the same brake). */
const seen = new Map<string, { at: number; n: number }>();
let instance = { at: 0, n: 0 };
function tooMany(ip: string, now: number): boolean {
  if (now - instance.at > 60e3) instance = { at: now, n: 0 };
  if (++instance.n > LIMITS.instance) return true;
  const s = seen.get(ip);
  if (!s || now - s.at > 60e3) { if (seen.size > 5000) seen.clear(); seen.set(ip, { at: now, n: 1 }); return false; }
  return ++s.n > LIMITS.address;
}

/** Counts not yet added to CSP_DOC. What the last request of a burst leaves here is added with the next report. */
const pending = new Map<string, number>();
let flushedAt = 0;
async function flush(now: number) {
  if (!pending.size || now - flushedAt < LIMITS.flushMs) return;
  flushedAt = now;
  const counts = [...pending];
  pending.clear();
  try {
    await db.doc(CSP_DOC).set({ ...Object.fromEntries(counts.map(([d, n]) => [d, FieldValue.increment(n)])), at: now }, { merge: true });
  } catch (e) {
    for (const [d, n] of counts) pending.set(d, (pending.get(d) ?? 0) + n);
    logger.error("csp: counts not written", { error: String(e).slice(0, 300) });
  }
}

type Req = { method: string; rawBody?: Buffer; headers: Record<string, string | string[] | undefined>; ip?: string };
type Res = { status(code: number): { end(): unknown } };

export async function handleCsp(req: Req, res: Res, now = Date.now()): Promise<void> {
  if (req.method !== "POST") { res.status(405).end(); return; }
  const raw = req.rawBody;
  if (raw && raw.length > LIMITS.bytes) { res.status(413).end(); return; }
  if (raw?.length && !tooMany(clientIp(req.headers, String(req.ip ?? "?")), now)) {
    const type = req.headers["content-type"];
    for (const v of readReports(String(Array.isArray(type) ? type[0] : type ?? ""), raw.toString("utf8"))) {
      logger.warn("csp", v);
      pending.set(v.directive, (pending.get(v.directive) ?? 0) + 1);
    }
    // Before the answer: an instance gets no processor time between requests, so a write left for later may never run.
    await flush(now);
  }
  res.status(204).end();
}

/** One small instance: reports are a trickle, and a flood of made-up ones must not cost more than that. */
export const cspReport = onRequest({ maxInstances: 1, memory: "256MiB", timeoutSeconds: 10, concurrency: 80 }, (req, res) => handleCsp(req, res));
