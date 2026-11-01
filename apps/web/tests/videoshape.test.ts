import { fitStage, saveVideoShape, videoShape } from "../src/lesson/LightLesson";

// Videos are landscape by default; the learner can turn them to portrait, and the choice is kept on the phone.
describe("video shape", () => {
  beforeEach(() => localStorage.clear());

  it("is landscape unless the learner turned it", () => {
    expect(videoShape()).toBe("landscape");
    saveVideoShape("portrait");
    expect(videoShape()).toBe("portrait");
    saveVideoShape("landscape");
    expect(videoShape()).toBe("landscape");
  });

  it("draws the 16:9 stage at full width by default, even on an upright phone", () => {
    const el = document.createElement("div");
    el.style.maxInlineSize = "100px";
    expect(fitStage(el)).toBe("landscape");
    expect(el.style.maxInlineSize).toBe("");
  });

  it("asks for portrait only when chosen (wide screens leave it to the player)", () => {
    const el = document.createElement("div");
    expect(fitStage(el, "portrait")).toBe("auto");
  });
});
