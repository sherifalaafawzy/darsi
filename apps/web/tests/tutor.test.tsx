// The tutor's button and avatar: the floating button on lesson screens, the face it shows, and the lip-sync mapping.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { mouthFor } from "../src/tutor/audio";
import { TutorFab } from "../src/tutor/Fab";
import { TutorFace } from "../src/tutor/Face";

describe("tutor avatar", () => {
  it("opens the mouth with the voice's loudness: shut in silence, wide when loud, never past 1", () => {
    expect(mouthFor(new Float32Array(400))).toBe(0);
    const quiet = mouthFor(new Float32Array(400).fill(0.01)), loud = mouthFor(new Float32Array(400).fill(0.2));
    expect(quiet).toBeGreaterThan(0.1); // quiet syllables still move it
    expect(loud).toBeGreaterThan(quiet);
    expect(mouthFor(new Float32Array(400).fill(1))).toBe(1);
  });

  it("draws the face with the parts the panel animates, hidden from screen readers", () => {
    const { container } = render(<TutorFace className="tf-blink" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toBe("tf-face tf-blink");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".tf-mouth")).not.toBeNull();
    expect(container.querySelectorAll(".tf-eye")).toHaveLength(2);
    expect(container.querySelector(".tf-brows")).not.toBeNull();
  });

  it("is a labelled button that opens the tutor", () => {
    const onOpen = vi.fn();
    render(<TutorFab label="Ask the tutor" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the tutor" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("hosting lets Darsi's own pages use the microphone (Talk), and nothing else", () => {
    // `microphone=()` blocked it for the site itself: the browser refused without asking. The preview server sends no such header.
    const fb = JSON.parse(readFileSync(resolve(process.cwd(), "../../firebase.json"), "utf8"));
    const all = fb.hosting.headers.find((h: { source: string }) => h.source === "**");
    const policy = all.headers.find((h: { key: string }) => h.key === "Permissions-Policy").value;
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=()");
  });
});
