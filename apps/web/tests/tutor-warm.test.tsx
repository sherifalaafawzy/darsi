// The tutor panel wakes the tutor when it opens (both sleep when unused; a cold start cost 3–7 s), once per lesson.
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { TutorPanel } from "../src/tutor/Tutor";

const m = vi.hoisted(() => ({ auth: { user: { uid: "u1" } as unknown, plan: { until: Date.now() + 864e5 } as unknown } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));

describe("tutor warm-up", () => {
  const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  beforeEach(() => { fetchSpy.mockClear(); vi.stubGlobal("fetch", fetchSpy); });
  afterEach(() => vi.unstubAllGlobals());

  const panel = (ask: (d: unknown) => Promise<unknown>, lessonId = "ai-1-1-1") => (
    <I18nProvider lang="en"><MemoryRouter>
      {/* A new `ask` and `status` on every render, as App hands them in. */}
      <TutorPanel unitId="ai-1-1" lessonId={lessonId} onClose={() => {}} relayUrl="wss://relay.example/live" Player={null}
        ask={(d) => ask(d) as never} status={() => Promise.resolve({ super: true, on: true, left: 10, minute: 1, maxMinutes: 14, explainer: 3 })} />
    </MemoryRouter></I18nProvider>
  );

  it("warms the typed tutor and the voice relay once per lesson, not on every render", async () => {
    const ask = vi.fn(() => Promise.resolve({ sessionId: "s-1" }));
    const { rerender } = render(panel(ask));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ warm: true, unitId: "ai-1-1", lessonId: "ai-1-1-1", lang: "en" }));
    expect(fetchSpy).toHaveBeenCalledWith("https://relay.example/warm?u=ai-1-1&l=en", { mode: "no-cors" });
    rerender(panel(ask));
    rerender(panel(ask));
    expect(ask).toHaveBeenCalledTimes(1);
    rerender(panel(ask, "ai-1-1-2")); // another lesson: its own session
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("doesn't wake anything for someone without Super", async () => {
    m.auth = { user: { uid: "u1" }, plan: null };
    const ask = vi.fn(() => Promise.resolve({ sessionId: "" }));
    render(panel(ask));
    await new Promise((r) => setTimeout(r, 20));
    expect(ask).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
