/**
 * An organization's own web address (TECHNICAL.md "Organization sites (custom web addresses)"), on a platform admin's
 * org page (/super/orgs/:id): the host, such as cis.darsiai.org, and whether Darsi's identity shows there. Saving goes
 * through setOrgSite, which keeps one organization per host and publishes content/sites.json; phones on that address
 * see the change within a minute. The panel also lists what a new address still needs outside the app.
 */
import { useEffect, useState } from "react";
import { Button, Switch, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import type { Org } from "../auth/types";
import { checkSiteHost, type SiteProblem } from "../content/sites";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { refusalText } from "./refusals";
import "./strings";

type Saved = { host: string; darsi: boolean } | null;
const PROBLEM: Record<SiteProblem, MessageKey> = { "site-host": "site.rf.host", "site-reserved": "site.rf.reserved", "site-taken": "site.rf.taken" };
/** What an admin may paste, as a host: "https://CIS.darsiai.org/learn" is "cis.darsiai.org". */
export const typedHost = (v: string) => v.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");

export function OrgSitePanel({ org, onSaved }: { org: Org; /** Reads the organization again (staff screens read once). */ onSaved?: () => void }) {
  const { t } = useI18n();
  const site = org.site?.host ? { host: org.site.host, darsi: org.site.darsi !== false } : null;
  // What is saved now: the org as read, then what this panel saved, until the org is read again.
  const [saved, setSaved] = useState<Saved>(site);
  const [host, setHost] = useState(site?.host ?? "");
  const [darsi, setDarsi] = useState(site?.darsi ?? true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setSaved(site); setHost(site?.host ?? ""); setDarsi(site?.darsi ?? true); }, [site?.host, site?.darsi]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = typedHost(host);
  const changed = typed !== (saved?.host ?? "") || (Boolean(typed) && darsi !== (saved?.darsi ?? true));

  const save = async (next: string) => {
    const checked = checkSiteHost(next);
    if ("problem" in checked) return setMsg({ ok: false, text: t(PROBLEM[checked.problem]) });
    setBusy(true); setMsg(null);
    try {
      const r = await api.setOrgSite({ orgId: org.id, host: checked.host, darsi });
      setSaved(r.site); setHost(r.site?.host ?? ""); setConfirm(false);
      setMsg({ ok: true, text: t(r.site ? "site.saved" : "site.removed") });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: refusalText(e, t) });
    } finally { setBusy(false); }
  };

  return (
    <section className="panel stack" aria-labelledby="site-h">
      <h3 id="site-h">{t("site.title")}</h3>
      <p className="muted small">{t("site.hint")}</p>
      <p className="small">
        {saved
          ? <>{t("site.current", { host: isolate(saved.host) })} <a href={`https://${saved.host}`} target="_blank" rel="noreferrer noopener" dir="ltr">{t("site.open")}</a></>
          : t("site.none")}
      </p>
      <TextField label={t("site.host")} hint={t("site.hostHint")} value={host} dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="school.darsiai.org" maxLength={260} onChange={(e) => { setHost(e.target.value); setMsg(null); }} />
      <Switch label={t("site.darsi")} description={t(darsi ? "site.darsiOn" : "site.darsiOff")} checked={darsi} onChange={setDarsi} />
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}
      <div className="row-gap">
        <Button onClick={() => { void save(typed); }} loading={busy} disabled={!changed || !typed}>{busy ? t("site.saving") : t("site.save")}</Button>
        {saved && !confirm && <Button variant="ghost" icon="close" onClick={() => setConfirm(true)} disabled={busy}>{t("site.remove")}</Button>}
      </div>
      {saved && confirm && (
        <div className="notice stack-sm" role="group" aria-label={t("site.remove")}>
          <p>{t("site.removeConfirm", { host: isolate(saved.host) })}</p>
          <div className="row-gap">
            <Button variant="secondary" onClick={() => { void save(""); }} loading={busy}>{t("site.removeYes")}</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
      <details>
        <summary className="earlier-summary">{t("site.stepsTitle")}</summary>
        <ol className="muted small">
          <li>{t("site.step1")}</li>
          <li>{t("site.step2")}</li>
          <li>{t("site.step3")}</li>
          <li>{t("site.step4")}</li>
        </ol>
        <p className="muted small">{t("site.script")}</p>
      </details>
    </section>
  );
}
