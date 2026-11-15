// Joining an organization (/org) asks first (enterprise pass, package ad-cms-org). Joining shows the organization's
// admins and the person's teacher everything the person has done in Darsi, earlier work included, and the screen used
// to say only "You joined" afterwards, and joined by itself from an invite link. Now nothing joins without a "yes" to
// one question that says exactly that; "Not now" joins nothing; and joinOrg's refusals are said in the person's language.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import entEn from "../src/cms/ent-strings/en.json";
import entAr from "../src/cms/ent-strings/ar.json";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "learner", orgId: null, refreshClaims: vi.fn(async () => {}), profile: { uid: "me", name: "Me" } } as
    { user: { uid: string } | null; role: string; orgId: string | null; refreshClaims: () => Promise<void>; profile: unknown },
  api: { joinOrg: vi.fn(), requestOrg: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useMyOrgRequests: () => ({ data: [], reload: () => {} }),
  useOrg: () => ({ data: undefined, reload: () => {} }),
}));

const { OrgScreen, PROFILE_WAIT_MS } = await import("../src/org/OrgScreen");

/** The address the page is at, to check what an invite link leaves in it. */
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const tree = (lang: string, url: string) => <I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}><Where /><OrgScreen /></MemoryRouter></I18nProvider>;
const wrap = ({ lang = "en", url = "/org" } = {}) => render(tree(lang, url) as ReactNode);
const refused = (code: string, reason: string, words = "RAW SERVER WORDS") => Object.assign(new Error(words), { code, details: { reason } });
const code = () => screen.getByLabelText("Invite code") as HTMLInputElement;
/** Types a code and presses the form's Join: the question comes up. */
const typeAndSubmit = async (value = "k7q-2mxp") => {
  fireEvent.change(code(), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  return screen.findByRole("alertdialog");
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {}); // errorText logs the raw error for "Report a problem"
  m.auth.user = { uid: "me" }; m.auth.role = "learner"; m.auth.orgId = null; m.auth.profile = { uid: "me", name: "Me" };
  m.api.joinOrg.mockResolvedValue({ orgId: "o1", role: "student", orgName: "Al-Noor School" });
});
afterEach(() => { logged.mockRestore(); });

describe("joining with a typed code", () => {
  it("asks what joining means, and joins only after Join", async () => {
    wrap();
    const ask = await typeAndSubmit();
    expect(m.api.joinOrg).not.toHaveBeenCalled();
    expect(within(ask).getByText("Join this organization?")).toBeTruthy();
    // What the person agrees to: who sees what, earlier work included, and how to leave.
    const body = within(ask).getByText(entEn["ent.org.joinBody"]).textContent!;
    for (const said of [/admins and your teacher/, /lessons, scores, projects and certificates/, /before you joined/, /You can leave/, /unless the organization made your login/]) expect(body).toMatch(said);
    // The safe answer has the focus, so Enter on a question that just appeared joins nothing.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Not now" }));
    expect(screen.getAllByRole("button", { name: "Join" })).toHaveLength(1); // one Join on the page: the question's
    fireEvent.click(within(ask).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(m.api.joinOrg).toHaveBeenCalledWith({ code: "K7Q-2MXP" }));
    expect(m.api.joinOrg).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(m.auth.refreshClaims).toHaveBeenCalled());
  });

  it("joins nothing on “Not now”, keeps the code in the field and puts the cursor back in it", async () => {
    wrap();
    const ask = await typeAndSubmit();
    fireEvent.click(within(ask).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.joinOrg).not.toHaveBeenCalled();
    expect(m.auth.refreshClaims).not.toHaveBeenCalled();
    expect(code().value).toBe("K7Q-2MXP");
    expect(code().readOnly).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(code()));
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy(); // and can be asked again
  });

  it("cancels on Escape, like “Not now”", async () => {
    wrap();
    const ask = await typeAndSubmit();
    fireEvent.keyDown(ask, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.joinOrg).not.toHaveBeenCalled();
  });

  it("holds the code while the question is up, and Enter in the field joins nothing", async () => {
    wrap();
    await typeAndSubmit();
    expect(code().readOnly).toBe(true);
    fireEvent.submit(code().closest("form")!);
    expect(m.api.joinOrg).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("asks nothing for a code too short to be one", () => {
    wrap();
    fireEvent.change(code(), { target: { value: "ab" } });
    fireEvent.submit(code().closest("form")!);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.joinOrg).not.toHaveBeenCalled();
  });

  it("asks in Arabic in the Arabic app", async () => {
    wrap({ lang: "ar" });
    fireEvent.change(screen.getByLabelText("رمز الدعوة"), { target: { value: "AAA-BBBB" } });
    fireEvent.click(screen.getByRole("button", { name: "انضم" }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(entAr["ent.org.joinAsk"])).toBeTruthy();
    expect(within(ask).getByText(entAr["ent.org.joinBody"])).toBeTruthy();
    expect(within(ask).getByRole("button", { name: "ليس الآن" })).toBeTruthy();
  });
});

describe("an invite link (/org?code=…), where sign-up with a code lands", () => {
  it("shows the same question once the profile is there, and joins only after Join", async () => {
    m.auth.profile = null; // signed up a moment ago: the app is still creating it
    const r = render(tree("en", "/org?code=k7q-2mxp"));
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole("alertdialog")).toBeNull(); // still waiting for the profile
    expect(screen.getByTestId("where").textContent).toBe("/org?code=k7q-2mxp");
    m.auth.profile = { uid: "me", name: "Me" };
    r.rerender(tree("en", "/org?code=k7q-2mxp"));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(entEn["ent.org.joinBody"])).toBeTruthy();
    expect(m.api.joinOrg).not.toHaveBeenCalled(); // it used to join right here
    expect(code().value).toBe("K7Q-2MXP");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1); // asked once, not twice
    fireEvent.click(within(ask).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(m.api.joinOrg).toHaveBeenCalledWith({ code: "K7Q-2MXP" }));
    expect(m.api.joinOrg).toHaveBeenCalledTimes(1);
  });

  it("asks after a few seconds even without a profile, and still joins nothing by itself", async () => {
    vi.useFakeTimers();
    try {
      m.auth.profile = null;
      wrap({ url: "/org?code=K7Q-2MXP" });
      await act(async () => { await vi.advanceTimersByTimeAsync(PROFILE_WAIT_MS - 100); });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(m.api.joinOrg).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("takes the code out of the address as it asks, so a reload after “Not now” joins nothing", async () => {
    const r = wrap({ url: "/org?code=K7Q-2MXP" });
    const ask = await screen.findByRole("alertdialog");
    expect(screen.getByTestId("where").textContent).toBe("/org");
    fireEvent.click(within(ask).getByRole("button", { name: "Not now" }));
    expect(code().value).toBe("K7Q-2MXP"); // still in the field, to join later
    // The reload: the page opens again at the address as it is now.
    const at = screen.getByTestId("where").textContent!;
    r.unmount();
    wrap({ url: at });
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(code().value).toBe("");
    expect(m.api.joinOrg).not.toHaveBeenCalled();
  });

  it("does not ask again when the page draws again after “Not now”", async () => {
    const r = render(tree("en", "/org?code=K7Q-2MXP"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Not now" }));
    m.auth.profile = { uid: "me", name: "Me", email: "me@example.org" }; // the profile changed: the page draws again
    r.rerender(tree("en", "/org?code=K7Q-2MXP"));
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.joinOrg).not.toHaveBeenCalled();
  });
});

describe("a refused join", () => {
  const joinWith = async (error: unknown, lang = "en") => {
    m.api.joinOrg.mockRejectedValue(error);
    wrap({ lang });
    fireEvent.change(screen.getByLabelText(lang === "ar" ? "رمز الدعوة" : "Invite code"), { target: { value: "AAA-BBBB" } });
    fireEvent.click(screen.getByRole("button", { name: lang === "ar" ? "انضم" : "Join" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: lang === "ar" ? "انضم" : "Join" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull()); // the question closes; the reason is on the field
  };

  it("says an organization removed this person, in its own words", async () => {
    await joinWith(refused("functions/permission-denied", "removed", "This organization removed you. Ask its admin to let you back in."));
    expect(screen.getByText(/The organization removed this account/)).toBeTruthy();
    expect(screen.queryByText(/This kind of login is only for accounts/)).toBeNull(); // not the other permission-denied
    expect(screen.queryByText(/This organization removed you/)).toBeNull(); // not the server's English
    expect(code().getAttribute("aria-invalid")).toBe("true");
    expect(code().value).toBe("AAA-BBBB");
    await waitFor(() => expect(document.activeElement).toBe(code()));
  });

  it.each([
    ["code-expired", "functions/failed-precondition", /This invite code has expired/],
    ["code-used-up", "functions/failed-precondition", /has been used as many times as it allows/],
    ["email-unverified", "functions/permission-denied", /The email address has to be confirmed first/],
    ["email-domain", "functions/permission-denied", /only accepts its own email addresses/],
    ["in-org", "functions/failed-precondition", /You already belong to an organization/],
  ])("says “%s” in words of its own", async (reason, sdk, words) => {
    await joinWith(refused(sdk, reason));
    expect(screen.getByText(words)).toBeTruthy();
    expect(screen.queryByText("RAW SERVER WORDS")).toBeNull();
  });

  it("says them in Arabic in the Arabic app", async () => {
    await joinWith(refused("functions/permission-denied", "removed"), "ar");
    expect(screen.getByText(/أزالت المؤسسة هذا الحساب/)).toBeTruthy();
    expect(screen.queryByText("RAW SERVER WORDS")).toBeNull();
  });

  it("keeps the older answers: an unknown code, too many tries, a hand-made username login", async () => {
    await joinWith(refused("functions/not-found", "bad-code", "That code is not valid."));
    expect(screen.getByText(/That code is not valid\. Check it with your admin/)).toBeTruthy();
  });

  it("never shows the server's raw English for a failure it has no words for", async () => {
    await joinWith(Object.assign(new Error("9 FAILED_PRECONDITION: something internal"), { code: "functions/internal" }));
    expect(screen.queryByText(/FAILED_PRECONDITION/)).toBeNull();
    expect(screen.getByText(/Something went wrong on the server/)).toBeTruthy();
  });

  it("lets the person try again after a refusal: the question comes back, and Join joins", async () => {
    await joinWith(refused("functions/failed-precondition", "code-expired"));
    m.api.joinOrg.mockResolvedValue({ orgId: "o1", role: "student", orgName: "Al-Noor School" });
    fireEvent.change(code(), { target: { value: "NEW-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(m.api.joinOrg).toHaveBeenLastCalledWith({ code: "NEW-CODE" }));
    expect(m.api.joinOrg).toHaveBeenCalledTimes(2);
  });
});

describe("asking for an organization: its size", () => {
  const size = () => screen.getByLabelText("Approximate number of people") as HTMLInputElement;
  const send = async (typed: string) => {
    m.api.requestOrg.mockResolvedValue({ orgId: "o9", status: "pending" });
    wrap({ url: "/org?request=1" });
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Hope NGO" } });
    fireEvent.change(size(), { target: { value: typed } });
    const kept = size().value;
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(m.api.requestOrg).toHaveBeenCalledTimes(1));
    return { kept, sent: (m.api.requestOrg.mock.calls[0][0] as { size?: number }).size };
  };

  it("reads the digits an Arabic keyboard types (a number field refused them, or the size was dropped)", async () => {
    const r = await send("٣٠٠");
    expect(size().type).not.toBe("number");
    expect(r).toEqual({ kept: "300", sent: 300 });
  });
  it("reads Persian digits and a thousands mark, and keeps digits only", async () => {
    expect(await send("۱٬۲۵۰ people")).toEqual({ kept: "1250", sent: 1250 });
  });
  it("sends no size for an empty field or 0, and at most what the server keeps", async () => {
    expect((await send("")).sent).toBeUndefined();
    cleanup(); m.api.requestOrg.mockClear();
    expect((await send("0")).sent).toBeUndefined();
    cleanup(); m.api.requestOrg.mockClear();
    expect(await send("99999999")).toEqual({ kept: "99999999", sent: 10_000_000 });
  });
});
