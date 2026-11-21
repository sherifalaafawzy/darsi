// Me's "School sign-in" row is a lazy chunk (auth/SchoolLink.tsx, loaded through auth/sso.ts). When it can't load
// (offline, a cache miss) while a return from linking waits for it, Me says so and offers Retry: the return is still
// held, so the link isn't dropped without a word. With no return waiting, the row is just absent, as before.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: null, profile: null, role: "learner", orgId: null, offlineUid: null }), createLearnerProfile: async () => {} }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ auth: {}, db: {} }), storedSession: async () => null, call: () => async () => ({}) }));
vi.mock("../src/analytics/track", async (orig) => ({ ...(await orig<typeof import("../src/analytics/track")>()), track: () => {} }));

const { I18nProvider } = await import("../src/i18n");
const sso = await import("../src/auth/sso");
const { SchoolRow } = await import("../src/screens/Me");

type Link = Awaited<ReturnType<typeof sso.loadSchoolLink>>;
const ROW = { SchoolLink: () => <p>The school sign-in row</p> } as unknown as Link;
const offline = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));
const chunks = (link: () => Promise<Link>) => sso.setSchoolChunks({ finder: offline, link });
const show = (lang = "en") => render(<I18nProvider lang={lang}><SchoolRow /></I18nProvider>);
/** Back from the school's provider to /me, as auth/sso.ts finds it when the page loads. */
const comeBack = () => { window.history.replaceState(null, "", "/me#sso=LINK-TICKET&f=link0001"); sso.stashReturn(); };

afterEach(() => { sso.takeStash("/me"); window.history.replaceState(null, "", "/"); });

describe("Me's school sign-in row when its chunk can't load", () => {
  it("with a return from linking waiting, says so and offers Retry, which shows the row; the return is still held for it", async () => {
    const link = vi.fn<() => Promise<Link>>(offline);
    chunks(link);
    comeBack();
    show();
    expect((await screen.findByRole("alert")).textContent).toBe("No connection. Try again when you are online.");
    expect(sso.returnedTo("/me")).toBe(true);
    expect(window.location.href).not.toContain("LINK-TICKET");
    link.mockImplementation(async () => ROW);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("The school sign-in row")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(link).toHaveBeenCalledTimes(2);
    expect(sso.returnedTo("/me")).toBe(true); // the row itself takes it (auth/SchoolLink.tsx)
  });

  it("a Retry that fails again says so again, in Arabic too", async () => {
    const link = vi.fn<() => Promise<Link>>(offline);
    chunks(link);
    comeBack();
    show("ar");
    expect((await screen.findByRole("alert")).textContent).toBe("لا يوجد اتصال. حاول مجددًا عند الاتصال.");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(link).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("with no return waiting, the row is just absent: no error for a part of Me nobody asked for", async () => {
    const link = vi.fn<() => Promise<Link>>(offline);
    chunks(link);
    const { container } = show();
    await waitFor(() => expect(link).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("a chunk that loads shows the row", async () => {
    chunks(async () => ROW);
    show();
    expect(await screen.findByText("The school sign-in row")).toBeTruthy();
  });
});
