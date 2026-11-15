// The learning report's Standards table (admin/Standards.tsx) on phones: each cell is a flex row (its label, then its
// value), so a cell's content must be one element, or the code pill, the name and the level are squeezed side by side
// and the level falls under the label (base.css: .data-table td > :first-child grows, and a nowrap pill shrank to 20 px).
// A row is a card there: the item across its top, its two figures under their labels, the bar across it; and an item
// nobody has a lesson for says so once, not with a dash on a line of its own (in the table, and on a person's page).
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { Profile } from "../src/auth/types";
import type { Framework } from "../src/content/standards";

const { StandardsTable, PersonStandards } = await import("../src/admin/Standards");

const fw: Framework = { id: "unesco-s", name: { en: "UNESCO" }, source: "UNESCO 2024", items: [
  { id: "S.SD.C", label: { en: "AI system design", ar: "تصميم أنظمة الذكاء الاصطناعي" }, level: { en: "Create", ar: "ابتكر" }, group: { en: "AI techniques" }, codes: ["S.SD.C"] },
] };
const two: Framework = { ...fw, items: [...fw.items, { id: "S.ET.U", label: { en: "Ethics of AI", ar: "أخلاقيات الذكاء الاصطناعي" }, level: { en: "Understand", ar: "افهم" }, codes: ["S.ET.U"] }] };
/** Three lessons that count for S.SD.C at 90%; none for S.ET.U. */
const learner = { uid: "s1", name: "Salma Adel", role: "student", orgId: "o1",
  summary: { lessonsDone: 3, xp: 0, avgAccuracy: 0.9, lastActive: new Date().toISOString(), competencies: { "S.SD.C": 3 }, compAcc: { "S.SD.C": 2.7 }, units: {}, graded: 3 } } as unknown as Profile;

describe("the Standards table's item cell", () => {
  it.each(["en", "ar"])("holds the code, the name and the level in one element (%s)", (lang) => {
    render(<I18nProvider lang={lang}><StandardsTable people={[]} fw={fw} /></I18nProvider>);
    const code = screen.getByText("S.SD.C");
    const cell = code.closest("td")!;
    expect(cell.children).toHaveLength(1);
    const box = cell.firstElementChild!;
    expect(box.contains(code)).toBe(true);
    expect(box.textContent).toContain(lang === "ar" ? "تصميم أنظمة الذكاء الاصطناعي" : "AI system design");
    expect(box.textContent).toContain(lang === "ar" ? "ابتكر" : "Create");
    expect(code.getAttribute("dir")).toBe("ltr");
  });
});

describe("the Standards table as cards on a phone", () => {
  const cells = (code: string) => Array.from(screen.getByText(code).closest("tr")!.querySelectorAll("td"));

  it("the item is the card's main cell and the bar keeps the card's width; the two figures are plain labelled values", () => {
    render(<I18nProvider lang="en"><StandardsTable people={[learner]} fw={two} /></I18nProvider>);
    expect(cells("S.SD.C").map((c) => c.getAttribute("data-cell"))).toEqual(["main", null, "row", null]);
    expect(cells("S.SD.C").map((c) => c.getAttribute("data-label"))).toEqual(["Standard", "Reached", "Strength", "Accuracy"]);
  });

  it.each(["en", "ar"])("an item with no lessons has no score line: its dash is marked to be left off the card (%s)", (lang) => {
    render(<I18nProvider lang={lang}><StandardsTable people={[learner]} fw={two} /></I18nProvider>);
    const [, , , scored] = cells("S.SD.C"), [, reached, , none] = cells("S.ET.U");
    expect(scored.hasAttribute("data-empty")).toBe(false);
    expect(scored.textContent).toContain(lang === "ar" ? "٩٠" : "90%");
    // The real table (from 600px) still has a cell there, with its dash.
    expect(none.hasAttribute("data-empty")).toBe(true);
    expect(none.textContent).toBe("—");
    // What there is to say stays: nobody has reached it yet.
    expect(reached.hasAttribute("data-empty")).toBe(false);
    expect(reached.textContent).toContain(lang === "ar" ? "٠" : "0%");
  });
});

describe("one person against a framework", () => {
  it.each(["en", "ar"])("an item with lessons says how many and the score; one without has its chip and no second line (%s)", (lang) => {
    const { container } = render(<I18nProvider lang={lang}><PersonStandards person={learner} fw={two} /></I18nProvider>);
    const [withLessons, without] = Array.from(container.querySelectorAll(".or-person > li"));
    expect(withLessons.querySelector(".num")!.textContent).toContain(lang === "ar" ? "الدروس: ٣، ٩٠" : "Lessons: 3, 90%");
    // Code, name and "Not yet": nothing more, and no lone dash.
    expect(without.querySelector(".num")).toBeNull();
    expect(without.children).toHaveLength(3);
    expect(Array.from(without.children).some((x) => x.textContent === "—")).toBe(false);
    expect(Array.from(without.children).map((x) => x.textContent)).toEqual(["S.ET.U", lang === "ar" ? "أخلاقيات الذكاء الاصطناعي — افهم" : "Ethics of AI — Understand", lang === "ar" ? "لم يبدأ بعد" : "Not yet"]);
  });
});
