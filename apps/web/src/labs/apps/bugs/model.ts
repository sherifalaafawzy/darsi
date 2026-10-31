/**
 * Common bugs, each a short program that should print something and doesn't: it stops with an error (Python names the
 * kind and the line) or, worse, runs and prints the wrong thing. Learners run it, read the error, fix it and run again.
 */
export type BugId = "colon" | "equals" | "offbyone" | "indent" | "name" | "text";
export interface Bug { id: BugId; code: string; /** What the fixed program prints. */ output: string; /** One fix, for the tests. */ fixed: string }

export const BUGS: Bug[] = [
  { id: "colon", output: "Hello 1\nHello 2\nHello 3",
    code: `for i in range(1, 4)\n    print("Hello", i)\n`,
    fixed: `for i in range(1, 4):\n    print("Hello", i)\n` },
  { id: "equals", output: "Twelve!",
    code: `age = 12\nif age = 12:\n    print("Twelve!")\n`,
    fixed: `age = 12\nif age == 12:\n    print("Twelve!")\n` },
  { id: "offbyone", output: "1\n2\n3\n4\n5",
    code: `# Count from 1 to 5\nfor n in range(1, 5):\n    print(n)\n`,
    fixed: `# Count from 1 to 5\nfor n in range(1, 6):\n    print(n)\n` },
  { id: "indent", output: "12",
    code: `total = 0\nfor n in [3, 4, 5]:\ntotal = total + n\nprint(total)\n`,
    fixed: `total = 0\nfor n in [3, 4, 5]:\n    total = total + n\nprint(total)\n` },
  { id: "name", output: "10",
    code: `score = 7\nbonus = 3\nprint(scor + bonus)\n`,
    fixed: `score = 7\nbonus = 3\nprint(score + bonus)\n` },
  { id: "text", output: "Age: 12",
    code: `age = 12\nprint("Age: " + age)\n`,
    fixed: `age = 12\nprint("Age: " + str(age))\n` },
];

/** The kinds of error a beginner meets most, by the name Python gives them. */
export type ErrorKind = "syntax" | "indent" | "name" | "type" | "zero" | "index" | "value" | "other";
const KINDS: Record<string, ErrorKind> = {
  SyntaxError: "syntax", IndentationError: "indent", NameError: "name", TypeError: "type",
  ZeroDivisionError: "zero", IndexError: "index", ValueError: "value",
};

/** The error's last line, split into its name and message ("NameError", "name 'scor' isn't defined"). */
export function parseError(text: string): { name: string; message: string; kind: ErrorKind } {
  const last = text.trim().split("\n").filter(Boolean).pop() ?? "";
  const m = /^([A-Za-z]+(?:Error|Exception))\s*:?\s*(.*)$/.exec(last.trim());
  const name = m?.[1] ?? "", message = m?.[2] ?? last.trim();
  return { name, message, kind: KINDS[name] ?? "other" };
}

/** Did the run print exactly what was wanted (ignoring spaces at line ends)? */
export const same = (got: string, want: string) => {
  const norm = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).join("\n").trim();
  return norm(got) === norm(want);
};
