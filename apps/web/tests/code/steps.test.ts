import { fewestBlocks, runRobot } from "../../src/content/robot";
import type { BlocksStep, BugStep, CodeFillStep, CodeStep, ParsonsStep, Step } from "../../src/content/types";
import { validateUnit } from "../../src/content/validate";
import { grade } from "../../src/lesson/engine";
import { fromGaps, toGaps } from "../../src/cms/codeForms";
import { tokens } from "../../src/code/highlight";

const T = (en: string) => ({ en, ar: en });
const parsons: ParsonsStep = { type: "parsons", id: "p1", prompt: T("Order"), lang: "python", lines: ["total = 0", "for n in [1, 2]:", "    total += n", "print(total)"], distractors: ["print(n)"] };
const fill: CodeFillStep = { type: "codefill", id: "f1", prompt: T("Fill"), lang: "python", ...toGaps("for i in [[range]](3):\n    [[print]](i)"), distractors: ["input"] };
const bug: BugStep = { type: "bug", id: "b1", prompt: T("Bug"), lang: "python", code: "x = 5\nif x > 3\n    print(x)", line: 2, fix: "if x > 3:" };
const world = { cols: 4, rows: 3, start: { x: 0, y: 2, dir: "N" as const }, goal: { x: 3, y: 0 }, walls: [{ x: 1, y: 1 }] };
const blocks: BlocksStep = { type: "blocks", id: "k1", prompt: T("Robot"), world, commands: ["forward", "left", "right"], maxBlocks: 4 };
const code: CodeStep = { type: "code", id: "c1", prompt: T("Sum"), lang: "python", starter: "", solution: "print(1 + 2)", tests: [{ output: "3" }] };

describe("grading the code steps", () => {
  it("parsons: the right order, and the right indents in Python", () => {
    expect(grade(parsons, { kind: "parsons", lines: parsons.lines }, "en")).toBe(true);
    expect(grade(parsons, { kind: "parsons", lines: ["total = 0", "for n in [1, 2]:", "total += n", "print(total)"] }, "en")).toBe(false);
    expect(grade(parsons, { kind: "parsons", lines: ["total = 0", "for n in [1, 2]:", "    total += n", "print(n)"] }, "en")).toBe(false);
    expect(grade({ ...parsons, lang: "sql", lines: ["SELECT name", "FROM pupils"] }, { kind: "parsons", lines: ["  SELECT name", "FROM pupils"] }, "en")).toBe(true);
  });
  it("codefill, bug, code", () => {
    expect(fill.answers).toEqual(["range", "print"]);
    expect(fromGaps(fill)).toBe("for i in [[range]](3):\n    [[print]](i)");
    expect(grade(fill, { kind: "codefill", tokens: { 0: "range", 1: "print" } }, "en")).toBe(true);
    expect(grade(fill, { kind: "codefill", tokens: { 0: "range", 1: "input" } }, "en")).toBe(false);
    expect(grade(bug, { kind: "bug", line: 2 }, "en")).toBe(true);
    expect(grade(bug, { kind: "bug", line: 3 }, "en")).toBe(false);
    expect(grade(code, { kind: "code", passed: true }, "en")).toBe(true);
    expect(grade(code, { kind: "code", passed: false }, "en")).toBe(false);
  });
  it("blocks: the program must end on the goal, within the card limit", () => {
    const ok = [{ cmd: "right" as const, times: 1 }, { cmd: "forward" as const, times: 3 }, { cmd: "left" as const, times: 1 }, { cmd: "forward" as const, times: 2 }];
    expect(runRobot(world, ok).outcome).toBe("goal");
    expect(grade(blocks, { kind: "blocks", program: ok }, "en")).toBe(true);
    expect(grade({ ...blocks, maxBlocks: 3 }, { kind: "blocks", program: ok }, "en")).toBe(false);
    expect(runRobot(world, [{ cmd: "forward", times: 1 }, { cmd: "right", times: 1 }, { cmd: "forward", times: 1 }]).outcome).toBe("wall");
    expect(runRobot(world, [{ cmd: "forward", times: 4 }]).outcome).toBe("edge");
    expect(runRobot(world, [{ cmd: "forward", times: 2 }]).outcome).toBe("short");
    expect(fewestBlocks(world, ["forward", "left", "right"])).toBe(3); // forward ×2, right, forward ×3
    expect(fewestBlocks(world, ["forward"])).toBeNull();
  });
});

describe("validating the code steps", () => {
  const unit = (step: Step) => ({ id: "code-test", track: "code", level: 1, title: T("U"), summary: T("S"), lessons: [{ id: "code-test-1", title: T("L"), minutes: 10, tryTomorrow: T("t"), steps: [step], slides: [], kit: [], competencies: [] }] });
  const errors = (step: Step) => validateUnit(unit(step)).filter((i) => i.level === "error").map((i) => `${i.code}:${i.at.field}`);
  it("accepts well-made steps", () => {
    for (const s of [parsons, fill, bug, blocks, code, { ...code, lang: "sql" as const, tests: undefined, setup: "CREATE TABLE t (a INT);", solution: "SELECT a FROM t" }]) expect(errors(s), s.type).toEqual([]);
    expect(errors({ type: "choice", id: "q", prompt: T("What does it print?"), snippet: { lang: "python", text: "print(2 * 3)" }, options: [{ id: "a", text: T("6") }, { id: "b", text: T("23") }], answer: "a" })).toEqual([]);
  });
  it("says what is wrong", () => {
    expect(errors({ ...code, tests: [{ input: ["1"] }] })).toContain("codeTest:tests.0");
    expect(errors({ ...code, lang: "sql" as const })).toContain("required:setup");
    expect(errors({ ...code, solution: "" })).toContain("required:solution");
    expect(errors({ ...parsons, lines: ["total = 0", "  for n in x:"], distractors: ["total = 0"] })).toEqual(expect.arrayContaining(["badValue:lines.1", "badValue:distractors.0"]));
    expect(errors({ ...fill, answers: ["range"] })).toContain("fillAnswers:answers");
    expect(errors({ ...fill, distractors: ["range"] })).toContain("fillBank:distractors.0");
    expect(errors({ ...bug, line: 4 })).toContain("range:line");
    expect(errors({ ...blocks, maxBlocks: 2 })).toContain("unsolvable:world");
    expect(errors({ ...blocks, world: { ...world, goal: { x: 9, y: 0 } } })).toContain("range:world.goal");
    expect(errors({ ...blocks, commands: ["left", "right"] })).toContain("badValue:commands");
    expect(errors({ type: "truefalse", id: "q", prompt: T("?"), snippet: { lang: "ruby" as "python", text: "" }, answer: true })).toEqual(expect.arrayContaining(["badValue:snippet.lang", "required:snippet.text"]));
  });
  it("checks a virtual board: pins once each, known parts, readings in range", () => {
    const board = { seconds: 10, leds: [{ pin: 15, color: "red" as const }], buzzer: { pin: 16 }, buttons: [{ pin: 14, label: T("Bell"), presses: [0, 1] }],
      sensors: [{ pin: 26, kind: "light" as const, label: T("Light"), values: [100, 60000] }] };
    expect(errors({ ...code, board })).toEqual([]);
    expect(errors({ ...code, board: { ...board, buzzer: { pin: 15 }, seconds: 500, leds: [{ pin: 15, color: "pink" as "red" }],
      sensors: [{ pin: 41, kind: "smell" as "light", label: T("?"), values: [70000] }] } })).toEqual(expect.arrayContaining([
      "duplicateId:board.buzzer.pin", "range:board.seconds", "badValue:board.leds.0.color", "range:board.sensors.0.pin", "badValue:board.sensors.0.kind", "badValue:board.sensors.0.values"]));
  });
});

describe("colouring code", () => {
  it("finds keywords, built-ins, strings, numbers and comments, and keeps every character", () => {
    const line = `for i in range(3): print("hi", i)  # done`;
    const t = tokens(line, "python");
    expect(t.map((x) => x.text).join("")).toBe(line);
    expect(t.filter((x) => x.kind).map((x) => `${x.kind}:${x.text}`)).toEqual(["kw:for", "kw:in", "fn:range", "num:3", "fn:print", 'str:"hi"', "com:# done"]);
    expect(tokens("SELECT name, COUNT(*) FROM pupils WHERE mark > 8 -- top", "sql").filter((x) => x.kind).map((x) => x.text)).toEqual(["SELECT", "COUNT", "FROM", "WHERE", "8", "-- top"]);
  });
});
