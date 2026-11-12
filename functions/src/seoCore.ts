/**
 * What search engines and AI answer engines read (TECHNICAL.md "Search and AI engines"): the pure part of seo.ts.
 * The app draws its pages in the browser, so a crawler that reads only the first HTML found nothing but a shell. For
 * each address (darsiai.org, and every organization's own) the home page now comes with its own title, description,
 * canonical address, language alternates, social card, schema.org data (JSON-LD), and the page's real text inside
 * #root, which the app replaces when it starts. robots.txt, sitemap.xml and llms.txt are answered per address too.
 * Everything here is escaped text: nothing an organization types is ever markup.
 */
import { BUILTIN_TRACKS } from "./shared/tracks.js";
import { safeHref, textIn, type Block, type OrgPage } from "./shared/page.js";
import type { SiteEntry } from "./shared/sites.js";

export type Lang = "en" | "ar";
export interface CatalogUnit { id: string; track: string; level: number; title: Record<string, string | undefined>; summary: Record<string, string | undefined>; lessons?: number; audience?: string; teach?: string; owner?: string }
export const DARSI_URL = "https://darsiai.org";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** JSON inside <script type="application/ld+json">: nothing in it may close the tag. */
export const ldJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const pick = (t: Record<string, string | undefined> | undefined, lang: Lang) => (t?.[lang] ?? t?.en ?? "").trim();
const cut = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n - 1).join("").trimEnd()}…` : s);

const DARSI = {
  en: {
    title: "Darsi — practical AI, programming and cyber security training for teachers and students",
    description: "Free, short, practical courses in AI, programming, data, IoT, AI agents, optimisation and cyber security for school and university teachers and their students. English and Arabic, works offline on low-cost phones, with classroom kits and hands-on labs.",
    lead: "Darsi (درسي) helps teachers and students in developing countries learn AI, programming, data, IoT and cyber security: short lessons with video, questions and hands-on labs that run on the phone, classroom kits to teach with, and certificates. In English and Arabic, built for low-cost phones and expensive data.",
    courses: "Courses",
    tracks: "Tracks",
    lessons: (n: number) => `${n} lessons`,
    forStudents: "for students", forTeachers: "for teachers", forUni: "for university teachers",
    start: "Start learning",
  },
  ar: {
    title: "درسي — تدريب عملي على الذكاء الاصطناعي والبرمجة والأمن السيبراني للمعلمين والطلاب",
    description: "دورات قصيرة وعملية ومجانية في الذكاء الاصطناعي والبرمجة والبيانات وإنترنت الأشياء والوكلاء الأذكياء والتحسين والأمن السيبراني لمعلمي المدارس والجامعات وطلابهم. بالعربية والإنجليزية، تعمل دون اتصال على الهواتف البسيطة، مع حقائب للفصل ومختبرات تفاعلية.",
    lead: "«درسي» يساعد المعلمين والطلاب في الدول النامية على تعلّم الذكاء الاصطناعي والبرمجة والبيانات وإنترنت الأشياء والأمن السيبراني: دروس قصيرة بالفيديو والأسئلة ومختبرات تعمل على الهاتف، وحقائب للتدريس في الفصل، وشهادات. بالعربية والإنجليزية، ومصمَّم للهواتف البسيطة والبيانات المكلفة.",
    courses: "الدورات",
    tracks: "المسارات",
    lessons: (n: number) => `${n} دروس`,
    forStudents: "للطلاب", forTeachers: "للمعلمين", forUni: "لمعلمي الجامعات",
    start: "ابدأ التعلّم",
  },
};

export interface Seo {
  lang: Lang; dir: "ltr" | "rtl"; title: string; description: string; canonical: string;
  alternates: { hreflang: string; href: string }[]; image: string | null; siteName: string; ld: unknown[]; body: string;
}

/** The page's language from ?lang=: Arabic or English (the default). */
export const langOf = (query: unknown): Lang => (query === "ar" ? "ar" : "en");
const alternates = (base: string) => [{ hreflang: "en", href: `${base}/` }, { hreflang: "ar", href: `${base}/?lang=ar` }, { hreflang: "x-default", href: `${base}/` }];
const canonicalOf = (base: string, lang: Lang) => (lang === "ar" ? `${base}/?lang=ar` : `${base}/`);

/** darsiai.org's home page: what Darsi is, its tracks, and every public course with its summary. */
export function darsiSeo(units: CatalogUnit[], lang: Lang, logo: string): Seo {
  const W = DARSI[lang];
  const pub = units.filter((u) => !u.owner || u.owner === "public");
  const trackName = (id: string) => pick(BUILTIN_TRACKS.find((t) => t.id === id)?.name as Record<string, string> | undefined, lang) || id;
  const tracks = [...new Set(pub.map((u) => u.track))];
  const who = (u: CatalogUnit) => (u.teach === "university" ? W.forUni : u.audience === "students" ? W.forStudents : W.forTeachers);
  const items = pub.map((u) => ({ u, title: pick(u.title, lang), summary: pick(u.summary, lang) })).filter((x) => x.title);
  const body = [
    `<main class="seo-pre" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">`,
    `<h1>${esc(lang === "ar" ? "درسي" : "Darsi")}</h1>`,
    `<p>${esc(W.lead)}</p>`,
    `<p><a href="/learn">${esc(W.start)}</a></p>`,
    tracks.length ? `<h2>${esc(W.tracks)}</h2><ul>${tracks.map((t) => `<li>${esc(trackName(t))}</li>`).join("")}</ul>` : "",
    items.length ? `<h2>${esc(W.courses)}</h2><ul>${items.map((x) => `<li><h3>${esc(x.title)}</h3><p>${esc(`${trackName(x.u.track)}, ${who(x.u)}${x.u.lessons ? `, ${W.lessons(x.u.lessons)}` : ""}. ${x.summary}`)}</p></li>`).join("")}</ul>` : "",
    `</main>`,
  ].join("");
  const org = { "@type": "EducationalOrganization", "@id": `${DARSI_URL}/#org`, name: "Darsi", alternateName: "درسي", url: `${DARSI_URL}/`, logo, description: DARSI.en.description };
  return {
    lang, dir: lang === "ar" ? "rtl" : "ltr", title: W.title, description: W.description, canonical: canonicalOf(DARSI_URL, lang),
    alternates: alternates(DARSI_URL), image: logo, siteName: "Darsi — درسي",
    ld: [
      org,
      { "@type": "WebSite", "@id": `${DARSI_URL}/#site`, name: "Darsi", alternateName: "درسي", url: `${DARSI_URL}/`, inLanguage: ["en", "ar"], publisher: { "@id": `${DARSI_URL}/#org` } },
      ...(items.length ? [{
        "@type": "ItemList", name: W.courses, numberOfItems: items.length,
        itemListElement: items.map((x, i) => ({
          "@type": "ListItem", position: i + 1,
          item: { "@type": "Course", name: x.title, description: cut(x.summary || x.title, 300), inLanguage: ["en", "ar"], isAccessibleForFree: true, url: `${DARSI_URL}/learn`, provider: { "@id": `${DARSI_URL}/#org` }, about: trackName(x.u.track), educationalLevel: String(x.u.level), audience: { "@type": "EducationalAudience", educationalRole: x.u.audience === "students" ? "student" : "teacher" } },
        })),
      }] : []),
    ],
    body,
  };
}

/** One block as HTML text for crawlers (the app draws the real page). */
function blockHtml(b: Block, T: (x: Record<string, string> | undefined) => string): string {
  const h = (x: Record<string, string> | undefined) => (T(x) ? `<h2>${esc(T(x))}</h2>` : "");
  const paras = (s: string) => s.split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  switch (b.kind) {
    case "text": return `<section>${h(b.heading)}${paras(T(b.body))}</section>`;
    case "image": return T(b.caption) ? `<p>${esc(T(b.caption))}</p>` : "";
    case "cards": return `<section>${h(b.heading)}<ul>${b.items.map((c) => `<li><h3>${esc(T(c.title))}</h3>${T(c.text) ? `<p>${esc(T(c.text))}</p>` : ""}</li>`).join("")}</ul></section>`;
    case "faq": return `<section>${h(b.heading)}${b.items.map((f) => `<h3>${esc(T(f.q))}</h3>${paras(T(f.a))}`).join("")}</section>`;
    case "contact": return `<section>${h(b.heading)}${b.email ? `<p>${esc(b.email)}</p>` : ""}${b.phone ? `<p>${esc(b.phone)}</p>` : ""}${T(b.address) ? `<p>${esc(T(b.address))}</p>` : ""}</section>`;
    case "button": { const href = safeHref(b.href, true); return href ? `<p><a href="${esc(href)}" rel="noopener">${esc(T(b.label))}</a></p>` : ""; }
  }
}

/** An organization's own address: its name, its homepage's text (page builder), and its contact details. */
export function orgSeo(host: string, site: SiteEntry, page: OrgPage | null, lang: Lang, logo: string | null): Seo {
  const base = `https://${host}`;
  const langs = page?.langs ?? ["en"];
  const T = (x: Record<string, string> | undefined) => textIn(x, lang, langs);
  const blocks = page?.blocks ?? [];
  const firstText = blocks.find((b): b is Extract<Block, { kind: "text" }> => b.kind === "text");
  const intro = firstText ? T(firstText.body) : "";
  const fallback = lang === "ar" ? `${site.name}: تعلّم الذكاء الاصطناعي والبرمجة والأمن السيبراني${site.darsi ? " مع «درسي»" : ""}.` : `${site.name}: learn AI, programming and cyber security${site.darsi ? " with Darsi" : ""}.`;
  const description = cut((intro || fallback).replace(/\s+/g, " "), 160);
  const contact = blocks.find((b): b is Extract<Block, { kind: "contact" }> => b.kind === "contact");
  const faqs = blocks.filter((b): b is Extract<Block, { kind: "faq" }> => b.kind === "faq").flatMap((b) => b.items).filter((f) => T(f.q) && T(f.a));
  const orgLd: Record<string, unknown> = {
    "@type": "EducationalOrganization", "@id": `${base}/#org`, name: site.name, url: `${base}/`, ...(logo ? { logo } : {}), description,
    ...(contact && (contact.email || contact.phone) ? { contactPoint: { "@type": "ContactPoint", contactType: "customer support", ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { telephone: contact.phone } : {}) } } : {}),
    ...(contact && T(contact.address) ? { address: T(contact.address) } : {}),
    ...(contact?.website && safeHref(contact.website) ? { sameAs: [safeHref(contact.website)] } : {}),
  };
  const body = [
    `<main class="seo-pre" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">`,
    `<h1>${esc(site.name)}</h1>`,
    ...(blocks.length ? blocks.map((b) => blockHtml(b, T)) : [`<p>${esc(fallback)}</p>`]),
    `<p><a href="/signin">${esc(lang === "ar" ? "تسجيل الدخول" : "Sign in")}</a></p>`,
    `</main>`,
  ].join("");
  return {
    lang, dir: lang === "ar" ? "rtl" : "ltr", title: site.name, description, canonical: canonicalOf(base, lang),
    alternates: alternates(base), image: logo, siteName: site.name,
    ld: [orgLd, { "@type": "WebSite", "@id": `${base}/#site`, name: site.name, url: `${base}/`, publisher: { "@id": `${base}/#org` } },
      ...(faqs.length ? [{ "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: T(f.q), acceptedAnswer: { "@type": "Answer", text: T(f.a) } })) }] : [])],
    body,
  };
}

/**
 * The app's shell (app.html, the same build) with this page's head and text: title, description, canonical, language
 * alternates, social card and JSON-LD replace or join the shell's, <html> gets the page's language and direction, and
 * the text goes inside #root (the app replaces it as it starts).
 */
export function inject(shell: string, s: Seo): string {
  const head = [
    `<title>${esc(s.title)}</title>`,
    `<meta name="description" content="${esc(s.description)}" />`,
    `<link rel="canonical" href="${esc(s.canonical)}" />`,
    ...s.alternates.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}" />`),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(s.siteName)}" />`,
    `<meta property="og:title" content="${esc(s.title)}" />`,
    `<meta property="og:description" content="${esc(s.description)}" />`,
    `<meta property="og:url" content="${esc(s.canonical)}" />`,
    `<meta property="og:locale" content="${s.lang === "ar" ? "ar_AR" : "en_US"}" />`,
    ...(s.image ? [`<meta property="og:image" content="${esc(s.image)}" />`] : []),
    `<meta name="twitter:card" content="summary" />`,
    `<script type="application/ld+json">${ldJson({ "@context": "https://schema.org", "@graph": s.ld })}</script>`,
  ].join("\n    ");
  let out = shell
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="(canonical|alternate)"[^>]*>\s*/gi, "");
  out = out.replace(/<\/head>/i, `    ${head}\n  </head>`);
  out = out.replace(/<html[^>]*>/i, `<html lang="${s.lang}" dir="${s.dir}">`);
  out = out.replace(/<div id="root"><\/div>/, `<div id="root">${s.body}</div>`);
  return out;
}

/** robots.txt for an address: the public pages may be read, staff screens and the API not, and where the sitemap is. */
export function robots(base: string): string {
  return [
    "# Darsi: the public pages may be indexed and quoted. Staff screens, Firebase's own paths and the API are not pages.",
    "User-agent: *", "Allow: /",
    ...["/super", "/admin", "/teach", "/org", "/results", "/__/", "/api/"].map((p) => `Disallow: ${p}`),
    "", `Sitemap: ${base}/sitemap.xml`, "",
  ].join("\n");
}

/** sitemap.xml: the home page in both languages, and the legal pages and licences. */
export function sitemap(base: string, extra: string[]): string {
  const url = (path: string, alt = false) => `  <url><loc>${esc(`${base}${path}`)}</loc>${alt ? `<xhtml:link rel="alternate" hreflang="en" href="${esc(`${base}/`)}"/><xhtml:link rel="alternate" hreflang="ar" href="${esc(`${base}/?lang=ar`)}"/>` : ""}</url>`;
  return [`<?xml version="1.0" encoding="UTF-8"?>`, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    url("/", true), url("/?lang=ar", true), ...extra.map((p) => url(p)), `</urlset>`, ""].join("\n");
}

/** llms.txt (llmstxt.org): a short plain summary for AI answer engines, in Markdown, with links to the full pages. */
export function llms(s: Seo, base: string): string {
  const strip = (h: string) => h.replace(/<h1>(.*?)<\/h1>/g, "# $1\n\n").replace(/<h2>(.*?)<\/h2>/g, "\n## $1\n\n").replace(/<h3>(.*?)<\/h3>/g, "\n### $1\n\n")
    .replace(/<li>/g, "- ").replace(/<\/(li|p|section|ul)>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
  // The spec's order: the name as the title, the summary as a quote, then the details and the links.
  const [title, ...rest] = strip(s.body).split("\n");
  return [title, "", `> ${s.description}`, "", rest.join("\n").trim(), "", "## Links", "", `- [Home (English)](${base}/)`, `- [Home (Arabic)](${base}/?lang=ar)`, `- [Start learning](${base}/learn)`, ""].join("\n");
}
