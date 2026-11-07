// Fixes in the IoT, cyber, data and optimization labs: words, numbers and answer keys a learner reads or acts on.
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import ts from "typescript";
import { I18nProvider } from "../../src/i18n";
import Circuit from "../../src/labs/apps/circuit";
import { meta as circuitMeta } from "../../src/labs/apps/circuit/meta";
import Diet from "../../src/labs/apps/diet";
import { meta as dietMeta } from "../../src/labs/apps/diet/meta";
import Password from "../../src/labs/apps/password";
import { meta as passwordMeta } from "../../src/labs/apps/password/meta";
import Permissions from "../../src/labs/apps/permissions";
import { meta as permissionsMeta } from "../../src/labs/apps/permissions/meta";
import Phishing from "../../src/labs/apps/phishing";
import { meta as phishingMeta } from "../../src/labs/apps/phishing/meta";
import { MESSAGES } from "../../src/labs/apps/phishing/model";
import Routes from "../../src/labs/apps/routes";
import { meta as routesMeta } from "../../src/labs/apps/routes/meta";
import Spread from "../../src/labs/apps/spread";
import { meta as spreadMeta } from "../../src/labs/apps/spread/meta";
import { SLOTS } from "../../src/labs/apps/watermark/model";
import Binary from "../../src/labs/apps/binary";
import { meta as binaryMeta } from "../../src/labs/apps/binary/meta";
import { seekSteps, small } from "../../src/labs/apps/index/model";
import Leak from "../../src/labs/apps/leak";
import { meta as leakMeta } from "../../src/labs/apps/leak/meta";
import Mesh from "../../src/labs/apps/mesh";
import { meta as meshMeta } from "../../src/labs/apps/mesh/meta";
import Playground from "../../src/labs/apps/playground";
import { meta as playgroundMeta } from "../../src/labs/apps/playground/meta";
import RulesLab from "../../src/labs/apps/rules";
import { meta as rulesMeta } from "../../src/labs/apps/rules/meta";
import SupplyChain from "../../src/labs/apps/supplychain";
import { meta as supplyMeta } from "../../src/labs/apps/supplychain/meta";

const APPS = path.join(__dirname, "../../src/labs/apps");
const ARABIC = /[\u{0621}-\u{064A}]/u;
const LRI = "\u{2066}", PDI = "\u{2069}"; // a left-to-right isolate and its end
/** Text inside a left-to-right isolate. */
const isolated = (s: string) => `${LRI}${s}${PDI}`;
/** Text with its left-to-right isolates taken out. */
const outsideIsolates = (s: string) => s.replace(/\u{2066}[^\u{2069}]*\u{2069}/gu, "");

/** Every string in the labs' sources (literals and template pieces, escapes decoded) that holds Arabic letters. */
function arabicStrings() {
  const out: { file: string; text: string }[] = [];
  for (const dir of fs.readdirSync(APPS)) {
    const folder = path.join(APPS, dir);
    if (!fs.statSync(folder).isDirectory()) continue;
    for (const name of fs.readdirSync(folder).filter((f) => /\.tsx?$/.test(f))) {
      const file = `${dir}/${name}`;
      const src = ts.createSourceFile(name, fs.readFileSync(path.join(folder, name), "utf8"), ts.ScriptTarget.Latest, false, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
          if (ARABIC.test(node.text)) out.push({ file, text: node.text });
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
  }
  return out;
}

describe("Arabic text in every lab", () => {
  const strings = arabicStrings();
  it("finds the labs' Arabic strings", () => expect(strings.length).toBeGreaterThan(1000));

  it("isolates a digit joined to a Latin word by a hyphen (2-opt showed as opt-2)", () => {
    const bad = strings.filter((s) => /\d[-\u{2010}\u{2011}][A-Za-z]/u.test(outsideIsolates(s.text))).map((s) => `${s.file}: ${s.text}`);
    expect(bad).toEqual([]);
  });

  it("never calls an LED «الصمام الضوئي» (a photodiode): the glossary says «مصباح LED»", () => {
    const bad = strings.filter((s) => /صمام\S* ضوئي/.test(s.text)).map((s) => `${s.file}: ${s.text}`);
    expect(bad).toEqual([]);
  });
});

describe("LED and Ohm's law (circuit)", () => {
  it("says «مصباح LED» in Arabic, with the full name once", () => {
    expect(circuitMeta.title.ar).toBe("مصباح LED وقانون أوم");
    expect(circuitMeta.summary.ar).toContain("مصباح LED");
    const { container } = render(<I18nProvider lang="ar"><Circuit meta={circuitMeta} /></I18nProvider>);
    const text = container.textContent ?? "";
    expect(text).toContain("مصباح LED (أي الصمام الثنائي الباعث للضوء)");
    expect(text.match(/صمام/g)).toHaveLength(1); // only in the full name
    expect(text).toContain("لون المصباح");
  });
});

describe("school lunch (diet)", () => {
  it("serves the cheapest plate exactly, so it meets every need at every limit", () => {
    const { container } = render(<I18nProvider lang="en"><Diet meta={dietMeta} /></I18nProvider>);
    const cap = screen.getByLabelText("Most portions of one food");
    fireEvent.click(screen.getByRole("button", { name: /Find the cheapest/ }));
    for (const v of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
      fireEvent.change(cap, { target: { value: String(v) } });
      fireEvent.click(screen.getByRole("button", { name: "Serve this plate" }));
      expect(container.querySelector(".lb-verdict")!.textContent, `cap ${v}`).toBe("This plate meets every need.");
      expect(container.querySelectorAll(".lb-amount.is-short"), `cap ${v}`).toHaveLength(0);
    }
  });

  it("shows a small portion the cheapest plate needs instead of 0", () => {
    const { container } = render(<I18nProvider lang="en"><Diet meta={dietMeta} /></I18nProvider>);
    fireEvent.change(screen.getByLabelText("Most portions of one food"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Find the cheapest/ }));
    const meal = [...container.querySelectorAll(".lb-meal li")].map((li) => [...li.children].map((c) => c.textContent));
    expect(meal).toEqual([["Rice (cup)", "0.01"], ["Greens (cup)", "0.4"], ["Groundnuts (handful)", "4"]]);
    fireEvent.click(screen.getByRole("button", { name: "Serve this plate" }));
    const rice = screen.getByRole("button", { name: "Less Rice (cup)" }).parentElement!;
    expect(rice.querySelector("output")!.textContent).toBe("0.01");
  });
});

describe("spot the scam (phishing)", () => {
  const answerAll = () => {
    for (let i = 0; i < MESSAGES.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: "تبدو حقيقية" }));
      fireEvent.click(screen.getByRole("button", { name: "الرسالة التالية" }));
    }
  };
  /** The sender's address or number: left to right, in its own isolate. */
  const ltr = (root: Element) => [...root.querySelectorAll("bdi[dir=ltr]")].map((b) => b.textContent);

  it("keeps an email address whole and left to right in the message's header", () => {
    const { container } = render(<I18nProvider lang="ar"><Phishing meta={phishingMeta} /></I18nProvider>);
    const at = MESSAGES.findIndex((m) => m.id === "security");
    for (let i = 0; i < at; i++) {
      fireEvent.click(screen.getByRole("button", { name: "تبدو حقيقية" }));
      fireEvent.click(screen.getByRole("button", { name: "الرسالة التالية" }));
    }
    const header = container.querySelector(".lb-msg header")!;
    expect(header.textContent).toContain("فريق الأمان");
    const address = [...header.querySelectorAll<HTMLElement>("bdi[dir=ltr]")].find((b) => b.textContent === "<security@portal-verify.example>");
    expect(address).toBeTruthy();
    expect(address!.style.display).toBe("inline-block"); // moves to a line of its own rather than split at the hyphen
  });

  it("isolates every phone number and address in the review list", () => {
    const { container } = render(<I18nProvider lang="ar"><Phishing meta={phishingMeta} /></I18nProvider>);
    answerAll();
    const items = [...container.querySelectorAll(".lb-flags.is-review li")];
    expect(items).toHaveLength(MESSAGES.length);
    MESSAGES.forEach((m, i) => {
      const from = m.ar.from, address = /<([^<>]+)>$/.exec(from);
      if (address) expect(ltr(items[i])).toContain(`<${address[1]}>`);
      else if (/^[ -~]*$/.test(from)) expect(ltr(items[i])).toContain(from);
    });
    expect(ltr(items[0])).toContain("+44 7700 900123");
  });
});

describe("password strength (password)", () => {
  it("isolates the Latin samples in Arabic, and a copied sample still rates as promised", () => {
    const { container } = render(<I18nProvider lang="ar"><Password meta={passwordMeta} /></I18nProvider>);
    const try1 = container.querySelector(".lb-try-list li")!.textContent!;
    expect(try1).toContain(`«${isolated("Sunsh1ne2024!")}»`);
    expect(try1).toContain(`«${isolated("sunshine2024")}»`);
    expect(container.textContent).toContain(`«${isolated("P@ssw0rd!")}»`);
    expect(outsideIsolates(try1)).not.toMatch(/[A-Za-z]{2}/); // only the single letter «i» is left outside
    // A learner copies the sample from the text, isolates and all: it is scored without them.
    const input = container.querySelector<HTMLInputElement>("#lb-pw")!;
    fireEvent.change(input, { target: { value: isolated("Sunsh1ne2024!") } });
    expect(input.value).toBe("Sunsh1ne2024!");
    expect(container.querySelector(".lb-verdict")!.textContent).toContain("ضعيفة جدًا");
  });
});

describe("app permissions (permissions)", () => {
  it("marks denying a torch the camera as right, with the reason", () => {
    const { container } = render(<I18nProvider lang="en"><Permissions meta={permissionsMeta} /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Check my choices" }));
    const why = screen.getByRole("radiogroup", { name: "Torch: Camera" }).closest("li")!.querySelector(".lb-perm-why")!;
    expect(why.classList.contains("is-ok")).toBe(true);
    expect(why.textContent).toContain("deny is safer");
    expect(container.querySelector(".lb-verdict")!.textContent).toBe("13 of 15 choices match what the apps need.");
  });
});

describe("the school bus route (routes)", () => {
  it("keeps 2-opt in left-to-right isolates on the Arabic page and card", () => {
    const { container } = render(<I18nProvider lang="ar"><Routes meta={routesMeta} /></I18nProvider>);
    for (const text of [container.textContent ?? "", routesMeta.summary.ar]) {
      expect(text).toContain(isolated("2-opt"));
      expect(outsideIsolates(text)).not.toContain("2-opt");
    }
  });
});

describe("centre and spread (spread)", () => {
  for (const lang of ["en", "ar"] as const) {
    it(`says an extreme mark pulls the mean at 0 to 3, and not elsewhere (${lang})`, () => {
      const { container } = render(<I18nProvider lang={lang}><Spread meta={spreadMeta} /></I18nProvider>);
      const slider = container.querySelector<HTMLInputElement>("input[type=range]")!;
      const said = (v: number) => { fireEvent.change(slider, { target: { value: String(v) } }); return container.querySelector(".notice")!.textContent!; };
      const pulled = lang === "en" ? "One extreme mark pulls the mean" : "درجة واحدة متطرفة تسحب المتوسط";
      for (const v of [0, 1, 2, 3]) expect(said(v), `mark ${v}`).toContain(pulled);
      for (const v of [4, 12, 14, 20]) expect(said(v), `mark ${v}`).not.toContain(pulled);
      expect(said(20)).not.toMatch(/no extreme mark|لا توجد درجة متطرفة/);
    });
  }
});

describe("watermark sentences (watermark)", () => {
  it("makes every Arabic sentence agree: feminine subjects for تفتح, third-person plural ones for يصلون", () => {
    expect(SLOTS[1].choices.every((c) => c.ar.startsWith("ت"))).toBe(true);
    for (const c of SLOTS[0].choices) expect(c.ar, c.en).toMatch(/ة$|ت(?:نا|ي|ك|ه|ها)$/);
    expect(SLOTS[4].choices.every((c) => /^ي.*ون$/.test(c.ar))).toBe(true);
    for (const c of SLOTS[3].choices) expect(c.ar, c.en).not.toMatch(/نا$|نحن/); // not "we": its verbs are "they"
    expect(SLOTS.flatMap((s) => s.choices.map((c) => c.ar))).not.toContain("في الوقت"); // "on time" is «في الموعد»
    expect(SLOTS.flatMap((s) => s.choices.map((c) => c.ar)).some((w) => /صف/.test(w))).toBe(false); // a class is «فصل»
  });
});

// ---------- Second pass: the P3 fixes ----------

/** The Arabic strings of some labs only. */
const arabicOf = (...labs: string[]) => arabicStrings().filter((s) => labs.includes(s.file.split("/")[0]));
const source = (file: string) => fs.readFileSync(path.join(APPS, file), "utf8");

describe("counted words in Arabic (costs, poison, playground, mesh)", () => {
  it("never puts a fixed counted noun right after a number", () => {
    // "${n} طلبًا" read «٥ طلبًا» (5 needs «طلبات»), "${n} نقطة" «٢ نقطة», "${n} وزنًا" «٣ وزنًا», "${n} متر" «٢٨٠ متر».
    for (const lab of ["costs", "poison", "playground", "mesh"]) {
      expect(source(`${lab}/index.tsx`).match(/\$\{[^}]*\}\s*(?:طلب|نق[اط]|وزن|متر|أمتار)\S*/g) ?? [], lab).toEqual([]);
    }
  });

  it("says «٢٨٠ مترًا» and «٣٠٠ متر» on the radio range (mesh)", () => {
    render(<I18nProvider lang="ar"><Mesh meta={meshMeta} /></I18nProvider>);
    const range = screen.getByLabelText("مدى الإرسال"), output = () => range.parentElement!.querySelector("output")!.textContent;
    expect(output()).toBe("٢٨٠ مترًا");
    fireEvent.change(range, { target: { value: "3" } });
    expect(output()).toBe("٣٠٠ متر");
  });

  it("counts the network's weights with the right form (playground)", () => {
    const { container } = render(<I18nProvider lang="ar"><Playground meta={playgroundMeta} /></I18nProvider>);
    const note = () => [...container.querySelectorAll(".lb-note")].map((p) => p.textContent).find((t) => t?.startsWith("في هذه الشبكة"));
    expect(note()).toBe("في هذه الشبكة ١٧ وزنًا عليها أن تتعلّمها."); // 1 layer of 4: 2×4 + 4 + 4 + 1
    fireEvent.click(screen.getByRole("radio", { name: "٠" }));
    expect(note()).toBe("في هذه الشبكة ٣ أوزان عليها أن تتعلّمها.");
  });
});

describe("the attacker's guess and the familiarity numbers (leak)", () => {
  for (const lang of ["en", "ar"] as const) {
    it(`never shows the guess below chance, and labels the two lines (${lang})`, () => {
      const { container } = render(<I18nProvider lang={lang}><Leak meta={leakMeta} /></I18nProvider>);
      const slider = container.querySelector<HTMLInputElement>("input[type=range]")!;
      const pct = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, ""));
      for (const v of [0, 1, 2, 3]) {
        fireEvent.change(slider, { target: { value: String(v) } });
        const guess = container.querySelectorAll(".lb-stats dd")[1].textContent!;
        expect(pct(guess), `privacy ${v}: ${guess}`).toBeGreaterThanOrEqual(50);
      }
      const rows = [...container.querySelectorAll(".lb-mi li strong")].map((b) => b.textContent);
      expect(rows).toEqual(lang === "en" ? ["Trained on:", "Never seen:"] : ["تدرّب عليه:", "لم يرَه قطّ:"]);
      expect(container.textContent).toContain(lang === "en" ? "closer to 0 = more familiar" : "الأقرب إلى الصفر أكثر ألفة");
    });
  }
});

describe("the school register (pipeline)", () => {
  it("says Monday and P/A in Arabic, as the lessons do", () => {
    const texts = arabicOf("pipeline").map((s) => s.text);
    expect(texts.some((t) => t.includes("الأحد"))).toBe(false);
    expect(texts).toContain("الاثنين");
    expect(texts.some((t) => t.includes("(P للحاضر وA للغائب)"))).toBe(true);
    expect(texts.some((t) => /ح أو غ|ح للحاضر/.test(t))).toBe(false);
  });
});

describe("a class is «فصل» (timetable, tree, tools, rules)", () => {
  it("never calls a class «صف» (that is a table row)", () => {
    const bad = arabicOf("timetable", "tree", "tools", "rules").filter((s) => /(?:^|[^\u0621-\u064A])(?:ال|لل|وال|بال|و|ل|ب)?صف(?:وف|ين|نا|ّنا)?(?![\u0621-\u064A])/.test(s.text));
    expect(bad.map((s) => `${s.file}: ${s.text}`)).toEqual([]);
  });
});

describe("Try this matches what the lab does (index, modeller)", () => {
  it("never needs more than 6 looks in the sorted index of 32 pupils", () => {
    for (let seed = 1; seed <= 300; seed++) { const w = small(seed); expect(seekSteps(w.keys, w.key).length, `seed ${seed}`).toBeLessThanOrEqual(6); }
    expect(source("index/index.tsx")).not.toMatch(/5 or 6|٥ أو ٦/);
  });

  it("explains INFEASIBLE without a pupil the program doesn't have", () => {
    expect(source("modeller/index.tsx")).not.toMatch(/Omar|عمر/);
  });
});

describe("the smart classroom timeline (rules)", () => {
  it("gives the row names room and keeps 15:00 inside the chart", () => {
    const { container } = render(<I18nProvider lang="en"><RulesLab meta={rulesMeta} /></I18nProvider>);
    const svg = container.querySelector("figure svg")!;
    const width = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const bar = svg.querySelector("rect.lb-plot-bg")!;
    expect(Number(bar.getAttribute("x"))).toBeGreaterThanOrEqual(100);
    const last = [...svg.querySelectorAll("text.lb-plot-tick")].at(-1)!;
    expect(last.textContent).toBe("15:00");
    expect(last.getAttribute("text-anchor")).toBe("end");
    expect(Number(last.getAttribute("x"))).toBeLessThanOrEqual(width);
  });
});

describe("a file from an impostor (supplychain)", () => {
  it("delivers the impostor's own file: it matches the fingerprint posted with it, and only the signature catches it", async () => {
    const { container } = render(<I18nProvider lang="en"><SupplyChain meta={supplyMeta} /></I18nProvider>);
    const checks = () => [...container.querySelectorAll(".lb-checks li")].map((li) => `${li.className}: ${li.textContent}`);
    await screen.findByText("Trusted: same bytes, and really from the publisher.");
    fireEvent.click(screen.getByRole("radio", { name: "From an impostor" }));
    await screen.findByText("Signed by a key you don't trust — not the real publisher.");
    expect(checks()).toEqual(["is-ok: Fingerprint matches the one posted next to it", "is-no: Signature is from the publisher's key"]);
    expect(container.querySelector(".lb-pre")!.textContent).toContain("(free pro version)"); // not the publisher's bytes
  });
});

describe("Arabic samples on English pages keep the phone's font (binary)", () => {
  it("marks the Arabic letters and the text field, not the Latin ones", () => {
    const { container } = render(<I18nProvider lang="en"><Binary meta={binaryMeta} /></I18nProvider>);
    const input = container.querySelector<HTMLInputElement>("#lb-bin-text")!;
    expect(input.value).toBe("Darsi درسي");
    expect(input.lang).toBe("ar");
    expect(input.classList.contains("dr-other-script")).toBe(true);
    const chips = [...container.querySelectorAll(".lb-tok > span")];
    for (const c of chips) expect(c.classList.contains("dr-other-script"), c.textContent!).toBe(/[\u0600-\u06FF]/.test(c.textContent!));
    fireEvent.change(input, { target: { value: "Darsi" } });
    expect(input.lang).toBe("");
    expect(input.classList.contains("dr-other-script")).toBe(false);
  });

  it("keeps «نعم، أرسلها.» in Ask before acting's English Try this in its own Arabic span (approve)", () => {
    // The lab itself loads Darsi Tiny, so this reads its source: the Arabic phrase in the English strings sits in <Txt>.
    const src = source("approve/index.tsx"), en = src.slice(src.indexOf("  en: {"), src.indexOf("  ar: {"));
    const bare = en.replace(/<Txt text="[^"]*" \/>/g, "");
    expect(bare).not.toMatch(/[\u0600-\u06FF]/);
  });
});
