// Lesson components and keyboard / screen reader users: focus never drops to the page, the right things are status
// messages, a scenario's outcome comes into view, and hotspots can sit on lines of text.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeedbackSheet, FillBlank, HotspotImage, LessonComplete, MatchPairs, QuestionHeader, Reflection, ScenarioCard, VideoPlayer } from "../src";

afterEach(cleanup);

describe("lesson components and focus", () => {
  it("FeedbackSheet takes the focus on its title and is not a live region inserted already filled", () => {
    render(<FeedbackSheet result="correct" title="Correct!" explanation="Because." onContinue={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Correct!" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("FeedbackSheet can leave the focus alone", () => {
    render(<FeedbackSheet result="wrong" title="Not quite" autoFocus={false} />);
    expect(document.activeElement).toBe(document.body);
  });
  it("QuestionHeader and LessonComplete titles can take focus from a script, outside the tab order", () => {
    render(<><QuestionHeader typeLabel="Choose one" prompt="Pick one" /><LessonComplete title="Lesson done!" /></>);
    expect(screen.getByRole("heading", { name: "Pick one" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("heading", { name: "Lesson done!" }).getAttribute("tabindex")).toBe("-1");
  });
  it("FillBlank keeps a placed word focusable and inert instead of disabling it", () => {
    const fn = vi.fn();
    render(<FillBlank onChange={fn} parts={["A ", { blank: 0 }, " and ", { blank: 1 }]} bank={["sensor", "motor"]} bankLabel="Word bank" />);
    const chip = screen.getByText("sensor").closest("button")!;
    chip.focus(); fireEvent.click(chip);
    expect(fn).toHaveBeenLastCalledWith({ 0: "sensor" });
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(chip);
    fireEvent.click(chip); // already used: nothing happens
    expect(fn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", { name: "Word bank" })).toBeTruthy();
  });
});

describe("ScenarioCard", () => {
  const choices = [{ id: "a", label: "Ask first", tone: "good" as const, consequence: "They explain." }, { id: "b", label: "Ignore it", tone: "consider" as const, consequence: "It grows." }];
  it("brings the outcome into view when a choice is picked, and it is a status message by default", () => {
    const scroll = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<ScenarioCard who="Amal" situation="A message." ask="What do you do?" choices={choices} />);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Ask first" }));
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.calls[0][0]).toMatchObject({ block: "nearest" });
      expect(screen.getByRole("status").textContent).toContain("They explain.");
    } finally { Element.prototype.scrollIntoView = was; }
  });
  it("leaves the announcing to the page when live is false", () => {
    render(<ScenarioCard who="Amal" situation="A message." ask="What do you do?" choices={choices} live={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ignore it" }));
    expect(screen.getByText("It grows.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("HotspotImage", () => {
  const spots = [{ id: "s1", x: 3, y: 25, w: 94, h: 17, label: "Urgency" }, { id: "s2", x: 3, y: 66, w: 94, h: 26, label: "The link" }];
  it("lets the picture place spots inside its own elements, and keeps the rest at x/y/w/h", () => {
    const { container } = render(<HotspotImage spots={spots} spotLabel="Possible problem area">
      {(spot) => <div><p className="line-a">A deadline.{spot("s1")}</p><p>No spot here.</p></div>}
    </HotspotImage>);
    const placed = container.querySelector(".line-a .dr-spot") as HTMLElement;
    expect(placed.style.width).toBe("100%");
    const free = [...container.querySelectorAll(".dr-spot")].find((b) => !b.closest(".line-a")) as HTMLElement;
    expect(free.style.top).toBe("66%");
    fireEvent.click(placed);
    expect(screen.getByRole("button", { name: "Urgency" })).toBe(placed);
    expect(container.querySelector(".dr-hotspot-foot")!.textContent).toBe("1 of 2 found");
  });
});

describe("answers in the page's own words and limits", () => {
  it("MatchPairs numbers its pairs in the digits it is given", () => {
    const { container } = render(<MatchPairs left={[{ id: "l0", label: "Sensor" }]} right={[{ id: "r0", label: "Senses" }]} numerals={["١"]} />);
    fireEvent.click(screen.getByText("Sensor"));
    fireEvent.click(screen.getByText("Senses"));
    expect([...container.querySelectorAll(".dr-match-badge")].map((b) => b.textContent)).toEqual(["١", "١"]);
  });
  it("Reflection stops at the length it is given", () => {
    render(<Reflection prompt="What will you try?" maxLength={50} />);
    expect(screen.getByLabelText("What will you try?").getAttribute("maxlength")).toBe("50");
  });
});

describe("VideoPlayer's length", () => {
  it("goes by the file's real length once its metadata is in, not the length it was told", () => {
    const { container } = render(<VideoPlayer title="t" duration={181} src="/v-ar.mp4" chapters={[{ at: 84, label: "Half" }]} />);
    expect(container.querySelector(".dr-video-time")!.textContent).toBe("0:00 / 3:01");
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 168 });
    fireEvent.loadedMetadata(video);
    expect(container.querySelector(".dr-video-time")!.textContent).toBe("0:00 / 2:48");
    expect((container.querySelector(".dr-video-tick") as HTMLElement).style.insetInlineStart).toBe("50%"); // 84 of 168 s
  });
});
