import { useI18n } from "../i18n";
import "../styles/analytics.css";

/** Bars over time (days or weeks). Plain SVG, no chart library: the admin screens are lazy chunks and this is all they need. */
export function Bars({ data, label }: { data: Array<{ key: string; label: string; v: number }>; label: string }) {
  const { num } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.v));
  const W = data.length * 10, H = 60;
  return (
    <figure className="an-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${num(data.reduce((a, d) => a + d.v, 0))}`}>
        {data.map((d, i) => {
          const h = d.v ? Math.max(1.5, (d.v / max) * (H - 2)) : 0;
          return <rect key={d.key} className="an-bar" x={i * 10 + 1.5} y={H - h} width={7} height={h}><title>{`${d.label}: ${num(d.v)}`}</title></rect>;
        })}
      </svg>
      <figcaption className="an-axis"><span>{data[0]?.label}</span><span>{label}{"  "}<strong>{num(max)}</strong></span><span>{data[data.length - 1]?.label}</span></figcaption>
    </figure>
  );
}

/** A ranked list with a bar for each row's share of the largest. */
export function Ranked({ title, rows, name, empty, max: limit = 8 }: { title: string; rows: Array<[string, number]>; name?: (k: string) => string; empty: string; max?: number }) {
  const { num } = useI18n();
  const top = rows.slice(0, limit), max = Math.max(1, ...top.map((r) => r[1]));
  return (
    <section className="panel stack-sm"><h3>{title}</h3>
      {top.length === 0 ? <p className="muted small">{empty}</p> : (
        <ol className="an-ranked">{top.map(([k, v]) => (
          <li key={k}><span className="an-name">{name ? name(k) : k}</span><span className="an-meter" aria-hidden><i style={{ inlineSize: `${Math.round((v / max) * 100)}%` }} /></span><span className="num">{num(v)}</span></li>
        ))}</ol>
      )}
    </section>
  );
}

/** Seconds as hours (or minutes under an hour), in the page's language. */
export function useDuration() {
  const { num, t } = useI18n();
  return (sec: number) => (sec >= 3600 ? t("or.hours", { n: num(Math.round(sec / 360) / 10) }) : t("or.minutes", { n: num(Math.round(sec / 60)) }));
}
