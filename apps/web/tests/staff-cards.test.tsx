// Staff tables on phones (styles/base.css .data-table): each row is a card. A table says which cell is the row's
// subject (data-cell="main": across the top, no label), which is the one small control beside it (data-cell="end": the
// select box) and which value needs the card's width (data-cell="row"); every other cell after the subject is a short
// value under its label, two to a line, and a value that is only a dash is left out (data-empty). A table that says
// nothing keeps a line per cell, the label a third of it. jsdom lays nothing out, so the markup is tested on the people
// table (admin/PeopleTable.tsx) and the rules in the stylesheet itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

const { PeopleTable, LoginText, emptyCell } = await import("../src/admin/PeopleTable");

const summary = (lessonsDone: number, graded = lessonsDone) => ({ lessonsDone, xp: 0, avgAccuracy: 0.8, lastActive: new Date().toISOString(), competencies: {}, units: {}, graded });
const student: Profile = { uid: "s1", name: "Ahmed Abdel-Rahman Mostafa El-Sayed", email: "student4@nile-valley.example", role: "student", orgId: "o1", group: "5B", summary: summary(3) } as Profile;
const admin: Profile = { uid: "a1", name: "Mona Farouk", email: "mona@users.darsiai.org", role: "orgAdmin", orgId: "o1" } as Profile;
const table = (rows: Profile[], lang = "en", pick = true) => render(
  <I18nProvider lang={lang}><MemoryRouter>
    <PeopleTable rows={rows} to={(m) => `/admin/people/${m.uid}`} review pick={pick ? { selected: new Set(), toggle: () => {} } : undefined} />
  </MemoryRouter></I18nProvider>,
);
const cellsOf = (name: string) => Array.from(screen.getByRole("link", { name: new RegExp(name) }).closest("tr")!.querySelectorAll("td"));

describe("the people table says what its cells are", () => {
  it("the person is the card's main cell and the select box its end cell; the rest are plain labelled values", () => {
    table([student]);
    const cells = cellsOf("Ahmed");
    expect(cells.map((c) => c.getAttribute("data-cell"))).toEqual(["end", "main", null, null, null, null, null, null]);
    // The select box keeps its name: the card shows no label for it.
    expect(within(cells[0]).getByRole("checkbox", { name: /Ahmed/ })).toBeTruthy();
    // Every value still carries its label for the card.
    expect(cells.slice(2).map((c) => c.getAttribute("data-label"))).toEqual(["To review", "Role", "Group", "Lessons", "Accuracy", "Last active"]);
  });

  it("without a select column the person is still the main cell", () => {
    table([student], "en", false);
    expect(cellsOf("Ahmed").map((c) => c.getAttribute("data-cell"))).toEqual(["main", null, null, null, null, null, null]);
  });

  it("marks the values that are only a dash, so a card leaves them out; the real table keeps its dash", () => {
    table([student, admin]);
    const empty = (name: string) => cellsOf(name).filter((c) => c.hasAttribute("data-empty")).map((c) => c.getAttribute("data-label"));
    expect(empty("Ahmed")).toEqual([]);
    // No class and no graded lesson: said with a dash on a laptop, with nothing on a phone.
    expect(empty("Mona")).toEqual(["Group", "Accuracy"]);
    expect(cellsOf("Mona").filter((c) => c.hasAttribute("data-empty")).map((c) => c.textContent)).toEqual(["—", "—"]);
    // Lessons (0) and last active ("never") are things to say: they stay.
    expect(cellsOf("Mona").find((c) => c.getAttribute("data-label") === "Lessons")!.hasAttribute("data-empty")).toBe(false);
    expect(cellsOf("Mona").find((c) => c.getAttribute("data-label") === "Last active")!.hasAttribute("data-empty")).toBe(false);
  });

  it("in Arabic the same cells carry the hints (the card mirrors by itself)", () => {
    table([student], "ar");
    const cells = Array.from(document.querySelector("tbody tr")!.querySelectorAll("td"));
    expect(cells.map((c) => c.getAttribute("data-cell"))).toEqual(["end", "main", null, null, null, null, null, null]);
    expect(cells.map((c) => c.getAttribute("data-label")).join("")).not.toContain("·");
  });

  it("an address may break before its @, never in the middle of a word; a username has no break", () => {
    table([student, admin]);
    const address = screen.getByText("student4@nile-valley.example");
    expect(address.getAttribute("dir")).toBe("ltr");
    expect(address.innerHTML).toBe("student4<wbr>@nile-valley.example");
    // It reads, copies and is found as it was.
    expect(address.textContent).toBe("student4@nile-valley.example");
    expect(screen.getByText("mona").innerHTML).toBe("mona");
    const { container } = render(<LoginText value="@odd" />);
    expect(container.innerHTML).toBe("@odd");
  });

  it("emptyCell adds the hint only when asked", () => {
    expect(emptyCell(true)).toEqual({ "data-empty": "" });
    expect(emptyCell(false)).toBeNull();
  });
});

describe("the card's rules (styles/base.css)", () => {
  // Without its comments: they describe the hints in words.
  const css = readFileSync(join(__dirname, "../src/styles/base.css"), "utf8").replace(/[/][*][^]*?[*][/]/g, "");
  const from = css.indexOf("@media (max-width: 599px)");
  const phone = css.slice(from, css.indexOf("@media (min-width: 600px)"));
  const rule = (sheet: string, selector: string) => { const at = sheet.indexOf(selector + " {"); return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at)); };

  it("a table that says nothing keeps a line per cell, the label a third of it", () => {
    expect(from).toBeGreaterThan(0);
    expect(rule(css, ".data-table td[data-label]::before")).toContain("flex: 0 0 33%");
    expect(rule(phone, ".data-table td")).toContain("flex: 0 0 100%");
  });

  it("the main cell comes first across the card and the end cell beside it, both without a label", () => {
    const main = rule(phone, '.data-table tr > td[data-cell="main"]');
    expect(main).toContain("order: -2");
    expect(main).toContain("min-inline-size: 0"); // a long name wraps inside the card instead of widening the page
    const end = rule(phone, '.data-table tr > td[data-cell="end"]');
    expect(end).toContain("order: -1");
    expect(end).toContain("flex: 0 0 auto");
    expect(rule(phone, '.data-table td[data-cell="main"]::before, .data-table td[data-cell="end"]::before')).toContain("content: none");
    // In a right-to-left page an address (left-to-right) on two lines lines up with the name above it, in logical terms.
    expect(rule(phone, '[dir="rtl"] .data-table td[data-cell="main"] small[dir="ltr"]')).toContain("text-align: end");
  });

  it("the values after it are two to a line, each under its label; a wide one keeps a line, after them", () => {
    const pair = rule(phone, '.data-table td[data-cell="main"] ~ td:not([data-cell])');
    expect(pair).toContain("flex: 0 0 calc(50% - var(--space-2))"); // two and the 12px gap fit at any width
    expect(pair).toContain("display: block");
    expect(rule(phone, '.data-table td[data-cell="main"] ~ td:not([data-cell])::before')).toContain("display: block");
    expect(rule(phone, '.data-table tr > td[data-cell="row"]')).toContain("order: 1");
  });

  it("a dash and an empty cell take no room on a card, and the rule comes after the pairs' own display", () => {
    const hide = phone.indexOf(".data-table td[data-empty],");
    expect(hide).toBeGreaterThan(phone.indexOf('.data-table td[data-cell="main"] ~ td:not([data-cell]) {'));
    const hidden = phone.slice(hide, phone.indexOf("}", hide));
    expect(hidden).toContain('.data-table td[data-cell="main"] ~ td[data-empty]');
    expect(hidden).toContain('.data-table td[data-cell="main"] ~ td:not([data-cell]):empty');
    expect(hidden).toContain("display: none");
  });

  it("is for phones only, in logical terms: the table from 600px takes no hint", () => {
    // Every hint is inside the phone block; the wider table's rules name none of them.
    const wide = css.slice(css.indexOf("@media (min-width: 600px)"));
    expect(wide).not.toContain("data-cell");
    expect(wide).not.toContain("data-empty");
    expect(css.slice(0, from)).not.toContain("data-cell=");
    expect(phone).not.toMatch(/\b(left|right)\b/);
  });

  it("from 600px a table short of room never squeezes a name to a letter a line: its column keeps a floor and the table scrolls", () => {
    const wide = css.slice(css.indexOf("@media (min-width: 600px)"), css.indexOf("@media (min-width: 900px)"));
    // The name and address (the link's span without a class; a count in such a link has one) may break anywhere, so
    // without a floor the table took all it lacked from their column.
    expect(rule(wide, ".data-table .person-link > span:not([class])")).toContain("min-inline-size: 8rem");
    expect(rule(wide, ".table-wrap")).toContain("overflow-x: auto");
    // The floor is the table's: on a phone's card the name may shrink with the card.
    expect(css.slice(0, css.indexOf("@media (min-width: 600px)"))).not.toMatch(/person-link > span:not\(\[class\]\) \{[^}]*min-inline-size/);
    // An address breaks before its @ in the table too, when it must break at all (no rule takes the <wbr> out).
    expect(css).not.toMatch(/wbr\s*\{/);
  });

  it("five tiles leave no hole in two columns: with an odd number the first takes the row, until the grid is free at 900px", () => {
    expect(rule(css, ".tiles > :first-child:nth-last-child(odd)")).toContain("grid-column: 1 / -1");
    const desk = css.slice(css.indexOf("@media (min-width: 900px)"));
    expect(rule(desk, ".tiles > :first-child:nth-last-child(odd)")).toContain("grid-column: auto");
    // A tile's breakdown: each "label: number" stays in one piece.
    expect(rule(css, ".tile-parts > li")).toContain("white-space: nowrap");
    expect(rule(css, ".tile-parts")).toContain("flex-wrap: wrap");
  });
});
