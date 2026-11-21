// A project draft belongs to one person on this phone (lesson/ProjectView readDraft, lesson/engine draftKey): on a shared
// phone or lab PC the next account, or a guest, opens the step empty; signing out and deleting the account remove the
// account's drafts; a draft from before drafts had a scope that was sent goes to the account that sent it or is dropped,
// and one that was never sent (it names nobody) goes to whoever opens its step first, as before scopes: it is never deleted.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import type { ProjectStep } from "../src/content/types";

const h = vi.hoisted(() => ({
  uid: null as string | null, offlineUid: null as string | null,
  signOut: vi.fn(async () => {}), deleteAccount: vi.fn(), dispatch: vi.fn(),
}));
vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: h.uid ? { uid: h.uid, displayName: "Amina", email: "a@gmail.com" } : null, profile: h.uid ? { uid: h.uid, name: "Amina", orgId: null } : null, role: "learner", orgId: null, offlineUid: h.offlineUid, signOut: h.signOut }),
}));
vi.mock("../src/state/myWork", () => ({ useMyWork: () => ({}), latestFor: () => undefined, forgetMyWork: () => {} }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }), call: () => vi.fn(async () => ({})) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { deleteAccount: h.deleteAccount, exportAccountData: vi.fn() } }));
vi.mock("../src/state/store", async (orig) => ({ ...(await orig<typeof import("../src/state/store")>()), useStore: () => ({ state: {}, dispatch: h.dispatch }) }));

const { ProjectView, readDraft, milestoneSentAt } = await import("../src/lesson/ProjectView");
const { clearDrafts, clearRuns, draftKey, saveRun } = await import("../src/lesson/engine");
const { adoptDrafts, hasUnsent } = await import("../src/state/store");
const { MyData } = await import("../src/account/MyData");

const PROJECT: ProjectStep = { id: "p1", type: "project", prompt: { en: "Try it" }, task: { en: "Do it." }, deliverable: { en: "A photo." }, rubric: [{ criterion: { en: "Done" } }] };
const MILESTONE: ProjectStep = { ...PROJECT, id: "m1", evidence: [{ kind: "repo" }] };
/** As drafts were keyed before they had a scope. */
const OLD = "darsi-project-draft:l1:p1";
const as = (uid: string | null, offlineUid: string | null = null) => { h.uid = uid; h.offlineUid = offlineUid; };
const view = (step: ProjectStep = PROJECT) => render(<I18nProvider lang="en"><ProjectView step={step} lessonId="l1" unitId="u1" onReady={() => {}} /></I18nProvider>);
const box = () => screen.getByLabelText("Your evidence") as HTMLTextAreaElement;
const keys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k.startsWith("darsi-project-draft:")).sort();

beforeEach(() => { localStorage.clear(); as(null); vi.clearAllMocks(); });
afterEach(cleanup);

describe("a project draft on a shared phone", () => {
  it("is its writer's: the next account and a guest open the step empty, and the writer finds it again", () => {
    as("A");
    view();
    fireEvent.change(box(), { target: { value: "Amina’s class tried it on Monday." } });
    cleanup();
    expect(keys()).toEqual(["darsi-project-draft:A:l1:p1"]);

    as("B");
    view();
    expect(box().value).toBe("");
    fireEvent.change(box(), { target: { value: "B’s own work" } });
    cleanup();

    as(null);
    view();
    expect(box().value).toBe("");
    cleanup();

    as("A");
    view();
    expect(box().value).toBe("Amina’s class tried it on Monday.");
    expect(readDraft("l1", "p1", "B").text).toBe("B’s own work");
  });

  it("stays the account's while it is signed in but offline before Firebase loaded (offlineUid)", () => {
    as("A");
    view();
    fireEvent.change(box(), { target: { value: "Typed online" } });
    cleanup();
    as(null, "A");
    view();
    expect(box().value).toBe("Typed online");
  });

  it("keeps a guest's draft for the guest, and under the guest's own key", () => {
    view();
    fireEvent.change(box(), { target: { value: "A guest’s notes" } });
    cleanup();
    expect(keys()).toEqual([draftKey("guest", "l1", "p1")]);
    as("A");
    view();
    expect(box().value).toBe("");
  });

  it("shows a milestone as sent only to the account that sent it, from its own draft", () => {
    localStorage.setItem(draftKey("A", "l1", "m1"), JSON.stringify({ text: "Done", sentAt: 1_700_000_000_000, sentBy: "A" }));
    expect(milestoneSentAt("l1", "m1", "A")).toBe(1_700_000_000_000);
    expect(milestoneSentAt("l1", "m1", "B")).toBeUndefined();
    expect(milestoneSentAt("l1", "m1", null)).toBeUndefined();
    as("B");
    view(MILESTONE);
    expect(screen.queryByText(/^Sent on /)).toBeNull();
    expect(box().value).toBe("");
  });
});

describe("a milestone improved after it was sent", () => {
  const SENT = 1_700_000_000_000;
  const sent = () => localStorage.setItem(draftKey("A", "l1", "m1"), JSON.stringify({ text: "Done", repo: "https://github.com/a/b", sentAt: SENT, sentId: "s1", sentBy: "A" }));

  it("is unsent work again: the change is stamped after the send, which stays as it was, and a sign-out keeps it", () => {
    sent();
    as("A");
    view(MILESTONE);
    expect(hasUnsent("A", true)).toBe(false); // sent, and not touched since: a sign-out clears it
    fireEvent.click(screen.getByRole("button", { name: "Improve it and send again" }));
    expect(hasUnsent("A", true)).toBe(false); // reopened, nothing typed
    expect(readDraft("l1", "m1", "A").editedAt).toBeUndefined();
    fireEvent.change(box(), { target: { value: "Done, and now with the second sensor" } });
    const d = readDraft("l1", "m1", "A");
    expect(d).toMatchObject({ text: "Done, and now with the second sensor", sentAt: SENT, sentId: "s1", sentBy: "A" });
    expect(d.editedAt).toBeGreaterThan(SENT);
    expect(hasUnsent("A", true)).toBe(true); // what Sign out and an ended session ask before clearRuns
    expect(hasUnsent("B", true)).toBe(false);
  });

  it("a tap that changes nothing (the AI answer already chosen) leaves it sent; sending the rework makes it sent again", async () => {
    localStorage.setItem(draftKey("A", "l1", "m1"), JSON.stringify({ text: "Done", explain: "It reads the sensor.", ai: "none", repo: "https://github.com/a/b", sentAt: SENT, sentId: "s1", sentBy: "A" }));
    as("A");
    view(MILESTONE);
    fireEvent.click(screen.getByRole("button", { name: "Improve it and send again" }));
    fireEvent.click(screen.getByRole("radio", { name: "No, I did it without AI" })); // already chosen
    expect(readDraft("l1", "m1", "A").editedAt).toBeUndefined();
    expect(hasUnsent("A", true)).toBe(false);
    fireEvent.change(box(), { target: { value: "Done, with the second sensor" } });
    expect(hasUnsent("A", true)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Check and send" }));
    await waitFor(() => expect(readDraft("l1", "m1", "A").sentAt).toBeGreaterThan(SENT));
    const d = readDraft("l1", "m1", "A");
    expect(d.text).toBe("Done, with the second sensor");
    expect(d.sentAt).toBeGreaterThanOrEqual(d.editedAt!);
    expect(hasUnsent("A", true)).toBe(false); // the rework is with the reviewer: a sign-out clears it, as before
  });
});

describe("a draft from before drafts had a scope", () => {
  const sentByA = JSON.stringify({ text: "A’s milestone", sentAt: 1_700_000_000_000, sentBy: "A" });

  it("is adopted by the account that sent it, and the unscoped copy leaves the phone", () => {
    localStorage.setItem(OLD, sentByA);
    expect(readDraft("l1", "p1", "A")).toMatchObject({ text: "A’s milestone", sentBy: "A" });
    expect(keys()).toEqual(["darsi-project-draft:A:l1:p1"]);
    expect(readDraft("l1", "p1", "A").text).toBe("A’s milestone"); // and again, from its own key
  });

  it("is never adopted by another account, even when that one opens the step first: it is deleted", () => {
    localStorage.setItem(OLD, sentByA);
    as("B");
    view();
    expect(box().value).toBe("");
    expect(keys()).toEqual([]);
    cleanup();
    // Nor by a guest.
    localStorage.setItem(OLD, sentByA);
    as(null);
    view();
    expect(box().value).toBe("");
    expect(keys()).toEqual([]);
  });

  it("goes to a guest who opens the step when it was never sent", () => {
    localStorage.setItem(OLD, JSON.stringify({ text: "Typed before signing up" }));
    view();
    expect(box().value).toBe("Typed before signing up");
    expect(keys()).toEqual(["darsi-project-draft:guest:l1:p1"]);
  });

  // The app before scopes wrote `sentBy` only after a milestone was sent, and only signed-in people can send: nearly
  // every unsent draft on a phone that takes the update is a signed-in person's typed work. It must not be deleted.
  it("is kept for a signed-in account that never sent it: the step opens with the work, under the account's key", () => {
    localStorage.setItem(OLD, JSON.stringify({ text: "Typed last week, not sent yet", explain: "How it works" }));
    as("A");
    view();
    expect(box().value).toBe("Typed last week, not sent yet");
    expect(keys()).toEqual(["darsi-project-draft:A:l1:p1"]);
    cleanup();
    // It is A's from then on: the next account and a guest open the step empty.
    as("B");
    view();
    expect(box().value).toBe("");
    cleanup();
    as(null);
    view();
    expect(box().value).toBe("");
    expect(readDraft("l1", "p1", "A")).toMatchObject({ text: "Typed last week, not sent yet", explain: "How it works" });
  });

  it("keeps a milestone whose send was refused (no sentBy), also when the lesson only looks for the first one not sent", () => {
    localStorage.setItem("darsi-project-draft:l1:m1", JSON.stringify({ text: "Refused: try again later", repo: "https://github.com/a/b" }));
    expect(milestoneSentAt("l1", "m1", "A")).toBeUndefined(); // LessonScreen's read, before the step is opened
    expect(keys()).toEqual(["darsi-project-draft:A:l1:m1"]);
    as("A");
    view(MILESTONE);
    expect(box().value).toBe("Refused: try again later");
    expect(screen.queryByText(/^Sent on /)).toBeNull();
  });

  it("never replaces the draft the reader already has, and an unreadable one is just dropped", () => {
    localStorage.setItem(draftKey("A", "l1", "p1"), JSON.stringify({ text: "Newer" }));
    localStorage.setItem(OLD, sentByA);
    expect(readDraft("l1", "p1", "A").text).toBe("Newer");
    expect(keys()).toEqual(["darsi-project-draft:A:l1:p1"]);
    localStorage.clear();
    localStorage.setItem(OLD, "{not json");
    expect(readDraft("l1", "p1").text).toBe("");
    expect(keys()).toEqual([]);
  });
});

describe("signing out, and deleting the account", () => {
  const seed = () => {
    localStorage.setItem(draftKey("A", "l1", "p1"), JSON.stringify({ text: "A1" }));
    localStorage.setItem(draftKey("A", "cap", "m2"), JSON.stringify({ text: "A2", sentAt: 5, sentBy: "A" }));
    localStorage.setItem(draftKey("B", "l1", "p1"), JSON.stringify({ text: "B1" }));
    localStorage.setItem(draftKey("guest", "l1", "p1"), JSON.stringify({ text: "G1" }));
    localStorage.setItem("darsi-project-draft:old:m1", JSON.stringify({ text: "A, before scopes", sentBy: "A" }));
    localStorage.setItem("darsi-project-draft:old:m2", JSON.stringify({ text: "B, before scopes", sentBy: "B" }));
    localStorage.setItem("darsi-project-draft:old:p9", JSON.stringify({ text: "never sent" }));
  };
  const others = ["darsi-project-draft:B:l1:p1", "darsi-project-draft:guest:l1:p1", "darsi-project-draft:old:m2", "darsi-project-draft:old:p9"];

  it("clearRuns('A'), the sign-out call, removes A's drafts and lessons in progress and leaves B's and the guest's", () => {
    seed();
    const snap = { v: 1 as const, ids: ["s1"], index: 1, results: {}, retried: [], seconds: 3, at: Date.now() };
    saveRun("A", "l1", snap); saveRun("B", "l1", snap);
    clearRuns("A");
    expect(keys()).toEqual(others);
    expect(localStorage.getItem("darsi:run:A:l1")).toBeNull();
    expect(localStorage.getItem("darsi:run:B:l1")).not.toBeNull();
  });

  it("“Reset progress on this device” (clearRuns with no scope) leaves every draft where it is", () => {
    seed();
    clearRuns();
    expect(keys()).toHaveLength(7);
  });

  it("deleting the account in Me removes its drafts from this phone, and nobody else's", async () => {
    seed();
    as("A");
    h.deleteAccount.mockResolvedValue({ ok: true });
    render(<I18nProvider lang="en"><MemoryRouter><MyData /></MemoryRouter></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account and my data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    expect(keys()).toEqual(others); // gone before the sign-out, which may fail for an account that no longer exists
    expect(h.dispatch).toHaveBeenCalledWith({ type: "reset" });
  });

  it("a refused deletion (sign in again first) keeps the drafts", async () => {
    seed();
    as("A");
    h.deleteAccount.mockRejectedValue(Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason: "recent-login" } }));
    render(<I18nProvider lang="en"><MemoryRouter><MyData /></MemoryRouter></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account and my data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(keys()).toHaveLength(7);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("clearDrafts takes only the named person's", () => {
    seed();
    clearDrafts("B");
    expect(keys()).not.toContain("darsi-project-draft:B:l1:p1");
    expect(keys()).not.toContain("darsi-project-draft:old:m2");
    expect(keys()).toHaveLength(5);
  });
});

describe("the guest who just made an account (the store's adoption)", () => {
  it("brings the drafts typed as a guest, without replacing one the account already has", () => {
    localStorage.setItem(draftKey("guest", "l1", "p1"), JSON.stringify({ text: "typed as a guest" }));
    localStorage.setItem(draftKey("guest", "l2", "p1"), JSON.stringify({ text: "guest, l2" }));
    localStorage.setItem(draftKey("N", "l2", "p1"), JSON.stringify({ text: "the account’s own" }));
    localStorage.setItem("darsi-project-draft:l3:p1", JSON.stringify({ text: "before scopes, never sent" }));
    localStorage.setItem("darsi-project-draft:l4:p1", JSON.stringify({ text: "someone else’s", sentBy: "A" }));
    localStorage.setItem(draftKey("B", "l1", "p1"), JSON.stringify({ text: "B1" }));
    adoptDrafts("N");
    expect(readDraft("l1", "p1", "N").text).toBe("typed as a guest");
    expect(readDraft("l2", "p1", "N").text).toBe("the account’s own");
    expect(readDraft("l3", "p1", "N").text).toBe("before scopes, never sent");
    expect(keys()).toEqual(["darsi-project-draft:B:l1:p1", "darsi-project-draft:N:l1:p1", "darsi-project-draft:N:l2:p1", "darsi-project-draft:N:l3:p1", "darsi-project-draft:l4:p1"]);
  });
});
