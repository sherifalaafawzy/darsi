/**
 * The AI and architecture labs say what their lessons teach: the numbers a learner copies from a lab, the words it uses,
 * which way its sliders run, and that every lab can be marked done (the Labs page and the AI ladder wait for it).
 */
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";
import { fit, mse, newExamples, trainingExamples, verdict as fitVerdict } from "../../src/labs/apps/overfit/model";
import { cueLeft } from "../../src/labs/apps/rnn/model";
import { continueSong, followers, PITCHES, SONG, transitions } from "../../src/labs/apps/melody/model";
import { CASES, judge, tally, verdict, type Case, type Mark } from "../../src/labs/apps/suite/model";
import { FACE_LINE, judged, prototype, TEST, TRAIN } from "../../src/labs/apps/detect/model";
import { decode, encode, mse as vmse, N as VN, PICTURE } from "../../src/labs/apps/vae/model";
import * as adv from "../../src/labs/apps/adversarial/model";
import { accuracy as pgAccuracy, epoch, makeData, makeNet as pgNet } from "../../src/labs/apps/playground/model";
import type { Act } from "../../src/labs/kit/nn";
import { argmax } from "../../src/labs/kit/math";
import { rng } from "../../src/labs/kit/rng";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

const { LabApp } = await import("../../src/screens/Labs");
const { LabEmbed } = await import("../../src/labs/loader");
beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });

const openLab = (id: string, lang: "en" | "ar" = "en") => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[`/labs/${id}`]}><Routes><Route path="/labs/:id" element={<LabApp />} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
const embed = (id: string, onDone: () => void, lang: "en" | "ar" = "en") => render(
  <StoreProvider><I18nProvider lang={lang}><LabEmbed id={id} onDone={onDone} /></I18nProvider></StoreProvider>);
const triesOf = async (lang: "en" | "ar") => {
  const head = await screen.findByText(lang === "ar" ? "جرّب هذا" : "Try this");
  return [...(head.parentElement?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
};
const right = (c: Case): Mark => (c.mustRefuse ? "refuse" : "pass");
const marks = (f: (c: Case) => Mark) => Object.fromEntries(CASES.map((c) => [c.id, f(c)]));

describe("too good to be true (overfit): the lab's own data", () => {
  const run = (noise: number) => {
    const train = trainingExamples(false, noise), test = newExamples(noise);
    return Array.from({ length: 9 }, (_, i) => { const f = fit(train, i + 1); return { e: mse(f, test), v: fitVerdict(mse(f, train), mse(f, test), noise, i + 1, false) }; });
  };

  it("makes the U the lessons ask about: error on new examples falls to its lowest in the middle, then climbs", () => {
    for (const noise of [0.1, 0.15, 0.2]) {
      const e = run(noise).map((r) => r.e), low = e.indexOf(Math.min(...e));
      expect(low + 1, `noise ${noise}`).toBeGreaterThanOrEqual(3);
      expect(low + 1, `noise ${noise}`).toBeLessThanOrEqual(6);
      for (let i = 1; i <= low; i++) expect(e[i], `noise ${noise}, freedom ${i + 1}`).toBeLessThan(e[i - 1] * 1.05); // never turns up before
      for (let i = low + 1; i < 9; i++) expect(e[i], `noise ${noise}, freedom ${i + 1}`).toBeGreaterThanOrEqual(e[i - 1] * 0.999); // then climbs
      expect(e[8]).toBeGreaterThan(10 * e[low]);
    }
    expect(run(0.15).map((r) => r.v)).toEqual(["under", "under", "good", "good", "good", "good", "over", "over", "over"]);
  });

  it("names overfitting and underfitting as the lessons and the glossary do", async () => {
    const { container } = openLab("overfit", "ar");
    await triesOf("ar");
    expect(container.textContent).not.toContain("المطابقة");
    fireEvent.change(screen.getByRole("slider", { name: "الحرية (مدى انثناء المنحنى)" }), { target: { value: "9" } });
    expect(container.textContent).toContain("هذا هو الإفراط في التوفيق.");
    fireEvent.change(screen.getByRole("slider", { name: "الحرية (مدى انثناء المنحنى)" }), { target: { value: "1" } });
    expect(container.textContent).toContain("هذا هو نقص التوفيق.");
  });
});

describe("decide with numbers", () => {
  it("calls the starting tie a tie, in both languages, and lights both bars", async () => {
    const { container } = openLab("decision", "en");
    await triesOf("en");
    expect(container.querySelector(".lb-verdict")!.textContent).toBe("A tie with these weights: Museum and Science centre. Change one weight to break it.");
    expect([...container.querySelectorAll(".lb-bar.is-on > span:first-child")].map((x) => x.textContent)).toEqual(["Museum", "Science centre"]);
  });

  it("in Arabic too", async () => {
    const { container } = openLab("decision", "ar");
    await triesOf("ar");
    expect(container.querySelector(".lb-verdict")!.textContent).toBe("تعادل بهذه الأوزان: المتحف ومركز العلوم. غيّر وزنًا واحدًا لتحسم الأمر.");
  });

  it("lets a phone retype a score: clearing a cell leaves it empty, the next digit stays", async () => {
    const { container } = openLab("decision", "en");
    await triesOf("en");
    const cell = screen.getByRole("spinbutton", { name: "Museum: Cost" }) as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "" } });
    expect(cell.value).toBe(""); // was clamped to "1" at once
    fireEvent.change(cell, { target: { value: "4" } });
    expect(cell.value).toBe("4");
    expect(container.querySelector(".lb-verdict")!.textContent).toBe("Best choice with these weights: Museum.");
    fireEvent.blur(cell);
    expect(cell.value).toBe("4");
    fireEvent.change(cell, { target: { value: "14" } });
    fireEvent.blur(cell);
    expect(cell.value).toBe("5"); // out of range: clamped when the cell is left
    fireEvent.change(cell, { target: { value: "" } });
    fireEvent.blur(cell);
    expect(cell.value).toBe("5"); // left empty: back to the last score
  });
});

describe("a memory that fades (rnn)", () => {
  it("counts the way the lessons do: the cue goes in whole and each empty step multiplies it by the memory", () => {
    expect(cueLeft(0.5).states).toEqual([1, 0.5, 0.25, 0.125]);
    expect(cueLeft(0.9).kept).toBeCloseTo(0.729, 9);
    const memories = Array.from({ length: 20 }, (_, i) => (i * 5) / 100); // the slider: 0 to 0.95
    expect(memories.find((m) => cueLeft(m).kept > 0.5)).toBe(0.8); // "the smallest memory that keeps more than half"
  });

  for (const lang of ["en", "ar"] as const) {
    it(`shows the steps without list numbers over them, and its tries name no side (${lang})`, async () => {
      const { container } = openLab("rnn", lang);
      const tries = await triesOf(lang);
      expect(container.querySelector("ol.lb-row")).toBeNull();
      const steps = [...container.querySelectorAll("ol.lb-stages > li")].map((li) => li.textContent);
      expect(steps).toEqual(lang === "en" ? ["Cue 1", "Empty 0.3", "Empty 0.09", "Empty 0.027"] : ["إشارة ١", "فارغ ٠٫٣", "فارغ ٠٫٠٩", "فارغ ٠٫٠٢٧"]);
      for (const t of tries) expect(t).not.toMatch(lang === "en" ? /\b(left|right)\b/i : /اليسار|اليمين/);
    });
  }
});

describe("eight notes (melody)", () => {
  it("writes A E A E, because after E it counted A twice and C once", async () => {
    const c = transitions(SONG);
    expect(followers(c, 2).map(([p, n]) => [PITCHES[p], n])).toEqual([["A", 2], ["C", 1]]);
    expect(continueSong(c, SONG.at(-1)!, 4).map((i) => PITCHES[i])).toEqual(["A", "E", "A", "E"]);
    const { container } = openLab("melody", "en");
    const tries = await triesOf("en");
    expect(tries[0]).toContain("A E A E");
    expect(tries[0]).not.toContain("C–E–A–E");
    const rows = [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(rows).toEqual(["CE ×2", "EA ×2, C ×1", "AE ×2"]);
    fireEvent.click(screen.getByRole("button", { name: "Write the next four notes" }));
    expect(container.textContent).toContain("A  E  A  E");
  });
});

describe("a test with a refusal (suite)", () => {
  it("tells a missed refusal from an over-refusal", () => {
    expect(verdict(judge(CASES, {}))).toBe("left");
    expect(verdict(judge(CASES, marks(right)))).toBe("held");
    expect(verdict(judge(CASES, { ...marks(right), loss: "refuse" }))).toBe("over");
    expect(tally(judge(CASES, { ...marks(right), loss: "refuse" })).over).toBe(1);
    expect(verdict(judge(CASES, marks(() => "refuse")))).toBe("over"); // nothing missed: six cases refused that it should answer
    expect(verdict(judge(CASES, { ...marks(right), photo: "pass", loss: "refuse" }))).toBe("failed"); // a missed refusal comes first
  });

  it("says so on screen, and every choice says whether it is picked", async () => {
    const { container } = openLab("suite", "en");
    await triesOf("en");
    for (const b of screen.getAllByRole("radio", { name: "Refuse" })) fireEvent.click(b);
    const line = container.querySelector(".lb-shell [role=status]")!.textContent!;
    expect(line).toBe("No required refusal was missed, but a model that refuses questions it should answer has not passed either.");
    expect(container.textContent).toContain("Ordinary cases marked refuse 6.");
    expect(line).not.toContain("must be refused was marked pass");
    expect(screen.getAllByRole("radio", { name: "Refuse" }).every((b) => b.getAttribute("aria-checked") === "true")).toBe(true);
    expect(screen.getAllByRole("radiogroup").length).toBe(CASES.length);
    expect(screen.getByRole("radiogroup", { name: "What is 17 + 4?" })).toBeTruthy();
  });
});

describe("a tiny face detector", () => {
  it("prints the wide face's score under the line, and the line in the page's language", async () => {
    const wide = judged(prototype(TRAIN), TEST).find((r) => r.group === "wide")!;
    expect(wide.said).toBe(false);
    expect(Math.round(wide.score * 1000) / 1000).toBe(0.548); // what the lab shows: below 0.55, not equal to it
    expect(Math.round(wide.score * 1000) / 1000).toBeLessThan(FACE_LINE);
    const { container } = openLab("detect", "ar");
    await triesOf("ar");
    expect(container.textContent).toContain("٠٫٥٤٨");
    expect(container.textContent).toContain("الخط هو");
    expect(container.textContent).not.toMatch(/line/);
  });
});

describe("a two-number code (vae)", () => {
  it("is a summary that loses something, and moving it anywhere makes the difference grow", () => {
    const code = encode(PICTURE);
    expect(code.x).toBeCloseTo(0.5, 9);
    expect(code.y).toBeCloseTo(0.5, 9);
    const at = vmse(PICTURE, decode(0.5, 0.5));
    expect(at).toBeGreaterThan(0.01); // the two specks are lost
    const back = decode(0.5, 0.5);
    expect(back[1 * VN + 1]).toBe(0);
    expect(back[6 * VN + 6]).toBe(0);
    const grid = Array.from({ length: 17 }, (_, i) => (10 + i * 5) / 100); // the sliders: 0.1 to 0.9
    for (const x of grid) for (const y of grid) if (x !== 0.5 || y !== 0.5) expect(vmse(PICTURE, decode(x, y)), `${x}, ${y}`).toBeGreaterThan(at);
    expect(Math.round(vmse(PICTURE, decode(0.55, 0.5)) * 1000)).toBeGreaterThan(Math.round(at * 1000)); // one step shows on the readout
  });

  it("runs its sliders left to right in Arabic, with the picture", async () => {
    const { container } = openLab("vae", "ar");
    await triesOf("ar");
    expect(screen.getAllByRole("slider").map((r) => r.getAttribute("dir"))).toEqual(["ltr", "ltr"]);
    expect(container.textContent).toContain("الفرق عن الأصل ٠٫٠٢٥");
  });
});

describe("one denoise step", () => {
  it("says which way to move the noise without naming a side alone, and pulls toward black or white", async () => {
    openLab("denoise", "ar");
    const tries = await triesOf("ar");
    expect(tries[1]).toContain("ارفع الضوضاء إلى ١");
    expect(tries[2]).toContain("اخفض الضوضاء إلى قرب ٠");
    // Left to right in Arabic too, so "more noise at the far right" (these tries, ai-d2-4's prompt and its video) holds.
    expect(screen.getByRole("slider").getAttribute("dir")).toBe("ltr");
    const { meta } = await import("../../src/labs/apps/denoise/meta");
    expect(meta.summary.en).toContain("toward black or white");
    expect(meta.summary.ar).toContain("نحو الأسود أو الأبيض");
  });
});

describe("network playground", () => {
  it("can train a hidden layer with no activation, which stays one straight line", () => {
    const pts = makeData("circle", 160, 0);
    const train = (act: Act) => {
      const net = pgNet({ layers: 1, neurons: 4, act }), r = rng(11);
      for (let e = 0; e < 1500; e++) if (epoch(net, pts, 0.3, r) < 0.02) break;
      return pgAccuracy(net, pts);
    };
    expect(train("linear")).toBeLessThan(0.7);
    expect(train("tanh")).toBeGreaterThan(0.95);
  });

  it("offers it in both languages", async () => {
    openLab("playground", "ar");
    await triesOf("ar");
    expect(screen.getByRole("radio", { name: "بلا تنشيط (خطي)" })).toBeTruthy();
  });
});

describe("fool it with a few pixels (adversarial)", () => {
  const net = adv.makeNet(); adv.fit(net, adv.trainingSet(6, 1), 300);
  const test = adv.trainingSet(6, 777);

  it("counts only the pixels that really changed", () => {
    const r = adv.attack(net, test[0].img, test[0].label, 0.7, 9);
    for (const i of r.changed) expect(r.img[i]).not.toBe(test[0].img[i]);
    expect(r.changed.length).toBe(8); // nine chosen, one already at 0 and pushed further down
    expect(argmax(adv.probs(net, r.img))).not.toBe(test[0].label); // and the ninth pixel is where it flips
  });

  it("needs about nine pixels at the lab's strength, fewer at strength 1, as its words say", () => {
    const ok = test.filter((e) => argmax(adv.probs(net, e.img)) === e.label);
    const median = (eps: number) => { const n = ok.map((e) => adv.pixelsToFool(net, e.img, e.label, eps)).sort((a, b) => a - b); return n[Math.floor(n.length / 2)]; };
    expect(median(0.7)).toBe(9);
    expect(median(1)).toBeLessThan(9);
  });

  it("counts the changed pixels with the language's plural forms, and its card no longer says the picture looks the same", async () => {
    const changed = (k: number) => adv.attack(net, test[0].img, test[0].label, 0.7, k).changed.length;
    const ar = openLab("adversarial", "ar");
    await triesOf("ar");
    fireEvent.click(screen.getByRole("button", { name: "درّب النموذج" }));
    const six = changed(6); // the default budget
    expect(six).toBeGreaterThanOrEqual(3);
    expect(six).toBeLessThanOrEqual(10);
    expect(ar.container.textContent).toContain(`تغيّرت ${six.toLocaleString("ar-EG")} بكسلات`); // 3 to 10: «بكسلات», not «بكسلًا»
    ar.unmount();
    const one = [1, 2, 3].find((k) => changed(k) === 1)!;
    expect(one).toBeDefined();
    const en = openLab("adversarial", "en");
    await triesOf("en");
    fireEvent.click(screen.getByRole("button", { name: "Train the model" }));
    fireEvent.change(screen.getByRole("slider", { name: "Pixels allowed" }), { target: { value: String(one) } });
    expect(en.container.textContent).toContain("1 pixel changed");
    expect(en.container.textContent).not.toContain("1 pixels");
    const { meta } = await import("../../src/labs/apps/adversarial/meta");
    expect(meta.summary.en).not.toContain("looks the same");
    expect(meta.summary.ar).not.toContain("تبدو كما هي");
  });
});

describe("nearest neighbours (knn)", () => {
  const place = (k: string, name: string) => {
    fireEvent.change(screen.getByRole("slider", { name }), { target: { value: k } });
    fireEvent.click(screen.getAllByRole("button", { name: /Choose this spot|اختر هذا المكان/, hidden: true })[0]!);
  };

  it("reads well at k = 1 and with one ripe neighbour, in English", async () => {
    const { container } = openLab("knn", "en");
    await triesOf("en");
    place("1", "Neighbours to ask (k)");
    expect(container.querySelector(".lb-verdict")!.textContent).toMatch(/^Its nearest neighbour is (ripe|not ripe), so: (ready to eat|not ready yet)\.$/);
    place("3", "Neighbours to ask (k)");
    const m = container.querySelector(".lb-verdict")!.textContent!.match(/^(\d) of its 3 nearest neighbours (is|are) ripe, so: /);
    expect(m).not.toBeNull();
    expect(m![2]).toBe(m![1] === "1" ? "is" : "are");
  });

  it("in Arabic, with ai-s3-2's word for softness", async () => {
    const { container } = openLab("knn", "ar");
    await triesOf("ar");
    place("1", "عدد الجيران الذين نسألهم (k)");
    expect(container.querySelector(".lb-verdict")!.textContent).toMatch(/^أقرب مانجو إليها (ناضجة|غير ناضجة)، إذن: (جاهزة للأكل|ليست جاهزة بعد)\.$/);
    expect(container.textContent).toContain("الطراوة");
    expect(container.textContent).not.toContain("الليونة");
  });
});

describe("the glossary in the decision, tree, k-means and threshold labs", () => {
  for (const id of ["decision", "tree", "kmeans", "threshold"]) {
    it(`${id}: موازنة, فصل for a class and فصل دراسي for a term, الحافلة, تسمية`, async () => {
      const { container } = openLab(id, "ar");
      await triesOf("ar");
      expect(container.textContent).not.toMatch(/مقايض|يقايض|لعب الصف|الفصل الماضي|الباص|معنونة/);
      if (id === "tree") expect(container.textContent).toContain("من الفصل الدراسي الماضي: حالة الطقس، وهل لعب الفصل كرة القدم");
    });
  }
});

describe("decide with numbers: the expected-value chart", () => {
  it("keeps both line labels inside the chart and off their lines, even when a line starts at the top", async () => {
    const { container } = openLab("decision", "en");
    await triesOf("en");
    fireEvent.click(screen.getByRole("radio", { name: "Expected value" }));
    const check = (where: "above" | "under") => {
      const labels = [...container.querySelectorAll("text.lb-plot-label")];
      expect(labels.map((t) => t.textContent)).toEqual(["Outside", "In the hall"]);
      const lines = [...container.querySelectorAll("polyline.lb-plot-line")].map((l) => l.getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number)));
      labels.forEach((t, i) => {
        const x = Number(t.getAttribute("x")), y = Number(t.getAttribute("y"));
        const [[x0, y0], [x1, y1]] = lines[i]!, lineY = y0! + ((y1! - y0!) * (x - x0!)) / (x1! - x0!);
        expect(y - 11, `${t.textContent}: its top inside the chart`).toBeGreaterThanOrEqual(8);
        // The lines fall or stay flat from left to right, so a label clear of its line where it starts stays clear of it.
        if (i === 0 && where === "under") expect(y - 11, "under its line").toBeGreaterThan(lineY);
        else expect(y + 3, `${t.textContent}: above its line`).toBeLessThanOrEqual(lineY);
      });
    };
    check("above"); // Outside starts at 10 and falls to 2: its label goes along to where the line has come down
    fireEvent.change(screen.getByRole("spinbutton", { name: "Outside: Rain" }), { target: { value: "10" } });
    check("under"); // a flat line along the top: the label goes under it
  });
});

describe("inside an agent's loop (agentloop)", () => {
  for (const lang of ["en", "ar"] as const) {
    it(`asks for five presses of One step, the first sending the request (${lang})`, async () => {
      openLab("agentloop", lang);
      const tries = await triesOf(lang);
      expect(tries[0]).toContain(lang === "en" ? "press One step five times: your request, the plan" : "واضغط «خطوة واحدة» خمس مرات: طلبك، ثم الخطة");
    });
  }
});

describe("mistakes and thresholds", () => {
  it("shows precision and recall, which its lessons ask learners to watch", async () => {
    const { container } = openLab("threshold", "en");
    await triesOf("en");
    const stats = Object.fromEntries([...container.querySelectorAll(".lb-stats > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(stats["Precision (share of alarms that were real)"]).toBe("86%");
    expect(stats["Recall (share of real cases caught)"]).toBe("80%");
  });
});

describe("every lab can be marked done", () => {
  it("each app's code reports done (the AI ladder starts at the first rung not done)", () => {
    const APPS = path.join(__dirname, "../../src/labs/apps");
    const missing = fs.readdirSync(APPS).filter((id) => fs.statSync(path.join(APPS, id)).isDirectory())
      .filter((id) => !/\bonDone\b/.test(fs.readFileSync(path.join(APPS, id, "index.tsx"), "utf8")));
    expect(missing).toEqual([]);
  });

  it("prompt: asking the AI with an ingredient added (try 2)", async () => {
    const done = vi.fn();
    embed("prompt", done);
    fireEvent.click(await screen.findByRole("button", { name: /Ask the AI/ }));
    expect(done).not.toHaveBeenCalled(); // Role and Task only: try 1
    fireEvent.click(screen.getByRole("button", { name: /Context/ }));
    expect(done).not.toHaveBeenCalled(); // an ingredient alone isn't asking
    fireEvent.click(screen.getByRole("button", { name: /Ask the AI/ }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("tokens (rung 11): typing your own text", async () => {
    const done = vi.fn();
    embed("tokens", done);
    const box = await screen.findByRole("textbox", { name: "Text to split into tokens" });
    fireEvent.input(box, { target: { value: "cat" } });
    fireEvent.input(box, { target: { value: "cats" } });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("classifier: adding an example", async () => {
    const done = vi.fn();
    embed("classifier", done);
    fireEvent.change(await screen.findByLabelText("New example"), { target: { value: "Confirm the bank password today" } });
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: /Add example/ })[1]!);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("factcheck: marking every claim", async () => {
    const done = vi.fn();
    embed("factcheck", done);
    for (const claim of ["the longest river in Africa", "about 6,650 km long", "from north to south", "was first mapped by satellites in 1950"]) {
      fireEvent.click(await screen.findByRole("button", { name: claim }));
      fireEvent.click(screen.getByRole("button", { name: "Wrong" }));
    }
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });

  it("suite: a suite that passes", async () => {
    const done = vi.fn();
    embed("suite", done);
    await screen.findAllByRole("radiogroup");
    for (const c of CASES) fireEvent.click(screen.getByRole("radiogroup", { name: c.en }).querySelector(`[role=radio]:nth-child(${right(c) === "pass" ? 1 : 2})`)!);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("vae, rnn, denoise, split and melody: their one move", async () => {
    const cases: [string, () => Promise<void>][] = [
      ["vae", async () => { fireEvent.change((await screen.findAllByRole("slider"))[0]!, { target: { value: "0.55" } }); }],
      ["rnn", async () => { fireEvent.change(await screen.findByRole("slider"), { target: { value: "0.9" } }); }],
      ["denoise", async () => { fireEvent.change(await screen.findByRole("slider"), { target: { value: "1" } }); }],
      ["split", async () => { fireEvent.click(await screen.findByRole("radio", { name: "Split the layer" })); }],
      ["melody", async () => { fireEvent.click(await screen.findByRole("button", { name: "Write the next four notes" })); }],
    ];
    for (const [id, act] of cases) {
      const done = vi.fn();
      const { unmount } = embed(id, done);
      await screen.findByText("Try this");
      expect(done, `${id} before`).not.toHaveBeenCalled();
      await act();
      expect(done, `${id} after`).toHaveBeenCalled();
      unmount();
    }
  });

  it("detect: reading the scores is the lab", async () => {
    const done = vi.fn();
    embed("detect", done);
    await screen.findByText("Try this");
    expect(done).toHaveBeenCalled();
  });
});
