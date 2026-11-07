// The course editor (FS-ROLLBACK, FC-10): a course can go back to its published version, or the one before it, as one
// change Undo takes back; an imported file can replace an existing unit's draft; and only a capstone's project steps
// show the milestone fields, with the validator refusing milestone fields elsewhere and a capstone without a milestone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import ai1 from "../../../content/retired/ai-1.json";
import type { ProjectStep, Unit } from "../src/content/types";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

const m = vi.hoisted(() => ({
  got: null as unknown,
  data: { listUnits: vi.fn(), getUnit: vi.fn(), createUnit: vi.fn(), saveUnit: vi.fn(), unitExists: vi.fn(), readPublished: vi.fn(), markSame: vi.fn(), getSettings: vi.fn() },
  api: { publishUnit: vi.fn(), unpublishUnit: vi.fn(), deleteUnit: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn(), storageJSON: vi.fn() }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.data }));
vi.mock("../src/cms/api", async (orig) => ({ ...(await orig<typeof import("../src/cms/api")>()), cmsApi: m.api }));

const { ContentList } = await import("../src/cms/ContentList");
const { UnitEditor: Editor } = await import("../src/cms/UnitEditor");
const { LessonPlayer } = await import("../src/screens/LessonScreen");
const { canonical, publishedPath, statusOf } = await import("../src/cms/data");
const { errorsOf, validateUnit } = await import("../src/content/validate");
const UnitEditor = () => <Editor Player={LessonPlayer} />;

const unit = () => structuredClone(ai1) as unknown as Unit;
const meta = (u: Unit, extra = {}) => ({ id: u.id, owner: "public", title: u.title, track: u.track, level: u.level, lessonCount: u.lessons.length,
  lessons: u.lessons.map((l) => ({ id: l.id, title: l.title })), rev: 5, published: { version: 2, rev: 4 }, ...extra });
const wrap = (ui: ReactNode, url: string, path: string) => render(
  <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
const openEditor = async (u = unit(), extra = {}) => {
  m.got = { meta: meta(u, extra), unit: u };
  wrap(<UnitEditor />, `/super/content/${u.id}`, "/super/content/:unitId");
  return screen.findByRole("navigation", { name: "Outline" });
};
const lastSaved = () => m.data.saveUnit.mock.calls[m.data.saveUnit.mock.calls.length - 1][0] as Unit;

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
beforeEach(() => {
  vi.clearAllMocks();
  m.data.getUnit.mockImplementation(async () => m.got);
  m.data.saveUnit.mockResolvedValue({ rev: 6 });
  m.data.markSame.mockResolvedValue(null);
  m.data.unitExists.mockResolvedValue(false);
  m.data.listUnits.mockResolvedValue([]);
});

describe("going back to a published version", () => {
  it("brings back the version before the live one, as one change that Undo takes back, and saves it", async () => {
    const old = { ...unit(), title: { en: "AI basics, as published in v1", ar: "أساسيات الذكاء الاصطناعي" } };
    m.data.readPublished.mockResolvedValue(old);
    await openEditor();
    expect(screen.getByRole("button", { name: "Bring back the published version (v2)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go back to version 1" }));
    expect(screen.getByText(/Replace the draft with version 1\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bring it back" }));
    expect(await screen.findByText("Version 1 is back in the draft. Publish to put it live.")).toBeTruthy();
    expect(m.data.readPublished).toHaveBeenCalledWith("public", "ai-1", 1);
    expect(screen.getAllByText("AI basics, as published in v1").length).toBeGreaterThan(0);
    // Undo puts the draft as it was; Redo brings the old version back, and it saves like any edit.
    fireEvent.click(within(screen.getByText(/Version 1 is back/).parentElement!).getByRole("button", { name: "Undo" }));
    expect((await screen.findAllByText("AI basics for teachers")).length).toBeGreaterThan(0);
    expect(screen.queryByText("AI basics, as published in v1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalled());
    expect(lastSaved().title.en).toBe("AI basics, as published in v1");
  });

  it("drops changes not yet published by bringing back the live version, which then reads as published", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      m.data.readPublished.mockResolvedValue(unit());
      await openEditor({ ...unit(), title: { en: "Not published yet", ar: "لم يُنشر بعد" } });
      await waitFor(() => expect(m.data.readPublished).toHaveBeenCalledWith("public", "ai-1", 2)); // the open checks it once
      expect(screen.getByText("Changes not published (v2 is live)")).toBeTruthy(); // it differs
      fireEvent.click(screen.getByRole("button", { name: "Bring back the published version (v2)" }));
      fireEvent.click(screen.getByRole("button", { name: "Bring it back" }));
      expect(await screen.findByText("The draft is the published version (v2) again.")).toBeTruthy();
      expect(await screen.findByText("Published (v2)")).toBeTruthy(); // at once, before it saves
      expect(screen.queryByRole("button", { name: /Bring back the published version/ })).toBeNull();
      // It saves by itself, marked as the live version's content, so the list says published too.
      await act(async () => { vi.advanceTimersByTime(3100); });
      await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ title: unit().title }), 5, "me", 2));
      expect(screen.getByText("Published (v2)")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("shows a draft that already holds the live version as published, and marks it, without publishing", async () => {
    m.data.readPublished.mockResolvedValue(unit());
    m.data.markSame.mockResolvedValue({ rev: 6 });
    await openEditor(); // rev 5, v2 made from rev 4: "changes not published" by the numbers
    expect(await screen.findByText("Published (v2)")).toBeTruthy();
    await waitFor(() => expect(m.data.markSame).toHaveBeenCalledWith("ai-1", 5, 2, "me"));
    expect(screen.queryByRole("button", { name: /Bring back the published version/ })).toBeNull();
    expect(m.api.publishUnit).not.toHaveBeenCalled();
    expect(m.data.saveUnit).not.toHaveBeenCalled();
  });

  it("counts a marked draft as published, until a later save or publish moves on", () => {
    const pub = { version: 2, rev: 4 };
    expect(statusOf({ rev: 6, published: pub, same: { version: 2, rev: 6 } })).toBe("live");
    expect(statusOf({ rev: 7, published: pub, same: { version: 2, rev: 6 } })).toBe("changed");
    expect(statusOf({ rev: 6, published: { version: 3, rev: 5 }, same: { version: 2, rev: 6 } })).toBe("changed");
    expect(statusOf({ rev: 6, published: null, same: { version: 2, rev: 6 } })).toBe("draft");
    expect(canonical({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: undefined } })).toBe(canonical({ a: { d: [1, { e: 3, f: 2 }] }, b: 1 }));
  });

  it("offers only what exists: nothing to bring back when the draft is live, no older version after v1, nothing for a draft", async () => {
    await openEditor(unit(), { rev: 4, published: { version: 1, rev: 4 } });
    expect(screen.queryByRole("button", { name: /Bring back the published version/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Go back to version/ })).toBeNull();
  });

  it("says so when the version can't be read", async () => {
    m.data.readPublished.mockRejectedValue(new Error("storage/object-not-found"));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Go back to version 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring it back" }));
    expect(await screen.findByText("Couldn't read version 1. Check your connection and try again.")).toBeTruthy();
  });

  it("reads the versions where publishUnit writes them", () => {
    expect(publishedPath("public", "ai-1-1", 3)).toBe("content/units/ai-1-1/v3.json");
    expect(publishedPath("org1", "uabcd1234", 2)).toBe("orgs/org1/units/uabcd1234/v2.json");
  });
});

describe("importing a unit whose id exists", () => {
  it("offers to replace that unit's draft (platform admins), as a save of it", async () => {
    const u = unit();
    m.data.unitExists.mockResolvedValue(true);
    m.got = { meta: meta(u), unit: u };
    wrap(<ContentList />, "/super/content", "/super/content");
    fireEvent.click(await screen.findByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Or paste the JSON"), { target: { value: JSON.stringify({ ...u, title: { en: "Exported last month" } }) } });
    fireEvent.click(screen.getByRole("button", { name: /Check the file/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Import and open" }));
    expect(await screen.findByText(/A unit with the id ai-1 already exists\. Replace its draft with this file\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Replace the draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalled());
    expect(m.data.saveUnit.mock.calls[0][1]).toBe(5); // the existing draft's rev
    expect(lastSaved().title.en).toBe("Exported last month");
    expect(m.data.createUnit).not.toHaveBeenCalled();
    expect(await screen.findByText("elsewhere")).toBeTruthy(); // the editor route
  });
});

describe("capstones in the editor", () => {
  const capstone = () => JSON.parse(readFileSync(join(__dirname, "../../../content/units/ai-capstone.json"), "utf8")) as Unit;

  it("shows the milestone fields only in a capstone, and the switch makes a unit one", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(within(nav).getAllByRole("button", { name: /Project/ }).at(-1)!);
    expect(screen.queryByText("Capstone milestone")).toBeNull();
    fireEvent.click(within(nav).getByRole("button", { name: /Unit details/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Capstone: milestones built with real tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalled());
    expect(lastSaved().kind).toBe("capstone");
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(within(nav).getAllByRole("button", { name: /Project/ }).at(-1)!);
    expect(screen.getByText("Capstone milestone")).toBeTruthy();
    expect(screen.getByText(/Only the repository's name in github.com\/darsi-org/)).toBeTruthy();
  });

  it("refuses milestone fields outside a capstone, and a capstone with nothing to send", () => {
    const plain = unit();
    (plain.lessons[0].steps.find((s) => s.type === "project") as ProjectStep).evidence = [{ kind: "repo" }];
    expect(errorsOf(validateUnit(plain)).some((i) => i.code === "capstoneOnly" && i.at.field === "evidence")).toBe(true);
    const cap = capstone();
    expect(errorsOf(validateUnit(cap))).toEqual([]);
    for (const l of cap.lessons) for (const s of l.steps) if (s.type === "project") { delete (s as ProjectStep).evidence; delete (s as ProjectStep).setup; }
    expect(errorsOf(validateUnit(cap)).some((i) => i.code === "capstoneMilestone" && i.at.field === "kind")).toBe(true);
    const noKind = capstone(); delete noKind.kind;
    expect(errorsOf(validateUnit(noKind)).some((i) => i.code === "capstoneOnly")).toBe(true);
  });
});
