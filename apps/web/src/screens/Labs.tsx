import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { onMeteredConnection } from "../platform";
import { CATEGORIES, categoryOf } from "../labs/categories";
import { LAB_METAS, LADDER, labMeta, nextLab } from "../labs/catalog";
import { LabEmbed, saveAllLabs } from "../labs/loader";
import { matchKey } from "../labs/kit/text";
import type { LabMeta, Track } from "../labs/types";
import "../styles/labs.css";

const TRACKS: (Track | "all")[] = ["all", "ai", "iot", "cyber"];

/** /labs: every lab as a card, by shelf, with the AI ladder first. */
export function Labs() {
  const { t, L, num } = useI18n();
  const [track, setTrack] = useState<Track | "all">("all");
  const [q, setQ] = useState("");
  const query = matchKey(q.trim());
  const hits = useMemo(() => LAB_METAS.filter((m) => (track === "all" || categoryOf(m.category).track === track)
    && (!query || [m.title.en, m.title.ar, m.summary.en, m.summary.ar].some((s) => matchKey(s).includes(query)))), [track, query]);
  const shelves = CATEGORIES.map((c) => ({ c, apps: hits.filter((m) => m.category === c.id) })).filter((s) => s.apps.length);
  return (
    <>
      <AppBar title={t("lab.title")} />
      <main className="screen wide stack-lg lb-labs">
        <p className="lead">{t("lab.intro")}</p>
        <div className="lb-tools">
          <input type="search" className="lb-search" placeholder={t("labs.search")} aria-label={t("labs.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="lb-chips" role="radiogroup" aria-label={t("labs.tracks")}>
            {TRACKS.map((tr) => (
              <button key={tr} type="button" role="radio" aria-checked={track === tr} className={track === tr ? "lb-chip is-on" : "lb-chip"} onClick={() => setTrack(tr)}>
                {tr !== "all" && <Icon name={tr} size={18} />}{tr === "all" ? t("labs.all") : t(`track.${tr}`)}
              </button>
            ))}
          </div>
        </div>
        {(track === "all" || track === "ai") && !query && <Ladder />}
        {shelves.length === 0 && <EmptyState icon="search" title={t("labs.none")} />}
        {shelves.map(({ c, apps }) => (
          <section key={c.id} className="lb-cat" aria-labelledby={`lb-cat-${c.id}`}>
            <h2 id={`lb-cat-${c.id}`} className="section-title">{L(c.name)} <span className="muted small">{t("labs.count", { n: apps.length })}</span></h2>
            <div className="lb-cards">{apps.map((m) => <LabCard key={m.id} m={m} />)}</div>
          </section>
        ))}
        <SaveLabs />
        <p className="muted small">{t("labs.total", { n: num(LAB_METAS.length) })}</p>
      </main>
    </>
  );
}

function LabCard({ m }: { m: LabMeta }) {
  const { t, L } = useI18n();
  const nav = useNavigate();
  const { state } = useStore();
  const track = categoryOf(m.category).track;
  const done = !!state.labsDone?.[m.id];
  return (
    <a className={`lb-card is-${track}`} href={`/labs/${m.id}`} onClick={(e) => { e.preventDefault(); nav(`/labs/${m.id}`); }}>
      <span className="lb-card-top"><span className="lb-card-icon" aria-hidden><Icon name={track} size={20} /></span>{done && <span className="lb-done"><Icon name="check" size={16} />{t("labs.done")}</span>}</span>
      <strong>{L(m.title)}</strong>
      <span className="lb-card-sum">{L(m.summary)}</span>
      <span className="lb-card-meta"><span className="lb-level">{t(`labs.level${m.level}` as "labs.level1")}</span><span>{t("common.minutes", { n: m.minutes })}</span></span>
    </a>
  );
}

/** One neuron → networks → vision → language models → decision models, numbered. */
function Ladder() {
  const { t, L, num } = useI18n();
  const nav = useNavigate();
  const { state } = useStore();
  const [all, setAll] = useState(false);
  if (!LADDER.length) return null;
  // Compact by default (the ladder is long on a phone): the next few steps from the first one not done yet.
  const SHOW = 6, next = Math.max(0, LADDER.findIndex((m) => !state.labsDone?.[m.id]));
  const from = Math.max(0, Math.min(next, LADDER.length - SHOW));
  const rungs = all ? LADDER : LADDER.slice(from, from + SHOW);
  return (
    <section className="lb-ladder-wrap" aria-labelledby="lb-ladder-h">
      <h2 id="lb-ladder-h" className="section-title">{t("labs.ladder")}</h2>
      <p className="muted">{t("labs.ladderBody")}</p>
      <ol className="lb-ladder">
        {rungs.map((m) => (
          <li key={m.id}>
            <a className={state.labsDone?.[m.id] ? "lb-rung is-done" : "lb-rung"} href={`/labs/${m.id}`} onClick={(e) => { e.preventDefault(); nav(`/labs/${m.id}`); }}>
              <span className="lb-rung-n">{state.labsDone?.[m.id] ? <Icon name="check" size={16} /> : num(m.ladder!)}</span><span>{L(m.title)}</span>
            </a>
          </li>
        ))}
      </ol>
      {LADDER.length > SHOW && (
        <div><Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t("labs.ladderLess") : t("labs.ladderAll", { n: LADDER.length })}</Button></div>
      )}
    </section>
  );
}

/** "Save all labs for offline": the size first (labs-manifest.json, made at build time), then every lab chunk. */
function SaveLabs() {
  const { t, num } = useI18n();
  const { state } = useStore();
  const [mb, setMb] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<"" | "saved" | "failed">(() => { try { return localStorage.getItem("darsi:labsSaved") === document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src ? "saved" : ""; } catch { return ""; } });
  useEffect(() => { fetch("/labs-manifest.json").then((r) => (r.ok ? r.json() : null)).then((m: { total?: number } | null) => m?.total && setMb(Math.max(0.1, Math.round(m.total / 1e5) / 10))).catch(() => {}); }, []);
  const blocked = state.dataSaver && onMeteredConnection();
  const save = async () => {
    setStatus(""); setProgress({ done: 0, total: 1 });
    try {
      await saveAllLabs((done, total) => setProgress({ done, total }));
      setStatus("saved");
      try { localStorage.setItem("darsi:labsSaved", document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src ?? "1"); } catch { /* private mode */ }
    } catch { setStatus("failed"); } finally { setProgress(null); }
  };
  return (
    <section className="panel stack lb-save">
      {status === "saved" ? <p className="notice ok" role="status"><Icon name="offline" size={18} /> {t("labs.saved")}</p> : <>
        {blocked && <p className="notice">{t("dl.dataSaver")}</p>}
        <Button variant="secondary" icon="install" loading={!!progress} disabled={blocked} onClick={() => { void save(); }}>
          {progress ? t("labs.saving", { done: progress.done, total: progress.total }) : mb ? t("labs.saveAllMb", { mb: num(mb) }) : t("labs.saveAll")}
        </Button>
        {status === "failed" && <p className="notice err" role="alert">{t("labs.saveFailed")}</p>}
      </>}
    </section>
  );
}

/** /labs/:id: one lab on its own, then the next one. */
export function LabApp() {
  const { id = "" } = useParams();
  const { t, L } = useI18n();
  const nav = useNavigate();
  const { dispatch } = useStore();
  const meta = labMeta(id);
  const next = nextLab(id);
  return (
    <>
      <AppBar title={meta ? L(meta.title) : t("lab.title")} onBack={() => nav("/labs")} backLabel={t("common.back")} />
      <main className="screen stack-lg lb-app">
        <LabEmbed id={id} onDone={() => dispatch({ type: "labDone", id })} />
        {next && (
          <a className={`lb-next is-${categoryOf(next.category).track}`} href={`/labs/${next.id}`} onClick={(e) => { e.preventDefault(); nav(`/labs/${next.id}`); }}>
            <span className="muted small">{t("labs.next")}</span><strong>{L(next.title)}</strong><span className="small">{L(next.summary)}</span>
          </a>
        )}
      </main>
    </>
  );
}
