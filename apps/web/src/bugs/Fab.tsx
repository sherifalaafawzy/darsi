import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { storage } from "../platform";
import { useStore } from "../state/store";
import { notePage, OPEN_REPORT } from "./log";
import type { About, Shot } from "./Report";
import "../styles/bug-fab.css";

type Mod = typeof import("./Report");
const load = () => import("./Report");

/**
 * "Report a problem" on every screen (TECHNICAL.md "Problem reports"). App renders this once, inside the router. On the
 * startup path it is only the button: the first tap loads the report's lazy chunk, which takes a picture of the screen
 * (without this button) before the sheet opens over it. Reports saved offline are sent at startup and when the
 * connection returns; only then is the chunk loaded without a tap, and only if one is waiting.
 */
export function ReportBug() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { user, profile, role, orgId, plan, offlineUid } = useAuth();
  const { state } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ mod: Mod; shot: Shot | null } | null>(null);
  const [note, setNote] = useState(false);
  const opening = useRef(false);
  useEffect(() => notePage(pathname), [pathname]);

  const uid = user?.uid ?? offlineUid ?? null;
  const getToken = useMemo(() => (user ? () => user.getIdToken() : null), [user]);
  const about = useMemo<About>(() => ({
    who: user ? (profile?.name || user.email || user.uid) : offlineUid ? offlineUid : null,
    account: user ? { uid: user.uid, email: user.email, role, orgId, plan: plan?.id ?? null, planUntil: plan ? new Date(plan.until).toISOString() : null }
      : offlineUid ? { uid: offlineUid, offline: true } : null,
    learner: {
      lang: state.lang, onboarded: state.onboarded, guest: state.guest ?? false, audience: state.audience ?? null, stage: state.stage ?? null,
      teach: state.teach ?? null, tracks: state.tracks, track: state.track ?? null, levels: state.levels, weeklyLessons: state.weeklyLessons,
      lessonsDone: Object.keys(state.progress).length, notes: Object.keys(state.notes).length, labsDone: Object.keys(state.labsDone ?? {}).length,
      downloads: Object.keys(state.downloads), dataSaver: state.dataSaver, theme: state.theme, analytics: state.analytics !== false,
      org: state.org ? { id: state.org.id, name: state.org.name } : null,
    },
  }), [user, profile?.name, offlineUid, role, orgId, plan, state]);

  const start = useCallback(async () => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setNote(false);
    try {
      const mod = await load();
      setOpen({ mod, shot: await mod.capture() });
    } catch { setNote(true); opening.current = false; } // the chunk isn't on this phone yet, and it's offline
    finally { setBusy(false); }
  }, []);
  const close = useCallback(() => { setOpen(null); opening.current = false; }, []);
  useEffect(() => {
    const h = () => void start();
    window.addEventListener(OPEN_REPORT, h);
    return () => window.removeEventListener(OPEN_REPORT, h);
  }, [start]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(false), 5000);
    return () => clearTimeout(id);
  }, [note]);

  // Reports that waited for a connection.
  useEffect(() => {
    const send = () => {
      if (!navigator.onLine) return;
      storage.get<unknown[]>("darsi:reports").then((q) => {
        if (Array.isArray(q) && q.length) void load().then((m) => m.flushReports(uid, getToken)).catch(() => {});
      }).catch(() => {});
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [uid, getToken]);

  return (
    <>
      {!open && <button type="button" className="bug-fab" aria-label={t("bug.button")} title={t("bug.button")} aria-haspopup="dialog" aria-busy={busy} onClick={() => void start()}><Icon name="bug" size={22} /></button>}
      {note && <p className="bug-note" role="status">{t("bug.unavailable")}</p>}
      {open && <open.mod.ReportSheet shot={open.shot} about={about} uid={uid} getToken={getToken} onClose={close} />}
    </>
  );
}
