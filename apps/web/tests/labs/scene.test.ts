import { describe, expect, it } from "vitest";
import { compileQuestion, pictureHint } from "../../src/labs/apps/tutor/compile";
import { bubble, expand, greedyBag, parseScene, sceneResult, shortest, specForTopic, specFromCourse, specFromQuestion, type SceneSpec } from "../../src/labs/apps/tutor/expand";

describe("scene JSON", () => {
  it("copies a typed map into Dijkstra's picture", () => {
    const spec = compileQuestion("Home-Tala 4, Tala-School 3, Home-School 9, from Home to School");
    expect(spec).toEqual({
      kind: "graph", nodes: ["Home", "Tala", "School"],
      edges: [[0, 1, 4], [1, 2, 3], [0, 2, 9]], from: 0, to: 2,
    });
    if (spec?.kind !== "graph") throw new Error("expected a graph");
    const run = shortest(spec);
    expect(run.total).toBe(7);
    expect(sceneResult(spec!)).toEqual({ total: 7, path: ["Home", "Tala", "School"] });
    expect(run.path).toEqual([0, 1, 2]);
    const built = expand(spec!);
    expect(built.scene.content.elements[1]).toMatchObject({ type: "graph" });
    expect(JSON.stringify(built.scene)).toContain('"frame"');
    expect(built.line.ar).not.toContain("·");
  });

  it("sorts the numbers in the question", () => {
    const spec = compileQuestion("Sort 4, 2, 5, 1");
    expect(spec).toEqual({ kind: "sort", values: [4, 2, 5, 1] });
    const frames = bubble([4, 2, 5, 1]);
    const last = frames[frames.length - 1].order.map((i) => [4, 2, 5, 1][i]);
    expect(last).toEqual([1, 2, 4, 5]);
    expect(expand(spec!).scene.content.elements[1]).toMatchObject({ type: "array" });
  });

  it("writes the Arabic answers as Arabic: Arabic-Indic digits, «،» between items, counted nouns", () => {
    const sort = expand(compileQuestion("Sort 4, 2, 5, 1")!).line;
    expect(sort.en).toContain("In order: 1, 2, 4, 5.");
    expect(sort.ar).toContain("بعد الترتيب: ١، ٢، ٤، ٥.");
    expect(sort.ar).toMatch(/يجري [٠-٩]+ تبديلات/);
    const map = expand(compileQuestion("Home-Tala 4, Tala-School 3, Home-School 9, from Home to School")!).line;
    expect(map.ar).toContain("أقصر طريق هو Home ← Tala ← School، وطوله ٧.");
    const one = expand({ kind: "sort", values: [2, 1, 3] }).line.ar;
    expect(one).toContain("يجري تبديلًا واحدًا");
    const none = expand({ kind: "sort", values: [1, 2, 3] }).line.ar;
    expect(none).toContain("لا يحتاج إلى أي تبديل");
    const query = expand({ kind: "query", min: 60 }).line.ar;
    expect(query).toContain("اثنين: سلمى، أمينة.");
    const specs: SceneSpec[] = [compileQuestion("Pack books 5 3, desks 4 4, chalk 2 1, capacity 8")!, { kind: "signal", high: 30, low: 28, adc: 3 }, { kind: "search", values: [1, 3, 5, 7, 9], target: 7 }];
    for (const spec of specs) {
      const ar = expand(spec).line.ar;
      expect(ar).not.toMatch(/[0-9]/);
      expect(ar).not.toContain(", ");
    }
  });

  it("packs the truck from the question", () => {
    const spec = compileQuestion("Pack books 5 3, desks 4 4, chalk 2 1, capacity 8");
    expect(spec?.kind).toBe("bag");
    if (spec?.kind !== "bag") return;
    expect(greedyBag(spec.items, spec.cap).value).toBe(5);
    expect(expand(spec).json).toBe(JSON.stringify(spec));
    expect(parseScene(`scene${expand(spec).json}`)).toEqual(spec);
  });

  it("leaves a question with no picture alone", () => {
    expect(compileQuestion("What is the weather in Kafi?")).toBeNull();
    expect(pictureHint("What is the weather in Kafi?")).toBeNull();
  });

  it("builds a new pack scene for a course idea, and a different question is a different scene", () => {
    const fan = specForTopic("iot-temperature", "Why does the fan flicker at 30 degrees?");
    const other = specForTopic("iot-temperature", "Explain the classroom sensor again, please");
    expect(fan).toMatchObject({ kind: "signal" });
    expect(other).not.toEqual(fan);
    const built = expand(fan!);
    expect(built.pace).toBe("lesson");
    expect(built.scene.content.elements[1]).toMatchObject({ type: "signal" });
    expect(JSON.stringify(built.scene)).toContain('"frame"');
    expect(built.line.ar).not.toContain("·");
    const loop = expand(specForTopic("trace-loop", "Can you explain a loop with 2, 5 and 9?")!);
    expect(loop.scene.content.elements[1]).toMatchObject({ type: "trace" });
    expect(sceneResult(loop.spec)).toEqual({ total: 16 });
    const https = expand(specForTopic("net-https", "What does HTTPS hide?")!);
    expect(https.scene.content.elements[1]).toMatchObject({ type: "packet" });
    expect(parseScene(https.json)).toEqual({ kind: "packet" });
    const neuron = expand(specFromQuestion("what is a neuron")!);
    expect(neuron.spec).toMatchObject({ kind: "net", layers: [2, 1] });
    expect(neuron.scene.content.elements[1]).toMatchObject({ type: "net", layers: [2, 1] });
    expect(parseScene(neuron.json)).toEqual(neuron.spec);
    const neuron3 = expand(specFromQuestion("neuron with 3 inputs")!);
    expect(neuron3.spec).toMatchObject({ kind: "net", layers: [3, 1] });
    const net = expand(specFromQuestion("model network")!);
    expect(net.spec.kind).toBe("net");
    expect((net.spec as { layers: number[] }).layers.length).toBeGreaterThanOrEqual(3);
    const customNet = expand(specFromQuestion("neural network with 3, 5, 2 layers")!);
    expect(customNet.spec).toEqual({ kind: "net", layers: [3, 5, 2] });
    const spread = expand(specFromQuestion("Could you walk me through standard deviation?")!);
    expect(spread.spec).toEqual({ kind: "plot", mode: "distribution" });
    expect(spread.scene.content.elements[1]).toMatchObject({ type: "plot" });
    expect(spread.line.en).toContain("standard deviation");
    expect(specFromCourse("Please explain standard deviation to a beginner.")).toEqual({ kind: "plot", mode: "distribution" });
    expect(specFromCourse("فسّر الانحراف المعياري بكلمات بسيطة.")).toEqual({ kind: "plot", mode: "distribution" });
  });

  it("asks for a real list when a sort has the wrong numbers", () => {
    expect(compileQuestion("Sort 4,234")).toBeNull();
    expect(pictureHint("Sort 4,234")).toBe("sort");
  });
});
