// /super's Requests tab: a platform admin is told when new organization requests can't reach this phone, and turns the
// alerts on in one tap (admin/StaffAlerts.tsx; the push itself is functions/src/notify.ts alertOrgRequest).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({
  on: false, perm: "default" as NotificationPermission, support: "ok" as string, notify: undefined as unknown,
  enable: vi.fn(async () => "granted" as NotificationPermission), save: vi.fn(async () => ({})),
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "boss" }, profile: { notify: m.notify }, role: "superadmin" }) }));
vi.mock("../src/notify/push", async (orig) => ({
  ...(await orig<typeof import("../src/notify/push")>()),
  pushSupport: () => m.support, permission: () => m.perm, pushOn: () => m.on, enablePush: m.enable, savePrefs: m.save,
}));
const { StaffAlerts } = await import("../src/admin/StaffAlerts");
const ui = (lang = "en") => render(<I18nProvider lang={lang}><StaffAlerts /></I18nProvider>);

beforeEach(() => { m.on = false; m.perm = "default"; m.support = "ok"; m.notify = undefined; m.enable.mockClear(); m.save.mockClear(); });

describe("alerts for new organization requests", () => {
  it("off on this phone: says so, and one tap turns them on with Staff alerts", async () => {
    ui();
    expect(screen.getByText(/Notifications are off here/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn on alerts on this phone" }));
    await screen.findByText(/This phone will get a notification/);
    expect(m.enable).toHaveBeenCalledWith(expect.objectContaining({ lang: "en", cats: expect.objectContaining({ staff: true }) }));
  });
  it("on, but Staff alerts off: turns that category on", async () => {
    m.on = true; m.perm = "granted"; m.notify = { on: true, cats: { staff: false } };
    ui();
    fireEvent.click(screen.getByRole("button", { name: "Turn on alerts on this phone" }));
    await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ cats: expect.objectContaining({ staff: true }) })));
    expect(m.enable).not.toHaveBeenCalled();
  });
  it("already on: says nothing", () => {
    m.on = true; m.perm = "granted"; m.notify = { on: true, cats: { staff: true } };
    const { container } = ui();
    expect(container.textContent).toBe("");
  });
  it("blocked, or an iPhone outside the Home Screen: says what to do instead, in Arabic too", () => {
    m.perm = "denied";
    ui();
    expect(screen.getByText(/blocked for Darsi in this browser/)).toBeTruthy();
    m.perm = "default"; m.support = "ios-install";
    ui("ar");
    expect(screen.getByText(/لا يمكن أن تصل طلبات المؤسسات الجديدة/)).toBeTruthy();
  });
});
