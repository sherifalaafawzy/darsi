/**
 * School sign-in, the part startup code needs (TECHNICAL.md "School sign-in"; the server is functions/src/sso.ts):
 * the small flags an ended or signed-out school session leaves for the sign-in screen, and the return from the
 * school's provider, which is taken out of the address here, before the router starts (stashReturn), with the detour
 * of a student's test. Everything else (the PKCE pair, start and finish, what the return means, the school lookup) is
 * auth/ssoFlow.ts, which only the lazy school chunks load: the sign-in screen stays as small as it was for everyone
 * who never meets a school button.
 */

/**
 * The school chunks (auth/SchoolFinder.tsx for the sign-in screen, auth/SchoolLink.tsx for Me's "School sign-in"), as
 * App registers them (setSchoolChunks). The sign-in screens and Me are lazy chunks, and an import() of a school chunk
 * made from one of them, or from this module that startup shares with them, made the bundler split content/load, fb and
 * the rest out of the startup file (10 startup files instead of 6, measured): their only import() is in App. Not
 * registered (a test that renders a screen alone): the loaders refuse, as when a chunk can't load (offline).
 */
type Chunks = { finder: () => Promise<typeof import("./SchoolFinder")>; link: () => Promise<typeof import("./SchoolLink")> };
let chunks: Chunks | null = null;
export const setSchoolChunks = (c: Chunks) => { chunks = c; };
const unregistered = () => Promise.reject(new Error("school chunks not registered"));
export const loadSchoolFinder: Chunks["finder"] = () => (chunks ? chunks.finder() : unregistered());
export const loadSchoolLink: Chunks["link"] = () => (chunks ? chunks.link() : unregistered());

export type SsoMode = "signin" | "link" | "test";
/** The school as the sign-in screen names it: from /api/sso/school, the site's entry, or remembered here. */
export interface School { orgId?: string; slug: string; name: string; host: string; logo?: string | null; endSession?: string | null }
/** What this page keeps for the trip to the provider (localStorage "darsi:sso"; one flow at a time, one use). */
export interface SsoRecord { verifier: string; flow: string; mode: SsoMode; next: string; at: number; school?: School; token?: string }

export const RECORD = "darsi:sso";
export const readRecord = (): SsoRecord | null => {
  try { const r = JSON.parse(localStorage.getItem(RECORD) ?? "null") as SsoRecord | null; return r && typeof r.verifier === "string" && typeof r.flow === "string" ? r : null; } catch { return null; }
};
/** The fragment the callback puts on its return: `#sso=<ticket>&f=<flow>` or `#sso_error=<code>&f=<flow>`. */
export const RETURN = /(?:^#|&)(?:sso|sso_error)=/;

/** A small flag in localStorage. */
const flag = (key: string) => ({
  get: () => { try { return localStorage.getItem(key) === "1"; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* private mode */ } },
});
/**
 * Someone signed out of a school session on this device (a shared computer): the next school sign-in here asks the
 * provider for a fresh login (start's signedOutHere) rather than letting the last person's provider session in.
 */
export const signedOutHere = flag("darsi:ssoSignedOut");

/** The school this device last signed in through: where an ended school session goes back to, and its end-session page. */
export const lastSchool = {
  get(): (School & { orgId: string }) | null {
    try { const s = JSON.parse(localStorage.getItem("darsi:ssoSchool") ?? "null") as School | null; return s && typeof s.slug === "string" && typeof s.orgId === "string" ? s as School & { orgId: string } : null; } catch { return null; }
  },
  set(s: School & { orgId: string }) { try { localStorage.setItem("darsi:ssoSchool", JSON.stringify(s)); } catch { /* private mode */ } },
};
/** Where a school session of `orgId` goes when it ends: its school's sign-in, or the plain one (never the guest home). */
export const schoolSignIn = (orgId: string) => { const s = lastSchool.get(); return s?.orgId === orgId ? `/signin?school=${encodeURIComponent(s.slug)}` : "/signin"; };

/**
 * sessionStorage notes the sign-in screen says once after the page restarts: "again" (the school session ended: "Your
 * school asks you to sign in again"), "out" (signed out of a school session: still signed in at the provider).
 */
export const ssoNote = {
  take(): "again" | "out" | null { try { const v = sessionStorage.getItem("darsi:ssoNote"); sessionStorage.removeItem("darsi:ssoNote"); return v === "again" || v === "out" ? v : null; } catch { return null; } },
  set(v: "again" | "out") { try { sessionStorage.setItem("darsi:ssoNote", v); } catch { /* private mode */ } },
};

/** The page a student's test shows its result on: for anyone, signed in or not (App.tsx routes it). */
const TEST_PAGE = "/sso-test";
/** The return this page was opened with (its fragment, and the page it is for), kept here only: never in the address, the history or storage. */
let returned: { path: string; hash: string } | null = null;
/**
 * Before the router starts (this module runs it as it loads, and App imports the module before it renders anything):
 * a return in the address (`#sso=<ticket>&f=<flow>` or `#sso_error=…`) is kept in memory and taken out of the address
 * and the history entry, so no screen, link (a tab's href), reload, bookmark or Back ever carries the ticket. The
 * screen of the page it came back to takes it from here (ssoFlow.takeReturn reads it).
 *
 * A student's test (a test link: /signin?school=…&try=…) comes back to /signin (or, from an older server, to /admin,
 * a page a signed-out student can't open): it moves to TEST_PAGE, which finishes it without an account and shows the
 * result, whoever is or isn't signed in. Only with this browser's own record of a test link with the same flow.
 */
export function stashReturn() {
  try {
    const { hash, pathname } = location;
    if (!RETURN.test(hash)) return;
    const r = readRecord();
    const path = r?.mode === "test" && r.token && r.flow === new URLSearchParams(hash.slice(1)).get("f") ? TEST_PAGE : pathname;
    history.replaceState(history.state, "", path === pathname ? pathname + location.search : path);
    returned = { path, hash };
  } catch { /* not a browser */ }
}
/** Whether this page was opened with a return for `path` that no screen has taken yet. */
export const returnedTo = (path: string) => returned?.path === path;
/** The fragment of the return for `path`, once ("" when there is none): the stash is empty afterwards. */
export function takeStash(path: string): string {
  if (!returnedTo(path)) return "";
  const { hash } = returned!;
  returned = null;
  return hash;
}
stashReturn();
