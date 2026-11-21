/**
 * Course pages, written from the course files themselves (TECHNICAL.md "Public pages"): one page per published course,
 * one per track, and the list of all courses. Nothing here is typed by hand about a course: titles, lessons, video
 * chapters, key terms, labs, projects, kits and competencies come from the unit, and counts are counted.
 *
 * data: { units, tracks, stages, competencies, labs, catalog, trackCopy } (data.mjs says where each comes from).
 */
import { SITE_URL } from "./roots.mjs";
import { ORG_ID, appOf, faqBlock, faqLd, pathOf, urlOf } from "./render.mjs";
import { WORDS } from "./strings.mjs";
import { clock, count, cut, duration, esc, isoDuration, listOf, num, pick } from "./util.mjs";

const STAGES = ["primary", "lower", "upper", "university"];
const QUESTION_KINDS = ["choice", "multi", "truefalse", "order", "match", "fill", "scenario", "type", "hotspot", "image", "code", "parsons", "bug", "codefill", "blocks"];
const WHO_ORDER = ["teachers", "students", "university"];

/** Who a course is for: university teachers, students, or school teachers (the catalog's `teach` and `audience`). */
export const whoOf = (u) => (u.teach === "university" ? "university" : u.audience === "students" ? "students" : "teachers");
export const courseSlug = (id) => `courses/${id}`;
export const trackSlug = (id) => `courses/${id}`;

/** Everything a page says about a course, worked out once from the unit. */
export function courseModel(unit, data) {
  const who = whoOf(unit);
  const track = data.tracks.find((t) => t.id === unit.track) ?? { id: unit.track, name: { en: unit.track }, levels: 4, levelNames: [], tone: "slate" };
  const capstone = unit.kind === "capstone";
  const lessons = (unit.lessons ?? []).map((l) => {
    const steps = l.steps ?? [];
    const video = steps.find((s) => s.type === "video");
    const read = steps.find((s) => s.type === "read");
    const kinds = new Map();
    for (const s of steps) if (QUESTION_KINDS.includes(s.type)) kinds.set(s.type, (kinds.get(s.type) ?? 0) + 1);
    return {
      id: l.id, title: l.title, minutes: Number(l.minutes) || 0,
      check: /-check$/.test(l.id) || (!video && !read && kinds.size > 0),
      video: video ? { duration: Number(video.duration) || 0, chapters: (video.chapters ?? []).map((c) => c.label).filter(Boolean) } : null,
      reading: read ? { title: read.title, terms: (read.keyTerms ?? []).filter((k) => k?.term) } : null,
      kinds, questions: [...kinds.values()].reduce((a, b) => a + b, 0),
      labs: [...new Set(steps.filter((s) => s.type === "lab" && s.tool).map((s) => s.tool))],
      projects: steps.filter((s) => s.type === "project").map((p) => ({ prompt: p.prompt, task: p.task, deliverable: p.deliverable, hours: Number(p.hours) || 0 })),
      tryIt: l.tryTomorrow, materials: l.materials, kit: (l.kit ?? []).filter((k) => k.kind !== "video"), competencies: l.competencies ?? [],
    };
  });
  const sum = (f) => lessons.reduce((a, l) => a + f(l), 0);
  const labs = [...new Set(lessons.flatMap((l) => l.labs))];
  const hours = sum((l) => l.projects.reduce((a, p) => a + p.hours, 0));
  return {
    unit, id: unit.id, who, track, capstone, lessons, labs,
    level: unit.level, levelName: track.levelNames?.[unit.level - 1] ?? null,
    stage: who === "students" ? STAGES[unit.level - 1] ?? null : null,
    // A capstone's time is its milestones' hours; a course's is its lessons' minutes.
    minutes: capstone && hours ? hours * 60 : sum((l) => l.minutes),
    videos: sum((l) => (l.video ? 1 : 0)), projects: sum((l) => l.projects.length), questions: sum((l) => l.questions),
    competencies: [...new Set(lessons.flatMap((l) => l.competencies))],
    size: data.catalog?.get(unit.id)?.sizeByLang ?? null,
  };
}

/** Courses in reading order: by track (as the app orders tracks), then level, then teachers, students, university. */
export function orderCourses(models, tracks) {
  const rank = new Map(tracks.map((t, i) => [t.id, i]));
  return [...models].sort((a, b) => (rank.get(a.track.id) ?? 99) - (rank.get(b.track.id) ?? 99) || a.level - b.level
    || WHO_ORDER.indexOf(a.who) - WHO_ORDER.indexOf(b.who) || Number(a.capstone) - Number(b.capstone) || a.id.localeCompare(b.id));
}

/** "Upper secondary, ages 15–18" / «المرحلة الثانوية، الأعمار ١٥–١٨»: the app's own stage words. */
const stageText = (m, lang, data) => {
  if (!m.stage) return "";
  const s = data.stages[lang][m.stage];
  return lang === "ar" ? `${s.name}، ${s.ages}` : `${s.name}, ${s.ages.charAt(0).toLowerCase()}${s.ages.slice(1)}`;
};
const levelText = (m, lang) => pick(m.levelName, lang) || num(m.level, lang);
const timeText = (m, lang) => duration(m.minutes, lang, { hours: WORDS[lang].n.hours, minutes: WORDS[lang].n.minutes });
const n = (k, v, lang) => count(v, lang, { en: WORDS.en.n[k], ar: WORDS.ar.n[k] });

/** A course as a card in a list. */
export function courseCard(m, lang, { heading = "h3" } = {}) {
  const W = WORDS[lang];
  return `<li class="pp-card pp-t-${esc(m.track.tone ?? "slate")}"><${heading}><a href="${pathOf(courseSlug(m.id), lang)}">${esc(pick(m.unit.title, lang))}</a></${heading}>`
    + `<p class="pp-meta">${esc(W.card.meta(levelText(m, lang), m.capstone ? n("milestones", m.projects, lang) : n("lessons", m.lessons.length, lang), timeText(m, lang)))}</p>`
    + `<p>${esc(pick(m.unit.summary, lang))}</p></li>`;
}

function lessonBlock(l, i, m, lang, data, ctx) {
  const C = WORDS[lang].course, W = WORDS[lang];
  const rows = [];
  if (l.video) {
    rows.push(`<h4>${esc(C.video(clock(l.video.duration, lang)))}</h4>`);
    if (l.video.chapters.length) rows.push(`<ul class="pp-chapters" aria-label="${esc(C.chapters)}">${l.video.chapters.map((c) => `<li>${esc(pick(c, lang))}</li>`).join("")}</ul>`);
  }
  if (l.reading) {
    // A capstone's readings are its brief and setup steps, without key terms: the title alone says what it is.
    if (l.reading.terms.length) {
      rows.push(`<h4>${esc(C.keyTerms)}</h4>`);
      rows.push(`<dl class="pp-terms">${l.reading.terms.map((k) => `<div><dt>${esc(pick(k.term, lang))}</dt><dd>${esc(pick(k.def, lang))}</dd></div>`).join("")}</dl>`);
    }
  }
  if (l.questions) {
    const kinds = [...l.kinds.keys()].map((k) => W.kinds[k]).filter(Boolean);
    rows.push(`<p><strong>${esc(C.practice)}:</strong> ${esc(n("questions", l.questions, lang))} (${esc(listOf(kinds, lang))}).</p>`);
  }
  for (const id of l.labs) {
    const lab = data.labs.get(id);
    if (!lab) continue;
    const name = esc(pick(lab.title, lang));
    const link = ctx.has("features/labs") ? `<a href="${pathOf("features/labs", lang)}#lab-${esc(id)}">${name}</a>` : name;
    rows.push(`<p><strong>${esc(C.lab)}:</strong> ${link}. ${esc(pick(lab.summary, lang))}</p>`);
  }
  for (const p of l.projects) {
    rows.push(`<h4>${esc(pick(p.prompt, lang) || C.project)}${p.hours ? ` <span class="pp-meta">(${esc(C.hours(count(p.hours, lang, { en: W.n.hours, ar: W.n.hours })))})</span>` : ""}</h4>`);
    if (pick(p.task, lang)) rows.push(`<p>${esc(pick(p.task, lang))}</p>`);
    if (pick(p.deliverable, lang)) rows.push(`<p><strong>${esc(C.handIn)}:</strong> ${esc(pick(p.deliverable, lang))}</p>`);
  }
  if (!m.capstone && pick(l.tryIt, lang)) rows.push(`<p><strong>${esc(C.tryIt[m.who])}:</strong> ${esc(pick(l.tryIt, lang))}</p>`);
  if (l.kit.length) {
    const items = l.kit.map((k) => {
      const formats = (k.formats ?? []).map((f) => W.kit.formats[f] ?? f.toUpperCase());
      return `${pick(k.title, lang) || W.kit[k.kind] || k.kind} (${[k.pages ? n("pages", k.pages, lang) : "", ...formats].filter(Boolean).join(lang === "ar" ? "، " : ", ")})`;
    });
    rows.push(`<p><strong>${esc(C.kit)}:</strong> ${esc(items.join(lang === "ar" ? "؛ " : "; "))}.</p>`);
  }
  // A capstone's parts carry their own numbers ("1. Project description").
  const label = m.capstone ? "" : l.check ? C.unitCheck : C.lesson(num(i + 1, lang));
  const title = pick(l.title, lang);
  return `<li class="pp-lesson" id="${esc(l.id)}"><h3>${label ? `<span class="pp-lesson-n">${esc(label)}</span> ` : ""}${esc(title)}</h3>`
    + (l.minutes ? `<p class="pp-meta">${esc(n("minutes", l.minutes, lang))}</p>` : "") + rows.join("") + `</li>`;
}

/** The competencies a course builds, under the framework each belongs to. */
function standardsBlock(m, lang, data) {
  const C = WORDS[lang].course, W = WORDS[lang];
  const by = new Map();
  for (const code of m.competencies) {
    const c = data.competencies.get(code);
    if (!c) continue;
    by.set(c.framework, [...(by.get(c.framework) ?? []), c]);
  }
  if (!by.size) return { html: "", labels: [] };
  const labels = [];
  const groups = [...by].map(([fw, list]) => {
    const items = list.map((c) => {
      const where = [pick(c.area, lang) !== pick(c.label, lang) ? pick(c.area, lang) : "", c.level ? pick(c.level, lang) : ""].filter(Boolean).join(lang === "ar" ? "، " : ", ");
      labels.push(pick(c.label, lang));
      return `<li><strong>${esc(pick(c.label, lang))}</strong>${where && where !== pick(c.label, lang) ? ` <span class="pp-meta">(${esc(where)})</span>` : ""}</li>`;
    });
    return `<h3>${esc(W.frameworks[fw] ?? fw)}</h3><ul>${items.join("")}</ul>`;
  });
  return { html: `<section class="pp-section" aria-labelledby="standards"><h2 id="standards">${esc(C.standards)}</h2><p>${esc(C.standardsNote)}</p>${groups.join("")}</section>`, labels };
}

/** One course's page. `all` are every published course's model (for the links to its neighbours). */
export function coursePage(m, lang, data, all, ctx) {
  const W = WORDS[lang], C = W.course;
  const title = pick(m.unit.title, lang), summary = pick(m.unit.summary, lang), track = pick(m.track.name, lang);
  const who = W.who[m.who];
  const stage = stageText(m, lang, data);
  const time = timeText(m, lang);
  const lessonsN = n("lessons", m.lessons.length, lang);
  const lead = m.capstone
    ? C.capstoneLead({ title, track, who: who.noun, stage, milestones: n("milestones", m.projects, lang), time })
    : C.lead({ title, level: levelText(m, lang), track, who: who.noun, stage, lessons: lessonsN, time });
  const inside = [m.videos ? n("videos", m.videos, lang) : "", m.labs.length ? n("labs", m.labs.length, lang) : "", !m.capstone && m.projects ? n("projects", m.projects, lang) : "", m.questions ? n("questions", m.questions, lang) : ""].filter(Boolean);
  const first = m.lessons[0];
  const sizes = m.size ? Object.entries(m.size).filter(([l, mb]) => W.langs[l] && mb > 0).map(([l, mb]) => C.sizeOf(num(mb, lang), W.langs[l])) : [];

  const facts = [
    [C.track, `<a href="${pathOf(trackSlug(m.track.id), lang)}">${esc(track)}</a>`],
    [C.level, esc(levelText(m, lang))],
    [C.forWho, esc(stage ? `${who.label} (${stage})` : who.label)],
    [m.capstone ? C.milestones : C.lessons, esc(m.capstone ? num(m.projects, lang) : num(m.lessons.length, lang))],
    [C.time, esc(time)],
    [C.languages, esc(listOf([W.langs.en, W.langs.ar], lang))],
    ...(sizes.length ? [[C.size, esc(sizes.join(lang === "ar" ? "، " : ", "))]] : []),
    [C.price, esc(C.free)],
    [C.certificate, esc(m.capstone ? C.certificateCap : C.certificateYes)],
  ];

  const std = standardsBlock(m, lang, data);
  const labs = m.labs.map((id) => [id, data.labs.get(id)]).filter(([, lab]) => lab);
  const labsHtml = labs.length ? `<section class="pp-section" aria-labelledby="labs"><h2 id="labs">${esc(C.labsIn)}</h2><p>${esc(C.labsNote)}</p><ul class="pp-list">${labs.map(([id, lab]) => {
    const name = esc(pick(lab.title, lang));
    return `<li><strong>${ctx.has("features/labs") ? `<a href="${pathOf("features/labs", lang)}#lab-${esc(id)}">${name}</a>` : name}</strong>: ${esc(pick(lab.summary, lang))}</li>`;
  }).join("")}</ul></section>` : "";

  // Questions a visitor asks before starting, answered from this course's own facts.
  const materials = [...new Set(m.lessons.flatMap((l) => (Array.isArray(l.materials?.[lang]) ? l.materials[lang] : Array.isArray(l.materials?.en) ? l.materials.en : [])))].slice(0, 6);
  const sizeHere = m.size?.[lang] ? C.sizeOf(num(m.size[lang], lang), W.langs[lang]) : "";
  const faq = [
    W.faq.free,
    m.capstone ? W.faq.capstoneTime(n("milestones", m.projects, lang), time) : W.faq.time(lessonsN, time),
    ...(m.capstone ? [] : [W.faq.offline(sizeHere)]),
    m.capstone ? W.faq.deviceCapstone : W.faq.device,
    ...(materials.length && !m.capstone ? [W.faq.need(materials.join(" "))] : []),
    W.faq.langs,
  ];

  const sameTrack = all.filter((x) => x.track.id === m.track.id && x.id !== m.id);
  const more = sameTrack.length ? `<section class="pp-section" aria-labelledby="more"><h2 id="more">${esc(C.more(track))}</h2><ul class="pp-cards">${sameTrack.map((x) => courseCard(x, lang)).join("")}</ul><p><a class="pp-link" href="${pathOf(trackSlug(m.track.id), lang)}">${esc(C.allIn(track))}</a></p></section>` : "";

  const body = `<article class="pp-t-${esc(m.track.tone ?? "slate")}">
<header class="pp-head">
<p class="pp-kicker">${esc(m.capstone ? C.capstoneKicker(track) : C.kicker(track, who.short))}</p>
<h1>${esc(title)}</h1>
<p class="pp-lead">${esc(lead)}</p>
<p>${esc(summary)}</p>
<p>${inside.length ? `${esc(C.inside(listOf(inside, lang)))} ` : ""}${esc(m.capstone ? C.capstoneReach : C.reach)}</p>
${first ? `<p class="pp-cta"><a class="pp-btn" href="${esc(appOf(`/lesson/${encodeURIComponent(m.id)}/${encodeURIComponent(first.id)}`, lang))}">${esc(C.start)}</a></p><p class="pp-note">${esc(C.startNote)}</p>` : ""}
</header>
<section class="pp-section" aria-labelledby="facts"><h2 id="facts">${esc(C.facts)}</h2><dl class="pp-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl></section>
<section class="pp-section" aria-labelledby="syllabus"><h2 id="syllabus">${esc(m.capstone ? C.parts : C.syllabus)}</h2><ol class="pp-lessons">${m.lessons.map((l, i) => lessonBlock(l, i, m, lang, data, ctx)).join("")}</ol></section>
${labsHtml}
${std.html}
${faqBlock(C.faq, faq)}
${more}
</article>`;

  const url = urlOf(courseSlug(m.id), lang);
  const ld = [{
    "@type": "Course", "@id": `${url}#course`, url, name: title, description: cut(summary || lead, 300),
    provider: { "@id": ORG_ID }, inLanguage: ["en", "ar"], isAccessibleForFree: true,
    about: track, educationalLevel: levelText(m, "en"),
    audience: { "@type": "EducationalAudience", educationalRole: m.who === "students" ? "student" : "teacher" },
    timeRequired: isoDuration(m.minutes),
    ...(std.labels.length ? { teaches: std.labels } : {}),
    offers: { "@type": "Offer", category: "Free", price: 0, priceCurrency: "USD", url },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: isoDuration(m.minutes) },
    syllabusSections: m.lessons.map((l) => ({ "@type": "Syllabus", name: pick(l.title, lang), ...(l.minutes ? { timeRequired: isoDuration(l.minutes) } : {}) })),
  }, ...faqLd(faq)];

  return {
    slug: courseSlug(m.id), lang, kind: "course", h1: title,
    title: m.capstone ? C.capstoneTitle(title, track) : C.title(title, track),
    description: cut(`${summary} ${lead}`, 300),
    crumbs: [{ name: W.nav.courses, slug: "courses" }, { name: track, slug: trackSlug(m.track.id) }],
    body, ld,
  };
}

/** A track's page: what it covers, its courses by who they are for, and its labs. */
export function trackPage(track, lang, data, all, ctx) {
  const W = WORDS[lang], T = W.track;
  const name = pick(track.name, lang);
  const mine = all.filter((m) => m.track.id === track.id);
  const copy = data.trackCopy?.get(track.id);
  const lessons = mine.reduce((a, m) => a + m.lessons.length, 0);
  const groups = WHO_ORDER.map((who) => [who, mine.filter((m) => m.who === who)]).filter(([, list]) => list.length);
  const labs = [...data.labs.values()].filter((l) => l.track === track.id);
  const body = `<article class="pp-t-${esc(track.tone ?? "slate")}">
<header class="pp-head">
<h1>${esc(T.h1(name))}</h1>
<p class="pp-lead">${esc(mine.length ? T.lead({ track: name, courses: n("courses", mine.length, lang), lessons: n("lessons", lessons, lang) }) : T.none)}</p>
</header>
${copy?.points?.length ? `<section class="pp-section" aria-labelledby="covers"><h2 id="covers">${esc(T.covers)}</h2><ul class="pp-list">${copy.points.map((p) => `<li>${esc(pick(p, lang))}</li>`).join("")}</ul></section>` : ""}
${groups.map(([who, list]) => `<section class="pp-section" aria-labelledby="for-${who}"><h2 id="for-${who}">${esc(T.forWho[who])}</h2><ul class="pp-cards">${list.map((m) => courseCard(m, lang)).join("")}</ul></section>`).join("\n")}
${labs.length ? `<section class="pp-section" aria-labelledby="labs"><h2 id="labs">${esc(T.labs(name))}</h2><p>${esc(W.course.labsNote)}</p><ul class="pp-list">${labs.map((l) => `<li><strong>${ctx.has("features/labs") ? `<a href="${pathOf("features/labs", lang)}#lab-${esc(l.id)}">${esc(pick(l.title, lang))}</a>` : esc(pick(l.title, lang))}</strong>: ${esc(pick(l.summary, lang))}</li>`).join("")}</ul></section>` : ""}
<section class="pp-section" aria-labelledby="levels"><h2 id="levels">${esc(T.levels)}</h2><p>${esc(T.levelsNote)}</p></section>
</article>`;
  const url = urlOf(trackSlug(track.id), lang);
  return {
    slug: trackSlug(track.id), lang, kind: "track", h1: T.h1(name), wide: true,
    title: T.title(name), description: T.description(name, n("courses", mine.length, lang)),
    crumbs: [{ name: W.nav.courses, slug: "courses" }],
    body,
    ld: mine.length ? [{ "@type": "ItemList", name: T.h1(name), numberOfItems: mine.length, itemListElement: mine.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: urlOf(courseSlug(m.id), lang), name: pick(m.unit.title, lang) })) }] : [],
    url,
  };
}

/** The list of every course, by track. */
export function coursesIndex(lang, data, all) {
  const W = WORDS[lang], I = W.index;
  const tracks = data.tracks.filter((t) => all.some((m) => m.track.id === t.id));
  const lessons = all.reduce((a, m) => a + m.lessons.length, 0);
  const sections = tracks.map((t) => {
    const mine = all.filter((m) => m.track.id === t.id);
    const name = pick(t.name, lang);
    return `<section class="pp-section pp-t-${esc(t.tone ?? "slate")}" aria-labelledby="t-${esc(t.id)}"><h2 id="t-${esc(t.id)}"><a href="${pathOf(trackSlug(t.id), lang)}">${esc(name)}</a></h2><ul class="pp-cards">${mine.map((m) => courseCard(m, lang)).join("")}</ul></section>`;
  });
  const body = `<header class="pp-head">
<h1>${esc(I.h1)}</h1>
<p class="pp-lead">${esc(I.lead({ courses: n("courses", all.length, lang), tracks: n("tracks", tracks.length, lang), lessons: n("lessons", lessons, lang) }))}</p>
<p>${esc(I.how)}</p>
<nav class="pp-chips" aria-label="${esc(I.byTrack)}">${tracks.map((t) => `<a class="pp-chip pp-t-${esc(t.tone ?? "slate")}" href="#t-${esc(t.id)}">${esc(pick(t.name, lang))}</a>`).join("")}</nav>
</header>
${sections.join("\n")}`;
  return {
    slug: "courses", lang, kind: "index", h1: I.h1, wide: true,
    title: I.title, description: I.description(n("courses", all.length, lang), n("tracks", tracks.length, lang)),
    crumbs: [], body,
    ld: [{ "@type": "ItemList", name: I.h1, numberOfItems: all.length, itemListElement: all.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: urlOf(courseSlug(m.id), lang), name: pick(m.unit.title, lang) })) }],
  };
}

export { SITE_URL };
