import { useState } from "react";
import { Link } from "react-router-dom";
import { AppBar, Button, EmptyState } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n, type MessageKey } from "../i18n";
import { errorText } from "../staff/errors";
import { ErrorNote } from "../staff/LoadState";
import { setFeedbackStatus, useFeedback, useFeedbackSummary, type FeedbackDoc } from "./data";
import { Tabs, TabPanel, useTab, type TabDef } from "./Tabs";
import "../styles/admin.css";
import "./strings";

/**
 * /super/feedback: what people sent with "Share feedback" (TECHNICAL.md "Feedback"), for platform admins. The figures
 * (counts and averages, in all and in the last 30 days, and how many gave each number of stars) are counted on the
 * server; the list is read once when opened, newest first, the new ones by default, a page at a time.
 */
const PAGE = 30;
const DAY = 864e5;
const ROLES = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const TOPICS = ["lessons", "videos", "labs", "app", "other"];
const STATUS: Record<FeedbackDoc["status"], MessageKey> = { new: "fbk.statusNew", read: "fbk.statusRead", archived: "fbk.statusArchived" };

/** Five stars as text, for the eye; the number is said in words beside it. */
const stars = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));

function Item({ f, onChanged }: { f: FeedbackDoc; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [busy, setBusy] = useState<FeedbackDoc["status"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const when = f.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(f.createdAt.seconds * 1000)) : "";
  const status = async (s: FeedbackDoc["status"]) => {
    if (!user || busy) return;
    setBusy(s); setErr(null);
    try { await setFeedbackStatus(f.id, s, user.uid); onChanged(); } catch (e) { setErr(errorText(e, t, locale)); } finally { setBusy(null); }
  };
  return (
    <article className="panel stack">
      <p className="fbk-stars"><span aria-hidden="true">{stars(f.rating)}</span> <span>{t("fb.starN", { n: f.rating })}</span></p>
      <p className="muted small">
        <span className="pill">{t(STATUS[f.status] ?? "fbk.statusNew")}</span>{" "}
        {when}{t("common.sep")}
        {f.user ? <Link className="person-link" to={`/super/people/${f.user.uid}`}><bdi>{f.user.name || f.user.email || f.user.uid}</bdi></Link> : t("fbk.guest")}
        {f.user && <>{t("common.sep")}{ROLES.includes(f.user.role) ? t(`rn.${f.user.role}` as MessageKey) : f.user.role}</>}
      </p>
      {f.text ? <p className="fbk-text">{f.text}</p> : <p className="muted small">{t("fbk.noComment")}</p>}
      <p className="small">
        {f.topic && TOPICS.includes(f.topic) && <><b>{t("fbk.topic")}:</b> {t(`fbk.t.${f.topic}` as MessageKey)}{t("common.sep")}</>}
        {f.unitId && <><b>{t("fbk.course")}:</b> <bdi dir="ltr"><code>{f.unitId}</code></bdi>{t("common.sep")}</>}
        <b>{t("fbk.page")}:</b> <bdi dir="ltr"><code>{f.path || "—"}</code></bdi>
      </p>
      {err && <p className="err-text" role="alert">{err}</p>}
      <div className="row-gap">
        {/* While one of them saves, the others wait: two status writes at once would leave whichever landed last. */}
        {f.status !== "read" && <Button size="sm" loading={busy === "read"} disabled={!!busy && busy !== "read"} onClick={() => void status("read")}>{t("fbk.markRead")}</Button>}
        {f.status !== "archived" && <Button size="sm" variant="secondary" loading={busy === "archived"} disabled={!!busy && busy !== "archived"} onClick={() => void status("archived")}>{t("fbk.archive")}</Button>}
        {f.status !== "new" && <Button size="sm" variant="ghost" loading={busy === "new"} disabled={!!busy && busy !== "new"} onClick={() => void status("new")}>{t("fbk.markNew")}</Button>}
      </div>
    </article>
  );
}

function Summary() {
  const { t, num } = useI18n();
  const [since] = useState(() => Date.now() - 30 * DAY);
  const s = useFeedbackSummary(since);
  if (s.error) return <ErrorNote error={s.error} reload={s.reload} />;
  if (!s.data) return <div className="loading" aria-busy="true" />;
  const { all, recent, stars: by } = s.data;
  const avg = (v: number | null) => (v == null ? "—" : num(v, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const most = Math.max(1, ...by);
  return (
    <>
      <section className="tiles" aria-label={t("fbk.figures")}>
        <div className="tile"><span>{t("fbk.avgAll")}</span><strong>{avg(all.avg)}</strong><small>{t("fbk.ofN", { n: all.n })}</small></div>
        <div className="tile"><span>{t("fbk.avg30")}</span><strong>{avg(recent.avg)}</strong><small>{t("fbk.ofN", { n: recent.n })}</small></div>
      </section>
      <section className="panel" aria-label={t("fbk.byStars")}>
        <h3>{t("fbk.byStars")}</h3>
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="cov-row"><span className="cap-code">{t("fb.starN", { n })}</span><span className="cap-label" />
            <span className="cov-bar" aria-hidden><i style={{ inlineSize: `${Math.round((by[n - 1] / most) * 100)}%` }} /></span><span className="small">{num(by[n - 1])}</span></div>
        ))}
      </section>
    </>
  );
}

export function FeedbackPage() {
  const { t } = useI18n();
  const TABS: TabDef[] = [{ id: "new", label: t("fbk.new") }, { id: "all", label: t("fbk.all") }];
  const st = useTab(TABS);
  const onlyNew = st.tab !== "all";
  // "Show more" counts for the tab it was pressed on (as on /super/bugs).
  const [more, setMore] = useState({ tab: st.tab, max: PAGE });
  if (more.tab !== st.tab) setMore({ tab: st.tab, max: PAGE });
  const max = more.tab === st.tab ? more.max : PAGE;
  const list = useFeedback(onlyNew, max);
  const ready = !!list.data && !list.loading;
  const rows = ready ? list.data! : [];
  return (
    <>
      <AppBar title={t("fbk.title")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("fbk.intro")}</p>
        <Summary />
        <Tabs label={t("fbk.title")} tabs={TABS} action={<Button size="sm" variant="ghost" icon="sync" onClick={list.reload}>{t("fbk.refresh")}</Button>}>
          <TabPanel id={st.tab}>
            {list.error && !list.loading && <ErrorNote error={list.error} reload={list.reload} />}
            {!ready && (list.loading || !list.error) && <div className="loading" aria-busy="true" />}
            {ready && !rows.length && <EmptyState icon="check" title={onlyNew ? t("fbk.noneNew") : t("fbk.none")} />}
            {rows.map((f) => <Item key={f.id} f={f} onChanged={list.reload} />)}
            {rows.length === max && <div><Button variant="secondary" onClick={() => setMore({ tab: st.tab, max: max + PAGE })}>{t("fbk.more")}</Button></div>}
          </TabPanel>
        </Tabs>
      </main>
    </>
  );
}
