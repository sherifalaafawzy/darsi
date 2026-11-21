// The banner that asks a signed-in person to agree to a newer privacy notice or terms (legal/TermsPrompt.tsx, in the app
// shell): shown only when something published is newer than users/{uid}.terms, never for guests, and "I agree" records
// it with acceptTerms, asking again when the server had no profile yet and reading the file again when it is behind.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  file: null as unknown,
  fetched: 0,
  calls: [] as unknown[],
  answer: (async () => ({ ok: true, recorded: true })) as (data: unknown) => Promise<unknown>,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "bucket-x" }, useEmulators: false, functionsRegion: "europe-west1", vapidKey: "" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => h.auth }));
vi.mock("../src/fb", () => ({ call: (name: string) => async (data: unknown) => { h.calls.push([name, data]); return h.answer(data); } }));

const { I18nProvider } = await import("../src/i18n");
const { resetLegal } = await import("../src/legal/published");
const { TermsPrompt, dueTerms } = await import("../src/legal/TermsPrompt");

const DAY = 864e5;
const signedIn = (terms: unknown, patch: Record<string, unknown> = {}) => {
  h.auth = { user: { uid: "u1", metadata: { creationTime: new Date(Date.now() - 30 * DAY).toUTCString() } }, profile: { uid: "u1", name: "Amina", terms }, profileReady: true, ...patch };
};
const publish = (privacy: number | null, terms: number | null) => {
  const doc = (version: number) => ({ version, at: "2026-11-09T10:00:00.000Z", text: { en: "Text" } });
  h.file = { v: 1, privacy: privacy === null ? null : doc(privacy), terms: terms === null ? null : doc(terms) };
};
const show = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><TermsPrompt /></MemoryRouter></I18nProvider>);
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  h.calls = []; h.fetched = 0; h.answer = async () => ({ ok: true, recorded: true });
  vi.stubGlobal("fetch", vi.fn(async () => { h.fetched++; return h.file ? new Response(JSON.stringify(h.file), { status: 200 }) : new Response("", { status: 404 }); }));
  resetLegal();
});
afterEach(() => { vi.unstubAllGlobals(); resetLegal(false); });

describe("dueTerms", () => {
  it("names what is newer than the profile's record, and sends every published version", () => {
    expect(dueTerms({ privacy: 2, terms: 1 }, { privacy: 2, terms: 1 })).toBeNull();
    expect(dueTerms({ privacy: 3, terms: 1 }, { privacy: 2, terms: 1 })).toEqual({ docs: ["privacy"], versions: { privacy: 3, terms: 1 } });
    expect(dueTerms({ privacy: 1, terms: 1 }, null)).toEqual({ docs: ["privacy", "terms"], versions: { privacy: 1, terms: 1 } });
    expect(dueTerms({ privacy: null, terms: 2 }, { privacy: 5 })).toEqual({ docs: ["terms"], versions: { terms: 2 } });
    expect(dueTerms({ privacy: null, terms: null }, undefined)).toBeNull(); // nothing published: nothing asked
  });
});

describe("the banner", () => {
  it("asks an account with an older record, links what changed, and 'I agree' records it", async () => {
    publish(2, 1);
    signedIn({ privacy: 1, terms: 1 });
    show();
    expect(await screen.findByText(/There is a new privacy notice\. Read it, and agree when you are ready\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy notice" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByRole("link", { name: "Terms of use" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I agree" }));
    await waitFor(() => expect(h.calls).toEqual([["acceptTerms", { privacy: 2, terms: 1 }]]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "I agree" })).toBeNull());
  });

  it("asks an account that never agreed to anything about both, in Arabic too", async () => {
    publish(1, 1);
    signedIn(undefined);
    show("ar");
    expect(await screen.findByText(/صدر إشعار خصوصية جديد وشروط استخدام جديدة/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "إشعار الخصوصية" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "شروط الاستخدام" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "أوافق" })).toBeTruthy();
  });

  it("says nothing when the record is current, when nothing is published, or before the profile is read", async () => {
    publish(2, 1);
    signedIn({ privacy: 2, terms: 1 });
    const a = show();
    await settle();
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull();
    a.unmount();
    signedIn(undefined, { profileReady: false, profile: null });
    const b = show();
    await settle();
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull();
    b.unmount();
    resetLegal(); h.file = null;
    signedIn(undefined);
    show();
    await settle();
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull();
  });

  it("waits for an account made a moment ago: it agreed on the sign-up screen, and that call may still be on its way", async () => {
    publish(1, 1);
    signedIn(undefined, { user: { uid: "u1", metadata: { creationTime: new Date().toUTCString() } } });
    show();
    await settle();
    expect(h.fetched).toBe(1);
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull();
  });

  it("recorded: false (no profile on the server yet) asks again when the profile arrives", async () => {
    publish(1, 1);
    signedIn(undefined);
    let n = 0;
    h.answer = async () => ({ ok: true, recorded: ++n > 1 });
    const view = show();
    fireEvent.click(await screen.findByRole("button", { name: "I agree" }));
    await waitFor(() => expect(h.calls).toHaveLength(1));
    await settle();
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull(); // waiting, not asking twice
    signedIn(undefined, { profile: { uid: "u1", name: "Amina", terms: undefined, createdAt: 1 } }); // the profile's snapshot
    view.rerender(<I18nProvider lang="en"><MemoryRouter><TermsPrompt /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(h.calls).toHaveLength(2));
    await settle();
    expect(screen.queryByRole("button", { name: "I agree" })).toBeNull();
  });

  it("a version published meanwhile ('legal-version') reads the file again, and the banner asks for that one", async () => {
    publish(1, 1);
    signedIn({ privacy: 0, terms: 1 });
    h.answer = async () => { throw Object.assign(new Error("not the version published now"), { details: { reason: "legal-version" } }); };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I agree" }));
    publish(2, 1);
    await waitFor(() => expect(h.fetched).toBe(2));
    h.answer = async () => ({ ok: true, recorded: true });
    fireEvent.click(await screen.findByRole("button", { name: "I agree" }));
    await waitFor(() => expect(h.calls.at(-1)).toEqual(["acceptTerms", { privacy: 2, terms: 1 }]));
  });

  it("a failed call (offline) leaves the banner for another try", async () => {
    publish(1, null);
    signedIn(undefined);
    h.answer = async () => { throw new Error("internal"); };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I agree" }));
    await waitFor(() => expect(h.calls).toHaveLength(1));
    await settle();
    expect(screen.getByRole("button", { name: "I agree" })).toBeTruthy();
  });
});
