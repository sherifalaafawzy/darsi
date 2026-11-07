// /super/plans: platform admins switch capstone AI reviews off and set their daily limits (saveCapstoneConfig;
// TECHNICAL.md "Capstones"), since config/capstone is closed to clients. One read when the page opens.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  config: { ai: true, perDay: 5, maxPerDay: 300, callsPerDay: 20 } as Record<string, unknown> | undefined,
  today: { reviews: 12, usd: 0.0132 } as Record<string, unknown> | undefined,
  reads: [] as string[],
  save: vi.fn(async (patch: Record<string, unknown>) => ({ ai: true, perDay: 5, maxPerDay: 300, callsPerDay: 20, ...patch })),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, functions: {}, storage: async () => ({}), firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({}), call: (name: string) => (name === "saveCapstoneConfig" ? m.save : vi.fn()) }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: async (path: string) => {
    m.reads.push(path);
    const data = path === "config/capstone" ? m.config : m.today === undefined ? undefined : { capstone: m.today };
    return { data: () => data, get: (k: string) => (data as Record<string, unknown> | undefined)?.[k] };
  },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "admin" }, role: "superadmin" }) }));

const { I18nProvider } = await import("../src/i18n");
const { CapstoneSettings } = await import("../src/admin/CapstoneSettings");
const view = (lang = "en") => render(<I18nProvider lang={lang}><CapstoneSettings /></I18nProvider>);

describe("capstone AI review settings", () => {
  beforeEach(() => { m.save.mockClear(); m.reads = []; m.config = { ai: true, perDay: 5, maxPerDay: 300, callsPerDay: 20 }; m.today = { reviews: 12, usd: 0.0132 }; });

  it("reads the settings and today's use once, and turns AI reviews off through saveCapstoneConfig", async () => {
    view();
    expect(await screen.findByText(/^On: each milestone/)).toBeTruthy();
    expect(screen.getByText("AI reviews today: 12 (cost at the provider: $0.013).")).toBeTruthy();
    expect(m.reads.sort()).toEqual([`analytics/${new Date().toISOString().slice(0, 10)}`, "config/capstone"]);
    fireEvent.click(screen.getByRole("button", { name: "Turn AI reviews off" }));
    await waitFor(() => expect(m.save).toHaveBeenCalledWith({ ai: false }));
    expect(await screen.findByText(/^Off: milestones still go/)).toBeTruthy();
    expect(screen.getByText("AI reviews of capstone milestones are off.")).toBeTruthy();
  });

  it("saves only whole numbers within the bounds", async () => {
    view();
    const max = await screen.findByLabelText("AI reviews for the whole platform a day") as HTMLInputElement;
    const saveBtn = screen.getByRole("button", { name: "Save the limits" }) as HTMLButtonElement;
    fireEvent.change(max, { target: { value: "2.5" } });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(max, { target: { value: "100001" } });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(max, { target: { value: "50" } });
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(m.save).toHaveBeenCalledWith({ perDay: 5, maxPerDay: 50, callsPerDay: 20 }));
    expect(await screen.findByText("Saved. The next milestone sent follows the new limits.")).toBeTruthy();
  });

  it("starts from the defaults when nothing is saved yet, and speaks Arabic with Arabic digits", async () => {
    m.config = undefined; m.today = undefined;
    view("ar");
    expect(await screen.findByText(/^مفعّلة:/)).toBeTruthy();
    expect((screen.getByLabelText("المراجعات الآلية للمنصة كلها في اليوم") as HTMLInputElement).value).toBe("300");
    expect(screen.getByText(/المراجعات الآلية اليوم: ٠/)).toBeTruthy();
  });
});
