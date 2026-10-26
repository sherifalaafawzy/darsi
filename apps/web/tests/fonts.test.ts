import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheFonts, fontUrls } from "../src/platform/fonts";

// The design system's @font-face rules as a browser exposes them (Vite emits hashed names under /assets/). jsdom's own
// CSS parser drops `src`, so the stylesheet is built by hand; the e2e test covers a real browser.
const face = (family: string, file: string) => ({
  type: 5, // CSSRule.FONT_FACE_RULE
  style: { getPropertyValue: (p: string) => (p === "src" ? `url("/assets/${file}.woff2") format("woff2")` : p === "font-family" ? `"${family}"` : "") },
});
const sheet = { href: `${location.origin}/assets/index-X.css`, cssRules: [
  face("Baloo 2", "baloo-2-latin-700-normal-A1"), face("Baloo 2", "baloo-2-latin-800-normal-A2"),
  face("Baloo 2 Ext", "baloo-2-latin-ext-700-normal-A3"), face("Baloo Bhaijaan 2", "baloo-bhaijaan-2-arabic-700-normal-A4"),
  face("Noto Sans", "noto-sans-latin-wght-normal-A5"), face("Noto Sans Arabic", "noto-sans-arabic-arabic-wght-normal-A6"),
  { type: 1, cssText: ".dr-card { color: red; }" },
] } as unknown as CSSStyleSheet;
Object.defineProperty(document, "styleSheets", { value: [sheet] });
const file = (u: string) => u.split("/").pop()!.replace(/-A\d\.woff2$/, "");

describe("fontUrls", () => {
  it("finds a family's files in the page's @font-face rules, as absolute URLs, once each", () => {
    const urls = fontUrls(["Baloo 2", "Noto Sans", "Noto Sans"]);
    expect(urls.map(file).sort()).toEqual(["baloo-2-latin-700-normal", "baloo-2-latin-800-normal", "noto-sans-latin-wght-normal"]);
    expect(urls.every((u) => u.startsWith(location.origin + "/assets/"))).toBe(true);
  });
  it("matches family names exactly (Baloo 2 is not Baloo 2 Ext) and skips stylesheets it cannot read", () => {
    const foreign = { get cssRules(): CSSRuleList { throw new DOMException("cross-origin", "SecurityError"); }, href: "https://fonts.example/x.css" } as unknown as CSSStyleSheet;
    expect(fontUrls(["Baloo 2 Ext"], [foreign, ...Array.from(document.styleSheets)]).map(file)).toEqual(["baloo-2-latin-ext-700-normal"]);
  });
});

describe("cacheFonts", () => {
  const stored = new Set<string>();
  let type = "font/woff2";
  const fetchFn = vi.fn(async (_url: string) => new Response("x", { headers: { "content-type": type } }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("caches", { open: async () => ({ match: async (url: string) => (stored.has(url) ? new Response("") : undefined), put: async (url: string) => { stored.add(url); } }) });
  afterEach(() => { stored.clear(); fetchFn.mockClear(); type = "font/woff2"; });

  it("keeps the Latin faces for English, and never the Arabic or extended-Latin ones", async () => {
    await cacheFonts("en");
    expect([...stored].map(file).sort()).toEqual(["baloo-2-latin-700-normal", "baloo-2-latin-800-normal", "noto-sans-latin-wght-normal"]);
  });
  it("keeps Latin too for Arabic: spaces, digits and Latin words in Arabic screens use it", async () => {
    await cacheFonts("ar");
    expect([...stored].map(file).sort()).toEqual(["baloo-2-latin-700-normal", "baloo-2-latin-800-normal", "baloo-bhaijaan-2-arabic-700-normal", "noto-sans-arabic-arabic-wght-normal", "noto-sans-latin-wght-normal"]);
  });
  it("adds only what is missing when a teacher switches from English to Arabic", async () => {
    await cacheFonts("en");
    fetchFn.mockClear();
    await cacheFonts("ar");
    expect(fetchFn.mock.calls.map(([u]) => file(String(u))).sort()).toEqual(["baloo-bhaijaan-2-arabic-700-normal", "noto-sans-arabic-arabic-wght-normal"]);
    expect(stored.size).toBe(5);
  });
  it("treats a language without its own fonts as Latin", async () => {
    await cacheFonts("fr");
    expect(stored.size).toBe(3);
  });
  it("never caches the HTML page Hosting returns for a font that no longer exists", async () => {
    type = "text/html; charset=utf-8";
    await cacheFonts("en");
    expect(stored.size).toBe(0);
  });
});
