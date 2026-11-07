// The tutor lab's follow-ups: a new question gets its own idea, and "explain it again" replays the last scene (same
// map, same numbers) instead of asking the scene model for "<last question> (n)", which drew garbled maps.
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../src/i18n";

// The pack player needs a real canvas: a stand-in shows which scene would be drawn, and how many times.
vi.mock("../../src/labs/apps/tutor/stage", () => ({
  PackStage: ({ scene, run }: { scene: { content: unknown }; run: number }) => <pre data-testid="stage" data-run={run}>{JSON.stringify(scene.content)}</pre>,
}));

const { default: Tutor } = await import("../../src/labs/apps/tutor");
const { meta } = await import("../../src/labs/apps/tutor/meta");

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 }))); }); // no scene model here
afterEach(() => { vi.unstubAllGlobals(); });

const tutorSaid = () => [...document.querySelectorAll(".lb-tutor-msg.is-tiny")].map((p) => p.textContent ?? "");
const stage = () => screen.getByTestId("stage");
async function say(text: string) {
  const n = tutorSaid().length;
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  await vi.waitFor(() => expect(tutorSaid().length).toBe(n + 1));
  return tutorSaid().at(-1)!;
}

describe("the tutor lab", () => {
  it("answers a new question with its own idea, even when it says “understand”", async () => {
    const onDone = vi.fn();
    render(<I18nProvider lang="en"><Tutor meta={meta} onDone={onDone} /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "bubble sort" }));
    await vi.waitFor(() => expect(tutorSaid().length).toBe(1));
    expect(tutorSaid()[0]).toMatch(/Bubble sort/);
    expect(onDone).toHaveBeenCalled(); // the card can show Done once an idea was explained
    const https = await say("Help me understand HTTPS");
    expect(https).not.toMatch(/Bubble sort/);
    expect(stage().textContent).not.toContain('"type":"array"');
  });

  it("replays the same scene for “explain it again”, in Arabic too", async () => {
    render(<I18nProvider lang="ar"><Tutor meta={meta} /></I18nProvider>);
    const first = await say("البيت-تالا 4، تالا-المدرسة 3، البيت-المدرسة 9، من البيت إلى المدرسة");
    const drawn = stage().textContent, run = Number(stage().dataset.run);
    expect(drawn).toContain("تالا");
    expect(first).toContain("أقصر طريق هو البيت ← تالا ← المدرسة، وطوله ٧."); // Arabic digits and order, no Latin ", "
    const again = await say("ما زلت لا أفهم. اشرح مرة أخرى.");
    expect(again).toBe(first);
    expect(stage().textContent).toBe(drawn); // the learner's map, not a new one the model made up
    expect(Number(stage().dataset.run)).toBe(run + 1); // played again from the start
    expect(await say("ما زلت لا أفهم. اشرح مرة أخرى.")).toBe(first);
  });
});
