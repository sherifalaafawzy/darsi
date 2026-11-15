// An organization's homepage: the builder (admin/PageBuilder.tsx: add, write per language, put in order by keyboard,
// buttons or dragging, remove, save, publish, unpublish), and the page itself (landing/SiteBlocks.tsx).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import type { OrgPage } from "../src/content/page";

const m = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  answer: { page: null as unknown, rev: 0, publishedRev: null as number | null, publishedAt: null as number | null },
  refuse: null as null | { reason: string; problems?: unknown[] },
  uploads: [] as string[],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: async () => ({}), firebaseReady: true, call: () => vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, p: string) => p, uploadBytes: async (p: string) => { m.uploads.push(p); } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "a1" }, role: "orgAdmin", orgId: "o1" }) }));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), useOrg: () => ({ data: { id: "o1", name: "Nile School", site: { host: "learn.nile.edu" } }, reload: vi.fn() }) }));
vi.mock("../src/auth/api", async (orig) => {
  const real = await orig<typeof import("../src/auth/api")>();
  return { ...real, api: { ...real.api, manageOrgPage: async (a: Record<string, unknown>) => {
    m.calls.push(a);
    if (a.action === "get") return m.answer;
    if (m.refuse) throw Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: m.refuse });
    return a.action === "publish" ? { ok: true, rev: 2, publishedAt: 1794500000000 } : { ok: true, rev: 1, problems: [] };
  } } };
});

const { PageBuilder } = await import("../src/admin/PageBuilder");
const { SiteBlocks } = await import("../src/landing/SiteBlocks");

beforeEach(() => { m.calls = []; m.answer = { page: null, rev: 0, publishedRev: null, publishedAt: null }; m.refuse = null; m.uploads = []; });
const ui = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={["/admin/page"]}><Routes><Route path="/admin/page" element={<PageBuilder />} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider>);
const saved = () => m.calls.filter((c) => c.action !== "get").at(-1)!.page as OrgPage;

describe("the homepage builder", () => {
  it("adds a text block, writes it in English and Arabic, previews it, and saves", async () => {
    ui();
    await screen.findByText(/Not published yet/);
    expect(screen.getByRole("link", { name: "learn.nile.edu" }).getAttribute("href")).toBe("https://learn.nile.edu/");
    fireEvent.click(within(screen.getByRole("group", { name: "Add a block:" })).getByRole("button", { name: "Text" }));
    fireEvent.change(screen.getByLabelText("Heading (optional)"), { target: { value: "Welcome" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "We teach AI." } });
    expect(within(screen.getByRole("region", { name: "Preview" })).getByRole("heading", { name: "Welcome" })).toBeTruthy();
    // Arabic: empty for now, so the field says what people will see instead.
    fireEvent.click(screen.getByRole("tab", { name: "العربية" }));
    const ar = screen.getByLabelText("Text") as HTMLTextAreaElement;
    expect(ar.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText(/people see “We teach AI.”/)).toBeTruthy();
    fireEvent.change(ar, { target: { value: "نعلّم الذكاء الاصطناعي." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved. Publish when you want people to see it.");
    expect(saved().blocks[0]).toMatchObject({ kind: "text", heading: { en: "Welcome" }, body: { en: "We teach AI.", ar: "نعلّم الذكاء الاصطناعي." } });
  });

  it("puts blocks in order with the handle's arrow keys, the buttons, and a drag", async () => {
    m.answer = { page: { v: 1, langs: ["en"], blocks: [
      { id: "aaaa1", kind: "text", heading: { en: "One" }, body: { en: "1" } },
      { id: "aaaa2", kind: "text", heading: { en: "Two" }, body: { en: "2" } },
      { id: "aaaa3", kind: "text", heading: { en: "Three" }, body: { en: "3" } },
    ] }, rev: 1, publishedRev: 1, publishedAt: 1794400000000 };
    ui();
    await screen.findByText(/Published on/);
    const order = () => Array.from(document.querySelectorAll(".pb-block-title"), (b) => b.textContent);
    expect(order()).toEqual(["Text — One", "Text — Two", "Text — Three"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move the Text block, 1 of 3" }), { key: "ArrowDown" });
    expect(order()).toEqual(["Text — Two", "Text — One", "Text — Three"]);
    expect(screen.getByRole("status", { name: "" }).textContent ?? "").toBeDefined();
    expect(screen.getByText("Text block moved to 2 of 3.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[2]);
    expect(order()).toEqual(["Text — Two", "Text — Three", "Text — One"]);
    // A drag: the handle of the first block, pointer moved below the last block's middle.
    const items = document.querySelectorAll(".pb-list > li");
    items.forEach((el, i) => { (el as HTMLElement).getBoundingClientRect = () => ({ top: i * 100, height: 100, bottom: i * 100 + 100, left: 0, right: 0, width: 0, x: 0, y: i * 100, toJSON: () => ({}) }); });
    const handle = screen.getByRole("button", { name: "Move the Text block, 1 of 3" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 260 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(order()).toEqual(["Text — Three", "Text — One", "Text — Two"]);
    expect(screen.getByText(/There are changes since then/)).toBeTruthy();
  });

  it("removes a block after asking, and shows what the server marks before publishing", async () => {
    m.answer = { page: { v: 1, langs: ["en"], blocks: [{ id: "aaaa1", kind: "button", label: { en: "Go" }, href: "ftp://x" }, { id: "aaaa2", kind: "text", heading: {}, body: { en: "Hi" } }] }, rev: 1, publishedRev: null, publishedAt: null };
    ui();
    await screen.findByText(/Not published yet/);
    m.refuse = { reason: "page-problems", problems: [{ block: 0, field: "href", code: "bad-link" }] };
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("“Where it goes” must start with https:// (or mailto: or tel: for a button).")).toBeTruthy();
    expect(screen.getAllByText("Fix what is marked on the page first.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove block" })[0]);
    fireEvent.click(within(screen.getByRole("alertdialog", { name: /Remove this block/ })).getByRole("button", { name: "Remove block" }));
    expect(Array.from(document.querySelectorAll(".pb-block-title"), (b) => b.textContent)).toEqual(["Text — Hi"]);
    m.refuse = null;
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Published. People see it at your web address within five minutes.");
    expect(saved().blocks).toHaveLength(1);
  });

  it("reads in Arabic, right to left", async () => {
    ui("ar");
    expect(await screen.findByText(/لم تُنشر بعد/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "نص" })).toBeTruthy();
  });
});

describe("the homepage blocks", () => {
  const page: OrgPage = { v: 1, langs: ["en", "ar"], blocks: [
    { id: "aaaa1", kind: "text", heading: { en: "About us", ar: "من نحن" }, body: { en: "First.\n\nSecond." } },
    { id: "aaaa2", kind: "faq", heading: {}, items: [{ q: { en: "When?" }, a: { en: "Mornings." } }] },
    { id: "aaaa3", kind: "contact", heading: {}, email: "info@nile.edu", phone: "+20 100 555 0199", address: {}, website: "https://nile.edu" },
    { id: "aaaa4", kind: "button", label: { en: "Bad" }, href: "javascript:alert(1)" },
  ] };
  it("draws text as text, falls back to the main language, and leaves out an unsafe link", () => {
    render(<I18nProvider lang="ar"><SiteBlocks page={page} /></I18nProvider>);
    expect(screen.getByRole("heading", { name: "من نحن" })).toBeTruthy();
    expect(screen.getByText("First.")).toBeTruthy();
    expect(screen.getByText("Second.")).toBeTruthy();
    expect(screen.getByText("When?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "info@nile.edu" }).getAttribute("href")).toBe("mailto:info@nile.edu");
    expect(screen.getByRole("link", { name: "+20 100 555 0199" }).getAttribute("href")).toBe("tel:+201005550199");
    expect(screen.queryByText("Bad")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});


