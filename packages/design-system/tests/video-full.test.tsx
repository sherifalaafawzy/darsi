import { render, fireEvent } from "@testing-library/react";
import { VideoPlayer } from "../src";

// Phones without the Fullscreen API on elements (iPhone): the player covers the page, turned on its side when upright.
const screenOf = (w: number, h: number) => {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
};

describe("VideoPlayer full screen without the Fullscreen API", () => {
  it("covers the page and turns the video to landscape on an upright phone", () => {
    screenOf(390, 844);
    const { container, getByLabelText } = render(<VideoPlayer title="t" duration={100} src="v.mp4" />);
    fireEvent.click(getByLabelText("Full screen"));
    const fig = container.querySelector("figure")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    expect(fig.classList.contains("is-turned")).toBe(true);
    fireEvent.click(getByLabelText("Exit full screen"));
    expect(fig.classList.contains("is-full")).toBe(false);
    expect(fig.classList.contains("is-turned")).toBe(false);
  });

  it("stays as it is on a screen that is already landscape", () => {
    screenOf(844, 390);
    const { container, getByLabelText } = render(<VideoPlayer title="t" duration={100} src="v.mp4" />);
    fireEvent.click(getByLabelText("Full screen"));
    const fig = container.querySelector("figure")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    expect(fig.classList.contains("is-turned")).toBe(false);
  });
});
