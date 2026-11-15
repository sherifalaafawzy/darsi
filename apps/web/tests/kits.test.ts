// @vitest-environment node
// The printed kits (scripts/build-kits.mjs): each sheet speaks to whoever answers it, unit checks print every
// question, order, match and word-bank questions never print their answer, the answers page has a key for every
// printed question, and the page count of each built PDF is written back into its unit.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lesson, Step, Unit } from "../src/content/types";
import { firstSentence, packHtml, pdfPages, planHtml, printedSteps, printOrder, withPages } from "../scripts/build-kits.mjs";

const T = (en: string, ar = `ع ${en}`) => ({ en, ar });
const L = (en: string[], ar = en.map((x) => `ع ${x}`)) => ({ en, ar });
const steps: Step[] = [
  { id: "video", type: "video", prompt: T("Watch"), title: T("Video"), src: null, duration: 60, sizeMB: 1, transcript: T("…") },
  { id: "p1", type: "choice", prompt: T("Pick one"), options: [{ id: "a", text: T("Apple") }, { id: "b", text: T("Banana") }, { id: "c", text: T("Cherry") }, { id: "d", text: T("Date") }], answer: "b", explain: T("Bananas are the only yellow fruit in this list. They are also long.") },
  { id: "p2", type: "order", prompt: T("Put in order"), steps: [T("First"), T("Second"), T("Third"), T("Fourth"), T("Fifth")], explain: T("One by one.") },
  { id: "p3", type: "match", prompt: T("Match"), pairs: [{ left: T("Cat"), right: T("Meow") }, { left: T("Dog"), right: T("Woof") }, { left: T("Cow"), right: T("Moo") }], explain: T("Animals.") },
  { id: "p4", type: "fill", prompt: T("Fill"), sentence: { en: ["A ", { blank: 0 }, " and a ", { blank: 1 }, "."], ar: ["ع ", { blank: 0 }, " و ", { blank: 1 }, "."] }, bank: L(["cup", "plate", "spoon", "fork"]), answers: L(["cup", "plate"]), explain: T("Kitchen.") },
  { id: "p5", type: "truefalse", prompt: T("The sky is green."), answer: false, explain: T("It is blue.") },
  { id: "p6", type: "multi", prompt: T("Pick all"), options: [{ id: "a", text: T("Red") }, { id: "b", text: T("Square") }, { id: "c", text: T("Blue") }], answers: ["a", "c"], explain: T("Colours.") },
  { id: "reflect", type: "reflect", prompt: T("What will your pupils remember?") },
];
const codeSteps: Step[] = [
  { id: "c1", type: "parsons", lang: "python", prompt: T("Order the code"), lines: ["total = 0", "for n in range(3):", "    total = total + n", "print(total)"], distractors: ["print(n)"], explain: T("Loop then print.") },
  { id: "c2", type: "codefill", lang: "python", prompt: T("Fill the code"), code: ["if m ", { blank: 0 }, " 10:\n    n = ", { blank: 1 }], answers: [">=", "n + 1"], distractors: ["=", "m + 1"], explain: T("Count.") },
  { id: "c3", type: "bug", lang: "python", prompt: T("Find the bug"), code: "n = 1\nwhile n <= 3:\n    n = n - 1", line: 3, fix: "n = n + 1", explain: T("It never ends.") },
  { id: "c4", type: "code", lang: "python", prompt: T("Write it"), starter: "", solution: "print(6)", tests: [{ output: "6" }], explain: T("Print it.") },
  { id: "c5", type: "blocks", prompt: T("Walk the robot"), world: { cols: 3, rows: 3, start: { x: 0, y: 2, dir: "N" }, goal: { x: 0, y: 0 } }, commands: ["forward", "left", "right"], maxBlocks: 2, explain: T("Two steps.") },
];
const slides = (["title", "bullets", "bullets", "activity", "questions", "exit"] as const).map((layout) => ({ layout, title: T(`${layout} slide`), bullets: L([`a ${layout} point`]), note: T("Note") }));
const lesson = (id: string, s: Step[] = steps): Lesson => ({ id, title: T(`Lesson ${id}`), minutes: 17, steps: s, tryTomorrow: T("Try it."), slides, kit: [] });
const unit = (extra: Partial<Unit> & { level: number }, lessons: Lesson[]): Unit => ({ id: "t-1", track: "ai", title: T("Test"), summary: T("Test"), lessons, ...extra } as unknown as Unit);
// A check of ten graded questions (plus one that can't be printed).
const checkSteps: Step[] = [...steps.slice(1, 7), ...codeSteps.slice(0, 4), { id: "h1", type: "hotspot", prompt: T("Tap it"), mock: { from: "x", body: T("b"), link: T("l") }, spots: [] }].map((s, i) => ({ ...s, id: `q${i + 1}` }) as Step);

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const part = (html: string, name: string) => new RegExp(`<section class="page" data-part="${name}">([\\s\\S]*?)</section>`).exec(html)?.[1] ?? "";
/** The questions of a part, by step id, each with the HTML up to the next one. */
const blocks = (html: string, cls: "q" | "ans") => Object.fromEntries(html.split(`<div class="${cls}`).slice(1).map((b) => [/data-step="([^"]+)"/.exec(b)?.[1] ?? "", b]));
const strips = (b: string) => [...b.matchAll(/<div><i><\/i>(?:<code>)?([^<]*)(?:<\/code>)?<\/div>/g)].map((m) => unesc(m[1]));
const options = (b: string) => [...b.matchAll(/<span><i[^>]*><\/i>([^<]*)<\/span>/g)].map((m) => unesc(m[1]));
const rights = (b: string) => [...b.matchAll(/<span class="dots">[^<]*<\/span><span class="b">([^<]*)<\/span>/g)].map((m) => unesc(m[1]));
const bank = (b: string, sep: string) => unesc(/<p class="bank"><b>[^<]*:<\/b> ([^<]*)<\/p>/.exec(b)?.[1] ?? "").split(sep);

describe("printOrder", () => {
  it("is the same every time, depends only on the seed and the count, and differs per lesson", () => {
    expect(printOrder(6, "ai-1-1-1:p2")).toEqual(printOrder(6, "ai-1-1-1:p2"));
    const seeds = ["ai-1-1-1:p2", "ai-1-1-2:p2", "ai-1-1-3:p2", "ai-1-1-4:p2", "cyber-1-1-1:p2"];
    expect(new Set(seeds.map((s) => printOrder(5, s, true).join())).size).toBeGreaterThan(1);
    expect(printOrder(1, "x", true)).toEqual([0]);
    expect(printOrder(0, "x", true)).toEqual([]);
  });

  it("scrambled, never keeps an item in its place, read down or (from four items) up", () => {
    for (let n = 2; n <= 9; n++) for (let k = 0; k < 60; k++) {
      const p = printOrder(n, `lesson-${k}:p${n}`, true);
      expect([...p].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
      p.forEach((v, i) => {
        expect(v).not.toBe(i);
        if (n >= 4) expect(v).not.toBe(n - 1 - i);
      });
      if (n >= 3) expect(p).not.toEqual([...Array(n).keys()].reverse());
    }
  });
});

describe("the lesson plan's sheet", () => {
  const teachers1 = unit({ level: 1 }, [lesson("t-1-1"), lesson("t-1-check", checkSteps)]);
  const teachers2 = unit({ level: 2 }, [lesson("t-2-1"), lesson("t-2-check", checkSteps)]);
  const students = unit({ level: 2, audience: "students" }, [lesson("s-1"), lesson("s-check", checkSteps)]);
  const uni = unit({ level: 4, teach: "university" }, [lesson("u-1"), lesson("u-check", checkSteps)]);

  it("prints the first five questions of a lesson and every printable question of a unit check", () => {
    const sheet = part(planHtml(teachers1, teachers1.lessons[0], "en"), "sheet");
    expect(Object.keys(blocks(sheet, "q")).filter((id) => id !== "reflect")).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    const check = planHtml(teachers1, teachers1.lessons[1], "en");
    expect(Object.keys(blocks(part(check, "sheet"), "q"))).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]);
    expect(Object.keys(blocks(part(check, "answers"), "ans"))).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]);
    expect(printedSteps(teachers1.lessons[1]).length).toBe(10);
  });

  it("never prints an order, match or word bank in its answer order, and prints the same order in English and Arabic", () => {
    for (const lang of ["en", "ar"]) {
      const q = blocks(part(planHtml(teachers1, teachers1.lessons[0], lang), "sheet"), "q");
      const pre = lang === "ar" ? "ع " : "";
      const order = strips(q.p2);
      expect(order).toHaveLength(5);
      order.forEach((x, i) => { expect(x).not.toBe(`${pre}${["First", "Second", "Third", "Fourth", "Fifth"][i]}`); expect(x).not.toBe(`${pre}${["Fifth", "Fourth", "Third", "Second", "First"][i]}`); });
      rights(q.p3).forEach((x, i) => expect(x).not.toBe(`${pre}${["Meow", "Woof", "Moo"][i]}`));
      expect(bank(q.p4, lang === "ar" ? "، " : " · ").slice(0, 2)).not.toEqual(lang === "ar" ? ["ع cup", "ع plate"] : ["cup", "plate"]);
    }
    const en = blocks(part(planHtml(teachers1, teachers1.lessons[0], "en"), "sheet"), "q"), ar = blocks(part(planHtml(teachers1, teachers1.lessons[0], "ar"), "sheet"), "q");
    expect(options(ar.p1)).toEqual(options(en.p1).map((x) => `ع ${x}`));
    expect(strips(ar.p2)).toEqual(strips(en.p2).map((x) => `ع ${x}`));
    expect(rights(ar.p3)).toEqual(rights(en.p3).map((x) => `ع ${x}`));
  });

  it("keeps a shared answer away from every left side it belongs to", () => {
    const shared: Step = { id: "p1", type: "match", prompt: T("Hard or soft deadline?"), pairs: [["Airbag", "Hard"], ["Video", "Soft"], ["Pacemaker", "Hard"], ["Weather", "Soft"]].map(([l, r]) => ({ left: T(l), right: T(r) })) };
    for (let k = 0; k < 20; k++) {
      const u = unit({ level: 1 }, [lesson(`m-${k}`, [shared])]);
      expect(rights(blocks(part(planHtml(u, u.lessons[0], "en"), "sheet"), "q").p1)).toEqual(["Soft", "Hard", "Soft", "Hard"]);
    }
  });

  it("scrambles Parsons strips and the code word bank too", () => {
    const q = blocks(part(planHtml(teachers2, teachers2.lessons[1], "en"), "sheet"), "q");
    const lines = ["total = 0", "for n in range(3):", "total = total + n", "print(total)", "print(n)"];
    strips(q.q7).forEach((x, i) => expect(x).not.toBe(lines[i]));
    const tokens = unesc(/<code dir="ltr">([^<]*)<\/code><\/p>/.exec(q.q8)?.[1] ?? "").split("   ");
    expect(tokens.sort()).toEqual(["=", ">=", "m + 1", "n + 1"].sort());
    expect(unesc(/<code dir="ltr">([^<]*)<\/code><\/p>/.exec(q.q8)?.[1] ?? "").startsWith(">=")).toBe(false);
  });

  it("speaks to the pupils in a level-1 teachers' course, and keeps the teacher's reflection off their sheet", () => {
    const html = planHtml(teachers1, teachers1.lessons[0], "en");
    expect(part(html, "plan")).toContain("Lesson plan · for the teacher");
    expect(part(html, "sheet")).toContain("Worksheet · for pupils");
    expect(part(html, "sheet")).toMatch(/<div class="fields"><div>Name<\/div><div>Class<\/div><div>Date<\/div><\/div>/);
    expect(part(html, "sheet")).not.toContain("What will your pupils remember?");
    expect(part(html, "answers")).toContain("Answers · for the teacher");
    expect(part(html, "answers")).toContain("What will your pupils remember?");
    expect(html).toContain("Try it in class tomorrow");
  });

  it("makes the sheet the teacher's own practice from level 2, and a team quiz sheet in a unit check", () => {
    const html = planHtml(teachers2, teachers2.lessons[0], "en");
    expect(part(html, "sheet")).toContain("Practice questions · for you");
    expect(part(html, "sheet")).not.toContain('class="fields');
    expect(part(html, "sheet")).toContain("What will your pupils remember?");
    expect(part(html, "answers")).toContain("Check your answers");
    expect(html).toContain("Try it at school tomorrow");
    expect(html).not.toContain("for pupils");
    const check = planHtml(teachers2, teachers2.lessons[1], "en");
    expect(part(check, "plan")).toContain("Review plan · for the teacher");
    expect(part(check, "sheet")).toContain("Quiz sheet · for each team");
    expect(part(check, "sheet")).toMatch(/<div class="fields two"><div>Team<\/div><div>Date<\/div><\/div>/);
    expect(part(check, "answers")).toContain("Answers · for the teacher");
  });

  it("speaks to the student in a students' course, reflection and self-check included", () => {
    const html = planHtml(students, students.lessons[0], "en");
    expect(part(html, "plan")).toContain("Lesson notes · for you");
    expect(part(html, "sheet")).toContain("Worksheet");
    expect(part(html, "sheet")).toContain("What will your pupils remember?");
    expect(part(html, "answers")).toContain("Check your answers");
    expect(html).not.toMatch(/for the teacher|for pupils/);
    const check = planHtml(students, students.lessons[1], "en");
    expect(part(check, "plan")).toContain("Review notes · for you");
    expect(part(check, "sheet")).toContain("Quiz sheet");
    expect(part(check, "sheet")).toContain("<div>Name</div>");
  });

  it("gives university students a seminar sheet without the lecturer's reflection, and an institution's labels", () => {
    const html = planHtml(uni, uni.lessons[0], "en");
    expect(part(html, "sheet")).toContain("Seminar sheet · for students");
    expect(part(html, "sheet")).toContain("<div>Group</div>");
    expect(part(html, "sheet")).not.toContain("What will your pupils remember?");
    expect(part(html, "answers")).toContain("Answers · for the lecturer");
    expect(part(html, "answers")).toContain("What will your pupils remember?");
    expect(html).toContain('"Darsi · free to copy for your institution"');
    expect(html).not.toContain("for your school");
    const ar = planHtml(uni, uni.lessons[0], "ar");
    expect(ar).toContain("<div>المجموعة</div>");
    expect(ar).toContain("لمؤسستك");
  });

  it("writes the Arabic labels by the glossary: «الفصل» for a class, and never «·»", () => {
    const html = planHtml(teachers1, teachers1.lessons[0], "ar");
    expect(part(html, "sheet")).toContain("<div>الفصل</div>");
    expect(html).toContain("جرّبها في الفصل غدًا");
    expect(html).not.toContain("الصف");
    for (const u of [teachers1, teachers2, students, uni]) for (const l of u.lessons) expect(planHtml(u, l, "ar")).not.toContain("·");
    expect(planHtml(teachers2, teachers2.lessons[0], "ar")).toContain("أسئلة للتدريب — لك");
  });

  it("puts the footer in the page margin, so it is on every page and never over the text", () => {
    const html = planHtml(teachers1, teachers1.lessons[0], "en");
    expect(html).toMatch(/@bottom-left\{content:"Darsi · free to copy for your school"/);
    expect(html).toMatch(/@bottom-right\{content:"Lesson t-1-1"/);
    expect(html).not.toContain('class="foot"');
    expect(planHtml(teachers1, teachers1.lessons[0], "ar")).toMatch(/@bottom-right\{content:"درسي — يُسمح بنسخها لمدرستك مجانًا"/);
    // A title can hold quotes, a backslash or code ("x < 10"): it stays one CSS string, and never closes the style.
    const odd = unit({ level: 1 }, [{ ...lesson("t-1-2"), title: T('Loop "while" x < 10 \\ done') }]);
    const oddHtml = planHtml(odd, odd.lessons[0], "en");
    expect(oddHtml).toContain('@bottom-right{content:"Loop \\"while\\" x \\3c  10 \\\\ done"');
    expect(/<style>([\s\S]*?)<\/style>/.exec(oddHtml)?.[1]).not.toContain("<");
  });
});

describe("the answers page", () => {
  const u = unit({ level: 1 }, [lesson("t-1-check", checkSteps)]);
  const text = (b: string) => unesc(b.replace(/<\/?b>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const key = (lang: string) => Object.fromEntries(Object.entries(blocks(part(planHtml(u, u.lessons[0], lang), "answers"), "ans")).map(([id, b]) => [id, text(b)]));
  const sheet = blocks(part(planHtml(u, u.lessons[0], "en"), "sheet"), "q");

  it("answers every printed question, with the first sentence of its explanation", () => {
    const k = key("en");
    expect(k.q1).toContain("Banana");
    expect(k.q1).toContain("Bananas are the only yellow fruit in this list.");
    expect(k.q1).not.toContain("They are also long.");
    // The number to write in each box, top to bottom, is each printed step's place in the answer.
    const ranks = strips(sheet.q2).map((x) => ["First", "Second", "Third", "Fourth", "Fifth"].indexOf(x) + 1);
    expect(k.q2).toContain(`Top to bottom: ${ranks.join(", ")}`);
    expect(k.q3).toContain("Cat — Meow");
    expect(k.q3).toContain("Cow — Moo");
    expect(k.q4).toContain("A cup and a plate.");
    expect(k.q5).toContain("False");
    expect(k.q6).toContain("Red; Blue");
    const parsons = strips(sheet.q7).map((x) => (x === "print(n)" ? "✗" : String(["total = 0", "for n in range(3):", "total = total + n", "print(total)"].indexOf(x) + 1)));
    expect(k.q7).toContain(`Top to bottom: ${parsons.join(", ")}`);
    expect(k.q7).toContain("total = total + n");
    expect(k.q8).toContain("if m >= 10:");
    expect(k.q8).toContain("n = n + 1");
    expect(k.q9).toContain("Line 3 : n = n + 1");
    expect(k.q10).toContain("print(6)");
  });

  it("is in Arabic with Arabic digits, and the robot's key counts its cards", () => {
    const k = key("ar");
    expect(k.q5).toContain("خطأ");
    expect(k.q2).toMatch(/من الأعلى إلى الأسفل: [١-٥](، [١-٥]){4}/);
    const robot = unit({ level: 1 }, [lesson("r-1", [codeSteps[4]])]);
    expect(part(planHtml(robot, robot.lessons[0], "en"), "answers")).toContain("with 2 cards or fewer");
    expect(part(planHtml(robot, robot.lessons[0], "ar"), "answers")).toContain("لا يزيد على ٢");
  });
});

describe("what the plan and the sheet print", () => {
  it("names the activity once, even when its slide title already says 'Activity:'", () => {
    const sl = slides.map((s) => (s.layout === "activity" ? { ...s, title: T("Activity: The human list", "النشاط: القائمة البشرية") } : s));
    const u = unit({ level: 1, audience: "students" }, [{ ...lesson("a-1"), slides: sl }]);
    expect(part(planHtml(u, u.lessons[0], "en"), "plan")).toContain("<h2>Activity: The human list</h2>");
    expect(part(planHtml(u, u.lessons[0], "ar"), "plan")).toContain("<h2>النشاط: القائمة البشرية</h2>");
  });

  it("asks for the indent with arrows only when the Parsons lines have one", () => {
    const flat: Step = { ...codeSteps[0], lines: ["a = 1", "print(a)"], distractors: [] } as Step;
    const u = unit({ level: 1 }, [lesson("p-1", [codeSteps[0], { ...flat, id: "c9" }])]);
    const q = blocks(part(planHtml(u, u.lessons[0], "en"), "sheet"), "q");
    expect(q.c1).toContain("draw one arrow → in front of a line for each indent");
    expect(q.c9).not.toContain("arrow");
    expect(blocks(part(planHtml(u, u.lessons[0], "ar"), "sheet"), "q").c1).toContain("عن كل إزاحة");
  });

  it("never prints a word bank with all its answers first", () => {
    for (let k = 0; k < 40; k++) {
      const u = unit({ level: 1 }, [lesson(`b-${k}`)]);
      const words = bank(blocks(part(planHtml(u, u.lessons[0], "en"), "sheet"), "q").p4, " · ");
      expect(words.slice(0, 2).sort(), `b-${k}`).not.toEqual(["cup", "plate"]);
    }
  });

  it("points to a codefill's question instead of printing its answer in another question's code", () => {
    const fill: Step = { id: "c2", type: "codefill", lang: "python", prompt: T("Fill the filter"), code: ["def blocked(msg):\n    return ", { blank: 0 }, " in msg\n"], answers: ["'pin'"], distractors: ["pin"], explain: T("A string.") };
    const whole: Step = { id: "p1", type: "choice", prompt: T("What does it return for 'my pin'?"), snippet: { lang: "python", text: "def blocked(msg):\n    return 'pin' in msg" }, options: [{ id: "a", text: T("True") }, { id: "b", text: T("False") }], answer: "a" } as Step;
    const prefix: Step = { ...whole, id: "p3", snippet: { lang: "python", text: "def blocked(msg):\n\n    return 'pin' in msg\n\nprint(blocked('pin 1'))" } } as Step;
    const u = unit({ level: 1 }, [lesson("f-1", [whole, fill, prefix])]);
    const q = blocks(part(planHtml(u, u.lessons[0], "en"), "sheet"), "q");
    expect(q.p1).toContain("Use the code from question 2, with its gaps filled in.");
    expect(unesc(q.p1)).not.toContain("return 'pin'");
    expect(q.p3).toContain("Here goes the code from question 2, with its gaps filled in.");
    expect(unesc(q.p3)).toContain("print(blocked('pin 1'))");
    expect(unesc(q.p3)).not.toContain("return 'pin'");
    expect(unesc(q.c2)).toContain("def blocked(msg):");
    expect(blocks(part(planHtml(u, u.lessons[0], "ar"), "sheet"), "q").p1).toContain("استخدم الكود من السؤال ٢ بعد ملء فراغاته.");
  });

  it("leaves off a program to write when a printed bug question shows it, mistake and all", () => {
    const write: Step = { id: "w", type: "code", lang: "python", prompt: T("Write add_one"), starter: "def add_one(x):\n    pass\n", solution: "def add_one(x):\n    return x + 1\n\nprint(add_one(1))\n", tests: [{ output: "2" }] } as Step;
    const bug: Step = { id: "g", type: "bug", lang: "python", prompt: T("Find the bug"), code: "def add_one(x):\n    return x - 1", line: 2, fix: "    return x + 1" } as Step;
    const s = [steps[1], write, steps[2], bug, steps[3], steps[4], steps[5]];
    expect(printedSteps(lesson("w-1", s)).map((x) => x.id)).toEqual(["p1", "p2", "g", "p3", "p4"]);
    // Without the bug question on the sheet, the program stays.
    expect(printedSteps(lesson("w-2", [write, ...steps.slice(1, 6), bug])).map((x) => x.id)).toEqual(["w", "p1", "p2", "p3", "p4"]);
    expect(printedSteps(lesson("w-check", s)).map((x) => x.id)).toEqual(["p1", "p2", "g", "p3", "p4", "p5"]);
  });

  it("gives a student working alone no made-up time, and a class its period", () => {
    const plan = (x: Partial<Unit> & { level: number }) => part(planHtml(unit(x, [lesson("t-1")]), lesson("t-1"), "en"), "plan");
    expect(plan({ level: 2, audience: "students" })).not.toContain("<b>Time</b>");
    expect(plan({ level: 2, audience: "students" })).toContain('<div class="grid one">');
    expect(plan({ level: 2 })).toContain("<b>Time</b>45 min");
    const timed = slides.map((s) => (s.layout === "activity" ? { ...s, bullets: L(["Warm-up (5 min): go", "Work (20 min): do"]) } : s));
    const u = unit({ level: 2, audience: "students" }, [{ ...lesson("t-2"), slides: timed }]);
    expect(part(planHtml(u, u.lessons[0], "en"), "plan")).toContain("<b>Time</b>25 min");
  });
});

describe("a capstone's kit", () => {
  const same = L(["Know why", "Plan the hours"]);
  const capSlides = slides.map((s) => (s.layout === "bullets" || s.layout === "activity" ? { ...s, title: T(s.layout === "activity" ? "Do this" : "You will"), bullets: same } : s));
  const read = (id: string, title: string, prompt: string): Step => ({ id, type: "read", prompt: T(prompt), title: T(title), body: T("…") } as Step);
  const milestone = (k: number, hours: number): Step => ({ id: `project-m${k}`, type: "project", prompt: T(`Milestone ${k}: Part ${k}\n\nDo it.`, `المرحلة ${k}: الجزء ${k}\n\nنفّذه.`), task: T("t"), deliverable: T(`Files ${k}`), rubric: [], milestone: `m${k}`, hours, starterRepo: "code-capstone" } as Step);
  const stage = (id: string, minutes: number, s: Step[]): Lesson => ({ ...lesson(id, s), minutes, slides: capSlides });
  const cap = unit({ level: 3, audience: "students", kind: "capstone" } as Partial<Unit> & { level: number }, [
    stage("c-description", 15, [read("brief", "1. Project description", "Read the project map")]),
    stage("c-starter", 45, [read("need", "What you need", "Check you have the basics"), read("github", "Create a GitHub account", "Sign up if you need to")]),
    stage("c-submission", 60, [read("brief", "3. Project submission", "Read how to submit"), milestone(1, 2), milestone(2, 4)]),
  ]);

  it("prints the stage's own time, the starter link and its real steps, not the goals again", () => {
    const html = planHtml(cap, cap.lessons[1], "en"), plan = part(html, "plan");
    expect(plan).toContain("<b>Time</b>45 min");
    expect(plan).toContain('Starter: <bdi dir="ltr">https://github.com/darsi-org/code-capstone</bdi>');
    expect(plan).toContain("<li><b>What you need</b>: Check you have the basics</li><li><b>Create a GitHub account</b>: Sign up if you need to</li>");
    expect(plan.match(/<li>Know why<\/li>/g)).toHaveLength(1);
    expect(part(planHtml(cap, cap.lessons[0], "en"), "plan")).toContain("<li><b>Project description</b>: Read the project map</li>");
    expect(part(planHtml(cap, cap.lessons[0], "en"), "plan")).toContain("<b>Time</b>15 min");
  });

  it("prints no empty sheet, and a milestone sheet where there are milestones", () => {
    for (const l of cap.lessons.slice(0, 2)) for (const lang of ["en", "ar"]) expect(planHtml(cap, l, lang)).not.toContain('data-part="sheet"');
    const sheet = part(planHtml(cap, cap.lessons[2], "en"), "sheet");
    expect(sheet).toContain("Milestone sheet");
    expect(sheet).toContain("My GitHub repo link");
    expect([...sheet.matchAll(/data-milestone="([^"]+)"/g)].map((m) => m[1])).toEqual(["project-m1", "project-m2"]);
    expect(blocks(sheet, "q")).toEqual({});
    expect(sheet).toContain("<h3>Milestone 1: Part 1</h3>");
    expect(sheet).toContain("Time: about 2 hours<br>Hand in: Files 1");
    expect(part(planHtml(cap, cap.lessons[2], "en"), "plan")).toContain("<li>Milestone 2: Part 2</li>");
    const ar = part(planHtml(cap, cap.lessons[2], "ar"), "sheet");
    expect(ar).toContain("ورقة المراحل");
    expect(ar).toContain("المدة: ساعتان تقريبًا");
    expect(ar).toContain("المدة: ٤ ساعات تقريبًا");
    expect(planHtml(cap, cap.lessons[2], "en")).not.toContain('data-part="answers"');
  });
});

describe("firstSentence", () => {
  it("ends at the first full stop, question mark or exclamation, not at abbreviations or decimals", () => {
    expect(firstSentence("It is 0.5 m long, so it fits on the desk. Then more.")).toBe("It is 0.5 m long, so it fits on the desk.");
    expect(firstSentence("Use a tool, e.g. a phone, before you start anything. Then more.")).toBe("Use a tool, e.g. a phone, before you start anything.");
    expect(firstSentence("لماذا يحدث هذا في كل مرة نجرب فيها الحل؟ لأن الأمر مهم. وأكثر.")).toBe("لماذا يحدث هذا في كل مرة نجرب فيها الحل؟");
    expect(firstSentence("One sentence only")).toBe("One sentence only");
  });

  it("keeps a short first sentence company, since alone it rarely says why", () => {
    expect(firstSentence("Attention mixes. The residual keeps what was already there. More.")).toBe("Attention mixes. The residual keeps what was already there.");
    expect(firstSentence("الانتباه يخلط. والباقي يحتفظ بما كان موجودًا. والمزيد.")).toBe("الانتباه يخلط. والباقي يحتفظ بما كان موجودًا.");
    expect(firstSentence("Yes. It works.")).toBe("Yes. It works.");
  });
});

describe("page counts", () => {
  it("counts a PDF's pages", () => {
    expect(pdfPages("%PDF-1.4 1 0 obj << /Type /Pages /Count 2 >> 2 0 obj << /Type /Page >> 3 0 obj <</Type/Page/Parent 1 0 R>>")).toBe(2);
  });

  it("writes them into the unit's kit items, changing nothing else", () => {
    const text = JSON.stringify({ lessons: [{ kit: [
      { kind: "slides", title: { en: "S" }, pages: 6, base: "x-1/slides", formats: ["pdf"] },
      { kind: "lesson-plan", title: { en: "P" }, pages: 2, base: "x-1/lesson-plan", formats: ["pdf"] },
      { kind: "lesson-plan", title: { en: "Pack" }, pages: 2, base: "x-1/pack-lesson-plan", formats: ["pdf"] },
    ] }] }, null, 2) + "\n";
    const { text: out, changed } = withPages(text, new Map([["x-1/slides", 6], ["x-1/lesson-plan", 3]]));
    expect(changed).toEqual(["x-1/lesson-plan 2 → 3"]);
    expect(out).toBe(text.replace('"pages": 2,\n          "base": "x-1/lesson-plan"', '"pages": 3,\n          "base": "x-1/lesson-plan"'));
    expect(JSON.parse(out).lessons[0].kit.map((k: { pages: number }) => k.pages)).toEqual([6, 3, 2]);
    // Whatever the key order; and a file in another layout is edited in place.
    const reordered = JSON.stringify({ lessons: [{ kit: [{ kind: "lesson-plan", base: "x-1/lesson-plan", formats: ["pdf"], pages: 2 }] }] }, null, 2) + "\n";
    expect(JSON.parse(withPages(reordered, { "x-1/lesson-plan": 4 }).text).lessons[0].kit[0].pages).toBe(4);
    const compact = '{"lessons":[{"kit":[{"kind":"lesson-plan","pages":2,"base":"x-1/lesson-plan"}]}]}';
    expect(withPages(compact, { "x-1/lesson-plan": 4 })).toEqual({ text: compact.replace('"pages":2', '"pages":4'), changed: ["x-1/lesson-plan 2 → 4"] });
    expect(withPages(text, { "x-1/lesson-plan": 2 })).toEqual({ text, changed: [] });
  });
});

describe("the university course pack", () => {
  it("prints each criterion's levels[0..3] under Excellent, Good, Developing and Not yet", () => {
    const pack = { intro: T("i"), outcomes: [], syllabus: [], slides: [], problems: [], lab: { title: T("l"), goal: T("g"), steps: [], deliver: T("d") }, readings: [],
      rubric: [{ name: T("Reasoning"), levels: [T("best"), T("good"), T("some"), T("none")] }] };
    const html = packHtml(unit({ level: 4, teach: "university" }, []), pack, "en");
    expect(html).toContain("<th>Excellent</th><th>Good</th><th>Developing</th><th>Not yet</th>");
    expect(html).toContain("<td><b>Reasoning</b></td><td>best</td><td>good</td><td>some</td><td>none</td>");
    expect(html).toContain("free to copy for your institution");
  });
});

// Every course in content/units, as it would print today.
const DIR = join(__dirname, "../../../content/units");
const units = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Unit);
describe.each(units.map((u) => [u.id, u] as const))("the kits of %s", (_, u) => {
  it("print every question of the unit check, a key for every printed question, and no answer in its own order", () => {
    for (const l of u.lessons) for (const lang of ["en", "ar"]) {
      const html = planHtml(u, l, lang), q = blocks(part(html, "sheet"), "q"), a = blocks(part(html, "answers"), "ans");
      const printed = printedSteps(l).map((s) => s.id);
      expect(Object.keys(q).filter((id) => id !== l.steps.find((s) => s.type === "reflect")?.id), `${l.id} ${lang}`).toEqual(printed);
      expect(Object.keys(a), `${l.id} ${lang}: answers`).toEqual(printed);
      for (const s of l.steps) {
        if (!q[s.id]) continue;
        if (s.type === "order" && s.steps.length > 1) expect(strips(q[s.id]), `${l.id} ${s.id}`).not.toEqual(s.steps.map((x) => x[lang] ?? x.en));
        if (s.type === "order" && s.steps.length > 2) expect(strips(q[s.id]), `${l.id} ${s.id}: reversed`).not.toEqual(s.steps.map((x) => x[lang] ?? x.en).reverse());
        // A match whose pairs share an answer can't always be printed apart; the validator refuses those.
        const shared = s.type === "match" && new Set(s.pairs.map((p) => p.right.en)).size < s.pairs.length;
        if (s.type === "match" && s.pairs.length > 1 && !shared) rights(q[s.id]).forEach((x, i) => expect(x, `${l.id} ${s.id}`).not.toBe(s.pairs[i].right[lang] ?? s.pairs[i].right.en));
      }
    }
    for (const l of u.lessons.filter((x) => x.id.endsWith("-check"))) expect(printedSteps(l).length).toBe(l.steps.filter((s) => ["choice", "multi", "image", "truefalse", "match", "order", "fill", "type", "code", "parsons", "codefill", "bug", "blocks"].includes(s.type)).length);
  });

  it("keep the reflection of a teachers' or lecturers' course off any sheet their pupils or students get", () => {
    const pupils = u.audience !== "students" && (u.teach === "university" || u.level < 2);
    for (const l of u.lessons) {
      const reflect = l.steps.find((s) => s.type === "reflect");
      if (!reflect || !pupils) continue;
      expect(part(planHtml(u, l, "en"), "sheet"), l.id).not.toContain(`data-step="${reflect.id}"`);
    }
  });
});
