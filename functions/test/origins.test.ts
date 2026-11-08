// Which pages may open the tutor's voice relay (origins.ts, used by relay.ts): exact origins, and "https://*.<domain>"
// for organization sites (TECHNICAL.md "Organization sites"), which matches https subdomains only.
import { describe, expect, it } from "vitest";
import { originAllowed, parseOrigins } from "../src/origins";

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
