/**
 * Connecting an organization's web address to Darsi, and disconnecting it (TECHNICAL.md "Organization sites (custom web
 * addresses)"). Everything a platform admin's approval sets in motion, done as the functions' own service account
 * (darsi-f0685's compute account, an Editor), so nobody runs a script or opens a console:
 * - Firebase Hosting: the address as a custom domain of the darsi-f0685 site (REST v1beta1). Hosting then issues its
 *   certificate by itself once the address's DNS points at it, and says which DNS records are still missing.
 * - Firebase Authentication: the address in the authorized domains (Identity Toolkit admin v2), or signing in fails.
 * - Storage: https://<address> in the bucket's CORS list (JSON API), or the app there can't read Darsi's files.
 *   These two only once the address points at Darsi (connectHost).
 * DNS is the one part outside: addresses under darsiai.org point at Hosting through one wildcard record (`*` CNAME
 * darsi-f0685.web.app, DNS only, in Cloudflare; docs/FIREBASE.md "Organization sites"), and any other address's owner
 * adds the records Hosting asks for, which the screens show. The voice relay reads approved addresses itself (relay.ts).
 * Every step reads first and changes only what is missing, so checking again is safe. In the emulator every call goes
 * to the local stand-in (scripts/local/domains.mjs), never to Google; DOMAINS_API overrides where they go.
 */
import { applicationDefault } from "firebase-admin/app";
import { BUCKET } from "./storage.js";
import { corsWith, hostingCheck, listWith } from "./sitesCore.js";
import type { DnsRecord, SiteSteps, StepState } from "./shared/sites.js";

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

/** Where an address stands, step by step, with the DNS records still to add and what Google said went wrong. */
export interface HostCheck { steps: SiteSteps; records: DnsRecord[]; issues: string[]; errors: string[] }

/**
 * Connects an address (with `fix`, adding whatever is missing) and says where each step stands. A step that fails is
 * an error step with Google's words in `errors`; the others still run. The sign-in domain and the CORS origin are added
 * only once Hosting has seen the address point at Darsi (the dns step), which shows whoever runs its DNS chose Darsi:
 * approving an address nobody controls never lets a page there sign people in to Darsi. Until then they wait.
 */
export async function connectHost(host: string, fix = true): Promise<HostCheck> {
  const errors: string[] = [];
  let dns: StepState = "todo", hosting: StepState = "todo", cert: StepState = "todo", auth: StepState = "todo", cors: StepState = "todo";
  let records: DnsRecord[] = [], issues: string[] = [];

  try {
    const one = `${hostingUrl()}/${encodeURIComponent(host)}`;
    let got = await call("GET", one);
    if (got.status === 404 && fix) {
      const add = await call("POST", `${hostingUrl()}?customDomainId=${encodeURIComponent(host)}`, {});
      if (!add.ok && add.status !== 409) throw new Error(`adding it: ${why(add)}`);
      got = await call("GET", one);
    }
    // Just added, and not readable yet (Hosting creates it in the background): the next check reads it.
    if (got.status === 404) hosting = dns = cert = fix ? "wait" : "todo";
    else if (!got.ok) throw new Error(why(got));
    else ({ hosting, dns, cert, records, issues } = hostingCheck(got.json ?? {}));
  } catch (e) { hosting = "error"; errors.push(`Hosting: ${said(e)}`); }

  try {
    const got = await call("GET", authUrl());
    if (!got.ok) throw new Error(why(got));
    const next = listWith(got.json?.authorizedDomains, host, true);
    if (next && fix && dns === "ok") {
      const put = await call("PATCH", `${authUrl()}?updateMask=authorizedDomains`, { authorizedDomains: next });
      if (!put.ok) throw new Error(why(put));
    }
    auth = !next ? "ok" : !fix ? "todo" : dns === "ok" ? "ok" : "wait";
  } catch (e) { auth = "error"; errors.push(`Authentication: ${said(e)}`); }

  try {
    const got = await call("GET", `${bucketUrl()}?fields=cors`);
    if (!got.ok) throw new Error(why(got));
    const next = corsWith(got.json?.cors, `https://${host}`, true);
    if (next && fix && dns === "ok") {
      const put = await call("PATCH", `${bucketUrl()}?fields=cors`, { cors: next });
      if (!put.ok) throw new Error(why(put));
    }
    cors = !next ? "ok" : !fix ? "todo" : dns === "ok" ? "ok" : "wait";
  } catch (e) { cors = "error"; errors.push(`Storage CORS: ${said(e)}`); }

  return { steps: { dns, hosting, cert, auth, cors }, records, issues, errors };
}

/**
 * Disconnects an address: Hosting's custom domain (Hosting keeps it 30 days in case it is wanted back), the authorized
 * domain and the CORS origin. DNS is left alone. Returns what failed; what was already gone is not a failure.
 */
export async function disconnectHost(host: string): Promise<string[]> {
  const errors: string[] = [];
  try {
    const del = await call("DELETE", `${hostingUrl()}/${encodeURIComponent(host)}`);
    if (!del.ok && del.status !== 404) throw new Error(why(del));
  } catch (e) { errors.push(`Hosting: ${said(e)}`); }
  try {
    const got = await call("GET", authUrl());
    if (!got.ok) throw new Error(why(got));
    const next = listWith(got.json?.authorizedDomains, host, false);
    if (next) {
      const put = await call("PATCH", `${authUrl()}?updateMask=authorizedDomains`, { authorizedDomains: next });
      if (!put.ok) throw new Error(why(put));
    }
  } catch (e) { errors.push(`Authentication: ${said(e)}`); }
  try {
    const got = await call("GET", `${bucketUrl()}?fields=cors`);
    if (!got.ok) throw new Error(why(got));
    const next = corsWith(got.json?.cors, `https://${host}`, false);
    if (next) {
      const put = await call("PATCH", `${bucketUrl()}?fields=cors`, { cors: next });
      if (!put.ok) throw new Error(why(put));
    }
  } catch (e) { errors.push(`Storage CORS: ${said(e)}`); }
  return errors;
}
