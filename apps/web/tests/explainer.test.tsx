// The tutor agent's explainers: a Lesson Studio package in memory, played by the light player inside the tutor panel.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import { LightLesson, setLightPlayer } from "../src/lesson/LightLesson";
import { ExplainerCard } from "../src/tutor/Explainer";
import "../src/tutor/strings";

const pkg = {
  manifest: { defaultLang: "ar", title: { ar: "إزاي الآلات بتتعلم" }, languages: [{ code: "ar", dir: "rtl", duration: 41.6 }] },
  scenes: { version: "0.1", scenes: [{ id: "s1", template: "title-hook" }] },
  timing: { ar: { lang: "ar", duration: 41.6, scenes: [] } },
};
const card = (autoplay = false, player: typeof LightLesson | null = LightLesson) => render(<I18nProvider lang="ar"><ExplainerCard pkg={pkg} lang="ar" autoplay={autoplay} Player={player} /></I18nProvider>);

describe("explainers in the tutor", () => {
  it("says the answer covers it when the light player isn't available", () => {
    card(false, null);
    expect(screen.getByText(/لا يمكن تشغيل الشرح هنا/)).toBeTruthy();
  });

  it("waits for Watch when typing, then plays the package from memory, with nothing fetched", async () => {
    const createPlayer = vi.fn(() => ({ play() {}, pause() {}, destroy() {}, setOrient() {}, ready: Promise.resolve() }));
    setLightPlayer(async () => ({ createPlayer, packsUsed: () => [], prefetchPacks: async () => {} }) as never);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    card();
    expect(screen.getByText("إزاي الآلات بتتعلم")).toBeTruthy();
    expect(createPlayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "شاهد" }));
    await waitFor(() => expect(createPlayer).toHaveBeenCalledOnce());
    const [, given, opts] = createPlayer.mock.calls[0] as unknown as [HTMLElement, { scenes: unknown; timing: Record<string, unknown> }, { lang: string; captions: boolean }];
    expect(given.scenes).toBe(pkg.scenes);
    expect(given.timing).toEqual({ ar: pkg.timing.ar });
    expect(opts).toMatchObject({ lang: "ar", captions: true });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("starts by itself in a call, under the tutor's voice", async () => {
    const createPlayer = vi.fn(() => ({ play() {}, pause() {}, destroy() {}, setOrient() {}, ready: Promise.resolve() }));
    setLightPlayer(async () => ({ createPlayer, packsUsed: () => [], prefetchPacks: async () => {} }) as never);
    card(true);
    await waitFor(() => expect(createPlayer).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "شاهد" })).toBeNull();
  });
});
