// School sign-in on the sign-in screen (auth/AuthScreens.tsx, auth/sso.ts, auth/SchoolFinder.tsx; TECHNICAL.md
// "School sign-in"): the school's button on /signin?school=<slug> and on an organization's own address, the start
// (a PKCE pair, the record kept for the return, then the provider), the way back (the fragment taken out of the
// address before the router starts, finish, then the custom token through the lazy SDK), every refusal said with what
// to do, a return from another tab (with the way to start again under it), the school finder on darsiai.org, a
// student's test link and the card its return shows, and Forgot password beside a school button.
// The server is a fake fetch; Firebase is mocked. The sign-in screen loads the school chunk only when its page has
// something of a school's to show (the start, the return and the words are in it, not in the startup bundle).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router-dom";
import { webcrypto } from "node:crypto";

const h = vi.hoisted(() => ({
  site: null as null | { orgId: string; name: string; logo: null; darsi: boolean; sso?: { slug: string; host: string } },
  ssoOn: true,
  ensureFirebase: vi.fn(async () => {}),
  signInWithCustomToken: vi.fn(async () => ({})),
  assign: vi.fn(),
  calls: [] as { url: string; body?: Record<string, unknown>; auth?: string | null }[],
  answer: (_url: string, _body?: Record<string, unknown>): { status: number; body: unknown } => ({ status: 404, body: { error: "sso-no-school" } }),
  loc: null as unknown as Location,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "b" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ auth: {}, db: {} }), call: () => async () => ({}), storedSession: async () => null }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: h.signInWithCustomToken }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ ensureFirebase: h.ensureFirebase, configured: true }), createLearnerProfile: vi.fn() }));
vi.mock("../src/state/site", () => ({ useSite: () => ({ ready: true, site: h.site }) }));
vi.mock("../src/content/settings", () => ({ useSsoOn: () => ({ on: h.ssoOn, apply: vi.fn() }) }));
vi.mock("../src/legal/published", () => ({ LEGAL_DOCS: ["privacy", "terms"], publishedVersions: () => null, useLegal: () => ({ privacy: null, terms: null }) }));
vi.mock("../src/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../src/state/store", () => ({ useStore: () => ({ state: {}, dispatch: vi.fn() }) }));

const { I18nProvider } = await import("../src/i18n");
const { SignIn, Forgot } = await import("../src/auth/AuthScreens");
const { SchoolTestDone, readSchools } = await import("../src/auth/SchoolFinder");
const sso = await import("../src/auth/sso");
// App registers the school chunks at startup (auth/sso.ts setSchoolChunks); this test renders the screens without App.
sso.setSchoolChunks({ finder: () => import("../src/auth/SchoolFinder"), link: () => import("../src/auth/SchoolLink") });
const flow = await import("../src/auth/ssoFlow");
/** The page's own location, before any test stands in for it. */
const realLocation = window.location;
/** A name as a screen reader reads it: names reach t() wrapped in invisible isolates, which the match leaves out. */
const named = (text: string) => (name: string) => name.replace(/[⁦-⁩]/g, "") === text;

function Where() { h.loc = useLocation(); return null; }
const ui = (at: string, lang = "en") => render(
  <I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><Where /><Routes>
    <Route path="/signin" element={<SignIn />} /><Route path="/forgot" element={<Forgot />} /><Route path="/sso-test" element={<SchoolTestDone />} />
  </Routes></MemoryRouter></I18nProvider>);
const SCHOOL = { orgId: "org1", slug: "nile-ab12", name: "Nile School", logo: null, host: "login.nile.edu", listed: true, endSession: "https://login.nile.edu/logout" };
const record = (patch: Record<string, unknown> = {}) => localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "v".repeat(43), flow: "abcd1234", mode: "signin", next: "/signin", at: Date.now(), school: { ...SCHOOL }, ...patch }));

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  h.site = null; h.ssoOn = true; h.calls = []; h.assign.mockReset(); h.signInWithCustomToken.mockClear(); h.ensureFirebase.mockClear();
  h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 404, body: { error: "sso-no-school" } });
  vi.stubGlobal("location", { ...window.location, pathname: "/signin", search: "", hash: "", hostname: "darsiai.org", assign: h.assign });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    h.calls.push({ url, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const a = h.answer(url, body);
    return { ok: a.status < 400, status: a.status, json: async () => a.body } as Response;
  }));
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("the flow's pieces (auth/sso.ts)", () => {
  it("makes a 43-character verifier and its S256 challenge", async () => {
    const v = flow.newVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // RFC 7636's own example: this verifier has exactly this challenge.
    expect(await flow.challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("reads a return once: the fragment leaves the address first, and the record is spent", () => {
    window.history.replaceState(null, "", "/signin#sso=T1&f=abcd1234");
    record();
    const r = flow.takeReturn("#sso=T1&f=abcd1234");
    expect(r).toEqual({ ticket: "T1", record: expect.objectContaining({ flow: "abcd1234", mode: "signin" }) });
    expect(window.location.hash).toBe("");
    expect(localStorage.getItem("darsi:sso")).toBeNull();
    flow.releaseReturn();
    // The same fragment again (a screen still holding the old address) takes nothing.
    expect(flow.takeReturn("#sso=T1&f=abcd1234")).toBeNull();
  });
  it("a return for another flow, or an expired record, is lost and spends nothing", () => {
    record({ flow: "zzzz9999" });
    expect(flow.takeReturn("#sso=T2&f=abcd1234")).toEqual({ lost: true, mode: "signin" });
    flow.releaseReturn();
    expect(localStorage.getItem("darsi:sso")).not.toBeNull();
    record({ at: Date.now() - 70 * 60_000 });
    expect(flow.takeReturn("#sso=T3&f=abcd1234")).toEqual({ lost: true, mode: "signin" });
    flow.releaseReturn();
  });
  // /signin#sso_error=sso-provider&d=<any words> used to print those words inside the real page's error notice.
  it("a refusal keeps the provider's code only in the server's own shape, and only for a flow this browser started", () => {
    record();
    expect(flow.takeReturn("#sso_error=sso-provider&f=abcd1234&d=access_denied")).toEqual({ error: "sso-provider", detail: "access_denied", record: expect.objectContaining({ flow: "abcd1234" }) });
    flow.releaseReturn();
    // This browser's own flow, but not a code the server writes (sso.ts providerCode: letters and underscores).
    record();
    expect(flow.takeReturn("#sso_error=sso-provider&f=abcd1234&d=Call%20%2B20%20100%20555")).toEqual({ error: "sso-provider", detail: "", record: expect.objectContaining({ flow: "abcd1234" }) });
    flow.releaseReturn();
    record();
    expect(flow.takeReturn(`#sso_error=sso-provider&f=abcd1234&d=${"a".repeat(41)}`)).toEqual(expect.objectContaining({ detail: "" }));
    flow.releaseReturn();
    // A link someone else made: no record here, or one for another flow. The refusal's sentence, none of their words.
    expect(flow.takeReturn("#sso_error=sso-provider&f=abcd1235&d=access_denied")).toEqual({ error: "sso-provider", detail: "", record: null });
    flow.releaseReturn();
    record({ flow: "zzzz9999" });
    expect(flow.takeReturn("#sso_error=sso-provider&f=abcd1236&d=access_denied")).toEqual({ error: "sso-provider", detail: "", record: null });
    flow.releaseReturn();
  });
  it("an organization's site entry keeps its school sign-in only in the published shape", async () => {
    const { siteFor } = await import("../src/content/sites");
    const entry = (sso: unknown) => siteFor({ sites: { "learn.nile.edu": { orgId: "org1", name: "Nile", logo: null, darsi: true, sso } } }, "learn.nile.edu");
    expect(entry({ slug: "nile-ab12", host: "login.nile.edu" })?.sso).toEqual({ slug: "nile-ab12", host: "login.nile.edu" });
    expect(entry({ slug: "nile-ab12", host: "127.0.0.1:4797" })?.sso).toEqual({ slug: "nile-ab12", host: "127.0.0.1:4797" }); // the local stand-in
    expect(entry({ slug: "Nile School", host: "login.nile.edu" })?.sso).toBeUndefined();
    expect(entry({ slug: "nile-ab12", host: "https://evil.example/x" })?.sso).toBeUndefined();
    expect(entry(undefined)).toEqual({ orgId: "org1", name: "Nile", logo: null, darsi: true });
  });
  it("keeps only the finder's entries in their published shape", () => {
    expect(readSchools({ schools: [
      { slug: "nile-ab12", name: " Nile School ", host: "login.nile.edu", logo: "data:image/png;base64,AAAA" },
      { slug: "Bad Slug", name: "X", host: "a.b" }, { slug: "ok-1", name: "", host: "a.b" }, { slug: "ok-2", name: "Y", host: "javascript:alert(1)" },
      { slug: "ok-3", name: "Z", host: "z.example", logo: "https://evil.example/x.png" },
    ] })).toEqual([{ slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", logo: "data:image/png;base64,AAAA" }, { slug: "ok-3", name: "Z", host: "z.example", logo: null }]);
    expect(readSchools(null)).toEqual([]);
  });
});

// What auth/sso.ts does as it loads, before the router reads the address (stashReturn; these call it as the module does).
describe("a return leaves the address before the router starts", () => {
  beforeEach(() => vi.stubGlobal("location", realLocation));
  afterEach(() => { sso.takeStash(window.location.pathname); flow.releaseReturn(); window.history.replaceState(null, "", "/"); });
  const href = () => window.location.pathname + window.location.search + window.location.hash;

  it("the ticket is kept in memory only: the address, its history entry and storage never hold it afterwards", () => {
    window.history.replaceState({ idx: 3 }, "", "/signin?school=nile-ab12#sso=SECRET-TICKET&f=abcd1234");
    const entries = window.history.length;
    record();
    sso.stashReturn();
    expect(href()).toBe("/signin?school=nile-ab12");
    expect(window.history.length).toBe(entries); // replaced, not pushed: Back never returns to the ticket
    expect(window.history.state).toEqual({ idx: 3 });
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain("SECRET-TICKET");
    // Kept for the page it came back to, and handed over once.
    expect(sso.returnedTo("/signin")).toBe(true);
    expect(sso.returnedTo("/me")).toBe(false);
    expect(flow.hasReturn()).toBe(true);
    expect(flow.takeReturn()).toEqual({ ticket: "SECRET-TICKET", record: expect.objectContaining({ flow: "abcd1234", mode: "signin" }) });
    expect(sso.returnedTo("/signin")).toBe(false);
    expect(localStorage.getItem("darsi:sso")).toBeNull();
    // A second mount gets the same answer; once dealt with, nothing.
    expect(flow.takeReturn()).toEqual(expect.objectContaining({ ticket: "SECRET-TICKET" }));
    flow.releaseReturn();
    expect(flow.takeReturn()).toBeNull();
    expect(flow.hasReturn()).toBe(false);
  });

  it("a refusal's code and the provider's own are kept the same way", () => {
    window.history.replaceState(null, "", "/me#sso_error=sso-provider&f=abcd1234&d=access_denied");
    record({ mode: "link" });
    sso.stashReturn();
    expect(href()).toBe("/me");
    expect(flow.takeReturn()).toEqual({ error: "sso-provider", detail: "access_denied", record: expect.objectContaining({ mode: "link" }) });
  });

  it("only the page it came back to takes it: another page's screen gets nothing", () => {
    window.history.replaceState(null, "", "/admin?tab=signin#sso=T6&f=abcd1234");
    record({ mode: "test" });
    sso.stashReturn();
    expect(href()).toBe("/admin?tab=signin"); // an admin's own test stays on its tab
    window.history.replaceState(null, "", "/me");
    expect(flow.hasReturn()).toBe(false);
    expect(flow.takeReturn()).toBeNull();
    window.history.replaceState(null, "", "/admin?tab=signin");
    expect(flow.takeReturn()).toEqual({ ticket: "T6", record: expect.objectContaining({ mode: "test" }) });
  });

  it.each(["/signin", "/admin?tab=signin"])("a student's test (a test link) that comes back to %s moves to its own page", (at) => {
    window.history.replaceState(null, "", `${at}#sso=T4&f=abcd1234`);
    record({ mode: "test", token: "t".repeat(32) });
    sso.stashReturn();
    expect(href()).toBe("/sso-test");
    expect(sso.returnedTo("/sso-test")).toBe(true);
    expect(flow.takeReturn()).toEqual({ ticket: "T4", record: expect.objectContaining({ mode: "test", token: "t".repeat(32) }) });
  });

  it("a test return for another flow, or with no record here, stays where it landed (the sign-in page says it is lost)", () => {
    window.history.replaceState(null, "", "/signin#sso=T7&f=abcd1234");
    record({ mode: "test", token: "t".repeat(32), flow: "zzzz9999" });
    sso.stashReturn();
    expect(href()).toBe("/signin");
    expect(flow.takeReturn()).toEqual({ lost: true, mode: "test" });
  });

  it("an address without a return is left alone", () => {
    window.history.replaceState(null, "", "/me#certificates");
    sso.stashReturn();
    expect(href()).toBe("/me#certificates");
    expect(sso.returnedTo("/me")).toBe(false);
  });
});

describe("the school's button", () => {
  it("/signin?school=<slug>: one lookup, the button, where the person continues, then the start", async () => {
    h.answer = (url) => url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL }
      : url === "/api/sso/start" ? { status: 200, body: { url: "https://login.nile.edu/authorize?state=s", flow: "abcd1234" } } : { status: 404, body: {} };
    ui("/signin?school=nile-ab12");
    const button = await screen.findByRole("button", { name: named("Sign in with Nile School") });
    expect(screen.getByText(/You’ll continue at/).textContent).toContain("login.nile.edu");
    expect(h.calls.filter((c) => c.url.startsWith("/api/sso/school"))).toHaveLength(1);
    // The password form stays, below it, as the other way in: "or" stands between the two.
    expect(screen.getByLabelText("Email or username")).toBeTruthy();
    const or = screen.getByText("or", { selector: ".auth-or" });
    expect(button.compareDocumentPosition(or) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(or.compareDocumentPosition(screen.getByLabelText("Email or username")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith("https://login.nile.edu/authorize?state=s"));
    const start = h.calls.find((c) => c.url === "/api/sso/start")!;
    expect(start.body).toMatchObject({ orgId: "org1", mode: "signin" });
    expect(start.body!.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(start.body!.signedOutHere).toBeUndefined();
    const kept = JSON.parse(localStorage.getItem("darsi:sso")!);
    expect(kept).toMatchObject({ flow: "abcd1234", mode: "signin", school: { slug: "nile-ab12", orgId: "org1" } });
    // The verifier stays here; only its challenge went out.
    expect(await flow.challengeOf(kept.verifier)).toBe(start.body!.challenge);
  });

  it("an organization's own address shows its button without a lookup, and no finder", async () => {
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    ui("/signin");
    expect(await screen.findByRole("button", { name: named("Sign in with Nile School") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in with your school" })).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("after signing out of a school session here, the next start asks the provider for a fresh login", async () => {
    h.answer = (url) => url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 200, body: { url: "https://login.nile.edu/a", flow: "abcd1234" } };
    sso.signedOutHere.set(true);
    ui("/signin?school=nile-ab12");
    fireEvent.click(await screen.findByRole("button", { name: named("Sign in with Nile School") }));
    await waitFor(() => expect(h.calls.find((c) => c.url === "/api/sso/start")?.body).toMatchObject({ signedOutHere: true }));
  });

  it("an unknown school, or the switch off: no button", async () => {
    h.answer = () => ({ status: 404, body: { error: "sso-no-school" } });
    ui("/signin?school=nobody-zz99");
    expect(await screen.findByText(/couldn’t find this school’s sign-in/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: named("Sign in with Nile School") })).toBeNull();
  });

  // "Check the link with your school" used to be a dead end here, though the finder exists for exactly that.
  it("a link naming a school Darsi doesn't know offers the school finder on darsiai.org, once the lookup has said so", async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    const asked = new Promise<{ status: number; body: unknown }>((r) => { answer = r; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      h.calls.push({ url });
      const a = url.startsWith("/api/sso/school") ? await asked : h.answer(url);
      return { ok: a.status < 400, status: a.status, json: async () => a.body } as Response;
    }));
    h.answer = (url) => url.includes("content%2Fsso.json") ? { status: 200, body: { v: 1, schools: [{ slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", logo: null }] } } : { status: 404, body: {} };
    const finder = () => screen.queryAllByRole("button", { name: "Sign in with your school" });
    ui("/signin?school=nobody-zz99");
    await waitFor(() => expect(h.calls.some((c) => c.url.startsWith("/api/sso/school"))).toBe(true));
    expect(finder()).toHaveLength(0); // the lookup is on its way: nothing flickers in
    await act(async () => { answer({ status: 404, body: { error: "sso-no-school" } }); });
    const sentence = await screen.findByText(/couldn’t find this school’s sign-in/);
    await waitFor(() => expect(finder()).toHaveLength(1));
    // Where the finder always is: below the usual ways in.
    expect(sentence.compareDocumentPosition(finder()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Email or username").compareDocumentPosition(finder()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Choosing a school there opens its sign-in: the button comes, and the finder and the old sentence go.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const a = url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : h.answer(url);
      return { ok: a.status < 400, status: a.status, json: async () => a.body } as Response;
    }));
    fireEvent.click(finder()[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Nile School/ }));
    expect(await screen.findByRole("button", { name: named("Sign in with Nile School") })).toBeTruthy();
    await waitFor(() => expect(finder()).toHaveLength(0));
    expect(screen.queryByText(/couldn’t find this school’s sign-in/)).toBeNull();
  });

  it("the finder stays away beside a known school's button, and when the lookup failed on the connection", async () => {
    const finder = () => screen.queryByRole("button", { name: "Sign in with your school" });
    const known = ui("/signin?school=nile-ab12");
    await screen.findByRole("button", { name: named("Sign in with Nile School") });
    await act(async () => {});
    expect(finder()).toBeNull();
    known.unmount();
    h.answer = () => ({ status: 503, body: {} });
    ui("/signin?school=other-cd34");
    expect(await screen.findByText("No connection. Try again when you’re online.")).toBeTruthy();
    await act(async () => {});
    expect(finder()).toBeNull();
  });

  it("on an organization's own address \"Sign in\" is the second choice from the first render, before the school's button has loaded", async () => {
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    ui("/signin");
    // Straight after the render: the chunk with the school's button hasn't arrived, and no button is the main one yet.
    expect(screen.queryByRole("button", { name: named("Sign in with Nile School") })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" }).classList.contains("dr-btn-secondary")).toBe(true);
    expect(document.querySelectorAll(".auth-card .dr-btn-primary")).toHaveLength(0);
    const school = await screen.findByRole("button", { name: named("Sign in with Nile School") });
    expect(school.classList.contains("dr-btn-primary")).toBe(true);
    expect(screen.getByRole("button", { name: "Sign in" }).classList.contains("dr-btn-secondary")).toBe(true);
    expect(document.querySelectorAll(".auth-card .dr-btn-primary")).toHaveLength(1);
  });

  it("a link there that names another school waits for the lookup, as on Darsi's own address", async () => {
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    h.answer = () => ({ status: 404, body: { error: "sso-no-school" } });
    ui("/signin?school=nobody-zz99");
    const signIn = () => screen.getByRole("button", { name: "Sign in" });
    expect(signIn().classList.contains("dr-btn-primary")).toBe(true);
    await screen.findByText(/couldn’t find this school’s sign-in/);
    expect(signIn().classList.contains("dr-btn-primary")).toBe(true);
    // An organization's own address never offers the finder (its own school's button is one tap away: /signin).
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Sign in with your school" })).toBeNull();
  });

  it("\"Sign in\" is the second choice only beside a school's button: an unknown school leaves it the main one", async () => {
    const signIn = () => screen.getByRole("button", { name: "Sign in" });
    const main = (b: HTMLElement) => b.classList.contains("dr-btn-primary") && !b.classList.contains("dr-btn-secondary");
    // A school Darsi doesn't know: its sentence, no school button, and "Sign in" stays the page's main button.
    h.answer = () => ({ status: 404, body: { error: "sso-no-school" } });
    const first = ui("/signin?school=nobody-zz99");
    expect(main(signIn())).toBe(true); // while the lookup is on its way too
    await screen.findByText(/couldn’t find this school’s sign-in/);
    expect(main(signIn())).toBe(true);
    expect(document.querySelectorAll(".auth-card .dr-btn-primary")).toHaveLength(1);
    first.unmount();
    // A school it knows: its button is the main one, and "Sign in" steps back.
    h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 404, body: {} });
    const second = ui("/signin?school=nile-ab12");
    const school = await screen.findByRole("button", { name: named("Sign in with Nile School") });
    expect(main(school)).toBe(true);
    await waitFor(() => expect(signIn().classList.contains("dr-btn-secondary")).toBe(true));
    expect(document.querySelectorAll(".auth-card .dr-btn-primary")).toHaveLength(1);
    second.unmount();
    // An organization's own address: the same, with no lookup. And a plain sign-in page keeps "Sign in" the main one.
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    const third = ui("/signin");
    await screen.findByRole("button", { name: named("Sign in with Nile School") });
    await waitFor(() => expect(signIn().classList.contains("dr-btn-secondary")).toBe(true));
    third.unmount();
    h.site = null;
    ui("/signin");
    expect(main(signIn())).toBe(true);
  });

  it("the platform switch off hides every school button and the finder", async () => {
    h.ssoOn = false;
    h.site = null;
    ui("/signin?school=nile-ab12");
    expect(screen.queryByRole("button", { name: /Sign in with/ })).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("a refused start says why, in Arabic too", async () => {
    h.answer = (url) => url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 429, body: { error: "sso-rate" } };
    ui("/signin?school=nile-ab12", "ar");
    fireEvent.click(await screen.findByRole("button", { name: named("تسجيل الدخول عبر Nile School") }));
    expect(await screen.findByText(/محاولات كثيرة من هنا/)).toBeTruthy();
    expect(h.assign).not.toHaveBeenCalled();
  });
});

describe("coming back from the school", () => {
  it("clears the fragment, finishes, and signs in with the custom token through the lazy SDK", async () => {
    window.history.replaceState(null, "", "/signin#sso=TICKET1&f=abcd1234");
    record();
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 200, body: { token: "custom-token" } } : { status: 404, body: {} });
    ui("/signin#sso=TICKET1&f=abcd1234");
    // Busy, said to screen readers, with the design system's spinner beside the words: not a note to read.
    const busy = screen.getByText("Signing you in…");
    expect(busy.getAttribute("role")).toBe("status");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector(".dr-spinner[aria-hidden='true']")).toBeTruthy();
    expect(busy.classList.contains("notice")).toBe(false);
    await waitFor(() => expect(h.signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "custom-token"));
    // The same once the school chunk has taken over the line (it was the sign-in screen's own while the chunk loaded).
    const still = screen.getByText("Signing you in…");
    expect(still.getAttribute("role")).toBe("status");
    expect(still.querySelector(".dr-spinner")).toBeTruthy();
    expect(h.calls.find((c) => c.url === "/api/sso/finish")!.body).toEqual({ ticket: "TICKET1", verifier: "v".repeat(43) });
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
    // Remembered for an ended session and for Sign out; the next start no longer forces a fresh login.
    expect(sso.lastSchool.get()).toMatchObject({ orgId: "org1", slug: "nile-ab12" });
    expect(sso.signedOutHere.get()).toBe(false);
  });

  it.each([
    ["sso-connect-first", "en", /Sign in the way you usually do, then open Me and choose Connect school sign-in/],
    ["sso-removed", "en", /Your school removed you from Darsi/],
    ["sso-domain", "en", /isn’t one your school lets into Darsi/],
    ["sso-full", "ar", /بلغت مدرستك عدد الأشخاص/],
  ])("a refusal (%s) is said with what to do", async (code, lang, words) => {
    record({ flow: `f-${code}`.slice(0, 8) });
    const hash = `#sso_error=${code}&f=${`f-${code}`.slice(0, 8)}`;
    ui(`/signin${hash}`, lang);
    expect(await screen.findByText(words)).toBeTruthy();
    expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeUndefined();
    await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
  });

  it("the provider's own code is shown beside its sentence", async () => {
    record({ flow: "prov0001" });
    ui("/signin#sso_error=sso-provider&f=prov0001&d=access_denied");
    expect(await screen.findByText(/didn’t let you through/)).toBeTruthy();
    expect(screen.getByText(/access_denied/)).toBeTruthy();
  });

  it("a link someone else made shows the refusal's sentence and none of the words in it", async () => {
    ui("/signin#sso_error=sso-provider&f=x&d=Call%20%2B20%20100%20555%200199");
    expect(await screen.findByText(/didn’t let you through/)).toBeTruthy();
    expect(screen.queryByText(/Code:/)).toBeNull();
    expect(screen.queryByText(/Call/)).toBeNull();
  });

  it("a refused finish says why and signs nobody in", async () => {
    record({ flow: "fin00001" });
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 403, body: { error: "sso-disabled" } } : { status: 404, body: {} });
    ui("/signin#sso=TICKET2&f=fin00001");
    expect(await screen.findByText(/blocked this sign-in/)).toBeTruthy();
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("a return that lands after the platform switched school sign-in off is still cleared and answered", async () => {
    h.ssoOn = false;
    record({ flow: "off00001" });
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 403, body: { error: "sso-off" } } : { status: 404, body: {} });
    ui("/signin#sso=TICKET4&f=off00001");
    expect(await screen.findByText(/switched off on Darsi for now/)).toBeTruthy();
    await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
    // Still no school button or finder while the switch is off.
    expect(screen.queryByRole("button", { name: /Sign in with/ })).toBeNull();
  });

  it("the return taken out of the address at startup signs in the same way, with nothing left in the router's address", async () => {
    vi.stubGlobal("location", realLocation);
    window.history.replaceState(null, "", "/signin#sso=TICKET5&f=abcd1234");
    record();
    sso.stashReturn(); // as auth/sso.ts does when it loads, before the router
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 200, body: { token: "custom-token-5" } } : { status: 404, body: {} });
    ui("/signin");
    expect(screen.getByText("Signing you in…")).toBeTruthy();
    await waitFor(() => expect(h.signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "custom-token-5"));
    expect(h.calls.find((c) => c.url === "/api/sso/finish")!.body).toEqual({ ticket: "TICKET5", verifier: "v".repeat(43) });
    expect(window.location.href).not.toContain("TICKET5");
    await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
    window.history.replaceState(null, "", "/");
  });

  it("a ticket this tab holds no record for: go back to the tab where you started; no ticket is spent", async () => {
    ui("/signin#sso=TICKET3&f=lost0001");
    expect(await screen.findByText(/Go back to the tab where you started/)).toBeTruthy();
    expect(h.calls).toHaveLength(0);
  });

  it("\"start again here\" has something to press on darsiai.org: the school finder, right under the sentence (and only once)", async () => {
    h.answer = (url) => url.includes("content%2Fsso.json") ? { status: 200, body: { v: 1, schools: [{ slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", logo: null }] } } : { status: 404, body: {} };
    ui("/signin#sso=TICKET6&f=lost0002");
    const sentence = await screen.findByText(/or start again here/);
    const finders = screen.getAllByRole("button", { name: "Sign in with your school" });
    expect(finders).toHaveLength(1);
    // Under the sentence and above the password form, not below everything else.
    expect(sentence.compareDocumentPosition(finders[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(finders[0].compareDocumentPosition(screen.getByLabelText("Email or username")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(finders[0]);
    expect(await screen.findByLabelText("School name")).toBeTruthy();
    expect(screen.getByText("Nile School")).toBeTruthy();
  });

  it("another tab's flow (a record for a different flow) is lost the same way, in Arabic too, and its record is left for that tab", async () => {
    record({ flow: "zzzz9999" });
    ui("/signin#sso=TICKET7&f=lost0003", "ar");
    expect(await screen.findByText(/ارجع إلى علامة التبويب التي بدأت منها، أو ابدأ من جديد هنا/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "تسجيل الدخول عبر مدرستك" })).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("darsi:sso")!)).toMatchObject({ flow: "zzzz9999" });
    expect(h.calls).toHaveLength(0);
  });

  it("on an organization's own address the lost sentence has the school's button under it, and no finder", async () => {
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    ui("/signin#sso=TICKET8&f=lost0004");
    const sentence = await screen.findByText(/or start again here/);
    const button = await screen.findByRole("button", { name: named("Sign in with Nile School") });
    expect(sentence.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(screen.getByLabelText("Email or username")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in with your school" })).toBeNull();
  });

  it("another refusal on darsiai.org keeps the finder where it always is, below the usual ways in", async () => {
    record({ flow: "dom00001" });
    ui("/signin#sso_error=sso-domain&f=dom00001");
    await screen.findByText(/isn’t one your school lets into Darsi/);
    const finders = screen.getAllByRole("button", { name: "Sign in with your school" });
    expect(finders).toHaveLength(1);
    expect(screen.getByLabelText("Email or username").compareDocumentPosition(finders[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("after an ended school session or a sign-out, the page says so once", async () => {
    sso.ssoNote.set("again");
    const { unmount } = ui("/signin");
    expect(await screen.findByText("Your school asks you to sign in again.")).toBeTruthy();
    unmount();
    sso.lastSchool.set({ orgId: "org1", slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", endSession: "https://login.nile.edu/logout" });
    sso.ssoNote.set("out");
    ui("/signin");
    expect((await screen.findByText(/You may still be signed in to/)).textContent).toContain("Nile School");
    expect(screen.getByRole("link", { name: /Sign out at/ }).getAttribute("href")).toBe("https://login.nile.edu/logout");
    expect(sessionStorage.getItem("darsi:ssoNote")).toBeNull();
  });
});

describe("the school finder on darsiai.org", () => {
  it("lists the approved schools, searches them, and opens the chosen school's sign-in", async () => {
    h.answer = (url) => url.includes("content%2Fsso.json") ? { status: 200, body: { v: 1, schools: [
      { slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", logo: null }, { slug: "delta-cd34", name: "مدرسة الدلتا", host: "delta.okta.com", logo: null },
    ] } } : url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 404, body: {} };
    ui("/signin");
    fireEvent.click(screen.getByRole("button", { name: "Sign in with your school" }));
    const search = await screen.findByLabelText("School name");
    expect(screen.getByText("Nile School")).toBeTruthy();
    fireEvent.change(search, { target: { value: "الدلتا" } });
    expect(screen.queryByText("Nile School")).toBeNull();
    fireEvent.change(search, { target: { value: "nile" } });
    fireEvent.click(screen.getByRole("button", { name: /Nile School/ }));
    await waitFor(() => expect(h.loc.search).toBe("?school=nile-ab12"));
    expect(await screen.findByRole("button", { name: named("Sign in with Nile School") })).toBeTruthy();
  });
});

describe("a student's test link", () => {
  it("/signin?school=…&try=…: only the test, which sends the link's token", async () => {
    h.answer = (url) => url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 200, body: { url: "https://login.nile.edu/t", flow: "abcd1234" } };
    ui(`/signin?school=nile-ab12&try=${"t".repeat(32)}`);
    expect(await screen.findByText("Test your school’s sign-in")).toBeTruthy();
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: named("Test with Nile School") }));
    expect(document.querySelector(".auth-or")).toBeNull(); // nothing follows the test's button
    await waitFor(() => expect(h.assign).toHaveBeenCalled());
    expect(h.calls.find((c) => c.url === "/api/sso/start")!.body).toMatchObject({ mode: "test", testToken: "t".repeat(32), orgId: "org1" });
    expect(JSON.parse(localStorage.getItem("darsi:sso")!)).toMatchObject({ mode: "test", token: "t".repeat(32) });
    // The lookup carries the link's token: the school's sign-in isn't on yet when its admin sends a student the link
    // (the wizard's Test step comes before Turn on), and only the link lets the server name the school meanwhile.
    expect(h.calls.filter((c) => c.url.startsWith("/api/sso/school")).map((c) => c.url)).toEqual([`/api/sso/school?slug=nile-ab12&try=${"t".repeat(32)}`]);
  });

  it("a link that was used or has expired says so, with no button to try again", async () => {
    h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 400, body: { error: "sso-state" } } : { status: 404, body: {} });
    const first = ui(`/signin?school=nile-ab12&try=${"u".repeat(32)}`);
    // Not "Start again", which a student holding a spent link can't do: only the admin can make a new one.
    expect((await screen.findByRole("alert")).textContent).toBe("This test link was already used or has expired. Ask your school’s Darsi admin for a new one.");
    expect(screen.queryByText(/Start again/)).toBeNull();
    expect(screen.queryByRole("button", { name: named("Test with Nile School") })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    first.unmount();
    ui(`/signin?school=nile-ab12&try=${"w".repeat(32)}`, "ar");
    expect((await screen.findByRole("alert")).textContent).toMatch(/^استُخدم رابط التجربة هذا من قبل أو انتهت صلاحيته\. اطلب رابطًا جديدًا من .+ «درسي» في مدرستك\.$/);
  });

  it("a link used after the page opened: the Test button says the same, not \"Start again\"", async () => {
    h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 400, body: { error: "sso-state" } });
    ui(`/signin?school=nile-ab12&try=${"s".repeat(32)}`);
    fireEvent.click(await screen.findByRole("button", { name: named("Test with Nile School") }));
    expect((await screen.findByRole("alert")).textContent).toBe("This test link was already used or has expired. Ask your school’s Darsi admin for a new one.");
    expect(screen.queryByText(/Start again/)).toBeNull();
    expect(h.assign).not.toHaveBeenCalled();
  });

  it("without a test link the same answer keeps the general sentence, from the lookup and from the start", async () => {
    h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 400, body: { error: "sso-state" } } : { status: 404, body: {} });
    const first = ui("/signin?school=gone-gh78");
    expect((await screen.findByRole("alert")).textContent).toBe("This sign-in expired or was already used. Start again.");
    first.unmount();
    h.answer = (url) => (url.startsWith("/api/sso/school") ? { status: 200, body: SCHOOL } : { status: 400, body: { error: "sso-state" } });
    ui("/signin?school=other-ef56");
    fireEvent.click(await screen.findByRole("button", { name: named("Sign in with Nile School") }));
    expect((await screen.findByRole("alert")).textContent).toBe("This sign-in expired or was already used. Start again.");
  });

  it("another refusal of a test link's lookup keeps its own sentence (the connection, a school Darsi doesn't know)", async () => {
    h.answer = () => ({ status: 503, body: {} });
    const first = ui(`/signin?school=nile-ab12&try=${"x".repeat(32)}`);
    expect((await screen.findByRole("alert")).textContent).toBe("No connection. Try again when you’re online.");
    first.unmount();
    h.answer = () => ({ status: 404, body: { error: "sso-no-school" } });
    ui(`/signin?school=nile-ab12&try=${"y".repeat(32)}`);
    expect((await screen.findByRole("alert")).textContent).toContain("couldn’t find this school’s sign-in");
  });

  const finished = (tested: string) => { h.answer = (url) => (url === "/api/sso/finish" ? { status: 200, body: { tested, ok: true } } : { status: 404, body: {} }); };

  it("/sso-test finishes it without an account and says what Darsi would do: join as a student", async () => {
    record({ mode: "test", token: "t".repeat(32), flow: "test0001" });
    finished("create-student");
    ui("/sso-test#sso=TICKET9&f=test0001");
    expect(await screen.findByText("The test worked: you would join as a student.")).toBeTruthy();
    expect(screen.getByText(/Nothing was created and you weren’t signed in\. Your school’s Darsi admin can see this result/)).toBeTruthy();
    const fin = h.calls.find((c) => c.url === "/api/sso/finish")!;
    expect(fin.auth).toBeNull();
    expect(fin.body).toEqual({ ticket: "TICKET9", verifier: "v".repeat(43) });
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("the return of a test link's flow at startup opens that page, whatever page the server sent it to", async () => {
    vi.stubGlobal("location", realLocation);
    window.history.replaceState(null, "", "/signin#sso=TICKET10&f=test0002");
    record({ mode: "test", token: "t".repeat(32), flow: "test0002" });
    sso.stashReturn();
    finished("create-teacher");
    ui(window.location.pathname);
    expect(await screen.findByText("The test worked: you would join as a teacher.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Testing your school’s sign-in" })).toBeTruthy();
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    expect(window.location.href).not.toContain("TICKET10");
    window.history.replaceState(null, "", "/");
  });

  it("a test return the sign-in screen itself meets shows the result card, never a sign-in", async () => {
    record({ mode: "test", token: "t".repeat(32), flow: "test0003" });
    finished("create-student");
    ui("/signin#sso=TICKET11&f=test0003");
    expect(await screen.findByText("The test worked: you would join as a student.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Test your school’s sign-in" })).toBeTruthy();
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    expect(screen.queryByText("Signing you in…")).toBeNull();
    expect(h.calls.filter((c) => c.url === "/api/sso/finish")).toHaveLength(1);
    expect(h.calls.find((c) => c.url === "/api/sso/finish")!.auth).toBeNull();
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
    await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
  });

  it.each([
    ["signin", "en", "The test worked: you would be signed in to your Darsi account."],
    ["link-org-made", "en", "The test worked: you would be signed in to your Darsi account."],
    ["create-student", "ar", "نجح الاختبار: عند تسجيل الدخول ستنضم بصفة طالب."],
    ["wait", "en", /The test reached Darsi, and your school’s Darsi admin can now see the result/],
  ])("the decision %s is said in words (%s)", async (tested, lang, words) => {
    record({ mode: "test", token: "t".repeat(32), flow: `d-${tested}`.slice(0, 8) });
    finished(tested);
    ui(`/sso-test#sso=TICKET12&f=${`d-${tested}`.slice(0, 8)}`, lang);
    expect(await screen.findByText(words)).toBeTruthy();
  });

  it("a test Darsi would refuse says the refusal's own sentence, and that the admin sees it", async () => {
    record({ mode: "test", token: "t".repeat(32), flow: "test0004" });
    finished("refuse:sso-domain");
    ui("/signin#sso=TICKET13&f=test0004");
    expect(await screen.findByText(/This account isn’t one your school lets into Darsi/)).toBeTruthy();
    expect(screen.getByText(/signing in wouldn’t let you in yet/)).toBeTruthy();
    expect(screen.queryByText(/The test worked/)).toBeNull();
    expect(screen.getByText(/Your school’s Darsi admin can see this result/)).toBeTruthy();
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("a test return this browser has no record for reached nobody: it says so, and not that the admin can see why", async () => {
    ui("/sso-test#sso=TICKET15&f=test0007");
    expect(await screen.findByText(/This sign-in started in another tab or browser/)).toBeTruthy();
    expect(screen.queryByText(/Your school’s Darsi admin can see/)).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("a test the provider refused, or whose finish failed, says why", async () => {
    record({ mode: "test", token: "t".repeat(32), flow: "test0005" });
    const { unmount } = ui("/signin#sso_error=sso-provider&f=test0005&d=access_denied");
    expect(await screen.findByText(/didn’t let you through/)).toBeTruthy();
    expect(screen.getByText(/access_denied/)).toBeTruthy();
    // True whether the callback recorded the refusal for the admin or finish failed before anything reached them.
    expect(screen.getByText("The test didn’t work. Your school’s Darsi admin may be able to see why; tell them what this page says.")).toBeTruthy();
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeUndefined();
    unmount();
    // The link was already used (a second flow from the same link): finish refuses.
    record({ mode: "test", token: "t".repeat(32), flow: "test0006" });
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 400, body: { error: "sso-state" } } : { status: 404, body: {} });
    ui("/sso-test#sso=TICKET14&f=test0006");
    expect(await screen.findByText(/This sign-in expired or was already used/)).toBeTruthy();
  });
});

// The app's word for an admin is «مشرف» (i18n role.orgAdmin, admin/strings/ar.json; the wizard's own words are checked
// in sso-setup.test.tsx): a student read «مسؤول «درسي» في مدرستك» here and «مشرف» in Me for the same person.
it("Arabic calls an admin «مشرف» on these screens and in the app's own strings, never «مسؤول»", async () => {
  const off = (words: Record<string, string>) => Object.entries(words).filter(([, v]) => v.includes("مسؤول")).map(([key]) => key);
  expect(off((await import("../src/auth/sso-strings/ar.json")).default)).toEqual([]);
  expect(off((await import("../src/i18n/ar.json")).default)).toEqual([]);
});

it("Forgot password beside a school button says to use the school's button", async () => {
  ui("/forgot?school=nile-ab12");
  expect(screen.getByText(/Use your school’s button on the sign-in page instead/)).toBeTruthy();
  await act(async () => {});
});

// The chunk was fetched on this browser a moment before it left for the provider, so this needs a cache miss and a
// dropped connection (or a return that lands in another browser): rare, but it was a dead end.
// The sign-in screen keeps the chunk once it has loaded, so each case starts from fresh modules (the mocks above stay).
describe("a school chunk that can't load", () => {
  /** Fresh screens whose finder chunk fails `fails` times (the first try and the one the screen makes by itself), then loads. */
  const fresh = async (fails: number) => {
    vi.resetModules();
    const i18n = await import("../src/i18n");
    const screens = await import("../src/auth/AuthScreens");
    const sso2 = await import("../src/auth/sso"); // loading it stashes a return that is in the address, as at startup
    const finder = vi.fn(() => (finder.mock.calls.length <= fails ? Promise.reject(new Error("Failed to fetch dynamically imported module")) : import("../src/auth/SchoolFinder")));
    sso2.setSchoolChunks({ finder, link: () => import("../src/auth/SchoolLink") });
    const show = () => render(<i18n.I18nProvider lang="en"><MemoryRouter initialEntries={["/signin"]}><Routes><Route path="/signin" element={<screens.SignIn />} /></Routes></MemoryRouter></i18n.I18nProvider>);
    return { sso2, finder, show };
  };
  const comeBack = (ticket: string) => {
    vi.stubGlobal("location", realLocation);
    window.history.replaceState(null, "", `/signin#sso=${ticket}&f=abcd1234`);
    record();
    h.answer = (url) => (url === "/api/sso/finish" ? { status: 200, body: { token: `token-${ticket}` } } : { status: 404, body: {} });
  };
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("a return offers Retry while the ticket is still held, and Retry finishes the sign-in", async () => {
    comeBack("TICKET8");
    const { sso2, finder, show } = await fresh(2);
    show();
    expect((await screen.findByRole("alert")).textContent).toBe("No connection. Try again when you are online.");
    expect(screen.queryByText("Signing you in…")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeTruthy();
    await waitFor(() => expect(finder).toHaveBeenCalledTimes(2)); // the retry's second load can land a tick later under load
    expect(sso2.returnedTo("/signin")).toBe(true); // nothing took the return: it waits for the chunk
    expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(h.signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "token-TICKET8"));
    expect(finder).toHaveBeenCalledTimes(3);
    expect(h.calls.find((c) => c.url === "/api/sso/finish")!.body).toEqual({ ticket: "TICKET8", verifier: "v".repeat(43) });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.location.href).not.toContain("TICKET8");
  });

  it("or a way back to the plain sign-in form", async () => {
    comeBack("TICKET9");
    const { show } = await fresh(Infinity);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Back to sign in" }));
    expect(screen.getByLabelText("Email or username")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeUndefined();
  });

  it("on an organization's own address \"Sign in\" is the main button again when the school's button can't load", async () => {
    h.site = { orgId: "org1", name: "Nile School", logo: null, darsi: true, sso: { slug: "nile-ab12", host: "login.nile.edu" } };
    const { finder, show } = await fresh(Infinity);
    show();
    const signIn = () => screen.getByRole("button", { name: "Sign in" });
    expect(signIn().classList.contains("dr-btn-secondary")).toBe(true); // the school's button is expected
    await waitFor(() => expect(finder).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(signIn().classList.contains("dr-btn-primary")).toBe(true));
    expect(signIn().classList.contains("dr-btn-secondary")).toBe(false);
    expect(screen.queryByRole("button", { name: /Sign in with/ })).toBeNull();
  });

  it("the finder's button asks for the chunk again on a second tap", async () => {
    h.answer = (url) => (url.includes("content%2Fsso.json") ? { status: 200, body: { v: 1, schools: [{ slug: "nile-ab12", name: "Nile School", host: "login.nile.edu", logo: null }] } } : { status: 404, body: {} });
    const { finder, show } = await fresh(2);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with your school" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No connection. Try again when you are online.");
    expect(finder).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with your school" }));
    expect(await screen.findByLabelText("School name")).toBeTruthy();
    expect(finder).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
