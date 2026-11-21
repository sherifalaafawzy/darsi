// "Guess the next word" (AI ladder rung 13) reports done once words were picked at both ends of the temperature
// slider, as its two "Try this" lines ask; without it the ladder never ticked rung 13.
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../src/i18n";
import NextWord from "../../src/labs/apps/nextword";
import { meta } from "../../src/labs/apps/nextword/meta";

describe("the next-word lab", () => {
  it("is done after picks at a low and a high temperature, once", () => {
    const onDone = vi.fn();
    render(<I18nProvider lang="en"><NextWord meta={meta} onDone={onDone} /></I18nProvider>);
    const pick = screen.getByRole("button", { name: "Pick the next word" });
    fireEvent.click(pick); // the default temperature, 1: neither end
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.2" } });
    fireEvent.click(pick);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(pick);
    fireEvent.click(pick);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("works the same in Arabic", () => {
    const onDone = vi.fn();
    render(<I18nProvider lang="ar"><NextWord meta={meta} onDone={onDone} /></I18nProvider>);
    const pick = screen.getByRole("button", { name: "اختر الكلمة التالية" });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(pick);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.3" } });
    fireEvent.click(pick);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
