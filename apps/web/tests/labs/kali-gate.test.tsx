import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";

// Per-device acknowledgement storage: start unacknowledged; record what gets saved.
const store = new Map<string, unknown>();
vi.mock("../../src/platform", async (orig) => ({
  ...(await orig<typeof import("../../src/platform")>()),
  storage: {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    remove: async (k: string) => { store.delete(k); },
  },
  onMeteredConnection: () => false,
}));

const { LabApp } = await import("../../src/screens/Labs");
beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });
beforeEach(() => store.clear());

const open = (lang: "en" | "ar") =>
  render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={["/labs/kali"]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);

describe("kali lab: legal disclaimer and acknowledgement gate", () => {
  it("shows a prominent legal disclaimer before anything else (en + ar)", async () => {
    for (const [lang, head, body] of [
      ["en", "Legal warning — read before you start", /illegal in most countries/i],
      ["ar", "تحذير قانوني", /غرامات والسجن/],
    ] as const) {
      const { unmount } = open(lang as "en" | "ar");
      expect(await screen.findByText(head as string, { exact: false })).toBeTruthy();
      expect(screen.getByText(body as RegExp)).toBeTruthy();
      unmount();
    }
  });

  it("locks the terminal until the learner acknowledges, then unlocks and persists it", async () => {
    open("en");
    // The input starts disabled and a locked note explains why.
    const input = (await screen.findByLabelText("Terminal input")) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/terminal is locked/i)).toBeTruthy();

    // The unlock button is disabled until the checkbox is ticked.
    const button = screen.getByRole("button", { name: /unlock the terminal/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    const input2 = (await screen.findByLabelText("Terminal input")) as HTMLInputElement;
    expect(input2.disabled).toBe(false);
    expect(screen.queryByText(/terminal is locked/i)).toBeNull();
    // Acknowledgement is stored per device so it is not asked again.
    expect(store.get("lab:kali:legal-ack")).toBe(true);
  });

  it("does not ask again when the acknowledgement is already stored", async () => {
    store.set("lab:kali:legal-ack", true);
    open("en");
    const input = (await screen.findByLabelText("Terminal input")) as HTMLInputElement;
    // findByLabelText resolves once the lazy chunk loads; the input is enabled and no checkbox is shown.
    expect(input.disabled).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("prints a legal MOTD as the terminal's first lines", async () => {
    store.set("lab:kali:legal-ack", true);
    open("en");
    const log = await screen.findByRole("log", { name: "terminal" });
    expect(within(log).getByText(/authorised testing only/i)).toBeTruthy();
  });
});
