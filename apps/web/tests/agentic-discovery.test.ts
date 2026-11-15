// Agentic Browsing (Lighthouse "agent-discoverability"): /llms.txt and /.well-known/ard.json reach agents as themselves,
// never as the app. llms.txt is seoPage's, written per address (functions/test/seo.test.ts checks its text against
// Lighthouse's llms-txt audit); the ARD manifest is a file, checked here against the ARD v0.91 conformance rules.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pub = (p: string) => readFileSync(resolve(process.cwd(), "public", p), "utf8");
const fb = JSON.parse(readFileSync(resolve(process.cwd(), "../../firebase.json"), "utf8"));
const app = fb.hosting.find((h: { target: string }) => h.target === "app");
const block = (source: string) => Object.fromEntries((app.headers.find((h: { source: string }) => h.source === source)?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]));

describe("llms.txt", () => {
  it("is seoPage's, so each address gets its own: no static file hides the rewrite (Hosting serves files first)", () => {
    expect(existsSync(resolve(process.cwd(), "public", "llms.txt"))).toBe(false);
    expect(app.rewrites).toContainEqual({ source: "/llms.txt", function: { functionId: "seoPage", region: "europe-west1" } });
  });
  it("is never answered with the app by the service worker", () => {
    const config = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(config).toMatch(/navigateFallbackDenylist: \[[^\n]*llms\\\.txt[^\n]*\/\^\\\/\\\.well-known\\\/\//);
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
  it("is served as JSON that any site may read", () => {
    expect(block("/.well-known/ard.json")).toMatchObject({ "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  });
});
