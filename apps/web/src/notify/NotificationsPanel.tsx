import { useEffect, useMemo, useState } from "react";
import { Switch } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { isStaff } from "../auth/types";
import type { NotifyCats, NotifyPrefs } from "../auth/api";
import { LANGUAGES, useI18n, type MessageKey } from "../i18n";
import { useStore } from "../state/store";
import { disablePush, enablePush, HOURS, permission, prefsFrom, pushOn, pushSupport, savePrefs, type PushSupport, type ServerNotify } from "./push";

const CATS: { key: keyof NotifyCats; label: MessageKey; hint: MessageKey }[] = [
  { key: "reminders", label: "ntf.reminders", hint: "ntf.remindersD" },
  { key: "reviews", label: "ntf.reviews", hint: "ntf.reviewsD" },
  { key: "news", label: "ntf.news", hint: "ntf.newsD" },
  { key: "staff", label: "ntf.staff", hint: "ntf.staffD" },
];
const NOT_HERE: Record<Exclude<PushSupport, "ok">, MessageKey> = { unconfigured: "ntf.unconfigured", unsupported: "ntf.unsupported", "ios-install": "ntf.iosInstall" };

/**
 * Me → Notifications: opt in on this phone, then choose what arrives and when (at most one automatic nudge a day).
 * Guests, and browsers that can't (no VAPID key yet, no push support, iPhone outside the Home Screen, blocked in the
 * site settings), get a short note saying what to do instead.
 */
export function NotificationsPanel() {
  const { t } = useI18n();
  const { user, profile, role, configured, offlineUid } = useAuth();
  if (!configured || (!user && offlineUid)) return null;
  return (
    <section className="panel stack" aria-labelledby="ntf-h">
      <h2 id="ntf-h" className="section-title">{t("ntf.title")}</h2>
      {user ? <Controls uid={user.uid} staff={isStaff(role)} server={(profile as { notify?: ServerNotify } | null)?.notify} /> : <p className="muted">{t("ntf.guest")}</p>}
    </section>
  );
}

type Note = { tone: "ok" | "err" | ""; text: MessageKey };

function Controls({ uid, staff, server }: { uid: string; staff: boolean; server?: ServerNotify }) {
  const { t, lang } = useI18n();
  const { state } = useStore();
  const support = useMemo(pushSupport, []);
  const [perm, setPerm] = useState(permission);
  const [on, setOn] = useState(() => pushOn(uid) && permission() === "granted");
  const [prefs, setPrefs] = useState(() => prefsFrom(server, state.weeklyLessons));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  // The server's copy (users/{uid}.notify) arrives with the profile and replaces the defaults.
  const serverKey = JSON.stringify([server?.hourLocal ?? null, server?.cats ?? null]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPrefs(prefsFrom(server, state.weeklyLessons)); }, [serverKey, state.weeklyLessons]);

  if (support !== "ok") return <p className="notice">{t(NOT_HERE[support])}</p>;
  if (perm === "denied") return <p className="notice">{t("ntf.denied")}</p>;

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      if (next) {
        const p = await enablePush({ ...prefs, lang: lang === "ar" ? "ar" : "en" });
        setPerm(p); setOn(p === "granted");
        setNote(p === "granted" ? { tone: "ok", text: "ntf.onMsg" } : p === "default" ? { tone: "", text: "ntf.dismissed" } : null);
      } else { await disablePush(); setOn(false); }
    } catch { setNote({ tone: "err", text: "ntf.err" }); }
    finally { setBusy(false); }
  };
  const change = async (patch: { hourLocal?: number; cats?: Partial<NotifyCats> }) => {
    const prev = prefs, next: NotifyPrefs = { ...prefs, hourLocal: patch.hourLocal ?? prefs.hourLocal, cats: { ...prefs.cats, ...patch.cats } };
    setPrefs(next); setNote(null);
    try { await savePrefs(next); } catch { setPrefs(prev); setNote({ tone: "err", text: "ntf.err" }); }
  };

  const hourFmt = new Intl.DateTimeFormat(LANGUAGES.find((l) => l.code === lang)?.numerals ?? lang, { hour: "numeric", minute: "2-digit" });
  const hours = HOURS.includes(prefs.hourLocal) ? HOURS : [...HOURS, prefs.hourLocal].sort((a, b) => a - b);
  const cat = (c: (typeof CATS)[number]) => <Switch key={c.key} label={t(c.label)} description={t(c.hint)} checked={prefs.cats[c.key]} onChange={(v) => { void change({ cats: { [c.key]: v } }); }} />;
  return (
    <>
      <Switch label={t("ntf.master")} description={t("ntf.masterD")} checked={on} onChange={(v) => { void toggle(v); }} />
      {on && <>
        {cat(CATS[0])}
        {prefs.cats.reminders && (
          <div className="dr-field">
            <label htmlFor="ntf-hour" className="dr-field-label">{t("ntf.time")}</label>
            <select id="ntf-hour" className="dr-field-input" value={prefs.hourLocal} onChange={(e) => { void change({ hourLocal: Number(e.target.value) }); }}>
              {hours.map((h) => <option key={h} value={h}>{hourFmt.format(new Date(2000, 0, 1, h))}</option>)}
            </select>
          </div>
        )}
        {CATS.slice(1).filter((c) => staff || c.key !== "staff").map(cat)}
      </>}
      {note && <p className={note.tone ? `notice ${note.tone}` : "notice"} role="status">{t(note.text)}</p>}
    </>
  );
}
