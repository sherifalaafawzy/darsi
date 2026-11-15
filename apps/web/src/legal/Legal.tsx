import { useNavigate } from "react-router-dom";
import { AppBar } from "@darsi/design-system";
import { isolate, useI18n } from "../i18n";
import { useLegal, type LegalDoc } from "./published";
import { k } from "./strings";
import "../styles/licences.css";

/**
 * /privacy and /terms: the privacy notice and the terms of use as a platform admin published them (legal/published.ts).
 * A lazy chunk kept out of the precache, for anyone, guests too: it loads nothing but the public file. This app holds
 * no legal wording of its own: until a text is published the page says so, and no screen links here.
 * The text is plain text and is shown as text, never as HTML: paragraphs are split on blank lines, a line starting with
 * "# " is a heading, and single line breaks stay. It comes in the reader's language, else in English.
 */
type Block = { h: string } | { p: string };
/** The text as headings and paragraphs, in order. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    let lines: string[] = [];
    const flush = () => { const p = lines.join("\n").trim(); if (p) out.push({ p }); lines = []; };
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("# ")) { lines.push(line); continue; }
      flush();
      const h = line.slice(2).trim();
      if (h) out.push({ h });
    }
    flush();
  }
  return out;
}

/**
 * The date as the reader's language writes it. A locale the browser doesn't know (an added language's own code, or a
 * malformed one) makes Intl throw a RangeError: then English, rather than a page that fails.
 */
export function longDate(locale: string, at: string): string {
  let f: Intl.DateTimeFormat;
  try { f = new Intl.DateTimeFormat(locale, { dateStyle: "long" }); } catch { f = new Intl.DateTimeFormat("en", { dateStyle: "long" }); }
  return f.format(new Date(at));
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, lang, locale } = useI18n();
  const legal = useLegal();
  const nav = useNavigate();
  // Back where they came from (Me, the home page); opened from a link or in its own tab (sign-up), to the start.
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav("/"));
  const text = legal.text(doc, lang), version = legal[doc], at = legal.at(doc);
  return (
    <>
      <AppBar title={t(k(doc === "privacy" ? "legal.privacy" : "legal.terms"))} onBack={back} backLabel={t("common.back")} />
      <main className="screen narrow stack-lg lic" aria-busy={!legal.ready}>
        {!legal.ready ? <div className="loading" />
          : text === null || version === null ? (
            <section className="panel stack" aria-labelledby="legal-none">
              <h2 id="legal-none" className="section-title">{t(k("legal.none"))}</h2>
              <p className="muted">{t(k("legal.noneBody"))}</p>
            </section>
          ) : (
            <>
              <p className="muted small">{at
                ? t(k("legal.version"), { n: version, date: isolate(longDate(locale, at)) })
                : t(k("legal.versionOnly"), { n: version })}</p>
              {/* The language the text is in (English, where the reader's own isn't published); each block finds its own direction. */}
              <article className="stack" lang={legal.shown(doc, lang) ?? undefined}>
                {blocks(text).map((b, i) => ("h" in b
                  ? <h2 key={i} dir="auto" className="section-title">{b.h}</h2>
                  : <p key={i} dir="auto" className="lic-text">{b.p}</p>))}
              </article>
            </>
          )}
      </main>
    </>
  );
}
