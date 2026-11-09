/**
 * Connecting an organization's web address to Darsi, and disconnecting it (TECHNICAL.md "Organization sites (custom web
 * addresses)"). Everything a platform admin's approval sets in motion, done as the functions' own service account
 * (darsi-f0685's compute account, an Editor), so nobody runs a script or opens a console:
 * - DNS, read by Darsi itself (connectHost): the organization's ownership record (`_darsi.<address>` TXT, for an
 *   address outside darsiai.org) and the CNAME to darsi-f0685.web.app. Hosting's own view of DNS isn't enough: it may
 *   not look again for weeks once an address is active.
 * - Firebase Hosting: the address as a custom domain of the darsi-f0685 site (REST v1beta1), added only once the
 *   ownership record is there. Hosting then issues its certificate by itself once the address points at it.
 * - Firebase Authentication's authorized domains and the bucket's CORS list (syncAccess): set as a whole from the
 *   addresses that have both the ownership record and the CNAME, so an address loses sign-in and file access as soon as
 *   either goes (a lapsed domain someone else bought can't sign people in to Darsi).
 * DNS is the one part outside: the organization adds the records the screens show. The voice relay reads approved
 * addresses itself (relay.ts). Every step reads first and changes only what is missing, so checking again is safe. In
 * the emulator every call goes to the local stand-in (scripts/local/domains.mjs), never to Google; DOMAINS_API
 * overrides where they go.
 */
import { Resolver } from "node:dns/promises";
import { applicationDefault } from "firebase-admin/app";
import { BUCKET } from "./storage.js";
import { hostingCheck, planCors, planList } from "./sitesCore.js";
import { cnameRecord, HOSTING_TARGET, proofRecord, type DnsRecord, type SiteSteps, type StepState } from "./shared/sites.js";

const EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "darsi-f0685";
/** The Hosting site that serves every address: the project's default site, named like the project. */
const SITE = process.env.HOSTING_SITE || PROJECT;
const BASE = process.env.DOMAINS_API || (EMULATOR ? "http://127.0.0.1:4798" : "");
const at = (google: string) => BASE || google;

let token: { v: string; until: number } | null = null;
async function bearer(): Promise<Record<string, string>> {
  if (BASE) return {};
  if (!token || token.until < Date.now() + 60_000) {
    const t = await applicationDefault().getAccessToken();
    token = { v: t.access_token, until: Date.now() + t.expires_in * 1000 };
  }
  // The quota project: needed when the token is a person's (a script run with gcloud's application-default login), and
  // allowed for the functions' own service account (an Editor of the project).
  return { Authorization: `Bearer ${token.v}`, "x-goog-user-project": PROJECT };
}

type Answer = { status: number; ok: boolean; json: Record<string, unknown> | null; text: string };
async function call(method: string, url: string, body?: unknown): Promise<Answer> {
  const res = await fetch(url, {
    method, headers: { ...(await bearer()), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}
/** A short, secret-free description of an API's refusal. */
const why = (a: Answer) => `${a.status} ${String((a.json?.error as { message?: unknown } | undefined)?.message ?? a.text.slice(0, 200))}`.trim();
const said = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);

const hostingUrl = () => `${at("https://firebasehosting.googleapis.com")}/v1beta1/projects/${PROJECT}/sites/${SITE}/customDomains`;
const authUrl = () => `${at("https://identitytoolkit.googleapis.com")}/admin/v2/projects/${PROJECT}/config`;
const bucketUrl = () => `${at("https://storage.googleapis.com")}/storage/v1/b/${encodeURIComponent(BUCKET)}`;

/** What DNS says about an address: where its CNAME chain leads, and the TXT values of its ownership record. */
export interface DnsSeen { cname: string[]; txt: string[] }
type Lookups = Pick<Resolver, "resolveCname" | "resolveTxt">;
/** No such name, or no record of that type: an answer, not a failure. */
const NONE = new Set(["ENODATA", "ENOTFOUND", "ENONAME", "NXDOMAIN"]);
const lower = (n: string) => n.toLowerCase().replace(/\.$/, "");

/**
 * Looks the address up in DNS (Google's resolvers, as Cloud Run's): its CNAME chain (at most 4 steps) and, with
 * `proof`, the TXT values at `_darsi.<address>`. A resolver that fails (timeout, SERVFAIL) throws: the caller keeps
 * what the last check found rather than act on no answer.
 */
export async function lookupDns(host: string, proof: boolean, dns: Lookups = resolver()): Promise<DnsSeen> {
  const none = <T>(p: Promise<T>, empty: T) => p.catch((e: { code?: string }) => { if (NONE.has(String(e?.code))) return empty; throw e; });
  const cname: string[] = [];
  let name = host;
  for (let i = 0; i < 4; i++) {
    const next = (await none(dns.resolveCname(name), [] as string[]))[0];
    if (!next) break;
    name = lower(next);
    cname.push(name);
  }
  const txt = proof ? (await none(dns.resolveTxt(`_darsi.${host}`), [] as string[][])).map((chunks) => chunks.join("")) : [];
  return { cname, txt };
}
function resolver(): Lookups {
  if (BASE) {
    // The local stand-in answers for DNS too.
    const ask = async (host: string) => {
      const a = await call("GET", `${BASE}/resolve/${encodeURIComponent(host)}`);
      if (!a.ok) throw new Error(why(a));
      return a.json as { cname?: string[]; txt?: string[] };
    };
    return {
      resolveCname: async (n: string) => (await ask(n)).cname ?? [],
      resolveTxt: async (n: string) => ((await ask(n.replace(/^_darsi\./, ""))).txt ?? []).map((t) => [t]),
    } as unknown as Lookups;
  }
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["8.8.8.8", "8.8.4.4"]);
  return r;
}

/** The steps connectHost decides (auth and cors follow from them: syncAccess). */
export type LinkSteps = Pick<SiteSteps, "owner" | "dns" | "hosting" | "cert">;
/** Where an address stands, step by step, with the DNS records still to add and what went wrong. */
export interface HostCheck { steps: LinkSteps; records: DnsRecord[]; issues: string[]; errors: string[] }

/**
 * Connects an address (with `fix`, adding whatever is missing) and says where each step stands:
 * - owner: with a `proof` token (an address outside darsiai.org), the ownership record holds it.
 * - dns: Darsi's own lookup finds the CNAME to darsi-f0685.web.app, and Hosting sees the address point at it.
 * - hosting: the address is a custom domain of Darsi's site, added only once owner is done, so Darsi never holds an
 *   address for an organization that didn't show it runs it. cert: Hosting's certificate.
 * A DNS lookup that fails keeps `prev`'s owner and dns (no answer is not a change). A step Google refused is an error
 * step with its words in `errors`; the others still run.
 */
export async function connectHost(host: string, o: { fix?: boolean; proof?: string | null; prev?: Partial<SiteSteps> | null } = {}): Promise<HostCheck> {
  const fix = o.fix ?? true, proof = o.proof ?? null;
  const errors: string[] = [], issues: string[] = [];
  let owner: StepState = proof ? "wait" : "ok", pointed = false;
  try {
    const seen = await lookupDns(host, Boolean(proof));
    pointed = seen.cname.includes(HOSTING_TARGET);
    if (proof) owner = seen.txt.includes(proofRecord(host, proof).value) ? "ok" : "wait";
    if (seen.cname.length && !pointed) issues.push(`${host} points at ${seen.cname.at(-1)}, not ${HOSTING_TARGET}.`);
  } catch (e) {
    issues.push(`DNS lookup: ${said(e)}`);
    if (proof) owner = o.prev?.owner === "ok" ? "ok" : "wait";
    pointed = o.prev?.dns === "ok";
  }

  let hosting: StepState = "todo", seenByHosting: StepState = "wait", cert: StepState = "todo";
  let fromHosting: DnsRecord[] = [];
  try {
    const one = `${hostingUrl()}/${encodeURIComponent(host)}`;
    let got = await call("GET", one);
    if (got.status === 404 && fix && owner === "ok") {
      const add = await call("POST", `${hostingUrl()}?customDomainId=${encodeURIComponent(host)}`, {});
      if (!add.ok && add.status !== 409) throw new Error(`adding it: ${why(add)}`);
      got = await call("GET", one);
      // Just added, and not readable yet (Hosting creates it in the background): the next check reads it.
      if (got.status === 404) hosting = cert = "wait";
    }
    if (got.ok) {
      const h = hostingCheck(got.json ?? {});
      ({ hosting, cert } = h);
      seenByHosting = h.dns;
      fromHosting = h.records;
      issues.push(...h.issues);
    } else if (got.status !== 404) throw new Error(why(got));
  } catch (e) { hosting = "error"; errors.push(`Hosting: ${said(e)}`); }

  const dns: StepState = seenByHosting === "error" ? "error" : pointed && seenByHosting === "ok" ? "ok" : "wait";
  // Darsi asks for a CNAME at the address itself; Hosting's records for other names (its certificate's) still count,
  // and so do the ones it says to remove (an old A record in the CNAME's way).
  const records = [
    ...(proof && owner !== "ok" ? [proofRecord(host, proof)] : []),
    ...(pointed ? [] : [cnameRecord(host)]),
    ...fromHosting.filter((r) => r.name !== host || r.action === "remove"),
  ].slice(0, 20);
  return { steps: { owner, dns, hosting, cert }, records, issues: issues.slice(0, 10), errors };
}

/** Takes the address out of Hosting (which keeps it 30 days in case it is wanted back). DNS is left alone. */
export async function disconnectHost(host: string): Promise<string[]> {
  try {
    const del = await call("DELETE", `${hostingUrl()}/${encodeURIComponent(host)}`);
    if (!del.ok && del.status !== 404) throw new Error(why(del));
    return [];
  } catch (e) { return [`Hosting: ${said(e)}`]; }
}

/** Which addresses are in each list after syncAccess (null: the list couldn't be read), and what failed. */
export interface Access { authorized: Set<string> | null; origins: Set<string> | null; errors: string[] }

/**
 * Sets the authorized domains and the bucket's CORS list from the addresses that may sign in now (`want`): each is
 * added, and every address Darsi put there before (`managed`) that isn't wanted any more is taken out. Entries Darsi
 * didn't put there (darsiai.org, localhost, Hosting's own) are never touched. The CORS write is conditional on the
 * bucket's metageneration, so a change made meanwhile is never overwritten; callers hold the sites lock for the rest.
 */
export async function syncAccess(want: string[], managed: string[]): Promise<Access> {
  const drop = managed.filter((h) => !want.includes(h));
  const errors: string[] = [];
  let authorized: Set<string> | null = null, origins: Set<string> | null = null;

  try {
    const got = await call("GET", authUrl());
    if (!got.ok) throw new Error(why(got));
    let list = got.json?.authorizedDomains;
    const next = planList(list, want, drop);
    if (next) {
      const put = await call("PATCH", `${authUrl()}?updateMask=authorizedDomains`, { authorizedDomains: next });
      if (!put.ok) throw new Error(why(put));
      list = next;
    }
    authorized = new Set((Array.isArray(list) ? list : []).filter((x): x is string => typeof x === "string"));
  } catch (e) { errors.push(`Authentication: ${said(e)}`); }

  try {
    for (let tries = 0; ; tries++) {
      const got = await call("GET", `${bucketUrl()}?fields=cors,metageneration`);
      if (!got.ok) throw new Error(why(got));
      let cors = got.json?.cors;
      const next = planCors(cors, want.map((h) => `https://${h}`), drop.map((h) => `https://${h}`));
      if (next) {
        const put = await call("PATCH", `${bucketUrl()}?fields=cors&ifMetagenerationMatch=${encodeURIComponent(String(got.json?.metageneration ?? ""))}`, { cors: next });
        if (put.status === 412 && tries < 3) continue;
        if (!put.ok) throw new Error(why(put));
        cors = next;
      }
      origins = new Set((Array.isArray(cors) ? cors : []).flatMap((e: { origin?: unknown }) => (Array.isArray(e?.origin) ? e.origin : []))
        .filter((x): x is string => typeof x === "string" && x.startsWith("https://")).map((x) => x.slice(8)));
      break;
    }
  } catch (e) { errors.push(`Storage CORS: ${said(e)}`); }

  return { authorized, origins, errors };
}
