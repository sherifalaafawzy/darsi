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
  // Two sites since school sign-in: the app ("app") and login.darsiai.org ("login", the provider's callback only).
  type Header = { key: string; value: string };
  type Site = { target: string; public: string; rewrites: { source: string; function?: { functionId: string }; destination?: string }[]; headers: { source: string; headers: Header[] }[] };
  const site = (target: string) => (fb.hosting as Site[]).find((h) => h.target === target)!;
  const block = (source: string, target = "app") => Object.fromEntries(site(target).headers.find((h) => h.source === source)!.headers.map((h) => [h.key, h.value]));
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
  it("send /api/sso/** to ssoEdge, before the app's own fallback catches it", () => {
    const rw = site("app").rewrites;
    const sso = rw.findIndex((r) => r.source === "/api/sso/**" && r.function?.functionId === "ssoEdge");
    expect(sso).toBeGreaterThanOrEqual(0);
    expect(sso).toBeLessThan(rw.findIndex((r) => r.destination === "/app.html"));
  });
  it("the sign-in callback site serves nothing but the callback: no service worker, no cache, no framing, no referrer", () => {
    const login = site("login");
    expect(login.public).not.toBe(site("app").public);
    expect(login.rewrites).toEqual([{ source: "**", function: { functionId: "ssoCallback", region: "europe-west1" } }]);
    const h = block("**", "login");
    expect(h).toMatchObject({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(h["Strict-Transport-Security"]).toMatch(/includeSubDomains$/);
  });
});
