import { useState } from "react";
import { Button, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/api";
import type { Profile } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { saveJson } from "../account/files";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { managedByOrg, patchMembers } from "./data";
import { k } from "./orgsStrings";

type Person = Profile & { suspended?: boolean | { reason?: string } | null };

/**
 * On a person's page: their data as a file and deleting their account, for a request from them, a parent or their
 * school (functions/src/account.ts). Platform admins act for anyone but other platform admins, and also suspend an
 * account (abuse); an organization's admins act only for the students and teachers it manages: `managedBy` on the
 * profile, else a username login (roles.ts accountActionProblem). Who made the profile (`createdBy`) is not it: an
 * admin who added someone by their own email doesn't own that account.
 * Suspending signs the person out everywhere, so it asks first, with the reason inside the question; restoring is one
 * click (it only gives back what the suspension took).
 */
export function AccountActions({ person, onDeleted, onChanged }: { person: Person; onDeleted: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const { user, role, orgId } = useAuth();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const orgMade = managedByOrg(person, orgId);
  const isSuper = role === "superadmin";
  const may = person.uid !== user?.uid && person.role !== "superadmin"
    && (isSuper || (role === "orgAdmin" && !!orgId && person.orgId === orgId && orgMade && (person.role === "student" || person.role === "teacher")));
  if (!may) return null;
  const name = isolate(person.name || person.email || person.uid);
  const run = async (what: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(what); setMsg(null);
    try { await fn(); if (done) setMsg({ ok: true, text: done }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, t) }); }
    finally { setBusy(""); }
  };
  const suspended = Boolean(person.suspended);
  const why = typeof person.suspended === "object" ? person.suspended?.reason : undefined;
  const setSuspended = (to: boolean) => run("suspend", async () => {
    await api.setAccountSuspended({ uid: person.uid, suspended: to, reason: (to && reason.trim()) || undefined });
    // The organization's member lists already read mark (or unmark) the row at once, without reading every member.
    if (person.orgId) patchMembers(person.orgId, person.uid, { suspended: to });
    setReason(""); onChanged();
  }, t(to ? "acc.suspended" : "acc.restored")).finally(() => setAsking(false));
  return (
    <section className="panel stack" aria-labelledby="acc-h">
      <h3 id="acc-h">{t("acc.title")}</h3>
      <p className="muted">{t("acc.hint")}</p>
      {suspended && <p className="notice err" role="status">{t("acc.suspendedNow")}{why ? <>{t("common.sep")}<bdi>{why}</bdi></> : null}</p>}
      <div className="row-gap">
        <Button size="sm" variant="secondary" icon="file" loading={busy === "export"} disabled={!!busy}
          onClick={() => { void run("export", async () => saveJson(`darsi-data-${person.uid}-${new Date().toISOString().slice(0, 10)}.json`, await api.exportAccountData({ uid: person.uid }))); }}>{t("acc.download")}</Button>
        {isSuper && (suspended
          ? <Button size="sm" variant="secondary" icon="lock" loading={busy === "suspend"} disabled={!!busy} onClick={() => { void setSuspended(false); }}>{t("acc.restore")}</Button>
          // It stays while the question is open (as on the other staff screens): Cancel gives it the focus back.
          : <Button size="sm" variant="secondary" icon="lock" disabled={!!busy && busy !== "suspend"} aria-expanded={asking} onClick={() => { setMsg(null); setAsking(true); }}>{t("acc.suspend")}</Button>)}
        {!open && <Button size="sm" variant="ghost" icon="close" disabled={!!busy} onClick={() => setOpen(true)}>{t("acc.delete")}</Button>}
      </div>
      {isSuper && !suspended && asking && (
        <InlineConfirm danger title={t(k("og.accSuspendTitle"), { name })} body={t(k("og.accSuspendBody"))} confirmLabel={t("acc.suspend")}
          busy={busy === "suspend"} onConfirm={() => { void setSuspended(true); }} onCancel={() => setAsking(false)}>
          <TextField id="acc-reason" label={t("acc.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />
        </InlineConfirm>
      )}
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
