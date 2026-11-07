import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, Icon, Switch } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, type MemberInput, type MemberResult } from "../auth/api";
import type { Profile, Role } from "../auth/types";
import { useI18n } from "../i18n";
import { madeSince } from "./data";
import { refusalText } from "./refusals";
import { buildMembers, credentialsXlsx, detectMapping, downloadBlob, FIELDS, readSheet, sendOrder, templateXlsx, type Field, type Mapping, type RowCheck } from "./importer";
import "../styles/people.css";
import "./strings";

const ROLES: Role[] = ["student", "teacher", "orgAdmin"];
/**
 * People per createMembers call. Each call's passwords exist only in its answer, so a call lost to a dropped connection
 * loses at most this many: 25, not 100.
 */
export const CHUNK = 25;

/**
 * One row of the results. `warning`/`teacherMissing` are how createMembers can say a teacher's login matched no one
 * (functions/src/index.ts); `unsent` marks rows a failed import never sent, which "Try the rest again" sends.
 */
export type ResultRow = MemberResult & { role?: string; group?: string; warning?: string; teacherMissing?: boolean; unsent?: boolean;
  /** Made by a call whose answer was lost: no password was seen, so it is reset on the person's page. */
  madeBefore?: boolean };
/** A row to send: `row` is the spreadsheet's row number (the form's for people added by hand), shown in the results. */
export type Pending = { member: MemberInput; row: number };
/** A row with no email or username: the server makes up its login, a new one each time it is sent. */
const noLogin = (p: Pending) => !p.member.email && !p.member.username;
/** Who a row is, as the server saves it: name, role and class, spaces tidied. */
const who = (name: string | undefined, role: string | undefined, group: string | null | undefined) =>
  [name, role || "student", group].map((s) => (s ?? "").replace(/\s+/g, " ").trim()).join("\n");
/**
 * After a call whose answer was lost, the rows it may have made. A row with no login of its own would get a second,
 * newly made-up login if it were sent again, so before sending such rows again they are looked for among the accounts
 * this admin made since (`made`), by name, role and class: each account matches one row at most, and accounts this
 * import already reported (`known`) match none. Rows with their own email or username are sent again: the server
 * answers "Already exists" for those it made.
 */
export function alreadyMade(list: Pending[], unsure: Pending[], made: Profile[], known: Set<string>) {
  const doubtful = new Set(unsure.filter(noLogin).map((p) => who(p.member.name, p.member.role, p.member.group)));
  const pool = new Map<string, Profile[]>();
  for (const p of made) {
    if (known.has(p.uid)) continue;
    const k = who(p.name, p.role, p.group);
    pool.set(k, [...(pool.get(k) ?? []), p]);
  }
  const found: Array<{ p: Pending; account: Profile }> = [], rest: Pending[] = [];
  for (const p of list) {
    const k = who(p.member.name, p.member.role, p.member.group);
    const account = noLogin(p) && doubtful.has(k) ? pool.get(k)?.shift() : undefined;
    if (account) found.push({ p, account }); else rest.push(p);
  }
  return { found, rest };
}
/** How far this phone's clock may be from the server's when looking for accounts a lost call made. */
const CLOCK_SLACK = 10 * 60_000;
/** A call that may not have reached the server, or whose answer was lost: the connection, a timeout or a crash. */
export const lostCall = (e: unknown) => /(?:^|\/)(?:internal|unavailable|deadline-exceeded|unknown)$/.test(String((e as { code?: string }).code ?? ""));

/** Shared options + submit + results for manual add and Excel import. */
function useCreator() {
  const { orgId, user } = useAuth();
  const { t } = useI18n();
  const [pwLen, setPwLen] = useState(10);
  const [mustChange, setMustChange] = useState(true);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  // The rows a failed import never sent, as they were (teacher and language included), for "Try the rest again".
  const [rest, setRest] = useState<Pending[]>([]);
  // Rows with no login of their own that a call whose answer was lost may have made, and when that call started.
  const [unsure, setUnsure] = useState<{ rows: Pending[]; since: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState("");
  const send = async (list: Pending[], kept: ResultRow[]) => {
    if (!orgId || !list.length) return;
    const total = kept.length + list.length;
    setErr(""); setProgress({ done: kept.length, total });
    const all = [...kept];
    let queue: Pending[] = [];
    let i = 0, started = Date.now(); // when the call in progress began
    try {
      // Rows a lost call made are not sent again: one without a login of its own would get a second account.
      let todo = list;
      if (unsure && user) {
        // If the accounts can't be read, the rows are sent as before rather than kept back for good.
        const made = await madeSince(orgId, user.uid, unsure.since - CLOCK_SLACK).catch(() => [] as Profile[]);
        const { found, rest: left } = alreadyMade(list, unsure.rows, made, new Set(kept.flatMap((r) => (r.uid ? [r.uid] : []))));
        for (const { p, account } of found) all.push({ row: p.row, name: p.member.name, login: account.username || account.email || "", uid: account.uid, status: "exists", role: p.member.role, group: p.member.group, madeBefore: true });
        todo = left;
        setProgress({ done: all.length, total });
      }
      // Teachers and admins first, so a later call can link the students who name them.
      queue = sendOrder(todo);
      for (; i < queue.length; i += CHUNK) {
        const chunk = queue.slice(i, i + CHUNK);
        started = Date.now();
        const { results } = await api.createMembers({ orgId, members: chunk.map((p) => p.member), passwordLength: pwLen, mustChangePassword: mustChange });
        // `row` is 1-based within the call; match by it, not by position, in case the server answers in another order.
        for (const r of results as ResultRow[]) { const p = chunk[r.row - 1]; if (p) all.push({ ...r, row: p.row, role: p.member.role, group: p.member.group }); }
        setProgress({ done: all.length, total });
      }
      setRest([]); setUnsure(null);
      setResults(all.sort((a, b) => a.row - b.row));
    } catch (e) {
      const unsent = queue.length ? queue.slice(i) : list;
      // Still in doubt: the call that failed, when only its answer may have been lost, and rows an earlier lost call may
      // have made that haven't been sent since.
      const lost = lostCall(e) && queue.length ? queue.slice(i, i + CHUNK).filter(noLogin) : [];
      const left = new Set(unsent.map((p) => who(p.member.name, p.member.role, p.member.group)));
      const old = (unsure?.rows ?? []).filter((p) => left.has(who(p.member.name, p.member.role, p.member.group)));
      setUnsure(old.length || lost.length ? { rows: [...old, ...lost], since: Math.min(old.length ? unsure!.since : Infinity, lost.length ? started : Infinity) } : null);
      // Keep what was created, with its passwords: they are shown only now. The rest can be sent again.
      if (all.length) {
        setRest(unsent);
        setResults([...all, ...unsent.map((p): ResultRow => ({ row: p.row, name: p.member.name, login: p.member.email || p.member.username || "", status: "error", role: p.member.role, group: p.member.group, unsent: true }))].sort((a, b) => a.row - b.row));
      }
      setErr(lostCall(e) ? (all.length ? t("imp.interrupted", { done: all.length, total }) : t("auth.errNetwork")) : refusalText(e, t));
    } finally { setProgress(null); }
  };
  /** `rows`: each member's row number in the spreadsheet, so the results number them as the sheet and the preview do. */
  const run = (members: MemberInput[], rows?: number[]) => send(members.map((member, k) => ({ member, row: rows?.[k] ?? k + 1 })), []);
  /** Sends the rows a failed import never sent, keeping the results it had. */
  const retry = () => send(rest, (results ?? []).filter((r) => !r.unsent));
  return { pwLen, setPwLen, mustChange, setMustChange, results, run, retry, rest, progress, err };
}

function Options({ c }: { c: ReturnType<typeof useCreator> }) {
  const { t } = useI18n();
  return (
    <div className="form-grid">
      <label>{t("add.pwLength")}<select value={c.pwLen} onChange={(e) => c.setPwLen(Number(e.target.value))}>{[8, 10, 12, 14, 16].map((n) => <option key={n}>{n}</option>)}</select></label>
      <div className="span2"><Switch label={t("add.mustChange")} checked={c.mustChange} onChange={c.setMustChange} /></div>
    </div>
  );
}

export function Results({ results, err, rest = 0, progress, onRetry, mustChange = true }: { results: ResultRow[];
  /** Why the import stopped, when it did (the rows it never sent are in `results`, marked unsent). */
  err?: string; rest?: number; progress?: { done: number; total: number } | null; onRetry?: () => void;
  /** Whether people choose their own password at first sign-in: the slips say so only then. */
  mustChange?: boolean }) {
  const { t, num, dir } = useI18n();
  const ok = results.filter((r) => r.status === "created");
  const made = ok.length + results.filter((r) => r.madeBefore).length;
  const status = (r: ResultRow) => {
    if (r.unsent) return t("imp.notSent");
    if (r.madeBefore) return t("imp.madeBefore");
    // Why a row wasn't created, and what to do, in the admin's language (createMembers' reason; older servers sent only
    // an English error).
    const why = r.reason ? ` — ${t(`add.err.${r.reason}` as "add.err.exists", { min: 3, max: 40 })}` : r.status === "error" && r.error ? ` — ${r.error}` : "";
    const warn = r.warning === "teacherNotFound" || r.teacherMissing ? `${t("common.sep")}${t("add.warn.teacher")}` : "";
    return t(`add.status.${r.status}` as "add.status.created") + why + warn;
  };
  const download = async () => downloadBlob(await credentialsXlsx(results.map((r) => ({ row: r.row, name: r.name, login: displayLogin(r.login), password: r.password ?? "", role: r.role ? t(`rn.${r.role}` as "rn.student") : "", group: r.group ?? "", status: status(r) })),
    { row: "#", name: t("col.name"), login: t("col.login"), password: t("col.password"), role: t("col.role"), group: t("col.group"), status: t("col.status") },
    { sheet: t("add.sheet"), rtl: dir === "rtl" }), `darsi-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return (
    <section className="panel stack">
      <h3 className="no-print">{t("add.results")}</h3>
      {err && <p className="notice err no-print" role="alert">{err}</p>}
      {progress && <p className="notice no-print" role="status">{t("imp.progress", { done: progress.done, total: progress.total })}</p>}
      {rest > 0 && onRetry && <div className="no-print"><Button icon="sync" loading={!!progress} onClick={onRetry}>{t("imp.retryRest", { n: rest })}</Button></div>}
      <p className="notice no-print">{t("add.resultsHint")}</p>
      {/* Accounts a lost call made count as created: they exist, only without a password shown. */}
      <p className="no-print"><strong>{t("add.created", { n: made })}</strong>{results.length > made && <>{t("common.sep")}<span className="err-text">{t("add.failed", { n: results.length - made })}</span></>}</p>
      <div className="row-gap no-print"><Button icon="file" onClick={download}>{t("add.download")}</Button><Button variant="secondary" icon="print" onClick={() => window.print()}>{t("add.print")}</Button></div>
      <div className="table-wrap no-print"><table className="data-table">
        <thead><tr><th className="num">#</th><th>{t("col.name")}</th><th>{t("col.login")}</th><th>{t("col.password")}</th><th>{t("col.status")}</th></tr></thead>
        <tbody>{results.map((r) => <tr key={r.row}><td className="num" data-label="#">{num(r.row)}</td><td data-label={t("col.name")}><bdi>{r.name}</bdi></td>
          <td data-label={t("col.login")}><span dir="ltr">{displayLogin(r.login)}</span></td><td data-label={t("col.password")}><code dir="ltr">{r.password ?? ""}</code></td>
          <td data-label={t("col.status")} className={r.status === "created" ? "" : "err-text"}>{status(r)}</td></tr>)}</tbody>
      </table></div>
      {/* Printable login slips — cut along the dashed lines. */}
      <div className="slips">{ok.map((r) => (
        <div key={r.row} className="slip"><strong>{t("slip.title")}</strong><span>{r.name}</span>
          <span>{t("col.login")}: <code dir="ltr">{displayLogin(r.login)}</code></span><span>{t("col.password")}: <code dir="ltr">{r.password}</code></span>
          <span className="small">{t("slip.site")} <span dir="ltr">{location.host}</span></span><span className="small">{t(mustChange ? "slip.change" : "slip.keep")}</span></div>
      ))}</div>
    </section>
  );
}

export function AddPeople() {
  const { t } = useI18n();
  const nav = useNavigate();
  const c = useCreator();
  const [rows, setRows] = useState<MemberInput[]>([{ name: "", email: "", role: "student", group: "" }]);
  const set = (i: number, patch: Partial<MemberInput>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const valid = rows.filter((r) => r.name.trim());
  return (
    <>
      <AppBar title={t("add.title")} onBack={() => nav("/admin")} backLabel={t("common.back")} />
      <main className="screen wide stack-lg">
        {c.results ? <Results results={c.results} err={c.err} rest={c.rest.length} progress={c.progress} mustChange={c.mustChange} onRetry={() => { void c.retry(); }} /> : (
          <section className="panel stack">
            <p className="muted">{t("add.hint")}</p>
            <div className="add-rows">
              {rows.map((r, i) => (
                <div key={i} className="add-row">
                  <input aria-label={t("col.name")} placeholder={t("col.name")} value={r.name} onChange={(e) => set(i, { name: e.target.value })} dir="auto" />
                  <input aria-label={t("col.email")} placeholder={`${t("col.email")} / ${t("col.username")}`} value={r.email || r.username || ""} dir="ltr"
                    onChange={(e) => { const v = e.target.value.trim(); set(i, v.includes("@") ? { email: v, username: undefined } : { username: v || undefined, email: undefined }); }} />
                  <select aria-label={t("col.role")} value={r.role} onChange={(e) => set(i, { role: e.target.value as Role })}>{ROLES.map((x) => <option key={x} value={x}>{t(`rn.${x}` as "rn.student")}</option>)}</select>
                  <input aria-label={t("col.group")} placeholder={t("col.group")} value={r.group ?? ""} onChange={(e) => set(i, { group: e.target.value })} dir="auto" />
                  <Button size="sm" variant="ghost" iconOnly icon="close" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>{t("add.removeRow")}</Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="ghost" icon="profile" onClick={() => setRows([...rows, { name: "", role: rows[rows.length - 1].role, group: rows[rows.length - 1].group }])}>{t("add.row")}</Button>
            <Options c={c} />
            {c.err && <p className="notice err">{c.err}</p>}
            <Button loading={!!c.progress} disabled={!valid.length} icon="check" onClick={() => c.run(valid.map((r) => ({ ...r, name: r.name.trim() })))}>{t("add.create")}</Button>
          </section>
        )}
      </main>
    </>
  );
}

export function ImportPeople() {
  const { t, num } = useI18n();
  const nav = useNavigate();
  const c = useCreator();
  const [file, setFile] = useState<File | null>(null);
  const [book, setBook] = useState<Awaited<ReturnType<typeof readSheet>> | null>(null);
  const [sheet, setSheet] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaultRole, setDefaultRole] = useState<Role>("student");
  const [readErr, setReadErr] = useState("");
  const rows = useMemo(() => (book ? book.rows(sheet) : []), [book, sheet]);
  const headers = useMemo(() => (rows[0] ?? []).map((h, i) => (hasHeader ? String(h ?? "") : `${t("imp.column")} ${i + 1}`)), [rows, hasHeader, t]);
  const checks: RowCheck[] = useMemo(() => (rows.length ? buildMembers(rows, mapping, { defaultRole, hasHeader }) : []), [rows, mapping, defaultRole, hasHeader]);
  const good = checks.filter((r) => !r.errors.length);
  const bad = checks.length - good.length;
  const nameMapped = mapping.name !== undefined || mapping.firstName !== undefined;

  const open = async (f: File) => {
    setFile(f); setReadErr("");
    try { const b = await readSheet(f); setBook(b); setSheet(0); const r = b.rows(0); setMapping(detectMapping((r[0] ?? []).map((x) => String(x ?? "")))); }
    catch (e) { setReadErr((e as Error).message); setBook(null); }
  };
  const setField = (f: Field, col: string) => { const m = { ...mapping }; if (col === "") delete m[f]; else { for (const k of FIELDS) if (m[k] === Number(col)) delete m[k]; m[f] = Number(col); } setMapping(m); };

  return (
    <>
      <AppBar title={t("imp.title")} onBack={() => nav("/admin")} backLabel={t("common.back")} />
      <main className="screen wide stack-lg">
        {c.results ? <Results results={c.results} err={c.err} rest={c.rest.length} progress={c.progress} mustChange={c.mustChange} onRetry={() => { void c.retry(); }} /> : <>
          <section className="panel stack">
            <h3>{t("imp.step1")}</h3>
            <div className="row-gap">
              <label className="file-pick"><Icon name="file" size={20} /><span>{file ? file.name : t("imp.pick")}</span>
                <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} /></label>
              <Button size="sm" variant="ghost" icon="offline" onClick={async () => downloadBlob(await templateXlsx(), "darsi-people-template.xlsx")}>{t("imp.template")}</Button>
            </div>
            {readErr && <p className="notice err">{readErr}</p>}
            {book && <div className="form-grid">
              {book.sheets.length > 1 && <label>{t("imp.sheet")}<select value={sheet} onChange={(e) => { const s = Number(e.target.value); setSheet(s); setMapping(detectMapping((book.rows(s)[0] ?? []).map(String))); }}>{book.sheets.map((s, i) => <option key={i} value={i}>{s}</option>)}</select></label>}
              <div className="span2"><Switch label={t("imp.hasHeader")} checked={hasHeader} onChange={setHasHeader} /></div>
              <label>{t("add.defaultRole")}<select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}</select></label>
            </div>}
          </section>

          {book && <section className="panel stack">
            <h3>{t("imp.step2")}</h3>
            <div className="map-grid">{FIELDS.map((f) => (
              <label key={f} className="map-row"><span>{t(`field.${f}` as "field.name")}</span>
                <select value={mapping[f] ?? ""} onChange={(e) => setField(f, e.target.value)}>
                  <option value="">{t("imp.ignore")}</option>{headers.map((h, i) => <option key={i} value={i}>{h || `${t("imp.column")} ${i + 1}`}</option>)}
                </select></label>
            ))}</div>
            {!nameMapped && <p className="notice err">{t("imp.needName")}</p>}
          </section>}

          {book && nameMapped && <section className="panel stack">
            <h3>{t("imp.step3")}</h3>
            <p><strong>{t("imp.rows", { n: checks.length })}</strong>{bad > 0 && <>{t("common.sep")}<span className="err-text">{t("imp.errors", { n: bad })}</span></>}</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th className="num">#</th><th>{t("col.name")}</th><th>{t("col.login")}</th><th>{t("col.role")}</th><th>{t("col.group")}</th><th>{t("col.status")}</th></tr></thead>
              <tbody>{checks.slice(0, 200).map((r) => (
                <tr key={r.row} className={r.errors.length ? "row-err" : ""}>
                  <td className="num" data-label="#">{num(r.row)}</td><td data-label={t("col.name")}><bdi>{r.member.name || "—"}</bdi></td>
                  <td data-label={t("col.login")}><span dir="ltr">{r.member.email || r.member.username || "…"}</span></td>
                  <td data-label={t("col.role")}>{t(`rn.${r.member.role}` as "rn.student")}</td><td data-label={t("col.group")}><bdi>{r.member.group ?? ""}</bdi></td>
                  <td data-label={t("col.status")} className="small">{[...r.errors.map((e) => t(`imp.err.${e}` as "imp.err.name")), ...r.warnings.map((w) => t(`imp.warn.${w}` as "imp.warn.role"))].join(t("common.sep")) || "✓"}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Options c={c} />
            {c.err && <p className="notice err">{c.err}</p>}
            {c.progress && <p className="notice" role="status">{t("imp.progress", { done: c.progress.done, total: c.progress.total })}</p>}
            <Button icon="check" loading={!!c.progress} disabled={!good.length} onClick={() => c.run(good.map((r) => r.member), good.map((r) => r.row))}>{t("imp.create", { n: good.length })}</Button>
          </section>}
        </>}
      </main>
    </>
  );
}
