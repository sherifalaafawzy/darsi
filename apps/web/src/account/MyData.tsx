import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, USERNAME_DOMAINS, type AccountRefusal } from "../auth/api";
import { useI18n, type MessageKey } from "../i18n";
import { clearDrafts, clearRuns } from "../lesson/engine";
import { unsent, useStore } from "../state/store";
import { isManaged, refusal, saveJson } from "./files";

const REFUSED: Partial<Record<AccountRefusal, MessageKey>> = {
  "recent-login": "me.deleteRecent", renewing: "me.deleteRenewing", "self-org": "me.deleteManaged", "self-staff": "me.deleteStaff",
  // A person's own account, in a session the school's sign-in opened (functions/src/account.ts target()).
  "sso-own-login": "me.ownLogin",
  // One download per account every ten minutes (functions/src/account.ts claimDataExport).
  "data-wait": "me.dataWait",
};
/** The call never got an answer (offline, a timeout): the SDK says "internal" or "unavailable" for those. */
const lost = (e: unknown) => (typeof navigator !== "undefined" && navigator.onLine === false)
  || /unavailable|deadline-exceeded|network/.test(String((e as { code?: unknown }).code ?? ""));

/**
 * Me, signed in: the person's data as a file, and deleting their account (store policies and data-protection laws ask
 * for both). An account the organization made is the organization's to delete, and an admin hands the role over
 * first; the server checks the same (functions/src/account.ts) and also wants a recent sign-in.
 */
export function MyData() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user, profile, role, orgId, signOut } = useAuth();
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;
  // The organization's to delete when it manages the login (`managedBy`, as the server decides), not merely because an
  // admin typed the person's own email in once (`createdBy`): that account is its owner's.
  const managed = isManaged(profile, user.email, orgId ?? profile?.orgId, USERNAME_DOMAINS);
  const staff = role === "orgAdmin" || role === "superadmin";
  const fail = (e: unknown) => {
    const reason = refusal(e), why = Object.prototype.hasOwnProperty.call(REFUSED, reason) ? REFUSED[reason as AccountRefusal] : undefined;
    // Never the server's or the SDK's own words on the page (they are English): a refusal has its sentence, anything
    // else is "no connection" or "try again". The raw answer goes to the console, which "Report a problem" keeps.
    if (!why) console.error("[account]", reason || String((e as { code?: unknown }).code ?? "error"), (e as Error)?.message ?? "");
    setMsg({ ok: false, text: why ? t(why, { min: 10 }) : t(lost(e) ? "auth.errNetwork" : "auth.errGeneric") });
  };
  const download = async () => {
    setBusy("export"); setMsg(null);
    try { saveJson(`darsi-my-data-${new Date().toISOString().slice(0, 10)}.json`, await api.exportAccountData({})); setMsg({ ok: true, text: t("me.dataReady") }); }
    catch (e) { fail(e); } finally { setBusy(""); }
  };
  const remove = async () => {
    setBusy("delete"); setMsg(null);
    const uid = user.uid; // before the session ends
    try {
      await api.deleteAccount({});
      // The account is gone: this phone's copy of it goes too (the project drafts it typed here, before anything else
      // can fail: signing out of an account that no longer exists may not get as far as clearing them), then the session.
      // And its unsent mark (state/store.tsx): there is no account left to send to, and a mark left behind would make
      // the sign-out (or the ended session) below keep the store and say "your work is kept" for a deleted account.
      clearDrafts(uid); unsent.clear(uid, unsent.get(uid)); clearRuns(); dispatch({ type: "reset" });
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
