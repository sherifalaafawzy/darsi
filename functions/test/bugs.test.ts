import { describe, expect, it } from "vitest";
import { BUG_LIMITS, clean, limiter, MAX_SHOT, parseReport, redactUrl, sniff } from "../src/bugsCore";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const dataUrl = (b: Buffer, type = "image/jpeg") => `data:${type};base64,${b.toString("base64")}`;

describe("parseReport", () => {
  it("keeps the words, the page and the screenshot, and works out the path", () => {
    const r = parseReport({ text: "  The Continue button does nothing  ", url: "https://darsiai.org/lesson/ai-1-1/ai-1-1-2?step=3", details: { device: { dpr: 2 } }, shot: dataUrl(JPEG), shotW: 750, shotH: 1624 });
    expect(r.text).toBe("The Continue button does nothing");
    expect(r.path).toBe("/lesson/ai-1-1/ai-1-1-2");
    expect(r.url).toBe("https://darsiai.org/lesson/ai-1-1/ai-1-1-2?step=3");
    expect(r.details).toEqual({ device: { dpr: 2 } });
    expect(r.shot).toMatchObject({ type: "image/jpeg", ext: "jpg", w: 750, h: 1624 });
    expect(r.shot!.bytes.equals(JPEG)).toBe(true);
  });
  it("accepts a report without a screenshot or page", () => {
    expect(parseReport({ text: "Something broke" })).toMatchObject({ shot: null, url: "", path: "", details: {} });
  });
  it("refuses a report without words, and malformed bodies", () => {
    expect(() => parseReport({ text: " a " })).toThrow();
    expect(() => parseReport(null)).toThrow();
    expect(() => parseReport([{ text: "Something broke" }])).toThrow();
    expect(() => parseReport("Something broke")).toThrow();
  });
  it("trusts the image's own bytes, not its label", () => {
    // A PNG labelled as a JPEG is stored as the PNG it is; text pretending to be an image is refused.
    expect(parseReport({ text: "abc", shot: dataUrl(PNG) }).shot).toMatchObject({ type: "image/png", ext: "png" });
    expect(() => parseReport({ text: "abc", shot: dataUrl(Buffer.from("<svg onload=alert(1)>")) })).toThrow();
    expect(() => parseReport({ text: "abc", shot: "data:image/svg+xml;base64,PHN2Zz4=" })).toThrow();
    expect(() => parseReport({ text: "abc", shot: "https://example.com/a.jpg" })).toThrow();
  });
  it("refuses a screenshot that's too big", () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_SHOT)]);
    expect(() => parseReport({ text: "abc", shot: dataUrl(big) })).toThrow();
  });
  it("ignores silly sizes", () => {
    expect(parseReport({ text: "abc", shot: dataUrl(JPEG), shotW: -5, shotH: "12" }).shot).toMatchObject({ w: null, h: null });
  });
  it("cuts the text to 4,000 characters", () => {
    expect(parseReport({ text: "x".repeat(9000) }).text).toHaveLength(4000);
  });
  it("refuses details that are too big even after cleaning", () => {
    const details = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, "y".repeat(1999)]));
    expect(() => parseReport({ text: "abc", details })).toThrow();
  });
});

describe("redactUrl", () => {
  it("hides query values that may be secrets", () => {
    expect(redactUrl("https://darsiai.org/signup?code=ABCD-EFGH-JKLM&org=1")).toBe("https://darsiai.org/signup?code=%E2%80%A6&org=1");
    expect(redactUrl("https://darsiai.org/__/auth/action?mode=resetPassword&oobCode=xyz&apiKey=k")).toBe("https://darsiai.org/__/auth/action?mode=resetPassword&oobCode=%E2%80%A6&apiKey=%E2%80%A6");
    expect(redactUrl("https://u:p@darsiai.org/me#access_token=abc")).toBe("https://darsiai.org/me#%E2%80%A6");
  });
  it("gives nothing for what isn't a URL", () => {
    expect(redactUrl("not a url")).toBe("");
    expect(redactUrl(42)).toBe("");
  });
});

describe("clean", () => {
  it("keeps plain data and drops the rest", () => {
    expect(clean({ a: 1, b: "x", c: [true, null, { d: Infinity }], f: () => 1, u: undefined, __name__: 1, "bad key!": 2 }))
      .toEqual({ a: 1, b: "x", c: [true, null, { d: null }] });
  });
  it("cuts long strings, long lists and deep nesting", () => {
    expect((clean("z".repeat(5000)) as string).length).toBe(2000);
    expect((clean(Array(100).fill(1)) as unknown[]).length).toBe(60);
    expect(clean({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual({ a: { b: { c: { d: { e: {} } } } } });
  });
});

describe("sniff", () => {
  it("knows JPEG, PNG and WebP", () => {
    expect(sniff(JPEG)).toBe("image/jpeg");
    expect(sniff(PNG)).toBe("image/png");
    expect(sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniff(Buffer.from("GIF89a......"))).toBeNull();
  });
});

describe("limiter", () => {
  it("allows a few reports per address, then waits for the window to pass", () => {
    const over = limiter(), t = 1_000_000;
    for (let i = 0; i < BUG_LIMITS.address.n; i++) expect(over("1.2.3.4", null, t)).toBe(false);
    expect(over("1.2.3.4", null, t)).toBe(true);
    expect(over("5.6.7.8", null, t)).toBe(false); // another address
    expect(over("1.2.3.4", null, t + BUG_LIMITS.address.ms + 1)).toBe(false);
  });
  it("limits an account across addresses", () => {
    const over = limiter(), t = 1_000_000;
    for (let i = 0; i < BUG_LIMITS.account.n; i++) expect(over(`10.0.0.${i}`, "uid1", t)).toBe(false);
    expect(over("10.0.1.1", "uid1", t)).toBe(true);
  });
  it("brakes the whole instance", () => {
    const over = limiter(), t = 1_000_000;
    for (let i = 0; i < BUG_LIMITS.instance.n; i++) over(`10.1.${i >> 8}.${i & 255}`, null, t);
    expect(over("10.9.9.9", null, t)).toBe(true);
  });
  it("never lets one address use up the instance's reports for everyone else", () => {
    const over = limiter(), t = 1_000_000;
    let refused = 0;
    for (let i = 0; i < BUG_LIMITS.instance.n + 5; i++) if (over("6.6.6.6", null, t)) refused++;
    expect(refused).toBe(BUG_LIMITS.instance.n + 5 - BUG_LIMITS.address.n);
    expect(over("5.6.7.8", null, t)).toBe(false); // an honest address right after
    expect(over("5.6.7.9", "uid2", t)).toBe(false); // and a signed-in person
  });
});
