import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

const { LabApp } = await import("../../src/screens/Labs");
beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });

const APPS = ["neuron", "activation", "perceptron", "gradient", "playground", "backprop", "overfit", "pixels", "convolution", "shapes", "tokens", "nextword"];

describe("the first twelve AI labs say what to try", () => {
  for (const lang of ["en", "ar"] as const) for (const id of APPS) {
    it(`${id} (${lang})`, async () => {
      render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[`/labs/${id}`]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
      const head = await screen.findByText(lang === "ar" ? "جرّب هذا" : "Try this");
      const items = [...(head.parentElement?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(3);
      for (const t of items) {
        expect(t.length).toBeGreaterThan(30);
        expect(t).not.toContain("·");
        if (lang === "ar") expect(t).not.toMatch(/[0-9]/); // written Arabic uses Arabic-Indic digits
      }
    });
  }
});
