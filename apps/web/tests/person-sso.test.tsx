// School sign-in on a person's Account tab (admin/PersonDetail.tsx SchoolSignIn; design §7): how the school's own
// sign-in stands for the person, read once from manageSso `person` when the Account tab opens, said in words, and an
// admin's actions through manageSso (Block, Unblock, Disconnect, Let back in), of which only what applies to that
// state is offered; each is asked about on the page first and answered in words. manageSso and the reads are stand-ins.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider, rebrand } from "../src/i18n";
import { StoreProvider } from "../src/state/store";
import enPeople from "../src/admin/people-strings/en.json";
import arPeople from "../src/admin/people-strings/ar.json";
import enMe from "../src/auth/sso-strings/en.json";
import arMe from "../src/auth/sso-strings/ar.json";

type Sso = { state: string; linked?: string | null; blockedBy?: string | null; ownLogin?: boolean | null };
const m = vi.hoisted(() => ({
  auth: { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" } as { user: { uid: string } | null; role: string; orgId: string | null },
  person: null as unknown,
  reload: vi.fn(),
  forgot: [] as unknown[],
  /** What manageSso `person` answers now (an Error: it fails), and what the actions answer. */
  sso: null as unknown,
  act: vi.fn(),
  api: { manageSso: vi.fn(), resetMemberPassword: vi.fn(), updateMembers: vi.fn(), setMemberRole: vi.fn(), setMemberSuspended: vi.fn(), removeMember: vi.fn() },
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, firebaseReady: true, call: () => vi.fn(), storage: async () => ({}) }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadSettings: async () => null, loadCatalog: async () => ({ version: 1, units: [] }) }));
// The panels beside it are other tests' (tests/admin-people.test.tsx, tests/accounts.test.tsx).
vi.mock("../src/admin/AccountActions", () => ({ AccountActions: () => null }));
vi.mock("../src/admin/OrgsAdmin", () => ({ UserRolePanel: () => null }));
vi.mock("../src/admin/Super", async (orig) => ({ ...(await orig<typeof import("../src/admin/Super")>()), SuperGrantPanel: () => null }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  usePerson: () => ({ data: m.person, reload: m.reload }),
  useOrgStaff: () => ({ data: [], reload: vi.fn() }),
  forgetMembers: (...a: unknown[]) => { m.forgot.push(a); },
  patchMembers: () => {}, dropMembers: () => {},
}));

const { PersonDetail, ssoOffered } = await import("../src/admin/PersonDetail");

const tree = (lang: string, url: string) => (
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/people/:uid" element={<PersonDetail />} /><Route path="/super/people/:uid" element={<PersonDetail back="/super/people" />} /></Routes>
  </MemoryRouter></I18nProvider></StoreProvider>
);
const page = ({ lang = "en", url = "/admin/people/s1?tab=account" } = {}) => { const view = render(tree(lang, url)); return { ...view, again: () => view.rerender(tree(lang, url)) }; };
/** A student the school's sign-in made: no email or password of their own. */
const made = (o: Record<string, unknown> = {}) => ({ uid: "s1", name: "Amina Bello", role: "student", orgId: "o1", managedBy: "o1", sso: true, createdBy: "sso", ssoEmail: "amina@nile.edu", ...o });
/** Someone with their own login who connected the school's sign-in from Me. */
const linked = (o: Record<string, unknown> = {}) => ({ uid: "s1", name: "Omar Said", email: "omar@gmail.com", role: "teacher", orgId: "o1", ssoLinkedAt: Date.UTC(2026, 9, 3), ...o });
/** The server's answer about the person: a school-made account's own (the default), or a connected personal account's. */
const answer = (o: Partial<Sso> = {}): Sso => ({ state: "active", linked: "jit", blockedBy: null, ownLogin: false, ...o });
const own = (o: Partial<Sso> = {}) => answer({ linked: "self", ownLogin: true, ...o });
const refusal = (reason: string, code = "failed-precondition") => Object.assign(new Error("RAW SERVER WORDS"), { code: `functions/${code}`, details: { reason } });
const school = () => within(screen.getByRole("heading", { name: "School sign-in" }).closest("section") as HTMLElement);
const buttons = () => school().queryAllByRole("button").map((b) => b.textContent);
/** The panel once its read is in: the state is said. */
const ready = async (words?: string | RegExp) => { await waitFor(() => expect(school().queryByText("Checking the school's sign-in for this person…")).toBeNull()); if (words !== undefined) await school().findByText(words); };
const press = (name: string) => fireEvent.click(school().getByRole("button", { name }));
const yes = (name: string) => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name }));
/** The calls manageSso got, by action. */
const sent = (action?: string) => m.api.manageSso.mock.calls.map((c) => c[0] as { action: string }).filter((a) => !action || a.action === action);

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" };
  m.person = null; m.forgot = []; m.sso = answer();
  m.act.mockReset();
  m.api.manageSso.mockReset().mockImplementation(async (a: { action: string }) => {
    if (a.action !== "person") return m.act(a);
    if (m.sso instanceof Error) throw m.sso;
    return m.sso;
  });
  vi.spyOn(console, "error").mockImplementation(() => {}); // errorText logs the raw error; the tests read the screen
});
afterEach(() => { vi.restoreAllMocks(); });

describe("how a school account is said on the person's page", () => {
  it("says 'Signs in through the school' with the school's address, never 'their own email or Google', and offers no password reset", async () => {
    m.person = made();
    page();
    expect(await school().findByText("Signs in through the school")).toBeTruthy();
    expect(school().getByText("amina@nile.edu").getAttribute("dir")).toBe("ltr");
    expect(school().getByText(/it has no Darsi password to reset/)).toBeTruthy();
    expect(school().getByText("The school's sign-in opens this account.")).toBeTruthy();
    expect(screen.queryByText(/signs in with their own email or Google account/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();
    // The organization manages the account, so its admin can still lock it or remove the person.
    expect(screen.getByRole("button", { name: "Suspend account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from organization" })).toBeTruthy();
    // Asked once, for this person in their organization.
    expect(sent()).toEqual([{ action: "person", orgId: "o1", uid: "s1" }]);
  });

  it("an account the school's sign-in made that has a login of its own since is not said to have no password", async () => {
    // The profile still says `sso` and has no email of its own: only Auth knows about the login that was added.
    m.person = made();
    m.sso = answer({ ownLogin: true });
    page();
    expect(await school().findByText("Made by the school's sign-in")).toBeTruthy();
    expect(school().getByText("amina@nile.edu").getAttribute("dir")).toBe("ltr");
    expect(school().getByText(/has since added a login of their own/)).toBeTruthy();
    expect(school().queryByText("Signs in through the school")).toBeNull();
    expect(school().queryByText(/no Darsi password to reset/)).toBeNull();
    // …and the Account panel says only they change its password; it can be disconnected like any connected account.
    expect(screen.getByText(/signs in with their own email or Google account/)).toBeTruthy();
    expect(buttons()).toEqual(["Block school sign-in", "Disconnect"]);
  });

  it("claims nothing and offers nothing until the read is in", async () => {
    m.person = made();
    let done: (v: unknown) => void = () => {};
    m.api.manageSso.mockImplementation(() => new Promise((r) => { done = r; }));
    page();
    expect(school().getByText("Checking the school's sign-in for this person…").getAttribute("aria-busy")).toBe("true");
    expect(school().queryByText("Signs in through the school")).toBeNull();
    expect(school().queryByText("Made by the school's sign-in")).toBeNull();
    expect(buttons()).toEqual([]);
    await waitFor(() => expect(m.api.manageSso).toHaveBeenCalledTimes(1));
    done(answer());
    expect(await school().findByText("Signs in through the school")).toBeTruthy();
    expect(buttons()).toEqual(["Block school sign-in"]);
  });

  it("reads nothing on the other tabs, and shows the school's address under the name when the account has no email of its own", () => {
    m.person = made();
    page({ url: "/admin/people/s1" });
    const head = screen.getByRole("heading", { level: 2, name: "Amina Bello" }).parentElement as HTMLElement;
    expect(within(head).getByText("amina@nile.edu").getAttribute("dir")).toBe("ltr");
    expect(m.api.manageSso).not.toHaveBeenCalled();
  });

  it("reads when the Account tab is opened, once", async () => {
    m.person = made();
    page({ url: "/admin/people/s1" });
    fireEvent.click(screen.getByRole("tab", { name: "Account" }));
    await ready("The school's sign-in opens this account.");
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    fireEvent.click(screen.getByRole("tab", { name: "Account" }));
    expect(sent()).toHaveLength(1);
  });

  it("keeps the account's own login under the name when it has one", () => {
    m.person = linked({ ssoEmail: "omar@nile.edu" });
    page({ url: "/admin/people/s1" });
    const head = screen.getByRole("heading", { level: 2, name: "Omar Said" }).parentElement as HTMLElement;
    expect(within(head).getByText("omar@gmail.com")).toBeTruthy();
    expect(within(head).queryByText("omar@nile.edu")).toBeNull();
  });

  it("says since when a person's own account is connected, how, and still that only they change its password", async () => {
    m.person = linked();
    m.sso = own();
    page();
    await ready("The school's sign-in opens this account.");
    const since = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(Date.UTC(2026, 9, 3)));
    expect(school().getByText(`Connected to the school's sign-in since ${since}.`)).toBeTruthy();
    expect(school().getByText("The person connected their own account from Me.")).toBeTruthy();
    expect(school().queryByText("Signs in through the school")).toBeNull();
    expect(school().queryByText("Made by the school's sign-in")).toBeNull();
    expect(screen.getByText(/signs in with their own email or Google account/)).toBeTruthy();
    // Only what applies to a working connection: no Unblock, no "Let back in".
    expect(buttons()).toEqual(["Block school sign-in", "Disconnect"]);
  });

  it("says each state in words and offers only what applies to it", async () => {
    m.person = linked();
    const cases: [Partial<Sso>, string, string[]][] = [
      [{ state: "blocked", blockedBy: "admin" }, "School sign-in is blocked for this person: an admin blocked it.", ["Unblock school sign-in"]],
      // A block that came with a suspension is lifted by restoring the account: no button here would do it.
      [{ state: "blocked", blockedBy: "suspension" }, "School sign-in is blocked because the account is suspended. It works again when the account is restored.", []],
      [{ state: "removed" }, "The organization removed this person, so the school's sign-in keeps them out. “Let back in” opens it again.", ["Let back in"]],
      [{ state: "none", linked: null }, "No school sign-in is connected to this account now.", []],
      [{ state: "active", linked: "org-made" }, "The school's sign-in opens this account.", ["Block school sign-in", "Disconnect"]],
    ];
    for (const [st, words, offered] of cases) {
      m.sso = own(st);
      const view = page();
      await ready(words);
      expect(buttons()).toEqual(offered);
      view.unmount();
    }
    // How an organization-made account came to it.
    m.sso = own({ linked: "org-made" });
    page();
    expect(await school().findByText("An account the organization made, matched to the person's school account at their first school sign-in.")).toBeTruthy();
  });

  it("with nothing connected any more, doesn't say 'connected since'", async () => {
    m.person = linked();
    m.sso = own({ state: "none", linked: null });
    page();
    await ready("No school sign-in is connected to this account now.");
    expect(school().queryByText(/^Connected to the school's sign-in since/)).toBeNull();
  });

  it("a read that fails says so in the shared words, offers nothing, and reads again on Retry", async () => {
    m.person = made();
    m.sso = Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/unavailable" });
    page();
    expect(await school().findByText(/The service can't be reached right now/)).toBeTruthy();
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
    // Nothing is claimed about a password on the profile's word alone, and nothing is offered on a guess.
    expect(school().getByText("Made by the school's sign-in")).toBeTruthy();
    expect(school().queryByText(/no Darsi password to reset/)).toBeNull();
    expect(buttons()).toEqual(["Retry"]);
    m.sso = answer();
    press("Retry");
    expect(await school().findByText("Signs in through the school")).toBeTruthy();
    expect(buttons()).toEqual(["Block school sign-in"]);
    expect(sent("person")).toHaveLength(2);
  });

  it("an answer in a shape this page doesn't know is no answer", async () => {
    m.person = made();
    m.sso = { state: "paused" };
    page();
    expect(await school().findByRole("alert")).toBeTruthy();
    expect(buttons()).toEqual(["Retry"]);
  });

  it("shows nothing about school sign-in, and asks nothing, for a person it doesn't know", () => {
    m.person = { uid: "s1", name: "Grace Adeyemi", email: "grace@gmail.com", role: "teacher", orgId: "o1" };
    page();
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "School sign-in" })).toBeNull();
    expect(screen.getByText(/signs in with their own email or Google account/)).toBeTruthy();
    expect(m.api.manageSso).not.toHaveBeenCalled();
  });

  it("offers nothing to do on the admin's own page", async () => {
    m.auth = { user: { uid: "s1" }, role: "orgAdmin", orgId: "o1" };
    m.person = linked({ role: "orgAdmin" });
    m.sso = own();
    page();
    await ready("The school's sign-in opens this account.");
    expect(school().getByText(/^Connected to the school's sign-in since/)).toBeTruthy();
    expect(buttons()).toEqual([]);
  });

  it("what is offered, by state (ssoOffered)", () => {
    const st = (o: Partial<Sso>) => answer(o) as Parameters<typeof ssoOffered>[0];
    expect(ssoOffered(undefined, true, true)).toEqual([]);
    expect(ssoOffered(st({}), true, true)).toEqual(["block"]); // the school's sign-in is the only way in: not to be disconnected
    expect(ssoOffered(st({ ownLogin: true }), true, true)).toEqual(["block", "unlink"]);
    expect(ssoOffered(st({ ownLogin: null }), true, true)).toEqual(["block", "unlink"]); // not known: the server decides
    expect(ssoOffered(st({ ownLogin: false }), true, false)).toEqual(["block", "unlink"]);
    expect(ssoOffered(st({ state: "blocked", blockedBy: "admin" }), true, true)).toEqual(["unblock"]);
    expect(ssoOffered(st({ state: "blocked", blockedBy: "suspension" }), true, true)).toEqual([]);
    expect(ssoOffered(st({ state: "removed" }), true, false)).toEqual(["allowBack"]);
    expect(ssoOffered(st({ state: "removed" }), false, true)).toEqual(["allowBack"]);
    expect(ssoOffered(st({ state: "none" }), true, true)).toEqual([]);
    // Outside the organization there is nothing to block or disconnect.
    expect(ssoOffered(st({ ownLogin: true }), false, true)).toEqual([]);
    expect(ssoOffered(st({ state: "blocked", blockedBy: "admin" }), false, true)).toEqual([]);
  });
});

describe("an admin's actions on a person's school sign-in", () => {
  it("blocks only after a yes on the page, then says so and offers Unblock; a second tap sends nothing more", async () => {
    m.person = made();
    let done: (v: unknown) => void = () => {};
    m.act.mockReturnValue(new Promise((r) => { done = r; }));
    page();
    await ready();
    press("Block school sign-in");
    const ask = screen.getByRole("alertdialog", { name: /^Block school sign-in for .*Amina Bello.*\?$/ });
    expect(ask.textContent).toMatch(/Someone with no other way in is signed out everywhere/);
    expect(m.act).not.toHaveBeenCalled();
    yes("Yes, block"); yes("Yes, block");
    expect(m.act).toHaveBeenCalledTimes(1);
    expect(m.act).toHaveBeenCalledWith({ action: "block", orgId: "o1", uid: "s1" });
    // What the server holds once it is blocked: read again after the action.
    m.sso = answer({ state: "blocked", blockedBy: "admin" });
    done({ changed: 1 });
    expect((await screen.findByRole("status")).textContent).toBe("School sign-in is blocked for ⁨Amina Bello⁩.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.reload).not.toHaveBeenCalled(); // nothing on the profile changed
    expect(await school().findByText("School sign-in is blocked for this person: an admin blocked it.")).toBeTruthy();
    expect(buttons()).toEqual(["Unblock school sign-in"]);
    expect(sent("person")).toHaveLength(2);
  });

  it("while the state is read again after an action, the old one is neither said nor offered", async () => {
    m.person = made();
    m.act.mockResolvedValue({ changed: 1 });
    page();
    await ready("The school's sign-in opens this account.");
    // The read after the action stays out (a slow connection).
    let done: (v: unknown) => void = () => {};
    m.api.manageSso.mockImplementation(async (a: { action: string }) => (a.action === "person" ? new Promise((r) => { done = r; }) : m.act(a)));
    press("Block school sign-in"); yes("Yes, block");
    expect(await screen.findByText("School sign-in is blocked for ⁨Amina Bello⁩.")).toBeTruthy();
    await waitFor(() => expect(sent("person")).toHaveLength(2));
    // What was done is said; "opens this account" and Block are not left beside it.
    expect(school().queryByText("The school's sign-in opens this account.")).toBeNull();
    expect(school().getByText("Checking the school's sign-in for this person…")).toBeTruthy();
    expect(buttons()).toEqual([]);
    done(answer({ state: "blocked", blockedBy: "admin" }));
    expect(await school().findByText("School sign-in is blocked for this person: an admin blocked it.")).toBeTruthy();
    expect(buttons()).toEqual(["Unblock school sign-in"]);
    expect(school().queryByText("Checking the school's sign-in for this person…")).toBeNull();
  });

  it("a read after an action that fails keeps the last state, marked as old, with Retry", async () => {
    m.person = made();
    m.act.mockResolvedValue({ changed: 1 });
    page();
    await ready("The school's sign-in opens this account.");
    m.sso = Object.assign(new Error("RAW"), { code: "functions/unavailable" });
    press("Block school sign-in"); yes("Yes, block");
    expect(await screen.findByText("School sign-in is blocked for ⁨Amina Bello⁩.")).toBeTruthy();
    await waitFor(() => expect(school().getByRole("button", { name: "Retry" })).toBeTruthy());
    expect(school().queryByText("Checking the school's sign-in for this person…")).toBeNull();
    m.sso = answer({ state: "blocked", blockedBy: "admin" });
    fireEvent.click(school().getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(buttons()).toEqual(["Unblock school sign-in"]));
  });

  it("cancels a question without sending anything", async () => {
    m.person = linked();
    m.sso = own();
    page();
    await ready();
    press("Disconnect");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.act).not.toHaveBeenCalled();
  });

  it("says when there was nothing to block or to unblock (the state changed since it was read)", async () => {
    m.person = made();
    m.act.mockResolvedValue({ changed: 0 });
    page();
    await ready();
    m.sso = answer({ state: "blocked", blockedBy: "admin" });
    press("Block school sign-in"); yes("Yes, block");
    expect(await screen.findByText("School sign-in was already blocked for ⁨Amina Bello⁩.")).toBeTruthy();
    await waitFor(() => expect(buttons()).toEqual(["Unblock school sign-in"]));
    press("Unblock school sign-in"); yes("Yes, unblock");
    expect(await screen.findByText(/^Nothing was unblocked: no admin had blocked ⁨Amina Bello⁩'s school sign-in\. If the account is suspended, restore it instead\.$/)).toBeTruthy();
    expect(m.act).toHaveBeenLastCalledWith({ action: "unblock", orgId: "o1", uid: "s1" });
  });

  it("unblocks, says the school's sign-in works again, and offers Block again", async () => {
    m.person = made();
    m.sso = answer({ state: "blocked", blockedBy: "admin" });
    m.act.mockResolvedValue({ changed: 1 });
    page();
    await ready("School sign-in is blocked for this person: an admin blocked it.");
    expect(buttons()).toEqual(["Unblock school sign-in"]);
    press("Unblock school sign-in");
    expect(screen.getByRole("alertdialog").textContent).toMatch(/A block that came with a suspension is lifted by restoring the account instead/);
    m.sso = answer();
    yes("Yes, unblock");
    expect(await screen.findByText("School sign-in works again for ⁨Amina Bello⁩.")).toBeTruthy();
    await waitFor(() => expect(buttons()).toEqual(["Block school sign-in"]));
  });

  it("doesn't offer Disconnect for an account only the school's sign-in opens, and says what has to come first", async () => {
    m.person = made();
    page();
    await ready();
    expect(buttons()).toEqual(["Block school sign-in"]);
    expect(school().getByText(/It can be disconnected only after the person adds an email login/)).toBeTruthy();
  });

  it("a Disconnect the server refuses for the only way in is said in a sentence about the way in, not about passwords", async () => {
    // The read couldn't say whether the account has a login of its own: the server decides.
    m.person = made();
    m.sso = answer({ ownLogin: null });
    m.act.mockRejectedValue(refusal("sso-login"));
    page();
    await ready();
    press("Disconnect"); yes("Yes, disconnect");
    const said = await screen.findByText(/^This account opens only through the school's sign-in, so disconnecting it would lock the person out\. They add an email login first/);
    expect(said.className).toContain("err");
    expect(m.act).toHaveBeenCalledWith({ action: "unlink", orgId: "o1", uid: "s1" });
    expect(screen.queryByText(/^This person signs in through the school's own sign-in/)).toBeNull(); // the shared words for this code elsewhere (a password reset)
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
    expect(m.reload).not.toHaveBeenCalled();
  });

  it("says to unblock first when a sign-in blocked since can't be disconnected, and reads the state again", async () => {
    m.person = linked();
    m.sso = own();
    m.act.mockRejectedValue(refusal("sso-disabled"));
    page();
    await ready();
    m.sso = own({ state: "blocked", blockedBy: "admin" });
    press("Disconnect"); yes("Yes, disconnect");
    expect(await screen.findByText("School sign-in is blocked for this person. Unblock it first, then disconnect.")).toBeTruthy();
    await waitFor(() => expect(buttons()).toEqual(["Unblock school sign-in"]));
  });

  it("disconnects a person's own account, reads them again, and still says what was done once the profile no longer says 'connected'", async () => {
    m.person = linked();
    m.sso = own();
    m.act.mockResolvedValue({ unlinked: 1 });
    const view = page();
    await ready();
    press("Disconnect");
    expect(screen.getByRole("alertdialog").textContent).toMatch(/the person signs in with their own login, and can connect again from Me/);
    m.sso = own({ state: "none", linked: null });
    yes("Yes, disconnect");
    expect(await screen.findByText("⁨Omar Said⁩ is disconnected from school sign-in.")).toBeTruthy();
    expect(m.reload).toHaveBeenCalledTimes(1);
    // The read that follows: no connection on the profile any more.
    m.person = linked({ ssoLinkedAt: null });
    view.again();
    expect(school().getByText("⁨Omar Said⁩ is disconnected from school sign-in.")).toBeTruthy();
    await waitFor(() => expect(buttons()).toEqual([]));
    expect(school().queryByText(/^Connected to the school's sign-in since/)).toBeNull();
  });

  it("says a failure of the service in the shared words, never the server's", async () => {
    m.person = made();
    m.act.mockRejectedValue(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/unavailable" }));
    page();
    await ready();
    press("Block school sign-in"); yes("Yes, block");
    expect(await screen.findByText(/The service can't be reached right now/)).toBeTruthy();
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
    // The question is closed, and the action can be tried again.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((school().getByRole("button", { name: "Block school sign-in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says a person with no school sign-in here any more, and one who was never removed, each in its own words", async () => {
    m.person = made();
    m.act.mockRejectedValueOnce(refusal("no-account", "not-found"));
    page();
    await ready();
    m.sso = answer({ state: "removed" });
    press("Block school sign-in"); yes("Yes, block");
    expect(await screen.findByText("This person has no school sign-in in this organization any more. Reload the page.")).toBeTruthy();
    await waitFor(() => expect(buttons()).toEqual(["Let back in"]));
    // Nothing removed any more (someone else let them back in meanwhile): the server answers, and nothing is claimed.
    m.act.mockResolvedValueOnce({ allowed: false, rejoined: false });
    press("Let back in"); yes("Yes, let back in");
    const said = await screen.findByText("This person wasn't removed from school sign-in here, so there is nothing to let back in.");
    expect(said.className).toContain("err");
    expect(m.act).toHaveBeenLastCalledWith({ action: "allowBack", orgId: "o1", uid: "s1" });
    expect(m.reload).not.toHaveBeenCalled();
    expect(m.forgot).toEqual([]);
    // An older server refused the same thing: the same words. (The panel reads the state again after every answer,
    // and offers nothing meanwhile: the button is pressed once it is back.)
    await waitFor(() => expect(buttons()).toEqual(["Let back in"]));
    m.act.mockRejectedValueOnce(refusal("no-account", "not-found"));
    press("Let back in"); yes("Yes, let back in");
    await waitFor(() => expect(m.act).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("This person wasn't removed from school sign-in here, so there is nothing to let back in.")).toBeTruthy();
  });
});

describe("letting someone back in", () => {
  /** As a platform admin sees a school account its organization removed: in no organization, still managed by it. */
  const removed = () => made({ orgId: null, role: "learner" });
  beforeEach(() => { m.auth = { user: { uid: "boss" }, role: "superadmin", orgId: null }; m.sso = answer({ state: "removed" }); });

  it("offers only 'Let back in' for someone the organization removed, and puts a school account back as a student", async () => {
    m.person = removed();
    m.act.mockResolvedValue({ allowed: true, rejoined: true });
    page({ url: "/super/people/s1?tab=account" });
    await ready("The organization removed this person, so the school's sign-in keeps them out. “Let back in” opens it again.");
    expect(school().getByText("This person isn't in the organization now.")).toBeTruthy();
    // The organization is the one that manages the account: the profile names no other.
    expect(sent("person")).toEqual([{ action: "person", orgId: "o1", uid: "s1" }]);
    expect(buttons()).toEqual(["Let back in"]);
    press("Let back in");
    expect(screen.getByRole("alertdialog", { name: /^Let .*Amina Bello.* back in\?$/ }).textContent).toMatch(/goes back into the organization as a student/);
    m.sso = answer();
    yes("Yes, let back in");
    await waitFor(() => expect(m.act).toHaveBeenCalledWith({ action: "allowBack", orgId: "o1", uid: "s1" }));
    expect(await screen.findByText("⁨Amina Bello⁩ is back in the organization as a student, and the school's sign-in opens the account again.")).toBeTruthy();
    // The person is read again, and the organization's member list (which has no row for them) when next opened.
    expect(m.reload).toHaveBeenCalledTimes(1);
    expect(m.forgot).toEqual([["o1"]]);
  });

  it("says nothing was put back when the server only allowed the sign-in again (rejoined: false)", async () => {
    m.person = removed();
    m.act.mockResolvedValue({ allowed: true, rejoined: false });
    page({ url: "/super/people/s1?tab=account" });
    await ready();
    press("Let back in"); yes("Yes, let back in");
    const said = await screen.findByText(/^⁨Amina Bello⁩ may come back\. Nothing was put back into the organization/);
    expect(said.textContent).toMatch(/they join again with an invite code/);
    expect(screen.queryByText(/is back in the organization as a student/)).toBeNull();
    expect(m.forgot).toEqual([]);
  });

  it("for someone who is a member, says only that the school's sign-in opens the account again", async () => {
    m.auth = { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" };
    m.person = linked();
    m.sso = own({ state: "removed" });
    m.act.mockResolvedValue({ allowed: true, rejoined: false });
    page();
    await ready();
    expect(buttons()).toEqual(["Let back in"]);
    press("Let back in"); yes("Yes, let back in");
    expect(await screen.findByText("The school's sign-in opens ⁨Omar Said⁩'s account again.")).toBeTruthy();
    expect(m.forgot).toEqual([]);
  });

  it("words the refusals of 'Let back in': another organization, a platform admin, an organization that isn't active", async () => {
    m.person = removed();
    page({ url: "/super/people/s1?tab=account" });
    await ready();
    for (const [reason, words] of [
      ["sso-other-org", "This person belongs to another organization now, so they can't be let back in here."],
      ["sso-staff", "This person is a platform admin, and platform admins never use a school's sign-in."],
      ["sso-org-inactive", "This organization isn't active, so nobody can be let back in."],
    ]) {
      m.act.mockRejectedValueOnce(refusal(reason));
      // Offered again once the state was read again after the refusal before it.
      fireEvent.click(await school().findByRole("button", { name: "Let back in" })); yes("Yes, let back in");
      expect(await screen.findByText(words)).toBeTruthy();
    }
    expect(m.reload).not.toHaveBeenCalled();
  });

  it("offers nothing, and asks nothing, for a connected account that names no organization at all", () => {
    m.person = linked({ orgId: null, role: "learner" });
    page({ url: "/super/people/s1?tab=account" });
    expect(school().getByText(/^Connected to the school's sign-in since/)).toBeTruthy();
    expect(buttons()).toEqual([]);
    expect(m.api.manageSso).not.toHaveBeenCalled();
  });
});

describe("in Arabic", () => {
  it("names the panel, its state, its actions and its question, with the person's name isolated and the address left to right", async () => {
    m.person = made();
    m.act.mockResolvedValue({ changed: 1 });
    page({ lang: "ar" });
    const panel = within(screen.getByRole("heading", { name: "تسجيل الدخول عبر المدرسة" }).closest("section") as HTMLElement);
    expect(await panel.findByText("يسجّل الدخول عبر المدرسة")).toBeTruthy();
    expect(panel.getByText("amina@nile.edu").getAttribute("dir")).toBe("ltr");
    expect(panel.getByText("يفتح تسجيل الدخول عبر المدرسة هذا الحساب.")).toBeTruthy();
    expect(panel.getAllByRole("button").map((b) => b.textContent)).toEqual(["حظر تسجيل الدخول عبر المدرسة"]);
    // One word for one action: Me's own "Disconnect" (auth/sso-strings ss.me.disconnect) says the same.
    expect(arPeople["pp.sso.unlink"]).toBe(arMe["ss.me.disconnect"]);
    expect(enPeople["pp.sso.unlink"]).toBe(enMe["ss.me.disconnect"]);
    fireEvent.click(panel.getByRole("button", { name: "حظر تسجيل الدخول عبر المدرسة" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toContain("أتريد حظر تسجيل الدخول عبر المدرسة عن ⁨Amina Bello⁩؟");
    m.sso = answer({ state: "blocked", blockedBy: "admin" });
    fireEvent.click(within(ask).getByRole("button", { name: "نعم، احظر" }));
    expect(await screen.findByText("حُظر تسجيل الدخول عبر المدرسة عن ⁨Amina Bello⁩.")).toBeTruthy();
    expect(await panel.findByText("تسجيل الدخول عبر المدرسة محظور عن هذا الشخص: حظره أحد المشرفين.")).toBeTruthy();
    expect(panel.getAllByRole("button").map((b) => b.textContent)).toEqual(["رفع حظر تسجيل الدخول عبر المدرسة"]);
    expect(document.body.textContent).not.toContain("·");
  });

  it("has every state, way of connecting and hint in both languages, with no middle dot", () => {
    const keys = ["pp.sso.made", "pp.sso.madeHint", "pp.sso.checking", "pp.sso.st.active", "pp.sso.st.blockedAdmin", "pp.sso.st.blockedSuspension", "pp.sso.st.removed", "pp.sso.st.none",
      "pp.sso.how.jit", "pp.sso.how.org-made", "pp.sso.how.self", "pp.sso.how.admin-map", "pp.sso.gone", "pp.sso.onlyHint"] as const;
    for (const key of keys) {
      expect(enPeople[key]).toBeTruthy();
      expect(arPeople[key]).toBeTruthy();
      expect(arPeople[key]).not.toBe(enPeople[key]);
      expect(arPeople[key]).not.toContain("·");
      expect(arPeople[key]).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("the Arabic dictionaries", () => {
  /** Every ar.json under a folder of src, with its strings. */
  const dictionaries = (dir: string): [string, Record<string, string>][] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? dictionaries(join(dir, e.name)) : e.name === "ar.json" ? [[join(dir, e.name), JSON.parse(readFileSync(join(dir, e.name), "utf8")) as Record<string, string>] as [string, Record<string, string>]] : []
  ));
  const src = resolve(__dirname, "../src");

  it("no Arabic string has Darsi's name inside a longer word (the brand replacement would cut it)", () => {
    // On an organization's site without Darsi's identity, t() puts the organization's name wherever a string says
    // «درسي» (i18n rebrand): «المدرسي» became «الم⁨مدرسة النيل⁩».
    const how = arPeople["pp.sso.how.org-made"];
    expect(rebrand(how, "X")).toBe(how);
    // The name may carry the particles Arabic joins to a noun (و ف ب ل ك), nothing else before it and nothing after.
    const cut: string[] = [];
    for (const [file, dict] of dictionaries(src)) {
      for (const [key, value] of Object.entries(dict)) {
        for (const x of String(value).matchAll(/([ء-ي]*)درسي(?! الصغير)([ء-ي]*)/g)) if (x[2] || !/^[وف]?[بلك]?$/.test(x[1])) cut.push(`${file} ${key}: ${x[0]}`);
      }
    }
    expect(cut).toEqual([]);
  });

  it("no staff string ends a left-to-right address or code with a full stop (it would show before the address)", () => {
    // «مثل ⁦learn.yourschool.edu⁩.» reads ".learn.yourschool.edu" on the page: the stop belongs to the Arabic sentence
    // and lands on the address's left, where it looks like part of what to type.
    const stopped = dictionaries(join(src, "admin", "strings")).flatMap(([, dict]) => Object.entries(dict).filter(([, v]) => /\u2069\./.test(String(v))).map(([key]) => key));
    expect(stopped).toEqual([]);
  });
});
