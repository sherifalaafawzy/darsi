// The tutor's button and avatar: the floating button on lesson screens, the face it shows, and the lip-sync mapping.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { mouthFor } from "../src/tutor/audio";
import { TutorFab } from "../src/tutor/Fab";
import { TutorFace } from "../src/tutor/Face";
import { TutorPanel } from "../src/tutor/Tutor";

const m = vi.hoisted(() => ({ auth: { user: { uid: "u1" } as unknown, plan: { until: Date.now() + 864e5 } as unknown, profile: null as unknown } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));

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
    // The app's site (firebase.json has two since school sign-in: "app" and "login").
    const all = fb.hosting.find((h: { target: string }) => h.target === "app").headers.find((h: { source: string }) => h.source === "**");
    const policy = all.headers.find((h: { key: string }) => h.key === "Permissions-Policy").value;
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=()");
  });
});

describe("the tutor out of credits", () => {
  // The typed tutor (no relay), whose question the server refuses with no-credits; the warm-up answers.
  const panel = () => (
    <I18nProvider lang="en"><MemoryRouter>
      <TutorPanel unitId="ai-1-1" lessonId="ai-1-1-1" onClose={() => {}} relayUrl="" Player={null}
        ask={(d) => ((d as { warm?: boolean }).warm ? Promise.resolve({ sessionId: "" }) : Promise.reject(new Error("functions/resource-exhausted: no-credits"))) as never}
        status={() => Promise.resolve({ super: true, on: true, left: 0, minute: 1, maxMinutes: 14, explainer: 3 })} />
    </MemoryRouter></I18nProvider>
  );
  const askOnce = async () => {
    render(panel());
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "What is a sensor?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  };
  const SEAT = "You have no tutor credits. Your organization's seat gives you Darsi Super without credits for now.";
  const USED = "You've used your tutor credits.";

  it("someone whose Super is an organization's seat is told they have none, not that they used them, and can still get more", async () => {
    m.auth = { user: { uid: "u1" }, plan: { until: Date.now() + 864e5 }, profile: { planSource: "org" } };
    await askOnce();
    expect(await screen.findByText(SEAT)).toBeTruthy();
    expect(screen.queryByText(USED)).toBeNull();
    expect(screen.getByRole("button", { name: "Get more" })).toBeTruthy();
  });

  it("someone with their own subscription is told they've used them, as before", async () => {
    m.auth = { user: { uid: "u1" }, plan: { until: Date.now() + 864e5 }, profile: { planSource: "subscription" } };
    await askOnce();
    expect(await screen.findByText(USED)).toBeTruthy();
    expect(screen.queryByText(SEAT)).toBeNull();
    expect(screen.getByRole("button", { name: "Get more" })).toBeTruthy();
  });
});
