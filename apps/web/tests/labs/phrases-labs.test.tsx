/**
 * Every lab opens in an added language with its phrases (public/content/phrases/<lang>/labs.json and lab-<id>.json,
 * fetched by labs/loader.tsx): it renders, shows "Try this" translated, and doesn't fall over on a translated table.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

const { LabApp } = await import("../../src/screens/Labs");
const { LAB_METAS } = await import("../../src/labs/catalog");
const PHRASES = join(__dirname, "../../public/content/phrases");
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const m = /\/content\/phrases\/([\w-]+)\/([\w-]+)\.json$/.exec(String(url));
    if (m) { const f = join(PHRASES, m[1], `${m[2]}.json`); return existsSync(f) ? json(JSON.parse(readFileSync(f, "utf8"))) : new Response("", { status: 404 }); }
    return json({ total: 2_400_000 });
  }));
});

for (const lang of ["fr", "ur"]) {
  const labs = existsSync(join(PHRASES, lang, "labs.json")) ? JSON.parse(readFileSync(join(PHRASES, lang, "labs.json"), "utf8")) as Record<string, string> : null;
  describe.skipIf(!labs)(`every lab in ${lang}`, () => {
    for (const m of LAB_METAS) {
      it(m.id, async () => {
        const { unmount } = render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[`/labs/${m.id}`]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
        expect(await screen.findByText(labs!["Try this"], {}, { timeout: 4000 })).toBeTruthy();
        expect(screen.queryByText("Try this")).toBeNull();
        unmount();
      });
    }
  });
}
