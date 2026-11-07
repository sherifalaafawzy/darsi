// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Unit } from "../../src/content/types";
import { normalizeCode } from "../../src/code/harness";
import { runInNode } from "./node";

// What a phone keyboard types into a code step, mended before a run (src/code/harness.ts normalizeCode; CodeSteps calls
// it on Run and shows the mended code in the editor). Strings and comments keep what was typed.
const py = (code: string) => normalizeCode(code, "python");
const sql = (code: string) => normalizeCode(code, "sql");
const ch = (n: number) => String.fromCharCode(n);
const LRI = ch(0x2066), PDI = ch(0x2069), RLM = ch(0x200f), ZWSP = ch(0x200b), NBSP = ch(0xa0);

describe("normalizeCode", () => {
  it("leaves code with nothing to mend as it is", () => {
    const ascii = 'name = input("Name? ")\nprint(f"Hi {name}", 3.5 % 2, [1, 2][0]); x = 1';
    expect(py(ascii)).toBe(ascii);
    expect(sql("SELECT name, mark FROM pupils WHERE mark > 8;")).toBe("SELECT name, mark FROM pupils WHERE mark > 8;");
    expect(py('print("مرحبا، ٣ ٪")  # تعليق، ٤؛')).toBe('print("مرحبا، ٣ ٪")  # تعليق، ٤؛');
  });

  it("turns an Arabic or Persian keyboard's digits and punctuation into code, outside strings and comments", () => {
    expect(py("x = ٣٫٥\nprint(x ٪ ٢، ۴)؛")).toBe("x = 3.5\nprint(x % 2, 4);");
    expect(py('print(٢ + ٣، "٢ + ٣ = ٥")  # الجمع، ٥')).toBe('print(2 + 3, "٢ + ٣ = ٥")  # الجمع، ٥');
    expect(py("for i in range(١٠):\n    total٢ = i")).toBe("for i in range(10):\n    total2 = i");
  });

  it("straightens curly quotes, and reads « » around a value as a string", () => {
    expect(py("print(“don’t”, ‘ok’)")).toBe(`print("don't", 'ok')`);
    expect(py("print(«مرحبا»)\nprint(»أهلًا«)")).toBe('print("مرحبا")\nprint("أهلًا")');
    expect(py('print(«قال "نعم"»)')).toBe('print("قال \\"نعم\\"")');
    expect(py('print("قال «نعم»")')).toBe('print("قال «نعم»")'); // inside a string they stay
  });

  it("keeps a string whole when curly and straight quotes mix (iOS types curly ones, the symbol row straight ones)", () => {
    // All curly, as iOS types them: a quote after a space comes out as “, even where it ends the string.
    expect(py("name = input(“Name? “)\nprint(‘Don’t’, “Hi ” + name)")).toBe("name = input(\"Name? \")\nprint('Don\\'t', \"Hi \" + name)");
    // Straight quotes around curly ones of the same kind: those are text, escaped, so the string ends where it did.
    expect(py('print("قال “مرحبا”")')).toBe('print("قال \\"مرحبا\\"")');
    expect(py("print('Don’t', 'the pupils’ marks')")).toBe("print('Don\\'t', 'the pupils\\' marks')");
    expect(py('s = """Say “hi”"""')).toBe('s = """Say \\"hi\\""""');
    expect(py('print(r"“a”")')).toBe('print(r"“a”")'); // a raw string can't escape them: kept as typed
    // A straight quote opens and a curly one closes, also with another string after it.
    expect(py('print("hello”)')).toBe('print("hello")');
    expect(py('print("a”, "b”)\nprint("a”, "b")')).toBe('print("a", "b")\nprint("a", "b")');
    expect(py("print(«قال “نعم”»)")).toBe('print("قال \\"نعم\\"")');
    expect(py("x = 1  # don’t “x”")).toBe("x = 1  # don't \"x\"");
    expect(sql("SELECT * FROM t WHERE name = 'O’Neil' OR note = ‘it’s’ OR \"col “x”\" = 1"))
      .toBe("SELECT * FROM t WHERE name = 'O''Neil' OR note = 'it''s' OR \"col \"\"x\"\"\" = 1");
  });

  it("follows Python's strings: prefixes, triple quotes, escapes, f-string fields, and a quote left open", () => {
    expect(py('s = """سطر، ١\n٢"""\nt = r"\\"٣"\nprint(f"{٢ * ٣:.١f} = ٦", f"{{٣}}", rf"{x}٤")'))
      .toBe('s = """سطر، ١\n٢"""\nt = r"\\"٣"\nprint(f"{2 * 3:.1f} = ٦", f"{{٣}}", rf"{x}٤")');
    expect(py("print(f\"{d['٣']} {٤}\")")).toBe("print(f\"{d['٣']} {4}\")");
    expect(py('print("oops)\nx = ٣')).toBe('print("oops)\nx = 3'); // an unclosed string ends with its line
  });

  it("drops invisible direction marks and turns no-break spaces into spaces, outside strings", () => {
    expect(py(`${LRI}print(1)${PDI}${RLM}\nif x:\n${NBSP}${NBSP}${NBSP}${NBSP}print(${ZWSP}2)`)).toBe("print(1)\nif x:\n    print(2)");
    expect(py(`print("${LRI}a${PDI}")`)).toBe(`print("${LRI}a${PDI}")`);
  });

  it("SQL: digits and Arabic punctuation become code; strings, quoted names and comments keep what was typed", () => {
    expect(sql("SELECT name، mark FROM pupils WHERE mark > ٨ AND city = 'القاهرة، ٢'؛ -- الأسماء، ٣"))
      .toBe("SELECT name, mark FROM pupils WHERE mark > 8 AND city = 'القاهرة، ٢'; -- الأسماء، ٣");
    expect(sql('SELECT "الصف ٥", [عدد ٢], `ن ٣` FROM t /* ٣، ٤ */ WHERE n = ٥ AND s = \'it\'\'s ٦\''))
      .toBe('SELECT "الصف ٥", [عدد ٢], `ن ٣` FROM t /* ٣، ٤ */ WHERE n = 5 AND s = \'it\'\'s ٦\'');
    expect(sql("SELECT * FROM t WHERE name = ‘Ali’ OR name = «O'Neil» OR name = “Bo”")).toBe("SELECT * FROM t WHERE name = 'Ali' OR name = 'O''Neil' OR name = \"Bo\"");
  });

  it("mends once: mended code stays as it is", () => {
    for (const code of ["x = ٣٫٥\nprint(x ٪ ٢، “a”)", 'print(«قال "نعم"»)', `${LRI}print(f"{٢}")${PDI}`, 'print("قال “مرحبا”", r"“a”")', "print(‘Don’t’)"]) expect(py(py(code))).toBe(py(code));
    for (const q of ["SELECT a، b FROM t WHERE c = «O'Neil»؛", "SELECT 'O’Neil', ‘it’s’"]) expect(sql(sql(q))).toBe(sql(q));
  });

  it("gives code that the phone's MicroPython and SQLite run, where it was a syntax error before", async () => {
    const typed = 'x = ٣٫٥\nprint(x * ٢، “كتب ٢”)\nprint(f"{x:.١f}")';
    expect((await runInNode({ lang: "python", code: typed }))[0].error).toContain("SyntaxError");
    expect((await runInNode({ lang: "python", code: py(typed) }))[0]).toEqual({ out: "7.0 كتب ٢\n3.5\n" });
    // Curly quotes inside a straight-quoted string ran before the mending (printing them curly): they still run.
    expect((await runInNode({ lang: "python", code: py("print(\"قال “نعم”\", 'Don’t')") }))[0]).toEqual({ out: "قال \"نعم\" Don't\n" });
    expect((await runInNode({ lang: "python", code: py("print(“Name? “ + ‘Ali’)") }))[0]).toEqual({ out: "Name? Ali\n" });
    const setup = "CREATE TABLE pupils (name TEXT, mark INTEGER); INSERT INTO pupils VALUES ('أمينة', 9), ('يوسف', 7);";
    const query = "SELECT name، mark FROM pupils WHERE mark > ٨ AND name = ‘أمينة’؛";
    expect((await runInNode({ lang: "sql", code: query, setup }))[0].error).toBeTruthy();
    expect((await runInNode({ lang: "sql", code: sql(query), setup }))[0].table).toEqual({ columns: ["name", "mark"], values: [["أمينة", 9]] });
  });

  it("never changes a course's own code", () => {
    const dir = join(__dirname, "../../../../content/units");
    let n = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const unit = JSON.parse(readFileSync(join(dir, f), "utf8")) as Unit;
      for (const lesson of unit.lessons) for (const s of lesson.steps) if (s.type === "code") {
        for (const code of [s.starter, s.solution]) expect(normalizeCode(code, s.lang), `${f} ${s.id}`).toBe(code);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
