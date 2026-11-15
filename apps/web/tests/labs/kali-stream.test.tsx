import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";

// Reuse the per-device storage mock, but start acknowledged so the terminal is unlocked.
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
beforeEach(() => {
  store.clear();
  store.set("lab:kali:legal-ack", true);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 }))));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const openLab = (lang: "en" | "ar" = "en") =>
  render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={["/labs/kali"]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);

// Wait for the lazy lab chunk to load, then hand back the ready input.
const ready = async () => {
  // Both the locked and the unlocked inputs carry this label; wait for the unlocked (enabled) one,
  // which appears once the stored acknowledgement has loaded.
  await screen.findByLabelText("Terminal input");
  await waitFor(() => expect((screen.getByLabelText("Terminal input") as HTMLInputElement).disabled).toBe(false));
  return screen.getByLabelText("Terminal input") as HTMLInputElement;
};
const run = (input: HTMLInputElement, cmd: string) => {
  fireEvent.change(input, { target: { value: cmd } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const log = () => screen.getByRole("log", { name: "terminal" });
const field = () => screen.getByLabelText("Terminal input") as HTMLInputElement;
const missionClass = (name: string) => screen.getByText(name).closest("li")?.className ?? "";

describe("kali terminal: streaming output", () => {
  it("streams a slow tool instead of dumping it, locks input, then ticks the mission when it finishes", async () => {
    openLab();
    const input = await ready();
    run(input, "nmap -sV 10.10.14.20");

    // The input locks the instant the command starts, and the output is NOT all there at once:
    // the last line is still missing while it streams in.
    expect(field().disabled).toBe(true);
    expect(within(log()).queryByText(/Nmap done/)).toBeNull();

    // It streams to completion, then unlocks and ticks the mission.
    await within(log()).findByText(/Nmap done/, undefined, { timeout: 10000 });
    expect(within(log()).getByText(/OpenSSH/)).toBeTruthy();
    await waitFor(() => expect(field().disabled).toBe(false));
    expect(missionClass("2 · Scanning")).toContain("is-done");
  }, 20000);

  it("prints a trivial command instantly, without locking the input", async () => {
    openLab();
    const input = await ready();
    run(input, "whoami");
    // No waiting: a trivial command is on screen immediately and the input stays open.
    expect(within(log()).getByText("root")).toBeTruthy();
    expect(field().disabled).toBe(false);
  });

  it("prints everything at once when the OS asks for reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    openLab();
    const input = await ready();
    run(input, "nmap -sV 10.10.14.20");
    // Even a slow tool is fully printed immediately, and the input never locks.
    expect(within(log()).getByText(/Nmap done/)).toBeTruthy();
    expect(field().disabled).toBe(false);
    expect(missionClass("2 · Scanning")).toContain("is-done");
  });

  it("Ctrl+C stops a running command, prints ^C, unlocks input, and leaves the mission unticked", async () => {
    openLab();
    const input = await ready();
    run(input, "nmap -sV 10.10.14.20");
    expect(field().disabled).toBe(true);

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true })); });
    await within(log()).findByText("^C");
    await waitFor(() => expect(field().disabled).toBe(false));
    // The command never finished, so the Scanning mission stays unticked.
    expect(missionClass("2 · Scanning")).not.toContain("is-done");
    // And it stopped early: the final line never printed.
    expect(within(log()).queryByText(/Nmap done/)).toBeNull();
  }, 20000);
});
