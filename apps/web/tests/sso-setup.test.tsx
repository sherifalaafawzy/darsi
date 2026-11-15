// School sign-in for organization admins and platform admins (admin/SsoSetup.tsx; TECHNICAL.md "School sign-in"): the
// five-step wizard (provider, connect with the console's steps and Check connection, who can sign in, test, turn on),
// its drafts on the server, refusals at their fields and with discovery's hints, the test card, the student's link,
// the turn-on rules (a student's test for Google and Microsoft, the lock-out guard), the status card, a test coming
// back to the tab, editing a live connection, the platform's listing requests and switch. manageSso is a fake.
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, type Location } from "react-router-dom";
import { webcrypto } from "node:crypto";
import type { SsoConfig, SsoState } from "../src/auth/api";

const h = vi.hoisted(() => ({
  manage: vi.fn(),
  assign: vi.fn(),
  calls: [] as { url: string; body?: Record<string, unknown>; auth?: string | null }[],
  loc: null as unknown as Location,
  user: null as { uid: string; getIdToken: () => Promise<string> } | null,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "b" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({}), call: () => async () => ({}), storedSession: async () => null }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { manageSso: h.manage } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: h.user }) }));

const { I18nProvider } = await import("../src/i18n");
const { SsoSetup, SsoListings, SsoSwitch, fieldsOf, formOf, dayOk, EMPTY } = await import("../src/admin/SsoSetup");
const { default: arWords } = await import("../src/admin/sso-strings/ar.json");
const { hasReturn } = await import("../src/auth/ssoFlow");

function Where() { h.loc = useLocation(); return null; }
const ui = (node: React.ReactNode, lang = "en", at = "/admin?tab=signin") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><Where />{node}</MemoryRouter></I18nProvider>);
const refuse = (reason: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(reason), { code: "functions/failed-precondition", details: { reason, ...extra } });

const BASE: SsoState = {
  config: null, wip: null, health: null, connected: 0, lastSignIn: null, orgMadeToMatch: 3, ssoOnly: 0,
  callbackUrl: "https://login.darsiai.org/callback/org1", signinUrl: null, switchOn: true, ceiling: { value: null, default: 2000 }, keyOk: true,
};
const conn = (patch: Partial<SsoConfig> = {}): SsoConfig => ({
  preset: "google", tenant: null, domain: null, oktaServer: null, realm: null, issuer: "https://accounts.google.com", subjectKind: "sub",
  clientId: "abc.apps.googleusercontent.com", authMethod: "basic", scopes: ["openid", "email", "profile"], allowedDomains: ["nile.edu"], openToAll: false,
  emailsVerifiedBySchool: false, teacherRule: null, classClaim: null, maxSessionDays: 30, personalDevices: false, secretExpiresOn: null,
  endpoints: { authorization: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs" },
  issParam: false, pkce: "s256", connectionId: "c1", configRev: 2, hasSecret: true,
  status: "draft", testedRev: null, studentTestRev: null, slug: "nile-ab12", listing: { state: "none" }, next: null, lastTest: null, studentTestOk: false, host: "accounts.google.com",
  ...patch,
});
/** manageSso answers by action; `get` answers `state` (changed by the test as it goes). */
let state: SsoState;
const answers: Record<string, (a: Record<string, unknown>) => unknown> = {};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  state = { ...BASE };
  for (const k of Object.keys(answers)) delete answers[k];
  h.manage.mockReset(); h.assign.mockReset(); h.calls = [];
  h.user = { uid: "adm", getIdToken: async () => "id-token" };
  h.manage.mockImplementation(async (a: Record<string, unknown>) => {
    const f = answers[String(a.action)];
    if (f) return f(a);
    if (a.action === "get") return state;
    return {};
  });
  vi.stubGlobal("location", { ...window.location, pathname: "/admin", search: "?tab=signin", hash: "", assign: h.assign });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    h.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const ok = url === "/api/sso/start" ? { url: "https://accounts.google.com/o/oauth2/v2/auth?state=s", flow: "flow0001" } : { tested: "create-student", ok: true, promoted: false };
    return { ok: true, status: 200, json: async () => ok } as Response;
  }));
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
const actions = () => h.manage.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe("the form", () => {
  it("turns what was typed into what save checks, for each provider", () => {
    expect(fieldsOf({ ...EMPTY, preset: "microsoft", tenant: " 1B2C3D4E-0000-0000-0000-00000000ABCD ", clientId: " 11111111-2222-3333-4444-555555555555 ", teacherOn: true, tKind: "role", tValue: "Teacher" }))
      .toMatchObject({ preset: "microsoft", tenant: "1b2c3d4e-0000-0000-0000-00000000abcd", clientId: "11111111-2222-3333-4444-555555555555", teacherRule: { kind: "role", value: "Teacher" }, maxSessionDays: 30 });
    const g = fieldsOf({ ...EMPTY, preset: "google", clientId: "x.apps.googleusercontent.com", domains: "Nile.edu,  students.nile.edu", teacherOn: true, tDomains: "staff.nile.edu", tEmails: "a@nile.edu\nB@nile.edu", classClaim: "class" });
    expect(g).toMatchObject({ allowedDomains: ["nile.edu", "students.nile.edu"], teacherRule: { kind: "email", domains: ["staff.nile.edu"], emails: ["a@nile.edu", "b@nile.edu"] }, classClaim: null });
    expect(g).not.toHaveProperty("tenant");
    // "Everyone may join" only counts with no domains, and only when chosen.
    expect(fieldsOf({ ...EMPTY, preset: "oidc", issuer: "https://id.nile.edu", clientId: "c", openToAll: true, domains: "nile.edu" }).openToAll).toBe(false);
    expect(fieldsOf({ ...EMPTY, preset: "oidc", issuer: "https://id.nile.edu", clientId: "c", openToAll: true }).openToAll).toBe(true);
    // A saved connection comes back as the form.
    expect(formOf(conn({ teacherRule: { kind: "email", domains: ["staff.nile.edu"], emails: ["a@nile.edu"] } }))).toMatchObject({ preset: "google", domains: "nile.edu", teacherOn: true, tDomains: "staff.nile.edu", tEmails: "a@nile.edu" });
  });
});

describe("the wizard", () => {
  it("walks a new organization from the provider to the test, keeping drafts and the secret write-only", async () => {
    answers.discover = () => ({ ok: true, issuer: "https://login.microsoftonline.com/1b2c3d4e-0000-0000-0000-00000000abcd/v2.0", host: "login.microsoftonline.com", pkce: "s256", issParam: true, authMethods: ["basic", "post"], endSession: true });
    answers.save = (a) => {
      if (a.partial) return { saved: "partial" };
      state = { ...state, signinUrl: "https://darsiai.org/signin?school=nile-ab12", config: conn({ preset: "microsoft", tenant: "1b2c3d4e-0000-0000-0000-00000000abcd", issuer: "https://login.microsoftonline.com/1b2c3d4e-0000-0000-0000-00000000abcd/v2.0", clientId: "11111111-2222-3333-4444-555555555555", allowedDomains: [], host: "login.microsoftonline.com", configRev: 1 }) };
      return { saved: "draft", configRev: 1, hasSecret: true, issuer: "x", host: "login.microsoftonline.com" };
    };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Which service do your school accounts use?")).toBeTruthy();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Choose a provider first.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Microsoft Entra ID/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Connect Darsi to Microsoft Entra ID")).toBeTruthy();
    expect(actions()).toContainEqual({ action: "save", orgId: "org1", partial: true, config: { form: expect.objectContaining({ preset: "microsoft" }), step: 2 } });
    // The console's own steps, with the redirect URI to copy exactly.
    expect(screen.getByText(/App registrations/)).toBeTruthy();
    expect(screen.getAllByText("https://login.darsiai.org/callback/org1").length).toBeGreaterThan(0);
    // Microsoft's secret lifetime is prefilled (six months).
    expect((screen.getByLabelText("The secret expires on (optional)") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Fill in “Directory (tenant) ID”.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Directory (tenant) ID"), { target: { value: "1B2C3D4E-0000-0000-0000-00000000ABCD" } });
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "11111111-2222-3333-4444-555555555555" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Type the client secret.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Client secret (its Value, not its Secret ID)"), { target: { value: "s3cr3t~value" } });
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    expect(await screen.findByText(/It supports PKCE\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Who can sign in", { selector: "h4" })).toBeTruthy();
    // The secret was never part of a draft.
    expect(JSON.stringify(actions().filter((a) => a.partial))).not.toContain("s3cr3t");
    fireEvent.click(screen.getByRole("switch", { name: /Some people join as teachers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(await screen.findByText("Test before anyone uses it")).toBeTruthy();
    const save = actions().find((a) => a.action === "save" && !a.partial)!;
    expect(save).toMatchObject({ orgId: "org1", secret: "s3cr3t~value", config: { preset: "microsoft", tenant: "1b2c3d4e-0000-0000-0000-00000000abcd", teacherRule: { kind: "role", value: "Teacher" }, allowedDomains: [] } });
    expect(screen.getByRole("button", { name: "Test with my account" })).toBeTruthy();
    // The save replaced the wizard with one for the saved revision (the Save button went with the old one): the new
    // one says it was saved and puts the focus on its step, never leaving a keyboard on <body> with nothing said.
    const head = screen.getByText("Test before anyone uses it");
    expect(head.tagName).toBe("H4");
    // (The focus moves in an effect, which can run a moment after the heading is on the page.)
    await waitFor(() => expect(document.activeElement).toBe(head));
    const SAVED = "Saved. You can come back to this later.";
    expect(screen.getAllByRole("status").filter((s) => s.textContent === SAVED)).toHaveLength(1);
    // Said once: moving on clears it, and coming back does not say it again.
    fireEvent.click(screen.getByRole("button", { name: "Step 3 of 5: People" }));
    expect(screen.queryByText(SAVED)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step 4 of 5: Test" }));
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  // Save pressed on a connection that did not change: the server keeps everything (same revision), so the page is not
  // read into a new wizard. It moves on to the test by itself instead of leaving the admin on step 3.
  it("saving a connection that did not change goes on to the test", async () => {
    state = { ...state, config: conn() };
    answers.save = (a) => (a.partial ? { saved: "partial" } : { saved: "unchanged", configRev: 2, hasSecret: true });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save and test" }));
    expect(await screen.findByText("Test before anyone uses it")).toBeTruthy();
    expect(screen.getByText("Saved. You can come back to this later.")).toBeTruthy();
  });

  // The saved draft is Google's; the admin goes back and chooses Keycloak. Step 3 judged the provider by the saved
  // issuer: no "everyone may join" and no "emails checked by the school" switch, and Google's refusal for no domain.
  it("step 3 follows the provider chosen now, not the saved draft's", async () => {
    state = { ...state, config: conn(), signinUrl: "https://darsiai.org/signin?school=nile-ab12" };
    answers.save = (a) => (a.partial ? { saved: "partial" } : { saved: "draft", hasSecret: true });
    answers.discover = () => ({ ok: true, issuer: "https://kc.nile.edu/realms/school", host: "kc.nile.edu", pkce: "s256", issParam: false, authMethods: ["basic"], endSession: false });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 1 of 5: Provider" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Keycloak/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Connect Darsi to Keycloak")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "kc.nile.edu" } });
    fireEvent.change(screen.getByLabelText("Realm"), { target: { value: "school" } });
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "darsi" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Who can sign in", { selector: "h4" })).toBeTruthy();
    expect(actions().some((a) => a.action === "discover")).toBe(true);
    // Another provider's own choices are on the page.
    expect(screen.getByRole("switch", { name: /Everyone my provider signs in may join/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /My provider’s email addresses are checked by the school/ })).toBeTruthy();
    // No domain and nobody let in: refused in the generic words, not Google's.
    const domains = screen.getByLabelText("Allowed email domains") as HTMLInputElement;
    expect(domains.value).toBe("nile.edu");
    fireEvent.change(domains, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(screen.getByText("Give at least one domain, or choose that everyone your provider signs in may join.")).toBeTruthy();
    expect(screen.queryByText(/Required for Google/)).toBeNull();
    expect(actions().filter((a) => a.action === "save" && !a.partial)).toHaveLength(0);
  });

  // Editing a live connection with no copy yet: the provider is judged by the live connection's issuer (an "Other"
  // pointed at Microsoft Entra is Microsoft, as the server judges it), not by the preset alone.
  it("editing a live connection, step 3 judges the provider by the live issuer", async () => {
    const entra = "https://login.microsoftonline.com/1b2c3d4e-0000-0000-0000-00000000abcd/v2.0";
    state = { ...state, config: conn({ preset: "oidc", issuer: entra, host: "login.microsoftonline.com", allowedDomains: [], status: "on", testedRev: 2 }) };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Step 3 of 4: People" }));
    expect(screen.getByText("Who can sign in", { selector: "h4" })).toBeTruthy();
    // Microsoft's tenant is the limit: no "everyone may join" switch, and no domain is no refusal.
    expect(screen.queryByRole("switch", { name: /Everyone my provider signs in may join/ })).toBeNull();
  });

  // A draft kept by Next and opened again on step 3 has no Check connection on this page, and its address is not the
  // saved connection's any more: an "Other" is judged by the address as typed, as the server judges it (another Entra
  // tenant is still Microsoft: no "everyone may join"; a school's own host is any provider).
  it("a draft reopened on step 3 judges an “Other” by the address typed", async () => {
    const entra = (tenant: string) => `https://login.microsoftonline.com/${tenant}/v2.0`;
    const saved = conn({ preset: "oidc", issuer: entra("1b2c3d4e-0000-0000-0000-00000000abcd"), host: "login.microsoftonline.com", allowedDomains: [] });
    const typed = (issuer: string) => ({ config: { form: { ...formOf(saved), issuer }, step: 3 }, at: 1, by: "adm" });
    state = { ...state, config: saved, wip: typed(` ${entra("9f8e7d6c-0000-0000-0000-00000000dcba")} `) };
    const first = ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Who can sign in", { selector: "h4" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Everyone my provider signs in may join/ })).toBeNull();
    expect(actions().some((a) => a.action === "discover")).toBe(false);
    first.unmount();
    state = { ...state, wip: typed("https://id.nile.edu") };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Who can sign in", { selector: "h4" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Everyone my provider signs in may join/ })).toBeTruthy();
  });

  it("speaks Arabic, right to left in its words", async () => {
    ui(<SsoSetup orgId="org1" />, "ar");
    expect(await screen.findByText("ما الخدمة التي تستخدمها حسابات مدرستك؟")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "خطوات الإعداد" })).toBeTruthy();
    expect(screen.getByText("تسجيل الدخول عبر المدرسة", { selector: "h3" })).toBeTruthy();
  });

  it("Check connection says what is wrong, with both strings when the issuer differs", async () => {
    state = { ...state, wip: { config: { form: { ...EMPTY, preset: "oidc", issuer: "https://id.nile.edu", clientId: "c" }, step: 2 }, at: 1, by: "adm" } };
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "discover") throw refuse("sso-discovery", { hint: "issuer-mismatch", got: "https://id.nile.edu/", want: "https://id.nile.edu" });
      return {};
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check connection" }));
    const said = await screen.findByText(/The provider calls itself/);
    expect(said.textContent).toContain("https://id.nile.edu/");
    expect(said.textContent).toContain("Darsi couldn’t check this provider.");
  });

  it("a field the server refuses opens its step, marked", async () => {
    state = { ...state, config: conn({ hasSecret: true }), signinUrl: "https://darsiai.org/signin?school=nile-ab12" };
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "save" && !a.partial) throw refuse("sso-fields", { field: "clientId" });
      return {};
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(await screen.findByText("Check “Client ID”.")).toBeTruthy();
    expect(screen.getByText("Connect Darsi to Google Workspace")).toBeTruthy();
  });

  // The server takes a day from 2020 to three years ahead (functions/src/ssoCore.ts validDay). Its field's label is
  // not an "sa.f.<field>" key, so the refusal used to read: Check “secretExpiresOn”.
  const BAD_DAY = "Choose a date no more than three years from now, or leave it empty.";
  it("an expiry date the server refuses is said in words at its field, never as the field's id", async () => {
    state = { ...state, config: conn({ hasSecret: true }), signinUrl: "https://darsiai.org/signin?school=nile-ab12" };
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "save" && !a.partial) throw refuse("sso-fields", { field: "secretExpiresOn" });
      return {};
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(await screen.findByText(BAD_DAY)).toBeTruthy();
    expect(screen.queryByText(/secretExpiresOn/)).toBeNull();
    // On its own step, at the field.
    expect(screen.getByText("Connect Darsi to Google Workspace")).toBeTruthy();
    expect(screen.getByLabelText("The secret expires on (optional)").getAttribute("aria-invalid")).toBe("true");
  });

  it("an expiry date too far ahead is caught before anything is sent", async () => {
    state = { ...state, config: conn({ hasSecret: true }), signinUrl: "https://darsiai.org/signin?school=nile-ab12" };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 2 of 5: Connect" }));
    const day = screen.getByLabelText("The secret expires on (optional)") as HTMLInputElement;
    fireEvent.change(day, { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(BAD_DAY)).toBeTruthy();
    expect(day.getAttribute("aria-invalid")).toBe("true");
    await new Promise((r) => setTimeout(r, 0));
    expect(actions().filter((a) => a.action === "save")).toHaveLength(0);
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
    // Check connection doesn't use the date (as it doesn't the secret or the client ID): it still runs, and says so.
    answers.discover = () => ({ ok: true, issuer: "https://accounts.google.com", host: "accounts.google.com", pkce: "s256", issParam: false, authMethods: ["basic"], endSession: false });
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    expect(await screen.findByText(/It supports PKCE\./)).toBeTruthy();
    expect(actions().filter((a) => a.action === "save")).toHaveLength(0);
    // The same days the server takes: a real calendar day, from 2020 to three years from now.
    const now = Date.UTC(2026, 10, 11);
    expect(dayOk("2027-05-01", now)).toBe(true);
    expect(dayOk("2029-11-11", now)).toBe(true);
    for (const bad of ["2099-01-01", "2030-01-01", "2019-12-31", "2027-02-31", "2027-13-01", "1/5/2027", ""]) expect(dayOk(bad, now), bad).toBe(false);
  });

  it("asks whether connected people are the same people when the client changes", async () => {
    state = { ...state, config: conn() };
    let n = 0;
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "save" && !a.partial && n++ === 0) throw refuse("sso-migrate", { connected: 12, issuerChanged: false });
      return { saved: "draft", hasSecret: true };
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(await screen.findByText("12 people are connected to this sign-in")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /The same people/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save with this choice" }));
    await waitFor(() => expect(actions().filter((a) => a.action === "save" && !a.partial).at(-1)).toMatchObject({ migration: "same" }));
  });

  it("counts one connected person as one person", async () => {
    state = { ...state, config: conn() };
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "save" && !a.partial) throw refuse("sso-migrate", { connected: 1, issuerChanged: false });
      return {};
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    expect(await screen.findByText("1 person is connected to this sign-in")).toBeTruthy();
    expect(screen.queryByText(/1 people/)).toBeNull();
  });

  it("asks before a link takes away what was typed and not kept; the page's own tabs are not leaving", async () => {
    answers.save = () => ({ saved: "partial" });
    ui(<>
      <Link to="/admin/people/p1">Elsewhere</Link>
      <div role="tablist"><Link to="/admin?tab=people">People</Link></div>
      <SsoSetup orgId="org1" />
    </>);
    await screen.findByText("Which service do your school accounts use?");
    // A provider chosen and not kept yet: only on this page.
    fireEvent.click(screen.getByRole("radio", { name: /Microsoft Entra ID/ }));
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(h.loc.pathname).toBe("/admin");
    fireEvent.click(within(ask).getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Next keeps it on the server: nothing to lose, so a link goes where it leads.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Connect Darsi to Microsoft Entra ID");
    await act(async () => {}); // the guard lets go in an effect, after the step is on the page
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.loc.pathname).toBe("/admin/people/p1");
    // The secret is never kept as typed. Another tab of the page keeps the panel (and the secret) behind it: no question.
    fireEvent.change(screen.getByLabelText("Client secret (its Value, not its Secret ID)"), { target: { value: "s3cr3t~value" } });
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.loc.pathname + h.loc.search).toBe("/admin?tab=people");
    // A link out of the page would lose it: asked, and "Leave anyway" goes.
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(h.loc.pathname).toBe("/admin");
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave anyway" }));
    expect(h.loc.pathname).toBe("/admin/people/p1");
  });
});

describe("the test", () => {
  it("shows what Darsi would do and which claims arrived; a student's link; the admin's own test", async () => {
    state = { ...state, config: conn({ status: "draft", lastTest: { at: Date.UTC(2026, 10, 11, 9), ok: true, by: "adm", asStudent: false, decision: "create-student", rev: 2, claimsSeen: ["email", "email_verified", "name", "hd"], ruleValues: [], email: "amina@nile.edu", name: "Amina", emailVerified: true, teacher: null, cls: null } }) };
    answers.testLink = () => ({ token: "t".repeat(32), url: `https://darsiai.org/signin?school=nile-ab12&try=${"t".repeat(32)}`, expiresAt: Date.now() + 86_400_000 });
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText(/Darsi would: create a new student account for them\./)).toBeTruthy();
    const claims = screen.getByRole("list", { name: "What the provider sent" });
    expect(within(claims).getByText("hd").closest("li")!.textContent).toContain("Sent");
    expect(within(claims).getByText("hd").closest("li")!.textContent).toContain("the Google Workspace domain check");
    fireEvent.click(screen.getByRole("button", { name: "Test as a student" }));
    expect(await screen.findByText(`https://darsiai.org/signin?school=nile-ab12&try=${"t".repeat(32)}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Test with my account" }));
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=s"));
    const start = h.calls.find((c) => c.url === "/api/sso/start")!;
    expect(start.auth).toBe("Bearer id-token");
    expect(start.body).toMatchObject({ orgId: "org1", mode: "test" });
  });

  // The stepper reaches Test without saving. The admin's own test leaves the page: with typed fields the browser asks
  // "Leave site?", and on Stay the button would wait for good; on Leave the fields are gone and the saved settings are
  // what gets tested. So it waits for a save, and the step says why.
  it("the admin's own test waits while an earlier step has fields that were changed and not saved", async () => {
    state = { ...state, config: conn() };
    answers.save = () => { state = { ...state, config: conn({ configRev: 3, allowedDomains: ["nile.edu", "staff.nile.edu"] }) }; return { saved: "draft", configRev: 3, hasSecret: true }; };
    ui(<SsoSetup orgId="org1" />);
    const mine = () => screen.getByRole("button", { name: "Test with my account" }) as HTMLButtonElement;
    const UNSAVED = "You changed settings on an earlier step and haven't saved them. Save them first: the test uses what is saved.";
    // A saved connection opens on Test, with nothing typed: the test can start.
    await screen.findByText("Test before anyone uses it");
    expect(mine().disabled).toBe(false);
    expect(screen.queryByText(UNSAVED)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.change(screen.getByLabelText("Allowed email domains"), { target: { value: "nile.edu, staff.nile.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Step 4 of 5: Test" }));
    expect(screen.getByText(UNSAVED).getAttribute("role")).toBe("status");
    expect(mine().disabled).toBe(true);
    fireEvent.click(mine());
    await act(async () => {});
    expect(h.calls.some((c) => c.url === "/api/sso/start")).toBe(false);
    expect(h.assign).not.toHaveBeenCalled();
    // A student's link leaves no page: it is still there.
    expect((screen.getByRole("button", { name: "Test as a student" }) as HTMLButtonElement).disabled).toBe(false);
    // Saved on its own step: the test is back, and the notice is gone.
    fireEvent.click(screen.getByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    await waitFor(() => expect(actions().some((a) => a.action === "save" && !a.partial)).toBe(true));
    await screen.findByText("Test before anyone uses it");
    await waitFor(() => expect(mine().disabled).toBe(false));
    expect(screen.queryByText(UNSAVED)).toBeNull();
    fireEvent.click(mine());
    await waitFor(() => expect(h.assign).toHaveBeenCalledTimes(1));
  });

  it("a replacement secret typed and not saved holds the admin's own test too, and says so in Arabic", async () => {
    state = { ...state, config: conn() };
    ui(<SsoSetup orgId="org1" />, "ar");
    await screen.findByText((arWords as Record<string, string>)["sa.t.intro"]);
    const stepBtn = (n: number) => within(screen.getByRole("navigation", { name: "خطوات الإعداد" })).getAllByRole("button")[n - 1];
    fireEvent.click(stepBtn(2));
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "n3w~secret" } });
    fireEvent.click(stepBtn(4));
    expect(screen.getByRole("status").textContent).toBe((arWords as Record<string, string>)["sa.t.unsaved"]);
    expect((screen.getByRole("button", { name: (arWords as Record<string, string>)["sa.t.mine"] }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Nothing typed in the wizard, but another form of the page has edits not saved (the organization's name on the Look
  // tab, kept behind its tab): the browser asks "Leave site?" as the test leaves. On Stay the page goes on, and the
  // button must not wait for good with the student's test disabled beside it.
  it("the admin's own test stops waiting when the browser asked 'Leave site?' for another form and the admin stayed", async () => {
    state = { ...state, config: conn() };
    const otherForm = (e: Event) => e.preventDefault();
    let asks = false;
    // The browser's part: before leaving it asks the page, and here the admin answers Stay (the page is still there).
    h.assign.mockImplementation(() => { window.dispatchEvent(new Event("beforeunload", { cancelable: true })); });
    try {
      ui(<SsoSetup orgId="org1" />);
      await screen.findByText("Test before anyone uses it");
      const mine = () => screen.getByRole("button", { name: "Test with my account" });
      const student = () => screen.getByRole("button", { name: "Test as a student" }) as HTMLButtonElement;
      // No form asks: the page is leaving, and the button goes on waiting.
      fireEvent.click(mine());
      await waitFor(() => expect(h.assign).toHaveBeenCalledTimes(1));
      await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
      expect(mine().getAttribute("aria-busy")).toBe("true");
      expect(student().disabled).toBe(true);
      cleanup();
      // Another form's guard asks, and the admin stays: both tests can be started again.
      window.addEventListener("beforeunload", otherForm); asks = true;
      ui(<SsoSetup orgId="org1" />);
      await screen.findByText("Test before anyone uses it");
      fireEvent.click(mine());
      await waitFor(() => expect(h.assign).toHaveBeenCalledTimes(2));
      expect(mine().getAttribute("aria-busy")).toBe("true");
      await waitFor(() => expect(mine().getAttribute("aria-busy")).toBeNull(), { timeout: 3000 });
      expect(student().disabled).toBe(false);
      fireEvent.click(mine());
      await waitFor(() => expect(h.assign).toHaveBeenCalledTimes(3));
    } finally { if (asks) window.removeEventListener("beforeunload", otherForm); }
  });

  it("a refused test says why in plain words", async () => {
    state = { ...state, config: conn({ lastTest: { at: 1, ok: true, by: "adm", asStudent: true, decision: "refuse:sso-domain", rev: 2, claimsSeen: ["email"], ruleValues: [], email: "x@gmail.com", name: null, emailVerified: true, teacher: null, cls: null } }) };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText(/refuse them\. This account isn’t one your school lets into Darsi/)).toBeTruthy();
    expect(screen.getByText("With a student’s test link.", { exact: false })).toBeTruthy();
  });

  it("a test that got through but would refuse the tester is not called a pass beside its red card", async () => {
    const lastTest = { at: 1, ok: true, by: "adm", asStudent: false, decision: "refuse:sso-domain", rev: 2, claimsSeen: ["email"], ruleValues: [], email: "x@gmail.com", name: "Mona Farouk", emailVerified: true, teacher: null, cls: null };
    state = { ...state, config: conn({ status: "tested", testedRev: 2, lastTest }) };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 4 of 5: Test" }));
    expect(screen.getByText(/The connection works, but Darsi would refuse the person who tested it/)).toBeTruthy();
    expect(screen.queryByText("The test passed for these settings.")).toBeNull();
    // Who it was: the name, then the address in brackets.
    expect(screen.getByText(/Signed in as/).textContent).toContain("Mona Farouk (x@gmail.com)");
    // The way on stays: the connection itself is tested.
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("a pass that would let the tester in says so", async () => {
    const lastTest = { at: 1, ok: true, by: "adm", asStudent: false, decision: "create-student", rev: 2, claimsSeen: ["email"], ruleValues: [], email: "a@nile.edu", name: null, emailVerified: true, teacher: null, cls: null };
    state = { ...state, config: conn({ status: "tested", testedRev: 2, lastTest }) };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 4 of 5: Test" }));
    expect(screen.getByText("The test passed for these settings.", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/The connection works, but/)).toBeNull();
  });

  it("a test coming back to the tab is finished with the admin's token, then read again", async () => {
    localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "w".repeat(43), flow: "back0001", mode: "test", next: "/admin?tab=signin", at: Date.now() }));
    state = { ...state, config: conn() };
    ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso=TK1&f=back0001");
    // While the result is read the panel says so. Not "Signing you in…": the admin is signed in, and a test signs nobody in.
    const wait = screen.getByText("Reading the test’s result…");
    expect(wait.getAttribute("role")).toBe("status");
    // A wait looks like one, as on the sign-in screens: the spinner beside the words, not a still notice box that
    // reads as a finished message on a slow connection.
    expect(wait.className).toBe("auth-busy");
    expect(wait.getAttribute("aria-busy")).toBe("true");
    expect(wait.querySelector(".dr-spinner")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText("Signing you in…")).toBeNull();
    await waitFor(() => expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeTruthy());
    const fin = h.calls.find((c) => c.url === "/api/sso/finish")!;
    expect(fin.auth).toBe("Bearer id-token");
    expect(fin.body).toEqual({ ticket: "TK1", verifier: "w".repeat(43) });
    await waitFor(() => expect(actions().filter((a) => a.action === "get").length).toBeGreaterThanOrEqual(2));
    // The router forgets the fragment in an effect of its own: waited for, not read the moment the calls are seen.
    await waitFor(() => { expect(h.loc.hash).toBe(""); expect(h.loc.search).toBe("?tab=signin"); });
  });

  describe("a return on the tab that isn't a test this page can finish", () => {
    const record = (flow: string, mode: string) => localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "w".repeat(43), flow, mode, next: "/admin?tab=signin", at: Date.now() }));
    /** Dealt with and let go of: the panel isn't left saying "Reading the test's result…", and nothing is held for a later screen. */
    const settled = async () => {
      expect(await screen.findByText("Which service do your school accounts use?")).toBeTruthy();
      await waitFor(() => expect(screen.queryByText("Reading the test’s result…")).toBeNull());
      expect(screen.queryByText("Signing you in…")).toBeNull();
      expect(hasReturn("")).toBe(false);
      await waitFor(() => expect(h.loc.hash).toBe(""));
      expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeUndefined();
    };

    it("another flow's ticket (a sign-in's) is let go of, and nothing is finished or said", async () => {
      record("back0003", "signin");
      ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso=TK3&f=back0003");
      await settled();
      expect(screen.queryByRole("alert")).toBeNull();
      // Only the read the tab opens with: no second one for a result that isn't a test's.
      expect(actions().filter((a) => a.action === "get")).toHaveLength(1);
    });

    it("another flow's refusal is let go of too", async () => {
      record("back0004", "link");
      ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso_error=sso-domain&f=back0004");
      await settled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("a return this browser's record is no longer about (a sign-in begun since) says to start again", async () => {
      record("other999", "signin");
      ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso=TK5&f=back0005");
      await settled();
      expect(screen.getByRole("alert").textContent).toMatch(/^This sign-in started in another tab or browser\./);
    });

    it("what it said stays when React runs the effect twice (StrictMode, as the app is mounted)", async () => {
      // StrictMode around the whole tree, as main.tsx has it: React then runs a new component's effects twice in
      // development, and the second run finds the return already let go of.
      const strict = (at: string) => render(<StrictMode><I18nProvider lang="en"><MemoryRouter initialEntries={[at]}><Where /><SsoSetup orgId="org1" /></MemoryRouter></I18nProvider></StrictMode>);
      record("other998", "signin");
      strict("/admin?tab=signin#sso=TK7&f=back0007");
      await settled();
      expect(screen.getByRole("alert").textContent).toMatch(/^This sign-in started in another tab or browser\./);
      // …and a refusal that came back for the test.
      cleanup();
      record("back0008", "test");
      strict("/admin?tab=signin#sso_error=sso-domain&f=back0008");
      await settled();
      expect(screen.getByRole("alert").textContent).toMatch(/isn’t one your school lets into Darsi/);
    });

    it("a test's ticket with nobody signed in is let go of and says to start again", async () => {
      h.user = null;
      record("back0006", "test");
      ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso=TK6&f=back0006");
      await settled();
      expect(screen.getByRole("alert").textContent).toMatch(/^This sign-in started in another tab or browser\./);
    });
  });
});

describe("turning it on", () => {
  it("Google needs a student's test or the admin's word; the lock-out guard is explained", async () => {
    state = { ...state, config: conn({ status: "tested", testedRev: 2, configRev: 2, studentTestOk: false }) };
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "turnOn") throw refuse("sso-last-way-in");
      return {};
    });
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Turn on school sign-in")).toBeTruthy();
    expect(screen.getByText(/3 accounts your organization made will be matched/)).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
    const on = screen.getByRole("button", { name: "Turn on" });
    expect((on as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I checked sign-in with a student account"));
    fireEvent.click(on);
    expect(await screen.findByText(/At least one admin of your organization must be able to sign in with a password or Google/)).toBeTruthy();
    expect(actions().find((a) => a.action === "turnOn")).toEqual({ action: "turnOn", orgId: "org1", studentChecked: true });
  });

  it("counts one day and one account as one", async () => {
    state = { ...state, orgMadeToMatch: 1, config: conn({ status: "tested", testedRev: 2, studentTestOk: true, maxSessionDays: 1 }) };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Turn on school sign-in")).toBeTruthy();
    expect(screen.getByText("1 day")).toBeTruthy();
    expect(screen.getByText(/^1 account your organization made will be matched at its first school sign-in\./)).toBeTruthy();
    expect(screen.queryByText(/1 days|1 accounts/)).toBeNull();
  });

  it("with nobody to match it says what happens to everyone else; Back stands beside Turn on", async () => {
    state = { ...state, orgMadeToMatch: 0, config: conn({ status: "tested", testedRev: 2, studentTestOk: true }) };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("Turn on school sign-in")).toBeTruthy();
    expect(screen.queryByText(/accounts your organization made will be matched/)).toBeNull();
    expect(screen.getByText(/People who already have a Darsi account connect it from Me/)).toBeTruthy();
    // One row for the step's two ways: back to the test, or on.
    const on = screen.getByRole("button", { name: "Turn on" });
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.parentElement).toBe(on.parentElement);
    expect(screen.getAllByRole("button", { name: "Back" })).toHaveLength(1);
    fireEvent.click(back);
    expect(screen.getByRole("button", { name: "Step 4 of 5: Test" }).getAttribute("aria-current")).toBe("step");
  });
});

describe("once it is on", () => {
  it("the status card: connected, problems with their hints, the link to share, and Turn off asked first", async () => {
    state = { ...state, signinUrl: "https://darsiai.org/signin?school=nile-ab12", connected: 41, lastSignIn: Date.UTC(2026, 10, 10), ssoOnly: 30,
      health: { problems: { "secret-expiring": { n: 1, lastAt: Date.UTC(2026, 10, 10), hint: "12" }, "token-http": { n: 3, lastAt: Date.UTC(2026, 10, 9), hint: "invalid_client" } } },
      config: conn({ status: "on", testedRev: 2 }) };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByText("On")).toBeTruthy();
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.getByText(/Days left before the client secret runs out/).textContent).toContain("12");
    // Seen once is "Once", not "1 times".
    expect(screen.getByText(/^Once, on /)).toBeTruthy();
    expect(screen.getByText(/^3 times, last on /)).toBeTruthy();
    expect(screen.queryByText(/\b1 times\b/)).toBeNull();
    expect(screen.getByText(/The provider refused Darsi’s request/).textContent).toContain("invalid_client");
    expect(screen.getByText("https://darsiai.org/signin?school=nile-ab12")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask to be listed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(screen.getByText(/30 people sign in only through the school/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("alertdialog", { hidden: true }) ?? document.body).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(actions()).toContainEqual({ action: "turnOff", orgId: "org1" }));
  });

  it("Turn off counts one person who signs in only through the school as one person", async () => {
    state = { ...state, ssoOnly: 1, config: conn({ status: "on", testedRev: 2 }) };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    expect(screen.getByText(/^1 person signs in only through the school/)).toBeTruthy();
  });

  it("another provider is named by where people continue, not as “Another provider”", async () => {
    const other = { preset: "oidc" as const, issuer: "https://id.nile.edu", host: "id.nile.edu" };
    state = { ...state, config: conn({ ...other, status: "on", testedRev: 2 }) };
    const { unmount } = ui(<SsoSetup orgId="org1" />);
    expect((await screen.findByText(/People can sign in with their school accounts at/)).textContent).toContain("id.nile.edu");
    expect(screen.queryByText(/sign in with Another provider/)).toBeNull();
    unmount();
    // And the wizard's Connect step speaks of "your provider".
    state = { ...state, config: conn({ ...other, status: "draft", hasSecret: false }) };
    ui(<SsoSetup orgId="org1" />);
    expect(await screen.findByRole("heading", { name: "Connect Darsi to your provider" })).toBeTruthy();
  });

  it("Edit opens on Connect also on a page a test came back to earlier (there is no copy to test yet)", async () => {
    // The admin's test came back to this page, the connection was turned on, and now Edit: not the Test step with
    // "Save the client secret first", but Connect.
    localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "w".repeat(43), flow: "back0002", mode: "test", next: "/admin?tab=signin", at: Date.now() }));
    state = { ...state, config: conn({ status: "on", testedRev: 2 }) };
    ui(<SsoSetup orgId="org1" />, "en", "/admin?tab=signin#sso=TK2&f=back0002");
    await waitFor(() => expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeTruthy());
    fireEvent.click(await screen.findByRole("button", { name: "Edit settings" }));
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    expect(screen.queryByText("Save the client secret first, on the Connect step.")).toBeNull();
  });

  it("Edit works on a copy: the live connection keeps serving", async () => {
    state = { ...state, config: conn({ status: "on", testedRev: 2 }) };
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit settings" }));
    expect(screen.getByText(/You are editing the live connection/)).toBeTruthy();
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop editing" }));
    expect(screen.getByRole("button", { name: "Edit settings" })).toBeTruthy();
  });

  it("platform admins also set the members ceiling", async () => {
    state = { ...state, config: conn({ status: "on" }), keyCanary: true, signerOk: true };
    ui(<SsoSetup orgId="org1" platform />);
    const field = await screen.findByLabelText("Most members school sign-in may make");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/A whole number from 1/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions()).toContainEqual({ action: "setCeiling", orgId: "org1", ceiling: 5000 }));
  });

  // An Arabic keyboard's number pad types ٠–٩ (a Persian one ۰–۹): a type="number" field refuses them (admin/typedNumber.ts).
  it("the members ceiling takes the digits an Arabic keyboard types", async () => {
    state = { ...state, config: conn({ status: "on" }), keyCanary: true, signerOk: true };
    ui(<SsoSetup orgId="org1" platform />, "ar");
    const field = await screen.findByLabelText("أكبر عدد من الأعضاء يمكن لتسجيل الدخول عبر المدرسة إنشاؤه") as HTMLInputElement;
    expect(field.type).not.toBe("number");
    fireEvent.change(field, { target: { value: "٥٬٠٠٠" } });
    expect(field.value).toBe("5000");
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(actions()).toContainEqual({ action: "setCeiling", orgId: "org1", ceiling: 5000 }));
    // Not a plain whole number: said, and nothing more is sent. Emptied: the default again.
    for (const bad of ["1e3", "۰", "12.5"]) {
      fireEvent.change(field, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
      expect(await screen.findByText(/^عدد صحيح من ١ إلى/)).toBeTruthy();
    }
    expect(actions().filter((a) => a.action === "setCeiling")).toHaveLength(1);
    fireEvent.change(field, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(actions()).toContainEqual({ action: "setCeiling", orgId: "org1", ceiling: null }));
  });
});

describe("the session length", () => {
  it("takes the digits an Arabic keyboard types, and still wants a whole number from 1 to 90", async () => {
    state = { ...state, config: conn({ hasSecret: true }), signinUrl: "https://darsiai.org/signin?school=nile-ab12" };
    answers.save = (a) => (a.partial ? { saved: "partial" } : { saved: "draft", hasSecret: true });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    const days = screen.getByLabelText("Sign in again every (days)") as HTMLInputElement;
    expect(days.type).not.toBe("number");
    const saves = () => actions().filter((a) => a.action === "save" && !a.partial);
    for (const bad of ["٩١", "1e1", "", "۰"]) {
      fireEvent.change(days, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
      expect(days.getAttribute("aria-invalid")).toBe("true");
    }
    expect(saves()).toHaveLength(0);
    fireEvent.change(days, { target: { value: "٤٥" } });
    expect(days.value).toBe("45");
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]).toMatchObject({ config: { maxSessionDays: 45 } });
    // Persian digits too, and what was typed some other way (a draft kept before this) is still read as a number.
    expect(fieldsOf({ ...EMPTY, preset: "google", clientId: "c", maxSessionDays: "۶۰" }).maxSessionDays).toBe(60);
    expect(fieldsOf({ ...EMPTY, preset: "google", clientId: "c", maxSessionDays: "٣٠" }).maxSessionDays).toBe(30);
    // Never NaN (a callable can't send it) and never a number read out of letters: 0, which the server refuses at the field.
    for (const typed of ["3o", "1e1", "", "91", "4.5"]) expect(fieldsOf({ ...EMPTY, preset: "google", clientId: "c", maxSessionDays: typed }).maxSessionDays, typed).toBe(0);
  });

  it("the migration question's own button checks the fields first (they can be edited while it asks)", async () => {
    state = { ...state, config: conn() };
    let n = 0;
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return state;
      if (a.action === "save" && !a.partial && n++ === 0) throw refuse("sso-migrate", { connected: 12, issuerChanged: false });
      return { saved: "draft", hasSecret: true };
    });
    ui(<SsoSetup orgId="org1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Step 3 of 5: People" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    await screen.findByText("12 people are connected to this sign-in");
    const saves = () => actions().filter((a) => a.action === "save" && !a.partial);
    expect(saves()).toHaveLength(1);
    const days = screen.getByLabelText("Sign in again every (days)") as HTMLInputElement;
    fireEvent.change(days, { target: { value: "3o" } });
    fireEvent.click(screen.getByRole("radio", { name: /The same people/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save with this choice" }));
    expect(days.getAttribute("aria-invalid")).toBe("true");
    await new Promise((r) => setTimeout(r, 0));
    expect(saves()).toHaveLength(1);
    // Put right, the same button saves, with the answer.
    fireEvent.change(days, { target: { value: "٣٠" } });
    fireEvent.click(screen.getByRole("button", { name: "Save with this choice" }));
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(saves()[1]).toMatchObject({ migration: "same", config: { maxSessionDays: 30 } });
  });
});

describe("platform screens", () => {
  it("listing requests: only schools that asked, with what they sent; approve", async () => {
    h.manage.mockImplementation(async (a: Record<string, unknown>) => {
      if (a.action === "get") return a.orgId === "o1"
        ? { ...BASE, config: conn({ status: "on", listing: { state: "requested", name: "Nile School", logo: null, host: "accounts.google.com", at: Date.UTC(2026, 10, 1) } }) }
        : { ...BASE, config: conn({ status: "on" }) };
      return { state: "approved" };
    });
    ui(<SsoListings orgs={[{ id: "o1", name: "Nile", sso: { on: true, listed: false } }, { id: "o2", name: "Delta", sso: { on: true, listed: false } }, { id: "o3", name: "Off", sso: { on: false } }]} />, "en", "/super/domains?tab=sso");
    expect(await screen.findByText("Listing requests (1)")).toBeTruthy();
    expect(actions().filter((a) => a.action === "get").map((a) => a.orgId)).toEqual(["o1", "o2"]);
    expect(screen.getByText("accounts.google.com")).toBeTruthy();
    // The organization (its own name can differ from the listed one) is a labelled row, and the date a sentence of its
    // own: together they read "Nile Asked on 1 Nov", as if the school were the one being asked.
    const org = screen.getByRole("link", { name: "Nile" });
    expect(org.getAttribute("href")).toBe("/super/orgs/o1?tab=signin");
    expect(org.closest("dd")?.previousElementSibling?.textContent).toBe("Organization");
    // It looks like the staff screens' other name links: .person-link underlines only a <strong> inside it (base.css),
    // so a bare name was plain ink text that nothing showed could be tapped.
    expect(org.className).toBe("person-link");
    expect(org.querySelector("strong")?.textContent).toBe("Nile");
    const asked = screen.getByText(/Asked on/);
    expect(asked.tagName).toBe("P");
    expect(asked.textContent).toMatch(/^Asked on \S/);
    expect(asked.textContent).not.toContain("Nile");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/is listed/)).toBeTruthy();
    expect(actions()).toContainEqual({ action: "listing", orgId: "o1", approve: true });
    expect(screen.getByText("No school is waiting to be listed.")).toBeTruthy();
  });

  it("the platform switch asks before turning school sign-in off for everyone", async () => {
    const apply = vi.fn();
    h.manage.mockResolvedValue({ on: false });
    ui(<SsoSwitch on apply={apply} />, "en", "/super/plans?tab=switches");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(screen.getByText("Turn school sign-in off for everyone?")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Turn off" });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(apply).toHaveBeenCalledWith(false));
    expect(actions()).toContainEqual({ action: "setSwitch", on: false });
  });
});

// The admin screens call an admin «مشرف» (admin/strings/ar.json, i18n's access.onlySuper): these screens too, never «مسؤول».
it("Arabic calls an admin «مشرف», as the other admin screens do", () => {
  const off = Object.entries(arWords as Record<string, string>).filter(([, v]) => v.includes("مسؤول")).map(([key]) => key);
  expect(off).toEqual([]);
  expect((arWords as Record<string, string>)["sa.rf.not-super"]).toContain("مشرفو منصة");
});

// One word for one thing: the step, its buttons and its result card say «اختبار», so the line shown while a test's
// result is read does too (never «تجربة», a second word for the same test).
it("Arabic calls the test «اختبار» everywhere, also while its result is read", () => {
  const words = arWords as Record<string, string>;
  expect(words["sa.step.test"]).toBe("الاختبار");
  expect(words["sa.testBack"]).toBe("جارٍ قراءة نتيجة الاختبار…");
  expect(Object.entries(words).filter(([, v]) => /تجرب/.test(v)).map(([key]) => key)).toEqual([]);
});

it("names each step for screen readers and marks where the admin is", async () => {
  ui(<SsoSetup orgId="org1" />);
  const nav = await screen.findByRole("navigation", { name: "Setup steps" });
  expect(within(nav).getByRole("button", { name: "Step 1 of 5: Provider" }).getAttribute("aria-current")).toBe("step");
  expect((within(nav).getByRole("button", { name: "Step 4 of 5: Test" }) as HTMLButtonElement).disabled).toBe(true);
});
