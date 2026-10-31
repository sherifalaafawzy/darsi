// @vitest-environment node
// The ten simulated tools give exactly tools.py's results (the model was trained on those), for 1,500 calls of the test
// sets and some odd ones.
import { calc, langOf, normalize, runTool, type Lang } from "../../src/tinylm/tools";
import { fixture, loadWorld } from "./load";

const world = loadWorld();
const cases = fixture<{ tool: string; args: unknown; lang: Lang; result: unknown }[]>("tools.json");

describe("Darsi Tiny tools", () => {
  it("match tools.py on the calls of the test sets", () => {
    expect(cases.length).toBeGreaterThan(1500);
    const tools = new Set(cases.map((c) => c.tool));
    for (const t of ["calculator", "timetable", "weather", "library", "attendance", "glossary", "reminder", "convert", "route", "send_message"]) expect(tools.has(t), t).toBe(true);
    for (const c of cases) expect(runTool(world, c.tool, c.args, c.lang), JSON.stringify(c)).toEqual(c.result);
  });

  it("keep JSON key order, which the model reads", () => {
    for (const c of cases.slice(0, 400)) expect(JSON.stringify(runTool(world, c.tool, c.args, c.lang))).toBe(JSON.stringify(c.result));
  });

  it("normalize names the way people type them", () => {
    expect(normalize("  The   Water-Cycle! ")).toBe("water cycle");
    expect(normalize("الخوارزمية")).toBe(normalize("خوارزمية"));
    expect(normalize("أحمد")).toBe(normalize("احمد"));
    expect(normalize("مَدْرَسَة")).toBe("مدرسه");
  });

  it("calculate safely", () => {
    expect(calc("2*(3+4)-10/4")).toBe(11.5);
    expect(() => calc("2^3")).toThrow();
    expect(() => calc("alert(1)")).toThrow();
    expect(runTool(world, "calculator", { expr: "1/0" }, "en")).toEqual({ error: "division by zero" });
    expect(runTool(world, "calculator", { expr: "999999999*9999999" }, "en")).toEqual({ error: "number too big" });
  });

  it("tell the conversation's language from the person's message", () => {
    expect(langOf("What's 2+2?")).toBe("en");
    expect(langOf("كم 2+2؟")).toBe("ar");
  });
});
