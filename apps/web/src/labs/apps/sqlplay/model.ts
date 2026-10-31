/**
 * A small school database for SQL practice: twelve pupils in three classes and their marks out of 20 in three subjects
 * (Musa missed the science test, so there are 35 marks). Every run starts from a fresh copy (the sandbox's runSql), so
 * nothing a learner types can break it.
 */
import type { LocalStr } from "../../types";

export const PUPILS: [id: number, name: string, cls: string, age: number, town: string][] = [
  [1, "Amina", "5A", 10, "Riverside"], [2, "Tunde", "5A", 11, "Hilltop"], [3, "Chidi", "5A", 10, "Lakeside"], [4, "Fatima", "5A", 11, "Riverside"],
  [5, "Kofi", "5B", 10, "Hilltop"], [6, "Grace", "5B", 11, "Hilltop"], [7, "Musa", "5B", 10, "Lakeside"], [8, "Zainab", "5B", 12, "Riverside"],
  [9, "Omar", "6A", 12, "Lakeside"], [10, "Laila", "6A", 11, "Hilltop"], [11, "Yusuf", "6A", 12, "Riverside"], [12, "Mariam", "6A", 12, "Lakeside"],
];
/** maths, science, english for each pupil, in id order; null: missed the test. */
export const MARKS: (number | null)[][] = [
  [14, 17, 15], [11, 9, 13], [18, 15, 12], [12, 16, 17], [16, 12, 11], [9, 14, 16],
  [13, null, 10], [17, 18, 19], [10, 11, 14], [15, 13, 18], [19, 16, 12], [8, 12, 15],
];
export const SUBJECTS = ["maths", "science", "english"];

export const SETUP = [
  "CREATE TABLE pupils (id INTEGER PRIMARY KEY, name TEXT, class TEXT, age INTEGER, town TEXT);",
  `INSERT INTO pupils VALUES ${PUPILS.map(([id, n, c, a, t]) => `(${id}, '${n}', '${c}', ${a}, '${t}')`).join(", ")};`,
  "CREATE TABLE marks (pupil_id INTEGER, subject TEXT, mark INTEGER);",
  `INSERT INTO marks VALUES ${MARKS.flatMap((ms, i) => ms.flatMap((m, j) => (m === null ? [] : [`(${i + 1}, '${SUBJECTS[j]}', ${m})`]))).join(", ")};`,
].join("\n");

export const TABLES = [
  { name: "pupils", cols: ["id", "name", "class", "age", "town"], rows: PUPILS.length },
  { name: "marks", cols: ["pupil_id", "subject", "mark"], rows: MARKS.flat().filter((m) => m !== null).length },
];

/** Example questions. In `q` and `note`, `backticks` mark SQL, shown left to right in code type. */
export const EXAMPLES: { q: LocalStr; note: LocalStr; sql: string }[] = [
  { q: { en: "Show every pupil", ar: "اعرض كل التلاميذ" }, sql: "SELECT * FROM pupils;",
    note: { en: "`*` means every column, and `FROM` says which table.", ar: "`*` تعني كل الأعمدة، و`FROM` تحدد الجدول." } },
  { q: { en: "Who is in class `5B`?", ar: "من في الفصل `5B`؟" }, sql: "SELECT name, age FROM pupils\nWHERE class = '5B';",
    note: { en: "`WHERE` keeps only the rows that match. Text goes in single quotes.", ar: "`WHERE` تُبقي الصفوف المطابقة فقط، والنص يوضع بين علامتَي اقتباس مفردتين." } },
  { q: { en: "Oldest pupils first", ar: "الأكبر سنًّا أولًا" }, sql: "SELECT name, class, age FROM pupils\nORDER BY age DESC, name;",
    note: { en: "`ORDER BY` sorts; `DESC` means biggest first. Pupils of the same age are sorted by name.", ar: "`ORDER BY` ترتّب، و`DESC` تعني الأكبر أولًا. ومن لهم العمر نفسه يُرتَّبون بالاسم." } },
  { q: { en: "How many pupils in each class?", ar: "كم تلميذًا في كل فصل؟" }, sql: "SELECT class, COUNT(*) AS pupils\nFROM pupils\nGROUP BY class;",
    note: { en: "`GROUP BY` makes one row per class; `COUNT(*)` counts the rows in each group.", ar: "`GROUP BY` تجعل صفًّا واحدًا لكل فصل، و`COUNT(*)` تعدّ الصفوف في كل مجموعة." } },
  { q: { en: "The average mark in each subject", ar: "متوسط الدرجات في كل مادة" }, sql: "SELECT subject, ROUND(AVG(mark), 1) AS average\nFROM marks\nGROUP BY subject\nORDER BY average DESC;",
    note: { en: "`AVG` averages each group and `ROUND(…, 1)` keeps one decimal. Musa missed science, so its average is over 11 marks.", ar: "`AVG` تحسب متوسط كل مجموعة، و`ROUND(…, 1)` تُبقي رقمًا عشريًّا واحدًا. غاب موسى عن اختبار العلوم، فمتوسطها من ١١ درجة." } },
  { q: { en: "Maths marks of 15 or more", ar: "درجات الرياضيات من ١٥ فأكثر" }, sql: "SELECT pupil_id, mark FROM marks\nWHERE subject = 'maths' AND mark >= 15\nORDER BY mark DESC;",
    note: { en: "`AND` needs both to be true. Change it to `OR` and see what comes back.", ar: "`AND` تشترط تحقق الأمرين معًا. غيّرها إلى `OR` وانظر ماذا يعود." } },
  { q: { en: "The top three in maths, with names", ar: "أعلى ثلاثة في الرياضيات بأسمائهم" }, sql: "SELECT p.name, p.class, m.mark\nFROM marks m\nJOIN pupils p ON p.id = m.pupil_id\nWHERE m.subject = 'maths'\nORDER BY m.mark DESC\nLIMIT 3;",
    note: { en: "`JOIN` matches each mark to its pupil by number; `LIMIT 3` keeps the first three rows.", ar: "`JOIN` تطابق كل درجة مع تلميذها بالرقم، و`LIMIT 3` تُبقي أول ثلاثة صفوف." } },
];

/** Rows shown at most; a bigger result says how many there were. */
export const SHOW = 100;
/** A cell for display: long decimals rounded, empty (NULL) kept as null. */
export const cell = (v: unknown): string | number | null => (v === null || v === undefined ? null : typeof v === "number" ? (Number.isInteger(v) ? v : Math.round(v * 100) / 100) : String(v));
/** Splits text on `backticks`: odd parts are code. */
export const codeParts = (t: string) => t.split("`").map((text, i) => ({ text, code: i % 2 === 1 }));
