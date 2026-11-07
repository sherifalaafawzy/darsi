import type { Profile } from "../auth/types";
import { useI18n } from "../i18n";
import { FRAMEWORKS, framework, type Framework } from "../content/standards";
import { itemEvidence, standardsReport } from "./orgStats";
import "./strings";
import "../styles/analytics.css";

const LEVELS = ["or.lv0", "or.lv1", "or.lv2", "or.lv3"] as const;

/** Which framework to show, as a select; the crosswalks say they are Darsi's mapping. */
export function FrameworkPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, L } = useI18n();
  const fw = framework(value);
  return (
    <div className="stack-sm">
      <label className="or-pick"><span>{t("or.framework")}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{L(f.name)}</option>)}
        </select>
      </label>
      {fw && <p className="muted small">{fw.source}{t("common.sep")}{fw.crosswalk ? t("or.crosswalk") : t("or.direct")}</p>}
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  return <p className="or-legend small">{LEVELS.map((k, i) => <span key={k}><i className={`or-lv or-lv${i}`} aria-hidden />{t(k)}</span>)}</p>;
}

/**
 * A framework over a group of people: per item, how many have evidence, a bar of how many are at each strength
 * (not yet, emerging, developing, secure) and the average score on the lessons that count for it.
 */
export function StandardsTable({ people, fw }: { people: Profile[]; fw: Framework }) {
  const { t, L, num } = useI18n();
  const rows = standardsReport(people, fw);
  return (
    <div className="stack">
      <Legend />
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t("or.item")}</th><th className="num">{t("or.reached")}</th><th>{t("or.levels")}</th><th className="num">{t("col.accuracy")}</th></tr></thead>
        <tbody>{rows.map(({ item, levels, reached, avgAccuracy }) => (
          <tr key={item.id}>
            {/* One wrapper: on phones each cell is a flex row (label, value), and the code, name and level must wrap
                together in the value column instead of being squeezed side by side (base.css .data-table). */}
            <td data-label={t("or.item")}><div><span className="cap-code" dir="ltr">{item.id}</span> <strong>{L(item.label)}</strong>{item.level && <small> — {L(item.level)}</small>}{item.group && item.group !== item.label && <small className="or-sub">{L(item.group)}</small>}</div></td>
            <td data-label={t("or.reached")} className="num">{people.length ? num(reached / people.length, { style: "percent" }) : "—"}<small className="or-sub">{t("or.ofPeople", { n: reached, of: people.length })}</small></td>
            <td data-label={t("or.levels")} className="or-levels">
              <span className="or-stack" role="img" aria-label={LEVELS.map((k, i) => `${t(k)}: ${num(levels[i])}`).join(t("common.sep"))}>
                {levels.map((n, i) => n ? <i key={i} className={`or-lv or-lv${i}`} style={{ inlineSize: `${(n / Math.max(1, people.length)) * 100}%` }} /> : null)}
              </span>
            </td>
            <td data-label={t("col.accuracy")} className="num">{avgAccuracy === null ? "—" : num(avgAccuracy, { style: "percent" })}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/** The framework with the most evidence for this person (UNESCO first on a tie): where a person page opens. */
export function bestFramework(person: Profile, prefer: string) {
  const reached = (fw: Framework) => fw.items.filter((it) => itemEvidence(person, it).n > 0).length;
  const order = [framework(prefer)!, ...FRAMEWORKS.filter((f) => f.id !== prefer)];
  return order.reduce((best, f) => (reached(f) > reached(best) ? f : best), order[0]).id;
}

/** One person against a framework: each item's strength and their score on the lessons that count for it. */
export function PersonStandards({ person, fw }: { person: Profile; fw: Framework }) {
  const { t, L, num } = useI18n();
  return (
    <div className="stack">
      <Legend />
      <ul className="or-person">{fw.items.map((item) => {
        const e = itemEvidence(person, item);
        return (
          <li key={item.id}>
            <span className="cap-code" dir="ltr">{item.id}</span>
            <span className="or-name">{L(item.label)}{item.level ? ` — ${L(item.level)}` : ""}</span>
            <span className={`or-chip or-lv${e.level}`}>{t(LEVELS[e.level])}</span>
            <span className="num small">{e.n ? t("or.evidence", { n: e.n, score: e.acc === null ? "—" : num(e.acc, { style: "percent" }) }) : "—"}</span>
          </li>
        );
      })}</ul>
    </div>
  );
}
