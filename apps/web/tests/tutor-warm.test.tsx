// The tutor panel wakes the tutor when it opens (both sleep when unused; a cold start cost 3–7 s), once per lesson.
import { act, fireEvent, render, waitFor } from "@testing-library/react";
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

  it("a relay with no room for the call ('busy') says the tutor is busy, not that it didn't answer", async () => {
    m.auth = { user: { uid: "u1", getIdToken: async () => "token" }, plan: { until: Date.now() + 864e5 } };
    let sock: { onopen?: () => void; onmessage?: (e: { data: unknown }) => void; onclose?: () => void; readyState: number; send: () => void; close: () => void } | null = null;
    class FakeSocket { readyState = 1; binaryType = ""; onopen?: () => void; onmessage?: (e: { data: unknown }) => void; onclose?: () => void; send() {} close() {} constructor() { sock = this; } }
    class FakeAudio { close() { return Promise.resolve(); } }
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("AudioContext", FakeAudio);
    const { findByRole, findByText, queryByText } = render(panel(() => Promise.resolve({ sessionId: "" })));
    (await findByRole("button", { name: "Start talking" })).click();
    await waitFor(() => expect(sock).not.toBeNull());
    await act(async () => { sock!.onmessage?.({ data: JSON.stringify({ type: "error", code: "busy" }) }); sock!.onclose?.(); });
    expect(await findByText("The tutor is busy right now. Try again in a minute.")).toBeTruthy();
    expect(queryByText(/didn.t answer/)).toBeNull();
    m.auth = { user: { uid: "u1" }, plan: { until: Date.now() + 864e5 } };
  });

  // functions/src/tutor.ts refuses a typed question with HttpsError("resource-exhausted", "busy") while this account's
  // other questions are under way: the SDK's error carries only that message.
  it("a typed question refused as busy says the tutor is busy, not that it didn't answer or that the credits are used", async () => {
    const ask = vi.fn((d: unknown) => ((d as { warm?: boolean }).warm ? Promise.resolve({ sessionId: "" })
      : Promise.reject(Object.assign(new Error("busy"), { code: "functions/resource-exhausted" }))));
    const { findByRole, findByLabelText, findByText, queryByText } = render(panel(ask));
    (await findByRole("button", { name: "Type" })).click();
    fireEvent.change(await findByLabelText("Your question"), { target: { value: "What is a neuron?" } });
    (await findByRole("button", { name: "Ask" })).click();
    expect(await findByText("The tutor is busy right now. Try again in a minute.")).toBeTruthy();
    expect(queryByText(/didn.t answer/)).toBeNull();
    expect(queryByText(/tutor credits/)).toBeNull();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "What is a neuron?" }));
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
