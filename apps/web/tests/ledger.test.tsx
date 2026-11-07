import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

// /super's records (admin/Ledger.tsx): the audit log and the payments ledger, read only when a list is opened.
const UID = "AbCdEfGhIjKlMnOpQrStUvWx1234";
const m = vi.hoisted(() => ({ reads: [] as string[], rows: {} as Record<string, unknown[]> }));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn() }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, name: string) => name,
  orderBy: () => ({}), limit: () => ({}),
  query: (name: string) => name,
  getDocs: async (name: string) => { m.reads.push(name); return { docs: (m.rows[name] ?? []).map((r, i) => ({ id: `d${i}`, data: () => r })) }; },
}));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), useNames: () => ({ data: { [UID]: "Amina Bello" } }) }));

const { Ledger } = await import("../src/admin/Ledger");
const page = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><Ledger /></MemoryRouter></I18nProvider>);

beforeEach(() => {
  m.reads = [];
  m.rows = {
    audit: [{ action: "setUserRole", by: UID, uid: "x", role: "teacher", at: { seconds: 1793700000 } }],
    payments: [{ provider: "paymob", kind: "subscription", plan: "super-month", uid: UID, amount: 150, currency: "EGP", status: "refunded", at: { seconds: 1793700000 } }],
  };
});

describe("records for platform admins", () => {
  it("reads nothing until a list is opened, then shows who did what", async () => {
    page();
    expect(m.reads).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    expect(await screen.findByText("setUserRole")).toBeTruthy();
    expect(m.reads).toEqual(["audit"]);
    expect(screen.getByRole("link", { name: "Amina Bello" }).getAttribute("href")).toBe(`/super/people/${UID}`);
    expect(screen.getByText("uid: x, role: teacher")).toBeTruthy();
  });

  it("lists payments with their amount and status, in Arabic too", async () => {
    page("ar");
    fireEvent.click(screen.getByRole("button", { name: "المدفوعات" }));
    expect(await screen.findByText("مستردّة")).toBeTruthy();
    expect(screen.getByText(/١٥٠/)).toBeTruthy();
    expect(m.reads).toEqual(["payments"]);
  });
});
