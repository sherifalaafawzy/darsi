import { useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n, type MessageKey } from "../i18n";
import "./strings";
import { enablePush, permission, prefsFrom, pushOn, pushSupport, savePrefs, type PushSupport, type ServerNotify } from "../notify/push";

const NOT_HERE: Record<Exclude<PushSupport, "ok">, MessageKey> = { unconfigured: "ntf.unconfigured", unsupported: "ntf.unsupported", "ios-install": "ntf.iosInstall" };

/**
 * On /super's Requests tab: a platform admin hears about a new organization request only on a phone where notifications
 * are on, with "Staff alerts" on (functions/src/notify.ts alertOrgRequest). Until both are true on this phone, this says
 * so and turns them on in one tap. Says nothing once they are.
 */
export function StaffAlerts() {
  const { t, lang } = useI18n();
  const { user, profile } = useAuth();
  const support = useMemo(pushSupport, []);
  const server = (profile as { notify?: ServerNotify } | null)?.notify;
  const [on, setOn] = useState(() => !!user && pushOn(user.uid) && permission() === "granted");
  const [staffOff, setStaffOff] = useState(() => server?.cats?.staff === false);
  const [perm, setPerm] = useState(permission);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: MessageKey } | null>(null);
  if (!user) return null;
  if (on && !staffOff) return note ? <p className="notice ok" role="status">{t(note.text)}</p> : null;
  if (support !== "ok") return <p className="notice">{t("sal.why")} {t(NOT_HERE[support])}</p>;
  if (perm === "denied") return <p className="notice">{t("sal.why")} {t("ntf.denied")}</p>;

  const turnOn = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    // The weekly goal only matters for reminders; the account's own, or the app's default of 3.
    const prefs = prefsFrom(server, server?.weeklyGoal ?? 3);
    const next = { ...prefs, cats: { ...prefs.cats, staff: true } };
    try {
      if (!on) {
        const p = await enablePush({ ...next, lang });
        setPerm(p);
        if (p !== "granted") { if (p === "default") setNote({ ok: false, text: "sal.dismissed" }); return; }
        setOn(true);
      } else await savePrefs(next);
      setStaffOff(false);
      setNote({ ok: true, text: "sal.done" });
    } catch { setNote({ ok: false, text: "ntf.err" }); } finally { setBusy(false); }
  };
  return (
    <div className="notice stack-sm">
      <p>{t(on ? "sal.staffOff" : "sal.off")}</p>
      {note && !note.ok && <p className="err-text" role="alert">{t(note.text)}</p>}
      <div><Button size="sm" icon="audio" loading={busy} onClick={() => void turnOn()}>{t("sal.turnOn")}</Button></div>
    </div>
  );
}
