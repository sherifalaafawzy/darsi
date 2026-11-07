/**
 * The starting courses' files as uploaded files: the classroom kits (content/kits, built by apps/web/scripts/build-kits.mjs)
 * and the lesson media (content/media: narrated videos, captions and light lessons, from scripts/import-packs.mjs and
 * scripts/import-media.mjs, and the figures in lesson text, such as the capstones' screenshots in capstone-shared/).
 * Where each one goes in Storage, and the unit pointing there. Shared by scripts/seed-content.mjs and the e2e suite's
 * stand-in for Storage, so both lay the files out the same way.
 */
export const KIT_LANGS = ["en", "ar"];
const pathOf = (unitId, base, lang, fmt) => `content/media/${unitId}/${base.replace(/\//g, "_")}-${lang}.${fmt}`;
const all = () => true;

/**
 * Every kit file a unit's lessons name: the local file under content/kits and its Storage path. `has(file)` says whether
 * a language's file exists: some kits (the course packs' own plans and worksheets) are in English only, and the app
 * falls back to English. English is always listed, so a missing one is reported.
 */
export function kitFiles(unit, has = all) {
  const out = [];
  for (const l of unit.lessons) for (const k of l.kit) {
    if (!k.base) continue;
    for (const lang of KIT_LANGS) for (const fmt of k.formats) {
      const file = `${k.base}-${lang}.${fmt}`;
      if (fmt !== "mp4" && (lang === "en" || has(file))) out.push({ file, path: pathOf(unit.id, k.base, lang, fmt), fmt });
    }
  }
  return out;
}

const isMedia = (v) => typeof v === "string" && v.startsWith("/media/");
const kitMedia = (k, lang, fmt) => `${k.path.replace("{lang}", lang)}.${fmt}`;

/**
 * Illustrations in a lesson's text: a paragraph that is only ![caption](/media/…) (the capstones' setup screenshots, in
 * content/media/capstone-shared). Arabic text may hold isolates inside the path (/⁦media/…⁩), so they are read past.
 * The app shows the same paragraphs as figures (apps/web/src/content/figure.ts).
 */
const MARKS = /[⁦-⁩‪-‮]/g;
const FIGURE = /^!\[([^\]]*)\]\((\/media\/[^)\s]+)\)$/;
const figureOf = (para) => { const m = para.trim().replace(MARKS, "").match(FIGURE); return m ? { alt: m[1], path: m[2] } : null; };
/** The texts of a lesson that may hold figures, every language: read steps' bodies and capstone milestones' setup tabs. */
const figureTexts = (l) => l.steps.flatMap((s) => (s.type === "read" ? [s.body] : s.type === "project" ? (s.setup ?? []).map((x) => x.body) : []))
  .flatMap((t) => Object.values(t ?? {}).filter((v) => typeof v === "string"));

/** Every /media/ image a unit's text shows as a figure, as written in the unit. */
export function figurePaths(unit) {
  const out = new Set();
  for (const l of unit.lessons) for (const text of figureTexts(l)) for (const para of text.split(/\n\s*\n/)) { const f = figureOf(para); if (f) out.add(f.path); }
  return [...out];
}

/** Every /media/ file a unit names (video sources, captions, light lessons, video kits and figures), as written in the unit. */
export function mediaPaths(unit) {
  const out = new Set();
  for (const l of unit.lessons) {
    for (const s of l.steps) if (s.type === "video") {
      for (const m of [s.sources, s.captions, s.light?.files]) for (const v of Object.values(m ?? {})) if (isMedia(v)) out.add(v);
    }
    for (const k of l.kit) if (isMedia(k.path)) for (const lang of KIT_LANGS) for (const fmt of k.formats) out.add(kitMedia(k, lang, fmt));
  }
  for (const p of figurePaths(unit)) out.add(p);
  return [...out];
}

/** Where an uploaded media file goes: under the unit's media, in a folder named by its content, so it can be cached for good. */
export const mediaPathOf = (unitId, local, hash) => `content/media/${unitId}/${hash}/${local.slice("/media/".length)}`;

/**
 * The unit as it is published: kits and media point at the uploaded files instead of app paths.
 * - `urlOf(path)` is a Storage path's download URL; `has(file)` as for kitFiles.
 * - `media` maps each uploaded /media/ path to its URL. Media that wasn't uploaded (files still to be made, such as ai-1's
 *   narrated videos) keeps its app path, and video kits without any uploaded file are left out.
 * - Figures in read and setup text become ![caption](url) with the uploaded URL, the paragraph without isolates.
 * - `sizeOf(file)`, when given, is a kit file's size in bytes: kits then carry `sizeKB` (language → format → KB), which
 *   the catalog adds to each language's download size.
 */
export function withKitUrls(unit, urlOf, { has = all, media = new Map(), sizeOf } = {}) {
  const swap = (m) => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, media.get(v) ?? v]));
  // Paragraphs split as the app splits them (lesson/readingText.tsx), separators kept.
  const figures = (text) => text.split(/(\n\s*\n)/).map((para) => { const f = figureOf(para); const url = f && media.get(f.path); return url ? `![${f.alt}](${url})` : para; }).join("");
  const swapText = (t) => t && Object.fromEntries(Object.entries(t).map(([lang, v]) => [lang, typeof v === "string" ? figures(v) : v]));
  return {
    ...unit,
    lessons: unit.lessons.map((l) => ({
      ...l,
      steps: l.steps.map((s) => {
        if (s.type === "read") return { ...s, body: swapText(s.body) };
        if (s.type === "project" && s.setup) return { ...s, setup: s.setup.map((x) => ({ ...x, body: swapText(x.body) })) };
        if (s.type !== "video") return s;
        return {
          ...s,
          ...(s.sources && { sources: swap(s.sources) }),
          ...(s.captions && { captions: swap(s.captions) }),
          ...(s.light && { light: { ...s.light, files: swap(s.light.files) } }),
        };
      }),
      kit: l.kit.flatMap((k) => {
        if (isMedia(k.path)) {
          const { path, ...rest } = k;
          const urls = {};
          for (const lang of KIT_LANGS) for (const fmt of k.formats) {
            const url = media.get(kitMedia(k, lang, fmt));
            if (url) (urls[lang] ??= {})[fmt] = url;
          }
          return Object.keys(urls).length ? [{ ...rest, urls }] : [];
        }
        if (!k.base) return [k];
        const { base, ...rest } = k;
        const urls = {};
        const sizeKB = {};
        for (const lang of KIT_LANGS) for (const fmt of k.formats) {
          const file = `${base}-${lang}.${fmt}`;
          if (fmt === "mp4" || (lang !== "en" && !has(file))) continue;
          (urls[lang] ??= {})[fmt] = urlOf(pathOf(unit.id, base, lang, fmt));
          if (sizeOf) (sizeKB[lang] ??= {})[fmt] = Math.round(sizeOf(file) / 1024);
        }
        return [{ ...rest, urls, ...(sizeOf ? { sizeKB } : {}) }];
      }),
    })),
  };
}

export const contentTypeOf = (fmt) => ({
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  vtt: "text/vtt; charset=utf-8",
  json: "application/json; charset=utf-8",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
})[String(fmt).toLowerCase()] ?? "application/octet-stream";
