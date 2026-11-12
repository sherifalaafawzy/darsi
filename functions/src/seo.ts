/**
 * Search and AI engines (TECHNICAL.md "Search and AI engines"): Hosting sends /, /robots.txt, /sitemap.xml and
 * /llms.txt here, for darsiai.org and for every organization's own address (the address comes in X-Forwarded-Host).
 * - /: the app's shell (app.html, read from Hosting itself, so it is always this release's) with this address's title,
 *   description, canonical, language alternates (?lang=ar), social card, JSON-LD and the page's text in #root
 *   (seoCore.ts). The security headers Hosting puts on app.html are passed on. Phones that already have the app never
 *   come here: the service worker answers / from its own copy.
 * - robots.txt, sitemap.xml, llms.txt: this address's own.
 * Reads are kept in memory for a minute (the shell, sites.json, the catalog, a homepage), so a visit costs no
 * Firestore read and at most a few Storage reads a minute per instance. Darsi's own addresses and an organization's
 * that isn't in sites.json get Darsi's page; an unknown address gets Darsi's page with Darsi's canonical.
 */
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { checkPage, pagePath, type OrgPage } from "./shared/page.js";
import { isDarsiHost, siteFor, type SitesFile } from "./shared/sites.js";
import { bucket, publicFileUrl } from "./storage.js";
import { DARSI_URL, darsiSeo, inject, langOf, llms, orgSeo, robots, sitemap, type CatalogUnit, type Seo } from "./seoCore.js";

const SITE = defineString("SITE_URL", { default: "https://darsiai.org" });
const TTL = 60_000;
const memo = new Map<string, { at: number; v: unknown }>();
/** A value kept for a minute; a failed refresh keeps the last good one (an hour at most). */
async function kept<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  try { const v = await load(); memo.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (hit && Date.now() - hit.at < 3600_000) return hit.v as T; throw e; }
}
const json = async <T>(path: string): Promise<T | null> => {
  const f = bucket().file(path);
  const [exists] = await f.exists();
  if (!exists) return null;
  const [buf] = await f.download();
  return JSON.parse(buf.toString("utf8")) as T;
};
/** Headers Hosting puts on the shell that a page answered here must carry too. */
const PASS = ["content-security-policy", "content-security-policy-report-only", "permissions-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "cross-origin-opener-policy"];
async function shell(): Promise<{ html: string; headers: Record<string, string> }> {
  return kept("shell", async () => {
    const r = await fetch(`${SITE.value()}/app.html`, { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error(`app.html: ${r.status}`);
    const headers: Record<string, string> = {};
    for (const h of PASS) { const v = r.headers.get(h); if (v) headers[h] = v; }
    return { html: await r.text(), headers };
  });
}

export function hostOf(headers: Record<string, unknown>): string {
  const raw = String(headers["x-forwarded-host"] ?? headers.host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return /^[a-z0-9.-]{1,253}$/.test(raw) ? raw : "";
}

/** What an address shows: an organization's (sites.json and its homepage) or Darsi's. */
async function seoFor(host: string, lang: "en" | "ar"): Promise<{ seo: Seo; base: string }> {
  if (host && !isDarsiHost(host)) {
    const sites = await kept("sites", () => json<SitesFile>("content/sites.json"));
    const site = sites ? siteFor(sites, host) : null;
    if (site) {
      const page = await kept(`page:${site.orgId}`, async () => checkPage(await json<OrgPage>(pagePath(site.orgId)), site.orgId).page);
      return { seo: orgSeo(host, site, page && page.blocks.length ? page : null, lang, site.logo ? (/^https?:\/\//.test(site.logo) ? site.logo : publicFileUrl(site.logo)) : null), base: `https://${host}` };
    }
  }
  const catalog = await kept("catalog", () => json<{ units: CatalogUnit[] }>("content/catalog.json")).catch(() => null);
  return { seo: darsiSeo(catalog?.units ?? [], lang, `${DARSI_URL}/app-icons/app-icon-512.png`), base: DARSI_URL };
}

export const seoPage = onRequest({ maxInstances: 5, memory: "256MiB", timeoutSeconds: 20, concurrency: 80 }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.status(405).end(); return; }
  const host = hostOf(req.headers as Record<string, unknown>);
  const path = req.path || "/";
  const lang = langOf(req.query.lang);
  try {
    if (path === "/robots.txt" || path === "/sitemap.xml" || path === "/llms.txt") {
      const { seo, base } = await seoFor(host, lang);
      res.set("Cache-Control", "public, max-age=3600");
      if (path === "/robots.txt") { res.type("text/plain").send(robots(base)); return; }
      if (path === "/sitemap.xml") { res.type("application/xml").send(sitemap(base, ["/privacy", "/terms", "/licences"])); return; }
      res.type("text/plain; charset=utf-8").send(llms(seo, base));
      return;
    }
    const [{ html, headers }, { seo }] = await Promise.all([shell(), seoFor(host, lang)]);
    res.set(headers);
    // Browsers ask again each time, as they do for app.html; the work is a few memory lookups.
    res.set("Cache-Control", "no-cache");
    res.type("text/html; charset=utf-8").send(inject(html, seo));
  } catch (e) {
    logger.error("seo: page failed", { host, path, error: String(e) });
    // The app still works without any of this: send the plain shell when there is one.
    try { const { html, headers } = await shell(); res.set(headers).set("Cache-Control", "no-cache").type("text/html; charset=utf-8").send(html); }
    catch { res.status(503).set("Retry-After", "5").end(); }
  }
});
