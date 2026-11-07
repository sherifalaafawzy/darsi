import { useState } from "react";
import { Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, USERNAME_DOMAIN } from "../auth/api";
import type { Profile } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { saveJson } from "../account/files";
import { refusalText } from "./refusals";

type Person = Profile & { createdBy?: string | null; suspended?: { reason?: string } | null };

/**
 * On a person's page: their data as a file and deleting their account, for a request from them, a parent or their
 * school (functions/src/account.ts). Platform admins act for anyone but other platform admins, and also suspend an
 * account (abuse); an organization's admins act only for the students and teachers it made.
 */
export function AccountActions({ person, onDeleted, onChanged }: { person: Person; onDeleted: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const { user, role, orgId } = useAuth();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const orgMade = Boolean(person.createdBy) || (person.email ?? "").endsWith(`@${USERNAME_DOMAIN}`);
  const isSuper = role === "superadmin";
  const may = person.uid !== user?.uid && person.role !== "superadmin"
    && (isSuper || (role === "orgAdmin" && !!orgId && person.orgId === orgId && orgMade && (person.role === "student" || person.role === "teacher")));
  if (!may) return null;
  const name = isolate(person.name || person.email || person.uid);
  const run = async (what: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(what); setMsg(null);
    try { await fn(); if (done) setMsg({ ok: true, text: done }); }
    catch (e) { setMsg({ ok: false, text: refusalText(e, t) }); }
    finally { setBusy(""); }
  };
  const suspended = Boolean(person.suspended);
  return (
    <section className="panel stack" aria-labelledby="acc-h">
      <h3 id="acc-h">{t("acc.title")}</h3>
      <p className="muted">{t("acc.hint")}</p>
      {suspended && <p className="notice err" role="status">{t("acc.suspendedNow")}{person.suspended?.reason ? <>{t("common.sep")}<bdi>{person.suspended.reason}</bdi></> : null}</p>}
      <div className="row-gap">
        <Button size="sm" variant="secondary" icon="file" loading={busy === "export"} disabled={!!busy}
          onClick={() => { void run("export", async () => saveJson(`darsi-data-${person.uid}-${new Date().toISOString().slice(0, 10)}.json`, await api.exportAccountData({ uid: person.uid }))); }}>{t("acc.download")}</Button>
        {isSuper && <Button size="sm" variant="secondary" icon="lock" loading={busy === "suspend"} disabled={!!busy}
          onClick={() => { void run("suspend", async () => { await api.setAccountSuspended({ uid: person.uid, suspended: !suspended, reason: reason.trim() || undefined }); onChanged(); }, t(suspended ? "acc.restored" : "acc.suspended")); }}>{t(suspended ? "acc.restore" : "acc.suspend")}</Button>}
        {!open && <Button size="sm" variant="ghost" icon="close" disabled={!!busy} onClick={() => setOpen(true)}>{t("acc.delete")}</Button>}
      </div>
      {isSuper && !suspended && <TextField id="acc-reason" label={t("acc.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />}
      {open && (
        <div className="notice err stack-sm" role="group" aria-labelledby="acc-del-h">
          <strong id="acc-del-h">{t("acc.delete")}</strong>
          <span>{t("acc.deleteBody", { name })}</span>
          <TextField id="acc-word" label={t("me.deleteType", { word: t("me.deleteWord") })} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
          <div className="row-gap">
            <Button size="sm" icon="close" loading={busy === "delete"} disabled={word.trim().toLowerCase() !== t("me.deleteWord").toLowerCase() || !!busy}
              onClick={() => { void run("delete", async () => { await api.deleteAccount({ uid: person.uid }); onDeleted(); }); }}>{t("me.deleteConfirm")}</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setOpen(false); setWord(""); }}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}
