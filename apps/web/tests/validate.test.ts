import { readFileSync } from "node:fs";
import { join } from "node:path";
import unit from "../../../content/retired/ai-1.json";
import { COMPETENCIES } from "../src/content/competencies";
import { errorsOf, validateUnit, type Issue } from "../src/content/validate";

const codes = new Set(COMPETENCIES.map((c) => c.code));
type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A fresh copy of ai-1 to break one thing in. */
const base = (): AnyObj => structuredClone(unit) as AnyObj;
const stepOf = (u: AnyObj, type: string, lesson = 0) => {
  const l = u.lessons.findIndex((x: AnyObj, i: number) => i >= lesson && x.steps.some((s: AnyObj) => s.type === type));
  return u.lessons[l].steps.find((s: AnyObj) => s.type === type) as AnyObj;
};
const errs = (u: unknown) => errorsOf(validateUnit(u, { competencies: codes }));
const has = (issues: Issue[], code: Issue["code"], field?: string) => issues.some((i) => i.code === code && (field === undefined || i.at.field === field));

describe("validateUnit", () => {
  it("accepts the shipped ai-1 unit with no errors and no warnings", () => {
    expect(validateUnit(unit, { competencies: codes })).toEqual([]);
  });

  it("never throws on junk", () => {
    for (const junk of [null, 42, "x", [], { lessons: "no" }, { lessons: [null, 3, { steps: [null, { type: "fill" }] }] }]) expect(() => validateUnit(junk)).not.toThrow();
    expect(has(errs(null), "badValue")).toBe(true);
  });

  it("checks unit fields", () => {
    const u = base(); u.id = "Bad Id"; u.track = "Math!"; delete u.title.en; u.lessons = [];
    const e = errs(u);
    expect(has(e, "badId", "id")).toBe(true);
    expect(has(e, "badValue", "track")).toBe(true);
    const v = base(); v.level = 13;
    expect(has(errs(v), "range", "level")).toBe(true); // any well-formed track without a tracks list: levels 1-12
    expect(has(e, "required", "title.en")).toBe(true);
    expect(has(e, "minItems", "lessons")).toBe(true);
  });

  it("checks track and level against the tracks platform admins set up", () => {
    const tracks = new Map([["ai", 4], ["data", 6]]);
    const at = (track: string, level: number) => { const u = base(); u.track = track; u.level = level; return validateUnit(u, { tracks }).filter((i) => i.at.field === "track" || i.at.field === "level"); };
    expect(at("data", 6)).toEqual([]);
    expect(at("ai", 5)).toMatchObject([{ code: "range", params: { min: 1, max: 4 } }]);
    expect(at("math", 1)).toMatchObject([{ code: "badValue", at: { field: "track" } }]);
  });

  it("keeps lesson ids unique and prefixed with the unit id", () => {
    const u = base(); u.lessons[1].id = u.lessons[0].id; u.lessons[2].id = "other-3";
    const e = errs(u);
    expect(has(e, "duplicateId", "lessons.1.id")).toBe(true);
    expect(e.some((i) => i.code === "lessonIdPrefix" && i.at.lesson === 2)).toBe(true);
  });

  it("keeps step ids unique within a lesson", () => {
    const u = base(); u.lessons[0].steps[2].id = u.lessons[0].steps[3].id;
    expect(has(errs(u), "duplicateId")).toBe(true);
  });

  it("choice: the answer must be an option, and there must be two options", () => {
    const u = base(); const s = stepOf(u, "choice"); s.answer = "zzz";
    expect(has(errs(u), "answerNotInOptions", "answer")).toBe(true);
    s.options = s.options.slice(0, 1);
    expect(has(errs(u), "minItems", "options")).toBe(true);
  });

  it("multi: answers must be a subset of the options", () => {
    const u = base(); stepOf(u, "multi").answers.push("zzz");
    expect(has(errs(u), "answersNotInOptions", "answers")).toBe(true);
  });

  it("image: art must be a known picture", () => {
    const u = base(); stepOf(u, "image").options[0].art = "rocket";
    expect(has(errs(u), "badValue", "art")).toBe(true);
  });

  it("fill: blanks 0..n-1, n answers, and a bank holding every answer, per language", () => {
    const u = base(); const s = stepOf(u, "fill");
    s.sentence.ar = ["x ", { blank: 1 }];
    expect(has(errs(u), "fillBlanks", "sentence.ar")).toBe(true);
    const v = base(); stepOf(v, "fill").answers.en = ["token"];
    expect(has(errs(v), "fillAnswers", "answers.en")).toBe(true);
    const w = base(); stepOf(w, "fill").bank.en = ["token", "token", "next"];
    expect(has(errs(w), "fillBank", "bank.en")).toBe(true);
    const x = base(); stepOf(x, "fill").bank.ar = ["كتابًا"];
    expect(has(errs(x), "fillBank", "bank.ar")).toBe(true);
    const y = base(); stepOf(y, "fill").answers.en = ["token", "token"];
    expect(has(errs(y), "fillBank", "answers.en")).toBe(true);
  });

  it("hotspot: needs spots inside the stage", () => {
    const u = base(); const s = stepOf(u, "hotspot"); s.spots[0].x = 50; s.spots[0].w = 60;
    expect(has(errs(u), "range", "spots.0.w")).toBe(true);
    s.spots = [];
    expect(has(errs(u), "minItems", "spots")).toBe(true);
  });

  it("type, match, order, scenario, project and lab have their minimums", () => {
    const u = base();
    stepOf(u, "type").accept = { en: [] };
    stepOf(u, "match").pairs.splice(1);
    stepOf(u, "order").steps.splice(1);
    stepOf(u, "scenario").choices = [];
    stepOf(u, "project").rubric = [];
    stepOf(u, "lab").tool = "Not an id!";
    const e = errs(u);
    for (const [code, field] of [["required", "accept.en"], ["minItems", "pairs"], ["minItems", "steps"], ["minItems", "choices"], ["minItems", "rubric"], ["badValue", "tool"]] as const) expect(has(e, code, field)).toBe(true);
  });

  it("match: two cards on one side never read the same, in any language (pairs are graded by position)", () => {
    const u = base(); const s = stepOf(u, "match");
    expect(has(errs(u), "duplicateText")).toBe(false);
    s.pairs[1].right = { en: ` ${s.pairs[0].right.en.toUpperCase()} `, ar: s.pairs[1].right.ar };
    s.pairs[1].left.ar = s.pairs[0].left.ar;
    const e = errs(u).filter((i) => i.code === "duplicateText");
    expect(e.map((i) => i.at.field).sort()).toEqual(["pairs.1.left.ar", "pairs.1.right.en"]);
    expect(e.find((i) => i.at.field === "pairs.1.left.ar")?.params).toEqual({ value: s.pairs[0].left.ar });
  });

  it("video: positive duration, safe URLs, a checkpoint inside the video", () => {
    const u = base(); const s = stepOf(u, "video");
    s.src = "javascript:alert(1)"; s.sources = { en: "http://insecure.example/v.mp4" }; s.captions = { ar: "data:text/vtt,x" };
    const e = errs(u);
    expect(has(e, "badUrl", "src")).toBe(true);
    expect(has(e, "badUrl", "sources.en")).toBe(true);
    expect(has(e, "badUrl", "captions.ar")).toBe(true);
    // The local Emulator Suite's Storage is http on localhost: allowed, so units publish and check there too.
    const local = base(); stepOf(local, "video").sources = { en: "http://127.0.0.1:9199/v0/b/demo/o/v.mp4?alt=media", ar: "http://localhost:9199/v0/b/demo/o/v.mp4" };
    expect(errs(local).filter((i) => i.code === "badUrl")).toEqual([]);
    const v = base(); const sv = stepOf(v, "video"); sv.duration = 0;
    expect(has(errs(v), "range", "duration")).toBe(true);
    const w = base(); const sw = stepOf(w, "video"); sw.checkpoint = { at: 9999, question: { type: "choice", id: "v-q", prompt: { en: "?" }, options: [{ id: "a", text: { en: "A" } }], answer: "b" } };
    const ew = errs(w);
    expect(has(ew, "range", "checkpoint.at")).toBe(true);
    expect(has(ew, "minItems", "checkpoint.question.options")).toBe(true);
    expect(has(ew, "answerNotInOptions", "checkpoint.question.answer")).toBe(true);
    sw.checkpoint = { at: 5, question: { type: "fill" } };
    expect(has(errs(w), "checkpoint", "checkpoint")).toBe(true);
  });

  it("video: warns, without blocking, when a chapter isn't after the one above it, in any language", () => {
    const u = base(); const s = stepOf(u, "video"); s.duration = 130;
    const ch = (at: number, ar: number) => ({ at, atBy: { en: at, ar }, label: { en: "C", ar: "ف" } });
    s.chapters = [ch(0, 0), ch(17.7, 15), ch(44.3, 40), ch(92.1, 81.9)];
    expect(validateUnit(u, { competencies: codes })).toEqual([]);
    // What a chapter time that starts no scene used to give (scripts/import-media.mjs): "Remember" at 0:00 after the rest.
    s.chapters[3] = ch(0, 0);
    s.chapters[1].atBy.ar = 0;
    const issues = validateUnit(u, { competencies: codes });
    expect(errorsOf(issues)).toEqual([]);
    expect(issues.filter((i) => i.code === "range").map((i) => [i.at.field, i.level, i.params])).toEqual([
      ["chapters.1.atBy.ar", "warning", { min: 0, max: 3600 }],
      ["chapters.3.at", "warning", { min: 44.3, max: 129 }],
      ["chapters.3.atBy.ar", "warning", { min: 40, max: 3600 }],
    ]);
  });

  it("accepts uploaded media and kit URLs, and needs every listed format", () => {
    const u = base(); const s = stepOf(u, "video");
    s.sources = { en: "https://firebasestorage.googleapis.com/v0/b/b/o/x.mp4?alt=media&token=t" };
    u.lessons[0].kit = [{ kind: "slides", title: { en: "Slides", ar: "شرائح" }, pages: 6, formats: ["pdf", "pptx"], urls: { en: { pdf: "https://x.example/a.pdf" } } }];
    const e = errs(u);
    expect(e.filter((i) => i.at.field.startsWith("sources"))).toEqual([]);
    expect(has(e, "required", "urls.pptx")).toBe(true);
  });

  it("warns, without blocking, on missing Arabic, unknown competencies and no slides", () => {
    const u = base(); delete u.lessons[0].title.ar; u.lessons[0].competencies = ["NOPE.1"]; u.lessons[0].slides = [];
    const all = validateUnit(u, { competencies: codes });
    expect(errorsOf(all)).toEqual([]);
    expect(all.map((i) => i.code).sort()).toEqual(["missingLang", "noSlides", "unknownCompetency"]);
    expect(all.find((i) => i.code === "missingLang")).toMatchObject({ at: { lesson: 0, field: "title.ar" }, params: { lang: "ar" } });
  });

  it("refuses more than 30 competency codes, or a code over 40 characters: the rules would refuse its lesson results", () => {
    const many = base(); many.lessons[0].competencies = Array.from({ length: 31 }, (_, i) => `C.${i}`);
    expect(errs(many).some((i) => i.code === "badValue" && i.at.field === "competencies")).toBe(true);
    const long = base(); long.lessons[0].competencies = ["X".repeat(41)];
    expect(errs(long).some((i) => i.code === "badValue" && i.at.field === "competencies")).toBe(true);
    const fine = base(); fine.lessons[0].competencies = Array.from({ length: 30 }, (_, i) => `C.${i}`);
    expect(errs(fine).filter((i) => i.at.field === "competencies")).toEqual([]);
  });

  it("checks a lesson's optional materials list like any other list", () => {
    const u = base(); u.lessons[0].materials = { en: ["Board and chalk", "A thermometer"] };
    const all = validateUnit(u, { competencies: codes });
    expect(errorsOf(all)).toEqual([]);
    expect(all.find((i) => i.at.field === "materials.ar")).toMatchObject({ code: "missingLang", at: { lesson: 0 } });
    u.lessons[0].materials = { en: [] };
    expect(has(errs(u), "required", "materials.en")).toBe(true);
    delete u.lessons[0].materials;
    expect(validateUnit(u, { competencies: codes }).filter((i) => i.at.field.startsWith("materials"))).toEqual([]);
  });

  it("checks an activity slide's details: a list with one entry per bullet", () => {
    const u = base(); const sl = u.lessons[0].slides.find((s: AnyObj) => s.bullets);
    sl.details = { en: sl.bullets.en.map((b: string) => `${b} In full.`), ar: sl.bullets.ar.map((b: string) => `${b} كاملة.`) };
    expect(validateUnit(u, { competencies: codes }).filter((i) => i.at.field.startsWith("details"))).toEqual([]);
    sl.details.en = sl.details.en.slice(1);
    expect(has(errs(u), "badValue", "details.en")).toBe(true);
  });

  it("caps the size of a lesson", () => {
    const u = base(); stepOf(u, "read").body.en = "x".repeat(310_000);
    expect(errs(u).some((i) => i.code === "tooLarge" && i.at.lesson === 0)).toBe(true);
  });
});

describe("capstone fields", () => {
  const caps = ["agents", "ai", "aisec", "code", "cyber", "data", "ds", "iot", "opt"].map((t) => JSON.parse(readFileSync(join(__dirname, `../../../content/units/${t}-capstone.json`), "utf8")) as AnyObj);
  const cap = () => structuredClone(caps[1]);
  const proj = (u: AnyObj) => stepOf(u, "project");

  it("accepts all nine capstone units with no errors", () => {
    for (const u of caps) expect(errs(u), u.id).toEqual([]);
  });

  it("rejects unknown evidence, repeated evidence, setup for an unknown OS and bad starter names", () => {
    let u = cap(); proj(u).evidence = [{ kind: "zip" }];
    expect(has(errs(u), "badValue", "evidence.0")).toBe(true);
    u = cap(); proj(u).evidence = [{ kind: "repo" }, { kind: "repo" }];
    expect(has(errs(u), "duplicateId", "evidence")).toBe(true);
    u = cap(); proj(u).setup = [{ os: "linux", body: { en: "x", ar: "x" } }];
    expect(has(errs(u), "badValue", "setup.0")).toBe(true);
    u = cap(); proj(u).starterRepo = "https://github.com/x/y";
    expect(has(errs(u), "badValue", "starterRepo")).toBe(true);
    u = cap(); proj(u).hours = 0;
    expect(has(errs(u), "range", "hours")).toBe(true);
    u = cap(); u.kind = "bonus";
    expect(has(errs(u), "badValue", "kind")).toBe(true);
  });
});

