import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// /super/analytics and the organization branding panel, with Firestore, Storage and the callables replaced.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "superadmin", orgId: null as string | null },
  overview: null as unknown,
  days: [] as unknown[],
  saved: [] as unknown[],
  uploads: [] as Array<{ path: string; type: string }>,
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true, call: () => vi.fn(async () => ({ at: "x" })), storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...p: string[]) => p.join("/"), updateDoc: async (path: string, data: Record<string, unknown>) => { m.updates.push({ path, data }); } }));
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => path, uploadBytes: async (path: string, b: Blob) => { m.uploads.push({ path, type: b.type }); }, deleteObject: async () => {} }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: async () => ({ version: 1, units: [{ id: "ai-1-1", track: "ai", level: 1, title: { en: "AI basics" }, summary: { en: "" }, lessons: 4, sizeMB: 1, available: true }] }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOverview: () => ({ data: m.overview, reload: vi.fn() }),
  useDays: () => ({ data: m.days, reload: vi.fn() }),
  useActiveDevices: () => ({ data: { d1: 12, d7: 340, d30: 900 }, reload: vi.fn() }),
  usePeople: () => ({ data: [], reload: vi.fn() }),
  useGaConfig: () => ({ data: { measurementId: "", apiSecret: "" }, reload: vi.fn() }),
  saveGaConfig: async (...a: unknown[]) => { m.saved.push(a); },
  useMembers: () => ({ data: [] }),
}));
// jsdom has no canvas or image decoding: a logo "decodes" to 512 px, and like an old browser it can only write PNG.
vi.stubGlobal("createImageBitmap", async () => ({ width: 512, height: 512, close() {} }));
HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as HTMLCanvasElement["getContext"];
HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(["png"], { type: "image/png" })); };

const { AnalyticsPage } = await import("../src/admin/Analytics");
const { OrgBranding } = await import("../src/admin/OrgBranding");

const wrap = (ui: ReactNode) => render(<StoreProvider><I18nProvider lang="en"><MemoryRouter>{ui}</MemoryRouter></I18nProvider></StoreProvider>);
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => { m.saved = []; m.uploads = []; m.updates = []; m.auth.orgId = null; });

describe("AnalyticsPage", () => {
  it("shows accounts, active phones, lessons and the top courses, tracks and organizations", async () => {
    m.overview = {
      at: "2026-11-01T02:30:00Z", lessons: 1520, xp: 0, avgAccuracy: 0.74, weeks: {},
      users: { total: 410, byRole: {}, new7: 25, new30: 80, active7: 120, active30: 260, withLessons: 300 },
      orgs: { o1: { name: "Nile School", country: "EG", members: 60, teachers: 10, students: 50, active7: 30, active30: 45, lessons: 400, xp: 0, avgAccuracy: 0.7 } },
      orgsByStatus: { active: 1, pending: 2 },
    };
    m.days = [{ day: today, n: 50, off: 10, dev: 12, lessons: { n: 9, track: { ai: 7, iot: 2 }, unit: { "ai-1-1": 7 }, acc: 630, accN: 9 }, sessions: { n: 20, installed: 5, lang: { ar: 15, en: 5 }, role: { guest: 8, teacher: 12 } }, labs: { neuron: 3 } }];
    wrap(<AnalyticsPage />);
    expect(screen.getByText("340")).toBeTruthy(); // phones active in 7 days
    expect(screen.getByText("Today 12, 30 days 900, guests included")).toBeTruthy();
    expect(screen.getByText("410")).toBeTruthy();
    expect(screen.getByText("1,520")).toBeTruthy();
    expect(screen.getByText("2 waiting for approval")).toBeTruthy();
    expect(await screen.findByText("AI basics")).toBeTruthy(); // the course's title, not its id
    expect(screen.getByText("Nile School")).toBeTruthy();
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText(/20% of activity happened offline/)).toBeTruthy();
    expect(screen.getByText(/Off: Darsi counts usage itself/)).toBeTruthy();
  });

  it("connects Google Analytics with the app's measurement ID and an API secret", async () => {
    m.overview = null; m.days = [];
    wrap(<AnalyticsPage />);
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    fireEvent.change(screen.getByLabelText("Measurement Protocol API secret"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.saved).toEqual([["me", { measurementId: "G-ABC123XYZ", apiSecret: "s3cret" }]]));
  });
});

describe("OrgBranding", () => {
  const org = { id: "o1", name: "Nile School", type: "school", status: "active" as const, createdBy: "u", brand: { logo: "orgs/o1/brand/logo-abcdef.png", v: 2 } };
  it("renames the organization and uploads a new logo under its brand folder", async () => {
    m.auth.orgId = "o1";
    wrap(<OrgBranding org={org} />);
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile Academy" } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    await screen.findByRole("button", { name: "Remove the logo" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Saved\./);
    expect(m.uploads).toHaveLength(1);
    expect(m.uploads[0].path).toMatch(/^orgs\/o1\/brand\/logo-[a-z0-9]{6,32}\.png$/);
    expect(m.updates).toEqual([{ path: "orgs/o1", data: { name: "Nile Academy", brand: { logo: m.uploads[0].path, v: 3 } } }]);
  });
  it("refuses a name that is too short", async () => {
    wrap(<OrgBranding org={org} />);
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The name needs 2 to 80 characters.")).toBeTruthy();
    expect(m.updates).toEqual([]);
  });
});
