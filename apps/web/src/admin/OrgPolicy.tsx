import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Switch, TextField } from "@darsi/design-system";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { api, type CodeLimits, type CodeState, type JoinPolicy } from "../auth/api";
import { isolate, useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { LoadState, useRead } from "../staff/LoadState";
import { useLeaveGuard } from "../staff/useLeaveGuard";
import { forgetMembers } from "./data";
import { k, type GovKey } from "./governanceStrings";
import { reasonOf } from "./refusals";
import { latinDigits } from "./typedNumber";
import { useTabActive } from "./Tabs";
import "./strings";

/**
 * An organization's join rules and the people it removed, for its admins (and platform admins).
 * - "Who can join with a code": a confirmed email, the email domains let in, and for each of the two codes a last day
 *   and a number of uses. Read once from orgs/{orgId}/private/invites (the codes' limits and uses are copied there for
 *   this screen); saved through setJoinPolicy, which checks everything again and answers what is now stored. Only what
 *   changed is sent: a limit left as it was is never sent again (an expiry already past would refuse the whole save).
 * - "People who were removed" (private/removed): neither their code nor the school's own sign-in lets them in until
 *   an admin lets them back. "Let back in" does both halves: manageSso allowBack for the school's sign-in (an
 *   organization's own admin can't open a removed person's page, so this list is their only place for it), then
 *   readmitMember for the codes. An account the school's sign-in made, or a login the organization manages, goes
 *   back in as a student; anyone else (a person's own account, also one an admin made with the person's own email)
 *   is only allowed to join again with a code. The row's result says which.
 * Unsaved changes are guarded (staff/useLeaveGuard): a tap on a link, a tab or Back asks first, and "Leave without
 * saving" drops them. The screens mount this in a tab panel that stays mounted when another tab shows (admin/Tabs):
 * left there with changes it would hold every later tap and ask where nobody can see, so it guards only while its
 * tab is the open one, and what was dropped is dropped for good.
 * A new code (the Invite tab's "New code", regenerateInviteCode) starts on the server with no expiry, no limit and no
 * uses. The screen that made it says so (`renewed`), and the form shows exactly that for the code, with no read:
 * left as it was read, it would go on showing the old code's last day and limit as if they still applied.
 * Read again when the screen asks (`refresh`: the page's Refresh, or people removed on another tab of the same page):
 * the list of removed people and the codes' uses are then the server's, and what is typed and not saved stays typed.
 */
const ROLES = ["teacher", "student"] as const;
type CodeRole = (typeof ROLES)[number];
/** The server's own checks (functions/src/membersCore.ts joinPolicyChange), so a typing mistake is said at the field. */
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
const MAX_DOMAINS = 20, MAX_USES = 1_000_000;

interface Form { verified: boolean; domains: string[]; teacher: { day: string; max: string }; student: { day: string; max: string } }
interface Codes { teacher: CodeState & { has: boolean }; student: CodeState & { has: boolean } }
interface Gone { uid: string; at: number; name: string }

const pad = (n: number) => String(n).padStart(2, "0");
/** A stored expiry as the day the date field shows, on this device's clock ("" for none). */
const dayOf = (ms: number | null) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** The last millisecond of a day typed in the date field: the code works through that whole day. */
const endOfDay = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const formOf = (policy: JoinPolicy, codes: Record<CodeRole, CodeState>): Form => ({
  verified: policy.requireVerifiedEmail, domains: policy.allowedDomains,
  teacher: { day: dayOf(codes.teacher.expiresAt), max: codes.teacher.maxUses ? String(codes.teacher.maxUses) : "" },
  student: { day: dayOf(codes.student.expiresAt), max: codes.student.maxUses ? String(codes.student.maxUses) : "" },
});

async function load(orgId: string): Promise<{ policy: JoinPolicy; codes: Codes; gone: Gone[] }> {
  const [inv, rem] = await Promise.all([getDoc(doc(db, "orgs", orgId, "private", "invites")), getDoc(doc(db, "orgs", orgId, "private", "removed"))]);
  const d = (inv.data() ?? {}) as { teacher?: unknown; student?: unknown; policy?: { requireVerifiedEmail?: unknown; allowedDomains?: unknown }; limits?: Partial<Record<CodeRole, { expiresAt?: unknown; maxUses?: unknown }>>; uses?: Partial<Record<CodeRole, unknown>> };
  const has = (v: unknown) => typeof v === "string" && !!v;
  let code = (r: CodeRole): Codes[CodeRole] => ({ has: has(d[r]), expiresAt: num(d.limits?.[r]?.expiresAt), maxUses: num(d.limits?.[r]?.maxUses), uses: num(d.uses?.[r]) ?? 0 });
  // An organization from before 2026-11 that scripts/migrate-invites.mjs hasn't moved yet keeps its codes on the org
  // document, and nothing about their limits or uses in private/invites. The codes still work (joinOrg and
  // setJoinPolicy read either place), so the form offers their limits too: setJoinPolicy with only the organization
  // reads the codes' real limits and uses (and writes nothing). Two reads more, for such an organization only.
  if (!has(d.teacher) && !has(d.student)) {
    const old = (await getDoc(doc(db, "orgs", orgId))).get("inviteCodes") as Partial<Record<CodeRole, unknown>> | undefined;
    if (has(old?.teacher) || has(old?.student)) {
      const now = await api.setJoinPolicy({ orgId });
      code = (r) => ({ ...now.codes[r], has: has(old?.[r]) });
    }
  }
  const uids = ((rem.data() ?? {}) as { uids?: Record<string, { at?: unknown; name?: unknown }> }).uids ?? {};
  return {
    policy: { requireVerifiedEmail: d.policy?.requireVerifiedEmail === true, allowedDomains: Array.isArray(d.policy?.allowedDomains) ? d.policy.allowedDomains.filter((x): x is string => typeof x === "string" && !!x) : [] },
    codes: { teacher: code("teacher"), student: code("student") },
    gone: Object.entries(uids).map(([uid, v]) => ({ uid, at: num(v?.at) ?? 0, name: typeof v?.name === "string" ? v.name : "" })).sort((a, b) => b.at - a.at),
  };
}

/** A code that was just replaced by a new one: which, and a count that goes up each time (the same code twice is two). */
export interface RenewedCode { role: CodeRole; n: number }

export function OrgPolicy({ orgId, renewed, refresh }: {
  orgId: string;
  /** The Invite tab made a new code since this was read. */
  renewed?: RenewedCode | null;
  /** A count the screen raises to have the rules and the removed people read again (0 or none: only the first read). */
  refresh?: number;
}) {
  const q = useRead(() => load(orgId), [orgId]);
  // One more one-shot read each time the count goes up (never for the value it was mounted with: that read is the
  // first one). useRead keeps what is shown until the new answer is there.
  const asked = useRef(refresh ?? 0);
  const { reload } = q;
  // Such a read is out, not answered yet.
  const out = useRef(false);
  useEffect(() => { out.current = false; }, [q.data, q.error]);
  useEffect(() => {
    const n = refresh ?? 0;
    if (n === asked.current) return;
    asked.current = n;
    out.current = true;
    reload();
  }, [refresh, reload]);
  // A code made new while that read is out: its answer may be from before the new code, and landing after it would put
  // the old code's last day and limit back on the form as if they applied. Asked again instead (useRead drops the
  // earlier answer), so what lands was read after the new code.
  useEffect(() => { if (renewed && out.current) reload(); }, [renewed?.role, renewed?.n, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keyed by the organization: another one (a platform admin going from one to the next) starts its own form.
  return <LoadState q={q}>{(data) => <Loaded key={orgId} orgId={orgId} start={data} renewed={renewed ?? null} />}</LoadState>;
}

function Loaded({ orgId, start, renewed }: { orgId: string; start: { policy: JoinPolicy; codes: Codes; gone: Gone[] }; renewed: RenewedCode | null }) {
  const { t, locale } = useI18n();
  const id = useId();
  const [codes, setCodes] = useState(start.codes);
  const [base, setBase] = useState(() => formOf(start.policy, start.codes));
  const [form, setForm] = useState(base);
  // The codes made new since the form was read: said at the code until the rules are next saved.
  const [fresh, setFresh] = useState<Partial<Record<CodeRole, boolean>>>({});
  // What the server did to the new code, done to the form too (also for a form that was still being read when the
  // code was made: what it read may be the old code's). A limit the admin had typed and not saved stays typed: saved,
  // it goes onto the new code. One left as it was read was the old code's, and goes.
  useEffect(() => {
    if (!renewed) return;
    const r = renewed.role, was = base[r], typed = form[r];
    setCodes((c) => ({ ...c, [r]: { has: true, expiresAt: null, maxUses: null, uses: 0 } }));
    setBase((b) => ({ ...b, [r]: { day: "", max: "" } }));
    setForm((f) => ({ ...f, [r]: { day: typed.day !== was.day ? typed.day : "", max: typed.max !== was.max ? typed.max : "" } }));
    setFresh((x) => ({ ...x, [r]: true }));
  }, [renewed?.role, renewed?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const [domain, setDomain] = useState("");
  const [domainErr, setDomainErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(base), [form, base]);
  // Read again (the screen's Refresh): the codes and what is stored are the new answer's. A field the admin changed
  // and hasn't saved stays as typed (Save still sends only what differs from what is stored now); every other field
  // shows what was read. The "new code" notes go: what is shown for a code is now what the server holds for it.
  const read = useRef(start);
  useEffect(() => {
    if (read.current === start) return;
    read.current = start;
    const now = formOf(start.policy, start.codes), was = base, typed = form;
    const keep = (r: CodeRole) => ({ day: typed[r].day !== was[r].day ? typed[r].day : now[r].day, max: typed[r].max !== was[r].max ? typed[r].max : now[r].max });
    setCodes(start.codes);
    setBase(now);
    setForm({
      verified: typed.verified !== was.verified ? typed.verified : now.verified,
      domains: JSON.stringify(typed.domains) !== JSON.stringify(was.domains) ? typed.domains : now.domains,
      teacher: keep("teacher"), student: keep("student"),
    });
    setFresh({});
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = useTabActive();
  const guard = useLeaveGuard(dirty && active);
  const leave = () => { guard.leave(); setForm(base); setMsg(null); };
  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };
  const setCode = (r: CodeRole, patch: Partial<Form[CodeRole]>) => set(r === "teacher" ? { teacher: { ...form.teacher, ...patch } } : { student: { ...form.student, ...patch } });

  const addDomain = () => {
    const d = domain.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (d.length > 253 || !DOMAIN.test(d)) { setDomainErr(t(k("gv.pol.domainBad"))); return; }
    if (!form.domains.includes(d) && form.domains.length >= MAX_DOMAINS) { setDomainErr(t(k("gv.pol.domainMax"))); return; }
    if (!form.domains.includes(d)) set({ domains: [...form.domains, d] });
    setDomain(""); setDomainErr(null);
  };

  // A changed limit must be one the server takes: a day not yet over, a whole number of uses. An unchanged one isn't sent.
  const problems = Object.fromEntries(ROLES.map((r) => {
    const f = form[r], b = base[r];
    return [r, {
      day: f.day !== b.day && f.day && !(endOfDay(f.day) > Date.now()) ? t(k("gv.pol.expiryPast")) : undefined,
      max: f.max !== b.max && f.max && !(/^\d+$/.test(f.max) && Number(f.max) >= 1 && Number(f.max) <= MAX_USES) ? t(k("gv.pol.maxUsesBad")) : undefined,
    }];
  })) as Record<CodeRole, { day?: string; max?: string }>;
  const invalid = ROLES.some((r) => problems[r].day || problems[r].max);

  const save = async () => {
    if (!dirty || invalid || busy) return;
    const limits: Partial<Record<CodeRole, CodeLimits>> = {};
    for (const r of ROLES) {
      const lim: CodeLimits = {};
      if (form[r].day !== base[r].day) lim.expiresAt = form[r].day ? endOfDay(form[r].day) : null;
      if (form[r].max !== base[r].max) lim.maxUses = form[r].max ? Number(form[r].max) : null;
      if (Object.keys(lim).length) limits[r] = lim;
    }
    setBusy(true); setMsg(null);
    try {
      const got = await api.setJoinPolicy({
        orgId,
        ...(form.verified !== base.verified ? { requireVerifiedEmail: form.verified } : {}),
        ...(JSON.stringify(form.domains) !== JSON.stringify(base.domains) ? { allowedDomains: form.domains } : {}),
        ...(Object.keys(limits).length ? { codes: limits } : {}),
      });
      // What the server stored (domains cleaned and merged), so the form shows exactly what now applies.
      const now = formOf(got.policy, got.codes);
      setBase(now); setForm(now);
      setCodes((c) => ({ teacher: { ...got.codes.teacher, has: c.teacher.has }, student: { ...got.codes.student, has: c.student.has } }));
      setFresh({});
      setMsg({ ok: true, text: t(k("gv.pol.saved")) });
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); }
  };

  const day = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const today = dayOf(Date.now());
  return (
    <>
      <section className="panel stack" aria-labelledby={`${id}-h`}>
        <h3 id={`${id}-h`}>{t(k("gv.pol.title"))}</h3>
        <p className="muted small">{t(k("gv.pol.intro"))}</p>
        {guard.asking && <InlineConfirm danger title={t(k("gv.leave.title"))} body={t(k("gv.leave.body"))} confirmLabel={t(k("gv.leave.go"))} cancelLabel={t(k("gv.leave.stay"))} onConfirm={leave} onCancel={guard.stay} />}

        <Switch label={t(k("gv.pol.verified"))} description={t(k("gv.pol.verifiedHint"))} checked={form.verified} onChange={(verified) => set({ verified })} />

        <div className="stack-sm" role="group" aria-labelledby={`${id}-d`}>
          <strong id={`${id}-d`}>{t(k("gv.pol.domains"))}</strong>
          <span className="muted small">{t(k("gv.pol.domainsHint"))}</span>
          {form.domains.length ? (
            <ul className="icon-list">{form.domains.map((d) => (
              <li key={d} className="row-gap">
                <code dir="ltr">{d}</code>
                <Button size="sm" variant="ghost" icon="cross" iconOnly onClick={() => set({ domains: form.domains.filter((x) => x !== d) })}>{t(k("gv.pol.domainRemove"), { domain: isolate(d) })}</Button>
              </li>
            ))}</ul>
          ) : <span className="muted small">{t(k("gv.pol.noDomains"))}</span>}
          {form.domains.length > 0 && !form.verified && <p className="notice">{t(k("gv.pol.domainsTip"))}</p>}
          <div className="form-grid">
            <TextField label={t(k("gv.pol.domainAdd"))} dir="ltr" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="school.edu" maxLength={253} value={domain} error={domainErr ?? undefined}
              onChange={(e) => { setDomain(e.target.value); setDomainErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }} />
            <Button size="sm" variant="secondary" disabled={!domain.trim()} onClick={addDomain}>{t(k("gv.pol.add"))}</Button>
          </div>
        </div>

        {ROLES.map((r) => {
          const name = t(k(r === "teacher" ? "gv.pol.teacherCode" : "gv.pol.studentCode")), c = codes[r];
          return (
            <div key={r} className="stack-sm" role="group" aria-labelledby={`${id}-${r}`}>
              <strong id={`${id}-${r}`}>{name}</strong>
              {c.has ? (
                <>
                  <span className="muted small">
                    {t(k("gv.pol.used"), { n: c.uses })}
                    {c.expiresAt !== null && c.expiresAt <= Date.now() && <> <span className="pill">{t(k("gv.pol.expired"))}</span></>}
                  </span>
                  {fresh[r] && <p className="notice" role="status">{t(k("gv.pol.renewed"))}</p>}
                  <div className="form-grid">
                    <TextField label={t(k("gv.pol.expires"))} hint={t(k("gv.pol.expiresHint"))} error={problems[r].day} type="date" dir="ltr" min={today} value={form[r].day} onChange={(e) => setCode(r, { day: e.target.value })} />
                    <TextField label={t(k("gv.pol.maxUses"))} hint={t(k("gv.pol.maxUsesHint"))} error={problems[r].max} inputMode="numeric" dir="ltr" maxLength={7} value={form[r].max} onChange={(e) => setCode(r, { max: latinDigits(e.target.value).trim() })} />
                  </div>
                </>
              ) : <span className="muted small">{t(k("gv.pol.noCode"))}</span>}
            </div>
          );
        })}

        {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <div className="row-gap">
          <Button loading={busy} disabled={!dirty || invalid} onClick={() => void save()}>{t(k("gv.pol.save"))}</Button>
          {dirty && <span className="muted small" role="status">{t(k("gv.unsaved"))}</span>}
        </div>
      </section>
      <Removed orgId={orgId} start={start.gone} day={day} />
    </>
  );
}

/** Why the school's sign-in couldn't be let back (manageSso allowBack), where the shared words say nothing: the person stays on the list. */
const BACK_SAID: Record<string, GovKey> = { "sso-other-org": "gv.pol.back.otherOrg", "sso-staff": "gv.pol.back.staff", "sso-org-inactive": "gv.pol.back.orgInactive" };

function Removed({ orgId, start, day }: { orgId: string; start: Gone[]; day: Intl.DateTimeFormat }) {
  const { t } = useI18n();
  const id = useId();
  const [list, setList] = useState(start);
  // Read again (the page's Refresh, people removed on another tab): the list is the new one. Someone being let back
  // in right now stays in hand: the row's own answer takes them off the list either way.
  const read = useRef(start);
  useEffect(() => { if (read.current !== start) { read.current = start; setList(start); } }, [start]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const readmit = async (p: Gone) => {
    if (busy) return;
    setBusy(p.uid); setMsg(null);
    const name = isolate(p.name || t(k("gv.pol.noName")));
    try {
      // The school's sign-in first. The list can't know who has a school identity (no client reads them), so it asks
      // for everyone: someone with nothing removed there is answered `allowed: false`, and nothing was changed. A
      // refusal (the person is in another organization now, the organization isn't active) stops here, before the
      // codes: taken off the list with the school's sign-in still shut, the person would have no row left to fix it from.
      // (A server from before 2026-11-11 refused that case as "no-account": the same answer.)
      const r = await api.manageSso({ action: "allowBack", orgId, uid: p.uid })
        .catch((e: unknown) => { if (reasonOf(e) === "no-account") return { allowed: false } as Record<string, unknown>; throw e; });
      const allowed = r.allowed === true, rejoined = r.rejoined === true;
      // A member again: the member lists already read have no row for them.
      if (rejoined) forgetMembers(orgId);
      // Then the codes. allowBack took the person off the removed list itself when it let a sign-in back, so for them
      // this is only a second look (nothing left to clear): not worth failing what is already done.
      if (allowed) await api.readmitMember({ orgId, uid: p.uid }).catch(() => {});
      else await api.readmitMember({ orgId, uid: p.uid });
      setList((l) => l.filter((x) => x.uid !== p.uid));
      setMsg({ ok: true, text: t(k(rejoined ? "gv.pol.readmittedBack" : allowed ? "gv.pol.readmittedSchool" : "gv.pol.readmitted"), { name }) });
    } catch (e) {
      // errorText first either way: it logs the server's real answer for "Report a problem".
      const shared = errorText(e, t), reason = reasonOf(e);
      const mine = Object.prototype.hasOwnProperty.call(BACK_SAID, reason) ? BACK_SAID[reason] : undefined;
      setMsg({ ok: false, text: mine ? t(k(mine), { name }) : shared });
    } finally { setBusy(""); }
  };
  return (
    <section className="panel stack" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>{t(k("gv.pol.removedTitle"))}</h3>
      <p className="muted small">{t(k("gv.pol.removedHint"))}</p>
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {list.length ? (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("led.who")}</th><th>{t("led.when")}</th><th /></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.uid}>
              {/* On a phone's card (base.css .data-table): the person across the top, then the date and the button each on a line as before.
                  The name sits inside a box of the page's own direction: a bare <bdi> (or the left-to-right id) is the
                  cell's flex item itself, and a Latin name on an Arabic page then started at the card's far end. */}
              <td data-cell="main" data-label={t("led.who")}>{p.name ? <strong><bdi>{p.name}</bdi></strong> : <span><code dir="ltr">{p.uid}</code></span>}</td>
              <td data-cell="row" data-label={t("led.when")}>{p.at ? t(k("gv.pol.removedOn"), { date: day.format(new Date(p.at)) }) : "—"}</td>
              <td data-cell="row"><Button size="sm" variant="secondary" loading={busy === p.uid} disabled={!!busy && busy !== p.uid} aria-label={t(k("gv.pol.readmitName"), { name: isolate(p.name || p.uid) })} onClick={() => void readmit(p)}>{t(k("gv.pol.readmit"))}</Button></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted">{t(k("gv.pol.removedNone"))}</p>}
    </section>
  );
}
