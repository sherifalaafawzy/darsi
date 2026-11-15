import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Icon } from "@darsi/design-system";
import { displayLogin } from "../auth/api";
import { scoredOf, type Profile } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { daysSince } from "./data";
import { waitingOf } from "./review";
import { k } from "./peopleStrings";
import "./strings";

/** A person's page at its Projects tab. */
const projectsOf = (path: string) => `${path}${path.includes("?") ? "&" : "?"}tab=projects`;

/** How many rows a paged table draws at first, and how many more each "Show more" adds. */
export const PEOPLE_PAGE = 100;

/**
 * "today", "yesterday", "5 days ago". The days go to t() as a number, so it picks the plural form where the language
 * has one: «منذ يومين», «منذ ٥ أيام», «منذ ١١ يومًا» (adm.daysAgo.* in admin/strings, loaded with every admin screen).
 */
export function lastActiveText(iso: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) {
  const d = daysSince(iso);
  return d === Infinity ? t("adm.never") : d < 1 ? t("adm.today") : d < 2 ? t("adm.yesterday") : t("adm.daysAgo", { n: Math.floor(d) });
}

/**
 * A login for a narrow card: an address may break before its "@" (its name on one line, its domain on the next), not
 * in the middle of a word. Nothing is added to the text: it copies and searches as it was.
 */
export function LoginText({ value }: { value: string }) {
  const at = value.lastIndexOf("@");
  return at > 0 ? <>{value.slice(0, at)}<wbr />{value.slice(at)}</> : <>{value}</>;
}
/** For a cell whose value is only a dash: on a phone's card the pair is left out (base.css `data-empty`). */
export const emptyCell = (empty: boolean) => (empty ? { "data-empty": "" } : null);

/**
 * On phones each row is a card (base.css .data-table): the person across its top (`data-cell="main"`), the select
 * box at the inline end of that line (`data-cell="end"`), then the short values under their labels, two to a line.
 * `review`: a column of each person's projects waiting for a review (review.ts), empty (hidden on phones) when none.
 * `pick`: a first column of checkboxes, for changing several people at once (the org dashboard).
 * `paged`: only the first PEOPLE_PAGE rows are drawn, with "Show more" under them. An organization has thousands of
 * members, and a row each made every keystroke in the search box redraw them all. Sorting, searching, counting and
 * selecting stay the caller's, over all of `rows`; a new `resetOn` (the search and sort as text) starts at the top again.
 */
export function PeopleTable({ rows, to, review, pick, paged, resetOn = "" }: { rows: Profile[]; to: (m: Profile) => string; review?: boolean;
  pick?: { selected: Set<string>; toggle: (uid: string, on: boolean) => void }; paged?: boolean; resetOn?: string }) {
  const { t, num } = useI18n();
  const [more, setMore] = useState({ on: resetOn, n: PEOPLE_PAGE });
  if (more.on !== resetOn) setMore({ on: resetOn, n: PEOPLE_PAGE });
  const n = more.on === resetOn ? more.n : PEOPLE_PAGE;
  const shown = paged && rows.length > n ? rows.slice(0, n) : rows;
  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr>{pick && <th>{t("adm.select")}</th>}<th>{t("col.name")}</th>{review && <th className="num">{t("col.toReview")}</th>}<th>{t("col.role")}</th><th>{t("col.group")}</th><th className="num">{t("col.lessons")}</th><th className="num">{t("col.accuracy")}</th><th>{t("col.last")}</th></tr></thead>
          <tbody>{shown.map((m) => (
            <tr key={m.uid}>
              {pick && <td data-cell="end" data-label={t("adm.select")}><label className="pick-cell"><input type="checkbox" checked={pick.selected.has(m.uid)} onChange={(e) => pick.toggle(m.uid, e.target.checked)} aria-label={t("adm.selectOne", { name: m.name || displayLogin(m.email ?? "") })} /></label></td>}
              <td data-cell="main" data-label={t("col.name")}><Link to={to(m)} className="person-link"><span className="avatar sm" aria-hidden>{(m.name || "?").slice(0, 1)}</span><span><strong>{m.name || "—"}</strong><small dir="ltr"><LoginText value={displayLogin(m.email ?? "")} /></small></span></Link>{m.mustChangePassword && <span className="pill-warn" role="img" aria-label={t("adm.firstSignIn")} title={t("adm.firstSignIn")}><Icon name="lock" size={14} /></span>}
                {/* Locked out by an admin: said in words, since Restore is offered for exactly these rows. */}
                {m.suspended ? <span className="pill-warn"><Icon name="close" size={14} />{t(k("pp.suspended"))}</span> : null}</td>
              {/* The count opens the person's Projects tab (?tab=projects), on the admin's and the teacher's page alike: the reviews are there. */}
              {review && <td data-label={t("col.toReview")} className="num">{waitingOf(m) > 0
                ? <Link to={projectsOf(to(m))} className="person-link" aria-label={t(k("pp.reviewLink"), { name: isolate(m.name || displayLogin(m.email ?? "")), n: waitingOf(m) })}><span className="status status-submitted">{num(waitingOf(m))}</span></Link>
                : null}</td>}
              <td data-label={t("col.role")} {...emptyCell(!m.role)}>{m.role ? t(`rn.${m.role}` as "rn.student") : "—"}</td>
              <td data-label={t("col.group")} {...emptyCell(m.group == null)}>{m.group ?? "—"}</td>
              <td data-label={t("col.lessons")} className="num">{num(m.summary?.lessonsDone ?? 0)}</td>
              <td data-label={t("col.accuracy")} className="num" {...emptyCell(!scoredOf(m.summary))}>{scoredOf(m.summary) ? num(m.summary!.avgAccuracy, { style: "percent" }) : "—"}</td>
              <td data-label={t("col.last")}>{lastActiveText(m.summary?.lastActive ?? (m as Profile & { lastActive?: string }).lastActive, t)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {shown.length < rows.length && (
        <div className="row-gap">
          <Button size="sm" variant="secondary" onClick={() => setMore({ on: resetOn, n: n + PEOPLE_PAGE })}>{t(k("pp.showMore"), { n: Math.min(PEOPLE_PAGE, rows.length - shown.length) })}</Button>
          <span className="muted small" role="status">{t(k("pp.showing"), { n: shown.length, total: rows.length })}</span>
        </div>
      )}
    </>
  );
}
