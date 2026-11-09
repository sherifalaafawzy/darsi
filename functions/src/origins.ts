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
 * Organization addresses outside a wildcard (learn.school.edu, TECHNICAL.md "Organization sites"): allowed while their
 * sign-in is (sites/{host} approved, its ownership record there and pointing at Darsi), so a new address needs no new
 * TUTOR_ORIGINS and no relay deploy. `load` lists those hosts in one read, done again at most every `every` ms (two
 * minutes) and never per origin, so made-up origins cost nothing and can't crowd real ones out. A read that fails keeps
 * the last list and is tried again 15 seconds later. Only https origins without a port whose host could be a site.
 */
export function siteOrigins(load: () => Promise<string[]>, now = () => Date.now(), every = 120_000) {
  let hosts = new Set<string>(), at = -Infinity;
  let loading: Promise<void> | null = null;
  const refresh = () => (loading ??= load().then(
    (list) => { hosts = new Set(list); at = now(); },
    () => { at = now() - every + 15_000; },
  ).finally(() => { loading = null; }));
  return async (origin: string | undefined): Promise<boolean> => {
    const m = /^https:\/\/([a-z0-9.-]{1,253})$/.exec(origin ?? "");
    if (!m || "problem" in checkSiteHost(m[1])) return false;
    if (now() - at > every) await refresh();
    return hosts.has(m[1]);
  };
}
