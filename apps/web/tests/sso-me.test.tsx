// Me's "School sign-in" (auth/SchoolLink.tsx; TECHNICAL.md "School sign-in"): connecting an account's own login to its
// school's sign-in (a recent sign-in first, the provider, then a page that asks before anything is connected),
// connected since … with Disconnect, and "Add an email login" for an account only the school's sign-in opens.
// Firebase and the server are fakes.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, type Location } from "react-router-dom";
import { webcrypto } from "node:crypto";

const h = vi.hoisted(() => ({
  auth: { user: null as unknown, profile: null as unknown, orgId: "org1" as string | null, sso: null as string | null },
  orgSso: { on: true, slug: "nile-ab12" } as unknown,
  call: vi.fn(),
  assign: vi.fn(),
  calls: [] as { url: string; body?: Record<string, unknown>; auth?: string | null }[],
  finish: [] as unknown[],
  fb: {
    reauthenticateWithCredential: vi.fn(async () => ({})), reauthenticateWithPopup: vi.fn(async () => ({})),
    verifyBeforeUpdateEmail: vi.fn(async () => {}), linkWithCredential: vi.fn(async () => ({})),
  },
  loc: null as unknown as Location,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "b" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, auth: {} }), call: (name: string) => (data: unknown) => h.call(name, data), storedSession: async () => null }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => h.auth }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...p: string[]) => p.join("/"), getDoc: async () => ({ get: (f: string) => (f === "sso" ? h.orgSso : undefined) }) }));
vi.mock("firebase/auth", () => ({
  ...h.fb,
  EmailAuthProvider: { credential: (email: string, pw: string) => ({ email, pw }) },
  GoogleAuthProvider: class {},
}));

const { I18nProvider } = await import("../src/i18n");
const { SchoolLink } = await import("../src/auth/SchoolLink");

function Where() { h.loc = useLocation(); return null; }
const ui = (lang = "en", at = "/me") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><Where /><SchoolLink /></MemoryRouter></I18nProvider>);
const user = (patch: Record<string, unknown> = {}) => ({
  uid: "u1", email: "amina@gmail.com", providerData: [{ providerId: "password" }],
  getIdTokenResult: async () => ({ authTime: new Date(Date.now() - 60_000).toUTCString(), token: "id-token" }),
  getIdToken: async () => "id-token", reload: async () => {}, ...patch,
});

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  h.auth = { user: user(), profile: { uid: "u1", name: "Amina", role: "teacher", orgId: "org1" }, orgId: "org1", sso: null };
  h.orgSso = { on: true, slug: "nile-ab12" };
  h.call.mockReset(); h.assign.mockReset(); h.calls = []; h.finish = [];
  Object.values(h.fb).forEach((f) => f.mockClear());
  vi.stubGlobal("location", { ...window.location, pathname: "/me", search: "", hash: "", assign: h.assign });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    h.calls.push({ url, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const answer = url === "/api/sso/start" ? { url: "https://login.nile.edu/authorize?x", flow: "link0001" } : h.finish.shift() ?? {};
    return { ok: true, status: 200, json: async () => answer } as Response;
  }));
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

it("connects with a recent sign-in: the provider, with the account's ID token", async () => {
  ui();
  fireEvent.click(await screen.findByRole("button", { name: "Connect school sign-in" }));
  await waitFor(() => expect(h.assign).toHaveBeenCalledWith("https://login.nile.edu/authorize?x"));
  const start = h.calls.find((c) => c.url === "/api/sso/start")!;
  expect(start.auth).toBe("Bearer id-token");
  expect(start.body).toMatchObject({ orgId: "org1", mode: "link" });
  expect(JSON.parse(localStorage.getItem("darsi:sso")!)).toMatchObject({ mode: "link", next: "/me" });
});

it("an older sign-in confirms it is them first (the password again), then connects", async () => {
  h.auth.user = user({ getIdTokenResult: async (fresh?: boolean) => ({ authTime: new Date(fresh ? Date.now() : Date.now() - 60 * 60_000).toUTCString(), token: "id-token" }) });
  ui();
  fireEvent.click(await screen.findByRole("button", { name: "Connect school sign-in" }));
  expect(await screen.findByText("To connect, first confirm it’s you.")).toBeTruthy();
  expect(h.calls).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Your Darsi password"), { target: { value: "pw-123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and connect" }));
  await waitFor(() => expect(h.assign).toHaveBeenCalled());
  expect(h.fb.reauthenticateWithCredential).toHaveBeenCalledWith(expect.anything(), { email: "amina@gmail.com", pw: "pw-123456" });
});

it("a Google account confirms with Google", async () => {
  h.auth.user = user({ providerData: [{ providerId: "google.com" }], getIdTokenResult: async (fresh?: boolean) => ({ authTime: new Date(fresh ? Date.now() : 0).toUTCString(), token: "id-token" }) });
  ui();
  fireEvent.click(await screen.findByRole("button", { name: "Connect school sign-in" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm with Google" }));
  await waitFor(() => expect(h.fb.reauthenticateWithPopup).toHaveBeenCalled());
  await waitFor(() => expect(h.assign).toHaveBeenCalled());
});

it("coming back, it asks before connecting, then connects", async () => {
  localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "v".repeat(43), flow: "link0001", mode: "link", next: "/me", at: Date.now() }));
  h.finish = [{ confirm: { name: "Amina B", email: "amina@nile.edu", school: "Nile School" } }, { linked: true, email: "amina@nile.edu" }];
  ui("en", "/me#sso=LT1&f=link0001");
  const ask = await screen.findByText(/to this Darsi account\?/);
  expect(ask.textContent!.replace(/[⁦-⁩]/g, "")).toBe("Connect amina@nile.edu to this Darsi account?");
  // Said plainly before anything is connected: what the school's sign-in can then do with this account.
  expect(screen.getByText("While connected, whoever runs your school’s sign-in can open this account and change how you sign in to it. Connect only if you trust your school with it. You can disconnect at any time.")).toBeTruthy();
  await waitFor(() => expect(h.loc.hash).toBe("")); // the router forgets it in a transition, a moment after the words show
  const first = h.calls.find((c) => c.url === "/api/sso/finish")!;
  expect(first).toMatchObject({ auth: "Bearer id-token", body: { ticket: "LT1", verifier: "v".repeat(43) } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByText(/Connected as/)).toBeTruthy();
  expect(h.calls.filter((c) => c.url === "/api/sso/finish")[1].body).toEqual({ ticket: "LT1", verifier: "v".repeat(43), confirm: true });
});

it("in Arabic too", async () => {
  localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "v".repeat(43), flow: "link0002", mode: "link", next: "/me", at: Date.now() }));
  h.finish = [{ confirm: { name: "Amina", email: "amina@nile.edu", school: "Nile School" } }];
  ui("ar", "/me#sso=LT2&f=link0002");
  expect(await screen.findByText(/بحسابك هذا في «درسي»؟/)).toBeTruthy();
  expect(screen.getByText("ما دام الربط قائمًا، يستطيع مَن يدير تسجيل الدخول في مدرستك فتح هذا الحساب وتغيير طريقة تسجيل دخولك إليه. لا تربطه إلا إذا كنت تثق بمدرستك في ذلك. يمكنك إلغاء الربط في أي وقت.")).toBeTruthy();
});

it("a refused link says why", async () => {
  localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "v".repeat(43), flow: "link0003", mode: "link", next: "/me", at: Date.now() }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "sso-linked" }) }) as Response));
  ui("en", "/me#sso=LT3&f=link0003");
  expect(await screen.findByText(/already connected to another Darsi account/)).toBeTruthy();
});

it("connected since …, and Disconnect asked first", async () => {
  h.auth.profile = { uid: "u1", name: "Amina", role: "teacher", orgId: "org1", ssoLinkedAt: Date.UTC(2026, 9, 1) };
  h.call.mockResolvedValue({ unlinked: 1 });
  ui();
  expect(await screen.findByText(/Connected to your school’s sign-in since/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(screen.getByText("Disconnect your school sign-in?")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0]);
  await waitFor(() => expect(h.call).toHaveBeenCalledWith("manageSso", { action: "unlink", orgId: "org1", uid: "u1" }));
  expect(await screen.findByText(/Disconnected\./)).toBeTruthy();
});

describe("a Disconnect that fails", () => {
  const disconnect = async (error: unknown, lang = "en") => {
    h.auth.profile = { uid: "u1", name: "Amina", role: "teacher", orgId: "org1", ssoLinkedAt: Date.UTC(2026, 9, 1) };
    h.call.mockRejectedValue(error);
    ui(lang);
    const name = lang === "ar" ? "إلغاء الربط" : "Disconnect";
    fireEvent.click(await screen.findByRole("button", { name }));
    fireEvent.click(screen.getAllByRole("button", { name })[0]);
    await waitFor(() => expect(h.call).toHaveBeenCalled());
  };
  const notSignIn = () => expect(screen.queryByText(/Signing in through your school didn’t work|لم ينجح تسجيل الدخول عبر مدرستك/)).toBeNull();

  it("school sign-in's own refusal (sso-…) is said in its own words", async () => {
    await disconnect(Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason: "sso-last-way-in" } }));
    expect(await screen.findByText(/That would leave the organization with no admin who can sign in without the school/)).toBeTruthy();
    // Still asked, so it can be tried again or cancelled.
    expect(screen.getByText("Disconnect your school sign-in?")).toBeTruthy();
  });

  it("an account that may not is told so, not that signing in through the school didn't work", async () => {
    await disconnect(Object.assign(new Error("Missing or insufficient permissions."), { code: "functions/permission-denied", details: { reason: "not-member" } }));
    expect(await screen.findByText("Your account isn’t allowed to do this right now. Sign out, sign in again, then try once more.")).toBeTruthy();
    notSignIn();
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
  });

  it("a session that ended (unauthenticated) is told the same, in Arabic too", async () => {
    await disconnect(Object.assign(new Error("unauthenticated"), { code: "functions/unauthenticated" }), "ar");
    expect(await screen.findByText("لا يُسمح لحسابك بذلك الآن. سجّل الخروج، ثم سجّل الدخول مرة أخرى وحاول من جديد.")).toBeTruthy();
    notSignIn();
  });

  it.each([
    ["the service can't be reached", { code: "functions/unavailable" }, true],
    ["the phone is offline", { code: "functions/internal" }, false],
  ])("the connection is named when %s", async (_what, error, online) => {
    const before = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
    try {
      await disconnect(Object.assign(new Error("internal"), error));
      expect(await screen.findByText("No connection. Try again when you’re online.")).toBeTruthy();
      notSignIn();
    } finally { if (before) Object.defineProperty(navigator, "onLine", before); else delete (navigator as { onLine?: boolean }).onLine; }
  });

  it("anything else: that didn't work, try again", async () => {
    await disconnect(Object.assign(new Error("internal"), { code: "functions/internal" }));
    expect(await screen.findByText("That didn’t work. Try again.")).toBeTruthy();
    notSignIn();
    expect(screen.queryByText(/No connection/)).toBeNull();
  });

  it("names each kind of failure (unlinkProblem)", async () => {
    const { unlinkProblem } = await import("../src/auth/SchoolLink");
    expect(unlinkProblem({ code: "functions/permission-denied", details: { reason: "sso-own-login" } })).toEqual({ sso: "sso-own-login" });
    expect(unlinkProblem({ code: "functions/invalid-argument", details: { reason: "no-org" } })).toEqual({ key: "ss.me.fail" });
    expect(unlinkProblem({ code: "functions/deadline-exceeded" })).toEqual({ key: "ss.rf.network" });
    expect(unlinkProblem(new Error("boom"))).toEqual({ key: "ss.me.fail" });
    expect(unlinkProblem(null)).toEqual({ key: "ss.me.fail" });
  });
});

it("an account the school made adds an email login: the address by link, then a password", async () => {
  const u = user({ email: null, providerData: [] });
  h.auth = { user: u, profile: { uid: "u1", name: "Amina", role: "student", orgId: "org1", sso: true, createdBy: "sso", ssoEmail: "amina@nile.edu" }, orgId: "org1", sso: "org1" };
  const { rerender } = ui();
  expect(await screen.findByText("Add an email login")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Step 1 of 2: your email address"), { target: { value: "amina@gmail.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
  expect(await screen.findByText(/We sent a link to/)).toBeTruthy();
  expect(h.fb.verifyBeforeUpdateEmail).toHaveBeenCalledWith(u, "amina@gmail.com");
  // Not opened yet: said so.
  fireEvent.click(screen.getByRole("button", { name: "I opened the link" }));
  expect(await screen.findByText(/isn’t confirmed yet/)).toBeTruthy();
  // Opened: the address is on the account, and the password step follows.
  (u as { email: string | null }).email = "amina@gmail.com";
  fireEvent.click(screen.getByRole("button", { name: "I opened the link" }));
  fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "longpassword" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "longpassword" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(h.fb.linkWithCredential).toHaveBeenCalledWith(u, { email: "amina@gmail.com", pw: "longpassword" }));
  rerender(<I18nProvider lang="en"><MemoryRouter><SchoolLink /></MemoryRouter></I18nProvider>);
});

it("nothing for a member whose organization has no school sign-in", async () => {
  // Another organization: the row reads each organization once per page.
  h.orgSso = undefined;
  h.auth = { ...h.auth, orgId: "org2", profile: { uid: "u1", name: "Amina", role: "teacher", orgId: "org2" } };
  const { container } = ui();
  await new Promise((r) => setTimeout(r, 20));
  expect(container.textContent).toBe("");
});

it("a personal account opened by the school's sign-in is told where its own login matters", async () => {
  h.auth = { ...h.auth, sso: "org1", profile: { uid: "u1", name: "Amina", role: "teacher", orgId: "org1", ssoLinkedAt: 1 } };
  ui();
  expect(await screen.findByText(/To change your password or email, or to delete your account, sign in with your own login\./)).toBeTruthy();
});
