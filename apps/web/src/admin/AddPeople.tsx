import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, Icon, Switch } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, type MemberInput, type MemberResult } from "../auth/api";
import type { Role } from "../auth/types";
import { useI18n } from "../i18n";
import { buildMembers, credentialsXlsx, detectMapping, downloadBlob, FIELDS, readSheet, templateXlsx, type Field, type Mapping, type RowCheck } from "./importer";
import "../styles/people.css";

const ROLES: Role[] = ["student", "teacher", "orgAdmin"];

/** Shared options + submit + results for manual add and Excel import. */
function useCreator() {
  const { orgId } = useAuth();
  const [pwLen, setPwLen] = useState(10);
  const [mustChange, setMustChange] = useState(true);
  const [results, setResults] = useState<(MemberResult & { role?: string; group?: string })[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState("");
  const run = async (members: MemberInput[]) => {
    if (!orgId) return;
    setErr(""); setProgress({ done: 0, total: members.length });
    const all: (MemberResult & { role?: string; group?: string })[] = [];
    try {
      for (let i = 0; i < members.length; i += 100) {
        const chunk = members.slice(i, i + 100);
        const { results } = await api.createMembers({ orgId, members: chunk, passwordLength: pwLen, mustChangePassword: mustChange });
        results.forEach((r, k) => all.push({ ...r, row: i + r.row, role: chunk[k]?.role, group: chunk[k]?.group }));
        setProgress({ done: Math.min(members.length, i + 100), total: members.length });
      }
      setResults(all);
    } catch (e) { setErr((e as Error).message); } finally { setProgress(null); }
  };
  return { pwLen, setPwLen, mustChange, setMustChange, results, run, progress, err };
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

export function Results({ results }: { results: (MemberResult & { role?: string; group?: string })[] }) {
  const { t, num } = useI18n();
  const ok = results.filter((r) => r.status === "created");
  const download = async () => downloadBlob(await credentialsXlsx(results.map((r) => ({ name: r.name, login: displayLogin(r.login), password: r.password ?? "", role: r.role ? t(`role.${r.role}` as "role.student") : "", group: r.group ?? "", status: t(`add.status.${r.status}` as "add.status.created") })),
    { name: t("col.name"), login: t("col.login"), password: t("col.password"), role: t("col.role"), group: t("col.group"), status: t("col.status") }), `darsi-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return (
    <section className="panel stack">
      <h3 className="no-print">{t("add.results")}</h3>
      <p className="notice no-print">{t("add.resultsHint")}</p>
      <p className="no-print"><strong>{t("add.created", { n: ok.length })}</strong>{results.length > ok.length && <>{t("common.sep")}<span className="err-text">{t("add.failed", { n: results.length - ok.length })}</span></>}</p>
      <div className="row-gap no-print"><Button icon="file" onClick={download}>{t("add.download")}</Button><Button variant="secondary" icon="print" onClick={() => window.print()}>{t("add.print")}</Button></div>
      <div className="table-wrap no-print"><table className="data-table">
        <thead><tr><th className="num">#</th><th>{t("col.name")}</th><th>{t("col.login")}</th><th>{t("col.password")}</th><th>{t("col.status")}</th></tr></thead>
        <tbody>{results.map((r) => <tr key={r.row}><td className="num" data-label="#">{num(r.row)}</td><td data-label={t("col.name")}><bdi>{r.name}</bdi></td>
          <td data-label={t("col.login")}><span dir="ltr">{displayLogin(r.login)}</span></td><td data-label={t("col.password")}><code dir="ltr">{r.password ?? ""}</code></td>
          <td data-label={t("col.status")} className={r.status === "created" ? "" : "err-text"}>{t(`add.status.${r.status}` as "add.status.created")}{r.error ? ` — ${r.error}` : ""}</td></tr>)}</tbody>
      </table></div>
      {/* Printable login slips — cut along the dashed lines. */}
      <div className="slips">{ok.map((r) => (
        <div key={r.row} className="slip"><strong>{t("slip.title")}</strong><span>{r.name}</span>
          <span>{t("col.login")}: <code dir="ltr">{displayLogin(r.login)}</code></span><span>{t("col.password")}: <code dir="ltr">{r.password}</code></span>
          <span className="small">{t("slip.site")} <span dir="ltr">{location.host}</span></span><span className="small">{t("slip.change")}</span></div>
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
        {c.results ? <Results results={c.results} /> : (
          <section className="panel stack">
            <p className="muted">{t("add.hint")}</p>
            <div className="add-rows">
              {rows.map((r, i) => (
                <div key={i} className="add-row">
                  <input aria-label={t("col.name")} placeholder={t("col.name")} value={r.name} onChange={(e) => set(i, { name: e.target.value })} dir="auto" />
                  <input aria-label={t("col.email")} placeholder={`${t("col.email")} / ${t("col.username")}`} value={r.email || r.username || ""} dir="ltr"
                    onChange={(e) => { const v = e.target.value.trim(); set(i, v.includes("@") ? { email: v, username: undefined } : { username: v || undefined, email: undefined }); }} />
                  <select aria-label={t("col.role")} value={r.role} onChange={(e) => set(i, { role: e.target.value as Role })}>{ROLES.map((x) => <option key={x} value={x}>{t(`role.${x}` as "role.student")}</option>)}</select>
                  <input aria-label={t("col.group")} placeholder={t("col.group")} value={r.group ?? ""} onChange={(e) => set(i, { group: e.target.value })} dir="auto" />
                  <Button size="sm" variant="ghost" iconOnly icon="close" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>{t("common.close")}</Button>
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
        {c.results ? <Results results={c.results} /> : <>
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
              <label>{t("add.defaultRole")}<select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}</select></label>
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
                  <td data-label={t("col.role")}>{t(`role.${r.member.role}` as "role.student")}</td><td data-label={t("col.group")}><bdi>{r.member.group ?? ""}</bdi></td>
                  <td data-label={t("col.status")} className="small">{[...r.errors.map((e) => t(`imp.err.${e}` as "imp.err.name")), ...r.warnings.map((w) => t(`imp.warn.${w}` as "imp.warn.role"))].join(t("common.sep")) || "✓"}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Options c={c} />
            {c.err && <p className="notice err">{c.err}</p>}
            {c.progress && <p className="notice" role="status">{t("imp.progress", { done: c.progress.done, total: c.progress.total })}</p>}
            <Button icon="check" loading={!!c.progress} disabled={!good.length} onClick={() => c.run(good.map((r) => r.member))}>{t("imp.create", { n: good.length })}</Button>
          </section>}
        </>}
      </main>
    </>
  );
}
