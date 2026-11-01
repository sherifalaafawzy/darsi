import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { I18nProvider } from "../../src/i18n";
import en from "../../src/i18n/en.json";
import ar from "../../src/i18n/ar.json";
import { LabMissing, reloadForUpdate } from "../../src/labs/loader";

// A lab chunk that fails to load while online means this copy of Darsi is older than the site (a deploy replaced the
// chunk), not that the lab isn't saved: offer the update, not "connect once".
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
const reload = vi.fn();

beforeEach(() => { reload.mockReset(); vi.stubGlobal("location", { ...location, reload }); });
afterEach(() => { setOnline(true); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "serviceWorker"); });

describe("a lab chunk that fails to load", () => {
  it("online: says Darsi was updated and reloads", async () => {
    setOnline(true);
    render(<I18nProvider lang="en"><LabMissing retry={() => {}} /></I18nProvider>);
    expect(screen.getByText("Darsi was updated. Reload to open this lab.")).toBeTruthy();
    expect(screen.queryByText(/isn.t on your phone yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("offline: says the lab isn't saved and retries", () => {
    setOnline(false);
    const retry = vi.fn();
    render(<I18nProvider lang="en"><LabMissing retry={retry} /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });

  it("takes a waiting new version before reloading", async () => {
    const postMessage = vi.fn(); let onChange: (() => void) | undefined;
    const reg = { update: vi.fn(async () => {}), waiting: { postMessage } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => reg, addEventListener: (_: string, f: () => void) => { onChange = f; } } });
    await reloadForUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    onChange?.();
    expect(reload).toHaveBeenCalled();
  });

  it("has the message in English and Arabic, with no middot", () => {
    expect(en["labs.outdated"]).toBeTruthy();
    expect(ar["labs.outdated"]).toBeTruthy();
    expect(ar["labs.outdated"]).not.toContain("\u00b7");
  });

  it("hosting answers 404 for a missing chunk instead of the app page", () => {
    const fb = JSON.parse(readFileSync(resolve(process.cwd(), "../../firebase.json"), "utf8"));
    const rw = fb.hosting.rewrites.find((r: { destination: string }) => r.destination === "/index.html");
    // Firebase globs (RE2 has no lookahead, so a negated glob): every path except /assets/** and /lib/** gets the app.
    expect(rw.source).toBe("!/@(assets|lib)/**");
  });
});
