/** Which chart answers which question, and how a cut-off axis exaggerates a difference. */
export type Chart = "bar" | "line" | "pie" | "scatter";
export const CHARTS: Chart[] = ["bar", "line", "pie", "scatter"];
export interface Q { id: string; answer: Chart }
/** Questions in the order they appear; their wording lives with the app's strings. */
export const QUESTIONS: Q[] = [
  { id: "q1", answer: "bar" },     // compare favourite fruits across one class
  { id: "q2", answer: "line" },    // rainfall month by month
  { id: "q3", answer: "pie" },     // how the school budget is shared out
  { id: "q4", answer: "scatter" }, // hours of study against marks
  { id: "q5", answer: "line" },    // a plant's height every day
];
export const score = (picks: Record<string, Chart | undefined>) => QUESTIONS.filter((q) => picks[q.id] === q.answer).length;
/** Two bars, a and b, drawn from a baseline: how many times taller b looks than a. With a zero baseline, it is b/a. */
export const looksTimes = (a: number, b: number, base: number) => (b - base) / Math.max(1e-9, a - base);
/** The pass rates the axis demo shows (per cent). */
export const RATES = { last: 70, now: 74 };
