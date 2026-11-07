import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, USERNAME_DOMAIN, type AccountRefusal } from "../auth/api";
import { useI18n, type MessageKey } from "../i18n";
import { clearRuns } from "../lesson/engine";
import { useStore } from "../state/store";
import { refusal, saveJson } from "./files";

const REFUSED: Partial<Record<AccountRefusal, MessageKey>> = {
  "recent-login": "me.deleteRecent", renewing: "me.deleteRenewing", "self-org": "me.deleteManaged", "self-staff": "me.deleteStaff",
};

/**
 * Me, signed in: the person's data as a file, and deleting their account (store policies and data-protection laws ask
 * for both). An account the organization made is the organization's to delete, and an admin hands the role over
 * first; the server checks the same (functions/src/account.ts) and also wants a recent sign-in.
 */
export function MyData() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user, profile, role, signOut } = useAuth();
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;
  const orgMade = Boolean((profile as { createdBy?: string } | null)?.createdBy) || (user.email ?? "").endsWith(`@${USERNAME_DOMAIN}`);
  const managed = orgMade && Boolean(profile?.orgId);
  const staff = role === "orgAdmin" || role === "superadmin";
  const fail = (e: unknown) => {
    const why = REFUSED[refusal(e) as AccountRefusal];
    setMsg({ ok: false, text: why ? t(why, { min: 10 }) : String((e as Error).message || t("auth.errGeneric")) });
  };
  const download = async () => {
    setBusy("export"); setMsg(null);
    try { saveJson(`darsi-my-data-${new Date().toISOString().slice(0, 10)}.json`, await api.exportAccountData({})); setMsg({ ok: true, text: t("me.dataReady") }); }
    catch (e) { fail(e); } finally { setBusy(""); }
  };
  const remove = async () => {
    setBusy("delete"); setMsg(null);
    try {
      await api.deleteAccount({});
      // The account is gone: this phone's copy of it goes too, then the session.
      clearRuns(); dispatch({ type: "reset" });
      await signOut().catch(() => {});
      nav("/", { replace: true });
    } catch (e) { fail(e); setBusy(""); }
  };
  const confirmed = word.trim().toLowerCase() === t("me.deleteWord").toLowerCase();
  return (
    <section className="panel stack" aria-labelledby="mydata-h">
      <h2 id="mydata-h" className="section-title">{t("me.data")}</h2>
      <p className="muted">{t("me.dataHint")}</p>
      <div className="row-gap">
        <Button variant="secondary" icon="file" loading={busy === "export"} disabled={!!busy} onClick={() => { void download(); }}>{t("me.dataDownload")}</Button>
        {!managed && !staff && !open && <Button variant="ghost" icon="close" disabled={!!busy} aria-expanded={false} onClick={() => setOpen(true)}>{t("me.delete")}</Button>}
      </div>
      {managed ? <p className="muted small">{t("me.deleteManaged")}</p> : staff ? <p className="muted small">{t("me.deleteStaff")}</p> : open && (
        <div className="notice err stack-sm" role="group" aria-labelledby="mydata-del-h">
          <strong id="mydata-del-h">{t("me.delete")}</strong>
          <span>{t("me.deleteBody")}</span>
          {/* Focus moves here: the button that opened this is gone. */}
          <TextField id="mydata-word" label={t("me.deleteType", { word: t("me.deleteWord") })} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
          <div className="row-gap">
            <Button icon="close" loading={busy === "delete"} disabled={!confirmed || !!busy} onClick={() => { void remove(); }}>{t("me.deleteConfirm")}</Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => { setOpen(false); setWord(""); }}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}
