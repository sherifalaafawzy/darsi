// The lesson player: readings keep their line breaks and links, a lesson in progress survives a reload, students get
// student wording at the end, screen readers hear results without the whole step being a live region, focus follows
// the lesson, a video checkpoint shows its code, warning signs sit on their lines, and capstone milestones resume.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import type { HotspotStep, Lesson, ProjectStep, Step, Unit, VideoStep } from "../src/content/types";

// uid: an account signed in on this phone (as offlineUid: signed in, Firebase not loaded), or null for a guest.
const h = vi.hoisted(() => ({ role: "learner", stored: null as unknown, unit: null as unknown, uid: null as string | null }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: h.role, user: null, configured: false, offlineUid: h.uid }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadUnit: async () => h.unit,
}));

const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { LessonScreen } = await import("../src/screens/LessonScreen");
const { StepView } = await import("../src/lesson/StepView");
const { ProjectView } = await import("../src/lesson/ProjectView");
const { LessonRun, loadRun, saveRun, RUN_MAX_AGE } = await import("../src/lesson/engine");
const { validateUnit } = await import("../src/content/validate");

const READ: Step = { id: "s1", type: "read", prompt: { en: "Read this" }, title: { en: "Reading one" }, body: { en: "Body one" } };
const CHOICE: Step = { id: "s2", type: "choice", prompt: { en: "Pick one" }, options: [{ id: "a", text: { en: "Apple" } }, { id: "b", text: { en: "Banana" } }], answer: "a", explain: { en: "Apples are fruit." } };
const REFLECT: Step = { id: "s3", type: "reflect", prompt: { en: "Think about it" } };
const lesson = (steps: Step[] = [READ, CHOICE, REFLECT], id = "l1"): Lesson => ({ id, title: { en: "First lesson" }, minutes: 5, tryTomorrow: { en: "Show it to someone." }, slides: [], kit: [], steps });
const unitOf = (extra: Partial<Unit> = {}, lessons = [lesson()]): Unit => ({ id: "u1", track: "ai", level: 1, title: { en: "Course" }, summary: { en: "S" }, lessons, ...extra });

const open = (url = "/lesson/u1/l1") => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider>
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/lesson/:unitId/:lessonId" element={<LessonScreen />} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter>
</StoreProvider></SettingsProvider></I18nProvider>);
const step = (s: Step, lang = "en", extra: Record<string, unknown> = {}) => render(<I18nProvider lang={lang}><StepView step={s} result={null} onAnswer={() => {}} onUngradedReady={() => {}} attempt={0} lessonId="l1" unitId="u1" {...extra} /></I18nProvider>);
const continueBtn = () => screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
const toChoice = async () => {
  await screen.findByText("Reading one");
  await waitFor(() => expect(continueBtn().disabled).toBe(false));
  fireEvent.click(continueBtn());
  await screen.findByText("Pick one");
};

beforeEach(() => { localStorage.clear(); h.role = "learner"; h.uid = null; h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"] }; h.unit = unitOf(); });
afterEach(cleanup);

describe("a reading", () => {
  it("keeps each line of a paragraph, links real addresses and leaves example ones as text", () => {
    const body = "Exact clicks:\n1. Open https://github.com/signup\n2. Copy https://github.com/YOU/ai-capstone.\n3. Install Git (https://git-scm.com), then VS Code\n\nWindows:\npython -m venv .venv\n.venv\\Scripts\\activate";
    const { container } = step({ ...READ, body: { en: body } } as Step);
    const [list, cmds] = [...container.querySelectorAll(".reading > p")];
    expect(list.querySelectorAll("br")).toHaveLength(3);
    expect(cmds.querySelectorAll("br")).toHaveLength(2);
    expect(cmds.textContent).toBe("Windows:python -m venv .venv.venv\\Scripts\\activate"); // three lines, not one run-on command
    const links = [...container.querySelectorAll(".reading a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["https://github.com/signup", "https://git-scm.com"]); // no "), " in the link, and no link to the user "YOU"
    expect(container.querySelector(".reading a")!.getAttribute("dir")).toBe("ltr");
  });

  it("lays out a bare command or path left to right on an Arabic page, and keeps Arabic and isolated lines in its flow", () => {
    const body = "على Windows:\n.venv\\Scripts\\activate\n1. افتح ⁦https://github.com/signup⁩\n4. ⁦Verify → Create account⁩";
    const { container } = step({ ...READ, body: { en: "x", ar: body } } as Step, "ar");
    const ltr = [...container.querySelectorAll(".reading > p bdi[dir=ltr]")].map((b) => b.textContent);
    expect(ltr).toEqual([".venv\\Scripts\\activate"]); // "على Windows:" has Arabic, "4. ⁦…⁩" is already isolated: its number stays on the right
    expect(container.querySelector(".reading a")!.getAttribute("href")).toBe("https://github.com/signup");
    expect(container.querySelector(".reading > p")!.textContent).toContain("⁦https://github.com/signup⁩"); // isolates stay in the text
  });
});

describe("a video step's checkpoint", () => {
  const video: VideoStep = {
    id: "v1", type: "video", prompt: { en: "Watch" }, title: { en: "Loops" }, src: null, duration: 120, sizeMB: 1, transcript: { en: "A loop adds 1, 2 and 3." },
    checkpoint: { at: 60, question: { id: "cp", type: "choice", prompt: { en: "What does this program print?" }, snippet: { lang: "python", text: "total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)" },
      options: [{ id: "a", text: { en: "3" } }, { id: "b", text: { en: "6" } }], answer: "b", explain: { en: "1 + 2 + 3 is 6." } } },
  };
  it("shows the program with the question, and moves focus to the result after Check", async () => {
    const { container } = step(video);
    const card = container.querySelector(".checkpoint-card")!;
    expect(card.textContent).toContain("print(total)");
    // Asked before the transcript, which may give the answer away straight after the moment the video asks it.
    expect(card.compareDocumentPosition(container.querySelector(".transcript")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByText("6"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(document.activeElement?.className).toBe("cp-ok"));
    expect(document.activeElement?.textContent).toContain("1 + 2 + 3 is 6.");
  });
  it("inside the playing video, the card's button keeps watching, and the lesson's Continue is the way on", () => {
    const onward = vi.fn(), ready = vi.fn();
    const { container } = step({ ...video, src: "/media/v1/video-{lang}.mp4" }, "en", { focusContinue: onward, onUngradedReady: ready });
    const v = container.querySelector("video")!;
    Object.defineProperty(v, "currentTime", { configurable: true, value: 61 });
    fireEvent.timeUpdate(v);
    const card = container.querySelector(".dr-video-checkpoint")!;
    fireEvent.click([...card.querySelectorAll("button")].find((b) => b.textContent?.endsWith("6"))!);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(ready).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep watching" }));
    expect(container.querySelector(".dr-video-checkpoint")).toBeNull();
    expect(onward).toHaveBeenCalledTimes(1);
  });
  it("readies the lesson's Continue once answered, with no Continue of its own: one way on", () => {
    const ready = vi.fn();
    const { container } = step(video, "en", { onUngradedReady: ready });
    fireEvent.click(screen.getAllByText("3").find((x) => x.closest("button"))!); // not the 3 in the program
    expect(ready).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(ready).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    // The result, then why, as two sentences: not "Not quite — 1 + 2…".
    const said = container.querySelector(".cp-no")!;
    expect(said.querySelector("strong")!.textContent).toBe("Not quite");
    expect(said.textContent).toBe("Not quite1 + 2 + 3 is 6.");
    expect(said.textContent).not.toContain("—");
  });
});

describe("a hotspot message", () => {
  const spot = (id: string, line: number | "link" | undefined, y: number) => ({ id, x: 3, y, w: 94, h: 17, line, label: { en: `Sign ${id}`, ar: `علامة ${id}` } });
  const hot: HotspotStep = {
    id: "p4", type: "hotspot", prompt: { en: "Tap the warning signs" }, mock: { from: "Mods", body: { en: "A story.\nA deadline.\nYour password.", ar: "قصة.\nمهلة.\nكلمة مرورك." }, link: { en: "appeal.example", ar: "appeal.example" } },
    spots: [spot("s1", 1, 25), spot("s2", 2, 41), spot("s3", "link", 66)],
  };
  it("puts each spot on its own line (or the link), whatever the width, with a label in the page's language", () => {
    const { container } = step(hot, "ar");
    const lines = [...container.querySelectorAll(".mock-line")];
    expect(lines.map((l) => l.querySelectorAll(".dr-spot").length)).toEqual([0, 1, 1, 1]); // the story has none
    expect(lines[3].className).toContain("mock-link");
    expect(lines[1].querySelector(".dr-spot")!.getAttribute("style")).toContain("width: 100%");
    // Each its own name, in page order and Arabic digits, so a screen reader doesn't hear three identical buttons.
    expect([...container.querySelectorAll(".dr-spot")].map((b) => b.getAttribute("aria-label"))).toEqual(["١", "٢", "٣"].map((n) => `منطقة قد تكون فيها مشكلة، ${n} من ٣`));
    fireEvent.click(lines[2].querySelector(".dr-spot")!);
    expect(lines[2].querySelector(".dr-spot-badge")!.textContent).toBe("١"); // the first found, in Arabic digits
    expect(lines[2].getAttribute("dir")).toBeNull();
    expect(lines[3].getAttribute("dir")).toBe("auto"); // "Appeal here: …" in Arabic reads right to left
  });
  it("keeps x/y/w/h for a spot without a line, and says what was found", () => {
    const said: string[] = [];
    const { container } = step({ ...hot, spots: [spot("s1", undefined, 25), ...hot.spots.slice(1)] }, "en", { announce: (s: string) => said.push(s) });
    const free = [...container.querySelectorAll(".dr-spot")].find((b) => !b.closest(".mock-line"))!;
    expect(free.getAttribute("style")).toContain("top: 25%");
    fireEvent.click(free);
    expect(said).toEqual(["Sign s1 1 of 3 found"]);
  });
});

describe("a fill-in step on an Arabic page", () => {
  it("names its word bank and blanks in Arabic, and keeps a used word focusable", () => {
    step({ id: "f1", type: "fill", prompt: { en: "Fill" }, sentence: { en: ["A ", { blank: 0 }, " senses."] }, bank: { en: ["sensor", "motor"] }, answers: { en: ["sensor"] } } as Step, "ar");
    expect(screen.getByRole("group", { name: "بنك الكلمات" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "فراغ لم يُملأ" })).toBeTruthy();
    const chip = screen.getByText("sensor").closest("button")!;
    chip.focus(); fireEvent.click(chip);
    expect(chip.disabled).toBe(false);
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(chip);
  });
});

describe("a question's explanation", () => {
  it("shows once after a wrong answer, in the answer sheet, not under the right option too", async () => {
    open();
    await toChoice();
    fireEvent.click(screen.getByText("Banana"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeTruthy();
    // On screen once (the sheet); the status line out of sight reads it to screen readers.
    const shown = screen.getAllByText("Apples are fruit.").filter((x) => !x.closest(".lesson-live"));
    expect(shown).toHaveLength(1);
    expect(shown[0].closest(".lesson-body")).toBeNull();
  });
});

describe("the lesson's screen reader support", () => {
  it("has no live region around the step, announces the explanation on Check, and moves focus with the lesson", async () => {
    const { container } = open();
    await toChoice();
    expect(container.querySelector("main")!.hasAttribute("aria-live")).toBe(false);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Pick one")); // the new step's heading
    fireEvent.click(screen.getByText("Apple"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Correct!"));
    expect(screen.getByRole("status").textContent).toBe("Apples are fruit.");
    fireEvent.click(continueBtn());
    await screen.findByText("Think about it");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Think about it"));
  });
});

describe("a lesson in progress", () => {
  it("picks up where it was after a reload, and Start over begins again", async () => {
    open();
    await toChoice();
    expect(loadRun("guest", "l1")?.index).toBe(1);
    cleanup(); // the tab closes
    open();
    expect(await screen.findByText("Pick one")).toBeTruthy();
    expect(screen.getByText("You’re back where you left off.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByText("Reading one")).toBeTruthy();
    expect(loadRun("guest", "l1")).toBeNull();
  });

  it("forgets it when the lesson is finished, and never keeps a platform admin's look around", async () => {
    open();
    await toChoice();
    fireEvent.click(screen.getByText("Apple"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(continueBtn());
    await screen.findByText("Think about it");
    fireEvent.click(continueBtn());
    expect(await screen.findByText("Lesson done!")).toBeTruthy();
    expect(loadRun("guest", "l1")).toBeNull();
    cleanup();
    h.role = "superadmin";
    open();
    await toChoice();
    expect(loadRun("guest", "l1")).toBeNull();
  });

  it("restores only a snapshot that fits the lesson, and drops one a day old", () => {
    const l = lesson();
    const run = new LessonRun(l);
    run.next(); run.record(CHOICE as never, false); run.next(); run.next(); // the wrong answer comes back at the end
    const snap = run.snapshot();
    const back = LessonRun.restore(l, snap)!;
    expect(back.index).toBe(3);
    expect(back.queue.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s2"]);
    expect(back.isRetry).toBe(true);
    expect(back.summary().accuracy).toBe(0); // the first try still counts
    expect(LessonRun.restore(lesson([READ, REFLECT]), snap)).toBeNull(); // republished with other steps
    expect(LessonRun.restore(l, { ...snap, index: 0 })).toBeNull(); // nothing to pick up
    expect(LessonRun.restore(l, { ...snap, results: { s9: true } })).toBeNull();
    expect(LessonRun.restore(l, { ...snap, retried: [] })).toBeNull();
    expect(LessonRun.restore(l, "junk")).toBeNull();
    saveRun("guest", "l1", { ...snap, at: Date.now() - RUN_MAX_AGE - 1 });
    expect(loadRun("guest", "l1")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});

describe("the end of a lesson", () => {
  const finish = async () => {
    await toChoice();
    fireEvent.click(screen.getByText("Apple"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(continueBtn());
    await screen.findByText("Think about it");
    fireEvent.click(continueBtn());
    await screen.findByText("Lesson done!");
  };
  it("speaks to students as students: their week, their notes, and back to learning first at a course's end", async () => {
    h.unit = unitOf({ audience: "students" });
    open();
    await finish();
    expect(screen.getByText("Try it this week")).toBeTruthy();
    expect(screen.queryByText("Try it in class tomorrow")).toBeNull();
    const kit = screen.getByRole("button", { name: "Open your notes and slides" });
    expect(kit.className).toContain("dr-btn-secondary");
    expect(screen.getByRole("button", { name: "Back to learning" }).className).toContain("dr-btn-primary");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Lesson done!"));
  });
  it("keeps the classroom wording for teachers, and the next lecture for university courses", async () => {
    open();
    await finish();
    expect(screen.getByText("Try it in class tomorrow")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open classroom kit" }).className).toContain("dr-btn-primary");
    cleanup();
    h.unit = unitOf({ teach: "university" });
    open();
    await finish();
    expect(screen.getByText("Try it in your next lecture")).toBeTruthy();
  });
});

describe("a capstone's submission", () => {
  const milestone = (n: number): ProjectStep => ({
    id: `project-m${n}`, type: "project", prompt: { en: `Milestone ${n}: Part ${n}\n\nBuild part ${n}.\n\nHand in: the code.` }, task: { en: `Build part ${n}.` },
    deliverable: { en: "The code." }, rubric: [{ criterion: { en: "Works" } }], evidence: [{ kind: "repo" }, { kind: "url" }],
  });
  const sub = () => lesson([{ id: "brief", type: "read", prompt: { en: "Brief" }, title: { en: "The brief" }, body: { en: "Five milestones." } }, milestone(1), milestone(2), milestone(3)], "cap-sub");

  it("opens at the first milestone this account hasn't sent from this phone, with only its title as the heading", async () => {
    h.uid = "pupil-a";
    localStorage.setItem("darsi-project-draft:cap-sub:project-m1", JSON.stringify({ text: "Done", sentAt: Date.now() - 86_400_000, sentBy: "pupil-a" }));
    h.unit = unitOf({ kind: "capstone", audience: "students" }, [sub()]);
    open("/lesson/u1/cap-sub");
    expect(await screen.findByRole("heading", { name: "Milestone 2: Part 2" })).toBeTruthy();
    expect(screen.getByText("You’re back where you left off.")).toBeTruthy();
    expect(screen.getByText("Add at least one link to your work (required for this milestone)")).toBeTruthy();
    expect(screen.getByLabelText(/Links to your work/).getAttribute("aria-required")).toBe("true");
    expect(screen.getByRole("button", { name: "I’ll build it and send it later" })).toBeTruthy(); // hours on their own computer, not "in class"
  });

  it("never takes another account's send on a shared phone for this one's", async () => {
    h.uid = "pupil-b";
    localStorage.setItem("darsi-project-draft:cap-sub:project-m1", JSON.stringify({ text: "Done", sentAt: Date.now() - 86_400_000, sentBy: "pupil-a" }));
    h.unit = unitOf({ kind: "capstone", audience: "students" }, [sub()]);
    open("/lesson/u1/cap-sub");
    expect(await screen.findByText("The brief")).toBeTruthy(); // from the start
    expect(screen.queryByText("You’re back where you left off.")).toBeNull();
    cleanup();
    render(<I18nProvider lang="en"><ProjectView step={milestone(1)} lessonId="cap-sub" unitId="u1" onReady={() => {}} /></I18nProvider>);
    expect(screen.queryByText(/^Sent on /)).toBeNull();
    expect(screen.getByLabelText("Your evidence")).toBeTruthy();
  });

  it("tells a guest how to have a milestone checked, with a way to make an account", async () => {
    h.unit = unitOf({ kind: "capstone", audience: "students" }, [sub()]);
    open("/lesson/u1/cap-sub");
    await screen.findByText("The brief");
    await waitFor(() => expect(continueBtn().disabled).toBe(false));
    fireEvent.click(continueBtn());
    expect(await screen.findByText("To have your milestone checked, create a free account. What you type here stays on this phone.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/signup");
  });

  it("shows a milestone sent on an earlier visit as sent, and lets the lesson go on", async () => {
    const at = new Date("2026-11-03T10:00:00Z").getTime();
    h.uid = "pupil-a";
    localStorage.setItem("darsi-project-draft:cap-sub:project-m1", JSON.stringify({ text: "Done", sentAt: at, sentBy: "pupil-a" }));
    const ready = vi.fn();
    render(<I18nProvider lang="en"><ProjectView step={milestone(1)} lessonId="cap-sub" unitId="u1" onReady={ready} /></I18nProvider>);
    expect(screen.getByText(/^Sent on /).textContent).toContain("2026");
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: "Improve it and send again" }));
    expect(screen.getByLabelText("Your evidence")).toBeTruthy();
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(false));
  });

  it("sets up one command per line, as its readings do", () => {
    const m = { ...milestone(1), setup: [{ os: "windows" as const, body: { en: "In the terminal:\n\nWindows:\npython -m venv .venv\npip install -r requirements.txt" } }] };
    const { container } = render(<I18nProvider lang="en"><ProjectView step={m} lessonId="cap-sub" unitId="u1" onReady={() => {}} /></I18nProvider>);
    const paras = [...container.querySelectorAll(".setup-body > p")];
    expect(paras.map((p) => p.querySelectorAll("br").length)).toEqual([0, 2]);
  });
});

describe("a hotspot spot's line in the validator", () => {
  const cyber = () => JSON.parse(readFileSync(join(__dirname, "../../../content/units/cyber-s3.json"), "utf8")) as Unit & Record<string, never>;
  const spotIssues = (u: unknown) => validateUnit(u).filter((i) => /^(spots\.|mock\.body)/.test(i.at.field) && i.level === "error");
  it("accepts the live cyber-s3 message, whose signs sit on lines 1 and 2 and the link", () => {
    const u = cyber();
    const hot = u.lessons.flatMap((l) => l.steps).find((s) => s.type === "hotspot") as HotspotStep;
    expect(hot.spots.map((s) => s.line)).toEqual([1, 2, "link"]);
    expect(spotIssues(u)).toEqual([]);
  });
  it("refuses a line the message doesn't have, and a translation with other lines", () => {
    const u = cyber();
    const hot = u.lessons.flatMap((l) => l.steps).find((s) => s.type === "hotspot") as HotspotStep;
    hot.spots[0].line = 3;
    hot.mock.body.ar = hot.mock.body.ar!.split("\n").slice(0, 2).join("\n");
    expect(spotIssues(u).map((i) => [i.code, i.at.field])).toEqual([["range", "spots.0.line"], ["badValue", "mock.body.ar"]]);
  });
});

describe("a video step that can't play, and its captions", () => {
  const mp4: VideoStep = {
    id: "v2", type: "video", prompt: { en: "Watch" }, title: { en: "Sensors" }, src: null, duration: 181, sizeMB: 1.1,
    sources: { en: "https://cdn.example/v-en.mp4", ar: "https://cdn.example/v-ar.mp4" },
    captions: { en: "https://cdn.example/v-en.vtt", ar: "https://cdn.example/v-ar.vtt", fr: "https://cdn.example/v-fr.vtt" },
    transcript: { en: "One. Two. Three. Four. Five.", ar: "واحد. اثنان." },
  };
  it("offers only the captions timed to the video that plays, and says its size in the page's words", () => {
    const { container } = step(mp4, "ar");
    expect([...container.querySelectorAll("track")].map((x) => x.getAttribute("srclang"))).toEqual(["ar"]); // not the English or French ones
    const meta = container.querySelector(".dr-video")!.textContent!;
    expect(meta).toContain("ميغابايت");
    expect(meta).not.toContain("MB");
    cleanup();
    const en = step(mp4, "en").container;
    expect([...en.querySelectorAll("track")].map((x) => x.getAttribute("srclang"))).toEqual(["en", "fr"]); // French has no video of its own
  });
  it("says a video that exists but can't load is unavailable, not 'in production', and drops the dead player", () => {
    const { container } = step(mp4, "en");
    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByText(/can’t play right now/)).toBeTruthy();
    expect(screen.queryByText(/in production/)).toBeNull();
    expect(container.querySelector(".dr-video")).toBeNull();
    expect([...container.querySelectorAll(".transcript p")].map((p) => p.textContent)).toEqual(["One. Two. Three.", "Four. Five."]);
    cleanup();
    step({ ...mp4, sources: undefined }, "en");
    expect(screen.getByText(/in production/)).toBeTruthy();
  });
});

describe("a transcript's paragraphs", () => {
  it("keeps its blank lines, else starts a new paragraph every three sentences, never inside an isolate", async () => {
    const { transcriptParas } = await import("../src/lesson/readingText");
    expect(transcriptParas("A.\n\nB. C.")).toEqual(["A.", "B. C."]);
    expect(transcriptParas("One. “Two?” Three! Four… Five.")).toEqual(["One. “Two?” Three!", "Four… Five."]);
    expect(transcriptParas("اكتب \u2066print(1). print(2). print(3).\u2069 الآن. ثم شغّله؟ جيد. تم.")).toEqual(["اكتب \u2066print(1). print(2). print(3).\u2069 الآن. ثم شغّله؟ جيد.", "تم."]);
  });
});

describe("a question asked again", () => {
  it("comes back with its options in another order, after the answer was shown", () => {
    const four: Step = { ...CHOICE, options: ["a", "b", "c", "d"].map((id) => ({ id, text: { en: `Option ${id}` } })) } as Step;
    const order = (attempt: number) => { const { container } = step(four, "en", { attempt }); const o = [...container.querySelectorAll(".dr-opt")].map((b) => b.textContent); cleanup(); return o; };
    const first = order(0);
    expect(order(0)).toEqual(first); // the same every visit
    expect(order(1)).not.toEqual(first);
    const two = (attempt: number) => { const { container } = step(CHOICE, "en", { attempt }); const o = container.textContent; cleanup(); return o!.indexOf("Apple") < o!.indexOf("Banana"); };
    expect(two(1)).not.toBe(two(0));
  });
});

describe("a reflection", () => {
  it("goes to the learner's notes when they move on without tapping Save", () => {
    const onNote = vi.fn();
    const { unmount } = step(REFLECT, "en", { onNote });
    const box = screen.getByLabelText("Think about it");
    expect(box.getAttribute("maxlength")).toBe("50000");
    fireEvent.change(box, { target: { value: "I will try it with my class." } });
    unmount();
    expect(onNote).toHaveBeenCalledWith("I will try it with my class.");
  });
  it("isn't saved twice once Save was tapped, nor when nothing was typed", () => {
    const onNote = vi.fn();
    const { unmount } = step(REFLECT, "en", { onNote });
    fireEvent.change(screen.getByLabelText("Think about it"), { target: { value: "Done." } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    unmount();
    expect(onNote).toHaveBeenCalledTimes(1);
    cleanup();
    const quiet = vi.fn();
    step(REFLECT, "en", { onNote: quiet }).unmount();
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe("Arabic pages", () => {
  it("number matched pairs in Arabic digits", () => {
    const { container } = step({ id: "m1", type: "match", prompt: { en: "Match" }, pairs: [{ left: { en: "Sensor", ar: "مستشعر" }, right: { en: "Senses", ar: "يستشعر" } }] } as Step, "ar");
    fireEvent.click(screen.getByText("مستشعر"));
    fireEvent.click(screen.getByText("يستشعر"));
    expect(container.querySelector(".dr-match-badge")!.textContent).toBe("١");
  });
});

describe("the lesson page's outline", () => {
  it("has the lesson's title as its h1, over each step's heading", async () => {
    open();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("First lesson");
    expect(screen.getByRole("heading", { level: 2, name: "Reading one" })).toBeTruthy();
  });
});

describe("a project's answers", () => {
  const PROJECT: ProjectStep = { id: "p1", type: "project", prompt: { en: "Try it" }, task: { en: "Do it." }, deliverable: { en: "A photo." }, rubric: [{ criterion: { en: "Done" } }] };
  it("stop where the rules do, and an older draft over the limit says why it can't be sent", () => {
    localStorage.setItem("darsi-project-draft:l1:p1", JSON.stringify({ text: "x".repeat(20_001) }));
    render(<I18nProvider lang="en"><ProjectView step={PROJECT} lessonId="l1" unitId="u1" onReady={() => {}} /></I18nProvider>);
    const box = screen.getByLabelText("Your evidence");
    expect(box.getAttribute("maxlength")).toBe("20000");
    expect(screen.getByText("Too long to send: 20,001 of 20,000 characters. Shorten it a little.")).toBeTruthy();
    expect(box.getAttribute("aria-describedby")).toBe("room-text-p1");
  });
  it("tell a guest before the form that sending needs an account", () => {
    const { container } = render(<I18nProvider lang="en"><ProjectView step={PROJECT} lessonId="l1" unitId="u1" onReady={() => {}} /></I18nProvider>);
    const note = screen.getByText(/To send your work for review, sign in or create an account/);
    expect(note.compareDocumentPosition(screen.getByLabelText("Your evidence")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll(".notice").length).toBe(1);
  });
  it("tell a student guest how to send it, without 'in class'", () => {
    render(<I18nProvider lang="en"><ProjectView step={PROJECT} lessonId="l1" unitId="u1" onReady={() => {}} student /></I18nProvider>);
    expect(screen.getByText(/You can still do the task on your own/)).toBeTruthy();
    expect(screen.queryByText(/in class/)).toBeNull();
  });
});
