import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, TrackChip, TrackStylesProvider, TRACK_TONES, type IconName, type TrackStyle, type TrackTone } from "@darsi/design-system";
import { useTracks } from "../content/settings";
import { BUILTIN_TRACKS, MAX_LEVELS, mergeTracks } from "../content/tracks";
import type { LocalText, TrackDef } from "../content/types";
import { validateTracks, type Issue } from "../content/validate";
import { useI18n, useLanguages, type MessageKey } from "../i18n";
import { EditLangsProvider } from "./langs";
import { cmsApi, codeOf, conflictsOf, issuesOf } from "./api";
import { getSettings, unitsByTrack, type TrackUse } from "./data";
import { Check, LText, Text } from "./fields";
import "../styles/editor.css";
import "./strings";

/** Icons offered for new tracks (the built-in tracks' own icons stay theirs). */
export const TRACK_ICONS: IconName[] = ["learn", "book", "code", "chart", "flask", "globe", "heart", "leaf", "palette", "idea", "target", "award", "chat", "language", "video", "image", "link", "search"];
const BUILTIN_IDS = BUILTIN_TRACKS.map((t) => t.id);

/** "Data science" → "data-science": a suggested id, which the admin can change until the first save. Ids start with a letter. */
export function slugOf(name: string) {
  const s = name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (/^[0-9]/.test(s) ? `track-${s}` : s).slice(0, 24).replace(/-+$/, "");
}

interface Row { key: string; def: TrackDef; saved: boolean; idTouched?: boolean }
const rowsOf = (tracks: TrackDef[]): Row[] => tracks.map((def) => ({ key: def.id, def, saved: true }));
const strip = (rows: Row[]): TrackDef[] => rows.map(({ def }, order) => {
  const { builtIn: _b, ...t } = def;
  return JSON.parse(JSON.stringify({ ...t, order, levelNames: t.levelNames?.slice(0, t.levels).some((n) => n?.en?.trim()) ? t.levelNames.slice(0, t.levels) : undefined })) as TrackDef;
});

/**
 * /super/tracks: the tracks every unit uses (name, icon, colour, number of levels, order, hidden). One-shot reads;
 * "Save" sends the whole list to saveSettings, which refuses changes that would strand units and publishes
 * content/settings.json for phones.
 */
export function TracksPage() {
  const { t, L, num } = useI18n();
  const languages = useLanguages(); // track names in every language people can pick
  const nav = useNavigate();
  const { apply } = useTracks();
  const [rev, setRev] = useState<number | null>(null);
  const [base, setBase] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [usage, setUsage] = useState<Map<string, TrackUse[]>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    Promise.all([getSettings(), unitsByTrack()]).then(([s, u]) => { setRev(s.rev); setBase(rowsOf(s.tracks)); setRows(rowsOf(s.tracks)); setUsage(u); })
      .catch((e: Error) => setLoadErr(e.message));
  }, []);
  const dirty = useMemo(() => JSON.stringify(strip(rows)) !== JSON.stringify(strip(base)), [rows, base]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  const issues = useMemo(() => validateTracks(strip(rows), BUILTIN_IDS), [rows]);
  // Chips show the colour and icon being chosen, before they are saved.
  const styles = useMemo(() => Object.fromEntries(rows.map((r) => [r.def.id || r.key, { tone: r.def.tone, icon: r.def.icon } as TrackStyle])), [rows]);

  if (loadErr) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={loadErr} action={<Button size="sm" onClick={() => nav("/super/content")}>{t("common.back")}</Button>} /></main>;
  if (rev === null) return <div className="loading" aria-busy="true" />;

  const set = (key: string, patch: Partial<TrackDef>, extra: Partial<Row> = {}) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...extra, def: { ...r.def, ...patch } } : r))); setMsg(null); };
  const move = (i: number, d: -1 | 1) => setRows((rs) => { const n = [...rs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const add = () => {
    const used = new Set(rows.map((r) => r.def.tone));
    const key = `new-${Date.now().toString(36)}`;
    const tone = TRACK_TONES.find((x) => !used.has(x)) ?? "slate";
    setRows((rs) => [...rs, { key, saved: false, def: { id: "", name: { en: "", ar: "" }, icon: "book", tone, levels: 4, order: rs.length } }]);
    setOpen(key); setMsg(null);
  };
  const nameOf = (id: string) => L(rows.find((r) => r.def.id === id)?.def.name) || id;
  const unitNames = (ids: string[]) => ids.map((id) => L([...usage.values()].flat().find((u) => u.id === id)?.title) || id).join("، ");

  const save = async () => {
    setTried(true);
    if (issues.length) { setMsg({ ok: false, text: t("cms.tracks.errors", { n: issues.length }) }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await cmsApi.saveSettings({ rev, tracks: strip(rows) });
      // The saved list comes back without the built-in marks; merging puts them back.
      const next = rowsOf(mergeTracks(r.tracks));
      setRev(r.rev); setBase(next); setRows(next); setTried(false); apply(r.tracks);
      setMsg({ ok: true, text: t("cms.tracks.saved") });
    } catch (e) {
      const code = codeOf(e), conflicts = conflictsOf(e), n = issuesOf(e).length;
      if (code === "aborted") setMsg({ ok: false, text: t("cms.tracks.conflict") });
      else if (conflicts.length) setMsg({ ok: false, text: t("cms.tracks.blocked"), list: conflicts.map((c) =>
        t(c.reason === "removed" ? "cms.tracks.blockedRemoved" : "cms.tracks.blockedLevels", { name: nameOf(c.track) || c.track, units: unitNames(c.units) })) });
      else setMsg({ ok: false, text: n ? t("cms.tracks.errors", { n }) : (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <EditLangsProvider langs={languages.map((l) => l.code)}>
      <AppBar title={t("cms.tracks.title")} onBack={() => { if (!dirty || confirm(t("cms.leaveConfirm"))) nav("/super/content"); }} backLabel={t("common.back")} />
      <main className="screen wide stack-lg ed">
        <p className="muted">{t("cms.tracks.intro")}</p>
        <TrackStylesProvider styles={styles}><ol className="ed-tracks">
          {rows.map((r, i) => {
            const uses = usage.get(r.saved ? r.def.id : "") ?? [];
            const mine = issues.filter((x) => x.at.field?.startsWith(`tracks.${i}.`));
            return (
              <li key={r.key} className="ed-track">
                <div className="ed-item-head">
                  <button type="button" className="ed-toggle" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>
                    <TrackChip track={r.def.id || r.key}>{L(r.def.name) || t("cms.tracks.new")}</TrackChip>
                    <span className="muted small">{[t("cms.tracks.levelsCount", { n: num(r.def.levels) }), t("cms.tracks.usedBy", { n: num(uses.length) })].join(t("common.sep"))}</span>
                    {r.def.builtIn && <span className="pill">{t("cms.tracks.builtIn")}</span>}
                    {r.def.hidden && <span className="pill pill-warn">{t("cms.tracks.hidden")}</span>}
                    {tried && mine.length > 0 && <span className="ed-badge">{num(mine.length)}</span>}
                  </button>
                  <span className="ed-tools">
                    <Button size="sm" variant="ghost" iconOnly icon="up" disabled={i === 0} onClick={() => move(i, -1)}>{t("q.up")}</Button>
                    <Button size="sm" variant="ghost" iconOnly icon="down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>{t("q.down")}</Button>
                  </span>
                </div>
                {open === r.key && <TrackForm row={r} uses={uses} issues={tried ? mine : []} others={rows.filter((x) => x.key !== r.key)}
                  onChange={(patch, extra) => set(r.key, patch, extra)} onDelete={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setOpen(null); }} />}
              </li>
            );
          })}
        </ol></TrackStylesProvider>
        <Button variant="secondary" icon="edit" onClick={add}>{t("cms.tracks.add")}</Button>
      </main>
      <div className="ed-bar">
        <Button loading={busy} disabled={!dirty} icon="check" onClick={() => { void save(); }}>{t("cms.tracks.save")}</Button>
        {dirty && <Button variant="ghost" disabled={busy} onClick={() => { setRows(base); setMsg(null); setTried(false); }}>{t("cms.tracks.discard")}</Button>}
        {msg && <div className={msg.ok ? "notice ok" : "notice err"} role={msg.ok ? "status" : "alert"}>{msg.text}{msg.list && <ul>{msg.list.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}
      </div>
    </EditLangsProvider>
  );
}

const FIELD_LABEL: Record<string, MessageKey> = { id: "cms.tracks.id", name: "cms.tracks.name", summary: "cms.tracks.summary", icon: "cms.tracks.icon", tone: "cms.tracks.colour", levels: "cms.tracks.levels", levelNames: "cms.tracks.levelNames", order: "cms.tracks.title" };

function TrackForm({ row, uses, issues, others, onChange, onDelete }: {
  row: Row; uses: TrackUse[]; issues: Issue[]; others: Row[];
  onChange: (patch: Partial<TrackDef>, extra?: Partial<Row>) => void; onDelete: () => void;
}) {
  const { t, L, num } = useI18n();
  const d = row.def;
  const minLevels = Math.max(1, ...uses.map((u) => u.level));
  const toneUser = (tone: TrackTone) => others.find((o) => o.def.tone === tone);
  const levelNames = d.levelNames ?? [];
  const setName = (name: LocalText) => onChange(row.saved || row.idTouched ? { name } : { name, id: slugOf(name.en) });
  return (
    <div className="stack-lg ed-lesson-body">
      {issues.length > 0 && <ul className="ed-issues">{issues.map((x, k) => {
        const field = x.at.field?.split(".")[2] ?? "";
        return <li key={k} className="ed-issue is-error"><span className="ed-where">{FIELD_LABEL[field] ? t(FIELD_LABEL[field]) : field}</span><span>{t(`cms.issue.${x.code}` as MessageKey, { ...x.params })}</span></li>;
      })}</ul>}
      <LText label={t("cms.tracks.name")} value={d.name} onChange={setName} />
      {row.saved ? <p className="muted small">{t("cms.tracks.id")}: <span className="cap-code" dir="ltr">{d.id}</span></p>
        : <Text label={t("cms.tracks.id")} hint={t("cms.tracks.idHint")} dir="ltr" value={d.id} onChange={(id) => onChange({ id: id.toLowerCase().trim() }, { idTouched: true })} />}
      <LText label={t("cms.tracks.summary")} value={d.summary} onChange={(summary) => onChange({ summary })} multiline rows={2} />

      {d.builtIn ? <p className="notice">{t("cms.tracks.builtInHint")}</p> : (
        <>
          <fieldset className="ed-fieldset">
            <legend className="dr-field-label">{t("cms.tracks.colour")}</legend>
            <div className="ed-swatches" role="radiogroup" aria-label={t("cms.tracks.colour")}>
              {TRACK_TONES.map((tone) => {
                const by = toneUser(tone);
                return (
                  <button key={tone} type="button" role="radio" aria-checked={d.tone === tone} className={`ed-swatch dr-tr dr-tr-${tone}${d.tone === tone ? " is-on" : ""}`} onClick={() => onChange({ tone })}>
                    <span className="ed-swatch-dot" aria-hidden>{d.tone === tone && <Icon name="check" size={16} />}</span>
                    <span>{t(`cms.tone.${tone}` as MessageKey)}{by && <span className="muted small"> {t("cms.tone.usedBy", { name: L(by.def.name) || by.def.id })}</span>}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="ed-fieldset">
            <legend className="dr-field-label">{t("cms.tracks.icon")}</legend>
            <div className={`ed-icons dr-tr dr-tr-${d.tone}`} role="radiogroup" aria-label={t("cms.tracks.icon")}>
              {TRACK_ICONS.map((icon) => (
                <button key={icon} type="button" role="radio" aria-checked={d.icon === icon} aria-label={t(`cms.icon.${icon}` as MessageKey)} title={t(`cms.icon.${icon}` as MessageKey)}
                  className={`ed-icon${d.icon === icon ? " is-on" : ""}`} onClick={() => onChange({ icon })}><Icon name={icon} /></button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <fieldset className="ed-fieldset">
        <legend className="dr-field-label">{t("cms.tracks.levels")}</legend>
        <div className="ed-stepper">
          <Button size="sm" variant="secondary" aria-label={t("cms.tracks.fewer")} disabled={d.levels <= minLevels} onClick={() => onChange({ levels: d.levels - 1 })}>−</Button>
          <output className="ed-stepper-n" aria-live="polite">{num(d.levels)}</output>
          <Button size="sm" variant="secondary" aria-label={t("cms.tracks.more")} disabled={d.levels >= MAX_LEVELS} onClick={() => onChange({ levels: d.levels + 1 })}>+</Button>
        </div>
        {minLevels > 1 && <p className="muted small">{t("cms.tracks.levelsMin", { n: num(minLevels) })}</p>}
        <details className="ed-more">
          <summary>{t("cms.tracks.levelNames")}</summary>
          <div className="stack">
            {Array.from({ length: d.levels }, (_, k) => (
              <LText key={k} label={t("cms.tracks.levelName", { n: num(k + 1) })} value={levelNames[k] ?? { en: "", ar: "" }}
                onChange={(v) => { const n = Array.from({ length: d.levels }, (_, j) => levelNames[j] ?? { en: "", ar: "" }); n[k] = v; onChange({ levelNames: n }); }} />
            ))}
          </div>
        </details>
      </fieldset>

      <Check label={t("cms.tracks.hide")} checked={!!d.hidden} onChange={(hidden) => onChange({ hidden: hidden || undefined })} />
      <p className="muted small">{t("cms.tracks.hideHint")}</p>

      {!d.builtIn && (uses.length ? <p className="muted small">{t("cms.tracks.inUse")}</p>
        : <Button variant="ghost" icon="close" onClick={onDelete}>{t("cms.tracks.delete")}</Button>)}
    </div>
  );
}
