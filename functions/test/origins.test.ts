// Which pages may open the tutor's voice relay (origins.ts, used by relay.ts): exact origins, and "https://*.<domain>"
// for organization sites (TECHNICAL.md "Organization sites"), which matches https subdomains only.
import { describe, expect, it } from "vitest";
import { originAllowed, parseOrigins, siteOrigins } from "../src/origins";

describe("TUTOR_ORIGINS", () => {
  it("reads exact origins and https wildcards, separated by commas or spaces, and ignores other wildcards", () => {
    expect(parseOrigins("https://darsiai.org,https://*.darsiai.org")).toEqual([{ exact: "https://darsiai.org" }, { suffix: ".darsiai.org" }]);
    expect(parseOrigins(" https://darsiai.org  https://*.DarsiAI.org ,http://localhost:4173 ")).toEqual([{ exact: "https://darsiai.org" }, { suffix: ".darsiai.org" }, { exact: "http://localhost:4173" }]);
    expect(parseOrigins("http://*.darsiai.org,https://*,https://*.,*,https://x.*.org,https://*darsiai.org")).toEqual([]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
  });

  it("lets in the exact origins and https subdomains of a wildcard, nothing else", () => {
    const rules = parseOrigins("https://darsiai.org,https://*.darsiai.org,http://localhost:4173");
    for (const ok of ["https://darsiai.org", "https://cis.darsiai.org", "https://www.darsiai.org", "https://a-1.b.darsiai.org", "http://localhost:4173"]) {
      expect(originAllowed(ok, rules), ok).toBe(true);
    }
    for (const no of [undefined, "", "null", "http://cis.darsiai.org", "https://cis.darsiai.org:8443", "https://darsiai.org.evil.com", "https://evildarsiai.org",
      "https://.darsiai.org", "https://-x.darsiai.org", "https://x_y.darsiai.org", "https://CIS.darsiai.org", "https://cis.darsiai.org/", "http://localhost:5173",
      "wss://cis.darsiai.org", "https://cis.darsiai.org.", "https://a..darsiai.org"]) {
      expect(originAllowed(no, rules), String(no)).toBe(false);
    }
  });

  it("allows only Darsi's own site when no wildcard is listed (the default)", () => {
    const rules = parseOrigins("https://darsiai.org");
    expect(originAllowed("https://darsiai.org", rules)).toBe(true);
    expect(originAllowed("https://cis.darsiai.org", rules)).toBe(false);
  });
});

describe("organization addresses outside the wildcard (siteOrigins)", () => {
  it("asks once per address, keeps the answer, and never asks about something that can't be a site", async () => {
    const asked: string[] = [];
    let t = 0;
    const allowed = siteOrigins(async (host) => { asked.push(host); return host === "learn.cis.edu.eg"; }, () => t);
    expect(await allowed("https://learn.cis.edu.eg")).toBe(true);
    expect(await allowed("https://learn.cis.edu.eg")).toBe(true);
    expect(await allowed("https://other.school.org")).toBe(false);
    for (const bad of [undefined, "http://learn.cis.edu.eg", "https://learn.cis.edu.eg:8443", "https://darsiai.org", "https://x.web.app", "https://10.0.0.1", "null"]) {
      expect(await allowed(bad), String(bad)).toBe(false);
    }
    expect(asked).toEqual(["learn.cis.edu.eg", "other.school.org"]);
    // A refusal is kept a minute, an approval five; then asked again.
    t = 61_000;
    await allowed("https://other.school.org");
    await allowed("https://learn.cis.edu.eg");
    expect(asked).toEqual(["learn.cis.edu.eg", "other.school.org", "other.school.org"]);
    t = 301_000;
    await allowed("https://learn.cis.edu.eg");
    expect(asked.at(-1)).toBe("learn.cis.edu.eg");
  });
  it("asks at most 30 times a minute, and refuses when the lookup fails", async () => {
    let n = 0;
    const allowed = siteOrigins(async () => { n++; return true; }, () => 0);
    for (let i = 0; i < 40; i++) await allowed(`https://made-up-${i}.org`);
    expect(n).toBe(30);
    expect(await allowed("https://made-up-99.org")).toBe(false);
    const broken = siteOrigins(async () => { throw new Error("offline"); });
    expect(await broken("https://learn.cis.edu.eg")).toBe(false);
  });
});
