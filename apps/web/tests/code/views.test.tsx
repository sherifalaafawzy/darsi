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
    // A program too slow for its data stops at the limit too: the message names both.
    expect(await screen.findByText("Stopped after 3 seconds. Does a loop never end? Or is the program too slow for this much data, with a loop inside a loop?")).toBeTruthy();
    const more = screen.getByRole("button", { name: "Show a hint" });
    more.focus();
    fireEvent.click(more);
    expect(screen.getByText("Use +.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Show a hint" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("Use +.")); // the last hint: its button is done, the focus moves to it
  });

  it("SQL: says what stops a query, and counts every row though a run sends back 200", async () => {
    const sqlStep: CodeStep = { type: "code", id: "s1", prompt: T("List them."), lang: "sql", starter: "SELECT * FROM rain a, rain b", solution: "SELECT 1", setup: "" };
    m.run.mockResolvedValueOnce({ runs: [{ out: "", passed: false, table: { columns: ["x"], values: Array.from({ length: 200 }, (_, i) => [i]), rowCount: 371293 } }], ms: 900 });
    show(sqlStep);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByText("Rows: 371,293 (and 371,243 more)")).toBeTruthy();
    expect(document.querySelectorAll(".cd-table tbody tr")).toHaveLength(50);
    m.run.mockResolvedValueOnce({ runs: [], ms: 3000, timeout: true });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Stopped after 3 seconds. Does WITH RECURSIVE repeat without end, or does a join make far too many rows?")).toBeTruthy();
  });

  it("keeps the focus on Run while the runtime loads and the program runs, and moves it from Start again to Run", async () => {
    // A disabled button loses the focus in a browser (jsdom keeps it): the stand-in for loading takes it away.
    m.prepare.mockImplementation(async () => { (document.activeElement as HTMLElement | null)?.blur(); });
    m.run.mockResolvedValue({ runs: [{ out: "5\n", passed: true }], ms: 3 });
    show({ ...step, id: "c-focus" });
    const runBtn = await screen.findByRole("button", { name: "Run" });
    runBtn.focus();
    fireEvent.click(runBtn);
    await waitFor(() => expect(screen.getByText("5")).toBeTruthy());
    expect(document.activeElement).toBe(runBtn);
    const editor = screen.getByRole("textbox", { name: "Your code" });
    fireEvent.change(editor, { target: { value: "print(5)" } });
    const again = screen.getByRole("button", { name: "Start again" });
    again.focus();
    fireEvent.click(again);
    expect((again as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Run" }));
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

  it("indents with Tab, leaves with Esc then Tab or Shift+Tab, and says so (WCAG 2.1.2)", async () => {
    const tabStep = { ...step, id: "c-tab" }; // its own draft
    const { view } = show(tabStep);
    const editor = (await screen.findByRole("textbox", { name: "Your code" })) as HTMLTextAreaElement;
    const hint = document.getElementById(editor.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toBe("Tab indents. To leave the editor, press Esc, then Tab or Shift+Tab.");
    expect(hint.classList.contains("is-shown")).toBe(false); // touch screens show it once a key is used (code.css)
    editor.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(editor, { key: "Tab" })).toBe(false); // handled here: four spaces, and focus stays
    expect(editor.value).toBe("    print(2 + 2)");
    expect(hint.classList.contains("is-shown")).toBe(true);
    // Esc, then Shift (a keydown of its own) and Shift+Tab: left to the browser, which moves focus back.
    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.keyDown(editor, { key: "Shift", shiftKey: true });
    expect(fireEvent.keyDown(editor, { key: "Tab", shiftKey: true })).toBe(true);
    expect(editor.value).toBe("    print(2 + 2)");
    // Any other key closes that way out: Shift+Tab outdents again.
    fireEvent.keyDown(editor, { key: "a" });
    editor.setSelectionRange(4, 4);
    expect(fireEvent.keyDown(editor, { key: "Tab", shiftKey: true })).toBe(false);
    expect(editor.value).toBe("print(2 + 2)");
    view.unmount();
    // After Check the editor is locked: no hint.
    const again = show(tabStep, "en", true).view.container;
    await waitFor(() => expect(again.querySelector("textarea")).not.toBeNull());
    expect(again.querySelector("textarea")!.getAttribute("aria-describedby")).toBeNull();
    expect(again.querySelector(".cd-tab-hint")).toBeNull();
  });

  it("mends what an Arabic keyboard typed when Run is pressed, in the editor too", async () => {
    m.run.mockResolvedValue({ runs: [{ out: "5\n", passed: true }], ms: 3 });
    show({ ...step, id: "c-ar" }, "ar");
    const editor = (await screen.findByRole("textbox", { name: "الكود الذي تكتبه" })) as HTMLTextAreaElement;
    expect(screen.getByText("مفتاح Tab يُزيح السطر إلى الداخل. للخروج من محرّر الكود اضغط Esc ثم Tab أو Shift+Tab.")).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'print(٢ + ٣، "٢ + ٣")' } });
    fireEvent.click(screen.getByRole("button", { name: "شغّل" }));
    await waitFor(() => expect(m.run).toHaveBeenCalledWith(expect.objectContaining({ code: 'print(2 + 3, "٢ + ٣")' })));
    expect(editor.value).toBe('print(2 + 3, "٢ + ٣")');
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
  it("keeps the keyboard's place: a picked line hands the focus on in the pool, a row taken out to the next row", async () => {
    const order: ParsonsStep = { ...step, id: "p-focus", distractors: undefined, lines: ["a = 1", "b = 2", "print(a + b)"] };
    show(order);
    const press = (el: HTMLElement) => { el.focus(); fireEvent.click(el); };
    const pool = () => [...document.querySelectorAll<HTMLButtonElement>(".cd-pool > button")];
    await screen.findByRole("button", { name: "a = 1" });
    // The first line in the pool goes: the line now first has the focus; the last one: the one before it.
    let first = pool()[0];
    press(first);
    expect(document.activeElement).toBe(pool()[0]);
    first = pool()[1];
    press(first);
    expect(document.activeElement).toBe(pool()[0]);
    press(pool()[0]); // the pool is empty: its heading
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Lines to use" }));
    // An indent button that can go no further hands the focus to the other one.
    press(screen.getAllByRole("button", { name: "Indent" })[1]);
    expect(document.activeElement).toBe(screen.getAllByRole("button", { name: "Indent" })[1]);
    press(screen.getAllByRole("button", { name: "Indent less" })[1]);
    expect(document.activeElement).toBe(screen.getAllByRole("button", { name: "Indent" })[1]);
    // Take out the last row, then the rest: the row before it, then the program's heading.
    const outs = () => screen.getAllByRole("button", { name: "Take out" });
    press(outs()[2]);
    expect(document.activeElement).toBe(outs()[1]);
    press(outs()[0]);
    expect(document.activeElement).toBe(outs()[0]);
    press(outs()[0]);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your program" }));
  });
  it("leaves the focus alone when the pressed line didn't have it (a tap on a phone)", async () => {
    show({ ...step, id: "p-tap" });
    const btn = await screen.findByRole("button", { name: "print i" });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(btn);
    expect(document.activeElement).toBe(document.body);
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
  it("keeps the keyboard's place: Run gets the focus back after the walk, the card that fills the program hands it to Run", async () => {
    show({ ...step, id: "k-focus" });
    const press = (el: HTMLElement) => { el.focus(); fireEvent.click(el); };
    press(await screen.findByRole("button", { name: "Forward" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Forward" })); // still there: stays
    press(screen.getByRole("button", { name: "Turn left" })); // two cards: the commands are disabled
    const run = screen.getByRole("button", { name: "Run the robot" });
    expect(document.activeElement).toBe(run);
    vi.stubGlobal("matchMedia", () => ({ matches: false })); // the walk takes its time
    fireEvent.click(run);
    expect((run as HTMLButtonElement).disabled).toBe(true);
    run.blur(); // what a browser does with a focused button that gets disabled (jsdom keeps the focus)
    await waitFor(() => expect(document.querySelector(".cd-outcome")).not.toBeNull(), { timeout: 3000 });
    expect(document.activeElement).toBe(run);
    vi.unstubAllGlobals();
    // Clear disables itself: the first command.
    press(screen.getByRole("button", { name: "Clear" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Forward" }));
  });
});

describe("on a phone", () => {
  // A long Parsons line once widened the whole lesson page at 375 px: every code step's root carries cd-step, which
  // keeps it and its parts to the lesson's column (code.css), and pool lines wrap. jsdom has no layout, so this guards
  // the class; the width itself was measured in Chromium at 320 and 375 px, in English and Arabic.
  it("keeps every kind of code step to the lesson's column", async () => {
    const steps: Step[] = [
      { type: "code", id: "w1", prompt: T("Write it."), lang: "sql", starter: "SELECT 1", solution: "SELECT 2" },
      { type: "parsons", id: "p9", prompt: T("Order it."), lang: "python", lines: ['new = [r for r in rows if r["time"] > watermark]', "load(new)"] },
      { type: "codefill", id: "f9", prompt: T("Fill it."), lang: "python", code: [{ blank: 0 }, "(1)"], answers: ["print"] },
      { type: "bug", id: "b9", prompt: T("Find it."), lang: "python", code: "x = 1\nprint(x", line: 2, fix: "print(x)" },
      { type: "blocks", id: "k9", prompt: T("Walk it."), world: { cols: 2, rows: 2, start: { x: 0, y: 1, dir: "N" }, goal: { x: 0, y: 0 } }, commands: ["forward"], maxBlocks: 2 },
    ];
    for (const step of steps) {
      const { view } = show(step);
      await waitFor(() => expect(view.container.querySelector(".stack.cd-step")).not.toBeNull());
      view.unmount();
    }
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
