// The staff kit (src/staff): what every admin screen says when something fails or loads, the "leave without saving?"
// hold, and the question asked on the page before a destructive action.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider, useI18n } from "../src/i18n";
import { errorText, reasonText } from "../src/staff/errors";
import { ErrorNote, LoadState, useRead, type Read } from "../src/staff/LoadState";
import { InlineConfirm } from "../src/staff/InlineConfirm";
import { useLeaveGuard } from "../src/staff/useLeaveGuard";
import "../src/admin/strings";
import en from "../src/staff/strings/en.json";
import ar from "../src/staff/strings/ar.json";
import adminEn from "../src/admin/strings/en.json";
import adminAr from "../src/admin/strings/ar.json";

const ui = (node: ReactNode, lang = "en") => render(<I18nProvider lang={lang}>{node}</I18nProvider>);
/** errorText as a screen calls it, in a language. */
function Says({ e }: { e: unknown }) { const { t } = useI18n(); return <p data-testid="says">{errorText(e, t)}</p>; }
const says = (e: unknown, lang = "en") => { const r = ui(<Says e={e} />, lang); const text = screen.getByTestId("says").textContent ?? ""; r.unmount(); return text; };
/** An error as the Functions SDK throws it for a refusal. */
const refusal = (reason: string, message = "Server English that must never show.", code = "functions/failed-precondition") => Object.assign(new Error(message), { code, details: { reason } });

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logged = vi.spyOn(console, "error").mockImplementation(() => {}); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });
afterEach(() => { logged.mockRestore(); });

describe("errorText", () => {
  it("words a refusal the kit knows, in English and in Arabic", () => {
    expect(says(refusal("org-suspended"))).toBe(en["st.rf.orgSuspended"]);
    expect(says(refusal("org-suspended"), "ar")).toBe(ar["st.rf.orgSuspended"]);
    expect(says(refusal("no-grant", "You have no access to this course's results.", "functions/permission-denied"), "ar")).toBe(ar["st.rf.noGrant"]);
  });

  it("uses the admin screens' own words for the refusals they already knew", () => {
    expect(says(refusal("self-role"))).toBe(adminEn["rf.selfRole"]);
    expect(says(refusal("self-role"), "ar")).toBe(adminAr["rf.selfRole"]);
  });

  it("where the admin strings aren't loaded (/results), an older refusal gets its code's sentence, never a bare key", () => {
    const t = (key: string) => (en as Record<string, string>)[key] ?? key;
    expect(errorText(refusal("self-role"), t)).toBe(en["st.err.failedPrecondition"]);
    // A right-to-left language isolates a string it doesn't have: still "not there".
    expect(errorText(refusal("self-role"), (key) => (ar as Record<string, string>)[key] ?? `\u2066${key}\u2069`)).toBe(ar["st.err.failedPrecondition"]);
    expect(reasonText("last-admin", t)).toBe(en["st.err.generic"]);
  });

  it("says a fresh sign-in is needed without naming one action (the code guards more than one)", () => {
    expect(says(refusal("recent-login"))).toBe(en["st.rf.recentLogin"]);
  });

  it("turns the SDK's codes into sentences: permission-denied and unavailable in Arabic", () => {
    expect(says(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }), "ar")).toBe(ar["st.err.permissionDenied"]);
    expect(says(Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" }), "ar")).toBe(ar["st.err.unavailable"]);
    expect(says(Object.assign(new Error("User does not have permission to access 'x'."), { code: "storage/unauthorized" }), "ar")).toBe(ar["st.err.storageUnauthorized"]);
    expect(says(Object.assign(new Error("deadline-exceeded"), { code: "functions/deadline-exceeded" }))).toBe(en["st.err.deadlineExceeded"]);
  });

  it("falls back to the code's sentence for a refusal code this app doesn't know yet (a newer server)", () => {
    expect(says(refusal("some-new-code", "Brand new English.", "functions/permission-denied"))).toBe(en["st.err.permissionDenied"]);
  });

  it("gives one generic sentence for anything else, never the raw text, and logs the raw text for a problem report", () => {
    for (const e of [new Error("TypeError: x is undefined at foo.js:1"), "boom", null, { code: "functions/already-exists", message: "ALREADY_EXISTS" }]) {
      expect(says(e)).toBe(en["st.err.generic"]);
      expect(says(e, "ar")).toBe(ar["st.err.generic"]);
    }
    expect(logged.mock.calls.some((c: unknown[]) => c.join(" ").includes("TypeError: x is undefined"))).toBe(true);
  });

  it("a code named like something every object has ('constructor') is an unknown code, not a crash", () => {
    const t = (key: string) => (en as Record<string, string>)[key] ?? key;
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(says(refusal(name, "x", `functions/${name}`)), name).toBe(en["st.err.generic"]);
      expect(says({ code: name }), name).toBe(en["st.err.generic"]);
      expect(reasonText(name, t), name).toBe(en["st.err.generic"]);
    }
  });

  it("says 'you're offline' when the phone is, instead of the SDK's 'internal'", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    expect(says(Object.assign(new Error("internal"), { code: "functions/internal" }))).toBe(en["st.err.offline"]);
    // A refusal the server did send still says its own reason.
    expect(says(refusal("org-deleting"))).toBe(en["st.rf.orgDeleting"]);
  });

  it("words a bulk row's reason, which is not a thrown error", () => {
    const t = (key: string) => (en as Record<string, string>)[key] ?? (adminEn as Record<string, string>)[key] ?? key;
    expect(reasonText("platform-suspended", t)).toBe(en["st.rf.platformSuspended"]);
    expect(reasonText("last-admin", t)).toBe(adminEn["po.lastAdmin"]);
    expect(reasonText("who-knows", t)).toBe(en["st.err.generic"]);
    expect(reasonText(undefined, t)).toBe(en["st.err.generic"]);
  });

  it("has every string in both languages, with the same variables and no middle dot in Arabic", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(ar[key], key).toBeTruthy();
      expect(ar[key], key).not.toContain("·");
      expect(vars(ar[key]), key).toBe(vars(en[key]));
    }
    // Every code in the kit's map has its words.
    const src = readFileSync(join(__dirname, "../src/staff/errors.ts"), "utf8");
    for (const key of src.match(/"st\.[\w.]+"/g) ?? []) expect(en, key).toHaveProperty([key.slice(1, -1)]);
  });
});

describe("LoadState", () => {
  const View = ({ q }: { q: Read<string[]> }) => <LoadState q={q} empty={<p>Nobody yet.</p>}>{(list) => <ul>{list.map((x) => <li key={x}>{x}</li>)}</ul>}</LoadState>;

  it("says Loading to screen readers while the first read is out", () => {
    ui(<View q={{ loading: true, reload: () => {} }} />);
    expect(screen.getByRole("status").textContent).toBe("Loading");
    expect(screen.queryByText("Nobody yet.")).toBeNull();
  });

  it("shows a failed read as an alert with Retry, and never as the empty state", () => {
    const reload = vi.fn();
    ui(<View q={{ loading: false, error: Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }), reload }} />);
    expect(screen.getByRole("alert").textContent).toContain(en["st.err.permissionDenied"]);
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
    expect(screen.queryByText("Nobody yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows the data, the empty state for an empty list, and older data under a notice when a reload failed", () => {
    const { rerender } = ui(<View q={{ loading: false, data: ["Sara"], reload: () => {} }} />);
    expect(screen.getByText("Sara")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<I18nProvider lang="en"><View q={{ loading: false, data: [], reload: () => {} }} /></I18nProvider>);
    expect(screen.getByText("Nobody yet.")).toBeTruthy();
    rerender(<I18nProvider lang="en"><View q={{ loading: false, data: ["Sara"], error: Object.assign(new Error("x"), { code: "unavailable" }), reload: () => {} }} /></I18nProvider>);
    expect(screen.getByText("Sara")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(en["st.stale"]);
    expect(screen.getByRole("alert").textContent).toContain(en["st.err.unavailable"]);
  });

  it("useRead: loading, then an error with Retry that reads again, and a failed reload keeps what was shown", async () => {
    const answers: (() => Promise<string[]>)[] = [() => Promise.reject(Object.assign(new Error("x"), { code: "unavailable" })), () => Promise.resolve(["Sara"]), () => Promise.reject(Object.assign(new Error("y"), { code: "unavailable" }))];
    const load = vi.fn(() => answers.shift()!());
    function Screen() { const q = useRead(load, ["o1"]); return <><View q={q} /><button onClick={q.reload}>again</button></>; }
    ui(<Screen />);
    expect(screen.getByRole("status").textContent).toBe("Loading");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "again" }));
    expect((await screen.findByRole("alert")).textContent).toContain(en["st.stale"]);
    expect(screen.getByText("Sara")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("ErrorNote alone says the reason without a Retry it can't do", () => {
    ui(<ErrorNote error={refusal("no-grant")} />, "ar");
    expect(screen.getByRole("alert").textContent).toBe(ar["st.rf.noGrant"]);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("useLeaveGuard", () => {
  function Form({ dirty, onNav }: { dirty: boolean; onNav: (where: string) => void }) {
    const panel = useRef<HTMLDivElement>(null);
    const g = useLeaveGuard(dirty, { panel });
    // preventDefault: jsdom doesn't navigate; the handlers stand in for the router's.
    const go = (where: string) => (e: { preventDefault: () => void }) => { e.preventDefault(); onNav(where); };
    return (
      <>
        <header className="dr-appbar"><button onClick={() => onNav("back")}>Back</button></header>
        <a href="/admin/people?tab=invite#codes" onClick={go("people")}>People</a>
        <a href="https://example.org/help" onClick={go("elsewhere")}>Help</a>
        <a href="/admin/guide" target="_blank" onClick={go("new tab")}>Guide</a>
        <div ref={panel}><a href="/admin/inside" onClick={go("inside")}>Inside the form</a></div>
        {g.asking && <div role="alertdialog"><span data-testid="target">{String(g.target)}</span><button onClick={g.stay}>Stay</button><button onClick={g.leave}>Leave</button></div>}
      </>
    );
  }

  it("holds an in-app link and Back while there are unsaved changes, and leave() goes where the person was heading", () => {
    const onNav = vi.fn();
    render(<Form dirty onNav={onNav} />);
    fireEvent.click(screen.getByText("People"));
    expect(onNav).not.toHaveBeenCalled();
    expect(screen.getByTestId("target").textContent).toBe("/admin/people?tab=invite#codes");
    fireEvent.click(screen.getByText("Stay"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("People"));
    fireEvent.click(screen.getByText("Leave"));
    expect(onNav).toHaveBeenCalledWith("people");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("target").textContent).toBe("null");
    fireEvent.click(screen.getByText("Leave"));
    expect(onNav).toHaveBeenLastCalledWith("back");
  });

  it("never holds the form's own links, another site, a new tab or a modified click", () => {
    const onNav = vi.fn();
    render(<Form dirty onNav={onNav} />);
    fireEvent.click(screen.getByText("Inside the form"));
    fireEvent.click(screen.getByText("Help"));
    fireEvent.click(screen.getByText("Guide"));
    fireEvent.click(screen.getByText("People"), { ctrlKey: true });
    expect(onNav.mock.calls.map((c) => c[0])).toEqual(["inside", "elsewhere", "new tab", "people"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("lets everything through when nothing is unsaved, and asks the browser to confirm closing the tab only while dirty", () => {
    const onNav = vi.fn();
    const { rerender } = render(<Form dirty={false} onNav={onNav} />);
    fireEvent.click(screen.getByText("People"));
    expect(onNav).toHaveBeenCalledWith("people");
    const closing = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(closing()).toBe(false);
    rerender(<Form dirty onNav={onNav} />);
    expect(closing()).toBe(true);
    // Saved while the question was up: the question goes, and a later change doesn't bring the old one back.
    fireEvent.click(screen.getByText("People"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    rerender(<Form dirty={false} onNav={onNav} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    rerender(<Form dirty onNav={onNav} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(closing()).toBe(true);
  });
});

describe("InlineConfirm", () => {
  function Row({ onConfirm }: { onConfirm: () => void }) {
    const [asking, setAsking] = useState(false);
    return (
      <>
        <button onClick={() => setAsking(true)}>Remove Sara</button>
        {asking && <InlineConfirm danger title="Remove Sara?" body="She keeps her learning." confirmLabel="Remove" onConfirm={() => { onConfirm(); setAsking(false); }} onCancel={() => setAsking(false)} />}
      </>
    );
  }

  it("is a named alert dialog that takes the focus to Cancel and gives it back on cancel", () => {
    ui(<Row onConfirm={() => {}} />);
    const opener = screen.getByRole("button", { name: "Remove Sara" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("alertdialog", { name: "Remove Sara?" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("She keeps her learning.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("gives the focus back after confirming too, and Escape cancels", () => {
    const onConfirm = vi.fn();
    ui(<Row onConfirm={onConfirm} />);
    const opener = screen.getByRole("button", { name: "Remove Sara" });
    opener.focus();
    fireEvent.click(opener);
    const confirm = screen.getByRole("button", { name: "Remove" });
    confirm.focus();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("while busy: the action can't run twice, Cancel and Escape wait, and the Cancel label is the screen's language", () => {
    const onConfirm = vi.fn(), onCancel = vi.fn();
    ui(<InlineConfirm title="هل تزيل الصلاحية؟" confirmLabel="أزِل" busy onConfirm={onConfirm} onCancel={onCancel}><span>why it failed</span></InlineConfirm>, "ar");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "أزِل" })); });
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "إلغاء" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("why it failed")).toBeTruthy();
  });
});
