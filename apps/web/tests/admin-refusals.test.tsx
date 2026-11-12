// Refusals in the admin's language (staff/errors.ts and admin/refusals.ts), the people table's link to a person's
// projects, and "Give the free seats" calling again while the server says there is more. The callables are stand-ins.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org, Profile } from "../src/auth/types";
import enOrgs from "../src/admin/orgs-strings/en.json";
import arOrgs from "../src/admin/orgs-strings/ar.json";

const m = vi.hoisted(() => ({
  api: { fillSeats: vi.fn(), setSeat: vi.fn() },
  auth: { user: { uid: "boss" }, role: "superadmin" as string, orgId: null as string | null },
  docs: {} as Record<string, Record<string, unknown> | undefined>,
}));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  getDoc: async (path: string) => { const d = m.docs[path]; return { id: path.split("/").pop(), exists: () => !!d, data: () => d, get: (f: string) => d?.[f] }; },
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));

const { I18nProvider, useI18n } = await import("../src/i18n");
const { errorText, reasonText } = await import("../src/staff/errors");
const { PeopleTable } = await import("../src/admin/PeopleTable");
const { SeatsPanel } = await import("../src/admin/Super");
const { managedByOrg, useOrgRequest } = await import("../src/admin/data");
await import("../src/admin/strings");

type T = ReturnType<typeof useI18n>["t"];
/** The t() of a language, as the screens get it. */
function tOf(lang: string): T {
  let got: T | null = null;
  const Grab = () => { got = useI18n().t; return null; };
  render(<I18nProvider lang={lang}><Grab /></I18nProvider>);
  return got!;
}
const said = (reason: string, t: T) => errorText(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/failed-precondition", details: { reason } }), t);
const wrap = (ui: ReactNode, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); }); // errorText logs the raw error
afterEach(() => { vi.restoreAllMocks(); m.api.fillSeats.mockReset(); });

/** The refusals the first round of enterprise work added (functions/src: orgMembers, index, billing, access, legal, retention, analytics, platform, orgExport). */
const ADDED = [
  "code-expired", "code-used-up", "email-unverified", "email-domain", "removed", "disabled", "try-again", "bad-policy", "no-licence", "seats-full",
  "bad-seats", "bad-days", "bad-credits", "no-org", "bad-units", "bad-orgs", "bad-until", "no-account", "no-grant", "legal-doc", "legal-text",
  "legal-version", "legal-file", "bad-periods", "no-report", "bad-ga", "bad-ga-secret", "delete-option", "export-wait", "org-suspended",
  "org-deleting", "not-super",
  // The second round: an address that is another organization's, a deletion asked with no valid choice for its members,
  // and school sign-in where staff meet it outside the sign-in screens.
  "site-taken", "bad-members", "sso-login", "sso-own-login", "sso-last-way-in",
  // The final audit: one download of an account's data every ten minutes (account.ts claimDataExport).
  "data-wait",
];

describe("refusals in the admin's language", () => {
  it.each(["en", "ar"])("words every refusal the server gained, in %s, never with the generic sentence or the server's English", (lang) => {
    const t = tOf(lang);
    const generic = said("no-such-reason-at-all", t);
    for (const reason of ADDED) {
      const text = said(reason, t);
      expect(text, reason).not.toBe(generic);
      expect(text, reason).not.toContain("RAW SERVER WORDS");
      if (lang === "ar") { expect(text, reason).toMatch(/[؀-ۿ]/); expect(text, reason).not.toContain("·"); }
    }
  });

  // The stamp is taken before anything is read (account.ts claimDataExport), so the first download may have failed
  // or never arrived: the wait says one was started, never that the data was downloaded.
  it("the wait for an account's data says a download was started, not that it was downloaded", () => {
    expect(said("data-wait", tOf("en"))).toBe("A download of this account's data was started a few minutes ago. Wait ten minutes, then try again.");
    expect(said("data-wait", tOf("ar"))).toBe("بدأ تنزيل بيانات هذا الحساب قبل دقائق. انتظر عشر دقائق ثم حاول مرة أخرى.");
    for (const lang of ["en", "ar"]) expect(said("data-wait", tOf(lang)), lang).not.toMatch(/was downloaded|نُزّلت|نزّلها/);
  });

  it("words a bulk row's reason the same way (reasonText)", () => {
    const t = tOf("en");
    expect(reasonText("seats-full", t)).toMatch(/Every seat is taken/);
    expect(reasonText("bad-group", t)).toMatch(/at most 60 characters/);
  });

  it("never tells someone joining with an expired or used-up code to make one", () => {
    for (const lang of ["en", "ar"]) {
      const t = tOf(lang);
      for (const reason of ["code-expired", "code-used-up"]) {
        const text = said(reason, t);
        expect(text, `${lang} ${reason}`).not.toMatch(/Make a new code|أنشئ/);
        expect(text, `${lang} ${reason}`).toMatch(/admin|مشرف/);
      }
    }
  });

  it("says an over-long Google Analytics secret apart from a bad measurement ID", () => {
    const t = tOf("en");
    expect(said("bad-ga-secret", t)).toMatch(/^The API secret is too long/);
    expect(said("bad-ga-secret", t)).not.toBe(said("bad-ga", t));
  });

  it("says a deletion was started with the other choice for its members, naming the stored one", () => {
    const refused = (members?: string) => Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/failed-precondition", details: { reason: "delete-option", ...(members ? { members } : {}) } });
    const en = tOf("en"), ar = tOf("ar");
    expect(errorText(refused("release"), en)).toBe("This deletion was started with “Release its people”, and it goes on that way. Choose that again, then continue.");
    expect(errorText(refused("delete-managed"), en)).toBe("This deletion was started with “Delete the accounts the organization made”, and it goes on that way. Choose that again, then continue.");
    // No choice in the answer, or one this build doesn't know: still "the other choice", never "choose what happens".
    for (const e of [refused(), refused("something-new"), refused("constructor")]) {
      expect(errorText(e, en)).toBe("This deletion was started with the other choice for its members, and it goes on that way. Choose that one, then continue.");
    }
    expect(errorText(refused("release"), ar)).toContain("«إخراج أفرادها مع بقاء حساباتهم»");
    expect(errorText(refused("delete-managed"), ar)).toContain("«حذف الحسابات التي أنشأتها المؤسسة»");
    expect(errorText(refused(), ar)).toMatch(/بالخيار الآخر/);
    // The names are the ones the deletion's own choices carry (orgs-strings og.delRelease, og.delManaged).
    expect(errorText(refused("release"), en)).toContain(`“${enOrgs["og.delRelease"]}”`);
    expect(errorText(refused("delete-managed"), en)).toContain(`“${enOrgs["og.delManaged"]}”`);
    expect(errorText(refused("release"), ar)).toContain(`«${arOrgs["og.delRelease"]}»`);
    expect(errorText(refused("delete-managed"), ar)).toContain(`«${arOrgs["og.delManaged"]}»`);
    // A deletion asked with no valid choice at all is another refusal, with the old words.
    expect(said("bad-members", en)).toMatch(/^Choose what happens to the members/);
    expect(reasonText("delete-option", en)).toMatch(/the other choice/);
  });

  it("says when a new export may start, as a time in the reader's locale", () => {
    const retryAt = new Date(2026, 10, 12, 14, 35).getTime();
    const waited = (details: Record<string, unknown>) => Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/resource-exhausted", details: { reason: "export-wait", ...details } });
    const en = tOf("en"), ar = tOf("ar");
    const time = (locale: string) => new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(retryAt));
    expect(errorText(waited({ retryAt }), en, "en")).toBe(`An export of this organization started a few minutes ago. A new one can start at ${time("en")}.`);
    expect(time("en")).toMatch(/2:35/);
    const inAr = errorText(waited({ retryAt }), ar, "ar-EG");
    expect(inAr).toContain(time("ar-EG"));
    expect(inAr).toMatch(/٢:٣٥/);
    expect(inAr).not.toMatch(/[0-9]/);
    // A caller that passes no locale (most do) gets the page's own language.
    const before = document.documentElement.lang;
    try {
      document.documentElement.lang = "ar";
      expect(errorText(waited({ retryAt }), ar)).toBe(inAr);
      document.documentElement.lang = "";
      expect(errorText(waited({ retryAt }), en)).toContain(time("en"));
    } finally { document.documentElement.lang = before; }
    // No time in the answer (an older server), or one that is no time: wait a few minutes.
    for (const d of [{}, { retryAt: "soon" }, { retryAt: Number.NaN }, { retryAt: 8.7e15 }]) {
      expect(errorText(waited(d), en, "en")).toBe("An export of this organization started a few minutes ago. Wait a few minutes, then start a new one.");
    }
    expect(reasonText("export-wait", ar)).toMatch(/انتظر بضع دقائق/);
  });

  it("words school sign-in's refusals that reach staff screens, and an address that is another organization's", () => {
    const en = tOf("en");
    expect(said("sso-login", en)).toMatch(/school's own sign-in.*no Darsi password/);
    expect(said("sso-own-login", en)).toMatch(/Sign in with your own Darsi login/);
    expect(said("sso-last-way-in", en)).toMatch(/no admin who can sign in without the school's sign-in/);
    expect(said("site-taken", en)).toBe("That address belongs to another organization.");
    expect(reasonText("sso-login", en)).toBe(said("sso-login", en)); // a bulk row's reason (bulkMembers resetPassword)
    expect(said("site-taken", tOf("ar"))).toBe("هذا العنوان يخصّ مؤسسة أخرى.");
  });

  /**
   * Every refusal code written as a literal in functions/src has words: a new one without them would reach admins as
   * "Something went wrong". Not here: sign-in with an organization's own login (sso-*, worded by the sign-in screens),
   * log and record notes that are no refusal, and createMembers' rows (exists, taken: add.err.* in AddPeople).
   */
  it("has words for every refusal code in functions/src", () => {
    const dir = resolve(__dirname, "../../../functions/src");
    const codes = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(resolve(dir, f), "utf8");
      for (const re of [/\{\s*reason:\s*"([a-z][a-z-]*)"/g, /\breason:\s*"([a-z][a-z-]*)"\s*[,}]/g, /\brefuse\([^)]*?"([a-z][a-z-]*)"\s*\)/g, /\bbad\("([a-z][a-z-]*)"/g]) {
        for (const x of src.matchAll(re)) codes.add(x[1]);
      }
    }
    const NOT_SHOWN = new Set(["claims-profile", "org-gone", "org-deleted", "exists", "taken"]);
    const t = tOf("en");
    const generic = said("no-such-reason-at-all", t);
    // School sign-in's codes are worded by the sign-in screens (auth/ssoWords), except the three staff screens meet.
    const STAFF_SSO = new Set(["sso-login", "sso-own-login", "sso-last-way-in"]);
    for (const c of STAFF_SSO) expect(codes.has(c), c).toBe(true);
    const missing = [...codes].filter((c) => (!c.startsWith("sso-") || STAFF_SSO.has(c)) && !NOT_SHOWN.has(c) && said(c, t) === generic);
    expect(missing).toEqual([]);
  });
});

describe("who manages an account (data.ts managedByOrg)", () => {
  it("follows managedBy, then a username login, and never who made the profile", () => {
    expect(managedByOrg({ managedBy: "o1", email: "a@gmail.com" }, "o1")).toBe(true);
    expect(managedByOrg({ managedBy: "o2", email: "a.b@users.darsi.app" }, "o1")).toBe(false);
    expect(managedByOrg({ email: "a.b@users.darsi.app" }, "o1")).toBe(true);
    expect(managedByOrg({ email: "a@gmail.com" }, "o1")).toBe(false);
    expect(managedByOrg({ managed: true, email: "a@gmail.com" }, "o1")).toBe(true); // a listMembers row
    expect(managedByOrg({ managedBy: "o1" }, null)).toBe(false);
  });
});

describe("an organization's request (data.ts useOrgRequest)", () => {
  it("says whether the requester's email was confirmed, when the request recorded it", async () => {
    m.docs["orgs/o1/private/request"] = { contact: "+20 100", reason: "Our school", emailVerified: false };
    m.docs["orgs/o2/private/request"] = { contact: "+20 101", reason: "Older request" };
    const a = renderHook(() => useOrgRequest("o1"));
    await waitFor(() => expect(a.result.current.data).toEqual({ contact: "+20 100", reason: "Our school", emailVerified: false }));
    const b = renderHook(() => useOrgRequest("o2"));
    await waitFor(() => expect(b.result.current.data?.contact).toBe("+20 101"));
    expect(b.result.current.data?.emailVerified).toBeUndefined();
  });
});

describe("the people table", () => {
  const rows = [
    { uid: "s1", name: "Amina Bello", email: "amina.b@users.darsi.app", role: "student", projectsWaiting: 2 },
    { uid: "s2", name: "Omar Said", email: "omar.s@users.darsi.app", role: "student", projectsWaiting: 0 },
  ] as Profile[];

  it("links a count of projects waiting to the person's Projects tab, on the admin's and the teacher's page", () => {
    const { unmount } = wrap(<PeopleTable rows={rows} to={(p) => `/admin/people/${p.uid}`} review />);
    const link = screen.getByRole("link", { name: /Amina Bello.*: 2 projects to review$/ });
    expect(link.getAttribute("href")).toBe("/admin/people/s1?tab=projects");
    expect(screen.queryByRole("link", { name: /Omar Said:/ })).toBeNull();
    unmount();
    wrap(<PeopleTable rows={rows} to={(p) => `/teach/${p.uid}`} review />);
    expect(screen.getByRole("link", { name: /Amina Bello.*: 2 projects to review$/ }).getAttribute("href")).toBe("/teach/s1?tab=projects");
  });

  it("names the link in Arabic, with the name isolated", () => {
    wrap(<PeopleTable rows={rows} to={(p) => `/admin/people/${p.uid}`} review />, "ar");
    const link = screen.getByRole("link", { name: /مشاريع تنتظر المراجعة/ });
    expect(link.getAttribute("aria-label")).toContain("⁨Amina Bello⁩");
  });
});

describe("Give the free seats", () => {
  const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 500, until: Date.now() + 864e5 } } as Org;
  const members = [{ uid: "s1", name: "Amina", role: "student" }] as Profile[];

  it("calls again while the server says there is more, then says what was given", async () => {
    m.api.fillSeats.mockResolvedValueOnce({ given: 100, more: true }).mockResolvedValueOnce({ given: 30, more: false });
    const onChanged = vi.fn();
    wrap(<SeatsPanel org={org} members={members} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    expect(await screen.findByText("Seats given: 130 (teachers first, then students).")).toBeTruthy();
    expect(m.api.fillSeats).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("stops after its last call with people still waiting, and says to press again", async () => {
    m.api.fillSeats.mockResolvedValue({ given: 1, more: true });
    wrap(<SeatsPanel org={org} members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    expect(await screen.findByText(/^Seats given: 40\. Some people are still waiting/)).toBeTruthy();
    expect(m.api.fillSeats).toHaveBeenCalledTimes(40);
  });

  it("never goes round for ever when the server says more but gives nothing", async () => {
    m.api.fillSeats.mockResolvedValue({ given: 0, more: true });
    wrap(<SeatsPanel org={org} members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    expect(await screen.findByText(/^No seat was given/)).toBeTruthy();
    await waitFor(() => expect(m.api.fillSeats).toHaveBeenCalledTimes(1));
  });
});
