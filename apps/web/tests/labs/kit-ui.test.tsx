import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";
import { Formula, ltrNum, signed } from "../../src/labs/kit/Formula";
import { labelSize, Plot, spreadLabels } from "../../src/labs/kit/Plot";
import { Slider } from "../../src/labs/kit/controls";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

const { LabApp } = await import("../../src/screens/Labs");
beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });

// Intl writes an Arabic negative as U+061C (Arabic letter mark) + "-" + digits. The mark turns the number right to
// left wherever it stands, so inside a left-to-right formula the minus lands after the digits ("٠٫٤-").
const MARKS = /[\u061C\u200E\u200F]/;
const numAr = (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat("ar-EG", o).format(n);
const numEn = (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat("en", o).format(n);
const inLang = (ui: ReactNode, lang = "ar") => render(<I18nProvider lang={lang}>{ui}</I18nProvider>);
const openLab = (id: string, lang: "en" | "ar") => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[`/labs/${id}`]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
/** Opens a <details> as a click on its summary would (jsdom doesn't toggle it). */
const openDetails = (summary: HTMLElement) => {
  const d = summary.closest("details")!;
  act(() => { d.open = true; d.dispatchEvent(new Event("toggle")); });
};

describe("numbers in left-to-right lines", () => {
  it("ltrNum drops the marks Intl puts on Arabic negatives and percents", () => {
    expect(numAr(-0.4)).toMatch(MARKS); // why the helper exists
    expect(ltrNum(numAr(-0.4))).toBe("-٠٫٤");
    expect(ltrNum(numAr(0.5, { style: "percent" }))).toBe("٥٠٪");
    expect(ltrNum("-0.4")).toBe("-0.4");
  });

  it("signed rounds first, writes a real minus and never shows -0", () => {
    expect(signed(numAr, -0.4)).toBe("−٠٫٤");
    expect(signed(numAr, -0.0004)).toBe("٠");
    expect(signed(numAr, -0.40349, 3)).toBe("−٠٫٤٠٣");
    expect(signed(numEn, -20.374)).toBe("−20.37");
    expect(signed(numEn, 3)).toBe("3");
    expect(signed(numAr, -3)).not.toMatch(MARKS);
  });

  it("Formula keeps an Arabic negative's minus first", () => {
    const { container } = inLang(<Formula parts={["z", "=", numAr(-0.4), "×", numAr(2)]} />);
    const p = container.querySelector("p.lb-mono")!;
    expect(p.getAttribute("dir")).toBe("ltr");
    expect(p.textContent).not.toMatch(MARKS);
    expect([...p.querySelectorAll("bdi")].map((b) => b.textContent)).toEqual(["z", "=", "-٠٫٤", "×", "٢"]);
  });
});

describe("Plot", () => {
  it("writes negative ticks without direction marks", () => {
    const { container } = inLang(<Plot x={[-6, 6]} y={[-1, 1]} label="chart" />);
    const ticks = [...container.querySelectorAll(".lb-plot-tick")].map((t) => t.textContent ?? "");
    expect(ticks).toContain("-٦");
    expect(ticks).toContain("-١");
    expect(ticks.join(" ")).not.toMatch(MARKS);
  });

  it("keeps each axis arrow beside its own label, one isolate per axis", () => {
    const { container } = inLang(<Plot x={[0, 1]} y={[0, 1]} label="chart" xLabel="الليونة" yLabel="اللون (من الأخضر إلى الأصفر)" />);
    const items = [...container.querySelector("figcaption")!.children];
    expect(items.map((s) => s.textContent)).toEqual(["↑ اللون (من الأخضر إلى الأصفر)", "→ الليونة"]);
    expect(items.map((s) => s.querySelector("bdi")?.textContent)).toEqual(["اللون (من الأخضر إلى الأصفر)", "الليونة"]);
  });

  it("lets the keyboard choose a spot where a tap would", () => {
    const onPick = vi.fn();
    const { container } = inLang(<Plot x={[0, 10]} y={[0, 20]} label="chart" xLabel="Hours" yLabel="Score" onPick={onPick} dots={[{ x: 2, y: 4 }, { x: 8, y: 16 }]} />, "en");
    expect(container.querySelector(".lb-plot-cross")).toBeNull(); // no cross until the sliders are opened
    openDetails(screen.getByText("Choose a spot with sliders"));
    expect(container.querySelector(".lb-plot-cross")).not.toBeNull();
    const across = screen.getByLabelText("Hours") as HTMLInputElement, up = screen.getByLabelText("Score") as HTMLInputElement;
    expect([across.dir, up.dir]).toEqual(["ltr", "ltr"]); // like the chart's axes, in both languages
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(5, 10); // the middle of the chart to start with
    fireEvent.change(across, { target: { value: "7" } });
    fireEvent.change(up, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(7, 12);
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(2, 4);
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(8, 16);
  });

  it("jumps to the lab's own named targets instead of the dots, and says their names", () => {
    const onPick = vi.fn();
    const { container } = inLang(<Plot x={[0, 10]} y={[0, 10]} label="map" onPick={onPick} dots={[{ x: 1, y: 1 }]} targets={[{ x: 2, y: 3, label: "Tala – Bora, 4 km" }, { x: 6, y: 7 }]} />, "en");
    openDetails(screen.getByText("Choose a spot with sliders"));
    const said = () => container.querySelector(".lb-pick [aria-live=polite]")!.textContent;
    expect(said()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    expect(said()).toBe("Tala – Bora, 4 km");
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(2, 3);
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    expect(said()).toBe(""); // an unnamed target
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(onPick).toHaveBeenLastCalledWith(6, 7);
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    fireEvent.change(screen.getByLabelText("Across, left to right"), { target: { value: "4" } });
    expect(said()).toBe(""); // a slider moved the cross off the named spot
  });

  it("names the sliders across and up in Arabic when the chart has no axis labels", () => {
    inLang(<Plot x={[0, 10]} y={[0, 10]} ticks={0} label="map" onPick={() => {}} />);
    openDetails(screen.getByText("اختر مكانًا بالمنزلقات"));
    expect(screen.getByLabelText("أفقيًا، من اليسار إلى اليمين")).toBeTruthy();
    expect(screen.getByLabelText("رأسيًا، من الأسفل إلى الأعلى")).toBeTruthy();
    expect(screen.getByRole("button", { name: "اختر هذا المكان" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "النقطة التالية" })).toBeNull(); // no dots to jump to
  });

  it("has no sliders on a chart nobody taps, or when the lab says it has its own control", () => {
    inLang(<Plot x={[0, 1]} y={[0, 1]} label="chart" />, "en");
    inLang(<Plot x={[0, 1]} y={[0, 1]} label="chart" onPick={() => {}} picker={false} />, "en");
    expect(screen.queryByText("Choose a spot with sliders")).toBeNull();
  });
});

describe("Slider", () => {
  it("mirrors with the page unless told to stay left to right", () => {
    inLang(<><Slider label="a" value={1} min={0} max={2} onChange={() => {}} /><Slider dir="ltr" label="b" value={1} min={0} max={2} onChange={() => {}} /></>);
    expect(screen.getByLabelText("a").getAttribute("dir")).toBeNull();
    expect(screen.getByLabelText("b").getAttribute("dir")).toBe("ltr");
  });
});

describe("chart labels", () => {
  type B = { x0: number; y0: number; x1: number; y1: number };
  const hit = (p: B, q: B) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.5 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.5;

  it("labelSize gives Arabic labels more room between lines than Latin ones", () => {
    expect(labelSize("cat").h).toBe(14);
    expect(labelSize("القطة").h).toBe(20);
    expect(labelSize("القطة", 13, true).w).toBeGreaterThan(0);
  });

  it("spreadLabels keeps labels off each other and off every point, nearest first by rank", () => {
    // Twelve words on almost the same spot: the old spreader left them in a pile.
    const anchors = Array.from({ length: 12 }, (_, i) => ({ x: 150 + (i % 3), y: 150 + (i % 2), w: 50, h: 20, rank: i === 7 ? 0 : 1 }));
    const at = spreadLabels(anchors, { x0: 30, y0: 10, x1: 310, y1: 330 });
    const boxes = at.map((p, i) => ({ x0: p.x, y0: p.y - anchors[i].h, x1: p.x + anchors[i].w, y1: p.y }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(hit(boxes[i], boxes[j])).toBe(false);
      for (const a of anchors) expect(hit(boxes[i], { x0: a.x - 4, y0: a.y - 4, x1: a.x + 4, y1: a.y + 4 })).toBe(false);
      expect(boxes[i].x0).toBeGreaterThanOrEqual(30); expect(boxes[i].x1).toBeLessThanOrEqual(310);
      expect(boxes[i].y0).toBeGreaterThanOrEqual(10); expect(boxes[i].y1).toBeLessThanOrEqual(330);
    }
    expect(at[7]).toEqual({ x: anchors[7].x + 6, y: anchors[7].y - 4, lead: null }); // rank 0 keeps the usual spot
    expect(at.some((p) => p.lead)).toBe(true); // the far ones get a line back to their point
  });

  it.each(["ar", "en"] as const)("the word map (%s) has no label on top of another, with or without the camel sentence", async (lang) => {
    const { container } = openLab("embeddings", lang);
    await screen.findByText(lang === "ar" ? "جرّب هذا" : "Try this");
    const labels = () => [...container.querySelectorAll<SVGTextElement>(".lb-plot-label")].map((t) => {
      const on = t.classList.contains("is-on"), s = labelSize(t.textContent ?? "", on ? 13 : 12, on), x = Number(t.getAttribute("x")), y = Number(t.getAttribute("y"));
      return { x0: x, y0: y - s.h, x1: x + s.w, y1: y };
    });
    const piled = (b: B[]) => b.flatMap((p, i) => b.slice(i + 1).filter((q) => hit(p, q)));
    expect(labels().length).toBeGreaterThan(20);
    expect(piled(labels())).toEqual([]);
    fireEvent.change(container.querySelector("#lb-emb-add")!, { target: { value: lang === "ar" ? "تأكل الناقة العشب في المزرعة. تعطي الناقة الحليب في المزرعة." : "The camel eats grass on the farm. The camel gives milk on the farm." } });
    fireEvent.click(screen.getByRole("button", { name: lang === "ar" ? "أضف وأعد الرسم" : "Add and redraw" }));
    expect(piled(labels())).toEqual([]);
  });
});

describe("counted words and digits in the design-system labs", () => {
  it("tokens counts in Arabic with the forms the number takes", async () => {
    const { container } = openLab("tokens", "ar");
    const box = await screen.findByRole("textbox", { name: "نص لتقسيمه إلى توكنز" });
    const stats = () => [...container.querySelectorAll(".dr-lab-stats > span")].map((s) => s.textContent);
    fireEvent.change(box, { target: { value: "قلم" } });
    expect(stats()).toEqual(["توكن واحد", "٣ أحرف"]);
    fireEvent.change(box, { target: { value: "والمدرسة" } });
    expect(stats()).toEqual(["توكنان", "٨ أحرف"]);
    fireEvent.change(box, { target: { value: "المعلمون يشرحون البناء الضوئي" } });
    expect(stats()).toEqual(["٨ توكنز", "٢٩ حرفًا"]);
    expect(container.querySelector(".dr-lab-stats strong")!.textContent).toBe("٨");
  });

  it("tokens says 1 token, not 1 tokens", async () => {
    const { container } = openLab("tokens", "en");
    fireEvent.change(await screen.findByRole("textbox", { name: "Text to split into tokens" }), { target: { value: "cat" } });
    expect([...container.querySelectorAll(".dr-lab-stats > span")].map((s) => s.textContent)).toEqual(["1 token", "3 characters"]);
  });

  it("classifier shows its confidence with Arabic digits", async () => {
    const { container } = openLab("classifier", "ar");
    await screen.findByText("الثقة");
    expect(container.querySelector(".dr-tc-result")!.textContent).toMatch(/[٠-٩]+٪/);
    expect(container.querySelector(".dr-tc-result")!.textContent).not.toMatch(/[0-9]/);
  });
});

describe("lab targets", () => {
  it("no tappable lab control is shorter than 44 px (lab-kit.css)", () => {
    const css = readFileSync(resolve(__dirname, "../../src/styles/lab-kit.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const NOT_TAPPED = new Set([".lb-cell"]); // the index lab's cells only show numbers
    const small = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /(?:^|;)\s*min-block-size:\s*(\d+)px/.test(body) && Number(/min-block-size:\s*(\d+)px/.exec(body)![1]) < 44)
      .map(([, sel]) => sel.trim()).filter((sel) => !NOT_TAPPED.has(sel));
    expect(small).toEqual([]);
  });
});

describe("the labs' left-to-right maths in Arabic", () => {
  const ltrText = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".lb-mono, .lb-big[dir='ltr'], td[dir='ltr'], .lb-kernel > span, .lb-diagram text, .lb-table[dir='ltr'] td")].map((e) => e.textContent ?? "");

  it("backprop shows its negative weights minus first, and no two weights share a spot", async () => {
    const { container } = openLab("backprop", "ar");
    fireEvent.click(await screen.findByRole("button", { name: "التالي" }));
    const lines = ltrText(container);
    expect(lines.join("\n")).not.toMatch(MARKS);
    expect(lines.some((l) => l.includes("+ −٠٫٤ × ٠٫٥"))).toBe(true);
    const spots = [...container.querySelectorAll(".lb-diagram text")].map((t) => `${t.getAttribute("x")},${t.getAttribute("y")}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("activation writes ReLU of a negative sum the textbook way", async () => {
    const { container } = openLab("activation", "ar");
    fireEvent.click(await screen.findByRole("radio", { name: "ReLU" }));
    fireEvent.change(screen.getByRole("slider", { name: "مجموع الخلية" }), { target: { value: "-3" } });
    expect(container.querySelector(".lb-big")!.textContent).toBe("ReLU (−٣) = ٠");
    expect(ltrText(container).join("\n")).not.toMatch(MARKS);
  });

  it("convolution's filter grid and sum keep the minus first", async () => {
    const { container } = openLab("convolution", "ar");
    await screen.findByText("جرّب هذا");
    expect([...container.querySelectorAll(".lb-kernel > span")].map((s) => s.textContent)).toContain("−١");
    expect(ltrText(container).join("\n")).not.toMatch(MARKS);
  });

  it("gradient's line keeps \"≈\" after the word and turns a negative constant into the operator", async () => {
    const { container } = openLab("gradient", "ar");
    await screen.findByText("جرّب هذا");
    const parts = () => [...container.querySelectorAll("p.lb-mono bdi")].map((b) => b.textContent);
    expect(parts()).toEqual(["الدرجة", "≈", "٠", "× h", "+", "٠"]);
  });

  it("denoise's noise slider runs left to right, as its words and the lesson's video say, and its arrow points the reading way", async () => {
    const { container } = openLab("denoise", "ar");
    expect((await screen.findByRole("slider", { name: "مقدار الضوضاء" })).getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".lb-shell")!.textContent).toContain(" ← ");
  });

  it("labs you tap offer the sliders; labs with their own buttons don't repeat them", async () => {
    openLab("knn", "en");
    expect(await screen.findByText("Choose a spot with sliders")).toBeTruthy();
  });

  it("shortest closes a road without a tap: Next point goes road to road, by name", async () => {
    const { container } = openLab("shortest", "en");
    fireEvent.click(await screen.findByRole("radio", { name: "Close or open a road" }));
    openDetails(screen.getByText("Choose a spot with sliders"));
    fireEvent.click(screen.getByRole("button", { name: "Next point" }));
    expect(container.querySelector(".lb-pick [aria-live=polite]")!.textContent).toBe("Home – Tala, 4 km");
    fireEvent.click(screen.getByRole("button", { name: "Choose this spot" }));
    expect(container.querySelector(".lb-verdict")!.textContent).toBe("The road between Home and Tala is closed. Start again from Home.");
  });

  it.each(["threshold", "colouring"])("%s has no extra sliders", async (id) => {
    openLab(id, "en");
    await screen.findByText("Try this");
    expect(screen.queryByText("Choose a spot with sliders")).toBeNull();
  });
});
