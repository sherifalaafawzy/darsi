#!/usr/bin/env node
/**
 * Connects a new organization web address (TECHNICAL.md "Organization sites (custom web addresses)"): everything a host
 * needs outside the app before the "Web address" panel on /super/orgs/:id can point it at an organization.
 *
 *   node scripts/connect-site.mjs school.darsiai.org             do it, then print where each part stands
 *   node scripts/connect-site.mjs school.darsiai.org --dry-run   only read and say what it would do
 *
 * 1. DNS (hosts under darsiai.org): a CNAME from the host to darsi-f0685.web.app in Cloudflare, "DNS only" (not
 *    proxied: Firebase Hosting issues the certificate itself). Credentials from the environment, never printed:
 *    CLOUDFLARE_API_TOKEN (a token with Zone.DNS edit on darsiai.org), or CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL
 *    (the global key). Any other host's DNS is its owner's: the script prints the record to create.
 * 2. Firebase Hosting: the host as a custom domain of the darsi-f0685 site (its certificate can take up to a day).
 * 3. Firebase Authentication: the host in the authorized domains, or signing in there fails.
 * Steps 2 and 3 use `gcloud auth print-access-token` for the personal account (GCLOUD_ACCOUNT overrides it), billed
 * to darsi-f0685 (x-goog-user-project). A host outside *.darsiai.org also needs adding to the voice relay's
 * TUTOR_ORIGINS (docs/FIREBASE.md "Organization sites"); the script reminds you.
 * Each step reads first and changes only what is missing, so running it again is safe.
 */
import { execSync } from "node:child_process";

const PROJECT = "darsi-f0685";
const SITE = "darsi-f0685";
const TARGET = "darsi-f0685.web.app";
const ZONE = { name: "darsiai.org", id: "9c449db68016bced2ecea7b75a37d9e5" };
const ACCOUNT = process.env.GCLOUD_ACCOUNT || "sherifalaafawzy@gmail.com";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const host = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase().replace(/\.$/, "");

// The same rules as apps/web/src/content/sites.ts (checkSiteHost), which setOrgSite applies.
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST = new RegExp(`^(?:${LABEL}\\.)+(?=[a-z0-9-]*[a-z])${LABEL}$`);
const reserved = (h) => ["darsiai.org", "www.darsiai.org"].includes(h) || h.endsWith(".web.app") || h.endsWith(".firebaseapp.com") || h.endsWith(".localhost");
if (!host || host.length > 253 || !HOST.test(host) || reserved(host)) {
  console.error("Usage: node scripts/connect-site.mjs <host> [--dry-run]   (a lowercase hostname such as school.darsiai.org, not one of Darsi's own)");
  process.exit(1);
}
const underZone = host.endsWith(`.${ZONE.name}`);
const say = (step, text) => console.log(`${step.padEnd(9)} ${text}`);
let problems = 0;
const fail = (step, text) => { problems++; say(step, `PROBLEM: ${text}`); };

/** A short, secret-free description of an API's error answer. */
async function why(res) {
  const body = await res.text().catch(() => "");
  let msg = body.slice(0, 300);
  try { const j = JSON.parse(body); msg = j.error?.message ?? j.errors?.map((e) => e.message).join("; ") ?? msg; } catch { /* not JSON */ }
  return `${res.status} ${msg}`.trim();
}

/* ---------- 1. Cloudflare DNS ---------- */
async function dns() {
  if (!underZone) {
    say("DNS", `not under ${ZONE.name}: its owner creates a CNAME record ${host} → ${TARGET} (or, for a bare domain, the A records Firebase shows).`);
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN, key = process.env.CLOUDFLARE_API_KEY, email = process.env.CLOUDFLARE_EMAIL;
  const auth = token ? { Authorization: `Bearer ${token}` } : key && email ? { "X-Auth-Key": key, "X-Auth-Email": email } : null;
  if (!auth) { fail("DNS", `no Cloudflare credentials (CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL). ${dry ? "Would create" : "Create"} CNAME ${host} → ${TARGET}, DNS only.`); return; }
  const api = `https://api.cloudflare.com/client/v4/zones/${ZONE.id}/dns_records`;
  const list = await fetch(`${api}?name=${encodeURIComponent(host)}`, { headers: auth });
  if (!list.ok) { fail("DNS", `couldn't read the zone: ${await why(list)}`); return; }
  const records = (await list.json()).result ?? [];
  const cname = records.find((r) => r.type === "CNAME");
  const other = records.filter((r) => r.type !== "CNAME" && r.type !== "TXT");
  if (other.length) { fail("DNS", `${host} already has ${other.map((r) => r.type).join(", ")} records; remove them in Cloudflare first (nothing changed).`); return; }
  const want = { type: "CNAME", name: host, content: TARGET, proxied: false, ttl: 1, comment: "Darsi organization site (scripts/connect-site.mjs)" };
  if (cname && cname.content === TARGET && cname.proxied === false) { say("DNS", `ok: CNAME ${host} → ${TARGET}, DNS only.`); return; }
  if (dry) { say("DNS", `would ${cname ? `change the CNAME (now → ${cname.content}${cname.proxied ? ", proxied" : ""})` : "create the CNAME"} ${host} → ${TARGET}, DNS only.`); return; }
  const res = await fetch(cname ? `${api}/${cname.id}` : api, { method: cname ? "PATCH" : "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(want) });
  if (!res.ok) { fail("DNS", `couldn't ${cname ? "change" : "create"} the CNAME: ${await why(res)}`); return; }
  say("DNS", `${cname ? "changed" : "created"}: CNAME ${host} → ${TARGET}, DNS only.`);
}

/* ---------- Google APIs (Hosting, Identity Toolkit) ---------- */
let token = null;
function googleToken() {
  if (token === null) {
    try { token = execSync(`gcloud auth print-access-token --account=${ACCOUNT}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
    catch { token = ""; }
  }
  return token;
}
const google = (url, init = {}) => fetch(url, { ...init, headers: { Authorization: `Bearer ${googleToken()}`, "x-goog-user-project": PROJECT, "Content-Type": "application/json", ...init.headers } });

/* ---------- 2. Firebase Hosting custom domain ---------- */
async function hosting() {
  if (!googleToken()) { fail("Hosting", `no gcloud token for ${ACCOUNT} (run: gcloud auth login ${ACCOUNT}).`); return; }
  const base = `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites/${SITE}/customDomains`;
  let res = await google(`${base}/${encodeURIComponent(host)}`);
  if (res.status === 404) {
    if (dry) { say("Hosting", `would add ${host} as a custom domain of ${SITE}.`); return; }
    res = await google(`${base}?customDomainId=${encodeURIComponent(host)}`, { method: "POST", body: "{}" });
    if (!res.ok) { fail("Hosting", `couldn't add the custom domain: ${await why(res)}`); return; }
    say("Hosting", `added ${host} to ${SITE}. Its certificate is issued once the DNS record is visible (minutes to a day).`);
    const op = await res.json().catch(() => ({}));
    if (op.name) say("", `operation ${op.name}`);
    res = await google(`${base}/${encodeURIComponent(host)}`);
  }
  if (!res.ok) { fail("Hosting", `couldn't read the custom domain: ${await why(res)}`); return; }
  const d = await res.json();
  say("Hosting", `host ${d.hostState ?? "?"}, ownership ${d.ownershipState ?? "?"}, certificate ${d.cert?.state ?? "?"}.`);
  for (const issue of d.issues ?? []) say("", `issue: ${issue.message ?? JSON.stringify(issue).slice(0, 200)}`);
}

/* ---------- 3. Firebase Authentication authorized domains ---------- */
async function authDomains() {
  if (!googleToken()) { fail("Auth", `no gcloud token for ${ACCOUNT}.`); return; }
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
  const res = await google(url);
  if (!res.ok) { fail("Auth", `couldn't read the authorized domains: ${await why(res)}`); return; }
  const domains = (await res.json()).authorizedDomains ?? [];
  if (domains.includes(host)) { say("Auth", `ok: ${host} is an authorized domain.`); return; }
  if (dry) { say("Auth", `would add ${host} to the ${domains.length} authorized domains.`); return; }
  const put = await google(`${url}?updateMask=authorizedDomains`, { method: "PATCH", body: JSON.stringify({ authorizedDomains: [...domains, host] }) });
  if (!put.ok) { fail("Auth", `couldn't add it: ${await why(put)}`); return; }
  say("Auth", `added ${host} to the authorized domains.`);
}

console.log(`${dry ? "Dry run: " : ""}connecting ${host} to Darsi (project ${PROJECT})`);
await dns().catch((e) => fail("DNS", String(e?.message ?? e)));
await hosting().catch((e) => fail("Hosting", String(e?.message ?? e)));
await authDomains().catch((e) => fail("Auth", String(e?.message ?? e)));
say("Tutor", underZone ? "ok: the relay's TUTOR_ORIGINS includes https://*.darsiai.org." : `add https://${host} to the relay's TUTOR_ORIGINS and deploy it again (docs/FIREBASE.md).`);
say("Next", `on /super/orgs/<id>, "Web address": ${host}, with or without Darsi's identity.`);
process.exit(problems ? 1 : 0);
