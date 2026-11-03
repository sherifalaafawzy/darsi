import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPackage, toScene, type Explainer } from "../src/explainer.js";
import { ICONS, TEMPLATES } from "../vendor/lessonstudio-spec.js";

// What the agent wrote for "show me how a phishing attack works" (a real run, shortened).
const phishing: Explainer = {
  title: "How Phishing Works",
  scenes: [
    { template: "title-hook", narration: "Phishing messages pretend to be someone you trust.", title: "How Phishing Works", kicker: "Online safety", hook: "Don't take the bait", icon: "warning" },
    { template: "message-mock", narration: "Scammers rush you. Notice the twenty-four hours and the link.", message: { kind: "sms", sender: "Bank Alert", lines: ["Your card is blocked.", "Confirm within 24 hours."], link: "unlock-bank.cc", flag: "False urgency", flag_line: 1 } },
    { template: "flow", narration: "The message sends you to a fake page that keeps your password.", title: "The trap", nodes: [{ id: "attacker", label: "Scammer", icon: "user", tone: "danger" }, { id: "you", label: "Your phone", icon: "phone" }, { id: "fake", label: "Fake site", icon: "link", tone: "danger" }], edges: [{ source: "attacker", target: "you", label: "Sends bait" }, { source: "you", target: "fake" }, { source: "you", target: "nobody" }] },
    { template: "steps", narration: "Stop first. Check through another channel. Then report it.", title: "What to do", items: ["Stop", "Check another way", "Report it"], reveal_words: ["Stop", "channel", "missing"] },
    { template: "quiz", narration: "Your turn.", question: { prompt: "What do you do first?", options: [{ id: "a", text: "Tap the link" }, { id: "b", text: "Stop and check" }], answer: "b", explain: "Stop, then check another way." } },
    { template: "summary", narration: "Spot the urgency, keep codes secret, check another way.", title: "Remember", items: ["Spot urgency", "Keep codes secret"], takeaway: "Check before you click." },
  ],
};

describe("explainers as Lesson Studio packages", () => {
  it("turns the agent's scenes into a package Lesson Studio accepts, timed for the learner's language", () => {
    const { pkg, errors } = toPackage(phishing, "en", new Date("2026-11-03T10:00:00Z"));
    expect(errors).toEqual([]);
    expect(pkg.scenes.scenes.map((s) => s.template)).toEqual(["title-hook", "message-mock", "flow", "steps", "quiz", "summary"]);
    const lang = (pkg.manifest.languages as { code: string; dir: string; duration: number }[])[0];
    expect(lang).toMatchObject({ code: "en", dir: "ltr" });
    expect(lang.duration).toBe(pkg.timing.en.duration);
    expect(pkg.timing.en.scenes).toHaveLength(6);
    expect(JSON.stringify(pkg).length).toBeLessThan(12_000); // a few KB, not a video file
  });

  it("drops what the player can't use: unknown edges, cues on words never said, bad quizzes and templates", () => {
    const flow = toScene(phishing.scenes[2], 2, "en", "t")!;
    expect((flow.content as { edges: unknown[] }).edges).toEqual([{ from: "attacker", to: "you", label: "Sends bait" }, { from: "you", to: "fake" }]);
    expect(toScene(phishing.scenes[3], 3, "en", "t")!.cues).toEqual([{ word: "Stop", action: "reveal", target: "1" }, { word: "channel", action: "reveal", target: "2" }]);
    expect(toScene({ template: "quiz", narration: "x", question: { prompt: "?", options: [{ id: "a", text: "A" }], answer: "z", explain: "" } }, 0, "en", "t")).toBeNull();
    expect(toScene({ template: "canvas", narration: "x" }, 0, "en", "t")).toBeNull();
    expect(toScene({ template: "title-hook", narration: "x", icon: "rocket-ship" }, 0, "en", "Fallback")!.content).toEqual({ kicker: undefined, title: "Fallback", hook: undefined, icon: undefined });
  });

  it("is right to left in Arabic", () => {
    const ar: Explainer = { title: "إزاي الآلات بتتعلم", scenes: [
      { template: "title-hook", narration: "تعالوا نشوف إزاي الأجهزة بتتعلم من الأمثلة.", title: "إزاي الآلات بتتعلم؟" },
      { template: "steps", narration: "بنجمع أمثلة، وبعدين بندرب، وبعدين بنختبر.", items: ["جمع الأمثلة", "التدريب", "الاختبار"], reveal_words: ["بنجمع", "بندرب", "بنختبر"] },
    ] };
    const { pkg, errors } = toPackage(ar, "ar");
    expect(errors).toEqual([]);
    expect(pkg.manifest.languages).toMatchObject([{ code: "ar", dir: "rtl", name: "العربية" }]);
  });

  it("the agent's explainer schema only offers templates and icons Lesson Studio knows", () => {
    const py = readFileSync(new URL("../../agent/darsi_tutor/explainer.py", import.meta.url), "utf8");
    const list = (re: RegExp) => [...(re.exec(py)?.[1] ?? "").matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
    const icons = list(/^Icon = Literal\[(.+)\]$/m), templates = list(/template: Literal\[(.+?)\]/);
    expect(icons.length).toBeGreaterThan(10);
    expect(icons.filter((i) => !ICONS.includes(i))).toEqual([]);
    expect(templates.filter((t) => !TEMPLATES.includes(t))).toEqual([]);
    expect(templates).not.toContain("canvas");
  });

  it("reports a package too thin to watch", () => {
    expect(toPackage({ title: "x", scenes: [{ template: "title-hook", narration: "Hi." }] }, "en").errors[0].code).toBe("tooFewScenes");
  });
});
