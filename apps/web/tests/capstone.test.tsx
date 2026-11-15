import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../src/i18n";
import type { ProjectStep } from "../src/content/types";
import type { AiReview, CapCheck } from "../src/content/capstone";
import { CapstoneBrief, CapstoneResult } from "../src/lesson/CapstoneParts";
import { counted, CT, fill, HOURS, refusal, setupTabLabel } from "../src/lesson/capstoneText";

// The capstone milestone's words (lesson/capstoneText.ts, lesson/CapstoneParts.tsx): numbers in the reader's digits and
// each language's own plural forms, the three kinds of automatic check, and checkCapstone's refusals.
const ar = new Intl.NumberFormat("ar-EG").format, en = new Intl.NumberFormat("en").format;
const ui = (lang: string, el: ReactElement) => render(<I18nProvider lang={lang}>{el}</I18nProvider>);
const step = (o: Partial<ProjectStep> = {}): ProjectStep => ({
  type: "project", id: "project", prompt: { en: "Milestone" }, task: { en: "Do it" }, deliverable: { en: "A repo" }, evidence: [{ kind: "repo" }], milestone: "m1",
  rubric: [{ criterion: { en: "Works", ar: "يعمل" } }, { criterion: { en: "Explained", ar: "مشروح" } }], ...o,
}) as ProjectStep;
const checks: CapCheck[] = [
  { id: "repo", ok: true, en: "The repository is public on GitHub.", ar: "المستودع عام على GitHub." },
  { id: "ci", ok: null, en: "GitHub couldn't be reached, so the Actions run wasn't checked. Send it again later.", ar: "تعذّر الوصول إلى GitHub، فلم يُفحص تشغيل Actions. أرسله مرة أخرى لاحقًا." },
  { id: "release", ok: false, en: "Tag a release (for example v1.0) on GitHub.", ar: "ضع وسمًا لإصدار (مثل v1.0) على GitHub." },
];
const review: AiReview = { status: "done", capped: true, scores: [{ criterion: 0, score: 1, en: "Runs", ar: "يعمل" }, { criterion: 1, score: 0, en: "Say how", ar: "اشرح" }], summary: { en: "Good start.", ar: "بداية جيدة." }, next: { en: "", ar: "" } };

describe("capstone numbers", () => {
  it("say a milestone's hours with each language's forms, in its digits", () => {
    expect(counted(HOURS, "ar", 1, ar)).toBe("قرابة ساعة من العمل");
    expect(counted(HOURS, "ar", 2, ar)).toBe("قرابة ساعتين من العمل");
    expect(counted(HOURS, "ar", 3, ar)).toBe("قرابة ٣ ساعات من العمل");
    expect(counted(HOURS, "ar", 10, ar)).toBe("قرابة ١٠ ساعات من العمل");
    expect(counted(HOURS, "ar", 11, ar)).toBe("قرابة ١١ ساعة من العمل");
    expect(counted(HOURS, "ar", 100, ar)).toBe("قرابة ١٠٠ ساعة من العمل");
    expect(counted(HOURS, "en", 1, en)).toBe("About an hour of work");
    expect(counted(HOURS, "en", 4, en)).toBe("About 4 hours of work");
    // A language without its own forms gets the English ones, picked by English's rules (French calls 0.5 "one").
    expect(counted(HOURS, "fr", 1, en)).toBe("About an hour of work");
    expect(counted(HOURS, "fr", 0.5, en)).toBe("About 0.5 hours of work");
  });
  it("fill numbers in the reader's digits", () => {
    expect(fill(CT.passed.ar as string, { n: 2, m: 3 }, ar)).toBe("الفحوص الناجحة: ٢ من ٣");
    expect(fill(CT.score.ar as string, { n: 1, m: 3 }, ar)).toBe("١ من ٣");
    expect(fill(CT.score.en, { n: 1, m: 3 })).toBe("1 of 3");
  });
});

describe("the milestone brief", () => {
  it("shows two hours as the Arabic dual, with no Latin digit", () => {
    const { container } = ui("ar", <CapstoneBrief step={step({ hours: 2 })} />);
    expect(screen.getByText("قرابة ساعتين من العمل")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[0-9]/);
  });
  it("shows other counts in Arabic-Indic digits", () => {
    ui("ar", <CapstoneBrief step={step({ hours: 4 })} />);
    expect(screen.getByText("قرابة ٤ ساعات من العمل")).toBeTruthy();
  });
  it("names this milestone in the setup's commands instead of '<mN>', in both languages", () => {
    const setup: ProjectStep["setup"] = [{ os: "windows", body: { en: "Activate .venv, then: python check.py --milestone <mN>", ar: "فعّل .venv، ثم: ⁦python check.py --milestone <mN>⁩" } }];
    const en = ui("en", <CapstoneBrief step={step({ milestone: "m3", setup })} />);
    expect(en.container.textContent).toContain("python check.py --milestone m3");
    expect(en.container.textContent).not.toContain("<mN>");
    en.unmount();
    const ar = ui("ar", <CapstoneBrief step={step({ milestone: "m3", setup })} />);
    expect(ar.container.textContent).toContain("--milestone m3");
    expect(ar.container.textContent).not.toContain("<mN>");
  });
  it("names the third tab after what its steps use: Codespaces, Colab, or both", () => {
    const tab = (en: string) => [{ os: "colab" as const, body: { en, ar: en } }];
    const label = (en: string) => { const r = ui("en", <CapstoneBrief step={step({ setup: tab(en) })} />); const t = screen.getByRole("button").textContent; r.unmount(); return t; };
    expect(label("Codespaces: on your copy, press Code → Codespaces.")).toBe("Codespaces");
    expect(label("Colab: open the notebook link and run the cells.")).toBe("Colab");
    expect(label("Open it in Colab, or in a codespace with Codespaces.")).toBe("Colab or Codespaces");
    expect(label("If this milestone uses a notebook, open the link from the starter README.")).toBe("Colab or Codespaces");
    expect(setupTabLabel("windows", { en: "Colab" })).toBe(CT.windows);
  });
});

describe("the checks and the AI review", () => {
  it("count only the checks that ran, mark each one for screen readers, and number everything in Arabic digits", () => {
    const { container } = ui("ar", <CapstoneResult checks={checks} review={review} />);
    expect(screen.getByText("الفحوص الناجحة: ١ من ٢")).toBeTruthy();
    expect(screen.getByRole("img", { name: "نجح" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "لم ينجح" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "لم يُفحص" })).toBeTruthy();
    // Without the rubric (a reviewer's list), a criterion is named by its number.
    expect(screen.getByText("المعيار ١")).toBeTruthy();
    expect(screen.getByText(/لا تتجاوز أي درجة ١ حتى ينجح/)).toBeTruthy();
    for (const li of container.querySelectorAll(".notice li")) expect(li.textContent).not.toMatch(/[0-9]/);
    expect(container.querySelector(".notice li")?.textContent).toContain("١ من ٣");
  });
  it("say the same in English, with the rubric's own words", () => {
    ui("en", <CapstoneResult checks={checks} review={review} rubric={step().rubric} />);
    expect(screen.getByText("Passed: 1 of 2")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Not checked" })).toBeTruthy();
    expect(screen.getByText("Works")).toBeTruthy();
    expect(screen.getByText(/no score is above 1 until it does/)).toBeTruthy();
  });
  it("leave out the count when GitHub couldn't be reached for any of them, and show no cap note on an uncapped review", () => {
    ui("en", <CapstoneResult checks={[{ id: "repo", ok: null, en: "Not reached", ar: "" }]} review={{ ...review, capped: undefined }} />);
    expect(screen.queryByText(/^Passed:/)).toBeNull();
    expect(screen.queryByText(/no score is above/)).toBeNull();
  });
});

describe("the capstone strings", () => {
  it("know checkCapstone's refusals from any other error", () => {
    expect(refusal({ code: "functions/resource-exhausted", message: "capstone-wait" })).toBe("wait");
    expect(refusal({ code: "functions/resource-exhausted", message: "capstone-limit" })).toBe("limit");
    expect(refusal({ code: "functions/resource-exhausted", message: "busy" })).toBeNull();
    expect(refusal({ code: "functions/internal", message: "capstone-wait" })).toBeNull();
    expect(refusal({ code: "functions/not-found", message: "No such capstone milestone." })).toBe("closed");
    expect(refusal({ code: "functions/invalid-argument", message: "bad:files" })).toBe("invalid");
    expect(refusal(new Error("Failed to fetch"))).toBeNull();
    expect(refusal(null)).toBeNull();
  });
  it("are written in English and Arabic, with no middle dot", () => {
    for (const [k, v] of Object.entries(CT)) {
      expect(v.en, k).toBeTruthy();
      expect(v.ar, k).toBeTruthy();
      expect(v.ar, k).not.toContain("·");
    }
    for (const forms of [HOURS.en, HOURS.ar]) for (const s of Object.values(forms ?? {})) expect(s).not.toContain("·");
  });
});
