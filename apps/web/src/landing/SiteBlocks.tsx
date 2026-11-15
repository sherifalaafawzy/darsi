/**
 * An organization's homepage blocks (content/page.ts), drawn as plain text: at its own web address under its name and
 * sign-in buttons (Landing.tsx SiteLanding), and as the page builder's preview (admin/PageBuilder.tsx). Nothing here
 * loads Firebase. A text left empty in this language shows in the page's first language that has it.
 */
import { useEffect, useState } from "react";
import { Icon } from "@darsi/design-system";
import { storageUrl } from "../content/load";
import { checkPage, pagePath, safeHref, textIn, type Block, type OrgPage } from "../content/page";
import { useI18n } from "../i18n";
import "../styles/site-page.css";

const WORDS = {
  en: { email: "Email", phone: "Phone", address: "Address", website: "Website" },
  ar: { email: "البريد الإلكتروني", phone: "الهاتف", address: "العنوان", website: "الموقع الإلكتروني" },
};

const KEPT = "darsi:page:";
/**
 * The organization's published homepage (content/pages/<orgId>/page.json, written only by manageOrgPage): one plain
 * fetch, the network first, the last copy kept on this phone (localStorage) for the next start and for offline. Not
 * published (404): nothing, and the kept copy goes. What comes back is checked again here before it is drawn.
 */
export function useOrgPage(orgId: string | null | undefined): OrgPage | null {
  const read = (): OrgPage | null => {
    if (!orgId) return null;
    try { return checkPage(JSON.parse(localStorage.getItem(KEPT + orgId) ?? "null"), orgId).page; } catch { return null; }
  };
  const [page, setPage] = useState<OrgPage | null>(read);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    fetch(storageUrl(pagePath(orgId)), { cache: "no-cache" }).then(async (r) => {
      if (r.status === 404) { try { localStorage.removeItem(KEPT + orgId); } catch { /* nothing kept */ } if (live) setPage(null); return; }
      if (!r.ok) return;
      const p = checkPage(await r.json(), orgId).page;
      if (!p || !live) return;
      setPage(p);
      try { localStorage.setItem(KEPT + orgId, JSON.stringify(p)); } catch { /* full: read again next time */ }
    }).catch(() => { /* offline: the kept copy stays */ });
    return () => { live = false; };
  }, [orgId]);
  return page;
}

/** Paragraphs from a text: a blank line starts a new one; a single line break stays a line break. */
const Paragraphs = ({ text }: { text: string }) => <>{text.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</>;

export function SiteBlocks({ page, lang: forced }: { page: OrgPage; lang?: string }) {
  const { lang: appLang } = useI18n();
  const lang = forced ?? appLang;
  const T = (x: Record<string, string> | undefined) => textIn(x, lang, page.langs);
  const words = WORDS[lang === "ar" ? "ar" : "en"];
  const one = (b: Block) => {
    switch (b.kind) {
      case "text":
        return <section className="pg-block pg-text">{T(b.heading) && <h2>{T(b.heading)}</h2>}<Paragraphs text={T(b.body)} /></section>;
      case "image":
        return b.src ? (
          <figure className="pg-block pg-image">
            <img src={storageUrl(b.src)} alt={T(b.alt)} loading="lazy" decoding="async" />
            {T(b.caption) && <figcaption>{T(b.caption)}</figcaption>}
          </figure>
        ) : null;
      case "cards":
        return (
          <section className="pg-block">
            {T(b.heading) && <h2>{T(b.heading)}</h2>}
            <ul className="pg-cards">{b.items.map((c, i) => <li key={i} className="pg-card"><h3>{T(c.title)}</h3>{T(c.text) && <p>{T(c.text)}</p>}</li>)}</ul>
          </section>
        );
      case "faq":
        return (
          <section className="pg-block">
            {T(b.heading) && <h2>{T(b.heading)}</h2>}
            <div className="pg-faq">{b.items.map((f, i) => <details key={i}><summary>{T(f.q)}</summary><Paragraphs text={T(f.a)} /></details>)}</div>
          </section>
        );
      case "contact": {
        const site = safeHref(b.website);
        return (
          <section className="pg-block">
            {T(b.heading) && <h2>{T(b.heading)}</h2>}
            <dl className="pg-contact">
              {b.email && <div><dt>{words.email}</dt><dd><a href={`mailto:${b.email}`} dir="ltr">{b.email}</a></dd></div>}
              {b.phone && <div><dt>{words.phone}</dt><dd><a href={`tel:${b.phone.replace(/[^+0-9]/g, "")}`} dir="ltr">{b.phone}</a></dd></div>}
              {T(b.address) && <div><dt>{words.address}</dt><dd>{T(b.address)}</dd></div>}
              {site && <div><dt>{words.website}</dt><dd><a href={site} rel="noopener" dir="ltr">{new URL(site).host}</a></dd></div>}
            </dl>
          </section>
        );
      }
      case "button": {
        const href = safeHref(b.href, true);
        return href ? <p className="pg-block pg-button"><a className="dr-btn dr-btn-primary dr-btn-md" href={href} rel="noopener"><span className="dr-btn-label">{T(b.label)}</span><Icon name="next" size={18} /></a></p> : null;
      }
    }
  };
  return <div className="pg-page" lang={lang}>{page.blocks.map((b) => <div key={b.id} className="pg-slot">{one(b)}</div>)}</div>;
}
