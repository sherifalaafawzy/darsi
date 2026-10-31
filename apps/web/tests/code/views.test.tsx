// The code steps in a lesson (src/code/CodeSteps.tsx, loaded lazily by StepView): what the learner taps or types,
// and the answer it gives the lesson. The sandbox itself is mocked here (jsdom has no workers); tests/code/harness.test.ts
// runs the real runtimes, and the e2e suite the real sandbox.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BlocksStep, BugStep, CodeFillStep, CodeStep, ParsonsStep, Step } from "../../src/content/types";
import { I18nProvider } from "../../src/i18n";
import { StepView } from "../../src/lesson/StepView";

const m = vi.hoisted(() => ({ run: vi.fn(), prepare: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/code/sandbox", () => ({ TIME_LIMIT: 3000, sandbox: () => ({ run: m.run, prepare: m.prepare, stop: m.stop }), disposeSandbox: () => {} }));

const T = (en: string, ar = en) => ({ en, ar });
const show = (step: Step, lang = "en", result: boolean | null = null) => {
  const onAnswer = vi.fn();
  const view = render(<I18nProvider lang={lang}><StepView step={step} result={result} onAnswer={onAnswer} onUngradedReady={() => {}} attempt={0} lessonId="l1" unitId="u1" /></I18nProvider>);
  return { onAnswer, view };
};
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1]?.[0];

beforeEach(() => { m.run.mockReset(); m.prepare.mockReset().mockResolvedValue(undefined); m.stop.mockReset(); });

describe("write and run", () => {
  const step: CodeStep = { type: "code", id: "c1", prompt: T("Print the sum of 2 and 3."), lang: "python", starter: "print(2 + 2)", solution: "print(2 + 3)",
    tests: [{ output: "5", hint: T("It should print 5.") }], hints: [T("Use +.")] };

  it("runs the program with its tests, and Check grades that run", async () => {
    m.run.mockResolvedValue({ runs: [{ out: "4\n", passed: false }], ms: 3 });
    const { onAnswer } = show(step);
    const editor = await screen.findByRole("textbox", { name: "Your code" });
    expect((editor as HTMLTextAreaElement).value).toBe("print(2 + 2)");
    expect(editor.getAttribute("dir")).toBe("ltr");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(last(onAnswer)).toEqual({ kind: "code", passed: false }));
    expect(m.prepare).toHaveBeenCalledWith("python");
    expect(m.run).toHaveBeenCalledWith({ lang: "python", code: "print(2 + 2)", tests: step.tests, files: undefined });
    expect(screen.getByText("4")).toBeTruthy();
    // Changing the code needs a new run before Check.
    fireEvent.change(editor, { target: { value: "print(2 + 3)" } });
    expect(last(onAnswer)).toBeNull();
    m.run.mockResolvedValue({ runs: [{ out: "5\n", passed: true }], ms: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(last(onAnswer)).toEqual({ kind: "code", passed: true }));
  });

  it("shows errors with their line, a time-out, and hints one at a time", async () => {
    m.run.mockResolvedValueOnce({ runs: [{ out: "", error: 'Traceback…\n  File "main.py", line 1\nSyntaxError: invalid syntax', line: 1, passed: false }], ms: 1 });
    show(step);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByText("Error on line 1")).toBeTruthy();
    m.run.mockResolvedValueOnce({ runs: [], ms: 3000, timeout: true });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Stopped after 3 seconds. Does a loop never end?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show a hint" }));
    expect(screen.getByText("Use +.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Show a hint" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says what Python needs to download, once, when it can't", async () => {
    m.prepare.mockRejectedValue(new Error("offline"));
    show(step, "ar");
    fireEvent.click(await screen.findByRole("button", { name: "شغّل" }));
    expect(await screen.findByText(/يحتاج Python إلى تنزيل واحد \(٠٫٣ ميغابايت\)/)).toBeTruthy();
  });

  it("indents after a colon and with the symbol row, in a box that stays left to right in Arabic", async () => {
    show({ ...step, starter: "for i in range(3):" }, "ar");
    const editor = (await screen.findByRole("textbox", { name: "الكود الذي تكتبه" })) as HTMLTextAreaElement;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(editor.value).toBe("for i in range(3):\n    ");
    fireEvent.click(screen.getByRole("button", { name: "(" }));
    expect(editor.value).toBe("for i in range(3):\n    (");
  });
});

describe("the virtual board", () => {
  it("runs on the lesson's sensor readings and plays the pins back", async () => {
    const step: CodeStep = { type: "code", id: "lamp", prompt: T("Light the lamp in the dark."), lang: "python", starter: "", solution: "", tests: [{ check: "assert True" }],
      board: { seconds: 4, leds: [{ pin: 15, color: "yellow", label: T("Lamp") }], sensors: [{ pin: 26, kind: "light", label: T("Light sensor"), values: [50000, 9000] }] } };
    m.run.mockResolvedValue({ ms: 5, runs: [{ out: "", passed: true, board: { events: [[0, 15, "pin", 0], [1000, 15, "pin", 1]], pins: { 15: 1 }, timeUp: true } }] });
    vi.stubGlobal("matchMedia", () => ({ matches: true })); // less motion: the playback ends at once
    show(step);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByText("Board time: 4 s of 4 s")).toBeTruthy();
    expect(m.run).toHaveBeenCalledWith(expect.objectContaining({ board: { seconds: 4, sensors: { 26: [50000, 9000] }, buttons: {} } }));
    expect(screen.getByText("Lamp").closest("li")!.textContent).toContain("on");
    expect(screen.getByText("Light sensor").closest("li")!.textContent).toContain("9,000");
    expect(screen.getByText("Board time is up: on a real board the program would keep going.")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("put the lines in order", () => {
  const step: ParsonsStep = { type: "parsons", id: "p1", prompt: T("Order the lines."), lang: "python", lines: ["for i in range(3):", "    print(i)"], distractors: ["print i"] };
  it("adds lines by tapping, indents them, and answers once every line is placed", async () => {
    const { onAnswer } = show(step);
    fireEvent.click(await screen.findByRole("button", { name: "for i in range(3):" }));
    expect(last(onAnswer)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "print(i)" }));
    expect(last(onAnswer)).toEqual({ kind: "parsons", lines: ["for i in range(3):", "print(i)"] });
    fireEvent.click(screen.getAllByRole("button", { name: "Indent" })[1]);
    expect(last(onAnswer)).toEqual({ kind: "parsons", lines: ["for i in range(3):", "    print(i)"] });
    expect(screen.getByRole("button", { name: "print i" })).toBeTruthy(); // the wrong line is still on offer
  });
  it("shows the right order after a wrong answer", async () => {
    show(step, "en", false);
    expect(await screen.findByText("The right order:")).toBeTruthy();
  });
});

describe("fill the gaps, find the bug", () => {
  it("fills the selected gap with a tapped word", async () => {
    const step: CodeFillStep = { type: "codefill", id: "f1", prompt: T("Complete it."), lang: "python", code: ["for i in ", { blank: 0 }, "(3):\n    ", { blank: 1 }, "(i)"], answers: ["range", "print"], distractors: ["input"] };
    const { onAnswer } = show(step);
    fireEvent.click(await screen.findByRole("button", { name: "range" }));
    fireEvent.click(screen.getByRole("button", { name: "print" }));
    expect(last(onAnswer)).toEqual({ kind: "codefill", tokens: { 0: "range", 1: "print" } });
    expect(screen.getByRole("button", { name: "Gap 1: range" })).toBeTruthy();
  });
  it("picks a line, and shows the fix afterwards", async () => {
    const step: BugStep = { type: "bug", id: "b1", prompt: T("Which line is wrong?"), lang: "python", code: "x = 5\nif x > 3\n    print(x)", line: 2, fix: "if x > 3:" };
    const { onAnswer } = show(step);
    fireEvent.click(await screen.findByRole("radio", { name: "Line 2: if x > 3" }));
    expect(last(onAnswer)).toEqual({ kind: "bug", line: 2 });
    show(step, "en", true);
    expect(await screen.findByText("The fix:")).toBeTruthy();
  });
});

describe("the robot", () => {
  const step: BlocksStep = { type: "blocks", id: "k1", prompt: T("Take the robot to the star."), world: { cols: 3, rows: 3, start: { x: 0, y: 2, dir: "N" }, goal: { x: 0, y: 0 } },
    commands: ["forward", "left", "right"], maxBlocks: 2 };
  it("builds a program from cards, repeats a card when tapped, keeps to the limit and walks the robot", async () => {
    const { onAnswer } = show(step);
    fireEvent.click(await screen.findByRole("button", { name: "Forward" }));
    expect(last(onAnswer)).toEqual({ kind: "blocks", program: [{ cmd: "forward", times: 1 }] });
    fireEvent.click(screen.getByRole("button", { name: "Forward ×1" }));
    expect(last(onAnswer)).toEqual({ kind: "blocks", program: [{ cmd: "forward", times: 2 }] });
    fireEvent.click(screen.getByRole("button", { name: "Turn left" }));
    expect((screen.getByRole("button", { name: "Turn right" }) as HTMLButtonElement).disabled).toBe(true); // two cards at most
    expect(screen.getByText("No more cards: take one out first.")).toBeTruthy();
    vi.stubGlobal("matchMedia", () => ({ matches: true })); // less motion: the walk ends at once
    fireEvent.click(screen.getByRole("button", { name: "Run the robot" }));
    expect(await screen.findByText("The robot reached the goal!")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("code shown with a question", () => {
  it("is left to right, inside the question", () => {
    show({ type: "choice", id: "q1", prompt: T("What does this print?", "ماذا يطبع هذا؟"), snippet: { lang: "python", text: "print(2 * 3)" }, options: [{ id: "a", text: T("6") }, { id: "b", text: T("23") }], answer: "a" }, "ar");
    const code = screen.getByLabelText("الكود");
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(code.textContent).toBe("print(2 * 3)");
  });
});
