import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Button, EmptyState, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/api";
import type { Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { useMyOrgRequests, useOrg } from "../admin/data";
import { useOrgText } from "../admin/SuperAdmin";

const ORG_TYPES = ["school", "university", "ministry", "ngo"] as const;

/** Callable errors carry codes like "functions/not-found"; map the ones people can act on to their language. */
function errText(e: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const code = String((e as { code?: string }).code ?? "");
  return code.endsWith("not-found") ? t("org.errCode")
    : code.endsWith("already-exists") ? t("org.errPending")
    : code.endsWith("unavailable") || code.includes("network") ? t("auth.errNetwork")
    : (e as Error).message || t("auth.errGeneric");
}

/** /org — join an organization with an invite code, ask to register one, or see the one you belong to. */
export function OrgScreen() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user, role, orgId, refreshClaims } = useAuth();
  const { data: org } = useOrg(orgId);
  const { data: requests = [] } = useMyOrgRequests(user && !orgId ? user.uid : undefined);
  const ot = useOrgText();
  const [joined, setJoined] = useState("");

  // An approved request sets the claims server-side; refresh the token once so the member view appears.
  const approvedId = !orgId ? requests.find((r) => r.status === "active")?.id : undefined;
  useEffect(() => {
    if (approvedId) refreshClaims().catch(() => {});
    // refreshClaims changes identity on every claims update; depending on it would refresh in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedId]);

  if (!user) return (
    <>
      <AppBar title={t("org.title")} />
      <main className="screen narrow"><EmptyState icon="profile" title={t("org.signInFirst")} action={<Button onClick={() => nav("/signin")}>{t("auth.signIn")}</Button>} /></main>
    </>
  );

  const latest = [...requests].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const pending = latest.find((r) => r.status === "pending");
  const rejected = !pending ? latest.find((r) => r.status === "rejected") : undefined;

  return (
    <>
      <AppBar title={t("org.title")} />
      <main className="screen narrow stack-lg">
        {orgId ? (
          <section className="panel stack">
            {joined && <p className="notice ok" role="status">{joined}</p>}
            <h3><bdi>{org?.name ?? "…"}</bdi></h3>
            {org && <p>{t("org.member", { role: t(`role.${role}` as "role.student"), org: isolate(org.name) })}</p>}
            {org && <p className="muted">{ot.type(org)}{t("common.sep")}<bdi>{ot.place(org)}</bdi></p>}
            <div className="row-gap">
              {role === "orgAdmin" && <Button icon="settings" onClick={() => nav("/admin")}>{t("org.openAdmin")}</Button>}
              {(role === "teacher" || role === "orgAdmin") && <Button variant={role === "teacher" ? "primary" : "secondary"} icon="profile" onClick={() => nav("/teach")}>{t("org.openTeach")}</Button>}
              {role === "student" && <Button icon="learn" onClick={() => nav("/learn")}>{t("lesson.home")}</Button>}
            </div>
          </section>
        ) : role === "superadmin" ? (
          <section className="panel stack">
            <p>{t("org.super")}</p>
            <div className="row-gap"><Button icon="settings" onClick={() => nav("/super")}>{t("org.openSuper")}</Button></div>
          </section>
        ) : (
          <>
            {pending && <p className="notice" role="status">{t("org.pending", { org: isolate(pending.name) })}</p>}
            {rejected && (
              <div className="notice err stack-sm" role="status">
                <span>{t("org.rejected", { org: isolate(rejected.name) })}</span>
                {rejected.reviewNote && <span dir="auto">{t("org.reviewNote", { note: rejected.reviewNote })}</span>}
              </div>
            )}
            <JoinForm onJoined={(r) => setJoined(t("org.joined", { org: isolate(r.orgName), role: t(`role.${r.role}` as "role.student") }))} />
            {!pending && <RequestOrg />}
          </>
        )}
      </main>
    </>
  );
}

function JoinForm({ onJoined }: { onJoined: (r: { orgName: string; role: Role }) => void }) {
  const { t } = useI18n();
  const { refreshClaims } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api.joinOrg({ code: code.trim() });
      onJoined(r);
      await refreshClaims();
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  return (
    <section className="panel">
      <form className="stack" onSubmit={submit}>
        <h3>{t("org.join")}</h3>
        <TextField id="org-code" label={t("org.code")} hint={t("org.codeHint")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required error={err || undefined} />
        <div className="row-gap"><Button type="submit" loading={busy} disabled={code.trim().length < 4}>{t("org.joinBtn")}</Button></div>
      </form>
    </section>
  );
}

/** Register an organization. Opened by /org?request=1 (from sign-up) or the button; a super-admin reviews it. */
function RequestOrg() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const open = params.get("request") === "1";
  const [f, setF] = useState({ name: "", type: "school", country: "", city: "", size: "", contact: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (on: boolean) => setParams(on ? { request: "1" } : {}, { replace: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api.requestOrg({ name: f.name.trim(), type: f.type, country: f.country.trim(), city: f.city.trim(), size: Number(f.size) || undefined, contact: f.contact.trim() || undefined, reason: f.reason.trim() || undefined });
      toggle(false); // the live request list now shows "being reviewed" and hides this section
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };

  return (
    <section className="panel stack">
      <h3>{t("org.request")}</h3>
      <p className="muted">{t("org.requestBody")}</p>
      {!open ? <div className="row-gap"><Button variant="secondary" icon="edit" onClick={() => toggle(true)}>{t("org.request")}</Button></div> : (
        <form className="stack" onSubmit={submit}>
          <TextField id="org-name" label={t("org.name")} value={f.name} onChange={set("name")} required minLength={3} maxLength={120} autoComplete="organization" />
          <div className="dr-field">
            <label htmlFor="org-type" className="dr-field-label">{t("org.type")}</label>
            <select id="org-type" className="dr-field-input" value={f.type} onChange={set("type")}>
              {ORG_TYPES.map((ty) => <option key={ty} value={ty}>{t(`type.${ty}`)}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <TextField id="org-country" label={t("org.country")} value={f.country} onChange={set("country")} maxLength={80} autoComplete="country-name" />
            <TextField id="org-city" label={t("org.city")} value={f.city} onChange={set("city")} maxLength={80} autoComplete="address-level2" />
            <TextField id="org-size" label={t("org.size")} type="number" inputMode="numeric" min={1} value={f.size} onChange={set("size")} />
            <TextField id="org-contact" label={t("org.contact")} value={f.contact} onChange={set("contact")} maxLength={120} autoComplete="tel" />
          </div>
          <div className="dr-field">
            <label htmlFor="org-reason" className="dr-field-label">{t("org.reason")}</label>
            <textarea id="org-reason" className="dr-field-input" rows={3} dir="auto" maxLength={1000} value={f.reason} onChange={set("reason")} />
          </div>
          {err && <p className="notice err" role="alert">{err}</p>}
          <div className="row-gap">
            <Button type="submit" loading={busy} disabled={f.name.trim().length < 3}>{t("org.send")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => toggle(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
