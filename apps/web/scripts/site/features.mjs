/**
 * Feature pages: what Darsi does, one page per feature (TECHNICAL.md "Public pages"). The words are written by hand
 * (copy.mjs); every number in them is counted from the app or the published courses when the site is built.
 */
import { appOf, faqBlock, faqLd, pathOf, urlOf } from "./render.mjs";
import { courseSlug, whoOf } from "./course.mjs";
import { FEATURES, FEATURES_INDEX } from "./copy.mjs";
import { SOURCES } from "./why.mjs";
import { WORDS } from "./strings.mjs";
import { count, cut, esc, isoDuration, listOf, num, pick, plain, rich } from "./util.mjs";

const n = (k, v, lang) => count(v, lang, { en: WORDS.en.n[k], ar: WORDS.ar.n[k] });
const CODE_KINDS = ["code", "parsons", "codefill", "bug", "blocks"];
const FRAMEWORKS = ["UNESCO-T", "UNESCO-S", "DigComp", "Darsi"];
const STAGES = ["primary", "lower", "upper", "university"];
const sep = (lang) => (lang === "ar" ? "، " : ", ");
const at = (list, q) => list[Math.min(list.length - 1, Math.floor(list.length * q))] ?? 0;
const sorted = (list) => list.filter((x) => x > 0).sort((a, b) => a - b);
const range = (lo, hi, lang) => (lang === "ar" ? `من ${num(lo, lang)} إلى ${n("minutes", hi, lang)}` : `${num(lo, lang)} to ${n("minutes", hi, lang)}`);
/** "every lesson", or "190 of the 237 lessons": what is true of how many. */
const share = (k, total, word, lang) => (k === total ? WORDS[lang].share[word] : WORDS[lang].share.of(num(k, lang), n(word, total, lang)));

/** What the published courses hold, counted once (facts() words it per language). */
function counts(data, models) {
  const lessons = models.flatMap((m) => m.lessons);
  const plainLessons = models.filter((m) => !m.capstone).flatMap((m) => m.lessons);
  const videos = models.flatMap((m) => m.unit.lessons ?? []).flatMap((l) => l.steps ?? []).filter((s) => s.type === "video");
  const kinds = new Map();
  for (const l of lessons) for (const [k, v] of l.kinds) kinds.set(k, (kinds.get(k) ?? 0) + v);
  const sizeOf = (v, lang) => (typeof v === "number" ? v : v?.[lang] ?? v?.en);
  return {
    lessons, videos, kinds,
    // Lesson length: the middle 80% of the lessons outside capstones (a capstone's milestones take hours).
    mins: sorted(plainLessons.map((l) => l.minutes)),
    videoMins: sorted(lessons.filter((l) => l.video).map((l) => Math.max(1, Math.round(l.video.duration / 60)))),
    light: videos.filter((v) => v.light),
    lightKb: (lang) => at(sorted(videos.map((v) => sizeOf(v.light?.sizeKB, lang))), 0.5),
    mp4Mb: (lang) => at(sorted(videos.map((v) => sizeOf(v.sizeMB, lang))), 0.5),
    kits: lessons.filter((l) => l.kit.length).length,
    labLessons: lessons.filter((l) => l.labs.length).length,
    codeSteps: CODE_KINDS.reduce((a, k) => a + (kinds.get(k) ?? 0), 0),
    codeCourses: models.filter((m) => m.lessons.some((l) => CODE_KINDS.some((k) => l.kinds.has(k)))),
    projects: models.filter((m) => !m.capstone).reduce((a, m) => a + m.projects, 0),
    capstones: models.filter((m) => m.capstone),
    competencies: new Set(models.flatMap((m) => m.competencies).filter((c) => data.competencies.has(c))),
  };
}

/** Counts the copy may use, as {name} in its text. `raw` holds the plain numbers sections are shown by (`when`). */
export function facts(data, models, lang) {
  const c = counts(data, models);
  const tracksWithCourses = new Set(models.map((m) => m.track.id));
  const ladder = [...data.labs.values()].filter((l) => l.ladder);
  const shelves = new Set([...data.labs.values()].map((l) => l.category));
  const sizes = models.map((m) => m.size?.[lang]).filter((x) => x > 0);
  const avg = sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : 0;
  const names = data.tracks.filter((t) => tracksWithCourses.has(t.id)).map((t) => pick(t.name, lang));
  const builtin = data.tracks.find((t) => t.builtIn && t.levelNames?.length === STAGES.length) ?? data.builtinTracks?.[0];
  // "Beginner for primary school (ages 9–12)"; in Arabic the stage names carry their own brackets, so the ages follow
  // a comma and the items a semicolon: «مبتدئ» للمرحلة الابتدائية، الأعمار ٩–١٢؛ و«أساسي» …
  const stageText = STAGES.map((s, i) => {
    const st = data.stages[lang][s], level = pick(builtin?.levelNames?.[i], lang);
    return lang === "ar" ? `«${level}» ل${st.name.slice(1)}، ${st.ages}` : `${level} for ${st.name.toLowerCase()} (${st.ages.charAt(0).toLowerCase()}${st.ages.slice(1)})`;
  });
  const stageLevels = lang === "ar" ? stageText.map((x, i) => (i ? `و${x}` : x)).join("؛ ") : listOf(stageText, lang);
  const runtime = (id) => num(data.runtimes?.[id]?.sizeMB ?? 0, lang);
  const kindNames = (keep) => listOf([...c.kinds.keys()].filter(keep).map((k) => WORDS[lang].kinds[k]).filter(Boolean), lang);
  const mb = (v) => num(v, lang, { maximumFractionDigits: 1 });
  return {
    raw: { capstones: c.capstones.length, codeSteps: c.codeSteps, light: c.light.length, projects: c.projects },
    lessonMin: num(at(c.mins, 0.1), lang), lessonMax: num(at(c.mins, 0.9), lang), avgMb: mb(avg),
    lessonRange: range(at(c.mins, 0.1), at(c.mins, 0.9), lang),
    videoRange: range(at(c.videoMins, 0.1), at(c.videoMins, 0.9), lang),
    lightKb: num(c.lightKb(lang), lang), mp4Mb: mb(c.mp4Mb(lang)),
    lightShare: share(c.light.length, c.videos.length, "videos", lang),
    kitShare: share(c.kits, c.lessons.length, "lessons", lang),
    labShare: share(c.labLessons, c.lessons.length, "lessons", lang),
    trackNames: listOf(names, lang),
    labs: n("labs", data.labs.size, lang), labsN: num(data.labs.size, lang), apps: n("apps", data.labs.size, lang),
    shelvesN: n("shelves", shelves.size, lang), ladderLabs: n("ladder", ladder.length, lang),
    shelves: num(shelves.size, lang), ladder: num(ladder.length, lang),
    tracks: n("tracks", data.tracks.length, lang), tracksN: num(data.tracks.length, lang),
    courses: n("courses", models.length, lang), coursesN: num(models.length, lang),
    courseTracks: n("tracks", tracksWithCourses.size, lang),
    lessons: n("lessons", c.lessons.length, lang),
    videos: n("videos", models.reduce((a, m) => a + m.videos, 0), lang),
    kindsN: n("kinds", [...c.kinds.keys()].filter((k) => !CODE_KINDS.includes(k)).length, lang),
    kindList: kindNames((k) => !CODE_KINDS.includes(k)),
    codeSteps: n("code", c.codeSteps, lang), codeCourses: n("courses", c.codeCourses.length, lang),
    projects: n("projects", c.projects, lang), capstones: n("capstones", c.capstones.length, lang),
    pyMb: runtime("python"), sqlMb: runtime("sql"),
    stageLevels,
    comps: n("competencies", c.competencies.size, lang),
    srcUnescoT: SOURCES["unesco-ai-cft"].url, srcUnescoS: SOURCES["unesco-ai-cfs"].url, srcDigComp: SOURCES["jrc-digcomp-22"].url,
  };
}
export const fill = (text, f) => String(text).replace(/\{(\w+)\}/g, (all, k) => (k in f && k !== "raw" ? f[k] : all));

/** Links to courses, at most `max`, then "and 3 more". */
function courseLinks(list, lang, max = 5) {
  const links = list.slice(0, max).map((m) => `<a href="${pathOf(courseSlug(m.id), lang)}">${esc(pick(m.unit.title, lang))}</a>`);
  const rest = list.length - max;
  if (rest > 0) links.push(esc(WORDS[lang].more(num(rest, lang), n("courses", rest, lang))));
  return links.join(sep(lang));
}

/** Courses that a `courses` key names, for a section's list of links. */
const COURSES = {
  capstones: (models) => models.filter((m) => m.capstone),
};

/**
 * Handwritten sections: { id, h2, p: [paragraphs], list: [items], when, courses } with [link](/path) and **bold** marks.
 * `when` names a count in facts().raw; the section shows only when it is more than 0.
 */
function sections(list, lang, f, models) {
  return (list ?? []).filter((s) => !s.when || f.raw[s.when] > 0).map((s, i) => {
    const id = s.id ?? `s${i + 1}`;
    const paras = (s.p?.[lang] ?? []).map((p) => `<p>${rich(fill(p, f))}</p>`).join("");
    const items = s.list?.[lang]?.length ? `<ul class="pp-list">${s.list[lang].map((x) => `<li>${rich(fill(x, f))}</li>`).join("")}</ul>` : "";
    const courses = s.courses ? COURSES[s.courses](models) : [];
    const links = courses.length ? `<p class="pp-used">${esc(fill(s.coursesLabel?.[lang] ?? "", f))} ${courseLinks(courses, lang, 20)}</p>` : "";
    return `<section class="pp-section" aria-labelledby="${id}"><h2 id="${id}">${esc(fill(s.h2[lang], f))}</h2>${paras}${items}${links}</section>`;
  }).join("\n");
}

/** Which published courses use each lab. */
function labUse(models) {
  const use = new Map();
  for (const m of models) for (const id of m.labs) use.set(id, [...(use.get(id) ?? []), m]);
  return use;
}

/** The Labs page: the handwritten part, then every lab on its shelf, with the courses that use it. */
function labsBody(copy, lang, data, models, f) {
  const levels = { 1: copy.levels[lang][0], 2: copy.levels[lang][1], 3: copy.levels[lang][2] };
  const use = labUse(models);
  const trackName = (id) => pick(data.tracks.find((t) => t.id === id)?.name, lang) || id;
  const ladder = [...data.labs.values()].filter((l) => l.ladder).sort((a, b) => a.ladder - b.ladder);
  const ladderHtml = ladder.length ? `<section class="pp-section" aria-labelledby="ladder"><h2 id="ladder">${esc(copy.ladder.h2[lang])}</h2><p>${esc(fill(copy.ladder.p[lang], f))}</p><ol class="pp-steps">${ladder.map((l) => `<li><a href="#lab-${esc(l.id)}">${esc(pick(l.title, lang))}</a></li>`).join("")}</ol></section>` : "";
  const shelves = data.categories.map((c) => [c, [...data.labs.values()].filter((l) => l.category === c.id)]).filter(([, list]) => list.length);
  const shelfHtml = shelves.map(([c, list]) => `<section class="pp-section pp-t-${esc(data.tracks.find((t) => t.id === c.track)?.tone ?? "slate")}" aria-labelledby="shelf-${esc(c.id)}">
<h2 id="shelf-${esc(c.id)}">${esc(pick(c.name, lang))} <span class="pp-meta">(${esc(trackName(c.track))})</span></h2>
<ul class="pp-labs">${list.map((l) => {
    const courses = use.get(l.id) ?? [];
    return `<li id="lab-${esc(l.id)}"><h3>${esc(pick(l.title, lang))}</h3><p class="pp-meta">${esc([levels[l.level], n("minutes", l.minutes, lang)].filter(Boolean).join(sep(lang)))}</p><p>${esc(pick(l.summary, lang))}</p>`
      + (courses.length ? `<p class="pp-used">${esc(copy.usedIn[lang])} ${courses.map((m) => `<a href="${pathOf(courseSlug(m.id), lang)}">${esc(pick(m.unit.title, lang))}</a>`).join(sep(lang))}</p>` : "")
      + `</li>`;
  }).join("")}</ul></section>`).join("\n");
  return { extra: `${ladderHtml}\n<section class="pp-section" aria-labelledby="all-labs"><h2 id="all-labs">${esc(fill(copy.all.h2[lang], f))}</h2><p>${esc(fill(copy.all.p[lang], f))}</p></section>\n${shelfHtml}`,
    ld: [{ "@type": "ItemList", name: fill(copy.all.h2[lang], f), numberOfItems: data.labs.size, itemListElement: [...data.labs.values()].map((l, i) => ({
      "@type": "ListItem", position: i + 1,
      // Name and address only: the page itself says the rest, and 100+ full entries would double its size.
      item: { "@type": "LearningResource", name: pick(l.title, lang), url: `${urlOf("features/labs", lang)}#lab-${l.id}`, learningResourceType: "Simulation", timeRequired: isoDuration(l.minutes) },
    })) }] };
}

/** The Standards page: every competency the published lessons build, by framework, with how many lessons and which courses. */
function standardsBody(copy, lang, data, models, f) {
  const lessonsOf = new Map(), coursesOf = new Map();
  for (const m of models) for (const l of m.lessons) for (const code of l.competencies) {
    lessonsOf.set(code, (lessonsOf.get(code) ?? 0) + 1);
    if (!(coursesOf.get(code) ?? []).includes(m)) coursesOf.set(code, [...(coursesOf.get(code) ?? []), m]);
  }
  const groups = FRAMEWORKS.map((fw) => [fw, [...data.competencies.values()].filter((c) => c.framework === fw && lessonsOf.has(c.code))]).filter(([, list]) => list.length);
  const html = groups.map(([fw, list]) => `<section class="pp-section" aria-labelledby="fw-${esc(fw.toLowerCase())}"><h2 id="fw-${esc(fw.toLowerCase())}">${esc(WORDS[lang].frameworks[fw])}</h2>
<p>${esc(fill(copy.frameworkNote[fw]?.[lang] ?? "", f))}</p>
<ul class="pp-labs">${list.map((c) => {
    const label = pick(c.label, lang), area = pick(c.area, lang), level = pick(c.level, lang);
    const meta = [area !== label ? area : "", level ? copy.level[lang](level) : "", n("built", lessonsOf.get(c.code), lang)].filter(Boolean).join(sep(lang));
    return `<li id="c-${esc(c.code.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}"><h3>${esc(label)}</h3><p class="pp-meta">${esc(meta)}</p><p class="pp-used">${esc(copy.inCourses[lang])} ${courseLinks(coursesOf.get(c.code), lang)}</p></li>`;
  }).join("")}</ul></section>`).join("\n");
  return { extra: html, ld: [] };
}

/** The Code page: the published courses with code exercises, and what kinds. */
function codeBody(copy, lang, data, models, f) {
  const list = counts(data, models).codeCourses;
  if (!list.length) return { extra: "", ld: [] };
  const items = list.map((m) => {
    const kinds = new Map();
    for (const l of m.lessons) for (const k of CODE_KINDS) if (l.kinds.has(k)) kinds.set(k, (kinds.get(k) ?? 0) + l.kinds.get(k));
    const what = [...kinds].map(([k, v]) => `${WORDS[lang].kinds[k]} (${num(v, lang)})`);
    return `<li class="pp-card pp-t-${esc(m.track.tone ?? "slate")}"><h3><a href="${pathOf(courseSlug(m.id), lang)}">${esc(pick(m.unit.title, lang))}</a></h3><p class="pp-meta">${esc(pick(m.track.name, lang))}</p><p>${esc(listOf(what, lang))}</p></li>`;
  });
  return { extra: `<section class="pp-section" aria-labelledby="code-courses"><h2 id="code-courses">${esc(fill(copy.courses.h2[lang], f))}</h2><p>${esc(fill(copy.courses.p[lang], f))}</p><ul class="pp-cards">${items.join("")}</ul></section>`, ld: [] };
}

const BODIES = { labs: labsBody, standards: standardsBody, code: codeBody };

/** One feature page. */
export function featurePage(key, lang, data, models) {
  const copy = FEATURES[key];
  const W = WORDS[lang];
  const f = facts(data, models, lang);
  const extra = BODIES[key] ? BODIES[key](copy, lang, data, models, f) : { extra: "", ld: [] };
  const faq = (copy.faq?.[lang] ?? []).map(([q, a]) => [fill(q, f), plain(fill(a, f))]);
  // A call to action opens the app (`href`) or another public page (`page`, a slug).
  const href = copy.cta?.page ? pathOf(copy.cta.page, lang) : copy.cta ? appOf(copy.cta.href, lang) : "";
  const cta = copy.cta ? `<p class="pp-cta"><a class="pp-btn" href="${esc(href)}">${esc(copy.cta[lang])}</a></p>` : "";
  const body = `<article>
<header class="pp-head">
<p class="pp-kicker">${esc(W.nav.features)}</p>
<h1>${esc(fill(copy.h1[lang], f))}</h1>
${(copy.lead[lang] ?? []).map((p, i) => `<p${i === 0 ? ' class="pp-lead"' : ""}>${rich(fill(p, f))}</p>`).join("\n")}
${cta}
</header>
${sections(copy.sections, lang, f, models)}
${extra.extra}
${sections(copy.after, lang, f, models)}
${faqBlock(W.faq.title, faq)}
</article>`;
  return {
    slug: `features/${key}`, lang, kind: "article", h1: fill(copy.h1[lang], f), wide: Boolean(copy.wide),
    title: `${fill(copy.title[lang], f)} | ${W.brand}`, description: cut(plain(fill(copy.description[lang], f)), 300),
    crumbs: [{ name: W.nav.features, slug: "features" }], body,
    ld: [...extra.ld, ...faqLd(faq)],
  };
}

/** The list of feature pages. */
export function featuresIndex(lang, data, models) {
  const W = WORDS[lang], I = FEATURES_INDEX;
  const f = facts(data, models, lang);
  const cards = FEATURE_KEYS.map((k) => {
    const c = FEATURES[k];
    return `<li class="pp-card"><h2><a href="${pathOf(`features/${k}`, lang)}">${esc(fill(c.h1[lang], f))}</a></h2><p>${esc(plain(fill(c.description[lang], f)))}</p></li>`;
  });
  const body = `<header class="pp-head">
<h1>${esc(I.h1[lang])}</h1>
${I.lead[lang].map((p, i) => `<p${i === 0 ? ' class="pp-lead"' : ""}>${rich(fill(p, f))}</p>`).join("\n")}
</header>
<ul class="pp-cards">${cards.join("")}</ul>`;
  return {
    slug: "features", lang, kind: "index", h1: I.h1[lang], wide: true,
    title: `${I.title[lang]} | ${W.brand}`, description: cut(plain(fill(I.description[lang], f)), 300), crumbs: [], body,
    ld: [{ "@type": "ItemList", name: I.h1[lang], numberOfItems: FEATURE_KEYS.length, itemListElement: FEATURE_KEYS.map((k, i) => ({ "@type": "ListItem", position: i + 1, url: urlOf(`features/${k}`, lang), name: fill(FEATURES[k].h1[lang], f) })) }],
  };
}

export const FEATURE_KEYS = Object.keys(FEATURES);
export { whoOf };
