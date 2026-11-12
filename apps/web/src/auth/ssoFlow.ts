/**
 * A school sign-in flow (TECHNICAL.md "School sign-in"; the server is functions/src/sso.ts): only the lazy school
 * chunks load this (the sign-in screen's school part and finder, Me's row, the admin wizard). Plain fetches to
 * /api/sso/* (Hosting rewrites them to ssoEdge), no Firebase.
 *
 * start (a PKCE pair made here; the server answers the provider's address and a short flow id) → the provider →
 * login.darsiai.org/callback/<org> → back to a constant page of this site with `#sso=<ticket>&f=<flow>` or
 * `#sso_error=<code>&f=<flow>`, which sso.ts takes out of the address before anything renders → finish (the ticket
 * and this page's verifier). The verifier never leaves this device
 * except to finish, which proves that the browser that started the flow is the one ending it (no sign-in can be pushed
 * into someone else's browser).
 */
import { firebaseConfig, functionsRegion, useEmulators } from "../firebase-config";
import { readRecord, RECORD, RETURN, returnedTo, signedOutHere, takeStash, type School, type SsoMode, type SsoRecord } from "./sso";

/** A refusal: the server's code (sso-*, see admin/sso-strings and auth/sso-strings), or "network" when it never answered. */
export class SsoError extends Error {
  constructor(readonly code: string, readonly detail = "") { super(code); this.name = "SsoError"; }
}
export const codeOf = (e: unknown) => (e instanceof SsoError ? e.code : "network");

/** The server's state lives 60 minutes and the ticket 2 more: a record older than this can't finish anything. */
const MAX_AGE = 65 * 60_000;

/** ssoEdge: same-origin through Hosting; the functions emulator directly (it answers CORS there only). */
export const ssoUrl = (path: string) => (useEmulators
  ? `http://${location.hostname}:5001/${firebaseConfig.projectId}/${functionsRegion}/ssoEdge/api/sso${path}`
  : `/api/sso${path}`);

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** 32 random bytes: 43 base64url characters (RFC 7636's verifier, which finish accepts). */
export const newVerifier = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
/** base64url(SHA-256(verifier)): exactly 43 characters, as start wants. */
export const challengeOf = async (v: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))));

const store = {
  set(r: SsoRecord) { try { localStorage.setItem(RECORD, JSON.stringify(r)); } catch { /* private mode: the return says "go back to the tab" */ } },
  drop() { try { localStorage.removeItem(RECORD); } catch { /* private mode */ } },
};

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(ssoUrl(path), { credentials: "omit", cache: "no-store", ...init }); } catch { throw new SsoError("network"); }
  const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (!r.ok) throw new SsoError(typeof body?.error === "string" ? body.error : r.status >= 500 ? "network" : "sso-state");
  return body as T;
}
const post = <T,>(path: string, body: unknown, idToken?: string) => send<T>(path, {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
});

/**
 * Starts a flow and answers the provider's address (the caller goes there: location.assign). `school` names the
 * school for after the return; `next` is where the person was. Link and an admin's test need the account's ID token.
 */
export async function startFlow(o: { orgId?: string; slug?: string; mode: SsoMode; testToken?: string; idToken?: string; next?: string; school?: School }): Promise<string> {
  const verifier = newVerifier();
  const r = await post<{ url?: unknown; flow?: unknown }>("/start", {
    ...(o.orgId ? { orgId: o.orgId } : { slug: o.slug }), mode: o.mode, challenge: await challengeOf(verifier),
    ...(o.testToken ? { testToken: o.testToken } : {}), ...(o.mode === "signin" && signedOutHere.get() ? { signedOutHere: true } : {}),
  }, o.idToken);
  // Only ever an https address (the local stand-in provider is http on this machine).
  if (typeof r.url !== "string" || typeof r.flow !== "string" || !(/^https:\/\//.test(r.url) || (useEmulators && /^http:\/\//.test(r.url)))) throw new SsoError("sso-state");
  store.set({ verifier, flow: r.flow, mode: o.mode, next: o.next ?? "", at: Date.now(), ...(o.school ? { school: o.school } : {}), ...(o.testToken ? { token: o.testToken } : {}) });
  return r.url;
}

/** finish: the ticket and this page's verifier. `idToken` for link and an admin's test; `confirm` for link's second call. */
export const finishFlow = <T = Record<string, unknown>>(ticket: string, verifier: string, o: { idToken?: string; confirm?: boolean } = {}) =>
  post<T>("/finish", { ticket, verifier, ...(o.confirm ? { confirm: true } : {}) }, o.idToken);

/**
 * The school behind /signin?school=<slug> (one fetch per slug and page); null when it has no sign-in that is on.
 * `token`: a student's test link's (/signin?school=<slug>&try=<token>). The school's admin sends it from the wizard's
 * Test step, before the sign-in is on, so the lookup carries it: while the link is good the server names the school
 * whatever its sign-in's state, and a link that was used or has expired is refused (sso-state).
 */
const schools = new Map<string, Promise<School | null>>();
export function schoolInfo(slug: string, token?: string | null): Promise<School | null> {
  const key = token ? `${slug} ${token}` : slug;
  if (!schools.has(key)) {
    schools.set(key, send<School & { orgId: string }>(`/school?slug=${encodeURIComponent(slug)}${token ? `&try=${encodeURIComponent(token)}` : ""}`, { method: "GET" })
      .then((s) => (typeof s?.name === "string" && typeof s.host === "string" ? { orgId: s.orgId, slug, name: s.name.slice(0, 120), host: s.host, logo: s.logo ?? null, endSession: s.endSession ?? null } : null),
        (e: unknown) => { schools.delete(key); if (codeOf(e) === "sso-no-school") return null; throw e; }));
  }
  return schools.get(key)!;
}

/** What came back from the provider: a ticket to finish, a refusal, or a return this page holds no record for. */
export type SsoReturn =
  | { ticket: string; record: SsoRecord }
  | { error: string; detail: string; record: SsoRecord | null }
  | { lost: true; mode: SsoMode | null };
let held: SsoReturn | null = null, heldHash = "";
const here = () => { try { return location.pathname; } catch { return ""; } };

/**
 * The return this page was opened with, once per page. sso.ts took it out of the address before the router started
 * (stashReturn) and keeps it for the page it came back to: the screen there takes it here, where its record is checked
 * (same flow, not expired) and spent. Later calls (StrictMode's second mount, the screen re-rendering) get the same
 * answer until `releaseReturn()`.
 *
 * `hash` (the router's location.hash): a return the router itself still shows, which a page load never leaves there
 * (only a fragment typed onto an open page, or a test's router, does). It is read the same way, and leaves the address
 * first; callers navigate with `replace` so the router forgets it too.
 */
export function takeReturn(hash = ""): SsoReturn | null {
  let from: string;
  // The same fragment again (a second mount before the router forgot it) is the answer already worked out.
  if (RETURN.test(hash) && hash !== heldHash) {
    heldHash = from = hash;
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch { /* not a browser */ }
  } else from = takeStash(here());
  if (!from) return held;
  const f = new URLSearchParams(from.slice(1));
  const ticket = f.get("sso"), error = f.get("sso_error"), flow = f.get("f") ?? "";
  const rec = readRecord();
  const mine = rec && rec.flow === flow && Date.now() - rec.at < MAX_AGE ? rec : null;
  if (mine) store.drop();
  // The provider's code, only as the server writes it (sso.ts providerCode: letters and underscores) and only for a
  // flow this browser started: a link someone else made shows no words of theirs.
  const d = f.get("d") ?? "";
  held = error ? { error, detail: mine && /^[a-z_]{1,40}$/.test(d) ? d : "", record: mine }
    : ticket && mine ? { ticket, record: mine }
    : { lost: true, mode: rec?.mode ?? null };
  return held;
}
/** The return was dealt with. Its fragment stays known, so a screen still holding the old address can't take it again. */
export const releaseReturn = () => { held = null; };
/** Whether this page has a return to deal with: one waiting for this address, one being dealt with, or one in `hash`. */
export const hasReturn = (hash = "") => (RETURN.test(hash) && hash !== heldHash) || held !== null || returnedTo(here());
