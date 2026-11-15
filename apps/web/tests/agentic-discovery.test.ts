// Agentic Browsing (Lighthouse "agent-discoverability"): /llms.txt and /.well-known/ard.json are real files, served as
// themselves and not as the app. The checks mirror Lighthouse's llms-txt audit and the ARD v0.91 conformance rules.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pub = (p: string) => readFileSync(resolve(process.cwd(), "public", p), "utf8");
const fb = JSON.parse(readFileSync(resolve(process.cwd(), "../../firebase.json"), "utf8"));
const block = (source: string) => Object.fromEntries((fb.hosting.headers.find((h: { source: string }) => h.source === source)?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]));

describe("llms.txt", () => {
  const text = pub("llms.txt");
  it("has an H1, Markdown links and enough text (Lighthouse llms-txt)", () => {
    expect(text).toMatch(/^\s*#\s+.+/m);
    expect(text).toMatch(/\[.+\]\(.+\)/);
    expect(text.length).toBeGreaterThanOrEqual(50);
  });
  it("starts with the title, then a blockquote summary (llmstxt.org)", () => {
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^# Darsi/);
    expect(lines.find((l) => l.trim() && !l.startsWith("#"))).toMatch(/^> /);
  });
  it("links only to darsiai.org", () => {
    for (const [, url] of text.matchAll(/\]\(([^)]+)\)/g)) expect(url).toMatch(/^https:\/\/darsiai\.org\//);
  });
  it("is served as plain text", () => {
    expect(block("/llms.txt")["Content-Type"]).toBe("text/plain; charset=utf-8");
  });
});

describe("ARD manifest", () => {
  const ard = JSON.parse(pub(".well-known/ard.json"));
  it("has entries with a darsiai.org URN, a name, a media type and exactly one of url/data", () => {
    expect(Array.isArray(ard.entries) && ard.entries.length).toBeTruthy();
    for (const e of ard.entries) {
      expect(e.identifier).toMatch(/^urn:air:darsiai\.org(?::[a-zA-Z0-9._:-]+)?:[a-zA-Z0-9._-]+$/);
      expect(typeof e.displayName).toBe("string");
      expect(e.type).toMatch(/^application\/[0-9A-Za-z][0-9A-Za-z!#$&^_.+-]*$/);
      expect(("url" in e) !== ("data" in e)).toBe(true);
      expect(e.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(e.representativeQueries.length).toBeLessThanOrEqual(5);
    }
    expect(ard.collections).toBeUndefined();
  });
  it("is served as JSON", () => {
    expect(block("/.well-known/ard.json")["Content-Type"]).toBe("application/json; charset=utf-8");
  });
});