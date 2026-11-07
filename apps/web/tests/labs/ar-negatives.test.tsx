// Arabic negatives in left-to-right maths lines. Intl's ar-EG minus starts with U+061C (Arabic letter mark), which makes
// each auto-direction isolate right to left: in the LLM lab "[0.12, -0.4, 0.7]" showed as "[٠٫١٢٠٫٤- ,, ٠٫٧]".
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../src/i18n";
import Llm from "../../src/labs/apps/llm";
import { meta as llmMeta } from "../../src/labs/apps/llm/meta";
import Neuron from "../../src/labs/apps/neuron";
import { meta as neuronMeta } from "../../src/labs/apps/neuron/meta";

const MARKS = /[؜‎‏]/;

describe("negative numbers in Arabic maths lines", () => {
  it("the LLM lab's embeddings: minus first, no direction marks, every isolate left to right", () => {
    const { container } = render(<I18nProvider lang="ar"><Llm meta={llmMeta} /></I18nProvider>);
    const vecs = [...container.querySelectorAll(".lb-vec .lb-mono")];
    expect(vecs.length).toBeGreaterThan(0);
    const text = vecs.map((v) => v.textContent).join(" ");
    expect(text).toMatch(/−[٠-٩]/); // embeddings always have negatives
    expect(text).not.toMatch(MARKS);
    expect(text).not.toMatch(/-[٠-٩]|[٠-٩]-/);
    for (const b of vecs.flatMap((v) => [...v.querySelectorAll("bdi")])) expect(b.getAttribute("dir")).toBe("ltr");
  });

  it("the neuron's weighted sum shows a negative weight minus first", () => {
    const { container } = render(<I18nProvider lang="ar"><Neuron meta={neuronMeta} /></I18nProvider>);
    const weight = screen.getAllByRole("slider")[1]; // input 1's weight
    fireEvent.change(weight, { target: { value: "-1.5" } });
    const line = container.querySelector("p.lb-mono[dir=ltr]")!;
    expect(line.textContent).toContain("−١٫٥");
    expect(line.textContent).not.toMatch(MARKS);
  });
});
