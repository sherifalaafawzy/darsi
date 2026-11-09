/**
 * Which web pages may open the tutor's voice relay (relay.ts, L9): TUTOR_ORIGINS, a list separated by commas or spaces
 * (gcloud's --set-env-vars splits on commas, so docs/FIREBASE.md passes it with "^;^" as the delimiter). An entry is
 * an exact origin ("https://darsiai.org", "http://localhost:4173" for `npm run local`) or, for organization sites
 * (TECHNICAL.md "Organization sites"), "https://*.darsiai.org": any https origin whose host ends in ".darsiai.org",
 * with at least one label before it and no port. Wildcards are https only; any other shape of entry is ignored.
 */
import { checkSiteHost } from "./shared/sites.js";

export type OriginRule = { exact: string } | { suffix: string };

export function parseOrigins(raw: string | undefined): OriginRule[] {
  const out: OriginRule[] = [];
  for (const entry of String(raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const wild = /^https:\/\/\*((?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/.exec(entry.toLowerCase());
    if (wild) out.push({ suffix: wild[1] });
    else if (!entry.includes("*")) out.push({ exact: entry });
  }
  return out;
}

/** Whether a browser's Origin header is allowed. A missing or malformed one never is. */
export function originAllowed(origin: string | undefined, rules: OriginRule[]): boolean {
  if (!origin) return false;
  if (rules.some((r) => "exact" in r && r.exact === origin)) return true;
  const m = /^https:\/\/([a-z0-9.-]+)$/.exec(origin);
  if (!m) return false;
  const host = m[1];
  return rules.some((r) => "suffix" in r && host.endsWith(r.suffix) && host.length > r.suffix.length
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host.slice(0, -r.suffix.length)));
}

/**
 * Organization addresses outside a wildcard (learn.school.edu, TECHNICAL.md "Organization sites"): allowed while
 * sites/{host} is approved, so a new address needs no new TUTOR_ORIGINS and no relay deploy. `read` says whether the
 * host is approved; answers are kept 5 minutes (refusals 1 minute), and at most 30 lookups a minute reach it, so a
 * stream of made-up origins costs next to nothing. Only https origins without a port whose host could be a site.
 */
export function siteOrigins(read: (host: string) => Promise<boolean>, now = () => Date.now()) {
  const cache = new Map<string, { ok: boolean; until: number }>();
  let window = { at: 0, n: 0 };
  return async (origin: string | undefined): Promise<boolean> => {
    const m = /^https:\/\/([a-z0-9.-]{1,253})$/.exec(origin ?? "");
    if (!m || "problem" in checkSiteHost(m[1])) return false;
    const host = m[1], t = now();
    const hit = cache.get(host);
    if (hit && hit.until > t) return hit.ok;
    if (t - window.at > 60_000) window = { at: t, n: 0 };
    if (++window.n > 30) return false;
    let ok: boolean;
    try { ok = await read(host); } catch { return false; }
    if (cache.size >= 500) cache.clear();
    cache.set(host, { ok, until: t + (ok ? 300_000 : 60_000) });
    return ok;
  };
}
