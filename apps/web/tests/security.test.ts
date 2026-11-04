// Client sides of the security review's fixes (TECHNICAL.md "Security"): project attachments link only to Darsi's own
// Storage (M8), and Hosting's headers stop framing and keep the Google sign-in popup working (L5).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "darsi-f0685" } }));
const { isEvidenceUrl } = await import("../src/admin/evidence");

describe("project attachments (M8)", () => {
  it("are links to this project's Storage, under submissions/", () => {
    expect(isEvidenceUrl("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Fnone%2Fu1%2Fai-1-1%2Fai-1-1-1-1730000000000-photo.jpg?alt=media&token=abc")).toBe(true);
    expect(isEvidenceUrl("http://127.0.0.1:9199/v0/b/darsi-f0685/o/submissions%2Fnone%2Fu1%2Fx.jpg?alt=media")).toBe(true);
  });
  it("and nothing else: other sites, other buckets, other folders, script links", () => {
    expect(isEvidenceUrl("https://darsi-signin.example/login")).toBe(false);
    expect(isEvidenceUrl("https://firebasestorage.googleapis.com/v0/b/attacker-bucket/o/submissions%2Fx.html?alt=media")).toBe(false);
    expect(isEvidenceUrl("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fcatalog.json")).toBe(false);
    expect(isEvidenceUrl("javascript:alert(1)")).toBe(false);
    expect(isEvidenceUrl("https://user:pw@firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Fx")).toBe(false);
    expect(isEvidenceUrl("http://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Fx")).toBe(false);
    expect(isEvidenceUrl(undefined)).toBe(false);
  });
});

describe("Hosting's headers (L5)", () => {
  const fb = JSON.parse(readFileSync(resolve(process.cwd(), "../../firebase.json"), "utf8"));
  const block = (source: string) => Object.fromEntries(fb.hosting.headers.find((h: { source: string }) => h.source === source).headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  it("forbid framing every page, but not Firebase's own /__/ pages (the sign-in helper frame is one)", () => {
    const pages = block("!/__/**");
    expect(pages["X-Frame-Options"]).toBe("DENY");
    expect(pages["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    // same-origin-allow-popups: the Google sign-in popup can still talk back to the page that opened it.
    expect(pages["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    // The full policy is reported, not enforced, until it has been checked on the live site.
    expect(pages["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    expect(pages["Content-Security-Policy-Report-Only"]).toContain("worker-src 'self' blob:");
  });
  it("keep HTTPS on, for every path", () => {
    expect(block("**")["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
  });
});
