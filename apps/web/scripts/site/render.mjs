/**
 * The public pages' frame (TECHNICAL.md "Public pages"): the document, its head for search and AI engines, the top bar,
 * breadcrumbs and the footer. Pure: text in, HTML out. Pages carry no script. The one <script> is schema.org data,
 * which browsers don't run.
 *
 * A page: { slug, lang, title, description, body, crumbs: [{ name, slug }], ld: [schema.org nodes], kind }
 * where slug is its English path without slashes at the ends ("courses/ai-4-1"); the Arabic page is /ar/<slug>/.
 */
import { SITE_URL } from "./roots.mjs";
import { WORDS } from "./strings.mjs";
import { dirOf, esc, ldJson } from "./util.mjs";

export const ORG_ID = `${SITE_URL}/#org`;
export const WEBSITE_ID = `${SITE_URL}/#site`;
export const ICON = `${SITE_URL}/app-icons/app-icon-512.png`;

export const pathOf = (slug, lang) => `${lang === "ar" ? "/ar" : ""}/${slug}/`;
export const urlOf = (slug, lang) => SITE_URL + pathOf(slug, lang);
/** The app's home page in this language (seo.ts: a first visit with ?lang=ar opens in Arabic). */
export const homeOf = (lang) => (lang === "ar" ? "/?lang=ar" : "/");
const appLink = (path, lang) => (lang === "ar" ? `${path}${path.includes("?") ? "&" : "?"}lang=ar` : path);
export const appOf = appLink;

/** The top sections, in the order the top bar and the footer show them. */
export const SECTIONS = [{ key: "courses", slug: "courses" }, { key: "features", slug: "features" }, { key: "why", slug: "why-darsi" }];

/** A word in the page's other script (the brand's other name, the language switch): the phone's own font, no web font. */
export const other = (text, lang) => `<span class="pp-other" lang="${lang}" dir="${dirOf(lang)}">${esc(text)}</span>`;

function head(page, ctx) {
  const { lang, slug } = page;
  const W = WORDS[lang];
  const url = urlOf(slug, lang);
  const alt = lang === "ar" ? "en" : "ar";
  const graph = [
    { "@type": "WebPage", "@id": url, url, name: page.title, description: page.description, inLanguage: lang, isPartOf: { "@id": WEBSITE_ID }, publisher: { "@id": ORG_ID } },
    ...(page.crumbs?.length ? [{
      "@type": "BreadcrumbList",
      itemListElement: [{ name: W.nav.home, item: `${SITE_URL}${homeOf(lang)}` }, ...page.crumbs.map((c) => ({ name: c.name, item: urlOf(c.slug, lang) })), { name: page.h1 ?? page.title, item: url }]
        .map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
    }] : []),
    ...(page.ld ?? []),
  ];
  return [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${urlOf(slug, "en")}">`,
    `<link rel="alternate" hreflang="ar" href="${urlOf(slug, "ar")}">`,
    `<link rel="alternate" hreflang="x-default" href="${urlOf(slug, "en")}">`,
    `<meta property="og:type" content="${page.kind === "article" ? "article" : "website"}">`,
    `<meta property="og:site_name" content="${esc(W.siteName)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${lang === "ar" ? "ar_AR" : "en_US"}">`,
    `<meta property="og:locale:alternate" content="${alt === "ar" ? "ar_AR" : "en_US"}">`,
    `<meta property="og:image" content="${ICON}">`,
    `<meta property="og:image:width" content="512">`,
    `<meta property="og:image:height" content="512">`,
    `<meta property="og:image:alt" content="Darsi">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="theme-color" content="#f2f2f2">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/app-icons/apple-touch-icon-180.png">`,
    `<link rel="stylesheet" href="${esc(ctx.css)}">`,
    `<script type="application/ld+json">${ldJson({ "@context": "https://schema.org", "@graph": graph })}</script>`,
  ].join("\n");
}

function topBar(page, ctx) {
  const { lang, slug } = page;
  const W = WORDS[lang];
  const alt = lang === "ar" ? "en" : "ar";
  const section = slug.split("/")[0];
  const links = SECTIONS.filter((s) => ctx.has(s.slug)).map((s) => `<a href="${pathOf(s.slug, lang)}"${s.slug === section ? ' aria-current="true"' : ""}>${esc(W.nav[s.key])}</a>`).join("");
  return `<header class="pp-top">
<a class="pp-brand" href="${homeOf(lang)}">${ctx.mark}<span>${esc(W.brand)}</span></a>
<nav class="pp-nav" aria-label="${esc(W.nav.label)}">${links}</nav>
<div class="pp-actions"><a class="pp-lang" href="${pathOf(slug, alt)}" hreflang="${alt}" title="${esc(W.otherLang.title)}">${other(W.otherLang.label, alt)}</a><a class="pp-btn pp-btn-sm" href="${homeOf(lang)}">${esc(W.nav.start)}</a></div>
</header>`;
}

function crumbs(page) {
  if (!page.crumbs?.length) return "";
  const { lang } = page;
  const W = WORDS[lang];
  const items = [`<li><a href="${homeOf(lang)}">${esc(W.nav.home)}</a></li>`, ...page.crumbs.map((c) => `<li><a href="${pathOf(c.slug, lang)}">${esc(c.name)}</a></li>`)];
  return `<nav class="pp-crumbs" aria-label="${esc(W.crumbs)}"><ol>${items.join("")}</ol></nav>`;
}

function footer(page, ctx) {
  const { lang, slug } = page;
  const W = WORDS[lang];
  const F = W.footer;
  const alt = lang === "ar" ? "en" : "ar";
  const explore = [["courses", F.courses], ["features", F.features], ["why-darsi", F.why]].filter(([s]) => ctx.has(s))
    .map(([s, words]) => `<li><a href="${pathOf(s, lang)}">${esc(words)}</a></li>`).join("");
  // Into the app: plain links. The app decides what a newcomer sees first.
  const learn = [[homeOf(lang), F.open], [appLink("/signup", lang), F.signUp], [appLink("/signin", lang), F.signIn], [appLink("/signup?org=1", lang), F.orgs]]
    .map(([href, words]) => `<li><a href="${href}">${esc(words)}</a></li>`).join("");
  // The brand's other name sits in its own script and its own font.
  const about = esc(F.about).replace(esc(W.brandOther), other(W.brandOther, alt));
  return `<footer class="pp-foot">
<div class="pp-foot-in">
<p class="pp-foot-about">${about}</p>
<div class="pp-foot-cols">
<div><h2>${esc(F.explore)}</h2><ul>${explore}</ul></div>
<div><h2>${esc(F.learn)}</h2><ul>${learn}</ul></div>
</div>
<p class="pp-foot-lang"><a href="${pathOf(slug, alt)}" hreflang="${alt}">${esc(W.otherLang.title)}</a></p>
</div>
</footer>`;
}

/** The whole document. ctx: { css, mark, has(slug) }. */
export function layout(page, ctx) {
  const { lang } = page;
  const W = WORDS[lang];
  return `<!doctype html>
<html lang="${lang}" dir="${dirOf(lang)}">
<head>
${head(page, ctx)}
</head>
<body class="pp">
<a class="pp-skip" href="#main">${esc(W.skip)}</a>
${topBar(page, ctx)}
<main id="main" class="pp-main${page.wide ? " pp-wide" : ""}">
${crumbs(page)}
${page.body}
</main>
${footer(page, ctx)}
</body>
</html>
`;
}

/** Questions and answers, open to read without a tap (and so to a reader that runs no script). */
export function faqBlock(title, items, id = "faq") {
  if (!items.length) return "";
  return `<section class="pp-section" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2><dl class="pp-faq">${items.map(([q, a]) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join("")}</dl></section>`;
}
export const faqLd = (items) => (items.length ? [{ "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []);

/** The page for an address nothing answers (Hosting's 404.html): both languages, since nobody knows which was meant. */
export function notFound(ctx) {
  const part = (lang) => {
    const N = WORDS[lang].notFound;
    return `<section class="pp-section${lang === "ar" ? " pp-other" : ""}" lang="${lang}" dir="${dirOf(lang)}"><h1>${esc(N.h1)}</h1><p>${esc(N.body)}</p><p class="pp-cta"><a class="pp-btn" href="${pathOf("courses", lang)}">${esc(N.courses)}</a> <a class="pp-link" href="${homeOf(lang)}">${esc(N.home)}</a></p></section>`;
  };
  const W = WORDS.en;
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(W.notFound.title)}</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#f2f2f2">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${esc(ctx.css)}">
</head>
<body class="pp">
<header class="pp-top"><a class="pp-brand" href="/">${ctx.mark}<span>${esc(W.brand)}</span></a></header>
<main id="main" class="pp-main">
${part("en")}
${part("ar")}
</main>
</body>
</html>
`;
}
