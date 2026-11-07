// The learning report's Standards table (admin/Standards.tsx) on phones: each cell is a flex row (its label, then its
// value), so a cell's content must be one element, or the code pill, the name and the level are squeezed side by side
// and the level falls under the label (base.css: .data-table td > :first-child grows, and a nowrap pill shrank to 20 px).
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { Framework } from "../src/content/standards";

const { StandardsTable } = await import("../src/admin/Standards");

const fw: Framework = { id: "unesco-s", name: { en: "UNESCO" }, source: "UNESCO 2024", items: [
  { id: "S.SD.C", label: { en: "AI system design", ar: "تصميم أنظمة الذكاء الاصطناعي" }, level: { en: "Create", ar: "ابتكر" }, group: { en: "AI techniques" }, codes: ["S.SD.C"] },
] };

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
