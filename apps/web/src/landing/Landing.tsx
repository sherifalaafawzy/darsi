import { Link, useNavigate } from "react-router-dom";
import { Button, Icon, LessonCard, Mark, ProgressBar, QuizOption, TrackChip, QuestionHeader, StreakCounter } from "@darsi/design-system";
import { landing as C } from "./content";
import { useStore } from "../state/store";
import { useI18n } from "../i18n";
import "../styles/landing.css";

const TRACK_ICON = { ai: "ai", iot: "iot", cyber: "cyber" } as const;

/** Public home page: what Darsi is, how it works, who it is for, standards, FAQ. */
export function Landing() {
  const nav = useNavigate();
  const { lang, t } = useI18n();
  const { dispatch } = useStore();
  const guest = () => { dispatch({ type: "set", patch: { guest: true } }); nav("/learn"); };
  const L = (x: { en: string; ar: string }) => x[lang as "en" | "ar"] ?? x.en;
  const otherLang = lang === "ar" ? "en" : "ar";
  return (
    <div className="landing">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label="Darsi"><Mark size={36} /><span>{lang === "ar" ? "درسي" : "Darsi"}</span></Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">{L(C.nav.approach)}</a><a href="#tracks">{L(C.nav.tracks)}</a><a href="#orgs">{L(C.nav.orgs)}</a><a href="#standards">{L(C.nav.standards)}</a><a href="#faq">{L(C.nav.faq)}</a>
        </nav>
        <div className="lp-actions">
          <button type="button" className="lp-lang dr-other-script" onClick={() => dispatch({ type: "set", patch: { lang: otherLang } })} lang={otherLang}>{otherLang === "ar" ? "العربية" : "English"}</button>
          <Button size="sm" variant="ghost" onClick={() => nav("/signin")}>{L(C.nav.signIn)}</Button>
          <Button size="sm" onClick={() => nav("/signup")}>{L(C.nav.start)}</Button>
        </div>
      </header>

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
            <div className="lp-phone-top"><Mark size={24} /><strong>{lang === "ar" ? "تعلّم" : "Learn"}</strong><StreakCounter compact count={lang === "ar" ? "٣" : "3"} /></div>
            <div className="lp-phone-body">
              <ProgressBar value={60} track="ai" thick ariaLabel="progress" />
              <QuestionHeader typeLabel={lang === "ar" ? "اختر إجابة" : "Choose one"} prompt={lang === "ar" ? "أيّ هذه يتعلّم من الأمثلة؟" : "Which of these learns from examples?"} />
              <QuizOption keyLabel={lang === "ar" ? "أ" : "A"}>{lang === "ar" ? "مفتاح الإضاءة" : "A light switch"}</QuizOption>
              <QuizOption keyLabel={lang === "ar" ? "ب" : "B"} state="correct" feedback={lang === "ar" ? "يتعلّم من آلاف الرسائل المصنّفة." : "It learns from thousands of labelled emails."}>{lang === "ar" ? "فلتر الرسائل المزعجة" : "A spam filter"}</QuizOption>
            </div>
          </div>
          <div className="lp-float-card"><LessonCard track="ai" offline offlineLabel={lang === "ar" ? "متاح دون اتصال" : "Offline ready"} trackLabel={lang === "ar" ? "الذكاء الاصطناعي" : "AI"} title={lang === "ar" ? "تحقّق قبل أن تثق" : "Check before you trust"} meta={lang === "ar" ? "الدرس ٣، ١٢ دقيقة" : "Lesson 3 · 12 min"} progress={30} /></div>
        </div>
      </section>

      <section className="lp-section lp-why" aria-labelledby="why">
        <h2 id="why">{L(C.why.title)}</h2>
        <div className="lp-stats">{C.why.items.map((it, i) => <div key={i} className="lp-stat"><strong>{L(it.stat)}</strong><p>{L(it.text)}</p></div>)}</div>
        <p className="lp-note">{L(C.why.note)}</p>
      </section>

      <section className="lp-section" id="how" aria-labelledby="how-h">
        <h2 id="how-h">{L(C.how.title)}</h2>
        <ol className="lp-steps">{C.how.steps.map((s, i) => <li key={i}><span className="lp-step-n">{new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en").format(i + 1)}</span><h3>{L(s.title)}</h3><p>{L(s.text)}</p></li>)}</ol>
      </section>

      <section className="lp-section" id="tracks" aria-labelledby="tracks-h">
        <h2 id="tracks-h">{L(C.tracks.title)}</h2>
        <p className="lp-levels">{L(C.tracks.levels)}</p>
        <div className="lp-tracks">{C.tracks.items.map((tr) => (
          <article key={tr.track} className={`lp-track lp-track-${tr.track}`}>
            <TrackChip track={tr.track} solid>{L(tr.title)}</TrackChip>
            <ul>{tr.points.map((p, i) => <li key={i}><Icon name={TRACK_ICON[tr.track]} size={18} />{L(p)}</li>)}</ul>
          </article>
        ))}</div>
        <p className="lp-note">{L(C.tracks.note)}</p>
      </section>

      <section className="lp-section lp-band" aria-labelledby="real-h">
        <h2 id="real-h">{L(C.real.title)}</h2>
        <div className="lp-grid3">{C.real.items.map(([h, p], i) => <div key={i} className="lp-feature"><h3>{L(h)}</h3><p>{L(p)}</p></div>)}</div>
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
        <div className="lp-faq">{C.faq.items.map(([q, a], i) => <details key={i}><summary>{L(q)}</summary><p>{L(a)}</p></details>)}</div>
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
        <details><summary>{lang === "ar" ? "المصادر" : "Sources"}</summary><ul>{C.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener" dir="ltr">{s.label}</a></li>)}</ul></details>
      </footer>
    </div>
  );
}
