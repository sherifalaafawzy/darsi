// The day an organization's activity log begins (admin/auditLog.ts AUDIT_SINCE) comes from the build
// (VITE_AUDIT_SINCE): a real "YYYY-MM-DD" is used as it is, and anything else falls back to "the day it was introduced".
import { createElement } from "react";
import { render, screen } from "@testing-library/react";

const orgAudit = vi.hoisted(() => vi.fn(async () => ({ entries: [], next: null })));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "boss" }, role: "orgAdmin", orgId: "o1" }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { orgAudit } }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("auditSince keeps a real calendar day and nothing else", async () => {
  const { auditSince } = await import("../src/admin/auditLog");
  expect(auditSince("2026-11-12")).toBe("2026-11-12");
  expect(auditSince(" 2026-11-12 ")).toBe("2026-11-12");
  for (const bad of [undefined, null, "", "2026-13-01", "2026-02-30", "12/11/2026", "2026-11-12T00:00:00Z", 20261112, true]) expect(auditSince(bad)).toBeNull();
});

it("AUDIT_SINCE is the build's VITE_AUDIT_SINCE when set", async () => {
  vi.stubEnv("VITE_AUDIT_SINCE", "2026-11-12");
  vi.resetModules();
  expect((await import("../src/admin/auditLog")).AUDIT_SINCE).toBe("2026-11-12");
});

it("AUDIT_SINCE is null (the wording without a date) when unset or unreadable", async () => {
  vi.stubEnv("VITE_AUDIT_SINCE", "");
  vi.resetModules();
  expect((await import("../src/admin/auditLog")).AUDIT_SINCE).toBeNull();
  vi.stubEnv("VITE_AUDIT_SINCE", "soon");
  vi.resetModules();
  expect((await import("../src/admin/auditLog")).AUDIT_SINCE).toBeNull();
});

it("the organization's log says the day it starts, in the page's language", async () => {
  vi.stubEnv("VITE_AUDIT_SINCE", "2026-11-12");
  vi.resetModules();
  const { I18nProvider } = await import("../src/i18n");
  const { OrgActivity } = await import("../src/admin/OrgActivity");
  const { unmount } = render(createElement(I18nProvider, { lang: "en", children: createElement(OrgActivity, { orgId: "o1" }) }));
  expect(await screen.findByText(/The log starts on November 12, 2026\./)).toBeTruthy();
  unmount();
  render(createElement(I18nProvider, { lang: "ar", children: createElement(OrgActivity, { orgId: "o1" }) }));
  expect((await screen.findByText(/١٢/)).textContent).toMatch(/٢٠٢٦/);
});
