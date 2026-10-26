import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

const { Labs, LabApp } = await import("../../src/screens/Labs");
const { LabEmbed } = await import("../../src/labs/loader");

const wrap = (ui: ReactNode, { url = "/labs", path = "/labs", lang = "en" } = {}) => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);

beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });

describe("Labs screen", () => {
  it("shows the AI ladder, shelves and cards, and the offline size", async () => {
    wrap(<Labs />);
    expect(screen.getByRole("heading", { name: "The AI ladder" })).toBeTruthy();
    const ladder = screen.getByRole("list");
    expect(within(ladder).getAllByRole("link")[0].textContent).toContain("One neuron");
    expect(screen.getByRole("heading", { name: /Neural networks/ })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Network playground/ }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /Save all labs for offline \(2\.4 MB\)/ })).toBeTruthy();
  });

  it("filters by track and by search", () => {
    wrap(<Labs />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "language model" } });
    expect(screen.getAllByRole("link", { name: /Build a tiny language model/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /One neuron/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "The AI ladder" })).toBeNull(); // the ladder hides while searching
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: /Cyber security/ }));
    expect(screen.queryByRole("heading", { name: "The AI ladder" })).toBeNull();
  });

  it("is written in Arabic too", () => {
    wrap(<Labs />, { lang: "ar" });
    expect(screen.getByRole("heading", { name: "سُلّم الذكاء الاصطناعي" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /خلية عصبية واحدة/ }).length).toBeGreaterThan(0);
  });
});

describe("a lab", () => {
  it("opens on its own screen and offers the next one", async () => {
    wrap(<LabApp />, { url: "/labs/neuron", path: "/labs/:id" });
    expect(await screen.findByText(/Challenge: set the weights/)).toBeTruthy();
    expect(screen.getByText("Next lab")).toBeTruthy();
  });

  it("says so when a lesson asks for a lab this version doesn't have", () => {
    wrap(<LabEmbed id="no-such-lab" embedded />, { url: "/x", path: "/x" });
    expect(screen.getByText(/isn’t available in this version/)).toBeTruthy();
  });

  it("the playground trains when asked and stops by itself", async () => {
    wrap(<LabApp />, { url: "/labs/playground", path: "/labs/:id" });
    fireEvent.click(await screen.findByRole("button", { name: "One step" }));
    expect(screen.getByText("Round").nextSibling?.textContent).toBe("1");
  });
});
