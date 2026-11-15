import { Link, useNavigate } from "react-router-dom";
import { BrandMark, Button, Icon, LessonCard, Mark, ProgressBar, QuizOption, TrackChip, QuestionHeader, StreakCounter, trackClass, useTrackStyles } from "@darsi/design-system";
import { landing as C } from "./content";
import { useStore } from "../state/store";
import { useI18n, useLanguages } from "../i18n";
import { usePhrases } from "../i18n/phrases";
import type { LanguageDef } from "../content/types";
import type { SiteEntry } from "../content/sites";
import { SiteBlocks, useOrgPage } from "./SiteBlocks";
import { LeftOrgNote } from "../auth/LeftOrg";
import { LEGAL_DOCS, useLegal } from "../legal/published";
import { k } from "../legal/strings";
import "../styles/landing.css";

/**
 * Public home page: what Darsi is, how it works, who it is for, standards, FAQ. On an organization's own web address
 * (`site`, App from state/site.ts), that organization's page instead (SiteLanding).
 */
export function Landing({ site }: { site?: SiteEntry | null } = {}) {
  if (site) return <SiteLanding site={site} />;
  return <DarsiLanding />;
}

/**
 * The footer's links to the privacy notice and the terms of use, each once a platform admin has published it
 * (legal/published.ts: a plain fetch of one small public file, so guests still never load Firebase). Until the file
 * answers, and while nothing is published, there is no link and no room kept for one.
 */
function LegalLinks() {
  const { t } = useI18n();
  const legal = useLegal();
  return <>{LEGAL_DOCS.filter((d) => legal[d] !== null).map((d) => <p key={d}><Link to={`/${d}`}>{t(k(d === "privacy" ? "legal.privacy" : "legal.terms"))}</Link></p>)}</>;
}

/** The language switch in the top bar: one tap for two languages, a short menu of their own names for more. */
function LangSwitch() {
  const { lang, L } = useI18n();
  const languages = useLanguages();
  const { dispatch } = useStore();
  const setLang = (code: string) => dispatch({ type: "set", patch: { lang: code } });
  const others = languages.filter((l) => l.code !== lang);
  return others.length === 1
    ? <button type="button" className="lp-lang dr-other-script" onClick={() => setLang(others[0].code)} lang={others[0].code}>{others[0].native}</button>
    : <select className="lp-lang lp-lang-menu" aria-label={L(C.nav.language)} value={lang} onChange={(e) => setLang(e.target.value)}>
      {languages.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.native}</option>)}
    </select>;
}

/**
 * An organization's own web address, before signing in: its logo and name (App's BrandProvider), "with Darsi" when
 * Darsi's identity shows there, and the ways in. None of Darsi's marketing copy, which speaks about Darsi.
 */
function SiteLanding({ site }: { site: SiteEntry }) {
  const nav = useNavigate();
  const { lang, t } = useI18n();
  const { dispatch } = useStore();
  const L = (x: { en: string; ar: string }) => x[lang as "en" | "ar"] ?? x.en;
  const guest = () => { dispatch({ type: "set", patch: { guest: true } }); nav("/learn"); };
  // What its admins put on their homepage (the page builder), under the ways in.
  const page = useOrgPage(site.orgId);
  return (
    <div className="landing">
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><BrandMark size={36} /><span><bdi>{site.name}</bdi></span></Link>
        <div className="lp-actions">
          <LangSwitch />
          <Button size="sm" variant="ghost" onClick={() => nav("/signin")}>{t("auth.signIn")}</Button>
        </div>
      </header>
      <main className="lp-site">
        {/* Signed out by leaving an organization (Me): the app restarts here, so this says why. */}
        <LeftOrgNote />
        <BrandMark size={96} />
        <p className="lp-kicker">{L(C.site.welcome)}</p>
        <h1><bdi>{site.name}</bdi></h1>
        {site.darsi && <p className="lp-site-credit"><Mark size={20} />{t("org.withDarsi")}</p>}
        <p className="lp-lead">{L(C.site.body)}</p>
        <div className="lp-ctas">
          <Button iconEnd="next" onClick={() => nav("/signin")}>{t("auth.signIn")}</Button>
          <Button variant="secondary" onClick={() => nav("/signup")}>{t("auth.noAccount")}</Button>
          <Button variant="ghost" onClick={guest} title={t("guest.note")}>{t("guest.cta")}</Button>
        </div>
        <p className="lp-proof"><Icon name="offline" size={18} />{L(C.hero.proof)}</p>
      </main>
      {page && page.blocks.length > 0 && <SiteBlocks page={page} />}
      <footer className="lp-footer">
        <p><bdi>{site.name}</bdi>{site.darsi && <> — {t("org.withDarsi")}</>}</p>
        <LegalLinks />
        <p><Link to="/licences">{t("me.licences")}</Link></p>
      </footer>
    </div>
  );
}

function DarsiLanding() {
  const nav = useNavigate();
  const { lang, t, locale, L, num } = useI18n();
  const ready = usePhrases("landing");
  const languages = useLanguages();
  const { dispatch } = useStore();
  const styleOf = useTrackStyles();
  const guest = () => { dispatch({ type: "set", patch: { guest: true } }); nav("/learn"); };
  // A public page (static, outside the app): the Arabic copy for Arabic, the English one for every other language.
  const page = (path: string) => `${lang === "ar" ? "/ar" : ""}/${path}/`;
  /** A sentence with {languages}: the names of every language people can pick, each in its own script. */
  const withLanguages = (s: string) => { const [a, b] = s.split("{languages}"); return b === undefined ? s : <>{a}<LanguageList languages={languages} lang={lang} locale={locale} />{b}</>; };
  if (!ready) return <div className="loading" aria-busy="true" />;
  return (
    <div className="landing">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label={t("app.name")}><Mark size={36} /><span>{t("app.name")}</span></Link>
        <nav className="lp-links" aria-label={L(C.nav.sections)}>
          <a href="#how">{L(C.nav.approach)}</a><a href="#tracks">{L(C.nav.tracks)}</a><a href="#orgs">{L(C.nav.orgs)}</a><a href="#standards">{L(C.nav.standards)}</a><a href="#faq">{L(C.nav.faq)}</a>
        </nav>
        <div className="lp-actions">
          {/* Two languages: one tap switches. More (platform admins added some): a short menu of their own names. */}
          <LangSwitch />
          <Button size="sm" variant="ghost" onClick={() => nav("/signin")}>{L(C.nav.signIn)}</Button>
          <Button size="sm" onClick={() => nav("/signup")}>{L(C.nav.start)}</Button>
        </div>
      </header>

      {/* Signed out by leaving an organization (Me): the app restarts here, so this says why. */}
      <LeftOrgNote />
      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-kicker">{L(C.hero.kicker)}</p>
          <h1>{L(C.hero.title)}</h1>
          <p className="lp-lead">{L(C.hero.body)}</p>
          <div className="lp-ctas">
            <Button iconEnd="next" onClick={() => nav("/signup")}>{L(C.hero.primary)}</Button>
            <Button variant="secondary" icon="award" onClick={() => nav("/signup?org=1")}>{L(C.hero.secondary)}</Button>
            <Button variant="ghost" onClick={guest} title={t("guest.note")}>{t("guest.cta")}</Button>
          </div>
          <p className="lp-proof"><Icon name="offline" size={18} />{L(C.hero.proof)}</p>
        </div>
        {/* Decorative: real design-system buttons inside, so inert keeps them out of the tab order too. */}
        <div className="lp-hero-art" aria-hidden inert>
          <div className="lp-phone">
            <div className="lp-phone-top"><Mark size={24} /><strong>{L(C.mock.learn)}</strong><StreakCounter compact count={num(3)} /></div>
            <div className="lp-phone-body">
              <ProgressBar value={60} track="ai" thick ariaLabel="progress" />
              <QuestionHeader typeLabel={L(C.mock.choose)} prompt={L(C.mock.prompt)} />
              <QuizOption keyLabel={lang === "ar" ? "أ" : "A"}>{L(C.mock.wrong)}</QuizOption>
              <QuizOption keyLabel={lang === "ar" ? "ب" : "B"} state="correct" feedback={L(C.mock.why)}>{L(C.mock.right)}</QuizOption>
            </div>
          </div>
          <div className="lp-float-card"><LessonCard track="ai" offline offlineLabel={L(C.mock.offline)} trackLabel={L(C.mock.track)} title={L(C.mock.lesson)} meta={L(C.mock.meta)} progress={30} /></div>
        </div>
      </section>

      <section className="lp-section lp-why" aria-labelledby="why">
        <h2 id="why">{L(C.why.title)}</h2>
        <div className="lp-stats">{C.why.items.map((it, i) => <div key={i} className="lp-stat"><strong>{L(it.stat)}</strong><p>{L(it.text)}</p></div>)}</div>
        <p className="lp-note">{L(C.why.note)}</p>
      </section>

      <section className="lp-section" id="how" aria-labelledby="how-h">
        <h2 id="how-h">{L(C.how.title)}</h2>
        <ol className="lp-steps">{C.how.steps.map((s, i) => <li key={i}><span className="lp-step-n">{new Intl.NumberFormat(locale).format(i + 1)}</span><h3>{L(s.title)}</h3><p>{L(s.text)}</p></li>)}</ol>
      </section>

      <section className="lp-section" id="tracks" aria-labelledby="tracks-h">
        <h2 id="tracks-h">{L(C.tracks.title)}</h2>
        <p className="lp-levels">{L(C.tracks.levels)}</p>
        <div className="lp-tracks">{C.tracks.items.map((tr) => (
          <article key={tr.track} className={`lp-track ${trackClass(styleOf(tr.track))}`}>
            <TrackChip track={tr.track} solid>{L(tr.title)}</TrackChip>
            <ul>{tr.points.map((p, i) => <li key={i}><Icon name={styleOf(tr.track).icon} size={18} />{L(p)}</li>)}</ul>
            <a href={page(`courses/${tr.track}`)}>{L(C.explore.trackCourses)}</a>
          </article>
        ))}</div>
        <p className="lp-note">{L(C.tracks.note)}</p>
      </section>

      <section className="lp-section lp-band" aria-labelledby="real-h">
        <h2 id="real-h">{L(C.real.title)}</h2>
        <div className="lp-grid3">{C.real.items.map(([h, p], i) => <div key={i} className="lp-feature"><h3>{L(h)}</h3><p>{withLanguages(L(p))}</p></div>)}</div>
      </section>

      <section className="lp-section" id="orgs" aria-labelledby="orgs-h">
        <div className="lp-split">
          <div>
            <h2 id="orgs-h">{L(C.orgs.title)}</h2>
            <p className="lp-lead">{L(C.orgs.body)}</p>
            <Button icon="award" onClick={() => nav("/signup?org=1")}>{L(C.orgs.cta)}</Button>
          </div>
          <div className="lp-grid2">{C.orgs.items.map(([h, p], i) => <div key={i} className="lp-feature"><h3>{L(h)}</h3><p>{L(p)}</p></div>)}</div>
        </div>
      </section>

      <section className="lp-section" id="standards" aria-labelledby="std-h">
        <h2 id="std-h">{L(C.standards.title)}</h2>
        <div className="lp-grid3">{C.standards.items.map(([h, p], i) => <div key={i} className="lp-feature lp-std"><h3>{L(h)}</h3><p>{L(p)}</p></div>)}</div>
        <h2 className="lp-h2-sm">{L(C.quality.title)}</h2>
        <ul className="lp-checks">{C.quality.items.map((q, i) => <li key={i}><Icon name="check" size={20} />{L(q)}</li>)}</ul>
      </section>

      <section className="lp-section" id="faq" aria-labelledby="faq-h">
        <h2 id="faq-h">{L(C.faq.title)}</h2>
        <div className="lp-faq">{C.faq.items.map(([q, a], i) => <details key={i}><summary>{L(q)}</summary><p>{withLanguages(L(a))}</p></details>)}</div>
      </section>

      <section className="lp-section" aria-labelledby="explore-h">
        <h2 id="explore-h">{L(C.explore.title)}</h2>
        <div className="lp-grid3">{C.explore.items.map((it) => <div key={it.path} className="lp-feature"><h3><a href={page(it.path)}>{L(it.title)}</a></h3><p>{L(it.text)}</p></div>)}</div>
      </section>

      <section className="lp-cta">
        <Mark size={56} />
        <h2>{L(C.cta.title)}</h2>
        <p>{L(C.cta.body)}</p>
        <Button iconEnd="next" onClick={() => nav("/signup")}>{L(C.hero.primary)}</Button>
      </section>

      <footer className="lp-footer">
        {/* The other script's brand name in the phone's own font: an English page never downloads the Arabic web fonts. */}
        <p>{lang === "ar" ? "درسي (Darsi)" : <>Darsi (<span className="dr-other-script" lang="ar">درسي</span>)</>} — {L(C.footer)}</p>
        <details><summary>{L(C.sourcesTitle)}</summary><ul>{C.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener" dir="ltr">{s.label}</a></li>)}</ul></details>
        {C.explore.items.map((it) => <p key={it.path}><a href={page(it.path)}>{L(it.title)}</a></p>)}
        <LegalLinks />
        <p><Link to="/licences">{t("me.licences")}</Link></p>
      </footer>
    </div>
  );
}

/**
 * The languages people can pick, as a list in the page's language ("English, Français and اردو"). Each name is in its
 * own script with its own lang, so an English page never downloads the Arabic fonts for "العربية" (dr-other-script).
 */
function LanguageList({ languages, lang, locale }: { languages: LanguageDef[]; lang: string; locale: string }) {
  const marks = languages.map((_, i) => `\u0000${i}\u0000`);
  let parts: { type: string; value: string }[];
  try { parts = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(marks); }
  catch { parts = marks.flatMap((m, i) => (i ? [{ type: "literal", value: ", " }, { type: "element", value: m }] : [{ type: "element", value: m }])); }
  return <>{parts.map((p, k) => {
    if (p.type !== "element") return p.value;
    const l = languages[marks.indexOf(p.value)];
    return l.code === lang ? <span key={k}>{l.native}</span> : <span key={k} lang={l.code} dir={l.dir} className="dr-other-script">{l.native}</span>;
  })}</>;
}
