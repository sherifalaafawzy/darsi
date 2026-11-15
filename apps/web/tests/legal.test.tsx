// The privacy notice and the terms of use (src/legal): the app holds no wording of its own, so everything hangs on the
// public file a platform admin's publish writes (content/legal.json, read with a plain fetch):
// - nothing published: no link on the home page, the sign-up screen or Me, and the pages say "Not published yet";
// - published: the links appear in all three, the page shows the version, the date and the reader's language, as text;
// - sign-up then needs the box ticked (the form and Google), and records the versions once the account exists,
//   without a failure there ever reaching the person;
// - sign-up's own wording for Firebase's limit on new accounts from one address.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import en from "../src/legal/strings/en.json";
import ar from "../src/legal/strings/ar.json";

const h = vi.hoisted(() => ({
  stored: null as unknown,
  auth: {} as Record<string, unknown>,
  /** What the public file answers: a body (200), a status, or "offline" (the fetch rejects). */
  file: 404 as unknown,
  fetched: [] as string[],
  /** Callables, in the order they were called, with what else happened around them. */
  log: [] as [string, unknown?][],
  acceptFails: false,
  create: vi.fn(), signIn: vi.fn(), popup: vi.fn(), redirect: vi.fn(),
  profileExists: false,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "bucket-x" }, useEmulators: false, functionsRegion: "europe-west1", vapidKey: "" }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => h.auth,
  createLearnerProfile: async (uid: string) => { h.log.push(["profile", uid]); },
}));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadCatalog: async () => ({ version: 1, units: [] }),
}));
vi.mock("../src/fb", () => ({
  loadFirebase: async () => ({ auth: {}, db: {} }),
  storedSession: async () => null,
  call: (name: string) => async (data: unknown) => { h.log.push([name, data]); if (name === "acceptTerms" && h.acceptFails) throw Object.assign(new Error("not the version published now"), { details: { reason: "legal-version" } }); return { ok: true }; },
}));
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: h.create, signInWithEmailAndPassword: h.signIn, signInWithPopup: h.popup, signInWithRedirect: h.redirect,
  getRedirectResult: async () => null, GoogleAuthProvider: class {}, sendEmailVerification: async () => {}, updateProfile: async () => {},
}));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...p: string[]) => p.join("/"), getDoc: async () => ({ exists: () => h.profileExists, get: () => (h.profileExists ? "a@b.org" : undefined) }) }));
vi.mock("../src/analytics/track", async (orig) => ({ ...(await orig<typeof import("../src/analytics/track")>()), track: () => {} }));

const { I18nProvider } = await import("../src/i18n");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { resetLegal } = await import("../src/legal/published");
const { LegalPage, blocks, longDate } = await import("../src/legal/Legal");
const { Landing } = await import("../src/landing/Landing");
const { SignIn, SignUp } = await import("../src/auth/AuthScreens");
const { Me } = await import("../src/screens/Me");

const ADDRESS = "https://firebasestorage.googleapis.com/v0/b/bucket-x/o/content%2Flegal.json?alt=media";
const doc = (version: number, text: Record<string, string>, at = "2026-11-09T10:00:00.000Z") => ({ version, at, text });
const published = (over: object) => { h.file = { v: 1, privacy: null, terms: null, ...over }; };
const show = (ui: ReactNode, lang = "en", url = "/") => render(
  <I18nProvider lang={lang}><SettingsProvider lang={lang}><StoreProvider><MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
/** Lets the file's answer (and what follows from it) reach the screen. */
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const signUpForm = async () => {
  await screen.findByRole("button", { name: "Create account" });
  fill("Full name", "Amina Yusuf"); fill("Email", "amina@school.org"); fill("Password", "long-enough-1");
  return screen.getByRole("button", { name: "Create account" }).closest("form")!;
};
const names = () => h.log.map(([name]) => name);

beforeEach(() => {
  h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"] };
  h.auth = { user: null, profile: null, role: "learner", orgId: null, configured: true, offlineUid: null, ensureFirebase: async () => {}, refreshClaims: async () => {}, updateProfile: async () => {}, signOut: async () => {} };
  h.file = 404; h.fetched = []; h.log = []; h.acceptFails = false; h.profileExists = false;
  h.create.mockReset().mockImplementation(async () => { h.log.push(["account"]); return { user: { uid: "new1" } }; });
  h.signIn.mockReset(); h.popup.mockReset(); h.redirect.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    h.fetched.push(String(url));
    if (!String(url).includes("legal.json")) return new Response("", { status: 404 });
    if (h.file === "offline") throw new TypeError("Failed to fetch");
    return typeof h.file === "number" ? new Response("", { status: h.file }) : new Response(JSON.stringify(h.file), { status: 200 });
  }));
  resetLegal();
});
afterEach(() => { vi.unstubAllGlobals(); resetLegal(false); });

describe("nothing published", () => {
  it("no link on the home page, the sign-up screen or Me, and one plain read of the public file for all of them", async () => {
    const home = show(<Landing />);
    await settle();
    expect(screen.getByRole("link", { name: "Open-source licences" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Privacy notice" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Terms of use" })).toBeNull();
    home.unmount();

    const up = show(<SignUp />, "en", "/signup");
    await settle();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Privacy notice" })).toBeNull();
    up.unmount();

    show(<Me />, "en", "/me");
    await settle();
    expect(screen.getByRole("button", { name: "Open-source licences" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Privacy notice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Terms of use" })).toBeNull();
    // Guests read it with a plain fetch of the Storage address, once per page load.
    expect(h.fetched.filter((u) => u.includes("legal.json"))).toEqual([ADDRESS]);
  });

  it("the pages say so, calmly, for a missing file and for a document that isn't published", async () => {
    const first = show(<LegalPage doc="privacy" />);
    expect(await screen.findByRole("heading", { name: "Not published yet" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy notice");
    first.unmount();

    resetLegal();
    published({ privacy: doc(1, { en: "We keep little." }) });
    show(<LegalPage doc="terms" />);
    expect(await screen.findByRole("heading", { name: "Not published yet" })).toBeTruthy();
    expect(screen.queryByText("We keep little.")).toBeNull();
  });

  it("sign-up is the form it always was: it creates the account and records nothing", async () => {
    show(<SignUp />, "en", "/signup");
    fireEvent.submit(await signUpForm());
    await waitFor(() => expect(names()).toContain("profile"));
    await settle();
    expect(names()).toEqual(["account", "profile"]);
  });

  it("no connection reads as nothing published, and the next screen that asks reads again", async () => {
    h.file = "offline";
    const me = show(<Me />, "en", "/me");
    await settle();
    expect(screen.queryByRole("button", { name: "Privacy notice" })).toBeNull();
    me.unmount();
    published({ privacy: doc(1, { en: "We keep little." }) });
    show(<SignUp />, "en", "/signup");
    expect(await screen.findByRole("checkbox")).toBeTruthy();
    expect(h.fetched.filter((u) => u.includes("legal.json")).length).toBe(2);
  });

  it("a file this app can't read is nothing published, not an error", async () => {
    h.file = { v: 1, privacy: { version: "2", text: { en: "x" } }, terms: { version: 1, at: "2026-11-09T10:00:00.000Z", text: { en: "  " } } };
    show(<Landing />);
    await settle();
    expect(screen.queryByRole("link", { name: "Privacy notice" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Terms of use" })).toBeNull();
  });

  it("other screens' tests never read the live file: reading is off until a test asks", async () => {
    resetLegal(false);
    published({ privacy: doc(1, { en: "We keep little." }) });
    show(<Landing />);
    await settle();
    expect(h.fetched).toEqual([]);
    expect(screen.queryByRole("link", { name: "Privacy notice" })).toBeNull();
  });
});

describe("a published privacy notice", () => {
  beforeEach(() => published({ privacy: doc(3, { en: "We keep little.\n\nAsk us anything.", ar: "نحتفظ بالقليل." }) }));

  it("is linked from the home page's footer, the sign-up screen and Me; the terms, not published, are not", async () => {
    const home = show(<Landing />);
    expect((await screen.findByRole("link", { name: "Privacy notice" })).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByRole("link", { name: "Terms of use" })).toBeNull();
    home.unmount();

    const up = show(<SignUp />, "en", "/signup");
    const box = await screen.findByRole("checkbox", { name: "I have read and agree to the privacy notice." });
    const link = screen.getByRole("link", { name: "Privacy notice" });
    expect(link.getAttribute("href")).toBe("/privacy");
    expect(link.getAttribute("target")).toBe("_blank"); // what was typed in the form stays
    // Announced with its pages, and as required.
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.contains(link)).toBe(true);
    expect((box as HTMLInputElement).required).toBe(true);
    up.unmount();

    show(<Me />, "en", "/me");
    expect(await screen.findByRole("button", { name: "Privacy notice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Terms of use" })).toBeNull();
  });

  it("an organization's own home page links it too", async () => {
    show(<Landing site={{ orgId: "o1", name: "CIS Training Platform", logo: null, darsi: false }} />);
    expect((await screen.findByRole("link", { name: "Privacy notice" })).getAttribute("href")).toBe("/privacy");
  });

  it("the page shows the version, the date and the text, a paragraph for each block", async () => {
    const { container } = show(<LegalPage doc="privacy" />, "en", "/privacy");
    expect(await screen.findByText("We keep little.")).toBeTruthy();
    expect(screen.getByText("Ask us anything.").tagName).toBe("P");
    expect(container.textContent).toMatch(/Version 3, published .?November 9, 2026/);
    expect(container.querySelector("article")!.getAttribute("lang")).toBe("en");
    expect(screen.getByText("We keep little.").getAttribute("dir")).toBe("auto");
    expect(screen.queryByRole("heading", { name: "Not published yet" })).toBeNull();
  });

  it("an Arabic reader gets the Arabic text, with the version and date their way", async () => {
    const { container } = show(<LegalPage doc="privacy" />, "ar", "/privacy");
    expect(await screen.findByText("نحتفظ بالقليل.")).toBeTruthy();
    expect(screen.queryByText("We keep little.")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("إشعار الخصوصية");
    expect(container.textContent).toMatch(/الإصدار ٣، نُشر في/);
    expect(container.textContent).toContain("نوفمبر");
    expect(container.querySelector("article")!.getAttribute("lang")).toBe("ar");
  });

  it("a language without its own text reads the English one", async () => {
    published({ terms: doc(1, { en: "Be kind." }) });
    resetLegal();
    const { container } = show(<LegalPage doc="terms" />, "ar", "/terms");
    expect(await screen.findByText("Be kind.")).toBeTruthy();
    expect(container.querySelector("article")!.getAttribute("lang")).toBe("en");
  });

  it("a language code that names something every object has still reads the English text", async () => {
    published({ terms: doc(1, { en: "Be kind." }) });
    resetLegal();
    show(<LegalPage doc="terms" />, "valueOf", "/terms"); // well-formed as a language tag, and a name on every object
    expect(await screen.findByText("Be kind.")).toBeTruthy();
  });

  it("Arabic published without English still shows to Arabic readers", async () => {
    published({ privacy: doc(4, { ar: "نحتفظ بالقليل." }) });
    resetLegal();
    show(<LegalPage doc="privacy" />, "ar", "/privacy");
    expect(await screen.findByText("نحتفظ بالقليل.")).toBeTruthy();
  });

  it("the text is shown as text, never as HTML; a line starting with '# ' is a heading", async () => {
    published({ privacy: doc(5, { en: "# What we keep\nYour name.\nYour lessons.\n\n<script>window.hacked = 1</script> <img src=x onerror=alert(1)>\n\n\n# Contact\n\n#not a heading" }) });
    resetLegal();
    const { container } = show(<LegalPage doc="privacy" />, "en", "/privacy");
    expect(await screen.findByRole("heading", { level: 2, name: "What we keep" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Contact" })).toBeTruthy();
    expect(container.querySelector("article script, article img")).toBeNull();
    expect(screen.getByText("<script>window.hacked = 1</script> <img src=x onerror=alert(1)>").tagName).toBe("P");
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
    expect(blocks("# A\nline 1\r\nline 2\n \n# B\n\n\nlast")).toEqual([{ h: "A" }, { p: "line 1\nline 2" }, { h: "B" }, { p: "last" }]);
    expect(screen.getByText("#not a heading").tagName).toBe("P");
  });
});

describe("agreeing at sign-up", () => {
  beforeEach(() => published({ privacy: doc(3, { en: "We keep little." }), terms: doc(2, { en: "Be kind." }) }));
  const box = () => screen.findByRole("checkbox", { name: "I have read and agree to the privacy notice and the terms of use." });

  it("can't be sent unticked: no account is made, and the box says why and takes the focus", async () => {
    show(<SignUp />, "en", "/signup");
    const form = await signUpForm();
    const tick = await box();
    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toBe("Tick the box to agree before you create an account.");
    expect(document.activeElement).toBe(tick);
    expect(tick.getAttribute("aria-invalid")).toBe("true");
    expect((tick as HTMLInputElement).validationMessage).toBe("Tick the box to agree before you create an account."); // the browser's own stop, in the person's language
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);

    fireEvent.click(tick);
    expect(screen.queryByRole("alert")).toBeNull();
    expect((tick as HTMLInputElement).validationMessage).toBe("");
  });

  it("the whole row is the box's label, styled as a full-height tap target (styles/auth.css .auth-agree)", async () => {
    show(<SignUp />, "en", "/signup");
    const tick = await box();
    expect(tick.closest("label")?.className).toBe("auth-agree");
    const css = (await import("node:fs")).readFileSync(`${__dirname}/../src/styles/auth.css`, "utf8");
    expect(css).toMatch(/\.auth-agree \{[^}]*min-block-size: var\(--tap-min\)/);
  });

  it("ticked, it records the published versions once the account and its profile exist", async () => {
    show(<SignUp />, "en", "/signup");
    const form = await signUpForm();
    fireEvent.click(await box());
    fireEvent.submit(form);
    await waitFor(() => expect(names()).toContain("acceptTerms"));
    expect(h.log).toEqual([["account"], ["profile", "new1"], ["acceptTerms", { privacy: 3, terms: 2 }]]);
  });

  it("names only what is published", async () => {
    published({ terms: doc(7, { en: "Be kind." }) });
    resetLegal();
    show(<SignUp />, "en", "/signup");
    const form = await signUpForm();
    fireEvent.click(await screen.findByRole("checkbox", { name: "I have read and agree to the terms of use." }));
    expect(screen.queryByRole("link", { name: "Privacy notice" })).toBeNull();
    fireEvent.submit(form);
    await waitFor(() => expect(h.log.at(-1)).toEqual(["acceptTerms", { terms: 7 }]));
  });

  it("a failure to record it never reaches the person: the account is theirs", async () => {
    h.acceptFails = true;
    show(<SignUp />, "en", "/signup");
    const form = await signUpForm();
    fireEvent.click(await box());
    fireEvent.submit(form);
    await waitFor(() => expect(names()).toContain("acceptTerms"));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("arrives under the Create button without moving it, and reads in Arabic too", async () => {
    let answer!: () => void;
    const held = new Promise<void>((r) => { answer = r; });
    const body = h.file;
    vi.stubGlobal("fetch", vi.fn(async () => { await held; return new Response(JSON.stringify(body), { status: 200 }); }));
    show(<SignUp />, "ar", "/signup");
    const create = await screen.findByRole("button", { name: "إنشاء الحساب" });
    await settle();
    expect(screen.queryByRole("checkbox")).toBeNull(); // a slow connection: the form as it always was
    await act(async () => { answer(); await held; });
    const tick = await screen.findByRole("checkbox", { name: "قرأتُ إشعار الخصوصية وشروط الاستخدام وأوافق عليهما." });
    expect(create.compareDocumentPosition(tick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "إشعار الخصوصية" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "شروط الاستخدام" }).getAttribute("href")).toBe("/terms");
  });

  describe("with Google", () => {
    const google = async () => {
      const button = await screen.findByRole("button", { name: "Continue with Google" });
      await waitFor(() => expect(button.getAttribute("aria-disabled")).toBeNull());
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
      return button;
    };

    it("doesn't start until the box is ticked; a new account then records the versions", async () => {
      h.popup.mockResolvedValue({ user: { uid: "g1", displayName: "Grace", email: "grace@x.org" } });
      show(<SignUp />, "en", "/signup");
      const tick = await box();
      fireEvent.click(await google());
      expect((await screen.findByRole("alert")).textContent).toBe("Tick the box to agree before you create an account.");
      expect(h.popup).not.toHaveBeenCalled();
      fireEvent.click(tick);
      fireEvent.click(await google());
      await waitFor(() => expect(names()).toContain("acceptTerms"));
      expect(h.log).toEqual([["profile", "g1"], ["acceptTerms", { privacy: 3, terms: 2 }]]);
    });

    it("an account that already existed records nothing", async () => {
      h.profileExists = true;
      h.popup.mockResolvedValue({ user: { uid: "g2", displayName: "Grace", email: "grace@x.org" } });
      show(<SignUp />, "en", "/signup");
      fireEvent.click(await box());
      fireEvent.click(await google());
      await waitFor(() => expect(h.popup).toHaveBeenCalled());
      await settle();
      expect(h.log).toEqual([]);
    });

    it("where the popup can't open, the ticked versions make the trip to Google's page and back", async () => {
      h.popup.mockRejectedValue(Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }));
      h.redirect.mockResolvedValue(undefined);
      const first = show(<SignUp />, "en", "/signup");
      fireEvent.click(await box());
      fireEvent.click(await google());
      await waitFor(() => expect(h.redirect).toHaveBeenCalled());
      expect(JSON.parse(sessionStorage.getItem("darsi:googleAgreed")!)).toEqual({ privacy: 3, terms: 2 });
      first.unmount();

      // Back from Google's page: Auth holds the new account.
      vi.resetModules();
      vi.doMock("../src/fb", () => ({
        loadFirebase: async () => ({ auth: { currentUser: { uid: "g3", displayName: "Hana", email: "hana@x.org" } }, db: {} }),
        storedSession: async () => null,
        call: (name: string) => async (data: unknown) => { h.log.push([name, data]); return { ok: true }; },
      }));
      const again = await import("../src/auth/AuthScreens");
      const i18n = await import("../src/i18n");
      const store = await import("../src/state/store");
      render(<i18n.I18nProvider lang="en"><store.StoreProvider><MemoryRouter initialEntries={["/signup"]}><again.SignUp /></MemoryRouter></store.StoreProvider></i18n.I18nProvider>);
      await waitFor(() => expect(names()).toContain("acceptTerms"));
      expect(h.log).toEqual([["profile", "g3"], ["acceptTerms", { privacy: 3, terms: 2 }]]);
      expect(sessionStorage.getItem("darsi:googleAgreed")).toBeNull();
      vi.doUnmock("../src/fb");
    });

    it("signing in (not up) asks for no tick and records nothing", async () => {
      h.popup.mockResolvedValue({ user: { uid: "g4", displayName: "Grace", email: "grace@x.org" } });
      show(<SignIn />, "en", "/signin");
      await settle();
      expect(screen.queryByRole("checkbox")).toBeNull();
      fireEvent.click(await google());
      await waitFor(() => expect(names()).toContain("profile"));
      await settle();
      expect(names()).toEqual(["profile"]);
    });
  });
});

describe("too many new accounts from one address", () => {
  const tooMany = () => Object.assign(new Error("quota"), { code: "auth/too-many-requests" });

  it("sign-up says to wait an hour or ask the organization's admin, in English and Arabic", async () => {
    h.create.mockReset().mockRejectedValue(tooMany());
    const first = show(<SignUp />, "en", "/signup");
    fireEvent.submit(await signUpForm());
    expect((await screen.findByRole("alert")).textContent).toBe(en["auth.errTooManySignUp"]);
    expect(en["auth.errTooManySignUp"]).toMatch(/in an hour.*organization’s admin/);
    first.unmount();

    show(<SignUp />, "ar", "/signup");
    await screen.findByRole("button", { name: "إنشاء الحساب" });
    fireEvent.submit(document.querySelector("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe(ar["auth.errTooManySignUp"]);
  });

  it("sign-in keeps its own wording", async () => {
    h.signIn.mockRejectedValue(tooMany());
    show(<SignIn />, "en", "/signin");
    fireEvent.submit((await screen.findByRole("button", { name: "Sign in" })).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Wait a minute and try again.");
  });
});

describe("the publication date", () => {
  it("is written the reader's way, and in English where the browser doesn't know the locale (never a broken page)", () => {
    const at = "2026-11-09T10:00:00.000Z";
    expect(longDate("en", at)).toBe(new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(at)));
    expect(longDate("ar-EG", at)).toBe(new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date(at)));
    // A malformed tag (an added language's code typed oddly) makes Intl throw a RangeError.
    expect(() => new Intl.DateTimeFormat("en_US!!", { dateStyle: "long" })).toThrow(RangeError);
    expect(longDate("en_US!!", at)).toBe(longDate("en", at));
  });
});

describe("the strings", () => {
  it("are all in both languages, with the same variables, and Arabic never uses the middle dot", () => {
    expect(Object.keys(ar)).toEqual(Object.keys(en));
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(ar[key]), key).toEqual(vars(en[key]));
      expect(ar[key], key).not.toContain("·");
      expect(ar[key], key).toMatch(/[؀-ۿ]/);
    }
  });
});
