import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState, type ReactNode } from "react";
import ai1 from "../../../content/retired/ai-1.json";
import type { HotspotStep, Step, Unit } from "../src/content/types";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// The course editor: a hotspot's spot can sit on a line of the message or on its link (the player fits it there), and
// deleting a unit says so on the list the editor returns to.
const m = vi.hoisted(() => ({
  got: null as unknown,
  data: { listUnits: vi.fn(), getUnit: vi.fn(), createUnit: vi.fn(), saveUnit: vi.fn(), unitExists: vi.fn(), getSettings: vi.fn() },
  api: { publishUnit: vi.fn(), unpublishUnit: vi.fn(), deleteUnit: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn(), storageJSON: vi.fn() }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.data }));
vi.mock("../src/cms/api", async (orig) => ({ ...(await orig<typeof import("../src/cms/api")>()), cmsApi: m.api }));

const { ContentList } = await import("../src/cms/ContentList");
const { UnitEditor: Editor } = await import("../src/cms/UnitEditor");
const { StepForm } = await import("../src/cms/steps");
const { LessonPlayer } = await import("../src/screens/LessonScreen");

const ui = (node: ReactNode, entries: Parameters<typeof MemoryRouter>[0]["initialEntries"] = ["/"]) =>
  render(<StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={entries}>{node}</MemoryRouter></I18nProvider></StoreProvider>);

const hotspot = (): HotspotStep => ({
  id: "h1", type: "hotspot", prompt: { en: "Find the signs" },
  mock: { from: "bank@paypa1.example", body: { en: "Dear customer,\nYour account is locked.\nClick within 2 hours.", ar: "عزيزي العميل،\nحسابك مقفل.\nاضغط خلال ساعتين." }, link: { en: "paypa1-login.example", ar: "paypa1-login.example" } },
  spots: [{ id: "s1", x: 5, y: 40, w: 90, h: 20, label: { en: "A threat" } }],
} as HotspotStep);

describe("a hotspot's spots", () => {
  it("go on a line of the message, on its link, or back to a box", () => {
    let last: Step = hotspot();
    function Form() {
      const [s, setS] = useState<Step>(hotspot());
      last = s;
      return <StepForm step={s} onChange={setS} media={{ owner: "public", unitId: "u1", lessonId: "l1" }} />;
    }
    ui(<Form />);
    const where = screen.getByLabelText("Where it is") as HTMLSelectElement;
    expect(where.value).toBe("box");
    // Every line is offered by its number and its start, then the link.
    expect([...where.options].map((o) => o.textContent)).toEqual([
      "A box on the message (position below)", "Line 1: ⁨Dear customer,⁩", "Line 2: ⁨Your account is locked.⁩", "Line 3: ⁨Click within 2 hours.⁩", "The link",
    ]);
    fireEvent.change(where, { target: { value: "1" } });
    expect((last as HotspotStep).spots[0].line).toBe(1);
    fireEvent.change(screen.getByLabelText("Where it is"), { target: { value: "link" } });
    expect((last as HotspotStep).spots[0].line).toBe("link");
    fireEvent.change(screen.getByLabelText("Where it is"), { target: { value: "box" } });
    expect("line" in (last as HotspotStep).spots[0]).toBe(false);
    expect((last as HotspotStep).spots[0]).toMatchObject({ x: 5, y: 40, w: 90, h: 20 }); // the box stays as the fallback
  });
});

describe("deleting a unit in the editor", () => {
  beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
  beforeEach(() => { vi.clearAllMocks(); m.data.listUnits.mockResolvedValue([]); });

  it("returns to the list, which says it was deleted", async () => {
    const u = structuredClone(ai1) as unknown as Unit;
    m.got = { meta: { id: u.id, owner: "public", title: u.title, track: u.track, level: u.level, lessonCount: u.lessons.length, lessons: [], rev: 3, published: null }, unit: u };
    m.data.getUnit.mockImplementation(async () => m.got);
    m.api.deleteUnit.mockResolvedValue({ ok: true });
    ui(<Routes>
      <Route path="/super/content" element={<ContentList />} />
      <Route path="/super/content/:unitId" element={<Editor Player={LessonPlayer} />} />
    </Routes>, [`/super/content/${u.id}`]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete unit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteUnit).toHaveBeenCalledWith({ unitId: u.id }));
    expect((await screen.findByRole("status")).textContent).toBe(`Deleted ${u.title.en}.`);
  });
});
