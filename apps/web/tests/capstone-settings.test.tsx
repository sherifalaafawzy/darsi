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

  it("reads the digits an Arabic or Persian keyboard types, and nothing that only looks like a number", async () => {
    view("ar");
    const perDay = await screen.findByLabelText("المراجعات الآلية لكل متعلّم في اليوم") as HTMLInputElement;
    const calls = screen.getByLabelText("المراجعات الآلية للمنصة كلها في اليوم") as HTMLInputElement;
    const saveBtn = screen.getByRole("button", { name: "احفظ الحدود" }) as HTMLButtonElement;
    // Text fields with a numeric keyboard: a number field refuses these digits.
    expect(perDay.type).not.toBe("number");
    fireEvent.change(perDay, { target: { value: "٧" } });
    expect(perDay.value).toBe("7");
    fireEvent.change(calls, { target: { value: "۲۵۰" } });
    expect(calls.value).toBe("250");
    expect(saveBtn.disabled).toBe(false);
    // "1e1" is not ten, and an empty field is not 0.
    for (const typed of ["1e1", "", "-3", "٢٫٥"]) {
      fireEvent.change(perDay, { target: { value: typed } });
      expect(saveBtn.disabled, typed).toBe(true);
      expect(perDay.getAttribute("aria-invalid"), typed).toBe("true");
    }
    fireEvent.change(perDay, { target: { value: "٥" } });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(m.save).toHaveBeenCalledWith({ perDay: 5, maxPerDay: 250, callsPerDay: 20 }));
  });

  it("starts from the defaults when nothing is saved yet, and speaks Arabic with Arabic digits", async () => {
    m.config = undefined; m.today = undefined;
    view("ar");
    expect(await screen.findByText(/^مفعّلة:/)).toBeTruthy();
    expect((screen.getByLabelText("المراجعات الآلية للمنصة كلها في اليوم") as HTMLInputElement).value).toBe("300");
    expect(screen.getByText(/المراجعات الآلية اليوم: ٠/)).toBeTruthy();
  });

  it("says a refused save in the admin's language (staff/errors.ts), never the server's raw English", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // errorText logs the raw error
    m.save.mockRejectedValueOnce(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/permission-denied", details: { reason: "not-super" } }));
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Turn AI reviews off" }));
    expect(await screen.findByText(/^Only platform admins can do that\./)).toBeTruthy();
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
    vi.restoreAllMocks();
  });
});
