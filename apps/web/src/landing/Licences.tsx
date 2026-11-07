import { useNavigate } from "react-router-dom";
import { AppBar } from "@darsi/design-system";
import { useI18n } from "../i18n";
import data from "./licences.json";
import "../styles/licences.css";

/**
 * /licences: the open-source projects, fonts and icons that reach phones, with their copyright lines and licences, then
 * the licence texts (src/landing/licences.json, written by scripts/licences.mjs). A lazy chunk kept out of the precache,
 * linked from Me and the home page's footer; anyone can open it, and it loads nothing else. Names and licences stay in
 * English, as published.
 */
const WORDS = {
  en: {
    title: "Open-source licences",
    intro: "Darsi is built with these open-source projects, fonts and icons. Thank you to everyone who made them. Each one’s copyright and licence are below, followed by the licence texts.",
    app: "In the app", code: "Code exercises", fonts: "Fonts", icons: "Icons in lesson videos", old: "Only on older phones",
    includes: "Includes", texts: "Licence texts", english: "The licences are published in English and apply as written there.",
  },
  ar: {
    title: "تراخيص البرمجيات مفتوحة المصدر",
    intro: "بُني «درسي» بهذه المشروعات والخطوط والأيقونات مفتوحة المصدر، فشكرًا لكل من صنعها. تجد أدناه حقوق النشر والترخيص لكلٍّ منها، تليها نصوص التراخيص.",
    app: "في التطبيق", code: "تمارين البرمجة", fonts: "الخطوط", icons: "الأيقونات في فيديوهات الدروس", old: "على الهواتف الأقدم فقط",
    includes: "يتضمن", texts: "نصوص التراخيص", english: "التراخيص منشورة باللغة الإنجليزية، وتسري كما كُتبت بها.",
  },
};
const GROUPS = ["app", "code", "fonts", "icons", "old"] as const;

export function Licences() {
  const { t, lang } = useI18n();
  const w = WORDS[lang as keyof typeof WORDS] ?? WORDS.en;
  const nav = useNavigate();
  // Back where they came from (Me, the home page); opened from a link, to the start.
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav("/"));
  return (
    <>
      <AppBar title={w.title} onBack={back} backLabel={t("common.back")} />
      <main className="screen narrow stack-lg lic">
        <p className="muted">{w.intro}</p>
        {GROUPS.map((g) => (
          <section key={g} className="stack" aria-labelledby={`lic-${g}`}>
            <h2 id={`lic-${g}`} className="section-title">{w[g]}</h2>
            <ul className="lic-list" lang="en" dir="ltr">
              {data.components.filter((c) => c.group === g).map((c) => (
                <li key={c.name} className="stack-sm">
                  <span><strong>{c.name}</strong> ({c.licence})</span>
                  {c.copyright.map((line) => <span key={line} className="muted small">{line}</span>)}
                  {"includes" in c && c.includes && (
                    <span className="small"><span lang={lang} dir="auto">{w.includes}</span>: {c.includes.map((i) => `${i.name} (${i.licence}; ${i.copyright.join("; ")})`).join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="stack" aria-labelledby="lic-texts">
          <h2 id="lic-texts" className="section-title">{w.texts}</h2>
          <p className="muted">{w.english}</p>
          {Object.entries(data.texts).map(([id, text]) => (
            <details key={id} lang="en" dir="ltr">
              <summary><strong>{id}</strong></summary>
              <p className="lic-text">{text}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  );
}
