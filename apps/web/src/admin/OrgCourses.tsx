/**
 * Which courses an organization's teachers, students and classes see (TECHNICAL.md "Course visibility in organizations").
 * The org admin's page (/admin/courses) and the same panel on a platform admin's org page (/super/orgs/:id).
 * - At the top: everyone sees every course (the default), or choose per group.
 * - Then every course on offer (Darsi's and the organization's own), by track, with a search box. Columns: all
 *   teachers, all students, and each class among the members (read once, like the other admin screens).
 *   Wide screens get a grid of checkboxes; phones pick who first, then a checklist.
 * - Saving goes through setOrgCourses (no client may write the field); members' phones pick it up at their next start.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, ChoiceCard, EmptyState, TrackChip } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/api";
import type { Org, Profile } from "../auth/types";
import { storageJSON } from "../firebase";
import { useI18n, type MessageKey } from "../i18n";
import { loadCatalog, mergeCatalog } from "../content/load";
import { useTracks } from "../content/settings";
import { audienceOf, type Audience, type Catalog, type CatalogEntry } from "../content/types";
import { checkOrgCourses, classNameOk, readOrgCourses, type OrgCourses, type OrgCoursesProblem } from "../content/orgCourses";
import { useMembers, useOrg } from "./data";
import { refusalText } from "./refusals";
import "./strings";
import "../styles/admin.css";

type Msg = { ok: boolean; text: string } | null;
/** The lists being edited: all teachers, all students, and each class. */
interface Lists { t: Set<string>; s: Set<string>; g: Map<string, Set<string>> }
/** A column: "t" (all teachers), "s" (all students) or "g:<class>". `aud`: whose courses it can hold (null: anyone's). */
interface Col { key: string; name: string; people: number | null; aud: Set<Audience> | null; gone?: boolean }

const toLists = (c: OrgCourses): Lists => (c.mode === "chosen"
  ? { t: new Set(c.teachers), s: new Set(c.students), g: new Map(Object.entries(c.groups).map(([k, v]) => [k, new Set(v)])) }
  : { t: new Set(), s: new Set(), g: new Map() });
const fromLists = (mode: OrgCourses["mode"], l: Lists): OrgCourses => (mode === "all" ? { mode: "all" }
  : { mode: "chosen", teachers: [...l.t], students: [...l.s], groups: Object.fromEntries([...l.g].map(([k, v]) => [k, [...v]])) });
const listOf = (l: Lists, key: string): Set<string> => (key === "t" ? l.t : key === "s" ? l.s : l.g.get(key.slice(2)) ?? new Set());
/** The lists with one column's ticks changed (copied, never edited in place). */
function withTicks(l: Lists, key: string, ids: string[], on: boolean): Lists {
  const next = new Set(listOf(l, key));
  for (const id of ids) if (on) next.add(id); else next.delete(id);
  if (key === "t") return { ...l, t: next };
  if (key === "s") return { ...l, s: next };
  const g = new Map(l.g); g.set(key.slice(2), next);
  return { ...l, g };
}
const applies = (c: Col, u: CatalogEntry) => !c.aud || c.aud.has(audienceOf(u));
const PROBLEM: Record<OrgCoursesProblem, MessageKey> = {
  "courses-mode": "oc.rf.mode", "courses-list": "oc.rf.list", "courses-id": "oc.rf.id", "courses-many": "oc.rf.many",
  "courses-classes": "oc.rf.classes", "courses-class": "oc.rf.class", "courses-total": "oc.rf.total",
};

/** Desktop gets the grid; anything narrower, who first and then a checklist. Follows the window as it is resized. */
const WIDE = "(min-width: 900px)";
function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia === "function" && matchMedia(WIDE).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    if (m.addEventListener) m.addEventListener("change", on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); else m.removeListener(on); };
  }, []);
  return wide;
}

/**
 * Every course an organization's members could see: Darsi's public catalog plus the organization's own. An org admin's
 * catalog already holds their own (content/load.ts); a platform admin's org page reads that organization's once.
 */
function useOrgCatalog(orgId: string, own: boolean) {
  const [s, setS] = useState<{ data?: Catalog; error?: Error }>({});
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setS({});
    // The organization's own catalog is optional (none until it publishes a course): any failure there means none.
    Promise.all([loadCatalog(), own ? null : Promise.resolve().then(() => storageJSON(`orgs/${orgId}/catalog.json`)).catch(() => null)])
      .then(([pub, org]) => { if (live) setS({ data: own ? pub : mergeCatalog(pub, org as Catalog | null) }); }, (error: Error) => { if (live) setS({ error }); });
    return () => { live = false; };
  }, [orgId, own, n]);
  return { ...s, retry: () => setN((x) => x + 1) };
}

/**
 * With unsaved changes: closing the tab asks (the browser's own question), and a tap on a link or the app bar's Back
 * outside the panel is held while the panel asks on the page (`pending`). Leaving taps the same thing again.
 */
function useLeaveGuard(dirty: boolean, panel: RefObject<HTMLElement | null>) {
  const [pending, setPending] = useState<HTMLElement | null>(null);
  const pass = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      if (pass.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.("a[href], .dr-appbar > button") as HTMLElement | null;
      if (!el || panel.current?.contains(el)) return;
      if (el instanceof HTMLAnchorElement) {
        if ((el.target && el.target !== "_self") || el.hasAttribute("download")) return;
        const to = new URL(el.href, location.href);
        if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      }
      e.preventDefault(); e.stopPropagation();
      setPending(el);
    };
    addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    return () => { removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true); };
  }, [dirty, panel]);
  const go = () => {
    const el = pending;
    setPending(null);
    if (!el?.isConnected) return;
    pass.current = true;
    try { el.click(); } finally { pass.current = false; }
  };
  return { pending: dirty ? pending : null, go, stay: () => setPending(null) };
}

/** A checkbox that shows "some" as well as all and none (the "all in this track" helpers). */
function TriBox({ all, some, label, disabled, onChange }: { all: boolean; some: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !all; }, [all, some]);
  return <input ref={ref} type="checkbox" checked={all} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;
}

/** /admin/courses: the org admin's own organization. */
export function OrgCoursesPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { orgId } = useAuth();
  const orgQ = useOrg(orgId);
  const membersQ = useMembers(orgId);
  const org = orgQ.data;
  return (
    <>
      <AppBar title={t("oc.title")} onBack={() => nav("/admin")} backLabel={t("common.back")} />
      <main className="screen wide stack-lg">
        {orgQ.error && !org ? <p className="notice err">{refusalText(orgQ.error, t)}</p>
          : !org ? <p className="muted" aria-busy="true">{t("adm.loading")}</p>
          : <OrgCoursesPanel key={org.id} org={org} members={membersQ.data} membersFailed={!!membersQ.error && !membersQ.data} onSaved={orgQ.reload} />}
      </main>
    </>
  );
}

/**
 * The panel itself. `members`: the organization's people, read once by the page (undefined while that read is on its
 * way): they give the classes and how many people each column covers.
 */
export function OrgCoursesPanel({ org, members, membersFailed, onSaved }: { org: Org; members?: Profile[]; membersFailed?: boolean; onSaved?: () => void }) {
  const { t, L } = useI18n();
  const tracks = useTracks();
  const { orgId: mine } = useAuth();
  const wide = useWide();
  const panel = useRef<HTMLElement>(null);
  const catalog = useOrgCatalog(org.id, mine === org.id);
  const first = useMemo(() => readOrgCourses(org.courses), [org.courses]);
  const [base, setBase] = useState<OrgCourses>(first);
  const [mode, setMode] = useState<OrgCourses["mode"]>(first.mode);
  const [lists, setLists] = useState<Lists>(() => toLists(first));
  const [prefilled, setPrefilled] = useState(false);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("t");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // Every course on offer, by track in the platform's order (visible tracks: members never see the others).
  const units = useMemo(() => {
    const list = catalog.data?.units ?? [];
    const rank = (u: CatalogEntry) => (u.teach ? 1 : audienceOf(u) === "students" ? 2 : 0);
    return tracks.visible.map((tr) => ({ tr, list: list.filter((u) => u.track === tr.id)
      .sort((a, b) => a.level - b.level || rank(a) - rank(b) || a.id.localeCompare(b.id, "en", { numeric: true })) })).filter((g) => g.list.length);
  }, [catalog.data, tracks.visible]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return units;
    return units.map((g) => ({ ...g, list: g.list.filter((u) => [L(u.title), u.title.en, u.id].some((x) => x?.toLowerCase().includes(s))) })).filter((g) => g.list.length);
  }, [units, q, L]);

  // All teachers, all students, then each class among the members (and any class a saved choice still names).
  const cols = useMemo<Col[]>(() => {
    const people = (members ?? []).filter((m) => m.role === "teacher" || m.role === "student");
    const count = (f: (m: Profile) => boolean) => (members ? people.filter(f).length : null);
    const names = new Set([...people.map((m) => m.group ?? "").filter(classNameOk), ...lists.g.keys()]);
    const classes = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map<Col>((g) => {
      const inIt = people.filter((m) => m.group === g);
      const aud = new Set(inIt.map((m): Audience => (m.role === "student" ? "students" : "teachers")));
      return { key: `g:${g}`, name: g, people: count((m) => m.group === g), aud: aud.size ? aud : null, gone: !!members && !inIt.length };
    });
    return [
      { key: "t", name: t("oc.allTeachers"), people: count((m) => m.role === "teacher"), aud: new Set<Audience>(["teachers"]) },
      { key: "s", name: t("oc.allStudents"), people: count((m) => m.role === "student"), aud: new Set<Audience>(["students"]) },
      ...classes,
    ];
  }, [members, lists.g, t]);
  const col = cols.find((c) => c.key === who) ?? cols[0];

  const draft = fromLists(mode, lists);
  const checked = checkOrgCourses(draft);
  const value = "value" in checked ? checked.value : draft;
  const problem = "problem" in checked ? checked.problem : null;
  const dirty = JSON.stringify(value) !== JSON.stringify(base);
  const guard = useLeaveGuard(dirty, panel);

  // The first time an organization chooses, every course starts ticked for its teachers and students: the admin
  // unticks what people shouldn't see, rather than everyone losing every course until they tick each one. Chosen
  // before the courses have loaded, it happens when they arrive.
  const [fill, setFill] = useState(false);
  useEffect(() => {
    if (!fill || !catalog.data) return;
    setFill(false);
    if (lists.t.size || lists.s.size || lists.g.size) return;
    const every = units.flatMap((g) => g.list);
    setLists({ t: new Set(every.filter((u) => audienceOf(u) === "teachers").map((u) => u.id)), s: new Set(every.filter((u) => audienceOf(u) === "students").map((u) => u.id)), g: new Map() });
    setPrefilled(true);
  }, [fill, catalog.data, units]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (m: OrgCourses["mode"]) => {
    setMsg(null);
    setMode(m);
    if (m === "chosen" && base.mode === "all") setFill(true);
  };
  const tick = (key: string, ids: string[], on: boolean) => { setMsg(null); setLists((l) => withTicks(l, key, ids, on)); };
  const ticked = (c: Col) => {
    const set = listOf(lists, c.key);
    return units.reduce((n, g) => n + g.list.filter((u) => applies(c, u) && set.has(u.id)).length, 0);
  };
  const save = async (): Promise<boolean> => {
    if (problem) { setMsg({ ok: false, text: t(PROBLEM[problem]) }); return false; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.setOrgCourses({ orgId: org.id, courses: value });
      setBase(r.courses);
      setPrefilled(false);
      setMsg({ ok: true, text: t("oc.saved") });
      onSaved?.();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: refusalText(e, t) });
      return false;
    } finally { setBusy(false); }
  };

  const courseMeta = (u: CatalogEntry) => (
    <>
      <span className="pill">{tracks.levelName(u.track, u.level)}</span>
      <span className="pill">{t(u.teach ? "home.forUni" : audienceOf(u) === "students" ? "home.forStudents" : "home.forTeachers")}</span>
      {!u.available && <span className="pill">{t("common.comingSoon")}</span>}
    </>
  );
  const counts = (c: Col) => [t("oc.people", { n: c.people ?? "…" }), mode === "chosen" ? t("oc.courses", { n: ticked(c) }) : null].filter(Boolean).join(t("common.sep"));
  const trackBox = (c: Col, list: CatalogEntry[], trackName: string) => {
    const ids = list.filter((u) => applies(c, u)).map((u) => u.id);
    const set = listOf(lists, c.key);
    const on = ids.filter((id) => set.has(id)).length;
    return <TriBox all={ids.length > 0 && on === ids.length} some={on > 0} disabled={!ids.length} label={t("oc.allInTrack", { who: c.name, track: trackName })} onChange={(v) => tick(c.key, ids, v)} />;
  };

  let body: ReactNode = null;
  if (catalog.error && !catalog.data) body = <EmptyState tone="error" title={t("oc.loadFailed")} action={<Button size="sm" icon="sync" onClick={catalog.retry}>{t("common.retry")}</Button>} />;
  else if (!catalog.data) body = <p className="muted" aria-busy="true">{t("oc.loading")}</p>;
  else if (mode === "chosen") body = (
    <>
      {prefilled && <p className="notice">{t("oc.prefilled")}</p>}
      <p className="muted small">{t("oc.forThem")}</p>
      {membersFailed && <p className="notice err">{t("oc.membersFailed")}</p>}
      <input type="search" className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("oc.search")} aria-label={t("oc.search")} />
      {!units.length ? <p className="muted">{t("oc.noCourses")}</p> : !shown.length ? <p className="muted">{t("oc.noMatch")}</p> : wide ? (
        <div className="table-wrap">
          <table className="oc-grid">
            <thead>
              <tr>
                <th scope="col">{t("oc.course")}</th>
                {cols.map((c) => <th key={c.key} scope="col"><span className="oc-col-name"><bdi>{c.name}</bdi></span><small>{counts(c)}</small>{c.gone && <small>{t("oc.noOne")}</small>}</th>)}
              </tr>
            </thead>
            {shown.map(({ tr, list }) => (
              <tbody key={tr.id}>
                <tr className="oc-track">
                  <th scope="rowgroup"><TrackChip track={tr.id} solid>{tracks.name(tr.id)}</TrackChip><small>{t("oc.allIn")}</small></th>
                  {cols.map((c) => <td key={c.key}><label className="oc-cell">{trackBox(c, list, tracks.name(tr.id))}</label></td>)}
                </tr>
                {list.map((u) => (
                  <tr key={u.id}>
                    <th scope="row"><span className="oc-title">{L(u.title)}</span><span className="oc-meta">{courseMeta(u)}</span></th>
                    {cols.map((c) => applies(c, u)
                      ? <td key={c.key}><label className="oc-cell"><input type="checkbox" checked={listOf(lists, c.key).has(u.id)} onChange={(e) => tick(c.key, [u.id], e.target.checked)}
                          aria-label={t("oc.cell", { who: c.name, course: L(u.title) })} /></label></td>
                      : <td key={c.key} className="oc-na"><span aria-hidden>—</span><span className="oc-sr">{t("oc.notFor")}</span></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <>
          <h4 className="oc-h">{t("oc.who")}</h4>
          <div className="oc-who" role="group" aria-label={t("oc.who")}>
            {cols.map((c) => (
              <button key={c.key} type="button" className="oc-who-btn" aria-pressed={c.key === col.key} onClick={() => setWho(c.key)}>
                <strong><bdi>{c.name}</bdi></strong><small>{counts(c)}</small>{c.gone && <small>{t("oc.noOne")}</small>}
              </button>
            ))}
          </div>
          <h4 className="oc-h">{t("oc.whatFor", { who: col.name })}</h4>
          {shown.map(({ tr, list }) => {
            const mineHere = list.filter((u) => applies(col, u));
            if (!mineHere.length) return null;
            const set = listOf(lists, col.key);
            return (
              <section key={tr.id} className="oc-list" aria-label={tracks.name(tr.id)}>
                <div className="oc-list-head">
                  <TrackChip track={tr.id} solid>{tracks.name(tr.id)}</TrackChip>
                  <label className="oc-row">{trackBox(col, mineHere, tracks.name(tr.id))}<span>{t("oc.allIn")}</span></label>
                </div>
                {mineHere.map((u) => (
                  <label key={u.id} className="oc-row">
                    <input type="checkbox" checked={set.has(u.id)} onChange={(e) => tick(col.key, [u.id], e.target.checked)} />
                    <span className="oc-row-text"><span className="oc-title">{L(u.title)}</span><span className="oc-meta">{courseMeta(u)}</span></span>
                  </label>
                ))}
              </section>
            );
          })}
          {shown.every(({ list }) => !list.some((u) => applies(col, u))) && <p className="muted">{t("oc.noneFor")}</p>}
        </>
      )}
    </>
  );

  return (
    <section ref={panel} className="panel stack" aria-labelledby={`oc-h-${org.id}`}>
      <h3 id={`oc-h-${org.id}`}>{t("oc.panelTitle")}</h3>
      <p className="muted small">{t("oc.intro")}</p>
      <div className="oc-modes" role="radiogroup" aria-label={t("oc.title")}>
        <ChoiceCard icon="learn" title={t("oc.modeAll")} description={t("oc.modeAllD")} selected={mode === "all"} onClick={() => choose("all")} />
        <ChoiceCard icon="check" title={t("oc.modeChosen")} description={t("oc.modeChosenD")} selected={mode === "chosen"} onClick={() => choose("chosen")} />
      </div>
      <p className="muted small">{t("oc.when")}</p>
      {mode === "chosen" && <p className="muted small">{t("oc.adminsAll")}</p>}
      {body}
      <div className="oc-bar">
        {guard.pending ? (
          <div className="notice stack-sm" role="alert">
            <span>{t("oc.leaveConfirm")}</span>
            <div className="row-gap">
              <Button size="sm" autoFocus loading={busy} disabled={!!problem} onClick={async () => { if (await save()) guard.go(); }}>{t("oc.saveLeave")}</Button>
              <Button size="sm" variant="secondary" onClick={guard.go}>{t("oc.leaveAnyway")}</Button>
              <Button size="sm" variant="ghost" onClick={guard.stay}>{t("oc.stay")}</Button>
            </div>
          </div>
        ) : (
          <>
            <span className="oc-bar-state" role="status">{problem ? t(PROBLEM[problem]) : dirty ? t("oc.unsaved") : msg?.ok ? msg.text : t("oc.allSaved")}</span>
            <Button size="sm" icon="check" loading={busy} disabled={!dirty || !!problem || (mode === "chosen" && !catalog.data)} onClick={() => { void save(); }}>{t("oc.save")}</Button>
          </>
        )}
      </div>
      {msg && !msg.ok && <p className="notice err" role="alert">{msg.text}</p>}
    </section>
  );
}
