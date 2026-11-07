import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, TrackChip } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { COMPETENCIES } from "../content/competencies";
import type { LocalText, Track, Unit } from "../content/types";
import { errorsOf, UNIT_ID, validateUnit } from "../content/validate";
import { useTracks } from "../content/settings";
import { levelsByTrack } from "../content/tracks";
import { useI18n, type MessageKey } from "../i18n";
import { cmsApi } from "./api";
import { createUnit, freshMeta, getUnit, listOrgs, listUnits, saveUnit, statusOf, unitExists, type Status, type UnitMeta } from "./data";
import { LText } from "./fields";
import { blankUnit, copyTitle, newUnitId, withNewIds } from "./ids";
import { LevelPicker, TrackPicker } from "./pickers";
import "../styles/editor.css";
import "./strings";

const CODES = new Set(COMPETENCIES.map((c) => c.code));
const STATUSES: Status[] = ["draft", "live", "changed"];
/** All of a text's languages, for search. */
const words = (x?: LocalText) => Object.values(x ?? {}).join(" ").toLowerCase();

/**
 * /super/content (units for everyone) and /admin/content (units for this org's members). A one-shot list, grouped by
 * track in the order platform admins set, then by level; search covers unit and lesson titles. Units are opened,
 * duplicated or deleted from here; "New unit" and "Import JSON" (a unit file, exported here or written by hand) add one.
 */
export function ContentList() {
  const { t, L, num, locale } = useI18n();
  const tracks = useTracks();
  const nav = useNavigate();
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const date = (ts?: { seconds: number } | null) => (ts ? fmt.format(new Date(ts.seconds * 1000)) : "—");
  const { user, role, orgId } = useAuth();
  // Platform admins see Darsi's courses, or any organization's own (to open, unpublish or delete one, e.g. for abuse).
  const [pick, setPick] = useState("public");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (role === "superadmin") listOrgs().then(setOrgs).catch(() => {}); }, [role]);
  const owner = role === "superadmin" ? pick : orgId;
  const base = role === "superadmin" ? "/super/content" : "/admin/content";
  const [list, setList] = useState<UnitMeta[] | undefined>();
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<"" | "new" | "import">("");
  const [q, setQ] = useState("");
  const [fTrack, setFTrack] = useState("");
  const [fLevel, setFLevel] = useState(0);
  const [fStatus, setFStatus] = useState<Status | "">("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState("");
  // A message from the page that sent us here (a unit deleted in the editor), shown where the admin lands.
  const done = (useLocation().state as { done?: string } | null)?.done;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(done ? { ok: true, text: done } : null);
  useEffect(() => { if (owner) { setList(undefined); setErr(""); listUnits(owner).then(setList).catch((e: Error) => setErr(e.message)); } }, [owner]);

  const present = useMemo(() => [...new Set((list ?? []).map((u) => u.track))].sort((a, b) => tracks.order(a) - tracks.order(b) || a.localeCompare(b)), [list, tracks]);
  const levels = useMemo(() => [...new Set((list ?? []).filter((u) => u.track === fTrack).map((u) => u.level))].sort((a, b) => a - b), [list, fTrack]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = new Map<string, UnitMeta[]>();
    for (const u of list ?? []) {
      if ((fTrack && u.track !== fTrack) || (fLevel && u.level !== fLevel) || (fStatus && statusOf(u) !== fStatus)) continue;
      if (needle && ![words(u.title), u.id, ...(u.lessons ?? []).map((l) => words(l.title))].some((w) => w.includes(needle))) continue;
      by.set(u.track, [...(by.get(u.track) ?? []), u]);
    }
    return present.filter((tr) => by.has(tr))
      .map((track) => ({ track, units: by.get(track)!.sort((a, b) => a.level - b.level || L(a.title).localeCompare(L(b.title))) }));
  }, [list, present, q, fTrack, fLevel, fStatus, L]);
  if (!owner || !user) return <main className="screen"><EmptyState title={t("err.notFound")} /></main>;

  const create = async (unit: Unit) => { await createUnit(owner, unit, user.uid); nav(`${base}/${unit.id}`); };
  /**
   * An imported file in place of an existing unit's draft (platform admins; public ids are kept): a normal save of that
   * unit, so its learners keep their progress, and the live version stays until someone publishes. A rollback to any
   * version that was exported, not only the two Storage keeps.
   */
  const replace = async (unit: Unit) => {
    const r = await getUnit(unit.id);
    if (!r || r.meta.owner !== owner) throw new Error(t("cms.idTaken", { id: unit.id }));
    const res = await saveUnit(unit, r.meta.rev, user.uid);
    if ("conflict" in res) throw new Error(t("cms.conflict"));
    nav(`${base}/${unit.id}`);
  };
  const titleOf = (u: { title: LocalText }) => L(u.title) || t("cms.untitled");
  const clear = () => { setQ(""); setFTrack(""); setFLevel(0); setFStatus(""); };
  /** A new draft from the unit's saved draft, with new ids (it shares no progress with the original). */
  const duplicate = async (u: UnitMeta) => {
    setBusy(u.id); setMsg(null); setAsk("");
    try {
      const r = await getUnit(u.id);
      if (!r) throw new Error(t("err.notFound"));
      const copy = withNewIds({ ...r.unit, title: copyTitle(r.unit.title) });
      await createUnit(owner, copy, user.uid);
      setList((l) => [freshMeta(owner, copy), ...(l ?? [])]);
      setMsg({ ok: true, text: t("cms.duplicated", { title: titleOf(copy) }) });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  /** Takes a course away from learners (it stays here as a draft, and can be published again). */
  const unpublish = async (u: UnitMeta) => {
    setBusy(u.id); setMsg(null);
    try {
      await cmsApi.unpublishUnit({ unitId: u.id });
      setList((l) => l?.map((x) => (x.id === u.id ? { ...x, published: null } : x))); setAsk("");
      setMsg({ ok: true, text: t("cms.unpublishedTitle", { title: titleOf(u) }) });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  const remove = async (u: UnitMeta) => {
    setBusy(u.id); setMsg(null);
    try {
      await cmsApi.deleteUnit({ unitId: u.id });
      setList((l) => l?.filter((x) => x.id !== u.id)); setAsk("");
      setMsg({ ok: true, text: t("cms.deleted", { title: titleOf(u) }) });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };

  return (
    <>
      <AppBar title={t("cms.title.list")} />
      <main className="screen wide stack-lg ed">
        {/* In the page, not the app bar: four buttons don't fit beside the title on a phone. */}
        <div className="ed-toolbar">
          <Button size="sm" icon="edit" onClick={() => setPanel(panel === "new" ? "" : "new")}>{t("cms.newUnit")}</Button>
          <Button size="sm" variant="secondary" icon="file" onClick={() => setPanel(panel === "import" ? "" : "import")}>{t("cms.import")}</Button>
          {owner === "public" && <Button size="sm" variant="ghost" icon="settings" onClick={() => nav("/super/tracks")}>{t("cms.tracks.title")}</Button>}
          {owner === "public" && <Button size="sm" variant="ghost" icon="language" onClick={() => nav("/super/languages")}>{t("cms.lang.title")}</Button>}
        </div>
        {role === "superadmin" && orgs.length > 0 && (
          <div className="dr-field">
            <label htmlFor="ed-owner" className="dr-field-label">{t("cms.owner")}</label>
            <select id="ed-owner" className="dr-field-input" value={pick} onChange={(e) => { setPick(e.target.value); setQ(""); setFTrack(""); setFLevel(0); setFStatus(""); setPanel(""); setMsg(null); }}>
              <option value="public">{t("cms.ownerPublic")}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <p className="muted">{owner === "public" ? t("cms.introPublic") : role === "superadmin" ? t("cms.introOrgSuper") : t("cms.introOrg")}</p>
        {err && <p className="notice err" role="alert">{err}</p>}
        {msg && <p className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        {panel === "new" && <NewUnit onCreate={create} onCancel={() => setPanel("")} />}
        {panel === "import" && <ImportUnit owner={owner} onCreate={create} onReplace={replace} onCancel={() => setPanel("")} />}
        {!list ? <div className="loading" aria-busy="true" /> : list.length === 0 ? (
          <section className="panel"><EmptyState icon="edit" title={t("cms.none")} body={t("cms.noneBody")} action={<Button size="sm" onClick={() => setPanel("new")}>{t("cms.newUnit")}</Button>} /></section>
        ) : (
          <>
            <section className="panel ed-filters" aria-label={t("cms.filters")}>
              <div className="dr-field">
                <label htmlFor="ed-q" className="dr-field-label">{t("cms.search")}</label>
                <input id="ed-q" type="search" className="dr-field-input" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Filter label={t("cms.track")} value={fTrack} onChange={(v) => { setFTrack(v); setFLevel(0); }}
                options={[["", t("cms.filter.allTracks")], ...present.map((id) => [id, tracks.name(id)] as const)]} />
              {fTrack && levels.length > 1 && <Filter label={t("cms.level")} value={fLevel} onChange={setFLevel}
                options={[[0, t("cms.filter.allLevels")], ...levels.map((n) => [n, tracks.levelName(fTrack, n)] as const)]} />}
              <Filter<Status | ""> label={t("col.status")} value={fStatus} onChange={setFStatus}
                options={[["", t("cms.filter.any")], ...STATUSES.map((s) => [s, t(`cms.filter.${s}` as MessageKey)] as const)]} />
            </section>
            {groups.length === 0 && <section className="panel"><EmptyState icon="search" title={t("cms.noMatch")} action={<Button size="sm" variant="secondary" onClick={clear}>{t("cms.clearFilters")}</Button>} /></section>}
            {groups.map((g) => (
              <section key={g.track} className="ed-group" aria-labelledby={`ed-g-${g.track}`}>
                <h3 id={`ed-g-${g.track}`} className="ed-group-h">
                  <TrackChip track={g.track} solid>{tracks.name(g.track)}</TrackChip>
                  <span className="muted small">{t("cms.unitsCount", { n: num(g.units.length) })}</span>
                  {tracks.of(g.track).hidden && <span className="pill pill-warn">{t("cms.tracks.hidden")}</span>}
                </h3>
                <ol className="ed-units">{g.units.map((u) => {
                  const st = statusOf(u), more = (u.lessons?.length ?? 0) - 4;
                  return (
                    <li key={u.id} className="ed-unit">
                      <div className="ed-item-head">
                        <a className="ed-unit-title" href={`${base}/${u.id}`} onClick={(e) => { e.preventDefault(); nav(`${base}/${u.id}`); }}><bdi>{titleOf(u)}</bdi></a>
                        <span className={`ed-status is-${st}`}>{t(`cms.status.${st}` as MessageKey, { n: u.published?.version ?? 0 })}</span>
                      </div>
                      <p className="muted small">{[tracks.levelName(u.track, u.level), ...(u.audience === "students" ? [t("cms.audience.students")] : []), t("cms.lessonsCount", { n: num(u.lessonCount) }), t("cms.updatedOn", { date: date(u.updatedAt) })].join(t("common.sep"))}</p>
                      {!!u.lessons?.length && (
                        <ol className="ed-unit-lessons">
                          {u.lessons.slice(0, 4).map((l) => <li key={l.id}><bdi>{titleOf(l)}</bdi></li>)}
                          {more > 0 && <li className="muted">{t("cms.moreLessons", { n: num(more) })}</li>}
                        </ol>
                      )}
                      <div className="ed-toolbar">
                        <Button size="sm" variant="secondary" icon="edit" onClick={() => nav(`${base}/${u.id}`)}>{t("cms.open")}</Button>
                        <Button size="sm" variant="ghost" icon="file" loading={busy === u.id && !ask.endsWith(u.id)} disabled={!!busy} onClick={() => { void duplicate(u); }}>{t("cms.duplicate")}</Button>
                        {u.published && <Button size="sm" variant="ghost" icon="offline" disabled={!!busy} aria-expanded={ask === `off:${u.id}`} onClick={() => setAsk(ask === `off:${u.id}` ? "" : `off:${u.id}`)}>{t("cms.unpublish")}</Button>}
                        <Button size="sm" variant="ghost" icon="close" disabled={!!busy} aria-expanded={ask === u.id} onClick={() => setAsk(ask === u.id ? "" : u.id)}>{t("cms.delete")}</Button>
                      </div>
                      {ask === `off:${u.id}` && (
                        <div className="notice ed-confirm" role="alert">
                          <span>{t("cms.unpublishConfirm")}</span>
                          <Button size="sm" autoFocus loading={busy === u.id} onClick={() => { void unpublish(u); }}>{t("cms.unpublish")}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("common.cancel")}</Button>
                        </div>
                      )}
                      {ask === u.id && (
                        <div className="notice ed-confirm" role="alert">
                          <span>{t("cms.deleteConfirm", { title: titleOf(u) })}</span>
                          <Button size="sm" autoFocus loading={busy === u.id} onClick={() => { void remove(u); }}>{t("cms.confirmDelete")}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAsk("")}>{t("common.cancel")}</Button>
                        </div>
                      )}
                    </li>
                  );
                })}</ol>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}

/** A row of toggle buttons: one choice from a few (pressed = chosen). */
function Filter<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="ed-filter" role="group" aria-label={label}>
      <span className="dr-field-label">{label}</span>
      {options.map(([v, l]) => <button key={String(v)} type="button" className={`ed-chip${v === value ? " is-on" : ""}`} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

function NewUnit({ onCreate, onCancel }: { onCreate: (u: Unit) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const tracks = useTracks();
  const [title, setTitle] = useState<LocalText>({ en: "", ar: "" });
  const [track, setTrack] = useState<Track>(tracks.visible[0]?.id ?? "ai");
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await onCreate(blankUnit(newUnitId(), track, level, { en: title.en.trim(), ar: title.ar?.trim() ?? "" })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="ed-new-h">
      <h3 id="ed-new-h">{t("cms.newUnit")}</h3>
      <LText label={t("cms.title")} value={title} onChange={setTitle} />
      <TrackPicker value={track} onChange={(x) => { setTrack(x); setLevel(Math.min(level, tracks.of(x).levels)); }} />
      <LevelPicker track={track} value={level} onChange={setLevel} />
      {err && <p className="notice err" role="alert">{err}</p>}
      <div className="row-gap">
        <Button loading={busy} disabled={!title.en.trim()} onClick={() => { void go(); }}>{t("cms.create")}</Button>
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </section>
  );
}

/**
 * A unit file from disk or pasted. Platform admins keep its id (a unit exported here comes back as itself, with its
 * learners' progress), and may put it in place of the draft of the unit that already has that id (a rollback to an
 * exported version); org units always get new ids. Errors are fixed in the editor.
 */
function ImportUnit({ owner, onCreate, onReplace, onCancel }: { owner: string; onCreate: (u: Unit) => Promise<void>; onReplace: (u: Unit) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const tracks = useTracks();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [check, setCheck] = useState<{ unit: Unit; errors: number; warnings: number } | null>(null);
  const [taken, setTaken] = useState(false);
  const read = (src: string) => {
    setErr(""); setCheck(null); setTaken(false);
    let data: unknown;
    try { data = JSON.parse(src); } catch { return setErr(t("cms.badJson")); }
    if (typeof data !== "object" || data === null || !Array.isArray((data as Unit).lessons)) return setErr(t("cms.notAUnit"));
    const unit = owner === "public" && UNIT_ID.test(String((data as Unit).id)) ? (data as Unit) : withNewIds(data as Unit);
    const issues = validateUnit(unit, { competencies: CODES, tracks: levelsByTrack(tracks.all) });
    setCheck({ unit, errors: errorsOf(issues).length, warnings: issues.length - errorsOf(issues).length });
  };
  const go = async () => {
    if (!check) return;
    setBusy(true); setErr("");
    try {
      if (owner === "public" && await unitExists(check.unit.id)) { setTaken(true); setBusy(false); return; }
      await onCreate(check.unit);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const replace = async () => {
    if (!check) return;
    setBusy(true); setErr("");
    try { await onReplace(check.unit); } catch (e) { setErr((e as Error).message); setBusy(false); setTaken(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="ed-import-h">
      <h3 id="ed-import-h">{t("cms.import")}</h3>
      <p className="muted small">{t(owner === "public" ? "cms.importHintPublic" : "cms.importHintOrg")}</p>
      <label className="file-pick"><span>{t("cms.chooseJson")}</span>
        <input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const s = await f.text(); setText(s); read(s); } e.target.value = ""; }} /></label>
      <div className="dr-field">
        <label htmlFor="ed-json" className="dr-field-label">{t("cms.pasteJson")}</label>
        <textarea id="ed-json" className="dr-field-input ed-json" dir="ltr" rows={6} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setCheck(null); setTaken(false); }} />
      </div>
      {err && <p className="notice err" role="alert">{err}</p>}
      {check && <p className={check.errors ? "notice" : "notice ok"} role="status">{t("cms.importCheck", { id: check.unit.id, lessons: check.unit.lessons.length, errors: check.errors, warnings: check.warnings })}</p>}
      {check && taken ? (
        <div className="notice ed-confirm" role="alert">
          <span>{t("cms.replaceAsk", { id: check.unit.id })}</span>
          <Button size="sm" autoFocus loading={busy} onClick={() => { void replace(); }}>{t("cms.replaceGo")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setTaken(false)}>{t("common.cancel")}</Button>
        </div>
      ) : (
        <div className="row-gap">
          {check ? <Button loading={busy} onClick={() => { void go(); }}>{t("cms.importGo")}</Button> : <Button variant="secondary" disabled={!text.trim()} onClick={() => read(text)}>{t("cms.importRead")}</Button>}
          <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      )}
    </section>
  );
}
